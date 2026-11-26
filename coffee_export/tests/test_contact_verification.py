"""
Contact-channel verification gate — TryComp Phase 4 (§12.3).

Proves, on disposable per-test databases:

  * the §12.3 rule — a contact channel is usable ONLY when backed by
    admissible Evidence-Ledger rows: non-suppressed, non-outdated,
    non-disputed, source_type != llm_inference, value matching
  * llm_inference NEVER verifies: an AI-only channel is refused with
    'ai_inference_is_not_verification' — no invented emails pass
  * zero evidence → 'no_evidence' refusal
  * formatting never decides the gate: emails compare case-insensitively,
    phones compare digits-only (+/spaces/dashes/parens stripped)
  * honest evidence levels in the reason: observed_evidence (single
    real source — usable through THIS gate; the human approval queue
    of §4.5 still applies downstream), corroborated, human_verified
  * lifecycle honesty: suppressed rows stop supporting the channel;
    outdated rows are inert; a disputed channel is refused
  * org isolation: another tenant's evidence is indistinguishable
    from no evidence (no existence oracle)
  * structural validation: unknown channel kinds, malformed emails,
    digit-less phones are rejected as invalid input
  * the verify_contact research tool: same semantics through the
    registry, org-scoped via ToolContext
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
)
from coffee_export.research import (
    ContactVerificationService,
    EvidenceLedger,
    ToolContext,
    ToolRegistry,
)
from coffee_export.research.tools.contact_verify import VerifyContactTool

ORG = "org-acme"
OTHER_ORG = "org-beta"
EMAIL = "jane.doe@kaffee-import.de"


@pytest.fixture()
def engine(tmp_path: Path) -> Engine:
    eng = create_engine(f"sqlite:///{tmp_path}/contacts.db", future=True)
    ResearchEvidence.__table__.create(eng)
    ResearchFact.__table__.create(eng)
    return eng


def _record(
    engine: Engine,
    org: str,
    subject_id: str,
    fact_key: str,
    value: object,
    source_type: str,
    **kwargs,
) -> ResearchEvidence:
    return EvidenceLedger(org, engine).record(
        "lead", subject_id, fact_key, value, source_type, **kwargs
    )


# ── the core §12.3 rule ───────────────────────────────────────────


def test_website_evidence_makes_channel_usable(engine: Engine) -> None:
    _record(
        engine,
        ORG,
        "lead-1",
        "contact_email",
        EMAIL,
        "website",
        source_url="https://kaffee-import.de/team",
    )
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is True
    assert check.reason == "observed_evidence"
    assert len(check.evidence_ids) == 1


def test_ai_inference_never_verifies(engine: Engine) -> None:
    _record(engine, ORG, "lead-1", "contact_email", EMAIL, "llm_inference")
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is False
    assert check.reason == "ai_inference_is_not_verification"
    assert check.evidence_ids == []


def test_no_evidence_refuses(engine: Engine) -> None:
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is False
    assert check.reason == "no_evidence"


def test_ai_row_alongside_real_row_does_not_block(engine: Engine) -> None:
    # the AI row proposes the same channel; the real row admits it —
    # honest rows coexist, the gate only needs one admissible
    _record(engine, ORG, "lead-1", "contact_email", EMAIL, "llm_inference")
    _record(
        engine,
        ORG,
        "lead-1",
        "contact_email",
        EMAIL,
        "website",
        source_url="https://kaffee-import.de/team",
    )
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is True
    assert len(check.evidence_ids) == 1  # only the admissible row


# ── evidence levels in the reason ─────────────────────────────────


def test_corroborated_level(engine: Engine) -> None:
    ledger = EvidenceLedger(ORG, engine)
    ledger.record(
        "lead",
        "lead-1",
        "contact_email",
        EMAIL,
        "website",
        source_url="https://kaffee-import.de/team",
    )
    ledger.record(
        "lead",
        "lead-1",
        "contact_email",
        EMAIL,
        "search",
        source_url="https://linkedin.com/company/kaffee-import",
    )
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is True
    assert check.reason == "corroborated"


def test_human_verified_level(engine: Engine) -> None:
    _record(engine, ORG, "lead-1", "contact_email", EMAIL, "human", source_actor="operator:9")
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is True
    assert check.reason == "human_verified"


# ── formatting never decides the gate ─────────────────────────────


def test_email_case_insensitive_match(engine: Engine) -> None:
    _record(
        engine, ORG, "lead-1", "contact_email", EMAIL.upper(), "website", source_url="https://x.de"
    )
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is True


def test_phone_digits_only_match(engine: Engine) -> None:
    _record(
        engine,
        ORG,
        "lead-1",
        "contact_phone",
        "+49 40 123-456",
        "website",
        source_url="https://x.de",
    )
    check = ContactVerificationService(ORG, engine).check_channel(
        "lead", "lead-1", "phone", "(+49) 40123456"
    )
    assert check.usable is True
    assert check.channel_kind == "phone"


# ── lifecycle honesty ─────────────────────────────────────────────


def test_suppressed_row_stops_supporting(engine: Engine) -> None:
    ledger = EvidenceLedger(ORG, engine)
    row = ledger.record(
        "lead",
        "lead-1",
        "contact_email",
        EMAIL,
        "website",
        source_url="https://kaffee-import.de/team",
    )
    ledger.suppress_evidence(row.evidence_id)
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is False
    assert check.reason == "no_evidence"  # suppressed rows are invisible


def test_outdated_row_is_inert(engine: Engine) -> None:
    ledger = EvidenceLedger(ORG, engine)
    row = ledger.record(
        "lead",
        "lead-1",
        "contact_email",
        EMAIL,
        "website",
        source_url="https://kaffee-import.de/team",
    )
    ledger.mark_outdated(row.evidence_id)
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is False
    assert check.reason == "evidence_disputed" or check.reason == "no_evidence"


def test_different_value_does_not_match(engine: Engine) -> None:
    _record(
        engine, ORG, "lead-1", "contact_email", "other@x.de", "website", source_url="https://x.de"
    )
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is False
    assert check.reason == "no_evidence"


# ── org isolation ─────────────────────────────────────────────────


def test_other_orgs_evidence_is_invisible(engine: Engine) -> None:
    _record(
        engine, OTHER_ORG, "lead-1", "contact_email", EMAIL, "website", source_url="https://x.de"
    )
    check = ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", "email", EMAIL)
    assert check.usable is False
    assert check.reason == "no_evidence"  # no existence oracle


# ── structural validation ─────────────────────────────────────────


@pytest.mark.parametrize(
    ("kind", "value"),
    [
        ("fax", "123"),
        ("email", "not-an-email"),
        ("email", "no-at-sign.de"),
        ("phone", "no digits"),
        ("email", ""),
    ],
)
def test_invalid_inputs_raise(engine: Engine, kind: str, value: str) -> None:
    with pytest.raises(ValueError):
        ContactVerificationService(ORG, engine).check_channel("lead", "lead-1", kind, value)


# ── the research tool surface ─────────────────────────────────────


def test_verify_contact_tool_passes_the_gate() -> None:
    # separate engine per test (the tool gets its engine from the context)
    engine = create_engine("sqlite://", future=True)
    ResearchEvidence.__table__.create(engine)
    ResearchFact.__table__.create(engine)
    _record(
        engine,
        ORG,
        "lead-2",
        "contact_email",
        EMAIL,
        "website",
        source_url="https://kaffee-import.de/team",
    )
    registry = ToolRegistry()
    registry.register(VerifyContactTool())
    ctx = ToolContext(organization_id=ORG, session_id="ses-1", engine=engine)
    result, _ = registry.invoke(
        "verify_contact",
        {
            "subject_type": "lead",
            "subject_id": "lead-2",
            "channel_kind": "email",
            "channel_value": EMAIL,
        },
        ctx,
    )
    assert result.status == "ok"
    assert result.output["usable"] is True
    assert result.output["reason"] == "observed_evidence"
    assert len(result.output["evidence_ids"]) == 1


def test_verify_contact_tool_refuses_ai_only() -> None:
    engine = create_engine("sqlite://", future=True)
    ResearchEvidence.__table__.create(engine)
    ResearchFact.__table__.create(engine)
    _record(engine, ORG, "lead-2", "contact_email", EMAIL, "llm_inference")
    registry = ToolRegistry()
    registry.register(VerifyContactTool())
    ctx = ToolContext(organization_id=ORG, session_id="ses-1", engine=engine)
    result, _ = registry.invoke(
        "verify_contact",
        {
            "subject_type": "lead",
            "subject_id": "lead-2",
            "channel_kind": "email",
            "channel_value": EMAIL,
        },
        ctx,
    )
    assert result.status == "ok"
    assert result.output["usable"] is False
    assert result.output["reason"] == "ai_inference_is_not_verification"


def test_verify_contact_tool_rejects_malformed_input() -> None:
    registry = ToolRegistry()
    registry.register(VerifyContactTool())
    ctx = ToolContext(organization_id=ORG, session_id="ses-1", engine=create_engine("sqlite://"))
    result, _ = registry.invoke(
        "verify_contact",
        {
            "subject_type": "lead",
            "subject_id": "lead-2",
            "channel_kind": "email",
            "channel_value": "garbage",
        },
        ctx,
    )
    assert result.status == "error"
    assert "well-formed email" in (result.error_message or "")


def test_verify_contact_tool_requires_engine() -> None:
    registry = ToolRegistry()
    registry.register(VerifyContactTool())
    ctx = ToolContext(organization_id=ORG, session_id="ses-1", engine=None)
    result, _ = registry.invoke(
        "verify_contact",
        {
            "subject_type": "lead",
            "subject_id": "lead-2",
            "channel_kind": "email",
            "channel_value": EMAIL,
        },
        ctx,
    )
    assert result.status == "error"
    assert "database engine" in (result.error_message or "")
