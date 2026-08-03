"""
Logistics models — shipments, shipment_items, customs_documents.

Owned by Agent 6. Shipments are created after a contract is signed;
they track freight from departure port to delivery.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class Shipment(Base):
    """Freight shipments. Links to a contract with carrier and port details."""

    __tablename__ = "shipments"

    shipment_id: Mapped[str] = mapped_column(Text, primary_key=True)
    contract_id: Mapped[str] = mapped_column(
        Text, ForeignKey("contracts.contract_id"), nullable=False
    )
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    carrier: Mapped[str | None] = mapped_column(Text)
    vessel_name: Mapped[str | None] = mapped_column(Text)
    bill_of_lading_number: Mapped[str | None] = mapped_column(Text)
    container_number: Mapped[str | None] = mapped_column(Text)
    departure_port: Mapped[str | None] = mapped_column(Text)
    arrival_port: Mapped[str | None] = mapped_column(Text)
    etd: Mapped[str | None] = mapped_column(Text)  # estimated time of departure
    eta: Mapped[str | None] = mapped_column(Text)  # estimated time of arrival
    atd: Mapped[str | None] = mapped_column(Text)  # actual time of departure
    ata: Mapped[str | None] = mapped_column(Text)  # actual time of arrival
    status: Mapped[str] = mapped_column(Text, default="draft")
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    contract: Mapped[Contract] = relationship()  # noqa: F821
    items: Mapped[list[ShipmentItem]] = relationship(
        back_populates="shipment", cascade="all, delete-orphan"
    )
    customs_documents: Mapped[list[CustomsDocument]] = relationship(
        back_populates="shipment", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'booked', 'loaded', 'departed', 'in_transit', "
            "'arrived', 'customs_hold', 'delivered', 'delayed', 'cancelled')",
            name="ck_shipments_status",
        ),
        Index("ix_shipments_contract", "contract_id"),
        Index("ix_shipments_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Shipment {self.shipment_id}: {self.carrier} {self.departure_port}→{self.arrival_port}>"


class ShipmentItem(Base):
    """Junction table — a shipment can include multiple lots."""

    __tablename__ = "shipment_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shipment_id: Mapped[str] = mapped_column(
        Text, ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False
    )
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    contract_line_item_id: Mapped[str | None] = mapped_column(Text)
    quantity_bags: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    shipment: Mapped[Shipment] = relationship(back_populates="items")

    __table_args__ = (
        Index("ix_shipment_items_shipment", "shipment_id"),
        Index("ix_shipment_items_lot", "lot_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<ShipmentItem shipment={self.shipment_id} lot={self.lot_id} qty={self.quantity_bags}>"
        )


class CustomsDocument(Base):
    """Customs paperwork per shipment."""

    __tablename__ = "customs_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shipment_id: Mapped[str] = mapped_column(
        Text, ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False
    )
    document_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text)
    submitted_ts: Mapped[str | None] = mapped_column(Text)
    cleared_ts: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="draft")
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    shipment: Mapped[Shipment] = relationship(back_populates="customs_documents")

    __table_args__ = (
        CheckConstraint(
            "document_type IN ('commercial_invoice', 'packing_list', 'certificate_of_origin', "
            "'bill_of_lading', 'insurance_cert', 'phytosanitary_cert', 'eudr_declaration', 'other')",
            name="ck_customs_docs_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'cleared', 'rejected', 'amended')",
            name="ck_customs_docs_status",
        ),
        Index("ix_customs_docs_shipment", "shipment_id"),
    )

    def __repr__(self) -> str:
        return f"<CustomsDocument {self.id}: {self.document_type} ({self.status})>"
