"""
Enrich enriched_coffee_leads.csv with the columns Agent 3 (Outreach & Follow-Up
Specialist) needs to operate without re-doing lead research.

Adds 12 columns:
  - recommended_vp          (VP1/VP2/VP3/VP4 — pre-selected)
  - vp_rationale            (one-line why)
  - q1_volume_band_est      (estimated FCL/year — to be confirmed live)
  - q2_segment_class        (Specialty Importer / Commercial Importer /
                             Roaster-Direct / Microlot Buyer / Broker /
                             Cafe-Chain / D2C / Subscription)
  - q3_authority_contact    (DM1 / DM2 — which decision maker to contact first)
  - q4_timing_signal        (Active / Planning / Unknown — confirm live)
  - q5_sample_policy_est    (Likely-paid / Likely-free-only / Unknown)
  - sequence_type           (Sequence A LinkedIn-first / Sequence B Email-first)
  - outreach_language       (EN / DE / FR / IT / JA / KO / ZH / AR)
  - priority_tier           (S / A / B / C / Disqualify)
  - disqualify_flag         (Yes / No)
  - disqualify_reason       (short text)
  - agent3_handoff_notes    (free-form flags for Agent 3)

Input : /home/z/my-project/upload/enriched_coffee_leads.csv
Output: /home/z/my-project/download/enriched_coffee_leads_agent3_ready.csv
"""

import csv
import re
from pathlib import Path

INPUT  = Path("/home/z/my-project/upload/enriched_coffee_leads.csv")
OUTPUT = Path("/home/z/my-project/download/enriched_coffee_leads_agent3_ready.csv")

# ----------------------------------------------------------------------
# Known S-tier buyers — these get priority_tier=S regardless of heuristic
# ----------------------------------------------------------------------
S_TIER_KEYWORDS = [
    "falcon coffee", "royal coffee", "cafe imports", "trabocca",
    "nordic approach", "ally coffee", "atlas coffee", "sucafina",
    "volcafe", "ecom", "olam", "neumann", "drwakefield", "list + beisler",
    "mercon", "export trading group", "etg", "cardassilaris",
    "rené röst", "rene rost", "sintercafe", " bon", "ogawa",
]

# Large commercial importers — Sequence B (email-first)
LARGE_COMMERCIAL_KEYWORDS = [
    "volcafe", "ecom", "olam", "sucafina", "neumann", "mercon",
    "starbucks", "nestle", "nespresso", "jacobs", "tchibo",
    "lavazza", "illy", "segafredo", "costa coffee",
]

# Countries → outreach language (English body + native disclaimer for non-Latin)
COUNTRY_LANGUAGE = {
    "USA": "EN", "United States": "EN", "United States of America": "EN",
    "Canada": "EN", "United Kingdom": "EN", "UK": "EN",
    "Germany": "DE", "Austria": "DE", "Switzerland": "EN",
    "France": "FR", "Belgium": "EN", "Netherlands": "EN",
    "Italy": "IT", "Spain": "EN",
    "Japan": "JA", "South Korea": "KO", "China": "ZH",
    "Saudi Arabia": "AR", "UAE": "AR", "United Arab Emirates": "AR",
    "Kuwait": "AR", "Qatar": "AR", "Bahrain": "AR", "Oman": "AR",
    "Turkey": "TR", "Russia": "RU",
}

# ----------------------------------------------------------------------
# Classification helpers
# ----------------------------------------------------------------------

