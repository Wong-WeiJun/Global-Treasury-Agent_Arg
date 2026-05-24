from fastapi import APIRouter, HTTPException
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Organization,
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationPublic,
    OrganizationsPublic,
)
from sqlmodel import select, func
import uuid

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=OrganizationsPublic)
def list_organizations(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
):
    """
    List all organizations.
    Regular users can only see their own organization.
    Superusers can see all organizations.
    """
    if current_user.is_superuser:
        count = session.exec(select(func.count()).select_from(Organization)).one()
        orgs = session.exec(select(Organization).offset(skip).limit(limit)).all()
    else:
        if not current_user.organization_id:
            return OrganizationsPublic(data=[], count=0)
        
        org = session.get(Organization, current_user.organization_id)
        if not org:
            return OrganizationsPublic(data=[], count=0)
        
        return OrganizationsPublic(
            data=[OrganizationPublic.model_validate(org)],
            count=1,
        )

    return OrganizationsPublic(
        data=[OrganizationPublic.model_validate(org) for org in orgs],
        count=count,
    )


@router.get("/{organization_id}", response_model=OrganizationPublic)
def get_organization(
    organization_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Get organization by ID.
    Regular users can only access their own organization.
    Superusers can access any organization.
    """
    org = session.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check permissions
    if not current_user.is_superuser:
        if current_user.organization_id != organization_id:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this organization",
            )

    return OrganizationPublic.model_validate(org)


@router.post("", response_model=OrganizationPublic)
def create_organization(
    org_in: OrganizationCreate,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Create a new organization.
    Regular users can create their first organization (onboarding flow).
    Users with existing organizations need superuser permission to create additional ones.
    """
    # Allow users without an organization to create their first one (onboarding)
    if current_user.organization_id and not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="You already belong to an organization. Only superusers can create additional organizations.",
        )

    # Create organization
    org = Organization.model_validate(org_in, update={"created_by": current_user.id})
    session.add(org)
    session.commit()
    session.refresh(org)

    # Create membership for creator as OWNER
    from app.models import Membership
    membership = Membership(
        user_id=current_user.id,
        organization_id=org.id,
        role="OWNER",
    )
    session.add(membership)

    # Update user's organization_id
    current_user.organization_id = org.id
    session.add(current_user)

    session.commit()
    session.refresh(org)

    return OrganizationPublic.model_validate(org)


@router.patch("/{organization_id}", response_model=OrganizationPublic)
def update_organization(
    organization_id: uuid.UUID,
    org_in: OrganizationUpdate,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Update organization settings.
    Only superusers can update organizations.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Only superusers can update organizations",
        )

    org = session.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Update fields
    update_data = org_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(org, key, value)

    session.add(org)
    session.commit()
    session.refresh(org)

    return OrganizationPublic.model_validate(org)


@router.delete("/{organization_id}")
def delete_organization(
    organization_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Delete an organization.
    Only superusers can delete organizations.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Only superusers can delete organizations",
        )

    org = session.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    session.delete(org)
    session.commit()

    return {"message": "Organization deleted successfully"}


@router.get("/{organization_id}/settings", response_model=OrganizationPublic)
def get_organization_settings(
    organization_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Get organization settings (alias for get_organization).
    Useful for frontend to distinguish settings endpoint.
    """
    return get_organization(organization_id, session, current_user)


@router.patch("/{organization_id}/settings", response_model=OrganizationPublic)
def update_organization_settings(
    organization_id: uuid.UUID,
    org_in: OrganizationUpdate,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Update organization settings.
    Only superusers can update organization settings.
    """
    return update_organization(organization_id, org_in, session, current_user)
