"""
Decision Audit API — governance and explainability endpoints.

All decisions made by the ML decision agent are written to logs/decisions.jsonl.
These endpoints expose that log for compliance review, incident investigation,
and monitoring. Access is restricted to superusers.
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import CurrentUser

router = APIRouter(prefix="/decisions", tags=["decisions"])

_LOG_PATH = Path("logs/decisions.jsonl")


class AuditEntry(BaseModel):
    ts: str
    decision_id: str
    document_id: str
    org_id: str
    triggered_by: str
    role: str
    decision: str
    auto_approve: bool
    confidence: float
    risk_score: int
    risk_level: str
    method: str
    model: str | None
    attempts: int
    latency_ms: int
    fallback_reason: str | None
    reasoning: str
    risk_factors: list[dict]
    recommended_action: str


class AuditLogResponse(BaseModel):
    entries: list[dict]
    total: int
    filtered: int


def _require_superuser(current_user: CurrentUser) -> None:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Access denied — decision audit log is restricted to superusers",
        )


def _read_log(
    document_id: str | None = None,
    org_id: str | None = None,
    decision: str | None = None,
    method: str | None = None,
) -> list[dict]:
    if not _LOG_PATH.exists():
        return []

    entries: list[dict] = []
    with _LOG_PATH.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if document_id and entry.get("document_id") != document_id:
                continue
            if org_id and entry.get("org_id") != org_id:
                continue
            if decision and entry.get("decision") != decision:
                continue
            if method and entry.get("method") != method:
                continue

            entries.append(entry)

    return entries


@router.get("/audit-log", response_model=AuditLogResponse)
async def list_decision_audit_log(
    current_user: CurrentUser,
    document_id: str | None = Query(
        default=None, description="Filter by document UUID"
    ),
    org_id: str | None = Query(default=None, description="Filter by organization ID"),
    decision: str | None = Query(
        default=None,
        description="Filter by decision: approved|exception|escalated|rejected",
    ),
    method: str | None = Query(
        default=None, description="Filter by method: ai_agent|deterministic_fallback"
    ),
    limit: int = Query(
        default=50, ge=1, le=500, description="Max entries to return (newest first)"
    ),
    offset: int = Query(default=0, ge=0, description="Skip this many entries"),
):
    """
    List recent decision audit entries.

    Returns decisions most-recent-first. Use filters to narrow down by document,
    org, outcome, or whether the AI or fallback logic made the call.

    Restricted to superusers.
    """
    _require_superuser(current_user)

    all_entries = _read_log(document_id, org_id, decision, method)
    all_entries.reverse()  # newest first

    total = len(all_entries)
    page = all_entries[offset : offset + limit]

    return AuditLogResponse(entries=page, total=total, filtered=len(page))


@router.get("/audit-log/{document_id}", response_model=AuditLogResponse)
async def get_document_decisions(
    document_id: str,
    current_user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Get all decisions ever made for a specific document.

    Useful for investigating why a document was auto-approved or escalated.
    Shows every attempt including retries and fallbacks.

    Restricted to superusers.
    """
    _require_superuser(current_user)

    entries = _read_log(document_id=document_id)
    entries.reverse()

    return AuditLogResponse(
        entries=entries[:limit], total=len(entries), filtered=min(len(entries), limit)
    )


@router.get("/audit-log/stats/summary")
async def decision_stats_summary(current_user: CurrentUser):
    """
    Aggregate statistics over all logged decisions.

    Returns counts by decision type, method, and risk level — useful for
    dashboards and compliance monitoring.

    Restricted to superusers.
    """
    _require_superuser(current_user)

    entries = _read_log()

    if not entries:
        return {
            "total": 0,
            "by_decision": {},
            "by_method": {},
            "by_risk_level": {},
            "auto_approve_rate": 0.0,
            "fallback_rate": 0.0,
            "avg_confidence": 0.0,
            "avg_risk_score": 0.0,
            "avg_latency_ms": 0.0,
        }

    by_decision: dict[str, int] = {}
    by_method: dict[str, int] = {}
    by_risk: dict[str, int] = {}
    auto_approved = 0
    total_confidence = 0.0
    total_risk = 0
    total_latency = 0

    for e in entries:
        d = e.get("decision", "unknown")
        by_decision[d] = by_decision.get(d, 0) + 1

        m = e.get("method", "unknown")
        by_method[m] = by_method.get(m, 0) + 1

        r = e.get("risk_level", "unknown")
        by_risk[r] = by_risk.get(r, 0) + 1

        if e.get("auto_approve"):
            auto_approved += 1

        total_confidence += float(e.get("confidence", 0))
        total_risk += int(e.get("risk_score", 0))
        total_latency += int(e.get("latency_ms", 0))

    n = len(entries)
    return {
        "total": n,
        "by_decision": by_decision,
        "by_method": by_method,
        "by_risk_level": by_risk,
        "auto_approve_rate": round(auto_approved / n, 4),
        "fallback_rate": round(by_method.get("deterministic_fallback", 0) / n, 4),
        "avg_confidence": round(total_confidence / n, 4),
        "avg_risk_score": round(total_risk / n, 2),
        "avg_latency_ms": round(total_latency / n, 1),
    }
