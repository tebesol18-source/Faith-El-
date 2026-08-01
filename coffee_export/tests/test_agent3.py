#!/usr/bin/env python3
"""
Agent 3 — end-to-end smoke test.

Tests:
  1. Registration
  2. Start outreach (ENRICHED → IN_SEQUENCE, step 1 sent)
  3. Advance sequence (steps 2-6, then GHOSTED)
  4. Draft messages for each step (LinkedIn + email)
  5. Sequence B for large commercial importers
  6. Record positive buyer reply → start QUAL gate
  7. Record Q1-Q5 answers → QUALIFIED
  8. Record negative reply → NURTURE
  9. Events published (LEAD_QUALIFIED, LEAD_GHOSTED, LEAD_NURTURED)
  10. Outreach stats

Run:  python -m tests.test_agent3
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent3_outreach import Agent3, run_agent3_stats
from coffee_export.agents.registry import create_agent, list_registered_agents
from coffee_export.events import LEAD_GHOSTED, LEAD_NURTURED, LEAD_QUALIFIED, EventBus
from coffee_export.state import StateManager


def _create_enriched_lead(sm: StateManager, company_name: str, vp: str = "VP1") -> str:
    """Create a lead in ENRICHED state for testing."""
    import time

    ts = str(int(time.time() * 1000))[-6:]

    lead_id = sm.create_lead(
        company_name=f"{company_name} {ts}",
        headquarters_country="Germany",
        priority_tier="A",
        recommended_vp=vp,
        outreach_language="EN",
        tags=["test"],
    )
    sm.update_lead_state(
        lead_id,
        "ENRICHED",
        agent="Agent 2",
        notes="Enriched for Agent 3 test",
        current_agent="Agent 3",
    )
    return lead_id


def test() -> int:
    print("=" * 60)
    print("Agent 3 — End-to-End Smoke Test")
    print("=" * 60)

    # ── 1. REGISTRATION ──
    print("\n[1] REGISTRATION")
    registered = list_registered_agents()
    print(f"  ✓ Registered agents: {registered}")
    assert "Agent 3" in registered

    agent = create_agent("Agent 3")
    assert agent is not None
    assert isinstance(agent, Agent3)
    print(f"  ✓ create_agent('Agent 3') returned: {type(agent).__name__}")

    # ── 2. START OUTREACH ──
    print("\n[2] START OUTREACH (ENRICHED → IN_SEQUENCE)")
    with StateManager() as sm:
        lead_id = _create_enriched_lead(sm, "Agent3 Test Buyer A")

    with Agent3() as agent:
        lead = agent.sm.get_lead(lead_id)
        result = agent._start_outreach(lead)

    print(f"  ✓ Lead: {lead_id}")
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Step: {result['step']}")
    print(f"  ✓ Channel: {result['channel']}")

    lead = agent.sm.get_lead(lead_id)
    assert lead["current_state"] == "IN_SEQUENCE"
    assert lead["sequence_step"] == 1

    # ── 3. ADVANCE SEQUENCE ──
    print("\n[3] ADVANCE SEQUENCE (steps 2-6)")
    with Agent3() as agent:
        for step in range(2, 7):
            lead = agent.sm.get_lead(lead_id)
            result = agent._advance_sequence(lead)
            print(
                f"  ✓ Step {step}: action={result['action']}, channel={result.get('channel', 'N/A')}"
            )

        # Step 7 should ghost the lead
        lead = agent.sm.get_lead(lead_id)
        result = agent._advance_sequence(lead)
        print(f"  ✓ Step 7 (max): action={result['action']}")

    lead = agent.sm.get_lead(lead_id)
    assert lead["current_state"] == "GHOSTED"
    print(f"  ✓ Lead state: {lead['current_state']}")

    # ── 4. DRAFT MESSAGES ──
    print("\n[4] DRAFT MESSAGES (each step)")
    with StateManager() as sm:
        lead2_id = _create_enriched_lead(sm, "Agent3 Test Buyer B")

    with Agent3() as agent:
        for step in range(1, 7):
            message = agent.draft_outreach_message(lead2_id, step)
            channel = message.get("channel", "N/A")
            subject = message.get("subject", "(no subject)")[:50]
            print(f"  ✓ Step {step} ({channel}): {subject}")
            assert message.get("full_message"), f"Step {step} has no message"

    # ── 5. SEQUENCE B (large commercial) ──
    print("\n[5] SEQUENCE B (large commercial importer)")
    with StateManager() as sm:
        lead3_id = _create_enriched_lead(sm, "Sucafina Test Buyer")

    with Agent3() as agent:
        lead3 = agent.sm.get_lead(lead3_id)
        sequence = agent._get_sequence(lead3)
        seq_type = "B (Email-first)" if sequence[0]["channel"] == "email" else "A (LinkedIn-first)"
        print(f"  ✓ Company 'Sucafina' → Sequence {seq_type}")
        assert sequence[0]["channel"] == "email", "Large commercial should use Sequence B"

        message = agent.draft_outreach_message(lead3_id, 1)
        print(f"  ✓ Step 1 channel: {message['channel']} (expected email)")
        assert message["channel"] == "email"

    # ── 6. POSITIVE REPLY → START QUAL ──
    print("\n[6] POSITIVE REPLY → START QUAL GATE")
    with StateManager() as sm:
        lead4_id = _create_enriched_lead(sm, "Agent3 Qual Test Buyer")

    with Agent3() as agent:
        # Start outreach first
        lead4 = agent.sm.get_lead(lead4_id)
        agent._start_outreach(lead4)

        # Record positive reply
        result = agent.record_buyer_reply(
            lead_id=lead4_id,
            reply_type="positive",
            reply_content="Yes, we're interested. Send us more info about your 25/26 lots.",
        )
    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Questions sent: {result.get('questions_sent', [])}")
    assert result["action"] == "qualification_started"

    # ── 7. QUAL GATE (Q1-Q5 → QUALIFIED) ──
    print("\n[7] QUAL GATE (Q1-Q5 → QUALIFIED)")
    with Agent3() as agent:
        qual_answers = [
            ("Q1", "Yes, we buy 5 FCL/year of Ethiopian origin"),
            ("Q2", "Yes, we're an importer buying 25+ bags/lot"),
            ("Q3", "Yes, I'm the Head of Coffee and buyer"),
            ("Q4", "Yes, we're sourcing now for 25/26 arrivals"),
            ("Q5", "Yes, we agree to pay sample shipping"),
        ]

        for qid, answer in qual_answers:
            result = agent.record_buyer_reply(
                lead_id=lead4_id,
                reply_type="qualification_answer",
                reply_content=f"{qid}: {answer}",
            )
            print(f"  ✓ {qid}: action={result['action']}")

            if result["action"] == "qualified":
                print("  ✓ QUALIFIED!")
                break

    lead4 = agent.sm.get_lead(lead4_id)
    assert lead4["current_state"] == "QUALIFIED"
    print(f"  ✓ Lead state: {lead4['current_state']}")
    print(f"  ✓ Current agent: {lead4['current_agent']} (expected Agent 4)")
    assert lead4["current_agent"] == "Agent 4"

    # ── 8. NEGATIVE REPLY → NURTURE ──
    print("\n[8] NEGATIVE REPLY → NURTURE")
    with StateManager() as sm:
        lead5_id = _create_enriched_lead(sm, "Agent3 Negative Test Buyer")

    with Agent3() as agent:
        lead5 = agent.sm.get_lead(lead5_id)
        agent._start_outreach(lead5)

        result = agent.record_buyer_reply(
            lead_id=lead5_id,
            reply_type="negative",
            reply_content="Not interested at this time, thanks.",
        )
    print(f"  ✓ Action: {result['action']}")

    lead5 = agent.sm.get_lead(lead5_id)
    assert lead5["current_state"] == "NURTURE"
    print(f"  ✓ Lead state: {lead5['current_state']}")

    # ── 9. EVENTS PUBLISHED ──
    print("\n[9] EVENTS PUBLISHED")
    with EventBus() as bus:
        qualified_events = bus.replay(event_type=LEAD_QUALIFIED, limit=50)
        ghosted_events = bus.replay(event_type=LEAD_GHOSTED, limit=50)
        nurtured_events = bus.replay(event_type=LEAD_NURTURED, limit=50)

        print(f"  ✓ LEAD_QUALIFIED events: {len(qualified_events)}")
        print(f"  ✓ LEAD_GHOSTED events: {len(ghosted_events)}")
        print(f"  ✓ LEAD_NURTURED events: {len(nurtured_events)}")

        assert len(qualified_events) >= 1, "Expected ≥1 LEAD_QUALIFIED"
        assert len(ghosted_events) >= 1, "Expected ≥1 LEAD_GHOSTED"
        assert len(nurtured_events) >= 1, "Expected ≥1 LEAD_NURTURED"

        if qualified_events:
            payload = qualified_events[0]["payload"]
            print("\n  Sample LEAD_QUALIFIED payload:")
            for k, v in payload.items():
                print(f"    {k}: {str(v)[:60]}")

    # ── 10. OUTREACH STATS ──
    print("\n[10] OUTREACH STATS")
    stats = run_agent3_stats()
    print(f"  ✓ Total touches:    {stats['total_touches']}")
    print(f"  ✓ Total outbound:   {stats['total_outbound']}")
    print(f"  ✓ Total responses:  {stats['total_responses']}")
    print(f"  ✓ Response rate:    {stats['response_rate']}%")
    print(f"  ✓ Leads in sequence: {stats['leads_in_sequence']}")
    print(f"  ✓ Leads qualified:   {stats['leads_qualified']}")
    print(f"  ✓ Leads ghosted:     {stats['leads_ghosted']}")
    print(f"  ✓ Leads nurtured:    {stats['leads_nurtured']}")
    assert stats["total_touches"] > 0

    print("\n" + "=" * 60)
    print("✓ ALL TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(test())
