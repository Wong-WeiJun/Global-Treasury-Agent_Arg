from fastapi import APIRouter, HTTPException, Query
from app.fx import list_currencies, convert, convert_to_myr, get_rate


router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/currencies")
async def currencies():
    """List all supported currencies."""
    try:
        return await list_currencies()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/rate/{from_currency}/{to_currency}")
async def currency_rate(
    from_currency: str,
    to_currency: str,
    on_date: str = Query(default="latest", description="YYYY-MM-DD or 'latest'"),
):
    """Get rate between two currencies. Supports historical dates back to 1948."""
    try:
        rate = await get_rate(from_currency, to_currency, on_date)
        return {
            "from": from_currency.upper(),
            "to": to_currency.upper(),
            "rate": rate,
            "date": on_date,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/convert")
async def convert_currency(
    amount: float,
    from_currency: str,
    to_currency: str,
    on_date: str = Query(default="latest", description="YYYY-MM-DD or 'latest'"),
):
    """Convert amount between currencies on a specific date."""
    try:
        return await convert(amount, from_currency, to_currency, on_date)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/convert-to-myr")
async def convert_to_myr_endpoint(
    amount: float,
    from_currency: str,
    on_date: str = Query(default="latest", description="YYYY-MM-DD or 'latest'"),
):
    """Convert any currency to MYR using the rate on the transaction date."""
    try:
        return await convert_to_myr(amount, from_currency, on_date)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
