"""
Research models — Evidence Ledger, Persistent Facts, the Research Engine
and Persistent Follow-ups (TryComp Phase 1 + 2 + 3).

Five org-scoped tables backing the research services in coffee_export/research/
(docs/trycomp-integration-progress.md §3 B/C/D/G/H/I):

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
  * research_sessions — one research objective in execution: the plan JSON,
    the status lifecycle (pending → running → completed/failed/cancelled/
    budget_exhausted), per-session budgets and usage counters (Phase 2 §12.1).
    Wall-clock budget is measured from started_ts per active run — no
    fabricated counter.
  * research_tool_calls — the append-only tool-call log: every tool
    invocation (and every budget refusal) is recorded with input, output,
    honest status, reported cost (never invented) and measured duration
    (Phase 2 §12.1). Rows are never deleted.
  * research_followups — persistent scheduled follow-up work (Phase 3
    §3 D): one row per scheduled future action (revalidate expired
    evidence, resume/re-run a session). The dispatcher (tasks/
    research_tasks.py) scans DUE rows and enqueues them as durable
    `research.*` tasks attributed with the row's own organization_id;
    the handler marks the row done/failed when the task terminates.

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

from sqlalchemy import REAL, CheckConstraint, Index, Integer, Text, UniqueConstraint
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


class ResearchSession(Base):
    """One research objective under execution — the session engine record.

    Lifecycle is owned by ResearchSessions (research/sessions.py); tool
    invocation and usage accounting by ResearchEngine (research/engine.py).
    `status` follows the sanctioned transition map in common.py:
    pending → running → completed | failed | cancelled | budget_exhausted;
    budget_exhausted → running is the human intervention path (resume with
    new budgets) — an exhausted session never silently continues.

    Budgets are canonical JSON (BudgetSpec): null fields mean unlimited.
    Usage counters are execution facts, never estimates: tool/model call
    counts increment per executed call; usage_cost_usd is NULL until a
    provider actually reports a cost — NULL means "nothing reported yet",
    never "zero" (never fabricate cost measurements, §12.4). Wall-clock is
    derived from started_ts per active run, not stored.

    objective_key is the normalized objective fingerprint used for
    duplicate-research detection (org-scoped reuse before starting a new
    session, §12.5) — an index, not a UNIQUE constraint: history may hold
    several sessions with the same objective over time.
    """

    __tablename__ = "research_sessions"

    session_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Attribution/audit stamp — NO default (same pattern as evidence/facts).
    organization_id: Mapped[str] = mapped_column(Text, nullable=False)

    objective: Mapped[str] = mapped_column(Text, nullable=False)
    # Normalized fingerprint (lowercase, whitespace-collapsed) for dedup.
    objective_key: Mapped[str] = mapped_column(Text, nullable=False)

    # pending | running | completed | failed | cancelled | budget_exhausted
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")

    # Canonical JSON: list of plan steps (planning.py deterministic template
    # or a Phase 3 LLM-assisted plan — the plan is data, never executed blind).
    plan: Mapped[str] = mapped_column(Text, nullable=False)
    # Canonical JSON BudgetSpec; null fields = unlimited.
    budgets: Mapped[str] = mapped_column(Text, nullable=False)

    # Execution facts (never fabricated).
    usage_tool_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_model_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # NULL until a provider reports a cost; NULL ≠ 0.
    usage_cost_usd: Mapped[float | None] = mapped_column(REAL)

    # Canonical JSON structured result (set on completion).
    result: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)

    # Actor attribution — "operator:<id>", "agent:<n>", "task:<type>" …
    created_by: Mapped[str] = mapped_column(Text, nullable=False)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    # Set when the session (re)enters running; wall budget is measured from
    # here per active run. Reset on resume (new budget window, honest).
    started_ts: Mapped[str | None] = mapped_column(Text)
    finished_ts: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled',"
            " 'budget_exhausted')",
            name="ck_research_sessions_status",
        ),
        CheckConstraint("usage_tool_calls >= 0", name="ck_research_sessions_tool_calls"),
        CheckConstraint("usage_model_calls >= 0", name="ck_research_sessions_model_calls"),
        Index("ix_research_sessions_org_status", "organization_id", "status"),
        # Duplicate-research detection hot path (§12.5).
        Index("ix_research_sessions_org_key", "organization_id", "objective_key"),
    )

    def __repr__(self) -> str:
        return f"<ResearchSession {self.session_id}: {self.status} {self.objective!r}>"


class ResearchToolCall(Base):
    """One tool invocation (or budget refusal) inside a session — the
    append-only tool-call log (§12.1).

    Rows are never deleted and never mutated: a row records the honest
    outcome of one attempted call — ok, error (operational failure),
    capability_unavailable (no provider configured — never faked),
    blocked_policy (robots.txt / allowlist refusal) or budget_exhausted
    (refused BEFORE the tool ran; recorded for audit, NOT counted as
    usage). cost_usd is NULL unless a provider actually reported a cost;
    duration_ms is wall-clock measured around the invocation.

    No FK to research_sessions by design (same decision as the Phase 1
    tables): session integrity is enforced by the org-scoped service layer
    — a tool call can only be recorded for a session that exists in THIS
    org (ResearchNotFoundError otherwise).
    """

    __tablename__ = "research_tool_calls"

    call_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Attribution/audit stamp — NO default (same pattern as evidence/facts).
    organization_id: Mapped[str] = mapped_column(Text, nullable=False)
    # Reference to research_sessions.session_id in the SAME org.
    session_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Registered tool name (registry lookup — unknown names are refused).
    tool: Mapped[str] = mapped_column(Text, nullable=False)
    # Canonical JSON of the validated input.
    input: Mapped[str] = mapped_column(Text, nullable=False)
    # Canonical JSON of the structured output (None for error rows).
    output: Mapped[str | None] = mapped_column(Text)

    # ok | error | capability_unavailable | budget_exhausted | blocked_policy
    status: Mapped[str] = mapped_column(Text, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)

    # Reported cost only — never invented (None = not reported).
    cost_usd: Mapped[float | None] = mapped_column(REAL)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('ok', 'error', 'capability_unavailable', 'budget_exhausted',"
            " 'blocked_policy')",
            name="ck_research_tool_calls_status",
        ),
        CheckConstraint("duration_ms >= 0", name="ck_research_tool_calls_duration"),
        # The history/audit hot path: calls of one session in order.
        Index(
            "ix_research_tool_calls_session",
            "organization_id",
            "session_id",
            "created_ts",
        ),
    )

    def __repr__(self) -> str:
        return f"<ResearchToolCall {self.call_id}: {self.tool} → {self.status}>"


class ResearchFollowup(Base):
    """One scheduled piece of future research work (TryComp Phase 3, §3 D).

    A followup is DATA, not a running timer: `due_ts` is when the work
    may run, `status` tracks the dispatch lifecycle (scheduled →
    enqueued → done | failed; scheduled → cancelled pre-dispatch). The
    followup_type maps 1:1 onto a registered research task type minus
    the `research.` prefix ("run_session" | "revalidate_evidence") —
    the DB CHECK enumerates the admissible values so a typo cannot
    silently produce un-dispatchable rows.

    `payload` is canonical JSON merged into the enqueued task's payload
    (the dispatcher injects the followup_id so the handler can close
    the loop). `task_id` is set at dispatch to the created agent_tasks
    row — the audit link between followup and durable task.

    Lifecycle is owned by ResearchFollowups (research/followups.py);
    dispatch by tasks/research_tasks.py. No FK by design (same decision
    as the other research tables): org-scoped service enforcement.
    """

    __tablename__ = "research_followups"

    followup_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Attribution/audit stamp — NO default (same pattern as every
    # research table; the dispatcher stamps the row's OWN org onto the
    # task — never a silent fallback).
    organization_id: Mapped[str] = mapped_column(Text, nullable=False)

    # 'run_session' | 'revalidate_evidence' (maps to research.<type>).
    followup_type: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional references — subject of the followup work.
    session_id: Mapped[str | None] = mapped_column(Text)
    subject_type: Mapped[str | None] = mapped_column(Text)
    subject_id: Mapped[str | None] = mapped_column(Text)

    # When the followup may run (ISO +03:00, lexicographically sortable).
    due_ts: Mapped[str] = mapped_column(Text, nullable=False)
    # scheduled | enqueued | done | failed | cancelled
    status: Mapped[str] = mapped_column(Text, nullable=False, default="scheduled")

    # Canonical JSON merged into the enqueued task payload.
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    # Set at dispatch — the created agent_tasks.task_id (audit link).
    task_id: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('scheduled', 'enqueued', 'done', 'failed', 'cancelled')",
            name="ck_research_followups_status",
        ),
        CheckConstraint(
            "followup_type IN ('run_session', 'revalidate_evidence')",
            name="ck_research_followups_type",
        ),
        Index("ix_research_followups_org_status", "organization_id", "status"),
        # The dispatcher hot path: due rows across orgs in due order.
        Index("ix_research_followups_due", "status", "due_ts"),
    )

    def __repr__(self) -> str:
        return (
            f"<ResearchFollowup {self.followup_id}: {self.followup_type} "
            f"{self.status} due {self.due_ts}>"
        )
