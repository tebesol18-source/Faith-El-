"""
Durable task queue admin CLI — Phase 1A + Phase 3 research surface.

Read-only inspection plus ONE operator action (requeue of terminal
failed/dead tasks), and (Phase 3) research monitoring + followup
dispatch:

    python -m coffee_export.tasks.admin stats
    python -m coffee_export.tasks.admin list [--status S] [--limit N]
    python -m coffee_export.tasks.admin show <task_id>
    python -m coffee_export.tasks.admin requeue <task_id> [--keep-attempts]
    python -m coffee_export.tasks.admin research [--org ORG] [--limit N]
    python -m coffee_export.tasks.admin followups dispatch [--limit N]
    python -m coffee_export.tasks.admin followups list --org ORG [--status S] [--limit N]

Exit codes: 0 success · 1 not found / nothing to do · 2 usage error.

requeue resets the retry budget by default (attempts=0, scheduled now);
--keep-attempts preserves the count so the next retryable failure can go
straight to dead (a non-retryable one goes to failed either way). Only
failed and dead rows are requeueable — the two terminal states an
operator may legitimately want to re-run after fixing the cause.
Leased rows belong to a live claim (or to the reaper); completed rows are
immutable history (re-running would duplicate side effects under
at-least-once semantics); pending rows need no operator action.
Requeue re-validates nothing: fix the underlying cause first, or the
task fails again on its first attempt.

research: with --org, org-scoped session rows + followup rows + tool-call
totals (the tenant's own view). WITHOUT --org: counts-only rollups across
orgs (the same trust level as `stats` — aggregate numbers, no tenant
content). budget_exhausted sessions are surfaced explicitly: they await
the human resume path.

followups dispatch: the manual operator trigger of the worker's Phase 3
followup pass (reconcile, then enqueue DUE research followups as
research.* tasks). Idempotent — safe to run any time; the worker loop
runs the same pass every TASK_WORKER_FOLLOWUP_INTERVAL_SECONDS.
followups list REQUIRES --org (no cross-org research-row listing).
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from coffee_export.tasks.durable_queue import (
    VALID_STATUSES,
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
    for status in VALID_STATUSES:  # pending | leased | completed | failed | dead
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
    print(f"cannot requeue {task_id} — only failed or dead tasks are requeueable")
    return EXIT_NOT_FOUND


# ── Phase 3: research monitoring + followup dispatch ─────────────


def _cmd_research(engine, org: str | None, limit: int) -> int:
    """Research monitoring: org-scoped detail or cross-org counts-only."""
    from sqlalchemy import func, select

    from coffee_export.database.models.research import (
        ResearchFollowup,
        ResearchSession,
        ResearchToolCall,
    )
    from coffee_export.research.common import (
        FOLLOWUP_STATUSES,
        SESSION_STATUSES,
    )

    with engine.connect() as conn:
        if org:
            sessions = list(
                conn.execute(
                    select(
                        ResearchSession.session_id,
                        ResearchSession.status,
                        ResearchSession.objective,
                        ResearchSession.usage_tool_calls,
                        ResearchSession.usage_model_calls,
                        ResearchSession.usage_cost_usd,
                    )
                    .where(ResearchSession.organization_id == org)
                    .order_by(ResearchSession.created_ts.desc())
                    .limit(limit)
                ).all()
            )
            followups = list(
                conn.execute(
                    select(
                        ResearchFollowup.followup_id,
                        ResearchFollowup.followup_type,
                        ResearchFollowup.status,
                        ResearchFollowup.due_ts,
                    )
                    .where(ResearchFollowup.organization_id == org)
                    .order_by(ResearchFollowup.due_ts)
                    .limit(limit)
                ).all()
            )
            tool_calls = conn.execute(
                select(func.count())
                .select_from(ResearchToolCall)
                .where(ResearchToolCall.organization_id == org)
            ).scalar_one()
            exhausted = list(
                conn.execute(
                    select(ResearchSession.session_id)
                    .where(
                        ResearchSession.organization_id == org,
                        ResearchSession.status == "budget_exhausted",
                    )
                    .limit(limit)
                ).scalars()
            )
        else:
            sessions = []
            followups = []
            tool_calls = conn.execute(
                select(func.count()).select_from(ResearchToolCall)
            ).scalar_one()
            exhausted = []
        session_stmt = select(ResearchSession.status, func.count()).group_by(ResearchSession.status)
        followup_stmt = select(ResearchFollowup.status, func.count()).group_by(
            ResearchFollowup.status
        )
        if org:
            session_stmt = session_stmt.where(ResearchSession.organization_id == org)
            followup_stmt = followup_stmt.where(ResearchFollowup.organization_id == org)
        session_counts = dict(conn.execute(session_stmt.order_by(ResearchSession.status)).all())
        followup_counts = dict(conn.execute(followup_stmt.order_by(ResearchFollowup.status)).all())

    scope = f"org {org!r}" if org else "ALL ORGS (counts only)"
    print(f"research sessions by status — {scope}")
    for status in SESSION_STATUSES:
        if status in session_counts:
            print(f"  {status:<18} {session_counts[status]:>6}")
    if exhausted:
        print(f"  budget_exhausted sessions awaiting human resume: {len(exhausted)}")
        for sid in exhausted:
            print(f"    {sid}")
    print("research followups by status")
    for status in FOLLOWUP_STATUSES:
        if status in followup_counts:
            print(f"  {status:<12} {followup_counts[status]:>6}")
    print(f"  {'total':<12} {sum(followup_counts.values()):>6}")
    print(f"tool calls recorded: {tool_calls}")

    if org:
        print()
        print(f"recent sessions (org {org!r}, newest first, ≤ {limit})")
        if not sessions:
            print("  (none)")
        for sid, status, objective, tc, mc, cost in sessions:
            cost_s = "—" if cost is None else f"${cost:.4f}"
            print(
                f"  {sid}  {status:<17} tools={tc:<4} models={mc:<3} "
                f"cost={cost_s}  {objective[:60]}"
            )
        print(f"followups (org {org!r}, due-soonest first, ≤ {limit})")
        if not followups:
            print("  (none)")
        for fid, ftype, status, due in followups:
            print(f"  {fid}  {ftype:<22} {status:<10} due {due}")
    return EXIT_OK


def _cmd_followups_dispatch(queue: DurableTaskQueue, engine, limit: int) -> int:
    """Manual trigger of the worker's Phase 3 followup pass."""
    from coffee_export.tasks.research_tasks import (
        dispatch_due_followups,
        reconcile_followups,
    )

    rec = reconcile_followups(queue, engine)
    disp = dispatch_due_followups(queue, engine, limit=limit)
    print(
        "followup dispatch pass complete: "
        f"reconciled {rec['done']} done / {rec['failed']} failed "
        f"(examined {rec['examined']}), "
        f"enqueued {disp['enqueued']}, failed {disp['failed']} "
        f"(due {disp['due']})"
    )
    if disp["enqueued"] == 0 and disp["failed"] == 0:
        return EXIT_NOT_FOUND  # nothing was due
    return EXIT_OK


