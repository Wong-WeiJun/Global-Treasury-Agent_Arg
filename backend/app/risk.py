import random
import string
from datetime import datetime, timezone


def calculate_risk_score(
    match_scores: list[dict], best_score: dict | None
) -> tuple[int, dict]:
    if not best_score:
        return 95, {"reason": "No matching entry found"}

    factors = {}
    risk = 0

    # Amount deviation (0-40 pts)
    diff_pct = best_score.get("amount_diff_pct", 100)
    if diff_pct > 20:
        risk += 40
        factors["amount_deviation"] = f"{diff_pct:.1f}% — HIGH"
    elif diff_pct > 5:
        risk += 20
        factors["amount_deviation"] = f"{diff_pct:.1f}% — MODERATE"
    elif diff_pct > 2:
        risk += 10
        factors["amount_deviation"] = f"{diff_pct:.1f}% — LOW"
    else:
        factors["amount_deviation"] = f"{diff_pct:.1f}% — within tolerance"

    # Date difference (0-30 pts)
    days = best_score.get("days_apart", 999)
    if days > 30:
        risk += 30
        factors["date_difference"] = f"{days} days — SUSPICIOUS"
    elif days > 7:
        risk += 15
        factors["date_difference"] = f"{days} days — ELEVATED"
    elif days > 2:
        risk += 5
        factors["date_difference"] = f"{days} days — MINOR"
    else:
        factors["date_difference"] = f"{days} days — within tolerance"

    # Payer mismatch (0-20 pts)
    payer_sim = best_score.get("payer_similarity", 0)
    if payer_sim == 0:
        risk += 15
        factors["payer_identity"] = "Not provided — unverified"
    elif payer_sim < 0.5:
        risk += 20
        factors["payer_identity"] = f"{payer_sim * 100:.0f}% similarity — MISMATCH"
    elif payer_sim < 0.75:
        risk += 10
        factors["payer_identity"] = f"{payer_sim * 100:.0f}% similarity — PARTIAL"
    else:
        factors["payer_identity"] = f"{payer_sim * 100:.0f}% similarity — GOOD"

    # Overall confidence penalty (0-10 pts)
    confidence = best_score.get("score", 0)
    if confidence < 0.5:
        risk += 10
        factors["overall_confidence"] = f"{confidence * 100:.0f}% — LOW"
    else:
        factors["overall_confidence"] = f"{confidence * 100:.0f}% — acceptable"

    return min(risk, 100), factors


def generate_case_id() -> str:
    year = datetime.now(timezone.utc).year
    suffix = "".join(random.choices(string.digits, k=4))
    return f"CASE-{year}-{suffix}"


def generate_journal_entry(
    proof: dict,
    fx_result: dict | None,
    action: str,
    exception_type: str | None = None,
) -> dict:
    """Generate a mock double-entry accounting journal entry."""
    amount = fx_result["to_amount"] if fx_result else proof.get("amount", 0)
    currency = proof.get("currency", "MYR")
    myr_amount = fx_result["to_amount"] if fx_result else amount

    tag = "EXCEPTION" if action == "exception" else "RECONCILED"

    return {
        "entry_id": f"JE-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "date": proof.get("date") or datetime.now(timezone.utc).date().isoformat(),
        "status": tag,
        "exception_type": exception_type,
        "lines": [
            {
                "account": "1200 - Accounts Receivable",
                "debit": None,
                "credit": myr_amount,
                "currency": "MYR",
                "description": f"Receipt from {proof.get('payer', 'Unknown Payer')}",
            },
            {
                "account": "1100 - Bank (MYR Operating Account)",
                "debit": myr_amount,
                "credit": None,
                "currency": "MYR",
                "description": f"Inbound transfer — {currency} {proof.get('amount')} @ {fx_result['rate'] if fx_result else 1.0}",
            },
        ],
        "fx_note": f"Original: {currency} {proof.get('amount')} converted at {fx_result['rate'] if fx_result else 1.0}"
        if fx_result
        else None,
    }
