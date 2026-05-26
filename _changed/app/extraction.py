import base64
import csv
import json
import io
import re
import httpx
import openpyxl
import dateutil.parser
from app.core.config import settings


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


async def _ocr_with_puter(image_bytes: bytes) -> dict:
    """
    Run OCR via Puter.com free API.
    Returns raw text string; silently returns empty on any error since OCR is optional.
    """
    b64_image = base64.standard_b64encode(image_bytes).decode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.puter.com/drivers/call",
                json={
                    "interface": "puter-ocr",
                    "method": "recognize",
                    "args": {"image": {"url": f"data:image/jpeg;base64,{b64_image}"}},
                },
            )
            response.raise_for_status()
        result = response.json()
        text = ""
        if isinstance(result, dict):
            inner = result.get("result") or result
            if isinstance(inner, dict):
                text = inner.get("text", "") or ""
            elif isinstance(inner, str):
                text = inner
        return {"raw_text": text.strip(), "kvs": {}}
    except Exception:
        # OCR is optional — LLM vision handles extraction without it
        return {"raw_text": "", "kvs": {}}


async def _call_chutes_vision(
    image_bytes: bytes, ocr_hint: str = "", media_type: str = "image/jpeg"
) -> dict:
    """
    Vision call to Chutes AI (primary provider).
    Passes OCR raw text as a hint if available.
    """
    b64_image = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = EXTRACTION_PROMPT
    if ocr_hint:
        prompt += f"\n\nFor reference, OCR pre-processing extracted this raw text (may contain errors):\n{ocr_hint[:2000]}"

    chutes_payload = {
        "model": settings.CHUTES_VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{b64_image}",
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
        "max_tokens": 512,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.CHUTES_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.CHUTES_API_KEY}",
                "Content-Type": "application/json",
            },
            json=chutes_payload,
        )
        response.raise_for_status()

    chutes_response = response.json()
    text = chutes_response["choices"][0]["message"]["content"].strip()
    # Strip markdown code blocks if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


async def _call_chutes_text(text_content: str, ocr_hint: str = "") -> dict:
    """
    Text-only call to Chutes AI (primary provider).
    Used for PDFs with a text layer.
    """
    prompt = EXTRACTION_PROMPT
    if ocr_hint:
        prompt += f"\n\nOCR also extracted these key-value pairs for reference:\n{ocr_hint[:1000]}"

    chutes_payload = {
        "model": settings.CHUTES_MODEL,
        "messages": [
            {
                "role": "user",
                "content": f"{prompt}\n\nDocument text:\n{text_content[:4000]}",
            }
        ],
        "max_tokens": 512,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.CHUTES_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.CHUTES_API_KEY}",
                "Content-Type": "application/json",
            },
            json=chutes_payload,
        )
        response.raise_for_status()

    chutes_response = response.json()
    text = chutes_response["choices"][0]["message"]["content"].strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


async def _call_chutes_excel(csv_content: str) -> list[dict]:
    """
    Calls Chutes AI specifically to extract multi-row spreadsheet data.
    Expects a dense CSV string and guarantees a list of dictionaries in return.
    """
    prompt = (
        f"{EXTRACTION_PROMPT}\n\n"
        "CRITICAL INSTRUCTIONS FOR SPREADSHEET DATA:\n"
        "1. The input below is a raw spreadsheet converted to CSV format.\n"
        "2. It contains multiple rows of transactions. You must extract ALL valid transactions.\n"
        "3. You MUST output a SINGLE JSON ARRAY of objects: `[ {...}, {...} ]`.\n"
        '4. Do NOT wrap the array in a parent object (e.g., no `{"transactions": [...]}`).\n'
        "5. If a row is missing data, infer what you can from context or return null for that field."
    )

    chutes_payload = {
        "model": settings.CHUTES_MODEL,
        "messages": [
            {
                "role": "user",
                "content": f"{prompt}\n\nSpreadsheet Data:\n{csv_content[:50000]}",
            }
        ],
        "max_tokens": 8192,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{settings.CHUTES_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.CHUTES_API_KEY}",
                "Content-Type": "application/json",
            },
            json=chutes_payload,
        )
        response.raise_for_status()

    chutes_response = response.json()
    text = chutes_response["choices"][0]["message"]["content"].strip()

    json_match = re.search(r"\[.*\]", text, re.DOTALL)

    if not json_match:
        dict_match = re.search(r"\{.*\}", text, re.DOTALL)
        if dict_match:
            parsed_dict = json.loads(dict_match.group(0))
            for val in parsed_dict.values():
                if isinstance(val, list):
                    return val
            return [parsed_dict]

        raise ValueError("Could not locate a valid JSON array in the AI response.")

    return json.loads(json_match.group(0))


