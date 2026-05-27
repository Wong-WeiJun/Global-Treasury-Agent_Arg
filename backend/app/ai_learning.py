import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Text
from sqlmodel import Field, SQLModel

# Import these models in app/models.py to ensure Alembic discovers them


class UserCorrection(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    document_id: uuid.UUID = Field(foreign_key="document.id", nullable=False)

    # What the AI predicted
    ai_prediction: str  # "matched" | "fuzzy" | "unmatched"
    ai_confidence: float  # 0.0-1.0
    ai_matched_index: int | None = None  # Which bank entry the AI matched to

    # What the user corrected to
    user_decision: str  # "matched" | "rejected" | "exception"
    user_matched_index: int | None = None  # Which bank entry user actually matched to
    user_note: str | None = None

    # Context for learning
    proof_data: dict | None = Field(default=None, sa_column=Column(JSON))
    bank_entries: list | None = Field(default=None, sa_column=Column(JSON))
    match_scores: list | None = Field(default=None, sa_column=Column(JSON))

    # Learning metadata
    correction_type: str | None = (
        None  # "vendor_name_variant" | "bank_fee_pattern" | "timing_mismatch" | "currency_spread"
    )
    learned_pattern: dict | None = Field(
        default=None, sa_column=Column(JSON)
    )  # Extracted learning pattern

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )


class VendorPreference(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)

    # Vendor identity
    canonical_vendor_name: str  # The "correct" vendor name
    vendor_aliases: list[str] | None = Field(
        default=None, sa_column=Column(JSON)
    )  # Known variations

    # Payment patterns
    typical_amount_range: dict | None = Field(
        default=None, sa_column=Column(JSON)
    )  # {"min": 100, "max": 500}
    typical_day_of_month: int | None = None  # e.g., always pays on 15th
    typical_payment_method: str | None = None  # "Bank Transfer" | "Credit Card"
    is_recurring: bool = False
    recurring_frequency: str | None = None  # "monthly" | "weekly" | "quarterly"

    # Learning metadata
    learned_from_count: int = 0  # How many corrections built this pattern
    last_updated: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    confidence: float = 0.0  # 0.0-1.0, based on consistency of corrections


class ReconciliationPattern(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(foreign_key="organization.id", nullable=False)

    pattern_type: (
        str  # "bank_fee" | "late_payment" | "currency_spread" | "partial_payment"
    )
    pattern_name: str  # Human-readable name
    pattern_rule: dict | None = Field(
        default=None, sa_column=Column(JSON)
    )  # The learned rule

    # Example pattern_rule for bank_fee:
    # {
    #   "fee_type": "percentage",
    #   "fee_value": 0.005,  # 0.5%
    #   "applies_to": "all_transfers",
    #   "bank_name": "Maybank"
    # }

    learned_from_count: int = 0
    success_rate: float = 0.0  # How often this pattern was correct
    last_used: datetime | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )


async def record_user_correction(
    session,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    ai_prediction: str,
    ai_confidence: float,
    ai_matched_index: int | None,
    user_decision: str,
    user_matched_index: int | None,
    user_note: str | None,
    proof_data: dict,
    bank_entries: list,
    match_scores: list,
) -> UserCorrection:

    correction = UserCorrection(
        organization_id=organization_id,
        user_id=user_id,
        document_id=document_id,
        ai_prediction=ai_prediction,
        ai_confidence=ai_confidence,
        ai_matched_index=ai_matched_index,
        user_decision=user_decision,
        user_matched_index=user_matched_index,
        user_note=user_note,
        proof_data=proof_data,
        bank_entries=bank_entries,
        match_scores=match_scores,
    )

    # Analyze the correction to identify learned patterns
    learned = await _analyze_correction(
        ai_prediction,
        ai_matched_index,
        user_decision,
        user_matched_index,
        proof_data,
        bank_entries,
        match_scores,
    )

    correction.correction_type = learned.get("type")
    correction.learned_pattern = learned.get("pattern")

    session.add(correction)
    session.commit()
    session.refresh(correction)

    # Update vendor preferences and patterns
    await _update_learned_patterns(
        session, organization_id, correction, proof_data, bank_entries
    )

    return correction


async def _analyze_correction(
    ai_prediction: str,
    ai_matched_index: int | None,
    user_decision: str,
    user_matched_index: int | None,
    proof_data: dict,
    bank_entries: list,
    match_scores: list,
) -> dict:

    # If AI said "unmatched" but user found a match
    if ai_prediction == "unmatched" and user_decision == "matched":
        if user_matched_index is not None and user_matched_index < len(bank_entries):
            user_entry = bank_entries[user_matched_index]
            proof_vendor = proof_data.get("payer") or proof_data.get("payee")
            bank_vendor = user_entry.get("payer") or user_entry.get("description", "")

            # Check if this is a vendor name variation
            if proof_vendor and bank_vendor:
                if (
                    proof_vendor.lower() not in bank_vendor.lower()
                    and bank_vendor.lower() not in proof_vendor.lower()
                ):
                    return {
                        "type": "vendor_name_variant",
                        "pattern": {
                            "proof_vendor": proof_vendor,
                            "bank_vendor": bank_vendor,
                        },
                    }

            # Check if this is a bank fee pattern
            if match_scores and user_matched_index < len(match_scores):
                score_data = match_scores[user_matched_index]
                amount_diff_pct = score_data.get("amount_diff_pct", 0)
                if 0.1 <= amount_diff_pct <= 3.0:  # Small difference, likely bank fee
                    return {
                        "type": "bank_fee_pattern",
                        "pattern": {
                            "fee_percentage": amount_diff_pct,
                            "proof_amount": proof_data.get("amount"),
                            "bank_amount": user_entry.get("amount"),
                        },
                    }

    # If AI said "fuzzy" but user rejected
    if ai_prediction == "fuzzy" and user_decision == "rejected":
        return {
            "type": "false_positive",
            "pattern": {
                "reason": "AI thought it was fuzzy but user rejected",
            },
        }

    # If AI matched to wrong entry
    if (
        ai_prediction in ("matched", "fuzzy")
        and user_decision == "matched"
        and ai_matched_index != user_matched_index
    ):
        return {
            "type": "wrong_entry_selected",
            "pattern": {
                "ai_selected": ai_matched_index,
                "user_selected": user_matched_index,
            },
        }

    return {"type": "other", "pattern": {}}


