#!/usr/bin/env python3
"""
Agent 5 — end-to-end smoke test.

Tests:
  1. Registration
  2. Handle SAMPLE_APPROVED (create contract + compliance checklist)
  3. EU destination requires EUDR attestation
  4. Non-EU destination (no EUDR required)
  5. Submit compliance documents
  6. Approve documents one by one
  7. Auto-transition to pending_signature when all approved
  8. Sign contract (blocked if docs incomplete)
  9. Sign contract (success when all docs approved)
  10. Events published (CONTRACT_DRAFTED, CONTRACT_SIGNED)
  11. Architecture compliance (no direct DB access)

Run:  python -m tests.test_agent5
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent5_compliance import Agent5
from coffee_export.agents.registry import create_agent, list_registered_agents
from coffee_export.database.base import now_addis_iso
from coffee_export.database.models import Coop, WashingStation
from coffee_export.events import (
    CONTRACT_DRAFTED,
    CONTRACT_SIGNED,
    SAMPLE_APPROVED,
    EventBus,
)
from coffee_export.state import StateManager


def _create_approved_lead(sm: StateManager, country: str = "Germany") -> str:
    """Create a lead in DECIDED_APPROVED state for Agent 5 testing."""
    import time

    ts = str(int(time.time() * 1000))[-6:]

    lead_id = sm.create_lead(
        company_name=f"Agent5 Test Buyer {ts}",
        headquarters_country=country,
        priority_tier="A",
        recommended_vp="VP1",
    )
    sm.update_lead_state(lead_id, "ENRICHED", agent="Agent 2", current_agent="Agent 3")
    sm.update_lead_state(lead_id, "IN_SEQUENCE", agent="Agent 3", current_agent="Agent 3")
    sm.update_lead_state(lead_id, "QUALIFIED", agent="Agent 3", current_agent="Agent 4")
    sm.update_lead_state(lead_id, "SAMPLE_DISPATCHED", agent="Agent 4", current_agent="Agent 4")
    sm.update_lead_state(lead_id, "SAMPLE_FEEDBACK_DUE", agent="Agent 4", current_agent="Agent 4")
    sm.update_lead_state(
        lead_id,
        "DECIDED_APPROVED",
        agent="Agent 4",
        notes="Sample approved",
        current_agent="Agent 5",
    )
    return lead_id


def _setup_test_lot(sm: StateManager) -> str:
    """Create a test lot with complete EUDR + organic cert."""
    import time

    ts = str(int(time.time() * 1000))[-6:]
    now = now_addis_iso()

    coop_id = f"COOP-A5-{ts}"
    station_id = f"ST-A5-{ts}"
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
            "lot_id": f"LOT-A5-{ts}-001",
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
            "certifications": "organic",
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
    print("Agent 5 — End-to-End Smoke Test")
    print("=" * 60)

    # ── 1. REGISTRATION ──
    print("\n[1] REGISTRATION")
    registered = list_registered_agents()
    print(f"  ✓ Registered agents: {registered}")
    assert "Agent 5" in registered

    agent = create_agent("Agent 5")
    assert agent is not None
    assert isinstance(agent, Agent5)
    print(f"  ✓ create_agent('Agent 5') returned: {type(agent).__name__}")

    # ── SETUP ──
    print("\n[SETUP] Creating test data")
    with StateManager() as sm:
        lot_id = _setup_test_lot(sm)
        lead_id = _create_approved_lead(sm, country="Germany")
    print(f"  ✓ Created lot: {lot_id} (organic certified)")
    print(f"  ✓ Created approved lead: {lead_id} (Germany → EU)")

    # ── 2. HANDLE SAMPLE_APPROVED (EU buyer) ──
    print("\n[2] HANDLE SAMPLE_APPROVED (EU buyer → EUDR required)")
    with EventBus() as bus:
        bus.publish(
            event_type=SAMPLE_APPROVED,
            entity_type="sample_request",
            entity_id="SR-A5-TEST",
            payload={
                "sample_request_id": "SR-A5-TEST",
                "lead_id": lead_id,
                "lot_id": lot_id,
                "decision": "approved",
                "buyer_target_fob": 4.50,
                "buyer_target_volume_bags": 200,
                "buyer_target_port": "Hamburg",
                "buyer_payment_terms": "LC at sight",
            },
            published_by="Agent 4",
        )

    with Agent5() as agent:
        result = agent.get_leads_to_process()
        assert len(result) >= 1
        process_result = agent.process_lead(result[0])

    print(f"  ✓ Action: {process_result['action']}")
    print(f"  ✓ Contract ID: {process_result.get('contract_id', 'N/A')}")
    print(f"  ✓ Total volume: {process_result.get('total_volume_bags', 0)} bags")
    print(f"  ✓ Total value: ${process_result.get('total_value', 0)}")
    print(f"  ✓ Incoterm: {process_result.get('incoterm', 'N/A')}")

    checklist = process_result.get("compliance_checklist", {})
    required = checklist.get("required", [])
    print(f"  ✓ Required documents: {len(required)}")
    print(f"    {', '.join(required)}")

    assert process_result["action"] == "contract_created"
    contract_id = process_result["contract_id"]
    assert "eudr_attestation" in required, "EU destination should require EUDR"
    assert "organic_cert" in required, "Organic lot should require organic_cert"
    assert "certificate_of_origin" in required

    # Verify CONTRACT_DRAFTED published
    with EventBus() as bus:
        drafted = bus.replay(event_type=CONTRACT_DRAFTED, limit=10)
        assert len(drafted) >= 1
        print(f"  ✓ CONTRACT_DRAFTED events: {len(drafted)}")

    # ── 3. CHECK COMPLIANCE CHECKLIST ──
    print("\n[3] CHECK COMPLIANCE CHECKLIST")
    with Agent5() as agent:
        checklist = agent.get_compliance_checklist(contract_id)

    print(f"  ✓ Can sign: {checklist['can_sign']}")
    print(f"  ✓ Approved: {checklist['approved']}/{checklist['total_docs']}")
    print(f"  ✓ Pending:  {checklist['pending']}")

    for item in checklist["checklist"]:
        print(f"    {item['icon']} {item['document_type']:<25} [{item['status']}]")

    assert checklist["can_sign"] is False, "Should not be able to sign with pending docs"
    assert checklist["pending"] > 0

    # ── 4. SUBMIT DOCUMENTS ──
    print("\n[4] SUBMIT DOCUMENTS")
    with Agent5() as agent:
        for doc_type in [
            "certificate_of_origin",
            "phytosanitary_cert",
            "commercial_invoice",
            "packing_list",
            "eudr_attestation",
            "organic_cert",
        ]:
            result = agent.submit_document(
                contract_id=contract_id,
                document_type=doc_type,
                file_path=f"/docs/{doc_type}.pdf",
                issued_date="2026-07-02",
            )
            print(f"  ✓ Submitted: {doc_type} (doc_id={result.get('doc_id')})")

    # ── 5. APPROVE DOCUMENTS ONE BY ONE ──
    print("\n[5] APPROVE DOCUMENTS")
    with Agent5() as agent:
        docs = agent.sm.get_compliance_documents(contract_id)
        for doc in docs:
            result = agent.approve_document(doc["id"])
            print(f"  ✓ Approved: {doc['document_type']} (doc_id={doc['id']})")

    # ── 6. AUTO-TRANSITION TO PENDING_SIGNATURE ──
    print("\n[6] AUTO-TRANSITION TO PENDING_SIGNATURE")
    with StateManager() as sm:
        contract = sm.get_contract(contract_id)
        print(f"  ✓ Contract status: {contract['status']}")
        assert (
            contract["status"] == "pending_signature"
        ), f"Expected pending_signature, got {contract['status']}"

    # ── 7. SIGN CONTRACT (SUCCESS) ──
    print("\n[7] SIGN CONTRACT (all docs approved)")
    with Agent5() as agent:
        result = agent.sign_contract(contract_id)

    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Lead state: {result.get('lead_state', 'N/A')}")
    print(f"  ✓ Next agent: {result.get('next_agent', 'N/A')}")
    assert result["action"] == "contract_signed"
    assert result["lead_state"] == "CONTRACTED"
    assert result["next_agent"] == "Agent 6"

    # Verify CONTRACT_SIGNED published
    with EventBus() as bus:
        signed = bus.replay(event_type=CONTRACT_SIGNED, limit=10)
        assert len(signed) >= 1
        print(f"  ✓ CONTRACT_SIGNED events: {len(signed)}")

    # ── 8. NON-EU DESTINATION (NO EUDR) ──
    print("\n[8] NON-EU DESTINATION (USA → no EUDR, FDA required)")
    with StateManager() as sm:
        lead2_id = _create_approved_lead(sm, country="USA")
        lot2_id = _setup_test_lot(sm)

    with Agent5() as agent:
        result = agent.create_contract_from_approval(
            lead_id=lead2_id,
            lot_id=lot2_id,
            buyer_target_fob=4.00,
            buyer_target_volume_bags=100,
        )

    checklist2 = result.get("compliance_checklist", {})
    required2 = checklist2.get("required", [])
    print(f"  ✓ Required docs: {', '.join(required2)}")
    assert "eudr_attestation" not in required2, "USA should NOT require EUDR"
    assert "fda_prior_notice" in required2, "USA should require FDA prior notice"
    assert "organic_cert" in required2, "Organic lot should require organic_cert"

    # ── 9. SIGN BLOCKED (docs incomplete) ──
    print("\n[9] SIGN BLOCKED (docs incomplete)")
    with Agent5() as agent:
        result = agent.sign_contract(result["contract_id"])

    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Reason: {result.get('reason', 'N/A')}")
    assert result["action"] == "blocked"

    # ── 10. ARCHITECTURE COMPLIANCE ──
    print("\n[10] ARCHITECTURE COMPLIANCE (no direct DB access)")
    import subprocess

    result_check = subprocess.run(
        ["grep", "-rn", "SessionLocal", "coffee_export/agents/agent5_compliance.py"],
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
            "coffee_export/agents/agent5_compliance.py",
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
