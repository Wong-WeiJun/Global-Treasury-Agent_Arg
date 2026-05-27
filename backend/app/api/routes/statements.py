"""Bank statement upload and management endpoints"""

import hashlib
import uuid
from datetime import datetime, timezone


from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.api.deps import CurrentUser, get_db
from app.file_utils import upload_document
from app.models import (
    BankStatement,
    BankStatementPublic,
    BankTransaction,
    BankTransactionsPublic,
)
from app.statement_parser import parse_statement

router = APIRouter()


@router.post("/upload", response_model=BankStatementPublic)
async def upload_bank_statement(
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
    current_user: CurrentUser = None,
) -> BankStatement:
    """
    Upload and parse a bank statement (CSV or XLSX).
    Automatically extracts transactions and stores them.
    """
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400, detail="User must belong to an organization"
        )

    # Read file
    file_bytes = await file.read()
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    # Check for duplicate
    existing = session.exec(
        select(BankStatement).where(
            BankStatement.organization_id == current_user.organization_id,
            BankStatement.file_hash == file_hash,
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"This statement has already been uploaded: {existing.original_filename}",
        )

    # Upload to S3
    s3_key = await upload_document(
        file_bytes, file.filename or "statement", current_user.organization_id
    )

    # Create statement record
    statement = BankStatement(
        organization_id=current_user.organization_id,
        uploaded_by=current_user.id,
        original_filename=file.filename or "unknown",
        s3_key=s3_key,
        file_hash=file_hash,
    )

    session.add(statement)
    session.commit()
    session.refresh(statement)

    # Parse transactions
    try:
        transactions = await parse_statement(file_bytes, file.filename or "")

        # Store transactions
        for txn_data in transactions:
            txn = BankTransaction(
                statement_id=statement.id,
                organization_id=current_user.organization_id,
                date=txn_data["date"],
                amount=txn_data["amount"],
                currency=txn_data.get("currency", "MYR"),
                description=txn_data["description"],
                reference=txn_data.get("reference"),
            )
            session.add(txn)

        statement.parsed_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(statement)

    except Exception as e:
        # Statement uploaded but parsing failed - still return statement
        # User can see error in frontend
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse statement: {str(e)}",
        )

    return statement


@router.get("/", response_model=list[BankStatementPublic])
def list_statements(
    session: Session = Depends(get_db),
    current_user: CurrentUser = None,
    skip: int = 0,
    limit: int = 100,
) -> list[BankStatement]:
    """List all bank statements for current organization"""
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400, detail="User must belong to an organization"
        )

    statements = session.exec(
        select(BankStatement)
        .where(BankStatement.organization_id == current_user.organization_id)
        .order_by(BankStatement.uploaded_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return list(statements)


@router.get("/{statement_id}/transactions", response_model=BankTransactionsPublic)
def get_statement_transactions(
    statement_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: CurrentUser = None,
    skip: int = 0,
    limit: int = 1000,
) -> BankTransactionsPublic:
    """Get all transactions from a specific statement"""
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400, detail="User must belong to an organization"
        )

    # Verify statement belongs to user's org
    statement = session.get(BankStatement, statement_id)
    if not statement or statement.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Statement not found")

    transactions = session.exec(
        select(BankTransaction)
        .where(BankTransaction.statement_id == statement_id)
        .order_by(BankTransaction.date.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return BankTransactionsPublic(data=list(transactions), count=len(transactions))


@router.get("/transactions/unmatched", response_model=BankTransactionsPublic)
def get_unmatched_transactions(
    session: Session = Depends(get_db),
    current_user: CurrentUser = None,
    limit: int = 100,
) -> BankTransactionsPublic:
    """Get all unmatched transactions for the organization"""
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400, detail="User must belong to an organization"
        )

    transactions = session.exec(
        select(BankTransaction)
        .where(
            BankTransaction.organization_id == current_user.organization_id,
            BankTransaction.status == "unmatched",
        )
        .order_by(BankTransaction.date.desc())
        .limit(limit)
    ).all()

    return BankTransactionsPublic(data=list(transactions), count=len(transactions))
