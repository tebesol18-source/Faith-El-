"""Research foundation — research_evidence + research_facts (TryComp Phase 1)

Revision ID: f2a3b4c5d6e7
Revises: d9e0f1a2b3c4
Create Date: 2026-11-18

Two new org-scoped tables for the Evidence Ledger and Persistent Facts
(coffee_export/research/, docs/trycomp-integration-progress.md §3 B/C):

  * research_evidence — append-only observations about polymorphic
    subjects with honesty-enforced source attribution: website/search/api
    rows must cite an http(s) URL (CHECK), human rows must name the actor
    (CHECK), llm_inference is admitted but never independent. Rows are
    never deleted; only sanctioned status transitions and the reversible
    suppressed flag mutate a row.
  * research_facts — the current-state layer, UNIQUE per
    (organization_id, subject_type, subject_id, fact_key)
    (uq_research_facts_key), deterministically recomputed from the live
    evidence set; human_verified facts are locked against every AI-driven
    recompute.

Additive only — no existing table is touched, so the upgrade is safe for
the committed operational DB (which ships at b9d0e1f2a4b5; deployment
runs it, this project never does). Downgrade drops exactly these two
tables; nothing references them (no inbound FKs anywhere in the schema).

organization_id is NOT NULL with NO default on both tables — the
LeadSource/LeadVerificationLog pattern. A silent org-system stamp caused
two tenant-misattribution incidents in this codebase's history; direct
SQL inserts without an org fail loudly instead.

No foreign keys by design: (subject_type, subject_id) is polymorphic —
the referenced row lives in a different table per subject_type.

Both tables are created EMPTY — no data seed; Phase 1 registers no
writer beyond the service layer and nothing in the application calls it
yet (Phase 3 wires the durable research execution).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "research_evidence",
        sa.Column("evidence_id", sa.TEXT, primary_key=True),
        sa.Column("organization_id", sa.TEXT, nullable=False),
        sa.Column("subject_type", sa.TEXT, nullable=False),
        sa.Column("subject_id", sa.TEXT, nullable=False),
        sa.Column("fact_key", sa.TEXT, nullable=False),
        sa.Column("value", sa.TEXT, nullable=False),
        sa.Column("source_type", sa.TEXT, nullable=False),
        sa.Column("source_url", sa.TEXT),
        sa.Column("source_actor", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False, server_default="observed"),
        sa.Column("suppressed", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("expires_ts", sa.TEXT),
        sa.CheckConstraint(
            "source_type IN ('website', 'search', 'api', 'human', 'llm_inference')",
            name="ck_research_evidence_source_type",
        ),
        sa.CheckConstraint(
            "status IN ('observed', 'corroborated', 'disputed', 'outdated')",
            name="ck_research_evidence_status",
        ),
        sa.CheckConstraint("suppressed IN (0, 1)", name="ck_research_evidence_suppressed"),
        sa.CheckConstraint(
            "source_type NOT IN ('website', 'search', 'api')"
            " OR (source_url IS NOT NULL"
            " AND (source_url LIKE 'http://%' OR source_url LIKE 'https://%'))",
            name="ck_research_evidence_url_honesty",
        ),
        sa.CheckConstraint(
            "source_type != 'human' OR source_actor IS NOT NULL",
            name="ck_research_evidence_actor_honesty",
        ),
    )
    # The recompute hot path: every query in research/ filters
    # organization_id + subject + fact_key.
    op.create_index(
        "ix_research_evidence_subject",
        "research_evidence",
        ["organization_id", "subject_type", "subject_id", "fact_key"],
    )

    op.create_table(
        "research_facts",
        sa.Column("fact_id", sa.TEXT, primary_key=True),
        sa.Column("organization_id", sa.TEXT, nullable=False),
        sa.Column("subject_type", sa.TEXT, nullable=False),
        sa.Column("subject_id", sa.TEXT, nullable=False),
        sa.Column("fact_key", sa.TEXT, nullable=False),
        sa.Column("value", sa.TEXT, nullable=False),
        sa.Column("status", sa.TEXT, nullable=False, server_default="observed"),
        sa.Column("conflicting", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("source_count", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("verified_by", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.UniqueConstraint(
            "organization_id",
            "subject_type",
            "subject_id",
            "fact_key",
            name="uq_research_facts_key",
        ),
        sa.CheckConstraint(
            "status IN ('observed', 'corroborated', 'human_verified')",
            name="ck_research_facts_status",
        ),
        sa.CheckConstraint("conflicting IN (0, 1)", name="ck_research_facts_conflicting"),
        sa.CheckConstraint("source_count >= 0", name="ck_research_facts_source_count"),
    )
    op.create_index(
        "ix_research_facts_org_status",
        "research_facts",
        ["organization_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("research_facts")
    op.drop_table("research_evidence")
