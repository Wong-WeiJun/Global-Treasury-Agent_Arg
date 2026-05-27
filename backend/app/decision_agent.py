import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import settings


_LOG_DIR = Path("logs")
_LOG_DIR.mkdir(exist_ok=True)

_audit_handler = logging.FileHandler(_LOG_DIR / "decisions.jsonl", encoding="utf-8")
_audit_handler.setFormatter(logging.Formatter("%(message)s"))

audit_logger = logging.getLogger("decision_audit")
audit_logger.setLevel(logging.INFO)
if not audit_logger.handlers:
    audit_logger.addHandler(_audit_handler)
audit_logger.propagate = False

logger = logging.getLogger(__name__)


MAX_RETRIES = 3
RETRY_DELAYS_S = [1.0, 2.0, 4.0]  # exponential backoff between attempts
CONFIDENCE_PENALTY_PER_RETRY = 0.10  # ceiling drops 10% each retry
FALLBACK_CONFIDENCE_CAP = 0.65  # max confidence for deterministic path

AUTO_APPROVE_MIN_CONFIDENCE = 0.80  # both thresholds must be met
AUTO_APPROVE_MAX_RISK = 40  # risk score must be strictly below this


@dataclass
class MatchScores:
    amount_match: float = 0.0  # 1.0 = exact, 0.0 = total mismatch
    date_diff_days: int = 999
    payer_similarity: float = 0.0  # fuzzy name similarity 0.0–1.0
    overall_score: float = 0.0  # composite score 0.0–1.0


@dataclass
class DecisionContext:
    document_id: str
    org_id: int | str
    triggered_by: str  # user UUID
    role: str  # membership role, e.g. "APPROVER", "ADMIN", "superuser"
    extracted_data: dict  # {amount, currency, date, payer, payee, description, …}
    matched_bank_entry: dict | None
    match_scores: MatchScores
    base_currency: str = "MYR"
    vendor_history: list[dict] = field(default_factory=list)
    learned_patterns: list[dict] = field(default_factory=list)
    # "matched" | "matched_with_adjustment" | "fuzzy" | "unmatched"
    reconciliation_status: str = "unmatched"
    adjustment_type: str | None = None


@dataclass
class RiskFactor:
    name: str
    score: int  # points contributed to the total risk (0–100)
    explanation: str


@dataclass
class DecisionResult:
    auto_approve: bool
    decision: str  # "approved" | "exception" | "escalated" | "rejected"
    confidence: float  # 0.0–1.0  (capped by confidence_ceiling)
    risk_score: int  # 0–100
    risk_level: str  # "LOW" | "MEDIUM" | "HIGH"

    reasoning: str
    risk_factors: list[RiskFactor]
    recommended_action: str

    decision_id: str
    timestamp: str
    document_id: str
    org_id: str
    triggered_by: str
    role: str

    method: str  # "ai_agent" | "deterministic_fallback"
    model_used: str | None
    attempt_count: int
    latency_ms: int
    fallback_reason: str | None


_DECISION_PROMPT = """\
You are a financial compliance decision agent. Analyze the reconciliation \
context and produce a structured JSON risk assessment and approval decision.

AUTO-APPROVE RULES (BOTH must be true):
  • confidence  > 0.80
  • risk_score  < 40

RISK SCORING GUIDE (max 100 points):
  Amount deviation  >20 % → +40   >10 % → +25   >5 % → +15   >2 % → +8   ≤2 % → 0
  Date difference   >30 d → +30   >7 d  → +20   >2 d → +10   ≤2 d → 0
  Payer similarity  <0.50 → +20   <0.75 → +10   ≥0.75 → 0
  No vendor history           → +10
  Pattern deviation (amount deviates from learned pattern) → +10

DECISION VALUES:
  "approved"  — auto_approve=true  and status=matched
  "exception" — auto_approve=true  and status=matched_with_adjustment
  "escalated" — confidence or risk do not meet auto-approve threshold
  "rejected"  — clear mismatch (wrong vendor, amount far off, etc.)

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "auto_approve": <boolean>,
  "decision": <"approved"|"exception"|"escalated"|"rejected">,
  "confidence": <float 0.0–1.0>,
  "risk_score": <integer 0–100>,
  "risk_level": <"LOW"|"MEDIUM"|"HIGH">,
  "reasoning": <string ≤ 200 chars — plain English explanation>,
  "risk_factors": [
    {"name": <string>, "score": <integer>, "explanation": <string ≤ 80 chars>}
  ],
  "recommended_action": <string — clear next step for a human reviewer>
}
"""


