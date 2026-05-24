import mimetypes
import uuid
from io import BytesIO

import boto3
from PIL import Image, ImageOps
from starlette.concurrency import run_in_threadpool

from app.core.config import settings


def _get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.s3_region,
        aws_access_key_id=(
            settings.s3_access_key_id.get_secret_value()
            if settings.s3_access_key_id
            else None
        ),
        aws_secret_access_key=(
            settings.s3_secret_access_key.get_secret_value()
            if settings.s3_secret_access_key
            else None
        ),
        endpoint_url=settings.s3_endpoint_url,
    )


def process_and_prepare_file(
    content: bytes, original_filename: str
) -> tuple[bytes, str, str]:
    """
    Processes the file based on its type. Optimizes images, passes docs through.
    Returns: (processed_bytes, new_uuid_filename, content_type)
    """
    extension = original_filename.split(".")[-1].lower()

    # Dynamically guess the mimetype for S3
    content_type, _ = mimetypes.guess_type(original_filename)
    if content_type is None:
        content_type = "application/octet-stream"

    # Handle Images (png, jpg, jpeg)
    if extension in ["jpg", "jpeg", "png"]:
        with Image.open(BytesIO(content)) as original:
            img = ImageOps.exif_transpose(original)

            # Removed the 300x300 crop here so receipts/invoices remain readable!
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")

            new_filename = f"{uuid.uuid4().hex}.jpg"
            output = BytesIO()
            img.save(output, "JPEG", quality=85, optimize=True)
            output.seek(0)

            return output.read(), new_filename, "image/jpeg"

    # Handle PDFs and Excel (xls, xlsx)
    elif extension in ["pdf", "xls", "xlsx"]:
        # We do not alter the bytes of PDFs or Excel files
        new_filename = f"{uuid.uuid4().hex}.{extension}"
        return content, new_filename, content_type

    else:
        raise ValueError(f"Unsupported file type: {extension}")


def _upload_to_s3(file_bytes: bytes, key: str, content_type: str) -> None:
    s3 = _get_s3_client()
    s3.upload_fileobj(
        BytesIO(file_bytes),
        settings.s3_bucket_name,
        key,
        ExtraArgs={"ContentType": content_type},
    )


def _delete_from_s3(key: str) -> None:
    s3 = _get_s3_client()
    s3.delete_object(Bucket=settings.s3_bucket_name, Key=key)


async def upload_document(
    file_bytes: bytes, original_filename: str, org_id: int | str | uuid.UUID
) -> str:
    """
    Uploads the file and returns the generated S3 key using the enterprise structure.
    """
    processed_bytes, new_filename, content_type = process_and_prepare_file(
        file_bytes, original_filename
    )

    key = f"dev/org_{org_id}/inbound/{new_filename}"

    await run_in_threadpool(_upload_to_s3, processed_bytes, key, content_type)
    return key


async def delete_document(key: str | None) -> None:
    """
    Deletes the document using its exact S3 key.
    """
    if key is None:
        return
    await run_in_threadpool(_delete_from_s3, key)
