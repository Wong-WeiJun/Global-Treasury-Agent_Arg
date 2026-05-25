"""Add orchestration_result to Document

Revision ID: m1n2o3p4q5r6
Revises: g7h8i9j0k1l2
Create Date: 2026-05-25 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'm1n2o3p4q5r6'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add orchestration_result column to document table
    op.add_column('document', sa.Column('orchestration_result', postgresql.JSON(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    # Remove orchestration_result column from document table
    op.drop_column('document', 'orchestration_result')
