"""Logistics Command Center — providers, bookings, containers, events, checklist, transport

Revision ID: b9d0e1f2a4b5
Revises: a7b8c9d0e1f2
Create Date: 2026-10-09

Six new tables for the Logistics Resource & Shipment Management module
(docs/logistics-command-center.md):

  1. logistics_providers        — DB-driven provider directory. Global rows
                                  (organization_id NULL) are verified public
                                  reference data shared across tenants.
  2. logistics_bookings         — records of REAL external bookings made by
                                  operators (Faith-El never books itself).
  3. logistics_containers       — physical container lifecycle with dates.
  4. logistics_events           — shipment timeline (only real events).
  5. logistics_checklist_items  — per-shipment 18-step export checklist.
  6. logistics_transport_segments — inland legs (trucking / rail / port).

This migration ALSO seeds the verified ESL (Ethiopian Shipping and
Logistics) global directory row. Unlike buyer_masks (which needs a secret
and must never touch data), this seed is verified PUBLIC reference data:

  * every URL/contact value below was checked against ESL's official site
    (esl.et / eslse.et — "Overview of ESL" + contact pages) on 2026-10-08;
  * official_source_url + last_verified_at record WHERE and WHEN;
  * verified=1 ONLY because of that check — it is a data-provenance mark,
    not an integration claim. integration_status stays "external": Faith-El
    has NO ESL API, and every ESL action in the UI opens official channels
    (site / email / phone) or records what the operator did externally.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b9d0e1f2a4b5"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ESL official data — verified against esl.et / eslse.et on 2026-10-08.
# Values are quoted verbatim from the official pages; see migration docstring
# for the verification contract. NO invented fields.
ESL_SEED = {
    "name": "Ethiopian Shipping and Logistics (ESL)",
    "provider_type": "national_carrier",
    "country": "Ethiopia",
    "city": "Addis Ababa",
    "service_area": "Ethiopia — global trade (sea, dry port, multimodal)",
    "services": (
        "Sea freight, dry bulk & multimodal transport, freight forwarding, "
        "empty container supply, container deposit & release, demurrage"
    ),
    "phone": "+251115518280",
    "email": "esl@eslse-et.com",
    "website_url": "https://esl.et/",
    "booking_url": "https://esl.et/",
    "tracking_url": "https://esl.et/",
    "empty_container_url": "https://www.eslse.et/",
    "address": (
        "Ras Mekonen Street, Leghar behind Ethiopian Insurance Corporation "
        "H.Q., Addis Ababa, Ethiopia (P.O.BOX 11551)"
    ),
    "official_source_url": "https://www.eslse.et/",
    "supports_contact": True,
    "supports_external_booking": True,
    "supports_tracking": True,
    "supports_quotation": True,
    "supports_empty_container": True,
    "supports_document_submission": False,
    "integration_status": "external",
    "verified": True,
    "last_verified_at": "2026-10-08",
    "notes": (
        "National carrier (merger of four enterprises). Booking, tracking "
        "and empty-container requests are handled through ESL's official "
        "channels — Faith-El has no ESL integration and does not book or "
        "track on its own. Hours: Monday-Friday 8:00AM-5:30PM."
    ),
}


def upgrade() -> None:
    op.create_table(
        "logistics_providers",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.TEXT, nullable=True),
        sa.Column("name", sa.TEXT, nullable=False),
        sa.Column("provider_type", sa.TEXT, nullable=False, server_default="other"),
        sa.Column("country", sa.TEXT),
        sa.Column("city", sa.TEXT),
        sa.Column("service_area", sa.TEXT),
        sa.Column("services", sa.TEXT),
        sa.Column("phone", sa.TEXT),
        sa.Column("email", sa.TEXT),
        sa.Column("website_url", sa.TEXT),
        sa.Column("booking_url", sa.TEXT),
        sa.Column("tracking_url", sa.TEXT),
        sa.Column("empty_container_url", sa.TEXT),
        sa.Column("address", sa.TEXT),
        sa.Column("official_source_url", sa.TEXT),
        sa.Column("supports_contact", sa.BOOLEAN, nullable=False, server_default=sa.text("1")),
        sa.Column("supports_external_booking", sa.BOOLEAN, nullable=False, server_default=sa.text("0")),
        sa.Column("supports_tracking", sa.BOOLEAN, nullable=False, server_default=sa.text("0")),
        sa.Column("supports_quotation", sa.BOOLEAN, nullable=False, server_default=sa.text("0")),
        sa.Column("supports_empty_container", sa.BOOLEAN, nullable=False, server_default=sa.text("0")),
        sa.Column("supports_document_submission", sa.BOOLEAN, nullable=False, server_default=sa.text("0")),
        sa.Column("integration_status", sa.TEXT, nullable=False, server_default="external"),
        sa.Column("active", sa.BOOLEAN, nullable=False, server_default=sa.text("1")),
        sa.Column("verified", sa.BOOLEAN, nullable=False, server_default=sa.text("0")),
        sa.Column("last_verified_at", sa.TEXT),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT),
        sa.CheckConstraint(
            "provider_type IN ('national_carrier', 'shipping_line', "
            "'freight_forwarder', 'trucking', 'railway', 'port_terminal', "
            "'customs_clearing', 'warehouse', 'other')",
            name="ck_logistics_providers_type",
        ),
        sa.CheckConstraint(
            "integration_status IN ('external', 'api_connected')",
            name="ck_logistics_providers_integration",
        ),
    )
    op.create_index("ix_logistics_providers_org", "logistics_providers", ["organization_id"])
    op.create_index("ix_logistics_providers_type", "logistics_providers", ["provider_type"])

    op.create_table(
        "logistics_bookings",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.TEXT, nullable=False, server_default="org-system"),
        sa.Column("shipment_id", sa.TEXT, sa.ForeignKey("shipments.shipment_id", ondelete="CASCADE")),
        sa.Column("provider_id", sa.INTEGER, sa.ForeignKey("logistics_providers.id", ondelete="SET NULL")),
        sa.Column("provider_name", sa.TEXT, nullable=False),
        sa.Column("booking_reference", sa.TEXT, nullable=False),
        sa.Column("booked_date", sa.TEXT),
        sa.Column("container_type", sa.TEXT),
        sa.Column("quantity", sa.INTEGER, nullable=False, server_default="1"),
        sa.Column("pickup_location", sa.TEXT),
        sa.Column("depot", sa.TEXT),
        sa.Column("available_date", sa.TEXT),
        sa.Column("container_numbers", sa.TEXT),
        sa.Column("vessel", sa.TEXT),
        sa.Column("voyage", sa.TEXT),
        sa.Column("etd", sa.TEXT),
        sa.Column("eta", sa.TEXT),
        sa.Column("confirmation_document", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False, server_default="recorded"),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_by", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT),
        sa.CheckConstraint(
            "status IN ('recorded', 'confirmed', 'cancelled')",
            name="ck_logistics_bookings_status",
        ),
    )
    op.create_index("ix_logistics_bookings_org", "logistics_bookings", ["organization_id"])
    op.create_index("ix_logistics_bookings_shipment", "logistics_bookings", ["shipment_id"])

    op.create_table(
        "logistics_containers",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.TEXT, nullable=False, server_default="org-system"),
        sa.Column("shipment_id", sa.TEXT, sa.ForeignKey("shipments.shipment_id", ondelete="CASCADE")),
        sa.Column("booking_id", sa.INTEGER, sa.ForeignKey("logistics_bookings.id", ondelete="SET NULL")),
        sa.Column("provider_id", sa.INTEGER, sa.ForeignKey("logistics_providers.id", ondelete="SET NULL")),
        sa.Column("container_number", sa.TEXT),
        sa.Column("container_type", sa.TEXT, nullable=False, server_default="20GP"),
        sa.Column("seal_number", sa.TEXT),
        sa.Column("depot", sa.TEXT),
        sa.Column("pickup_date", sa.TEXT),
        sa.Column("loaded_date", sa.TEXT),
        sa.Column("stuffed_date", sa.TEXT),
        sa.Column("sealed_date", sa.TEXT),
        sa.Column("gate_in_date", sa.TEXT),
        sa.Column("port_arrival_date", sa.TEXT),
        sa.Column("vessel", sa.TEXT),
        sa.Column("voyage", sa.TEXT),
        sa.Column("bill_of_lading", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False, server_default="REQUESTED"),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT),
        sa.CheckConstraint(
            "status IN ('REQUESTED', 'AVAILABLE', 'BOOKED', 'ALLOCATED', "
            "'PICKED_UP', 'AT_WAREHOUSE', 'STUFFED', 'SEALED', 'IN_TRANSIT', "
            "'AT_PORT', 'LOADED_ON_VESSEL', 'DEPARTED', 'ARRIVED', "
            "'DELIVERED', 'CANCELLED')",
            name="ck_logistics_containers_status",
        ),
    )
    op.create_index("ix_logistics_containers_org", "logistics_containers", ["organization_id"])
    op.create_index("ix_logistics_containers_shipment", "logistics_containers", ["shipment_id"])
    op.create_index("ix_logistics_containers_status", "logistics_containers", ["status"])

    op.create_table(
        "logistics_events",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.TEXT, nullable=False, server_default="org-system"),
        sa.Column("shipment_id", sa.TEXT, sa.ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False),
        sa.Column("container_id", sa.INTEGER, sa.ForeignKey("logistics_containers.id", ondelete="SET NULL")),
        sa.Column("event_type", sa.TEXT, nullable=False),
        sa.Column("title", sa.TEXT, nullable=False),
        sa.Column("detail", sa.TEXT),
        sa.Column("event_ts", sa.TEXT, nullable=False),
        sa.Column("source", sa.TEXT, nullable=False, server_default="operator"),
        sa.Column("created_by", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT),
        sa.CheckConstraint(
            "event_type IN ('shipment_created', 'booking_recorded', "
            "'booking_updated', 'container_created', 'container_updated', "
            "'status_change', 'transport_added', 'transport_updated', "
            "'document_attached', 'checklist_updated', 'external_update', "
            "'note', 'delay_recorded')",
            name="ck_logistics_events_type",
        ),
    )
    op.create_index("ix_logistics_events_shipment", "logistics_events", ["shipment_id"])
    op.create_index("ix_logistics_events_org", "logistics_events", ["organization_id"])

    op.create_table(
        "logistics_checklist_items",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.TEXT, nullable=False, server_default="org-system"),
        sa.Column("shipment_id", sa.TEXT, sa.ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("title", sa.TEXT, nullable=False),
        sa.Column("detail", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False, server_default="pending"),
        sa.Column("completed_ts", sa.TEXT),
        sa.Column("completed_by", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT),
        sa.CheckConstraint(
            "status IN ('pending', 'done', 'not_applicable')",
            name="ck_logistics_checklist_status",
        ),
    )
    op.create_index("ix_logistics_checklist_shipment", "logistics_checklist_items", ["shipment_id"])
    op.create_index("ix_logistics_checklist_org", "logistics_checklist_items", ["organization_id"])

    op.create_table(
        "logistics_transport_segments",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.TEXT, nullable=False, server_default="org-system"),
        sa.Column("shipment_id", sa.TEXT, sa.ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=False),
        sa.Column("container_id", sa.INTEGER, sa.ForeignKey("logistics_containers.id", ondelete="SET NULL")),
        sa.Column("segment_type", sa.TEXT, nullable=False, server_default="trucking"),
        sa.Column("provider_id", sa.INTEGER, sa.ForeignKey("logistics_providers.id", ondelete="SET NULL")),
        sa.Column("provider_name", sa.TEXT),
        sa.Column("origin", sa.TEXT),
        sa.Column("destination", sa.TEXT),
        sa.Column("planned_date", sa.TEXT),
        sa.Column("actual_date", sa.TEXT),
        sa.Column("reference", sa.TEXT),
        sa.Column("cost", sa.REAL),
        sa.Column("currency", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False, server_default="planned"),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_by", sa.TEXT),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT),
        sa.CheckConstraint(
            "segment_type IN ('trucking', 'rail', 'barge', 'port_handling', 'warehouse')",
            name="ck_logistics_transport_type",
        ),
        sa.CheckConstraint(
            "status IN ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled')",
            name="ck_logistics_transport_status",
        ),
    )
    op.create_index("ix_logistics_transport_shipment", "logistics_transport_segments", ["shipment_id"])
    op.create_index("ix_logistics_transport_org", "logistics_transport_segments", ["organization_id"])

    # ── Seed: verified ESL global directory row ──────────────────────────
    # organization_id NULL = global (shared, read-only for tenant orgs).
    now = "2026-10-09T00:00:00+03:00"
    op.execute(
        sa.text(
            """
            INSERT INTO logistics_providers (
                organization_id, name, provider_type, country, city,
                service_area, services, phone, email, website_url,
                booking_url, tracking_url, empty_container_url, address,
                official_source_url, supports_contact,
                supports_external_booking, supports_tracking,
                supports_quotation, supports_empty_container,
                supports_document_submission, integration_status, active,
                verified, last_verified_at, notes, created_ts, updated_ts
            ) VALUES (
                NULL, :name, :provider_type, :country, :city,
                :service_area, :services, :phone, :email, :website_url,
                :booking_url, :tracking_url, :empty_container_url, :address,
                :official_source_url, :supports_contact,
                :supports_external_booking, :supports_tracking,
                :supports_quotation, :supports_empty_container,
                :supports_document_submission, :integration_status, 1,
                :verified, :last_verified_at, :notes, :created_ts, :updated_ts
            )
            """
        ).bindparams(**{**ESL_SEED, "created_ts": now, "updated_ts": now})
    )


def downgrade() -> None:
    op.drop_table("logistics_transport_segments")
    op.drop_table("logistics_checklist_items")
    op.drop_table("logistics_events")
    op.drop_table("logistics_containers")
    op.drop_table("logistics_bookings")
    op.drop_table("logistics_providers")
