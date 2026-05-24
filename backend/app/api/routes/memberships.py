from fastapi import APIRouter, HTTPException
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Membership,
    MembershipPublic,
    MembershipsPublic,
    MembershipCreate,
    MembershipUpdate,
    Organization,
    User,
    MemberWithUser,
    MembersWithUsersPublic,
)
from sqlmodel import select
import uuid

router = APIRouter(prefix="/memberships", tags=["memberships"])


@router.get("/my-organizations", response_model=MembershipsPublic)
def list_my_organizations(
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    List all organizations the current user belongs to.
    Returns memberships with organization details.
    """
    memberships = session.exec(
        select(Membership).where(Membership.user_id == current_user.id)
    ).all()

    return MembershipsPublic(
        data=[MembershipPublic.model_validate(m) for m in memberships],
        count=len(memberships),
    )


@router.get("/organization/{organization_id}/members", response_model=MembersWithUsersPublic)
def list_organization_members(
    organization_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    List all members of an organization with user details.
    User must be a member of the organization to view this.
    """
    # Check if user is member of this organization
    user_membership = session.exec(
        select(Membership)
        .where(Membership.user_id == current_user.id)
        .where(Membership.organization_id == organization_id)
    ).first()

    if not user_membership and not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to view members of this organization",
        )

    # Get memberships with user information using JOIN
    memberships = session.exec(
        select(Membership, User)
        .join(User, Membership.user_id == User.id)
        .where(Membership.organization_id == organization_id)
        .order_by(Membership.joined_at)
    ).all()

    # Build response with user details
    members = []
    for membership, user in memberships:
        members.append(
            MemberWithUser(
                id=membership.id,
                user_id=membership.user_id,
                organization_id=membership.organization_id,
                role=membership.role,
                joined_at=membership.joined_at,
                user_email=user.email,
                user_full_name=user.full_name,
                user_is_active=user.is_active,
            )
        )

    return MembersWithUsersPublic(
        data=members,
        count=len(members),
    )


@router.post("/organization/{organization_id}/members", response_model=MembershipPublic)
def add_organization_member(
    organization_id: uuid.UUID,
    membership_in: MembershipCreate,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Add a new member to an organization.
    Only OWNER or ADMIN can add members.
    """
    # Check if current user has permission
    user_membership = session.exec(
        select(Membership)
        .where(Membership.user_id == current_user.id)
        .where(Membership.organization_id == organization_id)
    ).first()

    if not user_membership or user_membership.role not in ["OWNER", "ADMIN"]:
        if not current_user.is_superuser:
            raise HTTPException(
                status_code=403,
                detail="Only OWNER or ADMIN can add members",
            )

    # Check if membership already exists
    existing = session.exec(
        select(Membership)
        .where(Membership.user_id == membership_in.user_id)
        .where(Membership.organization_id == organization_id)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="User is already a member of this organization",
        )

    # Create membership
    membership = Membership.model_validate(membership_in)
    session.add(membership)
    session.commit()
    session.refresh(membership)

    return MembershipPublic.model_validate(membership)


@router.patch("/memberships/{membership_id}", response_model=MembershipPublic)
def update_membership(
    membership_id: uuid.UUID,
    membership_in: MembershipUpdate,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Update a membership (change role).
    Only OWNER can change roles.
    """
    membership = session.get(Membership, membership_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    # Check if current user has permission
    user_membership = session.exec(
        select(Membership)
        .where(Membership.user_id == current_user.id)
        .where(Membership.organization_id == membership.organization_id)
    ).first()

    if not user_membership or user_membership.role != "OWNER":
        if not current_user.is_superuser:
            raise HTTPException(
                status_code=403,
                detail="Only OWNER can change member roles",
            )

    # Update role
    membership.role = membership_in.role
    session.add(membership)
    session.commit()
    session.refresh(membership)

    return MembershipPublic.model_validate(membership)


@router.delete("/memberships/{membership_id}")
def remove_membership(
    membership_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Remove a member from an organization.
    Only OWNER or ADMIN can remove members.
    Cannot remove the last OWNER.
    """
    membership = session.get(Membership, membership_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    # Check if current user has permission
    user_membership = session.exec(
        select(Membership)
        .where(Membership.user_id == current_user.id)
        .where(Membership.organization_id == membership.organization_id)
    ).first()

    if not user_membership or user_membership.role not in ["OWNER", "ADMIN"]:
        if not current_user.is_superuser:
            raise HTTPException(
                status_code=403,
                detail="Only OWNER or ADMIN can remove members",
            )

    # Check if this is the last OWNER
    if membership.role == "OWNER":
        owner_count = session.exec(
            select(Membership)
            .where(Membership.organization_id == membership.organization_id)
            .where(Membership.role == "OWNER")
        ).all()

        if len(owner_count) <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last OWNER of an organization",
            )

    session.delete(membership)
    session.commit()

    return {"message": "Member removed successfully"}
