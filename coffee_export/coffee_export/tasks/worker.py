"""
Durable task queue worker — a dedicated Python process (Phase 1A).

Run:   python -m coffee_export.tasks.worker

Lifecycle:
  * singleton — flock(LOCK_EX|LOCK_NB) on TASK_WORKER_LOCK_FILE
    (data/worker.lock, resolved against BASE_DIR). A second worker exits
    immediately with code 3 instead of double-claiming. The OS releases
    the lock if the process dies, so a crashed worker never wedges the
    slot; its leased rows are recovered by the reaper.
  * poll — every TASK_QUEUE_POLL_INTERVAL_SECONDS (5s) when idle.
  * claim → validate (gate 2) → run handler → complete, all fenced by
    the claim's lease token.
  * failure classification — gate-2 rejections (unregistered type,
    invalid JSON, validator rejection) are NON-retryable: the task
    terminates as `failed` on its first attempt. Handler exceptions are
    classified: NonRetryableTaskError → `failed` (terminal); any other
    exception stays retryable (pending w/ backoff → dead when the budget
    is exhausted) — the conservative at-least-once default.
  * heartbeat — while a handler runs, a daemon thread renews the lease
    every TASK_QUEUE_HEARTBEAT_SECONDS (100s) against the 300s TTL. If a
    renewal is fenced out (lease lost), the worker finishes the handler
    but DISCARDS the result — it never overwrites the new owner's row.
  * reaper — a reap_expired() pass every TASK_QUEUE_REAPER_INTERVAL_SECONDS
    (60s), recovering tasks from workers that died mid-task.
  * followup pass (Phase 3) — every TASK_WORKER_FOLLOWUP_INTERVAL_SECONDS
    (60s), when the worker was built with a followup_engine:
    reconcile_followups (converge followup rows to their task's terminal
    state — the crash/restart recovery path) then dispatch_due_followups
    (enqueue DUE research followups as research.* tasks). Both calls are
    _guarded: a followup-pass failure is logged and never kills the
    worker. Without a followup_engine the pass is disabled — the Phase
    1A behavior is unchanged.
  * hooks (Phase 3) — a WorkerHooks instance receives on_claimed /
    on_completed / on_failed events (observability; a raising hook is
    caught and logged, never fatal). The default no-op hooks keep the
    loop identical when nothing is wired.
  * graceful shutdown — SIGTERM/SIGINT stop claiming; a running task is
    finished first; exit 0. A hard kill leaves the lease to expire and
    the reaper to recover — safe by design.

On SQLite exactly ONE worker process is supported (deployment contract);
the lock enforces it. Multiple PG workers are the future deployment mode
(see docs — runtime testing on PG is a future requirement).
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import signal
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Any

from coffee_export.config import BASE_DIR, settings
from coffee_export.tasks.durable_queue import DurableTaskQueue, create_queue_engine
from coffee_export.tasks.registry import (
    NonRetryableTaskError,
    PayloadValidationError,
    TaskRegistry,
    TaskSnapshot,
    UnknownTaskTypeError,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

EXIT_OK = 0
EXIT_LOCKED = 3  # another worker holds the singleton lock


class WorkerHooks:
    """Observability hooks for the worker loop (Phase 3, §12.4).

    Subclasses (or monkeypatched instances) receive task events as they
    happen: claimed, completed, terminally failed. Hooks are pure
    observers — they must never write to the DB or mutate task state,
    and a raising hook is caught and logged so observability can never
    take the worker down. Lease-lost outcomes are deliberately silent
    here (they are logged; the task belongs to another claim).

    Wire metrics/alerting by subclassing and passing ``hooks=`` to
    TaskWorker; the default no-op instance changes nothing.
    """

    def on_claimed(self, task_id: str, task_type: str, organization_id: str, attempts: int) -> None:
        """A task was claimed (before validation/execution)."""

    def on_completed(self, task_id: str, task_type: str, organization_id: str, result: Any) -> None:
        """A task completed successfully (result = the handler's return)."""

    def on_failed(
        self,
        task_id: str,
        task_type: str,
        organization_id: str,
        error: str,
        *,
        status: str,
    ) -> None:
        """A task terminally failed — status is 'failed' or 'dead'."""


def _resolve_lock_path() -> Path:
    p = Path(settings.TASK_WORKER_LOCK_FILE)
    if not p.is_absolute():
        p = BASE_DIR / p
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


class _Heartbeat:
    """Renews the lease of the running task until stopped.

    On the first fenced-out renewal the heartbeat stops and raises the
    lease_lost flag: the worker will finish the handler but must discard
    its result (another claim owns the task now)."""

    def __init__(self, queue: DurableTaskQueue, task_id: str, token: str, interval: float):
        self._queue = queue
        self._task_id = task_id
        self._token = token
        self._interval = interval
        self._stop_event = threading.Event()
        self.lease_lost = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, name="lease-heartbeat", daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        # wait(interval) returns False on timeout → renew; True → stop.
        while not self._stop_event.wait(self._interval):
            try:
                ok = self._queue.renew(self._task_id, self._token)
            except Exception:  # DB hiccup — keep beating, log loudly
                log.exception("heartbeat renewal error (will retry)")
                continue
            if not ok:
                self.lease_lost = True
                log.warning("lease lost while running task %s", self._task_id)
                return

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=self._interval + 5)


