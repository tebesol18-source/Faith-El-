"""add must_change_password, admin_audit_log, sessions tables

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-28

Phase 3 of authentication hardening:

1. Add `must_change_password` column to operators (INTEGER 0/1, default 0).
   Set to 1 when:
     - A new operator is created (admin sets initial password)
     - An admin resets a password with auto-generated temp password
     - An access request is approved (auto-generated temp password)
   Cleared to 0 when the operator changes their own password via
   /api/auth/change-password. Until cleared, the operator is redirected
   to the change-password page after every login.

2. Create `admin_audit_log` table.
   Records every admin mutation: create/edit/delete operator, reset
   password, approve/reject access request. Stores who did what, when,
   to whom, with what before/after state.

3. Create `sessions` table.
   Replaces the stateless base64 token (which had no revocation) with
   a DB-backed session. Every login creates a session row; every
   authenticated request validates the session exists + isn't revoked;
   admin can revoke any session (force-logout).

   This is a breaking change to the token format — old tokens will be
   rejected after this migration. All users will need to log in again.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply the migration. All operations are idempotent."""

    # ═══ 1. Add must_change_password to operators ═══
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(operators)")).fetchall()]
    if "must_change_password" not in cols:
        op.execute("ALTER TABLE operators ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")

    # ═══ 2. Create admin_audit_log table ═══
    op.execute("""
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            actor_email TEXT NOT NULL,
            actor_ip TEXT,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT,
            target_email TEXT,
            details TEXT,
            success INTEGER NOT NULL DEFAULT 1
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_ts ON admin_audit_log(timestamp)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_actor ON admin_audit_log(actor_email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_action ON admin_audit_log(action)")

    # ═══ 3. Create sessions table ═══
    op.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            operator_id TEXT NOT NULL,
            operator_email TEXT NOT NULL,
            operator_role TEXT NOT NULL,
            issued_ts TEXT NOT NULL,
            expires_ts TEXT NOT NULL,
            revoked_ts TEXT,
            revoked_by TEXT,
            ip_address TEXT,
            user_agent TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_sessions_operator ON sessions(operator_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sessions_expires ON sessions(expires_ts)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sessions_revoked ON sessions(revoked_ts)")


def downgrade() -> None:
    """Reverse the migration."""
    # Drop sessions
    op.execute("DROP INDEX IF EXISTS ix_sessions_revoked")
    op.execute("DROP INDEX IF EXISTS ix_sessions_expires")
    op.execute("DROP INDEX IF EXISTS ix_sessions_operator")
    op.execute("DROP TABLE IF EXISTS sessions")

    # Drop admin_audit_log
    op.execute("DROP INDEX IF EXISTS ix_audit_log_action")
    op.execute("DROP INDEX IF EXISTS ix_audit_log_actor")
    op.execute("DROP INDEX IF EXISTS ix_audit_log_ts")
    op.execute("DROP TABLE IF EXISTS admin_audit_log")

    # Remove must_change_password from operators (SQLite < 3.35 may not support DROP COLUMN)
    try:
        op.execute("ALTER TABLE operators DROP COLUMN must_change_password")
    except Exception:
        pass