def _cmd_followups_list(engine, org: str, status: str | None, limit: int) -> int:
    from coffee_export.research.followups import ResearchFollowups

    service = ResearchFollowups(org, engine)
    rows = service.list_followups(status=status, limit=limit)
    if not rows:
        print(f"no followups for org {org!r}" + (f" with status {status!r}" if status else ""))
        return EXIT_NOT_FOUND
    header = (
        f"{'followup_id':<38} {'type':<22} {'status':<11} "
        f"{'due_ts':<26} {'task_id':<38} subject"
    )
    print(header)
    print("-" * len(header))
    for r in rows:
        subject = r.subject_type or ""
        if r.subject_type and r.subject_id:
            subject = f"{r.subject_type}:{r.subject_id}"
        elif r.session_id:
            subject = f"session:{r.session_id}"
        print(
            f"{r.followup_id:<38} {r.followup_type:<22} {r.status:<11} "
            f"{_fmt_ts(r.due_ts, 25):<26} {(r.task_id or '—'):<38} {subject[:40]}"
        )
    return EXIT_OK


# ── Phase 7: research health snapshot (§3 J / §8) ─────────────────


def _cmd_health(engine, org: str, window_days: int) -> int:
    """The Phase 7 research health snapshot in CLI form (read-only).

    One org at a time (the service is org-scoped — the counts-only
    cross-org rollup stays on the `research` subcommand).
    """
    from coffee_export.research.monitoring import ResearchHealthService

    service = ResearchHealthService(org, engine)
    snap = service.overview(expiring_days=window_days)

    print(f"research health — org {org!r} (generated {snap['generated_ts']})")
    print()

    sessions = snap["sessions"]
    print("sessions")
    for status, count in sorted(sessions["by_status"].items()):
        print(f"  {status:<18} {count:>6}")
    print(f"  {'total':<18} {sessions['total']:>6}")
    if sessions["budget_exhausted_ids"]:
        print(
            f"  budget_exhausted awaiting human resume: " f"{len(sessions['budget_exhausted_ids'])}"
        )
        for sid in sessions["budget_exhausted_ids"]:
            print(f"    {sid}")
    last = sessions["last_completed"]
    if last:
        print(f"  last completed: {last['session_id']} — {last['objective'][:60]}")

    evidence = snap["evidence"]
    print("evidence quality")
    for status, count in sorted(evidence["by_status"].items()):
        print(f"  {status:<18} {count:>6}")
    print(f"  {'total':<18} {evidence['total']:>6}")
    print(f"  suppressed            {evidence['suppressed']:>6}")
    print(f"  corroboration rate    {evidence['corroboration_rate'] * 100:>5.1f}%")
    print(f"  expiring soon (<{window_days}d) {evidence['expiring_soon']:>4}")
    print(f"  expired still live    {evidence['expired_still_live']:>6}")

    facts = snap["facts"]
    print("facts")
    for status, count in sorted(facts["by_status"].items()):
        print(f"  {status:<18} {count:>6}")
    print(f"  {'total':<18} {facts['total']:>6} (human_locked={facts['human_locked']})")

    budgets = snap["budgets"]
    cost = budgets["reported_cost_usd"]
    cost_s = "not reported" if cost is None else f"${cost:.4f}"
    print("budgets & usage")
    print(f"  tool calls (usage)    {budgets['usage_tool_calls']:>6}")
    print(f"  model calls (usage)   {budgets['usage_model_calls']:>6}")
    print(f"  reported cost         {cost_s:>6}")
    print(f"  tool-call log rows    {budgets['tool_calls_logged']:>6}")

    followups = snap["followups"]
    print("followups")
    for status, count in sorted(followups["by_status"].items()):
        print(f"  {status:<18} {count:>6}")
    print(f"  overdue (scheduled)   {followups['overdue_scheduled']:>6}")
    nxt = followups["next_due"]
    if nxt:
        print(f"  next due: {nxt['followup_id']} at {nxt['due_ts']}")

    queue = snap["queue"]
    print("queue (research.* tasks)")
    for status, count in sorted(queue["by_status"].items()):
        print(f"  {status:<18} {count:>6}")
    print(f"  in flight             {queue['in_flight']:>6}")
    for row in queue["in_flight_detail"]:
        print(f"    {row['task_id']}  {row['task_type']}  attempts={row['attempts']}")

    outreach = snap["outreach"]
    print("outreach approval queue (send_email)")
    for status, count in sorted(outreach["by_status"].items()):
        print(f"  {status:<18} {count:>6}")
    print(f"  awaiting human review {outreach['awaiting_human_review']:>6}")
    print(f"  research-drafted      {outreach['research_drafted_pending']:>6}")
    print("  drafts never send autonomously — human approval required (§4.5)")
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m coffee_export.tasks.admin",
        description="Durable task queue admin (Phase 1A): inspect + requeue terminal tasks.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_stats = sub.add_parser("stats", help="counts by status")
    p_stats.set_defaults(func=_cmd_stats)

    p_list = sub.add_parser("list", help="list tasks")
    p_list.add_argument("--status", choices=list(VALID_STATUSES))
    p_list.add_argument("--limit", type=int, default=20)
    p_list.set_defaults(func=_cmd_list)

    p_show = sub.add_parser("show", help="show one task in full")
    p_show.add_argument("task_id")
    p_show.set_defaults(func=_cmd_show)

    p_requeue = sub.add_parser("requeue", help="failed|dead → pending (operator action)")
    p_requeue.add_argument("task_id")
    p_requeue.add_argument(
        "--keep-attempts",
        action="store_true",
        help="preserve the attempt count instead of resetting the retry budget",
    )
    p_requeue.set_defaults(func=_cmd_requeue)

    p_research = sub.add_parser(
        "research",
        help="research session/followup monitoring (Phase 3)",
    )
    p_research.add_argument("--org", help="org scope for detail view (omit for counts-only rollup)")
    p_research.add_argument("--limit", type=int, default=20)
    p_research.set_defaults(func=_cmd_research)

    p_followups = sub.add_parser("followups", help="research followup operations (Phase 3)")
    followups_sub = p_followups.add_subparsers(dest="followups_command", required=True)

    p_dispatch = followups_sub.add_parser(
        "dispatch",
        help="reconcile + enqueue DUE research followups now (idempotent)",
    )
    p_dispatch.add_argument("--limit", type=int, default=50)
    p_dispatch.set_defaults(func=_cmd_followups_dispatch)

    p_flist = followups_sub.add_parser("list", help="list followup rows for one org")
    p_flist.add_argument("--org", required=True)
    p_flist.add_argument(
        "--status",
        choices=[
            "scheduled",
            "enqueued",
            "done",
            "failed",
            "cancelled",
        ],
    )
    p_flist.add_argument("--limit", type=int, default=20)
    p_flist.set_defaults(func=_cmd_followups_list)

    p_health = sub.add_parser(
        "health",
        help="research health snapshot for one org (Phase 7: evidence "
        "quality, budgets, followups, queue, outreach queue)",
    )
    p_health.add_argument("--org", required=True, help="the org to inspect")
    p_health.add_argument(
        "--window-days",
        type=int,
        default=7,
        help="expiring-soon window for evidence (default 7)",
    )
    p_health.set_defaults(func=_cmd_health)
    return parser


