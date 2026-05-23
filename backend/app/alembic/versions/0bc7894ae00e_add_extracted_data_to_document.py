"""add extracted_data to document
Revision ID: 0bc7894ae00e
Revises: 92e26ae9b4b8
Create Date: 2026-05-23 17:02:46.569489
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0bc7894ae00e'
down_revision = '92e26ae9b4b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('document', sa.Column('extracted_data', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('document', 'extracted_data')
