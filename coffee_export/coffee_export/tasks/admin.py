"""
Durable task queue admin CLI — Phase 1A.

Read-only inspection plus ONE operator action (requeue of dead tasks).

    python -m coffee_export.tasks.admin stats
    python -m coffee_export.tasks.admin list [--status S] [--limit N]
    python -m coffee_export.tasks.admin show <task_id>
    python -m coffee_export.tasks.admin requeue <task_id> [--keep-attempts]

Exit codes: 0 success · 1 not found / nothing to do · 2 usage error.

requeue resets the retry budget by default (attempts=0, scheduled now);
--keep-attempts preserves the count so the next failure can go straight
to dead. Only dead rows are requeueable — leased rows belong to a live
claim (or to the reaper) and completed rows are history.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from coffee_export.tasks.durable_queue import (
    DurableTaskQueue,
    create_queue_engine,
)
from coffee_export.tasks.registry import default_registry
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

EXIT_OK = 0
EXIT_NOT_FOUND = 1
EXIT_USAGE = 2


def _fmt_ts(value: str | None, width: int = 25) -> str:
    return (value or "—")[:width].ljust(width)


def _cmd_stats(queue: DurableTaskQueue) -> int:
    counts = queue.stats()
    total = sum(counts.values())
    print("agent_tasks by status")
    for status in ("pending", "leased", "completed", "dead"):
        print(f"  {status:<10} {counts[status]:>6}")
    print(f"  {'total':<10} {total:>6}")
    return EXIT_OK


def _cmd_list(queue: DurableTaskQueue, status: str | None, limit: int) -> int:
    rows = queue.list_tasks(status=status, limit=limit)
    if not rows:
        print("no tasks" + (f" with status {status!r}" if status else ""))
        return EXIT_NOT_FOUND
    header = (
        f"{'task_id':<38} {'type':<24} {'status':<10} "
        f"{'att/max':<8} {'scheduled_ts':<26} {'org':<12} last_error"
    )
    print(header)
    print("-" * len(header))
    for r in rows:
        print(
            f"{r.task_id:<38} {r.task_type:<24} {r.status:<10} "
            f"{r.attempts}/{r.max_attempts:<6} {_fmt_ts(r.scheduled_ts, 25):<26} "
            f"{r.organization_id:<12} {(r.last_error or '')[:60]}"
        )
    return EXIT_OK


def _cmd_show(queue: DurableTaskQueue, task_id: str) -> int:
    row = queue.get_task(task_id)
    if row is None:
        print(f"task {task_id} not found")
        return EXIT_NOT_FOUND
    fields: list[tuple[str, Any]] = [
        ("task_id", row.task_id),
        ("task_type", row.task_type),
        ("status", row.status),
        ("organization_id", row.organization_id),
        ("priority", row.priority),
        ("attempts / max_attempts", f"{row.attempts} / {row.max_attempts}"),
        ("scheduled_ts", row.scheduled_ts),
        ("created_ts", row.created_ts),
        ("updated_ts", row.updated_ts),
        ("started_ts", row.started_ts),
        ("completed_ts", row.completed_ts),
        ("lease_token", row.lease_token),
        ("lease_owner", row.lease_owner),
        ("lease_expires_ts", row.lease_expires_ts),
        ("last_error", row.last_error),
        ("payload", row.payload),
        ("result", row.result),
    ]
    width = max(len(k) for k, _ in fields)
    for key, value in fields:
        print(f"{key.ljust(width)}  {value}")
    return EXIT_OK


def _cmd_requeue(queue: DurableTaskQueue, task_id: str, keep_attempts: bool) -> int:
    if queue.requeue(task_id, reset_attempts=not keep_attempts):
        print(f"requeued {task_id} → pending (retry budget {'kept' if keep_attempts else 'reset'})")
        return EXIT_OK
    print(f"cannot requeue {task_id} — only dead tasks are requeueable")
    return EXIT_NOT_FOUND


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m coffee_export.tasks.admin",
        description="Durable task queue admin (Phase 1A): inspect + requeue dead tasks.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_stats = sub.add_parser("stats", help="counts by status")
    p_stats.set_defaults(func=_cmd_stats)

    p_list = sub.add_parser("list", help="list tasks")
    p_list.add_argument("--status", choices=["pending", "leased", "completed", "dead"])
    p_list.add_argument("--limit", type=int, default=20)
    p_list.set_defaults(func=_cmd_list)

    p_show = sub.add_parser("show", help="show one task in full")
    p_show.add_argument("task_id")
    p_show.set_defaults(func=_cmd_show)

    p_requeue = sub.add_parser("requeue", help="dead → pending (operator action)")
    p_requeue.add_argument("task_id")
    p_requeue.add_argument(
        "--keep-attempts",
        action="store_true",
        help="preserve the attempt count instead of resetting the retry budget",
    )
    p_requeue.set_defaults(func=_cmd_requeue)
    return parser


def main(argv: list[str] | None = None, *, queue: DurableTaskQueue | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if queue is None:
        # CLI mode: keep stdout clean for the report (warnings/errors → stderr)
        from coffee_export.utils.logging import setup_logging

        setup_logging(level=30, enable_file=False)  # WARNING
        queue = DurableTaskQueue(default_registry, create_queue_engine())
    if args.command == "stats":
        return args.func(queue)
    if args.command == "list":
        return args.func(queue, args.status, args.limit)
    if args.command == "show":
        return args.func(queue, args.task_id)
    if args.command == "requeue":
        return args.func(queue, args.task_id, args.keep_attempts)
    parser.error(f"unknown command {args.command!r}")
    return EXIT_USAGE  # unreachable


if __name__ == "__main__":
    sys.exit(main())