def detect_segment(company_name: str, notes: str) -> str:
    """Classify company into one of the segments Agent 3's VPs map to."""
    text = (company_name + " " + notes).lower()
    name = company_name.lower()

    # Cafe chain detection (high-volume but typically disqualified —
    # they buy through corporate procurement, not direct origin)
    if any(k in text for k in ["cafe chain", "household cafe", "coffee chain"]):
        return "Cafe-Chain"
    if any(k in name for k in ["starbucks", "komeda", "dunkin", "tim hortons"]):
        return "Cafe-Chain"

    # Broker detection
    if any(k in text for k in ["broker", "brokerage"]):
        return "Broker"

    # Subscription / D2C
    if any(k in text for k in ["subscription", "office coffee service",
                                "d2c", "direct-to-consumer"]):
        return "Subscription"

    # Microlot buyer — very specific signal
    if any(k in text for k in ["microlot", "micro-lot", "competition",
                                "competition-grade", "world barista",
                                "5-25 bags", "reserved lot"]):
        return "Microlot Buyer"

    # Commercial importer — large-scale, ICC, FOB language
    if any(k in text for k in ["substantial volumes", "large volume",
                                "commodity", "commercial importer",
                                "fcl", "icc contract", "forward contract",
                                "global green coffee importer",
                                "major global", "industry giant"]):
        if "specialty" in text or "microlot" in text:
            return "Specialty Importer"  # hybrid → specialty wins
        return "Commercial Importer"

    # Roaster-direct — has "roaster", "roastery" but no "importer"
    if any(k in name for k in ["roaster", "roastery", "roasting"]):
        return "Roaster-Direct"
    if any(k in text for k in ["roaster", "roastery"]) and \
       not any(k in text for k in ["importer", "import", "trading",
                                    "green coffee importer"]):
        return "Roaster-Direct"

    # Specialty importer
    if any(k in text for k in ["specialty importer", "specialty green",
                                "specialty coffee importer", "green coffee importer",
                                "importer", "importing", "trading"]):
        if "specialty" in text or "microlot" in text or "single-origin" in text \
           or "direct trade" in text:
            return "Specialty Importer"
        return "Commercial Importer"

    # Fallback — assume specialty importer (most leads in this CSV are importers)
    return "Specialty Importer"


def recommend_vp(segment: str, notes: str) -> tuple[str, str]:
    """Pick the VP that best matches segment + notes. Returns (VP, rationale)."""
    text = notes.lower()

    # Strong sustainability signals → VP2
    if any(k in text for k in ["fairtrade", "fair trade", "rainforest alliance",
                                "organic", "eutr", "eudr", "deforestation",
                                "sustainab", "transparent", "traceab"]):
        if segment in ("Specialty Importer", "Commercial Importer",
                       "Roaster-Direct", "Microlot Buyer"):
            return ("VP2",
                    "Sustainability/traceability signals in profile fit EUDR-ready positioning.")

    # Microlot signals → VP4
    if any(k in text for k in ["microlot", "micro-lot", "competition",
                                "world barista", "competition-grade",
                                "5-25 bags", "reserved lot", "single-washing-station"]):
        return ("VP4",
                "Competition/microlot positioning — allocate reserved micro-lots.")

    # Commercial volume signals → VP3
    if any(k in text for k in ["fcl", "icc", "fob djibouti", "fob addis",
                                "commodity", "forward pricing", "substantial volumes",
                                "large volume", "global green coffee importer"]):
        return ("VP3",
                "Volume/FOB/ICC signals — position as reliable program FOB supplier.")

    # Default by segment
    if segment == "Microlot Buyer":
        return ("VP4", "Microlot buyer segment — exclusivity angle.")
    if segment == "Commercial Importer":
        return ("VP3", "Commercial importer — FOB program angle.")
    if segment == "Cafe-Chain":
        return ("VP3", "Cafe chain — likely buys via corporate procurement, FOB if direct.")
    if segment == "Broker":
        return ("VP1", "Broker — origin-access story differentiates from trader-only middlemen.")
    if segment == "Subscription":
        return ("VP2", "Subscription services respond to transparency/story angle.")
    # Default — Specialty Importer, Roaster-Direct
    return ("VP1", "Specialty/origin-access story — station-level traceability.")


