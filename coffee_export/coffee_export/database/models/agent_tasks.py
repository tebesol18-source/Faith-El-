"""
Durable Task Queue model — agent_tasks table (Phase 1A).

Infrastructure table for the durable task queue
(coffee_export/tasks/durable_queue.py + worker.py). It is NOT wired to
any business job in Phase 1A: the task registry ships empty and nothing
in the application enqueues work. See docs/phase-1a-durable-task-queue.md
for the full design contract.

State machine — five-state contract (lease fencing: only the current
lease_token holder may complete / fail / renew):

    pending ──claim──▶ leased ──complete──▶ completed
       ▲                  │
       │ retryable fail,  │ retryable fail, attempts ≥ max_attempts
       │ budget remains   ├──▶ dead   ──requeue (admin)──┐
       └──────────────────┤                             ▼
                          │ non-retryable fail     pending
                          └──▶ failed ──requeue (admin)──┘

    completed is terminal and immutable (history); failed is the
    terminal NON-retryable failure (unregistered type, corrupt payload,
    validator rejection, handler-raised NonRetryableTaskError); dead is
    retryable failures with the budget exhausted. The reaper routes
    expired leases pending/dead — never failed.

Timestamps are ISO-8601 +03:00 with seconds precision (now_addis_iso) so
they sort lexicographically — same convention as every other table.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from coffee_export.database.base import Base


class AgentTask(Base):
    """One durable task. Row lifecycle is owned by DurableTaskQueue."""

    __tablename__ = "agent_tasks"

    task_id: Mapped[str] = mapped_column(Text, primary_key=True)
    task_type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[str | None] = mapped_column(Text)  # JSON object
    # Attribution/audit stamp — NO default: enqueue() requires an explicit
    # org (SYSTEM_ORG for genuine system scope). A silent org-system
    # fallback caused two tenant-misattribution incidents in this
    # codebase's history; direct SQL inserts without an org fail NOT NULL.
    organization_id: Mapped[str] = mapped_column(Text, nullable=False)

    # pending | leased | completed | failed | dead
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    scheduled_ts: Mapped[str] = mapped_column(Text, nullable=False)
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    # Lease fencing — a fresh UUID4 per claim. Never key fencing off
    # lease_owner: two claims by the same owner must not both be valid.
    lease_token: Mapped[str | None] = mapped_column(Text)
    lease_owner: Mapped[str | None] = mapped_column(Text)  # informational only
    lease_expires_ts: Mapped[str | None] = mapped_column(Text)

    started_ts: Mapped[str | None] = mapped_column(Text)  # first claim time
    completed_ts: Mapped[str | None] = mapped_column(Text)
    last_error: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)  # JSON

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'leased', 'completed', 'failed', 'dead')",
            name="ck_agent_tasks_status",
        ),
        CheckConstraint("attempts >= 0", name="ck_agent_tasks_attempts"),
        CheckConstraint("max_attempts >= 1", name="ck_agent_tasks_max_attempts"),
        CheckConstraint("priority >= 0", name="ck_agent_tasks_priority"),
        # Claim path: WHERE status='pending' AND scheduled_ts <= now
        # ORDER BY priority, scheduled_ts, created_ts
        Index("ix_agent_tasks_status_scheduled", "status", "scheduled_ts"),
        Index("ix_agent_tasks_task_type", "task_type"),
        Index("ix_agent_tasks_org", "organization_id"),
    )

    def __repr__(self) -> str:
        return f"<AgentTask {self.task_id}: {self.task_type} ({self.status})>"
