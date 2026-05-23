"""add document table

Revision ID: 92e26ae9b4b8
Revises: fe56fa70289e
Create Date: 2026-05-23 03:45:06.996371

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '92e26ae9b4b8'
down_revision = 'fe56fa70289e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'document',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('owner_id', sa.UUID(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=False),
        sa.Column('s3_key', sa.String(), nullable=False),
        sa.Column('file_type', sa.String(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('document')
