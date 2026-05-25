"""
AI Insights Engine: Advanced document analysis with semantic categorization,
anomaly detection, and contextual awareness.

This module elevates AWS Bedrock AI from simple field extraction to financial intelligence.
"""

import json
from datetime import datetime, timedelta
from typing import Any

import boto3

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


SEMANTIC_CATEGORIZATION_PROMPT = """You are a financial intelligence agent analyzing payment documents.

Extract the standard fields, but also perform deep semantic analysis:

1. SEMANTIC CATEGORIZATION:
   - Is this a business expense? (yes/no/uncertain)
   - Tax category: (Office Supplies, Meals, Travel, Equipment, Software/SaaS, Marketing, Legal/Professional, Utilities, Rent, Other)
   - Business purpose: brief explanation of why this expense makes sense for a business
   - Vendor type: (Supplier, Service Provider, Contractor, Employee Reimbursement, Government/Tax, Other)

2. ANOMALY DETECTION:
   - Is this likely a duplicate? Check for: same timestamp, same vendor, similar amount
   - Unusual flags: (weekend_transaction, round_amount, foreign_vendor, high_value, manual_entry, missing_receipt_details)
   - Risk indicators: confidence score (0-100) for authenticity
   - OCR quality: If this came from OCR, assess the quality (high/medium/low)

3. CONTEXTUAL INTELLIGENCE:
   - Payment method visible: (Cash, Credit Card, Bank Transfer, Check, Digital Wallet, Unknown)
   - Recurring pattern hint: Does this look like a subscription or regular payment?
   - Merchant consistency: Are vendor name formats consistent (e.g., "AMZN" vs "Amazon.com")?

CRITICAL: Return a JSON object with both standard fields AND intelligence fields.

Standard fields:
- amount: transaction amount as number
- currency: 3-letter ISO code
- date: YYYY-MM-DD format
- payer: sender name
- payee: recipient name
- description: payment description

Intelligence fields:
- is_business_expense: boolean or null
- tax_category: string or null
- business_purpose: string or null
- vendor_type: string or null
- duplicate_risk: "high" | "medium" | "low" | null
- anomaly_flags: array of strings
- authenticity_confidence: 0-100
- ocr_confidence: "high" | "medium" | "low" | null
- payment_method: string or null
- is_recurring: boolean or null
- vendor_name_normalized: standardized vendor name

Example response:
{
  "amount": 42.50,
  "currency": "MYR",
  "date": "2026-05-23",
  "payer": "Acme Corp",
  "payee": "AWS Singapore",
  "description": "Cloud hosting services",
  "is_business_expense": true,
  "tax_category": "Software/SaaS",
  "business_purpose": "Infrastructure hosting for production application",
  "vendor_type": "Service Provider",
  "duplicate_risk": "low",
  "anomaly_flags": [],
  "authenticity_confidence": 95,
  "ocr_confidence": "high",
  "payment_method": "Credit Card",
  "is_recurring": true,
  "vendor_name_normalized": "amazon_web_services"
}

If a field cannot be determined, set it to null. Be conservative with business categorization.
"""


async def analyze_document_with_intelligence(
    image_bytes: bytes,
    ocr_hint: str = "",
    media_type: str = "image/jpeg",
    historical_context: list[dict] | None = None,
) -> dict:
    """
    Enhanced extraction with semantic categorization and anomaly detection.

    Args:
        image_bytes: Document image bytes
        ocr_hint: Optional OCR text hint
        media_type: Image media type
        historical_context: Recent transactions for duplicate detection

    Returns:
        Dictionary with both standard extraction fields and intelligence metadata
    """
    client = _get_bedrock_client()
    import base64

    b64_image = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = SEMANTIC_CATEGORIZATION_PROMPT

    if ocr_hint:
        prompt += f"\n\nOCR preprocessing extracted this text:\n{ocr_hint[:2000]}"

    if historical_context:
        prompt += "\n\nRECENT TRANSACTIONS (for duplicate detection):\n"
        for ctx in historical_context[:5]:  # Last 5 transactions
            prompt += f"- {ctx.get('date')}: {ctx.get('payee')} - {ctx.get('currency')} {ctx.get('amount')}\n"

    response = client.invoke_model(
        modelId="us.anthropic.claude-sonnet-4-6",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "temperature": 0.1,  # Low temperature for consistent categorization
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

    # Clean JSON from markdown code blocks
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]

    return json.loads(text.strip())


