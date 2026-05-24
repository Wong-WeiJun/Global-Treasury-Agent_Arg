import uuid

import boto3
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.extraction import extract_from_image, extract_from_pdf
from app.fx import convert
from app.models import Document, Organization, ReconcileRequest, ReconcileResponse, User
from app.reconciliation import reconcile

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
            aws_access_key_id=settings.s3_access_key_id.get_secret_value()
            if settings.s3_access_key_id
            else None,
            aws_secret_access_key=settings.s3_secret_access_key.get_secret_value()
            if settings.s3_secret_access_key
            else None,
        )
        obj = s3.get_object(Bucket=settings.s3_bucket_name, Key=doc.s3_key)
        file_bytes = obj["Body"].read()

        try:
            if doc.file_type == "image":
                data = extract_from_image(file_bytes)
            elif doc.file_type == "pdf":
                data = extract_from_pdf(file_bytes)
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

    result = await reconcile(
        proof=proof,
        bank_entries=[e.model_dump() for e in body.bank_entries],
        fx_result=fx_result,
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
    elif final_status == "fuzzy":
        doc.ai_result = "FUZZY_MATCH"
    else:
        doc.ai_result = "UNMATCHED"

    doc.ai_confidence = agent_decision.get("confidence", 0.0)
    doc.ai_explanation = agent_decision.get("explanation", "")

    # Auto-approve if AI result is MATCHED
    if doc.ai_result == "MATCHED":
        from datetime import datetime, timezone

        from app.models import ReconciliationRecord
        from app.risk import calculate_risk_score, generate_journal_entry

        # Calculate risk
        match_scores = result.get("match_scores", [])
        best_idx = result.get("best_candidate_index")
        best_score = (
            match_scores[best_idx] if best_idx is not None and match_scores else None
        )
        risk_score, risk_factors = calculate_risk_score(match_scores, best_score)

        if risk_score >= 70:
            risk_level = "HIGH"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        # Generate journal entry
        fx_result = result.get("fx_result")
        proof = result.get("proof", {})
        journal_entry = generate_journal_entry(proof, fx_result, "approved", None)

        # Create audit record for auto-approval
        record = ReconciliationRecord(
            document_id=doc.id,
            organization_id=doc.organization_id,
            reviewed_by=current_user.id,
            confidence=doc.ai_confidence,
            risk_score=risk_score,
            risk_level=risk_level,
            fx_rate=fx_result["rate"] if fx_result else None,
            normalized_amount_myr=fx_result["to_amount"]
            if fx_result
            else proof.get("amount"),
            action="approved",
            exception_type=None,
            note="Auto-approved by AI with high confidence match",
            ai_explanation=f"Auto-approved: {doc.ai_explanation}",
            case_id=None,
            assigned_to=None,
            priority=None,
            risk_factors=risk_factors,
            journal_entry=journal_entry,
        )
        session.add(record)

        # Set workflow to approved
        doc.workflow_status = "APPROVED"
        doc.review_status = "approved"
        doc.review_note = "Auto-approved by AI"
        doc.reviewed_at = datetime.now(timezone.utc)
        doc.reviewed_by = current_user.id
        doc.risk_score = risk_score
        doc.risk_level = risk_level
    else:
        # Fuzzy or unmatched - needs human review
        doc.workflow_status = "PENDING_ACTION"

    flag_modified(doc, "reconciliation_result")
    session.add(doc)
    session.commit()
    session.refresh(doc)

    return ReconcileResponse(document_id=body.document_id, result=result)
