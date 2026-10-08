"""buyer_masks registry + message_threads.buyer_mask_id (Phase 4)

Revision ID: a7b8c9d0e1f2
Revises: c3d4e5f6a7b8
Create Date: 2026-10-08

Phase 4 buyer identity masking. This migration ONLY changes the schema:

  1. Creates the buyer_masks registry table (tenant-scoped, deterministic
     HMAC lookup key, AES-256-GCM encrypted real address, alias address,
     active/revoked lifecycle).
  2. Adds a nullable buyer_mask_id FK to message_threads.

Deliberately NO data rewrite happens here (docs/buyer-masking.md):
  * Migrations run in environments that may not have BUYER_MASK_SECRET,
    and creating a mask requires the secret (encryption + HMAC key).
  * Existing thread/message rows are preserved byte-for-byte; legacy
    plaintext rows are migrated lazily and audited by the gateway's
    self-heal (StateManager.heal_thread_buyer_mask) the first time the
    gateway touches them, never silently.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "buyer_masks",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.TEXT, nullable=False, server_default="org-system"),
        sa.Column("alias_address", sa.TEXT, nullable=False),
        sa.Column("lookup_key", sa.TEXT, nullable=False),
        sa.Column("real_email_encrypted", sa.TEXT, nullable=False),
        sa.Column("lead_id", sa.TEXT, nullable=True),
        sa.Column("buyer_contact_id", sa.INTEGER, nullable=True),
        sa.Column("status", sa.TEXT, nullable=False, server_default="active"),
        sa.Column("created_by", sa.TEXT, nullable=True),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("revoked_ts", sa.TEXT, nullable=True),
        sa.Column("revoke_reason", sa.TEXT, nullable=True),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["buyer_contact_id"], ["lead_contacts.id"], ondelete="SET NULL"),
        sa.CheckConstraint("status IN ('active', 'revoked')", name="ck_buyer_masks_status"),
        sa.UniqueConstraint("alias_address", name="uq_buyer_masks_alias_address"),
    )
    op.create_index(
        "uq_buyer_masks_org_lookup",
        "buyer_masks",
        ["organization_id", "lookup_key"],
        unique=True,
    )
    op.create_index("ix_buyer_masks_alias", "buyer_masks", ["alias_address"])
    op.create_index("ix_buyer_masks_lookup_key", "buyer_masks", ["lookup_key"])
    op.create_index("ix_buyer_masks_org_id", "buyer_masks", ["organization_id"])
    op.create_index("ix_buyer_masks_lead", "buyer_masks", ["lead_id"])
    op.create_index("ix_buyer_masks_buyer_contact", "buyer_masks", ["buyer_contact_id"])

    # Nullable FK on message_threads. SQLite accepts inline REFERENCES in
    # ADD COLUMN — a batch table-rebuild would risk the existing named
    # indexes/constraints, so use the direct statement (idempotent-guarded
    # like d5e6f7a8b9c0).
    conn = op.get_bind()
    cols = [
        row[1]
        for row in conn.execute(sa.text("PRAGMA table_info(message_threads)")).fetchall()
    ]
    if "buyer_mask_id" not in cols:
        op.execute(
            "ALTER TABLE message_threads ADD COLUMN buyer_mask_id INTEGER "
            "REFERENCES buyer_masks(id) ON DELETE SET NULL"
        )


def downgrade() -> None:
    """SQLite < 3.35 can't DROP COLUMN — the FK column stays if old.

    The registry table itself is dropped (it holds no data needed by
    threads once unlinked; aliases in buyer_email remain readable text).
    """
    try:
        op.execute("ALTER TABLE message_threads DROP COLUMN buyer_mask_id")
    except Exception:
        pass  # older SQLite — harmless empty column remains
    op.drop_index("ix_buyer_masks_buyer_contact", table_name="buyer_masks")
    op.drop_index("ix_buyer_masks_lead", table_name="buyer_masks")
    op.drop_index("ix_buyer_masks_org_id", table_name="buyer_masks")
    op.drop_index("ix_buyer_masks_lookup_key", table_name="buyer_masks")
    op.drop_index("ix_buyer_masks_alias", table_name="buyer_masks")
    op.drop_index("uq_buyer_masks_org_lookup", table_name="buyer_masks")
    op.drop_table("buyer_masks")
