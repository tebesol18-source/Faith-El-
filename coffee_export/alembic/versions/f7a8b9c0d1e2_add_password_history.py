"""add password_history table

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-30

Phase 4B: Password history — prevents users from reusing their last 5
passwords. When a password is changed, the old hash is stored here.
On subsequent changes, the new password is checked against the last 5
hashes in this table.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS password_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operator_id TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_ts TEXT NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_password_history_operator ON password_history(operator_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_password_history_ts ON password_history(created_ts)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_password_history_ts")
    op.execute("DROP INDEX IF EXISTS ix_password_history_operator")
    op.execute("DROP TABLE IF EXISTS password_history")
