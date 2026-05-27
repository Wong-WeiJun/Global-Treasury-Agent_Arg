import httpx

BASE_URL = "https://api.frankfurter.dev/v2"


async def _fetch(endpoint: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{BASE_URL}/{endpoint}", params=params or {})
        response.raise_for_status()
        return response.json()


async def list_currencies() -> dict:
    return await _fetch("currencies")


async def get_rate(
    from_currency: str,
    to_currency: str,
    on_date: str = "latest",
) -> float:

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
