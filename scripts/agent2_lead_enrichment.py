#!/usr/bin/env python3
"""
Agent 2 — Lead Research & Enrichment Specialist (Ethiopian Coffee Export)
=========================================================================

Production Python implementation of the Agent 2 prompt. Takes a raw lead
list CSV (with the original 18-column schema) and outputs a fully enriched
31-column CSV ready for Agent 3 (Outreach & Follow-Up) to consume.

USAGE
-----
    # Enrich a single input file → overwrite the agent3-ready output
    python agent2_lead_enrichment.py \\
        --input  /home/z/my-project/upload/enriched_coffee_leads.csv \\
        --output /home/z/my-project/download/enriched_coffee_leads_agent3_ready.csv

    # Append new leads to the existing agent3-ready CSV (dedup by company+HQ)
    python agent2_lead_enrichment.py \\
        --input  /path/to/new_leads.csv \\
        --output /home/z/my-project/download/enriched_coffee_leads_agent3_ready.csv \\
        --append \\
        --dedup-key company_name,headquarters

    # Dry-run mode — print KPIs without writing the output file
    python agent2_lead_enrichment.py --input ... --dry-run

    # Quiet mode — only print the KPI summary
    python agent2_lead_enrichment.py --input ... --output ... --quiet

REQUIREMENTS
------------
    Python 3.8+  (standard library only — no external deps)

SCHEMA
------
Input columns (18):
    company_name, website, contact_page_url, general_email, other_emails,
    linkedin_company_page, decision_maker_1_name, decision_maker_1_title,
    decision_maker_1_linkedin, decision_maker_1_email,
    decision_maker_2_name, decision_maker_2_title,
    decision_maker_2_linkedin, decision_maker_2_email,
    phone, headquarters, data_confidence, notes

Output columns (31):
    [all 18 input columns] +
    recommended_vp, vp_rationale, q1_volume_band_est, q2_segment_class,
    q3_authority_contact, q4_timing_signal, q5_sample_policy_est,
    sequence_type, outreach_language, priority_tier,
    disqualify_flag, disqualify_reason, agent3_handoff_notes
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional


# =====================================================================
# CONSTANTS — keywords, language map, exact strings
# =====================================================================

# Known S-tier buyers — these get priority_tier=S regardless of heuristic
S_TIER_KEYWORDS: tuple[str, ...] = (
    "falcon coffee", "royal coffee", "cafe imports", "trabocca",
    "nordic approach", "ally coffee", "atlas coffee", "sucafina",
    "volcafe", "ecom", "olam", "neumann", "drwakefield",
    "list + beisler", "mercon", "export trading group", "etg",
    "cardassilaris", "rené röst", "rene rost", "ogawa",
)

# Large commercial importers — Sequence B (email-first)
LARGE_COMMERCIAL_KEYWORDS: tuple[str, ...] = (
    "volcafe", "ecom", "olam", "sucafina", "neumann", "mercon",
    "starbucks", "nestle", "nespresso", "jacobs", "tchibo",
    "lavazza", "illy", "segafredo", "costa coffee",
)

# Countries → outreach language (English body + native disclaimer for non-Latin)
COUNTRY_LANGUAGE: dict[str, str] = {
    # English-speaking
    "USA": "EN", "United States": "EN", "United States of America": "EN",
    "US": "EN",
    "Canada": "EN",
    "United Kingdom": "EN", "UK": "EN", "England": "EN",
    "Scotland": "EN", "Wales": "EN", "Ireland": "EN",
    "Australia": "EN", "New Zealand": "EN", "South Africa": "EN",
    # DACH
    "Germany": "DE", "Austria": "DE",
    # Other European (English-friendly)
    "Belgium": "EN", "Netherlands": "EN", "Switzerland": "EN",
    "Spain": "EN", "Portugal": "EN", "Sweden": "EN", "Norway": "EN",
    "Denmark": "EN", "Finland": "EN", "Poland": "EN", "Czech Republic": "EN",
    "Hungary": "EN", "Greece": "EN",
    # Latin script — non-English
    "France": "FR",
    "Italy": "IT",
    # Non-Latin script — use English body + native disclaimer
    "Japan": "JA",
    "South Korea": "KO", "Korea": "KO",
    "China": "ZH", "Hong Kong": "ZH", "Taiwan": "ZH",
    "Saudi Arabia": "AR",
    "UAE": "AR", "United Arab Emirates": "AR",
    "Kuwait": "AR", "Qatar": "AR", "Bahrain": "AR", "Oman": "AR",
    "Egypt": "AR", "Jordan": "AR", "Lebanon": "AR",
    "Turkey": "TR", "Türkiye": "TR",
    "Russia": "RU",
}

# Allowed segment values (q2_segment_class)
ALLOWED_SEGMENTS: frozenset[str] = frozenset({
    "Specialty Importer", "Commercial Importer", "Roaster-Direct",
    "Microlot Buyer", "Broker", "Cafe-Chain", "Subscription",
})

# Allowed VP values (recommended_vp)
ALLOWED_VPS: frozenset[str] = frozenset({"VP1", "VP2", "VP3", "VP4"})

# Allowed priority tiers
ALLOWED_TIERS: frozenset[str] = frozenset({"S", "A", "B", "C", "Disqualify"})

# Q4 / Q5 are always the exact strings below — never guess
Q4_TIMING_SIGNAL: str = (
    "Unknown — confirm live (June 2026: ask if sourcing 25/26 spot or 26/27 forward)"
)
Q5_SAMPLE_POLICY_EST: str = (
    "Unknown — confirm live (test willingness to pay sample shipping)"
)

# Buyer/sourcing titles — used in Q3 authority contact logic
BUYER_TITLE_KEYWORDS: tuple[str, ...] = (
    "buyer", "sourcing", "procurement", "head of coffee",
    "green coffee", "coffee buyer", "head buyer",
)

# Volume signal keywords (push to 20+ FCL band)
VOLUME_SIGNAL_KEYWORDS: tuple[str, ...] = (
    "substantial volumes", "large volume", "industry giant",
    "major global", "massive", "global green coffee importer",
)

# VP2 trigger keywords (sustainability/traceability)
VP2_KEYWORDS: tuple[str, ...] = (
    "fairtrade", "fair trade", "rainforest alliance", "organic",
    "eudr", "deforestation", "sustainab", "transparent", "traceab",
)

# VP4 trigger keywords (microlot exclusivity)
VP4_KEYWORDS: tuple[str, ...] = (
    "microlot", "micro-lot", "competition", "world barista",
    "competition-grade", "5-25 bags", "5–25 bags", "reserved lot",
    "single-washing-station",
)

# VP3 trigger keywords (commercial FOB)
VP3_KEYWORDS: tuple[str, ...] = (
    "fcl", "icc", "fob djibouti", "fob addis", "commodity",
    "forward pricing", "substantial volumes", "large volume",
    "global green coffee importer", "industry giant",
)


# =====================================================================
# HELPERS
# =====================================================================

def _is_found(value: Optional[str]) -> bool:
    """True if a contact field has a usable value (not empty, not 'Not found')."""
    if value is None:
        return False
    v = str(value).strip().lower()
    return v not in ("", "not found", "n/a", "none", "null")


def _normalize_country(headquarters: str) -> str:
    """Extract the country from a headquarters field like 'Lewes, United Kingdom'."""
    if not headquarters:
        return ""
    parts = [p.strip() for p in headquarters.split(",")]
    return parts[-1] if parts else ""


def _contains_any(text: str, keywords: Iterable[str]) -> bool:
    """Case-insensitive substring match against any keyword."""
    if not text:
        return False
    t = text.lower()
    return any(k in t for k in keywords)


# =====================================================================
# CLASSIFICATION FUNCTIONS — one per enrichment column
# =====================================================================

def detect_segment(company_name: str, notes: str) -> str:
    """Classify company into one of the 7 allowed segments."""
    text = (company_name + " " + notes).lower()
    name = (company_name or "").lower()

    # 1. Cafe chain detection (high-volume but typically disqualified)
    if _contains_any(text, ("cafe chain", "household cafe", "coffee chain")):
        return "Cafe-Chain"
    if _contains_any(name, ("starbucks", "komeda", "dunkin", "tim hortons")):
        return "Cafe-Chain"

    # 2. Broker detection
    if _contains_any(text, ("broker", "brokerage")):
        return "Broker"

    # 3. Subscription / D2C
    if _contains_any(text, ("subscription", "office coffee service",
                            "d2c", "direct-to-consumer")):
        return "Subscription"

    # 4. Microlot buyer — very specific signal
    if _contains_any(text, VP4_KEYWORDS):
        return "Microlot Buyer"

    # 5. Commercial importer — large-scale, ICC, FOB language
    if _contains_any(text, VP3_KEYWORDS):
        # Specialty/microlot signals override commercial
        if _contains_any(text, ("specialty", "microlot", "single-origin")):
            return "Specialty Importer"
        return "Commercial Importer"

    # 6. Roaster-direct — has "roaster"/"roastery" but no "importer"/"trading"
    if _contains_any(name, ("roaster", "roastery", "roasting")):
        return "Roaster-Direct"
    if _contains_any(text, ("roaster", "roastery")) and \
       not _contains_any(text, ("importer", "importing", "trading",
                                "green coffee importer")):
        return "Roaster-Direct"

    # 7. Specialty importer — default for importers with quality signals
    if _contains_any(text, ("specialty importer", "specialty green",
                            "specialty coffee importer",
                            "green coffee importer", "importer",
                            "importing", "trading")):
        if _contains_any(text, ("specialty", "microlot", "single-origin",
                                "direct trade")):
            return "Specialty Importer"
        return "Commercial Importer"

    # 8. Fallback — assume specialty importer (most green-coffee buyers are)
    return "Specialty Importer"


def recommend_vp(segment: str, notes: str) -> tuple[str, str]:
    """Pick the VP that best matches segment + notes. Returns (VP, rationale)."""

    # Rule 1 — sustainability signals → VP2
    if _contains_any(notes, VP2_KEYWORDS):
        if segment in ("Specialty Importer", "Commercial Importer",
                       "Roaster-Direct", "Microlot Buyer"):
            return ("VP2",
                    "Sustainability/traceability signals in profile fit EUDR-ready positioning.")

    # Rule 2 — microlot signals → VP4
    if _contains_any(notes, VP4_KEYWORDS):
        return ("VP4",
                "Competition/microlot positioning — allocate reserved micro-lots.")

    # Rule 3 — commercial volume signals → VP3
    if _contains_any(notes, VP3_KEYWORDS):
        return ("VP3",
                "Volume/FOB/ICC signals — position as reliable program FOB supplier.")

    # Rule 4 — default by segment
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
    """Estimate FCL/year band based on segment + notes. Always 'confirm live'."""
    if _contains_any(notes, VOLUME_SIGNAL_KEYWORDS):
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
    """Pick DM1 or DM2 as the first contact. Returns 'DM1' / 'DM2' / 'NONE'."""
    dm1_name = (row.get("decision_maker_1_name") or "").strip()
    dm1_title = (row.get("decision_maker_1_title") or "").strip().lower()
    dm1_li = (row.get("decision_maker_1_linkedin") or "").strip()
    dm1_email = (row.get("decision_maker_1_email") or "").strip()

    dm2_name = (row.get("decision_maker_2_name") or "").strip()
    dm2_title = (row.get("decision_maker_2_title") or "").strip().lower()
    dm2_li = (row.get("decision_maker_2_linkedin") or "").strip()
    dm2_email = (row.get("decision_maker_2_email") or "").strip()

    dm1_ok = _is_found(dm1_name) and (_is_found(dm1_li) or _is_found(dm1_email))
    dm2_ok = _is_found(dm2_name) and (_is_found(dm2_li) or _is_found(dm2_email))

    dm1_is_buyer = _contains_any(dm1_title, BUYER_TITLE_KEYWORDS)
    dm2_is_buyer = _contains_any(dm2_title, BUYER_TITLE_KEYWORDS)

    # If DM2 has buyer title AND DM1 doesn't, prefer DM2
    if dm2_ok and dm2_is_buyer and not dm1_is_buyer:
        return "DM2"
    if dm1_ok:
        return "DM1"
    if dm2_ok:
        return "DM2"
    return "NONE"


def pick_sequence_type(row: dict, segment: str, notes: str) -> str:
    """Sequence A = LinkedIn-first, Sequence B = Email-first."""
    text = ((row.get("company_name") or "") + " " + notes).lower()

    # Large commercial importers → Sequence B
    if _contains_any(text, LARGE_COMMERCIAL_KEYWORDS):
        return "Sequence B (Email-first)"

    dm1_li = (row.get("decision_maker_1_linkedin") or "").strip()
    dm2_li = (row.get("decision_maker_2_linkedin") or "").strip()
    has_linkedin = _is_found(dm1_li) or _is_found(dm2_li)

    general_email = (row.get("general_email") or "").strip()
    other_emails = (row.get("other_emails") or "").strip()
    dm1_email = (row.get("decision_maker_1_email") or "").strip()
    dm2_email = (row.get("decision_maker_2_email") or "").strip()
    has_email = (_is_found(general_email) or _is_found(other_emails)
                 or _is_found(dm1_email) or _is_found(dm2_email))

    if not has_linkedin and has_email:
        return "Sequence B (Email-first)"
    if not has_linkedin and not has_email:
        return "Sequence B (Email-first) — but no verified email, FLAG"

    # Default — LinkedIn-first
    return "Sequence A (LinkedIn-first)"


def pick_language(country: str) -> str:
    """Map country → outreach language."""
    if not country:
        return "EN"
    country_clean = _normalize_country(country)
    if country_clean in COUNTRY_LANGUAGE:
        return COUNTRY_LANGUAGE[country_clean]
    # Try contains match
    for k, v in COUNTRY_LANGUAGE.items():
        if k.lower() in country_clean.lower():
            return v
    return "EN"


def check_disqualify(row: dict, segment: str) -> tuple[bool, str]:
    """Return (disqualify_flag, reason)."""
    # Cafe-chain — usually buys via corporate procurement
    if segment == "Cafe-Chain":
        return (True,
                "Cafe chain — typically procures via corporate HQ, not direct "
                "origin. Re-engage only if a direct origin contact surfaces.")

    # No contact info at all
    has_any_contact = (
        _is_found(row.get("decision_maker_1_linkedin"))
        or _is_found(row.get("decision_maker_2_linkedin"))
        or _is_found(row.get("decision_maker_1_email"))
        or _is_found(row.get("decision_maker_2_email"))
        or _is_found(row.get("general_email"))
        or _is_found(row.get("other_emails"))
        or _is_found(row.get("phone"))
    )
    if not has_any_contact:
        return (True,
                "No verified contact info (no LinkedIn, no email, no phone). "
                "Cannot sequence.")

    return (False, "")


def assign_priority_tier(company_name: str, segment: str, notes: str,
                         disqualify: bool, data_confidence: str) -> str:
    """Assign S / A / B / C / Disqualify."""
    if disqualify:
        return "Disqualify"
    text = ((company_name or "") + " " + (notes or "")).lower()

    # S-tier — known large buyers
    if _contains_any(text, S_TIER_KEYWORDS):
        return "S"

    # A-tier — established importers with high data confidence
    if segment in ("Specialty Importer", "Commercial Importer") and \
       (data_confidence or "").lower() == "high":
        return "A"

    # B-tier — roaster-direct, microlot buyers, subscription
    if segment in ("Roaster-Direct", "Microlot Buyer", "Subscription"):
        return "B"

    # C-tier — brokers, low-confidence
    if segment == "Broker":
        return "C"
    if (data_confidence or "").lower() in ("low", "medium"):
        return "C"

    # Default
    return "B"


def build_handoff_notes(row: dict, segment: str, q3: str, seq: str,
                        lang: str, vp: str) -> str:
    """Build pipe-separated flags for Agent 3."""
    flags: list[str] = []

    dm1_email = (row.get("decision_maker_1_email") or "").strip()
    dm2_email = (row.get("decision_maker_2_email") or "").strip()

    if q3 == "DM1" and not _is_found(dm1_email):
        flags.append("DM1 has no verified email — LinkedIn-only outreach")
    if q3 == "DM2" and not _is_found(dm2_email):
        flags.append("DM2 has no verified email — LinkedIn-only outreach")

    if lang != "EN":
        flags.append(
            f"Non-English outreach ({lang}) — use English body + native "
            f"disclaimer line, per Agent 3 v2-#4 rules"
        )

    if "FLAG" in seq:
        flags.append(
            "No verified LinkedIn AND no verified email — sequence may stall, "
            "consider manual research first"
        )

    if vp == "VP4":
        flags.append(
            "Microlot VP — confirm Agent 1 has reserved lot availability "
            "before outreach"
        )
    if vp == "VP3":
        flags.append(
            "Commercial FOB VP — confirm Agent 1 has 5+ FCL monthly capacity "
            "before outreach"
        )

    notes = row.get("notes", "") or ""
    if _contains_any(notes, ("fairtrade", "fair trade")):
        flags.append("Fairtrade signals — lead with VP2 farmgate transparency angle")
    if "organic" in notes.lower():
        flags.append("Organic-certified buyer — confirm Agent 1 has organic lots available")

    if not flags:
        return "Clean handoff — no special flags"
    return " | ".join(flags)


# =====================================================================
# CORE ENRICHMENT
# =====================================================================

@dataclass
class EnrichmentResult:
    """All 13 enrichment columns for a single lead."""
    recommended_vp: str
    vp_rationale: str
    q1_volume_band_est: str
    q2_segment_class: str
    q3_authority_contact: str
    q4_timing_signal: str
    q5_sample_policy_est: str
    sequence_type: str
    outreach_language: str
    priority_tier: str
    disqualify_flag: str
    disqualify_reason: str
    agent3_handoff_notes: str


def enrich_row(row: dict) -> EnrichmentResult:
    """Run all enrichment rules on a single lead row."""
    company = row.get("company_name", "") or ""
    notes = row.get("notes", "") or ""
    country = row.get("headquarters", "") or ""
    data_conf = row.get("data_confidence", "") or ""

    # Classify
    segment = detect_segment(company, notes)
    vp, vp_why = recommend_vp(segment, notes)
    q1 = estimate_volume_band(segment, notes)
    q3 = pick_authority_contact(row)
    disqualify, reason = check_disqualify(row, segment)
    tier = assign_priority_tier(company, segment, notes, disqualify, data_conf)
    seq = pick_sequence_type(row, segment, notes)
    lang = pick_language(country)
    handoff = build_handoff_notes(row, segment, q3, seq, lang, vp)

    return EnrichmentResult(
        recommended_vp=vp,
        vp_rationale=vp_why,
        q1_volume_band_est=q1,
        q2_segment_class=segment,
        q3_authority_contact=q3,
        q4_timing_signal=Q4_TIMING_SIGNAL,
        q5_sample_policy_est=Q5_SAMPLE_POLICY_EST,
        sequence_type=seq,
        outreach_language=lang,
        priority_tier=tier,
        disqualify_flag="Yes" if disqualify else "No",
        disqualify_reason=reason,
        agent3_handoff_notes=handoff,
    )


# =====================================================================
# INPUT / OUTPUT
# =====================================================================

# Original 18 input columns (in order)
INPUT_COLUMNS: tuple[str, ...] = (
    "company_name", "website", "contact_page_url", "general_email",
    "other_emails", "linkedin_company_page",
    "decision_maker_1_name", "decision_maker_1_title",
    "decision_maker_1_linkedin", "decision_maker_1_email",
    "decision_maker_2_name", "decision_maker_2_title",
    "decision_maker_2_linkedin", "decision_maker_2_email",
    "phone", "headquarters", "data_confidence", "notes",
)

# 13 enrichment columns (appended to input)
ENRICHMENT_COLUMNS: tuple[str, ...] = (
    "recommended_vp", "vp_rationale", "q1_volume_band_est",
    "q2_segment_class", "q3_authority_contact", "q4_timing_signal",
    "q5_sample_policy_est", "sequence_type", "outreach_language",
    "priority_tier", "disqualify_flag", "disqualify_reason",
    "agent3_handoff_notes",
)

# Full output schema (31 columns)
OUTPUT_COLUMNS: tuple[str, ...] = INPUT_COLUMNS + ENRICHMENT_COLUMNS


def read_input(path: Path) -> list[dict]:
    """Read raw leads from CSV. Tolerates missing columns (fills with '')."""
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = []
        for raw in reader:
            # Normalize: ensure all expected input columns exist
            row = {col: (raw.get(col) or "").strip() for col in INPUT_COLUMNS}
            # Preserve any extra columns from input (we'll drop them at write time)
            rows.append(row)
        return rows


def read_existing_output(path: Path) -> list[dict]:
    """Read an existing agent3-ready CSV (for append mode). Returns [] if missing."""
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [dict(r) for r in reader]


def dedup_key(row: dict, key_fields: list[str]) -> str:
    """Build a normalized dedup key from the specified fields."""
    parts = []
    for f in key_fields:
        v = (row.get(f) or "").strip().lower()
        # Light normalization: strip common punctuation, collapse whitespace
        v = " ".join(v.split())
        parts.append(v)
    return "|".join(parts)


def write_output(path: Path, rows: list[dict]) -> None:
    """Write enriched rows to CSV using the exact 31-column schema."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(OUTPUT_COLUMNS),
                                extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            # Ensure all 31 columns present (fill missing with "")
            out = {col: row.get(col, "") for col in OUTPUT_COLUMNS}
            writer.writerow(out)


