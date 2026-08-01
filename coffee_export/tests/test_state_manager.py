#!/usr/bin/env python3
"""
StateManager end-to-end smoke test.

Tests all major operations:
  1. Lead lifecycle (create, transition, transfer, history)
  2. Lot inventory (add, update, list, confirm)
  3. Sample budget (consume, cap enforcement, waitlist)
  4. Feedback + QA auto-flag
  5. KPI snapshot

Run:  python -m tests.test_state_manager
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.state import (
    ConcurrencyError,
    InvalidTransitionError,
    StateManager,
)


def test() -> int:
    print("=" * 60)
    print("StateManager — End-to-End Smoke Test")
    print("=" * 60)

    # ── 1. LEAD LIFECYCLE ──
    print("\n[1] LEAD LIFECYCLE")
    with StateManager() as sm:
        lead_id = sm.create_lead(
            company_name="Smoke Test Buyer Co",
            headquarters_country="Germany",
            priority_tier="A",
            recommended_vp="VP1",
            outreach_language="EN",
            tags=["test", "fairtrade"],
        )
        print(f"  ✓ Created lead: {lead_id}")

        lead = sm.get_lead(lead_id)
        assert lead is not None
        assert lead["current_state"] == "NEW"
        assert lead["priority_tier"] == "A"
        assert "fairtrade" in lead["tags"]
        print(f"  ✓ Initial state: {lead['current_state']}, tags: {lead['tags']}")

        # NEW → ENRICHED
        sm.update_lead_state(
            lead_id,
            "ENRICHED",
            agent="Agent 2",
            notes="Lead enriched",
            current_agent="Agent 2",
        )
        print("  ✓ NEW → ENRICHED")

        # Transfer ownership A2 → A3
        sm.transfer_ownership(lead_id, from_agent="Agent 2", to_agent="Agent 3")
        sm.update_lead_state(lead_id, "IN_SEQUENCE", agent="Agent 3", current_agent="Agent 3")
        print("  ✓ ENRICHED → IN_SEQUENCE (owned by Agent 3)")

        # Advance sequence steps
        for step in range(1, 4):
            new_step = sm.advance_sequence_step(lead_id)
            assert new_step == step
        print("  ✓ Advanced to sequence_step 3")

        # IN_SEQUENCE → QUALIFIED
        sm.update_lead_state(
            lead_id, "QUALIFIED", agent="Agent 3", notes="Q1-Q5 confirmed", current_agent="Agent 4"
        )
        print("  ✓ IN_SEQUENCE → QUALIFIED (owned by Agent 4)")

        # QUALIFIED → SAMPLE_DISPATCHED
        sm.update_lead_state(lead_id, "SAMPLE_DISPATCHED", agent="Agent 4")
        print("  ✓ QUALIFIED → SAMPLE_DISPATCHED")

        # Invalid transition
        try:
            sm.update_lead_state(lead_id, "NEW")
            print("  ✗ FAIL: invalid transition allowed!")
            return 1
        except InvalidTransitionError:
            print("  ✓ Invalid transition correctly rejected: SAMPLE_DISPATCHED → NEW")

        # History
        history = sm.get_lead_history(lead_id)
        print(f"  ✓ History captured {len(history)} transitions")

    # ── 2. LOT CONFIRMATION ──
    print("\n[2] LOT CONFIRMATION (EU buyer — EUDR required)")
    with StateManager() as sm:
        # First create a coop and washing station
        from coffee_export.database.base import now_addis_iso
        from coffee_export.database.models import Coop, WashingStation

        now = now_addis_iso()
        sm.session.add(
            Coop(
                coop_id="COOP-TEST-001",
                name="Yirgacheffe Union",
                region="Yirgacheffe",
                created_ts=now,
                updated_ts=now,
            )
        )
        sm.session.add(
            WashingStation(
                station_id="ST-TEST-001",
                coop_id="COOP-TEST-001",
                name="Konga Station",
                region="Yirgacheffe",
                gps_lat=6.16,
                gps_lon=38.19,
                created_ts=now,
                updated_ts=now,
            )
        )
        sm._commit()

        # Add a lot with complete EUDR
        lot_id = sm.add_lot(
            {
                "lot_id": "LOT-TEST-001",
                "station_id": "ST-TEST-001",
                "coop_id": "COOP-TEST-001",
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
        print(f"  ✓ Added lot: {lot_id}")

        result = sm.confirm_lot_for_sample(
            lot_id=lot_id,
            lead_id=lead_id,
            sample_type="350g",
            buyer_company="Smoke Test Buyer Co",
            destination_country="Germany",
            crop_year="25/26",
        )
        assert result["confirmed"] is True
        print("  ✓ Lot confirmed (EUDR complete, EU destination)")
        print(f"      Stock after: {result['stock_after_sample_bags']} bags")
        print(f"      Reserved until: {result.get('reserved_until', 'N/A')[:19]}")

    # ── 3. EUDR-BLOCKED ──
    print("\n[3] EUDR-BLOCKED CONFIRMATION")
    with StateManager() as sm:
        lot_id_partial = sm.add_lot(
            {
                "lot_id": "LOT-TEST-002",
                "station_id": "ST-TEST-001",
                "coop_id": "COOP-TEST-001",
                "region": "Guji",
                "washing_station_name": "Uraga Station",
                "coop_name": "Uraga Co-op",
                "process": "Natural",
                "cupping_score": 88.0,
                "crop_year": "25/26",
                "stock_bags_remaining": 25,
                "eudr_data_status": "partial",
                "status": "active",
            }
        )
        result = sm.confirm_lot_for_sample(
            lot_id=lot_id_partial,
            lead_id=lead_id,
            sample_type="350g",
            buyer_company="Smoke Test Buyer Co",
            destination_country="Germany",
            crop_year="25/26",
        )
        assert result["confirmed"] is False
        print("  ✓ Lot correctly blocked (EUDR partial, EU destination)")
        print(f"      Reason: {result['reason_if_not']}")

    # ── 4. SAMPLE BUDGET ──
    print("\n[4] SAMPLE BUDGET (atomic)")
    with StateManager() as sm:
        # Consume 3 full sets (the cap)
        for i in range(3):
            ok = sm.consume_sample_budget("350g", lead_id)
            assert ok, f"Budget consumption {i+1} should succeed"
        print("  ✓ Consumed 3/3 full sample sets this week")

        # 4th should fail
        ok = sm.consume_sample_budget("350g", lead_id)
        assert ok is False, "4th consumption should fail"
        print("  ✓ 4th consumption correctly rejected (cap reached)")

        # Add to waitlist
        sm.add_to_waitlist(lead_id, tier="A", sample_type="350g")
        waitlist = sm.get_waitlist()
        assert len(waitlist) >= 1
        print(f"  ✓ Lead added to waitlist (depth: {len(waitlist)})")

    # ── 5. FEEDBACK + QA AUTO-FLAG ──
    print("\n[5] FEEDBACK + QA AUTO-FLAG")
    with StateManager() as sm:
        # Add a test lot for feedback
        fb_lot_id = sm.add_lot(
            {
                "lot_id": "LOT-TEST-003",
                "station_id": "ST-TEST-001",
                "coop_id": "COOP-TEST-001",
                "region": "Sidamo",
                "washing_station_name": "Bensa Station",
                "coop_name": "Bensa Co-op",
                "process": "Washed",
                "cupping_score": 84.5,
                "crop_year": "25/26",
                "stock_bags_remaining": 80,
                "eudr_data_status": "complete",
                "status": "active",
            }
        )

        # First feedback — no flag
        fb1 = sm.log_feedback(
            lot_id=fb_lot_id,
            buyer_company="Smoke Test Buyer Co",
            buyer_segment="Specialty Importer",
            rejection_reason="Slight musty flavor detected, not suitable for our table",
        )
        assert fb1["qa_auto_flagged"] is False
        print("  ✓ Feedback #1 logged (no QA flag yet)")

        # Second feedback with same keyword → auto-flag
        fb2 = sm.log_feedback(
            lot_id=fb_lot_id,
            buyer_company="Another Buyer",
            buyer_segment="Specialty Importer",
            rejection_reason="Musty undertone, defect count higher than expected",
        )
        assert fb2["qa_auto_flagged"] is True
        print("  ✓ Feedback #2 logged → QA auto-flagged (≥2 'musty' rejections)")

        lot = sm.get_lot(fb_lot_id)
        assert lot["status"] == "hold"
        print(f"  ✓ Lot {fb_lot_id} status is now 'hold'")

        # Release from QA
        sm.release_lot_from_qa(fb_lot_id)
        lot = sm.get_lot(fb_lot_id)
        assert lot["status"] == "active"
        print("  ✓ Lot released from hold → active")

    # ── 6. CONCURRENCY GUARD ──
    print("\n[6] CONCURRENCY GUARD")
    with StateManager() as sm:
        try:
            sm.transfer_ownership(lead_id, from_agent="Agent 2", to_agent="Agent 5")
            print("  ✗ FAIL: concurrency guard didn't trigger!")
            return 1
        except ConcurrencyError:
            print("  ✓ Concurrency guard correctly rejected wrong-agent transfer")

    # ── 7. KPI SNAPSHOT ──
    print("\n[7] KPI SNAPSHOT")
    with StateManager() as sm:
        snapshot = sm.get_kpi_snapshot()
        print(f"  ✓ KPI snapshot generated at {snapshot['generated_ts'][:19]}")
        print(f"      Leads: {snapshot['leads']['total']}")
        print(f"      Lots: {snapshot['lots']['total']}")
        print(f"      Active reservations: {snapshot['samples']['active_reservations']}")
        print(f"      Feedback logged: {snapshot['feedback']['total_logged']}")
        print(f"      Waitlist depth: {snapshot['samples']['waitlist_depth']}")

    print("\n" + "=" * 60)
    print("✓ ALL TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(test())
