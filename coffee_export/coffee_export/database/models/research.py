"""
Research foundation models — Evidence Ledger + Persistent Facts (TryComp Phase 1).

Two org-scoped tables backing the research services in coffee_export/research/
(docs/trycomp-integration-progress.md §3 B/C):

  * research_evidence — the append-only Evidence Ledger. One row per
    immutable observation about a polymorphic subject. Rows are never
    deleted; only sanctioned status transitions (observed →
    corroborated/disputed/outdated) and the reversible `suppressed` flag
    ever mutate a row. Source attribution is honesty-enforced at the DB
    level: website/search/api rows must carry an http(s) URL, human rows
    must carry the actor's name.
  * research_facts — the Persistent Facts current-state layer. One row per
    (organization, subject_type, subject_id, fact_key), deterministically
    recomputed from the live evidence set. human_verified facts are LOCKED:
    no AI-driven recompute may ever touch them (standing security decision
    §4.3).

Conventions shared with every other table: ISO-8601 +03:00 timestamps with
seconds precision (now_addis_iso, lexicographically sortable) and
organization_id NOT NULL with NO default — every call site passes the org
explicitly (LeadSource/LeadVerificationLog pattern; silent org-system
fallbacks caused two tenant-misattribution incidents in this codebase's
history, so new tables make the same mistake impossible at the DB level).

No foreign keys by design: (subject_type, subject_id) is a polymorphic
reference — the referenced row lives in a different table per subject_type,
and neither research table is referenced by anything else (additive,
downgrade-safe).
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from coffee_export.database.base import Base


class ResearchEvidence(Base):
    """One immutable observation — a row in the append-only Evidence Ledger.

    Lifecycle is owned by EvidenceLedger (research/evidence.py). `status`
    is the verification state of THIS row (observed → corroborated when ≥2
    independent sources agree; disputed while a conflict is retained;
    outdated = explicitly stale, inert in recompute). `suppressed` is an
    independent, reversible, org-scoped flag: a suppressed row is retained
    but excluded from recompute.
    """

    __tablename__ = "research_evidence"

    evidence_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Attribution/audit stamp — NO default: callers pass org explicitly;
    # direct SQL inserts without an org fail NOT NULL loudly.
    organization_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Polymorphic subject: (subject_type, subject_id) addresses any entity
    # (lead, contact, company, lot, ...) — no FK possible by design.
    subject_type: Mapped[str] = mapped_column(Text, nullable=False)
    subject_id: Mapped[str] = mapped_column(Text, nullable=False)
    # What the value claims about the subject, e.g. "annual_volume_mt".
    fact_key: Mapped[str] = mapped_column(Text, nullable=False)
    # The observed value as canonical JSON (sorted keys, compact separators)
    # — identical claims from different key orders compare equal.
    value: Mapped[str] = mapped_column(Text, nullable=False)

    # Source attribution — honesty enforced by the CHECKs below AND by
    # validate_source() in research/common.py (service layer).
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text)
    source_actor: Mapped[str | None] = mapped_column(Text)  # required for human rows

    # observed | corroborated | disputed | outdated
    status: Mapped[str] = mapped_column(Text, nullable=False, default="observed")
    # Reversible suppression — 0 = live, 1 = excluded from recompute.
    suppressed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    # Recorded for future staleness sweeps; nothing sweeps yet (known
    # limitation — staleness is currently only explicit via mark_outdated).
    expires_ts: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "source_type IN ('website', 'search', 'api', 'human', 'llm_inference')",
            name="ck_research_evidence_source_type",
        ),
        CheckConstraint(
            "status IN ('observed', 'corroborated', 'disputed', 'outdated')",
            name="ck_research_evidence_status",
        ),
        CheckConstraint("suppressed IN (0, 1)", name="ck_research_evidence_suppressed"),
        # DB-enforced honesty: fetched rows must cite an http(s) source URL.
        CheckConstraint(
            "source_type NOT IN ('website', 'search', 'api')"
            " OR (source_url IS NOT NULL"
            " AND (source_url LIKE 'http://%' OR source_url LIKE 'https://%'))",
            name="ck_research_evidence_url_honesty",
        ),
        # DB-enforced honesty: a human attestation names its actor.
        CheckConstraint(
            "source_type != 'human' OR source_actor IS NOT NULL",
            name="ck_research_evidence_actor_honesty",
        ),
        # The recompute hot path: every query in research/ filters
        # organization_id + subject + fact_key.
        Index(
            "ix_research_evidence_subject",
            "organization_id",
            "subject_type",
            "subject_id",
            "fact_key",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<ResearchEvidence {self.evidence_id}: {self.fact_key}={self.value!r} "
            f"({self.source_type}, {self.status})>"
        )


class ResearchFact(Base):
    """The current-state view for one (org, subject, fact_key) — recomputed
    deterministically from the live evidence set by recompute_fact
    (research/facts.py). UNIQUE per org-scoped key: no contradictory
    duplicates.

    Locking: status='human_verified' IS the lock. A locked fact's value,
    source_count and flags are frozen for every AI-driven recompute; only
    a newer human attestation (verify_fact / record(source_type='human'))
    may change them. `conflicting` flags a retained value conflict among
    live evidence rows (first observation wins the display form; every
    conflicting row is kept as disputed — nothing is deleted or silently
    resolved).
    """

    __tablename__ = "research_facts"

    fact_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Attribution/audit stamp — NO default (same pattern as evidence).
    organization_id: Mapped[str] = mapped_column(Text, nullable=False)

    subject_type: Mapped[str] = mapped_column(Text, nullable=False)
    subject_id: Mapped[str] = mapped_column(Text, nullable=False)
    fact_key: Mapped[str] = mapped_column(Text, nullable=False)

    # Current display value (canonical JSON) — first observation's form on
    # conflict, newest human attestation's form once verified.
    value: Mapped[str] = mapped_column(Text, nullable=False)

    # observed | corroborated | human_verified
    status: Mapped[str] = mapped_column(Text, nullable=False, default="observed")
    conflicting: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Live evidence rows supporting the current value; frozen while locked.
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Actor name of the human who verified/corrected — None until then.
    verified_by: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "subject_type",
            "subject_id",
            "fact_key",
            name="uq_research_facts_key",
        ),
        CheckConstraint(
            "status IN ('observed', 'corroborated', 'human_verified')",
            name="ck_research_facts_status",
        ),
        CheckConstraint("conflicting IN (0, 1)", name="ck_research_facts_conflicting"),
        CheckConstraint("source_count >= 0", name="ck_research_facts_source_count"),
        Index("ix_research_facts_org_status", "organization_id", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<ResearchFact {self.fact_key}={self.value!r} "
            f"({self.status}{', conflicting' if self.conflicting else ''})>"
        )
