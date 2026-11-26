"""
Research session service (TryComp Phase 2, §12.1 / §12.5 / §3 I).

ResearchSessions owns the research_sessions lifecycle: creation with
duplicate-research detection (org-scoped reuse of LIVE sessions before
starting new ones), the sanctioned status transitions, budget/usage
persistence, history search and org-scoped reads.

Design decisions (all test-pinned):

  * explicit org everywhere; cross-tenant access raises
    ResearchNotFoundError (indistinguishable from missing — no existence
    oracle, same semantics as the Phase 1 services);
  * duplicate detection is deterministic (normalize_objective): a LIVE
    session (pending/running) with the same objective_key in the SAME org
    is reused instead of duplicated — completed sessions are history and
    never block new research;
  * on_duplicate="error" turns the reuse into a loud
    DuplicateResearchError for callers that must never share a session;
  * status transitions follow common.SESSION_TRANSITIONS exactly; the
    only path out of budget_exhausted is resume_session(new budgets) —
    the human intervention path (§12.4);
  * usage counters are execution facts written by the engine; this
    service never invents or estimates them.

The session service does NOT execute tools — ResearchEngine (engine.py)
does, under these budgets, recording research_tool_calls rows.
"""

from __future__ import annotations

from sqlalchemy import select

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.research import ResearchSession
from coffee_export.research.budget import BudgetSpec
from coffee_export.research.common import (
    LIVE_SESSION_STATUSES,
    SESSION_STATUSES,
    SESSION_TRANSITIONS,
    ResearchNotFoundError,
    canonical_json,
    new_session_id,
    normalize_objective,
)
from coffee_export.research.facts import _OrgScopedService
from coffee_export.research.planning import plan_objective, plan_to_json
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


class DuplicateResearchError(Exception):
    """Raised by create_session(on_duplicate='error') when a LIVE session
    with the same objective_key already exists in THIS org (§12.5). The
    duplicate session id is attached for the caller to reuse."""


