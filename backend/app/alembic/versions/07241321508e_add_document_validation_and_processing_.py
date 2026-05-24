"""add_document_validation_and_processing_status

Revision ID: 07241321508e
Revises: dfb6106819a7
Create Date: 2026-05-24 14:57:20.528038

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '07241321508e'
down_revision = 'dfb6106819a7'
branch_labels = None
depends_on = None


def upgrade():
    # Add validation and processing status fields to document table
    op.add_column('document', sa.Column('processing_status', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='UPLOADED'))
    op.add_column('document', sa.Column('validation_status', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('document', sa.Column('document_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('document', sa.Column('document_type_confidence', sa.Float(), nullable=True))
    op.add_column('document', sa.Column('quality_score', sa.Integer(), nullable=True))
    op.add_column('document', sa.Column('validation_issues', sa.JSON(), nullable=True))
    op.add_column('document', sa.Column('validation_suggestions', sa.JSON(), nullable=True))


def downgrade():
    # Remove validation and processing status fields from document table
    op.drop_column('document', 'validation_suggestions')
    op.drop_column('document', 'validation_issues')
    op.drop_column('document', 'quality_score')
    op.drop_column('document', 'document_type_confidence')
    op.drop_column('document', 'document_type')
    op.drop_column('document', 'validation_status')
    op.drop_column('document', 'processing_status')
