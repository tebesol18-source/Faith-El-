"""
Buyer qualification & inventory matching — TryComp Phase 5.

Proves, on disposable per-test databases:

  * requirement extraction — facts → structured requirements with
    status + source count; missing facts are honest misses; disputed/
    outdated facts are NOT extracted (never silently used)
  * qualification scoring — explainable weighted dimensions; all-
    satisfied buyer scores full; no evidence → 0 with an honest
    missing_information list; evidenced negatives are 'unsatisfied'
    (honest zero, not hidden); the contact dimension is the §12.3 gate
    (llm_inference evidence never satisfies it); threshold injectable;
    org isolation (other org's facts invisible)
  * inventory matching — criterion-by-criterion pass/fail/missing_info
    with explanations; ranking by matched criteria; unknown buyer
    requirements are missing_info on EVERY lot (never a pass) and
    surfaced; ungraded lots honestly missing_info; inactive/deleted/
    empty/other-org lots never matched
  * the research tools — qualify_buyer and match_inventory through the
    registry (org-scoped via ToolContext, engine required); LLM plans
    may reference them (planner validation)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.database.models.inventory import Lot
from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
)
from coffee_export.research import (
    EvidenceLedger,
    QualificationService,
    ToolContext,
    ToolRegistry,
)
from coffee_export.research.tools.qualification import (
    MatchInventoryTool,
    QualifyBuyerTool,
)

ORG = "org-acme"
OTHER_ORG = "org-beta"


@pytest.fixture()
def engine(tmp_path: Path) -> Engine:
    eng = create_engine(f"sqlite:///{tmp_path}/qual.db", future=True)
    ResearchEvidence.__table__.create(eng)
    ResearchFact.__table__.create(eng)
    Lot.__table__.create(eng)
    return eng


def _fact(
    engine: Engine, org: str, subject: str, key: str, value: object, source: str = "website", **kw
) -> None:
    EvidenceLedger(org, engine).record("lead", subject, key, value, source, **kw)


def _lot(engine: Engine, lot_id: str, **overrides) -> None:
    row = {
        "lot_id": lot_id,
        "station_id": "station-1",
        "organization_id": ORG,
        "coop_id": "coop-1",
        "region": "Yirgacheffe",
        "process": "Washed",
        "crop_year": "2025/26",
        "stock_bags_remaining": 500,
        "bag_size_kg": 60,
        "cupping_score": 86.5,
        "certifications": "organic, fairtrade",
        "status": "active",
        "last_updated_ts": "2026-01-01T00:00:00+03:00",
        "created_ts": "2026-01-01T00:00:00+03:00",
        "updated_ts": "2026-01-01T00:00:00+03:00",
    }
    row.update(overrides)
    with engine.begin() as conn:
        conn.execute(Lot.__table__.insert().values(**row))


def _full_buyer(engine: Engine) -> None:
    _fact(
        engine,
        ORG,
        "lead-1",
        "annual_volume_mt",
        240,
        source="website",
        source_url="https://buyer.de/profile",
    )
    _fact(
        engine,
        ORG,
        "lead-1",
        "purchase_volume_mt",
        20,
        source="website",
        source_url="https://buyer.de/profile",
    )
    _fact(
        engine,
        ORG,
        "lead-1",
        "sector",
        "importer",
        source="website",
        source_url="https://buyer.de/profile",
    )
    _fact(
        engine,
        ORG,
        "lead-1",
        "certifications",
        "organic",
        source="website",
        source_url="https://buyer.de/profile",
    )
    _fact(
        engine,
        ORG,
        "lead-1",
        "min_cupping_score",
        85,
        source="website",
        source_url="https://buyer.de/profile",
    )
    _fact(
        engine,
        ORG,
        "lead-1",
        "preferred_process",
        "washed",
        source="website",
        source_url="https://buyer.de/profile",
    )
    _fact(
        engine,
        ORG,
        "lead-1",
        "contact_email",
        "buyer@buyer.de",
        source="website",
        source_url="https://buyer.de/contact",
    )


# ── requirement extraction ────────────────────────────────────────


def test_requirements_extracted_from_facts(engine: Engine) -> None:
    _full_buyer(engine)
    reqs = {
        r.key: r for r in QualificationService(ORG, engine).extract_requirements("lead", "lead-1")
    }
    assert reqs["annual_volume_mt"].extracted is True
    assert reqs["annual_volume_mt"].value == 240
    assert reqs["sector"].value == "importer"
    assert reqs["certifications"].value == "organic"
    assert reqs["min_cupping_score"].value == 85
    assert reqs["preferred_process"].value == "washed"
    assert reqs["annual_volume_mt"].source_count == 1


def test_missing_facts_are_honest_misses(engine: Engine) -> None:
    reqs = {
        r.key: r for r in QualificationService(ORG, engine).extract_requirements("lead", "lead-9")
    }
    assert all(r.extracted is False for r in reqs.values())
    assert all(r.value is None for r in reqs.values())


def test_disputed_and_outdated_facts_not_extracted(engine: Engine) -> None:
    ledger = EvidenceLedger(ORG, engine)
    row = ledger.record(
        "lead", "lead-1", "annual_volume_mt", 100, "website", source_url="https://x.de"
    )
    ledger.mark_outdated(row.evidence_id)
    reqs = {
        r.key: r for r in QualificationService(ORG, engine).extract_requirements("lead", "lead-1")
    }
    assert reqs["annual_volume_mt"].extracted is False  # honest miss


# ── qualification scoring ─────────────────────────────────────────


def test_full_evidence_full_score(engine: Engine) -> None:
    _full_buyer(engine)
    card = QualificationService(ORG, engine).score_lead("lead", "lead-1")
    assert card["score"] == card["max_score"] == 100
    dims = {d["key"]: d for d in card["dimensions"]}
    assert dims["volume"]["outcome"] == "satisfied"
    assert dims["volume"]["fact_status"] == "observed"
    assert dims["segment"]["outcome"] == "satisfied"
    assert dims["contact_channel"]["outcome"] == "satisfied"
    assert card["missing_information"] == []


def test_no_evidence_scores_zero_with_missing_list(engine: Engine) -> None:
    card = QualificationService(ORG, engine).score_lead("lead", "lead-9")
    assert card["score"] == 0
    assert card["max_score"] == 100
    assert set(card["missing_information"]) == {"annual_volume_mt", "sector", "contact_email"}
    assert all(d["outcome"] == "not_evidenced" for d in card["dimensions"])


def test_evidenced_negative_is_unsatisfied_not_hidden(engine: Engine) -> None:
    _fact(
        engine,
        ORG,
        "lead-1",
        "annual_volume_mt",
        5,
        source="website",
        source_url="https://buyer.de",
    )  # far below 19.2 MT
    card = QualificationService(ORG, engine).score_lead("lead", "lead-1")
    dims = {d["key"]: d for d in card["dimensions"]}
    assert dims["volume"]["outcome"] == "unsatisfied"
    assert "annual_volume_mt" not in card["missing_information"]  # evidenced
    assert card["score"] < 100


def test_non_buying_sector_is_unsatisfied(engine: Engine) -> None:
    _fact(
        engine,
        ORG,
        "lead-1",
        "sector",
        "retailer_cafe",
        source="website",
        source_url="https://buyer.de",
    )
    card = QualificationService(ORG, engine).score_lead("lead", "lead-1")
    dims = {d["key"]: d for d in card["dimensions"]}
    assert dims["segment"]["outcome"] == "unsatisfied"


def test_llm_inference_email_never_satisfies_contact(engine: Engine) -> None:
    _fact(engine, ORG, "lead-1", "contact_email", "buyer@buyer.de", source="llm_inference")
    card = QualificationService(ORG, engine).score_lead("lead", "lead-1")
    dims = {d["key"]: d for d in card["dimensions"]}
    assert dims["contact_channel"]["outcome"] == "not_evidenced"
    assert "contact_email" in card["missing_information"]


def test_min_volume_threshold_injectable(engine: Engine) -> None:
    _fact(
        engine,
        ORG,
        "lead-1",
        "annual_volume_mt",
        50,
        source="website",
        source_url="https://buyer.de",
    )
    strict = QualificationService(ORG, engine).score_lead("lead", "lead-1", min_volume_mt=100)
    lenient = QualificationService(ORG, engine).score_lead("lead", "lead-1", min_volume_mt=25)
    d_strict = {d["key"]: d for d in strict["dimensions"]}["volume"]
    d_lenient = {d["key"]: d for d in lenient["dimensions"]}["volume"]
    assert d_strict["outcome"] == "unsatisfied"
    assert d_lenient["outcome"] == "satisfied"


def test_org_isolation(engine: Engine) -> None:
    _full_buyer(engine)  # but under ORG
    card = QualificationService(OTHER_ORG, engine).score_lead("lead", "lead-1")
    assert card["score"] == 0
    assert card["missing_information"]  # other org sees nothing


# ── inventory matching ────────────────────────────────────────────


def test_full_match_ranks_first(engine: Engine) -> None:
    _full_buyer(engine)
    _lot(engine, "lot-good")
    _lot(engine, "lot-weak", cupping_score=80.0)  # below floor
    result = QualificationService(ORG, engine).match_inventory("lead", "lead-1")
    assert result["match_count"] == 2
    best = result["matches"][0]
    assert best["lot_id"] == "lot-good"
    assert best["matched_criteria"] == 4
    by_name = {c["criterion"]: c for c in best["criteria"]}
    assert by_name["volume"]["outcome"] == "pass"
    assert "30.0 MT" in by_name["volume"]["detail"]
    assert by_name["certifications"]["outcome"] == "pass"
    assert by_name["cupping"]["outcome"] == "pass"
    assert by_name["process"]["outcome"] == "pass"
    weak = result["matches"][1]
    assert weak["matched_criteria"] == 3
    assert {c["criterion"]: c for c in weak["criteria"]}["cupping"]["outcome"] == "fail"


def test_unknown_requirements_are_missing_info_not_pass(engine: Engine) -> None:
    _lot(engine, "lot-1")
    result = QualificationService(ORG, engine).match_inventory("lead", "lead-9")
    match = result["matches"][0]
    outcomes = {c["criterion"]: c["outcome"] for c in match["criteria"]}
    assert outcomes == {
        "volume": "missing_info",
        "certifications": "missing_info",
        "cupping": "missing_info",
        "process": "missing_info",
    }
    assert set(result["missing_information"]) == {
        "annual_volume_mt",
        "purchase_volume_mt",
        "sector",
        "certifications",
        "min_cupping_score",
        "preferred_process",
    }


def test_ungraded_lot_is_missing_info(engine: Engine) -> None:
    _fact(
        engine, ORG, "lead-1", "min_cupping_score", 85, source="website", source_url="https://x.de"
    )
    _lot(engine, "lot-ungraded", cupping_score=None)
    result = QualificationService(ORG, engine).match_inventory("lead", "lead-1")
    cupping = {c["criterion"]: c for c in result["matches"][0]["criteria"]}["cupping"]
    assert cupping["outcome"] == "missing_info"
    assert "not graded" in cupping["detail"]


def test_certification_failure_explains_what_is_missing(engine: Engine) -> None:
    _fact(
        engine,
        ORG,
        "lead-1",
        "certifications",
        "organic, rainforest",
        source="website",
        source_url="https://x.de",
    )
    _lot(engine, "lot-1", certifications="organic")
    result = QualificationService(ORG, engine).match_inventory("lead", "lead-1")
    cert = {c["criterion"]: c for c in result["matches"][0]["criteria"]}["certifications"]
    assert cert["outcome"] == "fail"
    assert "rainforest" in cert["detail"]


def test_process_list_preference_matches(engine: Engine) -> None:
    _fact(
        engine,
        ORG,
        "lead-1",
        "preferred_process",
        "washed, honey",
        source="website",
        source_url="https://x.de",
    )
    _lot(engine, "lot-honey", process="Honey")
    result = QualificationService(ORG, engine).match_inventory("lead", "lead-1")
    proc = {c["criterion"]: c for c in result["matches"][0]["criteria"]}["process"]
    assert proc["outcome"] == "pass"


def test_only_active_stocked_org_lots_are_matched(engine: Engine) -> None:
    _full_buyer(engine)
    _lot(engine, "lot-ok")
    _lot(engine, "lot-inactive", status="depleted")
    _lot(engine, "lot-empty", stock_bags_remaining=0)
    _lot(engine, "lot-deleted", deleted_ts="2026-01-02T00:00:00+03:00")
    _lot(engine, "lot-other-org", organization_id=OTHER_ORG)
    result = QualificationService(ORG, engine).match_inventory("lead", "lead-1")
    assert [m["lot_id"] for m in result["matches"]] == ["lot-ok"]
    # the other org sees its own lot only
    other = QualificationService(OTHER_ORG, engine).match_inventory("lead", "lead-1")
    assert [m["lot_id"] for m in other["matches"]] == ["lot-other-org"]


def test_volume_fail_when_stock_insufficient(engine: Engine) -> None:
    _fact(
        engine,
        ORG,
        "lead-1",
        "purchase_volume_mt",
        2400,
        source="website",
        source_url="https://x.de",
    )  # needs 2400 MT, lot has 30 MT
    _lot(engine, "lot-1")
    result = QualificationService(ORG, engine).match_inventory("lead", "lead-1")
    vol = {c["criterion"]: c for c in result["matches"][0]["criteria"]}["volume"]
    assert vol["outcome"] == "fail"


# ── research tools + planner integration ─────────────────────────


def _ctx(engine: Engine) -> ToolContext:
    return ToolContext(organization_id=ORG, session_id="ses-1", engine=engine)


def test_qualify_buyer_tool() -> None:
    engine = create_engine("sqlite://", future=True)
    ResearchEvidence.__table__.create(engine)
    ResearchFact.__table__.create(engine)
    _full_buyer(engine)
    registry = ToolRegistry()
    registry.register(QualifyBuyerTool())
    result, _ = registry.invoke(
        "qualify_buyer", {"subject_type": "lead", "subject_id": "lead-1"}, _ctx(engine)
    )
    assert result.status == "ok"
    assert result.output["score"] == 100
    assert len(result.output["dimensions"]) == 3


def test_match_inventory_tool() -> None:
    engine = create_engine("sqlite://", future=True)
    ResearchEvidence.__table__.create(engine)
    ResearchFact.__table__.create(engine)
    Lot.__table__.create(engine)
    _full_buyer(engine)
    _lot(engine, "lot-1")
    registry = ToolRegistry()
    registry.register(MatchInventoryTool())
    result, _ = registry.invoke(
        "match_inventory",
        {"subject_type": "lead", "subject_id": "lead-1"},
        _ctx(engine),
    )
    assert result.status == "ok"
    assert result.output["match_count"] == 1
    assert result.output["matches"][0]["matched_criteria"] == 4


def test_qualification_tools_require_engine() -> None:
    registry = ToolRegistry()
    registry.register(QualifyBuyerTool())
    result, _ = registry.invoke(
        "qualify_buyer",
        {"subject_type": "lead", "subject_id": "lead-1"},
        ToolContext(organization_id=ORG, session_id="s", engine=None),
    )
    assert result.status == "error"
    assert "database engine" in (result.error_message or "")


def test_llm_plan_may_use_qualification_tools() -> None:
    from coffee_export.ai.providers.base import AIResponse
    from coffee_export.research.planning import plan_objective_ai

    plan = json.dumps(
        [
            {
                "tool": "qualify_buyer",
                "input": {"subject_type": "lead", "subject_id": "lead-1"},
                "description": "Score the buyer.",
            },
            {
                "tool": "match_inventory",
                "input": {"subject_type": "lead", "subject_id": "lead-1"},
                "description": "Match against inventory.",
            },
            {"tool": None, "description": "Summarize."},
        ]
    )

    class _Gateway:
        def chat(self, prompt: str, **kwargs) -> AIResponse:
            return AIResponse(text=plan, provider="glm", model="glm-4.7")

    outcome = plan_objective_ai("objective", _Gateway())
    assert outcome.source == "llm"
    assert outcome.steps[0]["phase"] == "qualify"
    assert outcome.steps[1]["phase"] == "match"
