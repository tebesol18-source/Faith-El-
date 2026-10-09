#!/usr/bin/env python3
"""Event bus administration — inspect and recover failed events.

The supervisor invokes Python agents for the events they consume; an agent
that fails an event marks it failed (retry:N in error_message) and after
MAX_RETRIES the event moves to 'dead_letter'. Dead-lettered events stay in
the events table, fully intact, for operator review. This CLI is the safe
recovery path: list what failed, inspect the error, and requeue an event
back to 'pending' once the underlying problem is fixed.

Usage:
    python coffee_export/scripts/event_admin.py list [--status dead_letter|failed|pending|consumed] [--limit 20]
    python coffee_export/scripts/event_admin.py show <event_id>
    python coffee_export/scripts/event_admin.py requeue <event_id>

Environment:
    COFFEE_DATABASE_URL — same canonical DB URL the whole stack shares.
    EVENT_ADMIN_ORG     — org scope for list/show (default: org-system).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.events import EventBus


def cmd_list(args) -> int:
    with EventBus(organization_id=args.org) as bus:
        events = bus.replay(event_type=None, status=args.status or None, limit=args.limit)
    if not events:
        print(f"No events found (status={args.status or 'any'}, org={args.org}).")
        return 0
    print(f"{'ID':>5}  {'STATUS':<12} {'TYPE':<22} {'ENTITY':<28} ERROR")
    for e in events:
        entity = f"{e.get('entity_type') or '?'}:{e.get('entity_id') or '?'}"
        err = (e.get("error_message") or "")[:80]
        print(f"{e['id']:>5}  {e['status']:<12} {e['event_type']:<22} {entity:<28} {err}")
    return 0


def cmd_show(args) -> int:
    with EventBus(organization_id=args.org) as bus:
        events = bus.replay(limit=1000)
    event = next((e for e in events if e["id"] == args.event_id), None)
    if not event:
        print(f"Event #{args.event_id} not found in org {args.org}.")
        return 1
    print(json.dumps(event, indent=2, default=str))
    return 0


def cmd_requeue(args) -> int:
    # requeue_dead_letter operates by primary key across orgs — an operator
    # recovering a specific event id is acting deliberately on that row.
    with EventBus(organization_id=args.org) as bus:
        ok = bus.requeue_dead_letter(args.event_id)
    if ok:
        print(f"Event #{args.event_id} requeued: dead_letter → pending. "
              f"The next supervisor tick will re-trigger the owning agent.")
        return 0
    print(f"Event #{args.event_id} could not be requeued "
          f"(not found, or not in dead_letter status).")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Event bus administration (list / show / requeue)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("list", help="List events (newest first)")
    p.add_argument("--status", choices=["pending", "consumed", "failed", "dead_letter"], default=None)
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--org", default="org-system")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("show", help="Show one event as JSON")
    p.add_argument("event_id", type=int)
    p.add_argument("--org", default="org-system")
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("requeue", help="Move a dead_letter event back to pending")
    p.add_argument("event_id", type=int)
    p.add_argument("--org", default="org-system")
    p.set_defaults(func=cmd_requeue)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