async def extract_from_image(image_bytes: bytes) -> dict:
    """
    Extract financial data from an image document.
    1. Puter.com OCR (best-effort, silent fallback)
    2. Chutes AI vision with OCR hint
    """
    ocr_result = await _ocr_with_puter(image_bytes)
    raw_text = ocr_result["raw_text"]

    llm_result = await _call_chutes_vision(image_bytes, ocr_hint=raw_text)

    if not isinstance(llm_result, dict):
        raise ValueError("Vision LLM returned non-dict response")

    llm_result["extraction_method"] = "puter+chutes"
    return llm_result


async def extract_from_pdf(pdf_bytes: bytes) -> dict:
    """
    Extract financial data from a PDF document.
    1. PyMuPDF extracts text layer
    2. Puter.com OCR on first page (best-effort)
    3. Chutes AI text or vision call
    """
    import pymupdf

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += str(page.get_text()) or ""

    first_page = doc[0]
    pix = first_page.get_pixmap(dpi=150)
    img_bytes = pix.tobytes("jpeg")

    ocr_result = await _ocr_with_puter(img_bytes)
    raw_text = ocr_result["raw_text"]

    if text.strip():
        llm_result = await _call_chutes_text(text, ocr_hint=raw_text)
    else:
        llm_result = await _call_chutes_vision(img_bytes, ocr_hint=raw_text)

    if not isinstance(llm_result, dict):
        raise ValueError("Chutes LLM returned non-dict response")

    llm_result["extraction_method"] = "puter+chutes"
    return llm_result


def extract_from_excel(excel_bytes: bytes, filename: str) -> str:
    """
    Parses unstructured Excel/CSV files into a clean, token-efficient CSV string.
    Strips completely empty rows/columns so the AI doesn't waste tokens on whitespace.
    """
    raw_rows = []

    if filename.lower().endswith(".csv"):
        decoded = excel_bytes.decode("utf-8", errors="ignore")
        reader = csv.reader(io.StringIO(decoded))
        for row in reader:
            if any(cell.strip() for cell in row if cell):
                raw_rows.append([cell.strip() if cell else "" for cell in row])
    else:
        wb = openpyxl.load_workbook(
            io.BytesIO(excel_bytes), read_only=True, data_only=True
        )
        ws = wb.active
        if ws is None:
            return ""

        for row in ws.iter_rows(values_only=True):
            if any(cell is not None and str(cell).strip() != "" for cell in row):
                raw_rows.append(
                    [str(cell).strip() if cell is not None else "" for cell in row]
                )

    if not raw_rows:
        return ""

    max_cols = max(len(r) for r in raw_rows)
    cols_to_keep = []
    for col_idx in range(max_cols):
        has_data = any(col_idx < len(row) and row[col_idx] != "" for row in raw_rows)
        if has_data:
            cols_to_keep.append(col_idx)

    output = io.StringIO()
    writer = csv.writer(output)
    for row in raw_rows:
        filtered_row = [row[i] if i < len(row) else "" for i in cols_to_keep]
        writer.writerow(filtered_row)

    return output.getvalue()
