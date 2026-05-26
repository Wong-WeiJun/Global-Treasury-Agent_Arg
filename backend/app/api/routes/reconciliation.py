import uuid
from datetime import datetime, timedelta
from difflib import SequenceMatcher

import boto3
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.extraction import extract_from_image, extract_from_pdf
from app.fx import convert
from app.models import (
    BankTransaction,
    BankTransactionPublic,
    Document,
    Organization,
    ReconcileRequest,
    ReconcileResponse,
    User,
)
from app.proactive_reconciliation import (
    reconcile_with_memory,
    get_vendor_history,
)
from app.ai_learning import (
    get_learned_vendor_preferences,
    get_learned_patterns,
)
from app.ai_insights import normalize_vendor_name
from pydantic import BaseModel

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


def get_user_base_currency(session: SessionDep, user_id: uuid.UUID) -> str:
    """Get the base currency for a user's organization. Defaults to MYR."""
    user = session.get(User, user_id)
    if not user or not user.organization_id:
        return "MYR"

    org = session.get(Organization, user.organization_id)
    if not org:
        return "MYR"

    return org.base_currency


@router.post("/reconcile", response_model=ReconcileResponse)
async def reconcile_document(
    body: ReconcileRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    from app.utils.org_context import get_user_primary_organization

    # Get user's organization for multi-tenant isolation
    org = get_user_primary_organization(session, current_user.id)
    if not org:
        raise HTTPException(
            status_code=400, detail="You must belong to an organization"
        )

    doc = session.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # CRITICAL: Check organization_id for multi-tenant isolation
    if doc.organization_id != org.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    session.refresh(doc)

    # Auto-extract if not yet done
    if not doc.extracted_data:
        s3 = boto3.client(
            "s3",
            region_name=settings.s3_region,
            aws_access_key_id=settings.aws_access_key_id.get_secret_value()
            if settings.aws_access_key_id
            else None,
            aws_secret_access_key=settings.aws_secret_access_key.get_secret_value()
            if settings.aws_secret_access_key
            else None,
        )
        obj = s3.get_object(Bucket=settings.s3_bucket_name, Key=doc.s3_key)
        file_bytes = obj["Body"].read()

        try:
            if doc.file_type == "image":
                data = await extract_from_image(file_bytes)
            elif doc.file_type == "pdf":
                data = await extract_from_pdf(file_bytes)
            else:
                raise HTTPException(
                    status_code=422,
                    detail="Cannot auto-extract this file type. Please extract manually first.",
                )

            if data.get("amount") and data.get("currency"):
                base_currency = get_user_base_currency(session, current_user.id)
                fx = await convert(
                    amount=data["amount"],
                    from_currency=data["currency"],
                    to_currency=base_currency,
                    on_date=data.get("date") or "latest",
                )
                data["myr_amount"] = fx["to_amount"]  # Legacy field
                data["fx_rate"] = fx["rate"]

            doc.extracted_data = data
            doc.workflow_status = "EXTRACTED"
            flag_modified(doc, "extracted_data")
            session.add(doc)
            session.commit()
            session.refresh(doc)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Auto-extraction failed: {str(e)}"
            )

    proof = doc.extracted_data
    base_currency = get_user_base_currency(session, current_user.id)

    # FX conversion - use organization's base currency
    fx_result = None
    if proof.get("currency") and proof["currency"].upper() != base_currency:
        fx_date = body.override_date or proof.get("date") or "latest"
        fx_result = await convert(
            amount=proof["amount"],
            from_currency=proof["currency"],
            to_currency=base_currency,
            on_date=fx_date,
        )

    # Get vendor name for history lookup
    vendor_name = proof.get("payee") or proof.get("payer")
    normalized_vendor = normalize_vendor_name(vendor_name) if vendor_name else None

    # Retrieve vendor history (last 3 months)
    vendor_history = await get_vendor_history(
        session=session,
        organization_id=org.id,
        vendor_name=vendor_name,
        months_back=3,
    )

    # Retrieve learned patterns
    learned_patterns_objs = await get_learned_patterns(session, org.id)
    learned_patterns = [
        {
            "pattern_type": p.pattern_type,
            "pattern_name": p.pattern_name,
            "pattern_rule": p.pattern_rule,
            "learned_from_count": p.learned_from_count,
            "success_rate": p.success_rate,
        }
        for p in learned_patterns_objs
    ]

    # Retrieve vendor preferences
    vendor_prefs_objs = await get_learned_vendor_preferences(session, org.id)
    vendor_preferences = [
        {
            "canonical_vendor_name": vp.canonical_vendor_name,
            "vendor_aliases": vp.vendor_aliases,
            "typical_amount_range": vp.typical_amount_range,
            "is_recurring": vp.is_recurring,
            "confidence": vp.confidence,
        }
        for vp in vendor_prefs_objs
        if normalized_vendor and vp.canonical_vendor_name == normalized_vendor
    ]

    # Compute traditional fuzzy match scores for context
    from app.reconciliation import _compute_match_score

    match_scores = [
        _compute_match_score(
            proof,
            e.model_dump(),
            myr_amount=fx_result["to_amount"] if fx_result else proof.get("amount"),
        )
        for e in body.bank_entries
    ]

    # Use proactive reconciliation with memory and context
    result = await reconcile_with_memory(
        proof=proof,
        bank_entries=[e.model_dump() for e in body.bank_entries],
        fx_result=fx_result,
        vendor_history=vendor_history,
        learned_patterns=learned_patterns,
        vendor_preferences=vendor_preferences,
        match_scores=match_scores,
    )

    # Save result to document for history
    doc.reconciliation_result = result
    flag_modified(doc, "reconciliation_result")

    # Set AI Result (immutable - never overwritten by human action)
    agent_decision = result.get("agent_decision", {})
    final_status = agent_decision.get("final_status", "unmatched")

    # Map AI's final_status to our AI result enum
    if final_status == "matched":
        doc.ai_result = "MATCHED"
    elif final_status == "matched_with_adjustment":
        # New status: AI found a match but needs a small adjustment
        doc.ai_result = "MATCHED"  # Still count as matched
    elif final_status == "fuzzy":
        doc.ai_result = "FUZZY_MATCH"
    else:
        doc.ai_result = "UNMATCHED"

    doc.ai_confidence = agent_decision.get("confidence", 0.0)
    doc.ai_explanation = agent_decision.get("explanation", "")

    # Add historical insights to explanation if available
    historical_insights = agent_decision.get("historical_insights")
    if historical_insights:
        doc.ai_explanation = (
            f"{doc.ai_explanation}\n\nHistorical Context: {historical_insights}"
        )

    # ── ML Decision Agent: auto-approval + risk assessment ───────────────────
    from datetime import datetime, timezone

    from app.models import ReconciliationRecord
    from app.risk import generate_journal_entry
    from app.decision_agent import make_decision, DecisionContext, MatchScores

    result_scores = result.get("match_scores", match_scores)
    best_idx = agent_decision.get("matched_entry_index")
    best_score_dict = (
        result_scores[best_idx]
        if best_idx is not None and best_idx < len(result_scores)
        else {}
    )
    matched_entry = (
        body.bank_entries[best_idx].model_dump()
        if best_idx is not None and best_idx < len(body.bank_entries)
        else None
    )
    amount_diff_pct = best_score_dict.get("amount_diff_pct", 100)

    # Get user's membership role for governance logging
    from app.models import Membership
    from sqlmodel import select as sql_select

    membership = session.exec(
        sql_select(Membership)
        .where(Membership.user_id == current_user.id)
        .where(Membership.organization_id == org.id)
    ).first()
    user_role = (
        membership.role
        if membership
        else ("superuser" if current_user.is_superuser else "VIEWER")
    )

    decision_ctx = DecisionContext(
        document_id=str(body.document_id),
        org_id=org.id,
        triggered_by=str(current_user.id),
        role=user_role,
        extracted_data=proof,
        matched_bank_entry=matched_entry,
        match_scores=MatchScores(
            amount_match=max(0.0, min(1.0, 1.0 - amount_diff_pct / 100.0)),
            date_diff_days=best_score_dict.get("days_apart", 999),
            payer_similarity=best_score_dict.get("payer_similarity", 0.0),
            overall_score=best_score_dict.get("score", 0.0),
        ),
        base_currency=base_currency,
        vendor_history=vendor_history,
        learned_patterns=learned_patterns,
        reconciliation_status=final_status,
        adjustment_type=agent_decision.get("adjustment_type"),
    )

    decision_result = await make_decision(decision_ctx)

    # Persist risk assessment regardless of approval outcome
    doc.risk_score = decision_result.risk_score
    doc.risk_level = decision_result.risk_level

    if decision_result.auto_approve:
        adjustment_type = agent_decision.get("adjustment_type")
        journal_entry_proposal = agent_decision.get("journal_entry_proposal")

        if final_status == "matched_with_adjustment" and journal_entry_proposal:
            journal_entry = journal_entry_proposal
            exception_type = (
                adjustment_type.upper() if adjustment_type else "ADJUSTMENT"
            )
            action = "exception"
            note = (
                f"Auto-approved with {adjustment_type} adjustment "
                f"({agent_decision.get('adjustment_amount', 0)} {base_currency}) "
                f"[decision_id={decision_result.decision_id}]"
            )
        else:
            fx_result_dict = result.get("fx_result")
            proof_dict = result.get("proof", {})
            journal_entry = generate_journal_entry(
                proof_dict, fx_result_dict, "approved", None
            )
            exception_type = None
            action = "approved"
            note = (
                f"Auto-approved by decision agent "
                f"(confidence={decision_result.confidence:.2f} "
                f"risk={decision_result.risk_score} method={decision_result.method}) "
                f"[decision_id={decision_result.decision_id}]"
            )

        record = ReconciliationRecord(
            document_id=doc.id,
            organization_id=doc.organization_id,
            reviewed_by=current_user.id,
            confidence=decision_result.confidence,
            risk_score=decision_result.risk_score,
            risk_level=decision_result.risk_level,
            fx_rate=fx_result["rate"] if fx_result else None,
            normalized_amount_myr=fx_result["to_amount"]
            if fx_result
            else proof.get("amount"),
            base_currency=base_currency,
            base_amount=fx_result["to_amount"] if fx_result else proof.get("amount"),
            action=action,
            exception_type=exception_type,
            note=note,
            ai_explanation=(
                f"{doc.ai_explanation}\n\nDecision Agent: {decision_result.reasoning}"
            ),
            case_id=None,
            assigned_to=None,
            priority=None,
            risk_factors={
                "factors": [
                    {"name": f.name, "score": f.score, "explanation": f.explanation}
                    for f in decision_result.risk_factors
                ],
                "method": decision_result.method,
                "decision_id": decision_result.decision_id,
            },
            journal_entry=journal_entry,
        )
        session.add(record)

        if action == "exception":
            doc.workflow_status = "EXCEPTION_APPROVED"
            doc.review_status = "exception"
            doc.exception_type = exception_type
        else:
            doc.workflow_status = "APPROVED"
            doc.review_status = "approved"

        doc.review_note = note
        doc.reviewed_at = datetime.now(timezone.utc)
        doc.reviewed_by = current_user.id
    else:
        # Escalated or rejected — human review required
        doc.workflow_status = "PENDING_ACTION"
        doc.review_note = decision_result.recommended_action

    flag_modified(doc, "reconciliation_result")
    session.add(doc)
    session.commit()
    session.refresh(doc)

    return ReconcileResponse(document_id=body.document_id, result=result)


