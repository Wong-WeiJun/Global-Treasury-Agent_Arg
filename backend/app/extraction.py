import base64
import csv
import json
import re
from io import BytesIO

import boto3
import openpyxl

from app.core.config import settings


def _get_bedrock_client():
    return boto3.client(
        "bedrock-runtime",
        region_name="us-east-1",
        aws_access_key_id=settings.s3_access_key_id.get_secret_value()
        if settings.s3_access_key_id
        else None,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value()
        if settings.s3_secret_access_key
        else None,
    )


def _get_textract_client():
    return boto3.client(
        "textract",
        region_name="us-east-1",
        aws_access_key_id=settings.s3_access_key_id.get_secret_value()
        if settings.s3_access_key_id
        else None,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value()
        if settings.s3_secret_access_key
        else None,
    )


EXTRACTION_PROMPT = """You are a financial document extraction agent. Extract the following fields from this payment document:

- amount: the transaction amount as a number (e.g. 42.50)
- currency: the 3-letter ISO currency code (e.g. USD, MYR, EUR, SGD, JPY)
- date: the transaction date in YYYY-MM-DD format
- payer: the name of the person or company sending money (may be null)
- payee: the name of the person or company receiving money (may be null)
- description: a brief description of what the payment is for (may be null)

Respond ONLY with a JSON object, no markdown, no explanation. Example:
{"amount": 42.50, "currency": "MYR", "date": "2026-05-23", "payer": "Acme Corp", "payee": "Vendor Ltd", "description": "Invoice #1234"}

If a field cannot be found, set it to null."""


def _get_text_from_block(block: dict, block_map: dict) -> str:
    text = ""
    for rel in block.get("Relationships", []):
        if rel["Type"] == "CHILD":
            for child_id in rel["Ids"]:
                child = block_map.get(child_id, {})
                if child.get("BlockType") == "WORD":
                    text += child.get("Text", "") + " "
    return text.strip()


def _ocr_with_textract(image_bytes: bytes) -> dict:
    """
    Run Textract on image bytes.
    Returns raw text string and key-value pairs with confidence scores.
    """
    client = _get_textract_client()
    response = client.analyze_document(
        Document={"Bytes": image_bytes},
        FeatureTypes=["FORMS"],
    )

    blocks = response["Blocks"]
    block_map = {b["Id"]: b for b in blocks}

    raw_text = " ".join(b["Text"] for b in blocks if b["BlockType"] == "LINE")

    key_blocks = {
        b["Id"]: b
        for b in blocks
        if b["BlockType"] == "KEY_VALUE_SET" and "KEY" in b.get("EntityTypes", [])
    }
    value_blocks = {
        b["Id"]: b
        for b in blocks
        if b["BlockType"] == "KEY_VALUE_SET" and "VALUE" in b.get("EntityTypes", [])
    }

    kvs: dict[str, dict] = {}
    for key_block in key_blocks.values():
        key_text = _get_text_from_block(key_block, block_map).lower().strip()
        for rel in key_block.get("Relationships", []):
            if rel["Type"] == "VALUE":
                for val_id in rel["Ids"]:
                    val_block = value_blocks.get(val_id)
                    if val_block:
                        val_text = _get_text_from_block(val_block, block_map)
                        kvs[key_text] = {
                            "value": val_text,
                            "confidence": val_block.get("Confidence", 0.0),
                        }

    return {"raw_text": raw_text, "kvs": kvs}


def _has_low_confidence(kvs: dict, threshold: float = 85.0) -> bool:
    """True if any financially important field has confidence below threshold."""
    important_keys = ["amount", "date", "total", "currency", "due"]
    for key, data in kvs.items():
        if any(k in key for k in important_keys):
            if data["confidence"] < threshold:
                return True
    return False


def _call_bedrock_vision(
    image_bytes: bytes, ocr_hint: str = "", media_type: str = "image/jpeg"
) -> dict:
    """Vision call to Claude on Bedrock. Passes OCR raw text as a hint if available."""
    client = _get_bedrock_client()
    b64_image = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = EXTRACTION_PROMPT
    if ocr_hint:
        prompt += f"\n\nFor reference, OCR pre-processing extracted this raw text (may contain errors):\n{ocr_hint[:2000]}"

    response = client.invoke_model(
        modelId="us.anthropic.claude-sonnet-4-6",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 512,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": b64_image,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            }
        ),
    )

    result = json.loads(response["body"].read())
    text = result["content"][0]["text"].strip()
    return json.loads(text)


