"""
Research foundation service tests — TryComp Phase 1 (evidence + facts).

Proves the §13 semantics on disposable per-test databases (tmp_path,
never the committed operational DB):

  * tenant isolation — explicit org on every query; cross-tenant reads
    are indistinguishable from missing (no existence oracle); by-ID
    cross-tenant actions raise ResearchNotFoundError; each org gets its
    own scoped fact for the same subject key
  * corroboration honesty — ≥2 INDEPENDENT sources required; the same
    source (URL) twice never corroborates, even across source_types;
    llm_inference NEVER corroborates anything
  * conflict retention — first observation wins the display form, every
    conflicting row is kept as disputed, the fact is flagged conflicting;
    nothing is deleted or silently resolved; suppression resolves a
    conflict honestly (and losing corroboration downgrades survivors)
  * suppression — reversible, org-scoped, rows preserved
  * staleness — mark_outdated makes a row inert; fresh evidence
    revalidates the fact
  * human-verified locking — verify_fact and human record() lock the
    fact immediately; AI recompute can never touch a locked fact
    (contradicting AND agreeing rows tested); a newer human attestation
    supersedes an older one, which is retained as disputed (audit trail)
  * source honesty — website/search/api rows require an http(s) URL,
    human rows require the actor; canonical JSON makes key order
    irrelevant while keeping types distinct
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.database.models.research import ResearchEvidence, ResearchFact
from coffee_export.research import (
    EvidenceLedger,
    FactStore,
    ResearchNotFoundError,
    canonical_json,
)

# Deterministic observation order (ISO+03:00, lexicographically sortable).
T1 = "2026-01-01T00:00:00+03:00"
T2 = "2026-01-02T00:00:00+03:00"
T3 = "2026-01-03T00:00:00+03:00"
T4 = "2026-01-04T00:00:00+03:00"

URL1 = "https://example.com/buyer-profile"
URL2 = "https://registry.example.org/companies/42"
URL3 = "https://news.example.net/coffee-imports"

SUBJECT = ("lead", "lead-1001")
KEY = "annual_volume_mt"


class Env:
    """One disposable DB + the org-scoped services bound to it."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self.acme = EvidenceLedger("org-acme", engine)
        self.beta = EvidenceLedger("org-beta", engine)
        self.acme_facts = FactStore("org-acme", engine)
        self.beta_facts = FactStore("org-beta", engine)


@pytest.fixture()
def env(tmp_path: Path) -> Env:
    engine = create_engine(f"sqlite:///{tmp_path}/research.db", future=True)
    ResearchEvidence.__table__.create(engine)
    ResearchFact.__table__.create(engine)
    return Env(engine)


def _website(ledger: EvidenceLedger, value, url: str, ts: str, key: str = KEY):
    return ledger.record(*SUBJECT, key, value, "website", source_url=url, created_ts=ts)


def _fact(env: Env):
    return env.acme_facts.get_fact(*SUBJECT, KEY)


def _rows(env: Env):
    return env.acme.list_evidence(*SUBJECT, KEY)


# ── record & corroboration ───────────────────────────────────────


def test_record_materializes_observed_fact(env: Env) -> None:
    row = _website(env.acme, 1200, URL1, T1)
    fact = _fact(env)
    assert fact is not None
    assert fact.value == canonical_json(1200)
    assert fact.status == "observed"
    assert fact.conflicting == 0
    assert fact.source_count == 1
    assert fact.verified_by is None
    assert row.status == "observed"
    assert row.suppressed == 0
    assert row.organization_id == "org-acme"
    assert len(_rows(env)) == 1


def test_two_independent_sources_corroborate(env: Env) -> None:
    _website(env.acme, 1200, URL1, T1)
    env.acme.record(*SUBJECT, KEY, 1200, "search", source_url=URL2, created_ts=T2)
    fact = _fact(env)
    assert fact is not None
    assert fact.status == "corroborated"
    assert fact.source_count == 2
    assert fact.conflicting == 0
    assert {r.status for r in _rows(env)} == {"corroborated"}


def test_same_source_twice_never_corroborates(env: Env) -> None:
    # the same URL twice — via the same source_type ...
    _website(env.acme, 1200, URL1, T1)
    _website(env.acme, 1200, URL1, T2)
    fact = _fact(env)
    assert fact is not None
    assert fact.status == "observed"  # one source, observed twice
    assert fact.source_count == 2

    # ... and via a different source_type: the URL IS the source document
    env.acme.record(*SUBJECT, KEY, 1200, "search", source_url=URL1, created_ts=T3)
    assert _fact(env).status == "observed"


