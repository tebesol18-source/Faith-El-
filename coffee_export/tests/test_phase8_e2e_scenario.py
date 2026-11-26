"""
Phase 8 — end-to-end validation: ONE business-workflow scenario (§12.2).

The full Buyer Opportunity Radar chain on SYNTHETIC data, in ONE throwaway
database, asserting at every stage that the real output of the previous
stage feeds the next:

  1. synthetic ENRICHED lead + verified contact + active lot
  2. Agent 2 schedules a DURABLE research session (queue-only, §12.5)
  3. the real TaskWorker executes it (run_once) — the session completes
     honestly (fallback plan, no fabricated tool results)
  4. evidence collection: facts through the Phase 1 ledger + one through
     the record_evidence TOOL with expires_ts (Phase 4 §12.4 — the
     revalidation followup is scheduled automatically)
  5. Phase 5 QualificationService scores the buyer from the facts only
  6. the qualification scorecard lands as an evidence row (§12.4) —
     machine-recorded, 'llm_inference', never verification
  7. Phase 6 OutreachService drafts outreach into the EXISTING
     pending_agent_actions approval queue (§4.5 dual gate: pending,
     NEVER sent; supervisor payload contract intact)
  8. the outreach milestone schedules a Phase 3 followup
  9. the Phase 7 ResearchHealthService snapshot reflects EVERY stage
     above honestly — sessions, evidence (incl. expiring backlog),
     facts, budgets, followups, research.* queue, approval queue

Every value here is synthetic and stays in the throwaway database; the
committed operational DB is never opened (hermetic runner contract).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.agents.agent2_enrichment import Agent2
from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.database.models.lead import Lead, LeadContact
from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
    ResearchFollowup,
    ResearchSession,
    ResearchToolCall,
)
from coffee_export.research import (
    EvidenceLedger,
    QualificationService,
    ResearchHealthService,
    ToolContext,
)
from coffee_export.research.outreach import (
    PENDING_AGENT_ACTIONS,
    SCORECARD_FACT_KEY,
    OutreachService,
)
from coffee_export.research.tools.evidence_record import RecordEvidenceTool
from coffee_export.tasks.durable_queue import DurableTaskQueue
from coffee_export.tasks.registry import TaskRegistry
from coffee_export.tasks.research_tasks import register_research_tasks
from coffee_export.tasks.worker import TaskWorker

ORG = "org-phase8"
LEAD_ID = "lead-p8-synthetic"
LOT_ID = "lot-p8-synthetic"
TS = "2026-01-01T00:00:00+03:00"  # synthetic timeline start
EXPIRY = "2026-01-10T00:00:00+03:00"  # evidence expiry (5 days after NOW)
DUE = "2026-02-01T00:00:00+03:00"  # outreach milestone due date
NOW = "2026-01-05T00:00:00+03:00"  # monitoring snapshot instant

TRACE: list[str] = []


def _stage(n: int, title: str, **facts: object) -> None:
    line = f"[phase8-e2e] {n}. {title}"
    if facts:
        detail = ", ".join(f"{k}={v!r}" for k, v in facts.items())
        line = f"{line} — {detail}"
    TRACE.append(line)
    print(line)


@pytest.fixture()
def engine(tmp_path: Path) -> Engine:
    eng = create_engine(f"sqlite:///{tmp_path}/phase8-e2e.db", future=True)
    for table in (
        ResearchSession.__table__,
        ResearchEvidence.__table__,
        ResearchFact.__table__,
        ResearchFollowup.__table__,
        ResearchToolCall.__table__,
        AgentTask.__table__,
        Lead.__table__,
        LeadContact.__table__,
        PENDING_AGENT_ACTIONS,
    ):
        table.create(eng)
    from coffee_export.database.models.inventory import Lot

    Lot.__table__.create(eng)
    return eng


def _registry(engine: Engine) -> TaskRegistry:
    registry = TaskRegistry()
    register_research_tasks(registry, engine=engine)
    return registry


# ── the scenario ──────────────────────────────────────────────────


def test_buyer_opportunity_radar_end_to_end(engine: Engine) -> None:
    TRACE.clear()  # isolate per run
    trace = TRACE

    # 1 ─ synthetic buyer: ENRICHED lead, verified contact, active lot
    with engine.begin() as conn:
        conn.execute(
            Lead.__table__.insert().values(
                lead_id=LEAD_ID,
                company_name="Phase Eight Kaffee GmbH (synthetic)",
                headquarters_country="Germany",
                organization_id=ORG,
                current_state="ENRICHED",
                current_agent="Agent 2",
                priority_tier="A",
                recommended_vp="VP1",
                outreach_language="EN",
                created_ts=TS,
                updated_ts=TS,
            )
        )
        conn.execute(
            LeadContact.__table__.insert().values(
                lead_id=LEAD_ID,
                name="Synthetic Buyer",
                title="Head of Coffee",
                email="buyer@phase-eight-synthetic.example",
                is_primary=1,
                is_buyer=1,
                organization_id=ORG,
                created_ts=TS,
                updated_ts=TS,
                verification_status="verified",
                verified_by="operator-synthetic",
                verified_ts=TS,
            )
        )
        from coffee_export.database.models.inventory import Lot

        conn.execute(
            Lot.__table__.insert().values(
                lot_id=LOT_ID,
                station_id="station-p8",
                organization_id=ORG,
                coop_id="coop-p8",
                region="Yirgacheffe",
                process="Washed",
                crop_year="2025/26",
                stock_bags_remaining=500,
                bag_size_kg=60,
                cupping_score=86.5,
                certifications="organic, fairtrade",
                status="active",
                last_updated_ts=TS,
                created_ts=TS,
                updated_ts=TS,
            )
        )
    _stage(1, "synthetic buyer seeded", lead=LEAD_ID, lot=LOT_ID, state="ENRICHED")

    # 2 ─ Agent 2 schedules a DURABLE research session (queue-only)
    agent = Agent2(organization_id=ORG)
    scheduled = agent.schedule_research_session(
        f"Research the German specialty buyer Phase Eight Kaffee ({LEAD_ID})",
        engine=engine,
        registry=_registry(engine),
    )
    assert scheduled["created"] is True
    assert scheduled["plan_source"] == "fallback"  # no gateway configured — honest
    assert scheduled["task_status"] == "pending"
    with engine.connect() as conn:
        row = (
            conn.execute(
                AgentTask.__table__.select().where(
                    AgentTask.__table__.c.task_id == scheduled["task_id"]
                )
            )
            .mappings()
            .first()
        )
    assert row["task_type"] == "research.run_session"
    assert row["status"] == "pending"
    assert row["organization_id"] == ORG
    assert json.loads(row["payload"]) == {"session_id": scheduled["session_id"]}
    _stage(
        2,
        "durable research session scheduled through the queue",
        session=scheduled["session_id"],
        task=scheduled["task_id"],
        plan=scheduled["plan_source"],
    )

    # 3 ─ the real worker executes the queued session
    registry = _registry(engine)
    queue = DurableTaskQueue(registry, engine)
    worker = TaskWorker(queue, registry, followup_engine=engine)
    processed = worker.run_once()
    assert processed is True
    task = queue.get_task(scheduled["task_id"])
    assert task.status == "completed"
    from coffee_export.research import ResearchSessions

    session = ResearchSessions(ORG, engine).get_session(scheduled["session_id"])
    assert session.status == "completed"  # honest empty run, never fabricated
    assert session.created_by == "agent:Agent 2"
    _stage(
        3,
        "worker executed the session",
        status=session.status,
        created_by=session.created_by,
    )

    # 4 ─ evidence collection (Phase 1 ledger + Phase 4 tool path)
    ledger = EvidenceLedger(ORG, engine)
    ledger.record(
        "lead",
        LEAD_ID,
        "contact_email",
        "buyer@phase-eight-synthetic.example",
        "website",
        source_url="https://phase-eight-synthetic.example/team",
    )
    ledger.record(
        "lead",
        LEAD_ID,
        "sector",
        "importer",
        "website",
        source_url="https://phase-eight-synthetic.example/profile",
    )
    ledger.record(
        "lead",
        LEAD_ID,
        "purchase_volume_mt",
        20,
        "website",
        source_url="https://phase-eight-synthetic.example/profile",
    )
    # the volume fact goes through the record_evidence TOOL with an expiry —
    # the Phase 4 §12.4 wiring must schedule the revalidation followup
    tool = RecordEvidenceTool()
    ctx = ToolContext(organization_id=ORG, session_id=scheduled["session_id"], engine=engine)
    result = tool.execute(
        {
            "subject_type": "lead",
            "subject_id": LEAD_ID,
            "fact_key": "annual_volume_mt",
            "value": 240,
            "source_type": "website",
            "source_url": "https://phase-eight-synthetic.example/profile",
            "expires_ts": EXPIRY,
        },
        ctx,
    )
    assert result.status == "ok"
    assert result.output["followup_id"] is not None  # §12.4 automated wiring
    revalidate_followup_id = result.output["followup_id"]
    _stage(
        4,
        "evidence recorded (ledger + tool)",
        facts=4,
        expires=EXPIRY,
        revalidate_followup=revalidate_followup_id,
    )

    # 5 ─ Phase 5 qualification from the facts only
    card = QualificationService(ORG, engine).score_lead("lead", LEAD_ID)
    assert card["score"] == card["max_score"]  # full evidence, nothing missing
    assert card["missing_information"] == []
    _stage(5, "buyer qualified", score=card["score"], max=card["max_score"])

    # 6 ─ the scorecard lands as an evidence row (§12.4)
    outreach = OutreachService(ORG, engine)
    scorecard_row = outreach.record_qualification_scorecard(LEAD_ID)
    assert scorecard_row["source_type"] == "llm_inference"  # derived analysis
    assert scorecard_row["evidence_id"]
    assert scorecard_row["score"] == card["score"]
    rows = ledger.list_evidence("lead", LEAD_ID, SCORECARD_FACT_KEY)
    assert len(rows) == 1
    assert json.loads(rows[0].value)["score"] == card["score"]
    _stage(
        6,
        "qualification scorecard stored as evidence",
        evidence_id=scorecard_row["evidence_id"],
        source_type=scorecard_row["source_type"],
    )

    # 7 ─ outreach draft into the EXISTING approval queue (dual gate)
    draft = outreach.draft_outreach(LEAD_ID, created_by="agent:Agent 3")
    assert draft["drafted"] is True
    assert draft["email_to"] == "buyer@phase-eight-synthetic.example"
    assert draft["contact_check"]["usable"] is True
    assert draft["matched_lot_ids"] == [LOT_ID]
    with engine.connect() as conn:
        action = (
            conn.execute(
                PENDING_AGENT_ACTIONS.select().where(
                    PENDING_AGENT_ACTIONS.c.id == draft["action_id"]
                )
            )
            .mappings()
            .first()
        )
    assert action["status"] == "pending"  # awaiting the human — never sent
    assert action["organization_id"] == ORG  # §4.1 explicit org
    payload = json.loads(action["payload"])
    for key in (
        "lead_id",
        "company",
        "step",
        "language",
        "email_subject",
        "email_body",
        "email_to",
        "email_from",
    ):
        assert key in payload, f"missing supervisor payload key {key}"
    assert payload["reasoning"]["source"] == "research"
    _stage(
        7,
        "outreach draft awaiting human approval",
        action_id=draft["action_id"],
        status=action["status"],
        email_to=draft["email_to"],
    )

    # 8 ─ the outreach milestone schedules a Phase 3 followup
    milestone = outreach.record_outreach_milestone(
        LEAD_ID, "no_reply", due_ts=DUE, created_by="agent:Agent 3"
    )
    assert milestone.followup_type == "run_session"
    assert milestone.status == "scheduled"
    assert milestone.organization_id == ORG
    _stage(
        8,
        "no-reply milestone followup scheduled",
        followup_type=milestone.followup_type,
        due=DUE,
    )

    # 9 ─ the Phase 7 monitoring snapshot reflects the WHOLE chain
    snap = ResearchHealthService(ORG, engine).overview(now_ts=NOW)
    assert snap["organization_id"] == ORG
    assert snap["sessions"]["total"] == 1
    assert snap["sessions"]["by_status"] == {"completed": 1}
    assert snap["sessions"]["last_completed"]["session_id"] == scheduled["session_id"]
    assert snap["evidence"]["total"] == 5  # 4 facts + 1 scorecard
    assert snap["evidence"]["expiring_soon"] == 1  # annual_volume_mt @ EXPIRY
    assert snap["evidence"]["expired_still_live"] == 0
    assert snap["facts"]["total"] == 5
    assert snap["facts"]["human_locked"] == 0
    assert snap["followups"]["by_status"] == {"scheduled": 2}
    assert snap["followups"]["overdue_scheduled"] == 0
    assert snap["followups"]["next_due"]["due_ts"] == EXPIRY  # revalidate first
    assert snap["queue"]["by_status"] == {"completed": 1}
    assert snap["queue"]["in_flight"] == 0
    assert snap["outreach"]["by_status"] == {"pending": 1}
    assert snap["outreach"]["awaiting_human_review"] == 1
    assert snap["outreach"]["research_drafted_pending"] == 1
    assert snap["outreach"]["pending_recent"][0]["lead_id"] == LEAD_ID
    _stage(
        9,
        "monitoring snapshot reflects the full chain",
        sessions=snap["sessions"]["total"],
        evidence=snap["evidence"]["total"],
        followups=snap["followups"]["by_status"],
        queue=snap["queue"]["by_status"],
        outreach_pending=snap["outreach"]["awaiting_human_review"],
    )

    # the honest trace, in order
    assert len(trace) == 9
    assert trace[0].startswith("[phase8-e2e] 1.")
    assert trace[-1].startswith("[phase8-e2e] 9.")


def test_scenario_is_org_scoped(engine: Engine) -> None:
    """The whole chain stays inside its org — no cross-org leakage."""
    snap = ResearchHealthService("org-someone-else", engine).overview(now_ts=NOW)
    assert snap["sessions"]["total"] == 0
    assert snap["evidence"]["total"] == 0
    assert snap["outreach"]["awaiting_human_review"] == 0
