#!/usr/bin/env python3
"""
Quick inline migration — import leads directly from the raw CSV
into SQLite, applying the same enrichment logic as Agent 2.

This is a one-time bridge script. Once the leads are in SQLite,
Agent 2's full enrichment script should be used for new leads.
"""
import csv
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from state_manager import StateManager, ALLOWED_REGIONS, ALLOWED_VPS, ALLOWED_TIERS

RAW_CSV = Path("/home/z/my-project/upload/enriched_coffee_leads.csv")

# Language map (mirrors Agent 2)
COUNTRY_LANGUAGE = {
    "USA": "EN", "United States": "EN", "Canada": "EN", "United Kingdom": "EN",
    "UK": "EN", "Germany": "DE", "Austria": "DE", "France": "FR", "Italy": "IT",
    "Belgium": "EN", "Netherlands": "EN", "Switzerland": "EN", "Spain": "EN",
    "Japan": "JA", "South Korea": "KO", "China": "ZH", "Saudi Arabia": "AR",
    "UAE": "AR", "United Arab Emirates": "AR", "Kuwait": "AR", "Turkey": "TR",
    "Russia": "RU",
}

S_TIER_KEYWORDS = ("falcon coffee", "royal coffee", "cafe imports", "trabocca",
                   "nordic approach", "ally coffee", "atlas coffee", "sucafina",
                   "volcafe", "ecom", "olam", "neumann", "drwakefield", "mercon")

def detect_segment(company, notes):
    text = (company + " " + notes).lower()
    name = company.lower()
    if any(k in text for k in ("cafe chain", "household cafe", "coffee chain")):
        return "Cafe-Chain"
    if any(k in name for k in ("starbucks", "komeda", "dunkin", "tim hortons")):
        return "Cafe-Chain"
    if any(k in text for k in ("broker", "brokerage")):
        return "Broker"
    if any(k in text for k in ("subscription", "office coffee service", "d2c")):
        return "Subscription"
    if any(k in text for k in ("microlot", "micro-lot", "competition", "world barista")):
        return "Microlot Buyer"
    if any(k in text for k in ("fcl", "icc", "fob djibouti", "commodity", "substantial volumes", "industry giant")):
        if any(k in text for k in ("specialty", "microlot")):
            return "Specialty Importer"
        return "Commercial Importer"
    if any(k in name for k in ("roaster", "roastery", "roasting")):
        return "Roaster-Direct"
    if any(k in text for k in ("importer", "importing", "trading")):
        if any(k in text for k in ("specialty", "microlot", "single-origin", "direct trade")):
            return "Specialty Importer"
        return "Commercial Importer"
    return "Specialty Importer"

def recommend_vp(segment, notes):
    text = notes.lower()
    if any(k in text for k in ("fairtrade", "fair trade", "rainforest", "organic", "eudr", "sustainab", "transparent", "traceab")):
        return "VP2"
    if any(k in text for k in ("microlot", "micro-lot", "competition", "world barista")):
        return "VP4"
    if any(k in text for k in ("fcl", "icc", "fob", "commodity", "forward pricing", "substantial volumes")):
        return "VP3"
    if segment == "Microlot Buyer": return "VP4"
    if segment == "Commercial Importer": return "VP3"
    if segment == "Cafe-Chain": return "VP3"
    if segment == "Broker": return "VP1"
    if segment == "Subscription": return "VP2"
    return "VP1"

def pick_language(country):
    if not country: return "EN"
    parts = [p.strip() for p in country.split(",")]
    c = parts[-1] if parts else ""
    if c in COUNTRY_LANGUAGE: return COUNTRY_LANGUAGE[c]
    for k, v in COUNTRY_LANGUAGE.items():
        if k.lower() in c.lower(): return v
    return "EN"

def assign_tier(company, notes, segment, disqualify, data_conf):
    if disqualify: return "Disqualify"
    text = (company + " " + notes).lower()
    if any(k in text for k in S_TIER_KEYWORDS): return "S"
    if segment in ("Specialty Importer", "Commercial Importer") and (data_conf or "").lower() == "high":
        return "A"
    if segment in ("Roaster-Direct", "Microlot Buyer", "Subscription"):
        return "B"
    if segment == "Broker": return "C"
    if (data_conf or "").lower() in ("low", "medium"): return "C"
    return "B"

def main():
    if not RAW_CSV.exists():
        print(f"ERROR: {RAW_CSV} not found", file=sys.stderr)
        return 1

    with RAW_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Importing {len(rows)} leads from raw CSV...")

    imported = 0
    skipped = 0
    with StateManager() as sm:
        for row in rows:
            company = (row.get("company_name") or "").strip()
            if not company:
                skipped += 1
                continue

            hq = (row.get("headquarters") or "").strip()
            parts = [p.strip() for p in hq.split(",")]
            country = parts[-1] if parts else ""

            existing = sm.get_lead_by_company(company, country)
            if existing:
                skipped += 1
                continue

            notes = row.get("notes", "") or ""
            data_conf = row.get("data_confidence", "") or ""
            segment = detect_segment(company, notes)
            vp = recommend_vp(segment, notes)
            lang = pick_language(country)

            # Disqualify cafe chains and zero-contact leads
            disqualify = False
            if segment == "Cafe-Chain":
                disqualify = True
            has_contact = any((row.get(f) or "").strip().lower() not in ("", "not found")
                              for f in ("decision_maker_1_linkedin", "decision_maker_2_linkedin",
                                        "decision_maker_1_email", "decision_maker_2_email",
                                        "general_email", "other_emails", "phone"))
            if not has_contact:
                disqualify = True

            tier = assign_tier(company, notes, segment, disqualify, data_conf)
            if tier == "Disqualify":
                skipped += 1
                continue

            # Build tags
            tags = []
            if "fairtrade" in notes.lower() or "fair trade" in notes.lower():
                tags.append("fairtrade")
            if "organic" in notes.lower():
                tags.append("organic")
            if "microlot" in notes.lower() or "micro-lot" in notes.lower():
                tags.append("microlot")
            if "eudr" in notes.lower():
                tags.append("eudr-aware")

            source_hash = hashlib.sha1(f"{company.lower()}|{hq.lower()}".encode()).hexdigest()

            try:
                lead_id = sm.create_lead(
                    company_name=company,
                    headquarters_country=country,
                    source_row_hash=source_hash,
                    priority_tier=tier,
                    recommended_vp=vp,
                    outreach_language=lang,
                    tags=tags,
                )
                sm.update_lead_state(
                    lead_id=lead_id,
                    new_state="ENRICHED",
                    agent="Agent 2",
                    notes="Imported from raw CSV via bridge script",
                    next_action_agent="Agent 3",
                    current_agent="Agent 3",
                )
                imported += 1
            except Exception as e:
                print(f"  ⚠ Failed: {company}: {e}", file=sys.stderr)
                skipped += 1

    print(f"\n✓ Imported: {imported}")
    print(f"  Skipped: {skipped}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
