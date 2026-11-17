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
        try:
            while not self._stop.is_set():
                now = time.monotonic()
                if now >= next_reap:
                    self._guarded(self._reap_pass)
                    next_reap = now + self._reaper
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

    # ── execution (gate 2: validate before running) ─────────────
    # Gate-2 rejections are NON-retryable by nature: a deregistered type
    # can never succeed on retry, a corrupt payload is permanent, and a
    # validator rejection is deterministic. All three terminate as
    # `failed` in one attempt — no more pointless pending → leased →
    # pending cycling of tampered rows.
    def _execute(self, task) -> None:
        # 2a. registry still knows the type?
        try:
            spec = self._registry.require(task.task_type)
        except UnknownTaskTypeError:
            self._queue.fail(
                task.task_id,
                task.token,
                f"task type no longer registered: {task.task_type}",
                retryable=False,
            )
            return

        # 2b. payload parses as JSON?
        try:
            payload = json.loads(task.payload_text) if task.payload_text else {}
        except (json.JSONDecodeError, TypeError) as exc:
            self._queue.fail(
                task.task_id, task.token, f"payload is not valid JSON: {exc}", retryable=False
            )
            return

        # 2c. payload passes the validator?
        try:
            payload = self._registry.validate_payload(task.task_type, payload)
        except PayloadValidationError as exc:
            self._queue.fail(
                task.task_id, task.token, f"payload validation failed: {exc}", retryable=False
            )
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
                outcome = self._queue.fail(
                    task.task_id,
                    task.token,
                    exc,
                    retryable=not isinstance(exc, NonRetryableTaskError),
                )
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
        finally:
            heartbeat.stop()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m coffee_export.tasks.worker",
        description="Durable task queue worker (Phase 1A). Singleton via lock file.",
    )
    parser.parse_args(argv)  # no options yet — everything is config-driven

    from coffee_export.tasks.registry import default_registry
    from coffee_export.utils.logging import setup_logging

    setup_logging()  # console (stdout, for supervisor capture) + rotating file

    engine = create_queue_engine()
    queue = DurableTaskQueue(default_registry, engine)
    worker = TaskWorker(queue, default_registry)
    return worker.run()


if __name__ == "__main__":
    sys.exit(main())
