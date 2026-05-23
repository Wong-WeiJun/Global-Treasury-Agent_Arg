from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.api.deps import CurrentUser
from app.file_utils import upload_document, delete_document
from pydantic import BaseModel
import boto3
from app.core.config import settings


router = APIRouter(prefix="/files", tags=["files"])


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


class UploadResponse(BaseModel):
    s3_key: str
    filename: str


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    allowed_types = {
        "image/jpeg",
        "image/png",
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415, detail=f"Unsupported file type: {file.content_type}"
        )

    contents = await file.read()

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

    return UploadResponse(s3_key=s3_key, filename=file.filename or "upload")


@router.delete("/delete")
async def delete_file(
    s3_key: str,
    current_user: CurrentUser,
):
    if f"org_{current_user.id}" not in s3_key:
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this file"
        )

    await delete_document(s3_key)
    return {"message": "Deleted successfully"}

