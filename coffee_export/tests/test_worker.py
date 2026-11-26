"""
Durable task queue worker tests — Phase 1A.

Proves the worker lifecycle contract on disposable DBs (tmp_path):

  * execution — claim → gate-2 validation → handler → fenced complete
  * heartbeat — the lease is renewed while a handler runs, so a task
    longer than the TTL never loses its lease
  * lease loss mid-run — if the reaper recovers the task while the
    handler is still running (worker too slow), the worker DISCARDS its
    result instead of overwriting the new owner's row
  * handler failure — fenced fail with backoff; exhausted → dead.
    NonRetryableTaskError from a handler → failed immediately (one
    attempt, no retry cycling); any other exception stays retryable
  * tampered payload — a row mutated directly in the DB fails gate 2
    and is never executed; gate-2 rejections are non-retryable, so the
    task terminates as failed on its FIRST attempt
  * unregistered type — gate 2a: a type the worker no longer knows can
    never succeed on retry → failed on the first attempt
  * graceful shutdown — SIGTERM stops claiming, finishes the running
    task, exits 0 (real subprocess)
  * singleton lock — a second worker refuses to start (in-process flock
    semantics + real subprocess exit code 3)

Timings are scaled down (sub-second TTLs) but the code paths are the
production ones.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from sqlalchemy import text

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.tasks.durable_queue import (
    DurableTaskQueue,
    create_queue_engine,
    parse_iso,
)
from coffee_export.tasks.registry import (
    NonRetryableTaskError,
    PayloadValidationError,
    TaskRegistry,
)
from coffee_export.tasks.worker import EXIT_LOCKED, EXIT_OK, TaskWorker


def _make_queue(
    tmp_path: Path,
    name: str,
    *,
    lease_ttl: float,
    heartbeat: float,
    backoff_base: float = 1,
    poll: float = 0.05,
) -> tuple[DurableTaskQueue, TaskRegistry]:
    url = f"sqlite:///{tmp_path}/{name}.db"
    engine = create_queue_engine(url)
    AgentTask.__table__.create(engine)
    reg = TaskRegistry()

    def echo(payload, snapshot):
        return {"echo": payload, "attempt": snapshot.attempts}

    reg.register("test.echo", echo, validator=lambda p: None)
    queue = DurableTaskQueue(
        reg, engine, lease_ttl_seconds=lease_ttl, backoff_base_seconds=backoff_base
    )
    return queue, reg


def _make_worker(
    tmp_path: Path,
    queue: DurableTaskQueue,
    reg: TaskRegistry,
    *,
    heartbeat: float,
    reaper: float = 0.2,
    poll: float = 0.05,
    lock: str = "worker.lock",
) -> TaskWorker:
    return TaskWorker(
        queue,
        reg,
        poll_interval=poll,
        heartbeat_interval=heartbeat,
        reaper_interval=reaper,
        lock_path=tmp_path / lock,
        install_signals=False,
    )


# ── execution ─────────────────────────────────────────────────────


def test_run_once_executes_and_completes(tmp_path: Path):
    queue, reg = _make_queue(tmp_path, "exec", lease_ttl=300, heartbeat=100)
    worker = _make_worker(tmp_path, queue, reg, heartbeat=100)
    task_id = queue.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    assert worker.run_once() is True
    row = queue.get_task(task_id)
    assert row.status == "completed"
    assert json.loads(row.result) == {"echo": {"x": 1}, "attempt": 1}
    assert row.completed_ts is not None
    assert worker.run_once() is False  # queue drained


def test_run_once_no_tasks_is_noop(tmp_path: Path):
    queue, reg = _make_queue(tmp_path, "empty", lease_ttl=300, heartbeat=100)
    worker = _make_worker(tmp_path, queue, reg, heartbeat=100)
    assert worker.run_once() is False


# ── heartbeat ─────────────────────────────────────────────────────


def test_heartbeat_renews_lease_during_long_handler(tmp_path: Path):
    """Handler runs 1.6x the TTL; the heartbeat must keep the lease alive
    so the task completes normally at the end.

    TTL is kept >= 2s on purpose: queue timestamps are ISO strings with
    SECONDS precision (the stack-wide convention) — sub-second TTLs would
    make renewals invisible in string comparisons (truncation artifact),
    and production uses 300s where this is a non-issue."""
    queue, reg = _make_queue(tmp_path, "beat", lease_ttl=2.0, heartbeat=0.4)
    worker = _make_worker(tmp_path, queue, reg, heartbeat=0.4)

    started = threading.Event()

    def slow_handler(payload, snapshot):
        started.set()
        time.sleep(3.2)  # 1.6x TTL: without renewal the lease would expire
        return {"slow": True}

    reg.register("test.slow", slow_handler)
    task_id = queue.enqueue("test.slow", {}, organization_id="org-acme")

    done = threading.Event()

    def drive():
        worker.run_once()
        done.set()

    t = threading.Thread(target=drive)
    t.start()
    assert started.wait(5)
    time.sleep(2.6)  # 1.3x the original TTL — lease must have been extended past now
    row = queue.get_task(task_id)
    assert row.status == "leased"
    assert parse_iso(row.lease_expires_ts) > parse_iso(now_addis_iso())
    assert done.wait(10)
    t.join()
    row = queue.get_task(task_id)
    assert row.status == "completed"
    assert json.loads(row.result) == {"slow": True}


def test_lease_lost_mid_run_discards_result(tmp_path: Path):
    """Worker is too slow (heartbeat misses); the reaper recovers the task
    while the handler is still running. The worker must NOT overwrite the
    new owner's row: its complete() is fenced out and the result is
    discarded."""
    queue, reg = _make_queue(tmp_path, "lost", lease_ttl=0.5, heartbeat=0.9)
    worker = _make_worker(tmp_path, queue, reg, heartbeat=0.9)

    mid_run = threading.Event()
    reaped = threading.Event()

    def slow_handler(payload, snapshot):
        mid_run.set()
        reaped.wait(8)  # hold the task until the test reaps
        return {"must": "be-discarded"}

    reg.register("test.slow", slow_handler)
    task_id = queue.enqueue("test.slow", {}, organization_id="org-acme")

    done = threading.Event()

    def drive():
        worker.run_once()
        done.set()

    t = threading.Thread(target=drive)
    t.start()
    assert mid_run.wait(5)
    time.sleep(0.7)  # lease (0.5s) has now expired; heartbeat (0.9s) missed it
    summary = queue.reap_expired()
    assert summary["requeued"] == 1  # recovered to pending
    reaped.set()
    assert done.wait(10)
    t.join()

    row = queue.get_task(task_id)
    # the discarded result never landed; the task is pending for its next owner
    assert row.status == "pending"
    assert row.result is None
    assert row.attempts == 1
    assert "lease expired" in (row.last_error or "")


# ── failure path ──────────────────────────────────────────────────


def test_handler_failure_backoff_then_dead(tmp_path: Path):
    queue, reg = _make_queue(tmp_path, "fail", lease_ttl=300, heartbeat=100, backoff_base=1)
    worker = _make_worker(tmp_path, queue, reg, heartbeat=100)

    calls: list[int] = []

    def flaky(payload, snapshot):
        calls.append(snapshot.attempts)
        raise RuntimeError("kaboom")

    reg.register("test.flaky", flaky)
    task_id = queue.enqueue("test.flaky", {}, organization_id="org-acme")

    worker.run_once()
    row = queue.get_task(task_id)
    assert row.status == "pending"  # backoff (not dead) after attempt 1
    assert "kaboom" in row.last_error
    # backoff 1s — due soon; drive two more failures
    time.sleep(1.1)
    worker.run_once()
    row = queue.get_task(task_id)
    assert row.status == "pending" and row.attempts == 2
    time.sleep(2.2)  # backoff 2s for attempt 2
    worker.run_once()
    row = queue.get_task(task_id)
    assert row.status == "dead"  # attempts 3 >= max 3
    assert calls == [1, 2, 3]
    assert worker.run_once() is False  # dead is not claimable


def test_non_retryable_exception_fails_immediately(tmp_path: Path):
    """A handler raising NonRetryableTaskError terminates the task as
    failed on its FIRST attempt — the handler runs exactly once, there
    is no backoff-pending retry, and the row is not claimable again."""
    queue, reg = _make_queue(tmp_path, "nonretry", lease_ttl=300, heartbeat=100)
    worker = _make_worker(tmp_path, queue, reg, heartbeat=100)

    calls: list[int] = []

    def permanent(payload, snapshot):
        calls.append(snapshot.attempts)
        raise NonRetryableTaskError("bad input — can never succeed")

    reg.register("test.permanent", permanent)
    task_id = queue.enqueue("test.permanent", {}, organization_id="org-acme")

    assert worker.run_once() is True
    row = queue.get_task(task_id)
    assert row.status == "failed"  # not pending (no backoff), not dead
    assert row.attempts == 1  # one attempt is all it took
    assert calls == [1]  # the handler ran exactly once
    assert "can never succeed" in row.last_error
    assert "NonRetryableTaskError" in row.last_error
    assert queue.claim_next("w1") is None  # failed is not claimable
    assert worker.run_once() is False  # queue drained


def test_unknown_type_goes_failed(tmp_path: Path):
    """Gate 2a: a task type the worker's registry no longer knows (e.g.
    a deploy deregistered it between enqueue and claim) can never
    succeed on retry → failed on the first attempt, not cycled to dead."""
    queue, reg = _make_queue(tmp_path, "unreg", lease_ttl=300, heartbeat=100)
    reg.register("test.later.removed", lambda p, s: {"ok": True}, validator=lambda p: None)
    task_id = queue.enqueue("test.later.removed", {}, organization_id="org-acme")

    # the worker runs against a registry that does NOT know the type
    stale_reg = TaskRegistry()
    worker = TaskWorker(
        queue,
        stale_reg,
        poll_interval=0.05,
        heartbeat_interval=100,
        reaper_interval=0.2,
        lock_path=tmp_path / "worker.lock",
        install_signals=False,
    )
    assert worker.run_once() is True
    row = queue.get_task(task_id)
    assert row.status == "failed"  # not pending (no retry), not dead
    assert row.attempts == 1
    assert "no longer registered" in row.last_error
    assert worker.run_once() is False  # failed is not claimable


def test_tampered_payload_fails_gate_two(tmp_path: Path):
    """Payload was valid at enqueue; someone mutated the row directly.
    The worker must refuse to execute and fail the task through the
    fenced path. Gate-2 rejections are non-retryable: the task goes to
    failed on its first attempt instead of cycling retries to dead."""
    queue, reg = _make_queue(tmp_path, "tamper", lease_ttl=300, heartbeat=100)
    worker = _make_worker(tmp_path, queue, reg, heartbeat=100)

    ran: list[dict] = []

    def strict(payload, snapshot):
        ran.append(payload)
        return {"should": "never happen"}

    def strict_validator(p: dict) -> None:
        if not isinstance(p.get("secret"), int):
            raise PayloadValidationError("'secret' must be an int")

    reg.register("test.strict", strict, validator=strict_validator)

    # tamper variant 1: payload is no longer valid JSON at all
    task_id = queue.enqueue("test.strict", {"secret": 42}, organization_id="org-acme")
    with queue.engine.begin() as conn:
        conn.execute(
            text("UPDATE agent_tasks SET payload = :p WHERE task_id = :id"),
            {"p": "{not json", "id": task_id},
        )
    worker.run_once()
    row = queue.get_task(task_id)
    assert row.status == "failed"  # non-retryable: corrupt payload is permanent
    assert "not valid JSON" in row.last_error
    assert row.attempts == 1

    # tamper variant 2: valid JSON, fails the validator
    task2 = queue.enqueue("test.strict", {"secret": 42}, organization_id="org-acme")
    with queue.engine.begin() as conn:
        conn.execute(
            text("UPDATE agent_tasks SET payload = :p WHERE task_id = :id"),
            {"p": '{"secret": "overwritten"}', "id": task2},
        )
    worker.run_once()
    row2 = queue.get_task(task2)
    assert row2.status == "failed"  # non-retryable: validator rejection is deterministic
    assert "payload validation failed" in row2.last_error
    assert "'secret' must be an int" in row2.last_error
    assert row2.attempts == 1

    assert ran == []  # neither handler ever ran


# ── singleton lock ────────────────────────────────────────────────


def test_lock_is_singleton_same_process(tmp_path: Path):
    """Two worker objects, one lock file: the second acquire is refused
    (flock is per open-file-description, so this holds even in-process)."""
    queue, reg = _make_queue(tmp_path, "lock", lease_ttl=300, heartbeat=100)
    lock = tmp_path / "worker.lock"
    w1 = TaskWorker(queue, reg, heartbeat_interval=100, lock_path=lock, install_signals=False)
    w2 = TaskWorker(queue, reg, heartbeat_interval=100, lock_path=lock, install_signals=False)
    assert w1.acquire_lock() is True
    assert w2.acquire_lock() is False  # exactly one worker — the contract
    w1.release_lock()
    assert w2.acquire_lock() is True  # slot is free again after release
    w2.release_lock()


def test_lock_released_after_process_death(tmp_path: Path):
    """The OS releases the flock when the holder dies — a crashed worker
    never wedges the slot."""
    lock = tmp_path / "worker.lock"
    code = (
        "import fcntl, os, sys, time\n"
        f"fd = os.open({str(lock)!r}, os.O_RDWR | os.O_CREAT)\n"
        "fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)\n"
        "print('locked', flush=True)\n"
        "time.sleep(30)\n"
    )
    proc = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, text=True)
    assert proc.stdout is not None
    assert proc.stdout.readline().strip() == "locked"
    proc.kill()  # simulate crash
    proc.wait(timeout=10)

    queue, reg = _make_queue(tmp_path, "crash", lease_ttl=300, heartbeat=100)
    w = TaskWorker(queue, reg, heartbeat_interval=100, lock_path=lock, install_signals=False)
    assert w.acquire_lock() is True
    w.release_lock()


# ── real subprocess lifecycle ─────────────────────────────────────


def _worker_env(tmp_path: Path, db_name: str) -> dict[str, str]:
    env = {**os.environ}
    env["COFFEE_DATABASE_URL"] = f"sqlite:///{tmp_path}/{db_name}.db"
    env["TASK_WORKER_LOCK_FILE"] = str(tmp_path / "worker.lock")
    env["LOGS_DIR"] = str(tmp_path / "logs")  # keep every artifact inside tmp_path
    env["TASK_QUEUE_POLL_INTERVAL_SECONDS"] = "1"
    env["TASK_QUEUE_HEARTBEAT_SECONDS"] = "50"
    env["TASK_QUEUE_LEASE_TTL_SECONDS"] = "150"
    env["TASK_QUEUE_REAPER_INTERVAL_SECONDS"] = "60"
    return env


def test_subprocess_graceful_shutdown_and_singleton(tmp_path: Path):
    """End-to-end with the REAL worker process:
    1. starts and holds the lock
    2. a second worker refuses to start (exit 3)
    3. SIGTERM → graceful shutdown, exit 0
    Uses an empty production registry — Phase 1A runs no business job."""
    repo_root = Path(__file__).resolve().parent.parent.parent  # Faith-El-/
    env = _worker_env(tmp_path, "sub")
    # the worker needs the agent_tasks table; apply the new migration to a
    # scratch DB created from scratch (alembic upgrade head) — hermetic
    venv_py = repo_root / ".venv" / "bin" / "python"
    assert venv_py.exists(), "run scripts/run-python-tests.sh first (creates .venv)"
    subprocess.run(
        [str(venv_py), "-m", "alembic", "upgrade", "head"],
        cwd=repo_root / "coffee_export",
        env=env,
        check=True,
        capture_output=True,
    )

    w1 = subprocess.Popen(
        [sys.executable, "-m", "coffee_export.tasks.worker"],
        cwd=repo_root / "coffee_export",
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        # wait for worker 1 to take the lock
        deadline = time.monotonic() + 15
        locked = False
        while time.monotonic() < deadline:
            if (tmp_path / "worker.lock").exists():
                try:
                    content = (tmp_path / "worker.lock").read_text().strip()
                except OSError:
                    continue
                if content:
                    locked = True
                    break
            time.sleep(0.1)
        assert locked, "worker 1 never took the lock"

        # 2. second worker must refuse to start
        w2 = subprocess.run(
            [sys.executable, "-m", "coffee_export.tasks.worker"],
            cwd=repo_root / "coffee_export",
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert w2.returncode == EXIT_LOCKED, w2.stdout + w2.stderr
        assert "another worker" in (w2.stdout + w2.stderr)

        # 3. graceful shutdown of worker 1
        w1.terminate()
        out = w1.communicate(timeout=20)[0]
        assert w1.returncode == EXIT_OK, out
        assert "shut down gracefully" in out
    finally:
        if w1.poll() is None:
            w1.kill()