def test_llm_inference_never_corroborates(env: Env) -> None:
    env.acme.record(*SUBJECT, KEY, 1200, "llm_inference", created_ts=T1)
    _website(env.acme, 1200, URL1, T2)
    fact = _fact(env)
    assert fact is not None
    assert fact.status == "observed"  # llm + one fetched source ≠ corroboration

    _website(env.acme, 1200, URL2, T3)  # a second INDEPENDENT source
    fact = _fact(env)
    assert fact is not None
    assert fact.status == "corroborated"
    assert fact.source_count == 3  # the llm row still counts as an observation


# ── conflict retention & resolution ──────────────────────────────


def test_conflict_retained_first_observation_wins(env: Env) -> None:
    _website(env.acme, 1200, URL1, T1)
    _website(env.acme, 900, URL2, T2)
    fact = _fact(env)
    assert fact is not None
    assert fact.value == canonical_json(1200)  # first observation's form
    assert fact.conflicting == 1
    assert fact.status == "observed"  # contested — corroboration cannot stand
    rows = _rows(env)
    assert len(rows) == 2  # BOTH rows retained
    assert {r.status for r in rows} == {"disputed"}  # both parties disputed


def test_conflict_resolved_by_suppression(env: Env) -> None:
    row_a = _website(env.acme, 1200, URL1, T1)
    row_b = _website(env.acme, 900, URL2, T2)
    assert _fact(env).conflicting == 1

    env.acme.suppress_evidence(row_b.evidence_id)

    fact = _fact(env)
    assert fact is not None
    assert fact.value == canonical_json(1200)
    assert fact.conflicting == 0
    assert fact.status == "observed"
    assert fact.source_count == 1
    refreshed_a = env.acme.get_evidence(row_a.evidence_id)
    assert refreshed_a.status == "observed"  # no longer disputed
    refreshed_b = env.acme.get_evidence(row_b.evidence_id)
    assert refreshed_b.suppressed == 1  # hidden, NOT deleted
    assert refreshed_b.status == "disputed"  # and still retained as disputed


def test_suppressing_one_corroborating_source_downgrades(env: Env) -> None:
    _website(env.acme, 1200, URL1, T1)
    row_b = env.acme.record(*SUBJECT, KEY, 1200, "search", source_url=URL2, created_ts=T2)
    assert _fact(env).status == "corroborated"

    env.acme.suppress_evidence(row_b.evidence_id)

    fact = _fact(env)
    assert fact is not None
    assert fact.status == "observed"  # honestly downgraded
    assert fact.source_count == 1
    # the SURVIVING row is consistent with the fact (rebuild incident #2)
    surviving = [r for r in _rows(env) if r.evidence_id != row_b.evidence_id]
    assert [r.status for r in surviving] == ["observed"]


def test_unsuppress_restores_corroboration(env: Env) -> None:
    _website(env.acme, 1200, URL1, T1)
    row_b = env.acme.record(*SUBJECT, KEY, 1200, "search", source_url=URL2, created_ts=T2)
    env.acme.suppress_evidence(row_b.evidence_id)
    assert _fact(env).status == "observed"

    env.acme.unsuppress_evidence(row_b.evidence_id)

    fact = _fact(env)
    assert fact is not None
    assert fact.status == "corroborated"  # reversible — nothing was lost
    assert fact.source_count == 2
    assert {r.status for r in _rows(env)} == {"corroborated"}


# ── staleness ────────────────────────────────────────────────────


def test_mark_outdated_makes_evidence_inert(env: Env) -> None:
    row = _website(env.acme, 1200, URL1, T1)
    env.acme.mark_outdated(row.evidence_id)

    fact = _fact(env)
    assert fact is not None
    assert fact.source_count == 0  # no live support left
    assert fact.status == "observed"
    assert fact.value == canonical_json(1200)  # last value retained for history
    assert fact.conflicting == 0
    assert env.acme.get_evidence(row.evidence_id).status == "outdated"


def test_fresh_evidence_revalidates_outdated_fact(env: Env) -> None:
    stale = _website(env.acme, 1200, URL1, T1)
    env.acme.mark_outdated(stale.evidence_id)

    _website(env.acme, 900, URL2, T2)  # fresh observation

    fact = _fact(env)
    assert fact is not None
    assert fact.value == canonical_json(900)  # the stale row did not vote
    assert fact.source_count == 1
    assert fact.status == "observed"
    assert fact.conflicting == 0
    statuses = {r.evidence_id: r.status for r in _rows(env)}
    assert statuses[stale.evidence_id] == "outdated"  # still inert, retained


