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
from app.extraction import (
    extract_from_excel,
    _call_bedrock_excel,
    _ocr_with_textract,
)
from app.ai_insights import (
    analyze_document_with_intelligence,
    check_for_duplicates,
)
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
        aws_access_key_id=settings.aws_access_key_id.get_secret_value()
        if settings.aws_access_key_id
        else None,
        aws_secret_access_key=settings.aws_secret_access_key.get_secret_value()
        if settings.aws_secret_access_key
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
        aws_access_key_id=settings.aws_access_key_id.get_secret_value()
        if settings.aws_access_key_id
        else None,
        aws_secret_access_key=settings.aws_secret_access_key.get_secret_value()
        if settings.aws_secret_access_key
        else None,
    )
    obj = s3.get_object(Bucket=settings.s3_bucket_name, Key=doc.s3_key)
    file_bytes = obj["Body"].read()

    data = None

    try:
        if doc.file_type == "excel":
            # 1. Transform spreadsheet to optimized raw text payload
            raw_csv_text = extract_from_excel(file_bytes, doc.original_filename)

            if not raw_csv_text:
                return ExtractionResponse(
                    document_id=document_id, error="File is empty"
                )

            # 2. Extract structured fields from the raw layout using Claude
            rows = _call_bedrock_excel(raw_csv_text)

            if not rows:
                return ExtractionResponse(
                    document_id=document_id, error="AI could not map the data"
                )

            converted_rows = []
            base_currency = get_user_base_currency(session, current_user.id)

            # Keep track of the first row's FX date metadata for the document level fallback
            first_row_fx_date = None

            # 3. Process currency conversion and strictly align schemas
            for row in rows:
                myr_amount = None
                fx_rate = None

                if row.get("amount") and row.get("currency"):
                    fx_date = row.get("date") or "latest"

                    fx = await convert(
                        amount=row["amount"],
                        from_currency=row["currency"],
                        to_currency=base_currency,
                        on_date=fx_date,
                    )
                    myr_amount = fx["to_amount"]
                    fx_rate = fx["rate"]

                    if not first_row_fx_date:
                        first_row_fx_date = fx_date if fx_date != "latest" else None

                # Build a dictionary strictly matching the ExtractedData fields
                cleaned_row = {
                    "amount": row.get("amount"),
                    "currency": row.get("currency"),
                    "date": row.get("date"),
                    "payer": row.get("payer"),
                    "payee": row.get("payee"),
                    "description": row.get("description"),
                    "myr_amount": myr_amount,
                    "fx_rate": fx_rate,
                }
                converted_rows.append(cleaned_row)

            # Transform raw rows into validated Pydantic model objects
            rows_list = [ExtractedData(**r) for r in converted_rows]
            extracted_single = None

            # 4. Handle Document-level stats and single-row alignment
            if len(converted_rows) > 0:
                first_row = converted_rows[0]

                # If single row, match perfectly. If multi-row, aggregate the sum of your totals
                total_amount = (
                    sum(r.get("amount") or 0.0 for r in converted_rows)
                    if len(converted_rows) > 1
                    else first_row.get("amount")
                )
                total_base_amount = (
                    sum(r.get("myr_amount") or 0.0 for r in converted_rows)
                    if len(converted_rows) > 1
                    else first_row.get("myr_amount")
                )

                doc.original_amount = total_amount
                doc.original_currency = first_row.get("currency", "MYR")
                doc.transaction_date = first_row.get("date")
                doc.base_amount = total_base_amount
                doc.base_currency = base_currency
                doc.fx_rate_used = first_row.get("fx_rate")
                doc.fx_rate_date = first_row_fx_date
                doc.fx_rate_timestamp = datetime.now(timezone.utc)

                # ALWAYS populate extracted field for single row items to preserve your layout format
                if len(converted_rows) == 1:
                    extracted_single = rows_list[0]

            # Standardize AI scoring tracking properties so downstream workflows don't crash
            if len(converted_rows) == 1:
                doc.extracted_data = converted_rows[0]
            else:
                doc.extracted_data = {"rows": converted_rows}
            doc.ai_result = "MATCHED"
            doc.ai_confidence = 0.95
            doc.ai_explanation = (
                f"Spreadsheet parsed. Total items processed: {len(converted_rows)}."
            )

            doc.workflow_status = "EXTRACTED"
            flag_modified(doc, "extracted_data")
            session.add(doc)
            session.commit()

            # 5. Cleanly pass dynamic responses to fit your target ExtractionResponse schema
            return ExtractionResponse(
                document_id=document_id,
                extracted=extracted_single,
                rows=rows_list,
                error=None,
            )

        elif doc.file_type == "image":
            # Get recent documents for duplicate detection
            recent_docs = session.exec(
                select(Document)
                .where(
                    Document.organization_id == org.id,
                    Document.extracted_data.isnot(None),
                )
                .order_by(desc(cast(ColumnElement, Document.uploaded_at)))
                .limit(20)
            ).all()

            recent_context = [
                {
                    "id": str(d.id),
                    "date": d.extracted_data.get("date") if d.extracted_data else None,
                    "payee": d.extracted_data.get("payee")
                    if d.extracted_data
                    else None,
                    "amount": d.extracted_data.get("amount")
                    if d.extracted_data
                    else None,
                    "currency": d.extracted_data.get("currency")
                    if d.extracted_data
                    else None,
                    "description": d.extracted_data.get("description")
                    if d.extracted_data
                    else None,
                }
                for d in recent_docs
            ]

            # Use enhanced AI insights extraction
            ocr_result = _ocr_with_textract(file_bytes)
            raw_text = ocr_result["raw_text"]

            data = await analyze_document_with_intelligence(
                image_bytes=file_bytes,
                ocr_hint=raw_text,
                media_type="image/jpeg",
                historical_context=recent_context,
            )

            # Check for duplicates using the AI insights
            duplicate_check = await check_for_duplicates(
                extracted_data=data,
                recent_documents=recent_context,
                time_window_hours=72,
            )

            # Add duplicate detection results to the extracted data
            data["duplicate_detection"] = duplicate_check

        elif doc.file_type == "pdf":
            # Get recent documents for duplicate detection
            recent_docs = session.exec(
                select(Document)
                .where(
                    Document.organization_id == org.id,
                    Document.extracted_data.isnot(None),
                )
                .order_by(desc(cast(ColumnElement, Document.uploaded_at)))
                .limit(20)
            ).all()

            recent_context = [
                {
                    "id": str(d.id),
                    "date": d.extracted_data.get("date") if d.extracted_data else None,
                    "payee": d.extracted_data.get("payee")
                    if d.extracted_data
                    else None,
                    "amount": d.extracted_data.get("amount")
                    if d.extracted_data
                    else None,
                    "currency": d.extracted_data.get("currency")
                    if d.extracted_data
                    else None,
                    "description": d.extracted_data.get("description")
                    if d.extracted_data
                    else None,
                }
                for d in recent_docs
            ]

            # Enhanced PDF extraction with AI insights
            import pymupdf

            doc_pdf = pymupdf.open(stream=file_bytes, filetype="pdf")
            first_page = doc_pdf[0]
            pix = first_page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("jpeg")

            ocr_result = _ocr_with_textract(img_bytes)
            raw_text = ocr_result["raw_text"]

            data = await analyze_document_with_intelligence(
                image_bytes=img_bytes,
                ocr_hint=raw_text,
                media_type="image/jpeg",
                historical_context=recent_context,
            )

            # Check for duplicates
            duplicate_check = await check_for_duplicates(
                extracted_data=data,
                recent_documents=recent_context,
                time_window_hours=72,
            )

            data["duplicate_detection"] = duplicate_check

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