def _call_bedrock_text(text_content: str, ocr_hint: str = "") -> dict:
    """Text-only call to Claude on Bedrock. Used for PDFs with a text layer."""
    client = _get_bedrock_client()

    prompt = EXTRACTION_PROMPT
    if ocr_hint:
        prompt += f"\n\nOCR also extracted these key-value pairs for reference:\n{ocr_hint[:1000]}"

    response = client.invoke_model(
        modelId="us.anthropic.claude-sonnet-4-6",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 512,
                "messages": [
                    {
                        "role": "user",
                        "content": f"{prompt}\n\nDocument text:\n{text_content[:4000]}",
                    }
                ],
            }
        ),
    )

    result = json.loads(response["body"].read())
    text = result["content"][0]["text"].strip()
    return json.loads(text)


def extract_from_image(image_bytes: bytes) -> dict:
    """
    Pipeline:
    1. Textract OCR → raw text + confidence scores
    2. Claude vision with OCR text as hint → interpreted fields
    3. Tag result with confidence metadata
    """
    ocr_result = _ocr_with_textract(image_bytes)
    raw_text = ocr_result["raw_text"]
    kvs = ocr_result["kvs"]

    llm_result = _call_bedrock_vision(image_bytes, ocr_hint=raw_text)

    # Tag with confidence metadata for the reconciliation agent to use later
    llm_result["ocr_confidence"] = "low" if _has_low_confidence(kvs) else "high"
    llm_result["extraction_method"] = "textract+bedrock"

    return llm_result


def extract_from_pdf(pdf_bytes: bytes) -> dict:
    """
    Pipeline:
    1. PyMuPDF extracts text layer
    2a. If text layer exists → Textract on first page + Claude text call with both hints
    2b. If scanned PDF → render to image → same as extract_from_image
    """
    import pymupdf

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += str(page.get_text()) or ""

    first_page = doc[0]
    pix = first_page.get_pixmap(dpi=150)
    img_bytes = pix.tobytes("jpeg")

    ocr_result = _ocr_with_textract(img_bytes)
    raw_text = ocr_result["raw_text"]
    kvs = ocr_result["kvs"]

    if text.strip():
        ocr_summary = ", ".join(f"{k}: {v['value']}" for k, v in list(kvs.items())[:10])
        llm_result = _call_bedrock_text(text, ocr_hint=ocr_summary)
    else:
        llm_result = _call_bedrock_vision(img_bytes, ocr_hint=raw_text)

    llm_result["ocr_confidence"] = "low" if _has_low_confidence(kvs) else "high"
    llm_result["extraction_method"] = "textract+bedrock"

    return llm_result


def extract_from_excel(excel_bytes: bytes, filename: str) -> list[dict]:
    """Parse Excel/CSV directly — no AI needed for structured data."""
    transactions = []

    if filename.endswith(".csv"):
        import io

        reader = csv.DictReader(
            io.StringIO(excel_bytes.decode("utf-8", errors="ignore"))
        )
        for row in reader:
            transactions.append(_normalize_excel_row(row))
    else:
        wb = openpyxl.load_workbook(BytesIO(excel_bytes), read_only=True)
        ws = wb.active
        if ws is None:
            return transactions
        headers = None
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0:
                headers = [str(c).strip().lower() if c else "" for c in row]
                continue
            if headers and any(row):
                row_dict = dict(zip(headers, row, strict=False))
                transactions.append(_normalize_excel_row(row_dict))

    return transactions


def _normalize_excel_row(row: dict) -> dict:
    def find(keys):
        for k in keys:
            for col, val in row.items():
                if k in col.lower() and val is not None:
                    return str(val).strip()
        return None

    amount_str = find(["amount", "debit", "credit", "value"])
    try:
        amount = float(re.sub(r"[^\d.]", "", amount_str)) if amount_str else None
    except ValueError:
        amount = None

    return {
        "amount": amount,
        "currency": find(["currency", "ccy"]) or "MYR",
        "date": find(["date", "txn date", "transaction date", "value date"]),
        "payer": find(["payer", "sender", "from"]),
        "payee": find(["payee", "recipient", "beneficiary", "to"]),
        "description": find(["description", "narration", "details", "remarks", "ref"]),
    }