# ── human-verified locking ───────────────────────────────────────


def test_verify_fact_locks(env: Env) -> None:
    _website(env.acme, 1200, URL1, T1)
    fact = env.acme_facts.verify_fact(*SUBJECT, KEY, 1200, "Abebe Kebede")

    assert fact.status == "human_verified"
    assert fact.verified_by == "Abebe Kebede"
    assert fact.value == canonical_json(1200)
    assert fact.conflicting == 0
    human_rows = [r for r in _rows(env) if r.source_type == "human"]
    assert len(human_rows) == 1  # the verification is on the ledger
    assert human_rows[0].source_actor == "Abebe Kebede"


def test_locked_fact_immune_to_contradicting_ai_row(env: Env) -> None:
    env.acme_facts.verify_fact(*SUBJECT, KEY, 1200, "Abebe Kebede")
    before = _fact(env)

    row = _website(env.acme, 900, URL1, T2)  # contradicts the human value

    after = _fact(env)
    assert after.value == before.value  # fact untouched
    assert after.status == "human_verified"
    assert after.source_count == before.source_count  # frozen
    assert row.status == "disputed"  # the contradiction is kept, as disputed
    assert len(_rows(env)) == 2  # nothing dropped


def test_locked_fact_immune_to_agreeing_ai_row(env: Env) -> None:
    env.acme_facts.verify_fact(*SUBJECT, KEY, 1200, "Abebe Kebede")
    before = _fact(env)

    _website(env.acme, 1200, URL1, T2)  # agrees with the human value
    _website(env.acme, 1200, URL2, T3)  # twice, even independently

    after = _fact(env)
    assert after.value == before.value
    assert after.status == "human_verified"
    assert after.source_count == before.source_count  # frozen, not bumped
    assert after.updated_ts == before.updated_ts  # not even touched


def test_human_correction_audit_trail(env: Env) -> None:
    env.acme_facts.verify_fact(*SUBJECT, KEY, 1200, "Abebe Kebede", created_ts=T1)
    env.acme_facts.verify_fact(*SUBJECT, KEY, 900, "Sara Tesfaye", created_ts=T2)

    fact = _fact(env)
    assert fact is not None
    assert fact.value == canonical_json(900)  # newest human decision wins
    assert fact.status == "human_verified"
    assert fact.verified_by == "Sara Tesfaye"

    rows = _rows(env)
    assert len(rows) == 2  # BOTH attestations retained — the audit trail
    by_actor = {r.source_actor: r for r in rows}
    assert by_actor["Abebe Kebede"].status == "disputed"  # superseded, kept
    assert by_actor["Sara Tesfaye"].status == "observed"


def test_human_record_locks_immediately(env: Env) -> None:
    # start from a retained AI conflict …
    _website(env.acme, 1200, URL1, T1)
    _website(env.acme, 900, URL2, T2)
    assert _fact(env).conflicting == 1

    # … a human attestation locks the fact AND settles the conflict
    env.acme.record(*SUBJECT, KEY, 1200, "human", source_actor="Abebe Kebede", created_ts=T3)

    fact = _fact(env)
    assert fact is not None
    assert fact.status == "human_verified"  # same as verify_fact — no extra step
    assert fact.verified_by == "Abebe Kebede"
    assert fact.value == canonical_json(1200)
    assert fact.conflicting == 0  # the human decision settles the conflict
    statuses = {r.status for r in _rows(env)}
    assert statuses == {"observed", "disputed"}  # 900-rows disputed, retained


# ── tenant isolation ─────────────────────────────────────────────


def test_cross_tenant_reads_indistinguishable(env: Env) -> None:
    _website(env.acme, 1200, URL1, T1)
    assert env.acme_facts.get_fact(*SUBJECT, KEY) is not None

    # org-beta sees NOTHING — missing and other-tenant are indistinguishable
    assert env.beta_facts.get_fact(*SUBJECT, KEY) is None
    assert env.beta.list_evidence(*SUBJECT) == []
    assert env.beta_facts.list_facts() == []


