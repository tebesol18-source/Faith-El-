"""
Agent 2 durable research scheduling — TryComp Phase 4 (§12.5).

Proves, on disposable per-test databases (injected engines — the
agent's own StateManager is only the org source):

  * schedule_reresearch_session — the FIRST agent research entry point:
    plans (deterministic fallback), creates the org-scoped session and
    enqueues a research.run_session task THROUGH THE QUEUE (never the
    event loop; task row pending, payload session_id, the agent's OWN
    org stamped)
  * org honesty — a default org-system agent REFUSES (no silent
    org-system fallback in new code, §4.1)
  * duplicate protection — a second call for the same objective reuses
    the live session and does NOT enqueue a second pending task
    (honest 'task_pending' skip)
  * org isolation — two orgs scheduling the same objective get their
    own sessions and tasks
  * budget typing — a non-BudgetSpec budgets value is refused loudly
  * END-TO-END through the real worker: schedule → worker.run_once()
    executes the task → the session completes honestly (fallback-plan
    steps carry no tool inputs and are skipped, the outcome is
    recorded) — the Agent-2 path is wired to durable execution
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.agents.agent2_enrichment import Agent2
from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
    ResearchFollowup,
    ResearchSession,
    ResearchToolCall,
)
from coffee_export.research.budget import BudgetSpec
from coffee_export.tasks.registry import TaskRegistry
from coffee_export.tasks.research_tasks import register_research_tasks
from coffee_export.tasks.worker import TaskWorker

ORG = "org-acme"
OTHER_ORG = "org-beta"


@pytest.fixture()
def engine(tmp_path: Path) -> Engine:
    eng = create_engine(f"sqlite:///{tmp_path}/agent2.db", future=True)
    for table in (
        ResearchSession.__table__,
        ResearchEvidence.__table__,
        ResearchFact.__table__,
        ResearchFollowup.__table__,
        ResearchToolCall.__table__,
    ):
        table.create(eng)
    AgentTask.__table__.create(eng)
    return eng


@pytest.fixture()
def agent() -> Agent2:
    # the agent's own StateManager is only the org source here; research
    # writes go to the INJECTED engine
    return Agent2(organization_id=ORG)


def _registry(engine: Engine) -> TaskRegistry:
    registry = TaskRegistry()
    register_research_tasks(registry, engine=engine)
    return registry


# ── the entry point ───────────────────────────────────────────────


def test_schedules_session_and_task_through_the_queue(engine: Engine, agent: Agent2) -> None:
    result = agent.schedule_research_session(
        "Research the German specialty buyer Kaffee Import GmbH",
        engine=engine,
        registry=_registry(engine),
    )
    assert result["created"] is True
    assert result["plan_source"] == "fallback"  # no gateway configured
    assert result["task_id"]
    assert result["task_status"] == "pending"
    assert result["skipped"] is None

    # the task row is real, pending, org-scoped, payload-correct
    with engine.connect() as conn:
        rows = conn.execute(
            AgentTask.__table__.select().where(AgentTask.__table__.c.task_id == result["task_id"])
        ).all()
    assert len(rows) == 1
    row = rows[0]
    assert row.task_type == "research.run_session"
    assert row.status == "pending"
    assert row.organization_id == ORG
    assert json.loads(row.payload) == {"session_id": result["session_id"]}

    # the session is org-scoped and attributed to the agent
    from coffee_export.research import ResearchSessions

    session = ResearchSessions(ORG, engine).get_session(result["session_id"])
    assert session.created_by == "agent:Agent 2"


def test_default_org_agent_refuses(engine: Engine) -> None:
    agent = Agent2()  # historical default: org-system
    with pytest.raises(ValueError, match="explicit tenant org"):
        agent.schedule_research_session(
            "Research buyer X", engine=engine, registry=_registry(engine)
        )
    # nothing was created
    with engine.connect() as conn:
        from sqlalchemy import func, select

        count = conn.execute(select(func.count()).select_from(AgentTask.__table__)).scalar()
    assert count == 0


def test_duplicate_objective_reuses_session_and_skips_second_task(
    engine: Engine, agent: Agent2
) -> None:
    first = agent.schedule_research_session(
        "Research the German buyer", engine=engine, registry=_registry(engine)
    )
    second = agent.schedule_research_session(
        "Research the German buyer", engine=engine, registry=_registry(engine)
    )
    assert second["created"] is False  # org-scoped live-session reuse
    assert second["session_id"] == first["session_id"]
    assert second["task_id"] is None  # no duplicate enqueue
    assert second["skipped"] == "task_pending"
    assert second["task_status"] == "pending"

    with engine.connect() as conn:
        from sqlalchemy import func, select

        count = conn.execute(
            select(func.count())
            .select_from(AgentTask.__table__)
            .where(AgentTask.__table__.c.task_type == "research.run_session")
        ).scalar()
    assert count == 1


def test_two_orgs_get_their_own_sessions(engine: Engine) -> None:
    agent_a = Agent2(organization_id=ORG)
    agent_b = Agent2(organization_id=OTHER_ORG)
    a = agent_a.schedule_research_session(
        "Research the same buyer", engine=engine, registry=_registry(engine)
    )
    b = agent_b.schedule_research_session(
        "Research the same buyer", engine=engine, registry=_registry(engine)
    )
    assert a["session_id"] != b["session_id"]
    assert a["task_id"] != b["task_id"]
    with engine.connect() as conn:
        rows = conn.execute(
            AgentTask.__table__.select().where(
                AgentTask.__table__.c.task_type == "research.run_session"
            )
        ).all()
    assert {r.organization_id for r in rows} == {ORG, OTHER_ORG}


def test_budgets_type_is_enforced(engine: Engine, agent: Agent2) -> None:
    with pytest.raises(TypeError, match="BudgetSpec"):
        agent.schedule_research_session(
            "Research buyer X", budgets={"max_tool_calls": 3}, engine=engine
        )


def test_budgets_are_stored_on_the_session(engine: Engine, agent: Agent2) -> None:
    result = agent.schedule_research_session(
        "Research buyer X",
        budgets=BudgetSpec(max_tool_calls=7),
        engine=engine,
        registry=_registry(engine),
    )
    from coffee_export.research import ResearchSessions

    session = ResearchSessions(ORG, engine).get_session(result["session_id"])
    spec = BudgetSpec.from_json(session.budgets)
    assert spec.max_tool_calls == 7


# ── end-to-end through the real worker ───────────────────────────


def test_end_to_end_worker_executes_the_scheduled_session(engine: Engine, agent: Agent2) -> None:
    result = agent.schedule_research_session(
        "Research the German specialty buyer Kaffee Import GmbH",
        engine=engine,
        registry=_registry(engine),
    )
    queue = None
    from coffee_export.tasks.durable_queue import DurableTaskQueue

    queue = DurableTaskQueue(_registry(engine), engine)
    worker = TaskWorker(queue, _registry(engine), followup_engine=engine)
    processed = worker.run_once()

    assert processed is True  # a task was claimed and executed
    task = queue.get_task(result["task_id"])
    assert task.status == "completed"

    # the session honestly completed (fallback plan steps carry no tool
    # inputs and are skipped — an honest empty run, never a fake one)
    from coffee_export.research import ResearchSessions

    session = ResearchSessions(ORG, engine).get_session(result["session_id"])
    assert session.status == "completed"

    # a second scheduling call for the same objective now creates a NEW
    # live session (the old one completed) and enqueues its own task
    third = agent.schedule_research_session(
        "Research the German specialty buyer Kaffee Import GmbH",
        engine=engine,
        registry=_registry(engine),
    )
    assert third["created"] is True
    assert third["task_id"] is not None
