#!/usr/bin/env python3
"""
Migration script — import existing CSV/JSONL data into SQLite.

One-time import. Run once to populate the SQLite database from the
existing prototype files. Safe to re-run (idempotent on lot_id, lead_id).

Sources:
    /home/z/my-project/state/lot_inventory.csv     → lots table
    /home/z/my-project/state/lot_feedback.jsonl    → feedback table
    /home/z/my-project/state/lot_reservations.jsonl → reservations table
    /home/z/my-project/download/enriched_coffee_leads_agent3_ready.csv → leads table

Target:
    /home/z/my-project/state/coffee_export.db (SQLite)

USAGE
-----
    python migrate_to_sqlite.py                 # migrate everything
    python migrate_to_sqlite.py --lots-only     # just lots
    python migrate_to_sqlite.py --leads-only    # just leads (from enriched CSV)
    python migrate_to_sqlite.py --reset         # drop + recreate all tables first
    python migrate_to_sqlite.py --dry-run       # show what would be imported
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path

from config import BASE_DIR, DB_PATH, ensure_dirs
from state_manager import StateManager, now_addis_iso


# Source files (legacy prototype artifacts)
LEGACY_INVENTORY_CSV = BASE_DIR / "state" / "lot_inventory.csv"
LEGACY_FEEDBACK_JSONL = BASE_DIR / "state" / "lot_feedback.jsonl"
LEGACY_RESERVATIONS_JSONL = BASE_DIR / "state" / "lot_reservations.jsonl"
LEGACY_LEADS_CSV = BASE_DIR / "download" / "enriched_coffee_leads_agent3_ready.csv"


def source_row_hash(company_name: str, headquarters: str) -> str:
    """Generate a dedup hash from company + headquarters."""
    raw = f"{company_name.strip().lower()}|{headquarters.strip().lower()}"
    return hashlib.sha1(raw.encode()).hexdigest()


def migrate_lots(sm: StateManager, dry_run: bool = False) -> int:
    """Import lot_inventory.csv → lots table. Returns count imported."""
    if not LEGACY_INVENTORY_CSV.exists():
        print(f"  ⚠ {LEGACY_INVENTORY_CSV} not found — skipping lots")
        return 0

    with LEGACY_INVENTORY_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if dry_run:
        print(f"  [dry-run] Would import {len(rows)} lots")
        return len(rows)

    imported = 0
    skipped = 0
    for row in rows:
        lot_id = (row.get("lot_id") or "").strip()
        if not lot_id:
            continue
        # Skip if already exists (idempotent)
        if sm.get_lot(lot_id):
            skipped += 1
            continue

        # Coerce numeric fields
        def _int(v):
            try: return int(v) if v and v.strip() not in ("", "Not found") else None
            except (ValueError, TypeError): return None
        def _float(v):
            try: return float(v) if v and v.strip() not in ("", "Not found") else None
            except (ValueError, TypeError): return None

        lot_data = {
            "lot_id": lot_id,
            "region": (row.get("region") or "").strip(),
            "washing_station": (row.get("washing_station") or "").strip(),
            "coop_name": (row.get("coop_name") or "").strip(),
            "process": (row.get("process") or "").strip(),
            "screen_size": _int(row.get("screen_size")),
            "cupping_score": _float(row.get("cupping_score")),
            "q_grader_name": (row.get("q_grader_name") or "").strip(),
            "grading_date": (row.get("grading_date") or "").strip(),
            "defect_count_sca": _int(row.get("defect_count_sca")),
            "moisture_pct": _float(row.get("moisture_pct")),
            "water_activity": _float(row.get("water_activity")),
            "crop_year": (row.get("crop_year") or "").strip(),
            "harvest_date_range": (row.get("harvest_date_range") or "").strip(),
            "milling_date": (row.get("milling_date") or "").strip(),
            "stock_bags_remaining": _int(row.get("stock_bags_remaining")),
            "bag_size_kg": _int(row.get("bag_size_kg")) or 60,
            "certifications": (row.get("certifications") or "").strip(),
            "certificate_of_origin": (row.get("certificate_of_origin") or "").strip(),
            "eudr_data_status": (row.get("eudr_data_status") or "").strip(),
            "eudr_gps_lat": _float(row.get("eudr_gps_lat")),
            "eudr_gps_lon": _float(row.get("eudr_gps_lon")),
            "eudr_farmgate_price_etb_per_kg": _float(row.get("eudr_farmgate_price_etb_per_kg")),
            "eudr_deforestation_attestation": (row.get("eudr_deforestation_attestation") or "").strip(),
            "reserved_for_forward_program": (row.get("reserved_for_forward_program") or "No").strip(),
            "status": (row.get("status") or "active").strip(),
        }

        try:
            sm.add_lot(lot_data)
            imported += 1
        except Exception as e:
            print(f"  ⚠ Failed to import lot {lot_id}: {e}", file=sys.stderr)
            skipped += 1

    print(f"  ✓ Lots: {imported} imported, {skipped} skipped")
    return imported


def migrate_feedback(sm: StateManager, dry_run: bool = False) -> int:
    """Import lot_feedback.jsonl → feedback table. Returns count imported."""
    if not LEGACY_FEEDBACK_JSONL.exists():
        print(f"  ⚠ {LEGACY_FEEDBACK_JSONL} not found — skipping feedback")
        return 0

    with LEGACY_FEEDBACK_JSONL.open(encoding="utf-8") as f:
        entries = [json.loads(line) for line in f if line.strip()]

    if dry_run:
        print(f"  [dry-run] Would import {len(entries)} feedback entries")
        return len(entries)

    imported = 0
    for entry in entries:
        feedback_id = entry.get("feedback_id")
        if not feedback_id:
            continue
        # Check if already exists
        existing = sm._fetchone(
            "SELECT feedback_id FROM feedback WHERE feedback_id = ?",
            (feedback_id,)
        )
        if existing:
            continue

        with sm.transaction():
            sm._execute(
                """INSERT OR IGNORE INTO feedback
                (feedback_id, lot_id, buyer_company, buyer_segment,
                 rejection_reason, logged_ts, qa_auto_flagged)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (feedback_id,
                 entry.get("lot_id", ""),
                 entry.get("buyer_company", ""),
                 entry.get("buyer_segment", ""),
                 entry.get("rejection_reason", ""),
                 entry.get("logged_ts", now_addis_iso()),
                 1 if entry.get("qa_auto_flagged") else 0)
            )
        imported += 1

    print(f"  ✓ Feedback: {imported} entries imported")
    return imported