def test_cross_tenant_by_id_actions_raise_not_found(env: Env) -> None:
    row = _website(env.acme, 1200, URL1, T1)
    fact = env.acme_facts.verify_fact(*SUBJECT, KEY, 1200, "Abebe Kebede")

    with pytest.raises(ResearchNotFoundError):
        env.beta.get_evidence(row.evidence_id)
    with pytest.raises(ResearchNotFoundError):
        env.beta.suppress_evidence(row.evidence_id)
    with pytest.raises(ResearchNotFoundError):
        env.beta.unsuppress_evidence(row.evidence_id)
    with pytest.raises(ResearchNotFoundError):
        env.beta.mark_outdated(row.evidence_id)

    # nothing changed for org-acme
    assert env.acme.get_evidence(row.evidence_id).suppressed == 0
    assert env.acme_facts.get_fact(*SUBJECT, KEY).status == "human_verified"
    assert env.acme_facts.get_fact(*SUBJECT, KEY).source_count == fact.source_count


def test_cross_tenant_write_creates_own_scoped_fact(env: Env) -> None:
    _website(env.acme, 1200, URL1, T1)

    env.beta.record(*SUBJECT, KEY, 900, "website", source_url=URL3, created_ts=T2)

    acme_fact = env.acme_facts.get_fact(*SUBJECT, KEY)
    beta_fact = env.beta_facts.get_fact(*SUBJECT, KEY)
    assert acme_fact is not None and acme_fact.value == canonical_json(1200)
    assert beta_fact is not None and beta_fact.value == canonical_json(900)
    assert acme_fact.organization_id == "org-acme"
    assert beta_fact.organization_id == "org-beta"
    assert acme_fact.fact_id != beta_fact.fact_id  # two rows, one per org


def test_constructor_rejects_empty_org(env: Env) -> None:
    with pytest.raises(ValueError):
        EvidenceLedger("", env.engine)
    with pytest.raises(ValueError):
        FactStore("   ", env.engine)
    with pytest.raises(ValueError):
        EvidenceLedger(None, env.engine)  # type: ignore[arg-type]


# ── source honesty & canonical values ────────────────────────────


def test_source_validation_rejected(env: Env) -> None:
    # website/search/api rows must cite an http(s) URL
    with pytest.raises(ValueError, match="http"):
        env.acme.record(*SUBJECT, KEY, 1, "website", created_ts=T1)
    with pytest.raises(ValueError, match="http"):
        env.acme.record(*SUBJECT, KEY, 1, "api", source_url="ftp://x/example", created_ts=T1)
    # human rows must name the actor
    with pytest.raises(ValueError, match="actor"):
        env.acme.record(*SUBJECT, KEY, 1, "human", created_ts=T1)
    # unknown source types are rejected
    with pytest.raises(ValueError, match="source_type"):
        env.acme.record(*SUBJECT, KEY, 1, "rumor", source_url=URL1, created_ts=T1)
    # so are empty subject coordinates
    with pytest.raises(ValueError, match="required"):
        env.acme.record("", "lead-1", KEY, 1, "website", source_url=URL1)
    with pytest.raises(ValueError, match="required"):
        env.acme_facts.verify_fact(*SUBJECT, "", 1, "Abebe")
    # nothing was written by any rejected call
    assert env.acme_facts.list_facts() == []
    assert env.acme.list_evidence(*SUBJECT) == []


def test_canonical_json_key_order_independent(env: Env) -> None:
    env.acme.record(
        *SUBJECT,
        "preferences",
        {"b": 2, "a": 1},
        "website",
        source_url=URL1,
        created_ts=T1,
    )
    env.acme.record(
        *SUBJECT,
        "preferences",
        {"a": 1, "b": 2},
        "search",
        source_url=URL2,
        created_ts=T2,
    )
    fact = env.acme_facts.get_fact(*SUBJECT, "preferences")
    assert fact is not None
    assert fact.value == '{"a":1,"b":2}'  # ONE canonical form
    assert fact.status == "corroborated"  # same value ⇒ two independent sources

    # types stay distinct: 25000 (int) vs "25000" (str) are different values
    env.acme.record(*SUBJECT, "volume", 25000, "website", source_url=URL1, created_ts=T1)
    env.acme.record(*SUBJECT, "volume", "25000", "search", source_url=URL2, created_ts=T2)
    volume = env.acme_facts.get_fact(*SUBJECT, "volume")
    assert volume is not None
    assert volume.conflicting == 1  # honestly a conflict, not silently equal
    assert volume.value == canonical_json(25000)  # first observation's form
