import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.ai_learning import (
    record_user_correction,
    get_learned_vendor_preferences,
    get_learned_patterns,
    get_correction_history,
)
from app.api.deps import CurrentUser, SessionDep
from app.models import Document
from app.utils.org_context import get_user_primary_organization

router = APIRouter(prefix="/learning", tags=["learning"])


class CorrectionRequest(BaseModel):
    """Request to record a user correction for AI learning."""

    document_id: uuid.UUID
    user_decision: str  # "matched" | "rejected" | "exception"
    user_matched_index: int | None = None
    user_note: str | None = None


class CorrectionResponse(BaseModel):
    """Response after recording a correction."""

    correction_id: uuid.UUID
    learned_patterns: list[str]  # Types of patterns learned
    message: str


class VendorPreferencePublic(BaseModel):
    """Public representation of a learned vendor preference."""

    id: uuid.UUID
    canonical_vendor_name: str
    vendor_aliases: list[str] | None
    typical_amount_range: dict | None
    is_recurring: bool
    learned_from_count: int
    confidence: float


class ReconciliationPatternPublic(BaseModel):
    """Public representation of a learned reconciliation pattern."""

    id: uuid.UUID
    pattern_type: str
    pattern_name: str
    pattern_rule: dict | None
    learned_from_count: int
    success_rate: float


class LearningInsightsResponse(BaseModel):
    """Learning insights for an organization."""

    vendor_preferences: list[VendorPreferencePublic]
    reconciliation_patterns: list[ReconciliationPatternPublic]
    total_corrections: int


@router.post("/record-correction", response_model=CorrectionResponse)
async def record_correction(
    body: CorrectionRequest,
    current_user: CurrentUser,
    session: SessionDep,
):

    # Get user's organization for multi-tenant isolation
    org = get_user_primary_organization(session, current_user.id)
    if not org:
        raise HTTPException(
            status_code=400, detail="You must belong to an organization"
        )

    # Fetch the document
    doc = session.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # CRITICAL: Check organization_id for multi-tenant isolation
    if doc.organization_id != org.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Ensure we have reconciliation data to learn from
    if not doc.reconciliation_result:
        raise HTTPException(
            status_code=400,
            detail="Document has no reconciliation result to learn from",
        )

    # Extract reconciliation data
    recon_result = doc.reconciliation_result
    agent_decision = recon_result.get("agent_decision", {})

    ai_prediction = agent_decision.get("final_status", "unmatched")
    ai_confidence = agent_decision.get("confidence", 0.0)
    ai_matched_index = agent_decision.get("matched_entry_index")

    proof_data = recon_result.get("proof", {})
    bank_entries = recon_result.get("bank_entries", [])
    match_scores = recon_result.get("match_scores", [])

    # Record the correction
    correction = await record_user_correction(
        session=session,
        organization_id=org.id,
        user_id=current_user.id,
        document_id=body.document_id,
        ai_prediction=ai_prediction,
        ai_confidence=ai_confidence,
        ai_matched_index=ai_matched_index,
        user_decision=body.user_decision,
        user_matched_index=body.user_matched_index,
        user_note=body.user_note,
        proof_data=proof_data,
        bank_entries=bank_entries,
        match_scores=match_scores,
    )

    # Identify what was learned
    learned_patterns = []
    if correction.correction_type:
        learned_patterns.append(correction.correction_type)

    message = "Correction recorded successfully. "
    if learned_patterns:
        message += f"AI learned: {', '.join(learned_patterns)}. "
    message += "Future reconciliations will use this knowledge."

    return CorrectionResponse(
        correction_id=correction.id,
        learned_patterns=learned_patterns,
        message=message,
    )


@router.get("/insights", response_model=LearningInsightsResponse)
async def get_learning_insights(
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

    # Fetch learned vendor preferences
    vendor_prefs = await get_learned_vendor_preferences(session, org.id)
    vendor_prefs_public = [
        VendorPreferencePublic(
            id=vp.id,
            canonical_vendor_name=vp.canonical_vendor_name,
            vendor_aliases=vp.vendor_aliases or [],
            typical_amount_range=vp.typical_amount_range,
            is_recurring=vp.is_recurring,
            learned_from_count=vp.learned_from_count,
            confidence=vp.confidence,
        )
        for vp in vendor_prefs
    ]

    # Fetch learned reconciliation patterns
    recon_patterns = await get_learned_patterns(session, org.id)
    recon_patterns_public = [
        ReconciliationPatternPublic(
            id=rp.id,
            pattern_type=rp.pattern_type,
            pattern_name=rp.pattern_name,
            pattern_rule=rp.pattern_rule,
            learned_from_count=rp.learned_from_count,
            success_rate=rp.success_rate,
        )
        for rp in recon_patterns
    ]

    # Get total correction count
    corrections = await get_correction_history(session, org.id, limit=1000)

    return LearningInsightsResponse(
        vendor_preferences=vendor_prefs_public,
        reconciliation_patterns=recon_patterns_public,
        total_corrections=len(corrections),
    )


@router.get("/correction-history")
async def get_corrections(
    current_user: CurrentUser,
    session: SessionDep,
    limit: int = 20,
):
    from app.utils.org_context import get_user_primary_organization

    # Get user's organization for multi-tenant isolation
    org = get_user_primary_organization(session, current_user.id)
    if not org:
        raise HTTPException(
            status_code=400, detail="You must belong to an organization"
        )

    corrections = await get_correction_history(session, org.id, limit=limit)

    return {
        "corrections": [
            {
                "id": str(c.id),
                "document_id": str(c.document_id),
                "ai_prediction": c.ai_prediction,
                "ai_confidence": c.ai_confidence,
                "user_decision": c.user_decision,
                "correction_type": c.correction_type,
                "created_at": c.created_at.isoformat(),
            }
            for c in corrections
        ],
        "count": len(corrections),
    }
