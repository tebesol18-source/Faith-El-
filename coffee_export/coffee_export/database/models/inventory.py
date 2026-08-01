"""
Inventory models — coops, washing_stations, lots, stock_movements,
lot_reservations, lot_feedback, qa_flags.

Owned by Agent 1. The inventory domain tracks coffee lots from coop
through washing station to sample dispatch and contract commitment.
"""

from __future__ import annotations

from sqlalchemy import REAL, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class Coop(Base):
    """Cooperatives that own washing stations."""

    __tablename__ = "coops"

    coop_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str | None] = mapped_column(Text)
    registration_number: Mapped[str | None] = mapped_column(Text)
    contact_name: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str | None] = mapped_column(Text)
    contact_email: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    stations: Mapped[list[WashingStation]] = relationship(back_populates="coop")
    lots: Mapped[list[Lot]] = relationship(back_populates="coop")

    __table_args__ = (
        CheckConstraint(
            "region IN ('Yirgacheffe', 'Sidamo', 'Guji', 'Limu', 'Jimma', 'Harrar', 'other') "
            "OR region IS NULL",
            name="ck_coops_region",
        ),
        Index("ix_coops_region", "region"),
    )

    def __repr__(self) -> str:
        return f"<Coop {self.coop_id}: {self.name}>"


