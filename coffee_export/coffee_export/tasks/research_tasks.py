"""
Durable research task types (TryComp Phase 3, §3 D/E).

The FIRST real business registrations in default_registry (until now it
shipped empty of business types — Phase 1A kept the queue
infrastructure-only). Two task types, both org-scoped, idempotent and
honestly classified:

  research.run_session(payload={"session_id", "followup_id"?})
      Drives one research session's stored plan through the Phase 2
      ResearchEngine facade (the ONE path from session to tool call, so
      in-process and durable semantics stay identical):
        * finished session (completed/failed/cancelled) → the task
          completes with the current state — NEVER re-executed;
        * budget_exhausted session → the task completes with the honest
          budget outcome (the human resume path is the only
          continuation — a task must not fight it);
        * missing session (or other tenant's) → NonRetryableTaskError →
          task `failed` in one attempt (retrying cannot succeed);
        * BudgetExhaustedError DURING execution → the engine already
          stopped the session; the task completes with the honest
          budget_stopped outcome;
        * any other exception → RETRYABLE (worker default — at-least-once).
      Idempotency under at-least-once: a plan step counts as executed
      iff a research_tool_calls row already exists for (tool, canonical
      input) in this session — the append-only log IS the progress
      ledger, so a re-run after a crash resumes at the first unexecuted
      step and never double-records. Steps without an explicit "input"
      object are skipped honestly (LLM-assisted planning lands Phase 4
      through the same stored-JSON plan contract).
      If the payload carries a followup_id, the followup row is closed
      (done) when the task completes.

  research.revalidate_evidence(payload={"subject_type"?,"subject_id"?,
                                        "followup_id"?})
      The revalidation sweep as durable work: EvidenceLedger.sweep_
      expired() marks expired live evidence outdated (each with an
      honest fact recompute). Idempotent: a second run sweeps nothing.
      Missing payloads are NOT a thing here (empty payload is valid —
      org-wide sweep), so the only non-retryable path is a broken
      subject pair, rejected at validation time (gate 1/2).

Dispatch + recovery (this module is also the queue-side bridge):

  dispatch_due_followups(queue, engine) — scans DUE scheduled followup
      rows ACROSS ORGS (the one sanctioned cross-org read in the
      research stack — same trust level as claim_next; it never reads
      evidence/facts/session content, only dispatch data) and enqueues
      each as research.<followup_type> with the row's OWN organization_id
      (explicit, never a fallback). A row whose type is not registered
      fails honestly (marked failed, reason recorded). Returns a summary.

  reconcile_followups(queue, engine) — the recovery pass: enqueued rows
      whose task terminally completed/failed/dead converge to done/
      failed; still-pending/leased tasks are left alone. Rows scheduled
      before a crash/restart are simply still scheduled — dispatch picks
      them up on the next pass (restart-safe by construction).
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.engine import Engine

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.research import ResearchFollowup
from coffee_export.research.budget import BudgetExhaustedError
from coffee_export.research.common import (
    RESEARCH_TASK_TYPES,
    ResearchNotFoundError,
    canonical_json,
)
from coffee_export.research.engine import ResearchEngine
from coffee_export.research.evidence import EvidenceLedger
from coffee_export.research.followups import ResearchFollowups
from coffee_export.research.sessions import ResearchSessions
from coffee_export.tasks.registry import (
    NonRetryableTaskError,
    PayloadValidationError,
    TaskRegistry,
    TaskSnapshot,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

#: Payload keys admissible for research.run_session.
RUN_SESSION_FIELDS: tuple[str, ...] = ("session_id", "followup_id")
#: Payload keys admissible for research.revalidate_evidence.
REVALIDATE_FIELDS: tuple[str, ...] = ("subject_type", "subject_id", "followup_id")

#: How many due followups one dispatch pass may enqueue (bounded work
#: per tick; the next pass continues — no unbounded loops in the worker).
DISPATCH_BATCH_LIMIT = 50


# ──────────────────────────────────────────────────────────────
# Validators (gate 1 at enqueue, gate 2 in the worker)
# ──────────────────────────────────────────────────────────────


def validate_run_session_payload(payload: dict) -> None:
    """session_id required (non-empty str); optional followup_id
    (non-empty str); NO other fields (tight contract)."""
    if "session_id" not in payload:
        raise PayloadValidationError("research.run_session: session_id is required")
    session_id = payload["session_id"]
    if not isinstance(session_id, str) or not session_id.strip():
        raise PayloadValidationError(
            f"research.run_session: session_id must be a non-empty string, "
            f"got {type(session_id).__name__}"
        )
    followup_id = payload.get("followup_id")
    if followup_id is not None and (not isinstance(followup_id, str) or not followup_id.strip()):
        raise PayloadValidationError(
            "research.run_session: followup_id must be a non-empty string when present"
        )
    unknown = set(payload) - set(RUN_SESSION_FIELDS)
    if unknown:
        raise PayloadValidationError(
            f"research.run_session: unknown payload fields {sorted(unknown)}"
        )


def validate_revalidate_payload(payload: dict) -> None:
    """Optional subject pair (subject_type + subject_id, non-empty strs,
    both or neither); optional followup_id; NO other fields. An empty
    payload is valid (org-wide sweep)."""
    subject_type = payload.get("subject_type")
    subject_id = payload.get("subject_id")
    if (subject_type is None) != (subject_id is None):
        raise PayloadValidationError(
            "research.revalidate_evidence: subject_type and subject_id must " "be given together"
        )
    for field in ("subject_type", "subject_id"):
        value = payload.get(field)
        if value is not None and (not isinstance(value, str) or not value.strip()):
            raise PayloadValidationError(
                f"research.revalidate_evidence: {field} must be a non-empty " f"string when present"
            )
    followup_id = payload.get("followup_id")
    if followup_id is not None and (not isinstance(followup_id, str) or not followup_id.strip()):
        raise PayloadValidationError(
            "research.revalidate_evidence: followup_id must be a non-empty " "string when present"
        )
    unknown = set(payload) - set(REVALIDATE_FIELDS)
    if unknown:
        raise PayloadValidationError(
            f"research.revalidate_evidence: unknown payload fields {sorted(unknown)}"
        )


# ──────────────────────────────────────────────────────────────
# Handler factories (engine/registry/clock injectable for tests)
# ──────────────────────────────────────────────────────────────


def make_run_session_handler(
    *,
    engine: Engine | None = None,
    tool_registry: Any = None,
    clock: Any = None,
):
    """Build the research.run_session handler bound to an injectable
    engine/tool-registry/clock (tests). Omitted engine → the application
    engine, resolved LAZILY at call time so COFFEE_DATABASE_URL is read
    per-process, not at import time."""

    def _engine() -> Engine:
        if engine is not None:
            return engine
        from coffee_export.database.base import engine as app_engine

        return app_engine

    def handle_run_session(payload: dict, snapshot: TaskSnapshot) -> dict:
        org = snapshot.organization_id
        db_engine = _engine()
        sessions = ResearchSessions(org, db_engine)
        research = ResearchEngine(org, db_engine, registry=tool_registry, clock=clock)

        session_id = payload["session_id"]
        try:
            row = sessions.get_session(session_id)
        except ResearchNotFoundError as exc:
            # Missing OR another tenant's session: retrying can never
            # succeed, and re-running in another org context is exactly
            # the cross-tenant hazard we refuse.
            raise NonRetryableTaskError(
                f"research session not found for org {org!r}: {session_id}"
            ) from exc

        # Idempotent short-circuits: a finished session is never re-executed.
        if row.status in ("completed", "failed", "cancelled"):
            return {
                "session_id": session_id,
                "status": row.status,
                "outcome": "already-finished",
                "usage_tool_calls": row.usage_tool_calls,
                "usage_model_calls": row.usage_model_calls,
                "followup": _close_followup(payload, org, db_engine, done=True),
            }
        if row.status == "budget_exhausted":
            return {
                "session_id": session_id,
                "status": "budget_exhausted",
                "outcome": "budget_exhausted_awaiting_human_resume",
                "usage_tool_calls": row.usage_tool_calls,
                "usage_model_calls": row.usage_model_calls,
                "followup": _close_followup(payload, org, db_engine, done=True),
            }

        # pending/running → drive the stored plan.
        if row.status == "pending":
            sessions.start_session(session_id)
        try:
            plan = json.loads(row.plan)
        except (json.JSONDecodeError, TypeError) as exc:
            # A corrupt stored plan is permanent data corruption —
            # non-retryable, honest message.
            raise NonRetryableTaskError(
                f"session {session_id} carries a corrupt plan: {exc}"
            ) from exc
        if not isinstance(plan, list) or not plan:
            raise NonRetryableTaskError(f"session {session_id} carries an empty/invalid plan")

        already = {
            (call.tool, call.input)
            for call in research.list_tool_calls(session_id)
            if call.input is not None
        }
        executed: list[dict] = []
        skipped: list[dict] = []
        budget_stop: str | None = None
        for step in plan:
            step_no = step.get("step") if isinstance(step, dict) else None
            tool = step.get("tool") if isinstance(step, dict) else None
            tool_input = step.get("input") if isinstance(step, dict) else None
            if not tool:
                skipped.append({"step": step_no, "reason": "no tool (summary/decision phase)"})
                continue
            if not isinstance(tool_input, dict) or not tool_input:
                skipped.append(
                    {
                        "step": step_no,
                        "tool": tool,
                        "reason": (
                            "plan step carries no tool input — LLM-assisted "
                            "planning lands Phase 4 (honest skip)"
                        ),
                    }
                )
                continue
            input_json = canonical_json(tool_input)
            if (tool, input_json) in already:
                skipped.append(
                    {
                        "step": step_no,
                        "tool": tool,
                        "reason": "already executed (recorded tool call) — resumed",
                    }
                )
                continue
            try:
                outcome = research.run_tool(session_id, tool, tool_input)
            except BudgetExhaustedError as exc:
                # The engine already recorded the refusal and stopped the
                # session; the task completes with the honest outcome —
                # budget exhaustion is a SESSION state, not a task failure.
                budget_stop = exc.reason
                break
            executed.append(
                {
                    "step": step_no,
                    "tool": tool,
                    "status": outcome.status,
                    "error": outcome.error_message,
                    "cost_usd": outcome.cost_usd,
                    "duration_ms": outcome.duration_ms,
                }
            )

        if budget_stop is None:
            summary = {
                "objective": row.objective,
                "steps_executed": executed,
                "steps_skipped": skipped,
                "usage_tool_calls": row.usage_tool_calls + len(executed),
            }
            sessions.complete_session(session_id, summary)
            final_status = "completed"
        else:
            final_status = "budget_exhausted"

        return {
            "session_id": session_id,
            "status": final_status,
            "outcome": (
                "plan-driven session completed"
                if budget_stop is None
                else f"budget_stopped:{budget_stop}"
            ),
            "steps_executed": len(executed),
            "steps_skipped": len(skipped),
            "followup": _close_followup(payload, org, db_engine, done=True),
        }

    return handle_run_session


def make_revalidate_handler(*, engine: Engine | None = None):
    """Build the research.revalidate_evidence handler (injectable engine)."""

    def _engine() -> Engine:
        if engine is not None:
            return engine
        from coffee_export.database.base import engine as app_engine

        return app_engine

    def handle_revalidate(payload: dict, snapshot: TaskSnapshot) -> dict:
        org = snapshot.organization_id
        ledger = EvidenceLedger(org, _engine())
        swept = ledger.sweep_expired(
            subject_type=payload.get("subject_type"),
            subject_id=payload.get("subject_id"),
        )
        return {
            "organization_id": org,
            "swept_count": len(swept),
            "swept_evidence_ids": swept,
            "followup": _close_followup(payload, org, _engine(), done=True),
        }

    return handle_revalidate


def _close_followup(payload: dict, org: str, engine: Engine, *, done: bool) -> str | None:
    """Close the followup loop if this task came from a followup.

    done=True → mark_done (task completed); a followup whose task
    retried/failed is converged by reconcile_followups instead (this
    path only fires on task success). Returns the followup_id or None.
    A missing/other-tenant followup_id is logged and ignored — the task
    itself already did its honest work."""
    followup_id = payload.get("followup_id")
    if not followup_id:
        return None
    followups = ResearchFollowups(org, engine)
    try:
        if done:
            followups.mark_done(followup_id)
        else:  # pragma: no cover — reserved for future failure-side closure
            followups.mark_failed(followup_id, "task failed")
    except (ResearchNotFoundError, ValueError) as exc:
        log.warning("followup %s could not be closed for org %s: %s", followup_id, org, exc)
        return None  # honestly NOT closed (logged above)
    return followup_id


# ──────────────────────────────────────────────────────────────
# Session creation with planning (Phase 4 §12.1)
# ──────────────────────────────────────────────────────────────


def create_session_with_planning(
    engine: Engine,
    organization_id: str,
    objective: str,
    *,
    created_by: str,
    budgets: Any = None,
    gateway: Any = None,
    tool_registry: Any = None,
    clock: Any = None,
):
    """Agent-facing session creation with LLM-assisted planning (Phase 4 §12.1).

    The Agent-2 entry point of the Buyer Radar: plan the objective
    (LLM-assisted when a gateway is provided and a provider answers
    with a strictly-valid plan; deterministic template otherwise —
    plan_objective_ai), create (or org-scoped-reuse) the session with
    the WINNING plan, and account the model call against the session
    through engine.record_model_call (budget accounting — never a side
    channel; the gateway also logs it to ai_call_logs like every agent
    call).

    Returns (session, created, PlanOutcome). The PlanOutcome is honest
    audit data (source/provider/model/cost/parse_error) — persist it in
    the caller's audit trail if needed; the session itself carries the
    plan and usage.

    Note: recording the planning call auto-starts a pending session
    (Phase 2 record_model_call semantics) — the wall-clock budget
    window opens at planning time. With the default unlimited
    max_wall_seconds this is immaterial; tight wall budgets should be
    paired with prompt dispatch.
    """
    from coffee_export.research.planning import plan_objective_ai
    from coffee_export.research.sessions import ResearchSessions

    outcome = plan_objective_ai(objective, gateway)
    sessions = ResearchSessions(organization_id, engine)
    row, created = sessions.create_session(
        objective,
        created_by=created_by,
        plan=outcome.steps,
        budgets=budgets,
        on_duplicate="reuse",
    )
    if outcome.source == "llm" and created:
        from coffee_export.research.engine import ResearchEngine

        research = ResearchEngine(organization_id, engine, registry=tool_registry, clock=clock)
        research.record_model_call(row.session_id, cost_usd=outcome.cost_usd)
        row = sessions.get_session(row.session_id)  # refreshed usage counters
    return row, created, outcome


# ──────────────────────────────────────────────────────────────
# Registration
# ──────────────────────────────────────────────────────────────


def register_research_tasks(
    registry: TaskRegistry,
    *,
    engine: Engine | None = None,
    tool_registry: Any = None,
    clock: Any = None,
) -> None:
    """Register the Phase 3 research task types (call ONCE per process
    at startup — the registry refuses duplicate registration, which is
    the approved swap-protection).

    engine/tool_registry/clock are the injectables forwarded to the
    handler factories; the production worker passes its queue engine so
    research writes share the queue's SQLite BEGIN IMMEDIATE engine."""
    registry.register(
        "research.run_session",
        make_run_session_handler(engine=engine, tool_registry=tool_registry, clock=clock),
        validator=validate_run_session_payload,
        description=(
            "Drive one research session's stored plan through the "
            "budget-enforced ResearchEngine (idempotent, org-scoped)."
        ),
    )
    registry.register(
        "research.revalidate_evidence",
        make_revalidate_handler(engine=engine),
        validator=validate_revalidate_payload,
        description=(
            "Revalidation sweep: mark expired live evidence outdated and "
            "recompute affected facts (idempotent, org-scoped)."
        ),
    )


