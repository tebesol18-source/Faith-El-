"""
Persistent Facts — current-state layer + the shared recompute engine.

FactStore is the read/verify surface for research_facts. The authoritative
current value of a fact is NEVER written directly: it is recomputed
deterministically from the live evidence set (non-suppressed, non-outdated
rows) by :func:`recompute_fact`, which both services share — one code
path, one transaction per operation.

Semantics (§13 of docs/trycomp-integration-progress.md, all test-verified):

  * corroboration requires ≥2 INDEPENDENT sources — the same source twice
    never corroborates; llm_inference NEVER corroborates anything;
  * conflicts are RETAINED: first observation wins the display form,
    every conflicting row is kept as disputed, the fact is flagged
    conflicting — nothing is deleted or silently resolved;
  * human verify/correct → status 'human_verified', which IS the lock:
    every AI-driven recompute returns early and can never touch a locked
    fact (contradicting AI observations are recorded as disputed evidence
    rows instead); a NEWER human attestation supersedes an older one and
    the superseded row is retained as disputed;
  * outdated evidence is inert; fresh evidence revalidates the fact;
  * losing corroboration (suppression, outdating) honestly downgrades the
    surviving rows and the fact to observed.
"""

from __future__ import annotations

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.research import ResearchEvidence, ResearchFact
from coffee_export.research.common import (
    INDEPENDENT_SOURCE_TYPES,
    canonical_json,
    new_evidence_id,
    new_fact_id,
    source_identity,
    validate_source,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


def _live_evidence(
    session: Session, organization_id: str, subject_type: str, subject_id: str, fact_key: str
) -> list[ResearchEvidence]:
    """The live evidence set for one fact key, in observation order."""
    return list(
        session.execute(
            select(ResearchEvidence)
            .where(
                ResearchEvidence.organization_id == organization_id,
                ResearchEvidence.subject_type == subject_type,
                ResearchEvidence.subject_id == subject_id,
                ResearchEvidence.fact_key == fact_key,
                ResearchEvidence.suppressed == 0,
                ResearchEvidence.status != "outdated",
            )
            .order_by(ResearchEvidence.created_ts, ResearchEvidence.evidence_id)
        )
        .scalars()
        .all()
    )


def _get_fact(
    session: Session,
    organization_id: str,
    subject_type: str,
    subject_id: str,
    fact_key: str,
) -> ResearchFact | None:
    return session.execute(
        select(ResearchFact).where(
            ResearchFact.organization_id == organization_id,
            ResearchFact.subject_type == subject_type,
            ResearchFact.subject_id == subject_id,
            ResearchFact.fact_key == fact_key,
        )
    ).scalar_one_or_none()


def recompute_fact(
    session: Session,
    organization_id: str,
    subject_type: str,
    subject_id: str,
    fact_key: str,
    *,
    human_action: bool = False,
) -> ResearchFact | None:
    """Deterministically recompute one fact from its live evidence set.

    Called inside the caller's transaction (the caller commits). Callers
    MUST flush any in-place evidence mutations first — sessions are
    autoflush=False, so an unflushed mutation would be invisible to the
    SELECTs here (rebuild incident #1, test-pinned).

    ``human_action=True`` is reserved for the human path (FactStore.verify_fact
    and EvidenceLedger.record with source_type="human"): only it may write a
    human_verified (locked) fact. Every AI-driven trigger uses the default,
    which returns early on a locked fact — the lock is absolute.
    """
    fact = _get_fact(session, organization_id, subject_type, subject_id, fact_key)
    locked = fact is not None and fact.status == "human_verified"

    if locked and not human_action:
        # The lock is absolute: AI recompute can never touch a human-
        # verified fact — not its value, not source_count, not its flags.
        return fact

    rows = _live_evidence(session, organization_id, subject_type, subject_id, fact_key)
    human_rows = [r for r in rows if r.source_type == "human"]

    if human_action and human_rows:
        # Most recent human decision wins; older attestations are retained
        # as disputed (audit trail), agreeing AI rows stay observed.
        latest = max(human_rows, key=lambda r: (r.created_ts, r.evidence_id))
        display = latest.value
        if fact is None:
            fact = _new_fact(organization_id, subject_type, subject_id, fact_key, session)
        fact.value = display
        fact.status = "human_verified"
        fact.conflicting = 0
        fact.verified_by = latest.source_actor
        fact.source_count = sum(1 for r in rows if r.value == display)
        for row in rows:
            if row is latest:
                row.status = "observed"
            elif row.value != display:
                row.status = "disputed"
            else:
                row.status = "observed"
        fact.updated_ts = now_addis_iso()
        return fact

    if fact is None:
        if not rows:
            return None  # nothing to materialize
        fact = _new_fact(organization_id, subject_type, subject_id, fact_key, session)

    if not rows:
        # No live evidence left (everything suppressed/outdated): keep the
        # last value for history, but honestly report zero support.
        fact.source_count = 0
        fact.conflicting = 0
        fact.status = "observed"
        fact.updated_ts = now_addis_iso()
        return fact

    # Group live rows by canonical value (insertion order preserved).
    groups: dict[str, list[ResearchEvidence]] = {}
    for row in rows:
        groups.setdefault(row.value, []).append(row)

    if len(groups) == 1:
        display, supporting = next(iter(groups.items()))
        fact.value = display
        fact.conflicting = 0
        identities = {
            source_identity(row.source_type, row.source_url)
            for row in supporting
            if row.source_type in INDEPENDENT_SOURCE_TYPES
        }
        if len(identities) >= 2:
            fact.status = "corroborated"
            for row in supporting:
                row.status = "corroborated"
        else:
            fact.status = "observed"
            for row in supporting:
                row.status = "observed"
        fact.source_count = len(supporting)
    else:
        # Conflict RETAINED: first observation wins the display form, all
        # conflicting rows are kept as disputed, the fact is flagged.
        display = rows[0].value
        fact.value = display
        fact.conflicting = 1
        fact.status = "observed"  # contested — corroboration cannot stand
        for row in rows:
            row.status = "disputed"
        fact.source_count = sum(1 for row in rows if row.value == display)

    fact.updated_ts = now_addis_iso()
    return fact


def _new_fact(
    organization_id: str, subject_type: str, subject_id: str, fact_key: str, session: Session
) -> ResearchFact:
    fact = ResearchFact(
        fact_id=new_fact_id(),
        organization_id=organization_id,
        subject_type=subject_type,
        subject_id=subject_id,
        fact_key=fact_key,
        value="",  # filled by the caller before commit
        status="observed",
        conflicting=0,
        source_count=0,
        created_ts=now_addis_iso(),
        updated_ts=now_addis_iso(),
    )
    session.add(fact)
    return fact


class _OrgScopedService:
    """Shared plumbing for the research services.

    ``organization_id`` is REQUIRED and non-empty — no silent org-system
    fallback exists anywhere in this package (incident history: two
    tenant-misattribution bugs). An injectable ``engine`` keeps tests and
    future durable-queue handlers off the application engine; omitted, the
    application engine (database.base) is used. One commit per public
    operation (StateManager style).
    """

    def __init__(self, organization_id: str, engine: Engine | None = None) -> None:
        if not organization_id or not organization_id.strip():
            raise ValueError(
                "organization_id is required for research services "
                "(no silent org-system fallback)"
            )
        self.organization_id = organization_id
        if engine is None:
            from coffee_export.database.base import engine as app_engine

            engine = app_engine
        self._session_factory = sessionmaker(
            bind=engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )


class FactStore(_OrgScopedService):
    """Read + human-verify surface for the Persistent Facts layer."""

    def get_fact(self, subject_type: str, subject_id: str, fact_key: str) -> ResearchFact | None:
        """The fact for THIS org, or None. Missing and other-tenant are
        deliberately indistinguishable (no existence oracle)."""
        with self._session_factory() as session:
            return _get_fact(session, self.organization_id, subject_type, subject_id, fact_key)

    def list_facts(
        self, subject_type: str | None = None, subject_id: str | None = None
    ) -> list[ResearchFact]:
        """All facts for THIS org, optionally narrowed to a subject."""
        with self._session_factory() as session:
            stmt = select(ResearchFact).where(ResearchFact.organization_id == self.organization_id)
            if subject_type is not None:
                stmt = stmt.where(ResearchFact.subject_type == subject_type)
            if subject_id is not None:
                stmt = stmt.where(ResearchFact.subject_id == subject_id)
            return list(
                session.execute(
                    stmt.order_by(
                        ResearchFact.subject_type,
                        ResearchFact.subject_id,
                        ResearchFact.fact_key,
                    )
                )
                .scalars()
                .all()
            )

    def verify_fact(
        self,
        subject_type: str,
        subject_id: str,
        fact_key: str,
        value: object,
        actor: str,
        *,
        created_ts: str | None = None,
    ) -> ResearchFact:
        """Human verification / correction — the ONLY writer of locked facts.

        Records a human evidence row (the audit trail: every verification
        leaves a retained row; superseded attestations stay as disputed)
        and recomputes with human_action=True. A correction is simply a
        verification whose value differs — the newest human decision wins.
        """
        if not subject_type or not subject_id or not fact_key:
            raise ValueError("subject_type, subject_id and fact_key are required")
        validate_source("human", None, actor)
        canonical = canonical_json(value)
        with self._session_factory() as session:
            session.add(
                ResearchEvidence(
                    evidence_id=new_evidence_id(),
                    organization_id=self.organization_id,
                    subject_type=subject_type,
                    subject_id=subject_id,
                    fact_key=fact_key,
                    value=canonical,
                    source_type="human",
                    source_url=None,
                    source_actor=actor,
                    status="observed",
                    suppressed=0,
                    created_ts=created_ts or now_addis_iso(),
                    expires_ts=None,
                )
            )
            session.flush()
            fact = recompute_fact(
                session,
                self.organization_id,
                subject_type,
                subject_id,
                fact_key,
                human_action=True,
            )
            session.commit()
            assert fact is not None  # a human row was just inserted
            log.debug(
                "fact verified by %s: %s/%s/%s",
                actor,
                subject_type,
                subject_id,
                fact_key,
            )
            return fact