class WashingStation(Base):
    """Washing stations, each belonging to a coop."""

    __tablename__ = "washing_stations"

    station_id: Mapped[str] = mapped_column(Text, primary_key=True)
    coop_id: Mapped[str] = mapped_column(Text, ForeignKey("coops.coop_id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str | None] = mapped_column(Text)
    gps_lat: Mapped[float | None] = mapped_column(REAL)
    gps_lon: Mapped[float | None] = mapped_column(REAL)
    altitude_m: Mapped[int | None] = mapped_column(Integer)
    capacity_bags_per_year: Mapped[int | None] = mapped_column(Integer)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    coop: Mapped[Coop] = relationship(back_populates="stations")
    lots: Mapped[list[Lot]] = relationship(back_populates="station")

    __table_args__ = (
        CheckConstraint(
            "region IN ('Yirgacheffe', 'Sidamo', 'Guji', 'Limu', 'Jimma', 'Harrar', 'other') "
            "OR region IS NULL",
            name="ck_washing_stations_region",
        ),
        Index("ix_washing_stations_coop", "coop_id"),
        Index("ix_washing_stations_region", "region"),
    )

    def __repr__(self) -> str:
        return f"<WashingStation {self.station_id}: {self.name}>"


class Lot(Base):
    """Coffee lots — the core inventory entity."""

    __tablename__ = "lots"

    lot_id: Mapped[str] = mapped_column(Text, primary_key=True)
    station_id: Mapped[str] = mapped_column(
        Text, ForeignKey("washing_stations.station_id"), nullable=False
    )
    coop_id: Mapped[str] = mapped_column(Text, ForeignKey("coops.coop_id"), nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False)
    washing_station_name: Mapped[str | None] = mapped_column(Text)  # denormalized
    coop_name: Mapped[str | None] = mapped_column(Text)  # denormalized
    process: Mapped[str] = mapped_column(Text, nullable=False)
    screen_size: Mapped[int | None] = mapped_column(Integer)
    cupping_score: Mapped[float | None] = mapped_column(REAL)
    q_grader_name: Mapped[str | None] = mapped_column(Text)
    grading_date: Mapped[str | None] = mapped_column(Text)
    defect_count_sca: Mapped[int | None] = mapped_column(Integer)
    moisture_pct: Mapped[float | None] = mapped_column(REAL)
    water_activity: Mapped[float | None] = mapped_column(REAL)
    crop_year: Mapped[str] = mapped_column(Text, nullable=False)
    harvest_date_range: Mapped[str | None] = mapped_column(Text)
    milling_date: Mapped[str | None] = mapped_column(Text)
    stock_bags_remaining: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bag_size_kg: Mapped[int] = mapped_column(Integer, default=60)
    certifications: Mapped[str | None] = mapped_column(Text)
    certificate_of_origin: Mapped[str | None] = mapped_column(Text)

    # EUDR fields
    eudr_data_status: Mapped[str] = mapped_column(Text, nullable=False, default="missing")
    eudr_gps_lat: Mapped[float | None] = mapped_column(REAL)
    eudr_gps_lon: Mapped[float | None] = mapped_column(REAL)
    eudr_farmgate_price_etb_per_kg: Mapped[float | None] = mapped_column(REAL)
    eudr_deforestation_attestation: Mapped[str | None] = mapped_column(Text)

    reserved_for_forward_program: Mapped[str] = mapped_column(Text, default="No")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    last_updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    station: Mapped[WashingStation] = relationship(back_populates="lots")
    coop: Mapped[Coop] = relationship(back_populates="lots")
    stock_movements: Mapped[list[StockMovement]] = relationship(
        back_populates="lot", cascade="all, delete-orphan"
    )
    reservations: Mapped[list[LotReservation]] = relationship(back_populates="lot")
    feedback: Mapped[list[LotFeedback]] = relationship(back_populates="lot")
    qa_flags: Mapped[list[QAFlag]] = relationship(back_populates="lot")

    __table_args__ = (
        CheckConstraint(
            "region IN ('Yirgacheffe', 'Sidamo', 'Guji', 'Limu', 'Jimma', 'Harrar', 'other')",
            name="ck_lots_region",
        ),
        CheckConstraint(
            "process IN ('Washed', 'Natural', 'Honey', 'Anaerobic')", name="ck_lots_process"
        ),
        CheckConstraint(
            "eudr_data_status IN ('complete', 'partial', 'missing')", name="ck_lots_eudr_status"
        ),
        CheckConstraint(
            "status IN ('active', 'committed', 'depleted', 'hold')", name="ck_lots_status"
        ),
        CheckConstraint(
            "reserved_for_forward_program IN ('Yes', 'No')", name="ck_lots_reserved_forward"
        ),
        Index("ix_lots_region_process", "region", "process"),
        Index("ix_lots_status_eudr", "status", "eudr_data_status"),
        Index("ix_lots_crop_year", "crop_year"),
        Index("ix_lots_cupping_score", "cupping_score"),
        Index("ix_lots_station", "station_id"),
    )

    def __repr__(self) -> str:
        return f"<Lot {self.lot_id}: {self.region} {self.process} score={self.cupping_score}>"


class StockMovement(Base):
    """Audit trail of stock changes — the ledger behind lots.stock_bags_remaining."""

    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lot_id: Mapped[str] = mapped_column(
        Text, ForeignKey("lots.lot_id", ondelete="CASCADE"), nullable=False
    )
    delta_bags: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    ts: Mapped[str] = mapped_column(Text, nullable=False)
    agent_id: Mapped[str | None] = mapped_column(Text)
    operator_id: Mapped[str | None] = mapped_column(Text)

    lot: Mapped[Lot] = relationship(back_populates="stock_movements")

    __table_args__ = (
        CheckConstraint(
            "reason IN ('sample_dispatch', 'contract_commit', 'stock_correction', "
            "'depletion', 'qa_hold', 'qa_release', 'initial_stock')",
            name="ck_stock_movements_reason",
        ),
        Index("ix_stock_movements_lot", "lot_id"),
        Index("ix_stock_movements_ts", "ts"),
    )

    def __repr__(self) -> str:
        return f"<StockMovement {self.lot_id}: {self.delta_bags:+d} ({self.reason})>"


class LotReservation(Base):
    """7-day sample holds on lots. Prevents double-counting stock."""

    __tablename__ = "lot_reservations"

    reservation_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    lead_id: Mapped[str] = mapped_column(Text, ForeignKey("leads.lead_id"), nullable=False)
    sample_type: Mapped[str] = mapped_column(Text, nullable=False)
    quantity_grams: Mapped[int] = mapped_column(Integer, nullable=False)
    reserved_ts: Mapped[str] = mapped_column(Text, nullable=False)
    reserved_until_ts: Mapped[str] = mapped_column(Text, nullable=False)
    buyer_company: Mapped[str | None] = mapped_column(Text)
    crop_year: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="active")

    lot: Mapped[Lot] = relationship(back_populates="reservations")

    __table_args__ = (
        CheckConstraint(
            "sample_type IN ('350g', '200g', '500g', '150g')",
            name="ck_lot_reservations_sample_type",
        ),
        CheckConstraint(
            "status IN ('active', 'expired', 'fulfilled', 'cancelled')",
            name="ck_lot_reservations_status",
        ),
        Index("ix_lot_reservations_lot", "lot_id"),
        Index("ix_lot_reservations_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<LotReservation {self.reservation_id}: lot={self.lot_id} type={self.sample_type}>"


class LotFeedback(Base):
    """Rejection feedback from buyers. Auto-flags QA on ≥2 critical keywords."""

    __tablename__ = "lot_feedback"

    feedback_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    buyer_company: Mapped[str | None] = mapped_column(Text)
    buyer_segment: Mapped[str | None] = mapped_column(Text)
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=False)
    logged_ts: Mapped[str] = mapped_column(Text, nullable=False)
    qa_auto_flagged: Mapped[int] = mapped_column(Integer, default=0)
    sample_request_id: Mapped[str | None] = mapped_column(Text)

    lot: Mapped[Lot] = relationship(back_populates="feedback")

    __table_args__ = (
        Index("ix_lot_feedback_lot", "lot_id"),
        Index("ix_lot_feedback_ts", "logged_ts"),
    )

    def __repr__(self) -> str:
        return f"<LotFeedback {self.feedback_id}: lot={self.lot_id}>"


class QAFlag(Base):
    """Audit trail of QA holds on lots."""

    __tablename__ = "qa_flags"

    qa_flag_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    auto: Mapped[int] = mapped_column(Integer, default=0)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    flagged_ts: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_ts: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[str | None] = mapped_column(Text)
    resolution_notes: Mapped[str | None] = mapped_column(Text)

    lot: Mapped[Lot] = relationship(back_populates="qa_flags")

    __table_args__ = (Index("ix_qa_flags_lot", "lot_id"),)

    def __repr__(self) -> str:
        return f"<QAFlag {self.qa_flag_id}: lot={self.lot_id} auto={self.auto}>"
