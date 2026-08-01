"""
Outreach & Qualification models — sequence_templates, outreach_touches,
qualification_answers.

Owned by Agent 3. Tracks the cadence of LinkedIn/email touches and the
Q1-Q5 QUAL gate answers.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base
from coffee_export.database.models.lead import Lead


class SequenceTemplate(Base):
    """Outreach sequence definitions (Sequence A: LinkedIn-first, B: email-first)."""

    __tablename__ = "sequence_templates"

    template_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    is_active: Mapped[int] = mapped_column(Integer, default=1)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    touches: Mapped[list[OutreachTouch]] = relationship(back_populates="template")

    __table_args__ = (
        CheckConstraint(
            "channel IN ('linkedin_first', 'email_first', 'whatsapp_first')",
            name="ck_sequence_templates_channel",
        ),
    )

    def __repr__(self) -> str:
        return f"<SequenceTemplate {self.template_id}: {self.name}>"


class OutreachTouch(Base):
    """Individual outreach events — each LinkedIn message, email, or phone call."""

    __tablename__ = "outreach_touches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("sequence_templates.template_id")
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    direction: Mapped[str] = mapped_column(Text, nullable=False, default="outbound")
    contact_id: Mapped[str | None] = mapped_column(Text)  # which lead_contact (by id)
    subject: Mapped[str | None] = mapped_column(Text)
    content_summary: Mapped[str | None] = mapped_column(Text)
    sent_ts: Mapped[str | None] = mapped_column(Text)
    response_ts: Mapped[str | None] = mapped_column(Text)
    response_content: Mapped[str | None] = mapped_column(Text)
    response_type: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    lead: Mapped[Lead] = relationship(back_populates="outreach_touches")
    template: Mapped[SequenceTemplate | None] = relationship(back_populates="touches")

    __table_args__ = (
        CheckConstraint(
            "channel IN ('linkedin', 'email', 'phone', 'whatsapp', 'other')",
            name="ck_outreach_touches_channel",
        ),
        CheckConstraint(
            "direction IN ('outbound', 'inbound')", name="ck_outreach_touches_direction"
        ),
        Index("ix_outreach_touches_lead", "lead_id"),
        Index("ix_outreach_touches_sent_ts", "sent_ts"),
    )

    def __repr__(self) -> str:
        return f"<OutreachTouch {self.id}: lead={self.lead_id} step={self.step_number}>"


class QualificationAnswer(Base):
    """Q1-Q5 QUAL gate answers. Each answer is a row (history of re-asks)."""

    __tablename__ = "qualification_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    answer_detail: Mapped[str | None] = mapped_column(Text)
    answered_ts: Mapped[str] = mapped_column(Text, nullable=False)
    answered_by: Mapped[str] = mapped_column(Text, nullable=False)
    is_positive: Mapped[int] = mapped_column(Integer, default=0)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "question IN ('Q1', 'Q2', 'Q3', 'Q4', 'Q5')", name="ck_qual_answers_question"
        ),
        Index("ix_qual_answers_lead", "lead_id"),
    )

    def __repr__(self) -> str:
        return f"<QualificationAnswer {self.lead_id}:{self.question}={self.answer}>"
