"""
Orchestrated Reconciliation API: Uses AI orchestration agent (Chutes AI + AWS Bedrock fallback)
to dynamically coordinate the reconciliation workflow.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    BankEntry,
    Document,
    Organization,
    ReconciliationRecord,
    User,
)
from app.orchestration_agent import orchestrate_reconciliation
from app.risk import generate_journal_entry

router = APIRouter(prefix="/orchestrated-reconciliation", tags=["orchestration"])


class OrchestratedReconcileRequest(BaseModel):
    """Request to reconcile a document using the orchestration agent."""

    document_id: uuid.UUID
    bank_entries: list[BankEntry]
    override_date: str | None = None  # Override FX date if needed


class OrchestratedReconcileResponse(BaseModel):
    """Response from orchestrated reconciliation."""

    document_id: uuid.UUID
    success: bool
    final_decision: dict
    context: dict
    iterations: int
    message: str


def get_user_base_currency(session: SessionDep, user_id: uuid.UUID) -> str:
    """Get the base currency for a user's organization. Defaults to MYR."""
    user = session.get(User, user_id)
    if not user or not user.organization_id:
        return "MYR"

    org = session.get(Organization, user.organization_id)
    if not org:
        return "MYR"

    return org.base_currency


@router.post("/reconcile", response_model=OrchestratedReconcileResponse)
async def orchestrated_reconcile(
    body: OrchestratedReconcileRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    """
    Reconcile a document using the AI orchestration agent (Chutes AI + AWS Bedrock fallback).

    The agent will:
    1. Analyze the context and decide what information it needs
    2. Extract document data if necessary
    3. Convert currencies if needed
    4. Fetch vendor history and learned patterns strategically
    5. Choose the appropriate reconciliation strategy
    6. Calculate risk and make auto-approval decisions
    7. Return a comprehensive reconciliation result

    This is more intelligent than the standard reconciliation endpoint because
    the agent makes contextual decisions rather than following a fixed workflow.

    Provider Strategy:
    - Primary: Chutes AI (Claude Sonnet 4.6)
    - Fallback: AWS Bedrock (on timeout/rate limit)
    """
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

    base_currency = get_user_base_currency(session, current_user.id)

    # Run the orchestration agent
    try:
        result = await orchestrate_reconciliation(
            document_id=body.document_id,
            session=session,
            organization_id=org.id,
            base_currency=base_currency,
            bank_entries=[e.model_dump() for e in body.bank_entries],
            extracted_data=doc.extracted_data,  # Pass existing data if available
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Orchestration failed: {str(e)}")

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Orchestration failed without error message"),
        )

    final_decision = result["final_decision"]
    context = result["context"]

    # Update document with orchestration results
    doc.orchestration_result = result  # Store full orchestration result
    doc.extracted_data = context.get("extracted_data") or doc.extracted_data
    flag_modified(doc, "orchestration_result")
    flag_modified(doc, "extracted_data")

    # Map orchestration decision to our workflow
    status = final_decision.get("status", "unmatched")
    confidence = final_decision.get("confidence", 0.0)
    auto_approve = final_decision.get("auto_approve", False)
    risk_level = final_decision.get("risk_level", "MEDIUM")
    explanation = final_decision.get("explanation", "")

    # Set AI Result (immutable - never overwritten by human action)
    if status == "matched":
        doc.ai_result = "MATCHED"
    elif status == "matched_with_adjustment":
        doc.ai_result = "MATCHED"  # Still count as matched
    elif status == "fuzzy":
        doc.ai_result = "FUZZY_MATCH"
    elif status == "error":
        doc.ai_result = "UNMATCHED"
    else:
        doc.ai_result = "UNMATCHED"

    doc.ai_confidence = confidence
    doc.ai_explanation = explanation

    # ── ML Decision Agent: auto-approval + risk assessment ───────────────────
    from app.decision_agent import make_decision, DecisionContext, MatchScores
    from app.models import Membership
    from sqlmodel import select as sql_select

    risk_assessment = context.get("risk_assessment", {})

    # Build match scores from orchestration context
    recon_result = context.get("reconciliation_result", {})
    orch_match_scores = recon_result.get("match_scores", [])
    orch_agent_decision = recon_result.get("agent_decision", {})
    best_idx = final_decision.get("matched_entry_index") or orch_agent_decision.get(
        "matched_entry_index"
    )
    best_score_dict = (
        orch_match_scores[best_idx]
        if best_idx is not None and best_idx < len(orch_match_scores)
        else {}
    )
    matched_entry = (
        body.bank_entries[best_idx].model_dump()
        if best_idx is not None and best_idx < len(body.bank_entries)
        else None
    )
    amount_diff_pct = best_score_dict.get("amount_diff_pct", 100)

    # Get user's membership role for governance logging
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

    vendor_history = context.get("vendor_history", [])
    learned_patterns = context.get("learned_patterns", [])

    decision_ctx = DecisionContext(
        document_id=str(body.document_id),
        org_id=org.id,
        triggered_by=str(current_user.id),
        role=user_role,
        extracted_data=context.get("extracted_data", {}),
        matched_bank_entry=matched_entry,
        match_scores=MatchScores(
            amount_match=max(0.0, min(1.0, 1.0 - amount_diff_pct / 100.0)),
            date_diff_days=best_score_dict.get("days_apart", 999),
            payer_similarity=best_score_dict.get("payer_similarity", 0.0),
            overall_score=best_score_dict.get("score", 0.0),
        ),
        base_currency=base_currency,
        vendor_history=vendor_history if isinstance(vendor_history, list) else [],
        learned_patterns=learned_patterns if isinstance(learned_patterns, list) else [],
        reconciliation_status=status,
        adjustment_type=final_decision.get("adjustment_type"),
    )

    decision_result = await make_decision(decision_ctx)

    # Persist risk assessment regardless of approval outcome
    doc.risk_score = decision_result.risk_score
    doc.risk_level = decision_result.risk_level

    if decision_result.auto_approve:
        adjustment_type = final_decision.get("adjustment_type")
        journal_entry_proposal = final_decision.get("journal_entry_proposal")

        if status == "matched_with_adjustment" and journal_entry_proposal:
            journal_entry = journal_entry_proposal
            exception_type = (
                adjustment_type.upper() if adjustment_type else "ADJUSTMENT"
            )
            action = "exception"
            note = (
                f"Auto-approved by orchestration + decision agent with "
                f"{adjustment_type} adjustment "
                f"({final_decision.get('adjustment_amount', 0)} {base_currency}) "
                f"[decision_id={decision_result.decision_id}]"
            )
        else:
            fx_result_ctx = context.get("fx_result")
            proof_ctx = context.get("extracted_data", {})
            journal_entry = generate_journal_entry(
                proof_ctx, fx_result_ctx, "approved", None
            )
            exception_type = None
            action = "approved"
            note = (
                f"Auto-approved by orchestration + decision agent "
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
            fx_rate=context.get("fx_result", {}).get("rate")
            if context.get("fx_result")
            else None,
            normalized_amount_myr=(
                context.get("fx_result", {}).get("to_amount")
                if context.get("fx_result")
                else context.get("extracted_data", {}).get("amount")
            ),
            base_currency=base_currency,
            base_amount=(
                context.get("fx_result", {}).get("to_amount")
                if context.get("fx_result")
                else context.get("extracted_data", {}).get("amount")
            ),
            action=action,
            exception_type=exception_type,
            note=note,
            ai_explanation=(
                f"{explanation}\n\nDecision Agent: {decision_result.reasoning}"
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

    session.add(doc)
    session.commit()
    session.refresh(doc)

    return OrchestratedReconcileResponse(
        document_id=body.document_id,
        success=True,
        final_decision=final_decision,
        context=context,
        iterations=result["iterations"],
        message=final_decision.get("suggested_action", "Reconciliation completed"),
    )


@router.get("/status/{document_id}")
async def get_orchestration_status(
    document_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
):
    """
    Get the orchestration status and results for a document.
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

    if not doc.orchestration_result:
        return {
            "document_id": document_id,
            "has_orchestration": False,
            "message": "Document has not been processed by orchestration agent yet",
        }

    return {
        "document_id": document_id,
        "has_orchestration": True,
        "orchestration_result": doc.orchestration_result,
        "workflow_status": doc.workflow_status,
        "ai_result": doc.ai_result,
        "ai_confidence": doc.ai_confidence,
        "ai_explanation": doc.ai_explanation,
        "risk_level": doc.risk_level,
        "risk_score": doc.risk_score,
    }
