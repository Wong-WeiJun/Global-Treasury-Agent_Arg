import base64
import csv
import json
import io
import re
import boto3
import openpyxl
import dateutil.parser
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


def _call_bedrock_excel(csv_content: str) -> list[dict]:
    """
    Calls Claude on Bedrock specifically to extract multi-row spreadsheet data.
    Expects a dense CSV string and guarantees a list of dictionaries in return.
    """
    client = _get_bedrock_client()

    # Append strict array instructions to your base prompt
    prompt = (
        f"{EXTRACTION_PROMPT}\n\n"
        "CRITICAL INSTRUCTIONS FOR SPREADSHEET DATA:\n"
        "1. The input below is a raw spreadsheet converted to CSV format.\n"
        "2. It contains multiple rows of transactions. You must extract ALL valid transactions.\n"
        "3. You MUST output a SINGLE JSON ARRAY of objects: `[ {...}, {...} ]`.\n"
        '4. Do NOT wrap the array in a parent object (e.g., no `{"transactions": [...]}`).\n'
        "5. If a row is missing data, infer what you can from context or return null for that field."
    )

    response = client.invoke_model(
        modelId="us.anthropic.claude-sonnet-4-6",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 8192,  # Maximize tokens: Excel files generate massive JSON arrays
                "messages": [
                    {
                        "role": "user",
                        # High character limit to fit the entire CSV string
                        "content": f"{prompt}\n\nSpreadsheet Data:\n{csv_content[:50000]}",
                    }
                ],
            }
        ),
    )

    result = json.loads(response["body"].read())
    text = result["content"][0]["text"].strip()

    json_match = re.search(r"\[.*\]", text, re.DOTALL)

    if not json_match:
        dict_match = re.search(r"\{.*\}", text, re.DOTALL)
        if dict_match:
            parsed_dict = json.loads(dict_match.group(0))
            # Find the first value that is a list and return it
            for val in parsed_dict.values():
                if isinstance(val, list):
                    return val
            return [parsed_dict]

        raise ValueError("Could not locate a valid JSON array in the AI response.")

    parsed_data = json.loads(json_match.group(0))

    return parsed_data


def _fallback_textract_only(ocr_result: dict) -> dict:
    """
    Fallback extraction using only Textract OCR key-value pairs.
    Used when vision LLM fails or returns invalid JSON.

    This is a deterministic rule-based fallback that extracts from Textract's
    key-value pairs without any generative AI.
    """
    kvs = ocr_result["kvs"]
    raw_text = ocr_result["raw_text"]

    # Initialize result with nulls
    result = {
        "amount": None,
        "currency": None,
        "date": None,
        "payer": None,
        "payee": None,
        "description": None,
    }

    # Extract amount - look for common field names
    amount_keys = ["amount", "total", "sum", "payment", "price", "value"]
    for key, data in kvs.items():
        if any(k in key for k in amount_keys):
            try:
                # Clean and parse amount
                val = data["value"].replace(",", "").replace("$", "").replace("RM", "").strip()
                result["amount"] = float(val)
                break
            except (ValueError, AttributeError):
                continue

    # Extract currency - look for currency codes or symbols
    currency_keys = ["currency", "curr"]
    for key, data in kvs.items():
        if any(k in key for k in currency_keys):
            val = data["value"].strip().upper()
            if len(val) == 3:  # ISO currency codes are 3 letters
                result["currency"] = val
                break

    # If no currency found in KVs, try to detect from raw text
    if not result["currency"]:
        import re
        # Common currency patterns
        currency_patterns = [
            (r'\bUSD\b', 'USD'),
            (r'\bMYR\b', 'MYR'),
            (r'\bRM\b', 'MYR'),
            (r'\bEUR\b', 'EUR'),
            (r'\bGBP\b', 'GBP'),
            (r'\bSGD\b', 'SGD'),
            (r'\$', 'USD'),  # Assume $ is USD if not specified
            (r'€', 'EUR'),
            (r'£', 'GBP'),
        ]
        for pattern, curr in currency_patterns:
            if re.search(pattern, raw_text):
                result["currency"] = curr
                break

    # Default to MYR if still no currency
    if not result["currency"]:
        result["currency"] = "MYR"

    # Extract date
    date_keys = ["date", "transaction date", "payment date", "invoice date", "issued"]
    for key, data in kvs.items():
        if any(k in key for k in date_keys):
            try:
                # Try to parse date (Textract usually returns dates in readable format)
                import dateutil.parser
                parsed_date = dateutil.parser.parse(data["value"])
                result["date"] = parsed_date.strftime("%Y-%m-%d")
                break
            except (ValueError, AttributeError):
                continue

    # Extract payer/payee - look for company names, from/to fields
    payer_keys = ["from", "payer", "sender", "remitter", "customer"]
    payee_keys = ["to", "payee", "recipient", "beneficiary", "vendor", "supplier"]

    for key, data in kvs.items():
        if any(k in key for k in payer_keys) and not result["payer"]:
            result["payer"] = data["value"].strip()
        if any(k in key for k in payee_keys) and not result["payee"]:
            result["payee"] = data["value"].strip()

    # Extract description
    desc_keys = ["description", "memo", "reference", "remarks", "notes", "details", "purpose"]
    for key, data in kvs.items():
        if any(k in key for k in desc_keys):
            result["description"] = data["value"].strip()
            break

    # If no description found, use first 100 chars of raw text
    if not result["description"] and raw_text:
        result["description"] = raw_text[:100].strip()

    # Tag with metadata
    result["ocr_confidence"] = "low" if _has_low_confidence(kvs) else "high"
    result["extraction_method"] = "textract_only_fallback"
    result["fallback_used"] = True

    return result


