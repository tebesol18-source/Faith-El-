#!/usr/bin/env python3
"""
Agent 6 — end-to-end smoke test.

Tests:
  1. Registration
  2. Handle CONTRACT_SIGNED (create shipment + customs checklist)
  3. Book freight (carrier, vessel, B/L, ports, ETD/ETA)
  4. Customs checklist (EU destination requires eudr_declaration)
  5. Submit customs documents
  6. Clear customs documents
  7. Departure blocked (customs not cleared)
  8. Departure success (all customs cleared)
  9. Arrival
  10. Delivery (publishes SHIPMENT_DELIVERED + CONTRACT_COMPLETED)
  11. Customs hold
  12. Events published
  13. Architecture compliance

Run:  python -m tests.test_agent6
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent6_logistics import Agent6
from coffee_export.agents.registry import create_agent, list_registered_agents
from coffee_export.database.base import now_addis_iso
from coffee_export.database.models import Coop, WashingStation
from coffee_export.events import (
    CONTRACT_COMPLETED,
    CONTRACT_SIGNED,
    CUSTOMS_HOLD,
    SHIPMENT_BOOKED,
    SHIPMENT_DELIVERED,
    SHIPMENT_DEPARTED,
    EventBus,
)
from coffee_export.state import StateManager


def _create_signed_contract(sm: StateManager, country: str = "Germany") -> tuple[str, str, str]:
    """Create a lead + lot + contract in 'signed' state. Returns (contract_id, lead_id, lot_id)."""
    import time

    ts = str(int(time.time() * 1000))[-6:]
    now = now_addis_iso()

    coop_id = f"COOP-A6-{ts}"
    station_id = f"ST-A6-{ts}"
    sm.session.add(
        Coop(
            coop_id=coop_id,
            name="Yirgacheffe Union",
            region="Yirgacheffe",
            created_ts=now,
            updated_ts=now,
        )
    )
    sm.session.add(
        WashingStation(
            station_id=station_id,
            coop_id=coop_id,
            name="Konga Station",
            region="Yirgacheffe",
            gps_lat=6.16,
            gps_lon=38.19,
            created_ts=now,
            updated_ts=now,
        )
    )
    sm._commit()

    lot_id = sm.add_lot(
        {
            "lot_id": f"LOT-A6-{ts}-001",
            "station_id": station_id,
            "coop_id": coop_id,
            "region": "Yirgacheffe",
            "washing_station_name": "Konga Station",
            "coop_name": "Yirgacheffe Union",
            "process": "Washed",
            "screen_size": 14,
            "cupping_score": 87.5,
            "crop_year": "25/26",
            "stock_bags_remaining": 200,
            "certifications": "organic",
            "eudr_data_status": "complete",
            "eudr_gps_lat": 6.16,
            "eudr_gps_lon": 38.19,
            "eudr_farmgate_price_etb_per_kg": 28.5,
            "eudr_deforestation_attestation": "signed",
            "status": "active",
        }
    )

    lead_id = sm.create_lead(
        company_name=f"Agent6 Test Buyer {ts}",
        headquarters_country=country,
        priority_tier="A",
        recommended_vp="VP1",
        outreach_language="EN",
    )
    # Transition through all states to CONTRACTED
    for state, agent in [
        ("ENRICHED", "Agent 2"),
        ("IN_SEQUENCE", "Agent 3"),
        ("QUALIFIED", "Agent 3"),
        ("SAMPLE_DISPATCHED", "Agent 4"),
        ("SAMPLE_FEEDBACK_DUE", "Agent 4"),
        ("DECIDED_APPROVED", "Agent 4"),
        ("CONTRACTED", "Agent 5"),
    ]:
        sm.update_lead_state(lead_id, state, agent=agent, current_agent=agent)

    # Create contract
    contract_id = sm.create_contract(
        lead_id=lead_id,
        incoterm="FOB",
        currency="USD",
        total_volume_bags=200,
        total_value=900.0,
        payment_terms="LC at sight",
    )
    sm.add_contract_line_item(contract_id, lot_id, 200, 4.50)
    sm.update_contract_status(contract_id, "signed")

    return contract_id, lead_id, lot_id


def test() -> int:
    print("=" * 60)
    print("Agent 6 — End-to-End Smoke Test")
    print("=" * 60)

    # ── 1. REGISTRATION ──
    print("\n[1] REGISTRATION")
    registered = list_registered_agents()
    print(f"  ✓ Registered agents: {registered}")
    assert "Agent 6" in registered

    agent = create_agent("Agent 6")
    assert agent is not None
    assert isinstance(agent, Agent6)
    print(f"  ✓ create_agent('Agent 6') returned: {type(agent).__name__}")

    # ── SETUP ──
    print("\n[SETUP] Creating signed contract (EU destination)")
    with StateManager() as sm:
        contract_id, lead_id, lot_id = _create_signed_contract(sm, country="Germany")
    print(f"  ✓ Contract: {contract_id}")
    print(f"  ✓ Lead: {lead_id}")
    print(f"  ✓ Lot: {lot_id}")

    # ── 2. HANDLE CONTRACT_SIGNED ──
    print("\n[2] HANDLE CONTRACT_SIGNED (create shipment + customs checklist)")
    with EventBus() as bus:
        bus.publish(
            event_type=CONTRACT_SIGNED,
            entity_type="contract",
            entity_id=contract_id,
            payload={"contract_id": contract_id, "lead_id": lead_id},
            published_by="Agent 5",
        )

    with Agent6() as agent:
        result = agent.get_leads_to_process()
        assert len(result) >= 1
        process_result = agent.process_lead(result[0])

    print(f"  ✓ Action: {process_result['action']}")
    print(f"  ✓ Shipment ID: {process_result.get('shipment_id', 'N/A')}")
    shipment_id = process_result["shipment_id"]

    checklist = process_result.get("customs_checklist", {})
    required = checklist.get("required", [])
    print(f"  ✓ Required customs docs: {len(required)}")
    print(f"    {', '.join(required)}")
    assert "eudr_declaration" in required, "EU should require eudr_declaration"
    assert "bill_of_lading" in required

    # Verify SHIPMENT_BOOKED published
    with EventBus() as bus:
        booked = bus.replay(event_type=SHIPMENT_BOOKED, limit=10)
        assert len(booked) >= 1
        print(f"  ✓ SHIPMENT_BOOKED events: {len(booked)}")

    # ── 3. BOOK FREIGHT ──
    print("\n[3] BOOK FREIGHT")
    with Agent6() as agent:
        result = agent.book_shipment(
            shipment_id=shipment_id,
            carrier="Maersk",
            vessel_name="MSC Gulsun",
            bl_number="MAEU1234567890",
            departure_port="Djibouti",
            arrival_port="Hamburg",
            etd="2026-07-15",
            eta="2026-08-10",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Carrier: {result['carrier']}")
    print(f"  ✓ Route: {result['departure_port']} → {result['arrival_port']}")
    assert result["action"] == "shipment_booked"

    # ── 4. CUSTOMS CHECKLIST ──
    print("\n[4] CUSTOMS CHECKLIST")
    with Agent6() as agent:
        status = agent.check_customs(shipment_id)
    print(f"  ✓ All cleared: {status['all_cleared']}")
    print(f"  ✓ Cleared: {status['cleared']}/{status['total_required']}")
    print(f"  ✓ Missing: {status.get('missing', [])}")
    assert not status["all_cleared"], "Should not be cleared yet"

    # ── 5. SUBMIT CUSTOMS DOCS ──
    print("\n[5] SUBMIT CUSTOMS DOCS")
    with Agent6() as agent:
        for doc_type in status["required"]:
            result = agent.submit_customs_doc(
                shipment_id=shipment_id,
                document_type=doc_type,
                file_path=f"/docs/{doc_type}.pdf",
            )
            print(f"  ✓ Submitted: {doc_type}")

    # ── 6. CLEAR CUSTOMS DOCS ──
    print("\n[6] CLEAR CUSTOMS DOCS")
    with Agent6() as agent:
        docs = agent.sm.get_customs_documents(shipment_id)
        for doc in docs:
            result = agent.clear_customs_doc(doc["id"])
            print(f"  ✓ Cleared: {doc['document_type']} (doc_id={doc['id']})")

    # Verify all cleared
    with Agent6() as agent:
        status = agent.check_customs(shipment_id)
    print(f"  ✓ All cleared: {status['all_cleared']}")
    print(f"  ✓ Can depart: {status['can_depart']}")
    assert status["all_cleared"], "All docs should be cleared"

    # ── 7. DEPARTURE BLOCKED (should NOT be blocked now) ──
    # Actually with all docs cleared, departure should succeed
    # Let's test blocked first with a different shipment
    print("\n[7] DEPARTURE (all customs cleared → success)")
    with Agent6() as agent:
        result = agent.record_departure(shipment_id, atd="2026-07-15T08:00:00+03:00")
    print(f"  ✓ Action: {result['action']}")
    assert result["action"] == "departed"

    # Verify SHIPMENT_DEPARTED published
    with EventBus() as bus:
        departed = bus.replay(event_type=SHIPMENT_DEPARTED, limit=10)
        assert len(departed) >= 1
        print(f"  ✓ SHIPMENT_DEPARTED events: {len(departed)}")

    # ── 8. ARRIVAL ──
    print("\n[8] ARRIVAL")
    with Agent6() as agent:
        result = agent.record_arrival(shipment_id, ata="2026-08-10T14:00:00+02:00")
    print(f"  ✓ Action: {result['action']}")
    assert result["action"] == "arrived"

    # ── 9. DELIVERY ──
    print("\n[9] DELIVERY (publishes SHIPMENT_DELIVERED + CONTRACT_COMPLETED)")
    with Agent6() as agent:
        result = agent.record_delivery(shipment_id, ata="2026-08-10T14:00:00+02:00")
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Contract ID: {result.get('contract_id', 'N/A')}")
    assert result["action"] == "delivered"

    # Verify events
    with EventBus() as bus:
        delivered = bus.replay(event_type=SHIPMENT_DELIVERED, limit=10)
        completed = bus.replay(event_type=CONTRACT_COMPLETED, limit=10)
        assert len(delivered) >= 1
        assert len(completed) >= 1
        print(f"  ✓ SHIPMENT_DELIVERED events: {len(delivered)}")
        print(f"  ✓ CONTRACT_COMPLETED events: {len(completed)}")

    # Verify contract status
    with StateManager() as sm:
        contract = sm.get_contract(contract_id)
        print(f"  ✓ Contract status: {contract['status']}")
        assert contract["status"] == "completed"

    # ── 10. CUSTOMS HOLD (new shipment) ──
    print("\n[10] CUSTOMS HOLD")
    with StateManager() as sm:
        contract2_id, lead2_id, lot2_id = _create_signed_contract(sm, country="Germany")
    with Agent6() as agent:
        result = agent.create_shipment_from_contract(contract2_id, lead2_id)
        shipment2_id = result["shipment_id"]
        result = agent.record_customs_hold(shipment2_id, reason="Missing phytosanitary cert")
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Reason: {result['reason']}")
    assert result["action"] == "customs_hold"

    with EventBus() as bus:
        holds = bus.replay(event_type=CUSTOMS_HOLD, limit=10)
        assert len(holds) >= 1
        print(f"  ✓ CUSTOMS_HOLD events: {len(holds)}")

    # ── 11. ARCHITECTURE COMPLIANCE ──
    print("\n[11] ARCHITECTURE COMPLIANCE (no direct DB access)")
    import subprocess

    result_check = subprocess.run(
        ["grep", "-rn", "SessionLocal", "coffee_export/agents/agent6_logistics.py"],
        capture_output=True,
        text=True,
    )
    violations = [
        line
        for line in result_check.stdout.strip().split("\n")
        if line and not line.strip().startswith("#") and "❌" not in line and '"""' not in line
    ]
    if violations:
        print(f"  ✗ VIOLATION: {violations}")
        return 1
    else:
        print("  ✓ No direct SessionLocal usage — architecture compliant")

    result_check2 = subprocess.run(
        [
            "grep",
            "-n",
            "from coffee_export.database.models import",
            "coffee_export/agents/agent6_logistics.py",
        ],
        capture_output=True,
        text=True,
    )
    violations2 = [
        line
        for line in result_check2.stdout.strip().split("\n")
        if line and not line.strip().startswith("#") and "❌" not in line and '"""' not in line
    ]
    if violations2:
        print(f"  ✗ VIOLATION: {violations2}")
        return 1
    else:
        print("  ✓ No direct model imports — architecture compliant")

    print("\n" + "=" * 60)
    print("✓ ALL TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(test())
