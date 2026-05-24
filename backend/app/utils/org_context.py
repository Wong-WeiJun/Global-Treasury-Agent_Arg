"""
Organization context utilities for multi-tenant isolation.
"""

import uuid

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import Membership, Organization


def get_user_organizations(session: Session, user_id: uuid.UUID) -> list[Organization]:
    """Get all organizations a user belongs to."""
    memberships = session.exec(
        select(Membership).where(Membership.user_id == user_id)
    ).all()

    org_ids = [m.organization_id for m in memberships]
    if not org_ids:
        return []

    orgs = session.exec(select(Organization).where(Organization.id.in_(org_ids))).all()

    return list(orgs)


def get_user_primary_organization(
    session: Session, user_id: uuid.UUID
) -> Organization | None:
    """
    Get user's primary organization.
    Returns the first organization they're a member of, prioritizing OWNER role.
    """
    # Try to get OWNER role first
    owner_membership = session.exec(
        select(Membership)
        .where(Membership.user_id == user_id)
        .where(Membership.role == "OWNER")
    ).first()

    if owner_membership:
        return session.get(Organization, owner_membership.organization_id)

    # Otherwise get any membership
    membership = session.exec(
        select(Membership).where(Membership.user_id == user_id)
    ).first()

    if membership:
        return session.get(Organization, membership.organization_id)

    return None


def check_organization_access(
    session: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    required_roles: list[str] | None = None,
) -> Membership:
    """
    Check if user has access to an organization.
    Optionally check if user has one of the required roles.
    Returns the membership if access is granted, raises HTTPException otherwise.
    """
    membership = session.exec(
        select(Membership)
        .where(Membership.user_id == user_id)
        .where(Membership.organization_id == organization_id)
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this organization",
        )

    if required_roles and membership.role not in required_roles:
        raise HTTPException(
            status_code=403,
            detail=f"This action requires one of these roles: {', '.join(required_roles)}",
        )

    return membership


def get_user_role_in_organization(
    session: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> str | None:
    """Get user's role in a specific organization. Returns None if not a member."""
    membership = session.exec(
        select(Membership)
        .where(Membership.user_id == user_id)
        .where(Membership.organization_id == organization_id)
    ).first()

    return membership.role if membership else None
