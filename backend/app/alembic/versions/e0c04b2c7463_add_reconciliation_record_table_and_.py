"""add reconciliation record table and document workflow fields

Revision ID: e0c04b2c7463
Revises: 3f246717085b
Create Date: 2026-05-24 08:44:02.774866

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'e0c04b2c7463'
down_revision = '3f246717085b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'reconciliationrecord',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('document_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('risk_score', sa.Integer(), nullable=False),
        sa.Column('fx_rate', sa.Float(), nullable=True),
        sa.Column('normalized_amount_myr', sa.Float(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('exception_type', sa.String(), nullable=True),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('ai_explanation', sa.String(), nullable=True),
        sa.Column('case_id', sa.String(), nullable=True),
        sa.Column('assigned_to', sa.String(), nullable=True),
        sa.Column('risk_factors', sa.JSON(), nullable=True),
        sa.Column('journal_entry', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['document.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column('document', sa.Column('workflow_status', sa.String(), nullable=True, server_default='PENDING_EXTRACTION'))
    op.add_column('document', sa.Column('exception_type', sa.String(), nullable=True))
    op.add_column('document', sa.Column('case_id', sa.String(), nullable=True))
    op.add_column('document', sa.Column('risk_score', sa.Integer(), nullable=True))


def downgrade():
    op.drop_table('reconciliationrecord')
    op.drop_column('document', 'risk_score')
    op.drop_column('document', 'case_id')
    op.drop_column('document', 'exception_type')
    op.drop_column('document', 'workflow_status')
