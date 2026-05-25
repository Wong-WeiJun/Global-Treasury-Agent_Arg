import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import JSON, Column, DateTime
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore[assignment]
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organization.id"
    )
    display_currency: str | None = Field(default="MYR")  # User preference for viewing
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None
    organization_id: uuid.UUID | None = None
    display_currency: str | None = "MYR"


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore[assignment]


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class Organization(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    slug: str | None = None  # URL-friendly identifier
    base_currency: str = Field(default="MYR")  # Company operates in this currency
    timezone: str = Field(default="Asia/Kuala_Lumpur")
    fx_provider: str = Field(default="frankfurter")
    created_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class OrganizationPublic(SQLModel):
    id: uuid.UUID
    name: str
    base_currency: str
    timezone: str
    fx_provider: str
    created_at: datetime


class OrganizationCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    base_currency: str = Field(default="MYR", max_length=3)
    timezone: str = Field(default="Asia/Kuala_Lumpur", max_length=100)
    fx_provider: str = Field(default="frankfurter", max_length=50)


class OrganizationUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    base_currency: str | None = Field(default=None, max_length=3)
    timezone: str | None = Field(default=None, max_length=100)
    fx_provider: str | None = Field(default=None, max_length=50)


class OrganizationsPublic(SQLModel):
    data: list[OrganizationPublic]
    count: int


# Membership roles for RBAC
class MembershipRole(str):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    FINANCE_MANAGER = "FINANCE_MANAGER"
    ANALYST = "ANALYST"
    VIEWER = "VIEWER"


class Membership(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)
    role: str = Field(
        default="VIEWER"
    )  # OWNER, ADMIN, FINANCE_MANAGER, ANALYST, VIEWER
    joined_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class MembershipPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    role: str
    joined_at: datetime


class MembershipCreate(SQLModel):
    user_id: uuid.UUID
    organization_id: uuid.UUID
    role: str = Field(default="VIEWER")


class MembershipUpdate(SQLModel):
    role: str


class MembershipsPublic(SQLModel):
    data: list[MembershipPublic]
    count: int


class MemberWithUser(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    role: str
    joined_at: datetime
    user_email: str
    user_full_name: str | None
    user_is_active: bool


class MembersWithUsersPublic(BaseModel):
    data: list[MemberWithUser]
    count: int


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []  # [{"role": "user", "content": "..."}, ...]


class ChatResponse(BaseModel):
    reply: str


class Document(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)
    original_filename: str
    s3_key: str
    file_type: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    extracted_data: dict | None = Field(default=None, sa_column=Column(JSON))
    reconciliation_result: dict | None = Field(default=None, sa_column=Column(JSON))
    orchestration_result: dict | None = Field(default=None, sa_column=Column(JSON))  # Results from orchestration agent

    # Multi-Currency Architecture
    # 1. Original Currency (what customer actually paid - NEVER overwrite)
    original_amount: float | None = None
    original_currency: str | None = None
    transaction_date: str | None = None  # YYYY-MM-DD format

    # 2. Base Currency (normalized for reconciliation - company operates in this)
    base_amount: float | None = None
    base_currency: str | None = Field(default="MYR")
    fx_rate_used: float | None = None
    fx_rate_date: str | None = None  # Date used for historical FX lookup
    fx_rate_timestamp: datetime | None = None  # When FX conversion was performed

    # AI Result (machine-generated, never overwritten by human action)
    ai_result: str | None = Field(
        default=None
    )  # "MATCHED" | "FUZZY_MATCH" | "UNMATCHED"
    ai_confidence: float | None = None  # 0.0 to 1.0
    ai_explanation: str | None = None  # Why AI made this decision

    # Workflow Status (human-driven business decision)
    workflow_status: str = Field(default="PENDING_EXTRACTION")
    # Possible values: "PENDING_EXTRACTION" | "EXTRACTED" | "PENDING_ACTION" | "APPROVED" | "UNDER_REVIEW" | "EXCEPTION_APPROVED" | "REJECTED"

    # Review/Decision metadata
    review_status: str | None = None  # Deprecated: use workflow_status
    review_note: str | None = None
    reviewed_at: datetime | None = None
    reviewed_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    exception_type: str | None = None
    case_id: str | None = None
    risk_score: int | None = None
    risk_level: str | None = None  # "LOW" | "MEDIUM" | "HIGH"


class DocumentPublic(SQLModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    original_filename: str
    s3_key: str
    file_type: str
    uploaded_at: datetime
    extracted_data: dict | None = None
    reconciliation_result: dict | None = None
    orchestration_result: dict | None = None

    # Multi-Currency fields
    original_amount: float | None = None
    original_currency: str | None = None
    transaction_date: str | None = None
    base_amount: float | None = None
    base_currency: str | None = "MYR"
    fx_rate_used: float | None = None
    fx_rate_date: str | None = None
    fx_rate_timestamp: datetime | None = None

    # AI Result (immutable after AI processing)
    ai_result: str | None = None
    ai_confidence: float | None = None
    ai_explanation: str | None = None

    # Workflow Status (mutable by human actions)
    workflow_status: str = "PENDING_EXTRACTION"

    # Review/Decision metadata
    review_status: str | None = None
    review_note: str | None = None
    reviewed_at: datetime | None = None
    reviewed_by: uuid.UUID | None = None
    exception_type: str | None = None
    case_id: str | None = None
    risk_score: int | None = None
    risk_level: str | None = None


class DocumentsPublic(SQLModel):
    data: list[DocumentPublic]
    count: int


class UploadResponse(BaseModel):
    document: DocumentPublic


class ExtractedData(BaseModel):
    amount: float | None = None
    currency: str | None = None
    date: str | None = None
    payer: str | None = None
    payee: str | None = None
    description: str | None = None
    myr_amount: float | None = None
    fx_rate: float | None = None


class ExtractionResponse(BaseModel):
    document_id: uuid.UUID
    extracted: ExtractedData | None = None
    rows: list[ExtractedData] | None = None  # for Excel with multiple rows
    error: str | None = None


class BankEntry(BaseModel):
    amount: float
    date: str
    description: str | None = None
    payer: str | None = None

    @field_validator("amount", mode="before")
    @classmethod
    def clean_amount(cls, v: any) -> float:
        if isinstance(v, str):
            # Remove spaces and commas (e.g. "1,000.50" -> "1000.50")
            clean_v = v.replace(",", "").strip()
            if not clean_v:
                raise ValueError("Amount cannot be empty.")
            try:
                return float(clean_v)
            except ValueError:
                raise ValueError(f"'{v}' is not a valid numeric amount.")
        return float(v)


class ReconcileRequest(BaseModel):
    document_id: uuid.UUID
    bank_entries: list[BankEntry]
    override_date: str | None = None


class ReconcileResponse(BaseModel):
    document_id: uuid.UUID
    result: dict


class ReconciliationRecord(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    document_id: uuid.UUID = Field(foreign_key="document.id", nullable=False)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reviewed_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")

    # Match data
    confidence: float
    risk_score: int
    risk_level: str | None = None  # "LOW" | "MEDIUM" | "HIGH"
    fx_rate: float | None = None
    normalized_amount_myr: float | None = None  # Deprecated: use base_amount
    base_currency: str | None = Field(default="MYR")  # Currency used for reconciliation
    base_amount: float | None = None  # Amount in base currency

    # Decision
    action: str  # "approved" | "flagged" | "exception" | "rejected"
    exception_type: str | None = (
        None  # "BANK_FEE" | "PARTIAL_PAYMENT" | "FX_SPREAD" etc.
    )
    note: str | None = None
    ai_explanation: str | None = None

    # Investigation (for flagged)
    case_id: str | None = None
    assigned_to: str | None = None
    priority: str | None = None  # "low" | "medium" | "high"
    risk_factors: dict | None = Field(default=None, sa_column=Column(JSON))

    # Accounting (for approved/exception)
    journal_entry: dict | None = Field(default=None, sa_column=Column(JSON))


class ReconciliationRecordPublic(SQLModel):
    id: uuid.UUID
    document_id: uuid.UUID
    created_at: datetime
    reviewed_by: uuid.UUID | None
    confidence: float
    risk_score: int
    risk_level: str | None
    fx_rate: float | None
    normalized_amount_myr: float | None  # Deprecated
    base_currency: str | None
    base_amount: float | None
    action: str
    exception_type: str | None
    note: str | None
    ai_explanation: str | None
    case_id: str | None
    assigned_to: str | None
    priority: str | None
    risk_factors: dict | None
    journal_entry: dict | None


class ReviewActionRequest(BaseModel):
    action: str  # "approved" | "flagged" | "exception"
    note: str | None = None
    exception_type: str | None = None  # required when action == "exception"
    # For flagged
    priority: str | None = None  # "low" | "medium" | "high"


class ReviewRequest(BaseModel):
    status: str  # "approved" | "flagged" | "exception"
    note: str | None = None


class AskAIRequest(BaseModel):
    question: str


class Invitation(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(index=True)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)
    role: str = Field(default="VIEWER")
    invited_by: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    token: str = Field(unique=True, index=True)
    expires_at: datetime
    accepted_at: datetime | None = None
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class InvitationPublic(SQLModel):
    id: uuid.UUID
    email: str
    organization_id: uuid.UUID
    role: str
    invited_by: uuid.UUID
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime


class InvitationCreate(SQLModel):
    email: EmailStr
    role: str = Field(default="VIEWER")


class InvitationAccept(SQLModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class BankStatement(SQLModel, table=True):
    """Uploaded bank statement file"""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)
    uploaded_by: uuid.UUID = Field(foreign_key="user.id", nullable=False)

    original_filename: str
    s3_key: str
    file_hash: str = Field(index=True)  # SHA256 for duplicate detection

    uploaded_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    parsed_at: datetime | None = None

    # Metadata
    statement_month: str | None = None  # e.g., "2026-05"
    bank_name: str | None = None
    account_number: str | None = None


class BankStatementPublic(SQLModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    uploaded_by: uuid.UUID
    original_filename: str
    uploaded_at: datetime
    parsed_at: datetime | None
    statement_month: str | None
    bank_name: str | None
    account_number: str | None


class BankTransaction(SQLModel, table=True):
    """Individual transaction parsed from a bank statement"""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    statement_id: uuid.UUID = Field(foreign_key="bankstatement.id", nullable=False)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)

    # Transaction data
    date: str  # YYYY-MM-DD
    amount: float
    currency: str = Field(default="MYR")
    description: str
    reference: str | None = None

    # Reconciliation state
    matched_document_id: uuid.UUID | None = Field(
        default=None, foreign_key="document.id"
    )
    confidence_score: float | None = None
    status: str = Field(default="unmatched")  # "unmatched" | "suggested" | "confirmed"

    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class BankTransactionPublic(SQLModel):
    id: uuid.UUID
    statement_id: uuid.UUID
    organization_id: uuid.UUID
    date: str
    amount: float
    currency: str
    description: str
    reference: str | None
    matched_document_id: uuid.UUID | None
    confidence_score: float | None
    status: str


class BankTransactionsPublic(SQLModel):
    data: list[BankTransactionPublic]
    count: int


# Import AI Learning Models so Alembic discovers them for migrations
# These are defined in ai_learning.py
from app.ai_learning import UserCorrection, VendorPreference, ReconciliationPattern  # noqa

# Re-export for convenience
__all__ = [
    "User",
    "UserCreate",
    "UserUpdate",
    "UserPublic",
    "Item",
    "Document",
    "Organization",
    "Membership",
    "ReconciliationRecord",
    "Invitation",
    "UserCorrection",
    "VendorPreference",
    "ReconciliationPattern",
    "BankStatement",
    "BankTransaction",
]
