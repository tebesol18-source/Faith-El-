"""add phone column to account_requests

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-28

Adds an optional `phone` column to the `account_requests` table so that
users requesting access can include a phone number for the admin to
contact them out-of-band (e.g., to deliver a temporary password).

The column is nullable — the form makes it optional.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add phone column to account_requests."""
    # SQLite doesn't support "ADD COLUMN IF NOT EXISTS", so check first
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(account_requests)")).fetchall()]
    if "phone" not in cols:
        op.execute("ALTER TABLE account_requests ADD COLUMN phone TEXT")


def downgrade() -> None:
    """Remove phone column from account_requests.
    SQLite < 3.35 doesn't support DROP COLUMN — leave the column in place
    (it's harmless if empty).
    """
    try:
        op.execute("ALTER TABLE account_requests DROP COLUMN phone")
    except Exception:
        # Older SQLite — column remains but is empty
        pass
