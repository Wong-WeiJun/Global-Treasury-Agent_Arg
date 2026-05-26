from fastapi import APIRouter

from app.api.routes import (
    file,
    fx,
    invitations,
    learning,
    login,
    memberships,
    orchestrated_reconciliation,
    organizations,
    private,
    reconciliation,
    reports,
    review,
    statements,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(file.router)
api_router.include_router(fx.router)
api_router.include_router(reconciliation.router)
api_router.include_router(orchestrated_reconciliation.router)
api_router.include_router(reports.router)
api_router.include_router(review.router)
api_router.include_router(learning.router)
api_router.include_router(organizations.router)
api_router.include_router(memberships.router)
api_router.include_router(invitations.router)
api_router.include_router(statements.router, prefix="/statements", tags=["statements"])

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
