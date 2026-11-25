"""
Research engine — the budget-enforced execution facade (TryComp Phase 2).

ResearchEngine is the ONE in-process path from a session to a tool
invocation (Phase 3 registers durable-queue task handlers that call
exactly this facade, so the semantics stay identical in-process and
durable):

  1. load the session org-scoped (cross-tenant = ResearchNotFoundError);
  2. auto-start pending sessions; refuse finished ones; an exhausted
     session raises immediately (the human resume path is the only way
     back — §12.4);
  3. evaluate the budgets BEFORE execution (§12.4): a refused call is
     recorded as a budget_exhausted audit row — NOT counted as usage —
     the session moves to budget_exhausted, and BudgetExhaustedError
     propagates;
  4. invoke the tool through the registry (typed schemas, honest
     statuses, measured duration) OUTSIDE any DB transaction;
  5. record the tool_call row and update usage in ONE transaction
     (execution facts only: +1 executed tool call, +cost when a provider
     actually reported one — never invented).

Model-call accounting (record_model_call) is the same contract for
AIGateway calls: the call already happened, so it is recorded first and
the session is marked exhausted afterwards if a limit is now exceeded —
the NEXT action will be refused.

Wall-clock is measured per active run (from started_ts) with an
injectable epoch clock (tests, Phase 3 handlers).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.engine import Engine

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.research import ResearchSession, ResearchToolCall
from coffee_export.research.budget import BudgetExhaustedError, BudgetSpec, check_budget
from coffee_export.research.common import (
    ResearchNotFoundError,
    canonical_json,
    new_tool_call_id,
)
from coffee_export.research.facts import _OrgScopedService
from coffee_export.research.providers import ProviderManifest
from coffee_export.research.sessions import ResearchSessions
from coffee_export.research.tools.base import (
    ToolContext,
    ToolNotFoundError,
)
from coffee_export.research.tools.registry import ToolRegistry, default_registry
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class ToolCallOutcome:
    """What run_tool records and returns — the honest audit record."""

    call_id: str
    session_id: str
    tool: str
    status: str
    output: dict | None
    error_message: str | None
    cost_usd: float | None
    duration_ms: int


def _wall_seconds(started_ts: str | None, clock: Callable[[], float]) -> float:
    """Elapsed wall-clock of the current active run (epoch-based)."""
    if not started_ts:
        return 0.0
    started = datetime.fromisoformat(started_ts).timestamp()
    return max(0.0, clock() - started)


class ResearchEngine(_OrgScopedService):
    """Org-scoped, budget-enforced tool execution for research sessions."""

    def __init__(
        self,
        organization_id: str,
        engine: Engine | None = None,
        *,
        registry: ToolRegistry | None = None,
        clock: Callable[[], float] | None = None,
        manifest: ProviderManifest | None = None,
    ) -> None:
        if engine is None:
            from coffee_export.database.base import engine as app_engine

            engine = app_engine
        super().__init__(organization_id, engine)
        self._db_engine = engine
        self._registry = registry if registry is not None else default_registry()
        self._clock = clock if clock is not None else time.time
        self._manifest = manifest if manifest is not None else ProviderManifest()
        self._sessions = ResearchSessions(organization_id, engine)

    @property
    def sessions(self) -> ResearchSessions:
        """The session lifecycle service bound to the same org/engine."""
        return self._sessions

    @property
    def registry(self) -> ToolRegistry:
        return self._registry

    # ── tool execution ────────────────────────────────────────────

    def run_tool(
        self,
        session_id: str,
        tool_name: str,
        tool_input: dict,
    ) -> ToolCallOutcome:
        """Run one registered tool inside a session under its budgets.

        Raises ResearchNotFoundError (unknown/other-tenant session),
        ValueError (finished session), BudgetExhaustedError (refused —
        the audit row is recorded first), ToolNotFoundError (unknown
        tool — the audit row is recorded first). Tool-internal failures
        do NOT raise: they are recorded and returned honestly.
        """
        # Transaction 1: session gate + budget pre-check (+ auto-start).
        with self._session_factory() as session:
            row = self._require_session(session, session_id)
            if row.status == "budget_exhausted":
                raise BudgetExhaustedError(
                    "session",
                    "session is budget_exhausted — resume_session(new budgets) "
                    "is the only continuation",
                )
            if row.status in ("completed", "failed", "cancelled"):
                raise ValueError(
                    f"session is {row.status} — tools cannot run on a finished session"
                )
            if row.status == "pending":
                row.status = "running"
                row.started_ts = now_addis_iso()
                row.updated_ts = now_addis_iso()

            spec = BudgetSpec.from_json(row.budgets)
            reason = check_budget(
                spec,
                tool_calls=row.usage_tool_calls + 1,
                model_calls=row.usage_model_calls,
                wall_seconds=_wall_seconds(row.started_ts, self._clock),
                cost_usd=row.usage_cost_usd,
            )
            if reason is not None:
                call_id = self._record_refusal(session, row, tool_name, tool_input, reason)
                session.commit()
                raise BudgetExhaustedError(
                    reason,
                    f"budget {reason} exhausted before execution " f"(session {session_id})",
                )
            session.commit()

        # Execution happens OUTSIDE any DB transaction (bounded HTTP can
        # take seconds; holding a write lock is not acceptable).
        ctx = ToolContext(
            organization_id=self.organization_id,
            session_id=session_id,
            engine=self._db_engine,
            manifest=self._manifest,
        )
        try:
            result, duration_ms = self._registry.invoke(tool_name, tool_input, ctx)
        except ToolNotFoundError:
            with self._session_factory() as session:
                row = self._require_session(session, session_id)
                self._record_row(
                    session,
                    row,
                    tool=tool_name,
                    input_json=canonical_json(tool_input),
                    status="error",
                    error_message=f"unknown tool: {tool_name!r}",
                    cost_usd=None,
                    duration_ms=0,
                )
                session.commit()
            raise

        # Transaction 2: audit row + usage, one commit.
        with self._session_factory() as session:
            row = self._require_session(session, session_id)
            call_id = self._record_row(
                session,
                row,
                tool=tool_name,
                input_json=canonical_json(tool_input),
                status=result.status,
                output_json=(canonical_json(result.output) if result.output is not None else None),
                error_message=result.error_message,
                cost_usd=result.cost_usd,
                duration_ms=duration_ms,
            )
            if row.status == "running" and result.status != "budget_exhausted":
                row.usage_tool_calls += 1
                if result.cost_usd is not None:
                    row.usage_cost_usd = (row.usage_cost_usd or 0.0) + result.cost_usd
                row.updated_ts = now_addis_iso()
            session.commit()

        log.info(
            "research tool call %s (%s → %s) in session %s",
            call_id,
            tool_name,
            result.status,
            session_id,
        )
        return ToolCallOutcome(
            call_id=call_id,
            session_id=session_id,
            tool=tool_name,
            status=result.status,
            output=result.output,
            error_message=result.error_message,
            cost_usd=result.cost_usd,
            duration_ms=duration_ms,
        )

    # ── model-call accounting (AIGateway path) ─────────────────────

    def record_model_call(
        self,
        session_id: str,
        *,
        cost_usd: float | None = None,
    ) -> tuple[ResearchSession, bool]:
        """Record one AI-gateway call made on behalf of the session.

        The call already happened, so it is recorded first (honest); if
        a limit is now exceeded the session is marked budget_exhausted
        and the NEXT action will be refused. Returns (session, exhausted).
        cost_usd only when the provider actually reported one.
        """
        with self._session_factory() as session:
            row = self._require_session(session, session_id)
            if row.status == "pending":
                row.status = "running"
                row.started_ts = now_addis_iso()
                row.updated_ts = now_addis_iso()
            if row.status != "running":
                raise ValueError(
                    f"session is {row.status} — model calls can only be recorded " "while running"
                )
            row.usage_model_calls += 1
            if cost_usd is not None:
                row.usage_cost_usd = (row.usage_cost_usd or 0.0) + cost_usd
            spec = BudgetSpec.from_json(row.budgets)
            reason = check_budget(
                spec,
                tool_calls=row.usage_tool_calls,
                model_calls=row.usage_model_calls,
                wall_seconds=_wall_seconds(row.started_ts, self._clock),
                cost_usd=row.usage_cost_usd,
            )
            if reason is not None:
                row.status = "budget_exhausted"
                row.error_message = f"budget exhausted: {reason}"
                row.updated_ts = now_addis_iso()
            session.commit()
            return row, row.status == "budget_exhausted"

    # ── audit reads ────────────────────────────────────────────────

    def list_tool_calls(self, session_id: str) -> list[ResearchToolCall]:
        """The append-only tool-call log of one session (THIS org, in
        order). Cross-tenant sessions raise ResearchNotFoundError."""
        with self._session_factory() as session:
            self._require_session(session, session_id)
            return list(
                session.execute(
                    select(ResearchToolCall)
                    .where(
                        ResearchToolCall.organization_id == self.organization_id,
                        ResearchToolCall.session_id == session_id,
                    )
                    .order_by(ResearchToolCall.created_ts, ResearchToolCall.call_id)
                )
                .scalars()
                .all()
            )

    # ── internals ───────────────────────────────────────────────────

    def _require_session(self, session, session_id: str) -> ResearchSession:
        row = session.execute(
            select(ResearchSession).where(
                ResearchSession.session_id == session_id,
                ResearchSession.organization_id == self.organization_id,
            )
        ).scalar_one_or_none()
        if row is None:
            raise ResearchNotFoundError(f"research session not found: {session_id}")
        return row

    def _record_refusal(
        self,
        session,
        row: ResearchSession,
        tool_name: str,
        tool_input: dict,
        reason: str,
    ) -> str:
        """Record the budget refusal (audit, NOT usage) and stop the session."""
        call_id = self._record_row(
            session,
            row,
            tool=tool_name,
            input_json=canonical_json(tool_input),
            status="budget_exhausted",
            error_message=f"refused before execution: budget {reason} exhausted",
            cost_usd=None,
            duration_ms=0,
        )
        row.status = "budget_exhausted"
        row.error_message = f"budget exhausted: {reason}"
        row.updated_ts = now_addis_iso()
        return call_id

    def _record_row(
        self,
        session,
        row: ResearchSession,
        *,
        tool: str,
        input_json: str,
        status: str,
        output_json: str | None = None,
        error_message: str | None = None,
        cost_usd: float | None = None,
        duration_ms: int,
    ) -> str:
        call = ResearchToolCall(
            call_id=new_tool_call_id(),
            organization_id=self.organization_id,
            session_id=row.session_id,
            tool=tool,
            input=input_json,
            output=output_json,
            status=status,
            error_message=error_message,
            cost_usd=cost_usd,
            duration_ms=duration_ms,
            created_ts=now_addis_iso(),
        )
        session.add(call)
        session.flush()
        return call.call_id
