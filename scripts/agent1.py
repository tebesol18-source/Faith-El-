#!/usr/bin/env python3
"""
Agent 1 — Sourcing & Inventory Specialist (Refactored)
=======================================================

This is the production version of Agent 1, refactored to use the
StateManager as its sole data interface. The CLI is identical to the
legacy version — same subcommands, same flags, same output format —
but ALL data operations route through StateManager.

What changed vs. legacy agent1_inventory_manager.py:
  - No direct CSV writes — StateManager handles all persistence
  - No direct JSONL writes — StateManager logs to SQLite tables
  - Business rules (EUDR checks, QA auto-flag, budget caps, state
    transitions) are enforced centrally in StateManager, not duplicated
  - Atomic transactions — no more partial writes on failure
  - Concurrent-safe — multiple agents can run simultaneously
  - The script is ~60% shorter because logic moved to StateManager

CLI SUBCOMMANDS (identical to legacy)
-------------------------------------
    init          Initialize the SQLite database (creates schema).
    seed          Populate with realistic test data (11 lots across regions).
    add           Add a single lot from a JSON file or stdin.
    list          List/filter lots (by region, process, status, EUDR status).
    show          Show full detail for one lot by lot_id.
    update        Update a lot's fields (stock, status, EUDR status, etc.).
    confirm       Process a confirmation request from Agent 4.
    substitute    Find the next-best substitute lot for a rejected one.
    feedback      Log rejection feedback (auto-flags QA on pattern match).
    audit-eudr    List lots with incomplete EUDR data.
    qa-flag       Flag a lot for QA review (status → hold).
    qa-release    Release a lot from hold back to active.
    refresh       Update last_updated_ts on all lots (run daily).
    kpi           Print KPI report (inventory health, EUDR, feedback).
    reservations  List active lot reservations.

USAGE EXAMPLES
--------------
    python agent1.py seed
    python agent1.py list --region Guji --eudr complete
    python agent1.py show LOT-25-0001
    cat request.json | python agent1.py confirm > response.json
    python agent1.py feedback --lot-id LOT-25-0003 --buyer "Falcon" \\
        --segment "Specialty Importer" --reason "Musty flavor"
    python agent1.py kpi
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from state_manager import (
    StateManager,
    ALLOWED_REGIONS,
    ALLOWED_PROCESSES,
    ALLOWED_EUDR_STATUS,
    ALLOWED_LOT_STATUS,
    ValidationFailedError,
    InvalidTransitionError,
    ConcurrencyError,
)
from config import ensure_dirs


# =====================================================================
# CLI SUBCOMMAND IMPLEMENTATIONS
# =====================================================================

def cmd_init(args: argparse.Namespace) -> int:
    """Initialize the SQLite database (creates schema)."""
    ensure_dirs()
    with StateManager() as sm:
        # Schema is auto-created on __init__; just confirm it's there
        pass
    print("✓ Database initialized (schema created)")
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    """Seed the inventory with realistic test data."""
    with StateManager() as sm:
        # Check if already populated
        existing_lots = sm.list_lots()
        if existing_lots and not args.force:
            print(f"ERROR: database already has {len(existing_lots)} lots. "
                  f"Use --force to add seed data anyway.", file=sys.stderr)
            return 1

        seed_lots = _build_seed_data()
        added = 0
        for lot_data in seed_lots:
            try:
                lot_id = sm.add_lot(lot_data)
                added += 1
            except ValidationFailedError as e:
                print(f"  ⚠ Skipped: {e}", file=sys.stderr)

        print(f"✓ Seeded {added} lots to database")
        print(f"  Regions: Yirgacheffe, Guji, Sidamo, Limu, Jimma, Harrar")
        eudr_complete = sum(1 for l in seed_lots if l["eudr_data_status"] == "complete")
        eudr_partial = sum(1 for l in seed_lots if l["eudr_data_status"] == "partial")
        eudr_missing = sum(1 for l in seed_lots if l["eudr_data_status"] == "missing")
        print(f"  EUDR complete: {eudr_complete}")
        print(f"  EUDR partial:  {eudr_partial}")
        print(f"  EUDR missing:  {eudr_missing}")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    """Add a single lot from a JSON file or stdin."""
    if args.input_file:
        with Path(args.input_file).open(encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.loads(sys.stdin.read())

    with StateManager() as sm:
        try:
            lot_id = sm.add_lot(data)
            lot = sm.get_lot(lot_id)
            print(f"✓ Added lot: {lot_id} ({lot['region']} {lot['process']} "
                  f"score {lot['cupping_score']})")
        except ValidationFailedError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    """List lots with optional filters."""
    with StateManager() as sm:
        lots = sm.list_lots(
            region=args.region,
            process=args.process,
            status=args.status,
            eudr=args.eudr,
            crop_year=args.crop_year,
            min_score=args.min_score,
        )

    if not lots:
        print("No lots match the specified filters.")
        return 0

    print(f"{'Lot ID':<15} {'Region':<13} {'Process':<10} {'Scr':>4} "
          f"{'Score':>6} {'Stock':>6} {'EUDR':<10} {'Status':<10}")
    print("-" * 80)
    for r in lots:
        print(f"{r.get('lot_id',''):<15} {r.get('region',''):<13} "
              f"{r.get('process',''):<10} {r.get('screen_size','') or '':>4} "
              f"{r.get('cupping_score','') or '':>6} "
              f"{r.get('stock_bags_remaining','') or '':>6} "
              f"{r.get('eudr_data_status',''):<10} {r.get('status',''):<10}")
    print(f"\n{len(lots)} lot(s) listed.")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    """Show full detail for one lot + active reservations."""
    with StateManager() as sm:
        lot = sm.get_lot(args.lot_id)
        if not lot:
            print(f"ERROR: lot_id {args.lot_id} not found.", file=sys.stderr)
            return 1

        # Print all lot fields
        for col in sorted(lot.keys()):
            print(f"  {col:<35} = {lot[col]}")

        # Show active reservations
        reservations = sm.get_active_reservations(lot_id=args.lot_id)
        if reservations:
            print(f"\n  Active reservations ({len(reservations)}):")
            for res in reservations:
                print(f"    - {res['reservation_id']}: "
                      f"lead={res['lead_id']} "
                      f"type={res['sample_type']} "
                      f"until={res['reserved_until_ts']}")
    return 0


def _parse_updates(updates_list: list[str]) -> dict:
    """Parse a list of 'FIELD=VALUE' strings into a dict."""
    result = {}
    for item in updates_list:
        if "=" not in item:
            raise ValueError(f"Invalid update format: {item} (expected FIELD=VALUE)")
        field, value = item.split("=", 1)
        result[field.strip()] = value.strip()
    return result


def cmd_update(args: argparse.Namespace) -> int:
    """Update one or more fields on a lot."""
    with StateManager() as sm:
        try:
            # Coerce numeric fields
            updates = dict(args.updates)
            for int_field in ("screen_size", "defect_count_sca",
                              "stock_bags_remaining", "bag_size_kg"):
                if int_field in updates and updates[int_field]:
                    try:
                        updates[int_field] = int(updates[int_field])
                    except ValueError:
                        print(f"ERROR: {int_field} must be an integer", file=sys.stderr)
                        return 1
            for float_field in ("cupping_score", "moisture_pct", "water_activity",
                                "eudr_gps_lat", "eudr_gps_lon",
                                "eudr_farmgate_price_etb_per_kg"):
                if float_field in updates and updates[float_field]:
                    try:
                        updates[float_field] = float(updates[float_field])
                    except ValueError:
                        print(f"ERROR: {float_field} must be a number", file=sys.stderr)
                        return 1

            sm.update_lot(args.lot_id, **updates)
            print(f"✓ Updated {args.lot_id}: {dict(updates)}")
        except ValidationFailedError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
    return 0


def cmd_confirm(args: argparse.Namespace) -> int:
    """Process a confirmation request from Agent 4."""
    if args.request:
        with Path(args.request).open(encoding="utf-8") as f:
            request = json.load(f)
    else:
        request = json.loads(sys.stdin.read())

    required = ["lead_id", "buyer_company", "sample_type", "crop_year", "lot_ids"]
    missing = [f for f in required if not request.get(f)]
    if missing:
        print(f"ERROR: missing required fields: {missing}", file=sys.stderr)
        return 1

    with StateManager() as sm:
        results = []
        for lot_id in request["lot_ids"]:
            result = sm.confirm_lot_for_sample(
                lot_id=lot_id,
                lead_id=request["lead_id"],
                sample_type=request["sample_type"],
                buyer_company=request["buyer_company"],
                destination_country=request.get("buyer_destination_country", ""),
                crop_year=request["crop_year"],
            )
            results.append(result)

        response = {
            "lead_id": request["lead_id"],
            "confirmed_at": sm.get_kpi_snapshot()["generated_ts"],  # current ts
            "results": results,
        }

    response_json = json.dumps(response, indent=2, ensure_ascii=False)
    if args.response:
        Path(args.response).write_text(response_json, encoding="utf-8")
        print(f"✓ Confirmation response written to {args.response}", file=sys.stderr)
    else:
        print(response_json)

    confirmed = sum(1 for r in response["results"] if r["confirmed"])
    total = len(response["results"])
    print(f"  {confirmed}/{total} lots confirmed.", file=sys.stderr)
    return 0


def cmd_substitute(args: argparse.Namespace) -> int:
    """Find a substitute lot for a given lot_id."""
    with StateManager() as sm:
        target_lot = sm.get_lot(args.lot_id)
        if not target_lot:
            print(f"ERROR: lot_id {args.lot_id} not found.", file=sys.stderr)
            return 1

        sub = sm.find_substitute(
            excluded_lot_id=args.lot_id,
            region=target_lot.get("region"),
            process=target_lot.get("process"),
            target_score=target_lot.get("cupping_score"),
            crop_year=target_lot.get("crop_year", "25/26"),
            eudr_required=args.eudr_required,
        )

    if not sub:
        print(f"No substitute found for {args.lot_id}.")
        return 0
    print(json.dumps(sub, indent=2, ensure_ascii=False))
    return 0


def cmd_feedback(args: argparse.Namespace) -> int:
    """Log rejection feedback (auto-flags QA on ≥2 critical-keyword matches)."""
    with StateManager() as sm:
        result = sm.log_feedback(
            lot_id=args.lot_id,
            buyer_company=args.buyer,
            buyer_segment=args.segment or "",
            rejection_reason=args.reason,
        )

    print(f"✓ Logged feedback: {result['feedback_id']}")
    if result.get("qa_auto_flagged"):
        print(f"  ⚠️  Auto-flagged lot {args.lot_id} for QA review "
              f"(≥2 rejections with critical keyword match).")
    return 0


def cmd_audit_eudr(args: argparse.Namespace) -> int:
    """List lots with incomplete EUDR data."""
    with StateManager() as sm:
        incomplete = [l for l in sm.list_lots(status="active")
                      if (l.get("eudr_data_status") or "") != "complete"]

    if not incomplete:
        print("✓ All active lots have complete EUDR data.")
        return 0

    print(f"{'Lot ID':<15} {'Region':<13} {'Status':<10} {'EUDR':<10} "
          f"{'Missing Fields'}")
    print("-" * 90)
    for r in incomplete:
        missing_fields = []
        if not r.get("eudr_gps_lat"):
            missing_fields.append("gps")
        if not r.get("eudr_farmgate_price_etb_per_kg"):
            missing_fields.append("farmgate_price")
        if not r.get("eudr_deforestation_attestation"):
            missing_fields.append("attestation")
        print(f"{r.get('lot_id',''):<15} {r.get('region',''):<13} "
              f"{r.get('status',''):<10} {r.get('eudr_data_status',''):<10} "
              f"{', '.join(missing_fields)}")
    print(f"\n{len(incomplete)} lot(s) need EUDR completion. "
          f"Target: 100% completeness within 30 days.")
    return 0


def cmd_qa_flag(args: argparse.Namespace) -> int:
    """Flag a lot for QA review (status → hold)."""
    with StateManager() as sm:
        try:
            sm.flag_lot_for_qa(args.lot_id, reason=args.reason or "Manual QA flag")
            print(f"✓ Lot {args.lot_id} flagged for QA review (status → hold).")
        except ValidationFailedError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
    return 0


def cmd_qa_release(args: argparse.Namespace) -> int:
    """Release a lot from hold → active."""
    with StateManager() as sm:
        try:
            released = sm.release_lot_from_qa(args.lot_id)
            if released:
                print(f"✓ Lot {args.lot_id} released from hold → active.")
            else:
                print(f"Lot {args.lot_id} is not on hold.")
        except ValidationFailedError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
    return 0


def cmd_refresh(args: argparse.Namespace) -> int:
    """Update last_updated_ts on all lots."""
    with StateManager() as sm:
        lots = sm.list_lots()
        if not lots:
            print("Inventory is empty.")
            return 0
        # Bulk refresh — update last_updated_ts on all lots
        for lot in lots:
            sm.update_lot(lot["lot_id"], status=lot["status"])  # triggers ts update
        print(f"✓ Refreshed last_updated_ts on {len(lots)} lot(s).")
    return 0


def cmd_kpi(args: argparse.Namespace) -> int:
    """Print KPI report."""
    with StateManager() as sm:
        snap = sm.get_kpi_snapshot()
        waitlist = sm.get_waitlist(fulfilled=False)
        reservations = sm.get_active_reservations()

    print()
    print("=" * 60)
    print("Agent 1 — Inventory KPI Report")
    print("=" * 60)
    print(f"Generated: {snap['generated_ts']}")
    print()
    print(f"Total lots:                {snap['lots']['total']}")
    for status in ("active", "committed", "hold", "depleted"):
        n = snap["lots"]["by_status"].get(status, 0)
        if n:
            print(f"  {status:12s}              {n}")
    print()
    print(f"Total stock:                {snap['lots']['total_stock_bags']} bags")
    print()
    print("EUDR completeness (active lots):")
    eudr = snap["lots"]["eudr_completeness"]
    total_active = sum(eudr.values())
    if total_active > 0:
        for status in ("complete", "partial", "missing"):
            n = eudr.get(status, 0)
            pct = (n / total_active) * 100
            print(f"  {status:<12} {n:3d} ({pct:.0f}%)")
    print()
    print("Regional distribution (active lots):")
    for region, n in snap["lots"]["regional_distribution"].items():
        print(f"  {region:<15} {n}")
    print()
    print(f"Active reservations:        {len(reservations)}")
    print()
    print(f"Rejection feedback logged:  {snap['feedback']['total_logged']}")
    multi = snap["feedback"]["multi_rejection_lots"]
    if multi:
        print(f"  Lots with ≥2 rejections:  {len(multi)}")
        print(f"  ⚠️  Review these lots for QA:")
        for lot in multi:
            print(f"    - {lot['lot_id']}: {lot['n']} rejections")
    if waitlist:
        print()
        print(f"Sample waitlist:            {len(waitlist)} lead(s) waiting")
    print("=" * 60)
    return 0


def cmd_reservations(args: argparse.Namespace) -> int:
    """List active lot reservations."""
    with StateManager() as sm:
        reservations = sm.get_active_reservations()

    if not reservations:
        print("No active reservations.")
        return 0
    print(f"{'Reservation ID':<45} {'Lot ID':<15} {'Lead ID':<18} "
          f"{'Type':<6} {'Buyer':<25} {'Until'}")
    print("-" * 130)
    for res in reservations:
        print(f"{res.get('reservation_id',''):<45} {res.get('lot_id',''):<15} "
              f"{res.get('lead_id','') or '':<18} {res.get('sample_type',''):<6} "
              f"{res.get('buyer_company',''):<25} {res.get('reserved_until_ts','')}")
    print(f"\n{len(reservations)} active reservation(s).")
    return 0


# =====================================================================
# SEED DATA
# =====================================================================

def _build_seed_data() -> list[dict]:
    """Build the seed lot data (11 lots across 6 regions)."""
    return [
        {"lot_id": "LOT-25-0001", "region": "Yirgacheffe",
         "washing_station": "Konga Washing Station", "coop_name": "Yirgacheffe Union",
         "process": "Washed", "screen_size": 14, "cupping_score": 87.5,
         "q_grader_name": "Amanuel Tesfaye", "grading_date": "2026-03-15",
         "defect_count_sca": 8, "moisture_pct": 11.2, "water_activity": 0.45,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-02-20", "stock_bags_remaining": 45, "bag_size_kg": 60,
         "certifications": "organic", "certificate_of_origin": "ECTA-2026-0142",
         "eudr_data_status": "complete", "eudr_gps_lat": 6.1627, "eudr_gps_lon": 38.1964,
         "eudr_farmgate_price_etb_per_kg": 28.50,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0002", "region": "Yirgacheffe",
         "washing_station": "Idido Washing Station", "coop_name": "Yirgacheffe Union",
         "process": "Natural", "screen_size": 14, "cupping_score": 88.2,
         "q_grader_name": "Amanuel Tesfaye", "grading_date": "2026-03-16",
         "defect_count_sca": 6, "moisture_pct": 10.8, "water_activity": 0.42,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-02-22", "stock_bags_remaining": 30, "bag_size_kg": 60,
         "certifications": "", "certificate_of_origin": "ECTA-2026-0143",
         "eudr_data_status": "complete", "eudr_gps_lat": 6.1750, "eudr_gps_lon": 38.2100,
         "eudr_farmgate_price_etb_per_kg": 29.00,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0003", "region": "Guji",
         "washing_station": "Hambela Washing Station", "coop_name": "Hambela Co-op",
         "process": "Washed", "screen_size": 15, "cupping_score": 86.8,
         "q_grader_name": "Sara Bekele", "grading_date": "2026-03-18",
         "defect_count_sca": 10, "moisture_pct": 11.5, "water_activity": 0.48,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-02-25", "stock_bags_remaining": 60, "bag_size_kg": 60,
         "certifications": "organic;FT", "certificate_of_origin": "ECTA-2026-0144",
         "eudr_data_status": "complete", "eudr_gps_lat": 5.9847, "eudr_gps_lon": 38.2856,
         "eudr_farmgate_price_etb_per_kg": 27.50,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0004", "region": "Guji",
         "washing_station": "Uraga Washing Station", "coop_name": "Uraga Co-op",
         "process": "Natural", "screen_size": 14, "cupping_score": 88.0,
         "q_grader_name": "Sara Bekele", "grading_date": "2026-03-19",
         "defect_count_sca": 5, "moisture_pct": 10.5, "water_activity": 0.40,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Feb 2026",
         "milling_date": "2026-02-28", "stock_bags_remaining": 25, "bag_size_kg": 60,
         "certifications": "", "certificate_of_origin": "ECTA-2026-0145",
         "eudr_data_status": "partial", "eudr_gps_lat": 5.9500, "eudr_gps_lon": 38.3000,
         "eudr_farmgate_price_etb_per_kg": 0,
         "eudr_deforestation_attestation": "",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0005", "region": "Guji",
         "washing_station": "Shakiso Washing Station", "coop_name": "Shakiso Co-op",
         "process": "Washed", "screen_size": 14, "cupping_score": 85.5,
         "q_grader_name": "Sara Bekele", "grading_date": "2026-03-20",
         "defect_count_sca": 12, "moisture_pct": 11.0, "water_activity": 0.44,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-03-01", "stock_bags_remaining": 50, "bag_size_kg": 60,
         "certifications": "", "certificate_of_origin": "ECTA-2026-0146",
         "eudr_data_status": "complete", "eudr_gps_lat": 5.9200, "eudr_gps_lon": 38.2500,
         "eudr_farmgate_price_etb_per_kg": 26.80,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0006", "region": "Sidamo",
         "washing_station": "Bensa Washing Station", "coop_name": "Bensa Co-op",
         "process": "Washed", "screen_size": 14, "cupping_score": 84.5,
         "q_grader_name": "Dawit Haile", "grading_date": "2026-03-22",
         "defect_count_sca": 14, "moisture_pct": 11.3, "water_activity": 0.46,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-03-02", "stock_bags_remaining": 80, "bag_size_kg": 60,
         "certifications": "", "certificate_of_origin": "ECTA-2026-0147",
         "eudr_data_status": "complete", "eudr_gps_lat": 6.3500, "eudr_gps_lon": 38.4500,
         "eudr_farmgate_price_etb_per_kg": 24.00,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0007", "region": "Sidamo",
         "washing_station": "Bensa Washing Station", "coop_name": "Bensa Co-op",
         "process": "Natural", "screen_size": 14, "cupping_score": 85.0,
         "q_grader_name": "Dawit Haile", "grading_date": "2026-03-23",
         "defect_count_sca": 9, "moisture_pct": 10.9, "water_activity": 0.43,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-03-03", "stock_bags_remaining": 70, "bag_size_kg": 60,
         "certifications": "FT", "certificate_of_origin": "ECTA-2026-0148",
         "eudr_data_status": "complete", "eudr_gps_lat": 6.3510, "eudr_gps_lon": 38.4510,
         "eudr_farmgate_price_etb_per_kg": 25.00,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0008", "region": "Limu",
         "washing_station": "Limu Kosa Washing Station", "coop_name": "Limu Inara Co-op",
         "process": "Washed", "screen_size": 15, "cupping_score": 83.0,
         "q_grader_name": "Marta Tadesse", "grading_date": "2026-03-25",
         "defect_count_sca": 15, "moisture_pct": 11.4, "water_activity": 0.47,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-03-05", "stock_bags_remaining": 100, "bag_size_kg": 60,
         "certifications": "", "certificate_of_origin": "ECTA-2026-0149",
         "eudr_data_status": "missing", "eudr_gps_lat": 0, "eudr_gps_lon": 0,
         "eudr_farmgate_price_etb_per_kg": 0,
         "eudr_deforestation_attestation": "",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0009", "region": "Jimma",
         "washing_station": "Babo Washing Station", "coop_name": "Babo Co-op",
         "process": "Natural", "screen_size": 13, "cupping_score": 82.5,
         "q_grader_name": "Marta Tadesse", "grading_date": "2026-03-26",
         "defect_count_sca": 18, "moisture_pct": 11.6, "water_activity": 0.50,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-03-06", "stock_bags_remaining": 40, "bag_size_kg": 60,
         "certifications": "organic", "certificate_of_origin": "ECTA-2026-0150",
         "eudr_data_status": "complete", "eudr_gps_lat": 7.6750, "eudr_gps_lon": 36.8330,
         "eudr_farmgate_price_etb_per_kg": 22.00,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
        {"lot_id": "LOT-25-0010", "region": "Yirgacheffe",
         "washing_station": "Konga Washing Station", "coop_name": "Yirgacheffe Union",
         "process": "Washed", "screen_size": 14, "cupping_score": 87.0,
         "q_grader_name": "Amanuel Tesfaye", "grading_date": "2026-03-15",
         "defect_count_sca": 7, "moisture_pct": 11.1, "water_activity": 0.44,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-02-20", "stock_bags_remaining": 15, "bag_size_kg": 60,
         "certifications": "organic", "certificate_of_origin": "ECTA-2026-0142",
         "eudr_data_status": "complete", "eudr_gps_lat": 6.1627, "eudr_gps_lon": 38.1964,
         "eudr_farmgate_price_etb_per_kg": 28.50,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "Yes", "status": "active"},
        {"lot_id": "LOT-25-0011", "region": "Harrar",
         "washing_station": "Harrar Longberry Station", "coop_name": "Harrar Co-op",
         "process": "Natural", "screen_size": 13, "cupping_score": 84.0,
         "q_grader_name": "Dawit Haile", "grading_date": "2026-03-28",
         "defect_count_sca": 12, "moisture_pct": 11.0, "water_activity": 0.43,
         "crop_year": "25/26", "harvest_date_range": "Nov 2025 - Jan 2026",
         "milling_date": "2026-03-10", "stock_bags_remaining": 35, "bag_size_kg": 60,
         "certifications": "", "certificate_of_origin": "ECTA-2026-0151",
         "eudr_data_status": "complete", "eudr_gps_lat": 9.3107, "eudr_gps_lon": 42.1400,
         "eudr_farmgate_price_etb_per_kg": 23.50,
         "eudr_deforestation_attestation": "signed",
         "reserved_for_forward_program": "No", "status": "active"},
    ]


# =====================================================================
# ARGUMENT PARSER — identical interface to legacy version
# =====================================================================

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Agent 1 — Sourcing & Inventory Specialist (StateManager-backed)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="command", required=True,
                                        help="Subcommand to run")

    p = subparsers.add_parser("init", help="Initialize the database (create schema)")
    p.set_defaults(func=cmd_init)

    p = subparsers.add_parser("seed", help="Seed inventory with test data")
    p.add_argument("--force", action="store_true",
                   help="Add seed data even if inventory is not empty")
    p.set_defaults(func=cmd_seed)

    p = subparsers.add_parser("add", help="Add a single lot from JSON")
    p.add_argument("--input-file", "-f", type=Path,
                   help="JSON file with lot data (default: stdin)")
    p.set_defaults(func=cmd_add)

    p = subparsers.add_parser("list", help="List lots with filters")
    p.add_argument("--region", choices=sorted(ALLOWED_REGIONS))
    p.add_argument("--process", choices=sorted(ALLOWED_PROCESSES))
    p.add_argument("--status", choices=sorted(ALLOWED_LOT_STATUS))
    p.add_argument("--eudr", choices=sorted(ALLOWED_EUDR_STATUS))
    p.add_argument("--crop-year", help="e.g. 25/26")
    p.add_argument("--min-score", type=float, help="Minimum cupping score")
    p.set_defaults(func=cmd_list)

    p = subparsers.add_parser("show", help="Show full detail for one lot")
    p.add_argument("lot_id", help="Lot ID (e.g. LOT-25-0001)")
    p.set_defaults(func=cmd_show)

    p = subparsers.add_parser("update", help="Update fields on a lot")
    p.add_argument("lot_id", help="Lot ID to update")
    p.add_argument("updates", nargs="+", metavar="FIELD=VALUE",
                   help="Field=value pairs to update")
    p.set_defaults(func=cmd_update)

    p = subparsers.add_parser("confirm",
                              help="Process confirmation request from Agent 4")
    p.add_argument("--request", "-r", type=Path,
                   help="JSON file with request (default: stdin)")
    p.add_argument("--response", "-o", type=Path,
                   help="Write response JSON to this file (default: stdout)")
    p.set_defaults(func=cmd_confirm)

    p = subparsers.add_parser("substitute",
                              help="Find a substitute lot")
    p.add_argument("lot_id", help="Lot ID to find a substitute for")
    p.add_argument("--eudr-required", action="store_true",
                   help="Only suggest substitutes with complete EUDR data")
    p.set_defaults(func=cmd_substitute)

    p = subparsers.add_parser("feedback",
                              help="Log rejection feedback from Agent 4")
    p.add_argument("--lot-id", required=True)
    p.add_argument("--buyer", required=True, help="Buyer company name")
    p.add_argument("--segment", help="Buyer segment")
    p.add_argument("--reason", required=True, help="Rejection reason (verbatim)")
    p.set_defaults(func=cmd_feedback)

    p = subparsers.add_parser("audit-eudr",
                              help="List lots with incomplete EUDR data")
    p.set_defaults(func=cmd_audit_eudr)

    p = subparsers.add_parser("qa-flag",
                              help="Flag a lot for QA review (status → hold)")
    p.add_argument("lot_id")
    p.add_argument("--reason", help="Reason for QA flag")
    p.set_defaults(func=cmd_qa_flag)

    p = subparsers.add_parser("qa-release",
                              help="Release a lot from hold → active")
    p.add_argument("lot_id")
    p.set_defaults(func=cmd_qa_release)

    p = subparsers.add_parser("refresh",
                              help="Update last_updated_ts on all lots")
    p.set_defaults(func=cmd_refresh)

    p = subparsers.add_parser("kpi", help="Print KPI report")
    p.set_defaults(func=cmd_kpi)

    p = subparsers.add_parser("reservations",
                              help="List active lot reservations")
    p.set_defaults(func=cmd_reservations)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if hasattr(args, "updates") and isinstance(args.updates, list):
        args.updates = _parse_updates(args.updates)

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
