#!/usr/bin/env python3
"""Development/test seeding — create a fully-signed contract through the
REAL Agent 5 path (the production source of CONTRACT_SIGNED).

This drives the same code the production runtime uses: a lead is walked to
DECIDED_APPROVED, a SAMPLE_APPROVED event is published on the org-scoped
bus, Agent 5 drafts the contract, every compliance document is approved,
and Agent 5's sign_contract() signs it — publishing CONTRACT_SIGNED on the
shared event bus exactly as production does.

Intended for local development and the JS integration tests
(tests/integration/agent-runtime.test.ts) against a THROWAWAY database.
Never run it against a production database: it creates business records.

Usage:
    python coffee_export/scripts/dev_seed_contract.py [--organization org-system] [--country Germany]
    python coffee_export/scripts/dev_seed_contract.py --no-process   # leave SAMPLE_APPROVED pending

Output: single JSON line on stdout:
    {"ok": true, "contract_id": "CT-2026-0001", "lead_id": "L-2026-00001", "lot_id": "LOT-..."}
    {"ok": false, "error": "..."}

Environment:
    COFFEE_DATABASE_URL — canonical shared DB URL (same as the whole stack).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent5_compliance import Agent5
from coffee_export.database.base import now_addis_iso
from coffee_export.database.models import Coop, WashingStation
from coffee_export.events import SAMPLE_APPROVED, EventBus
from coffee_export.state import StateManager


def seed(organization_id: str, country: str, no_process: bool = False) -> dict:
    ts = str(int(time.time() * 1000))[-6:]
    now = now_addis_iso()

    with StateManager(organization_id=organization_id) as sm:
        # ── Lot with complete EUDR data + organic cert (EU destination) ──
        coop_id = f"COOP-SEED-{ts}"
        station_id = f"ST-SEED-{ts}"
        sm.session.add(Coop(
            coop_id=coop_id, name="Yirgacheffe Union", region="Yirgacheffe",
            created_ts=now, updated_ts=now,
        ))
        sm.session.add(WashingStation(
            station_id=station_id, coop_id=coop_id, name="Konga Station",
            region="Yirgacheffe", gps_lat=6.16, gps_lon=38.19,
            created_ts=now, updated_ts=now,
        ))
        sm._commit()
        lot_id = sm.add_lot({
            "lot_id": f"LOT-SEED-{ts}-001",
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
        })

        # ── Lead walked to DECIDED_APPROVED (ready for Agent 5) ──
        lead_id = sm.create_lead(
            company_name=f"Seed Buyer {ts}",
            headquarters_country=country,
            priority_tier="A",
            recommended_vp="VP1",
            outreach_language="EN",
        )
        for state, agent in [
            ("ENRICHED", "Agent 2"),
            ("IN_SEQUENCE", "Agent 3"),
            ("QUALIFIED", "Agent 3"),
            ("SAMPLE_DISPATCHED", "Agent 4"),
            ("SAMPLE_FEEDBACK_DUE", "Agent 4"),
            ("DECIDED_APPROVED", "Agent 4"),
        ]:
            sm.update_lead_state(lead_id, state, agent=agent, current_agent="Agent 5")

    # ── SAMPLE_APPROVED → Agent 5 drafts the contract (real path) ──
    sample_request_id = f"SR-SEED-{ts}"
    with EventBus(organization_id=organization_id) as bus:
        bus.publish(
            event_type=SAMPLE_APPROVED,
            entity_type="sample_request",
            entity_id=sample_request_id,
            payload={
                "sample_request_id": sample_request_id,
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

    if no_process:
        # Leave the SAMPLE_APPROVED event PENDING — the supervisor runtime
        # (Phase F: SAMPLE_APPROVED is routed to Agent 5) is what must pick
        # it up. Used by tests/integration to prove the runtime path.
        return {
            "ok": True,
            "lead_id": lead_id,
            "lot_id": lot_id,
            "sample_request_id": sample_request_id,
        }

    with Agent5(organization_id=organization_id) as agent:
        events = agent.get_leads_to_process()
        if not events:
            return {"ok": False, "error": "Agent 5 found no SAMPLE_APPROVED event"}
        result = agent.process_lead(events[0])
        contract_id = result.get("contract_id", "")
        if not contract_id:
            return {"ok": False, "error": f"Agent 5 did not create a contract: {result}"}

        # ── Approve every compliance document, then SIGN (real path) ──
        docs = agent.sm.get_compliance_documents(contract_id)
        for doc in docs:
            agent.approve_document(doc["id"])

        signed = agent.sign_contract(contract_id)
        if signed.get("action") != "contract_signed":
            return {"ok": False, "error": f"sign_contract failed: {signed}"}

    return {
        "ok": True,
        "contract_id": contract_id,
        "lead_id": lead_id,
        "lot_id": lot_id,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed a signed contract via the real Agent 5 path")
    parser.add_argument("--organization", default="org-system")
    parser.add_argument("--country", default="Germany")
    parser.add_argument(
        "--no-process",
        action="store_true",
        help="Publish SAMPLE_APPROVED but do NOT run Agent 5 inline — leaves the event pending for the supervisor runtime.",
    )
    args = parser.parse_args()
    try:
        print(json.dumps(seed(args.organization, args.country, no_process=args.no_process)))
        return 0
    except Exception as e:  # noqa: BLE001 — the JSON contract must hold on failure too
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