def estimate_volume_band(segment: str, notes: str) -> str:
    """Estimate FCL/year based on segment + notes. Always 'confirm live'."""
    text = notes.lower()
    if any(k in text for k in ["substantial volumes", "large volume", "industry giant",
                                "major global", "massive", "global green coffee importer"]):
        return "20+ FCL (est) — confirm live"
    if segment == "Commercial Importer":
        return "5-20 FCL (est) — confirm live"
    if segment == "Cafe-Chain":
        return "20+ FCL (est) — but confirm they buy direct (often via corporate)"
    if segment == "Microlot Buyer":
        return "1-5 FCL (est) — confirm live; often less but high-value"
    if segment == "Roaster-Direct":
        return "1-5 FCL (est) — confirm live"
    if segment == "Broker":
        return "Unknown — broker volume depends on buyer lined up"
    if segment == "Subscription":
        return "1-5 FCL (est) — confirm live"
    # Specialty Importer default
    return "5-20 FCL (est) — confirm live"


def pick_authority_contact(row: dict) -> str:
    """Pick DM1 or DM2 as the first contact."""
    dm1_name = (row.get("decision_maker_1_name") or "").strip()
    dm1_title = (row.get("decision_maker_1_title") or "").strip().lower()
    dm1_li = (row.get("decision_maker_1_linkedin") or "").strip()
    dm1_email = (row.get("decision_maker_1_email") or "").strip()

    dm2_name = (row.get("decision_maker_2_name") or "").strip()
    dm2_title = (row.get("decision_maker_2_title") or "").strip().lower()
    dm2_li = (row.get("decision_maker_2_linkedin") or "").strip()
    dm2_email = (row.get("decision_maker_2_email") or "").strip()

    def is_found(v):
        return v and v.lower() not in ("not found", "", "n/a")

    dm1_ok = is_found(dm1_name) and (is_found(dm1_li) or is_found(dm1_email))
    dm2_ok = is_found(dm2_name) and (is_found(dm2_li) or is_found(dm2_email))

    # Buyer/sourcing title is preferred over C-suite for first outreach
    # UNLESS the company is small (specialty roaster) where founder IS the buyer
    dm1_is_buyer = any(k in dm1_title for k in
                       ["buyer", "sourcing", "procurement", "head of coffee",
                        "green coffee", "coffee buyer", "head buyer"])
    dm2_is_buyer = any(k in dm2_title for k in
                       ["buyer", "sourcing", "procurement", "head of coffee",
                        "green coffee", "coffee buyer", "head buyer"])

    if dm2_ok and dm2_is_buyer and not dm1_is_buyer:
        return "DM2"
    if dm1_ok:
        return "DM1"
    if dm2_ok:
        return "DM2"
    return "NONE"


def pick_sequence_type(row: dict, segment: str, notes: str) -> str:
    """Sequence A = LinkedIn-first, Sequence B = Email-first."""
    text = (row["company_name"] + " " + notes).lower()

    # Large commercial importers → Sequence B
    if any(k in text for k in LARGE_COMMERCIAL_KEYWORDS):
        return "Sequence B (Email-first)"

    dm1_li = (row.get("decision_maker_1_linkedin") or "").strip()
    dm2_li = (row.get("decision_maker_2_linkedin") or "").strip()
    has_linkedin = (dm1_li and dm1_li.lower() not in ("not found", "")) or \
                   (dm2_li and dm2_li.lower() not in ("not found", ""))

    general_email = (row.get("general_email") or "").strip()
    other_emails = (row.get("other_emails") or "").strip()
    dm1_email = (row.get("decision_maker_1_email") or "").strip()
    dm2_email = (row.get("decision_maker_2_email") or "").strip()
    has_email = (general_email and general_email.lower() != "not found") or \
                (other_emails and other_emails.lower() != "not found") or \
                (dm1_email and dm1_email.lower() != "not found") or \
                (dm2_email and dm2_email.lower() != "not found")

    if not has_linkedin and has_email:
        return "Sequence B (Email-first)"
    if not has_linkedin and not has_email:
        return "Sequence B (Email-first) — but no verified email, FLAG"

    return "Sequence A (LinkedIn-first)"


def pick_language(country: str) -> str:
    """Map country → outreach language."""
    # Country is last comma-separated part of headquarters
    if not country:
        return "EN"
    parts = [p.strip() for p in country.split(",")]
    country_clean = parts[-1].strip()
    # Direct match
    if country_clean in COUNTRY_LANGUAGE:
        return COUNTRY_LANGUAGE[country_clean]
    # Try contains
    for k, v in COUNTRY_LANGUAGE.items():
        if k.lower() in country_clean.lower():
            return v
    return "EN"


