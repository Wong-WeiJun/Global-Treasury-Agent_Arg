"""
Proactive Reconciliation Agent: Morpheus AI with Memory and Context.

This module elevates Morpheus AI from a "fuzzy matcher" to a "financial negotiator"
with historical awareness and agentic decision-making.
"""

import json
from datetime import datetime, timedelta

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
        "max_tokens": 3072,  # Increased for more detailed reasoning
        "temperature": 0.1,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=90.0) as client:
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


PROACTIVE_RECONCILIATION_PROMPT = """You are a proactive financial reconciliation agent with MEMORY and CONTEXT.

You don't just match transactions — you understand business relationships, learn from history, and propose intelligent adjustments.

YOUR CAPABILITIES:
1. HISTORICAL AWARENESS: You can see this vendor's payment history over the last 3 months
2. PATTERN RECOGNITION: You know if this vendor is typically late, if amounts vary, if bank fees apply
3. AGENTIC ADJUSTMENT: For small discrepancies, you can propose a journal entry adjustment instead of failing
4. LEARNED PREFERENCES: You remember how users have reconciled similar cases before

RECONCILIATION DECISION FRAMEWORK:

STATUS OPTIONS:
- "matched": Perfect match, no human intervention needed
- "matched_with_adjustment": Match found, but requires a journal entry for small discrepancy (bank fee, FX spread, rounding)
- "fuzzy": Probable match but needs human confirmation
- "unmatched": No match found after exhaustive analysis

WHEN TO PROPOSE ADJUSTMENTS:
- Bank fees: If amount is off by 0.5-2%, likely a bank transfer fee
- Currency spread: If amount is off by <1% and involves FX conversion
- Rounding: If difference is <$1 and looks like a rounding error
- Partial payment: If bank amount is exactly 50% or 25% of invoice

For "matched_with_adjustment", you MUST include:
- adjustment_type: "bank_fee" | "fx_spread" | "rounding" | "partial_payment"
- adjustment_amount: the difference in base currency
- journal_entry_proposal: {
    "debit_account": "Account name",
    "debit_amount": amount,
    "credit_account": "Account name",
    "credit_amount": amount,
    "memo": "Explanation"
  }

RESPOND IN JSON:
{
  "final_status": "matched" | "matched_with_adjustment" | "fuzzy" | "unmatched",
  "confidence": 0.0-1.0,
  "explanation": "Detailed reasoning with historical context",
  "matched_entry_index": 0 or null,
  "adjustment_type": "bank_fee" | "fx_spread" | "rounding" | "partial_payment" | null,
  "adjustment_amount": 0.0 or null,
  "journal_entry_proposal": {...} or null,
  "historical_insights": "What you learned from past transactions with this vendor",
  "suggested_action": "Clear next steps for the user"
}

CRITICAL: Always explain WHY you made your decision using historical context.
"""


