import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    Invitation,
    InvitationAccept,
    InvitationCreate,
    InvitationPublic,
    Membership,
    Organization,
    User,
    UserCreate,
)
from app.utils import send_email

router = APIRouter(prefix="/invitations", tags=["invitations"])


def generate_invitation_token() -> str:
    """Generate a secure random token for invitation."""
    return secrets.token_urlsafe(32)


@router.post("/{organization_id}/invite", response_model=InvitationPublic)
async def invite_member(
    organization_id: uuid.UUID,
    invitation_in: InvitationCreate,
    current_user: CurrentUser,
    session: SessionDep,
):
    """
    Invite a new member to the organization.
    Only OWNER or ADMIN can invite members.
    """
    from app.utils.org_context import check_organization_access

    # Check if user has permission to invite
    membership = check_organization_access(
        session, current_user.id, organization_id, required_roles=["OWNER", "ADMIN"]
    )

    # Check if email is already a user in this organization
    existing_user = session.exec(
        select(User).where(User.email == invitation_in.email)
    ).first()
    if existing_user and existing_user.organization_id == organization_id:
        raise HTTPException(
            status_code=400,
            detail="User is already a member of this organization",
        )

    # Check if there's a pending invitation for this email
    existing_invitation = session.exec(
        select(Invitation)
        .where(Invitation.email == invitation_in.email)
        .where(Invitation.organization_id == organization_id)
        .where(Invitation.accepted_at.is_(None))
    ).first()

    if existing_invitation:
        # Resend invitation by updating expiry
        existing_invitation.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        existing_invitation.role = invitation_in.role
        session.add(existing_invitation)
        session.commit()
        session.refresh(existing_invitation)
        invitation = existing_invitation
    else:
        # Create new invitation
        token = generate_invitation_token()
        invitation = Invitation(
            email=invitation_in.email,
            organization_id=organization_id,
            role=invitation_in.role,
            invited_by=current_user.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        session.add(invitation)
        session.commit()
        session.refresh(invitation)

    # Get organization details
    org = session.get(Organization, organization_id)

    # Send invitation email
    invitation_link = (
        f"{settings.FRONTEND_HOST}/accept-invitation?token={invitation.token}"
    )

    email_html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h2 style="color: #333;">You're invited to join {org.name}!</h2>
                <p style="color: #666;">
                    {current_user.full_name or current_user.email} has invited you to join their organization
                    on MyAudit as a <strong>{invitation_in.role}</strong>.
                </p>
                <div style="margin: 30px 0;">
                    <a href="{invitation_link}"
                       style="background-color: #2563eb; color: white; padding: 12px 24px;
                              text-decoration: none; border-radius: 6px; display: inline-block;">
                        Accept Invitation
                    </a>
                </div>
                <p style="color: #999; font-size: 14px;">
                    This invitation will expire in 7 days.
                </p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">
                    If you didn't expect this invitation, you can safely ignore this email.
                </p>
            </div>
        </body>
    </html>
    """

    await send_email(
        email_to=invitation_in.email,
        subject=f"Invitation to join {org.name} on MyAudit",
        html_content=email_html,
    )

    return InvitationPublic.model_validate(invitation)


@router.get("/{organization_id}/invitations", response_model=list[InvitationPublic])
def list_invitations(
    organization_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
):
    """
    List all pending invitations for an organization.
    Only OWNER or ADMIN can view invitations.
    """
    from app.utils.org_context import check_organization_access

    # Check if user has permission
    check_organization_access(
        session, current_user.id, organization_id, required_roles=["OWNER", "ADMIN"]
    )

    # Get all pending invitations (filter expired ones in Python to avoid timezone issues)
    now = datetime.now(timezone.utc)
    all_pending = session.exec(
        select(Invitation)
        .where(Invitation.organization_id == organization_id)
        .where(Invitation.accepted_at.is_(None))
    ).all()

    # Filter out expired invitations with proper timezone handling
    invitations = []
    for inv in all_pending:
        expires_at = inv.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at > now:
            invitations.append(inv)

    return [InvitationPublic.model_validate(inv) for inv in invitations]


@router.delete("/{invitation_id}")
def cancel_invitation(
    invitation_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
):
    """
    Cancel a pending invitation.
    Only OWNER or ADMIN can cancel invitations.
    """
    invitation = session.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    from app.utils.org_context import check_organization_access

    # Check if user has permission
    check_organization_access(
        session,
        current_user.id,
        invitation.organization_id,
        required_roles=["OWNER", "ADMIN"],
    )

    session.delete(invitation)
    session.commit()

    return {"message": "Invitation cancelled"}


@router.post("/accept", response_model=dict)
async def accept_invitation(
    accept_data: InvitationAccept,
    session: SessionDep,
):
    """
    Accept an invitation and create a new user account.
    Public endpoint - no authentication required.
    """
    invitation = session.exec(
        select(Invitation).where(Invitation.token == accept_data.token)
    ).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid invitation token")
    if invitation.accepted_at:
        raise HTTPException(status_code=400, detail="Invitation already accepted")

    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation expired")

    existing_user = session.exec(
        select(User).where(User.email == invitation.email)
    ).first()

    if existing_user:
        existing_membership = session.exec(
            select(Membership).where(Membership.user_id == existing_user.id)
        ).first()
        if existing_membership:
            raise HTTPException(
                status_code=400,
                detail="You already belong to an organization. Leave your current organization before accepting a new invitation.",
            )
        membership = Membership(
            user_id=existing_user.id,
            organization_id=invitation.organization_id,
            role=invitation.role,
        )
        session.add(membership)
    else:
        from app import crud

        new_user = crud.create_user(
            session=session,
            user_create=UserCreate(
                email=invitation.email,
                password=accept_data.password,
                full_name=None,
            ),
        )
        new_user.organization_id = invitation.organization_id
        session.add(new_user)
        session.add(
            Membership(
                user_id=new_user.id,
                organization_id=invitation.organization_id,
                role=invitation.role,
            )
        )

    invitation.accepted_at = datetime.now(timezone.utc)
    session.add(invitation)
    session.commit()

    return {
        "message": "Invitation accepted successfully",
        "email": invitation.email,
    }


@router.get("/verify/{token}")
def verify_invitation(
    token: str,
    session: SessionDep,
):
    """
    Verify if an invitation token is valid.
    Public endpoint - returns invitation details without accepting.
    """
    invitation = session.exec(
        select(Invitation).where(Invitation.token == token)
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid invitation token")

    if invitation.accepted_at:
        raise HTTPException(status_code=400, detail="Invitation already accepted")

    # Make both datetimes timezone-aware for comparison
    now = datetime.now(timezone.utc)
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        raise HTTPException(status_code=400, detail="Invitation expired")

    # Get organization name
    org = session.get(Organization, invitation.organization_id)

    return {
        "email": invitation.email,
        "organization_name": org.name if org else "Unknown",
        "role": invitation.role,
        "expires_at": invitation.expires_at,
    }