async def check_for_duplicates(
    extracted_data: dict,
    recent_documents: list[dict],
    time_window_hours: int = 72,
) -> dict:
    """
    Standalone duplicate detection based on extracted data and recent history.

    Args:
        extracted_data: Newly extracted document data
        recent_documents: List of recent document extractions
        time_window_hours: How far back to check for duplicates

    Returns:
        Dictionary with duplicate analysis:
        - is_duplicate: bool
        - duplicate_matches: list of matching document IDs
        - similarity_scores: list of similarity scores (0-1)
        - explanation: string
    """
    if not recent_documents:
        return {
            "is_duplicate": False,
            "duplicate_matches": [],
            "similarity_scores": [],
            "explanation": "No recent history to compare against",
        }

    # Extract key fields for comparison
    new_amount = extracted_data.get("amount")
    new_date = extracted_data.get("date")
    new_vendor = extracted_data.get("payee", "").lower()
    new_description = extracted_data.get("description", "").lower()

    if not new_amount or not new_date:
        return {
            "is_duplicate": False,
            "duplicate_matches": [],
            "similarity_scores": [],
            "explanation": "Insufficient data for duplicate detection",
        }

    from datetime import datetime

    try:
        new_dt = datetime.strptime(new_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        return {
            "is_duplicate": False,
            "duplicate_matches": [],
            "similarity_scores": [],
            "explanation": "Invalid date format",
        }

    cutoff_time = new_dt - timedelta(hours=time_window_hours)

    matches = []
    scores = []

    for doc in recent_documents:
        doc_amount = doc.get("amount")
        doc_date = doc.get("date")
        doc_vendor = doc.get("payee", "").lower()
        doc_description = doc.get("description", "").lower()

        if not doc_amount or not doc_date:
            continue

        try:
            doc_dt = datetime.strptime(doc_date, "%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        # Skip if outside time window
        if doc_dt < cutoff_time:
            continue

        # Calculate similarity score
        score = 0.0

        # Amount match (within 1%)
        if abs(doc_amount - new_amount) / max(doc_amount, 0.01) < 0.01:
            score += 0.5

        # Date match (same day)
        if doc_date == new_date:
            score += 0.3

        # Vendor match
        if doc_vendor and new_vendor and doc_vendor == new_vendor:
            score += 0.2

        if score >= 0.8:  # High confidence duplicate
            matches.append(doc.get("id"))
            scores.append(score)

    is_duplicate = len(matches) > 0
    explanation = ""

    if is_duplicate:
        explanation = f"Found {len(matches)} potential duplicate(s) within {time_window_hours} hours. Similarity scores: {scores}"
    else:
        explanation = "No duplicates detected in recent history"

    return {
        "is_duplicate": is_duplicate,
        "duplicate_matches": matches,
        "similarity_scores": scores,
        "explanation": explanation,
    }


def normalize_vendor_name(vendor: str | None) -> str | None:
    """
    Normalize vendor names for consistent matching.
    Examples:
    - "AMZN" -> "amazon"
    - "Amazon.com" -> "amazon"
    - "AWS Singapore Pte Ltd" -> "amazon_web_services"
    """
    if not vendor:
        return None

    vendor_lower = vendor.lower().strip()

    # Common vendor mappings
    mappings = {
        "amzn": "amazon",
        "amazon.com": "amazon",
        "amazon web services": "amazon_web_services",
        "aws": "amazon_web_services",
        "microsoft": "microsoft",
        "msft": "microsoft",
        "google": "google",
        "goog": "google",
        "apple": "apple",
        "aapl": "apple",
    }

    for key, value in mappings.items():
        if key in vendor_lower:
            return value

    # Default: remove special characters and spaces
    import re
    normalized = re.sub(r"[^a-z0-9]", "_", vendor_lower)
    normalized = re.sub(r"_+", "_", normalized).strip("_")

    return normalized[:50]  # Limit length
