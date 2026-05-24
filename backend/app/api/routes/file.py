import uuid
from datetime import datetime, timezone
from typing import cast

import boto3
from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import desc
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.extraction import extract_from_excel, extract_from_image, extract_from_pdf
from app.file_utils import delete_document, upload_document
from app.fx import convert
from app.models import (
    Document,
    DocumentPublic,
    DocumentsPublic,
    ExtractedData,
    ExtractionResponse,
    Organization,
    UploadResponse,
)

router = APIRouter(prefix="/files", tags=["files"])


def get_user_base_currency(session: SessionDep, user_id: uuid.UUID) -> str:
    """Get the base currency for a user's organization. Defaults to MYR."""
    from app.models import User

    user = session.get(User, user_id)
    if not user or not user.organization_id:
        return "MYR"

    org = session.get(Organization, user.organization_id)
    if not org:
        return "MYR"

    return org.base_currency


ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def get_file_type(content_type: str) -> str:
    if content_type in ("image/jpeg", "image/png"):
        return "image"
    elif content_type == "application/pdf":
        return "pdf"
    else:
        return "excel"


@router.get("/presigned-url")
def generate_presigned_url(
    filename: str,
    current_user: CurrentUser,
):
    s3 = boto3.client("s3", region_name=settings.s3_region)
    object_key = f"dev/org_{current_user.id}/inbound/{filename}"
    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.s3_bucket_name,
                "Key": object_key,
                "ContentType": "image/jpeg",
            },
            ExpiresIn=300,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"url": url, "object_key": object_key}


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    current_user: CurrentUser,
    session: SessionDep,
    file: UploadFile = File(...),
):
    from app.utils.org_context import get_user_primary_organization

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415, detail=f"Unsupported file type: {file.content_type}"
        )

    contents = await file.read()

    if len(contents) > settings.max_upload_size_bytes:
        raise HTTPException(status_code=413, detail="File too large")

    # Get user's organization for multi-tenant isolation
    org = get_user_primary_organization(session, current_user.id)
    if not org:
        raise HTTPException(
            status_code=400,
            detail="You must belong to an organization to upload documents",
        )

    try:
        s3_key = await upload_document(
            file_bytes=contents,
            original_filename=file.filename or "upload",
            org_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    doc = Document(
        owner_id=current_user.id,
        organization_id=org.id,
        original_filename=file.filename or "upload",
        s3_key=s3_key,
        file_type=get_file_type(file.content_type),
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)

    return UploadResponse(document=DocumentPublic.model_validate(doc))


@router.get("/my-documents", response_model=DocumentsPublic)
def list_my_documents(
    current_user: CurrentUser,
    session: SessionDep,
    skip: int = 0,
    limit: int = 20,
):
    from app.utils.org_context import get_user_primary_organization

    # Get user's current organization for multi-tenant isolation
    org = get_user_primary_organization(session, current_user.id)
    if not org:
        return DocumentsPublic(data=[], count=0)

    # CRITICAL: Filter by organization_id for multi-tenant isolation
    count = session.exec(
        select(func.count()).where(Document.organization_id == org.id)
    ).one()

    docs = session.exec(
        select(Document)
        .where(Document.organization_id == org.id)
        .order_by(desc(cast(ColumnElement, Document.uploaded_at)))
        .offset(skip)
        .limit(limit)
    ).all()

    return DocumentsPublic(
        data=[DocumentPublic.model_validate(d) for d in docs],
        count=count,
    )


# @router.delete("/delete")
# async def delete_file(
#     s3_key: str,
#     current_user: CurrentUser,
# ):
#     if f"org_{current_user.id}" not in s3_key:
#         raise HTTPException(
#             status_code=403, detail="Not authorized to delete this file"
#         )
#
#     await delete_document(s3_key)
#     return {"message": "Deleted successfully"}
#
@router.delete("/{document_id}")
async def delete_file(
    document_id: uuid.UUID,
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

    await delete_document(doc.s3_key)
    session.delete(doc)
    session.commit()

    return {"message": "Deleted successfully"}


@router.get("/{document_id}/download-url")
def get_download_url(
    document_id: uuid.UUID,
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
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": doc.s3_key},
        ExpiresIn=300,
    )
    return {"url": url, "filename": doc.original_filename}


@router.post("/{document_id}/extract", response_model=ExtractionResponse)
async def extract_document(
    document_id: uuid.UUID,
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

    # Tip: You could import _get_s3_client from app.file_utils to avoid repeating this!
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

    data = None

    try:
        if doc.file_type == "excel":
            rows = extract_from_excel(file_bytes, doc.original_filename)
            converted_rows = []
            base_currency = get_user_base_currency(session, current_user.id)

            for row in rows:
                if row.get("amount") and row.get("currency"):
                    fx_date = row.get("date") or "latest"
                    fx = await convert(
                        amount=row["amount"],
                        from_currency=row["currency"],
                        to_currency=base_currency,
                        on_date=fx_date,
                    )
                    row["myr_amount"] = fx["to_amount"]  # Legacy field
                    row["fx_rate"] = fx["rate"]
                    row["base_currency"] = base_currency
                    row["base_amount"] = fx["to_amount"]
                    row["fx_rate_date"] = fx_date if fx_date != "latest" else None
                converted_rows.append(row)

            # For Excel with single row, populate document-level currency fields
            if len(converted_rows) == 1:
                first_row = converted_rows[0]
                doc.original_amount = first_row.get("amount")
                doc.original_currency = first_row.get("currency", "MYR")
                doc.transaction_date = first_row.get("date")
                doc.base_amount = first_row.get("base_amount")
                doc.base_currency = base_currency
                doc.fx_rate_used = first_row.get("fx_rate")
                doc.fx_rate_date = first_row.get("fx_rate_date")
                doc.fx_rate_timestamp = datetime.now(timezone.utc)

            doc.extracted_data = {"rows": converted_rows}
            doc.workflow_status = "EXTRACTED"
            flag_modified(doc, "extracted_data")  # ← add this
            session.add(doc)
            session.commit()

            return ExtractionResponse(
                document_id=document_id,
                rows=[ExtractedData(**r) for r in converted_rows],
            )

        elif doc.file_type == "image":
            data = extract_from_image(file_bytes)
        elif doc.file_type == "pdf":
            data = extract_from_pdf(file_bytes)
        else:
            return ExtractionResponse(
                document_id=document_id, error="Unsupported file type"
            )

        if data:
            # Multi-Currency Architecture
            # 1. Store Original Currency (what customer paid - NEVER overwrite)
            doc.original_amount = data.get("amount")
            doc.original_currency = data.get("currency") or "MYR"
            doc.transaction_date = data.get("date")

            # 2. Convert to Base Currency (for reconciliation)
            if data.get("amount") and data.get("currency"):
                base_currency = get_user_base_currency(session, current_user.id)
                fx_date = data.get("date") or "latest"

                fx_result = await convert(
                    amount=data["amount"],
                    from_currency=data["currency"],
                    to_currency=base_currency,
                    on_date=fx_date,
                )

                # Store base currency fields
                doc.base_amount = fx_result["to_amount"]
                doc.base_currency = base_currency
                doc.fx_rate_used = fx_result["rate"]
                doc.fx_rate_date = fx_date if fx_date != "latest" else None
                doc.fx_rate_timestamp = datetime.now(timezone.utc)

                # Keep legacy fields for backward compatibility
                data["myr_amount"] = fx_result["to_amount"]
                data["fx_rate"] = fx_result["rate"]

            doc.extracted_data = data
            doc.workflow_status = "EXTRACTED"
            flag_modified(doc, "extracted_data")  # ← add this
            session.add(doc)
            session.commit()
            session.refresh(doc)

            return ExtractionResponse(
                document_id=document_id, extracted=ExtractedData(**data)
            )

        return ExtractionResponse(
            document_id=document_id, error="No data could be extracted"
        )

    except Exception as e:
        return ExtractionResponse(document_id=document_id, error=str(e))
