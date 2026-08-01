"""add messaging gateway tables (exporter_inboxes, message_threads, inbox_messages)

Revision ID: a1b2c3d4e5f6
Revises: 8bbb5aa6e009
Create Date: 2026-07-06

Creates three tables for the Internal Messaging Gateway:
  - exporter_inboxes: one masked mailbox per exporter (operator).
                       Maps masked_email <-> operator_id. Buyer sees only
                       this address; exporter's real email is fallback-only.
  - message_threads:  one conversation thread per (lead x exporter). Groups
                       all inbound + outbound emails for the same buyer.
  - inbox_messages:   every inbound and outbound email. Stores raw body,
                       GLM-processed summary / classification / translation,
                       AND structured extraction fields, read status, reply
                       linkage, and provider message id.

Architecture: All mutations go through StateManager. Agents and the inbound
webhook endpoint never touch these tables via SessionLocal directly.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "8bbb5aa6e009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── exporter_inboxes ──────────────────────────────────────────────
    op.create_table(
        "exporter_inboxes",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column(
            "operator_id",
            sa.TEXT,
            sa.ForeignKey("operators.operator_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("masked_email", sa.TEXT, nullable=False, unique=True),
        sa.Column("display_name", sa.TEXT, nullable=False),
        sa.Column("real_email", sa.TEXT),
        sa.Column("is_active", sa.INTEGER, nullable=False, server_default="1"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
    )
    op.create_index("ix_exporter_inboxes_operator", "exporter_inboxes", ["operator_id"])
    op.create_index(
        "ix_exporter_inboxes_masked_email", "exporter_inboxes", ["masked_email"]
    )

    # ── message_threads ───────────────────────────────────────────────
    op.create_table(
        "message_threads",
        sa.Column("thread_id", sa.TEXT, primary_key=True),
        sa.Column(
            "lead_id",
            sa.TEXT,
            sa.ForeignKey("leads.lead_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "inbox_id",
            sa.INTEGER,
            sa.ForeignKey("exporter_inboxes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "buyer_contact_id",
            sa.INTEGER,
            sa.ForeignKey("lead_contacts.id", ondelete="SET NULL"),
        ),
        sa.Column("buyer_email", sa.TEXT, nullable=False),
        sa.Column("subject", sa.TEXT, nullable=False),
        sa.Column("status", sa.TEXT, nullable=False, server_default="active"),
        sa.Column("last_message_ts", sa.TEXT),
        sa.Column("last_message_direction", sa.TEXT),
        sa.Column("message_count", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("unread_count", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("closed_ts", sa.TEXT),
        sa.CheckConstraint(
            "status IN ('active', 'awaiting_buyer', 'awaiting_exporter', 'closed')",
            name="ck_message_threads_status",
        ),
        sa.CheckConstraint(
            "last_message_direction IN ('inbound', 'outbound') "
            "OR last_message_direction IS NULL",
            name="ck_message_threads_last_dir",
        ),
    )
    op.create_index("ix_message_threads_lead", "message_threads", ["lead_id"])
    op.create_index("ix_message_threads_inbox", "message_threads", ["inbox_id"])
    op.create_index("ix_message_threads_status", "message_threads", ["status"])

    # ── inbox_messages ────────────────────────────────────────────────
    # NOTE: This includes ALL columns (both base AI fields AND structured
    # extraction fields) in a single migration. The original 2-migration
    # approach is collapsed into 1 since the DB was wiped.
    op.create_table(
        "inbox_messages",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column(
            "thread_id",
            sa.TEXT,
            sa.ForeignKey("message_threads.thread_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("direction", sa.TEXT, nullable=False),
        sa.Column("from_addr", sa.TEXT, nullable=False),
        sa.Column("to_addr", sa.TEXT, nullable=False),
        sa.Column("reply_to", sa.TEXT),
        sa.Column("subject", sa.TEXT, nullable=False),
        sa.Column("body_text", sa.TEXT, nullable=False, server_default=""),
        sa.Column("body_html", sa.TEXT),
        # Provider tracking
        sa.Column("provider", sa.TEXT, nullable=False, server_default="resend"),
        sa.Column("provider_message_id", sa.TEXT),
        sa.Column("in_reply_to", sa.TEXT),
        # AI-processed fields (inbound only)
        sa.Column("ai_processed", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("glm_summary", sa.TEXT),
        sa.Column("glm_classification", sa.TEXT),
        sa.Column("glm_intent", sa.TEXT),
        sa.Column("glm_translation", sa.TEXT),
        sa.Column("glm_language_detected", sa.TEXT),
        sa.Column("glm_cost_usd", sa.REAL),
        sa.Column("glm_provider", sa.TEXT),
        # Structured extraction fields (GLM parses buyer reply)
        sa.Column("extracted_intent", sa.TEXT),
        sa.Column("extracted_volume_bags", sa.INTEGER),
        sa.Column("extracted_origin", sa.TEXT),
        sa.Column("extracted_grade", sa.TEXT),
        sa.Column("extracted_destination", sa.TEXT),
        sa.Column("extracted_incoterm", sa.TEXT),
        sa.Column("extracted_urgency", sa.TEXT),
        sa.Column("extracted_next_action", sa.TEXT),
        sa.Column("extracted_data", sa.TEXT),  # JSON blob
        # Read / status
        sa.Column("is_read", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("read_ts", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False, server_default="new"),
        # Audit
        sa.Column("raw_payload", sa.TEXT),
        sa.Column("sent_ts", sa.TEXT),
        sa.Column("received_ts", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.CheckConstraint(
            "direction IN ('inbound', 'outbound')",
            name="ck_inbox_messages_direction",
        ),
        sa.CheckConstraint(
            "status IN ('new', 'read', 'replied', 'archived', 'ignored')",
            name="ck_inbox_messages_status",
        ),
        sa.CheckConstraint(
            "glm_classification IN ('positive', 'negative', 'question', 'objection', "
            "'meeting_request', 'out_of_office', 'auto_reply') "
            "OR glm_classification IS NULL",
            name="ck_inbox_messages_classification",
        ),
        sa.CheckConstraint(
            "extracted_intent IN ('sample_request', 'pricing_question', "
            "'logistics_question', 'meeting_request', 'objection', "
            "'complaint', 'confirmation', 'out_of_office', "
            "'auto_reply', 'other') OR extracted_intent IS NULL",
            name="ck_inbox_messages_intent",
        ),
        sa.CheckConstraint(
            "extracted_urgency IN ('High', 'Medium', 'Low') "
            "OR extracted_urgency IS NULL",
            name="ck_inbox_messages_urgency",
        ),
    )
    op.create_index("ix_inbox_messages_thread", "inbox_messages", ["thread_id"])
    op.create_index("ix_inbox_messages_direction", "inbox_messages", ["direction"])
    op.create_index(
        "ix_inbox_messages_received_ts", "inbox_messages", ["received_ts"]
    )
    op.create_index("ix_inbox_messages_status", "inbox_messages", ["status"])
    op.create_index(
        "ix_inbox_messages_provider_msg_id",
        "inbox_messages",
        ["provider_message_id"],
    )
    op.create_index(
        "ix_inbox_messages_extracted_intent",
        "inbox_messages",
        ["extracted_intent"],
    )


def downgrade() -> None:
    op.drop_index("ix_inbox_messages_extracted_intent", table_name="inbox_messages")
    op.drop_index("ix_inbox_messages_provider_msg_id", table_name="inbox_messages")
    op.drop_index("ix_inbox_messages_status", table_name="inbox_messages")
    op.drop_index("ix_inbox_messages_received_ts", table_name="inbox_messages")
    op.drop_index("ix_inbox_messages_direction", table_name="inbox_messages")
    op.drop_index("ix_inbox_messages_thread", table_name="inbox_messages")
    op.drop_table("inbox_messages")

    op.drop_index("ix_message_threads_status", table_name="message_threads")
    op.drop_index("ix_message_threads_inbox", table_name="message_threads")
    op.drop_index("ix_message_threads_lead", table_name="message_threads")
    op.drop_table("message_threads")

    op.drop_index("ix_exporter_inboxes_masked_email", table_name="exporter_inboxes")
    op.drop_index("ix_exporter_inboxes_operator", table_name="exporter_inboxes")
    op.drop_table("exporter_inboxes")
