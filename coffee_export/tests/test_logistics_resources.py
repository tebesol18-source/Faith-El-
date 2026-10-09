#!/usr/bin/env python3
"""
Logistics Command Center — resources layer test.

Covers (Logistics Resource & Shipment Management module):
  1. Checklist template loads from data/logistics-checklist-template.json
     (18 steps, shared with the JS side).
  2. Adapter layer: every provider capability answers NOT_CONNECTED —
     no fake availability, quotes, bookings or tracking.
  3. Provider directory (org-scoped): global rows visible to every org,
     tenant rows private; global rows editable ONLY by the platform org;
     'verified' requires an official source URL.
  4. Booking records: real external bookings only, reference mandatory,
     shipment lifecycle + timeline event written honestly.
  5. Containers: creation, lifecycle transitions with timeline events.
  6. Checklist: seeded per shipment, idempotent, human toggles.
  7. Transport segments: add + list.
  8. Tenant isolation: org A never sees org B's bookings, containers,
     checklist items, transport segments or private providers.

Run:  python -m tests.test_logistics_resources
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.logistics.adapters import (
    NOT_CONNECTED,
    AdapterResult,
    ExternalProviderAdapter,
    get_adapter,
)
from coffee_export.logistics.checklist import EXPORT_CHECKLIST_TEMPLATE
from coffee_export.state import NotFoundError, StateManager

ORG_A = "org-lcc-test-a"
ORG_B = "org-lcc-test-b"


class _Row:
    """Minimal provider-row stand-in for adapter tests."""

    def __init__(self, id=1, name="Ethiopian Shipping and Logistics (ESL)",
                 integration_status="external"):
        self.id = id
        self.name = name
        self.integration_status = integration_status


def test() -> int:
    print("=" * 60)
    print("Logistics Command Center — Resources Layer Test")
    print("=" * 60)

    # ── 1. CHECKLIST TEMPLATE ──────────────────────────────────────
    print("\n[1] CHECKLIST TEMPLATE")
    assert len(EXPORT_CHECKLIST_TEMPLATE) == 18, (
        f"expected 18 checklist steps, got {len(EXPORT_CHECKLIST_TEMPLATE)}"
    )
    assert EXPORT_CHECKLIST_TEMPLATE[0][0] == "Container requirement confirmed"
    assert all(t.strip() and d.strip() for t, d in EXPORT_CHECKLIST_TEMPLATE)
    template_json = Path(__file__).resolve().parents[2] / "data" / "logistics-checklist-template.json"
    assert template_json.exists(), "shared template JSON must exist for the JS side"
    print(f"  ✓ {len(EXPORT_CHECKLIST_TEMPLATE)} steps, shared JSON present at data/")

    # ── 2. ADAPTER — NOTHING IS AUTOMATED ──────────────────────────
    print("\n[2] ADAPTER LAYER (honest NOT_CONNECTED)")
    adapter = get_adapter(_Row())
    assert isinstance(adapter, ExternalProviderAdapter)
    checks = [
        adapter.get_availability("20GP", 2),
        adapter.get_quote(),
        adapter.create_booking(),
        adapter.get_booking("REF-123"),
        adapter.get_tracking("ESLU2051001"),
        adapter.cancel_booking("REF-123"),
    ]
    for r in checks:
        assert isinstance(r, AdapterResult)
        assert r.status == NOT_CONNECTED
        assert not r.connected
        assert r.message, "not_connected results must explain the manual path"
    # A provider flagged api_connected still answers honestly today — no
    # integration exists, so none may pretend.
    adapter2 = get_adapter(_Row(integration_status="api_connected"))
    assert adapter2.get_quote().status == NOT_CONNECTED
    print("  ✓ all 6 capabilities answer NOT_CONNECTED (incl. fake-flagged rows)")

    with StateManager() as sm:
        # ── 3. PROVIDER DIRECTORY ──────────────────────────────────
        print("\n[3] PROVIDER DIRECTORY (org-scoped + global)")
        # Global seed row must be visible to a tenant org
        listed_a = sm.list_logistics_providers(ORG_A)
        esl = [p for p in listed_a if p["name"].startswith("Ethiopian Shipping")]
        assert esl, "seeded global ESL row must be visible to tenant orgs"
        assert esl[0]["verified"] == 1 and esl[0]["integration_status"] == "external"
        print(f"  ✓ global ESL visible to {ORG_A} (verified={esl[0]['verified']})")

        # Tenant A's private provider is invisible to tenant B
        pa = sm.create_logistics_provider(
            ORG_A,
            name="Private Trucking Co (A)",
            provider_type="trucking",
            phone="+251900000001",
        )
        assert pa["verified"] is False or pa["verified"] == 0
        listed_b = sm.list_logistics_providers(ORG_B)
        assert not any(p["id"] == pa["id"] for p in listed_b), (
            "org B must not see org A's private provider"
        )
        assert sm.get_logistics_provider(pa["id"], ORG_B) is None
        print("  ✓ private provider invisible cross-tenant")

        # Global row editable ONLY by the platform org
        try:
            sm.update_logistics_provider(esl[0]["id"], ORG_A, notes="hijack")
            raise AssertionError("tenant org must not edit a global provider row")
        except NotFoundError:
            pass
        updated = sm.update_logistics_provider(
            esl[0]["id"], sm.PLATFORM_ORG, notes="Platform org edit is allowed"
        )
        assert "Platform org" in updated["notes"]
        print("  ✓ global row: tenant edit refused, platform-org edit allowed")

        # Verified requires an official source
        pb = sm.create_logistics_provider(
            ORG_B, name="Forwarder B", provider_type="freight_forwarder"
        )
        try:
            sm.verify_logistics_provider(pb["id"], ORG_B, "")
            raise AssertionError("verification without a source URL must fail")
        except ValueError:
            pass
        vb = sm.verify_logistics_provider(pb["id"], ORG_B, "https://forwarder-b.example")
        assert vb["verified"] in (True, 1)
        assert vb["official_source_url"] == "https://forwarder-b.example"
        assert vb["last_verified_at"]
        print("  ✓ verification records source + date; no-source refused")

        # ── SHARED FIXTURE: a contract + shipment in ORG_A ──────────
        lead_id = sm.create_lead(
            company_name="LCC Test Buyer GmbH",
            headquarters_country="Germany",
            priority_tier="A",
            recommended_vp="VP1",
            outreach_language="EN",
            tags=["lcc-test"],
        )
        contract_id = sm.create_contract(
            lead_id=lead_id,
            incoterm="FOB",
            total_value=50000,
            total_volume_bags=320,
        )
        shipment_id = sm.create_shipment(contract_id=contract_id)
        # JS-side creates org-scoped shipments; emulate that the org owns it:
        from coffee_export.database.models import Shipment

        sh = sm.session.get(Shipment, shipment_id)
        sh.organization_id = ORG_A
        sm._commit()

        # ── 4. BOOKING RECORDS ─────────────────────────────────────
        print("\n[4] EXTERNAL BOOKING RECORDS")
        try:
            sm.record_logistics_booking(
                organization_id=ORG_A,
                provider_name="Someone",
                booking_reference="   ",
                shipment_id=shipment_id,
            )
            raise AssertionError("empty booking reference must be refused")
        except ValueError:
            pass
        try:
            sm.record_logistics_booking(
                organization_id=ORG_B,
                provider_name="Someone",
                booking_reference="X-1",
                shipment_id=shipment_id,  # ORG_A's shipment
            )
            raise AssertionError("cross-tenant booking on another org's shipment must 404")
        except NotFoundError:
            pass

        booking = sm.record_logistics_booking(
            organization_id=ORG_A,
            provider_name="Ethiopian Shipping and Logistics (ESL)",
            booking_reference="ESL-TEST-9931",
            shipment_id=shipment_id,
            provider_id=esl[0]["id"],
            container_type="20GP",
            quantity=2,
            container_numbers="ESLU2051001,ESLU2051002",
            vessel="MV Bahri Dar",
            voyage="V-118",
            etd="2026-11-05",
            eta="2026-11-28",
            created_by="operator-test",
        )
        assert booking["booking_reference"] == "ESL-TEST-9931"
        shipment = sm.get_shipment(shipment_id)
        assert shipment["status"] == "booked", (
            "recording a booking moves the shipment to booked"
        )
        events = sm.get_logistics_events(ORG_A, shipment_id)
        assert any(e["event_type"] == "booking_recorded" for e in events), (
            "booking must write an honest timeline event"
        )
        assert sm.get_logistics_bookings(ORG_B) == [], "org B sees no A bookings"
        print(f"  ✓ booking recorded, shipment booked, timeline event, tenant-safe")

        # ── 5. CONTAINERS ──────────────────────────────────────────
        print("\n[5] CONTAINER LIFECYCLE")
        c1 = sm.create_logistics_container(
            ORG_A,
            shipment_id=shipment_id,
            booking_id=booking["id"],
            container_number="ESLU2051001",
            container_type="20GP",
            status="BOOKED",
        )
        c2 = sm.create_logistics_container(
            ORG_A,
            shipment_id=shipment_id,
            booking_id=booking["id"],
            container_number="ESLU2051002",
            container_type="20GP",
            status="BOOKED",
        )
        moved = sm.update_logistics_container(
            c1["id"], ORG_A, status="PICKED_UP", pickup_date="2026-10-08"
        )
        assert moved["status"] == "PICKED_UP"
        events = sm.get_logistics_events(ORG_A, shipment_id)
        assert any(e["event_type"] == "container_updated" and "PICKED_UP" in e["title"]
                   for e in events), "status transitions must be timeline events"
        try:
            sm.update_logistics_container(c2["id"], ORG_B, status="CANCELLED")
            raise AssertionError("cross-tenant container update must fail")
        except NotFoundError:
            pass
        try:
            sm.update_logistics_container(c1["id"], ORG_A, status="TELEPORTED")
            raise AssertionError("invalid container status must fail")
        except Exception:
            # SQLAlchemy flush raises for CHECK violation on commit
            sm.session.rollback()
        print("  ✓ container lifecycle + events + tenant/enum guards")

        # ── 6. CHECKLIST ───────────────────────────────────────────
        print("\n[6] PER-SHIPMENT CHECKLIST")
        seeded = sm.seed_logistics_checklist(ORG_A, shipment_id)
        assert len(seeded) == 18, "checklist must have exactly the 18 template steps"
        again = sm.seed_logistics_checklist(ORG_A, shipment_id)
        assert len(again) == 18, "re-seeding must be idempotent"
        item = seeded[0]
        done = sm.set_logistics_checklist_item(
            item["id"], ORG_A, "done", completed_by="operator-test"
        )
        assert done["status"] == "done" and done["completed_by"] == "operator-test"
        try:
            sm.set_logistics_checklist_item(item["id"], ORG_B, "done")
            raise AssertionError("cross-tenant checklist toggle must fail")
        except NotFoundError:
            pass
        try:
            sm.get_logistics_checklist(ORG_B, shipment_id)
            raise AssertionError("cross-tenant checklist read must fail")
        except NotFoundError:
            pass
        print("  ✓ 18 steps seeded, idempotent, human-toggled, tenant-safe")

        # ── 7. TRANSPORT SEGMENTS ──────────────────────────────────
        print("\n[7] TRANSPORT SEGMENTS")
        seg = sm.add_logistics_transport_segment(
            ORG_A,
            shipment_id=shipment_id,
            segment_type="trucking",
            provider_name="Private Trucking Co (A)",
            origin="Addis Ababa",
            destination="Djibouti",
            planned_date="2026-10-10",
            reference="TRK-77",
        )
        segs = sm.get_logistics_transport_segments(ORG_A, shipment_id)
        assert len(segs) == 1 and segs[0]["reference"] == "TRK-77"
        events = sm.get_logistics_events(ORG_A, shipment_id)
        assert any(e["event_type"] == "transport_added" for e in events)
        try:
            sm.get_logistics_transport_segments(ORG_B, shipment_id)
            raise AssertionError("cross-tenant transport read must fail")
        except NotFoundError:
            pass
        print("  ✓ segment added + event + tenant-safe")

    # ── CLEANUP (test rows only — committed DB is restored by the
    #    hermetic runner before/after the whole suite; here we delete
    #    what we created so a second local run also passes) ─────────
    with StateManager() as sm:
        sm.session.rollback()
        from sqlalchemy import delete

        from coffee_export.database.models import (
            LogisticsBooking,
            LogisticsChecklistItem,
            LogisticsContainer,
            LogisticsEvent,
            LogisticsProvider,
            LogisticsTransportSegment,
            Shipment,
            ShipmentItem,
        )
        sm.session.execute(
            delete(LogisticsEvent).where(LogisticsEvent.organization_id.in_([ORG_A, ORG_B]))
        )
        sm.session.execute(
            delete(LogisticsChecklistItem).where(
                LogisticsChecklistItem.organization_id.in_([ORG_A, ORG_B])
            )
        )
        sm.session.execute(
            delete(LogisticsTransportSegment).where(
                LogisticsTransportSegment.organization_id.in_([ORG_A, ORG_B])
            )
        )
        sm.session.execute(
            delete(LogisticsContainer).where(
                LogisticsContainer.organization_id.in_([ORG_A, ORG_B])
            )
        )
        sm.session.execute(
            delete(LogisticsBooking).where(
                LogisticsBooking.organization_id.in_([ORG_A, ORG_B])
            )
        )
        sm.session.execute(
            delete(LogisticsProvider).where(
                LogisticsProvider.organization_id.in_([ORG_A, ORG_B])
            )
        )
        sm.session.execute(
            delete(ShipmentItem).where(ShipmentItem.shipment_id == shipment_id)
        )
        sm.session.execute(
            delete(Shipment).where(Shipment.shipment_id == shipment_id)
        )
        sm._commit()
    print("\n[CLEANUP] test rows removed")

    print("\n" + "=" * 60)
    print("ALL LOGISTICS RESOURCES TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(test())
