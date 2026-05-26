import json
from datetime import datetime
from difflib import SequenceMatcher

import httpx

from app.core.config import settings

MORPHEUS_BASE_URL = "https://api.mor.org/api/v1"
MORPHEUS_MODEL = "minimax-m2.5"


async def _call_morpheus(messages: list[dict], tools: list[dict] | None = None) -> str:
    api_key = (
        settings.morpheus_api_key.get_secret_value()
        if settings.morpheus_api_key
        else ""
    )

    payload: dict = {
        "model": MORPHEUS_MODEL,
        "messages": messages,
        "max_tokens": 2048,
        "temperature": 0.1,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{MORPHEUS_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()

    data = response.json()
    return data["choices"][0]["message"]["content"]


def _parse_date(date_str: str | None) -> datetime | None:
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def _amount_match(
    a: float | None, b: float | None, tolerance_pct: float = 15.0
) -> tuple[bool, float]:
    # Returns (is_match, difference_pct).
    if a is None or b is None:
        return False, 100.0
    if b == 0:
        return a == 0, 0.0
    diff_pct = abs(a - b) / abs(b) * 100
    return diff_pct <= tolerance_pct, round(diff_pct, 2)


def _date_match(
    d1: str | None, d2: str | None, tolerance_days: int = 14
) -> tuple[bool, int]:
    # Returns (is_match, days_apart)
    date1 = _parse_date(d1)
    date2 = _parse_date(d2)
    if date1 is None or date2 is None:
        return False, 999
    diff = abs((date1 - date2).days)
    return diff <= tolerance_days, diff


def _payer_match(p1: str | None, p2: str | None) -> tuple[bool, float]:
    # Returns (is_match, similarity_score 0-1).
    # Missing payer in either side → neutral pass (0.5) so it doesn't kill the score.
    if not p1 or not p2:
        return True, 0.5
    score = SequenceMatcher(None, p1.lower().strip(), p2.lower().strip()).ratio()
    return score >= 0.35, round(score, 3)


def _compute_match_score(
    proof: dict,
    statement_entry: dict,
    myr_amount: float | None = None,
) -> dict:
    """
    Compute a fuzzy match score between a payment proof and a bank statement entry.
    Returns match details including individual field scores.
    """
    proof_amount = myr_amount or proof.get("amount")
    stmt_amount = statement_entry.get("amount")

    amount_ok, amount_diff = _amount_match(proof_amount, stmt_amount)
    date_ok, days_apart = _date_match(proof.get("date"), statement_entry.get("date"))
    payer_ok, payer_score = _payer_match(
        proof.get("payer"), statement_entry.get("payer")
    )

    score = 0.0
    if amount_ok:
        score += 0.5
    if date_ok:
        score += 0.35
    if payer_ok:
        score += 0.15

    if score >= 0.60:
        status = "matched"
    elif score >= 0.30:
        status = "fuzzy"
    else:
        status = "unmatched"

    return {
        "status": status,
        "score": round(score, 3),
        "amount_match": amount_ok,
        "amount_diff_pct": amount_diff,
        "date_match": date_ok,
        "days_apart": days_apart,
        "payer_match": payer_ok,
        "payer_similarity": payer_score,
        "proof_amount_myr": proof_amount,
        "statement_amount": stmt_amount,
    }


RECONCILIATION_SYSTEM_PROMPT = """You are a financial reconciliation agent for SMEs doing cross-border payments.

Your job is to analyze payment proof data and bank statement entries, then determine if they match.

You will be given:
1. A payment proof (extracted from an image/PDF) with: amount, currency, MYR equivalent, date, payer, payee
2. One or more bank statement entries with: amount (in MYR), date, description
3. Pre-computed fuzzy match scores for each pair

Your reasoning should:
- Confirm or override the fuzzy match based on context
- Explain WHY it matches or doesn't (currency conversion, bank fees, timing)
- For fuzzy matches: explain what's ambiguous and what a human should check
- For unmatched: suggest possible reasons (wrong amount, wrong date range, bank fees deducted)
- Account for common bank fee deductions (typically 0.5–2% of transaction)

Respond in JSON format:
{
  "final_status": "matched" | "fuzzy" | "unmatched",
  "confidence": 0.0-1.0,
  "explanation": "...",
  "matched_entry_index": 0 or null,
  "discrepancy_reason": "..." or null,
  "suggested_action": "..." or null,
  "bank_fee_estimate": 0.0 or null
}"""


async def reconcile(
    proof: dict,
    bank_entries: list[dict],
    fx_result: dict | None = None,
) -> dict:
    """
    Basic reconciliation with Reasoning Fallback.

    Primary: Morpheus AI with contextual reasoning
    Fallback: Rule-based matching using pre-computed scores

    Args:
        proof: extracted data from payment proof
               {amount, currency, date, payer, payee, description}
        bank_entries: list of bank statement rows
                      [{amount, date, description, payer?}]
        fx_result: FX conversion result if currency != MYR
                   {from_amount, from_currency, to_amount, to_currency, rate, date}

    Returns:
        Reconciliation result with agent decision
    """
    myr_amount = fx_result["to_amount"] if fx_result else proof.get("amount")

    match_scores = [
        _compute_match_score(proof, entry, myr_amount) for entry in bank_entries
    ]

    best_idx = (
        max(range(len(match_scores)), key=lambda i: match_scores[i]["score"])
        if match_scores
        else None
    )
    best_score = match_scores[best_idx] if best_idx is not None else None

    user_message = f"""Reconcile this payment proof against the bank statement entries.

PAYMENT PROOF:
- Original amount: {proof.get("currency", "UNKNOWN")} {proof.get("amount")}
- MYR equivalent: MYR {myr_amount} (rate: {fx_result["rate"] if fx_result else "N/A"}, date: {fx_result["date"] if fx_result else "N/A"})
- Transaction date: {proof.get("date")}
- Payer: {proof.get("payer")}
- Payee: {proof.get("payee")}
- Description: {proof.get("description")}

BANK STATEMENT ENTRIES:
{json.dumps(bank_entries, indent=2)}

PRE-COMPUTED FUZZY SCORES:
{json.dumps(match_scores, indent=2)}

BEST CANDIDATE: Entry index {best_idx} with score {best_score["score"] if best_score else "N/A"}

Please analyze and provide your reconciliation decision."""

    # Try Morpheus AI first
    try:
        agent_response_raw = await _call_morpheus(
            [
                {"role": "system", "content": RECONCILIATION_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ]
        )

        clean = agent_response_raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        agent_decision = json.loads(clean.strip())

        # Validate response
        if not isinstance(agent_decision, dict) or "final_status" not in agent_decision:
            raise ValueError("Invalid response format from Morpheus AI")

        agent_decision["reasoning_method"] = "morpheus_ai"

    except (
        httpx.TimeoutException,
        httpx.HTTPStatusError,
        json.JSONDecodeError,
        IndexError,
        ValueError,
        KeyError,
    ) as e:
        # Fallback to rule-based matching
        print(f"Morpheus AI reasoning failed: {type(e).__name__}: {str(e)}")
        print("Falling back to rule-based reconciliation")

        agent_decision = {
            "final_status": best_score["status"] if best_score else "unmatched",
            "confidence": best_score["score"] if best_score else 0.0,
            "explanation": f"AI reasoning unavailable (fallback mode). Using rule-based match with score {best_score['score'] if best_score else 0.0:.2f}.",
            "matched_entry_index": best_idx
            if best_score and best_score["status"] != "unmatched"
            else None,
            "discrepancy_reason": None,
            "suggested_action": "Please review manually. AI reasoning was unavailable.",
            "bank_fee_estimate": None,
            "reasoning_method": "rule_based_fallback",
        }

    return {
        "proof": proof,
        "fx_result": fx_result,
        "myr_amount": myr_amount,
        "bank_entries": bank_entries,
        "match_scores": match_scores,
        "best_candidate_index": best_idx,
        "agent_decision": agent_decision,
    }
