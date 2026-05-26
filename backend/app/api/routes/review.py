import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    AskAIRequest,
    Document,
    ReconciliationRecord,
    ReconciliationRecordPublic,
    ReviewActionRequest,
)
from app.reconciliation import _call_morpheus
from app.risk import calculate_risk_score, generate_case_id, generate_journal_entry

router = APIRouter(prefix="/files", tags=["review"])

EXCEPTION_TYPES = {
    "BANK_FEE": "Bank fee deducted",
    "PARTIAL_PAYMENT": "Partial payment received",
    "FX_SPREAD": "FX rate spread difference",
    "REFUND": "Refund transaction",
    "SPLIT_PAYMENT": "Split across multiple transfers",
    "DUPLICATE": "Duplicate payment detected",
    "TAX_WITHHOLDING": "Tax withheld at source",
    "MANUAL_ADJUSTMENT": "Manual accounting adjustment",
    "OTHER": "Other — see notes",
}

WORKFLOW_STATUS_MAP = {
    "approved": "APPROVED",
    "flagged": "UNDER_REVIEW",
    "exception": "EXCEPTION_APPROVED",
}


async def _generate_ai_explanation(
    action: str,
    proof: dict,
    match_scores: list,
    best_score: dict | None,
    note: str | None,
    exception_type: str | None,
) -> str:
    prompts = {
        "approved": f"""A financial reconciliation was APPROVED. Generate a 2-sentence professional explanation for the audit trail.

Payment: {proof.get("currency")} {proof.get("amount")} from {proof.get("payer")}
Best match score: {best_score}
Reviewer note: {note or "None"}

Explain WHY this was approved (amount tolerance, date proximity, payer confidence). Be specific with numbers. Output plain text only.""",
        "flagged": f"""A financial reconciliation was FLAGGED FOR INVESTIGATION. Generate a professional investigation summary.

Payment: {proof.get("currency")} {proof.get("amount")} from {proof.get("payer")}
Match scores: {best_score}
Priority note: {note or "None"}

Identify specific risk factors and recommend next steps. Use language like "Possible..." or "Investigation recommended because...". Output plain text only.""",
        "exception": f"""A reconciliation discrepancy was classified as EXCEPTION type: {exception_type} ({EXCEPTION_TYPES.get(exception_type or "", "Unknown")}).

Payment: {proof.get("currency")} {proof.get("amount")} from {proof.get("payer")}
Match scores: {best_score}
Note: {note or "None"}

Explain why this exception is valid and how it should be treated in accounting. Output plain text only.""",
    }

    try:
        return await _call_morpheus(
            [
                {
                    "role": "system",
                    "content": "You are a financial audit AI. Be concise, professional, and specific with numbers.",
                },
                {"role": "user", "content": prompts[action]},
            ]
        )
    except Exception:
        # Fallback explanations if Morpheus is unavailable
        fallbacks = {
            "approved": f"Transaction approved. Amount variance within acceptable tolerance. Payer identity confirmed with {(best_score or {}).get('payer_similarity', 0) * 100:.0f}% confidence.",
            "flagged": f"Flagged for investigation due to match score of {(best_score or {}).get('score', 0) * 100:.0f}%. Manual review required.",
            "exception": f"Exception recorded: {EXCEPTION_TYPES.get(exception_type or '', 'Unknown')}. Transaction reconciled with noted discrepancy.",
        }
        return fallbacks.get(action, "Decision recorded.")


