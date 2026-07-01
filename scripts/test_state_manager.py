#!/usr/bin/env python3
"""
End-to-end smoke test for the StateManager.
Tests all major operations: lead lifecycle, lot confirmation,
substitute finding, feedback + QA auto-flag, sample budget.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from state_manager import (StateManager, InvalidTransitionError,
                            ValidationFailedError, ConcurrencyError,
                            BudgetExceededError)

def test():
    with StateManager() as sm:
        print("=" * 60)
        print("StateManager — End-to-End Smoke Test")
        print("=" * 60)

        # ─── 1. LEAD LIFECYCLE ───
        print("\n[1] LEAD LIFECYCLE")
        lead_id = sm.create_lead(
            company_name="Test Buyer Co",
            headquarters_country="Germany",
            priority_tier="A",
            recommended_vp="VP1",
            outreach_language="EN",
            tags=["test", "fairtrade"],
        )
        print(f"  ✓ Created lead: {lead_id}")
        lead = sm.get_lead(lead_id)
        assert lead["current_state"] == "NEW"
        assert lead["priority_tier"] == "A"
        assert "fairtrade" in lead["tags"]
        print(f"  ✓ Initial state: {lead['current_state']}, tags: {lead['tags']}")

        # NEW → ENRICHED
        sm.update_lead_state(lead_id, "ENRICHED", agent="Agent 2",
                             notes="Lead enriched", current_agent="Agent 2")
        print(f"  ✓ NEW → ENRICHED")

        # ENRICHED → IN_SEQUENCE (with ownership transfer)
        sm.transfer_ownership(lead_id, from_agent="Agent 2", to_agent="Agent 3")
        sm.update_lead_state(lead_id, "IN_SEQUENCE", agent="Agent 3",
                             notes="Outreach started", current_agent="Agent 3")
        print(f"  ✓ ENRICHED → IN_SEQUENCE (ownership transferred to Agent 3)")

        # Advance sequence steps
        for step in range(1, 4):
            new_step = sm.advance_sequence_step(lead_id)
            assert new_step == step
        print(f"  ✓ Advanced to sequence_step 3")

        # IN_SEQUENCE → QUALIFIED
        sm.update_lead_state(lead_id, "QUALIFIED", agent="Agent 3",
                             notes="Q1-Q5 confirmed", current_agent="Agent 4")
        print(f"  ✓ IN_SEQUENCE → QUALIFIED (handoff to Agent 4)")

        # QUALIFIED → SAMPLE_DISPATCHED
        sm.update_lead_state(lead_id, "SAMPLE_DISPATCHED", agent="Agent 4",
                             notes="Type A samples shipped")
        print(f"  ✓ QUALIFIED → SAMPLE_DISPATCHED")

        # Invalid transition test
        try:
            sm.update_lead_state(lead_id, "NEW")  # SAMPLE_DISPATCHED → NEW is not allowed
            print(f"  ✗ FAIL: invalid transition was allowed!")
            return 1
        except InvalidTransitionError as e:
            print(f"  ✓ Invalid transition correctly rejected: SAMPLE_DISPATCHED → NEW")

        # Show history
        history = sm.get_lead_history(lead_id)
        print(f"  ✓ History captured {len(history)} transitions")
        for h in history:
            print(f"      {h['from_state'] or 'NULL':>20} → {h['to_state']:<20} "
                  f"by {h['agent']} at {h['ts'][:19]}")

        # ─── 2. LOT CONFIRMATION ───
        print("\n[2] LOT CONFIRMATION (EU buyer — EUDR required)")
        result = sm.confirm_lot_for_sample(
            lot_id="LOT-25-0001",
            lead_id=lead_id,
            sample_type="350g",
            buyer_company="Test Buyer Co",
            destination_country="Germany",
            crop_year="25/26",
        )
        assert result["confirmed"] is True
        print(f"  ✓ LOT-25-0001 confirmed (EUDR complete, EU destination)")
        print(f"      Stock after sample: {result['stock_after_sample_bags']} bags")
        print(f"      Reserved until: {result['reserved_until'][:19]}")
        print(f"      Docs: {len(result['docs_attached'])} categories")

        # Test EUDR-blocked confirmation
        print("\n[3] LOT CONFIRMATION (EUDR-blocked)")
        result2 = sm.confirm_lot_for_sample(
            lot_id="LOT-25-0004",  # EUDR partial
            lead_id=lead_id,
            sample_type="350g",
            buyer_company="Test Buyer Co",
            destination_country="Germany",
            crop_year="25/26",
        )
        assert result2["confirmed"] is False
        print(f"  ✓ LOT-25-0004 correctly blocked (EUDR partial, EU destination)")
        print(f"      Reason: {result2['reason_if_not']}")

        # Test not-found lot with substitute suggestion
        print("\n[4] SUBSTITUTE SUGGESTION")
        result3 = sm.confirm_lot_for_sample(
            lot_id="LOT-25-9999",  # doesn't exist
            lead_id=lead_id,
            sample_type="350g",
            buyer_company="Test Buyer Co",
            destination_country="Germany",
            crop_year="25/26",
        )
        assert result3["confirmed"] is False
        if result3["substitute_suggestion"]:
            print(f"  ✓ Substitute found: {result3['substitute_suggestion']['lot_id']}")
            print(f"      {result3['substitute_suggestion']['reason']}")
        else:
            print(f"  ✓ No substitute available (correctly identified)")

        # ─── 5. SAMPLE BUDGET ───
        print("\n[5] SAMPLE BUDGET (atomic)")
        # Consume 3 full sets (the cap)
        for i in range(3):
            ok = sm.consume_sample_budget("350g", lead_id)
            assert ok, f"Budget consumption {i+1} should succeed"
        print(f"  ✓ Consumed 3/3 full sample sets this week")

        # 4th should fail
        ok = sm.consume_sample_budget("350g", lead_id)
        assert ok is False, "4th consumption should fail (cap reached)"
        print(f"  ✓ 4th consumption correctly rejected (cap reached)")

        # Add to waitlist
        sm.add_to_waitlist(lead_id, tier="A", sample_type="350g")
        waitlist = sm.get_waitlist()
        assert len(waitlist) == 1
        print(f"  ✓ Lead added to waitlist (depth: {len(waitlist)})")

        # ─── 6. FEEDBACK + QA AUTO-FLAG ───
        print("\n[6] FEEDBACK + QA AUTO-FLAG")
        # First feedback — no flag
        fb1 = sm.log_feedback(
            lot_id="LOT-25-0003",
            buyer_company="Test Buyer Co",
            buyer_segment="Specialty Importer",
            rejection_reason="Slight musty flavor detected, not suitable for our table",
        )
        assert fb1["qa_auto_flagged"] is False
        print(f"  ✓ Feedback #1 logged (no QA flag yet)")

        # Second feedback with same critical keyword → auto-flag
        fb2 = sm.log_feedback(
            lot_id="LOT-25-0003",
            buyer_company="Another Buyer",
            buyer_segment="Specialty Importer",
            rejection_reason="Musty undertone, defect count higher than expected",
        )
        assert fb2["qa_auto_flagged"] is True
        print(f"  ✓ Feedback #2 logged → QA auto-flagged (≥2 'musty' rejections)")

        # Verify lot is now on hold
        lot = sm.get_lot("LOT-25-0003")
        assert lot["status"] == "hold"
        print(f"  ✓ LOT-25-0003 status is now 'hold'")

        # Release from QA
        sm.release_lot_from_qa("LOT-25-0003")
        lot = sm.get_lot("LOT-25-0003")
        assert lot["status"] == "active"
        print(f"  ✓ LOT-25-0003 released from hold → active")

        # ─── 7. CONCURRENCY GUARD ───
        print("\n[7] CONCURRENCY GUARD (ownership transfer)")
        try:
            # Try to transfer from wrong agent
            sm.transfer_ownership(lead_id, from_agent="Agent 2", to_agent="Agent 5")
            print(f"  ✗ FAIL: concurrency guard didn't trigger!")
            return 1
        except ConcurrencyError as e:
            print(f"  ✓ Concurrency guard correctly rejected wrong-agent transfer")

        # ─── 8. BLOCKED LEADS ───
        print("\n[8] BLOCKED LEADS")
        sm.update_lead_state(lead_id, "BLOCKED", agent="Agent 4",
                             notes="Waiting on Agent 1 lot confirmation >1 business day")
        blocked = sm.get_blocked_leads()
        assert len(blocked) >= 1
        print(f"  ✓ Lead marked BLOCKED, {len(blocked)} lead(s) need operator attention")
        # Unblock
        sm.update_lead_state(lead_id, "SAMPLE_DISPATCHED", agent="operator",
                             notes="Operator resolved the block")
        print(f"  ✓ Lead unblocked by operator")

        print("\n" + "=" * 60)
        print("✓ ALL TESTS PASSED")
        print("=" * 60)
        return 0

if __name__ == "__main__":
    sys.exit(test())
