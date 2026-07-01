#!/usr/bin/env python3
"""
Agent 1 — Sourcing & Inventory Specialist (Ethiopian Coffee Export)
=====================================================================

Production Python implementation of the Agent 1 prompt. Owns the lot
inventory CSV, responds to Agent 4's confirmation requests, maintains
EUDR data pack status, and logs rejection feedback for QA review.

CLI SUBCOMMANDS
---------------
    init          Create empty lot_inventory.csv with the canonical schema.
    seed          Populate with realistic test data (10 lots across regions).
    add           Add a single lot from a JSON file or stdin.
    list          List/filter lots (by region, process, status, EUDR status).
    show          Show full detail for one lot by lot_id.
    update        Update a lot's fields (stock, status, EUDR status, etc.).
    confirm       Process a confirmation request from Agent 4.
    substitute    Find the next-best substitute lot for a rejected one.
    feedback      Log rejection feedback from Agent 4 (writes to
                  lot_feedback.jsonl).
    audit-eudr    List lots with incomplete EUDR data.
    qa-flag       Flag a lot for QA review (status → hold).
    qa-release    Release a lot from hold back to active.
    refresh       Update last_updated_ts on all lots (run daily).
    kpi           Print KPI report (inventory health, EUDR completeness,
                  feedback patterns, stock accuracy).
    reservations  List active lot reservations (lots held for samples).

USAGE EXAMPLES
--------------
    # Initialize the inventory
    python agent1_inventory_manager.py init

    # Seed with test data
    python agent1_inventory_manager.py seed

    # List all active Guji lots with complete EUDR data
    python agent1_inventory_manager.py list --region Guji --status active --eudr complete

    # Process a confirmation request from Agent 4 (stdin → stdout)
    cat request.json | python agent1_inventory_manager.py confirm > response.json

    # Or with file arguments
    python agent1_inventory_manager.py confirm \\
        --request request.json --response response.json

    # Find a substitute for a rejected lot
    python agent1_inventory_manager.py substitute LOT-25-0001

    # Log rejection feedback
    python agent1_inventory_manager.py feedback \\
        --lot-id LOT-25-0001 \\
        --buyer "Falcon Coffees" \\
        --segment "Specialty Importer" \\
        --reason "Musty flavor notes, defect count higher than expected"

    # Audit EUDR gaps
    python agent1_inventory_manager.py audit-eudr

    # Print KPI report
    python agent1_inventory_manager.py kpi

FILE PATHS
----------
    /home/z/my-project/state/lot_inventory.csv     — canonical lot inventory
    /home/z/my-project/state/lot_feedback.jsonl    — rejection feedback log
    /home/z/my-project/state/lot_reservations.jsonl — sample reservations
    /home/z/my-project/state/docs/                 — document attachments
        eudr/         — EUDR data packs (PDF)
        cupping/      — SCA cupping score sheets (PDF)
        green_analysis/ — screen/defect/moisture analysis (PDF)
        origin/       — certificates of origin (PDF)
        certs/        — organic/FT/RA/4C certificates (PDF)

REQUIREMENTS
------------
    Python 3.8+ (standard library only)
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional


# =====================================================================
# CONSTANTS — paths, schemas, allowed values
# =====================================================================

STATE_DIR = Path("/home/z/my-project/state")
INVENTORY_CSV = STATE_DIR / "lot_inventory.csv"
FEEDBACK_JSONL = STATE_DIR / "lot_feedback.jsonl"
RESERVATIONS_JSONL = STATE_DIR / "lot_reservations.jsonl"
DOCS_DIR = STATE_DIR / "docs"

# Addis Ababa timezone (UTC+3, no DST)
ADDIS_TZ = timezone(timedelta(hours=3))

# Canonical lot inventory schema — 27 columns, exact order
LOT_COLUMNS: tuple[str, ...] = (
    "lot_id",
    "region",
    "washing_station",
    "coop_name",
    "process",
    "screen_size",
    "cupping_score",
    "q_grader_name",
    "grading_date",
    "defect_count_sca",
    "moisture_pct",
    "water_activity",
    "crop_year",
    "harvest_date_range",
    "milling_date",
    "stock_bags_remaining",
    "bag_size_kg",
    "certifications",
    "certificate_of_origin",
    "eudr_data_status",
    "eudr_gps_lat",
    "eudr_gps_lon",
    "eudr_farmgate_price_etb_per_kg",
    "eudr_deforestation_attestation",
    "reserved_for_forward_program",
    "status",
    "last_updated_ts",
)

# Allowed values for enum-like fields
ALLOWED_REGIONS = frozenset({
    "Yirgacheffe", "Sidamo", "Guji", "Limu", "Jimma",
    "Harrar", "other",
})

ALLOWED_PROCESSES = frozenset({
    "Washed", "Natural", "Honey", "Anaerobic",
})

ALLOWED_EUDR_STATUS = frozenset({"complete", "partial", "missing"})

ALLOWED_LOT_STATUS = frozenset({
    "active", "committed", "depleted", "hold",
})

# Sample types and their quantities in grams
SAMPLE_QUANTITIES_GRAMS = {
    "350g": 350,   # Type A — pre-shipment
    "200g": 200,   # Type B — forward-program representative
    "500g": 500,   # Type C — shipment sample (post-contract)
    "150g": 150,   # Fallback 150g (partial QUAL)
}

# Default bag size
DEFAULT_BAG_SIZE_KG = 60

# EU countries (for EUDR requirement check)
EU_COUNTRIES = frozenset({
    "Germany", "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Denmark", "Estonia", "Finland", "France",
    "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania",
    "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal",
    "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
    "United Kingdom",
    "Norway", "Switzerland", "Iceland", "Liechtenstein",
})


# =====================================================================
# HELPERS — time, I/O, validation
# =====================================================================

def now_addis() -> datetime:
    """Current timestamp in Addis Ababa timezone."""
    return datetime.now(ADDIS_TZ)


def now_addis_iso() -> str:
    """Current timestamp as ISO 8601 string with +03:00 offset."""
    return now_addis().isoformat(timespec="seconds")


def parse_iso(ts: str) -> Optional[datetime]:
    """Parse an ISO 8601 timestamp; return None on failure."""
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def ensure_state_dirs() -> None:
    """Create state directories if they don't exist."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    for sub in ("eudr", "cupping", "green_analysis", "origin", "certs"):
        (DOCS_DIR / sub).mkdir(parents=True, exist_ok=True)


