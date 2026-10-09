"""
Logistics resource models — providers, bookings, containers, events,
checklists, transport segments (Logistics Command Center).

DESIGN CONTRACT (docs/logistics-command-center.md)
--------------------------------------------------
The Logistics Command Center replaces the previous autonomous AI-booking
workflow with an honest operator-driven one:

  * `LogisticsProvider` is a DB-driven directory entry. It NEVER claims an
    integration — `integration_status` is "external" until a real adapter
    exists (see coffee_export.logistics.adapters). "Verified" means every
    public field was checked against an official source (`official_source_url`
    + `last_verified_at`), nothing more.
  * `LogisticsBooking` RECORDS a booking an operator made with an external
    provider. Faith-El does not place bookings; the row exists so the
    shipment lifecycle, documents and timeline stay truthful.
  * `LogisticsContainer` tracks the physical container lifecycle
    (requested → … → delivered/cancelled).
  * `LogisticsEvent` is the shipment timeline. Events are only ever written
    when something actually happened — never generated for display.
  * `LogisticsChecklistItem` is the per-shipment 18-step export checklist
    (persisted, per-org, human-toggled).
  * `LogisticsTransportSegment` records inland legs (trucking / rail /
    port handling) with real references.

Multi-tenancy: every row carries `organization_id`. Providers with a NULL
`organization_id` are GLOBAL directory entries (verified public reference
data, e.g. ESL) — readable by every org, editable only by the platform
org. All other entities are strictly org-scoped.
"""

from __future__ import annotations

from sqlalchemy import REAL, Boolean, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


# Provider types (UI dropdown — data lives in the DB, not the frontend)
PROVIDER_TYPES = (
    "national_carrier",
    "shipping_line",
    "freight_forwarder",
    "trucking",
    "railway",
    "port_terminal",
    "customs_clearing",
    "warehouse",
    "other",
)

# Container lifecycle — mirrors the real-world path of an export container
CONTAINER_STATUSES = (
    "REQUESTED",
    "AVAILABLE",
    "BOOKED",
    "ALLOCATED",
    "PICKED_UP",
    "AT_WAREHOUSE",
    "STUFFED",
    "SEALED",
    "IN_TRANSIT",
    "AT_PORT",
    "LOADED_ON_VESSEL",
    "DEPARTED",
    "ARRIVED",
    "DELIVERED",
    "CANCELLED",
)

# Integration states. "external" = no API integration exists today: the UI
# must fall back to real contact channels / official URLs. "api_connected"
# is reserved for the day a real LogisticsProviderAdapter exists.
PROVIDER_INTEGRATION_STATUSES = ("external", "api_connected")


class LogisticsProvider(Base):
    """A logistics service provider in the org's (or the global) directory."""

    __tablename__ = "logistics_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # NULL = global shared directory entry (public verified reference data).
    organization_id: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    provider_type: Mapped[str] = mapped_column(Text, nullable=False, default="other")

    country: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    service_area: Mapped[str | None] = mapped_column(Text)
    services: Mapped[str | None] = mapped_column(Text)  # human-readable service list

    # Contact channels — only ever values confirmed against official sources
    phone: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    website_url: Mapped[str | None] = mapped_column(Text)
    booking_url: Mapped[str | None] = mapped_column(Text)
    tracking_url: Mapped[str | None] = mapped_column(Text)
    empty_container_url: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    official_source_url: Mapped[str | None] = mapped_column(Text)

    # Data-driven capabilities — what this provider actually supports
    supports_contact: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    supports_external_booking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supports_tracking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supports_quotation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supports_empty_container: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supports_document_submission: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    integration_status: Mapped[str] = mapped_column(
        Text, nullable=False, default="external"
    )

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_verified_at: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "provider_type IN ("
            "'national_carrier', 'shipping_line', 'freight_forwarder', 'trucking', "
            "'railway', 'port_terminal', 'customs_clearing', 'warehouse', 'other')",
            name="ck_logistics_providers_type",
        ),
        CheckConstraint(
            "integration_status IN ('external', 'api_connected')",
            name="ck_logistics_providers_integration",
        ),
        Index("ix_logistics_providers_org", "organization_id"),
        Index("ix_logistics_providers_type", "provider_type"),
    )

    def __repr__(self) -> str:
        return f"<LogisticsProvider {self.id}: {self.name} ({self.provider_type})>"


