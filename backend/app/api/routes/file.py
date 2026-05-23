from fastapi import APIRouter, HTTPException, UploadFile, File
from app.api.deps import CurrentUser
from app.file_utils import upload_document, delete_document
import boto3
from app.core.config import settings
from app.models import (
    Document,
    DocumentPublic,
    DocumentsPublic,
    UploadResponse,
    ExtractedData,
    ExtractionResponse,
)
from sqlmodel import select, func
from app.fx import convert_to_myr
import uuid
from app.api.deps import SessionDep
from sqlalchemy import desc
from typing import cast
from sqlalchemy.sql.elements import ColumnElement
from app.extraction import extract_from_image, extract_from_pdf, extract_from_excel
from sqlalchemy.orm.attributes import flag_modified

router = APIRouter(prefix="/files", tags=["files"])

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
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415, detail=f"Unsupported file type: {file.content_type}"
        )

    contents = await file.read()

    if len(contents) > settings.max_upload_size_bytes:
        raise HTTPException(status_code=413, detail="File too large")

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
    count = session.exec(
        select(func.count()).where(Document.owner_id == current_user.id)
    ).one()

    docs = session.exec(
        select(Document)
        .where(Document.owner_id == current_user.id)
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
    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner_id != current_user.id:
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
    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner_id != current_user.id:
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
    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner_id != current_user.id:
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
            for row in rows:
                if row.get("amount") and row.get("currency"):
                    fx = await convert_to_myr(
                        amount=row["amount"],
                        from_currency=row["currency"],
                        on_date=row.get("date") or "latest",
                    )
                    row["myr_amount"] = fx["to_amount"]
                    row["fx_rate"] = fx["rate"]
                converted_rows.append(row)

            doc.extracted_data = {"rows": converted_rows}
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
            if data.get("amount") and data.get("currency"):
                fx_result = await convert_to_myr(
                    amount=data["amount"],
                    from_currency=data["currency"],
                    on_date=data.get("date") or "latest",
                )
                data["myr_amount"] = fx_result["to_amount"]
                data["fx_rate"] = fx_result["rate"]

            doc.extracted_data = data
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
