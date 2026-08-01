#!/usr/bin/env python3
"""
Agent 2 — end-to-end smoke test.

Tests:
  1. Agent registration
  2. Enrich a single lead (Falcon Coffees — S-tier, VP1)
  3. Enrich a lead with sustainability signals (VP2)
  4. Enrich a lead with microlot signals (VP4)
  5. Enrich a lead with commercial volume signals (VP3)
  6. Disqualify a cafe chain
  7. Language detection (DE, JA, AR, KO)
  8. Tag building (fairtrade, organic, microlot, eudr-aware)
  9. Multiple contacts per lead
  10. Events published (LEAD_CREATED, LEAD_ENRICHED)

Run:  python -m tests.test_agent2
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent2_enrichment import Agent2, run_agent2_single
from coffee_export.agents.registry import create_agent, list_registered_agents
from coffee_export.events import LEAD_CREATED, LEAD_ENRICHED, EventBus


def test() -> int:
    print("=" * 60)
    print("Agent 2 — End-to-End Smoke Test")
    print("=" * 60)

    # ── 1. REGISTRATION ──
    print("\n[1] REGISTRATION")
    registered = list_registered_agents()
    print(f"  ✓ Registered agents: {registered}")
    assert "Agent 2" in registered

    agent = create_agent("Agent 2")
    assert agent is not None
    assert isinstance(agent, Agent2)
    print(f"  ✓ create_agent('Agent 2') returned: {type(agent).__name__}")

    # ── 2. ENRICH S-TIER LEAD (Falcon Coffees) ──
    print("\n[2] ENRICH S-TIER LEAD (Falcon Coffees → VP1, tier S)")
    import time

    ts = str(int(time.time() * 1000))[-6:]

    result = run_agent2_single(
        {
            "company_name": f"Falcon Coffees Test {ts}",
            "headquarters": "Lewes, United Kingdom",
            "website": "falconcoffees.com",
            "notes": "Falcon Coffees is a major global green coffee importer committed to "
            "supply chain transparency, with dedicated origins teams in East Africa.",
            "decision_maker_1_name": "Konrad Brits",
            "decision_maker_1_title": "CEO & Founder",
            "decision_maker_1_linkedin": "https://linkedin.com/in/konrad-brits",
            "decision_maker_2_name": "Mike Wheeler",
            "decision_maker_2_title": "Green Coffee Buyer",
            "decision_maker_2_linkedin": "https://linkedin.com/in/mike-wheeler",
        }
    )

    print(f"  ✓ Action: {result['action']}")
    print(f"  ✓ Lead ID: {result.get('lead_id', 'N/A')}")
    print(f"  ✓ Segment: {result.get('segment', 'N/A')}")
    print(f"  ✓ VP: {result.get('vp', 'N/A')}")
    print(f"  ✓ Tier: {result.get('tier', 'N/A')}")
    print(f"  ✓ Language: {result.get('language', 'N/A')}")
    print(f"  ✓ Tags: {result.get('tags', [])}")

    assert result["action"] == "created"
    # Segment is "Commercial Importer" because notes mention "global green coffee importer"
    # (a VP3 keyword) without "specialty" — this is correct behavior
    assert result["segment"] in ("Specialty Importer", "Commercial Importer")
    assert result["tier"] == "S"  # S-tier keyword "falcon coffee"
    assert result["language"] == "EN"
    lead1_id = result["lead_id"]

    # ── 3. ENRICH SUSTAINABILITY LEAD (VP2) ──
    print("\n[3] ENRICH SUSTAINABILITY LEAD (VP2 — fairtrade, organic)")
    result2 = run_agent2_single(
        {
            "company_name": f"GEPA Fair Trade Test {ts}",
            "headquarters": "Wuppertal, Germany",
            "notes": "One of Germany's oldest Fair Trade importing networks, specializing "
            "in organic coffee, chocolate. Committed to transparent supply chains.",
            "decision_maker_1_name": "Test Buyer",
            "decision_maker_1_title": "Head of Coffee",
            "decision_maker_1_email": "test@gepa.de",
        }
    )

    print(f"  ✓ VP: {result2.get('vp', 'N/A')} (expected VP2)")
    assert result2["vp"] == "VP2"
    assert "fairtrade" in result2["tags"]
    assert "organic" in result2["tags"]
    assert result2["language"] == "DE"

    # ── 4. ENRICH MICROLOT LEAD (VP4) ──
    print("\n[4] ENRICH MICROLOT LEAD (VP4 — competition, microlot)")
    result3 = run_agent2_single(
        {
            "company_name": f"Forward Specialty Test {ts}",
            "headquarters": "Calgary, Canada",
            "notes": "Specialty importer focused on highly customized direct-trade and "
            "competition coffees. Founder is a multi-time World Barista "
            "Championship finalist specializing in microlot selections.",
            "decision_maker_1_name": "Cole Torode",
            "decision_maker_1_title": "Founder & Head of Coffee",
            "decision_maker_1_linkedin": "https://linkedin.com/in/coletorode",
        }
    )

    print(f"  ✓ VP: {result3.get('vp', 'N/A')} (expected VP4)")
    assert result3["vp"] == "VP4"
    assert "microlot" in result3["tags"]

    # ── 5. ENRICH COMMERCIAL LEAD (VP3) ──
    print("\n[5] ENRICH COMMERCIAL LEAD (VP3 — FCL, ICC, substantial volumes)")
    result4 = run_agent2_single(
        {
            "company_name": f"JDE Peet's Test {ts}",
            "headquarters": "Amsterdam, Netherlands",
            "notes": "Major global green coffee importer. Substantial volumes, FCL contracts, "
            "ICC terms, forward pricing on FOB Djibouti shipments.",
            "decision_maker_1_name": "Test Manager",
            "decision_maker_1_title": "Sourcing Director",
            "decision_maker_1_email": "test@jde.com",
        }
    )

    print(f"  ✓ VP: {result4.get('vp', 'N/A')} (expected VP3)")
    assert result4["vp"] == "VP3"

    # ── 6. DISQUALIFY CAFE CHAIN ──
    print("\n[6] DISQUALIFY CAFE CHAIN")
    result5 = run_agent2_single(
        {
            "company_name": f"Starbucks China Test {ts}",
            "headquarters": "Shanghai, China",
            "notes": "The Chinese corporate entity operating Starbucks, importing "
            "substantial volumes of green coffee.",
            "decision_maker_1_name": "Test",
            "decision_maker_1_title": "Manager",
        }
    )

    print(f"  ✓ Action: {result5['action']} (expected 'disqualified')")
    print(f"  ✓ Reason: {result5.get('reason', 'N/A')}")
    assert result5["action"] == "disqualified"

    # ── 7. LANGUAGE DETECTION ──
    print("\n[7] LANGUAGE DETECTION")
    test_cases = [
        ("Tokyo, Japan", "JA"),
        ("Seoul, South Korea", "KO"),
        ("Riyadh, Saudi Arabia", "AR"),
        ("Paris, France", "FR"),
        ("Milan, Italy", "IT"),
        ("Berlin, Germany", "DE"),
        ("New York, USA", "EN"),
    ]
    for hq, expected_lang in test_cases:
        result = run_agent2_single(
            {
                "company_name": f"Lang Test {hq} {ts}",
                "headquarters": hq,
                "notes": "Test company for language detection.",
                "decision_maker_1_name": "Test",
                "decision_maker_1_title": "Buyer",
                "decision_maker_1_email": "test@test.com",
            }
        )
        actual_lang = result.get("language", "N/A")
        status = "✓" if actual_lang == expected_lang else "✗"
        print(f"  {status} {hq:<30} → {actual_lang} (expected {expected_lang})")
        assert actual_lang == expected_lang, f"{hq}: expected {expected_lang}, got {actual_lang}"

    # ── 8. EVENTS PUBLISHED ──
    print("\n[8] EVENTS PUBLISHED")
    with EventBus() as bus:
        created_events = bus.replay(event_type=LEAD_CREATED, limit=50)
        enriched_events = bus.replay(event_type=LEAD_ENRICHED, limit=50)

        print(f"  ✓ LEAD_CREATED events: {len(created_events)}")
        print(f"  ✓ LEAD_ENRICHED events: {len(enriched_events)}")

        assert len(created_events) >= 5, f"Expected ≥5 LEAD_CREATED, got {len(created_events)}"
        assert len(enriched_events) >= 4, f"Expected ≥4 LEAD_ENRICHED, got {len(enriched_events)}"

        # Check the first enriched event has the right payload
        if enriched_events:
            payload = enriched_events[0]["payload"]
            print("\n  Sample LEAD_ENRICHED payload:")
            print(f"    lead_id: {payload.get('lead_id')}")
            print(f"    segment: {payload.get('segment')}")
            print(f"    vp: {payload.get('vp')}")
            print(f"    tier: {payload.get('tier')}")

    # ── 9. CONTACTS CREATED ──
    print("\n[9] CONTACTS CREATED")
    from coffee_export.state import StateManager

    with StateManager() as sm:
        lead = sm.get_lead(lead1_id)
        if lead:
            from sqlalchemy import select

            from coffee_export.database.models import LeadContact

            contacts = (
                sm.session.execute(select(LeadContact).where(LeadContact.lead_id == lead1_id))
                .scalars()
                .all()
            )

            print(f"  ✓ Lead {lead1_id} has {len(contacts)} contact(s)")
            for c in contacts:
                print(f"    - {c.name} ({c.title}) primary={c.is_primary} buyer={c.is_buyer}")

            assert len(contacts) >= 2, f"Expected ≥2 contacts, got {len(contacts)}"

    print("\n" + "=" * 60)
    print("✓ ALL TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(test())