def read_inventory() -> list[dict]:
    """Read the full lot inventory CSV. Returns [] if file doesn't exist."""
    if not INVENTORY_CSV.exists():
        return []
    with INVENTORY_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [dict(row) for row in reader]


def write_inventory(rows: list[dict]) -> None:
    """Write the full lot inventory CSV (atomic write via temp + rename)."""
    ensure_state_dirs()
    tmp = INVENTORY_CSV.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(LOT_COLUMNS),
                                extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            out = {col: row.get(col, "") for col in LOT_COLUMNS}
            writer.writerow(out)
    tmp.rename(INVENTORY_CSV)


def append_jsonl(path: Path, obj: dict) -> None:
    """Append a JSON object as a single line to a JSONL file."""
    ensure_state_dirs()
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    """Read all JSON objects from a JSONL file."""
    if not path.exists():
        return []
    results = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    results.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return results


def _to_str(v) -> str:
    """Convert any value to a stripped string (handles None, float, int)."""
    if v is None:
        return ""
    return str(v).strip()


def validate_lot(row: dict) -> list[str]:
    """Validate a lot row. Returns a list of error messages (empty if valid)."""
    errors: list[str] = []

    lot_id = _to_str(row.get("lot_id"))
    if not lot_id:
        errors.append("lot_id is required")
    elif not lot_id.startswith("LOT-"):
        errors.append(f"lot_id must start with 'LOT-' (got: {lot_id})")

    region = _to_str(row.get("region"))
    if region not in ALLOWED_REGIONS:
        errors.append(f"region '{region}' not in {sorted(ALLOWED_REGIONS)}")

    process = _to_str(row.get("process"))
    if process not in ALLOWED_PROCESSES:
        errors.append(f"process '{process}' not in {sorted(ALLOWED_PROCESSES)}")

    eudr_status = _to_str(row.get("eudr_data_status"))
    if eudr_status not in ALLOWED_EUDR_STATUS:
        errors.append(
            f"eudr_data_status '{eudr_status}' not in {sorted(ALLOWED_EUDR_STATUS)}"
        )

    status = _to_str(row.get("status"))
    if status not in ALLOWED_LOT_STATUS:
        errors.append(f"status '{status}' not in {sorted(ALLOWED_LOT_STATUS)}")

    for field in ("cupping_score", "moisture_pct", "water_activity",
                  "eudr_gps_lat", "eudr_gps_lon",
                  "eudr_farmgate_price_etb_per_kg"):
        v = _to_str(row.get(field))
        if v:
            try:
                float(v)
            except ValueError:
                errors.append(f"{field}='{v}' is not numeric")

    for field in ("screen_size", "defect_count_sca", "stock_bags_remaining",
                  "bag_size_kg"):
        v = _to_str(row.get(field))
        if v:
            try:
                int(v)
            except ValueError:
                errors.append(f"{field}='{v}' is not an integer")

    crop_year = _to_str(row.get("crop_year"))
    if crop_year and "/" not in crop_year:
        errors.append(f"crop_year '{crop_year}' must be in YY/YY format")

    return errors


def generate_lot_id(year_suffix: str = "25") -> str:
    """Generate the next sequential lot_id: LOT-YY-NNNN."""
    rows = read_inventory()
    prefix = f"LOT-{year_suffix}-"
    max_num = 0
    for row in rows:
        lid = row.get("lot_id", "")
        if lid.startswith(prefix):
            try:
                num = int(lid[len(prefix):])
                if num > max_num:
                    max_num = num
            except ValueError:
                continue
    return f"{prefix}{max_num + 1:04d}"


def doc_path(category: str, lot_id: str, ext: str = "pdf") -> str:
    """Generate a standard document path for a lot."""
    return str(DOCS_DIR / category / f"{lot_id}_{category}.{ext}")


# =====================================================================
# RESERVATION MANAGEMENT
# =====================================================================

@dataclass
class Reservation:
    """A sample reservation holds a lot for 7 days while a buyer evaluates it."""
    reservation_id: str
    lot_id: str
    lead_id: str
    sample_type: str
    quantity_grams: int
    reserved_ts: str
    reserved_until_ts: str
    buyer_company: str
    crop_year: str


