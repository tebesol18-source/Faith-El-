"""add conversation_memory table for Agent 3 AI memory

Revision ID: e9d9dc16f298
Revises: 47eb259e4dd2
Create Date: 2026-07-02T11:00:00

Creates the conversation_memory table that lets Agent 3 remember
conversations across touches rather than responding to each message
in isolation.

Memory types:
  - conversation_summary: summary of a touch exchange
  - buyer_preference: what the buyer likes/dislikes
  - objection: a concern or objection raised
  - qualification_signal: a QUAL-relevant signal
  - context: general context about the relationship
  - next_step: what to do next with this lead

Importance (1-10): higher = more salient. Used for context window
selection when there are too many memories to include all.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e9d9dc16f298"
down_revision: str | Sequence[str] | None = "47eb259e4dd2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conversation_memory",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("memory_type", sa.TEXT, nullable=False),
        sa.Column("content", sa.TEXT, nullable=False),
        sa.Column("source", sa.TEXT, server_default="Agent 3"),
        sa.Column("importance", sa.INTEGER, server_default="5"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT, nullable=True),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "memory_type IN ('conversation_summary', 'buyer_preference', "
            "'objection', 'qualification_signal', 'context', 'next_step')",
            name="ck_conversation_memory_type",
        ),
        sa.CheckConstraint("importance >= 0 AND importance <= 10", name="ck_memory_importance"),
    )
    op.create_index("ix_conversation_memory_lead", "conversation_memory", ["lead_id"])
    op.create_index("ix_conversation_memory_type", "conversation_memory", ["memory_type"])
    op.create_index("ix_conversation_memory_importance", "conversation_memory", ["importance"])


def downgrade() -> None:
    op.drop_table("conversation_memory")
