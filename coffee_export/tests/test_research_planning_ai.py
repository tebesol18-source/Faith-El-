"""
LLM-assisted planning + revalidation-followup wiring — TryComp Phase 4
(§12.1 / §12.4).

Proves, on disposable per-test databases and fake gateways (never the
network, never a real provider):

  * plan_objective_ai — strict validation with honest fallback:
    no gateway / gateway exception / failed response / non-JSON /
    non-list / unknown tool / schema-violating input / over-bound plans
    ALL fall back to the deterministic template with the honest
    parse_error; a VALID answer (bare or code-fenced JSON) becomes the
    stored plan with normalized step numbers, tool→phase mapping,
    bounded descriptions and an auto-appended summarize step
  * create_session_with_planning — the Agent-2 entry point: the LLM
    plan lands on the session, the model call is accounted through
    engine.record_model_call (usage_model_calls=1, pending→running),
    the fallback path records no model call, and org-scoped reuse
    does not double-account
  * record_evidence followup wiring — expires_ts schedules the
    revalidate_evidence followup (subject-scoped, due at expiry) and
    returns its id; no expiry → no followup; a scheduling failure
    degrades honestly (evidence stays recorded, no followup_id)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.ai.providers.base import AIResponse
from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
    ResearchFollowup,
    ResearchSession,
)
from coffee_export.research import EvidenceLedger, ResearchFollowups, ToolContext
from coffee_export.research.planning import (
    MAX_DESCRIPTION_CHARS,
    MAX_PLAN_STEPS,
    plan_objective,
    plan_objective_ai,
)
from coffee_export.research.tools.evidence_record import RecordEvidenceTool

ORG = "org-acme"
OTHER_ORG = "org-beta"


class _FakeGateway:
    """Test double of AIGateway: one canned .chat() outcome."""

    def __init__(
        self,
        *,
        text: str = "",
        success: bool = True,
        error: str = "",
        cost_usd: float = 0.0,
        raise_exc: Exception | None = None,
    ) -> None:
        self.text = text
        self.success = success
        self.error = error
        self.cost_usd = cost_usd
        self.raise_exc = raise_exc
        self.calls: list[dict] = []

    def chat(self, prompt: str, **kwargs) -> AIResponse:
        self.calls.append({"prompt": prompt, **kwargs})
        if self.raise_exc is not None:
            raise self.raise_exc
        return AIResponse(
            text=self.text,
            provider="glm",
            model="glm-4.7",
            cost_usd=self.cost_usd,
            success=self.success,
            error=self.error,
        )


VALID_PLAN = json.dumps(
    [
        {
            "tool": "web_search",
            "input": {"query": "specialty coffee importer Hamburg"},
            "description": "Search for the buyer's import footprint.",
        },
        {
            "tool": "record_evidence",
            "input": {
                "subject_type": "lead",
                "subject_id": "lead-1",
                "fact_key": "imports_mt",
                "value": 900,
                "source_type": "website",
                "source_url": "https://example.com/buyer",
            },
            "description": "Record the observed import volume.",
        },
        {"tool": None, "description": "Summarize findings."},
    ]
)


@pytest.fixture()
def engine(tmp_path: Path) -> Engine:
    eng = create_engine(f"sqlite:///{tmp_path}/planning.db", future=True)
    for table in (
        ResearchSession.__table__,
        ResearchEvidence.__table__,
        ResearchFact.__table__,
        ResearchFollowup.__table__,
    ):
        table.create(eng)
    return eng


def _ctx(eng: Engine, session_id: str = "") -> ToolContext:
    return ToolContext(organization_id=ORG, session_id=session_id, engine=eng)


# ── plan_objective_ai: strict validation + honest fallback ────────


def test_no_gateway_is_deterministic_fallback() -> None:
    outcome = plan_objective_ai("Research buyer Example GmbH", None)
    assert outcome.source == "fallback"
    assert outcome.steps == plan_objective("Research buyer Example GmbH")
    assert outcome.parse_error is None
    assert outcome.cost_usd is None


def test_gateway_exception_falls_back_honestly() -> None:
    gw = _FakeGateway(raise_exc=RuntimeError("socket closed"))
    outcome = plan_objective_ai("objective", gw)
    assert outcome.source == "fallback"
    assert "gateway error" in (outcome.parse_error or "")
    assert "socket closed" in (outcome.parse_error or "")


def test_failed_provider_response_falls_back() -> None:
    gw = _FakeGateway(success=False, error="429 quota")
    outcome = plan_objective_ai("objective", gw)
    assert outcome.source == "fallback"
    assert "provider failed" in (outcome.parse_error or "")
    assert "429" in (outcome.parse_error or "")


def test_valid_plan_is_accepted_and_normalized() -> None:
    gw = _FakeGateway(text=VALID_PLAN, cost_usd=0.012)
    outcome = plan_objective_ai("objective", gw)
    assert outcome.source == "llm"
    assert outcome.provider == "glm"
    assert outcome.model == "glm-4.7"
    assert outcome.cost_usd == 0.012
    assert outcome.parse_error is None
    steps = outcome.steps
    assert [s["step"] for s in steps] == [1, 2, 3]
    assert steps[0]["phase"] == "collect_evidence"
    assert steps[0]["tool"] == "web_search"
    assert steps[0]["input"] == {"query": "specialty coffee importer Hamburg"}
    assert steps[1]["phase"] == "record_evidence"
    assert steps[2]["phase"] == "summarize"
    assert steps[2]["tool"] is None


def test_code_fenced_json_is_parsed() -> None:
    gw = _FakeGateway(text=f"```json\n{VALID_PLAN}\n```")
    outcome = plan_objective_ai("objective", gw)
    assert outcome.source == "llm"
    assert len(outcome.steps) == 3


def test_unreported_cost_stays_none() -> None:
    gw = _FakeGateway(text=VALID_PLAN, cost_usd=0.0)  # falsy = unreported
    outcome = plan_objective_ai("objective", gw)
    assert outcome.source == "llm"
    assert outcome.cost_usd is None


@pytest.mark.parametrize(
    "text",
    [
        "no json here at all",
        '{"steps": "not a list"}',
        "[]",
        json.dumps([{"tool": "sql_execute", "description": "nope"}]),
        json.dumps(
            [
                {
                    "tool": "web_search",
                    "input": {"query": "x", "junk_field": 1},
                    "description": "unknown input field",
                },
                {"tool": None},
            ]
        ),
        json.dumps(
            [
                {
                    "tool": "record_evidence",
                    "input": {"subject_type": "lead"},  # missing required fields
                    "description": "schema violation",
                },
                {"tool": None},
            ]
        ),
        json.dumps(
            [
                {"tool": "web_search", "input": {"query": "x"}, "description": f"step {i}"}
                for i in range(MAX_PLAN_STEPS + 1)
            ]
            + [{"tool": None}]
        ),
        json.dumps(["bare string step", {"tool": None}]),
    ],
)
def test_invalid_answers_fall_back_with_reason(text: str) -> None:
    gw = _FakeGateway(text=text)
    outcome = plan_objective_ai("objective", gw)
    assert outcome.source == "fallback"
    assert outcome.steps == plan_objective("objective")
    assert outcome.parse_error  # honest reason always present


def test_missing_summarize_step_is_appended() -> None:
    plan = json.dumps([{"tool": "web_search", "input": {"query": "q"}, "description": "only step"}])
    outcome = plan_objective_ai("objective", _FakeGateway(text=plan))
    assert outcome.source == "llm"
    assert outcome.steps[-1]["tool"] is None
    assert outcome.steps[-1]["phase"] == "summarize"


def test_descriptions_are_bounded_and_defaulted() -> None:
    plan = json.dumps(
        [
            {
                "tool": "web_search",
                "input": {"query": "q"},
                "description": "y" * (MAX_DESCRIPTION_CHARS + 50),
            },
            {"tool": "web_search", "input": {"query": "q2"}},  # no description
            {"tool": None, "description": ""},
        ]
    )
    outcome = plan_objective_ai("objective", _FakeGateway(text=plan))
    assert outcome.source == "llm"
    assert len(outcome.steps[0]["description"]) == MAX_DESCRIPTION_CHARS
    assert outcome.steps[1]["description"].startswith("Step 2")
    assert outcome.steps[2]["description"].startswith("Step 3")


def test_toolless_steps_cannot_carry_inputs() -> None:
    plan = json.dumps([{"tool": None, "input": {"query": "q"}, "description": "x"}])
    outcome = plan_objective_ai("objective", _FakeGateway(text=plan))
    # toolless step with an input is still a summarize step — input dropped
    assert outcome.source == "llm"
    assert "input" not in outcome.steps[0]


# ── create_session_with_planning (the Agent-2 entry point) ────────


def test_session_created_with_llm_plan_and_accounted(engine: Engine) -> None:
    from coffee_export.tasks.research_tasks import create_session_with_planning

    gw = _FakeGateway(text=VALID_PLAN, cost_usd=0.02)
    session, created, outcome = create_session_with_planning(
        engine,
        ORG,
        "Research the German specialty buyer Example GmbH",
        created_by="agent:2",
        gateway=gw,
    )
    assert created is True
    assert outcome.source == "llm"
    assert gw.calls  # the planner really called the gateway
    assert json.loads(session.plan)[0]["tool"] == "web_search"
    # the model call was accounted against the session — no side channel
    assert session.usage_model_calls == 1
    assert session.usage_cost_usd == pytest.approx(0.02)
    assert session.status == "running"  # recording auto-starts (documented)


def test_fallback_plan_creates_session_without_model_call(engine: Engine) -> None:
    from coffee_export.tasks.research_tasks import create_session_with_planning

    session, created, outcome = create_session_with_planning(
        engine, ORG, "Research buyer Example GmbH", created_by="agent:2", gateway=None
    )
    assert created is True
    assert outcome.source == "fallback"
    assert session.usage_model_calls == 0
    assert session.status == "pending"


def test_reused_session_is_not_double_accounted(engine: Engine) -> None:
    from coffee_export.tasks.research_tasks import create_session_with_planning

    gw = _FakeGateway(text=VALID_PLAN, cost_usd=0.02)
    first, created_first, _ = create_session_with_planning(
        engine, ORG, "Research the German buyer", created_by="agent:2", gateway=gw
    )
    second, created_second, _ = create_session_with_planning(
        engine, ORG, "Research the German buyer", created_by="agent:2", gateway=gw
    )
    assert created_first is True
    assert created_second is False
    assert second.session_id == first.session_id
    # reuse never re-accounts a planning call onto a live session
    assert second.usage_model_calls == 1
    assert len(gw.calls) == 2  # planning was honestly attempted twice


def test_sessions_are_org_scoped(engine: Engine) -> None:
    from coffee_export.tasks.research_tasks import create_session_with_planning

    create_session_with_planning(
        engine, ORG, "Research the German buyer", created_by="agent:2", gateway=None
    )
    other, created, _ = create_session_with_planning(
        engine,
        OTHER_ORG,
        "Research the German buyer",
        created_by="agent:2",
        gateway=None,
    )
    assert created is True  # different org → its own session
    from coffee_export.research import ResearchSessions

    assert [s.objective for s in ResearchSessions(ORG, engine).list_sessions()] == [
        "Research the German buyer"
    ]


# ── record_evidence followup wiring (§12.4) ───────────────────────

EXPIRY = "2099-06-01T00:00:00+03:00"


def test_expiry_schedules_revalidation_followup(engine: Engine) -> None:
    tool = RecordEvidenceTool()
    result = tool.execute(
        {
            "subject_type": "lead",
            "subject_id": "lead-7",
            "fact_key": "annual_volume_mt",
            "value": 1200,
            "source_type": "website",
            "source_url": "https://example.com/buyer",
            "expires_ts": EXPIRY,
        },
        _ctx(engine, session_id="ses-123"),
    )
    assert result.status == "ok"
    followup_id = result.output.get("followup_id")
    assert followup_id

    followups = ResearchFollowups(ORG, engine)
    row = followups.get_followup(followup_id)
    assert row.followup_type == "revalidate_evidence"
    assert row.due_ts == EXPIRY
    assert row.status == "scheduled"
    assert row.subject_type == "lead" and row.subject_id == "lead-7"
    assert row.created_by == "research:ses-123"
    assert json.loads(row.payload) == {"subject_type": "lead", "subject_id": "lead-7"}

    # the evidence row itself was recorded honestly
    ledger = EvidenceLedger(ORG, engine)
    evidence = ledger.get_evidence(result.output["evidence_id"])
    assert evidence.expires_ts == EXPIRY


def test_no_expiry_no_followup(engine: Engine) -> None:
    tool = RecordEvidenceTool()
    result = tool.execute(
        {
            "subject_type": "lead",
            "subject_id": "lead-8",
            "fact_key": "country",
            "value": "DE",
            "source_type": "website",
            "source_url": "https://example.com/buyer",
        },
        _ctx(engine),
    )
    assert result.status == "ok"
    assert "followup_id" not in result.output
    assert ResearchFollowups(ORG, engine).list_followups(status="scheduled") == []


def test_scheduling_failure_degrades_honestly(tmp_path: Path) -> None:
    # followups table missing on this engine → scheduling fails, evidence stays
    eng = create_engine(f"sqlite:///{tmp_path}/nofollowup.db", future=True)
    ResearchEvidence.__table__.create(eng)
    ResearchFact.__table__.create(eng)
    tool = RecordEvidenceTool()
    result = tool.execute(
        {
            "subject_type": "lead",
            "subject_id": "lead-9",
            "fact_key": "cert",
            "value": "organic",
            "source_type": "website",
            "source_url": "https://example.com/buyer",
            "expires_ts": EXPIRY,
        },
        _ctx(eng),
    )
    assert result.status == "ok"
    assert "followup_id" not in result.output  # honest absence, not an error
    assert EvidenceLedger(ORG, eng).list_evidence("lead", "lead-9") != []


def test_followup_is_org_scoped(engine: Engine) -> None:
    tool = RecordEvidenceTool()
    result = tool.execute(
        {
            "subject_type": "lead",
            "subject_id": "lead-10",
            "fact_key": "volume",
            "value": 5,
            "source_type": "website",
            "source_url": "https://example.com/buyer",
            "expires_ts": EXPIRY,
        },
        _ctx(engine),
    )
    assert result.status == "ok"
    from coffee_export.research.common import ResearchNotFoundError

    with pytest.raises(ResearchNotFoundError):
        ResearchFollowups(OTHER_ORG, engine).get_followup(result.output["followup_id"])
