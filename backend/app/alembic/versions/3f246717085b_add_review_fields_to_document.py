"""add review fields to document

Revision ID: 3f246717085b
Revises: 8bad4590a309
Create Date: 2026-05-23 21:26:05.348985

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '3f246717085b'
down_revision = '233b10dcb485'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('document', sa.Column('review_status', sa.String(), nullable=True))
    op.add_column('document', sa.Column('review_note', sa.String(), nullable=True))
    op.add_column('document', sa.Column('reviewed_at', sa.DateTime(), nullable=True))

def downgrade():
    op.drop_column('document', 'reviewed_at')
    op.drop_column('document', 'review_note')
    op.drop_column('document', 'review_status')
