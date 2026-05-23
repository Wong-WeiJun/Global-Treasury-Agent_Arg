from fastapi import APIRouter

from app.api.routes import (
    items,
    login,
    private,
    users,
    utils,
    file,
    chat,
    fx,
    reconciliation,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(file.router)
api_router.include_router(fx.router)
api_router.include_router(reconciliation.router)

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