async def make_decision(ctx: DecisionContext) -> DecisionResult:
    """
    Make an auto-approval + risk assessment decision for a reconciliation.

    Tries Chutes AI up to MAX_RETRIES times. On each retry the confidence
    ceiling is reduced by CONFIDENCE_PENALTY_PER_RETRY so an LLM that only
    succeeds on the third attempt cannot return a near-perfect confidence.
    If all AI attempts fail, falls back to deterministic rules (conservative).

    Every decision — whether AI or fallback — is written to logs/decisions.jsonl
    and emitted as a structured INFO log line for container log aggregation.
    """
    t0 = int(time.monotonic() * 1000)
    decision_id = str(uuid.uuid4())
    last_error: str | None = None

    for attempt in range(MAX_RETRIES):
        ceiling = 1.0 - CONFIDENCE_PENALTY_PER_RETRY * attempt
        try:
            result = await _call_ai(ctx, attempt, ceiling)
            _fill_governance(
                result,
                decision_id,
                ctx,
                attempt + 1,
                int(time.monotonic() * 1000) - t0,
                None,
            )
            _emit_audit(result)
            return result

        except _RetryableError as exc:
            last_error = str(exc)
            logger.warning(
                "[DECISION_AGENT] attempt %d/%d failed doc=%s: %s%s",
                attempt + 1,
                MAX_RETRIES,
                ctx.document_id,
                exc,
                " — retrying" if attempt < MAX_RETRIES - 1 else " — retries exhausted",
            )
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAYS_S[attempt])

        except _NonRetryableError as exc:
            last_error = str(exc)
            logger.error(
                "[DECISION_AGENT] non-retryable error doc=%s: %s", ctx.document_id, exc
            )
            break

    logger.warning(
        "[DECISION_AGENT] deterministic fallback doc=%s reason=%s",
        ctx.document_id,
        last_error,
    )
    result = _deterministic_fallback(ctx)
    _fill_governance(
        result,
        decision_id,
        ctx,
        MAX_RETRIES,
        int(time.monotonic() * 1000) - t0,
        last_error,
    )
    _emit_audit(result)
    return result


class _RetryableError(Exception):
    """Transient failure — worth retrying (rate limit, timeout, bad JSON)."""


class _NonRetryableError(Exception):
    """Permanent failure — do not retry (auth error, unsupported endpoint)."""


async def _call_ai(
    ctx: DecisionContext,
    attempt: int,
    confidence_ceiling: float,
) -> DecisionResult:
    payload = _build_payload(ctx)
    content = (
        f"{_DECISION_PROMPT}\n\n"
        f"RECONCILIATION CONTEXT:\n"
        f"{json.dumps(payload, indent=2, default=str)}"
    )
    timeout = 20.0 + attempt * 10.0  # 20 s → 30 s → 40 s

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{settings.CHUTES_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.CHUTES_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.CHUTES_MODEL,
                    "messages": [{"role": "user", "content": content}],
                    "max_tokens": 600,
                    "temperature": 0.05,
                    "response_format": {"type": "json_object"},
                },
            )
    except httpx.TimeoutException as exc:
        raise _RetryableError(f"timeout: {exc}") from exc
    except httpx.RequestError as exc:
        raise _RetryableError(f"network error: {exc}") from exc

    if resp.status_code == 429:
        raise _RetryableError("rate limited (429)")
    if resp.status_code >= 500:
        raise _RetryableError(f"server error {resp.status_code}")
    if resp.status_code == 401:
        raise _NonRetryableError("authentication failed (401)")
    if resp.status_code >= 400:
        raise _NonRetryableError(f"client error {resp.status_code}: {resp.text[:200]}")

    try:
        raw = resp.json()
        text = raw["choices"][0]["message"]["content"].strip()
        # Strip markdown fences that some models emit despite json_object mode
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        parsed = json.loads(text)
    except (json.JSONDecodeError, KeyError, IndexError) as exc:
        raise _RetryableError(f"unparseable response: {exc}") from exc

    return _parse_response(parsed, ctx, confidence_ceiling)


