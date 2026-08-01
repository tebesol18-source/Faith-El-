"""
Messaging Gateway models — exporter_inboxes, message_threads, inbox_messages.

The Internal Messaging Gateway masks exporter identity from buyers:

    Buyer  →  marcus.bell@faithelexport.com  →  Platform  →  Exporter Dashboard

The buyer NEVER sees the exporter's real email. The exporter NEVER touches
their own Gmail/Outlook. Every reply flows back through the platform, where
GLM classifies / summarizes / translates / extracts structured fields before
the exporter sees it in the dashboard inbox.

Tables
------
  exporter_inboxes  — one masked mailbox per exporter (operator).
                      Maps masked_email <-> operator_id, holds display name
                      and the (encrypted-at-rest-in-app-layer) real email
                      used only for crash-notification fallback.

  message_threads   — one thread per (lead x exporter). Groups all inbound
                      and outbound messages for the same buyer conversation.
                      Thread subject is set by the first outbound email and
                      reused on every reply so Resend can thread them.

  inbox_messages    — every inbound and outbound email. Stores raw body,
                      AI-processed summary / classification / translation,
                      AND structured extraction fields (intent, volume_bags,
                      origin, grade, destination, incoterm, urgency,
                      next_action), read status, and reply linkage.

Architecture compliance
-----------------------
These tables are OWNED by Agent 3 (outbound) and the Messaging Gateway
(inbound). All mutations go through StateManager. No agent writes to
these tables directly via SessionLocal.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class ExporterInbox(Base):
    """One masked mailbox per exporter (operator).

    Generated pattern (professional, non-revealing):
        "Marcus Bell"      -> marcus.bell@faithelexport.com
        "Aurea Coffee PLC" -> aurea.coffee@faithelexport.com

    The buyer sees only this address. The exporter's real email is stored
    ONLY for crash-notification fallback and is never used as a From: or
    Reply-To: address.
    """

    __tablename__ = "exporter_inboxes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[str] = mapped_column(
        Text, ForeignKey("operators.operator_id", ondelete="CASCADE"), nullable=False
    )
    masked_email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    real_email: Mapped[str | None] = mapped_column(Text)  # fallback only, never buyer-facing
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    threads: Mapped[list[MessageThread]] = relationship(
        back_populates="inbox", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_exporter_inboxes_operator", "operator_id"),
        Index("ix_exporter_inboxes_masked_email", "masked_email"),
    )

    def __repr__(self) -> str:
        return f"<ExporterInbox {self.masked_email} ({self.display_name})>"


class MessageThread(Base):
    """One conversation thread per (lead x exporter).

    All inbound and outbound emails between one buyer and one exporter are
    grouped here. The thread subject is set by the first outbound email and
    reused in every reply so Resend / Gmail can thread them visually.

    Lifecycle: active -> awaiting_buyer -> awaiting_exporter -> closed.
    """

    __tablename__ = "message_threads"

    thread_id: Mapped[str] = mapped_column(Text, primary_key=True)  # T-YYYY-NNNNN
    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )
    inbox_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exporter_inboxes.id", ondelete="CASCADE"), nullable=False
    )
    buyer_contact_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lead_contacts.id", ondelete="SET NULL")
    )
    buyer_email: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    # active | awaiting_buyer | awaiting_exporter | closed

    last_message_ts: Mapped[str | None] = mapped_column(Text)
    last_message_direction: Mapped[str | None] = mapped_column(Text)  # inbound | outbound
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    closed_ts: Mapped[str | None] = mapped_column(Text)

    inbox: Mapped[ExporterInbox] = relationship(back_populates="threads")
    messages: Mapped[list[InboxMessage]] = relationship(
        back_populates="thread", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'awaiting_buyer', 'awaiting_exporter', 'closed')",
            name="ck_message_threads_status",
        ),
        CheckConstraint(
            "last_message_direction IN ('inbound', 'outbound') "
            "OR last_message_direction IS NULL",
            name="ck_message_threads_last_dir",
        ),
        Index("ix_message_threads_lead", "lead_id"),
        Index("ix_message_threads_inbox", "inbox_id"),
        Index("ix_message_threads_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<MessageThread {self.thread_id}: lead={self.lead_id} ({self.status})>"


class InboxMessage(Base):
    """Every inbound and outbound email in the messaging gateway.

    Direction:
      outbound - sent by Agent 3 (or exporter via dashboard) to the buyer.
      inbound  - received from the buyer, processed by GLM before display.

    AI fields (inbound only):
      glm_summary         - 1-2 sentence English summary
      glm_classification  - positive | negative | question | objection |
                            meeting_request | out_of_office | auto_reply
      glm_translation     - English translation if non-English
      glm_intent          - free-text intent tag
      ai_processed        - 0 until GLM has run, 1 after

    Structured extraction (inbound only):
      extracted_intent          - sample_request | pricing_question |
                                  logistics_question | meeting_request |
                                  objection | complaint | confirmation |
                                  out_of_office | auto_reply | other
      extracted_volume_bags     - integer (e.g. 320 bags of 60kg)
      extracted_origin          - Ethiopian region (Yirgacheffe, Guji, ...)
      extracted_grade           - Grade 1, Grade 2, Specialty, ...
      extracted_destination     - port or city (Hamburg, Antwerp, ...)
      extracted_incoterm        - FOB, CIF, EXW, CFR, DAP
      extracted_urgency         - High | Medium | Low
      extracted_next_action     - free-text recommendation for the exporter
      extracted_data            - full JSON blob (forward-compat, audit)

    Storage:
      body_text    - plain text body (always present)
      body_html    - HTML body (optional)
      raw_payload  - JSON of the original provider webhook payload (audit)
    """

    __tablename__ = "inbox_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(
        Text, ForeignKey("message_threads.thread_id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[str] = mapped_column(Text, nullable=False)  # inbound | outbound

    from_addr: Mapped[str] = mapped_column(Text, nullable=False)
    to_addr: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to: Mapped[str | None] = mapped_column(Text)

    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_html: Mapped[str | None] = mapped_column(Text)

    # Provider tracking
    provider: Mapped[str] = mapped_column(Text, nullable=False, default="resend")
    provider_message_id: Mapped[str | None] = mapped_column(Text)
    in_reply_to: Mapped[str | None] = mapped_column(Text)

    # AI-processed fields (inbound only; outbound stays NULL)
    ai_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    glm_summary: Mapped[str | None] = mapped_column(Text)
    glm_classification: Mapped[str | None] = mapped_column(Text)
    glm_intent: Mapped[str | None] = mapped_column(Text)
    glm_translation: Mapped[str | None] = mapped_column(Text)
    glm_language_detected: Mapped[str | None] = mapped_column(Text)
    glm_cost_usd: Mapped[float | None] = mapped_column(Float)
    glm_provider: Mapped[str | None] = mapped_column(Text)

    # Structured extraction (GLM parses buyer reply into CRM-ready fields)
    extracted_intent: Mapped[str | None] = mapped_column(Text)
    extracted_volume_bags: Mapped[int | None] = mapped_column(Integer)
    extracted_origin: Mapped[str | None] = mapped_column(Text)
    extracted_grade: Mapped[str | None] = mapped_column(Text)
    extracted_destination: Mapped[str | None] = mapped_column(Text)
    extracted_incoterm: Mapped[str | None] = mapped_column(Text)
    extracted_urgency: Mapped[str | None] = mapped_column(Text)
    extracted_next_action: Mapped[str | None] = mapped_column(Text)
    extracted_data: Mapped[str | None] = mapped_column(Text)  # JSON blob

    # Read/unread (for exporter dashboard inbox UI)
    is_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    read_ts: Mapped[str | None] = mapped_column(Text)

    # Operator-facing status (for triage)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="new")
    # new | read | replied | archived | ignored

    # Original webhook payload (audit / reprocessing)
    raw_payload: Mapped[str | None] = mapped_column(Text)  # JSON

    sent_ts: Mapped[str | None] = mapped_column(Text)
    received_ts: Mapped[str | None] = mapped_column(Text)
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    thread: Mapped[MessageThread] = relationship(back_populates="messages")

    __table_args__ = (
        CheckConstraint(
            "direction IN ('inbound', 'outbound')", name="ck_inbox_messages_direction"
        ),
        CheckConstraint(
            "status IN ('new', 'read', 'replied', 'archived', 'ignored')",
            name="ck_inbox_messages_status",
        ),
        CheckConstraint(
            "glm_classification IN ('positive', 'negative', 'question', 'objection', "
            "'meeting_request', 'out_of_office', 'auto_reply') "
            "OR glm_classification IS NULL",
            name="ck_inbox_messages_classification",
        ),
        CheckConstraint(
            "extracted_intent IN ('sample_request', 'pricing_question', "
            "'logistics_question', 'meeting_request', 'objection', "
            "'complaint', 'confirmation', 'out_of_office', "
            "'auto_reply', 'other') OR extracted_intent IS NULL",
            name="ck_inbox_messages_intent",
        ),
        CheckConstraint(
            "extracted_urgency IN ('High', 'Medium', 'Low') "
            "OR extracted_urgency IS NULL",
            name="ck_inbox_messages_urgency",
        ),
        Index("ix_inbox_messages_thread", "thread_id"),
        Index("ix_inbox_messages_direction", "direction"),
        Index("ix_inbox_messages_received_ts", "received_ts"),
        Index("ix_inbox_messages_status", "status"),
        Index("ix_inbox_messages_provider_msg_id", "provider_message_id"),
        Index("ix_inbox_messages_extracted_intent", "extracted_intent"),
    )

    def __repr__(self) -> str:
        return (
            f"<InboxMessage {self.id}: {self.direction} "
            f"thread={self.thread_id} {self.subject[:40]!r}>"
        )