@router.post("/{document_id}/review", response_model=ReconciliationRecordPublic)
async def review_document(
    document_id: uuid.UUID,
    body: ReviewActionRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    from app.utils.org_context import get_user_primary_organization

    if body.action not in ("approved", "flagged", "exception"):
        raise HTTPException(status_code=422, detail="Invalid action")

    if body.action == "exception" and not body.exception_type:
        raise HTTPException(
            status_code=422, detail="exception_type is required for exception action"
        )

    if body.exception_type and body.exception_type not in EXCEPTION_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid exception_type. Valid: {list(EXCEPTION_TYPES.keys())}",
        )

    # Get user's organization for multi-tenant isolation
    org = get_user_primary_organization(session, current_user.id)
    if not org:
        raise HTTPException(
            status_code=400, detail="You must belong to an organization"
        )

    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # CRITICAL: Check organization_id for multi-tenant isolation
    if doc.organization_id != org.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    session.refresh(doc)

    if not doc.reconciliation_result:
        raise HTTPException(
            status_code=422, detail="Run reconciliation before reviewing"
        )

    recon = doc.reconciliation_result
    proof = recon.get("proof", {})
    fx_result = recon.get("fx_result")
    match_scores = recon.get("match_scores", [])
    best_idx = recon.get("best_candidate_index")
    agent_decision = recon.get("agent_decision", {})

    # Get best score - prioritize from agent_decision if available
    best_score = None
    if best_idx is not None and match_scores:
        best_score = match_scores[best_idx]
    elif agent_decision and agent_decision.get("matched_entry_index") is not None:
        matched_idx = agent_decision.get("matched_entry_index")
        if match_scores and 0 <= matched_idx < len(match_scores):
            best_score = match_scores[matched_idx]

    confidence = agent_decision.get("confidence", 0.0)

    # Calculate risk score - if document already has a risk score and status is approved, preserve it
    if doc.workflow_status == "APPROVED" and doc.risk_score is not None and body.action == "approved":
        # Preserve existing risk score for already-approved documents being re-approved
        risk_score = doc.risk_score
        risk_factors = doc.reconciliation_result.get("risk_factors", {})
    else:
        # Calculate new risk score
        risk_score, risk_factors = calculate_risk_score(match_scores, best_score)

    # Determine risk level
    if risk_score >= 70:
        risk_level = "HIGH"
    elif risk_score >= 40:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # Generate AI explanation
    ai_explanation = await _generate_ai_explanation(
        action=body.action,
        proof=proof,
        match_scores=match_scores,
        best_score=best_score,
        note=body.note,
        exception_type=body.exception_type,
    )

    # Generate journal entry for approved/exception
    journal_entry = None
    if body.action in ("approved", "exception"):
        journal_entry = generate_journal_entry(
            proof, fx_result, body.action, body.exception_type
        )

    # Generate case ID for flagged
    case_id = generate_case_id() if body.action == "flagged" else None

    # Create immutable audit record
    record = ReconciliationRecord(
        document_id=document_id,
        organization_id=org.id,  # CRITICAL: Tenant isolation
        reviewed_by=current_user.id,
        confidence=confidence,
        risk_score=risk_score,
        risk_level=risk_level,
        fx_rate=fx_result["rate"] if fx_result else None,
        normalized_amount_myr=fx_result["to_amount"]
        if fx_result
        else proof.get("amount"),
        action=body.action,
        exception_type=body.exception_type,
        note=body.note,
        ai_explanation=ai_explanation,
        case_id=case_id,
        assigned_to="finance@company.com" if body.action == "flagged" else None,
        priority=body.priority if body.action == "flagged" else None,
        risk_factors=risk_factors,
        journal_entry=journal_entry,
    )
    session.add(record)

    # Update document workflow status (but NEVER overwrite ai_result)
    doc.workflow_status = WORKFLOW_STATUS_MAP[body.action]
    doc.review_status = body.action
    doc.review_note = body.note
    doc.reviewed_at = datetime.now(timezone.utc)
    doc.reviewed_by = current_user.id
    doc.exception_type = body.exception_type
    doc.case_id = case_id
    doc.risk_score = risk_score
    doc.risk_level = risk_level
    flag_modified(doc, "reconciliation_result")
    session.add(doc)
    session.commit()
    session.refresh(record)

    return ReconciliationRecordPublic.model_validate(record)


@router.get(
    "/{document_id}/audit-trail", response_model=list[ReconciliationRecordPublic]
)
def get_audit_trail(
    document_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
):
    """Return all review records for a document — full audit trail."""
    from sqlmodel import select

    from app.utils.org_context import get_user_primary_organization

    # Get user's organization for multi-tenant isolation
    org = get_user_primary_organization(session, current_user.id)
    if not org:
        raise HTTPException(
            status_code=400, detail="You must belong to an organization"
        )

    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # CRITICAL: Check organization_id for multi-tenant isolation
    if doc.organization_id != org.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # CRITICAL: Filter records by organization_id
    records = session.exec(
        select(ReconciliationRecord)
        .where(ReconciliationRecord.document_id == document_id)
        .where(ReconciliationRecord.organization_id == org.id)
        .order_by(ReconciliationRecord.created_at)
    ).all()

    return [ReconciliationRecordPublic.model_validate(r) for r in records]


@router.post("/{document_id}/ask-ai")
async def ask_ai_question(
    document_id: uuid.UUID,
    body: AskAIRequest,
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

    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # CRITICAL: Check organization_id for multi-tenant isolation
    if doc.organization_id != org.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    session.refresh(doc)

    recon = doc.reconciliation_result or {}
    proof = recon.get("proof", {})
    match_scores = recon.get("match_scores", [])
    best_idx = recon.get("best_candidate_index")
    best_score = (
        match_scores[best_idx] if best_idx is not None and match_scores else None
    )
    agent_decision = recon.get("agent_decision", {})

    context = f"""Document: {doc.original_filename}
Payment: {proof.get("currency")} {proof.get("amount")} from {proof.get("payer")} on {proof.get("date")}
AI verdict: {agent_decision.get("final_status")} (confidence: {agent_decision.get("confidence", 0) * 100:.0f}%)
Best match score: {best_score}
Agent explanation: {agent_decision.get("explanation")}
Risk score: {doc.risk_score}"""

    prompts = {
        "Why is this flagged?": f"""A financial reconciliation is flagged as {agent_decision.get("final_status", "unmatched")}.

{context}

Explain in 3-4 sentences WHY this specific transaction is problematic. Be concrete with the numbers. Use plain text.""",
        "What should I do?": f"""A treasury operator needs guidance on how to handle this reconciliation.

{context}

Give 3 specific, actionable steps they should take RIGHT NOW. Be practical. Use plain text.""",
        "Show risk analysis": f"""Perform a detailed risk analysis of this reconciliation.

{context}

Cover: (1) what the numbers tell us, (2) the probability this is a legitimate transaction, (3) what fraud or error patterns this resembles if any. Use plain text.""",
    }

    prompt = prompts.get(
        body.question,
        f"Answer this question about the reconciliation: {body.question}\n\n{context}",
    )

    try:
        answer = await _call_morpheus(
            [
                {
                    "role": "system",
                    "content": "You are a financial risk AI for a treasury operations platform. Be concise, specific, and professional.",
                },
                {"role": "user", "content": prompt},
            ]
        )
    except Exception as e:
        answer = f"AI temporarily unavailable: {str(e)}"

    return {"question": body.question, "answer": answer}