# =====================================================================
# KPI / REPORTING
# =====================================================================

@dataclass
class KPIReport:
    total: int = 0
    duplicates_dropped: int = 0
    disqualified: int = 0
    tiers: Counter = field(default_factory=Counter)
    vps: Counter = field(default_factory=Counter)
    segments: Counter = field(default_factory=Counter)
    sequences: Counter = field(default_factory=Counter)
    languages: Counter = field(default_factory=Counter)
    vp_bias_flag: str = ""

    def add(self, result: EnrichmentResult) -> None:
        self.total += 1
        self.tiers[result.priority_tier] += 1
        self.vps[result.recommended_vp] += 1
        self.segments[result.q2_segment_class] += 1
        if result.sequence_type.startswith("Sequence A"):
            self.sequences["A"] += 1
        else:
            self.sequences["B"] += 1
        self.languages[result.outreach_language] += 1
        if result.disqualify_flag == "Yes":
            self.disqualified += 1

    def finalize(self) -> None:
        """Detect VP bias — flag if any single VP holds >70% of leads."""
        if not self.total:
            return
        for vp, n in self.vps.items():
            if n / self.total > 0.70:
                self.vp_bias_flag = (
                    f"VP bias detected: {vp} holds {n}/{self.total} "
                    f"({n/self.total:.0%}) of leads — review segment mix in sourcing."
                )
                return

    def format(self) -> str:
        lines = [
            "",
            "=" * 60,
            "Agent 2 — Enrichment KPI Report",
            "=" * 60,
            f"Total leads processed:    {self.total}",
            f"Duplicates dropped:       {self.duplicates_dropped}",
            f"Disqualified:             {self.disqualified}",
            "",
            "Priority tiers:",
        ]
        for tier in ("S", "A", "B", "C", "Disqualify"):
            lines.append(f"  {tier:12s} = {self.tiers.get(tier, 0):4d}")
        lines.append("")
        lines.append("VP distribution:")
        for vp in ("VP1", "VP2", "VP3", "VP4"):
            lines.append(f"  {vp:12s} = {self.vps.get(vp, 0):4d}")
        lines.append("")
        lines.append("Sequence:")
        lines.append(f"  A (LinkedIn) = {self.sequences.get('A', 0):4d}")
        lines.append(f"  B (Email)    = {self.sequences.get('B', 0):4d}")
        lines.append("")
        lines.append("Segments:")
        for seg, n in sorted(self.segments.items(), key=lambda x: -x[1]):
            lines.append(f"  {n:4d}  {seg}")
        lines.append("")
        lines.append("Languages:")
        for lang, n in sorted(self.languages.items(), key=lambda x: -x[1]):
            lines.append(f"  {n:4d}  {lang}")
        if self.vp_bias_flag:
            lines.append("")
            lines.append(f"⚠️  {self.vp_bias_flag}")
        lines.append("=" * 60)
        lines.append("")
        return "\n".join(lines)