def assign_priority_tier(company_name: str, segment: str, notes: str,
                          disqualify: bool, data_confidence: str) -> str:
    if disqualify:
        return "Disqualify"
    text = (company_name + " " + notes).lower()

    # S-tier — known large buyers
    if any(k in text for k in S_TIER_KEYWORDS):
        return "S"

    # A-tier — established importers with high data confidence
    if segment in ("Specialty Importer", "Commercial Importer") and \
       data_confidence.lower() == "high":
        return "A"

    # B-tier — roaster-direct, microlot buyers, subscription
    if segment in ("Roaster-Direct", "Microlot Buyer", "Subscription"):
        return "B"

    # C-tier — brokers, low-confidence
    if segment == "Broker":
        return "C"
    if data_confidence.lower() in ("low", "medium"):
        return "C"

    # Default
    return "B"


def check_disqualify(row: dict, segment: str) -> tuple[bool, str]:
    """Return (disqualify_flag, reason)."""
    # Cafe-chain — usually buys via corporate procurement
    if segment == "Cafe-Chain":
        return (True, "Cafe chain — typically procures via corporate HQ, not direct origin. Re-engage only if a direct origin contact surfaces.")

    # No contact info at all
    dm1_li = (row.get("decision_maker_1_linkedin") or "").strip()
    dm2_li = (row.get("decision_maker_2_linkedin") or "").strip()
    dm1_email = (row.get("decision_maker_1_email") or "").strip()
    dm2_email = (row.get("decision_maker_2_email") or "").strip()
    general_email = (row.get("general_email") or "").strip()
    other_emails = (row.get("other_emails") or "").strip()
    phone = (row.get("phone") or "").strip()

    has_any_contact = (
        (dm1_li and dm1_li.lower() != "not found") or
        (dm2_li and dm2_li.lower() != "not found") or
        (dm1_email and dm1_email.lower() != "not found") or
        (dm2_email and dm2_email.lower() != "not found") or
        (general_email and general_email.lower() != "not found") or
        (other_emails and other_emails.lower() != "not found") or
        (phone and phone.lower() != "not found")
    )
    if not has_any_contact:
        return (True, "No verified contact info (no LinkedIn, no email, no phone). Cannot sequence.")

    return (False, "")


def build_handoff_notes(row: dict, segment: str, q3: str, seq: str,
                         lang: str, vp: str) -> str:
    """Free-form notes for Agent 3."""
    flags = []

    dm1_email = (row.get("decision_maker_1_email") or "").strip()
    dm2_email = (row.get("decision_maker_2_email") or "").strip()
    if q3 == "DM1" and (not dm1_email or dm1_email.lower() == "not found"):
        flags.append("DM1 has no verified email — LinkedIn-only outreach")
    if q3 == "DM2" and (not dm2_email or dm2_email.lower() == "not found"):
        flags.append("DM2 has no verified email — LinkedIn-only outreach")

    if lang != "EN":
        flags.append(f"Non-English outreach ({lang}) — use English body + native disclaimer line, per Agent 3 v2-#4 rules")

    if "FLAG" in seq:
        flags.append("No verified LinkedIn AND no verified email — sequence may stall, consider manual research first")

    if vp == "VP4":
        flags.append("Microlot VP — confirm Agent 1 has reserved lot availability before outreach")
    if vp == "VP3":
        flags.append("Commercial FOB VP — confirm Agent 1 has 5+ FCL monthly capacity before outreach")

    notes = row.get("notes", "")
    if "fairtrade" in notes.lower() or "fair trade" in notes.lower():
        flags.append("Fairtrade signals — lead with VP2 farmgate transparency angle")
    if "organic" in notes.lower():
        flags.append("Organic-certified buyer — confirm Agent 1 has organic lots available")

    if not flags:
        return "Clean handoff — no special flags"
    return " | ".join(flags)