def add_reservation(lot_id: str, lead_id: str, sample_type: str,
                    buyer_company: str, crop_year: str) -> Reservation:
    """Create a 7-day reservation for a lot."""
    now = now_addis()
    until = now + timedelta(days=7)
    reservation = Reservation(
        reservation_id=f"RES-{now.strftime('%Y%m%d%H%M%S')}-{lot_id}",
        lot_id=lot_id,
        lead_id=lead_id,
        sample_type=sample_type,
        quantity_grams=SAMPLE_QUANTITIES_GRAMS.get(sample_type, 350),
        reserved_ts=now.isoformat(timespec="seconds"),
        reserved_until_ts=until.isoformat(timespec="seconds"),
        buyer_company=buyer_company,
        crop_year=crop_year,
    )
    append_jsonl(RESERVATIONS_JSONL, asdict(reservation))
    return reservation


def get_active_reservations(lot_id: str) -> list[dict]:
    """Get all non-expired reservations for a lot."""
    now = now_addis()
    all_res = read_jsonl(RESERVATIONS_JSONL)
    active = []
    for res in all_res:
        if res.get("lot_id") != lot_id:
            continue
        until = parse_iso(res.get("reserved_until_ts", ""))
        if until and until > now:
            active.append(res)
    return active


def list_all_active_reservations() -> list[dict]:
    """List all non-expired reservations across all lots."""
    now = now_addis()
    all_res = read_jsonl(RESERVATIONS_JSONL)
    active = []
    for res in all_res:
        until = parse_iso(res.get("reserved_until_ts", ""))
        if until and until > now:
            active.append(res)
    return active


# =====================================================================
# CONFIRMATION REQUEST PROCESSING (Agent 4 → Agent 1)
# =====================================================================

def build_docs_payload(lot: dict, include_eudr: bool) -> dict:
    """Build the docs_attached payload for a confirmed/refused lot."""
    lot_id = lot.get("lot_id", "")
    certs = []
    cert_field = (lot.get("certifications") or "").strip()
    if cert_field:
        for cert in cert_field.split(";"):
            cert = cert.strip().lower()
            if cert:
                if cert in ("organic", "ft", "fairtrade", "fair trade"):
                    certs.append(doc_path("certs", f"{lot_id}_{cert}"))
                elif cert in ("ra", "rainforest alliance"):
                    certs.append(doc_path("certs", f"{lot_id}_ra"))
                elif cert == "4c":
                    certs.append(doc_path("certs", f"{lot_id}_4c"))
                else:
                    certs.append(doc_path("certs", f"{lot_id}_{cert}"))

    eudr_pack = None
    if include_eudr and (lot.get("eudr_data_status") or "").strip() == "complete":
        eudr_pack = doc_path("eudr", lot_id)

    return {
        "cupping_score_sheet": doc_path("cupping", lot_id),
        "green_analysis": doc_path("green_analysis", lot_id),
        "eudr_data_pack": eudr_pack,
        "cert_of_origin": doc_path("origin", lot_id),
        "certs_copies": certs,
    }


def find_substitute(
    excluded_lot_id: str,
    region: Optional[str],
    process: Optional[str],
    target_score: Optional[float],
    crop_year: str,
    eudr_required: bool = False,
    inventory: Optional[list[dict]] = None,
) -> Optional[dict]:
    """
    Find the next-best substitute lot.
    Same region + same process + cupping score within ±1 point.
    Returns the top match, or None if no match found.
    """
    if inventory is None:
        inventory = read_inventory()

    crop_year_match = crop_year.replace(" representative", "")

    candidates = []
    for lot in inventory:
        if lot.get("lot_id") == excluded_lot_id:
            continue
        if (lot.get("status") or "").strip() != "active":
            continue
        if (lot.get("crop_year") or "").strip() != crop_year_match:
            continue
        try:
            stock = int(lot.get("stock_bags_remaining") or 0)
        except ValueError:
            continue
        if stock <= 0:
            continue

        if region and (lot.get("region") or "").strip() != region:
            continue
        if process and (lot.get("process") or "").strip() != process:
            continue

        try:
            lot_score = float(lot.get("cupping_score") or 0)
        except ValueError:
            continue
        if target_score and abs(lot_score - target_score) > 1.0:
            continue

        if eudr_required and (lot.get("eudr_data_status") or "").strip() != "complete":
            continue

        candidates.append((lot, lot_score, stock))

    if not candidates:
        return None

    candidates.sort(key=lambda x: (
        abs(x[1] - (target_score or 0)),
        -x[2],
    ))

    best = candidates[0][0]
    return {
        "lot_id": best.get("lot_id"),
        "region": best.get("region"),
        "washing_station": best.get("washing_station"),
        "process": best.get("process"),
        "screen_size": best.get("screen_size"),
        "cupping_score": best.get("cupping_score"),
        "stock_bags_remaining": best.get("stock_bags_remaining"),
        "eudr_data_status": best.get("eudr_data_status"),
        "reason": (
            f"Substitute for {excluded_lot_id}: same region ({region}), "
            f"same process ({process}), score {best.get('cupping_score')} "
            f"(target was {target_score})."
        ),
    }


