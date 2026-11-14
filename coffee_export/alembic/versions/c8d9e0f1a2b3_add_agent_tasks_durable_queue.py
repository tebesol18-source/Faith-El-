"""Durable Task Queue — agent_tasks table (Phase 1A)

Revision ID: c8d9e0f1a2b3
Revises: b9d0e1f2a4b5
Create Date: 2026-11-14

Single new table `agent_tasks` for the durable task queue
(docs/phase-1a-durable-task-queue.md):

  * states: pending | leased | completed | dead (CheckConstraint)
  * lease fencing: lease_token (UUID4 per claim) + lease_expires_ts —
    only the current lease-token holder may complete / fail / renew
  * exponential retry backoff: scheduled_ts = now + BASE * 2^(attempts-1)
  * dead tasks are requeueable by an operator (admin CLI), never auto-resurrected

Additive only — no existing table is touched, so upgrade is safe for
the committed operational DB (applied at deployment time, Phase 1A never
runs migrations against it). Downgrade drops just this table; no other
table references it (no inbound FKs anywhere in the schema).

The table is created EMPTY — no data seed. Phase 1A registers no
business task type and activates no recurring job.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "b9d0e1f2a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_tasks",
        sa.Column("task_id", sa.TEXT, primary_key=True),
        sa.Column("task_type", sa.TEXT, nullable=False),
        sa.Column("payload", sa.TEXT),
        sa.Column("organization_id", sa.TEXT, nullable=False, server_default="org-system"),
        sa.Column("status", sa.TEXT, nullable=False, server_default="pending"),
        sa.Column("priority", sa.INTEGER, nullable=False, server_default="100"),
        sa.Column("attempts", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.INTEGER, nullable=False, server_default="3"),
        sa.Column("scheduled_ts", sa.TEXT, nullable=False),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("lease_token", sa.TEXT),
        sa.Column("lease_owner", sa.TEXT),
        sa.Column("lease_expires_ts", sa.TEXT),
        sa.Column("started_ts", sa.TEXT),
        sa.Column("completed_ts", sa.TEXT),
        sa.Column("last_error", sa.TEXT),
        sa.Column("result", sa.TEXT),
        sa.CheckConstraint(
            "status IN ('pending', 'leased', 'completed', 'dead')",
            name="ck_agent_tasks_status",
        ),
        sa.CheckConstraint("attempts >= 0", name="ck_agent_tasks_attempts"),
        sa.CheckConstraint("max_attempts >= 1", name="ck_agent_tasks_max_attempts"),
        sa.CheckConstraint("priority >= 0", name="ck_agent_tasks_priority"),
    )
    # Claim path: WHERE status='pending' AND scheduled_ts <= now
    # ORDER BY priority, scheduled_ts, created_ts
    op.create_index("ix_agent_tasks_status_scheduled", "agent_tasks", ["status", "scheduled_ts"])
    op.create_index("ix_agent_tasks_task_type", "agent_tasks", ["task_type"])
    op.create_index("ix_agent_tasks_org", "agent_tasks", ["organization_id"])


def downgrade() -> None:
    op.drop_table("agent_tasks")
