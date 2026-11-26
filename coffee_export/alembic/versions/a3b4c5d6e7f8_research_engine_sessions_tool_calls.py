"""Research engine — research_sessions + research_tool_calls (TryComp Phase 2)

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-11-25

Two new org-scoped tables for the research session engine
(coffee_export/research/, docs/trycomp-integration-progress.md §12.1):

  * research_sessions — one research objective in execution: objective +
    normalized objective_key (duplicate-research detection, §12.5), plan
    JSON, budgets JSON (BudgetSpec — null fields mean unlimited), usage
    counters (tool calls, model calls, reported cost — usage_cost_usd is
    NULL until a provider actually reports a cost, never zero-by-fabrication),
    the sanctioned status lifecycle (pending → running → completed/failed/
    cancelled/budget_exhausted; budget_exhausted → running only via the
    human resume path) and the structured result on completion.
  * research_tool_calls — the append-only per-session tool-call log:
    validated input, structured output, honest status (ok | error |
    capability_unavailable | budget_exhausted | blocked_policy), reported
    cost only, measured duration_ms. Rows are never deleted or mutated.

Additive only — no existing table is touched (the ai_call_logs
organization_id ORM mapping shipped in Phase 2 is schema-neutral: that
column has existed since migration a1b2c3d4e5f7). The upgrade is safe for
the committed operational DB (which ships at b9d0e1f2a4b5; deployment runs
it, this project never does). Downgrade drops exactly these two tables;
nothing references them (no inbound FKs anywhere in the schema).

organization_id is NOT NULL with NO default on both tables — the
LeadSource/LeadVerificationLog pattern. No FK to research_sessions by
design (same decision as the Phase 1 tables): (session_id) is referenced
only within the same org and enforced by the service layer.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Canonical unlimited BudgetSpec (sorted keys, compact separators —
# research/common.canonical_json form): all limits null = unlimited.
UNLIMITED_BUDGETS = (
    '{"max_cost_usd":null,"max_model_calls":null,"max_tool_calls":null,"max_wall_seconds":null}'
)


def upgrade() -> None:
    op.create_table(
        "research_sessions",
        sa.Column("session_id", sa.TEXT, primary_key=True),
        sa.Column("organization_id", sa.TEXT, nullable=False),
        sa.Column("objective", sa.TEXT, nullable=False),
        sa.Column("objective_key", sa.TEXT, nullable=False),
        sa.Column("status", sa.TEXT, nullable=False, server_default="pending"),
        sa.Column("plan", sa.TEXT, nullable=False),
        sa.Column("budgets", sa.TEXT, nullable=False, server_default=UNLIMITED_BUDGETS),
        sa.Column("usage_tool_calls", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("usage_model_calls", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("usage_cost_usd", sa.REAL),
        sa.Column("result", sa.TEXT),
        sa.Column("error_message", sa.TEXT),
        sa.Column("created_by", sa.TEXT, nullable=False),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("started_ts", sa.TEXT),
        sa.Column("finished_ts", sa.TEXT),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled',"
            " 'budget_exhausted')",
            name="ck_research_sessions_status",
        ),
        sa.CheckConstraint("usage_tool_calls >= 0", name="ck_research_sessions_tool_calls"),
        sa.CheckConstraint("usage_model_calls >= 0", name="ck_research_sessions_model_calls"),
    )
    # Status-filtered history and the dedup lookup hot path (§12.5).
    op.create_index(
        "ix_research_sessions_org_status",
        "research_sessions",
        ["organization_id", "status"],
    )
    op.create_index(
        "ix_research_sessions_org_key",
        "research_sessions",
        ["organization_id", "objective_key"],
    )

    op.create_table(
        "research_tool_calls",
        sa.Column("call_id", sa.TEXT, primary_key=True),
        sa.Column("organization_id", sa.TEXT, nullable=False),
        sa.Column("session_id", sa.TEXT, nullable=False),
        sa.Column("tool", sa.TEXT, nullable=False),
        sa.Column("input", sa.TEXT, nullable=False),
        sa.Column("output", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False),
        sa.Column("error_message", sa.TEXT),
        sa.Column("cost_usd", sa.REAL),
        sa.Column("duration_ms", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.CheckConstraint(
            "status IN ('ok', 'error', 'capability_unavailable', 'budget_exhausted',"
            " 'blocked_policy')",
            name="ck_research_tool_calls_status",
        ),
        sa.CheckConstraint("duration_ms >= 0", name="ck_research_tool_calls_duration"),
    )
    # The history/audit hot path: calls of one session in order.
    op.create_index(
        "ix_research_tool_calls_session",
        "research_tool_calls",
        ["organization_id", "session_id", "created_ts"],
    )


def downgrade() -> None:
    op.drop_table("research_tool_calls")
    op.drop_table("research_sessions")
