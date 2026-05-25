"""Add AI learning tables for continuous improvement

Revision ID: 6061260ac7ff
Revises: 07241321508e
Create Date: 2025-05-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "6061260ac7ff"
down_revision = "07241321508e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if tables exist before creating them
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- usercorrection ---
    if "usercorrection" not in existing_tables:
        op.create_table(
            "usercorrection",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("ai_prediction", sa.String(), nullable=False),
            sa.Column("ai_confidence", sa.Float(), nullable=False),
            sa.Column("ai_matched_index", sa.Integer(), nullable=True),
            sa.Column("user_decision", sa.String(), nullable=False),
            sa.Column("user_matched_index", sa.Integer(), nullable=True),
            sa.Column("user_note", sa.String(), nullable=True),
            sa.Column("proof_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("bank_entries", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("match_scores", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("correction_type", sa.String(), nullable=True),
            sa.Column("learned_pattern", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["document_id"], ["document.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    # --- vendorpreference ---
    if "vendorpreference" not in existing_tables:
        op.create_table(
            "vendorpreference",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("canonical_vendor_name", sa.String(), nullable=False),
            sa.Column("vendor_aliases", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("typical_amount_range", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("typical_day_of_month", sa.Integer(), nullable=True),
            sa.Column("typical_payment_method", sa.String(), nullable=True),
            sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("recurring_frequency", sa.String(), nullable=True),
            sa.Column("learned_from_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "last_updated",
                sa.DateTime(timezone=True),
                nullable=False,
            ),
            sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
            sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    # --- reconciliationpattern ---
    if "reconciliationpattern" not in existing_tables:
        op.create_table(
            "reconciliationpattern",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("pattern_type", sa.String(), nullable=False),
            sa.Column("pattern_name", sa.String(), nullable=False),
            sa.Column("pattern_rule", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("learned_from_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("success_rate", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("last_used", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    # Check if tables exist before dropping them
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    if "reconciliationpattern" in existing_tables:
        op.drop_table("reconciliationpattern")
    if "vendorpreference" in existing_tables:
        op.drop_table("vendorpreference")
    if "usercorrection" in existing_tables:
        op.drop_table("usercorrection")
