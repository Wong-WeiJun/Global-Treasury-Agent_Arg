import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, delete, func, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.models import (
    Document,
    Invitation,
    Item,
    Membership,
    Message,
    Organization,
    ReconciliationRecord,
    UpdatePassword,
    User,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.utils import generate_new_account_email, send_email

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
def read_users(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve users.
    """

    count_statement = select(func.count()).select_from(User)
    count = session.exec(count_statement).one()

    statement = (
        select(User).order_by(col(User.created_at).desc()).offset(skip).limit(limit)
    )
    users = session.exec(statement).all()

    users_public = [UserPublic.model_validate(user) for user in users]
    return UsersPublic(data=users_public, count=count)


@router.post(
    "/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic
)
def create_user(*, session: SessionDep, user_in: UserCreate) -> Any:
    """
    Create new user.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )

    user = crud.create_user(session=session, user_create=user_in)
    if settings.emails_enabled and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.patch("/me", response_model=UserPublic)
def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    """
    Update own user.
    """

    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )
    user_data = user_in.model_dump(exclude_unset=True)
    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """
    Update own password.
    """
    verified, _ = verify_password(body.current_password, current_user.hashed_password)
    if not verified:
        raise HTTPException(status_code=400, detail="Incorrect password")
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400, detail="New password cannot be the same as the current one"
        )
    hashed_password = get_password_hash(body.new_password)
    current_user.hashed_password = hashed_password
    session.add(current_user)
    session.commit()
    return Message(message="Password updated successfully")


@router.get("/me", response_model=UserPublic)
def read_user_me(current_user: CurrentUser) -> Any:
    """
    Get current user.
    """
    return current_user


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user.
    If the user is an OWNER of an organization, the entire organization
    and all its members will be deleted.
    """
    if current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )

    # Check if user is an OWNER of any organization
    owner_membership = session.exec(
        select(Membership)
        .where(Membership.user_id == current_user.id)
        .where(Membership.role == "OWNER")
    ).first()

    if owner_membership:
        # User is an OWNER - delete the entire organization and all members
        organization = session.get(Organization, owner_membership.organization_id)

        if organization:
            # Get all members of this organization
            all_memberships = session.exec(
                select(Membership).where(Membership.organization_id == organization.id)
            ).all()

            # Delete organization-wide data first
            # Delete all invitations for this organization
            session.exec(
                delete(Invitation).where(Invitation.organization_id == organization.id)
            )

            # Delete all reconciliation records for this organization
            session.exec(
                delete(ReconciliationRecord).where(
                    ReconciliationRecord.organization_id == organization.id
                )
            )

            # Delete all documents for this organization
            session.exec(
                delete(Document).where(Document.organization_id == organization.id)
            )

            # Delete all member user accounts (except superusers)
            for membership in all_memberships:
                member_user = session.get(User, membership.user_id)
                if member_user and not member_user.is_superuser:
                    # Delete user's items
                    session.exec(delete(Item).where(Item.owner_id == member_user.id))
                    # Delete invitations sent by this user
                    session.exec(
                        delete(Invitation).where(
                            Invitation.invited_by == member_user.id
                        )
                    )
                    # Delete the membership
                    session.delete(membership)
                    # Delete the user
                    session.delete(member_user)

            # Delete the organization
            session.delete(organization)
            session.commit()

            return Message(
                message="Organization deleted successfully. All members have been removed."
            )

    # User is not an OWNER, just delete their own account
    # Use no_autoflush to prevent premature flushes while updating foreign key references
    with session.no_autoflush:
        # First, delete all their memberships
        user_memberships = session.exec(
            select(Membership).where(Membership.user_id == current_user.id)
        ).all()
        for membership in user_memberships:
            session.delete(membership)

        # Clear created_by references in organizations (set to NULL)
        organizations_created = session.exec(
            select(Organization).where(Organization.created_by == current_user.id)
        ).all()
        for org in organizations_created:
            org.created_by = None
            session.add(org)

        # Delete user's owned documents
        session.exec(delete(Document).where(Document.owner_id == current_user.id))

        # Clear reviewed_by references in documents (set to NULL)
        documents_reviewed = session.exec(
            select(Document).where(Document.reviewed_by == current_user.id)
        ).all()
        for doc in documents_reviewed:
            doc.reviewed_by = None
            session.add(doc)

        # Clear reviewed_by references in reconciliation records (set to NULL)
        recon_records = session.exec(
            select(ReconciliationRecord).where(
                ReconciliationRecord.reviewed_by == current_user.id
            )
        ).all()
        for record in recon_records:
            record.reviewed_by = None
            session.add(record)

        # Delete user's items
        session.exec(delete(Item).where(Item.owner_id == current_user.id))

        # Delete invitations sent by this user
        session.exec(delete(Invitation).where(Invitation.invited_by == current_user.id))

        # Now delete the user account
        session.delete(current_user)

    # Commit all changes at once
    session.commit()
    return Message(message="User deleted successfully")


@router.post("/signup", response_model=UserPublic)
def register_user(session: SessionDep, user_in: UserRegister) -> Any:
    """
    Create new user without the need to be logged in.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    user_create = UserCreate.model_validate(user_in)
    user = crud.create_user(session=session, user_create=user_create)
    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = session.get(User, user_id)
    if user == current_user:
        return user
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
) -> Any:
    """
    Update a user.
    """

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )

    db_user = crud.update_user(session=session, db_user=db_user, user_in=user_in)
    return db_user


@router.delete("/{user_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_user(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> Message:
    """
    Delete a user.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user == current_user:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )
    statement = delete(Item).where(col(Item.owner_id) == user_id)
    session.exec(statement)
    session.delete(user)
    session.commit()
    return Message(message="User deleted successfully")