def main(
    argv: list[str] | None = None,
    *,
    queue: DurableTaskQueue | None = None,
    engine=None,
) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if queue is None:
        # CLI mode: keep stdout clean for the report (warnings/errors → stderr)
        from coffee_export.utils.logging import setup_logging

        setup_logging(level=30, enable_file=False)  # WARNING
        # Phase 3: register the research task types so `followups dispatch`
        # can enqueue them (gate 1 needs the registry populated).
        import contextlib

        from coffee_export.tasks.research_tasks import register_research_tasks

        with contextlib.suppress(ValueError):  # already registered (tests)
            register_research_tasks(default_registry)
        engine = create_queue_engine()
        queue = DurableTaskQueue(default_registry, engine)
    if args.command == "stats":
        return args.func(queue)
    if args.command == "list":
        return args.func(queue, args.status, args.limit)
    if args.command == "show":
        return args.func(queue, args.task_id)
    if args.command == "requeue":
        return args.func(queue, args.task_id, args.keep_attempts)
    if args.command == "research":
        return args.func(engine, args.org, args.limit)
    if args.command == "followups":
        if args.followups_command == "dispatch":
            return args.func(queue, engine, args.limit)
        return args.func(engine, args.org, args.status, args.limit)
    if args.command == "health":
        return args.func(engine, args.org, args.window_days)
    parser.error(f"unknown command {args.command!r}")
    return EXIT_USAGE  # unreachable


if __name__ == "__main__":
    sys.exit(main())