def _parse_response(
    parsed: dict,
    ctx: DecisionContext,
    confidence_ceiling: float,
) -> DecisionResult:
    confidence = min(float(parsed.get("confidence", 0.5)), confidence_ceiling)
    risk_score = max(0, min(int(parsed.get("risk_score", 50)), 100))
    risk_level = _level(risk_score)

    # Re-enforce hard thresholds — do not blindly trust the LLM's boolean
    auto_approve = (
        confidence >= AUTO_APPROVE_MIN_CONFIDENCE
        and risk_score < AUTO_APPROVE_MAX_RISK
        and ctx.reconciliation_status in ("matched", "matched_with_adjustment")
    )

    # Correct decision label if confidence degradation overrode the LLM
    decision = parsed.get("decision", "escalated")
    if auto_approve and ctx.reconciliation_status == "matched_with_adjustment":
        decision = "exception"
    elif auto_approve:
        decision = "approved"
    elif decision in ("approved", "exception"):
        # Confidence or risk didn't pass — escalate instead
        decision = "escalated"

    factors = [
        RiskFactor(
            name=str(f.get("name", "unknown")),
            score=int(f.get("score", 0)),
            explanation=str(f.get("explanation", ""))[:120],
        )
        for f in parsed.get("risk_factors", [])
        if isinstance(f, dict)
    ]

    return DecisionResult(
        auto_approve=auto_approve,
        decision=decision,
        confidence=round(confidence, 4),
        risk_score=risk_score,
        risk_level=risk_level,
        reasoning=str(parsed.get("reasoning", ""))[:500],
        risk_factors=factors,
        recommended_action=str(
            parsed.get("recommended_action", "Requires human review")
        )[:300],
        # Governance filled by caller
        decision_id="",
        timestamp="",
        document_id="",
        org_id="",
        triggered_by="",
        role="",
        method="ai_agent",
        model_used=settings.CHUTES_MODEL,
        attempt_count=0,
        latency_ms=0,
        fallback_reason=None,
    )


def _deterministic_fallback(ctx: DecisionContext) -> DecisionResult:
    """
    Enhanced rule-based fallback used when the AI agent is unavailable.

    Deliberately conservative: only auto-approves when risk < 15 AND
    overall_score ≥ 0.95 (essentially a perfect match). All other cases
    are escalated to a human reviewer.
    """
    s = ctx.match_scores
    factors: list[RiskFactor] = []
    total = 0

    # Amount deviation
    dev = 1.0 - s.amount_match
    if dev > 0.20:
        pts, lbl = 40, f"{dev:.1%} deviation — HIGH"
    elif dev > 0.10:
        pts, lbl = 25, f"{dev:.1%} deviation — MODERATE"
    elif dev > 0.05:
        pts, lbl = 15, f"{dev:.1%} deviation — LOW"
    elif dev > 0.02:
        pts, lbl = 8, f"{dev:.1%} deviation — MINOR"
    else:
        pts, lbl = 0, f"exact ({dev:.1%})"
    factors.append(RiskFactor("amount_deviation", pts, lbl))
    total += pts

    # Date difference
    d = s.date_diff_days
    if d > 30:
        pts, lbl = 30, f"{d}d apart — SUSPICIOUS"
    elif d > 7:
        pts, lbl = 20, f"{d}d apart — ELEVATED"
    elif d > 2:
        pts, lbl = 10, f"{d}d apart — MINOR"
    else:
        pts, lbl = 0, f"{d}d — within tolerance"
    factors.append(RiskFactor("date_difference", pts, lbl))
    total += pts

    # Payer identity
    sim = s.payer_similarity
    if sim < 0.5:
        pts, lbl = 20, f"{sim:.2f} similarity — MISMATCH"
    elif sim < 0.75:
        pts, lbl = 10, f"{sim:.2f} similarity — PARTIAL"
    else:
        pts, lbl = 0, f"{sim:.2f} similarity — GOOD"
    factors.append(RiskFactor("payer_identity", pts, lbl))
    total += pts

    # Vendor history
    if not ctx.vendor_history:
        factors.append(RiskFactor("vendor_history", 10, "No prior vendor transactions"))
        total += 10

    risk_score = min(total, 100)
    risk_level = _level(risk_score)
    confidence = round(min(s.overall_score, 1.0) * FALLBACK_CONFIDENCE_CAP, 4)

    # Very conservative auto-approve gate
    auto_approve = (
        risk_score < 15
        and s.overall_score >= 0.95
        and ctx.reconciliation_status in ("matched", "matched_with_adjustment")
    )
    if auto_approve:
        confidence = AUTO_APPROVE_MIN_CONFIDENCE  # just meets the threshold

    decision = "escalated"
    if auto_approve and ctx.reconciliation_status == "matched_with_adjustment":
        decision = "exception"
    elif auto_approve:
        decision = "approved"

    reasoning = (
        f"Deterministic fallback (AI unavailable). "
        f"score={s.overall_score:.2f} risk={risk_score}/100 "
        f"amount_dev={dev:.1%} date_diff={s.date_diff_days}d"
    )
    action = (
        "Auto-approved by deterministic rules (very clean match)"
        if auto_approve
        else "Human review required — AI decision agent unavailable"
    )

    return DecisionResult(
        auto_approve=auto_approve,
        decision=decision,
        confidence=confidence,
        risk_score=risk_score,
        risk_level=risk_level,
        reasoning=reasoning,
        risk_factors=factors,
        recommended_action=action,
        decision_id="",
        timestamp="",
        document_id="",
        org_id="",
        triggered_by="",
        role="",
        method="deterministic_fallback",
        model_used=None,
        attempt_count=MAX_RETRIES,
        latency_ms=0,
        fallback_reason="ai_agent_unavailable",
    )


