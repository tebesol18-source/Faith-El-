"""
Research followups service + dispatcher tests — TryComp Phase 3.

Proves the §12.2 semantics on disposable per-test databases (tmp_path,
never the committed operational DB):

  * ResearchFollowups — schedule (defaults, canonical payload), org-
    scoped reads (cross-tenant raises ResearchNotFoundError — no
    existence oracle), sanctioned transitions only, validation of
    type/due_ts/created_by/subject-pair
  * dispatch_due_followups — DUE rows across orgs are enqueued with
    their OWN organization_id; the task payload carries the original
    payload + followup_id; the task_id is recorded on the row;
    not-yet-due rows are untouched; idempotent (a second pass finds
    nothing scheduled); a row whose task type is not registered is
    marked failed honestly (gate-1 validation error is permanent)
  * reconcile_followups — enqueued rows converge to their task's
    terminal state (completed → done, failed/dead → failed) while
    in-flight tasks are left alone; a taskless enqueued row fails
    loudly (defensive)
  * recovery-after-restart — followups scheduled before a "restart"
    (fresh service instances, same durable DB) still dispatch after it;
    a followup enqueued before a crash whose task completed without
    closing the loop is converged by reconcile
  * worker integration — run_followup_pass drives the full loop:
    schedule → dispatch (task pending) → run_once (task executed) →
    followup done; the worker built without a followup engine skips
    the pass entirely (Phase 1A behavior unchanged)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.database.models.research import (
    ResearchFollowup,
    ResearchSession,
    ResearchToolCall,
)
from coffee_export.research import ResearchFollowups, ResearchSessions
from coffee_export.research.tools.base import ResearchTool, ToolContext, ToolResult
from coffee_export.tasks.durable_queue import DurableTaskQueue
from coffee_export.tasks.registry import TaskRegistry
from coffee_export.tasks.research_tasks import (
    dispatch_due_followups,
    reconcile_followups,
    register_research_tasks,
)
from coffee_export.tasks.worker import TaskWorker

ORG = "org-acme"
OTHER_ORG = "org-beta"
DUE_PAST = "2020-01-01T00:00:00+03:00"
DUE_FUTURE = "2099-01-01T00:00:00+03:00"


class SpyTool(ResearchTool):
    name = "spy"
    description = "test double"
    input_schema = {"value": {"type": "str", "required": True}}
    output_schema = {"echo": {"type": "str", "required": True}}

    def __init__(self) -> None:
        self.calls = 0

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:  # noqa: ARG002
        self.calls += 1
        return ToolResult.ok({"echo": tool_input["value"]})


class Env:
    def __init__(self, engine: Engine, registry: TaskRegistry, spy: SpyTool) -> None:
        self.db_engine = engine
        self.spy = spy
        self.registry = registry
        self.queue = DurableTaskQueue(
            registry, engine, lease_ttl_seconds=300, backoff_base_seconds=1
        )
        self.acme = ResearchFollowups(ORG, engine)
        self.beta = ResearchFollowups(OTHER_ORG, engine)

    def schedule(self, followup_type="revalidate_evidence", *, due_ts=DUE_PAST, **kwargs):
        return self.acme.schedule(
            followup_type,
            due_ts=due_ts,
            created_by=kwargs.pop("created_by", "operator:1"),
            **kwargs,
        )


@pytest.fixture()
def env(tmp_path: Path) -> Env:
    engine = create_engine(f"sqlite:///{tmp_path}/followups.db", future=True)
    for table in (
        ResearchFollowup.__table__,
        ResearchSession.__table__,
        ResearchToolCall.__table__,
    ):
        table.create(engine)
    AgentTask.__table__.create(engine)
    spy = SpyTool()
    registry = TaskRegistry()
    register_research_tasks(registry, engine=engine, tool_registry=_tool_registry(spy))
    return Env(engine, registry, spy)


def _tool_registry(spy: SpyTool):
    from coffee_export.research import ToolRegistry

    tool_registry = ToolRegistry()
    tool_registry.register(spy)
    return tool_registry


# ── service ────────────────────────────────────────────────────


def test_schedule_defaults_and_roundtrip(env: Env) -> None:
    row = env.schedule(payload={"subject_type": "company", "subject_id": "c-1"})
    assert row.status == "scheduled"
    assert json.loads(row.payload) == {"subject_type": "company", "subject_id": "c-1"}
    assert row.task_id is None
    fetched = env.acme.get_followup(row.followup_id)
    assert fetched.followup_id == row.followup_id
    listed = env.acme.list_followups(status="scheduled")
    assert [r.followup_id for r in listed] == [row.followup_id]


def test_schedule_validation(env: Env) -> None:
    with pytest.raises(ValueError, match="followup_type"):
        env.schedule("bogus_type", due_ts=DUE_PAST)
    with pytest.raises(ValueError, match="due_ts"):
        env.schedule("revalidate_evidence", due_ts="   ")
    with pytest.raises(ValueError, match="created_by"):
        env.schedule("revalidate_evidence", due_ts=DUE_PAST, created_by="")
    with pytest.raises(ValueError, match="payload must be"):
        env.schedule("revalidate_evidence", due_ts=DUE_PAST, payload=[1])
    with pytest.raises(ValueError, match="together"):
        env.schedule("revalidate_evidence", due_ts=DUE_PAST, subject_type="company")


def test_org_isolation_no_existence_oracle(env: Env) -> None:
    row = env.schedule()
    with pytest.raises(Exception, match="not found"):
        env.beta.get_followup(row.followup_id)
    with pytest.raises(Exception, match="not found"):
        env.beta.cancel_followup(row.followup_id)
    assert env.beta.list_followups() == []


def test_sanctioned_transitions_only(env: Env) -> None:
    row = env.schedule()
    # scheduled → cancelled (operator, pre-dispatch)
    env.acme.cancel_followup(row.followup_id)
    assert env.acme.get_followup(row.followup_id).status == "cancelled"
    with pytest.raises(ValueError, match="unsanctioned"):
        env.acme.mark_done(row.followup_id)  # cancelled is terminal

    row2 = env.schedule()
    env.acme.mark_enqueued(row2.followup_id, task_id="t-1")
    assert env.acme.get_followup(row2.followup_id).task_id == "t-1"
    with pytest.raises(ValueError, match="unsanctioned"):
        env.acme.cancel_followup(row2.followup_id)  # enqueued cannot cancel
    env.acme.mark_done(row2.followup_id)
    with pytest.raises(ValueError, match="unsanctioned"):
        env.acme.mark_enqueued(row2.followup_id, task_id="t-2")  # done is terminal
    with pytest.raises(ValueError, match="task_id is required"):
        env.acme.mark_enqueued(env.schedule().followup_id, task_id=" ")


# ── dispatcher ─────────────────────────────────────────────────


def test_dispatch_enqueues_due_rows_with_their_own_org(env: Env) -> None:
    mine = env.schedule(payload={"subject_type": "company", "subject_id": "c-1"})
    other = env.beta.schedule(
        "run_session",
        due_ts=DUE_PAST,
        payload={"session_id": "rses-x"},
        created_by="operator:2",
    )
    not_due = env.schedule(due_ts=DUE_FUTURE)

    summary = dispatch_due_followups(env.queue, env.db_engine)
    assert summary == {"due": 2, "enqueued": 2, "failed": 0}

    task_payload = json.loads(
        env.queue.get_task(env.acme.get_followup(mine.followup_id).task_id).payload
    )
    assert task_payload == {
        "subject_type": "company",
        "subject_id": "c-1",
        "followup_id": mine.followup_id,
    }
    other_task = env.queue.get_task(env.beta.get_followup(other.followup_id).task_id)
    assert other_task.task_type == "research.run_session"
    assert other_task.organization_id == OTHER_ORG  # the row's OWN org, never a fallback
    assert other_task.payload and json.loads(other_task.payload)["session_id"] == "rses-x"
    assert env.acme.get_followup(not_due.followup_id).status == "scheduled"

    # idempotent: nothing scheduled-and-due remains
    assert dispatch_due_followups(env.queue, env.db_engine)["due"] == 0


def test_dispatch_marks_unregistered_type_failed(env: Env, tmp_path: Path) -> None:
    # a queue whose registry does NOT know research.* (gate 1 refuses)
    bare = DurableTaskQueue(TaskRegistry(), env.db_engine)
    row = env.schedule()
    summary = dispatch_due_followups(bare, env.db_engine)
    assert summary["failed"] == 1
    assert env.acme.get_followup(row.followup_id).status == "failed"


# ── reconcile (recovery path) ──────────────────────────────────


def test_reconcile_converges_terminal_tasks(env: Env) -> None:
    done_row = env.schedule()
    failed_row = env.schedule()
    inflight_row = env.schedule()
    for row in (done_row, failed_row, inflight_row):
        task_id = env.queue.enqueue("research.revalidate_evidence", {}, organization_id=ORG)
        env.acme.mark_enqueued(row.followup_id, task_id=task_id)
        row.task_id = task_id  # remember for the outcome map below

    # Claim ALL three (queue order is unspecified on ties); drive the
    # done_row task to completed and the failed_row task to failed; the
    # inflight_row task stays LEASED — the honest "being executed now"
    # state reconcile must leave alone.
    by_task_id = {
        done_row.task_id: "completed",
        failed_row.task_id: "failed",
        inflight_row.task_id: "leased",
    }
    for _ in range(3):
        task = env.queue.claim_next("w-test")
        assert task is not None
        outcome = by_task_id[task.task_id]
        if outcome == "completed":
            assert env.queue.complete(task.task_id, task.token, {"ok": True})
        elif outcome == "failed":
            assert env.queue.fail(task.task_id, task.token, "boom", retryable=False) == "failed"
        # leased → nothing: still in flight

    summary = reconcile_followups(env.queue, env.db_engine)
    assert summary["done"] == 1
    assert summary["failed"] == 1
    assert env.acme.get_followup(done_row.followup_id).status == "done"
    assert env.acme.get_followup(failed_row.followup_id).status == "failed"
    assert env.acme.get_followup(inflight_row.followup_id).status == "enqueued"


def test_reconcile_fails_taskless_enqueued_row_loudly(env: Env) -> None:
    row = env.schedule()
    # defensive: simulate a legacy/corrupt row that is enqueued without task_id
    with env.db_engine.begin() as conn:
        conn.execute(
            ResearchFollowup.__table__.update()
            .where(ResearchFollowup.followup_id == row.followup_id)
            .values(status="enqueued")
        )
    summary = reconcile_followups(env.queue, env.db_engine)
    assert summary["failed"] == 1
    assert env.acme.get_followup(row.followup_id).status == "failed"


# ── recovery-after-restart ──────────────────────────────────────


def test_followups_scheduled_before_restart_still_dispatch(env: Env, tmp_path: Path) -> None:
    """Restart simulation: fresh services on the SAME durable DB."""
    env.schedule(payload={"subject_type": "company", "subject_id": "c-1"})

    # "restart" — brand-new instances, same engine/DB
    fresh_followups = ResearchFollowups(ORG, env.db_engine)
    fresh_queue = DurableTaskQueue(env.registry, env.db_engine)
    scheduled = fresh_followups.list_followups(status="scheduled")
    assert len(scheduled) == 1  # survived the "restart" by construction

    summary = dispatch_due_followups(fresh_queue, env.db_engine)
    assert summary["enqueued"] == 1
    assert fresh_followups.list_followups(status="enqueued")


def test_full_worker_loop_closes_the_followup(env: Env, tmp_path: Path) -> None:
    """The Phase 3 end-to-end: schedule → dispatch (worker pass) → execute
    (worker run_once) → followup done. The session runs a spy-tool plan."""
    sessions = ResearchSessions(ORG, env.db_engine)
    session_row, _ = sessions.create_session(
        "Find importers in Hamburg",
        created_by="operator:1",
        plan=[
            {"step": 1, "phase": "collect", "tool": "spy", "input": {"value": "a"}},
        ],
    )
    fu = env.acme.schedule(
        "run_session",
        due_ts=DUE_PAST,
        payload={"session_id": session_row.session_id},
        session_id=session_row.session_id,
        created_by="operator:1",
    )

    worker = TaskWorker(
        env.queue,
        env.registry,
        poll_interval=0.05,
        heartbeat_interval=500,
        reaper_interval=500,
        lock_path=tmp_path / "w.lock",
        install_signals=False,
        followup_engine=env.db_engine,
    )
    # 1) followup pass dispatches the due followup
    assert worker.run_followup_pass() is True
    task_id = env.acme.get_followup(fu.followup_id).task_id
    assert env.queue.get_task(task_id).status == "pending"
    assert env.acme.get_followup(fu.followup_id).status == "enqueued"
    # 2) the worker executes the task (handler closes the loop)
    assert worker.run_once() is True
    assert env.queue.get_task(task_id).status == "completed"
    assert env.acme.get_followup(fu.followup_id).status == "done"
    assert sessions.get_session(session_row.session_id).status == "completed"
    assert env.spy.calls == 1
    # 3) nothing left to dispatch
    assert worker.run_followup_pass() is False


def test_worker_without_followup_engine_skips_the_pass(env: Env, tmp_path: Path) -> None:
    env.schedule()  # a due followup exists
    worker = TaskWorker(
        env.queue,
        env.registry,
        poll_interval=0.05,
        heartbeat_interval=500,
        reaper_interval=500,
        lock_path=tmp_path / "w2.lock",
        install_signals=False,
    )
    assert worker.run_followup_pass() is False  # disabled — Phase 1A behavior
    assert env.acme.get_followup(env.schedule().followup_id).status == "scheduled"
