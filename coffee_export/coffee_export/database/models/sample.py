"""
Sample models — sample_requests, sample_request_lots, sample_shipments,
cupping_scores, sample_decisions, sample_budget, sample_waitlist.

Owned by Agent 4. Tracks the full sample lifecycle from dispatch
through cupping evaluation to the Approved/Rejected/Needs-another decision.
"""

from __future__ import annotations

from sqlalchemy import REAL, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class SampleRequest(Base):
    """The sample dispatch record. One per sample cycle."""

    __tablename__ = "sample_requests"

    sample_request_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lead_id: Mapped[str] = mapped_column(Text, ForeignKey("leads.lead_id"), nullable=False)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    sample_type: Mapped[str] = mapped_column(Text, nullable=False)
    crop_year: Mapped[str] = mapped_column(Text, nullable=False)
    buyer_company: Mapped[str] = mapped_column(Text, nullable=False)
    buyer_attention_name: Mapped[str | None] = mapped_column(Text)
    buyer_shipping_address: Mapped[str | None] = mapped_column(Text)
    buyer_destination_country: Mapped[str | None] = mapped_column(Text)
    buyer_language: Mapped[str] = mapped_column(Text, default="EN")
    shipping_arrangement: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="draft")
    dispatched_ts: Mapped[str | None] = mapped_column(Text)
    delivered_ts: Mapped[str | None] = mapped_column(Text)
    feedback_due_ts: Mapped[str | None] = mapped_column(Text)
    decided_ts: Mapped[str | None] = mapped_column(Text)
    ghosted_ts: Mapped[str | None] = mapped_column(Text)
    substitute_round: Mapped[int] = mapped_column(Integer, default=0)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    lots: Mapped[list[SampleRequestLot]] = relationship(
        back_populates="sample_request", cascade="all, delete-orphan"
    )
    shipments: Mapped[list[SampleShipment]] = relationship(
        back_populates="sample_request", cascade="all, delete-orphan"
    )
    cupping_scores: Mapped[list[CuppingScore]] = relationship(
        back_populates="sample_request", cascade="all, delete-orphan"
    )
    decisions: Mapped[list[SampleDecision]] = relationship(back_populates="sample_request")

    __table_args__ = (
        CheckConstraint(
            "sample_type IN ('350g', '200g', '500g', '150g')", name="ck_sample_requests_type"
        ),
        CheckConstraint(
            "status IN ('draft', 'approved', 'dispatched', 'delivered', "
            "'feedback_due', 'decided', 'ghosted', 'cancelled')",
            name="ck_sample_requests_status",
        ),
        CheckConstraint(
            "shipping_arrangement IN ('paid', 'pre_paid', 'fallback_150g') "
            "OR shipping_arrangement IS NULL",
            name="ck_sample_requests_shipping",
        ),
        Index("ix_sample_requests_lead", "lead_id"),
        Index("ix_sample_requests_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<SampleRequest {self.sample_request_id}: {self.buyer_company} ({self.status})>"


class SampleRequestLot(Base):
    """Junction table — a sample request can include 1-5 lots."""

    __tablename__ = "sample_request_lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sample_request_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("sample_requests.sample_request_id", ondelete="CASCADE"),
        nullable=False,
    )
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    quantity_grams: Mapped[int] = mapped_column(Integer, nullable=False)
    confirmed: Mapped[int] = mapped_column(Integer, default=0)
    substitute_for_lot_id: Mapped[str | None] = mapped_column(Text)

    sample_request: Mapped[SampleRequest] = relationship(back_populates="lots")

    __table_args__ = (
        Index("ix_sample_request_lots_sample", "sample_request_id"),
        Index("ix_sample_request_lots_lot", "lot_id"),
    )

    def __repr__(self) -> str:
        return f"<SampleRequestLot sample={self.sample_request_id} lot={self.lot_id}>"


class SampleShipment(Base):
    """Tracking information for dispatched samples."""

    __tablename__ = "sample_shipments"

    shipment_id: Mapped[str] = mapped_column(Text, primary_key=True)
    sample_request_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("sample_requests.sample_request_id", ondelete="CASCADE"),
        nullable=False,
    )
    carrier: Mapped[str | None] = mapped_column(Text)
    tracking_number: Mapped[str | None] = mapped_column(Text)
    carrier_account: Mapped[str | None] = mapped_column(Text)
    pickup_ts: Mapped[str | None] = mapped_column(Text)
    estimated_arrival_ts: Mapped[str | None] = mapped_column(Text)
    delivered_ts: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending")
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    sample_request: Mapped[SampleRequest] = relationship(back_populates="shipments")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'picked_up', 'in_transit', 'delivered', "
            "'delayed', 'lost', 'damaged', 'returned')",
            name="ck_sample_shipments_status",
        ),
        Index("ix_sample_shipments_request", "sample_request_id"),
    )

    def __repr__(self) -> str:
        return f"<SampleShipment {self.shipment_id}: {self.tracking_number} ({self.status})>"


