#!/usr/bin/env python3
"""
Schema Validator for Agent 2's Output CSV
==========================================

Validates that an agent3-ready CSV conforms to the exact 31-column schema
that Agent 3 (Outreach & Follow-Up) expects. Runs the checks referenced in
Agent 2's "Handoff to Agent 3" protocol.

USAGE
-----
    python validate_leads_csv.py /path/to/enriched_coffee_leads_agent3_ready.csv

    # Strict mode — fail on any warning (exit 2)
    python validate_leads_csv.py --strict /path/to/file.csv

    # Quiet mode — only print errors
    python validate_leads_csv.py -q /path/to/file.csv

EXIT CODES
----------
    0 = all checks passed (warnings allowed)
    1 = validation error (missing columns, wrong types, bad values)
    2 = strict mode + warnings present
    3 = file not found / unreadable
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path


# =====================================================================
# EXPECTED SCHEMA — must match agent2_lead_enrichment.py exactly
# =====================================================================

INPUT_COLUMNS: tuple[str, ...] = (
    "company_name", "website", "contact_page_url", "general_email",
    "other_emails", "linkedin_company_page",
    "decision_maker_1_name", "decision_maker_1_title",
    "decision_maker_1_linkedin", "decision_maker_1_email",
    "decision_maker_2_name", "decision_maker_2_title",
    "decision_maker_2_linkedin", "decision_maker_2_email",
    "phone", "headquarters", "data_confidence", "notes",
)

ENRICHMENT_COLUMNS: tuple[str, ...] = (
    "recommended_vp", "vp_rationale", "q1_volume_band_est",
    "q2_segment_class", "q3_authority_contact", "q4_timing_signal",
    "q5_sample_policy_est", "sequence_type", "outreach_language",
    "priority_tier", "disqualify_flag", "disqualify_reason",
    "agent3_handoff_notes",
)

EXPECTED_COLUMNS: tuple[str, ...] = INPUT_COLUMNS + ENRICHMENT_COLUMNS

ALLOWED_SEGMENTS = frozenset({
    "Specialty Importer", "Commercial Importer", "Roaster-Direct",
    "Microlot Buyer", "Broker", "Cafe-Chain", "Subscription",
})

ALLOWED_VPS = frozenset({"VP1", "VP2", "VP3", "VP4"})

ALLOWED_TIERS = frozenset({"S", "A", "B", "C", "Disqualify"})

ALLOWED_LANGS = frozenset({"EN", "DE", "FR", "IT", "JA", "KO", "ZH",
                            "AR", "TR", "RU"})

ALLOWED_AUTHORITY = frozenset({"DM1", "DM2", "NONE"})

ALLOWED_DISQUALIFY_FLAG = frozenset({"Yes", "No"})

EXPECTED_Q4 = ("Unknown — confirm live (June 2026: ask if sourcing "
               "25/26 spot or 26/27 forward)")

EXPECTED_Q5 = ("Unknown — confirm live (test willingness to pay "
               "sample shipping)")


# =====================================================================
# VALIDATOR
# =====================================================================

class ValidationReport:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.stats: Counter = Counter()

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warning(self, msg: str) -> None:
        self.warnings.append(msg)

    @property
    def ok(self) -> bool:
        return not self.errors

    def format(self) -> str:
        lines = []
        if self.errors:
            lines.append(f"❌ {len(self.errors)} ERROR(S):")
            for e in self.errors:
                lines.append(f"  - {e}")
        else:
            lines.append("✅ All schema checks passed.")
        if self.warnings:
            lines.append("")
            lines.append(f"⚠️  {len(self.warnings)} WARNING(S):")
            for w in self.warnings:
                lines.append(f"  - {w}")
        if self.stats:
            lines.append("")
            lines.append("Stats:")
            for k, v in sorted(self.stats.items()):
                lines.append(f"  {k:30s} = {v}")
        return "\n".join(lines)


def validate(path: Path, report: ValidationReport) -> None:
    """Run all validation checks against the CSV at `path`."""

    # 1. File exists
    if not path.exists():
        report.error(f"File not found: {path}")
        return

    # 2. Read CSV
    try:
        with path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            header = reader.fieldnames or []
            rows = list(reader)
    except Exception as e:
        report.error(f"Could not read CSV: {e}")
        return

    # 3. Header check — exact column set + order
    if list(header) != list(EXPECTED_COLUMNS):
        missing = set(EXPECTED_COLUMNS) - set(header)
        extra = set(header) - set(EXPECTED_COLUMNS)
        if missing:
            report.error(f"Missing columns: {sorted(missing)}")
        if extra:
            report.error(f"Extra columns not allowed: {sorted(extra)}")
        if not missing and not extra:
            # Same set, wrong order
            report.error(
                f"Column order mismatch. Expected: {list(EXPECTED_COLUMNS)[:5]}..., "
                f"got: {list(header)[:5]}..."
            )

    if not rows:
        report.error("CSV has no data rows (header only).")
        return

    report.stats["total_rows"] = len(rows)

    # 4. Per-row validation
    bad_rows = 0
    for i, row in enumerate(rows, start=2):  # row 1 is the header
        row_errors: list[str] = []

        # 4a. No blank enrichment columns — with the following exceptions:
        #     - disqualify_reason may be blank when disqualify_flag=No
        #       (this is explicitly required by the Agent 2 spec)
        dq_flag = (row.get("disqualify_flag") or "").strip()
        for col in ENRICHMENT_COLUMNS:
            if col == "disqualify_reason" and dq_flag == "No":
                continue  # spec: must be blank when disqualify_flag=No
            v = (row.get(col) or "").strip()
            if v == "":
                row_errors.append(f"blank column '{col}'")

        # 4b. recommended_vp in allowed set
        vp = (row.get("recommended_vp") or "").strip()
        if vp not in ALLOWED_VPS:
            row_errors.append(f"recommended_vp='{vp}' not in {sorted(ALLOWED_VPS)}")

        # 4c. q2_segment_class in allowed set
        seg = (row.get("q2_segment_class") or "").strip()
        if seg not in ALLOWED_SEGMENTS:
            row_errors.append(f"q2_segment_class='{seg}' not in {sorted(ALLOWED_SEGMENTS)}")

        # 4d. priority_tier in allowed set
        tier = (row.get("priority_tier") or "").strip()
        if tier not in ALLOWED_TIERS:
            row_errors.append(f"priority_tier='{tier}' not in {sorted(ALLOWED_TIERS)}")

        # 4e. outreach_language in allowed set
        lang = (row.get("outreach_language") or "").strip()
        if lang not in ALLOWED_LANGS:
            row_errors.append(f"outreach_language='{lang}' not in {sorted(ALLOWED_LANGS)}")

        # 4f. q3_authority_contact in allowed set
        auth = (row.get("q3_authority_contact") or "").strip()
        if auth not in ALLOWED_AUTHORITY:
            row_errors.append(f"q3_authority_contact='{auth}' not in {sorted(ALLOWED_AUTHORITY)}")

        # 4g. disqualify_flag in allowed set
        dq = (row.get("disqualify_flag") or "").strip()
        if dq not in ALLOWED_DISQUALIFY_FLAG:
            row_errors.append(f"disqualify_flag='{dq}' not in {sorted(ALLOWED_DISQUALIFY_FLAG)}")

        # 4h. q4_timing_signal is the exact expected string
        q4 = (row.get("q4_timing_signal") or "").strip()
        if q4 != EXPECTED_Q4:
            row_errors.append(f"q4_timing_signal must be the exact constant string "
                              f"(got: '{q4[:60]}...')")

        # 4i. q5_sample_policy_est is the exact expected string
        q5 = (row.get("q5_sample_policy_est") or "").strip()
        if q5 != EXPECTED_Q5:
            row_errors.append(f"q5_sample_policy_est must be the exact constant string "
                              f"(got: '{q5[:60]}...')")

        # 4j. vp_rationale non-empty and ≤200 chars
        rationale = (row.get("vp_rationale") or "").strip()
        if not rationale:
            row_errors.append("vp_rationale is empty")
        elif len(rationale) > 200:
            row_errors.append(f"vp_rationale too long ({len(rationale)} chars, "
                              f"max 200)")

        # 4k. q1_volume_band_est must contain "(est)" and "confirm live"
        q1 = (row.get("q1_volume_band_est") or "").strip()
        if q1 and "(est)" not in q1 and "confirm live" not in q1 \
           and "Unknown" not in q1:
            row_errors.append(f"q1_volume_band_est must include '(est) — confirm live' "
                              f"or 'Unknown' (got: '{q1}')")

        # 4l. sequence_type must start with "Sequence A" or "Sequence B"
        seq = (row.get("sequence_type") or "").strip()
        if not (seq.startswith("Sequence A") or seq.startswith("Sequence B")):
            row_errors.append(f"sequence_type must start with 'Sequence A' or "
                              f"'Sequence B' (got: '{seq}')")

        # 4m. If disqualify_flag=Yes → priority_tier must be Disqualify
        if dq == "Yes" and tier != "Disqualify":
            row_errors.append(f"disqualify_flag=Yes but priority_tier='{tier}' "
                              f"(expected 'Disqualify')")
        if dq == "Yes" and not (row.get("disqualify_reason") or "").strip():
            row_errors.append("disqualify_flag=Yes but disqualify_reason is empty")

        # 4n. If disqualify_flag=No → disqualify_reason must be empty
        if dq == "No" and (row.get("disqualify_reason") or "").strip():
            row_errors.append("disqualify_flag=No but disqualify_reason is non-empty")

        # 4o. agent3_handoff_notes must be non-empty
        notes = (row.get("agent3_handoff_notes") or "").strip()
        if not notes:
            row_errors.append("agent3_handoff_notes is empty")

        # Report row errors (only first 5 errors per row to avoid spam)
        if row_errors:
            bad_rows += 1
            company = (row.get("company_name") or "").strip()
            for e in row_errors[:5]:
                report.error(f"Row {i} ({company}): {e}")
            if len(row_errors) > 5:
                report.error(f"Row {i} ({company}): ...and {len(row_errors)-5} more errors")

    report.stats["rows_with_errors"] = bad_rows
    report.stats["rows_clean"] = len(rows) - bad_rows

    # 5. KPI sanity checks (warnings, not errors)
    tiers = Counter((r.get("priority_tier") or "").strip() for r in rows)
    for tier in ("S", "A", "B", "C", "Disqualify"):
        report.stats[f"tier_{tier}"] = tiers.get(tier, 0)

    vps = Counter((r.get("recommended_vp") or "").strip() for r in rows)
    for vp in ("VP1", "VP2", "VP3", "VP4"):
        report.stats[f"vp_{vp}"] = vps.get(vp, 0)

    # VP bias warning — any single VP holds >70% of rows
    total = len(rows)
    for vp, n in vps.items():
        if vp and n / total > 0.70:
            report.warning(
                f"VP bias: {vp} holds {n}/{total} ({n/total:.0%}) of leads — "
                f"review segment mix in sourcing."
            )

    # Disqualification discipline — Agent 2 KPI requires ≥5% disqualified or C-tier
    disq_or_c = tiers.get("Disqualify", 0) + tiers.get("C", 0)
    if total > 0 and disq_or_c / total < 0.05:
        report.warning(
            f"Disqualification discipline: only {disq_or_c}/{total} "
            f"({disq_or_c/total:.0%}) leads are Disqualify or C-tier. "
            f"Agent 2 KPI requires ≥5%."
        )

    # Q3 = NONE ratio — too many NONE contacts means manual research backlog
    none_contacts = sum(1 for r in rows
                        if (r.get("q3_authority_contact") or "").strip() == "NONE")
    if total > 0 and none_contacts / total > 0.10:
        report.warning(
            f"{none_contacts}/{total} ({none_contacts/total:.0%}) leads have "
            f"q3_authority_contact=NONE — manual research backlog."
        )


# =====================================================================
# MAIN
# =====================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Schema validator for Agent 2's agent3-ready CSV.",
    )
    parser.add_argument("csv_path", type=Path,
                        help="Path to the CSV to validate.")
    parser.add_argument("--strict", action="store_true",
                        help="Treat warnings as errors (exit 2).")
    parser.add_argument("-q", "--quiet", action="store_true",
                        help="Only print errors (suppress warnings + stats).")
    args = parser.parse_args()

    report = ValidationReport()
    validate(args.csv_path, report)

    if args.quiet:
        if report.errors:
            print(f"❌ {len(report.errors)} ERROR(S):")
            for e in report.errors:
                print(f"  - {e}")
        else:
            print("✅ OK")
    else:
        print(report.format())

    if not report.ok:
        return 1
    if args.strict and report.warnings:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
