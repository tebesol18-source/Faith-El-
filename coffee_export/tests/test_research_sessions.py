"""
Research session + budget + engine tests — TryComp Phase 2.

Proves the §12 semantics on disposable per-test databases (tmp_path,
never the committed operational DB):

  * creation — objective/objective_key normalization, deterministic
    plan, unlimited default budgets, usage zeros, NULL cost (never zero)
  * duplicate-research detection (§12.5) — LIVE sessions (pending/
    running) with the same objective_key are REUSED org-scoped;
    on_duplicate='error' raises with the duplicate id; completed
    sessions are history and never block; another org's session is not
    a duplicate (and is invisible)
  * lifecycle — sanctioned transitions only (pending → running →
    completed/failed/cancelled/budget_exhausted; resume = human
    intervention with NEW budgets, usage preserved)
  * budget enforcement (§12.4) — stop-on-exhaustion BEFORE execution:
    the refused call is recorded as a budget_exhausted audit row and NOT
    counted as usage; the session moves to budget_exhausted; an
    exhausted session refuses immediately; costs are only ever REPORTED
    costs (None never trips a cost budget — never fabricated); wall
    clock measured per active run with an injectable clock
  * engine — auto-start of pending sessions, honest recording of
    ok/error/capability_unavailable rows, unknown tool recorded then
    re-raised, model-call accounting (recorded first, exhaustion
    marked after), org-scoped tool-call history
  * tenant isolation — cross-tenant session access raises
    ResearchNotFoundError (no existence oracle)
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.database.models.research import ResearchSession, ResearchToolCall
from coffee_export.research import (
    BudgetExhaustedError,
    BudgetSpec,
    DuplicateResearchError,
    ResearchEngine,
    ResearchNotFoundError,
    ResearchSessions,
    ToolRegistry,
    ToolResult,
    check_budget,
)
from coffee_export.research.tools.base import ResearchTool, ToolContext

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


class FakeClock:
    """Injectable epoch clock — deterministic wall-budget tests."""

    def __init__(self) -> None:
        self._now = time.time()

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


class Env:
    """One disposable DB + org-scoped engines bound to it."""

    def __init__(self, engine: Engine, spy: SpyTool) -> None:
        self.db_engine = engine
        registry = ToolRegistry()
        registry.register(spy)
        self.spy = spy
        self.acme = ResearchEngine("org-acme", engine, registry=registry)
        self.beta = ResearchEngine("org-beta", engine, registry=registry)
        self.acme_sessions = ResearchSessions("org-acme", engine)
        self.beta_sessions = ResearchSessions("org-beta", engine)


@pytest.fixture()
def env(tmp_path: Path) -> Env:
    engine = create_engine(f"sqlite:///{tmp_path}/research.db", future=True)
    ResearchSession.__table__.create(engine)
    ResearchToolCall.__table__.create(engine)
    return Env(engine, SpyTool())


def _create(env: Env, **kwargs):
    return env.acme_sessions.create_session(OBJECTIVE, created_by="operator:1", **kwargs)


# ── creation ────────────────────────────────────────────────────


def test_create_session_defaults(env: Env) -> None:
    session, created = _create(env)
    assert created is True
    assert session.status == "pending"
    assert session.objective == OBJECTIVE
    assert session.objective_key == OBJECTIVE.lower()
    assert session.organization_id == "org-acme"
    assert session.created_by == "operator:1"
    assert json.loads(session.plan) and len(json.loads(session.plan)) == 5
    assert json.loads(session.budgets) == {
        "max_cost_usd": None,
        "max_model_calls": None,
        "max_tool_calls": None,
        "max_wall_seconds": None,
    }
    assert session.usage_tool_calls == 0
    assert session.usage_model_calls == 0
    assert session.usage_cost_usd is None  # NULL = nothing reported — never zero
    assert session.started_ts is None
    assert session.finished_ts is None
    assert session.result is None


def test_create_session_custom_plan_and_budgets(env: Env) -> None:
    plan = [{"step": 1, "phase": "resolve_identity", "description": "custom"}]
    budgets = BudgetSpec(max_tool_calls=3, max_cost_usd=2.5)
    session, _ = _create(env, plan=plan, budgets=budgets)
    assert json.loads(session.plan) == plan
    assert json.loads(session.budgets) == {
        "max_cost_usd": 2.5,
        "max_model_calls": None,
        "max_tool_calls": 3,
        "max_wall_seconds": None,
    }


def test_create_session_validation(env: Env) -> None:
    with pytest.raises(ValueError, match="objective"):
        env.acme_sessions.create_session("  ", created_by="operator:1")
    with pytest.raises(ValueError, match="created_by"):
        env.acme_sessions.create_session(OBJECTIVE, created_by=" ")
    with pytest.raises(ValueError, match="plan"):
        env.acme_sessions.create_session(OBJECTIVE, created_by="operator:1", plan=[])
    with pytest.raises(ValueError, match="on_duplicate"):
        env.acme_sessions.create_session(OBJECTIVE, created_by="operator:1", on_duplicate="ignore")


# ── duplicate-research detection (§12.5) ────────────────────────


def test_live_duplicate_reused(env: Env) -> None:
    first, created = _create(env)
    assert created is True
    noisy = "  FIND   Specialty coffee importers   in hamburg  "
    second, created2 = env.acme_sessions.create_session(noisy, created_by="operator:2")
    assert created2 is False
    assert second.session_id == first.session_id
    assert env.acme_sessions.list_sessions() and len(env.acme_sessions.list_sessions()) == 1


def test_live_duplicate_error_mode(env: Env) -> None:
    first, _ = _create(env)
    with pytest.raises(DuplicateResearchError) as excinfo:
        env.acme_sessions.create_session(
            OBJECTIVE.upper(), created_by="operator:2", on_duplicate="error"
        )
    assert excinfo.value.args[0] == first.session_id


def test_completed_session_is_history_not_duplicate(env: Env) -> None:
    first, _ = _create(env)
    env.acme_sessions.start_session(first.session_id)
    env.acme_sessions.complete_session(first.session_id, {"summary": "done"})
    second, created = _create(env)
    assert created is True
    assert second.session_id != first.session_id


def test_duplicate_detection_is_org_scoped(env: Env) -> None:
    _create(env)  # org-acme has a live session
    beta_session, created = env.beta_sessions.create_session(OBJECTIVE, created_by="operator:9")
    assert created is True  # another org's live session is NOT our duplicate
    assert beta_session.organization_id == "org-beta"


# ── lifecycle ───────────────────────────────────────────────────


def test_lifecycle_transitions(env: Env) -> None:
    session, _ = _create(env)
    started = env.acme_sessions.start_session(session.session_id)
    assert started.status == "running"
    assert started.started_ts is not None

    completed = env.acme_sessions.complete_session(session.session_id, {"findings": ["a", "b"]})
    assert completed.status == "completed"
    assert json.loads(completed.result) == {"findings": ["a", "b"]}
    assert completed.finished_ts is not None


def test_unsanctioned_transitions_rejected(env: Env) -> None:
    session, _ = _create(env)
    with pytest.raises(ValueError, match="unsanctioned"):
        env.acme_sessions.complete_session(session.session_id, {})  # pending → completed
    env.acme_sessions.start_session(session.session_id)
    env.acme_sessions.complete_session(session.session_id, {})
    with pytest.raises(ValueError, match="unsanctioned"):
        env.acme_sessions.start_session(session.session_id)  # completed → running


def test_resume_after_budget_exhausted(env: Env) -> None:
    session, _ = _create(env, budgets=BudgetSpec(max_tool_calls=1))
    env.acme_sessions.start_session(session.session_id)
    exhausted = env.acme_sessions.mark_budget_exhausted(session.session_id, "max_tool_calls")
    assert exhausted.status == "budget_exhausted"
    assert "max_tool_calls" in (exhausted.error_message or "")

    resumed = env.acme_sessions.resume_session(session.session_id, BudgetSpec(max_tool_calls=5))
    assert resumed.status == "running"
    assert json.loads(resumed.budgets)["max_tool_calls"] == 5
    assert resumed.error_message is None
    assert resumed.usage_tool_calls == 0  # usage preserved, budgets fresh


def test_get_session_tenant_isolation(env: Env) -> None:
    session, _ = _create(env)
    with pytest.raises(ResearchNotFoundError):
        env.beta_sessions.get_session(session.session_id)


def test_list_and_search_sessions_org_scoped(env: Env) -> None:
    _create(env)
    env.acme_sessions.create_session("Cupping scores for Yirgacheffe lots", created_by="operator:1")
    env.beta_sessions.create_session("Cupping scores overview", created_by="operator:9")

    acme_all = env.acme_sessions.list_sessions()
    assert len(acme_all) == 2  # beta's session is invisible
    assert all(s.organization_id == "org-acme" for s in acme_all)

    hits = env.acme_sessions.search_sessions("coffee importers")
    assert len(hits) == 1
    assert hits[0].objective == OBJECTIVE

    running_only = env.acme_sessions.list_sessions(status="running")
    assert running_only == []
    with pytest.raises(ValueError, match="query"):
        env.acme_sessions.search_sessions("  ")
    with pytest.raises(ValueError, match="status"):
        env.acme_sessions.list_sessions(status="paused")


# ── budget spec unit semantics (§12.4) ──────────────────────────


def test_budget_spec_validation() -> None:
    with pytest.raises(ValueError, match="max_tool_calls"):
        BudgetSpec(max_tool_calls=-1)
    with pytest.raises(ValueError, match="max_model_calls"):
        BudgetSpec(max_model_calls=True)
    with pytest.raises(ValueError, match="max_wall_seconds"):
        BudgetSpec(max_wall_seconds="soon")
    with pytest.raises(ValueError, match="unknown budget fields"):
        BudgetSpec.from_dict({"max_requests": 1})


def test_check_budget_axes() -> None:
    assert (
        check_budget(
            BudgetSpec(), tool_calls=10**9, model_calls=10**9, wall_seconds=10**9, cost_usd=None
        )
        is None
    )  # unlimited never trips
    spec = BudgetSpec(max_tool_calls=3, max_model_calls=2, max_wall_seconds=60.0, max_cost_usd=1.0)
    assert (
        check_budget(spec, tool_calls=4, model_calls=0, wall_seconds=0, cost_usd=None)
        == "max_tool_calls"
    )
    assert (
        check_budget(spec, tool_calls=0, model_calls=3, wall_seconds=0, cost_usd=None)
        == "max_model_calls"
    )
    assert (
        check_budget(spec, tool_calls=0, model_calls=0, wall_seconds=61, cost_usd=None)
        == "max_wall_seconds"
    )
    assert (
        check_budget(spec, tool_calls=0, model_calls=0, wall_seconds=0, cost_usd=1.5)
        == "max_cost_usd"
    )
    # unknown cost (None) never trips a cost budget — never fabricated
    assert check_budget(spec, tool_calls=0, model_calls=0, wall_seconds=0, cost_usd=None) is None
    assert (
        check_budget(
            BudgetSpec(max_cost_usd=0.0), tool_calls=0, model_calls=0, wall_seconds=0, cost_usd=None
        )
        is None
    )


# ── engine: execution + honest recording ────────────────────────


def test_run_tool_auto_starts_and_records(env: Env) -> None:
    session, _ = _create(env)
    outcome = env.acme.run_tool(session.session_id, "spy", {"value": "hello"})
    assert outcome.status == "ok"
    assert outcome.output == {"echo": "hello"}

    refreshed = env.acme_sessions.get_session(session.session_id)
    assert refreshed.status == "running"  # auto-started
    assert refreshed.started_ts is not None
    assert refreshed.usage_tool_calls == 1
    assert refreshed.usage_cost_usd is None
    assert env.spy.calls == 1

    rows = env.acme.list_tool_calls(session.session_id)
    assert len(rows) == 1
    assert rows[0].status == "ok"
    assert json.loads(rows[0].input) == {"value": "hello"}
    assert json.loads(rows[0].output) == {"echo": "hello"}
    assert rows[0].duration_ms >= 0
    assert rows[0].organization_id == "org-acme"


def test_run_tool_error_recorded_not_raised(env: Env) -> None:
    env.acme.registry.register(_BoomTool())
    session, _ = _create(env)
    outcome = env.acme.run_tool(session.session_id, "boom", {})
    assert outcome.status == "error"
    assert "kaboom" in (outcome.error_message or "")
    assert env.acme_sessions.get_session(session.session_id).usage_tool_calls == 1


def test_run_tool_unknown_tool_recorded_and_raised(env: Env) -> None:
    session, _ = _create(env)
    with pytest.raises(KeyError):
        env.acme.run_tool(session.session_id, "nonexistent", {"value": "x"})
    rows = env.acme.list_tool_calls(session.session_id)
    assert len(rows) == 1
    assert rows[0].status == "error"
    assert "unknown tool" in (rows[0].error_message or "")


def test_run_tool_finished_session_refused(env: Env) -> None:
    session, _ = _create(env)
    env.acme_sessions.start_session(session.session_id)
    env.acme_sessions.cancel_session(session.session_id)
    with pytest.raises(ValueError, match="cancelled"):
        env.acme.run_tool(session.session_id, "spy", {"value": "x"})


def test_run_tool_tenant_isolation(env: Env) -> None:
    session, _ = _create(env)  # belongs to org-acme
    with pytest.raises(ResearchNotFoundError):
        env.beta.run_tool(session.session_id, "spy", {"value": "x"})
    assert env.acme.list_tool_calls(session.session_id) == []


# ── engine: budget enforcement (§12.4) ──────────────────────────


def test_tool_call_budget_stop_on_exhaustion(env: Env) -> None:
    session, _ = _create(env, budgets=BudgetSpec(max_tool_calls=1))
    outcome = env.acme.run_tool(session.session_id, "spy", {"value": "one"})
    assert outcome.status == "ok"
    assert env.spy.calls == 1

    with pytest.raises(BudgetExhaustedError) as excinfo:
        env.acme.run_tool(session.session_id, "spy", {"value": "two"})
    assert excinfo.value.reason == "max_tool_calls"
    assert env.spy.calls == 1  # the tool never ran

    rows = env.acme.list_tool_calls(session.session_id)
    # Rows created within the same wall-clock second tie-break on the
    # random call_id (house ordering convention: created_ts, id) — so
    # the audit assertions key by status, never by position.
    assert sorted(r.status for r in rows) == ["budget_exhausted", "ok"]
    refusal = next(r for r in rows if r.status == "budget_exhausted")
    assert refusal.output is None
    assert "max_tool_calls" in (refusal.error_message or "")

    refreshed = env.acme_sessions.get_session(session.session_id)
    assert refreshed.status == "budget_exhausted"
    assert refreshed.usage_tool_calls == 1  # refusal is audit, NOT usage


def test_exhausted_session_refuses_immediately(env: Env) -> None:
    session, _ = _create(env, budgets=BudgetSpec(max_tool_calls=1))
    env.acme.run_tool(session.session_id, "spy", {"value": "one"})
    with pytest.raises(BudgetExhaustedError):
        env.acme.run_tool(session.session_id, "spy", {"value": "two"})
    rows = env.acme.list_tool_calls(session.session_id)
    with pytest.raises(BudgetExhaustedError, match="resume_session"):
        env.acme.run_tool(session.session_id, "spy", {"value": "three"})
    assert len(env.acme.list_tool_calls(session.session_id)) == len(rows)  # no new row


def test_resume_then_tools_run_again(env: Env) -> None:
    session, _ = _create(env, budgets=BudgetSpec(max_tool_calls=1))
    env.acme.run_tool(session.session_id, "spy", {"value": "one"})
    with pytest.raises(BudgetExhaustedError):
        env.acme.run_tool(session.session_id, "spy", {"value": "two"})

    env.acme_sessions.resume_session(session.session_id, BudgetSpec(max_tool_calls=10))
    outcome = env.acme.run_tool(session.session_id, "spy", {"value": "three"})
    assert outcome.status == "ok"
    refreshed = env.acme_sessions.get_session(session.session_id)
    assert refreshed.status == "running"
    assert refreshed.usage_tool_calls == 2  # honest cumulative usage


def test_wall_clock_budget_per_active_run(env: Env) -> None:
    clock = FakeClock()
    registry = ToolRegistry()
    registry.register(SpyTool())
    acme = ResearchEngine("org-acme", env.db_engine, registry=registry, clock=clock)
    session, _ = acme.sessions.create_session(
        OBJECTIVE, created_by="operator:1", budgets=BudgetSpec(max_wall_seconds=10.0)
    )
    assert acme.run_tool(session.session_id, "spy", {"value": "first"}).status == "ok"
    clock.advance(30.0)
    with pytest.raises(BudgetExhaustedError) as excinfo:
        acme.run_tool(session.session_id, "spy", {"value": "second"})
    assert excinfo.value.reason == "max_wall_seconds"


def test_cost_budget_only_counts_reported_costs(env: Env) -> None:
    # Costs arrive only AFTER execution, so a cost budget can overshoot
    # by at most one call — that is the honest semantics (a refusal
    # cannot be based on a cost nobody reported yet).
    registry = ToolRegistry()
    registry.register(SpyTool(cost_usd=0.60))
    acme = ResearchEngine("org-acme", env.db_engine, registry=registry)
    session, _ = acme.sessions.create_session(
        OBJECTIVE, created_by="operator:1", budgets=BudgetSpec(max_cost_usd=1.0)
    )
    acme.run_tool(session.session_id, "spy", {"value": "one"})  # 0.60 reported
    refreshed = acme.sessions.get_session(session.session_id)
    assert refreshed.usage_cost_usd == pytest.approx(0.60)
    acme.run_tool(session.session_id, "spy", {"value": "two"})  # 1.20 total
    assert acme.sessions.get_session(session.session_id).usage_cost_usd == pytest.approx(1.20)
    with pytest.raises(BudgetExhaustedError) as excinfo:  # now it trips
        acme.run_tool(session.session_id, "spy", {"value": "three"})
    assert excinfo.value.reason == "max_cost_usd"


def test_unknown_cost_never_trips(env: Env) -> None:
    # spy reports NO cost → usage_cost_usd stays NULL and a 0.0 cost
    # budget never trips (never fabricated).
    session, _ = _create(env, budgets=BudgetSpec(max_cost_usd=0.0))
    for i in range(3):
        assert env.acme.run_tool(session.session_id, "spy", {"value": str(i)}).status == "ok"
    assert env.acme_sessions.get_session(session.session_id).usage_cost_usd is None


# ── engine: model-call accounting ───────────────────────────────


def test_record_model_call_counts_and_costs(env: Env) -> None:
    session, _ = _create(env)
    session, exhausted = env.acme.record_model_call(session.session_id)  # no cost reported
    assert session.usage_model_calls == 1
    assert session.usage_cost_usd is None
    assert exhausted is False

    session, exhausted = env.acme.record_model_call(session.session_id, cost_usd=0.02)
    assert session.usage_model_calls == 2
    assert session.usage_cost_usd == pytest.approx(0.02)
    assert exhausted is False


def test_record_model_call_marks_exhaustion_after_recording(env: Env) -> None:
    session, _ = _create(env, budgets=BudgetSpec(max_model_calls=1))
    session, exhausted = env.acme.record_model_call(session.session_id)
    assert session.usage_model_calls == 1  # the call HAPPENED and is recorded
    assert exhausted is False  # 1 <= 1 — not yet exhausted
    session, exhausted = env.acme.record_model_call(session.session_id)  # 2 > 1
    assert session.usage_model_calls == 2  # still recorded honestly
    assert exhausted is True
    assert session.status == "budget_exhausted"
    with pytest.raises(ValueError, match="budget_exhausted"):
        env.acme.record_model_call(session.session_id)


# ── engine: capability honesty via web_search ───────────────────


def test_capability_unavailable_recorded_honestly(env: Env) -> None:
    from coffee_export.research import ProviderManifest
    from coffee_export.research.tools.web_search import WebSearchTool

    registry = ToolRegistry()
    registry.register(WebSearchTool())
    acme = ResearchEngine(
        "org-acme", env.db_engine, registry=registry, manifest=ProviderManifest(env={})
    )
    session, _ = acme.sessions.create_session(OBJECTIVE, created_by="operator:1")
    outcome = acme.run_tool(session.session_id, "web_search", {"query": "coffee buyers"})
    assert outcome.status == "capability_unavailable"
    assert outcome.output is not None
    assert outcome.output["status"] == "capability_unavailable"
    assert "never faked" in outcome.output["reason"]
    rows = acme.list_tool_calls(session.session_id)
    assert rows[0].status == "capability_unavailable"


# ── helper ──────────────────────────────────────────────────────


class _BoomTool(SpyTool):
    """Accepts any input (empty schema) and raises — the boom is in execute."""

    name = "boom"
    input_schema = {}

    def __init__(self) -> None:
        super().__init__(raise_exc=RuntimeError("kaboom"))
