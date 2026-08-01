#!/usr/bin/env python3
"""
Agent 6 CLI — Logistics & Shipping operations.

Usage:
    python scripts/run_agent6.py run
    python scripts/run_agent6.py book SH-2026-0001 --carrier Maersk --vessel "MSC Gulsun" \\
        --bl MAEU1234567890 --from Djibouti --to Hamburg --etd 2026-07-15 --eta 2026-08-10
    python scripts/run_agent6.py customs-check SH-2026-0001
    python scripts/run_agent6.py submit-doc SH-2026-0001 --type bill_of_lading --file /docs/bl.pdf
    python scripts/run_agent6.py clear-doc --doc-id 1
    python scripts/run_agent6.py depart SH-2026-0001 --atd 2026-07-15T08:00:00+03:00
    python scripts/run_agent6.py arrive SH-2026-0001 --ata 2026-08-10T14:00:00+02:00
    python scripts/run_agent6.py deliver SH-2026-0001
    python scripts/run_agent6.py customs-hold SH-2026-0001 --reason "Missing phytosanitary cert"
    python scripts/run_agent6.py stats
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent6_logistics import Agent6, run_agent6, run_agent6_stats
from coffee_export.utils.logging import setup_logging


def cmd_run(args):
    result = run_agent6()
    print(f"\n{result.summary()}")
    for lr in result.lead_results:
        status = "✓" if lr.success else "✗"
        print(f"  {status} {lr.lead_id}: {lr.action}")
    return 0 if result.failed == 0 else 1


def cmd_book(args):
    with Agent6() as agent:
        result = agent.book_shipment(
            shipment_id=args.shipment_id,
            carrier=args.carrier,
            vessel_name=args.vessel,
            bl_number=args.bl,
            container_number=args.container or "",
            departure_port=args.from_port,
            arrival_port=args.to_port,
            etd=args.etd,
            eta=args.eta,
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_customs_check(args):
    with Agent6() as agent:
        result = agent.check_customs(args.shipment_id)
    print(f"\n{'='*60}")
    print(f"📋 Customs Status — {args.shipment_id}")
    print(f"{'='*60}")
    print(f"  All cleared:  {result.get('all_cleared', False)}")
    print(f"  Can depart:   {result.get('can_depart', False)}")
    print(f"  Cleared:      {result.get('cleared', 0)}/{result.get('total_required', 0)}")
    if result.get("missing"):
        print(f"  Missing:      {', '.join(result['missing'])}")
    if result.get("pending"):
        print(f"  Pending:      {', '.join(result['pending'])}")
    return 0


def cmd_submit_doc(args):
    with Agent6() as agent:
        result = agent.submit_customs_doc(
            shipment_id=args.shipment_id,
            document_type=args.type,
            file_path=args.file or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_clear_doc(args):
    with Agent6() as agent:
        result = agent.clear_customs_doc(args.doc_id)
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_depart(args):
    with Agent6() as agent:
        result = agent.record_departure(args.shipment_id, atd=args.atd or "")
    if result.get("action") == "blocked":
        print(f"\n❌ BLOCKED: {result['reason']}")
        if result.get("missing"):
            print(f"   Missing: {', '.join(result['missing'])}")
        return 1
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_arrive(args):
    with Agent6() as agent:
        result = agent.record_arrival(args.shipment_id, ata=args.ata or "")
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_deliver(args):
    with Agent6() as agent:
        result = agent.record_delivery(args.shipment_id, ata=args.ata or "")
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_customs_hold(args):
    with Agent6() as agent:
        result = agent.record_customs_hold(args.shipment_id, reason=args.reason)
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_stats(args):
    stats = run_agent6_stats()
    print(f"\n{'='*60}")
    print("Agent 6 — Logistics Statistics")
    print(f"{'='*60}")
    print(f"  Total shipments: {stats['total_shipments']}")
    print(f"  In transit:      {stats['in_transit']}")
    print(f"  Delivered:       {stats['delivered']}")
    print(f"  Customs hold:    {stats['customs_hold']}")
    print("\n  By status:")
    for status, count in sorted(stats["by_status"].items()):
        print(f"    {status}: {count}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 6 — Logistics & Shipping CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Run Agent 6 (event-driven)").set_defaults(func=cmd_run)

    p = sub.add_parser("book", help="Book freight")
    p.add_argument("shipment_id")
    p.add_argument("--carrier", required=True)
    p.add_argument("--vessel", default="")
    p.add_argument("--bl", required=True, help="Bill of lading number")
    p.add_argument("--container", help="Container number")
    p.add_argument("--from", dest="from_port", default="Djibouti")
    p.add_argument("--to", dest="to_port", required=True)
    p.add_argument("--etd", required=True, help="Estimated departure date")
    p.add_argument("--eta", required=True, help="Estimated arrival date")
    p.set_defaults(func=cmd_book)

    p = sub.add_parser("customs-check", help="Check customs clearance")
    p.add_argument("shipment_id")
    p.set_defaults(func=cmd_customs_check)

    p = sub.add_parser("submit-doc", help="Submit customs document")
    p.add_argument("shipment_id")
    p.add_argument("--type", required=True)
    p.add_argument("--file", help="File path")
    p.set_defaults(func=cmd_submit_doc)

    p = sub.add_parser("clear-doc", help="Clear customs document")
    p.add_argument("--doc-id", type=int, required=True)
    p.set_defaults(func=cmd_clear_doc)

    p = sub.add_parser("depart", help="Record departure")
    p.add_argument("shipment_id")
    p.add_argument("--atd", help="Actual departure time")
    p.set_defaults(func=cmd_depart)

    p = sub.add_parser("arrive", help="Record arrival")
    p.add_argument("shipment_id")
    p.add_argument("--ata", help="Actual arrival time")
    p.set_defaults(func=cmd_arrive)

    p = sub.add_parser("deliver", help="Record final delivery")
    p.add_argument("shipment_id")
    p.add_argument("--ata", help="Actual arrival time")
    p.set_defaults(func=cmd_deliver)

    p = sub.add_parser("customs-hold", help="Record customs hold")
    p.add_argument("shipment_id")
    p.add_argument("--reason", required=True)
    p.set_defaults(func=cmd_customs_hold)

    sub.add_parser("stats", help="Show logistics statistics").set_defaults(func=cmd_stats)

    args = parser.parse_args()
    setup_logging()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
