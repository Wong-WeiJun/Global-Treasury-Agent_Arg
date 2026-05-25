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

    # If column detection failed, try smart heuristics
    if not columns.get("date") or not columns.get("description"):
        heuristic_result = _parse_with_heuristics(rows)
        if heuristic_result:
            return heuristic_result

        # If heuristics also failed, provide detailed error
        found_cols = ", ".join([f'"{h}"' for h in headers[:10]])  # Show first 10
        raise ValueError(
            f"Could not detect required columns (date & description). "
            f"Found columns: {found_cols}."
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

    # If column detection failed, try smart heuristics
    if not columns.get("date") or not columns.get("description"):
        # Convert rows to list of lists for heuristics
        simple_rows = [[str(cell) if cell is not None else "" for cell in row] for row in rows]
        heuristic_result = _parse_with_heuristics(simple_rows)
        if heuristic_result:
            return heuristic_result

        # If heuristics also failed, provide detailed error
        found_cols = ", ".join([f'"{h}"' for h in headers[:10] if h])
        raise ValueError(
            f"Could not detect required columns (date & description). "
            f"Found columns: {found_cols}."
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


def _parse_with_heuristics(rows: list[list]) -> list[dict]:
    """
    Smart heuristic-based parsing when column detection fails.
    Analyzes data patterns to identify date, amount, and description columns.
    """
    if len(rows) < 2:
        return []

    # Skip first row (headers) and analyze actual data
    data_rows = rows[1:6]  # Sample first 5 data rows
    if not data_rows:
        return []

    num_cols = max(len(row) for row in data_rows)
    if num_cols == 0:
        return []

    # Score each column for likelihood of being date/amount/description
    date_scores = [0] * num_cols
    amount_scores = [0] * num_cols
    text_scores = [0] * num_cols

    for row in data_rows:
        for col_idx in range(min(len(row), num_cols)):
            cell = str(row[col_idx]).strip() if row[col_idx] else ""
            if not cell:
                continue

            # Check if looks like date
            if re.match(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', cell) or \
               re.match(r'\d{4}[/-]\d{1,2}[/-]\d{1,2}', cell):
                date_scores[col_idx] += 1

            # Check if looks like amount
            if re.match(r'^-?\$?\d+\.?\d*$', cell.replace(',', '').replace(' ', '')):
                amount_scores[col_idx] += 1

            # Check if looks like text description (longer text)
            if len(cell) > 5 and not cell.replace('.', '').replace('-', '').isdigit():
                text_scores[col_idx] += 0.5

    # Find best candidates
    date_col = date_scores.index(max(date_scores)) if max(date_scores) > 0 else None
    amount_col = amount_scores.index(max(amount_scores)) if max(amount_scores) > 0 else None
    text_col = text_scores.index(max(text_scores)) if max(text_scores) > 0 else None

    if date_col is None or amount_col is None:
        return []

    # Use the text column with highest score, or fallback to first non-date/amount column
    if text_col is None:
        for i in range(num_cols):
            if i != date_col and i != amount_col:
                text_col = i
                break

    if text_col is None:
        text_col = 0  # Fallback

    # Extract transactions
    transactions = []
    for row in rows[1:]:  # Skip header
        if len(row) <= max(date_col or 0, amount_col or 0, text_col or 0):
            continue

        date_str = _parse_date(row[date_col])
        amount = _parse_amount(row[amount_col])
        description = str(row[text_col]).strip() if row[text_col] else "Transaction"

        if date_str and amount is not None and amount != 0:
            transactions.append({
                "date": date_str,
                "amount": amount,
                "currency": "MYR",
                "description": description,
                "reference": None,
            })

    return transactions


def parse_statement(file_bytes: bytes, filename: str) -> list[dict]:
    """
    Main entry point for parsing bank statements.
    Auto-detects format based on filename.
    Uses smart heuristics and AI fallback for maximum compatibility.
    """
    filename_lower = filename.lower()

    try:
        if filename_lower.endswith(".csv"):
            return parse_csv(file_bytes)
        elif filename_lower.endswith((".xlsx", ".xls")):
            return parse_xlsx(file_bytes)
        else:
            raise ValueError(f"Unsupported file format: {filename}")
    except ValueError as e:
        # If column detection failed, try AI-powered parsing
        if "Could not detect" in str(e):
            try:
                return _parse_with_ai(file_bytes, filename)
            except Exception as ai_error:
                # If AI also fails, raise original error with helpful message
                raise ValueError(
                    f"Unable to parse statement. {str(e)} "
                    f"Tried AI parsing but got: {str(ai_error)}"
                )
        raise


def _parse_with_ai(file_bytes: bytes, filename: str) -> list[dict]:
    """
    Fallback: Use AI to parse the statement when column detection fails.
    """
    from app.extraction import _call_bedrock_excel, extract_from_excel

    # Convert to CSV string for AI
    csv_content = extract_from_excel(file_bytes, filename)

    if not csv_content:
        raise ValueError("File is empty or unreadable")

    # Use AI to extract transactions
    transactions_data = _call_bedrock_excel(csv_content)

    # Normalize the AI response
    result = []
    for item in transactions_data:
        # Try to extract required fields with various field names
        date = item.get('date') or item.get('transaction_date') or item.get('value_date')
        amount = item.get('amount') or item.get('value') or item.get('total')
        description = item.get('description') or item.get('details') or item.get('particulars') or item.get('payee')

        if date and amount:
            result.append({
                "date": date if isinstance(date, str) else str(date),
                "amount": float(amount) if amount else 0.0,
                "currency": item.get('currency', 'MYR'),
                "description": str(description) if description else "Transaction",
                "reference": item.get('reference'),
            })

    if not result:
        raise ValueError("AI could not extract any valid transactions from the file")

    return result
