"""add_multi_currency_architecture

Revision ID: 54e18bb3a67d
Revises: f1a2b3c4d5e6
Create Date: 2026-05-24 03:41:37.019694

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = "54e18bb3a67d"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    # Add organization settings table
    op.create_table(
        "organization",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("base_currency", sa.String(), nullable=False, server_default="MYR"),
        sa.Column("timezone", sa.String(), nullable=False, server_default="Asia/Kuala_Lumpur"),
        sa.Column("fx_provider", sa.String(), nullable=False, server_default="frankfurter"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id")
    )

    # Add organization_id to user table
    op.add_column("user", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.add_column("user", sa.Column("display_currency", sa.String(), nullable=True, server_default="MYR"))
    op.create_foreign_key("fk_user_organization", "user", "organization", ["organization_id"], ["id"], ondelete="SET NULL")

    # Add multi-currency fields to document table (original currency - what customer paid)
    op.add_column("document", sa.Column("original_amount", sa.Float(), nullable=True))
    op.add_column("document", sa.Column("original_currency", sa.String(), nullable=True))
    op.add_column("document", sa.Column("transaction_date", sa.String(), nullable=True))

    # Base currency fields (normalized for reconciliation)
    op.add_column("document", sa.Column("base_amount", sa.Float(), nullable=True))
    op.add_column("document", sa.Column("base_currency", sa.String(), nullable=True, server_default="MYR"))
    op.add_column("document", sa.Column("fx_rate_used", sa.Float(), nullable=True))
    op.add_column("document", sa.Column("fx_rate_date", sa.String(), nullable=True))
    op.add_column("document", sa.Column("fx_rate_timestamp", sa.DateTime(timezone=True), nullable=True))

    # Migrate existing data from extracted_data JSON to new columns
    op.execute("""
        UPDATE document
        SET
            original_amount = CAST(extracted_data->>'amount' AS FLOAT),
            original_currency = COALESCE(extracted_data->>'currency', 'MYR'),
            transaction_date = extracted_data->>'date',
            base_amount = COALESCE(CAST(extracted_data->>'myr_amount' AS FLOAT), CAST(extracted_data->>'amount' AS FLOAT)),
            base_currency = 'MYR',
            fx_rate_used = CAST(extracted_data->>'fx_rate' AS FLOAT)
        WHERE extracted_data IS NOT NULL
    """)

    # Update reconciliation_record table to use explicit base currency fields
    op.add_column("reconciliationrecord", sa.Column("base_currency", sa.String(), nullable=True, server_default="MYR"))
    op.add_column("reconciliationrecord", sa.Column("base_amount", sa.Float(), nullable=True))
    op.execute("UPDATE reconciliationrecord SET base_currency = 'MYR' WHERE base_currency IS NULL")


def downgrade():
    # Remove new columns from reconciliationrecord
    op.drop_column("reconciliationrecord", "base_amount")
    op.drop_column("reconciliationrecord", "base_currency")

    # Remove new columns from document
    op.drop_column("document", "fx_rate_timestamp")
    op.drop_column("document", "fx_rate_date")
    op.drop_column("document", "fx_rate_used")
    op.drop_column("document", "base_currency")
    op.drop_column("document", "base_amount")
    op.drop_column("document", "transaction_date")
    op.drop_column("document", "original_currency")
    op.drop_column("document", "original_amount")

    # Remove user columns
    op.drop_constraint("fk_user_organization", "user", type_="foreignkey")
    op.drop_column("user", "display_currency")
    op.drop_column("user", "organization_id")

    # Drop organization table
    op.drop_table("organization")
