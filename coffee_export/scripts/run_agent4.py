#!/usr/bin/env python3
"""
Agent 4 CLI — Sample Management operations.

Usage:
    # Run Agent 4 (process LEAD_QUALIFIED + LOT_CONFIRMED events)
    python scripts/run_agent4.py run

    # Recommend lots for a lead
    python scripts/run_agent4.py recommend L-2026-00047

    # Dispatch a sample
    python scripts/run_agent4.py dispatch SR-2026-0001 --carrier DHL --tracking 12345

    # Record delivery
    python scripts/run_agent4.py deliver SR-2026-0001

    # Schedule reminders (Day +7/+10/+14/+18)
    python scripts/run_agent4.py reminders SR-2026-0001

    # Record a cupping score
    python scripts/run_agent4.py cupping SR-2026-0001 LOT-25-0001 --score 86.5 --defects 5

    # Make a decision
    python scripts/run_agent4.py decide SR-2026-0001 LOT-25-0001 --decision approved --fob 4.50

    # Auto-decide based on cupping score thresholds
    python scripts/run_agent4.py auto-decide SR-2026-0001 LOT-25-0001

    # Generate a label
    python scripts/run_agent4.py label SR-2026-0001 LOT-25-0001

    # Show sample stats
    python scripts/run_agent4.py stats
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent4_sample import Agent4, run_agent4, run_agent4_stats
from coffee_export.utils.logging import setup_logging


def cmd_run(args):
    result = run_agent4()
    print(f"\n{result.summary()}")
    for lr in result.lead_results:
        status = "✓" if lr.success else "✗"
        print(f"  {status} {lr.lead_id}: {lr.action}")
    return 0 if result.failed == 0 else 1


def cmd_recommend(args):
    with Agent4() as agent:
        lots = agent.recommend_lots(
            lead_id=args.lead_id,
            region=args.region,
            process=args.process,
        )
    print(f"\nRecommended lots for {args.lead_id}:")
    if not lots:
        print("  No matching lots found.")
        return 1
    for i, lot in enumerate(lots, 1):
        print(
            f"  {i}. {lot['lot_id']} — {lot['region']} {lot['process']} "
            f"score={lot['cupping_score']} stock={lot['stock_bags_remaining']}"
        )
    return 0


def cmd_dispatch(args):
    with Agent4() as agent:
        result = agent.dispatch_sample(
            sample_request_id=args.sample_request_id,
            carrier=args.carrier,
            tracking_number=args.tracking,
            carrier_account=args.account or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_deliver(args):
    with Agent4() as agent:
        result = agent.record_delivery(
            sample_request_id=args.sample_request_id,
            shipment_id=args.shipment_id or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_reminders(args):
    with Agent4() as agent:
        result = agent.schedule_reminders(args.sample_request_id)
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_cupping(args):
    with Agent4() as agent:
        result = agent.record_cupping(
            sample_request_id=args.sample_request_id,
            lot_id=args.lot_id,
            total_score=args.score,
            defect_count_buyer=args.defects,
            buyer_notes=args.notes or "",
            our_score=args.our_score,
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_decide(args):
    with Agent4() as agent:
        result = agent.make_decision(
            sample_request_id=args.sample_request_id,
            lot_id=args.lot_id,
            decision=args.decision,
            buyer_target_fob=args.fob,
            buyer_target_volume_bags=args.volume,
            buyer_target_port=args.port or "",
            notes=args.notes or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_auto_decide(args):
    with Agent4() as agent:
        result = agent.auto_decide(
            sample_request_id=args.sample_request_id,
            lot_id=args.lot_id,
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_label(args):
    with Agent4() as agent:
        result = agent.generate_label(args.sample_request_id, args.lot_id)
    if "error" in result:
        print(f"Error: {result['error']}")
        return 1
    print("\n" + "=" * 50)
    print(result["label_text"])
    print("=" * 50)
    return 0


def cmd_stats(args):
    stats = run_agent4_stats()
    print(f"\n{'='*60}")
    print("Agent 4 — Sample Management Stats")
    print(f"{'='*60}")
    print(f"  Active reservations:  {stats['active_reservations']}")
    print(f"  Waitlist depth:       {stats['waitlist_depth']}")
    budget = stats.get("budget", {})
    print("\n  Budget this week:")
    print(f"    Full sets (350g):   {budget.get('full_sets_used', 0)}/3")
    print(f"    Fallback (150g):    {budget.get('fallback_150g_used', 0)}/2")
    print(f"    Type B (200g):      {budget.get('type_b_used', 0)}/2")
    print(f"\n  Feedback logged:      {stats['feedback_logged']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 4 — Sample Management CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Run Agent 4 (event-driven)").set_defaults(func=cmd_run)

    p = sub.add_parser("recommend", help="Recommend lots for a lead")
    p.add_argument("lead_id")
    p.add_argument("--region")
    p.add_argument("--process")
    p.set_defaults(func=cmd_recommend)

    p = sub.add_parser("dispatch", help="Dispatch a sample")
    p.add_argument("sample_request_id")
    p.add_argument("--carrier", default="DHL")
    p.add_argument("--tracking", required=True)
    p.add_argument("--account", help="Carrier account number")
    p.set_defaults(func=cmd_dispatch)

    p = sub.add_parser("deliver", help="Record sample delivery")
    p.add_argument("sample_request_id")
    p.add_argument("--shipment-id", help="Shipment ID (optional)")
    p.set_defaults(func=cmd_deliver)

    p = sub.add_parser("reminders", help="Schedule Day +7/+10/+14/+18 reminders")
    p.add_argument("sample_request_id")
    p.set_defaults(func=cmd_reminders)

    p = sub.add_parser("cupping", help="Record a cupping score")
    p.add_argument("sample_request_id")
    p.add_argument("lot_id")
    p.add_argument("--score", type=float, required=True, help="Total cupping score")
    p.add_argument("--defects", type=int, help="Defect count (buyer observed)")
    p.add_argument("--notes", help="Buyer notes")
    p.add_argument("--our-score", type=float, help="Our pre-shipment score (for comparison)")
    p.set_defaults(func=cmd_cupping)

    p = sub.add_parser("decide", help="Make a sample decision")
    p.add_argument("sample_request_id")
    p.add_argument("lot_id")
    p.add_argument(
        "--decision", required=True, choices=["approved", "rejected", "needs_another_sample"]
    )
    p.add_argument("--fob", type=float, help="Buyer target FOB price")
    p.add_argument("--volume", type=int, help="Buyer target volume (bags)")
    p.add_argument("--port", help="Buyer target port")
    p.add_argument("--notes", help="Decision notes")
    p.set_defaults(func=cmd_decide)

    p = sub.add_parser("auto-decide", help="Auto-decide based on cupping score")
    p.add_argument("sample_request_id")
    p.add_argument("lot_id")
    p.set_defaults(func=cmd_auto_decide)

    p = sub.add_parser("label", help="Generate sample label")
    p.add_argument("sample_request_id")
    p.add_argument("lot_id")
    p.set_defaults(func=cmd_label)

    sub.add_parser("stats", help="Show sample management stats").set_defaults(func=cmd_stats)

    args = parser.parse_args()
    setup_logging()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