def migrate_reservations(sm: StateManager, dry_run: bool = False) -> int:
    """Import lot_reservations.jsonl → reservations table. Returns count imported."""
    if not LEGACY_RESERVATIONS_JSONL.exists():
        print(f"  ⚠ {LEGACY_RESERVATIONS_JSONL} not found — skipping reservations")
        return 0

    with LEGACY_RESERVATIONS_JSONL.open(encoding="utf-8") as f:
        entries = [json.loads(line) for line in f if line.strip()]

    if dry_run:
        print(f"  [dry-run] Would import {len(entries)} reservations")
        return len(entries)

    imported = 0
    skipped = 0
    for entry in entries:
        reservation_id = entry.get("reservation_id")
        if not reservation_id:
            continue
        existing = sm._fetchone(
            "SELECT reservation_id FROM reservations WHERE reservation_id = ?",
            (reservation_id,)
        )
        if existing:
            skipped += 1
            continue

        # Check that the foreign keys exist (legacy data may reference missing rows)
        lot_id = entry.get("lot_id", "")
        lead_id = entry.get("lead_id", "")
        if lot_id:
            lot_exists = sm._fetchone("SELECT 1 FROM lots WHERE lot_id = ?", (lot_id,))
            if not lot_exists:
                skipped += 1
                continue
        if lead_id:
            lead_exists = sm._fetchone("SELECT 1 FROM leads WHERE lead_id = ?", (lead_id,))
            if not lead_exists:
                lead_id = None  # null out the FK reference instead of skipping

        try:
            with sm.transaction():
                sm._execute(
                    """INSERT OR IGNORE INTO reservations
                    (reservation_id, lot_id, lead_id, sample_type, quantity_grams,
                     reserved_ts, reserved_until_ts, buyer_company, crop_year, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (reservation_id,
                     lot_id,
                     lead_id,
                     entry.get("sample_type", "350g"),
                     entry.get("quantity_grams", 350),
                     entry.get("reserved_ts", now_addis_iso()),
                     entry.get("reserved_until_ts", now_addis_iso()),
                     entry.get("buyer_company", ""),
                     entry.get("crop_year", "25/26"),
                     "active")
                )
            imported += 1
        except Exception as e:
            print(f"  ⚠ Failed to import reservation {reservation_id}: {e}", file=sys.stderr)
            skipped += 1

    print(f"  ✓ Reservations: {imported} imported, {skipped} skipped")
    return imported


def migrate_leads(sm: StateManager, dry_run: bool = False) -> int:
    """
    Import enriched_coffee_leads_agent3_ready.csv → leads table.
    All leads start in ENRICHED state with Agent 3 as next owner.
    Returns count imported.
    """
    if not LEGACY_LEADS_CSV.exists():
        print(f"  ⚠ {LEGACY_LEADS_CSV} not found — skipping leads")
        return 0

    with LEGACY_LEADS_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if dry_run:
        print(f"  [dry-run] Would import {len(rows)} leads")
        return len(rows)

    imported = 0
    skipped = 0
    for row in rows:
        company = (row.get("company_name") or "").strip()
        if not company:
            skipped += 1
            continue

        # Extract country from headquarters (last comma-separated part)
        hq = (row.get("headquarters") or "").strip()
        country = ""
        if hq:
            parts = [p.strip() for p in hq.split(",")]
            country = parts[-1] if parts else ""

        # Skip if already exists (by company+country)
        existing = sm.get_lead_by_company(company, country)
        if existing:
            skipped += 1
            continue

        # Extract enrichment fields
        tier = (row.get("priority_tier") or "").strip()
        if tier == "Disqualify":
            skipped += 1
            continue  # don't import disqualified leads
        if tier not in ("S", "A", "B", "C"):
            tier = None

        vp = (row.get("recommended_vp") or "").strip() or None
        lang = (row.get("outreach_language") or "EN").strip()

        # Build tags from handoff notes signals
        tags = []
        notes = (row.get("notes") or "").lower()
        if "fairtrade" in notes or "fair trade" in notes:
            tags.append("fairtrade")
        if "organic" in notes:
            tags.append("organic")
        if "microlot" in notes or "micro-lot" in notes:
            tags.append("microlot")
        if "eudr" in notes:
            tags.append("eudr-aware")

        try:
            lead_id = sm.create_lead(
                company_name=company,
                headquarters_country=country,
                source_row_hash=source_row_hash(company, hq),
                priority_tier=tier,
                recommended_vp=vp,
                outreach_language=lang,
                tags=tags,
            )
            # Transition to ENRICHED and assign to Agent 3
            sm.update_lead_state(
                lead_id=lead_id,
                new_state="ENRICHED",
                agent="Agent 2",
                notes="Imported from enriched CSV",
                next_action_agent="Agent 3",
                current_agent="Agent 3",
            )
            imported += 1
        except Exception as e:
            print(f"  ⚠ Failed to import lead '{company}': {e}", file=sys.stderr)
            skipped += 1

    print(f"  ✓ Leads: {imported} imported, {skipped} skipped")
    return imported


def reset_database(sm: StateManager) -> None:
    """Drop all tables and recreate (for --reset flag)."""
    tables = [
        "lead_tags", "state_history", "sample_waitlist", "feedback",
        "qa_flags", "reservations", "sample_budget", "leads", "lots",
    ]
    with sm.transaction():
        for table in tables:
            sm._execute(f"DROP TABLE IF EXISTS {table}")
    # Recreate schema
    sm._init_db()
    print("  ✓ Database reset (all tables dropped + recreated)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate CSV/JSONL → SQLite")
    parser.add_argument("--lots-only", action="store_true",
                        help="Only migrate lots")
    parser.add_argument("--leads-only", action="store_true",
                        help="Only migrate leads (from enriched CSV)")
    parser.add_argument("--reset", action="store_true",
                        help="Drop + recreate all tables before migrating")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be imported without writing")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"Coffee Export — Migration to SQLite")
    print(f"{'='*60}")
    print(f"Database: {DB_PATH}")
    print(f"Mode: {'dry-run' if args.dry_run else 'live'}")
    print()

    ensure_dirs()

    with StateManager() as sm:
        if args.reset and not args.dry_run:
            reset_database(sm)
            print()

        if args.lots_only:
            migrate_lots(sm, dry_run=args.dry_run)
        elif args.leads_only:
            migrate_leads(sm, dry_run=args.dry_run)
        else:
            print("Importing lots...")
            migrate_lots(sm, dry_run=args.dry_run)
            print()
            print("Importing leads...")
            migrate_leads(sm, dry_run=args.dry_run)
            print()
            print("Importing feedback...")
            migrate_feedback(sm, dry_run=args.dry_run)
            print()
            print("Importing reservations...")
            migrate_reservations(sm, dry_run=args.dry_run)

        if not args.dry_run:
            print()
            print("Post-migration KPI snapshot:")
            snapshot = sm.get_kpi_snapshot()
            print(f"  Leads:      {snapshot['leads']['total']}")
            print(f"  Lots:       {snapshot['lots']['total']}")
            print(f"  Reservations (active): {snapshot['samples']['active_reservations']}")
            print(f"  Feedback logged:       {snapshot['feedback']['total_logged']}")

    print(f"\n{'='*60}")
    print("Migration complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
