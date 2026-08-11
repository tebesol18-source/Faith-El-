"""add organization_id to remaining tenant tables

Revision ID: a1b2c3d4e5f7
Revises: 8df0417b9935
Create Date: 2026-08-06

Adds organization_id to tables that are queried by tenant-scoped API routes
but were missed by the original multi-tenancy migration.

All existing rows get the default 'org-system' organization_id.
New rows must be inserted with the correct org_id by the application layer.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "8df0417b9935"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that need organization_id for tenant isolation
TABLES_TO_FIX = [
    "ai_call_logs",
    "inbox_messages",
    "message_threads",
    "exporter_inboxes",
    "pending_agent_actions",
    "contract_line_items",
    "sample_request_lots",
    "cupping_scores",
    "sample_decisions",
    "buyer_memory",
    "agent_feedback",
    "shipment_items",
    "customs_documents",
    "invoices",
    "payments",
    "commissions",
    "costs",
    "profits",
    "stock_movements",
    "lot_reservations",
    "lot_feedback",
    "qa_flags",
    "sample_budget",
    "sample_waitlist",
    "sample_shipments",
    "lead_contacts",
    "lead_state_history",
    "lead_tags",
    "outreach_touches",
    "qualification_answers",
    "sequence_templates",
    "account_activities",
    "accounts",
]


def upgrade() -> None:
    conn = op.get_bind()

    for table_name in TABLES_TO_FIX:
        # Check if the table exists
        result = conn.execute(sa.text(
            f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
        )).fetchone()

        if not result:
            continue  # Table doesn't exist — skip

        # Check if organization_id already exists
        cols = [row[1] for row in conn.execute(sa.text(f"PRAGMA table_info({table_name})")).fetchall()]
        if "organization_id" in cols:
            continue  # Already has it — skip

        # Add the column with a default
        op.execute(
            f"ALTER TABLE {table_name} ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-system'"
        )
        # Create an index for faster tenant queries
        try:
            op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_org_id ON {table_name}(organization_id)")
        except Exception:
            pass  # Index creation may fail on some SQLite versions — not critical


def downgrade() -> None:
    for table_name in reversed(TABLES_TO_FIX):
        try:
            op.execute(f"DROP INDEX IF EXISTS ix_{table_name}_org_id")
            op.execute(f"ALTER TABLE {table_name} DROP COLUMN organization_id")
        except Exception:
            pass  # SQLite < 3.35 doesn't support DROP COLUMN
