"""
Lead models — leads, lead_contacts, lead_tags, lead_state_history.

The lead domain is owned by Agents 2 and 3. Agent 2 enriches raw leads;
Agent 3 runs outreach sequences and qualifies them.
"""

from __future__ import annotations

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class Lead(Base):
    """The core entity — a buyer company.

    current_state is denormalized here (full audit trail in lead_state_history)
    so dashboard queries are O(1) with an index.
    """

    __tablename__ = "leads"

    lead_id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    headquarters_country: Mapped[str | None] = mapped_column(Text)
    headquarters_city: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    source_row_hash: Mapped[str | None] = mapped_column(Text)

    # Denormalized lifecycle fields (updated by StateManager)
    current_state: Mapped[str] = mapped_column(Text, nullable=False, default="NEW")
    current_agent: Mapped[str] = mapped_column(Text, nullable=False, default="none")
    last_touch_ts: Mapped[str | None] = mapped_column(Text)
    next_action_due_ts: Mapped[str | None] = mapped_column(Text)
    next_action_agent: Mapped[str] = mapped_column(Text, default="none")

    # Enrichment fields (set by Agent 2)
    priority_tier: Mapped[str | None] = mapped_column(Text)
    recommended_vp: Mapped[str | None] = mapped_column(Text)
    outreach_language: Mapped[str] = mapped_column(Text, nullable=False, default="EN")
    sequence_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Sample tracking (set by Agent 4)
    sample_lead_id: Mapped[str | None] = mapped_column(Text)
    substitute_round: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ghosted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Audit fields
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    # Relationships
    contacts: Mapped[list[LeadContact]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    tags: Mapped[list[LeadTag]] = relationship(back_populates="lead", cascade="all, delete-orphan")
    state_history: Mapped[list[LeadStateHistory]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    outreach_touches: Mapped[list[OutreachTouch]] = relationship(  # noqa: F821
        back_populates="lead", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "current_state IN ('NEW', 'ENRICHED', 'IN_SEQUENCE', 'QUALIFIED', "
            "'SAMPLE_DISPATCHED', 'SAMPLE_FEEDBACK_DUE', 'DECIDED_APPROVED', "
            "'DECIDED_REJECTED', 'DECIDED_NEEDS_ANOTHER', 'GHOSTED', "
            "'CONTRACTED', 'NURTURE', 'BLOCKED')",
            name="ck_leads_current_state",
        ),
        CheckConstraint(
            "priority_tier IN ('S', 'A', 'B', 'C', 'Disqualify') OR priority_tier IS NULL",
            name="ck_leads_priority_tier",
        ),
        CheckConstraint(
            "recommended_vp IN ('VP1', 'VP2', 'VP3', 'VP4') OR recommended_vp IS NULL",
            name="ck_leads_recommended_vp",
        ),
        CheckConstraint(
            "outreach_language IN ('EN', 'DE', 'FR', 'IT', 'JA', 'KO', 'ZH', 'AR', 'TR', 'RU')",
            name="ck_leads_outreach_language",
        ),
        UniqueConstraint("company_name", "headquarters_country", name="uq_leads_company_country"),
        Index("ix_leads_current_state", "current_state"),
        Index("ix_leads_current_agent", "current_agent"),
        Index("ix_leads_priority_tier", "priority_tier"),
        Index("ix_leads_next_action", "next_action_due_ts"),
        Index("ix_leads_source_hash", "source_row_hash"),
    )

    def __repr__(self) -> str:
        return f"<Lead {self.lead_id}: {self.company_name} ({self.current_state})>"


class LeadContact(Base):
    """Multiple decision makers per lead. Normalized (no decision_maker_1/2 columns)."""

    __tablename__ = "lead_contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    linkedin_url: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    is_primary: Mapped[int] = mapped_column(Integer, default=0)
    is_buyer: Mapped[int] = mapped_column(Integer, default=0)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    lead: Mapped[Lead] = relationship(back_populates="contacts")

    __table_args__ = (
        Index("ix_lead_contacts_lead_id", "lead_id"),
        Index("ix_lead_contacts_email", "email"),
    )

    def __repr__(self) -> str:
        return f"<LeadContact {self.id}: {self.name} ({self.title})>"


class LeadTag(Base):
    """Many-to-many tags on leads (fairtrade, organic, microlot, etc.)."""

    __tablename__ = "lead_tags"

    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )
    tag: Mapped[str] = mapped_column(Text, nullable=False)
    tagged_ts: Mapped[str] = mapped_column(Text, nullable=False)

    lead: Mapped[Lead] = relationship(back_populates="tags")

    __table_args__ = (
        PrimaryKeyConstraint("lead_id", "tag"),
        Index("ix_lead_tags_tag", "tag"),
    )

    def __repr__(self) -> str:
        return f"<LeadTag {self.lead_id}:{self.tag}>"


class LeadStateHistory(Base):
    """Append-only audit trail of lead state transitions. Never updated or deleted."""

    __tablename__ = "lead_state_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )
    from_state: Mapped[str | None] = mapped_column(Text)
    to_state: Mapped[str] = mapped_column(Text, nullable=False)
    agent_id: Mapped[str] = mapped_column(Text, nullable=False)
    ts: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    lead: Mapped[Lead] = relationship(back_populates="state_history")

    __table_args__ = (
        Index("ix_lead_state_history_lead", "lead_id"),
        Index("ix_lead_state_history_ts", "ts"),
    )

    def __repr__(self) -> str:
        return f"<LeadStateHistory {self.lead_id}: {self.from_state}→{self.to_state}>"
