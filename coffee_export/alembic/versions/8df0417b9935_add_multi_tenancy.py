"""add_multi_tenancy

Revision ID: 8df0417b9935
Revises: f7a8b9c0d1e2
Create Date: 2026-08-03 13:41:01.947280

"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8df0417b9935"
down_revision: str | Sequence[str] | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create organizations table
    op.create_table(
        "organizations",
        sa.Column("organization_id", sa.TEXT(), primary_key=True),
        sa.Column("name", sa.TEXT(), nullable=False),
        sa.Column("status", sa.TEXT(), nullable=False, server_default="active"),
        sa.Column("created_ts", sa.TEXT(), nullable=False),
        sa.Column("updated_ts", sa.TEXT(), nullable=False),
    )

    # Insert default organization
    op.execute(
        "INSERT OR IGNORE INTO organizations (organization_id, name, status, created_ts, updated_ts) "
        "VALUES ('org-system', 'System Default Organization', 'active', '2026-08-03T12:00:00+03:00', '2026-08-03T12:00:00+03:00')"
    )

    # Add organization_id to key tables
    target_tables = [
        "operators",
        "leads",
        "contracts",
        "shipments",
        "sessions",
        "lots",
        "sample_requests",
        "compliance_documents",
        "admin_audit_log",
        "events",
        "pending_agent_actions",
        "agent_feedback",
        "supervisor_log"
    ]

    for table_name in target_tables:
        op.add_column(
            table_name,
            sa.Column(
                "organization_id",
                sa.TEXT(),
                nullable=False,
                server_default="org-system"
            )
        )
        op.create_index(f"ix_{table_name}_org_id", table_name, ["organization_id"])

    # Add agent_id and job_id to events table
    op.add_column("events", sa.Column("agent_id", sa.TEXT(), nullable=True))
    op.add_column("events", sa.Column("job_id", sa.TEXT(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    target_tables = [
        "operators",
        "leads",
        "contracts",
        "shipments",
        "sessions",
        "lots",
        "sample_requests",
        "compliance_documents",
        "admin_audit_log",
        "events",
        "pending_agent_actions",
        "agent_feedback",
        "supervisor_log"
    ]

    op.drop_column("events", "agent_id")
    op.drop_column("events", "job_id")

    for table_name in target_tables:
        op.drop_index(f"ix_{table_name}_org_id", table_name=table_name)
        op.drop_column(table_name, "organization_id")

    op.drop_table("organizations")
