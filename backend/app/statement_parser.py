"""
Bank statement parser for CSV/XLSX files.
Uses smart column detection with common aliases to handle different bank formats.
"""

import csv
import io
import re
from datetime import datetime
from decimal import Decimal

import openpyxl


# Column mapping with common aliases (case-insensitive)
COLUMN_MAPPINGS = {
    "date": [
        "date",
        "transaction date",
        "value date",
        "posting date",
        "trans date",
        "txn date",
        "payment date",
        "transaction_date",
    ],
    "description": [
        "description",
        "reference",
        "details",
        "transaction details",
        "particulars",
        "narration",
        "memo",
        "payee",
        "vendor",
        "merchant",
        "remarks",
    ],
    "amount": ["amount", "value", "transaction amount", "total", "sum"],
    "debit": ["debit", "withdrawal", "withdrawals", "dr", "paid", "payment"],
    "credit": ["credit", "deposit", "deposits", "cr", "received"],
    "balance": ["balance", "running balance", "closing balance"],
    "reference": ["reference", "ref", "transaction ref", "ref no", "reference number"],
}


def _normalize_header(header: str) -> str:
    """Normalize header string for matching"""
    return header.lower().strip().replace("_", " ")


def _detect_columns(headers: list[str]) -> dict[str, int]:
    """
    Detect which column corresponds to which field.
    Returns mapping like {"date": 0, "description": 2, "amount": 3}
    """
    normalized = [_normalize_header(h) for h in headers]
    detected = {}

    for field, aliases in COLUMN_MAPPINGS.items():
        for idx, norm_header in enumerate(normalized):
            if norm_header in aliases:
                detected[field] = idx
                break

    return detected


def _parse_amount(value: str | float | int | None) -> float | None:
    """Parse amount from various formats"""
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    # String processing
    value_str = str(value).strip()
    if not value_str or value_str == "-":
        return None

    # Remove currency symbols, commas, spaces
    cleaned = re.sub(r"[^\d.-]", "", value_str)

    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_date(value: str | datetime | None) -> str | None:
    """Parse date to YYYY-MM-DD format"""
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")

    value_str = str(value).strip()
    if not value_str:
        return None

    # Try common date formats
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d %b %Y",
        "%d %B %Y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(value_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def _extract_transaction_from_row(
    row: list[str | None], columns: dict[str, int]
) -> dict | None:
    """
    Extract transaction data from a single row using detected column mappings.
    Returns None if row doesn't contain a valid transaction.
    """

    def get_cell(field: str) -> str | None:
        idx = columns.get(field)
        if idx is None or idx >= len(row):
            return None
        return row[idx]

    # Date is required
    date_str = _parse_date(get_cell("date"))
    if not date_str:
        return None

    # Description is required
    description = get_cell("description")
    if not description or not description.strip():
        return None

    # Amount handling: check amount, debit, credit columns
    amount = None

    if "amount" in columns:
        amount = _parse_amount(get_cell("amount"))

    # If no amount column, try debit/credit
    if amount is None:
        debit = _parse_amount(get_cell("debit"))
        credit = _parse_amount(get_cell("credit"))

        if debit is not None and debit != 0:
            amount = -abs(debit)  # Debit is negative
        elif credit is not None and credit != 0:
            amount = abs(credit)  # Credit is positive

    if amount is None or amount == 0:
        return None

    return {
        "date": date_str,
        "amount": amount,
        "currency": "MYR",  # Default, can be enhanced
        "description": description.strip(),
        "reference": get_cell("reference"),
    }


def parse_csv(csv_bytes: bytes) -> list[dict]:
    """Parse CSV bank statement"""
    decoded = csv_bytes.decode("utf-8", errors="ignore")
    reader = csv.reader(io.StringIO(decoded))

    rows = list(reader)
    if not rows:
        return []

    # First row is usually headers
    headers = rows[0]
    columns = _detect_columns(headers)

    if not columns.get("date") or not columns.get("description"):
        found_cols = ", ".join([f'"{h}"' for h in headers[:10]])  # Show first 10
        raise ValueError(
            f"Could not detect required columns (date & description). "
            f"Found columns: {found_cols}. "
            f"Please ensure your CSV has 'Date' and 'Description' columns."
        )

    transactions = []
    for row in rows[1:]:  # Skip header
        if not row or not any(row):  # Skip empty rows
            continue

        txn = _extract_transaction_from_row(row, columns)
        if txn:
            transactions.append(txn)

    return transactions


def parse_xlsx(xlsx_bytes: bytes) -> list[dict]:
    """Parse XLSX bank statement"""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active

    if ws is None:
        return []

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    # First row is usually headers
    headers = [str(cell) if cell is not None else "" for cell in rows[0]]
    columns = _detect_columns(headers)

    if not columns.get("date") or not columns.get("description"):
        found_cols = ", ".join([f'"{h}"' for h in headers[:10] if h])  # Show first 10 non-empty
        raise ValueError(
            f"Could not detect required columns (date & description). "
            f"Found columns: {found_cols}. "
            f"Please ensure your file has 'Date' and 'Description' columns."
        )

    transactions = []
    for row in rows[1:]:  # Skip header
        if not row or not any(row):  # Skip empty rows
            continue

        # Convert row to strings/preserve types
        processed_row = [cell for cell in row]
        txn = _extract_transaction_from_row(processed_row, columns)
        if txn:
            transactions.append(txn)

    return transactions


def parse_statement(file_bytes: bytes, filename: str) -> list[dict]:
    """
    Main entry point for parsing bank statements.
    Auto-detects format based on filename.

    Returns list of transactions:
    [
        {
            "date": "2026-05-20",
            "amount": 42.50,
            "currency": "MYR",
            "description": "PAYPAL *AMAZON",
            "reference": "TXN123456"
        },
        ...
    ]
    """
    filename_lower = filename.lower()

    # Check if this looks like a receipt file (not a bank statement)
    if "receipt" in filename_lower or "invoice" in filename_lower:
        raise ValueError(
            f"This appears to be a receipt/invoice file, not a bank statement. "
            f"Bank statements should contain multiple transaction rows with dates, amounts, and descriptions. "
            f"Please upload a CSV/XLSX file exported from your bank."
        )

    if filename_lower.endswith(".csv"):
        return parse_csv(file_bytes)
    elif filename_lower.endswith((".xlsx", ".xls")):
        return parse_xlsx(file_bytes)
    else:
        raise ValueError(f"Unsupported file format: {filename}")