async def reconcile_with_memory(
    proof: dict,
    bank_entries: list[dict],
    fx_result: dict | None = None,
    vendor_history: list[dict] | None = None,
    learned_patterns: list[dict] | None = None,
    vendor_preferences: list[dict] | None = None,
    match_scores: list[dict] | None = None,
) -> dict:
    """
    Enhanced reconciliation with memory, context, and agentic adjustment proposals.

    Args:
        proof: Extracted payment proof data
        bank_entries: Bank statement entries to match against
        fx_result: FX conversion result if applicable
        vendor_history: Historical transactions with this vendor (last 3 months)
        learned_patterns: Learned reconciliation patterns (bank fees, late payments, etc.)
        vendor_preferences: Learned vendor name variations and payment patterns
        match_scores: Pre-computed fuzzy match scores

    Returns:
        Reconciliation result with agentic adjustment proposals
    """
    myr_amount = fx_result["to_amount"] if fx_result else proof.get("amount")

    # Build rich context for Morpheus AI
    context_sections = []

    # 1. Current transaction
    context_sections.append(
        f"""
CURRENT TRANSACTION TO RECONCILE:
- Original amount: {proof.get("currency", "UNKNOWN")} {proof.get("amount")}
- Base currency amount: MYR {myr_amount}
- FX rate: {fx_result["rate"] if fx_result else "N/A"} (date: {fx_result["date"] if fx_result else "N/A"})
- Transaction date: {proof.get("date")}
- Payer: {proof.get("payer")}
- Payee: {proof.get("payee")}
- Description: {proof.get("description")}
"""
    )

    # 2. Historical context with this vendor
    if vendor_history and len(vendor_history) > 0:
        context_sections.append("\nHISTORICAL CONTEXT (Last 3 months with this vendor):")
        for i, hist in enumerate(vendor_history[:5], 1):
            days_late = hist.get("days_late", 0)
            late_info = f" (paid {days_late} days late)" if days_late > 0 else ""
            context_sections.append(
                f"{i}. {hist.get('date')}: {hist.get('currency')} {hist.get('amount')} - {hist.get('status', 'unknown')}{late_info}"
            )

        # Summary insights
        avg_amount = (
            sum(h.get("amount", 0) for h in vendor_history) / len(vendor_history)
            if vendor_history
            else 0
        )
        late_count = sum(
            1 for h in vendor_history if h.get("days_late", 0) > 2
        )
        context_sections.append(
            f"\nVENDOR PATTERNS: Average amount: ${avg_amount:.2f}, Late payments: {late_count}/{len(vendor_history)}"
        )

    # 3. Learned patterns
    if learned_patterns and len(learned_patterns) > 0:
        context_sections.append("\nLEARNED PATTERNS:")
        for pattern in learned_patterns:
            pattern_rule = pattern.get("pattern_rule", {})
            if pattern.get("pattern_type") == "bank_fee":
                fee_pct = pattern_rule.get("fee_value", 0) * 100
                context_sections.append(
                    f"- Bank fees are typically {fee_pct:.2f}% for this organization (learned from {pattern.get('learned_from_count', 0)} cases)"
                )
            elif pattern.get("pattern_type") == "late_payment":
                context_sections.append(
                    f"- This vendor typically pays {pattern_rule.get('typical_days_late', 0)} days late"
                )

    # 4. Vendor name variations
    if vendor_preferences and len(vendor_preferences) > 0:
        context_sections.append("\nVENDOR NAME VARIATIONS:")
        for pref in vendor_preferences:
            aliases = pref.get("vendor_aliases", [])
            if aliases:
                context_sections.append(
                    f"- {pref.get('canonical_vendor_name')}: known as {', '.join(aliases)}"
                )

    # 5. Bank entries to match against
    context_sections.append("\nBANK STATEMENT ENTRIES:")
    context_sections.append(json.dumps(bank_entries, indent=2))

    # 6. Pre-computed match scores
    if match_scores:
        context_sections.append("\nPRE-COMPUTED MATCH SCORES:")
        context_sections.append(json.dumps(match_scores, indent=2))

        best_idx = (
            max(range(len(match_scores)), key=lambda i: match_scores[i]["score"])
            if match_scores
            else None
        )
        if best_idx is not None:
            context_sections.append(
                f"\nBEST CANDIDATE: Entry index {best_idx} with score {match_scores[best_idx]['score']}"
            )

    user_message = "\n".join(context_sections)
    user_message += "\n\nAnalyze this transaction with your full context and memory. If there's a small discrepancy that can be explained (bank fee, FX spread, rounding), propose a journal entry adjustment."

    agent_response_raw = await _call_morpheus(
        [
            {"role": "system", "content": PROACTIVE_RECONCILIATION_PROMPT},
            {"role": "user", "content": user_message},
        ]
    )

    # Parse response
    try:
        clean = agent_response_raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        agent_decision = json.loads(clean.strip())
    except (json.JSONDecodeError, IndexError):
        # Fallback to basic reconciliation
        agent_decision = {
            "final_status": "unmatched",
            "confidence": 0.0,
            "explanation": "Agent reasoning failed to parse",
            "matched_entry_index": None,
            "adjustment_type": None,
            "adjustment_amount": None,
            "journal_entry_proposal": None,
            "historical_insights": "Unable to analyze",
            "suggested_action": "Please review manually",
        }

    return {
        "proof": proof,
        "fx_result": fx_result,
        "myr_amount": myr_amount,
        "bank_entries": bank_entries,
        "match_scores": match_scores,
        "vendor_history": vendor_history,
        "learned_patterns": learned_patterns,
        "vendor_preferences": vendor_preferences,
        "agent_decision": agent_decision,
    }


