"""
Persistent follow-ups service (TryComp Phase 3, §3 D).

ResearchFollowups owns the research_followups lifecycle: scheduling
future research work as DATA (due_ts, payload, optional session/subject
references), the sanctioned dispatch-status transitions, and org-scoped
reads. Rows are durable across restarts by construction — a followup
scheduled before a crash is still due afterwards.

Design decisions (all test-pinned):

  * explicit org everywhere; cross-tenant access raises
    ResearchNotFoundError (indistinguishable from missing — no existence
    oracle, same semantics as every other research service);
  * the followup_type must be one of RESEARCH_TASK_TYPES minus the
    "research." prefix — a typo cannot produce un-dispatchable rows (the
    DB CHECK enumerates the same set);
  * status transitions follow common.FOLLOWUP_TRANSITIONS exactly:
    scheduled → enqueued (dispatcher), enqueued → done | failed
    (handler happy/terminal path), scheduled → cancelled (operator,
    pre-dispatch only — once a durable task exists the TASK is the
    execution record and this row must not fight it);
  * the payload is canonical JSON and is merged into the enqueued task
    payload by the dispatcher (which injects the followup_id so the
    handler can close the loop).

This service never enqueues anything — dispatch is queue infrastructure
and lives in tasks/research_tasks.py (the one sanctioned cross-org
reader of this table, same trust level as claim_next).
"""

from __future__ import annotations

from sqlalchemy import select

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.research import ResearchFollowup
from coffee_export.research.common import (
    FOLLOWUP_STATUSES,
    FOLLOWUP_TRANSITIONS,
    RESEARCH_TASK_TYPES,
    ResearchNotFoundError,
    canonical_json,
    new_followup_id,
)
from coffee_export.research.facts import _OrgScopedService
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

#: followup_type values = RESEARCH_TASK_TYPES minus the "research." prefix.
FOLLOWUP_TYPES: tuple[str, ...] = tuple(t.removeprefix("research.") for t in RESEARCH_TASK_TYPES)