class SuggestedMatch(BaseModel):
    """A suggested bank transaction match for a document"""

    transaction: BankTransactionPublic
    confidence: float
    explanation: str


class SuggestMatchesResponse(BaseModel):
    document_id: uuid.UUID
    extracted_data: dict
    suggested_matches: list[SuggestedMatch]


@router.get("/suggest-matches/{document_id}", response_model=SuggestMatchesResponse)
async def suggest_matches(
    document_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> SuggestMatchesResponse:
    """
    Find and rank candidate bank transactions for a document.
    Uses rule-based filtering + scoring to suggest matches.
    """
    from app.utils.org_context import get_user_primary_organization

    org = get_user_primary_organization(session, current_user.id)
    if not org:
        raise HTTPException(
            status_code=400, detail="You must belong to an organization"
        )

    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.organization_id != org.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Auto-extract if needed
    if not doc.extracted_data:
        s3 = boto3.client(
            "s3",
            region_name=settings.s3_region,
            aws_access_key_id=settings.aws_access_key_id.get_secret_value()
            if settings.aws_access_key_id
            else None,
            aws_secret_access_key=settings.aws_secret_access_key.get_secret_value()
            if settings.aws_secret_access_key
            else None,
        )
        obj = s3.get_object(Bucket=settings.s3_bucket_name, Key=doc.s3_key)
        file_bytes = obj["Body"].read()

        if doc.file_type == "image":
            data = await extract_from_image(file_bytes)
        elif doc.file_type == "pdf":
            data = await extract_from_pdf(file_bytes)
        else:
            raise HTTPException(
                status_code=422,
                detail="Cannot extract this file type",
            )

        base_currency = get_user_base_currency(session, current_user.id)
        if data.get("amount") and data.get("currency"):
            fx = await convert(
                amount=data["amount"],
                from_currency=data["currency"],
                to_currency=base_currency,
                on_date=data.get("date") or "latest",
            )
            data["myr_amount"] = fx["to_amount"]
            data["fx_rate"] = fx["rate"]

        doc.extracted_data = data
        doc.workflow_status = "EXTRACTED"
        flag_modified(doc, "extracted_data")
        session.add(doc)
        session.commit()
        session.refresh(doc)

    extracted = doc.extracted_data
    amount = extracted.get("amount")
    currency = extracted.get("currency", "MYR")
    date_str = extracted.get("date")
    payer = extracted.get("payer", "")
    payee = extracted.get("payee", "")

    if not amount or not date_str:
        raise HTTPException(
            status_code=400,
            detail="Document must have amount and date extracted",
        )

    # Convert amount to base currency for matching
    base_currency = get_user_base_currency(session, current_user.id)
    if currency != base_currency:
        fx = await convert(
            amount=amount,
            from_currency=currency,
            to_currency=base_currency,
            on_date=date_str,
        )
        base_amount = fx["to_amount"]
    else:
        base_amount = amount

    # Parse date
    try:
        doc_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    # Stage 1: Rule-based filtering
    # Get transactions within date range (±14 days) and amount range (±25%)
    date_min = doc_date - timedelta(days=14)
    date_max = doc_date + timedelta(days=14)

    # Handle both positive and negative amounts (debits/credits)
    amount_abs = abs(base_amount)
    amount_min = amount_abs * 0.75
    amount_max = amount_abs * 1.25

    # Query unmatched transactions - compare absolute values
    from sqlalchemy import func as sql_func

    stmt = (
        select(BankTransaction)
        .where(
            BankTransaction.organization_id == org.id,
            BankTransaction.status == "unmatched",
            BankTransaction.date >= str(date_min),
            BankTransaction.date <= str(date_max),
            sql_func.abs(BankTransaction.amount) >= amount_min,
            sql_func.abs(BankTransaction.amount) <= amount_max,
        )
        .limit(10)
    )

    candidates = session.exec(stmt).all()

    # Debug logging
    print(
        f"[DEBUG] Found {len(candidates)} candidate transactions for doc {document_id}"
    )
    print(
        f"[DEBUG] Search params: date={doc_date}, amount={base_amount}, range={amount_min}-{amount_max}"
    )

    # Stage 2: Score each candidate
    suggestions = []
    for txn in candidates:
        score = _score_transaction_match(
            extracted=extracted,
            base_amount=base_amount,
            doc_date=doc_date,
            transaction=txn,
        )

        if score["confidence"] >= 0.25:  # Include any plausible match
            suggestions.append(
                SuggestedMatch(
                    transaction=BankTransactionPublic.model_validate(txn),
                    confidence=score["confidence"],
                    explanation=score["explanation"],
                )
            )

    # Sort by confidence descending
    suggestions.sort(key=lambda x: x.confidence, reverse=True)

    return SuggestMatchesResponse(
        document_id=document_id,
        extracted_data=extracted,
        suggested_matches=suggestions[:5],  # Top 5
    )


def _score_transaction_match(
    extracted: dict,
    base_amount: float,
    doc_date: datetime.date,
    transaction: BankTransaction,
) -> dict:
    """
    Score how well a transaction matches the extracted document data.
    Returns {"confidence": 0.0-1.0, "explanation": str}
    """
    scores = {}
    reasons = []

    # Amount similarity (40%)
    txn_amount = abs(transaction.amount)
    amount_diff = abs(txn_amount - base_amount)
    amount_pct_diff = amount_diff / base_amount if base_amount > 0 else 1.0

    if amount_pct_diff < 0.01:  # Within 1%
        scores["amount"] = 1.0
        reasons.append("Exact amount match")
    elif amount_pct_diff < 0.05:  # Within 5%
        scores["amount"] = 0.9
        reasons.append("Amount match within 5%")
    elif amount_pct_diff < 0.10:  # Within 10%
        scores["amount"] = 0.75
        reasons.append("Amount match within 10%")
    elif amount_pct_diff < 0.20:  # Within 20%
        scores["amount"] = 0.55
        reasons.append("Amount match within 20%")
    elif amount_pct_diff < 0.25:  # Within 25%
        scores["amount"] = 0.35
        reasons.append("Amount match within 25%")
    else:
        scores["amount"] = max(0, 1.0 - amount_pct_diff)

    # Date proximity (30%)
    try:
        txn_date = datetime.strptime(transaction.date, "%Y-%m-%d").date()
        days_diff = abs((txn_date - doc_date).days)

        if days_diff == 0:
            scores["date"] = 1.0
            reasons.append("Same date")
        elif days_diff <= 1:
            scores["date"] = 0.9
            reasons.append("1 day difference")
        elif days_diff <= 3:
            scores["date"] = 0.75
            reasons.append(f"{days_diff} days difference")
        elif days_diff <= 7:
            scores["date"] = 0.55
            reasons.append(f"{days_diff} days difference")
        elif days_diff <= 14:
            scores["date"] = 0.35
            reasons.append(f"{days_diff} days difference")
        else:
            scores["date"] = 0
    except ValueError:
        scores["date"] = 0

    # Vendor/payer similarity (30%)
    payer = (extracted.get("payer") or "").lower()
    payee = (extracted.get("payee") or "").lower()
    description = transaction.description.lower()

    vendor_score = 0.4  # Neutral baseline when vendor info is unavailable
    if payer and payer in description:
        vendor_score = 1.0
        reasons.append(f"Payer '{payer}' found in description")
    elif payee and payee in description:
        vendor_score = 1.0
        reasons.append(f"Payee '{payee}' found in description")
    elif payer or payee:
        # Fuzzy match using word overlap and sequence similarity
        combined_vendor = f"{payer} {payee}".strip()
        seq_score = SequenceMatcher(None, combined_vendor, description[:len(combined_vendor) + 20]).ratio()
        payer_words = set(payer.split())
        payee_words = set(payee.split())
        desc_words = set(description.split())
        overlap = (payer_words | payee_words) & desc_words
        if overlap:
            vendor_score = max(0.65, seq_score)
            reasons.append(f"Partial vendor match: {', '.join(overlap)}")
        elif seq_score >= 0.4:
            vendor_score = seq_score
            reasons.append("Fuzzy vendor name match")
        else:
            vendor_score = 0.4  # No match but keep neutral baseline

    scores["vendor"] = vendor_score

    # Calculate weighted confidence
    confidence = scores["amount"] * 0.4 + scores["date"] * 0.3 + scores["vendor"] * 0.3

    explanation = " | ".join(reasons) if reasons else "Low confidence match"

    return {"confidence": round(confidence, 2), "explanation": explanation}