def _level(score: int) -> str:
    if score < 40:
        return "LOW"
    if score < 70:
        return "MEDIUM"
    return "HIGH"


def _build_payload(ctx: DecisionContext) -> dict:
    return {
        "document": ctx.extracted_data,
        "matched_bank_entry": ctx.matched_bank_entry,
        "match_scores": {
            "amount_match": ctx.match_scores.amount_match,
            "date_diff_days": ctx.match_scores.date_diff_days,
            "payer_similarity": ctx.match_scores.payer_similarity,
            "overall_score": ctx.match_scores.overall_score,
        },
        "reconciliation_status": ctx.reconciliation_status,
        "adjustment_type": ctx.adjustment_type,
        "base_currency": ctx.base_currency,
        "vendor_history_count": len(ctx.vendor_history),
        "vendor_history_sample": ctx.vendor_history[:3],
        "learned_patterns": ctx.learned_patterns[:3],
    }


def _fill_governance(
    result: DecisionResult,
    decision_id: str,
    ctx: DecisionContext,
    attempts: int,
    latency_ms: int,
    fallback_reason: str | None,
) -> None:
    result.decision_id = decision_id
    result.timestamp = datetime.now(timezone.utc).isoformat()
    result.document_id = ctx.document_id
    result.org_id = str(ctx.org_id)
    result.triggered_by = ctx.triggered_by
    result.role = ctx.role
    result.attempt_count = attempts
    result.latency_ms = latency_ms
    if fallback_reason is not None:
        result.fallback_reason = fallback_reason


def _emit_audit(result: DecisionResult) -> None:
    entry = {
        "ts": result.timestamp,
        "decision_id": result.decision_id,
        "document_id": result.document_id,
        "org_id": result.org_id,
        "triggered_by": result.triggered_by,
        "role": result.role,
        "decision": result.decision,
        "auto_approve": result.auto_approve,
        "confidence": result.confidence,
        "risk_score": result.risk_score,
        "risk_level": result.risk_level,
        "method": result.method,
        "model": result.model_used,
        "attempts": result.attempt_count,
        "latency_ms": result.latency_ms,
        "fallback_reason": result.fallback_reason,
        "reasoning": result.reasoning,
        "risk_factors": [
            {"name": f.name, "score": f.score, "explanation": f.explanation}
            for f in result.risk_factors
        ],
        "recommended_action": result.recommended_action,
    }
    audit_logger.info(json.dumps(entry, ensure_ascii=False))
    logger.info(
        "[DECISION] doc=%s decision=%s auto_approve=%s confidence=%.2f "
        "risk=%d(%s) method=%s attempts=%d latency=%dms",
        result.document_id,
        result.decision,
        result.auto_approve,
        result.confidence,
        result.risk_score,
        result.risk_level,
        result.method,
        result.attempt_count,
        result.latency_ms,
    )
