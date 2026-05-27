import uuid

from fastapi import APIRouter, HTTPException
from sqlmodel import delete, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Document,
    Invitation,
    Item,
    Membership,
    MembershipCreate,
    MembershipPublic,
    MembershipsPublic,
    MembershipUpdate,
    MembersWithUsersPublic,
    MemberWithUser,
    Organization,
    ReconciliationRecord,
    User,
)

router = APIRouter(prefix="/memberships", tags=["memberships"])


@router.get("/my-organizations", response_model=MembershipsPublic)
def list_my_organizations(
    session: SessionDep,
    current_user: CurrentUser,
):

    memberships = session.exec(
        select(Membership).where(Membership.user_id == current_user.id)
    ).all()

    return MembershipsPublic(
        data=[MembershipPublic.model_validate(m) for m in memberships],
        count=len(memberships),
    )


@router.get(
    "/organization/{organization_id}/members", response_model=MembersWithUsersPublic
)
def list_organization_members(
    organization_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):

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

    # Prevent removing yourself
    if membership.user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot remove yourself from the organization",
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

    # Get the user before deleting membership
    user_to_delete = session.get(User, membership.user_id)

    # Delete the user account and all related data
    if user_to_delete and not user_to_delete.is_superuser:
        # Use no_autoflush to prevent premature flushes while updating foreign key references
        with session.no_autoflush:
            # Clear created_by references in organizations (set to NULL)
            organizations_created = session.exec(
                select(Organization).where(Organization.created_by == user_to_delete.id)
            ).all()
            for org in organizations_created:
                org.created_by = None
                session.add(org)

            # Delete user's owned documents
            session.exec(delete(Document).where(Document.owner_id == user_to_delete.id))

            # Clear reviewed_by references in documents (set to NULL)
            documents_reviewed = session.exec(
                select(Document).where(Document.reviewed_by == user_to_delete.id)
            ).all()
            for doc in documents_reviewed:
                doc.reviewed_by = None
                session.add(doc)

            # Clear reviewed_by references in reconciliation records (set to NULL)
            recon_records = session.exec(
                select(ReconciliationRecord).where(
                    ReconciliationRecord.reviewed_by == user_to_delete.id
                )
            ).all()
            for record in recon_records:
                record.reviewed_by = None
                session.add(record)

            # Delete user's items
            session.exec(delete(Item).where(Item.owner_id == user_to_delete.id))

            # Delete invitations sent by this user
            session.exec(
                delete(Invitation).where(Invitation.invited_by == user_to_delete.id)
            )

            # Delete the membership
            session.delete(membership)

            # Delete the user account
            session.delete(user_to_delete)
    else:
        # Just delete the membership if user is superuser or doesn't exist
        session.delete(membership)

    session.commit()

    return {"message": "Member removed and user account deleted successfully"}
