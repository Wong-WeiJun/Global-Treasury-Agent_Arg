"""add reconciliation_result to document

Revision ID: 233b10dcb485
Revises: 0bc7894ae00e
Create Date: 2026-05-23 19:30:01.101144

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '233b10dcb485'
down_revision = '0bc7894ae00e'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('document', sa.Column('reconciliation_result', sa.JSON(), nullable=True))

def downgrade():
    op.drop_column('document', 'reconciliation_result')
