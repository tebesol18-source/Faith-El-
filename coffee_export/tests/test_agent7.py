#!/usr/bin/env python3
"""
Agent 7 — end-to-end smoke test.

Tests:
  1. Registration
  2. Handle SHIPMENT_DELIVERED (create account)
  3. Account created with correct totals
  4. Log relationship activity (call)
  5. Record NPS score (promoter)
  6. Account health check (active)
  7. Activity timeline
  8. Repeat order request
  9. Events published (ACCOUNT_CREATED, NPS_COLLECTED, REPEAT_ORDER_REQUESTED)
  10. Relationship stats
  11. Architecture compliance

Run:  python -m tests.test_agent7
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent7_relationship import Agent7
from coffee_export.agents.registry import create_agent, list_registered_agents
from coffee_export.database.base import now_addis_iso
from coffee_export.database.models import Coop, WashingStation
from coffee_export.events import (
    ACCOUNT_CREATED,
    NPS_COLLECTED,
    REPEAT_ORDER_REQUESTED,
    SHIPMENT_DELIVERED,
    EventBus,
)
from coffee_export.state import StateManager


def _create_delivered_contract(sm: StateManager, country: str = "Germany") -> tuple[str, str, str]:
    """Create a lead + lot + signed contract + shipment in 'delivered' state."""
    import time

    ts = str(int(time.time() * 1000))[-6:]
    now = now_addis_iso()

    coop_id = f"COOP-A7-{ts}"
    station_id = f"ST-A7-{ts}"
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
            "lot_id": f"LOT-A7-{ts}-001",
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
        company_name=f"Agent7 Test Buyer {ts}",
        headquarters_country=country,
        priority_tier="A",
        recommended_vp="VP1",
    )
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
    sm.update_contract_status(contract_id, "completed")

    return contract_id, lead_id, lot_id


def test() -> int:
    print("=" * 60)
    print("Agent 7 — End-to-End Smoke Test")
    print("=" * 60)

    # ── 1. REGISTRATION ──
    print("\n[1] REGISTRATION")
    registered = list_registered_agents()
    print(f"  ✓ Registered agents: {registered}")
    assert "Agent 7" in registered

    agent = create_agent("Agent 7")
    assert agent is not None
    assert isinstance(agent, Agent7)
    print(f"  ✓ create_agent('Agent 7') returned: {type(agent).__name__}")

    # ── SETUP ──
    print("\n[SETUP] Creating delivered contract")
    with StateManager() as sm:
        contract_id, lead_id, lot_id = _create_delivered_contract(sm, country="Germany")
    print(f"  ✓ Contract: {contract_id} (completed)")
    print(f"  ✓ Lead: {lead_id}")
    print(f"  ✓ Lot: {lot_id}")

    # ── 2. HANDLE SHIPMENT_DELIVERED ──
    print("\n[2] HANDLE SHIPMENT_DELIVERED (create account)")
    with EventBus() as bus:
        bus.publish(
            event_type=SHIPMENT_DELIVERED,
            entity_type="shipment",
            entity_id="SH-TEST-001",
            payload={
                "shipment_id": "SH-TEST-001",
                "contract_id": contract_id,
                "ata": "2026-08-10T14:00:00+02:00",
            },
            published_by="Agent 6",
        )

    with Agent7() as agent:
        result = agent.get_leads_to_process()
        assert len(result) >= 1
        process_result = agent.process_lead(result[0])

    print(f"  ✓ Action: {process_result['action']}")
    print(f"  ✓ Account ID: {process_result.get('account_id', 'N/A')}")
    assert process_result["action"] == "account_created"
    account_id = process_result["account_id"]

    # ── 3. ACCOUNT CREATED WITH CORRECT TOTALS ──
    print("\n[3] ACCOUNT CREATED WITH CORRECT TOTALS")
    with StateManager() as sm:
        account = sm.get_account(account_id)
    print(f"  ✓ Lead: {account.get('lead_id', 'N/A')}")
    print(f"  ✓ Status: {account.get('relationship_status', 'N/A')}")
    print(f"  ✓ Total volume: {account.get('total_volume_bags', 0)} bags")
    print(f"  ✓ Total revenue: ${account.get('total_revenue_usd', 0):,.2f}")
    print(f"  ✓ First contract: {account.get('first_contract_date', 'N/A')}")
    assert account["relationship_status"] == "active"
    assert account["total_volume_bags"] == 200

    # Verify ACCOUNT_CREATED published
    with EventBus() as bus:
        created = bus.replay(event_type=ACCOUNT_CREATED, limit=10)
        assert len(created) >= 1
        print(f"  ✓ ACCOUNT_CREATED events: {len(created)}")

    # ── 4. LOG RELATIONSHIP ACTIVITY ──
    print("\n[4] LOG RELATIONSHIP ACTIVITY (call)")
    with Agent7() as agent:
        result = agent.log_activity(
            account_id=account_id,
            activity_type="call",
            summary="Discussed 26/27 forward program. Buyer interested in Guji washed.",
            participants="John Smith (buyer), Sarah (us)",
            next_steps="Send 26/27 forward pricing sheet next week",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Activity ID: {result.get('activity_id', 'N/A')}")
    assert result["action"] == "activity_logged"

    # ── 5. RECORD NPS SCORE ──
    print("\n[5] RECORD NPS SCORE (promoter)")
    with Agent7() as agent:
        result = agent.record_nps(
            account_id=account_id,
            score=9,
            feedback="Great quality coffee, on-time delivery, excellent communication.",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ NPS: {result.get('nps_score', 'N/A')}/10 ({result.get('nps_category', 'N/A')})")
    assert result["action"] == "nps_recorded"
    assert result["nps_category"] == "promoter"

    # Verify NPS_COLLECTED published
    with EventBus() as bus:
        nps_events = bus.replay(event_type=NPS_COLLECTED, limit=10)
        assert len(nps_events) >= 1
        print(f"  ✓ NPS_COLLECTED events: {len(nps_events)}")

    # Verify account NPS updated
    with StateManager() as sm:
        account = sm.get_account(account_id)
    print(f"  ✓ Account NPS: {account.get('nps_score', 'N/A')}")
    assert account["nps_score"] == 9

    # ── 6. ACCOUNT HEALTH CHECK ──
    print("\n[6] ACCOUNT HEALTH CHECK")
    with Agent7() as agent:
        health = agent.check_account_health(account_id)
    print(f"  ✓ Status: {health.get('current_status', 'N/A')}")
    print(f"  ✓ Health: {health.get('health', 'N/A')}")
    print(f"  ✓ Days since activity: {health.get('days_since_activity', 'N/A')}")
    assert health["current_status"] == "active"
    assert health["days_since_activity"] == 0  # just had activity

    # ── 7. ACTIVITY TIMELINE ──
    print("\n[7] ACTIVITY TIMELINE")
    with Agent7() as agent:
        timeline = agent.get_account_timeline(account_id)
    print(f"  ✓ Activities: {len(timeline)}")
    for a in timeline[:5]:
        print(
            f"    [{a.get('activity_ts', '')[:19]}] {a.get('activity_type', '')}: "
            f"{a.get('summary', '')[:60]}"
        )
    assert len(timeline) >= 3  # delivery_followup + call + nps

    # ── 8. REPEAT ORDER REQUEST ──
    print("\n[8] REPEAT ORDER REQUEST")
    with Agent7() as agent:
        result = agent.request_repeat_order(
            account_id=account_id,
            lot_ids=[lot_id],
            notes="Buyer wants same lot for 26/27 crop",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Lead: {result.get('lead_id', 'N/A')}")
    assert result["action"] == "repeat_order_requested"

    # Verify REPEAT_ORDER_REQUESTED published
    with EventBus() as bus:
        repeat_events = bus.replay(event_type=REPEAT_ORDER_REQUESTED, limit=10)
        assert len(repeat_events) >= 1
        print(f"  ✓ REPEAT_ORDER_REQUESTED events: {len(repeat_events)}")

    # ── 9. RELATIONSHIP STATS ──
    print("\n[9] RELATIONSHIP STATS")
    with Agent7() as agent:
        stats = agent.get_stats()
    print(f"  ✓ Total accounts: {stats['total_accounts']}")
    print(f"  ✓ Total revenue: ${stats['total_revenue']:,.2f}")
    print(f"  ✓ Total volume: {stats['total_volume_bags']} bags")
    print(f"  ✓ NPS Score: {stats['nps_score']} ({stats['nps_responses']} responses)")
    assert stats["total_accounts"] >= 1
    assert stats["nps_responses"] >= 1

    # ── 10. ARCHITECTURE COMPLIANCE ──
    print("\n[10] ARCHITECTURE COMPLIANCE (no direct DB access)")
    import subprocess

    result_check = subprocess.run(
        ["grep", "-rn", "SessionLocal", "coffee_export/agents/agent7_relationship.py"],
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
            "coffee_export/agents/agent7_relationship.py",
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
    print("✓ ALL TESTS PASSED — 7-AGENT CHAIN COMPLETE!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(test())