class ResearchSessions(_OrgScopedService):
    """Org-scoped lifecycle + history service for research sessions."""

    # ── creation & duplicate-research detection (§12.5) ─────────────

    def find_reusable_session(self, objective: str) -> ResearchSession | None:
        """The LIVE (pending/running) session for this objective, if any.

        Org-scoped: another tenant researching the same objective is not
        a duplicate (and is invisible here — no existence oracle).
        """
        key = normalize_objective(objective)
        with self._session_factory() as session:
            return session.execute(
                select(ResearchSession)
                .where(
                    ResearchSession.organization_id == self.organization_id,
                    ResearchSession.objective_key == key,
                    ResearchSession.status.in_(LIVE_SESSION_STATUSES),
                )
                .order_by(ResearchSession.created_ts, ResearchSession.session_id)
                .limit(1)
            ).scalar_one_or_none()

    def create_session(
        self,
        objective: str,
        *,
        created_by: str,
        budgets: BudgetSpec | None = None,
        plan: list[dict] | None = None,
        on_duplicate: str = "reuse",
    ) -> tuple[ResearchSession, bool]:
        """Create (or reuse) a research session for one objective.

        Returns (session, created). With on_duplicate='reuse' (default),
        a LIVE session with the same objective_key in this org is
        returned instead of creating a duplicate — org-scoped reuse
        (§12.5). With on_duplicate='error' a DuplicateResearchError is
        raised instead (its .duplicate_session_id points at the live
        session). Budgets default to unlimited (null fields).
        """
        if not objective or not objective.strip():
            raise ValueError("objective is required (non-empty)")
        if not created_by or not created_by.strip():
            raise ValueError("created_by is required (actor attribution, e.g. 'operator:1')")
        if on_duplicate not in ("reuse", "error"):
            raise ValueError("on_duplicate must be 'reuse' or 'error'")
        spec = budgets or BudgetSpec()

        live = self.find_reusable_session(objective)
        if live is not None:
            if on_duplicate == "error":
                raise DuplicateResearchError(live.session_id)
            log.debug(
                "reusing live research session %s for objective key %r",
                live.session_id,
                live.objective_key,
            )
            return live, False

        steps = plan if plan is not None else plan_objective(objective.strip())
        if not isinstance(steps, list) or not steps:
            raise ValueError("plan must be a non-empty list of steps")
        row = ResearchSession(
            session_id=new_session_id(),
            organization_id=self.organization_id,
            objective=objective.strip(),
            objective_key=normalize_objective(objective),
            status="pending",
            plan=plan_to_json(steps),
            budgets=spec.to_json(),
            usage_tool_calls=0,
            usage_model_calls=0,
            usage_cost_usd=None,
            created_by=created_by,
            created_ts=now_addis_iso(),
            updated_ts=now_addis_iso(),
            started_ts=None,
            finished_ts=None,
        )
        with self._session_factory() as session:
            session.add(row)
            session.commit()
            log.info(
                "research session created: %s (%s) for org %s",
                row.session_id,
                row.objective_key,
                self.organization_id,
            )
            return row, True

    # ── reads (org-scoped) ──────────────────────────────────────────

    def get_session(self, session_id: str) -> ResearchSession:
        """One session for THIS org. Missing and other-tenant raise the
        same ResearchNotFoundError (no existence oracle)."""
        with self._session_factory() as session:
            row = session.execute(
                select(ResearchSession).where(
                    ResearchSession.session_id == session_id,
                    ResearchSession.organization_id == self.organization_id,
                )
            ).scalar_one_or_none()
            if row is None:
                raise ResearchNotFoundError(f"research session not found: {session_id}")
            return row

    def list_sessions(
        self,
        *,
        status: str | None = None,
        limit: int = 100,
    ) -> list[ResearchSession]:
        """Sessions for THIS org, newest first, optionally status-filtered."""
        if status is not None and status not in SESSION_STATUSES:
            raise ValueError(f"status must be one of {SESSION_STATUSES}, got {status!r}")
        with self._session_factory() as session:
            stmt = (
                select(ResearchSession)
                .where(ResearchSession.organization_id == self.organization_id)
                .order_by(ResearchSession.created_ts.desc(), ResearchSession.session_id.desc())
                .limit(limit)
            )
            if status is not None:
                stmt = stmt.where(ResearchSession.status == status)
            return list(session.execute(stmt).scalars().all())

    def search_sessions(
        self,
        query: str,
        *,
        status: str | None = None,
        limit: int = 50,
    ) -> list[ResearchSession]:
        """Org-scoped history search over objectives (§3 I).

        Case-insensitive substring match on the normalized objective key
        — deterministic, no AI ranking. Another tenant's sessions are
        invisible by construction.
        """
        if not query or not query.strip():
            raise ValueError("query is required (non-empty)")
        needle = normalize_objective(query)
        like = f"%{needle}%"
        with self._session_factory() as session:
            stmt = (
                select(ResearchSession)
                .where(
                    ResearchSession.organization_id == self.organization_id,
                    ResearchSession.objective_key.like(like),
                )
                .order_by(ResearchSession.created_ts.desc(), ResearchSession.session_id.desc())
                .limit(limit)
            )
            if status is not None:
                if status not in SESSION_STATUSES:
                    raise ValueError(f"status must be one of {SESSION_STATUSES}, got {status!r}")
                stmt = stmt.where(ResearchSession.status == status)
            return list(session.execute(stmt).scalars().all())

    # ── sanctioned lifecycle transitions ────────────────────────────

    def start_session(self, session_id: str) -> ResearchSession:
        """pending → running. Sets started_ts (the wall-budget window)."""
        return self._transition(
            session_id,
            "running",
            mutate=lambda row: setattr(row, "started_ts", now_addis_iso()),
        )

    def complete_session(self, session_id: str, result: object) -> ResearchSession:
        """running → completed with a canonical-JSON structured result."""

        def mutate(row: ResearchSession) -> None:
            row.result = canonical_json(result)

        return self._transition(session_id, "completed", mutate=mutate)

    def fail_session(self, session_id: str, error_message: str) -> ResearchSession:
        """running → failed with an honest error message."""

        def mutate(row: ResearchSession) -> None:
            row.error_message = error_message

        return self._transition(session_id, "failed", mutate=mutate)

    def cancel_session(self, session_id: str) -> ResearchSession:
        """pending/running/budget_exhausted → cancelled (operator decision)."""
        return self._transition(session_id, "cancelled")

    def mark_budget_exhausted(self, session_id: str, reason: str) -> ResearchSession:
        """running → budget_exhausted. Called by the engine when a budget
        refuses an action (§12.4) — continuation requires the human
        resume path."""

        def mutate(row: ResearchSession) -> None:
            row.error_message = f"budget exhausted: {reason}"

        return self._transition(session_id, "budget_exhausted", mutate=mutate)

    def resume_session(self, session_id: str, budgets: BudgetSpec) -> ResearchSession:
        """budget_exhausted → running with NEW budgets (human intervention).

        The wall-clock window restarts (started_ts reset) and the new
        BudgetSpec replaces the old one; usage counters keep their honest
        accumulated values.
        """
        if not isinstance(budgets, BudgetSpec):
            raise ValueError("resume_session requires a BudgetSpec (new budgets)")

        def mutate(row: ResearchSession) -> None:
            row.budgets = budgets.to_json()
            row.started_ts = now_addis_iso()
            row.error_message = None

        return self._transition(session_id, "running", mutate=mutate)

    # ── internals ───────────────────────────────────────────────────

    def _transition(
        self,
        session_id: str,
        target: str,
        *,
        mutate=None,
    ) -> ResearchSession:
        """Apply one sanctioned status transition (common.SESSION_TRANSITIONS)."""
        with self._session_factory() as session:
            row = session.execute(
                select(ResearchSession).where(
                    ResearchSession.session_id == session_id,
                    ResearchSession.organization_id == self.organization_id,
                )
            ).scalar_one_or_none()
            if row is None:
                raise ResearchNotFoundError(f"research session not found: {session_id}")
            allowed = SESSION_TRANSITIONS.get(row.status, frozenset())
            if target not in allowed:
                raise ValueError(
                    f"unsanctioned session transition: {row.status} → {target} "
                    f"(allowed from {row.status}: {sorted(allowed)})"
                )
            row.status = target
            if mutate is not None:
                mutate(row)
            row.updated_ts = now_addis_iso()
            if target in ("completed", "failed", "cancelled"):
                row.finished_ts = now_addis_iso()
            session.commit()
            return row