def process_single_lot(
    lot_id: str,
    lot: Optional[dict],
    sample_type: str,
    crop_year_request: str,
    eudr_required: bool,
    lead_id: str,
    buyer_company: str,
    crop_year_full: str,
    inventory: list[dict],
) -> dict:
    """Process confirmation for a single lot. Returns the result dict."""

    if not lot:
        return {
            "lot_id": lot_id,
            "confirmed": False,
            "reason_if_not": f"Lot {lot_id} not found in inventory.",
            "stock_after_sample_bags": 0,
            "docs_attached": None,
            "reserved_until": None,
            "substitute_suggestion": find_substitute(
                excluded_lot_id=lot_id,
                region=None,
                process=None,
                target_score=None,
                crop_year=crop_year_request,
                inventory=inventory,
            ),
        }

    status = (lot.get("status") or "").strip()
    if status != "active":
        return {
            "lot_id": lot_id,
            "confirmed": False,
            "reason_if_not": f"Lot status is '{status}' (must be 'active').",
            "stock_after_sample_bags": int(lot.get("stock_bags_remaining") or 0),
            "docs_attached": build_docs_payload(lot, include_eudr=False),
            "reserved_until": None,
            "substitute_suggestion": find_substitute(
                excluded_lot_id=lot_id,
                region=lot.get("region"),
                process=lot.get("process"),
                target_score=float(lot.get("cupping_score") or 0),
                crop_year=crop_year_request,
                inventory=inventory,
            ),
        }

    try:
        stock_bags = int(lot.get("stock_bags_remaining") or 0)
    except ValueError:
        stock_bags = 0
    if stock_bags <= 0:
        return {
            "lot_id": lot_id,
            "confirmed": False,
            "reason_if_not": "Stock depleted.",
            "stock_after_sample_bags": 0,
            "docs_attached": build_docs_payload(lot, include_eudr=False),
            "reserved_until": None,
            "substitute_suggestion": find_substitute(
                excluded_lot_id=lot_id,
                region=lot.get("region"),
                process=lot.get("process"),
                target_score=float(lot.get("cupping_score") or 0),
                crop_year=crop_year_request,
                inventory=inventory,
            ),
        }

    lot_crop_year = (lot.get("crop_year") or "").strip()
    if lot_crop_year != crop_year_request:
        return {
            "lot_id": lot_id,
            "confirmed": False,
            "reason_if_not": (
                f"Crop year mismatch: lot is {lot_crop_year}, "
                f"request is {crop_year_request}."
            ),
            "stock_after_sample_bags": stock_bags,
            "docs_attached": build_docs_payload(lot, include_eudr=False),
            "reserved_until": None,
            "substitute_suggestion": find_substitute(
                excluded_lot_id=lot_id,
                region=lot.get("region"),
                process=lot.get("process"),
                target_score=float(lot.get("cupping_score") or 0),
                crop_year=crop_year_request,
                inventory=inventory,
            ),
        }

    eudr_status = (lot.get("eudr_data_status") or "").strip()
    if eudr_required and eudr_status != "complete":
        return {
            "lot_id": lot_id,
            "confirmed": False,
            "reason_if_not": (
                f"EUDR data is '{eudr_status}' — required for EU destination "
                f"({buyer_company}). Trigger EUDR completion before re-requesting."
            ),
            "stock_after_sample_bags": stock_bags,
            "docs_attached": build_docs_payload(lot, include_eudr=False),
            "reserved_until": None,
            "substitute_suggestion": find_substitute(
                excluded_lot_id=lot_id,
                region=lot.get("region"),
                process=lot.get("process"),
                target_score=float(lot.get("cupping_score") or 0),
                crop_year=crop_year_request,
                eudr_required=True,
                inventory=inventory,
            ),
        }

    # All checks passed — confirm and reserve
    sample_grams = SAMPLE_QUANTITIES_GRAMS.get(sample_type, 350)
    bag_size_kg = int(lot.get("bag_size_kg") or DEFAULT_BAG_SIZE_KG)
    sample_bags = sample_grams / (bag_size_kg * 1000)
    stock_after = max(0, stock_bags - sample_bags)

    reservation = add_reservation(
        lot_id=lot_id,
        lead_id=lead_id,
        sample_type=sample_type,
        buyer_company=buyer_company,
        crop_year=crop_year_full,
    )

    return {
        "lot_id": lot_id,
        "confirmed": True,
        "reason_if_not": "",
        "stock_after_sample_bags": round(stock_after, 4),
        "docs_attached": build_docs_payload(lot, include_eudr=eudr_required),
        "reserved_until": reservation.reserved_until_ts,
        "substitute_suggestion": None,
    }


def process_confirmation_request(request: dict) -> dict:
    """
    Process a lot confirmation request from Agent 4.

    Input schema:
        {
          "lead_id": "L-2026-00047",
          "buyer_company": "Falcon Coffees",
          "buyer_destination_country": "Germany",
          "sample_type": "350g",
          "crop_year": "25/26",
          "lot_ids": ["LOT-25-0001", "LOT-25-0002", ...]
        }
    """
    lead_id = request.get("lead_id", "")
    buyer_company = request.get("buyer_company", "")
    destination = request.get("buyer_destination_country", "")
    sample_type = request.get("sample_type", "350g")
    crop_year_request = request.get("crop_year", "25/26")
    lot_ids = request.get("lot_ids", [])

    eudr_required = destination.strip() in EU_COUNTRIES
    crop_year_match = crop_year_request.replace(" representative", "")

    inventory = read_inventory()
    inventory_by_id = {row["lot_id"]: row for row in inventory}

    results = []
    for lot_id in lot_ids:
        result = process_single_lot(
            lot_id=lot_id,
            lot=inventory_by_id.get(lot_id),
            sample_type=sample_type,
            crop_year_request=crop_year_match,
            eudr_required=eudr_required,
            lead_id=lead_id,
            buyer_company=buyer_company,
            crop_year_full=crop_year_request,
            inventory=inventory,
        )
        results.append(result)

    return {
        "lead_id": lead_id,
        "confirmed_at": now_addis_iso(),
        "results": results,
    }