# ──────────────────────────────────────────────────────────────
# Dispatch + recovery (queue-side bridge)
# ──────────────────────────────────────────────────────────────


def _due_followup_rows(engine: Engine, *, now_iso: str, limit: int):
    """DUE scheduled followup rows across orgs (dispatch data only)."""
    with engine.connect() as conn:
        rows = conn.execute(
            select(
                ResearchFollowup.followup_id,
                ResearchFollowup.organization_id,
                ResearchFollowup.followup_type,
                ResearchFollowup.payload,
            )
            .where(
                ResearchFollowup.status == "scheduled",
                ResearchFollowup.due_ts <= now_iso,
            )
            .order_by(ResearchFollowup.due_ts, ResearchFollowup.followup_id)
            .limit(limit)
        ).all()
    return rows


def dispatch_due_followups(
    queue,
    engine: Engine,
    *,
    now_iso: str | None = None,
    limit: int = DISPATCH_BATCH_LIMIT,
) -> dict[str, int]:
    """Enqueue every DUE scheduled followup as its research.* task.

    The one sanctioned cross-org read in the research stack (queue
    bridge — same trust level as claim_next): it reads dispatch data
    only and stamps each task with the row's OWN organization_id. A row
    whose task type is not registered (validation failure at gate 1) is
    marked failed honestly — dispatch errors are permanent, not
    retryable. Returns a summary dict.
    """
    now = now_iso or now_addis_iso()
    enqueued = failed = 0
    for followup_id, org, followup_type, payload_json in _due_followup_rows(
        engine, now_iso=now, limit=limit
    ):
        task_type = f"research.{followup_type}"
        try:
            task_payload = json.loads(payload_json) if payload_json else {}
        except json.JSONDecodeError:
            task_payload = None  # force the honest validation failure below
        followups = ResearchFollowups(org, engine)
        try:
            if not isinstance(task_payload, dict):
                raise ValueError("followup payload is not a JSON object")
            task_payload = {**task_payload, "followup_id": followup_id}
            task_id = queue.enqueue(task_type, task_payload, organization_id=org)
        except Exception as exc:  # noqa: BLE001 — honest failure row, never silent
            followups.mark_failed(followup_id, f"dispatch failed: {type(exc).__name__}: {exc}")
            failed += 1
            continue
        followups.mark_enqueued(followup_id, task_id=task_id)
        enqueued += 1
    if enqueued or failed:
        log.info(
            "research followup dispatch: %d enqueued, %d failed (batch ≤ %d)",
            enqueued,
            failed,
            limit,
        )
    return {"due": enqueued + failed, "enqueued": enqueued, "failed": failed}


