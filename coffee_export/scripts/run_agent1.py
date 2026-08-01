#!/usr/bin/env python3
"""Agent 1 CLI — manual operations for the Supplier & Inventory agent."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent1_supplier import Agent1, run_agent1, run_agent1_maintenance
from coffee_export.utils.logging import setup_logging


def cmd_run(args):
    result = run_agent1()
    print(f"\n{result.summary()}")
    for lr in result.lead_results:
        status = "✓" if lr.success else "✗"
        print(f"  {status} {lr.lead_id}: {lr.action}")
    return 0 if result.failed == 0 else 1


def cmd_maintenance(args):
    result = run_agent1_maintenance()
    print("\n" + "=" * 60)
    print("Agent 1 — Maintenance Report")
    print("=" * 60)
    eudr = result["eudr_audit"]
    print(
        f"\n[1] EUDR Audit: {eudr['complete']}/{eudr['total_active_lots']} complete, {eudr['incomplete']} incomplete"
    )
    for lot in eudr["incomplete_lots"][:5]:
        print(f"  - {lot['lot_id']}: missing {', '.join(lot['missing_fields'])}")
    qa = result["qa_review"]
    print(
        f"\n[2] QA Review: {len(qa['held_lots'])} on hold, {len(qa['multi_rejection_lots'])} multi-rejection"
    )
    sf = result["stock_freshness"]
    print(f"\n[3] Stock Freshness: {sf['stale_count']} stale lots")
    return 0


def cmd_eudr_audit(args):
    with Agent1() as agent:
        print(json.dumps(agent.run_eudr_audit(), indent=2, default=str))
    return 0


def cmd_qa_review(args):
    with Agent1() as agent:
        print(json.dumps(agent.run_qa_review(), indent=2, default=str))
    return 0


def cmd_stock_freshness(args):
    with Agent1() as agent:
        print(json.dumps(agent.run_stock_freshness_check(args.max_age), indent=2, default=str))
    return 0


def cmd_substitute(args):
    with Agent1() as agent:
        result = agent.find_substitute_lot(args.lot_id, eudr_required=args.eudr_required)
    if result:
        print(json.dumps(result, indent=2, default=str))
        return 0
    print(f"No substitute found for {args.lot_id}")
    return 1


def cmd_release(args):
    with Agent1() as agent:
        if agent.release_lot_from_qa(args.lot_id):
            print(f"✓ Lot {args.lot_id} released from QA hold")
            return 0
    print(f"✗ Lot {args.lot_id} is not on hold")
    return 1


def cmd_flag(args):
    with Agent1() as agent:
        agent.flag_lot_for_qa(args.lot_id, args.reason)
    print(f"✓ Lot {args.lot_id} flagged for QA: {args.reason}")
    return 0


def cmd_feedback(args):
    with Agent1() as agent:
        result = agent.log_rejection_feedback(
            lot_id=args.lot_id,
            buyer_company=args.buyer,
            buyer_segment=args.segment or "",
            rejection_reason=args.reason,
        )
    print(f"✓ Logged feedback: {result['feedback_id']}")
    if result.get("qa_auto_flagged"):
        print(f"  ⚠️  Auto-flagged lot {args.lot_id} for QA")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 1 — Supplier & Inventory CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Run Agent 1 (event-driven)").set_defaults(func=cmd_run)
    sub.add_parser("maintenance", help="Run all maintenance tasks").set_defaults(
        func=cmd_maintenance
    )
    sub.add_parser("eudr-audit", help="EUDR audit").set_defaults(func=cmd_eudr_audit)
    sub.add_parser("qa-review", help="QA review").set_defaults(func=cmd_qa_review)
    p = sub.add_parser("stock-freshness", help="Stock freshness check")
    p.add_argument("--max-age", type=int, default=24)
    p.set_defaults(func=cmd_stock_freshness)
    p = sub.add_parser("substitute", help="Find substitute lot")
    p.add_argument("lot_id")
    p.add_argument("--eudr-required", action="store_true")
    p.set_defaults(func=cmd_substitute)
    p = sub.add_parser("release", help="Release lot from QA")
    p.add_argument("lot_id")
    p.set_defaults(func=cmd_release)
    p = sub.add_parser("flag", help="Flag lot for QA")
    p.add_argument("lot_id")
    p.add_argument("--reason", required=True)
    p.set_defaults(func=cmd_flag)
    p = sub.add_parser("feedback", help="Log rejection feedback")
    p.add_argument("--lot-id", required=True)
    p.add_argument("--buyer", required=True)
    p.add_argument("--segment")
    p.add_argument("--reason", required=True)
    p.set_defaults(func=cmd_feedback)

    args = parser.parse_args()
    setup_logging()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
