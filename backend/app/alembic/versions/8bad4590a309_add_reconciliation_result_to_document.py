"""add reconciliation_result to document

Revision ID: 8bad4590a309
Revises: 233b10dcb485
Create Date: 2026-05-23 19:49:40.162554

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '8bad4590a309'
down_revision = '233b10dcb485'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('document', sa.Column('reconciliation_result', sa.JSON(), nullable=True))

def downgrade():
    op.drop_column('document', 'reconciliation_result')
