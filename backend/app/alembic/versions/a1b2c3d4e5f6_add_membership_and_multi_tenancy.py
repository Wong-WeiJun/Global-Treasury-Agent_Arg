"""add membership and multi tenancy

Revision ID: a1b2c3d4e5f6
Revises: 54e18bb3a67d
Create Date: 2026-05-24 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "54e18bb3a67d"
branch_labels = None
depends_on = None


def upgrade():
    # Add slug and created_by to organization table
    op.add_column("organization", sa.Column("slug", sa.String(), nullable=True))
    op.add_column("organization", sa.Column("created_by", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_organization_created_by", "organization", "user", ["created_by"], ["id"], ondelete="SET NULL")

    # Create membership table for multi-tenant access control
    op.create_table(
        "membership",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="VIEWER"),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="CASCADE"),
    )

    # Create index for fast membership lookups
    op.create_index("ix_membership_user_id", "membership", ["user_id"])
    op.create_index("ix_membership_organization_id", "membership", ["organization_id"])
    op.create_index("ix_membership_user_org", "membership", ["user_id", "organization_id"], unique=True)

    # Migrate existing users to membership table as OWNER
    op.execute("""
        INSERT INTO membership (id, user_id, organization_id, role, joined_at)
        SELECT 
            gen_random_uuid(),
            u.id,
            u.organization_id,
            'OWNER',
            CURRENT_TIMESTAMP
        FROM "user" u
        WHERE u.organization_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """)


def downgrade():
    # Drop membership table
    op.drop_index("ix_membership_user_org", "membership")
    op.drop_index("ix_membership_organization_id", "membership")
    op.drop_index("ix_membership_user_id", "membership")
    op.drop_table("membership")

    # Remove organization columns
    op.drop_constraint("fk_organization_created_by", "organization", type_="foreignkey")
    op.drop_column("organization", "created_by")
    op.drop_column("organization", "slug")