# ----------------------------------------------------------------------
# Main enrichment loop
# ----------------------------------------------------------------------

def main():
    with INPUT.open() as f:
        reader = csv.DictReader(f)
        original_fields = reader.fieldnames
        rows = list(reader)

    new_fields = [
        "recommended_vp",
        "vp_rationale",
        "q1_volume_band_est",
        "q2_segment_class",
        "q3_authority_contact",
        "q4_timing_signal",
        "q5_sample_policy_est",
        "sequence_type",
        "outreach_language",
        "priority_tier",
        "disqualify_flag",
        "disqualify_reason",
        "agent3_handoff_notes",
    ]

    output_fields = list(original_fields) + new_fields

    stats = {
        "total": 0,
        "disqualified": 0,
        "tier_S": 0, "tier_A": 0, "tier_B": 0, "tier_C": 0,
        "vp1": 0, "vp2": 0, "vp3": 0, "vp4": 0,
        "seq_A": 0, "seq_B": 0,
        "langs": {},
        "segments": {},
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=output_fields)
        writer.writeheader()

        for row in rows:
            stats["total"] += 1

            company = row.get("company_name", "")
            notes = row.get("notes", "")
            country = row.get("headquarters", "")
            data_conf = row.get("data_confidence", "")

            segment = detect_segment(company, notes)
            stats["segments"][segment] = stats["segments"].get(segment, 0) + 1

            vp, vp_why = recommend_vp(segment, notes)
            stats[f"vp{vp[-1]}"] += 1

            q1 = estimate_volume_band(segment, notes)
            q3 = pick_authority_contact(row)
            q4 = "Unknown — confirm live (June 2026: ask if sourcing 25/26 spot or 26/27 forward)"
            q5 = "Unknown — confirm live (test willingness to pay sample shipping)"

            disqualify, reason = check_disqualify(row, segment)
            if disqualify:
                stats["disqualified"] += 1

            tier = assign_priority_tier(company, segment, notes, disqualify, data_conf)
            stats[f"tier_{tier}"] = stats.get(f"tier_{tier}", 0) + 1

            seq = pick_sequence_type(row, segment, notes)
            if seq.startswith("Sequence A"):
                stats["seq_A"] += 1
            else:
                stats["seq_B"] += 1

            lang = pick_language(country)
            stats["langs"][lang] = stats["langs"].get(lang, 0) + 1

            handoff = build_handoff_notes(row, segment, q3, seq, lang, vp)

            enriched = dict(row)
            enriched.update({
                "recommended_vp": vp,
                "vp_rationale": vp_why,
                "q1_volume_band_est": q1,
                "q2_segment_class": segment,
                "q3_authority_contact": q3,
                "q4_timing_signal": q4,
                "q5_sample_policy_est": q5,
                "sequence_type": seq,
                "outreach_language": lang,
                "priority_tier": tier,
                "disqualify_flag": "Yes" if disqualify else "No",
                "disqualify_reason": reason,
                "agent3_handoff_notes": handoff,
            })

            writer.writerow(enriched)

    print(f"\n✓ Enriched {stats['total']} leads → {OUTPUT}")
    print(f"\n--- Summary ---")
    print(f"Disqualified:        {stats['disqualified']}")
    print(f"Priority tiers:      S={stats['tier_S']}  A={stats['tier_A']}  B={stats['tier_B']}  C={stats['tier_C']}  Disq={stats['disqualified']}")
    print(f"VP distribution:     VP1={stats['vp1']}  VP2={stats['vp2']}  VP3={stats['vp3']}  VP4={stats['vp4']}")
    print(f"Sequence:            A (LinkedIn)={stats['seq_A']}  B (Email)={stats['seq_B']}")
    print(f"Segments:")
    for s, n in sorted(stats["segments"].items(), key=lambda x: -x[1]):
        print(f"  {n:4d}  {s}")
    print(f"Languages:")
    for l, n in sorted(stats["langs"].items(), key=lambda x: -x[1]):
        print(f"  {n:4d}  {l}")


if __name__ == "__main__":
    main()