class LogisticsBooking(Base):
    """A REAL external booking, recorded by an operator after the fact.

    Faith-El never places this booking — the operator does, on the
    provider's official channel. This row is the record of that fact.
    """

    __tablename__ = "logistics_bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    shipment_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("shipments.shipment_id", ondelete="CASCADE")
    )
    provider_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("logistics_providers.id", ondelete="SET NULL")
    )
    provider_name: Mapped[str] = mapped_column(Text, nullable=False)

    booking_reference: Mapped[str] = mapped_column(Text, nullable=False)
    booked_date: Mapped[str | None] = mapped_column(Text)
    container_type: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    pickup_location: Mapped[str | None] = mapped_column(Text)
    depot: Mapped[str | None] = mapped_column(Text)
    available_date: Mapped[str | None] = mapped_column(Text)  # when boxes can be picked up
    container_numbers: Mapped[str | None] = mapped_column(Text)  # comma-separated

    vessel: Mapped[str | None] = mapped_column(Text)
    voyage: Mapped[str | None] = mapped_column(Text)
    etd: Mapped[str | None] = mapped_column(Text)
    eta: Mapped[str | None] = mapped_column(Text)

    confirmation_document: Mapped[str | None] = mapped_column(Text)  # uploaded file path
    status: Mapped[str] = mapped_column(Text, nullable=False, default="recorded")
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    shipment = relationship("Shipment")
    provider = relationship("LogisticsProvider")

    __table_args__ = (
        CheckConstraint(
            "status IN ('recorded', 'confirmed', 'cancelled')",
            name="ck_logistics_bookings_status",
        ),
        Index("ix_logistics_bookings_org", "organization_id"),
        Index("ix_logistics_bookings_shipment", "shipment_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<LogisticsBooking {self.id}: {self.booking_reference} "
            f"via {self.provider_name}>"
        )


class LogisticsContainer(Base):
    """A physical container and its lifecycle dates."""

    __tablename__ = "logistics_containers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    shipment_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("shipments.shipment_id", ondelete="CASCADE")
    )
    booking_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("logistics_bookings.id", ondelete="SET NULL")
    )
    provider_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("logistics_providers.id", ondelete="SET NULL")
    )

    container_number: Mapped[str | None] = mapped_column(Text)
    container_type: Mapped[str] = mapped_column(Text, nullable=False, default="20GP")
    seal_number: Mapped[str | None] = mapped_column(Text)
    depot: Mapped[str | None] = mapped_column(Text)

    pickup_date: Mapped[str | None] = mapped_column(Text)        # empty box picked up
    loaded_date: Mapped[str | None] = mapped_column(Text)        # cargo loaded
    stuffed_date: Mapped[str | None] = mapped_column(Text)       # stuffing complete
    sealed_date: Mapped[str | None] = mapped_column(Text)        # seal applied
    gate_in_date: Mapped[str | None] = mapped_column(Text)       # container gate-in
    port_arrival_date: Mapped[str | None] = mapped_column(Text)  # arrived at port

    vessel: Mapped[str | None] = mapped_column(Text)
    voyage: Mapped[str | None] = mapped_column(Text)
    bill_of_lading: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(Text, nullable=False, default="REQUESTED")
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    shipment = relationship("Shipment")
    booking = relationship("LogisticsBooking")

    __table_args__ = (
        CheckConstraint(
            "status IN ("
            "'REQUESTED', 'AVAILABLE', 'BOOKED', 'ALLOCATED', 'PICKED_UP', "
            "'AT_WAREHOUSE', 'STUFFED', 'SEALED', 'IN_TRANSIT', 'AT_PORT', "
            "'LOADED_ON_VESSEL', 'DEPARTED', 'ARRIVED', 'DELIVERED', 'CANCELLED')",
            name="ck_logistics_containers_status",
        ),
        Index("ix_logistics_containers_org", "organization_id"),
        Index("ix_logistics_containers_shipment", "shipment_id"),
        Index("ix_logistics_containers_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<LogisticsContainer {self.container_number or self.id} "
            f"({self.container_type}, {self.status})>"
        )


class LogisticsEvent(Base):
    """A timeline event — written ONLY when something actually happened."""

    __tablename__ = "logistics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    shipment_id: Mapped[str] = mapped_column(
        Text, ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False
    )
    container_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("logistics_containers.id", ondelete="SET NULL")
    )

    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    event_ts: Mapped[str] = mapped_column(Text, nullable=False)  # when it happened
    source: Mapped[str] = mapped_column(Text, nullable=False, default="operator")
    created_by: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    shipment = relationship("Shipment")

    __table_args__ = (
        CheckConstraint(
            "event_type IN ("
            "'shipment_created', 'booking_recorded', 'booking_updated', "
            "'container_created', 'container_updated', 'status_change', "
            "'transport_added', 'transport_updated', 'document_attached', "
            "'checklist_updated', 'external_update', 'note', 'delay_recorded')",
            name="ck_logistics_events_type",
        ),
        Index("ix_logistics_events_shipment", "shipment_id"),
        Index("ix_logistics_events_org", "organization_id"),
    )

    def __repr__(self) -> str:
        return f"<LogisticsEvent {self.id}: [{self.event_type}] {self.title}>"


