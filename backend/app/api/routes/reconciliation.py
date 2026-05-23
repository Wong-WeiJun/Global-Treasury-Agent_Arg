from fastapi import APIRouter, HTTPException
from app.api.deps import CurrentUser, SessionDep
from app.models import Document, ReconcileRequest, ReconcileResponse
from app.reconciliation import reconcile
from app.fx import convert_to_myr
from app.extraction import extract_from_image, extract_from_pdf
from sqlalchemy.orm.attributes import flag_modified
import boto3
from app.core.config import settings

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


@router.post("/reconcile", response_model=ReconcileResponse)
async def reconcile_document(
    body: ReconcileRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    doc = session.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner_id != current_user.id:
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
                fx = await convert_to_myr(
                    amount=data["amount"],
                    from_currency=data["currency"],
                    on_date=data.get("date") or "latest",
                )
                data["myr_amount"] = fx["to_amount"]
                data["fx_rate"] = fx["rate"]

            doc.extracted_data = data
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

    # FX conversion
    fx_result = None
    if proof.get("currency") and proof["currency"].upper() != "MYR":
        fx_date = body.override_date or proof.get("date") or "latest"
        fx_result = await convert_to_myr(
            amount=proof["amount"],
            from_currency=proof["currency"],
            on_date=fx_date,
        )

    result = await reconcile(
        proof=proof,
        bank_entries=[e.model_dump() for e in body.bank_entries],
        fx_result=fx_result,
    )

    return ReconcileResponse(document_id=body.document_id, result=result)

