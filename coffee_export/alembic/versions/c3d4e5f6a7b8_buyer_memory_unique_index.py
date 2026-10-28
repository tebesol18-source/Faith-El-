"""buyer_memory unique index for supervisor upserts

The supervisor's setBuyerMemory()/learnFromFeedback() upserts use
ON CONFLICT(lead_id, memory_type, memory_key), but the table was created
without that UNIQUE constraint — every tick crashed with "ON CONFLICT
clause does not match any PRIMARY KEY or UNIQUE constraint".

This migration:
  1. Deduplicates any existing (lead_id, memory_type, memory_key) rows,
     keeping the newest by updated_ts (lowest rowid on ties).
  2. Creates the UNIQUE index the upserts expect.

Revision ID: c3d4e5f6a7b8
Revises: b7e1f3c9a2d4
Create Date: 2026-09-28
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b7e1f3c9a2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Safety dedup — keep the newest row per (lead_id, memory_type, memory_key)
    op.execute(
        """
        DELETE FROM buyer_memory
        WHERE id NOT IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY lead_id, memory_type, memory_key
                           ORDER BY updated_ts DESC, id DESC
                       ) AS rn
                FROM buyer_memory
            )
            WHERE rn = 1
        )
        """
    )
    # 2. The unique index the supervisor's ON CONFLICT(lead_id, memory_type, memory_key) expects
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_memory_unique "
        "ON buyer_memory(lead_id, memory_type, memory_key)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_buyer_memory_unique")
