"""
Durable task queue service — Phase 1A.

At-least-once execution with lease fencing. Semantics (the contract the
worker depends on — see docs/phase-1a-durable-task-queue.md):

  enqueue(task_type, payload)   INSERT pending row. The task_type MUST be
                                 registered and the payload MUST pass the
                                 registry validator (gate 1).
  claim_next(owner)             pending → leased, atomically. A fresh UUID4
                                 lease_token is minted per claim; attempts
                                 is incremented; started_ts is set once.
  renew(task_id, token)         extend the lease — only the current
                                 lease-token holder succeeds.
  complete(task_id, token, ...) leased → completed — fenced: if the lease
                                 was lost (rowcount 0) the caller MUST
                                 discard its result and never retry blindly.
  fail(task_id, token, error)   leased → pending with exponential backoff
                                 (BASE * 2^(attempts-1)), or leased → dead
                                 when attempts >= max_attempts — fenced.
  reap_expired()                reaper: every leased row whose
                                 lease_expires_ts has passed is turned into
                                 a backoff-pending retry (or dead when
                                 exhausted) — this is the crash-recovery
                                 path for a worker that died mid-task.
                                 Idempotent under concurrent reapers.
  requeue(task_id)              operator action (admin CLI): dead → pending
                                 with a fresh retry budget.

Dialect handling:
  * SQLite   — the queue uses its OWN engine whose transactions all start
               with BEGIN IMMEDIATE (write lock up front), plus
               busy_timeout=TASK_QUEUE_SQLITE_BUSY_TIMEOUT_MS so concurrent
               claimers wait instead of failing. FOR UPDATE is a no-op on
               SQLite (verified: the dialect drops it) — BEGIN IMMEDIATE
               provides the serialization instead.
  * PostgreSQL — claims use SELECT ... FOR UPDATE SKIP LOCKED, the
               standard multi-worker pattern. NOTE: runtime testing
               against a real PostgreSQL server is a documented FUTURE
               REQUIREMENT (Phase 1A deployment target is SQLite only);
               see docs/phase-1a-durable-task-queue.md → Limitations.

Timestamps: ISO-8601 +03:00, seconds precision (now_addis_iso) —
lexicographically comparable, one convention for the whole queue.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Engine, create_engine, event, func, select, update
from sqlalchemy.engine import Row

from coffee_export.config import settings
from coffee_export.database.base import ADDIS_TZ, now_addis_iso
from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.tasks.registry import TaskRegistry
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

VALID_STATUSES = ("pending", "leased", "completed", "dead")
MAX_ERROR_LENGTH = 2000


def addis_iso_after(seconds: float, base: datetime | None = None) -> str:
    """ISO +03:00 timestamp `seconds` in the future (queue time arithmetic)."""
    base = base or datetime.now(ADDIS_TZ)
    return (base + timedelta(seconds=seconds)).isoformat(timespec="seconds")


def parse_iso(value: str) -> datetime:
    """Inverse of now_addis_iso (for tests and arithmetic)."""
    return datetime.fromisoformat(value)


def _dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


@dataclass(frozen=True)
class ClaimedTask:
    """A task claimed by this caller. `token` is the fencing credential:
    pass it unchanged to complete/fail/renew — anything else is rejected."""

    task_id: str
    task_type: str
    organization_id: str
    attempts: int
    max_attempts: int
    payload_text: str | None
    token: str
    lease_owner: str
    lease_expires_ts: str


@dataclass(frozen=True)
class TaskRow:
    """Read-only view of a row (list/show/stats + worker snapshot)."""

    task_id: str
    task_type: str
    status: str
    organization_id: str
    attempts: int
    max_attempts: int
    priority: int
    scheduled_ts: str
    created_ts: str
    updated_ts: str
    lease_token: str | None
    lease_owner: str | None
    lease_expires_ts: str | None
    started_ts: str | None
    completed_ts: str | None
    last_error: str | None
    payload: str | None
    result: str | None


def create_queue_engine(database_url: str | None = None) -> Engine:
    """Build the queue's dedicated engine.

    Separate from the shared app engine (database/base.py) on purpose:
    the queue needs BEGIN IMMEDIATE on SQLite, and that behavior must not
    leak into the application engine's transactions.
    """
    url = database_url or settings.DATABASE_URL
    if url.startswith("sqlite"):
        busy_timeout_ms = settings.TASK_QUEUE_SQLITE_BUSY_TIMEOUT_MS
        engine = create_engine(
            url,
            future=True,
            connect_args={
                "check_same_thread": False,
                # pysqlite `timeout` is the busy timeout in seconds —
                # keep it aligned with the PRAGMA below.
                "timeout": busy_timeout_ms / 1000,
            },
        )

        @event.listens_for(engine, "connect")
        def _queue_connect(dbapi_connection, connection_record):  # noqa: ARG001
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute(f"PRAGMA busy_timeout={busy_timeout_ms}")
            cursor.close()
            # pysqlite: disable implicit BEGIN so SQLAlchemy's "begin" event
            # can issue BEGIN IMMEDIATE (write lock up front, serialized
            # claimers — see SQLAlchemy docs, pysqlite section).
            dbapi_connection.isolation_level = None

        @event.listens_for(engine, "begin")
        def _queue_begin(conn):  # noqa: ARG001
            conn.exec_driver_sql("BEGIN IMMEDIATE")

        return engine

    # PostgreSQL (and any other pooling dialect)
    engine_kwargs: dict = {"future": True, "pool_pre_ping": True}
    if url.startswith("postgresql"):
        engine_kwargs["pool_size"] = 5
        engine_kwargs["max_overflow"] = 10
    return create_engine(url, **engine_kwargs)


_COLUMNS = (
    AgentTask.task_id,
    AgentTask.task_type,
    AgentTask.status,
    AgentTask.organization_id,
    AgentTask.attempts,
    AgentTask.max_attempts,
    AgentTask.priority,
    AgentTask.scheduled_ts,
    AgentTask.created_ts,
    AgentTask.updated_ts,
    AgentTask.lease_token,
    AgentTask.lease_owner,
    AgentTask.lease_expires_ts,
    AgentTask.started_ts,
    AgentTask.completed_ts,
    AgentTask.last_error,
    AgentTask.payload,
    AgentTask.result,
)


def _row_to_task_row(row: Row) -> TaskRow:
    return TaskRow(*row)


class DurableTaskQueue:
    """The durable queue service. One instance per process is enough."""

    def __init__(
        self,
        registry: TaskRegistry,
        engine: Engine | None = None,
        *,
        database_url: str | None = None,
        lease_ttl_seconds: int | None = None,
        backoff_base_seconds: int | None = None,
        default_priority: int | None = None,
        default_max_attempts: int | None = None,
    ) -> None:
        self._registry = registry
        self._engine = engine if engine is not None else create_queue_engine(database_url)
        self._lease_ttl = (
            settings.TASK_QUEUE_LEASE_TTL_SECONDS
            if lease_ttl_seconds is None
            else lease_ttl_seconds
        )
        self._backoff_base = (
            settings.TASK_QUEUE_BACKOFF_BASE_SECONDS
            if backoff_base_seconds is None
            else backoff_base_seconds
        )
        self._priority = (
            settings.TASK_QUEUE_DEFAULT_PRIORITY if default_priority is None else default_priority
        )
        self._max_attempts = (
            settings.TASK_QUEUE_MAX_ATTEMPTS
            if default_max_attempts is None
            else default_max_attempts
        )

    # ── properties ─────────────────────────────────────────────
    @property
    def engine(self) -> Engine:
        return self._engine

    @property
    def is_sqlite(self) -> bool:
        return self._engine.dialect.name == "sqlite"

    # ── enqueue ────────────────────────────────────────────────
    def enqueue(
        self,
        task_type: str,
        payload: dict | None = None,
        *,
        organization_id: str = "org-system",
        priority: int | None = None,
        max_attempts: int | None = None,
        scheduled_ts: str | None = None,
        scheduled_delay_seconds: float | None = None,
    ) -> str:
        """Insert a pending task. Registry-validated (gate 1): unknown
        task types and invalid payloads raise before anything is written.
        Returns the new task_id."""
        validated = self._registry.validate_payload(task_type, payload)
        now = now_addis_iso()
        if scheduled_ts is None:
            if scheduled_delay_seconds is not None:
                scheduled_ts = addis_iso_after(scheduled_delay_seconds)
            else:
                scheduled_ts = now
        task_id = str(uuid.uuid4())
        with self._engine.begin() as conn:
            conn.execute(
                AgentTask.__table__.insert().values(
                    task_id=task_id,
                    task_type=task_type,
                    payload=_dump_json(validated) if validated else None,
                    organization_id=organization_id,
                    status="pending",
                    priority=self._priority if priority is None else priority,
                    attempts=0,
                    max_attempts=self._max_attempts if max_attempts is None else max_attempts,
                    scheduled_ts=scheduled_ts,
                    created_ts=now,
                    updated_ts=now,
                )
            )
        log.info(
            f"enqueued {task_type} task {task_id} (org={organization_id}, "
            f"scheduled={scheduled_ts})"
        )
        return task_id

    # ── claim ──────────────────────────────────────────────────
    def claim_next(self, owner: str) -> ClaimedTask | None:
        """Atomically claim the next due pending task.

        SQLite: the whole transaction runs under BEGIN IMMEDIATE (the
        engine does this for every transaction) so SELECT + UPDATE cannot
        interleave with another claimer. PostgreSQL: SELECT ... FOR UPDATE
        SKIP LOCKED lets concurrent workers claim different rows.
        Returns None when no due task is available.
        """
        token = str(uuid.uuid4())  # fresh fencing credential per claim
        now = now_addis_iso()
        expires = addis_iso_after(self._lease_ttl)
        with self._engine.begin() as conn:
            candidate = conn.execute(
                select(AgentTask.task_id)
                .where(AgentTask.status == "pending", AgentTask.scheduled_ts <= now)
                .order_by(
                    AgentTask.priority,
                    AgentTask.scheduled_ts,
                    AgentTask.created_ts,
                    AgentTask.task_id,
                )
                .limit(1)
                .with_for_update(skip_locked=True)  # no-op on SQLite (verified)
            ).first()
            if candidate is None:
                return None
            task_id = candidate[0]
            claimed = conn.execute(
                update(AgentTask)
                .where(AgentTask.task_id == task_id, AgentTask.status == "pending")
                .values(
                    status="leased",
                    attempts=AgentTask.attempts + 1,
                    lease_token=token,
                    lease_owner=owner,
                    lease_expires_ts=expires,
                    started_ts=func.coalesce(AgentTask.started_ts, now),
                    updated_ts=now,
                )
            )
            if claimed.rowcount != 1:
                # Lost between the SELECT and the UPDATE (cannot happen on
                # SQLite under BEGIN IMMEDIATE; on PG SKIP LOCKED covers it).
                # Being defensive anyway: the invariant must never break.
                log.warning(f"claim race lost for {task_id} — treating as no-op")
                return None
            row = conn.execute(
                select(
                    AgentTask.task_id,
                    AgentTask.task_type,
                    AgentTask.organization_id,
                    AgentTask.attempts,
                    AgentTask.max_attempts,
                    AgentTask.payload,
                    AgentTask.lease_token,
                    AgentTask.lease_owner,
                    AgentTask.lease_expires_ts,
                ).where(AgentTask.task_id == task_id)
            ).one()
        log.info(f"claimed {row.task_type} task {task_id} by {owner} (attempt {row.attempts})")
        return ClaimedTask(
            task_id=row.task_id,
            task_type=row.task_type,
            organization_id=row.organization_id,
            attempts=row.attempts,
            max_attempts=row.max_attempts,
            payload_text=row.payload,
            token=row.lease_token,
            lease_owner=row.lease_owner,
            lease_expires_ts=row.lease_expires_ts,
        )

    # ── lease operations (all fenced by token) ─────────────────
    def complete(self, task_id: str, token: str, result: Any = None) -> bool:
        """leased → completed. Returns False if the lease was lost — the
        caller must then DISCARD its result (another claim owns the task)."""
        now = now_addis_iso()
        with self._engine.begin() as conn:
            done = conn.execute(
                update(AgentTask)
                .where(
                    AgentTask.task_id == task_id,
                    AgentTask.status == "leased",
                    AgentTask.lease_token == token,
                )
                .values(
                    status="completed",
                    result=_dump_json(result) if result is not None else None,
                    completed_ts=now,
                    lease_token=None,
                    lease_owner=None,
                    lease_expires_ts=None,
                    updated_ts=now,
                )
            )
            if done.rowcount != 1:
                log.warning(
                    f"complete fenced out for {task_id} — lease lost; "
                    "result discarded by contract"
                )
                return False
        log.info(f"completed task {task_id}")
        return True

    def fail(self, task_id: str, token: str, error: str | Exception) -> str | None:
        """leased → pending with exponential backoff, or → dead when
        attempts >= max_attempts. Returns "retry" | "dead", or None if the
        lease was lost (fenced out — another claim owns the task)."""
        if isinstance(error, Exception):
            error = f"{type(error).__name__}: {error}"
        error = str(error)[:MAX_ERROR_LENGTH]
        now = now_addis_iso()
        with self._engine.begin() as conn:
            current = conn.execute(
                select(AgentTask.attempts, AgentTask.max_attempts).where(
                    AgentTask.task_id == task_id,
                    AgentTask.status == "leased",
                    AgentTask.lease_token == token,
                )
            ).first()
            if current is None:
                log.warning(
                    f"fail fenced out for {task_id} — lease lost; " "task left to its current owner"
                )
                return None
            attempts, max_attempts = current
            dead = attempts >= max_attempts
            if dead:
                values = dict(
                    status="dead",
                    # scheduled_ts keeps its old value — dead rows are not runnable
                    lease_token=None,
                    lease_owner=None,
                    lease_expires_ts=None,
                    last_error=error,
                    updated_ts=now,
                )
            else:
                backoff = self._backoff_base * (2 ** max(attempts - 1, 0))
                values = dict(
                    status="pending",
                    scheduled_ts=addis_iso_after(backoff),
                    lease_token=None,
                    lease_owner=None,
                    lease_expires_ts=None,
                    last_error=error,
                    updated_ts=now,
                )
            fenced = conn.execute(
                update(AgentTask)
                .where(
                    AgentTask.task_id == task_id,
                    AgentTask.status == "leased",
                    AgentTask.lease_token == token,
                )
                .values(**values)
            )
            if fenced.rowcount != 1:
                # Cover the (impossible under BEGIN IMMEDIATE) window between
                # the SELECT above and this UPDATE.
                log.warning(f"fail fenced out for {task_id} — lease lost mid-fail")
                return None
        outcome = "dead" if dead else "retry"
        log.warning(f"task {task_id} failed (attempt {attempts}/{max_attempts}) → {outcome}")
        return outcome

    def renew(self, task_id: str, token: str, *, extend_seconds: int | None = None) -> bool:
        """Extend the lease of a running task. Only the current lease-token
        holder succeeds. Used by the worker heartbeat."""
        now = now_addis_iso()
        ttl = self._lease_ttl if extend_seconds is None else extend_seconds
        with self._engine.begin() as conn:
            renewed = conn.execute(
                update(AgentTask)
                .where(
                    AgentTask.task_id == task_id,
                    AgentTask.status == "leased",
                    AgentTask.lease_token == token,
                )
                .values(
                    lease_expires_ts=addis_iso_after(ttl),
                    updated_ts=now,
                )
            )
            if renewed.rowcount != 1:
                log.warning(f"renew fenced out for {task_id} — lease lost")
                return False
        return True

    # ── reaper (crash recovery) ─────────────────────────────────
    def reap_expired(self) -> dict:
        """Every leased row whose lease_expires_ts has passed → pending
        with backoff (retry budget preserved), or → dead when exhausted.
        Idempotent: a row already recovered by a concurrent reaper simply
        no longer matches the fenced UPDATE below."""
        now = now_addis_iso()
        requeued = 0
        dead = 0
        with self._engine.begin() as conn:
            expired = conn.execute(
                select(AgentTask.task_id, AgentTask.attempts, AgentTask.max_attempts)
                .where(AgentTask.status == "leased", AgentTask.lease_expires_ts <= now)
                .order_by(AgentTask.lease_expires_ts)
            ).all()
            for task_id, attempts, max_attempts in expired:
                is_dead = attempts >= max_attempts
                if is_dead:
                    values = dict(
                        status="dead",
                        last_error="lease expired; recovered by reaper",
                        lease_token=None,
                        lease_owner=None,
                        lease_expires_ts=None,
                        updated_ts=now,
                    )
                else:
                    backoff = self._backoff_base * (2 ** max(attempts - 1, 0))
                    values = dict(
                        status="pending",
                        scheduled_ts=addis_iso_after(backoff),
                        last_error="lease expired; recovered by reaper",
                        lease_token=None,
                        lease_owner=None,
                        lease_expires_ts=None,
                        updated_ts=now,
                    )
                recovered = conn.execute(
                    update(AgentTask)
                    .where(
                        AgentTask.task_id == task_id,
                        AgentTask.status == "leased",
                        AgentTask.lease_expires_ts <= now,
                    )
                    .values(**values)
                )
                if recovered.rowcount == 1:
                    if is_dead:
                        dead += 1
                    else:
                        requeued += 1
        if expired:
            log.warning(f"reaper recovered {requeued} task(s) to pending and buried {dead} as dead")
        return {"examined": len(expired), "requeued": requeued, "dead": dead}

    # ── operator actions ───────────────────────────────────────
    def requeue(self, task_id: str, *, reset_attempts: bool = True) -> bool:
        """dead → pending (admin CLI). Gives a fresh retry budget by
        default; scheduled immediately. Only dead rows are requeueable."""
        now = now_addis_iso()
        with self._engine.begin() as conn:
            requeued = conn.execute(
                update(AgentTask)
                .where(AgentTask.task_id == task_id, AgentTask.status == "dead")
                .values(
                    status="pending",
                    attempts=0 if reset_attempts else AgentTask.attempts,
                    scheduled_ts=now,
                    lease_token=None,
                    lease_owner=None,
                    lease_expires_ts=None,
                    completed_ts=None,
                    updated_ts=now,
                )
            )
            if requeued.rowcount != 1:
                log.warning(f"requeue rejected for {task_id} — not a dead task")
                return False
        log.info(f"requeued dead task {task_id} → pending")
        return True

    # ── read-only helpers (CLI / tests) ─────────────────────────
    def get_task(self, task_id: str) -> TaskRow | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(*_COLUMNS).where(AgentTask.task_id == task_id)).first()
        return _row_to_task_row(row) if row is not None else None

    def list_tasks(self, status: str | None = None, limit: int = 50) -> list[TaskRow]:
        if status is not None and status not in VALID_STATUSES:
            raise ValueError(f"invalid status {status!r}; expected one of {VALID_STATUSES}")
        stmt = select(*_COLUMNS)
        if status is not None:
            stmt = stmt.where(AgentTask.status == status)
        stmt = stmt.order_by(AgentTask.created_ts.desc(), AgentTask.task_id.desc()).limit(limit)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [_row_to_task_row(r) for r in rows]

    def stats(self) -> dict[str, int]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                select(AgentTask.status, func.count()).group_by(AgentTask.status)
            ).all()
        counts = {status: 0 for status in VALID_STATUSES}
        for status, count in rows:
            counts[status] = count
        return counts
