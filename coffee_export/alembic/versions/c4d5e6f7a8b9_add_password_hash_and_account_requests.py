"""add password_hash to operators and account_requests table

Revision ID: c4d5e6f7a8b9
Revises: f7c8d9e0a1b2
Create Date: 2026-07-28

Phase 1 of proper authentication:

  1. Adds `password_hash` column to the `operators` table.
     Stored as TEXT, nullable initially (so the migration is safe to apply
     on existing rows). The seed script + admin UI will populate it.
     Once every operator has a hash, a future migration can make it NOT NULL.

  2. Creates the `account_requests` table for the "Request Access" flow
     on the login page. When a user submits the form, a row is inserted
     here with status='pending'. An admin reviews it in the Admin panel
     and either approves (creates an operator row) or rejects.

     Status workflow: pending → approved | rejected
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "f7c8d9e0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── 1. Add password_hash column to operators ───
    # SQLite's ALTER TABLE ADD COLUMN is fine — it's a non-destructive add.
    # We use raw SQL with IF NOT EXISTS-like guard via PRAGMA check.
    # SQLite doesn't support "ADD COLUMN IF NOT EXISTS", so we check the
    # column list first.
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(operators)")).fetchall()]
    if "password_hash" not in cols:
        op.execute(
            "ALTER TABLE operators ADD COLUMN password_hash TEXT"
        )

    # ─── 2. Create account_requests table ───
    op.execute("""
        CREATE TABLE IF NOT EXISTS account_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            company TEXT,
            job_title TEXT,
            message TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            submitted_ts TEXT NOT NULL,
            reviewed_by TEXT,
            reviewed_ts TEXT,
            review_notes TEXT,
            created_operator_id TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_account_requests_status ON account_requests(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_account_requests_email ON account_requests(email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_account_requests_submitted ON account_requests(submitted_ts)")


def downgrade() -> None:
    # Drop account_requests table
    op.execute("DROP INDEX IF EXISTS ix_account_requests_submitted")
    op.execute("DROP INDEX IF EXISTS ix_account_requests_email")
    op.execute("DROP INDEX IF EXISTS ix_account_requests_status")
    op.execute("DROP TABLE IF EXISTS account_requests")

    # SQLite doesn't support DROP COLUMN until 3.35.0+. To be safe across
    # SQLite versions, recreate the table without password_hash.
    # However, since we made it nullable, we can leave it in place — it's
    # a no-op column. For a clean downgrade, do the table recreate.
    # In practice, downgrading this migration is rare, so we leave the column.
    # If you need a truly clean downgrade, do it manually:
    #   ALTER TABLE operators RENAME TO operators_old;
    #   CREATE TABLE operators (... without password_hash ...);
    #   INSERT INTO operators SELECT ... FROM operators_old;
    #   DROP TABLE operators_old;
