#!/usr/bin/env python3
"""
Agent 7 CLI — Sales & Relationship Management.

Usage:
    python scripts/run_agent7.py run
    python scripts/run_agent7.py log ACC-2026-0001 --type call --summary "Discussed 26/27 forward"
    python scripts/run_agent7.py nps ACC-2026-0001 --score 9 --feedback "Great quality"
    python scripts/run_agent7.py health ACC-2026-0001
    python scripts/run_agent7.py health-all
    python scripts/run_agent7.py timeline ACC-2026-0001
    python scripts/run_agent7.py repeat-order ACC-2026-0001 --lots LOT-25-0001,LOT-25-0002
    python scripts/run_agent7.py stats
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent7_relationship import Agent7, run_agent7, run_agent7_stats
from coffee_export.utils.logging import setup_logging


def cmd_run(args):
    result = run_agent7()
    print(f"\n{result.summary()}")
    for lr in result.lead_results:
        status = "✓" if lr.success else "✗"
        print(f"  {status} {lr.lead_id}: {lr.action}")
    return 0 if result.failed == 0 else 1


def cmd_log(args):
    with Agent7() as agent:
        result = agent.log_activity(
            account_id=args.account_id,
            activity_type=args.type,
            summary=args.summary or "",
            participants=args.participants or "",
            next_steps=args.next_steps or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_nps(args):
    with Agent7() as agent:
        result = agent.record_nps(
            account_id=args.account_id,
            score=args.score,
            feedback=args.feedback or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_health(args):
    with Agent7() as agent:
        result = agent.check_account_health(args.account_id)
    print(f"\n{'='*60}")
    print(f"Account Health — {args.account_id}")
    print(f"{'='*60}")
    print(f"  Status:              {result.get('current_status', 'N/A')}")
    print(f"  Health:              {result.get('health', 'N/A')}")
    print(f"  Days since activity: {result.get('days_since_activity', 'N/A')}")
    print(f"  Last activity:       {result.get('last_activity_ts', 'N/A')}")
    return 0


def cmd_health_all(args):
    with Agent7() as agent:
        results = agent.check_all_accounts_health()
    print(f"\n{'='*60}")
    print(f"Account Health — All Accounts ({len(results)})")
    print(f"{'='*60}")
    for r in results:
        print(
            f"  {r.get('health', '?')} {r['account_id']}: "
            f"{r.get('current_status', '?')} "
            f"({r.get('days_since_activity', '?')} days since activity)"
        )
    return 0


def cmd_timeline(args):
    with Agent7() as agent:
        activities = agent.get_account_timeline(args.account_id)
    print(f"\n{'='*60}")
    print(f"Activity Timeline — {args.account_id} ({len(activities)} activities)")
    print(f"{'='*60}")
    for a in activities:
        print(
            f"  [{a.get('activity_ts', '')[:19]}] {a.get('activity_type', '')}: "
            f"{a.get('summary', '')[:80]}"
        )
        if a.get("next_steps"):
            print(f"    → Next: {a['next_steps'][:80]}")
    return 0


def cmd_repeat_order(args):
    lot_ids = args.lots.split(",") if args.lots else []
    with Agent7() as agent:
        result = agent.request_repeat_order(
            account_id=args.account_id,
            lot_ids=lot_ids,
            notes=args.notes or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_stats(args):
    stats = run_agent7_stats()
    print(f"\n{'='*60}")
    print("Agent 7 — Relationship Statistics")
    print(f"{'='*60}")
    print(f"  Total accounts:   {stats['total_accounts']}")
    print(f"  Total revenue:    ${stats['total_revenue']:,.2f}")
    print(f"  Total volume:     {stats['total_volume_bags']} bags")
    print(f"  NPS Score:        {stats['nps_score']} ({stats['nps_responses']} responses)")
    print("\n  By status:")
    for status, count in sorted(stats["by_status"].items()):
        print(f"    {status}: {count}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 7 — Sales & Relationship CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Run Agent 7 (event-driven)").set_defaults(func=cmd_run)

    p = sub.add_parser("log", help="Log a relationship activity")
    p.add_argument("account_id")
    p.add_argument(
        "--type",
        required=True,
        choices=[
            "call",
            "meeting",
            "email",
            "site_visit",
            "gift",
            "sample_request",
            "contract_signed",
            "delivery_followup",
            "nps_survey",
            "other",
        ],
    )
    p.add_argument("--summary", help="Activity summary")
    p.add_argument("--participants", help="People involved")
    p.add_argument("--next-steps", help="Next steps")
    p.set_defaults(func=cmd_log)

    p = sub.add_parser("nps", help="Record NPS score")
    p.add_argument("account_id")
    p.add_argument("--score", type=int, required=True, help="NPS score 0-10")
    p.add_argument("--feedback", help="Buyer feedback")
    p.set_defaults(func=cmd_nps)

    p = sub.add_parser("health", help="Check account health")
    p.add_argument("account_id")
    p.set_defaults(func=cmd_health)

    sub.add_parser("health-all", help="Check all accounts health").set_defaults(func=cmd_health_all)

    p = sub.add_parser("timeline", help="Show activity timeline")
    p.add_argument("account_id")
    p.set_defaults(func=cmd_timeline)

    p = sub.add_parser("repeat-order", help="Request a repeat order")
    p.add_argument("account_id")
    p.add_argument("--lots", help="Comma-separated lot IDs")
    p.add_argument("--notes", help="Notes")
    p.set_defaults(func=cmd_repeat_order)

    sub.add_parser("stats", help="Show relationship statistics").set_defaults(func=cmd_stats)

    args = parser.parse_args()
    setup_logging()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
