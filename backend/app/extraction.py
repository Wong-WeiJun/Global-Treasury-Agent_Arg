import base64
import json
import re
from io import BytesIO

import boto3
import openpyxl
import csv

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


def _call_bedrock_vision(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    client = _get_bedrock_client()

    b64_image = base64.standard_b64encode(image_bytes).decode("utf-8")

    response = client.invoke_model(
        # Updated to the current active Claude 4.6 Sonnet model ID
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
                            {
                                "type": "text",
                                "text": EXTRACTION_PROMPT,
                            },
                        ],
                    }
                ],
            }
        ),
    )

    result = json.loads(response["body"].read())
    text = result["content"][0]["text"].strip()
    return json.loads(text)


def _call_bedrock_text(text_content: str) -> dict:
    client = _get_bedrock_client()

    response = client.invoke_model(
        # Updated to the current active Claude 4.6 Sonnet model ID
        modelId="us.anthropic.claude-sonnet-4-6",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 512,
                "messages": [
                    {
                        "role": "user",
                        "content": f"{EXTRACTION_PROMPT}\n\nDocument text:\n{text_content[:4000]}",
                    }
                ],
            }
        ),
    )

    result = json.loads(response["body"].read())
    text = result["content"][0]["text"].strip()
    return json.loads(text)


def extract_from_image(image_bytes: bytes) -> dict:
    return _call_bedrock_vision(image_bytes, media_type="image/jpeg")


def extract_from_pdf(pdf_bytes: bytes) -> dict:
    import pymupdf  # fitz

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += str(page.get_text()) or ""

    if text.strip():
        return _call_bedrock_text(text)
    else:
        page = doc[0]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("jpeg")
        return _call_bedrock_vision(img_bytes, media_type="image/jpeg")


def extract_from_excel(excel_bytes: bytes, filename: str) -> list[dict]:
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
