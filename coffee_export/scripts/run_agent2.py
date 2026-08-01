#!/usr/bin/env python3
"""
Agent 2 CLI — Lead Research & Enrichment.

Usage:
    # Enrich leads from a CSV file
    python scripts/run_agent2.py enrich data/raw_leads.csv

    # Enrich a single lead (from JSON file)
    python scripts/run_agent2.py enrich-single leads/falcon.json

    # Show enrichment stats
    python scripts/run_agent2.py stats
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent2_enrichment import Agent2, run_agent2_csv
from coffee_export.utils.logging import setup_logging


def cmd_enrich(args: argparse.Namespace) -> int:
    """Enrich leads from a CSV file."""
    csv_path = Path(args.csv_file)
    if not csv_path.exists():
        print(f"ERROR: CSV file not found: {csv_path}", file=sys.stderr)
        return 1

    print(f"Enriching leads from: {csv_path}")
    result = run_agent2_csv(csv_path)

    print(f"\n{'='*60}")
    print("Agent 2 — Enrichment Summary")
    print(f"{'='*60}")
    print(f"  Total rows:      {result['total_rows']}")
    print(f"  Enriched:        {result['enriched']}")
    print(f"  Disqualified:    {result['disqualified']}")
    print(f"  Skipped:         {result['skipped']}")
    print(f"  Errors:          {len(result['errors'])}")

    if result["errors"]:
        print("\nErrors (first 5):")
        for err in result["errors"][:5]:
            print(f"  - {err}")

    return 0 if result["enriched"] > 0 else 1


def cmd_enrich_single(args: argparse.Namespace) -> int:
    """Enrich a single lead from a JSON file."""
    json_path = Path(args.json_file)
    if not json_path.exists():
        print(f"ERROR: JSON file not found: {json_path}", file=sys.stderr)
        return 1

    with json_path.open(encoding="utf-8") as f:
        raw_lead = json.load(f)

    with Agent2() as agent:
        result = agent.enrich_lead(raw_lead)

    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("action") == "created" else 1


def cmd_stats(args: argparse.Namespace) -> int:
    """Show enrichment statistics."""
    from coffee_export.state import StateManager

    with StateManager() as sm:
        snapshot = sm.get_kpi_snapshot()

    print(f"\n{'='*60}")
    print("Agent 2 — Enrichment Stats")
    print(f"{'='*60}")
    print(f"  Total leads:        {snapshot['leads']['total']}")

    print("\n  By state:")
    for state, count in sorted(snapshot["leads"]["by_state"].items()):
        print(f"    {state:<25} {count}")

    print(f"\n  Blocked:            {snapshot['leads']['blocked_count']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 2 — Lead Research & Enrichment CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("enrich", help="Enrich leads from a CSV file")
    p.add_argument("csv_file", help="Path to the CSV file")
    p.set_defaults(func=cmd_enrich)

    p = sub.add_parser("enrich-single", help="Enrich a single lead from JSON")
    p.add_argument("json_file", help="Path to the JSON file")
    p.set_defaults(func=cmd_enrich_single)

    sub.add_parser("stats", help="Show enrichment statistics").set_defaults(func=cmd_stats)

    args = parser.parse_args()
    setup_logging()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