def reconcile_followups(
    queue,
    engine: Engine,
    *,
    limit: int = DISPATCH_BATCH_LIMIT,
) -> dict[str, int]:
    """Converge enqueued followup rows to their task's terminal state.

    The recovery pass after crashes/restarts: a task that completed (or
    terminally failed/dead) after its handler could no longer close the
    followup loop (worker died between complete() and mark_done) is
    reconciled here. Still-pending/leased tasks are left alone — the
    worker is either running them or the reaper owns them."""
    with engine.connect() as conn:
        rows = conn.execute(
            select(
                ResearchFollowup.followup_id,
                ResearchFollowup.organization_id,
                ResearchFollowup.task_id,
            )
            .where(ResearchFollowup.status == "enqueued")
            .order_by(ResearchFollowup.updated_ts, ResearchFollowup.followup_id)
            .limit(limit)
        ).all()
    done = failed = 0
    for followup_id, org, task_id in rows:
        if not task_id:
            # Defensive: enqueued without a task_id should not exist
            # (mark_enqueued requires one). Fail honestly, loudly.
            ResearchFollowups(org, engine).mark_failed(
                followup_id, "enqueued followup carries no task_id"
            )
            failed += 1
            continue
        task = queue.get_task(task_id)
        if task is None:
            continue  # unknown task — leave for the queue; not our row
        if task.status == "completed":
            ResearchFollowups(org, engine).mark_done(followup_id)
            done += 1
        elif task.status in ("failed", "dead"):
            ResearchFollowups(org, engine).mark_failed(
                followup_id, f"task {task_id} terminally {task.status}"
            )
            failed += 1
        # pending | leased → in flight; leave alone
    if done or failed:
        log.info("research followup reconcile: %d done, %d failed", done, failed)
    return {"examined": len(rows), "done": done, "failed": failed}


__all__ = [
    "DISPATCH_BATCH_LIMIT",
    "RESEARCH_TASK_TYPES",
    "RUN_SESSION_FIELDS",
    "REVALIDATE_FIELDS",
    "create_session_with_planning",
    "dispatch_due_followups",
    "make_revalidate_handler",
    "make_run_session_handler",
    "reconcile_followups",
    "register_research_tasks",
    "validate_revalidate_payload",
    "validate_run_session_payload",
]
