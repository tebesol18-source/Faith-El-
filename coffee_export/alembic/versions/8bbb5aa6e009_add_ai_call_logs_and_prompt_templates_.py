"""add ai_call_logs and prompt_templates tables

Revision ID: 8bbb5aa6e009
Revises: 2695b02416a5
Create Date: 2026-07-02

Creates two tables for the AI Gateway:
  - ai_call_logs: every LLM call logged with provider, model, tokens, cost, latency
  - prompt_templates: reusable prompt templates with variables
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8bbb5aa6e009"
down_revision: str | Sequence[str] | None = "2695b02416a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── AI Call Logs ──
    op.create_table(
        "ai_call_logs",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("agent_id", sa.TEXT, nullable=False),
        sa.Column("provider", sa.TEXT, nullable=False),
        sa.Column("model", sa.TEXT, nullable=False),
        sa.Column("task_type", sa.TEXT, nullable=False),
        sa.Column("prompt_hash", sa.TEXT),
        sa.Column("prompt_tokens", sa.INTEGER),
        sa.Column("completion_tokens", sa.INTEGER),
        sa.Column("total_tokens", sa.INTEGER),
        sa.Column("cost_usd", sa.REAL),
        sa.Column("latency_ms", sa.INTEGER),
        sa.Column("success", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("error_message", sa.TEXT),
        sa.Column("cached", sa.INTEGER, server_default="0"),
        sa.Column("response_preview", sa.TEXT),
        sa.Column("called_ts", sa.TEXT, nullable=False),
    )
    op.create_index("ix_ai_call_logs_agent", "ai_call_logs", ["agent_id"])
    op.create_index("ix_ai_call_logs_provider", "ai_call_logs", ["provider"])
    op.create_index("ix_ai_call_logs_ts", "ai_call_logs", ["called_ts"])
    op.create_index("ix_ai_call_logs_prompt_hash", "ai_call_logs", ["prompt_hash"])

    # ── Prompt Templates ──
    op.create_table(
        "prompt_templates",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("template_name", sa.TEXT, nullable=False, unique=True),
        sa.Column("agent_id", sa.TEXT, nullable=False),
        sa.Column("task_type", sa.TEXT, nullable=False),
        sa.Column("system_prompt", sa.TEXT),
        sa.Column("user_prompt_template", sa.TEXT, nullable=False),
        sa.Column("variables", sa.TEXT),
        sa.Column("preferred_provider", sa.TEXT),
        sa.Column("preferred_model", sa.TEXT),
        sa.Column("max_tokens", sa.INTEGER, server_default="1000"),
        sa.Column("temperature", sa.REAL, server_default="0.7"),
        sa.Column("is_active", sa.INTEGER, server_default="1"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
    )
    op.create_index("ix_prompt_templates_agent", "prompt_templates", ["agent_id"])
    op.create_index("ix_prompt_templates_task", "prompt_templates", ["task_type"])


def downgrade() -> None:
    op.drop_table("prompt_templates")
    op.drop_table("ai_call_logs")
