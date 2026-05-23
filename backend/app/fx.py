"""
FX conversion using Frankfurter API (https://frankfurter.dev)
Free, no API key, sourced from 55 central banks.
Historical rates back to 1948 — works for old receipts.
"""

import httpx

from app.core.config import settings

BASE_URL = "https://api.frankfurter.dev/v2"


# ── Core fetch ────────────────────────────────────────────────────────────────


async def _fetch(endpoint: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{BASE_URL}/{endpoint}", params=params or {})
        response.raise_for_status()
        return response.json()


# ── Public functions ──────────────────────────────────────────────────────────


async def list_currencies() -> dict:
    """Return all supported currency codes and their names."""
    return await _fetch("currencies")


async def get_rate(
    from_currency: str,
    to_currency: str,
    on_date: str = "latest",
) -> float:
    """
    Get exchange rate from one currency to another.
    on_date: "latest" or "YYYY-MM-DD" (supports dates back to 1948)

    Example: get_rate("USD", "MYR") → 4.25
    """
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()

    if from_currency == to_currency:
        return 1.0

    params: dict = {"quotes": to_currency}
    if on_date != "latest":
        params["date"] = on_date

    data = await _fetch(f"rate/{from_currency}/{to_currency}", params)
    return float(data["rate"])


async def convert(
    amount: float,
    from_currency: str,
    to_currency: str,
    on_date: str = "latest",
) -> dict:
    """
    Convert amount between currencies.
    Returns full conversion details for the reconciliation report.

    Example:
        convert(10.0, "USD", "MYR", on_date="2024-03-06")
        → {
            "from_amount": 10.0,
            "from_currency": "USD",
            "to_amount": 47.15,
            "to_currency": "MYR",
            "rate": 4.715,
            "date": "2024-03-06",
        }
    """
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()

    rate = await get_rate(from_currency, to_currency, on_date)
    converted = round(amount * rate, 2)

    return {
        "from_amount": amount,
        "from_currency": from_currency,
        "to_amount": converted,
        "to_currency": to_currency,
        "rate": rate,
        "date": on_date,
    }


async def convert_to_myr(
    amount: float,
    from_currency: str,
    on_date: str = "latest",
) -> dict:
    """Convenience wrapper — always converts to MYR for reconciliation."""
    if from_currency.upper() == "MYR":
        return {
            "from_amount": amount,
            "from_currency": "MYR",
            "to_amount": amount,
            "to_currency": "MYR",
            "rate": 1.0,
            "date": on_date,
        }
    return await convert(amount, from_currency, "MYR", on_date)