class CuppingScore(Base):
    """Buyer's cupping evaluation per lot per sample event (SCA 10 attributes)."""

    __tablename__ = "cupping_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sample_request_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("sample_requests.sample_request_id", ondelete="CASCADE"),
        nullable=False,
    )
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    buyer_company: Mapped[str] = mapped_column(Text, nullable=False)
    cupper_name: Mapped[str | None] = mapped_column(Text)

    # SCA 10 attributes (each /10 except uniformity, clean_cup, sweetness which are /10)
    fragrance_aroma: Mapped[float | None] = mapped_column(REAL)
    flavor: Mapped[float | None] = mapped_column(REAL)
    aftertaste: Mapped[float | None] = mapped_column(REAL)
    acidity: Mapped[float | None] = mapped_column(REAL)
    body: Mapped[float | None] = mapped_column(REAL)
    balance: Mapped[float | None] = mapped_column(REAL)
    uniformity: Mapped[float | None] = mapped_column(REAL)
    clean_cup: Mapped[float | None] = mapped_column(REAL)
    sweetness: Mapped[float | None] = mapped_column(REAL)
    overall: Mapped[float | None] = mapped_column(REAL)
    total_score: Mapped[float | None] = mapped_column(REAL)

    defect_count_buyer: Mapped[int | None] = mapped_column(Integer)
    buyer_notes: Mapped[str | None] = mapped_column(Text)
    our_score: Mapped[float | None] = mapped_column(REAL)
    score_difference: Mapped[float | None] = mapped_column(REAL)
    cupped_ts: Mapped[str | None] = mapped_column(Text)
    received_ts: Mapped[str] = mapped_column(Text, nullable=False)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    sample_request: Mapped[SampleRequest] = relationship(back_populates="cupping_scores")

    __table_args__ = (
        Index("ix_cupping_scores_lot", "lot_id"),
        Index("ix_cupping_scores_sample", "sample_request_id"),
    )

    def __repr__(self) -> str:
        return f"<CuppingScore lot={self.lot_id} score={self.total_score}>"


class SampleDecision(Base):
    """The Approved/Rejected/Needs-another-sample decision per lot."""

    __tablename__ = "sample_decisions"

    decision_id: Mapped[str] = mapped_column(Text, primary_key=True)
    sample_request_id: Mapped[str] = mapped_column(
        Text, ForeignKey("sample_requests.sample_request_id"), nullable=False
    )
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    buyer_target_fob: Mapped[float | None] = mapped_column(REAL)
    buyer_target_volume_bags: Mapped[int | None] = mapped_column(Integer)
    buyer_target_port: Mapped[str | None] = mapped_column(Text)
    buyer_target_shipment_window: Mapped[str | None] = mapped_column(Text)
    buyer_payment_terms: Mapped[str | None] = mapped_column(Text)
    decision_ts: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    sample_request: Mapped[SampleRequest] = relationship(back_populates="decisions")

    __table_args__ = (
        CheckConstraint(
            "decision IN ('approved', 'rejected', 'needs_another_sample', 'undecided')",
            name="ck_sample_decisions_decision",
        ),
        Index("ix_sample_decisions_sample", "sample_request_id"),
        Index("ix_sample_decisions_lot", "lot_id"),
        Index("ix_sample_decisions_decision", "decision"),
    )

    def __repr__(self) -> str:
        return f"<SampleDecision {self.decision_id}: lot={self.lot_id} {self.decision}>"


class SampleBudget(Base):
    """Weekly counter for sample budget. One row per week (Monday-Sunday)."""

    __tablename__ = "sample_budget"

    week_start: Mapped[str] = mapped_column(Text, primary_key=True)
    week_end: Mapped[str] = mapped_column(Text, nullable=False)
    full_sets_used: Mapped[int] = mapped_column(Integer, default=0)
    fallback_150g_used: Mapped[int] = mapped_column(Integer, default=0)
    type_b_used: Mapped[int] = mapped_column(Integer, default=0)
    type_c_used: Mapped[int] = mapped_column(Integer, default=0)
    last_updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    last_updated_by: Mapped[str | None] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<SampleBudget {self.week_start}: full={self.full_sets_used}/3>"


class SampleWaitlist(Base):
    """Leads queued for next week's sample budget (tier-ordered)."""

    __tablename__ = "sample_waitlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[str] = mapped_column(Text, ForeignKey("leads.lead_id"), nullable=False)
    tier: Mapped[str | None] = mapped_column(Text)
    sample_type: Mapped[str | None] = mapped_column(Text)
    queued_ts: Mapped[str] = mapped_column(Text, nullable=False)
    fulfilled_ts: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "tier IN ('S', 'A', 'B', 'C') OR tier IS NULL", name="ck_sample_waitlist_tier"
        ),
        Index("ix_sample_waitlist_fulfilled", "fulfilled_ts"),
    )

    def __repr__(self) -> str:
        return f"<SampleWaitlist {self.id}: lead={self.lead_id} tier={self.tier}>"