# =====================================================================
# FEEDBACK INTAKE (Agent 4 → Agent 1)
# =====================================================================

CRITICAL_KEYWORDS = ("musty", "fermented", "sour", "phenolic",
                     "rio", "potato defect", "defective")


def log_feedback(lot_id: str, buyer_company: str, buyer_segment: str,
                 rejection_reason: str) -> dict:
    """Log rejection feedback from Agent 4. Triggers QA flag if ≥2 same-reason rejections."""
    entry = {
        "feedback_id": f"FB-{now_addis().strftime('%Y%m%d%H%M%S')}-{lot_id}",
        "lot_id": lot_id,
        "buyer_company": buyer_company,
        "buyer_segment": buyer_segment,
        "rejection_reason": rejection_reason,
        "logged_ts": now_addis_iso(),
    }
    append_jsonl(FEEDBACK_JSONL, entry)

    all_feedback = read_jsonl(FEEDBACK_JSONL)
    lot_feedbacks = [f for f in all_feedback if f.get("lot_id") == lot_id]

    reason_lower = rejection_reason.lower()
    matched_keyword = None
    pattern_match = False
    for fb in lot_feedbacks[:-1]:
        old_reason = (fb.get("rejection_reason") or "").lower()
        for kw in CRITICAL_KEYWORDS:
            if kw in reason_lower and kw in old_reason:
                pattern_match = True
                matched_keyword = kw
                break
        if pattern_match:
            break

    qa_flagged = False
    if pattern_match and len(lot_feedbacks) >= 2:
        flag_lot_for_qa(lot_id, auto=True,
                        reason=f"≥2 rejections with critical keyword match "
                               f"(keyword: {matched_keyword})")
        qa_flagged = True

    entry["qa_auto_flagged"] = qa_flagged
    return entry


def flag_lot_for_qa(lot_id: str, auto: bool = False, reason: str = "") -> bool:
    """Set a lot's status to 'hold' for QA review. Returns True if successful."""
    inventory = read_inventory()
    updated = False
    for row in inventory:
        if row.get("lot_id") == lot_id:
            row["status"] = "hold"
            row["last_updated_ts"] = now_addis_iso()
            updated = True
            break
    if updated:
        write_inventory(inventory)
        flag_entry = {
            "qa_flag_id": f"QA-{now_addis().strftime('%Y%m%d%H%M%S')}-{lot_id}",
            "lot_id": lot_id,
            "auto": auto,
            "reason": reason,
            "flagged_ts": now_addis_iso(),
        }
        append_jsonl(STATE_DIR / "qa_flags.jsonl", flag_entry)
    return updated


# =====================================================================
# CLI SUBCOMMAND IMPLEMENTATIONS
# =====================================================================