async def _update_learned_patterns(
    session,
    organization_id: uuid.UUID,
    correction: UserCorrection,
    proof_data: dict,
    bank_entries: list,
):

    from sqlmodel import select

    if correction.correction_type == "vendor_name_variant":
        pattern = correction.learned_pattern or {}
        proof_vendor = pattern.get("proof_vendor")
        bank_vendor = pattern.get("bank_vendor")

        if proof_vendor and bank_vendor:
            # Normalize both names
            from app.ai_insights import normalize_vendor_name

            normalized = normalize_vendor_name(proof_vendor) or normalize_vendor_name(
                bank_vendor
            )

            if normalized:
                # Check if we already have a preference for this vendor
                statement = select(VendorPreference).where(
                    VendorPreference.organization_id == organization_id,
                    VendorPreference.canonical_vendor_name == normalized,
                )
                existing = session.exec(statement).first()

                if existing:
                    # Add new aliases
                    aliases = existing.vendor_aliases or []
                    if proof_vendor not in aliases:
                        aliases.append(proof_vendor)
                    if bank_vendor not in aliases:
                        aliases.append(bank_vendor)
                    existing.vendor_aliases = aliases
                    existing.learned_from_count += 1
                    existing.last_updated = datetime.now(timezone.utc)
                    session.add(existing)
                else:
                    # Create new vendor preference
                    pref = VendorPreference(
                        organization_id=organization_id,
                        canonical_vendor_name=normalized,
                        vendor_aliases=[proof_vendor, bank_vendor],
                        learned_from_count=1,
                        confidence=0.5,
                    )
                    session.add(pref)

                session.commit()

    elif correction.correction_type == "bank_fee_pattern":
        pattern = correction.learned_pattern or {}
        fee_percentage = pattern.get("fee_percentage")

        if fee_percentage:
            # Check if we already have a bank fee pattern
            statement = select(ReconciliationPattern).where(
                ReconciliationPattern.organization_id == organization_id,
                ReconciliationPattern.pattern_type == "bank_fee",
            )
            existing = session.exec(statement).first()

            if existing:
                # Update the pattern with new data
                rule = existing.pattern_rule or {}
                existing_fees = rule.get("historical_fees", [])
                existing_fees.append(fee_percentage)
                avg_fee = sum(existing_fees) / len(existing_fees)

                existing.pattern_rule = {
                    "fee_type": "percentage",
                    "fee_value": avg_fee / 100,  # Convert to decimal
                    "applies_to": "all_transfers",
                    "historical_fees": existing_fees,
                }
                existing.learned_from_count += 1
                existing.last_used = datetime.now(timezone.utc)
                session.add(existing)
            else:
                # Create new bank fee pattern
                pattern_rec = ReconciliationPattern(
                    organization_id=organization_id,
                    pattern_type="bank_fee",
                    pattern_name="Bank Transfer Fee",
                    pattern_rule={
                        "fee_type": "percentage",
                        "fee_value": fee_percentage / 100,
                        "applies_to": "all_transfers",
                        "historical_fees": [fee_percentage],
                    },
                    learned_from_count=1,
                    success_rate=1.0,
                )
                session.add(pattern_rec)

            session.commit()


async def get_learned_vendor_preferences(
    session, organization_id: uuid.UUID
) -> list[VendorPreference]:

    from sqlmodel import select

    statement = (
        select(VendorPreference)
        .where(VendorPreference.organization_id == organization_id)
        .order_by(VendorPreference.confidence.desc())
    )

    return list(session.exec(statement).all())


async def get_learned_patterns(
    session, organization_id: uuid.UUID, pattern_type: str | None = None
) -> list[ReconciliationPattern]:

    from sqlmodel import select

    statement = select(ReconciliationPattern).where(
        ReconciliationPattern.organization_id == organization_id
    )

    if pattern_type:
        statement = statement.where(ReconciliationPattern.pattern_type == pattern_type)

    statement = statement.order_by(ReconciliationPattern.success_rate.desc())

    return list(session.exec(statement).all())


async def get_correction_history(
    session, organization_id: uuid.UUID, limit: int = 10
) -> list[UserCorrection]:

    from sqlmodel import select

    statement = (
        select(UserCorrection)
        .where(UserCorrection.organization_id == organization_id)
        .order_by(UserCorrection.created_at.desc())
        .limit(limit)
    )

    return list(session.exec(statement).all())
