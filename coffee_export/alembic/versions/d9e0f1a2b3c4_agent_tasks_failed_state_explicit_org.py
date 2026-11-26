"""agent_tasks five-state contract + explicit org scope (Phase 1A correction)

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-11-17

Two corrections to the agent_tasks table, in one revision:

  1. status CHECK widened from 4 to 5 states — adds `failed`, the
     terminal NON-retryable failure (unregistered task type, corrupt
     payload, validator rejection, handler-raised
     NonRetryableTaskError). The 4-state model treated every failure as
     retryable, so permanently-broken tasks burned their whole retry
     budget with backoff before landing in `dead`.
  2. organization_id server_default 'org-system' REMOVED — the silent
     org-system stamp caused two tenant-misattribution incidents in this
     codebase (leads/import, messaging bridge). enqueue() now requires
     an explicit organization_id (SYSTEM_ORG for genuine system scope);
     direct SQL inserts without an org fail NOT NULL loudly instead of
     being silently attributed to org-system.

Dialect behavior: SQLite cannot ALTER a CHECK in place, so batch mode
REBUILDS the table (create copy → copy rows → drop → rename). The
rebuild is verified by test to preserve every row, all 3 indexes
(ix_agent_tasks_status_scheduled, ix_agent_tasks_task_type,
ix_agent_tasks_org) and the other 3 CHECKs (attempts>=0,
max_attempts>=1, priority>=0). On PostgreSQL the same operations emit
native DROP CONSTRAINT / ADD CONSTRAINT with no rebuild.

Data migration: NONE. The table has no production deployment (the
operational DB ships at b9d0e1f2a4b5, before agent_tasks existed), and
old `dead` ≡ new `dead` — nothing to backfill. The only data statement
lives in downgrade(): the failed → dead remap, so a downgrade stays
executable on databases that contain `failed` rows (dead is the
semantically closest terminal state under the 4-state contract).

The pushed revision c8d9e0f1a2b3 is immutable history and was NOT
edited: databases that already ran upgrade head at c8d9e0f1a2b3 sit at
that revision and would silently miss an in-place fix.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FIVE_STATE_CHECK = "status IN ('pending', 'leased', 'completed', 'failed', 'dead')"
FOUR_STATE_CHECK = "status IN ('pending', 'leased', 'completed', 'dead')"


def upgrade() -> None:
    with op.batch_alter_table("agent_tasks") as batch:
        batch.drop_constraint("ck_agent_tasks_status", type_="check")
        batch.create_check_constraint("ck_agent_tasks_status", FIVE_STATE_CHECK)
        # remove the silent org-system stamp — direct SQL inserts without
        # an org now fail NOT NULL loudly (test-verified IntegrityError)
        batch.alter_column(
            "organization_id",
            existing_type=sa.Text(),
            nullable=False,
            server_default=None,
        )


def downgrade() -> None:
    # remap failed → dead FIRST so the 4-state CHECK is satisfiable on
    # databases that contain failed rows (dead = semantically closest
    # terminal under the 4-state contract)
    op.execute("UPDATE agent_tasks SET status = 'dead' WHERE status = 'failed'")
    with op.batch_alter_table("agent_tasks") as batch:
        batch.drop_constraint("ck_agent_tasks_status", type_="check")
        batch.create_check_constraint("ck_agent_tasks_status", FOUR_STATE_CHECK)
        # restore the pre-correction default (the 4-state/implicit-org
        # contract of c8d9e0f1a2b3)
        batch.alter_column(
            "organization_id",
            existing_type=sa.Text(),
            nullable=False,
            server_default="org-system",
        )
