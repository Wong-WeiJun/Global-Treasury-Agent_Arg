from fastapi import APIRouter, HTTPException, Query

from app.fx import convert, convert_to_myr, get_rate, list_currencies

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/currencies")
async def currencies():
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
    try:
        return await convert_to_myr(amount, from_currency, on_date)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
