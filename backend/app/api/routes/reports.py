from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.deps import CurrentUser, SessionDep
from app.models import User, Organization
from app.report_generator import generate_reconciliation_report

router = APIRouter(prefix="/reports", tags=["reports"])


class GenerateReportRequest(BaseModel):
    results: list[dict]
    include_summary: bool = True
    include_details: bool = True


@router.post("/reconciliation-pdf")
async def generate_reconciliation_pdf_report(
    body: GenerateReportRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> Response:

    # Get user's organization name
    user = session.get(User, current_user.id)
    organization_name = "Unknown Organization"

    if user and user.organization_id:
        org = session.get(Organization, user.organization_id)
        if org:
            organization_name = org.name

    # Generate report
    try:
        pdf_bytes = generate_reconciliation_report(
            results=body.results,
            organization_name=organization_name,
            generated_by=user.full_name or user.email if user else "Unknown User",
            include_summary=body.include_summary,
            include_details=body.include_details,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate PDF report: {str(e)}",
        )

    # Return PDF as downloadable file
    filename = (
        f"reconciliation-report-{current_user.id}-{int(__import__('time').time())}.pdf"
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/pdf",
        },
    )


@router.post("/reconciliation-pdf-preview")
async def preview_reconciliation_pdf_report(
    body: GenerateReportRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> Response:

    # Get user's organization name
    user = session.get(User, current_user.id)
    organization_name = "Unknown Organization"

    if user and user.organization_id:
        org = session.get(Organization, user.organization_id)
        if org:
            organization_name = org.name

    # Generate report
    try:
        pdf_bytes = generate_reconciliation_report(
            results=body.results,
            organization_name=organization_name,
            generated_by=user.full_name or user.email if user else "Unknown User",
            include_summary=body.include_summary,
            include_details=body.include_details,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate PDF report: {str(e)}",
        )

    # Return PDF for inline display
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "inline",
            "Content-Type": "application/pdf",
        },
    )
