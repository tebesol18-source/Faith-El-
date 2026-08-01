"""add fda_prior_notice to compliance document types

Revision ID: 2695b02416a5
Revises: e9d9dc16f298
Create Date: 2026-07-02

SQLite doesn't support ALTER TABLE to modify CHECK constraints.
This migration recreates the compliance_documents table with the
updated constraint that includes 'fda_prior_notice'.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2695b02416a5"
down_revision: str | Sequence[str] | None = "e9d9dc16f298"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLite doesn't support ALTER TABLE for CHECK constraints.
    # We need to: create new table → copy data → drop old → rename new.
    op.create_table(
        "compliance_documents_new",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("contract_id", sa.TEXT, nullable=False),
        sa.Column("document_type", sa.TEXT, nullable=False),
        sa.Column("file_path", sa.TEXT),
        sa.Column("issued_date", sa.TEXT),
        sa.Column("expiry_date", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="draft"),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT, nullable=True),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.contract_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "document_type IN ('eudr_attestation', 'certificate_of_origin', "
            "'phytosanitary_cert', 'organic_cert', 'fairtrade_cert', 'ra_cert', "
            "'4c_cert', 'commercial_invoice', 'packing_list', 'bill_of_lading', "
            "'insurance_cert', 'fda_prior_notice', 'other')",
            name="ck_compliance_docs_type_v2",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'expired', 'rejected')",
            name="ck_compliance_docs_status_v2",
        ),
    )

    # Copy data from old table
    op.execute("""
        INSERT INTO compliance_documents_new
        (id, contract_id, document_type, file_path, issued_date, expiry_date,
         status, notes, created_ts, updated_ts, deleted_ts)
        SELECT id, contract_id, document_type, file_path, issued_date, expiry_date,
               status, notes, created_ts, updated_ts, deleted_ts
        FROM compliance_documents
    """)

    op.drop_table("compliance_documents")
    op.rename_table("compliance_documents_new", "compliance_documents")


def downgrade() -> None:
    # Recreate the original table without fda_prior_notice
    op.create_table(
        "compliance_documents_old",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("contract_id", sa.TEXT, nullable=False),
        sa.Column("document_type", sa.TEXT, nullable=False),
        sa.Column("file_path", sa.TEXT),
        sa.Column("issued_date", sa.TEXT),
        sa.Column("expiry_date", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="draft"),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT, nullable=True),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.contract_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "document_type IN ('eudr_attestation', 'certificate_of_origin', "
            "'phytosanitary_cert', 'organic_cert', 'fairtrade_cert', 'ra_cert', "
            "'4c_cert', 'commercial_invoice', 'packing_list', 'bill_of_lading', "
            "'insurance_cert', 'other')",
            name="ck_compliance_docs_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'expired', 'rejected')",
            name="ck_compliance_docs_status",
        ),
    )

    op.execute("""
        INSERT INTO compliance_documents_old
        (id, contract_id, document_type, file_path, issued_date, expiry_date,
         status, notes, created_ts, updated_ts, deleted_ts)
        SELECT id, contract_id,
               CASE WHEN document_type = 'fda_prior_notice' THEN 'other'
                    ELSE document_type END,
               file_path, issued_date, expiry_date,
               status, notes, created_ts, updated_ts, deleted_ts
        FROM compliance_documents
    """)

    op.drop_table("compliance_documents")
    op.rename_table("compliance_documents_old", "compliance_documents")
