"""add organization to documents

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-24 12:35:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    # Add organization_id to document table
    op.add_column("document", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_document_organization",
        "document",
        "organization",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_document_organization_id", "document", ["organization_id"])

    # Migrate existing documents to user's organization
    op.execute("""
        UPDATE document d
        SET organization_id = (
            SELECT m.organization_id
            FROM membership m
            WHERE m.user_id = d.owner_id
            LIMIT 1
        )
        WHERE d.organization_id IS NULL
    """)

    # Add organization_id to reconciliationrecord table
    op.add_column("reconciliationrecord", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_reconciliationrecord_organization",
        "reconciliationrecord",
        "organization",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_reconciliationrecord_organization_id", "reconciliationrecord", ["organization_id"])

    # Migrate existing reconciliation records
    op.execute("""
        UPDATE reconciliationrecord r
        SET organization_id = (
            SELECT d.organization_id
            FROM document d
            WHERE d.id = r.document_id
            LIMIT 1
        )
        WHERE r.organization_id IS NULL
    """)


def downgrade():
    # Remove indexes
    op.drop_index("ix_reconciliationrecord_organization_id", "reconciliationrecord")
    op.drop_index("ix_document_organization_id", "document")

    # Remove foreign keys
    op.drop_constraint("fk_reconciliationrecord_organization", "reconciliationrecord", type_="foreignkey")
    op.drop_constraint("fk_document_organization", "document", type_="foreignkey")

    # Remove columns
    op.drop_column("reconciliationrecord", "organization_id")
    op.drop_column("document", "organization_id")