class LogisticsChecklistItem(Base):
    """One step of the per-shipment export checklist."""

    __tablename__ = "logistics_checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    shipment_id: Mapped[str] = mapped_column(
        Text, ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    completed_ts: Mapped[str | None] = mapped_column(Text)
    completed_by: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    shipment = relationship("Shipment")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'done', 'not_applicable')",
            name="ck_logistics_checklist_status",
        ),
        Index("ix_logistics_checklist_shipment", "shipment_id"),
        Index("ix_logistics_checklist_org", "organization_id"),
    )

    def __repr__(self) -> str:
        return f"<LogisticsChecklistItem {self.position}. {self.title} [{self.status}]>"


class LogisticsTransportSegment(Base):
    """An inland transport leg (trucking / rail / port handling)."""

    __tablename__ = "logistics_transport_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    shipment_id: Mapped[str] = mapped_column(
        Text, ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False
    )
    container_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("logistics_containers.id", ondelete="SET NULL")
    )
    segment_type: Mapped[str] = mapped_column(Text, nullable=False, default="trucking")
    provider_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("logistics_providers.id", ondelete="SET NULL")
    )
    provider_name: Mapped[str | None] = mapped_column(Text)

    origin: Mapped[str | None] = mapped_column(Text)
    destination: Mapped[str | None] = mapped_column(Text)
    planned_date: Mapped[str | None] = mapped_column(Text)
    actual_date: Mapped[str | None] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(Text)  # real booking/ref number

    cost: Mapped[float | None] = mapped_column(REAL)
    currency: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="planned")
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    shipment = relationship("Shipment")

    __table_args__ = (
        CheckConstraint(
            "segment_type IN ('trucking', 'rail', 'barge', 'port_handling', 'warehouse')",
            name="ck_logistics_transport_type",
        ),
        CheckConstraint(
            "status IN ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled')",
            name="ck_logistics_transport_status",
        ),
        Index("ix_logistics_transport_shipment", "shipment_id"),
        Index("ix_logistics_transport_org", "organization_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<LogisticsTransportSegment {self.id}: {self.segment_type} "
            f"{self.origin}→{self.destination} [{self.status}]>"
        )