def cmd_init(args: argparse.Namespace) -> int:
    if INVENTORY_CSV.exists() and not args.force:
        print(f"ERROR: {INVENTORY_CSV} already exists. Use --force to overwrite.",
              file=sys.stderr)
        return 1
    ensure_state_dirs()
    write_inventory([])
    print(f"✓ Initialized empty inventory: {INVENTORY_CSV}")
    print(f"  Columns: {len(LOT_COLUMNS)}")
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    if INVENTORY_CSV.exists() and not args.force:
        print(f"ERROR: {INVENTORY_CSV} already exists. Use --force to overwrite.",
              file=sys.stderr)
        return 1

    ensure_state_dirs()
    now = now_addis_iso()

    seed_lots = [
        ("Yirgacheffe", "Konga Washing Station", "Yirgacheffe Union",
         "Washed", 14, 87.5, "Amanuel Tesfaye", "2026-03-15", 8, 11.2, 0.45,
         "25/26", "Nov 2025 – Jan 2026", "2026-02-20", 45, 60,
         "organic", "ECTA-2026-0142", "complete",
         6.1627, 38.1964, 28.50, "signed",
         "No", "active"),
        ("Yirgacheffe", "Idido Washing Station", "Yirgacheffe Union",
         "Natural", 14, 88.2, "Amanuel Tesfaye", "2026-03-16", 6, 10.8, 0.42,
         "25/26", "Nov 2025 – Jan 2026", "2026-02-22", 30, 60,
         "", "ECTA-2026-0143", "complete",
         6.1750, 38.2100, 29.00, "signed",
         "No", "active"),
        ("Guji", "Hambela Washing Station", "Hambela Co-op",
         "Washed", 15, 86.8, "Sara Bekele", "2026-03-18", 10, 11.5, 0.48,
         "25/26", "Nov 2025 – Jan 2026", "2026-02-25", 60, 60,
         "organic;FT", "ECTA-2026-0144", "complete",
         5.9847, 38.2856, 27.50, "signed",
         "No", "active"),
        ("Guji", "Uraga Washing Station", "Uraga Co-op",
         "Natural", 14, 88.0, "Sara Bekele", "2026-03-19", 5, 10.5, 0.40,
         "25/26", "Nov 2025 – Feb 2026", "2026-02-28", 25, 60,
         "", "ECTA-2026-0145", "partial",
         5.9500, 38.3000, 0, "",
         "No", "active"),
        ("Guji", "Shakiso Washing Station", "Shakiso Co-op",
         "Washed", 14, 85.5, "Sara Bekele", "2026-03-20", 12, 11.0, 0.44,
         "25/26", "Nov 2025 – Jan 2026", "2026-03-01", 50, 60,
         "", "ECTA-2026-0146", "complete",
         5.9200, 38.2500, 26.80, "signed",
         "No", "active"),
        ("Sidamo", "Bensa Washing Station", "Bensa Co-op",
         "Washed", 14, 84.5, "Dawit Haile", "2026-03-22", 14, 11.3, 0.46,
         "25/26", "Nov 2025 – Jan 2026", "2026-03-02", 80, 60,
         "", "ECTA-2026-0147", "complete",
         6.3500, 38.4500, 24.00, "signed",
         "No", "active"),
        ("Sidamo", "Bensa Washing Station", "Bensa Co-op",
         "Natural", 14, 85.0, "Dawit Haile", "2026-03-23", 9, 10.9, 0.43,
         "25/26", "Nov 2025 – Jan 2026", "2026-03-03", 70, 60,
         "FT", "ECTA-2026-0148", "complete",
         6.3510, 38.4510, 25.00, "signed",
         "No", "active"),
        ("Limu", "Limu Kosa Washing Station", "Limu Inara Co-op",
         "Washed", 15, 83.0, "Marta Tadesse", "2026-03-25", 15, 11.4, 0.47,
         "25/26", "Nov 2025 – Jan 2026", "2026-03-05", 100, 60,
         "", "ECTA-2026-0149", "missing",
         0, 0, 0, "",
         "No", "active"),
        ("Jimma", "Babo Washing Station", "Babo Co-op",
         "Natural", 13, 82.5, "Marta Tadesse", "2026-03-26", 18, 11.6, 0.50,
         "25/26", "Nov 2025 – Jan 2026", "2026-03-06", 40, 60,
         "organic", "ECTA-2026-0150", "complete",
         7.6750, 36.8330, 22.00, "signed",
         "No", "active"),
        ("Yirgacheffe", "Konga Washing Station", "Yirgacheffe Union",
         "Washed", 14, 87.0, "Amanuel Tesfaye", "2026-03-15", 7, 11.1, 0.44,
         "25/26", "Nov 2025 – Jan 2026", "2026-02-20", 15, 60,
         "organic", "ECTA-2026-0142", "complete",
         6.1627, 38.1964, 28.50, "signed",
         "Yes", "active"),
    ]

    # Seed tuples align with LOT_COLUMNS[1:-1] (skip lot_id and last_updated_ts)
    seed_columns = LOT_COLUMNS[1:-1]  # region through status (25 fields)
    rows = []
    for i, lot_data in enumerate(seed_lots, start=1):
        lot_id = f"LOT-25-{i:04d}"
        row = dict(zip(seed_columns, lot_data))
        row["lot_id"] = lot_id
        row["last_updated_ts"] = now
        rows.append(row)

    write_inventory(rows)
    print(f"✓ Seeded {len(rows)} lots to {INVENTORY_CSV}")
    print(f"  Regions: Yirgacheffe, Guji, Sidamo, Limu, Jimma")
    print(f"  EUDR complete: {sum(1 for r in rows if r['eudr_data_status']=='complete')}")
    print(f"  EUDR partial:  {sum(1 for r in rows if r['eudr_data_status']=='partial')}")
    print(f"  EUDR missing:  {sum(1 for r in rows if r['eudr_data_status']=='missing')}")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    if args.input_file:
        with Path(args.input_file).open(encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.loads(sys.stdin.read())

    if not data.get("lot_id"):
        year_suffix = (data.get("crop_year") or "25/26").split("/")[0]
        data["lot_id"] = generate_lot_id(year_suffix)

    errors = validate_lot(data)
    if errors:
        print("ERROR: lot validation failed:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    inventory = read_inventory()
    for row in inventory:
        if row.get("lot_id") == data["lot_id"]:
            print(f"ERROR: lot_id {data['lot_id']} already exists.",
                  file=sys.stderr)
            return 1

    lot = {col: _to_str(data.get(col, "")) for col in LOT_COLUMNS}
    lot["last_updated_ts"] = now_addis_iso()
    inventory.append(lot)
    write_inventory(inventory)

    print(f"✓ Added lot: {lot['lot_id']} ({lot['region']} {lot['process']} "
          f"score {lot['cupping_score']})")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    inventory = read_inventory()
    if not inventory:
        print("Inventory is empty. Run 'seed' or 'add' first.")
        return 0

    filtered = inventory
    if args.region:
        filtered = [r for r in filtered if r.get("region") == args.region]
    if args.process:
        filtered = [r for r in filtered if r.get("process") == args.process]
    if args.status:
        filtered = [r for r in filtered if r.get("status") == args.status]
    if args.eudr:
        filtered = [r for r in filtered
                    if r.get("eudr_data_status") == args.eudr]
    if args.crop_year:
        filtered = [r for r in filtered if r.get("crop_year") == args.crop_year]
    if args.min_score:
        filtered = [r for r in filtered
                    if float(r.get("cupping_score") or 0) >= args.min_score]

    if not filtered:
        print("No lots match the specified filters.")
        return 0

    print(f"{'Lot ID':<15} {'Region':<13} {'Process':<10} {'Scr':>4} "
          f"{'Score':>6} {'Stock':>6} {'EUDR':<10} {'Status':<10}")
    print("-" * 80)
    for r in filtered:
        print(f"{r.get('lot_id',''):<15} {r.get('region',''):<13} "
              f"{r.get('process',''):<10} {r.get('screen_size',''):>4} "
              f"{r.get('cupping_score',''):>6} {r.get('stock_bags_remaining',''):>6} "
              f"{r.get('eudr_data_status',''):<10} {r.get('status',''):<10}")
    print(f"\n{len(filtered)} lot(s) listed.")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    inventory = read_inventory()
    for row in inventory:
        if row.get("lot_id") == args.lot_id:
            for col in LOT_COLUMNS:
                print(f"  {col:<35} = {row.get(col, '')}")
            reservations = get_active_reservations(args.lot_id)
            if reservations:
                print(f"\n  Active reservations ({len(reservations)}):")
                for res in reservations:
                    print(f"    - {res['reservation_id']}: "
                          f"lead={res['lead_id']} "
                          f"type={res['sample_type']} "
                          f"until={res['reserved_until_ts']}")
            return 0
    print(f"ERROR: lot_id {args.lot_id} not found.", file=sys.stderr)
    return 1


def parse_updates(updates_list: list[str]) -> dict:
    """Parse a list of 'FIELD=VALUE' strings into a dict."""
    result = {}
    for item in updates_list:
        if "=" not in item:
            raise ValueError(f"Invalid update format: {item} (expected FIELD=VALUE)")
        field, value = item.split("=", 1)
        result[field.strip()] = value.strip()
    return result


def cmd_update(args: argparse.Namespace) -> int:
    inventory = read_inventory()
    updated = False
    for row in inventory:
        if row.get("lot_id") == args.lot_id:
            for field, value in args.updates.items():
                if field in LOT_COLUMNS:
                    row[field] = value
                    updated = True
            row["last_updated_ts"] = now_addis_iso()
            break
    if not updated:
        print(f"ERROR: lot_id {args.lot_id} not found.", file=sys.stderr)
        return 1
    write_inventory(inventory)
    print(f"✓ Updated {args.lot_id}: {dict(args.updates)}")
    return 0


def cmd_confirm(args: argparse.Namespace) -> int:
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

    response = process_confirmation_request(request)

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
    inventory = read_inventory()
    target_lot = None
    for row in inventory:
        if row.get("lot_id") == args.lot_id:
            target_lot = row
            break
    if not target_lot:
        print(f"ERROR: lot_id {args.lot_id} not found.", file=sys.stderr)
        return 1

    sub = find_substitute(
        excluded_lot_id=args.lot_id,
        region=target_lot.get("region"),
        process=target_lot.get("process"),
        target_score=float(target_lot.get("cupping_score") or 0),
        crop_year=target_lot.get("crop_year", "25/26"),
        eudr_required=args.eudr_required,
        inventory=inventory,
    )
    if not sub:
        print(f"No substitute found for {args.lot_id}.")
        return 0
    print(json.dumps(sub, indent=2, ensure_ascii=False))
    return 0


def cmd_feedback(args: argparse.Namespace) -> int:
    entry = log_feedback(
        lot_id=args.lot_id,
        buyer_company=args.buyer,
        buyer_segment=args.segment or "",
        rejection_reason=args.reason,
    )
    print(f"✓ Logged feedback: {entry['feedback_id']}")
    if entry.get("qa_auto_flagged"):
        print(f"  ⚠️  Auto-flagged lot {args.lot_id} for QA review "
              f"(≥2 rejections with critical keyword match).")
    return 0


def cmd_audit_eudr(args: argparse.Namespace) -> int:
    inventory = read_inventory()
    incomplete = [r for r in inventory
                  if (r.get("eudr_data_status") or "").strip() != "complete"
                  and (r.get("status") or "").strip() == "active"]

    if not incomplete:
        print("✓ All active lots have complete EUDR data.")
        return 0

    print(f"{'Lot ID':<15} {'Region':<13} {'Status':<10} {'EUDR':<10} "
          f"{'Missing Fields'}")
    print("-" * 90)
    for r in incomplete:
        missing_fields = []
        if not r.get("eudr_gps_lat") or float(r.get("eudr_gps_lat") or 0) == 0:
            missing_fields.append("gps")
        if not r.get("eudr_farmgate_price_etb_per_kg") or \
           float(r.get("eudr_farmgate_price_etb_per_kg") or 0) == 0:
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
    if flag_lot_for_qa(args.lot_id, auto=False,
                       reason=args.reason or "Manual QA flag"):
        print(f"✓ Lot {args.lot_id} flagged for QA review (status → hold).")
        return 0
    print(f"ERROR: lot_id {args.lot_id} not found.", file=sys.stderr)
    return 1


def cmd_qa_release(args: argparse.Namespace) -> int:
    inventory = read_inventory()
    for row in inventory:
        if row.get("lot_id") == args.lot_id:
            if row.get("status") != "hold":
                print(f"Lot {args.lot_id} is not on hold (status={row.get('status')}).")
                return 0
            row["status"] = "active"
            row["last_updated_ts"] = now_addis_iso()
            write_inventory(inventory)
            print(f"✓ Lot {args.lot_id} released from hold → active.")
            return 0
    print(f"ERROR: lot_id {args.lot_id} not found.", file=sys.stderr)
    return 1


def cmd_refresh(args: argparse.Namespace) -> int:
    inventory = read_inventory()
    if not inventory:
        print("Inventory is empty.")
        return 0
    now = now_addis_iso()
    for row in inventory:
        row["last_updated_ts"] = now
    write_inventory(inventory)
    print(f"✓ Refreshed last_updated_ts on {len(inventory)} lot(s).")
    return 0


def cmd_kpi(args: argparse.Namespace) -> int:
    inventory = read_inventory()
    feedback = read_jsonl(FEEDBACK_JSONL)
    reservations = list_all_active_reservations()

    if not inventory:
        print("Inventory is empty. Run 'seed' or 'init' first.")
        return 0

    now = now_addis()
    stale_count = 0
    for row in inventory:
        ts = parse_iso(row.get("last_updated_ts", ""))
        if ts and (now - ts) > timedelta(hours=24):
            stale_count += 1

    status_counts = Counter((r.get("status") or "").strip() for r in inventory)

    eudr_counts = Counter((r.get("eudr_data_status") or "").strip()
                          for r in inventory
                          if (r.get("status") or "").strip() == "active")

    total_stock_bags = sum(int(r.get("stock_bags_remaining") or 0)
                           for r in inventory
                           if (r.get("status") or "").strip() in ("active", "hold"))

    feedback_by_lot = defaultdict(list)
    for fb in feedback:
        feedback_by_lot[fb.get("lot_id")].append(fb)

    multi_rejection_lots = {lid: fbs for lid, fbs in feedback_by_lot.items()
                            if len(fbs) >= 2}

    region_counts = Counter((r.get("region") or "").strip()
                            for r in inventory
                            if (r.get("status") or "").strip() == "active")

    print()
    print("=" * 60)
    print("Agent 1 — Inventory KPI Report")
    print("=" * 60)
    print(f"Generated: {now_addis_iso()}")
    print()
    print(f"Total lots:                {len(inventory)}")
    print(f"  active:                   {status_counts.get('active', 0)}")
    print(f"  committed:                {status_counts.get('committed', 0)}")
    print(f"  hold (QA):                {status_counts.get('hold', 0)}")
    print(f"  depleted:                 {status_counts.get('depleted', 0)}")
    print()
    print(f"Total stock:                {total_stock_bags} bags "
          f"({total_stock_bags * DEFAULT_BAG_SIZE_KG} kg)")
    print()
    print("EUDR completeness (active lots):")
    total_active = sum(eudr_counts.values())
    if total_active > 0:
        for status in ("complete", "partial", "missing"):
            n = eudr_counts.get(status, 0)
            pct = (n / total_active) * 100
            print(f"  {status:<12} {n:3d} ({pct:.0f}%)")
    print()
    print("Regional distribution (active lots):")
    for region, n in region_counts.most_common():
        print(f"  {region:<15} {n}")
    print()
    print(f"Inventory freshness:        {len(inventory) - stale_count}/{len(inventory)} "
          f"lots fresh (≤24h)")
    if stale_count > 0:
        print(f"  ⚠️  {stale_count} lot(s) stale (>24h since last update)")
    print()
    print(f"Active reservations:        {len(reservations)}")
    print()
    print(f"Rejection feedback logged:  {len(feedback)} total")
    print(f"  Lots with ≥2 rejections:  {len(multi_rejection_lots)}")
    if multi_rejection_lots:
        print(f"  ⚠️  Review these lots for QA:")
        for lid, fbs in multi_rejection_lots.items():
            print(f"    - {lid}: {len(fbs)} rejections")
    print("=" * 60)
    return 0


def cmd_reservations(args: argparse.Namespace) -> int:
    reservations = list_all_active_reservations()
    if not reservations:
        print("No active reservations.")
        return 0
    print(f"{'Reservation ID':<35} {'Lot ID':<15} {'Lead ID':<18} "
          f"{'Type':<6} {'Buyer':<25} {'Until'}")
    print("-" * 120)
    for res in reservations:
        print(f"{res.get('reservation_id',''):<35} {res.get('lot_id',''):<15} "
              f"{res.get('lead_id',''):<18} {res.get('sample_type',''):<6} "
              f"{res.get('buyer_company',''):<25} {res.get('reserved_until_ts','')}")
    print(f"\n{len(reservations)} active reservation(s).")
    return 0


# =====================================================================
# ARGUMENT PARSER
# =====================================================================

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Agent 1 — Sourcing & Inventory Specialist",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="command", required=True,
                                        help="Subcommand to run")

    p = subparsers.add_parser("init", help="Initialize empty lot_inventory.csv")
    p.add_argument("--force", action="store_true",
                   help="Overwrite existing inventory")
    p.set_defaults(func=cmd_init)

    p = subparsers.add_parser("seed", help="Seed inventory with test data")
    p.add_argument("--force", action="store_true",
                   help="Overwrite existing inventory")
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
        args.updates = parse_updates(args.updates)

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
