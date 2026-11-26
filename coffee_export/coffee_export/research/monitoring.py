"""
Research health monitoring (TryComp Phase 7, §3 J / §8).

The ONE read-only monitoring surface for the research stack, feeding
the Streamlit dashboard and the queue admin CLI (no second monitoring
system — the rejected list forbids one).

Sections of one `overview()` snapshot (all org-scoped, all honest
counts — nothing fabricated, nothing inferred):

  * sessions    — by sanctioned status; budget_exhausted sessions are
                  listed by id (they await the HUMAN resume path only)
  * evidence    — rows by status (observed/corroborated/disputed/
                  outdated), suppressed rows, human-attested rows,
                  expiring-soon and already-expired-still-live counts
                  (the sweep's honest backlog)
  * facts       — persistent facts by status (human_verified = locked)
  * budgets     — aggregate usage (tool calls, model calls) and the
                  sum of REPORTED costs only (None costs are never
                  treated as zero — the Phase 2 honesty rule)
  * followups   — by status; overdue (scheduled + past due); next due
  * queue       — research.* durable tasks by status + in-flight
                  (pending + leased) + attempts on non-terminal tasks
  * outreach    — Phase 6 approval-queue rows by status, with the
                  research-drafted share of PENDING rows (bounded
                  payload parse — ids/statuses only, no bodies)

Org scoping follows §4.1: the service is org-scoped, period. The only
cross-org helper is `list_research_orgs()` — the operator org PICKER
(ids only, never tenant rows), the same trust level as the admin CLI's
counts-only rollup.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.engine import Engine

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.database.models.research import (
    ResearchEvidence,
    ResearchFact,
    ResearchFollowup,
    ResearchSession,
    ResearchToolCall,
)
from coffee_export.research.facts import _OrgScopedService
from coffee_export.research.followups import FOLLOWUP_TYPES
from coffee_export.research.outreach import PENDING_AGENT_ACTIONS
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

#: Live evidence statuses (what the sweep can still expire).
LIVE_EVIDENCE_STATUSES: tuple[str, ...] = ("observed", "corroborated")

#: How many pending approval payloads the outreach section parses
#: (bounded read — the queue is operator-sized).
OUTREACH_PAYLOAD_SCAN_LIMIT = 100


def list_research_orgs(engine: Engine, limit: int = 50) -> list[str]:
    """Org ids that carry research data (the dashboard org picker).

    Cross-org by design but IDs ONLY — no tenant row ever leaves the
    database through this helper (same trust level as the admin CLI's
    counts-only rollup). Bounded, sorted, deduped.
    """
    orgs: set[str] = set()
    with engine.connect() as conn:
        for table in (ResearchSession, ResearchEvidence, ResearchFollowup):
            rows = conn.execute(select(table.organization_id).distinct().limit(limit)).scalars()
            orgs.update(rows)
            if len(orgs) >= limit:
                break
    return sorted(orgs)[:limit]


class ResearchHealthService(_OrgScopedService):
    """Org-scoped, read-only research health snapshot (Phase 7 §3 J)."""

    def overview(
        self,
        *,
        now_ts: str | None = None,
        expiring_days: int = 7,
    ) -> dict[str, Any]:
        """One honest health snapshot for THIS org.

        now_ts is injectable for deterministic tests (defaults to the
        canonical Addis ISO clock). expiring_days bounds the
        'expiring soon' evidence window.
        """
        if expiring_days < 0:
            raise ValueError("expiring_days must be >= 0")
        now = now_ts or now_addis_iso()

        return {
            "organization_id": self.organization_id,
            "generated_ts": now,
            "sessions": self._sessions(),
            "evidence": self._evidence(now, expiring_days),
            "facts": self._facts(),
            "budgets": self._budgets(),
            "followups": self._followups(now),
            "queue": self._queue(),
            "outreach": self._outreach(now),
        }

    # ── sections ───────────────────────────────────────────────────

    def _sessions(self) -> dict[str, Any]:
        with self._session_factory() as session:
            counts = dict(
                session.execute(
                    select(ResearchSession.status, func.count())
                    .where(ResearchSession.organization_id == self.organization_id)
                    .group_by(ResearchSession.status)
                ).all()
            )
            exhausted = list(
                session.execute(
                    select(ResearchSession.session_id)
                    .where(
                        ResearchSession.organization_id == self.organization_id,
                        ResearchSession.status == "budget_exhausted",
                    )
                    .order_by(ResearchSession.session_id)
                    .limit(50)
                ).scalars()
            )
            last_completed = session.execute(
                select(
                    ResearchSession.session_id,
                    ResearchSession.objective,
                )
                .where(
                    ResearchSession.organization_id == self.organization_id,
                    ResearchSession.status == "completed",
                )
                .order_by(ResearchSession.created_ts.desc())
                .limit(1)
            ).first()
        return {
            "by_status": counts,
            "total": sum(counts.values()),
            "budget_exhausted_ids": exhausted,
            "last_completed": (
                {
                    "session_id": last_completed[0],
                    "objective": last_completed[1],
                }
                if last_completed
                else None
            ),
        }

    def _evidence(self, now: str, expiring_days: int) -> dict[str, Any]:
        horizon = _shift_days(now, expiring_days)
        with self._session_factory() as session:
            counts = dict(
                session.execute(
                    select(ResearchEvidence.status, func.count())
                    .where(ResearchEvidence.organization_id == self.organization_id)
                    .group_by(ResearchEvidence.status)
                ).all()
            )
            suppressed = session.execute(
                select(func.count())
                .select_from(ResearchEvidence)
                .where(
                    ResearchEvidence.organization_id == self.organization_id,
                    ResearchEvidence.suppressed == 1,
                )
            ).scalar_one()
            human_rows = session.execute(
                select(func.count())
                .select_from(ResearchEvidence)
                .where(
                    ResearchEvidence.organization_id == self.organization_id,
                    ResearchEvidence.source_type == "human",
                )
            ).scalar_one()
            base = (
                select(func.count())
                .select_from(ResearchEvidence)
                .where(
                    ResearchEvidence.organization_id == self.organization_id,
                    ResearchEvidence.suppressed == 0,
                    ResearchEvidence.status.in_(LIVE_EVIDENCE_STATUSES),
                    ResearchEvidence.expires_ts.isnot(None),
                )
            )
            expiring = session.execute(
                base.where(
                    ResearchEvidence.expires_ts > now,
                    ResearchEvidence.expires_ts <= horizon,
                )
            ).scalar_one()
            expired = session.execute(base.where(ResearchEvidence.expires_ts <= now)).scalar_one()
        total = sum(counts.values())
        live = counts.get("observed", 0) + counts.get("corroborated", 0)
        return {
            "by_status": counts,
            "total": total,
            "suppressed": suppressed,
            "human_source_rows": human_rows,
            "corroboration_rate": (counts.get("corroborated", 0) / live) if live else 0.0,
            "expiring_soon": expiring,
            "expired_still_live": expired,
        }

    def _facts(self) -> dict[str, Any]:
        with self._session_factory() as session:
            counts = dict(
                session.execute(
                    select(ResearchFact.status, func.count())
                    .where(ResearchFact.organization_id == self.organization_id)
                    .group_by(ResearchFact.status)
                ).all()
            )
        return {
            "by_status": counts,
            "total": sum(counts.values()),
            "human_locked": counts.get("human_verified", 0),
        }

    def _budgets(self) -> dict[str, Any]:
        with self._session_factory() as session:
            usage = session.execute(
                select(
                    func.count(),
                    func.coalesce(func.sum(ResearchSession.usage_tool_calls), 0),
                    func.coalesce(func.sum(ResearchSession.usage_model_calls), 0),
                ).where(ResearchSession.organization_id == self.organization_id)
            ).one()
            reported_cost = session.execute(
                select(func.sum(ResearchSession.usage_cost_usd)).where(
                    ResearchSession.organization_id == self.organization_id
                )
            ).scalar_one()
            tool_calls_logged = session.execute(
                select(func.count())
                .select_from(ResearchToolCall)
                .where(ResearchToolCall.organization_id == self.organization_id)
            ).scalar_one()
        return {
            "sessions_counted": usage[0],
            "usage_tool_calls": usage[1],
            "usage_model_calls": usage[2],
            "reported_cost_usd": reported_cost,  # None = nothing reported (never zeroed)
            "tool_calls_logged": tool_calls_logged,
            "note": (
                "cost sums REPORTED provider costs only; sessions with no "
                "reported cost are never treated as free"
            ),
        }

    def _followups(self, now: str) -> dict[str, Any]:
        with self._session_factory() as session:
            counts = dict(
                session.execute(
                    select(ResearchFollowup.status, func.count())
                    .where(ResearchFollowup.organization_id == self.organization_id)
                    .group_by(ResearchFollowup.status)
                ).all()
            )
            overdue = session.execute(
                select(func.count())
                .select_from(ResearchFollowup)
                .where(
                    ResearchFollowup.organization_id == self.organization_id,
                    ResearchFollowup.status == "scheduled",
                    ResearchFollowup.due_ts <= now,
                )
            ).scalar_one()
            next_due = session.execute(
                select(ResearchFollowup.followup_id, ResearchFollowup.due_ts)
                .where(
                    ResearchFollowup.organization_id == self.organization_id,
                    ResearchFollowup.status == "scheduled",
                )
                .order_by(ResearchFollowup.due_ts)
                .limit(1)
            ).first()
        return {
            "by_status": counts,
            "total": sum(counts.values()),
            "overdue_scheduled": overdue,
            "next_due": (
                {
                    "followup_id": next_due[0],
                    "due_ts": next_due[1],
                }
                if next_due
                else None
            ),
            "types": list(FOLLOWUP_TYPES),
        }

    def _queue(self) -> dict[str, Any]:
        research_types = tuple(f"research.{t}" for t in FOLLOWUP_TYPES)
        with self._session_factory() as session:
            counts = dict(
                session.execute(
                    select(AgentTask.status, func.count())
                    .where(
                        AgentTask.organization_id == self.organization_id,
                        AgentTask.task_type.in_(research_types),
                    )
                    .group_by(AgentTask.status)
                ).all()
            )
            in_flight_attempts = session.execute(
                select(AgentTask.task_id, AgentTask.task_type, AgentTask.attempts)
                .where(
                    AgentTask.organization_id == self.organization_id,
                    AgentTask.task_type.in_(research_types),
                    AgentTask.status.in_(("pending", "leased")),
                )
                .order_by(AgentTask.created_ts)
                .limit(20)
            ).all()
        return {
            "by_status": counts,
            "total": sum(counts.values()),
            "in_flight": counts.get("pending", 0) + counts.get("leased", 0),
            "in_flight_detail": [
                {
                    "task_id": row[0],
                    "task_type": row[1],
                    "attempts": row[2],
                }
                for row in in_flight_attempts
            ],
        }

    def _outreach(self, now: str) -> dict[str, Any]:
        with self._session_factory() as session:
            counts = dict(
                session.execute(
                    select(PENDING_AGENT_ACTIONS.c.status, func.count())
                    .where(
                        PENDING_AGENT_ACTIONS.c.organization_id == self.organization_id,
                        PENDING_AGENT_ACTIONS.c.action_type == "send_email",
                    )
                    .group_by(PENDING_AGENT_ACTIONS.c.status)
                ).all()
            )
            pending_rows = session.execute(
                select(
                    PENDING_AGENT_ACTIONS.c.id,
                    PENDING_AGENT_ACTIONS.c.target_entity_id,
                    PENDING_AGENT_ACTIONS.c.payload,
                    PENDING_AGENT_ACTIONS.c.submitted_ts,
                )
                .where(
                    PENDING_AGENT_ACTIONS.c.organization_id == self.organization_id,
                    PENDING_AGENT_ACTIONS.c.action_type == "send_email",
                    PENDING_AGENT_ACTIONS.c.status == "pending",
                )
                .order_by(PENDING_AGENT_ACTIONS.c.id.desc())
                .limit(OUTREACH_PAYLOAD_SCAN_LIMIT)
            ).all()
        research_drafted = 0
        pending_brief: list[dict[str, Any]] = []
        for row in pending_rows:
            source = _payload_source(row[2])
            if source == "research":
                research_drafted += 1
            pending_brief.append(
                {
                    "action_id": row[0],
                    "lead_id": row[1],
                    "source": source,
                    "submitted_ts": row[3],
                }
            )
        awaiting_review = counts.get("pending", 0)
        return {
            "by_status": counts,
            "awaiting_human_review": awaiting_review,
            "research_drafted_pending": research_drafted,
            "pending_recent": pending_brief,
            "note": (
                "drafts await HUMAN approval — nothing is ever sent "
                "autonomously (§4.5 dual gate)"
            ),
        }


# ── helpers ────────────────────────────────────────────────────────


def _payload_source(payload: str | None) -> str | None:
    """The honest source marker of an approval-queue payload
    ('research' for Phase 6 drafts; None when unmarked/legacy)."""
    if not payload:
        return None
    try:
        data = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    reasoning = data.get("reasoning")
    if isinstance(reasoning, dict) and reasoning.get("source"):
        return str(reasoning["source"])
    return None


def _shift_days(iso_ts: str, days: int) -> str:
    """Shift an Addis ISO timestamp by N days (same +03:00 form)."""
    from datetime import datetime, timedelta

    moment = datetime.fromisoformat(iso_ts)
    return (moment + timedelta(days=days)).isoformat()
