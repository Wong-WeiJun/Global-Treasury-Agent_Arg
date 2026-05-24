"""add ai result and workflow status separation

Revision ID: f1a2b3c4d5e6
Revises: e0c04b2c7463
Create Date: 2026-05-24 09:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'e0c04b2c7463'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to document table
    op.add_column('document', sa.Column('ai_result', sa.String(), nullable=True))
    op.add_column('document', sa.Column('ai_confidence', sa.Float(), nullable=True))
    op.add_column('document', sa.Column('ai_explanation', sa.String(), nullable=True))
    op.add_column('document', sa.Column('reviewed_by', sa.UUID(), nullable=True))
    op.add_column('document', sa.Column('risk_level', sa.String(), nullable=True))

    # Add foreign key constraint for reviewed_by
    op.create_foreign_key(
        'fk_document_reviewed_by_user',
        'document', 'user',
        ['reviewed_by'], ['id'],
        ondelete='SET NULL'
    )

    # Alter workflow_status to not null with default
    op.alter_column('document', 'workflow_status',
                    existing_type=sa.String(),
                    nullable=False,
                    server_default='PENDING_EXTRACTION')

    # Add new columns to reconciliationrecord table
    op.add_column('reconciliationrecord', sa.Column('reviewed_by', sa.UUID(), nullable=True))
    op.add_column('reconciliationrecord', sa.Column('risk_level', sa.String(), nullable=True))
    op.add_column('reconciliationrecord', sa.Column('priority', sa.String(), nullable=True))

    # Add foreign key constraint for reviewed_by in reconciliationrecord
    op.create_foreign_key(
        'fk_reconciliationrecord_reviewed_by_user',
        'reconciliationrecord', 'user',
        ['reviewed_by'], ['id'],
        ondelete='SET NULL'
    )


def downgrade():
    # Drop foreign key constraints
    op.drop_constraint('fk_reconciliationrecord_reviewed_by_user', 'reconciliationrecord', type_='foreignkey')
    op.drop_constraint('fk_document_reviewed_by_user', 'document', type_='foreignkey')

    # Drop columns from reconciliationrecord
    op.drop_column('reconciliationrecord', 'priority')
    op.drop_column('reconciliationrecord', 'risk_level')
    op.drop_column('reconciliationrecord', 'reviewed_by')

    # Revert workflow_status to nullable
    op.alter_column('document', 'workflow_status',
                    existing_type=sa.String(),
                    nullable=True,
                    server_default=None)

    # Drop columns from document
    op.drop_column('document', 'risk_level')
    op.drop_column('document', 'reviewed_by')
    op.drop_column('document', 'ai_explanation')
    op.drop_column('document', 'ai_confidence')
    op.drop_column('document', 'ai_result')