async def get_vendor_history(
    session,
    organization_id,
    vendor_name: str | None,
    months_back: int = 3,
) -> list[dict]:
    """
    Retrieve historical transactions with this vendor for the last N months.

    Args:
        session: Database session
        organization_id: Organization UUID
        vendor_name: Vendor name to search for (normalized)
        months_back: How many months of history to retrieve

    Returns:
        List of historical transaction dictionaries
    """
    if not vendor_name:
        return []

    from datetime import datetime, timedelta

    from sqlmodel import select

    from app.models import Document

    # Normalize vendor name for comparison
    from app.ai_insights import normalize_vendor_name

    normalized_vendor = normalize_vendor_name(vendor_name)

    if not normalized_vendor:
        return []

    cutoff_date = datetime.now() - timedelta(days=months_back * 30)

    # Query documents from this organization
    statement = (
        select(Document)
        .where(
            Document.organization_id == organization_id,
            Document.transaction_date is not None,
            Document.workflow_status.in_(["APPROVED", "EXCEPTION_APPROVED"]),
        )
        .order_by(Document.transaction_date.desc())
    )

    docs = session.exec(statement).all()

    # Filter by vendor name and date
    history = []
    for doc in docs:
        if not doc.extracted_data:
            continue

        # Parse transaction date
        try:
            if doc.transaction_date:
                tx_date = datetime.strptime(doc.transaction_date, "%Y-%m-%d")
                if tx_date < cutoff_date:
                    continue
        except (ValueError, TypeError):
            continue

        # Check vendor name
        doc_vendor = doc.extracted_data.get("payee") or doc.extracted_data.get("payer")
        if doc_vendor:
            doc_vendor_normalized = normalize_vendor_name(doc_vendor)
            if doc_vendor_normalized == normalized_vendor:
                # Calculate days late if we have reconciliation data
                days_late = 0
                if doc.reconciliation_result:
                    matched_entry = doc.reconciliation_result.get("agent_decision", {}).get("matched_entry_index")
                    if matched_entry is not None:
                        bank_entries = doc.reconciliation_result.get("bank_entries", [])
                        if matched_entry < len(bank_entries):
                            bank_date = bank_entries[matched_entry].get("date")
                            if bank_date and doc.transaction_date:
                                try:
                                    tx_dt = datetime.strptime(doc.transaction_date, "%Y-%m-%d")
                                    bank_dt = datetime.strptime(bank_date, "%Y-%m-%d")
                                    days_late = (bank_dt - tx_dt).days
                                except (ValueError, TypeError):
                                    pass

                history.append(
                    {
                        "id": str(doc.id),
                        "date": doc.transaction_date,
                        "amount": doc.original_amount,
                        "currency": doc.original_currency,
                        "status": doc.workflow_status,
                        "days_late": days_late,
                    }
                )

    return history


def propose_adjustment_journal_entry(
    adjustment_type: str,
    adjustment_amount: float,
    proof_data: dict,
    base_currency: str = "MYR",
) -> dict:
    """
    Generate a journal entry proposal for agentic adjustments.

    Args:
        adjustment_type: Type of adjustment (bank_fee, fx_spread, rounding, partial_payment)
        adjustment_amount: Amount of the adjustment in base currency
        proof_data: Payment proof data
        base_currency: Base currency code

    Returns:
        Journal entry dictionary
    """
    vendor = proof_data.get("payee") or proof_data.get("payer") or "Unknown Vendor"
    description = proof_data.get("description", "")

    if adjustment_type == "bank_fee":
        return {
            "debit_account": "Bank Charges Expense",
            "debit_amount": abs(adjustment_amount),
            "credit_account": "Accounts Payable",
            "credit_amount": abs(adjustment_amount),
            "memo": f"Bank transfer fee adjustment for payment to {vendor}. {description}",
            "adjustment_type": "bank_fee",
        }

    elif adjustment_type == "fx_spread":
        return {
            "debit_account": "Foreign Exchange Loss",
            "debit_amount": abs(adjustment_amount),
            "credit_account": "Accounts Payable",
            "credit_amount": abs(adjustment_amount),
            "memo": f"FX spread adjustment for payment to {vendor}. {description}",
            "adjustment_type": "fx_spread",
        }

    elif adjustment_type == "rounding":
        return {
            "debit_account": "Rounding Adjustments",
            "debit_amount": abs(adjustment_amount),
            "credit_account": "Accounts Payable",
            "credit_amount": abs(adjustment_amount),
            "memo": f"Rounding adjustment for payment to {vendor}. {description}",
            "adjustment_type": "rounding",
        }

    elif adjustment_type == "partial_payment":
        return {
            "debit_account": "Accounts Payable",
            "debit_amount": abs(adjustment_amount),
            "credit_account": "Accounts Payable - Pending",
            "credit_amount": abs(adjustment_amount),
            "memo": f"Partial payment tracking for {vendor}. Remaining balance to be reconciled. {description}",
            "adjustment_type": "partial_payment",
        }

    else:
        return {
            "debit_account": "Suspense Account",
            "debit_amount": abs(adjustment_amount),
            "credit_account": "Accounts Payable",
            "credit_amount": abs(adjustment_amount),
            "memo": f"Adjustment for payment to {vendor}. Type: {adjustment_type}. {description}",
            "adjustment_type": adjustment_type,
        }
