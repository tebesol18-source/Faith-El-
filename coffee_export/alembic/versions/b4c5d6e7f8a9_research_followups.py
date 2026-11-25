"""Research followups (TryComp Phase 3)

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-11-25

One new org-scoped table for persistent research follow-ups
(coffee_export/research/followups.py + coffee_export/tasks/research_tasks.py,
docs/trycomp-integration-progress.md §3 D / §12):

  * research_followups — one scheduled future research action per row:
    followup_type (enumerated by CHECK: run_session | revalidate_evidence,
    mapping 1:1 onto the registered research.* task types), optional
    session/subject references, due_ts (ISO +03:00, lexicographically
    sortable), the dispatch lifecycle (scheduled → enqueued → done |
    failed; scheduled → cancelled pre-dispatch), canonical-JSON payload
    merged into the enqueued task's payload, and the task_id audit link
    set at dispatch.

Additive only — no existing table is touched. The upgrade is safe for
the committed operational DB (which ships at b9d0e1f2a4b5; deployment
runs it, this project never does). Downgrade drops exactly this table;
nothing references it (no inbound FKs anywhere in the schema).

organization_id is NOT NULL with NO default — the LeadSource/
LeadVerificationLog pattern every research table follows. No FK by
design (same decision as the Phase 1/2 research tables): the org-scoped
service layer is the integrity gate; the ONLY cross-org reader is the
queue-side dispatcher (tasks/research_tasks.py), which stamps each
enqueued task with the row's OWN organization_id.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Canonical empty payload (research/common.canonical_json form).
EMPTY_PAYLOAD = "{}"


def upgrade() -> None:
    op.create_table(
        "research_followups",
        sa.Column("followup_id", sa.TEXT, primary_key=True),
        sa.Column("organization_id", sa.TEXT, nullable=False),
        sa.Column("followup_type", sa.TEXT, nullable=False),
        sa.Column("session_id", sa.TEXT),
        sa.Column("subject_type", sa.TEXT),
        sa.Column("subject_id", sa.TEXT),
        sa.Column("due_ts", sa.TEXT, nullable=False),
        sa.Column("status", sa.TEXT, nullable=False, server_default="scheduled"),
        sa.Column("payload", sa.TEXT, nullable=False, server_default=EMPTY_PAYLOAD),
        sa.Column("task_id", sa.TEXT),
        sa.Column("created_by", sa.TEXT, nullable=False),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.CheckConstraint(
            "status IN ('scheduled', 'enqueued', 'done', 'failed', 'cancelled')",
            name="ck_research_followups_status",
        ),
        sa.CheckConstraint(
            "followup_type IN ('run_session', 'revalidate_evidence')",
            name="ck_research_followups_type",
        ),
    )
    # Org-scoped listing hot path.
    op.create_index(
        "ix_research_followups_org_status",
        "research_followups",
        ["organization_id", "status"],
    )
    # The dispatcher hot path: due rows across orgs in due order.
    op.create_index(
        "ix_research_followups_due",
        "research_followups",
        ["status", "due_ts"],
    )


def downgrade() -> None:
    op.drop_table("research_followups")
