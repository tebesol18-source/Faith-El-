"""
Relationship models — accounts, account_activities.

Owned by Agent 7. Accounts are created when a lead reaches CONTRACTED
state. They track the ongoing buyer relationship: calls, meetings, NPS,
repeat orders.
"""

from __future__ import annotations

from sqlalchemy import REAL, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class Account(Base):
    """Ongoing buyer relationships (post-contract). Created when lead → CONTRACTED."""

    __tablename__ = "accounts"

    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lead_id: Mapped[str] = mapped_column(Text, ForeignKey("leads.lead_id"), nullable=False)
    account_manager: Mapped[str | None] = mapped_column(Text)  # operator_id
    relationship_status: Mapped[str] = mapped_column(Text, default="active")
    total_volume_bags: Mapped[int] = mapped_column(Integer, default=0)
    total_revenue_usd: Mapped[float] = mapped_column(REAL, default=0)
    first_contract_date: Mapped[str | None] = mapped_column(Text)
    last_activity_ts: Mapped[str | None] = mapped_column(Text)
    nps_score: Mapped[int | None] = mapped_column(Integer)  # -100 to +100
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    activities: Mapped[list[AccountActivity]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "relationship_status IN ('active', 'dormant', 'churned', 'at_risk')",
            name="ck_accounts_status",
        ),
        Index("ix_accounts_lead", "lead_id"),
        Index("ix_accounts_status", "relationship_status"),
    )

    def __repr__(self) -> str:
        return f"<Account {self.account_id}: lead={self.lead_id} ({self.relationship_status})>"


class AccountActivity(Base):
    """Relationship touches: calls, meetings, emails, site visits, NPS surveys."""

    __tablename__ = "account_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str] = mapped_column(
        Text, ForeignKey("accounts.account_id", ondelete="CASCADE"), nullable=False
    )
    activity_type: Mapped[str] = mapped_column(Text, nullable=False)
    activity_ts: Mapped[str] = mapped_column(Text, nullable=False)
    participants: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    next_steps: Mapped[str | None] = mapped_column(Text)
    next_action_due_ts: Mapped[str | None] = mapped_column(Text)
    nps_score: Mapped[int | None] = mapped_column(Integer)
    nps_feedback: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    account: Mapped[Account] = relationship(back_populates="activities")

    __table_args__ = (
        CheckConstraint(
            "activity_type IN ('call', 'meeting', 'email', 'site_visit', 'gift', "
            "'sample_request', 'contract_signed', 'delivery_followup', 'nps_survey', 'other')",
            name="ck_account_activities_type",
        ),
        Index("ix_account_activities_account", "account_id"),
        Index("ix_account_activities_ts", "activity_ts"),
    )

    def __repr__(self) -> str:
        return f"<AccountActivity {self.id}: {self.activity_type} @ {self.activity_ts}>"
