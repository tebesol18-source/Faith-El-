"""
Durable research task tests — TryComp Phase 3 (research.* task types).

Proves the §12.1 semantics on disposable per-test databases (tmp_path,
never the committed operational DB):

  * validators — tight payload contracts (required session_id, subject
    pair together, unknown fields rejected, non-empty strings)
  * handle_run_session — idempotent short-circuits for finished
    (completed/failed/cancelled) and budget_exhausted sessions (NEVER
    re-executed); missing / other-tenant session → NonRetryableTaskError
    (task failed in ONE attempt — verified through a real TaskWorker);
    plan steps with explicit inputs run through the Phase 2 engine
    facade (spy tool); steps without inputs skipped honestly; corrupt
    plan → NonRetryableTaskError; budget stop mid-plan → the task
    COMPLETES with the honest budget_stopped outcome while the session
    stays budget_exhausted (the human resume path owns continuation)
  * crash-recovery idempotency — a handler interrupted after some steps
    recorded (simulated DB hiccup on complete_session) re-runs WITHOUT
    re-executing recorded steps: the append-only tool-call log IS the
    progress ledger (a step counts as executed iff a tool-call row
    exists for (tool, canonical input))
  * handle_revalidate_evidence — the sweep marks expired live evidence
    outdated with honest fact recompute; unexpired rows untouched;
    subject filter; idempotent second run; a human-locked fact stays
    locked (the lock is absolute even when its attestation outdates)
  * followup loop closure — a payload with followup_id marks the
    followup done on task completion; a missing followup is logged and
    ignored (the task still did its honest work)
  * worker integration — monitoring hooks fire (claimed/completed/
    failed); a raising hook never kills the worker; classification via
    the real worker path (NonRetryableTaskError → failed in one attempt)
  * register_research_tasks — registers exactly the two research types;
    duplicate registration is refused (swap protection)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
    ResearchFollowup,
    ResearchSession,
    ResearchToolCall,
)
from coffee_export.research import (
    BudgetSpec,
    EvidenceLedger,
    ResearchEngine,
    ResearchSessions,
    ToolRegistry,
)
from coffee_export.research.tools.base import ResearchTool, ToolContext, ToolResult
from coffee_export.tasks.durable_queue import DurableTaskQueue, create_queue_engine
from coffee_export.tasks.registry import (
    NonRetryableTaskError,
    TaskRegistry,
    TaskSnapshot,
)
from coffee_export.tasks.research_tasks import (
    make_revalidate_handler,
    make_run_session_handler,
    register_research_tasks,
    validate_revalidate_payload,
    validate_run_session_payload,
)
from coffee_export.tasks.worker import TaskWorker, WorkerHooks

ORG = "org-acme"
OTHER_ORG = "org-beta"
OBJECTIVE = "Find specialty coffee importers in Hamburg"


class SpyTool(ResearchTool):
    """Deterministic test double: counts calls, optional cost/raise."""

    name = "spy"
    description = "test double"
    input_schema = {"value": {"type": "str", "required": True}}
    output_schema = {"echo": {"type": "str", "required": True}}

    def __init__(self, *, cost_usd: float | None = None, raise_exc: Exception | None = None):
        self.calls = 0
        self._cost_usd = cost_usd
        self._raise_exc = raise_exc

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:  # noqa: ARG002
        self.calls += 1
        if self._raise_exc is not None:
            raise self._raise_exc
        return ToolResult.ok({"echo": tool_input["value"]}, cost_usd=self._cost_usd)


class _Hooks(WorkerHooks):
    """Records hook events for assertions."""

    def __init__(self) -> None:
        self.claimed: list[tuple] = []
        self.completed: list[tuple] = []
        self.failed: list[tuple] = []
        self.raise_on = None

    def on_claimed(self, task_id, task_type, organization_id, attempts):
        if self.raise_on == "on_claimed":
            raise RuntimeError("hook bug — must be swallowed")
        self.claimed.append((task_id, task_type, organization_id, attempts))

    def on_completed(self, task_id, task_type, organization_id, result):
        if self.raise_on == "on_completed":
            raise RuntimeError("hook bug — must be swallowed")
        self.completed.append((task_id, task_type, organization_id, result))

    def on_failed(self, task_id, task_type, organization_id, error, *, status):
        self.failed.append((task_id, task_type, organization_id, error, status))


class Env:
    """One disposable DB + org-scoped services bound to it."""

    def __init__(self, engine: Engine, spy: SpyTool) -> None:
        self.db_engine = engine
        self.spy = spy
        tool_registry = ToolRegistry()
        tool_registry.register(spy)
        self.tool_registry = tool_registry
        self.sessions = ResearchSessions(ORG, engine)
        self.other_sessions = ResearchSessions(OTHER_ORG, engine)
        self.research = ResearchEngine(ORG, engine, registry=tool_registry)
        self.ledger = EvidenceLedger(ORG, engine)
        self.handler = make_run_session_handler(engine=engine, tool_registry=tool_registry)
        self.revalidate = make_revalidate_handler(engine=engine)

    def create_session(self, plan: list[dict], **budgets) -> ResearchSession:
        spec = BudgetSpec(**budgets) if budgets else None
        row, _ = self.sessions.create_session(
            OBJECTIVE, created_by="operator:1", plan=plan, budgets=spec
        )
        return row


@pytest.fixture()
def env(tmp_path: Path) -> Env:
    engine = create_engine(f"sqlite:///{tmp_path}/tasks.db", future=True)
    for table in (
        ResearchSession.__table__,
        ResearchToolCall.__table__,
        ResearchEvidence.__table__,
        ResearchFact.__table__,
        ResearchFollowup.__table__,
    ):
        table.create(engine)
    return Env(engine, SpyTool())


def _snapshot(payload: dict, org: str = ORG) -> TaskSnapshot:
    return TaskSnapshot(
        task_id="t-test",
        task_type="research.run_session",
        organization_id=org,
        attempts=1,
        payload=payload,
    )


def _plan_with_inputs(values: list[str]) -> list[dict]:
    return [
        {"step": i + 1, "phase": "collect", "tool": "spy", "input": {"value": v}}
        for i, v in enumerate(values)
    ]


# ── validators ─────────────────────────────────────────────────


def test_validate_run_session_payload() -> None:
    validate_run_session_payload({"session_id": "rses-1"})
    validate_run_session_payload({"session_id": "rses-1", "followup_id": "rfu-1"})
    with pytest.raises(Exception, match="session_id is required"):
        validate_run_session_payload({})
    with pytest.raises(Exception, match="non-empty string"):
        validate_run_session_payload({"session_id": "  "})
    with pytest.raises(Exception, match="non-empty string"):
        validate_run_session_payload({"session_id": 42})
    with pytest.raises(Exception, match="non-empty string"):
        validate_run_session_payload({"session_id": "rses-1", "followup_id": ""})
    with pytest.raises(Exception, match="unknown payload fields"):
        validate_run_session_payload({"session_id": "rses-1", "extra": 1})


def test_validate_revalidate_payload() -> None:
    validate_revalidate_payload({})
    validate_revalidate_payload({"subject_type": "company", "subject_id": "c-1"})
    validate_revalidate_payload({"followup_id": "rfu-1"})
    with pytest.raises(Exception, match="together"):
        validate_revalidate_payload({"subject_type": "company"})
    with pytest.raises(Exception, match="together"):
        validate_revalidate_payload({"subject_id": "c-1"})
    with pytest.raises(Exception, match="non-empty"):
        validate_revalidate_payload({"subject_type": " ", "subject_id": "c-1"})
    with pytest.raises(Exception, match="non-empty"):
        validate_revalidate_payload({"followup_id": 7})
    with pytest.raises(Exception, match="unknown payload fields"):
        validate_revalidate_payload({"nope": 1})


# ── handle_run_session ─────────────────────────────────────────


def test_run_session_missing_session_is_non_retryable(env: Env) -> None:
    with pytest.raises(NonRetryableTaskError, match="not found"):
        env.handler({"session_id": "rses-missing"}, _snapshot({"session_id": "rses-missing"}))


def test_run_session_other_tenant_is_non_retryable(env: Env) -> None:
    row, _ = env.other_sessions.create_session(
        OBJECTIVE, created_by="operator:9", plan=_plan_with_inputs(["x"])
    )
    with pytest.raises(NonRetryableTaskError, match="not found"):
        env.handler({"session_id": row.session_id}, _snapshot({"session_id": row.session_id}))


def test_run_session_finished_sessions_never_re_executed(env: Env) -> None:
    plan = _plan_with_inputs(["a"])
    for finish in ("completed", "failed", "cancelled"):
        row = env.create_session(plan)
        env.sessions.start_session(row.session_id)
        if finish == "completed":
            env.sessions.complete_session(row.session_id, {"done": True})
        elif finish == "failed":
            env.sessions.fail_session(row.session_id, "boom")
        else:
            env.sessions.cancel_session(row.session_id)
        calls_before = env.spy.calls
        result = env.handler(
            {"session_id": row.session_id}, _snapshot({"session_id": row.session_id})
        )
        assert result["outcome"] == "already-finished"
        assert result["status"] == finish
        assert env.spy.calls == calls_before  # nothing re-executed


def test_run_session_budget_exhausted_awaits_human(env: Env) -> None:
    row = env.create_session(_plan_with_inputs(["a", "b"]), max_tool_calls=1)
    env.sessions.start_session(row.session_id)
    env.sessions.mark_budget_exhausted(row.session_id, "max_tool_calls")
    result = env.handler({"session_id": row.session_id}, _snapshot({"session_id": row.session_id}))
    assert result["outcome"] == "budget_exhausted_awaiting_human_resume"
    assert env.spy.calls == 0


def test_run_session_executes_plan_with_inputs(env: Env) -> None:
    row = env.create_session(_plan_with_inputs(["a", "b", "c"]))
    result = env.handler({"session_id": row.session_id}, _snapshot({"session_id": row.session_id}))
    assert result["status"] == "completed"
    assert result["steps_executed"] == 3
    assert env.spy.calls == 3
    final = env.sessions.get_session(row.session_id)
    assert final.status == "completed"
    summary = json.loads(final.result)
    assert len(summary["steps_executed"]) == 3
    assert [s["status"] for s in summary["steps_executed"]] == ["ok", "ok", "ok"]
    assert final.usage_tool_calls == 3
    assert final.usage_model_calls == 0


def test_run_session_skips_steps_without_inputs_honestly(env: Env) -> None:
    # the deterministic Phase 2 template: steps carry NO tool inputs
    row = env.create_session(
        [
            {
                "step": 1,
                "phase": "resolve_identity",
                "tool": "resolve_identity",
                "description": "…",
            },
            {"step": 2, "phase": "summarize", "tool": None, "description": "…"},
        ]
    )
    result = env.handler({"session_id": row.session_id}, _snapshot({"session_id": row.session_id}))
    assert result["status"] == "completed"
    assert result["steps_executed"] == 0
    assert result["steps_skipped"] == 2
    assert env.spy.calls == 0
    summary = json.loads(env.sessions.get_session(row.session_id).result)
    reasons = {s.get("reason", "") for s in summary["steps_skipped"]}
    assert any("no tool input" in r for r in reasons)
    assert any("no tool" in r for r in reasons)


def test_run_session_budget_stop_completes_the_task(env: Env) -> None:
    row = env.create_session(_plan_with_inputs(["a", "b"]), max_tool_calls=1)
    result = env.handler({"session_id": row.session_id}, _snapshot({"session_id": row.session_id}))
    # first step ran, second was refused by the budget gate
    assert result["status"] == "budget_exhausted"
    assert result["outcome"] == "budget_stopped:max_tool_calls"
    assert result["steps_executed"] == 1
    assert env.spy.calls == 1
    final = env.sessions.get_session(row.session_id)
    assert final.status == "budget_exhausted"  # session carries the outcome


def test_run_session_corrupt_plan_is_non_retryable(env: Env) -> None:
    row = env.create_session(_plan_with_inputs(["a"]))
    with env.sessions._session_factory() as session:  # corrupt the stored plan
        from sqlalchemy import update

        session.execute(
            update(ResearchSession)
            .where(ResearchSession.session_id == row.session_id)
            .values(plan="not json [")
        )
        session.commit()
    with pytest.raises(NonRetryableTaskError, match="corrupt plan"):
        env.handler({"session_id": row.session_id}, _snapshot({"session_id": row.session_id}))


def test_run_session_crash_recovery_never_double_executes(env: Env, monkeypatch) -> None:
    """A handler interrupted mid-run (DB hiccup AFTER steps were recorded)
    re-runs and resumes at the first unexecuted step — the append-only
    tool-call log IS the progress ledger."""
    row = env.create_session(_plan_with_inputs(["a", "b", "c"]))
    real_complete = ResearchSessions.complete_session
    calls = {"n": 0}

    def flaky_complete(self, session_id, result):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("simulated DB hiccup — task will retry")
        return real_complete(self, session_id, result)

    monkeypatch.setattr(ResearchSessions, "complete_session", flaky_complete)
    payload = {"session_id": row.session_id}
    with pytest.raises(RuntimeError, match="DB hiccup"):
        env.handler(payload, _snapshot(payload, ORG))
    assert env.spy.calls == 3  # all three steps recorded before the crash
    tool_calls_before = len(env.research.list_tool_calls(row.session_id))

    monkeypatch.undo()
    result = env.handler(payload, _snapshot(payload, ORG))
    assert result["status"] == "completed"
    # NO steps re-executed, NO duplicate audit rows
    assert env.spy.calls == 3
    assert len(env.research.list_tool_calls(row.session_id)) == tool_calls_before
    assert result["steps_skipped"] == 3  # all resumed (already recorded)
    summary = json.loads(env.sessions.get_session(row.session_id).result)
    assert summary["usage_tool_calls"] == 3  # usage counted once, honestly


def test_run_session_closes_its_followup(env: Env) -> None:
    from coffee_export.research import ResearchFollowups

    followups = ResearchFollowups(ORG, env.db_engine)
    row = env.create_session(_plan_with_inputs(["a"]))
    fu = followups.schedule(
        "run_session",
        due_ts="2026-01-01T00:00:00+03:00",
        payload={"session_id": row.session_id},
        created_by="operator:1",
    )
    followups.mark_enqueued(fu.followup_id, task_id="t-1")
    result = env.handler(
        {"session_id": row.session_id, "followup_id": fu.followup_id},
        _snapshot({"session_id": row.session_id, "followup_id": fu.followup_id}),
    )
    assert result["followup"] == fu.followup_id
    assert followups.get_followup(fu.followup_id).status == "done"


def test_run_session_ignores_missing_followup(env: Env) -> None:
    row = env.create_session(_plan_with_inputs(["a"]))
    result = env.handler(
        {"session_id": row.session_id, "followup_id": "rfu-nope"},
        _snapshot({"session_id": row.session_id, "followup_id": "rfu-nope"}),
    )
    assert result["followup"] is None  # logged and ignored — work still done
    assert env.sessions.get_session(row.session_id).status == "completed"


# ── handle_revalidate_evidence ─────────────────────────────────


def _record_evidence(env: Env, fact_key: str, value, *, expires_ts, source_type="website"):
    return env.ledger.record(
        subject_type="company",
        subject_id="c-1",
        fact_key=fact_key,
        value=value,
        source_type=source_type,
        source_url="https://example.com/evidence" if source_type != "human" else None,
        source_actor="Human Operator" if source_type == "human" else None,
        expires_ts=expires_ts,
    )


def test_revalidate_sweeps_expired_evidence(env: Env) -> None:
    _record_evidence(env, "annual_volume_mt", 25000, expires_ts="2020-01-01T00:00:00+03:00")
    _record_evidence(env, "unexpired", "fresh", expires_ts="2099-01-01T00:00:00+03:00")
    result = env.revalidate({}, _snapshot({}, ORG))
    assert result["swept_count"] == 1
    swept_id = result["swept_evidence_ids"][0]
    row = env.ledger.get_evidence(swept_id)
    assert row.status == "outdated"
    # the fact is kept for history but honestly reports ZERO live support
    from coffee_export.research import FactStore

    fact = FactStore(ORG, env.db_engine).get_fact("company", "c-1", "annual_volume_mt")
    assert fact is not None
    assert fact.source_count == 0
    assert fact.status == "observed"
    # second run sweeps nothing — idempotent
    again = env.revalidate({}, _snapshot({}, ORG))
    assert again["swept_count"] == 0


def test_revalidate_subject_filter_and_org_scope(env: Env) -> None:
    _record_evidence(env, "annual_volume_mt", 1, expires_ts="2020-01-01T00:00:00+03:00")
    env.ledger.record(
        subject_type="company",
        subject_id="c-2",
        fact_key="annual_volume_mt",
        value=2,
        source_type="website",
        source_url="https://example.com/2",
        expires_ts="2020-01-01T00:00:00+03:00",
    )
    other = EvidenceLedger(OTHER_ORG, env.db_engine)
    other.record(
        subject_type="company",
        subject_id="c-1",
        fact_key="annual_volume_mt",
        value=99,
        source_type="website",
        source_url="https://example.com/other",
        expires_ts="2020-01-01T00:00:00+03:00",
    )
    result = env.revalidate({"subject_type": "company", "subject_id": "c-1"}, _snapshot({}))
    assert result["swept_count"] == 1  # only c-1, only OUR org
    assert env.ledger.get_evidence(result["swept_evidence_ids"][0]).subject_id == "c-1"
    # other org's row untouched
    remaining = other.list_evidence("company", "c-1")
    assert [r.status for r in remaining] == ["observed"]


def test_revalidate_never_unlocks_human_verified_fact(env: Env) -> None:
    from coffee_export.research import FactStore

    _record_evidence(
        env,
        "locked_key",
        "human value",
        expires_ts="2020-01-01T00:00:00+03:00",
        source_type="human",
    )
    store = FactStore(ORG, env.db_engine)
    fact = store.get_fact("company", "c-1", "locked_key")
    assert fact.status == "human_verified"

    result = env.revalidate({}, _snapshot({}, ORG))
    assert result["swept_count"] == 1

    after = store.get_fact("company", "c-1", "locked_key")
    assert after is not None
    assert after.status == "human_verified"  # the lock is absolute (§11.10)
    assert json.loads(after.value) == "human value"


# ── worker integration (real claim → execute path) ──────────────


@pytest.fixture()
def worker_env(tmp_path: Path):
    url = f"sqlite:///{tmp_path}/worker.db"
    engine = create_queue_engine(url)
    AgentTask.__table__.create(engine)
    for table in (
        ResearchSession.__table__,
        ResearchToolCall.__table__,
        ResearchEvidence.__table__,
        ResearchFact.__table__,
        ResearchFollowup.__table__,
    ):
        table.create(engine)
    spy = SpyTool()
    tool_registry = ToolRegistry()
    tool_registry.register(spy)
    reg = TaskRegistry()
    register_research_tasks(reg, engine=engine, tool_registry=tool_registry)
    queue = DurableTaskQueue(reg, engine, lease_ttl_seconds=300, backoff_base_seconds=1)
    hooks = _Hooks()
    worker = TaskWorker(
        queue,
        reg,
        poll_interval=0.05,
        heartbeat_interval=500,
        reaper_interval=500,
        lock_path=tmp_path / "w.lock",
        install_signals=False,
        hooks=hooks,
        followup_engine=engine,
    )
    sessions = ResearchSessions(ORG, engine)
    return engine, queue, worker, hooks, sessions, spy


def test_worker_classifies_missing_session_as_failed_in_one_attempt(worker_env) -> None:
    engine, queue, worker, hooks, sessions, spy = worker_env
    task_id = queue.enqueue(
        "research.run_session", {"session_id": "rses-missing"}, organization_id=ORG
    )
    assert worker.run_once() is True
    row = queue.get_task(task_id)
    assert row.status == "failed"  # non-retryable, ONE attempt
    assert row.attempts == 1
    assert "not found" in (row.last_error or "")
    # hooks: claimed + terminally failed (no completed)
    assert hooks.claimed[0][0] == task_id
    assert hooks.failed[0][0] == task_id
    assert hooks.failed[0][4] == "failed"
    assert hooks.completed == []


def test_worker_completes_budget_stopped_task(worker_env) -> None:
    engine, queue, worker, hooks, sessions, spy = worker_env
    row, _ = sessions.create_session(
        OBJECTIVE,
        created_by="operator:1",
        plan=_plan_with_inputs(["a", "b"]),
        budgets=BudgetSpec(max_tool_calls=1),
    )
    task_id = queue.enqueue(
        "research.run_session", {"session_id": row.session_id}, organization_id=ORG
    )
    assert worker.run_once() is True
    assert queue.get_task(task_id).status == "completed"  # honest outcome, not failure
    assert sessions.get_session(row.session_id).status == "budget_exhausted"
    assert spy.calls == 1


def test_worker_executes_full_session_task(worker_env) -> None:
    engine, queue, worker, hooks, sessions, spy = worker_env
    row, _ = sessions.create_session(
        OBJECTIVE, created_by="operator:1", plan=_plan_with_inputs(["a", "b"])
    )
    task_id = queue.enqueue(
        "research.run_session", {"session_id": row.session_id}, organization_id=ORG
    )
    assert worker.run_once() is True
    assert queue.get_task(task_id).status == "completed"
    assert sessions.get_session(row.session_id).status == "completed"
    assert spy.calls == 2
    assert hooks.completed[0][0] == task_id
    result = json.loads(queue.get_task(task_id).result)
    assert result["steps_executed"] == 2


def test_raising_hook_never_kills_the_worker(worker_env) -> None:
    engine, queue, worker, hooks, sessions, spy = worker_env
    hooks.raise_on = "on_claimed"
    row, _ = sessions.create_session(
        OBJECTIVE, created_by="operator:1", plan=_plan_with_inputs(["a"])
    )
    task_id = queue.enqueue(
        "research.run_session", {"session_id": row.session_id}, organization_id=ORG
    )
    assert worker.run_once() is True  # hook exception swallowed, task still ran
    assert queue.get_task(task_id).status == "completed"


def test_revalidate_task_through_worker(worker_env) -> None:
    engine, queue, worker, hooks, sessions, spy = worker_env
    ledger = EvidenceLedger(ORG, engine)
    ledger.record(
        subject_type="company",
        subject_id="c-9",
        fact_key="k",
        value=1,
        source_type="website",
        source_url="https://example.com/x",
        expires_ts="2020-01-01T00:00:00+03:00",
    )
    task_id = queue.enqueue("research.revalidate_evidence", {}, organization_id=ORG)
    assert worker.run_once() is True
    row = queue.get_task(task_id)
    assert row.status == "completed"
    assert json.loads(row.result)["swept_count"] == 1


def test_register_research_tasks_registers_exactly_two_types() -> None:
    reg = TaskRegistry()
    register_research_tasks(reg)
    assert reg.known_types() == (
        "research.revalidate_evidence",
        "research.run_session",
    )
    with pytest.raises(ValueError, match="already registered"):
        register_research_tasks(reg)
