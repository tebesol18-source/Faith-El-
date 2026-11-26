"""
Research health monitoring — TryComp Phase 7 (§3 J / §8).

Proves, on disposable per-test databases:

  * the overview snapshot — honest counts for sessions (incl.
    budget_exhausted awaiting the HUMAN resume path), evidence quality
    (statuses, suppressed, corroboration rate, expiring-soon window,
    expired-still-live sweep backlog), facts (human-locked), budgets &
    usage (reported costs only — None never zeroed), follow-ups (incl.
    overdue + next due), the research.* queue (incl. in-flight) and the
    Phase 6 outreach approval queue (incl. the research-drafted share)
  * org isolation — another org's rows never appear in this org's
    snapshot; list_research_orgs returns ids ONLY
  * determinism — now_ts is injectable; the expiring window math is
    exact; empty databases report honest zeros
  * the admin CLI `health` subcommand — the snapshot in CLI form
  * the dashboard page module — imports cleanly and exposes render()
    (Streamlit rendering itself is not unit-testable here by design)
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
from coffee_export.research.followups import ResearchFollowups
from coffee_export.research.monitoring import (
    ResearchHealthService,
    list_research_orgs,
)
from coffee_export.research.outreach import PENDING_AGENT_ACTIONS
from coffee_export.tasks.admin import EXIT_OK, main

ORG = "org-acme"
OTHER_ORG = "org-beta"
NOW = "2026-03-01T00:00:00+03:00"


@pytest.fixture()
def engine(tmp_path: Path) -> Engine:
    eng = create_engine(f"sqlite:///{tmp_path}/health.db", future=True)
    for table in (
        ResearchSession.__table__,
        ResearchEvidence.__table__,
        ResearchFact.__table__,
        ResearchFollowup.__table__,
        ResearchToolCall.__table__,
        AgentTask.__table__,
        PENDING_AGENT_ACTIONS,
    ):
        table.create(eng)
    return eng


def _session(
    engine: Engine,
    session_id: str,
    *,
    org: str = ORG,
    status: str = "completed",
    tool_calls: int = 3,
    model_calls: int = 1,
    cost: float | None = None,
    objective: str = "Research buyer Kaffee Import GmbH",
) -> None:
    with engine.begin() as conn:
        conn.execute(
            ResearchSession.__table__.insert().values(
                session_id=session_id,
                organization_id=org,
                objective=objective,
                objective_key=objective.lower(),
                status=status,
                plan="[]",
                budgets='{"max_tool_calls": null}',
                usage_tool_calls=tool_calls,
                usage_model_calls=model_calls,
                usage_cost_usd=cost,
                created_by="agent:Agent 2",
                created_ts="2026-02-01T00:00:00+03:00",
                updated_ts="2026-02-02T00:00:00+03:00",
            )
        )


def _task(
    engine: Engine,
    task_id: str,
    *,
    org: str = ORG,
    task_type: str = "research.run_session",
    status: str = "pending",
    attempts: int = 0,
) -> None:
    with engine.begin() as conn:
        conn.execute(
            AgentTask.__table__.insert().values(
                task_id=task_id,
                task_type=task_type,
                organization_id=org,
                status=status,
                attempts=attempts,
                max_attempts=3,
                payload="{}",
                scheduled_ts=NOW,
                created_ts=NOW,
                updated_ts=NOW,
            )
        )


def _action(
    engine: Engine,
    *,
    lead_id: str,
    org: str = ORG,
    status: str = "pending",
    research: bool = True,
) -> None:
    payload = {"lead_id": lead_id, "step": 1}
    if research:
        payload["reasoning"] = {"source": "research"}
    with engine.begin() as conn:
        conn.execute(
            PENDING_AGENT_ACTIONS.insert().values(
                agent_id="Agent 3",
                action_type="send_email",
                action_description="draft",
                target_entity_type="lead",
                target_entity_id=lead_id,
                payload=json.dumps(payload),
                risk_level="low",
                status=status,
                submitted_ts=NOW,
                organization_id=org,
            )
        )


def _seed(engine: Engine) -> None:
    """A rich but small world: 3 sessions (one budget-exhausted),
    evidence across every status + expiry edge, followups (overdue /
    future / done), queue rows and outreach drafts."""
    from coffee_export.research import EvidenceLedger

    _session(engine, "sess-1", status="completed", cost=0.0125)
    _session(engine, "sess-2", status="running")
    _session(engine, "sess-3", status="budget_exhausted", tool_calls=5, cost=None)
    _session(engine, "sess-other", org=OTHER_ORG, status="completed")

    ledger = EvidenceLedger(ORG, engine)
    ledger.record(
        "lead",
        "lead-1",
        "sector",
        "importer",
        "website",
        source_url="https://a.de/x",
    )
    ledger.record(
        "lead",
        "lead-1",
        "sector",
        "importer",
        "search",
        source_url="https://b.de/y",
    )  # corroborated
    ledger.record(
        "lead",
        "lead-1",
        "annual_volume_mt",
        240,
        "website",
        source_url="https://a.de/vol",
        expires_ts="2026-03-03T00:00:00+03:00",  # expiring soon (2d)
    )
    ledger.record(
        "lead",
        "lead-1",
        "min_cupping_score",
        85,
        "website",
        source_url="https://a.de/cup",
        expires_ts="2026-02-01T00:00:00+03:00",  # expired, still live
    )
    ledger.record("lead", "lead-1", "preferred_process", "Washed", "llm_inference")
    # a second org's evidence must stay invisible
    EvidenceLedger(OTHER_ORG, engine).record(
        "lead",
        "lead-9",
        "sector",
        "roaster",
        "website",
        source_url="https://other.de/x",
    )

    followups = ResearchFollowups(ORG, engine)
    followups.schedule(
        "revalidate_evidence",
        due_ts="2026-02-20T00:00:00+03:00",  # overdue (scheduled, past due)
        subject_type="lead",
        subject_id="lead-1",
        created_by="operator:1",
    )
    followups.schedule(
        "run_session",
        due_ts="2026-03-10T00:00:00+03:00",  # future — next due
        created_by="operator:1",
    )
    done_row = followups.schedule(
        "revalidate_evidence",
        due_ts="2026-02-01T00:00:00+03:00",
        created_by="operator:1",
    )
    followups.mark_enqueued(done_row.followup_id, task_id="task-x")
    followups.mark_done(done_row.followup_id)

    _task(engine, "task-1", status="pending")
    _task(engine, "task-2", status="leased", attempts=1)
    _task(engine, "task-3", status="completed")
    _task(engine, "task-4", task_type="research.revalidate_evidence", status="completed")
    _task(engine, "task-other", org=OTHER_ORG)

    _action(engine, lead_id="lead-1", status="pending", research=True)
    _action(engine, lead_id="lead-2", status="pending", research=False)
    _action(engine, lead_id="lead-3", status="executed", research=True)
    _action(engine, lead_id="lead-9", org=OTHER_ORG, status="pending")


# ── the snapshot ───────────────────────────────────────────────────


def test_overview_reports_every_section_honestly(engine: Engine) -> None:
    _seed(engine)
    snap = ResearchHealthService(ORG, engine).overview(now_ts=NOW)

    assert snap["organization_id"] == ORG
    assert snap["generated_ts"] == NOW

    sessions = snap["sessions"]
    assert sessions["total"] == 3
    assert sessions["by_status"] == {
        "completed": 1,
        "running": 1,
        "budget_exhausted": 1,
    }
    assert sessions["budget_exhausted_ids"] == ["sess-3"]
    assert sessions["last_completed"]["session_id"] == "sess-1"

    evidence = snap["evidence"]
    assert evidence["total"] == 5
    assert evidence["by_status"].get("corroborated", 0) >= 1
    assert evidence["human_source_rows"] == 0
    assert evidence["expiring_soon"] == 1  # 2026-03-03 within 7d of NOW
    assert evidence["expired_still_live"] == 1  # 2026-02-01, still live
    assert 0.0 < evidence["corroboration_rate"] < 1.0

    facts = snap["facts"]
    assert facts["total"] == 4  # 5 evidence rows → 4 distinct fact keys
    assert facts["human_locked"] == 0

    budgets = snap["budgets"]
    assert budgets["sessions_counted"] == 3
    assert budgets["usage_tool_calls"] == 3 + 3 + 5
    assert budgets["usage_model_calls"] == 3
    assert budgets["reported_cost_usd"] == pytest.approx(0.0125)

    followups = snap["followups"]
    assert followups["by_status"] == {"scheduled": 2, "done": 1}
    assert followups["overdue_scheduled"] == 1
    assert (
        followups["next_due"]["due_ts"] == "2026-02-20T00:00:00+03:00"
    )  # the overdue one is the soonest scheduled

    queue = snap["queue"]
    assert queue["total"] == 4
    assert queue["in_flight"] == 2
    assert {row["task_id"] for row in queue["in_flight_detail"]} == {"task-1", "task-2"}

    outreach = snap["outreach"]
    assert outreach["by_status"] == {"pending": 2, "executed": 1}
    assert outreach["awaiting_human_review"] == 2
    assert outreach["research_drafted_pending"] == 1
    assert {row["lead_id"] for row in outreach["pending_recent"]} == {"lead-1", "lead-2"}


def test_overview_is_org_scoped(engine: Engine) -> None:
    _seed(engine)
    snap = ResearchHealthService(OTHER_ORG, engine).overview(now_ts=NOW)
    assert snap["sessions"]["total"] == 1
    assert snap["queue"]["total"] == 1
    assert snap["outreach"]["awaiting_human_review"] == 1
    # the other org's evidence is INVISIBLE here (no existence oracle)
    assert snap["evidence"]["total"] == 1


def test_overview_on_an_empty_database_is_all_zeros(engine: Engine) -> None:
    snap = ResearchHealthService(ORG, engine).overview(now_ts=NOW)
    assert snap["sessions"]["total"] == 0
    assert snap["evidence"]["total"] == 0
    assert snap["evidence"]["corroboration_rate"] == 0.0
    assert snap["facts"]["total"] == 0
    assert snap["budgets"]["reported_cost_usd"] is None  # never zeroed
    assert snap["followups"]["total"] == 0
    assert snap["queue"]["total"] == 0
    assert snap["outreach"]["awaiting_human_review"] == 0


def test_expiring_window_math_is_exact(engine: Engine) -> None:
    from coffee_export.research import EvidenceLedger

    ledger = EvidenceLedger(ORG, engine)
    ledger.record(
        "lead",
        "lead-1",
        "min_cupping_score",
        85,
        "website",
        source_url="https://a.de/1",
        expires_ts="2026-03-08T00:00:00+03:00",  # exactly 7 days out
    )
    ledger.record(
        "lead",
        "lead-1",
        "preferred_process",
        "Washed",
        "website",
        source_url="https://a.de/2",
        expires_ts="2026-03-07T23:59:59+03:00",  # inside
    )
    ledger.record(
        "lead",
        "lead-1",
        "sector",
        "importer",
        "website",
        source_url="https://a.de/3",
        expires_ts="2026-03-08T00:00:01+03:00",  # outside
    )
    snap = ResearchHealthService(ORG, engine).overview(now_ts=NOW, expiring_days=7)
    assert snap["evidence"]["expiring_soon"] == 2  # inclusive boundary


def test_negative_window_is_rejected(engine: Engine) -> None:
    with pytest.raises(ValueError, match="expiring_days"):
        ResearchHealthService(ORG, engine).overview(now_ts=NOW, expiring_days=-1)


def test_list_research_orgs_returns_ids_only(engine: Engine) -> None:
    _seed(engine)
    orgs = list_research_orgs(engine)
    assert ORG in orgs
    assert OTHER_ORG in orgs
    assert all(isinstance(o, str) for o in orgs)  # ids only, no rows


def test_corroboration_rate_ignores_disputed_and_outdated(engine: Engine) -> None:
    from coffee_export.research import EvidenceLedger

    ledger = EvidenceLedger(ORG, engine)
    ledger.record("lead", "l", "sector", "importer", "website", source_url="https://a.de/1")
    ledger.record("lead", "l", "sector", "importer", "search", source_url="https://b.de/2")
    snap = ResearchHealthService(ORG, engine).overview(now_ts=NOW)
    # two corroborated rows / two live rows → 100%
    assert snap["evidence"]["corroboration_rate"] == pytest.approx(1.0)


# ── the admin CLI surface ──────────────────────────────────────────


@pytest.fixture()
def cli_engine(engine: Engine):
    """A queue bound to the test engine so main() keeps the INJECTED
    engine (the pure-CLI path would otherwise build its own)."""
    from coffee_export.tasks.durable_queue import DurableTaskQueue
    from coffee_export.tasks.registry import TaskRegistry

    return DurableTaskQueue(TaskRegistry(), engine, lease_ttl_seconds=300)


def test_cli_health_prints_the_snapshot(
    engine: Engine, cli_engine, capsys: pytest.CaptureFixture
) -> None:
    _seed(engine)
    code = main(["health", "--org", ORG], queue=cli_engine, engine=engine)
    out = capsys.readouterr().out
    assert code == EXIT_OK
    assert f"research health — org {ORG!r}" in out
    assert "sessions" in out
    assert "budget_exhausted" in out
    assert "evidence quality" in out
    assert "expiring soon" in out
    assert "budgets & usage" in out
    assert "followups" in out
    assert "overdue (scheduled)" in out
    assert "queue (research.* tasks)" in out
    assert "outreach approval queue" in out
    assert "research-drafted" in out
    assert "human approval required" in out


def test_cli_health_on_empty_org_is_exit_ok(
    engine: Engine, cli_engine, capsys: pytest.CaptureFixture
) -> None:
    code = main(["health", "--org", "org-empty"], queue=cli_engine, engine=engine)
    out = capsys.readouterr().out
    assert code == EXIT_OK
    assert "research health" in out


# ── the dashboard page module ──────────────────────────────────────


def test_dashboard_page_module_exposes_render() -> None:
    from coffee_export.dashboard.pages import research_monitoring

    assert callable(research_monitoring.render)
