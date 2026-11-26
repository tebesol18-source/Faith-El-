"""
Outreach & relationship integration — TryComp Phase 6.

Proves, on disposable per-test databases (injected engines — never the
operational DB):

  * evidence-based drafts — draft_outreach composes the research bundle
    (Phase 5 scorecard + inventory matches + §12.3 contact-gated email)
    into ONE pending_agent_actions row with the supervisor's exact
    send_email payload contract; NEVER sends (no gateway call path
    exists in this module at all)
  * draft honesty — only SATISFIED scorecard dimensions enter the
    buyer-facing body; missing information goes to the payload's
    reasoning block for the HUMAN approver, never into the body
  * §12.2 duplicate-send prevention — a pending / approved / executed
    action blocks a second draft (whoever drafted it); a rejected or
    execution_failed action honestly does NOT (operator retry)
  * §12.1 contact gate — no verified lead_contacts row → refusal;
    verified CRM row without evidence → refusal (no_evidence);
    llm_inference-only evidence → refusal
    (ai_inference_is_not_verification)
  * state gate — only ENRICHED leads are draftable (the supervisor
    executes the approved send as exactly ENRICHED→IN_SEQUENCE)
  * org scoping — another org's lead is indistinguishable from missing;
    the org is stamped EXPLICITLY on the queue row (never the column
    default); another org's in-flight action does not block
  * §12.3 milestones — outreach milestones schedule the Phase 3
    followups (no_reply → run_session, sample_feedback_due →
    revalidate_evidence), subject-scoped, honest validation
  * §12.4 CRM pipeline integration — qualification scorecards land as
    evidence rows: machine path (llm_inference, derived analysis, never
    corroborates) and operator path (human, locks the fact; a newer
    human attestation supersedes)
  * the research tool — draft_outreach through the registry (org-scoped
    ToolContext, engine required, honest refusals as ok-with-reason
    outputs)
  * Agent 3 integration — submit_research_outreach /
    schedule_outreach_followup (explicit tenant org; org-system agents
    REFUSE — §4.1) and the QUAL-pass scorecard citation through a
    SessionManager bound to the test engine
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from coffee_export.agents.agent3_outreach import Agent3
from coffee_export.database.models.lead import Lead, LeadContact
from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
    ResearchFollowup,
)
from coffee_export.research import (
    EvidenceLedger,
    OutreachService,
    ToolContext,
    ToolRegistry,
)
from coffee_export.research.outreach import (
    PENDING_AGENT_ACTIONS,
    SCORECARD_FACT_KEY,
)
from coffee_export.research.tools.outreach import DraftOutreachTool

ORG = "org-acme"
OTHER_ORG = "org-beta"
TS = "2026-01-01T00:00:00+03:00"
DUE = "2026-02-01T00:00:00+03:00"


@pytest.fixture()
def engine(tmp_path: Path) -> Engine:
    eng = create_engine(f"sqlite:///{tmp_path}/outreach.db", future=True)
    for table in (
        PENDING_AGENT_ACTIONS,
        Lead.__table__,
        LeadContact.__table__,
        ResearchEvidence.__table__,
        ResearchFact.__table__,
        ResearchFollowup.__table__,
    ):
        table.create(eng)
    from coffee_export.database.models.inventory import Lot

    Lot.__table__.create(eng)
    return eng


# ── fixtures: leads, contacts, evidence, lots, queue rows ──────────


def _lead(
    engine: Engine,
    lead_id: str,
    *,
    org: str = ORG,
    state: str = "ENRICHED",
    company: str | None = None,
    tier: str = "A",
) -> None:
    company = company or f"Company {lead_id}"
    with engine.begin() as conn:
        conn.execute(
            Lead.__table__.insert().values(
                lead_id=lead_id,
                company_name=company,
                headquarters_country="Germany",
                organization_id=org,
                current_state=state,
                current_agent="Agent 2",
                priority_tier=tier,
                recommended_vp="VP1",
                outreach_language="EN",
                created_ts=TS,
                updated_ts=TS,
            )
        )


def _contact(
    engine: Engine,
    lead_id: str,
    *,
    org: str = ORG,
    email: str = "buyer@kaffee-import.de",
    name: str = "Anna Meier",
    verified: bool = True,
) -> None:
    with engine.begin() as conn:
        conn.execute(
            LeadContact.__table__.insert().values(
                lead_id=lead_id,
                name=name,
                title="Head of Coffee",
                email=email,
                is_primary=1,
                is_buyer=1,
                organization_id=org,
                created_ts=TS,
                updated_ts=TS,
                verification_status="verified" if verified else "unverified",
                verified_by="operator-1" if verified else None,
                verified_ts=TS if verified else None,
            )
        )


def _fact(
    engine: Engine,
    org: str,
    lead_id: str,
    key: str,
    value: object,
    source: str = "website",
    **kw,
) -> None:
    EvidenceLedger(org, engine).record("lead", lead_id, key, value, source, **kw)


def _lot(engine: Engine, lot_id: str, *, org: str = ORG, **overrides) -> None:
    from coffee_export.database.models.inventory import Lot

    row = {
        "lot_id": lot_id,
        "station_id": "station-1",
        "organization_id": org,
        "coop_id": "coop-1",
        "region": "Yirgacheffe",
        "process": "Washed",
        "crop_year": "2025/26",
        "stock_bags_remaining": 500,
        "bag_size_kg": 60,
        "cupping_score": 86.5,
        "certifications": "organic, fairtrade",
        "status": "active",
        "last_updated_ts": TS,
        "created_ts": TS,
        "updated_ts": TS,
    }
    row.update(overrides)
    with engine.begin() as conn:
        conn.execute(Lot.__table__.insert().values(**row))


def _queue_action(
    engine: Engine,
    *,
    lead_id: str,
    org: str = ORG,
    status: str = "pending",
    agent_id: str = "Agent 3",
) -> int:
    with engine.begin() as conn:
        result = conn.execute(
            PENDING_AGENT_ACTIONS.insert().values(
                agent_id=agent_id,
                action_type="send_email",
                action_description="supervisor template draft",
                target_entity_type="lead",
                target_entity_id=lead_id,
                payload=json.dumps({"lead_id": lead_id, "step": 1}),
                risk_level="low",
                status=status,
                submitted_ts=TS,
                organization_id=org,
            )
        )
        return result.inserted_primary_key[0]


def _full_buyer(engine: Engine, lead_id: str = "lead-1") -> None:
    """An ENRICHED lead with a verified contact, an evidence-backed
    email, qualification facts and a matching lot."""
    _lead(engine, lead_id, company="Kaffee Import GmbH")
    _contact(engine, lead_id)
    _fact(
        engine,
        ORG,
        lead_id,
        "contact_email",
        "buyer@kaffee-import.de",
        source="website",
        source_url="https://kaffee-import.de/team",
    )
    _fact(
        engine,
        ORG,
        lead_id,
        "annual_volume_mt",
        240,
        source="website",
        source_url="https://kaffee-import.de/profile",
    )
    _fact(
        engine,
        ORG,
        lead_id,
        "sector",
        "importer",
        source="website",
        source_url="https://kaffee-import.de/profile",
    )
    _fact(
        engine,
        ORG,
        lead_id,
        "purchase_volume_mt",
        20,
        source="website",
        source_url="https://kaffee-import.de/profile",
    )
    _lot(engine, "lot-101")


# ── §12.1 evidence-based drafts ────────────────────────────────────


def test_draft_creates_pending_action_with_supervisor_contract(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    assert result["drafted"] is True
    assert result["action_id"] is not None
    assert result["email_to"] == "buyer@kaffee-import.de"
    assert result["contact_check"]["usable"] is True
    assert result["matched_lot_ids"] == ["lot-101"]

    with engine.connect() as conn:
        row = (
            conn.execute(
                PENDING_AGENT_ACTIONS.select().where(
                    PENDING_AGENT_ACTIONS.c.id == result["action_id"]
                )
            )
            .mappings()
            .first()
        )
    assert row["status"] == "pending"
    assert row["agent_id"] == "Agent 3"
    assert row["action_type"] == "send_email"
    assert row["target_entity_id"] == "lead-1"
    # §4.1 — the org is stamped EXPLICITLY, never the column default
    assert row["organization_id"] == ORG

    payload = json.loads(row["payload"])
    # the exact fields executeApprovedEmail() consumes
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
        assert key in payload, f"missing payload key {key}"
    assert payload["step"] == 1
    assert payload["email_to"] == "buyer@kaffee-import.de"
    assert payload["reasoning"]["source"] == "research"
    assert payload["reasoning"]["contact_evidence_level"] in (
        "observed_evidence",
        "corroborated",
        "human_verified",
    )


def test_draft_body_claims_only_evidenced_facts(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    with engine.connect() as conn:
        payload = json.loads(
            conn.execute(
                PENDING_AGENT_ACTIONS.select().where(
                    PENDING_AGENT_ACTIONS.c.id == result["action_id"]
                )
            )
            .mappings()
            .first()["payload"]
        )
    body = payload["email_body"]
    subject = payload["email_subject"]
    # the matched lot (with region + cupping evidence) is referenced
    assert "lot-101" in body
    assert "Yirgacheffe" in body
    assert "86.5" in body
    assert "Kaffee Import GmbH" in subject
    # the contact name personalizes the greeting
    assert "Hi Anna Meier," in body
    # honest scoring summary for the human approver only — the buyer
    # never sees the qualification score or missing-information notes
    assert payload["reasoning"]["qualification"]["score"] == 100
    assert "100/100" not in body
    assert "qualification" not in body.lower()
    assert "missing information" not in body.lower()


def test_draft_body_stays_generic_when_nothing_evidenced(engine: Engine) -> None:
    _lead(engine, "lead-2")
    _contact(engine, "lead-2")
    _fact(
        engine,
        ORG,
        "lead-2",
        "contact_email",
        "buyer@kaffee-import.de",
        source="website",
        source_url="https://kaffee-import.de/team",
    )
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-2", created_by="agent:Agent 3")
    assert result["drafted"] is True
    # only the contact-channel dimension is evidenced (weight 30)
    assert result["score"] == 30
    with engine.connect() as conn:
        payload = json.loads(
            conn.execute(
                PENDING_AGENT_ACTIONS.select().where(
                    PENDING_AGENT_ACTIONS.c.id == result["action_id"]
                )
            )
            .mappings()
            .first()["payload"]
        )
    # nothing evidenced → honest generic body, no claim lines
    assert "your importing program" not in payload["email_body"]
    assert "your sourcing volume" not in payload["email_body"]
    # missing information goes to the approver, never the buyer
    assert payload["reasoning"]["qualification"]["missing_information"]


def test_draft_missing_information_never_reaches_the_body(engine: Engine) -> None:
    _lead(engine, "lead-3")
    _contact(engine, "lead-3")
    _fact(
        engine,
        ORG,
        "lead-3",
        "contact_email",
        "buyer@kaffee-import.de",
        source="website",
        source_url="https://kaffee-import.de/team",
    )
    _fact(
        engine,
        ORG,
        "lead-3",
        "annual_volume_mt",
        240,
        source="website",
        source_url="https://kaffee-import.de/profile",
    )
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-3", created_by="agent:Agent 3")
    assert result["drafted"] is True
    with engine.connect() as conn:
        payload = json.loads(
            conn.execute(
                PENDING_AGENT_ACTIONS.select().where(
                    PENDING_AGENT_ACTIONS.c.id == result["action_id"]
                )
            )
            .mappings()
            .first()["payload"]
        )
    # sector + contact gate are the missing dimensions; only volume is
    # evidenced — the body carries the volume claim but NOT the sector
    assert "your sourcing volume" in payload["email_body"]
    assert "your importing program" not in payload["email_body"]
    assert "sector" in payload["reasoning"]["qualification"]["missing_information"]


# ── §12.2 duplicate-send prevention ────────────────────────────────


@pytest.mark.parametrize("status", ["pending", "approved", "executed"])
def test_duplicate_statuses_block_a_second_draft(engine: Engine, status: str) -> None:
    _full_buyer(engine)
    _queue_action(engine, lead_id="lead-1", status=status)
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    assert result["drafted"] is False
    assert result["reason"] == "duplicate_pending"
    assert result["blocked_by"]["status"] == status


@pytest.mark.parametrize("status", ["rejected", "execution_failed"])
def test_rejected_and_failed_actions_do_not_block(engine: Engine, status: str) -> None:
    _full_buyer(engine)
    _queue_action(engine, lead_id="lead-1", status=status)
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    assert result["drafted"] is True


def test_own_draft_blocks_a_second_draft(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    first = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    assert first["drafted"] is True
    second = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    assert second["drafted"] is False
    assert second["reason"] == "duplicate_pending"
    assert second["blocked_by"]["action_id"] == first["action_id"]


def test_supervisor_template_draft_blocks_the_research_draft(engine: Engine) -> None:
    """Both producers write the same queue — the guard is shared."""
    _full_buyer(engine)
    _queue_action(engine, lead_id="lead-1", agent_id="supervisor-template")
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    assert result["drafted"] is False
    assert result["blocked_by"]["agent_id"] == "supervisor-template"


def test_other_org_in_flight_action_does_not_block(engine: Engine) -> None:
    """The duplicate guard is org-scoped: an in-flight action row
    stamped with ANOTHER org never blocks this org's draft (lead ids
    are globally unique — the cross-org row targets the same id only
    because the Node-side insert defaults its org stamp)."""
    _full_buyer(engine)
    _queue_action(engine, lead_id="lead-1", org=OTHER_ORG)
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-1", created_by="agent:Agent 3")
    assert result["drafted"] is True
    with engine.connect() as conn:
        rows = conn.execute(PENDING_AGENT_ACTIONS.select()).mappings().all()
    assert len(rows) == 2
    assert {r["organization_id"] for r in rows} == {ORG, OTHER_ORG}


# ── §12.1 contact-channel gate ─────────────────────────────────────


def test_refusal_without_a_verified_contact(engine: Engine) -> None:
    _lead(engine, "lead-4")
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-4", created_by="agent:Agent 3")
    assert result["drafted"] is False
    assert result["reason"] == "no_verified_contact"


def test_refusal_when_the_channel_has_no_evidence(engine: Engine) -> None:
    _lead(engine, "lead-5")
    _contact(engine, "lead-5")  # CRM-verified but NO evidence row
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-5", created_by="agent:Agent 3")
    assert result["drafted"] is False
    assert "contact_channel_not_usable" in result["reason"]
    assert result["contact_check"]["reason"] == "no_evidence"


def test_refusal_when_the_channel_is_llm_inference_only(engine: Engine) -> None:
    _lead(engine, "lead-6")
    _contact(engine, "lead-6")
    _fact(engine, ORG, "lead-6", "contact_email", "buyer@kaffee-import.de", source="llm_inference")
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-6", created_by="agent:Agent 3")
    assert result["drafted"] is False
    assert "ai_inference_is_not_verification" in result["reason"]


def test_refusal_is_not_an_oracle_for_leads_of_other_orgs(engine: Engine) -> None:
    _lead(engine, "lead-7", org=OTHER_ORG)
    service = OutreachService(ORG, engine)
    missing = service.draft_outreach("no-such-lead", created_by="agent:Agent 3")
    other_org = service.draft_outreach("lead-7", created_by="agent:Agent 3")
    assert missing == {
        "drafted": False,
        "lead_id": "no-such-lead",
        "reason": "lead_not_found",
    }
    assert other_org["reason"] == "lead_not_found"


# ── state gate + input validation ──────────────────────────────────


def test_only_enriched_leads_are_draftable(engine: Engine) -> None:
    _full_buyer(engine)
    _lead(engine, "lead-8", state="IN_SEQUENCE")
    _contact(engine, "lead-8")
    service = OutreachService(ORG, engine)
    result = service.draft_outreach("lead-8", created_by="agent:Agent 3")
    assert result["drafted"] is False
    assert result["reason"] == "lead_not_enriched"
    assert result["current_state"] == "IN_SEQUENCE"


def test_created_by_and_step_validation(engine: Engine) -> None:
    service = OutreachService(ORG, engine)
    with pytest.raises(ValueError, match="created_by"):
        service.draft_outreach("lead-1", created_by="  ")
    with pytest.raises(ValueError, match="FIRST contact email"):
        service.draft_outreach("lead-1", created_by="agent:Agent 3", step=2)


# ── §12.3 outreach milestones → Phase 3 followups ──────────────────


def test_no_reply_milestone_schedules_a_run_session_followup(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    row = service.record_outreach_milestone(
        "lead-1", "no_reply", due_ts=DUE, created_by="agent:Agent 3"
    )
    assert row.followup_type == "run_session"
    assert row.status == "scheduled"
    assert row.subject_type == "lead"
    assert row.subject_id == "lead-1"
    payload = json.loads(row.payload)
    assert payload["milestone"] == "no_reply"
    assert payload["lead_id"] == "lead-1"
    assert "lead-1" in payload["objective"]
    assert row.organization_id == ORG


def test_sample_feedback_milestone_schedules_revalidation(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    row = service.record_outreach_milestone(
        "lead-1",
        "sample_feedback_due",
        due_ts=DUE,
        created_by="agent:Agent 3",
        extra_payload={"sample_id": "S-2026-0001"},
    )
    assert row.followup_type == "revalidate_evidence"
    payload = json.loads(row.payload)
    assert payload["sample_id"] == "S-2026-0001"
    assert payload["milestone"] == "sample_feedback_due"


def test_milestone_validation(engine: Engine) -> None:
    service = OutreachService(ORG, engine)
    with pytest.raises(ValueError, match="milestone"):
        service.record_outreach_milestone(
            "lead-1", "birthday", due_ts=DUE, created_by="agent:Agent 3"
        )
    with pytest.raises(ValueError, match="dict"):
        service.record_outreach_milestone(
            "lead-1",
            "no_reply",
            due_ts=DUE,
            created_by="agent:Agent 3",
            extra_payload=["not", "a", "dict"],
        )


def test_milestone_followups_are_org_scoped(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    service.record_outreach_milestone("lead-1", "no_reply", due_ts=DUE, created_by="agent:Agent 3")
    other = OutreachService(OTHER_ORG, engine)
    other.record_outreach_milestone("lead-1", "no_reply", due_ts=DUE, created_by="agent:Agent 3")
    from coffee_export.research.followups import ResearchFollowups

    assert len(ResearchFollowups(ORG, engine).list_followups()) == 1
    assert len(ResearchFollowups(OTHER_ORG, engine).list_followups()) == 1


# ── §12.4 CRM pipeline integration ─────────────────────────────────


def test_machine_scorecard_is_derived_analysis_never_corroboration(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    result = service.record_qualification_scorecard("lead-1")
    assert result["source_type"] == "llm_inference"
    assert result["evidence_id"]
    assert result["score"] == 100

    # a second machine recording: still observed — derived analysis can
    # NEVER corroborate itself into a stronger fact state
    second = service.record_qualification_scorecard("lead-1")
    assert second["fact_status"] == "observed"

    ledger = EvidenceLedger(ORG, engine)
    rows = ledger.list_evidence("lead", "lead-1", SCORECARD_FACT_KEY)
    assert len(rows) == 2
    assert all(r.source_type == "llm_inference" for r in rows)
    value = json.loads(rows[0].value)
    assert value["subject_type"] == "lead"
    assert value["score"] == 100


def test_operator_scorecard_attestation_locks_the_fact(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    result = service.record_qualification_scorecard("lead-1", actor="operator-1")
    assert result["source_type"] == "human"
    assert result["fact_status"] == "human_verified"

    # the situation CHANGES (the volume evidence goes stale) and a
    # NEWER human attestation supersedes — the older row is retained
    # as disputed (Phase 1 conflict rules), never deleted
    ledger = EvidenceLedger(ORG, engine)
    volume_rows = ledger.list_evidence("lead", "lead-1", "annual_volume_mt")
    ledger.mark_outdated(volume_rows[0].evidence_id)
    second = service.record_qualification_scorecard("lead-1", actor="operator-2")
    assert second["score"] == 60  # the volume dimension (40) honestly dropped

    rows = ledger.list_evidence("lead", "lead-1", SCORECARD_FACT_KEY)
    assert len(rows) == 2
    assert rows[-1].source_type == "human"
    assert rows[0].status == "disputed"  # superseded, retained
    assert rows[-1].status in ("observed", "human_verified")


def test_scorecard_actor_validation(engine: Engine) -> None:
    _full_buyer(engine)
    service = OutreachService(ORG, engine)
    with pytest.raises(ValueError, match="actor"):
        service.record_qualification_scorecard("lead-1", actor="   ")


# ── the research tool ──────────────────────────────────────────────


def test_tool_drafts_through_the_registry(engine: Engine) -> None:
    _full_buyer(engine)
    registry = ToolRegistry()
    registry.register(DraftOutreachTool())
    ctx = ToolContext(organization_id=ORG, session_id="sess-1", engine=engine)
    result, _ = registry.invoke("draft_outreach", {"lead_id": "lead-1"}, ctx)
    assert result.status == "ok"
    assert result.output["drafted"] is True
    assert result.output["action_id"] is not None
    assert result.output["score"] == 100


def test_tool_reports_honest_refusals_as_ok_results(engine: Engine) -> None:
    registry = ToolRegistry()
    registry.register(DraftOutreachTool())
    ctx = ToolContext(organization_id=ORG, session_id="sess-1", engine=engine)
    result, _ = registry.invoke("draft_outreach", {"lead_id": "no-such"}, ctx)
    assert result.status == "ok"
    assert result.output["drafted"] is False
    assert result.output["reason"] == "lead_not_found"


def test_tool_requires_an_engine() -> None:
    registry = ToolRegistry()
    registry.register(DraftOutreachTool())
    ctx = ToolContext(organization_id=ORG, session_id="sess-1", engine=None)
    result, _ = registry.invoke("draft_outreach", {"lead_id": "lead-1"}, ctx)
    assert result.status == "error"
    assert "engine" in (result.error_message or "")


# ── Agent 3 integration ────────────────────────────────────────────


def test_agent3_queues_a_research_draft_with_explicit_org(engine: Engine) -> None:
    _full_buyer(engine)
    agent = Agent3(organization_id=ORG)
    result = agent.submit_research_outreach("lead-1", engine=engine)
    assert result["drafted"] is True
    with engine.connect() as conn:
        row = conn.execute(PENDING_AGENT_ACTIONS.select()).mappings().first()
    assert row["agent_id"] == "Agent 3"
    assert row["organization_id"] == ORG
    payload = json.loads(row["payload"])
    assert payload["reasoning"]["created_by"] == "agent:Agent 3"


def test_agent3_org_system_agent_refuses_research_outreach(engine: Engine) -> None:
    agent = Agent3()  # default org-system
    with pytest.raises(ValueError, match="explicit tenant org"):
        agent.submit_research_outreach("lead-1", engine=engine)
    with pytest.raises(ValueError, match="explicit tenant org"):
        agent.schedule_outreach_followup("lead-1", "no_reply", due_ts=DUE, engine=engine)


def test_agent3_schedules_outreach_followups(engine: Engine) -> None:
    _full_buyer(engine)
    agent = Agent3(organization_id=ORG)
    row = agent.schedule_outreach_followup("lead-1", "no_reply", due_ts=DUE, engine=engine)
    assert row.followup_type == "run_session"
    assert json.loads(row.payload)["milestone"] == "no_reply"


def test_qual_pass_records_the_scorecard_and_cites_it(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    """END-TO-END §12.4: buyer replies → Q1–Q5 → QUALIFIED, and the
    transition notes + LEAD_QUALIFIED event cite the research scorecard
    evidence row."""
    from sqlalchemy import text

    import coffee_export.database.models  # noqa: F401 — registers tables
    from coffee_export.database.base import Base
    from coffee_export.events import event_bus as event_bus_module
    from coffee_export.state import state_manager as state_manager_module

    Base.metadata.create_all(engine)  # the full CRM schema on the test DB
    test_session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(state_manager_module, "SessionLocal", test_session_factory)
    monkeypatch.setattr(event_bus_module, "SessionLocal", test_session_factory)

    with Agent3(organization_id=ORG) as agent:
        agent.sm.session.execute(
            Lead.__table__.insert().values(
                lead_id="lead-qual",
                company_name="Qualify Me GmbH",
                headquarters_country="Germany",
                organization_id=ORG,
                current_state="IN_SEQUENCE",
                current_agent="Agent 3",
                outreach_language="EN",
                created_ts=TS,
                updated_ts=TS,
            )
        )
        agent.sm.session.commit()

        result = None
        for answer in (
            "Q1: yes, we buy 5 FCL/year",
            "Q2: yes, we are an importer buying 25 bags per lot",
            "Q3: yes, I am the head of coffee",
            "Q4: yes, we are sourcing for the next crop cycle",
            "Q5: yes, we agree to pay shipping on samples",
        ):
            result = agent.record_buyer_reply(
                "lead-qual",
                "qualification_answer",
                answer,
                research_engine=engine,
            )

    assert result["action"] == "qualified"
    evidence_id = result["research_scorecard_evidence_id"]
    assert evidence_id, "the QUALIFIED transition must cite the research"

    # the evidence row really exists and is the §12.4 scorecard
    ledger = EvidenceLedger(ORG, engine)
    row = ledger.get_evidence(evidence_id)
    assert row.fact_key == SCORECARD_FACT_KEY
    assert row.subject_id == "lead-qual"
    assert row.source_type == "llm_inference"

    # the transition notes cite it
    with engine.connect() as conn:
        notes_row = conn.execute(
            text(
                "SELECT notes FROM lead_state_history WHERE lead_id = 'lead-qual' "
                "AND to_state = 'QUALIFIED' ORDER BY id DESC LIMIT 1"
            )
        ).scalar_one_or_none()
    assert notes_row is not None
    assert evidence_id in notes_row

    # the LEAD_QUALIFIED event carries it too
    with engine.connect() as conn:
        event_payload = conn.execute(
            text(
                "SELECT payload FROM events WHERE event_type = 'LEAD_QUALIFIED' "
                "ORDER BY id DESC LIMIT 1"
            )
        ).scalar_one_or_none()
    assert event_payload is not None
    assert json.loads(event_payload)["research_scorecard_evidence_id"] == evidence_id


def test_qual_pass_without_research_engine_skips_the_citation_honestly(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No engine wired → the transition still happens, nothing is
    recorded, nothing is cited (research is never a hard dependency of
    the commercial gate)."""
    import coffee_export.database.models  # noqa: F401 — registers tables
    from coffee_export.database.base import Base
    from coffee_export.events import event_bus as event_bus_module
    from coffee_export.state import state_manager as state_manager_module

    Base.metadata.create_all(engine)
    test_session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(state_manager_module, "SessionLocal", test_session_factory)
    monkeypatch.setattr(event_bus_module, "SessionLocal", test_session_factory)

    with Agent3(organization_id=ORG) as agent:
        agent.sm.session.execute(
            Lead.__table__.insert().values(
                lead_id="lead-plain",
                company_name="Plain Qual GmbH",
                organization_id=ORG,
                current_state="IN_SEQUENCE",
                current_agent="Agent 3",
                created_ts=TS,
                updated_ts=TS,
            )
        )
        agent.sm.session.commit()
        result = None
        for answer in (
            "Q1: yes, we buy 5 FCL/year",
            "Q2: yes, we are an importer buying 25 bags per lot",
            "Q3: yes, I am the head of coffee",
            "Q4: yes, we are sourcing for the next crop cycle",
            "Q5: yes, we agree to pay shipping on samples",
        ):
            result = agent.record_buyer_reply("lead-plain", "qualification_answer", answer)

    assert result["action"] == "qualified"
    assert result["research_scorecard_evidence_id"] is None
    ledger = EvidenceLedger(ORG, engine)
    assert ledger.list_evidence("lead", "lead-plain", SCORECARD_FACT_KEY) == []
