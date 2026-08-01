"""
Conversation Memory model — AI memory for Agent 3.

Lets Agent 3 remember conversations across touches rather than responding
to each message in isolation. Stores summaries, preferences, objections,
and context per lead.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class ConversationMemory(Base):
    """
    A conversation memory entry for a lead.

    Memory types:
      - conversation_summary: summary of a touch exchange
      - buyer_preference: what the buyer likes/dislikes
      - objection: a concern or objection raised
      - qualification_signal: a QUAL-relevant signal
      - context: general context about the relationship
      - next_step: what to do next with this lead

    Importance (1-10): higher = more salient. Used for context window
    selection when there are too many memories to include all.
    """

    __tablename__ = "conversation_memory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )
    memory_type: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, default="Agent 3")
    importance: Mapped[int] = mapped_column(Integer, default=5)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    lead: Mapped[Lead] = relationship()  # noqa: F821

    __table_args__ = (
        CheckConstraint(
            "memory_type IN ('conversation_summary', 'buyer_preference', "
            "'objection', 'qualification_signal', 'context', 'next_step')",
            name="ck_conversation_memory_type",
        ),
        CheckConstraint("importance >= 0 AND importance <= 10", name="ck_memory_importance"),
        Index("ix_conversation_memory_lead", "lead_id"),
        Index("ix_conversation_memory_type", "memory_type"),
        Index("ix_conversation_memory_importance", "importance"),
    )

    def __repr__(self) -> str:
        return (
            f"<ConversationMemory {self.id}: lead={self.lead_id} "
            f"type={self.memory_type} importance={self.importance}>"
        )