class TaskWorker:
    """The claim/execute loop. All timings are injectable for tests."""

    def __init__(
        self,
        queue: DurableTaskQueue,
        registry: TaskRegistry,
        *,
        poll_interval: float | None = None,
        heartbeat_interval: float | None = None,
        reaper_interval: float | None = None,
        lock_path: Path | str | None = None,
        owner: str | None = None,
        install_signals: bool = True,
        hooks: WorkerHooks | None = None,
        followup_engine: Any | None = None,
        followup_interval: float | None = None,
    ):
        self._queue = queue
        self._registry = registry
        self._poll = (
            settings.TASK_QUEUE_POLL_INTERVAL_SECONDS if poll_interval is None else poll_interval
        )
        self._heartbeat = (
            settings.TASK_QUEUE_HEARTBEAT_SECONDS
            if heartbeat_interval is None
            else heartbeat_interval
        )
        self._reaper = (
            settings.TASK_QUEUE_REAPER_INTERVAL_SECONDS
            if reaper_interval is None
            else reaper_interval
        )
        self._lock_path = _resolve_lock_path() if lock_path is None else Path(lock_path)
        self._owner = owner
        self._install_signals = install_signals
        self._hooks = hooks if hooks is not None else WorkerHooks()
        # Phase 3: research followup dispatch (None → pass disabled —
        # the Phase 1A behavior is unchanged for callers that opt out).
        self._followup_engine = followup_engine
        self._followup_interval = (
            settings.TASK_WORKER_FOLLOWUP_INTERVAL_SECONDS
            if followup_interval is None
            else followup_interval
        )
        self._stop = threading.Event()
        self._lock_fd: int | None = None
        self._lease_ttl = settings.TASK_QUEUE_LEASE_TTL_SECONDS

    # ── singleton lock ─────────────────────────────────────────
    def acquire_lock(self) -> bool:
        """flock the lock file. Returns False if another worker holds it."""
        fd = os.open(self._lock_path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            return False
        os.truncate(fd, 0)
        os.write(fd, f"{os.getpid()}\n".encode())
        self._lock_fd = fd
        return True

    def release_lock(self) -> None:
        if self._lock_fd is not None:
            fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
            os.close(self._lock_fd)
            self._lock_fd = None

    # ── signals ────────────────────────────────────────────────
    def request_stop(self, *_args: Any) -> None:
        """Signal handler / test hook: stop claiming, finish current task."""
        if not self._stop.is_set():
            log.info("stop requested — finishing the running task, then exiting")
        self._stop.set()

    def _maybe_install_signals(self) -> None:
        if not self._install_signals:
            return
        signal.signal(signal.SIGTERM, self.request_stop)
        signal.signal(signal.SIGINT, self.request_stop)

    # ── main loop ──────────────────────────────────────────────
    def run(self) -> int:
        """Blocking. Returns a process exit code."""
        if not self.acquire_lock():
            log.error(
                "another worker already holds %s — refusing to start "
                "(exactly one worker process is the SQLite deployment contract)",
                self._lock_path,
            )
            return EXIT_LOCKED
        owner = self._owner or f"worker-{socket.gethostname()}-{os.getpid()}"
        self._maybe_install_signals()
        log.info(
            "worker %s started (poll=%.0fs heartbeat=%.0fs reaper=%.0fs ttl=%.0fs)",
            owner,
            self._poll,
            self._heartbeat,
            self._reaper,
            self._lease_ttl,
        )
        next_reap = time.monotonic()
        next_followup = time.monotonic()
        try:
            while not self._stop.is_set():
                now = time.monotonic()
                if now >= next_reap:
                    self._guarded(self._reap_pass)
                    next_reap = now + self._reaper
                if self._followup_engine is not None and now >= next_followup:
                    self._guarded(self._followup_pass)
                    next_followup = now + self._followup_interval
                if self._stop.is_set():
                    break
                claimed = self._guarded(lambda: self._claim_once(owner))
                if not claimed:
                    self._stop.wait(self._poll)
        finally:
            self.release_lock()
        log.info("worker %s shut down gracefully", owner)
        return EXIT_OK

    def _guarded(self, fn) -> bool:
        """Run one step; an unexpected error must never kill the worker —
        a crashed iteration leaves at worst a leased row for the reaper."""
        try:
            return fn()
        except Exception:
            log.exception("worker iteration failed — continuing")
            return False

    def _reap_pass(self) -> bool:
        summary = self._queue.reap_expired()
        return summary["examined"] > 0

    def _followup_pass(self) -> bool:
        """Reconcile + dispatch research followups (Phase 3). Lazy import:
        the research bridge is only pulled into workers that opted in."""
        from coffee_export.tasks.research_tasks import (
            dispatch_due_followups,
            reconcile_followups,
        )

        reconcile_followups(self._queue, self._followup_engine)
        summary = dispatch_due_followups(self._queue, self._followup_engine)
        return summary["enqueued"] > 0 or summary["failed"] > 0

    def _claim_once(self, owner: str) -> bool:
        task = self._queue.claim_next(owner)
        if task is None:
            return False
        self._execute(task)
        return True

    def run_once(self, owner: str | None = None) -> bool:
        """One claim+execute pass. The real loop is run(); this exists so
        tests can drive single iterations deterministically."""
        owner = owner or self._owner or f"worker-{socket.gethostname()}-{os.getpid()}"
        return self._claim_once(owner)

    def run_followup_pass(self) -> bool:
        """One reconcile+dispatch pass (Phase 3) — the test/CLI analogue
        of run_once for the followup loop."""
        if self._followup_engine is None:
            return False
        return self._followup_pass()

    # ── hook plumbing (observability, never fatal) ───────────────
    def _safe_hook(self, event: str, *args, **kwargs) -> None:
        try:
            getattr(self._hooks, event)(*args, **kwargs)
        except Exception:  # noqa: BLE001 — a hook bug must never kill the worker
            log.exception("worker hook %s raised (ignored)", event)

    # ── execution (gate 2: validate before running) ─────────────
    # Gate-2 rejections are NON-retryable by nature: a deregistered type
    # can never succeed on retry, a corrupt payload is permanent, and a
    # validator rejection is deterministic. All three terminate as
    # `failed` in one attempt — no more pointless pending → leased →
    # pending cycling of tampered rows.
    def _execute(self, task) -> None:
        self._safe_hook(
            "on_claimed", task.task_id, task.task_type, task.organization_id, task.attempts
        )
        # 2a. registry still knows the type?
        try:
            spec = self._registry.require(task.task_type)
        except UnknownTaskTypeError:
            self._fail_with_hook(
                task,
                f"task type no longer registered: {task.task_type}",
                retryable=False,
            )
            return

        # 2b. payload parses as JSON?
        try:
            payload = json.loads(task.payload_text) if task.payload_text else {}
        except (json.JSONDecodeError, TypeError) as exc:
            self._fail_with_hook(task, f"payload is not valid JSON: {exc}", retryable=False)
            return

        # 2c. payload passes the validator?
        try:
            payload = self._registry.validate_payload(task.task_type, payload)
        except PayloadValidationError as exc:
            self._fail_with_hook(task, f"payload validation failed: {exc}", retryable=False)
            return

        snapshot = TaskSnapshot(
            task_id=task.task_id,
            task_type=task.task_type,
            organization_id=task.organization_id,
            attempts=task.attempts,
            payload=payload,
        )

        heartbeat = _Heartbeat(self._queue, task.task_id, task.token, self._heartbeat)
        heartbeat.start()
        try:
            try:
                result = spec.handler(payload, snapshot)
            except Exception as exc:
                log.exception("task %s failed on attempt %d", task.task_id, task.attempts)
                # Handler-side classification: only NonRetryableTaskError is
                # permanent — everything else (network blips, transient DB
                # errors, unexpected bugs) keeps the conservative
                # at-least-once retry default.
                retryable = not isinstance(exc, NonRetryableTaskError)
                outcome = self._fail_with_hook(task, exc, retryable=retryable)
                if outcome is None:
                    log.warning(
                        "task %s: failure could not be recorded — lease lost; "
                        "the task is owned by another claim now",
                        task.task_id,
                    )
                return
            if heartbeat.lease_lost:
                log.warning(
                    "task %s: lease lost during execution — result discarded, "
                    "the task is owned by another claim now",
                    task.task_id,
                )
                return
            if not self._queue.complete(task.task_id, task.token, result):
                # complete() already logged the fencing loss.
                return
            self._safe_hook(
                "on_completed", task.task_id, task.task_type, task.organization_id, result
            )
        finally:
            heartbeat.stop()

    def _fail_with_hook(self, task, error, *, retryable: bool):
        """Fail a task through the queue and fire the on_failed hook when
        the failure is TERMINAL (failed/dead — queue.fail returns the
        outcome string). A retry outcome fires nothing (the task will run
        again); a fenced-out failure (None) fires nothing either — the
        task belongs to another claim."""
        outcome = self._queue.fail(
            task.task_id,
            task.token,
            error,
            retryable=retryable,
        )
        if outcome in ("failed", "dead"):
            self._safe_hook(
                "on_failed",
                task.task_id,
                task.task_type,
                task.organization_id,
                str(error)[:2000],
                status=outcome,
            )
        return outcome


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m coffee_export.tasks.worker",
        description="Durable task queue worker (Phase 1A). Singleton via lock file.",
    )
    parser.parse_args(argv)  # no options yet — everything is config-driven

    from coffee_export.tasks.registry import default_registry
    from coffee_export.utils.logging import setup_logging

    setup_logging()  # console (stdout, for supervisor capture) + rotating file

    # Phase 3: the FIRST real business task registrations — the research
    # task types + the followup dispatch loop. The worker's queue engine
    # is forwarded so research writes share the queue's SQLite BEGIN
    # IMMEDIATE engine (one engine, no cross-engine lock contention).
    from coffee_export.tasks.research_tasks import register_research_tasks

    engine = create_queue_engine()
    register_research_tasks(default_registry, engine=engine)
    queue = DurableTaskQueue(default_registry, engine)
    worker = TaskWorker(queue, default_registry, followup_engine=engine)
    return worker.run()


if __name__ == "__main__":
    sys.exit(main())
