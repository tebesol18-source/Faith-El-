"""lead evidence & verification (Phase 1 real-lead intake)

Revision ID: b7e1f3c9a2d4
Revises: a1b2c3d4e5f7
Create Date: 2026-09-26

Adds:
  - leads.verification_status / verified_by / verified_ts
    ('unverified' | 'verified' | 'rejected', default 'unverified')
  - lead_contacts.verification_status / verified_by / verified_ts
  - lead_sources: one row per piece of evidence (source URL, product
    interest, date checked, reachability-check results)
  - lead_verification_log: append-only audit of check/confirm/reject/reset
  - leads UNIQUE(company_name, headquarters_country) is rebuilt as
    UNIQUE(company_name, headquarters_country, organization_id) so two
    exporter organizations can each track the same real-world company.

NOTE ON APPLICATION: the canonical applier is the idempotent Node script
scripts/migrations/2026-09-26-lead-evidence.mjs (it performs the SQLite
table rebuild for the UNIQUE constraint change and re-creates CHECK
constraints as triggers, which alembic's batch ops cannot fully express).
This revision documents the same change for the alembic lineage; after
running the Node script, stamp the database:

    alembic stamp b7e1f3c9a2d4
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b7e1f3c9a2d4"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Verification columns
    with op.batch_alter_table("leads") as batch:
        batch.add_column(sa.Column("verification_status", sa.Text(), nullable=False, server_default="unverified"))
        batch.add_column(sa.Column("verified_by", sa.Text(), nullable=True))
        batch.add_column(sa.Column("verified_ts", sa.Text(), nullable=True))
    op.create_index("ix_leads_verification_status", "leads", ["verification_status"])

    with op.batch_alter_table("lead_contacts") as batch:
        batch.add_column(sa.Column("verification_status", sa.Text(), nullable=False, server_default="unverified"))
        batch.add_column(sa.Column("verified_by", sa.Text(), nullable=True))
        batch.add_column(sa.Column("verified_ts", sa.Text(), nullable=True))
    op.create_index("ix_lead_contacts_verification", "lead_contacts", ["verification_status"])

    # 2. Evidence table
    op.create_table(
        "lead_sources",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.Text(), nullable=False),
        sa.Column("organization_id", sa.Text(), nullable=False),
        sa.Column("evidence_for", sa.Text(), nullable=False, server_default="company"),
        sa.Column("contact_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("source_name", sa.Text(), nullable=True),
        sa.Column("company_as_listed", sa.Text(), nullable=True),
        sa.Column("country", sa.Text(), nullable=True),
        sa.Column("product_interest", sa.Text(), nullable=True),
        sa.Column("checked_ts", sa.Text(), nullable=True),
        sa.Column("checked_by", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("last_check_status", sa.Text(), nullable=True),
        sa.Column("last_check_detail", sa.Text(), nullable=True),
        sa.Column("last_check_ts", sa.Text(), nullable=True),
        sa.Column("created_ts", sa.Text(), nullable=False),
        sa.Column("updated_ts", sa.Text(), nullable=False),
        sa.Column("deleted_ts", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["lead_contacts.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "evidence_for IN ('company', 'contact', 'both')", name="ck_lead_sources_evidence_for"
        ),
        sa.CheckConstraint(
            "source_type IN ('directory', 'website', 'registry', 'marketplace', "
            "'event', 'publication', 'manual', 'other')",
            name="ck_lead_sources_source_type",
        ),
    )
    op.create_index("ix_lead_sources_lead", "lead_sources", ["lead_id"])
    op.create_index("ix_lead_sources_org", "lead_sources", ["organization_id"])

    # 3. Append-only verification audit log
    op.create_table(
        "lead_verification_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.Text(), nullable=False),
        sa.Column("organization_id", sa.Text(), nullable=False),
        sa.Column("level", sa.Text(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column("created_ts", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
        sa.CheckConstraint("level IN ('company', 'contact')", name="ck_lead_verification_log_level"),
        sa.CheckConstraint(
            "action IN ('check', 'confirm', 'reject', 'reset')",
            name="ck_lead_verification_log_action",
        ),
    )
    op.create_index("ix_lead_verification_log_lead", "lead_verification_log", ["lead_id"])

    # 4. Org-scoped UNIQUE on leads (table rebuild; CHECK domains re-created
    #    as triggers by the canonical Node migration script).
    with op.batch_alter_table("leads") as batch:
        batch.drop_constraint("uq_leads_company_country", type_="unique")
        batch.create_unique_constraint(
            "uq_leads_company_country",
            ["company_name", "headquarters_country", "organization_id"],
        )


def downgrade() -> None:
    op.drop_table("lead_verification_log")
    op.drop_table("lead_sources")
    op.drop_index("ix_lead_contacts_verification", table_name="lead_contacts")
    with op.batch_alter_table("lead_contacts") as batch:
        batch.drop_column("verified_ts")
        batch.drop_column("verified_by")
        batch.drop_column("verification_status")
    op.drop_index("ix_leads_verification_status", table_name="leads")
    with op.batch_alter_table("leads") as batch:
        batch.drop_column("verified_ts")
        batch.drop_column("verified_by")
        batch.drop_column("verification_status")
        batch.drop_constraint("uq_leads_company_country", type_="unique")
        batch.create_unique_constraint("uq_leads_company_country", ["company_name", "headquarters_country"])
