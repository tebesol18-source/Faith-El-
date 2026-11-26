"""
Evidence Ledger — the append-only observation store (research_evidence).

Every observation about a subject lands here exactly as observed, with
honest source attribution: fetched rows (website/search/api) cite the
http(s) URL they came from, human rows name the actor, llm_inference rows
are marked as model output. Rows are NEVER deleted; the only sanctioned
mutations are the status transitions driven by recompute_fact and the two
explicit operator actions:

  * suppression — reversible, org-scoped, excludes a row from recompute
    while preserving it (a bad source is hidden, not erased);
  * mark_outdated — flags a row as explicitly stale (inert in recompute);
    fresh evidence revalidates the fact.

Recording evidence is the AI-facing write path. If the corresponding fact
is human-verified (locked), the row is still recorded — agreeing rows as
observed, contradicting rows as disputed — but the fact itself is never
touched: human corrections are protected (standing security decision §4.3).
"""

from __future__ import annotations

from sqlalchemy import select

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.research import ResearchEvidence
from coffee_export.research.common import (
    ResearchNotFoundError,
    canonical_json,
    new_evidence_id,
    validate_source,
)
from coffee_export.research.facts import _get_fact, _OrgScopedService, recompute_fact
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


class EvidenceLedger(_OrgScopedService):
    """Append-only, org-scoped Evidence Ledger."""

    def record(
        self,
        subject_type: str,
        subject_id: str,
        fact_key: str,
        value: object,
        source_type: str,
        *,
        source_url: str | None = None,
        source_actor: str | None = None,
        expires_ts: str | None = None,
        created_ts: str | None = None,
    ) -> ResearchEvidence:
        """Append one observation and recompute the affected fact.

        For a human source this locks the fact immediately (same path as
        FactStore.verify_fact — the newest human decision wins). For any
        other source the fact is recomputed by the AI path, which never
        touches a locked fact.
        """
        if not subject_type or not subject_id or not fact_key:
            raise ValueError("subject_type, subject_id and fact_key are required")
        validate_source(source_type, source_url, source_actor)
        canonical = canonical_json(value)

        with self._session_factory() as session:
            row = ResearchEvidence(
                evidence_id=new_evidence_id(),
                organization_id=self.organization_id,
                subject_type=subject_type,
                subject_id=subject_id,
                fact_key=fact_key,
                value=canonical,
                source_type=source_type,
                source_url=source_url,
                source_actor=source_actor,
                status="observed",
                suppressed=0,
                created_ts=created_ts or now_addis_iso(),
                expires_ts=expires_ts,
            )
            fact = _get_fact(session, self.organization_id, subject_type, subject_id, fact_key)
            locked = fact is not None and fact.status == "human_verified"

            session.add(row)
            session.flush()

            if locked and source_type != "human":
                # Locked fact: record the row honestly but never recompute.
                # A contradicting AI observation is kept as disputed; an
                # agreeing one is just another observed row.
                if canonical != fact.value:
                    row.status = "disputed"
            else:
                recompute_fact(
                    session,
                    self.organization_id,
                    subject_type,
                    subject_id,
                    fact_key,
                    human_action=(source_type == "human"),
                )
            session.commit()
            log.debug(
                "evidence recorded: %s/%s/%s via %s",
                subject_type,
                subject_id,
                fact_key,
                source_type,
            )
            return row

    def get_evidence(self, evidence_id: str) -> ResearchEvidence:
        """One evidence row for THIS org. Missing and other-tenant raise the
        same ResearchNotFoundError (no existence oracle)."""
        with self._session_factory() as session:
            row = session.execute(
                select(ResearchEvidence).where(
                    ResearchEvidence.evidence_id == evidence_id,
                    ResearchEvidence.organization_id == self.organization_id,
                )
            ).scalar_one_or_none()
            if row is None:
                raise ResearchNotFoundError(f"evidence not found: {evidence_id}")
            return row

    def list_evidence(
        self,
        subject_type: str,
        subject_id: str,
        fact_key: str | None = None,
        *,
        include_suppressed: bool = True,
    ) -> list[ResearchEvidence]:
        """Evidence rows for THIS org + subject, in observation order."""
        with self._session_factory() as session:
            stmt = select(ResearchEvidence).where(
                ResearchEvidence.organization_id == self.organization_id,
                ResearchEvidence.subject_type == subject_type,
                ResearchEvidence.subject_id == subject_id,
            )
            if fact_key is not None:
                stmt = stmt.where(ResearchEvidence.fact_key == fact_key)
            if not include_suppressed:
                stmt = stmt.where(ResearchEvidence.suppressed == 0)
            return list(
                session.execute(
                    stmt.order_by(ResearchEvidence.created_ts, ResearchEvidence.evidence_id)
                )
                .scalars()
                .all()
            )

    # ── operator actions (explicit, auditable, reversible) ──────────

    def suppress_evidence(self, evidence_id: str) -> ResearchEvidence:
        """Hide one row from recompute without erasing it (reversible via
        unsuppress_evidence). The affected fact is honestly recomputed —
        losing corroboration downgrades it, unless it is human-locked."""
        return self._mutate_flag(evidence_id, suppressed=1)

    def unsuppress_evidence(self, evidence_id: str) -> ResearchEvidence:
        """Restore a suppressed row; the fact is recomputed again."""
        return self._mutate_flag(evidence_id, suppressed=0)

    def mark_outdated(self, evidence_id: str) -> ResearchEvidence:
        """Flag a row as explicitly stale (inert in recompute). Fresh
        evidence recorded afterwards revalidates the fact."""
        with self._session_factory() as session:
            row = self._require_row(session, evidence_id)
            row.status = "outdated"
            # autoflush=False: flush BEFORE recompute so the mutation is
            # visible to its SELECTs (rebuild incident #1, test-pinned).
            session.flush()
            recompute_fact(
                session,
                self.organization_id,
                row.subject_type,
                row.subject_id,
                row.fact_key,
            )
            session.commit()
            return row

    def sweep_expired(
        self,
        now_iso: str | None = None,
        *,
        subject_type: str | None = None,
        subject_id: str | None = None,
    ) -> list[str]:
        """Mark live evidence whose expires_ts has passed as outdated.

        The Phase 3 revalidation sweep (closes the §11.5 gap): every live
        (non-suppressed, non-outdated) row of THIS org with
        expires_ts <= now is marked outdated through mark_outdated, so
        each affected fact is honestly recomputed in the same operation.
        Returns the swept evidence_ids in observation order.

        Idempotent by construction: already-outdated rows are not
        re-selected, so a second sweep returns []. Human-locked facts are
        untouched by the recompute (the lock is absolute — outdating the
        underlying human attestation never unlocks the fact, §11.10).
        An optional (subject_type, subject_id) pair narrows the sweep.
        """
        now = now_iso or now_addis_iso()
        with self._session_factory() as session:
            stmt = select(ResearchEvidence.evidence_id).where(
                ResearchEvidence.organization_id == self.organization_id,
                ResearchEvidence.expires_ts.is_not(None),
                ResearchEvidence.expires_ts <= now,
                ResearchEvidence.status.in_(("observed", "corroborated")),
                ResearchEvidence.suppressed == 0,
            )
            if subject_type is not None:
                stmt = stmt.where(ResearchEvidence.subject_type == subject_type)
            if subject_id is not None:
                stmt = stmt.where(ResearchEvidence.subject_id == subject_id)
            ids = [
                row[0]
                for row in session.execute(
                    stmt.order_by(ResearchEvidence.created_ts, ResearchEvidence.evidence_id)
                ).all()
            ]
        for evidence_id in ids:
            self.mark_outdated(evidence_id)  # one commit each (StateManager style)
        if ids:
            log.info(
                "revalidation sweep (org %s): %d evidence rows marked outdated",
                self.organization_id,
                len(ids),
            )
        return ids

    # ── internals ───────────────────────────────────────────────────

    def _require_row(self, session, evidence_id: str) -> ResearchEvidence:
        row = session.execute(
            select(ResearchEvidence).where(
                ResearchEvidence.evidence_id == evidence_id,
                ResearchEvidence.organization_id == self.organization_id,
            )
        ).scalar_one_or_none()
        if row is None:
            raise ResearchNotFoundError(f"evidence not found: {evidence_id}")
        return row

    def _mutate_flag(self, evidence_id: str, *, suppressed: int) -> ResearchEvidence:
        with self._session_factory() as session:
            row = self._require_row(session, evidence_id)
            row.suppressed = suppressed
            # Same flush-before-recompute rule as mark_outdated.
            session.flush()
            recompute_fact(
                session,
                self.organization_id,
                row.subject_type,
                row.subject_id,
                row.fact_key,
            )
            session.commit()
            return row
