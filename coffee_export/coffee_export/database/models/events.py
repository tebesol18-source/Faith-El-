"""
Event Bus model — events table.

Used by the EventBus (step 4) for decoupled inter-agent communication.
Every event published by any agent is logged here for delivery, replay,
and audit.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from coffee_export.database.base import Base


class Event(Base):
    """Event bus log entry. Published by agents, consumed by subscribers."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[str | None] = mapped_column(Text)  # JSON
    published_by: Mapped[str] = mapped_column(Text, nullable=False)  # agent_id or operator_id
    published_ts: Mapped[str] = mapped_column(Text, nullable=False)
    consumed_by: Mapped[str | None] = mapped_column(Text)
    consumed_ts: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    agent_id: Mapped[str | None] = mapped_column(Text)
    job_id: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'consumed', 'failed', 'dead_letter')",
            name="ck_events_status",
        ),
        Index("ix_events_type", "event_type"),
        Index("ix_events_status", "status"),
        Index("ix_events_published_ts", "published_ts"),
        Index("ix_events_entity", "entity_type", "entity_id"),
    )

    def __repr__(self) -> str:
        return f"<Event {self.id}: {self.event_type} ({self.status})>"