# =====================================================================
# MAIN
# =====================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Agent 2 — Lead Research & Enrichment Specialist",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--input", "-i", required=True, type=Path,
        help="Path to the raw leads input CSV (18-column schema).",
    )
    parser.add_argument(
        "--output", "-o", type=Path,
        default=Path("/home/z/my-project/download/enriched_coffee_leads_agent3_ready.csv"),
        help="Path to the enriched output CSV (31-column schema).",
    )
    parser.add_argument(
        "--append", action="store_true",
        help="Append to existing output instead of overwriting. "
             "Deduplicates against existing rows.",
    )
    parser.add_argument(
        "--dedup-key", default="company_name,headquarters",
        help="Comma-separated column names used as dedup key.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print KPIs without writing the output file.",
    )
    parser.add_argument(
        "--quiet", action="store_true",
        help="Suppress per-row progress output.",
    )
    args = parser.parse_args()

    # Validate input
    if not args.input.exists():
        print(f"ERROR: Input file not found: {args.input}", file=sys.stderr)
        return 2

    # Read input
    new_rows = read_input(args.input)
    if not new_rows:
        print(f"ERROR: No rows found in input file: {args.input}", file=sys.stderr)
        return 2

    # Dedup against existing output (if --append mode)
    existing_rows: list[dict] = []
    existing_keys: set[str] = set()
    if args.append:
        existing_rows = read_existing_output(args.output)
        key_fields = [f.strip() for f in args.dedup_key.split(",")]
        for r in existing_rows:
            existing_keys.add(dedup_key(r, key_fields))

    key_fields = [f.strip() for f in args.dedup_key.split(",")]
    deduped_new_rows: list[dict] = []
    seen_in_this_run: set[str] = set()
    duplicates_dropped = 0
    for row in new_rows:
        k = dedup_key(row, key_fields)
        if k in existing_keys or k in seen_in_this_run:
            duplicates_dropped += 1
            continue
        seen_in_this_run.add(k)
        deduped_new_rows.append(row)

    # Enrich each new row
    kpi = KPIReport(duplicates_dropped=duplicates_dropped)
    enriched_new_rows: list[dict] = []
    for row in deduped_new_rows:
        result = enrich_row(row)
        kpi.add(result)
        enriched = dict(row)
        # Unpack the dataclass into the row dict
        for field_name in ENRICHMENT_COLUMNS:
            enriched[field_name] = getattr(result, field_name)
        enriched_new_rows.append(enriched)
        if not args.quiet:
            print(f"  ✓ {row.get('company_name','')[:45]:45s} "
                  f"→ {result.priority_tier} / {result.recommended_vp} / "
                  f"{result.q2_segment_class}")

    kpi.finalize()

    # Write output
    if args.dry_run:
        print("\n[dry-run] No output file written.")
    else:
        all_rows = existing_rows + enriched_new_rows if args.append else enriched_new_rows
        write_output(args.output, all_rows)
        print(f"\n✓ Wrote {len(all_rows)} rows to {args.output}")

    # Print KPI report
    print(kpi.format())

    # Notify Agent 3 (per the handoff protocol in the Agent 2 prompt)
    n = len(enriched_new_rows)
    if not args.dry_run and n > 0:
        s_tier = kpi.tiers.get("S", 0)
        non_en = sum(c for lang, c in kpi.languages.items() if lang != "EN")
        print("Handoff notification for Agent 3:")
        print(f"  → {n} new leads appended, {kpi.disqualified} disqualified, "
              f"{s_tier} S-tier, {non_en} require non-EN outreach.")
        print(f"  → CSV path: {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
