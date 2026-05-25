"""Add bank statement tables

Revision ID: g7h8i9j0k1l2
Revises: 6061260ac7ff
Create Date: 2026-05-25 18:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'g7h8i9j0k1l2'
down_revision = '6061260ac7ff'
branch_labels = None
depends_on = None


def upgrade():
    # Create bankstatement table
    op.execute("""
        CREATE TABLE IF NOT EXISTS bankstatement (
            id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organization(id),
            uploaded_by UUID NOT NULL REFERENCES "user"(id),
            original_filename VARCHAR NOT NULL,
            s3_key VARCHAR NOT NULL,
            file_hash VARCHAR NOT NULL,
            uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
            parsed_at TIMESTAMP WITH TIME ZONE,
            statement_month VARCHAR,
            bank_name VARCHAR,
            account_number VARCHAR
        )
    """)

    # Create index on file_hash
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_bankstatement_file_hash
        ON bankstatement(file_hash)
    """)

    # Create banktransaction table
    op.execute("""
        CREATE TABLE IF NOT EXISTS banktransaction (
            id UUID PRIMARY KEY,
            statement_id UUID NOT NULL REFERENCES bankstatement(id),
            organization_id UUID NOT NULL REFERENCES organization(id),
            date VARCHAR NOT NULL,
            amount FLOAT NOT NULL,
            currency VARCHAR NOT NULL,
            description VARCHAR NOT NULL,
            reference VARCHAR,
            matched_document_id UUID REFERENCES document(id),
            confidence_score FLOAT,
            status VARCHAR NOT NULL DEFAULT 'unmatched',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS banktransaction")
    op.execute("DROP INDEX IF EXISTS ix_bankstatement_file_hash")
    op.execute("DROP TABLE IF EXISTS bankstatement")
