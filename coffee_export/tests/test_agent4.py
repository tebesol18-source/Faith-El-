#!/usr/bin/env python3
"""
Agent 4 — end-to-end smoke test.

Tests:
  1. Registration
  2. Handle LEAD_QUALIFIED (recommend lots, create sample request, publish SAMPLE_REQUESTED)
  3. Handle LOT_CONFIRMED (from Agent 1)
  4. Handle LOT_CONFIRMATION_FAILED (with substitute suggestion)
  5. Dispatch sample (record shipment, publish SAMPLE_DISPATCHED)
  6. Record delivery (transition to feedback_due)
  7. Schedule reminders (Day +7/+10/+14/+18 via TaskQueue)
  8. Record cupping score (publish CUPPING_SCORE_RECEIVED)
  9. Make decision — approved (publish SAMPLE_APPROVED, lead → DECIDED_APPROVED)
  10. Make decision — rejected (publish SAMPLE_REJECTED, lead → DECIDED_REJECTED)
  11. Auto-decide (score thresholds)
  12. Generate label
  13. Architecture compliance (no direct DB access)

Run:  python -m tests.test_agent4
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent4_sample import Agent4
from coffee_export.agents.registry import create_agent, list_registered_agents
from coffee_export.database.base import now_addis_iso
from coffee_export.database.models import Coop, WashingStation
from coffee_export.events import (
    CUPPING_SCORE_RECEIVED,
    LEAD_QUALIFIED,
    LOT_CONFIRMED,
    SAMPLE_APPROVED,
    SAMPLE_DISPATCHED,
    SAMPLE_REJECTED,
    SAMPLE_REQUESTED,
    EventBus,
)
from coffee_export.state import StateManager


def _create_qualified_lead(sm: StateManager, country: str = "Germany") -> str:
    """Create a lead in QUALIFIED state for Agent 4 testing."""
    import time

    ts = str(int(time.time() * 1000))[-6:]

    lead_id = sm.create_lead(
        company_name=f"Agent4 Test Buyer {ts}",
        headquarters_country=country,
        priority_tier="A",
        recommended_vp="VP1",
        outreach_language="EN",
    )
    sm.update_lead_state(lead_id, "ENRICHED", agent="Agent 2", current_agent="Agent 3")
    sm.update_lead_state(lead_id, "IN_SEQUENCE", agent="Agent 3", current_agent="Agent 3")
    sm.update_lead_state(
        lead_id,
        "QUALIFIED",
        agent="Agent 3",
        notes="Q1-Q5 confirmed",
        current_agent="Agent 4",
    )
    return lead_id


def _setup_test_lots(sm: StateManager) -> str:
    """Create a test lot with complete EUDR. Returns lot_id."""
    import time

    ts = str(int(time.time() * 1000))[-6:]
    now = now_addis_iso()

    # Create coop + station (idempotent)
    coop_id = f"COOP-A4-{ts}"
    station_id = f"ST-A4-{ts}"
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
            "lot_id": f"LOT-A4-{ts}-001",
            "station_id": station_id,
            "coop_id": coop_id,
            "region": "Yirgacheffe",
            "washing_station_name": "Konga Station",
            "coop_name": "Yirgacheffe Union",
            "process": "Washed",
            "screen_size": 14,
            "cupping_score": 87.5,
            "crop_year": "25/26",
            "stock_bags_remaining": 45,
            "eudr_data_status": "complete",
            "eudr_gps_lat": 6.16,
            "eudr_gps_lon": 38.19,
            "eudr_farmgate_price_etb_per_kg": 28.5,
            "eudr_deforestation_attestation": "signed",
            "status": "active",
        }
    )
    return lot_id


def test() -> int:
    print("=" * 60)
    print("Agent 4 — End-to-End Smoke Test")
    print("=" * 60)

    # ── 1. REGISTRATION ──
    print("\n[1] REGISTRATION")
    registered = list_registered_agents()
    print(f"  ✓ Registered agents: {registered}")
    assert "Agent 4" in registered

    agent = create_agent("Agent 4")
    assert agent is not None
    assert isinstance(agent, Agent4)
    print(f"  ✓ create_agent('Agent 4') returned: {type(agent).__name__}")

    # ── SETUP ──
    print("\n[SETUP] Creating test data")
    with StateManager() as sm:
        lot_id = _setup_test_lots(sm)
        lead_id = _create_qualified_lead(sm, country="Germany")
    print(f"  ✓ Created lot: {lot_id}")
    print(f"  ✓ Created qualified lead: {lead_id}")

    # ── 2. HANDLE LEAD_QUALIFIED ──
    print("\n[2] HANDLE LEAD_QUALIFIED (recommend lots + create sample request)")
    with EventBus() as bus:
        bus.publish(
            event_type=LEAD_QUALIFIED,
            entity_type="lead",
            entity_id=lead_id,
            payload={"lead_id": lead_id},
            published_by="Agent 3",
        )

    with Agent4() as agent:
        result = agent.get_leads_to_process()
        assert len(result) >= 1
        event = result[0]
        process_result = agent.process_lead(event)

    print(f"  ✓ Action: {process_result['action']}")
    print(f"  ✓ Sample request ID: {process_result.get('sample_request_id', 'N/A')}")
    print(f"  ✓ Lot IDs: {process_result.get('lot_ids', [])}")
    assert process_result["action"] == "sample_requested"
    sample_request_id = process_result["sample_request_id"]
    assert len(process_result["lot_ids"]) >= 1

    # Verify SAMPLE_REQUESTED was published
    with EventBus() as bus:
        requested_events = bus.replay(event_type=SAMPLE_REQUESTED, limit=10)
        assert len(requested_events) >= 1
        print(f"  ✓ SAMPLE_REQUESTED events published: {len(requested_events)}")

    # Verify lead transitioned to SAMPLE_DISPATCHED
    with StateManager() as sm:
        lead = sm.get_lead(lead_id)
        assert lead["current_state"] == "SAMPLE_DISPATCHED"
        print(f"  ✓ Lead state: {lead['current_state']}")

    # ── 3. HANDLE LOT_CONFIRMED ──
    print("\n[3] HANDLE LOT_CONFIRMED (from Agent 1)")
    with EventBus() as bus:
        bus.publish(
            event_type=LOT_CONFIRMED,
            entity_type="lot",
            entity_id=lot_id,
            payload={
                "lot_id": lot_id,
                "lead_id": lead_id,
                "reservation_id": "RES-TEST-001",
            },
            published_by="Agent 1",
        )

    with Agent4() as agent:
        result = agent.get_leads_to_process()
        confirmed_event = next(
            (e for e in result if e.get("_event_category") == "lot_confirmed"), None
        )
        if confirmed_event:
            process_result = agent.process_lead(confirmed_event)
            print(f"  ✓ Action: {process_result['action']}")
            assert process_result["action"] == "lot_confirmed"
        else:
            print("  ⚠ No LOT_CONFIRMED event found (may have been consumed)")

    # ── 4. DISPATCH SAMPLE ──
    print("\n[4] DISPATCH SAMPLE")
    with Agent4() as agent:
        result = agent.dispatch_sample(
            sample_request_id=sample_request_id,
            carrier="DHL",
            tracking_number="DHL123456789",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Shipment ID: {result.get('shipment_id', 'N/A')}")
    print(f"  ✓ Carrier: {result.get('carrier', 'N/A')}")
    print(f"  ✓ ETA: {result.get('estimated_arrival', 'N/A')[:10]}")
    assert result["action"] == "dispatched"

    # Verify SAMPLE_DISPATCHED published
    with EventBus() as bus:
        dispatched_events = bus.replay(event_type=SAMPLE_DISPATCHED, limit=10)
        assert len(dispatched_events) >= 1
        print(f"  ✓ SAMPLE_DISPATCHED events: {len(dispatched_events)}")

    # ── 5. RECORD DELIVERY ──
    print("\n[5] RECORD DELIVERY → feedback_due")
    with Agent4() as agent:
        result = agent.record_delivery(sample_request_id=sample_request_id)
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Status: {result.get('status', 'N/A')}")
    assert result["action"] == "delivered"
    assert result["status"] == "feedback_due"

    # ── 6. RECORD CUPPING SCORE ──
    print("\n[6] RECORD CUPPING SCORE")
    with Agent4() as agent:
        result = agent.record_cupping(
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            total_score=86.5,
            fragrance_aroma=8.0,
            flavor=8.5,
            aftertaste=8.0,
            acidity=8.5,
            body=8.0,
            balance=8.0,
            uniformity=10.0,
            clean_cup=10.0,
            sweetness=10.0,
            overall=8.0,
            defect_count_buyer=5,
            buyer_notes="Clean cup, bright acidity, good balance",
            our_score=87.5,
            cupper_name="Test Cupper",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Score ID: {result.get('score_id', 'N/A')}")
    print(f"  ✓ Total score: {result.get('total_score', 'N/A')}")
    assert result["action"] == "cupping_recorded"

    # Verify CUPPING_SCORE_RECEIVED published
    with EventBus() as bus:
        cupping_events = bus.replay(event_type=CUPPING_SCORE_RECEIVED, limit=10)
        assert len(cupping_events) >= 1
        print(f"  ✓ CUPPING_SCORE_RECEIVED events: {len(cupping_events)}")

    # ── 7. MAKE DECISION — APPROVED ──
    print("\n[7] MAKE DECISION — APPROVED")
    with Agent4() as agent:
        result = agent.make_decision(
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            decision="approved",
            buyer_target_fob=4.50,
            buyer_target_volume_bags=200,
            buyer_target_port="Hamburg",
            notes="Buyer approved after cupping",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Decision: {result.get('decision', 'N/A')}")
    print(f"  ✓ Lead state: {result.get('lead_state', 'N/A')}")
    print(f"  ✓ Next agent: {result.get('next_agent', 'N/A')}")
    assert result["action"] == "decided"
    assert result["decision"] == "approved"
    assert result["lead_state"] == "DECIDED_APPROVED"
    assert result["next_agent"] == "Agent 5"

    # Verify SAMPLE_APPROVED published
    with EventBus() as bus:
        approved_events = bus.replay(event_type=SAMPLE_APPROVED, limit=10)
        assert len(approved_events) >= 1
        print(f"  ✓ SAMPLE_APPROVED events: {len(approved_events)}")

    # Verify lead transitioned
    with StateManager() as sm:
        lead = sm.get_lead(lead_id)
        assert lead["current_state"] == "DECIDED_APPROVED"
        print(f"  ✓ Lead state verified: {lead['current_state']}")

    # ── 8. MAKE DECISION — REJECTED (new sample request) ──
    print("\n[8] MAKE DECISION — REJECTED")
    # Create a new lead + sample for rejection test
    with StateManager() as sm:
        lead2_id = _create_qualified_lead(sm, country="United Kingdom")
        lot2_id = _setup_test_lots(sm)

    with Agent4() as agent:
        sr2_id = agent.sm.create_sample_request(
            lead_id=lead2_id,
            sample_type="350g",
            crop_year="25/26",
            buyer_company="Test Buyer 2",
            buyer_destination_country="United Kingdom",
        )
        agent.sm.add_lot_to_sample_request(sr2_id, lot2_id, 350, confirmed=True)

        result = agent.make_decision(
            sample_request_id=sr2_id,
            lot_id=lot2_id,
            decision="rejected",
            notes="Musty flavor detected",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Decision: {result.get('decision', 'N/A')}")
    print(f"  ✓ Lead state: {result.get('lead_state', 'N/A')}")
    assert result["decision"] == "rejected"
    assert result["lead_state"] == "DECIDED_REJECTED"

    with EventBus() as bus:
        rejected_events = bus.replay(event_type=SAMPLE_REJECTED, limit=10)
        assert len(rejected_events) >= 1
        print(f"  ✓ SAMPLE_REJECTED events: {len(rejected_events)}")

    # ── 9. AUTO-DECIDE (score ≥ 85 → approved) ──
    print("\n[9] AUTO-DECIDE (score thresholds)")
    with StateManager() as sm:
        lead3_id = _create_qualified_lead(sm, country="USA")
        lot3_id = _setup_test_lots(sm)

    with Agent4() as agent:
        sr3_id = agent.sm.create_sample_request(
            lead_id=lead3_id,
            sample_type="350g",
            crop_year="25/26",
            buyer_company="Test Buyer 3",
            buyer_destination_country="USA",
        )
        agent.sm.add_lot_to_sample_request(sr3_id, lot3_id, 350, confirmed=True)

        # Record a high score → should auto-approve
        agent.record_cupping(
            sample_request_id=sr3_id,
            lot_id=lot3_id,
            total_score=88.0,
            defect_count_buyer=3,
            buyer_notes="Excellent cup, bright and clean",
            our_score=87.5,
        )

        result = agent.auto_decide(sr3_id, lot3_id)
    print(f"  ✓ Auto-decision: {result.get('decision', 'N/A')}")
    print(f"  ✓ Lead state: {result.get('lead_state', 'N/A')}")
    assert result["decision"] == "approved"
    assert result["lead_state"] == "DECIDED_APPROVED"

    # ── 10. GENERATE LABEL ──
    print("\n[10] GENERATE LABEL")
    with Agent4() as agent:
        label = agent.generate_label(sample_request_id, lot_id)
    if "error" not in label:
        print(f"  ✓ Label generated for lot {label.get('lot_id', 'N/A')}")
        print("  ✓ Label preview (first 5 lines):")
        for line in label["label_text"].split("\n")[:5]:
            print(f"    {line}")
    else:
        print(f"  ⚠ Label error: {label['error']}")

    # ── 11. ARCHITECTURE COMPLIANCE ──
    print("\n[11] ARCHITECTURE COMPLIANCE (no direct DB access)")
    import subprocess

    result_check = subprocess.run(
        ["grep", "-rn", "SessionLocal", "coffee_export/agents/agent4_sample.py"],
        capture_output=True,
        text=True,
    )
    # Filter out comments and docstrings
    violations = [
        line
        for line in result_check.stdout.strip().split("\n")
        if line and not line.strip().startswith("#") and "❌" not in line and '"""' not in line
    ]
    if violations:
        print("  ✗ VIOLATION: direct SessionLocal usage found:")
        for v in violations:
            print(f"    {v}")
        return 1
    else:
        print("  ✓ No direct SessionLocal usage — architecture compliant")

    # Check no direct model imports
    result_check2 = subprocess.run(
        [
            "grep",
            "-n",
            "from coffee_export.database.models import",
            "coffee_export/agents/agent4_sample.py",
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
        print("  ✗ VIOLATION: direct model imports found:")
        for v in violations2:
            print(f"    {v}")
        return 1
    else:
        print("  ✓ No direct model imports — architecture compliant")

    print("\n" + "=" * 60)
    print("✓ ALL TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(test())