def extract_from_image(image_bytes: bytes) -> dict:
    """
    Pipeline with Perception Fallback:
    1. Textract OCR → raw text + confidence scores
    2. Try: Claude vision with OCR text as hint → interpreted fields
    3. Fallback: If vision fails, use deterministic Textract-only extraction
    4. Tag result with confidence metadata

    This ensures we ALWAYS return structured data, even if the generative vision model fails.
    """
    ocr_result = _ocr_with_textract(image_bytes)
    raw_text = ocr_result["raw_text"]
    kvs = ocr_result["kvs"]

    try:
        llm_result = _call_bedrock_vision(image_bytes, ocr_hint=raw_text)

        # Validate that we got required fields
        if not isinstance(llm_result, dict):
            raise ValueError("Vision LLM returned non-dict response")

        # Tag with confidence metadata
        llm_result["ocr_confidence"] = "low" if _has_low_confidence(kvs) else "high"
        llm_result["extraction_method"] = "textract+bedrock"
        llm_result["fallback_used"] = False

        return llm_result

    except (json.JSONDecodeError, KeyError, ValueError, Exception) as e:
        # Fallback to Textract-only extraction
        print(f"Vision extraction failed: {type(e).__name__}: {str(e)}")
        print("Falling back to Textract-only extraction (deterministic rule-based)")

        return _fallback_textract_only(ocr_result)


def extract_from_pdf(pdf_bytes: bytes) -> dict:
    """
    Pipeline with Perception Fallback:
    1. PyMuPDF extracts text layer
    2a. If text layer exists → Try Claude text call, fallback to Textract-only
    2b. If scanned PDF → Try Claude vision, fallback to Textract-only
    3. Always return structured data, even if generative models fail
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

    try:
        if text.strip():
            ocr_summary = ", ".join(f"{k}: {v['value']}" for k, v in list(kvs.items())[:10])
            llm_result = _call_bedrock_text(text, ocr_hint=ocr_summary)
        else:
            llm_result = _call_bedrock_vision(img_bytes, ocr_hint=raw_text)

        # Validate response
        if not isinstance(llm_result, dict):
            raise ValueError("LLM returned non-dict response")

        llm_result["ocr_confidence"] = "low" if _has_low_confidence(kvs) else "high"
        llm_result["extraction_method"] = "textract+bedrock"
        llm_result["fallback_used"] = False

        return llm_result

    except (json.JSONDecodeError, KeyError, ValueError, Exception) as e:
        # Fallback to Textract-only extraction
        print(f"PDF extraction failed: {type(e).__name__}: {str(e)}")
        print("Falling back to Textract-only extraction (deterministic rule-based)")

        return _fallback_textract_only(ocr_result)


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
            # Keep the row if it has at least one non-empty cell
            if any(cell.strip() for cell in row if cell):
                raw_rows.append([cell.strip() if cell else "" for cell in row])
    else:
        # CRITICAL: data_only=True ensures we get the calculated values, not raw Excel formulas
        wb = openpyxl.load_workbook(
            io.BytesIO(excel_bytes), read_only=True, data_only=True
        )
        ws = wb.active
        if ws is None:
            return ""

        for row in ws.iter_rows(values_only=True):
            # Openpyxl parses dates as datetime objects, str() converts them cleanly
            if any(cell is not None and str(cell).strip() != "" for cell in row):
                raw_rows.append(
                    [str(cell).strip() if cell is not None else "" for cell in row]
                )

    if not raw_rows:
        return ""

    # Remove columns that are completely empty across the entire document
    max_cols = max(len(r) for r in raw_rows)
    cols_to_keep = []
    for col_idx in range(max_cols):
        has_data = any(col_idx < len(row) and row[col_idx] != "" for row in raw_rows)
        if has_data:
            cols_to_keep.append(col_idx)

    # Build the final token-efficient CSV string for the AI
    output = io.StringIO()
    writer = csv.writer(output)
    for row in raw_rows:
        filtered_row = [row[i] if i < len(row) else "" for i in cols_to_keep]
        writer.writerow(filtered_row)

    return output.getvalue()