class ResearchFollowups(_OrgScopedService):
    """Org-scoped lifecycle service for persistent research follow-ups."""

    # ── scheduling ────────────────────────────────────────────────

    def schedule(
        self,
        followup_type: str,
        *,
        due_ts: str,
        payload: dict | None = None,
        session_id: str | None = None,
        subject_type: str | None = None,
        subject_id: str | None = None,
        created_by: str,
    ) -> ResearchFollowup:
        """Schedule one future research action.

        due_ts is an ISO-8601 +03:00 string (lexicographically sortable —
        now_addis_iso form; the sweep/dispatch comparisons are string
        comparisons on purpose). payload is merged into the enqueued
        task's payload. created_by is required actor attribution.
        """
        if followup_type not in FOLLOWUP_TYPES:
            raise ValueError(
                f"followup_type must be one of {FOLLOWUP_TYPES}, got {followup_type!r}"
            )
        if not due_ts or not isinstance(due_ts, str) or not due_ts.strip():
            raise ValueError("due_ts is required (ISO-8601 +03:00 string)")
        if not created_by or not created_by.strip():
            raise ValueError("created_by is required (actor attribution)")
        if payload is not None and not isinstance(payload, dict):
            raise ValueError("payload must be a JSON object (dict) or None")
        if (subject_type is None) != (subject_id is None):
            raise ValueError("subject_type and subject_id must be given together")
        row = ResearchFollowup(
            followup_id=new_followup_id(),
            organization_id=self.organization_id,
            followup_type=followup_type,
            session_id=session_id,
            subject_type=subject_type,
            subject_id=subject_id,
            due_ts=due_ts.strip(),
            status="scheduled",
            payload=canonical_json(payload or {}),
            created_by=created_by,
            created_ts=now_addis_iso(),
            updated_ts=now_addis_iso(),
        )
        with self._session_factory() as session:
            session.add(row)
            session.commit()
            log.info(
                "research followup scheduled: %s (%s, due %s) for org %s",
                row.followup_id,
                row.followup_type,
                row.due_ts,
                self.organization_id,
            )
            return row

    # ── reads (org-scoped) ────────────────────────────────────────

    def get_followup(self, followup_id: str) -> ResearchFollowup:
        """One followup for THIS org. Missing and other-tenant raise the
        same ResearchNotFoundError (no existence oracle)."""
        with self._session_factory() as session:
            row = self._require_row(session, followup_id)
            return row

    def list_followups(
        self,
        *,
        status: str | None = None,
        limit: int = 100,
    ) -> list[ResearchFollowup]:
        """Followups for THIS org, due-soonest first, optionally
        status-filtered."""
        if status is not None and status not in FOLLOWUP_STATUSES:
            raise ValueError(f"status must be one of {FOLLOWUP_STATUSES}, got {status!r}")
        with self._session_factory() as session:
            stmt = (
                select(ResearchFollowup)
                .where(ResearchFollowup.organization_id == self.organization_id)
                .order_by(ResearchFollowup.due_ts, ResearchFollowup.followup_id)
                .limit(limit)
            )
            if status is not None:
                stmt = stmt.where(ResearchFollowup.status == status)
            return list(session.execute(stmt).scalars().all())

    # ── sanctioned transitions ───────────────────────────────────

    def cancel_followup(self, followup_id: str) -> ResearchFollowup:
        """scheduled → cancelled (operator decision, pre-dispatch only).

        Once the dispatcher created a durable task the task row is the
        execution record: cancelling this row would not stop the task,
        so the transition is simply not sanctioned."""
        return self._transition(followup_id, "cancelled")

    def mark_enqueued(self, followup_id: str, *, task_id: str) -> ResearchFollowup:
        """scheduled → enqueued with the created task_id (dispatcher)."""
        if not task_id or not task_id.strip():
            raise ValueError("task_id is required (the created agent_tasks row)")
        return self._transition(
            followup_id,
            "enqueued",
            mutate=lambda row: setattr(row, "task_id", task_id),
        )

    def mark_done(self, followup_id: str) -> ResearchFollowup:
        """enqueued → done (the task completed; handler closes the loop)."""
        return self._transition(followup_id, "done")

    def mark_failed(self, followup_id: str, error_message: str) -> ResearchFollowup:
        """scheduled|enqueued → failed with an honest reason (unknown task
        type at dispatch, or the task terminally failed).

        The reason is logged here and — for enqueued failures — also lives
        in the task row's last_error; the followup table itself stays
        minimal (no error column) by Phase 3 design."""
        if not error_message or not error_message.strip():
            raise ValueError("error_message is required (honest failure reason)")
        row = self._transition(followup_id, "failed")
        log.warning(
            "research followup %s (org %s) failed: %s",
            followup_id,
            self.organization_id,
            error_message,
        )
        return row

    # ── internals ──────────────────────────────────────────────────

    def _require_row(self, session, followup_id: str) -> ResearchFollowup:
        row = session.execute(
            select(ResearchFollowup).where(
                ResearchFollowup.followup_id == followup_id,
                ResearchFollowup.organization_id == self.organization_id,
            )
        ).scalar_one_or_none()
        if row is None:
            raise ResearchNotFoundError(f"research followup not found: {followup_id}")
        return row

    def _transition(
        self,
        followup_id: str,
        target: str,
        *,
        mutate=None,
    ) -> ResearchFollowup:
        """Apply one sanctioned followup transition."""
        with self._session_factory() as session:
            row = self._require_row(session, followup_id)
            allowed = FOLLOWUP_TRANSITIONS.get(row.status, frozenset())
            if target not in allowed:
                raise ValueError(
                    f"unsanctioned followup transition: {row.status} → {target} "
                    f"(allowed from {row.status}: {sorted(allowed)})"
                )
            row.status = target
            if mutate is not None:
                mutate(row)
            row.updated_ts = now_addis_iso()
            session.commit()
            return row
