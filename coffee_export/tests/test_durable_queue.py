"""
Durable task queue service tests — Phase 1A (five-state contract).

Proves the Phase 1A contract on disposable per-test databases (tmp_path,
never the committed operational DB):

  * enqueue gate — unknown type / invalid payload rejected before write;
    organization_id is REQUIRED (no silent org-system default); defaults
    land exactly as approved (priority 100, 0/3 attempts, scheduled now)
  * claim — atomic, respects scheduled_ts (nothing runs early), priority
    first, then scheduled_ts; attempts++ per claim; started_ts set once
  * lease fencing — complete/fail/renew with a wrong or stale token are
    all rejected; the right token succeeds exactly once (the failed path
    is fenced identically)
  * retry & terminal states — exponential backoff BASE*2^(attempts-1),
    then dead at attempts >= max_attempts; non-retryable failure →
    failed in ONE attempt (precedence over an exhausted budget;
    NonRetryableTaskError overrides a wrong retryable=True)
  * reaper — expired leases recovered (pending w/ backoff, or dead),
    idempotent under repeated/concurrent reaping; the reaper never
    produces failed
  * requeue — failed|dead → pending with a fresh retry budget; other
    states are never requeueable
  * concurrency — two claimers on separate engines against one SQLite
    file (BEGIN IMMEDIATE + busy_timeout): every task completed exactly
    once, no task claimed twice, no busy errors
  * crash recovery — a lease abandoned mid-task (worker died) is
    recovered by the reaper and re-run from pending
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

import pytest
from sqlalchemy import text

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.tasks.durable_queue import (
    DurableTaskQueue,
    SYSTEM_ORG,
    addis_iso_after,
    create_queue_engine,
    parse_iso,
)
from coffee_export.tasks.registry import (
    NonRetryableTaskError,
    PayloadValidationError,
    TaskRegistry,
    UnknownTaskTypeError,
)

# ── fixtures ──────────────────────────────────────────────────────


def _echo(payload, snapshot):
    return {"echo": payload, "attempt": snapshot.attempts}


def _require_x(payload: dict) -> None:
    if "x" not in payload:
        raise PayloadValidationError("missing required key 'x'")


def _never_valid(payload: dict) -> None:
    raise PayloadValidationError("boom never validates")


def _make_env(tmp_path: Path, *, lease_ttl: int = 300, backoff_base: int = 60, name: str = "queue"):
    """A disposable DB + queue with injectable timings."""
    url = f"sqlite:///{tmp_path}/{name}.db"
    engine = create_queue_engine(url)
    AgentTask.__table__.create(engine)
    reg = TaskRegistry()
    reg.register("test.echo", _echo, validator=_require_x)
    reg.register("test.boom", _echo, validator=_never_valid)
    return DurableTaskQueue(
        reg, engine, lease_ttl_seconds=lease_ttl, backoff_base_seconds=backoff_base
    )


@pytest.fixture()
def env(tmp_path: Path):
    """Standard timings: TTL 300s, backoff base 60s."""
    return _make_env(tmp_path)


# ── enqueue gate ──────────────────────────────────────────────────


def test_enqueue_rejects_unknown_task_type(env: DurableTaskQueue):
    with pytest.raises(UnknownTaskTypeError):
        env.enqueue("jobs.daily_sync", {}, organization_id="org-acme")  # a real recurring job name
    assert env.stats()["pending"] == 0  # nothing was written


def test_enqueue_rejects_invalid_payload(env: DurableTaskQueue):
    with pytest.raises(PayloadValidationError, match="missing required key 'x'"):
        env.enqueue("test.echo", {"no_x": True}, organization_id="org-acme")
    with pytest.raises(PayloadValidationError, match="boom never validates"):
        env.enqueue("test.boom", {}, organization_id="org-acme")
    assert env.stats()["pending"] == 0


def test_enqueue_requires_explicit_org(env: DurableTaskQueue):
    """No silent org-system default: a forgotten org is a hard error, and
    empty/falsy values are rejected before anything is written."""
    with pytest.raises(TypeError):
        env.enqueue("test.echo", {"x": 1})  # type: ignore[call-arg] — org omitted
    for bad in ("", None):
        with pytest.raises(ValueError, match="organization_id is required"):
            env.enqueue("test.echo", {"x": 1}, organization_id=bad)  # type: ignore[arg-type]
    assert env.stats() == {"pending": 0, "leased": 0, "completed": 0, "failed": 0, "dead": 0}


def test_system_org_constant(env: DurableTaskQueue):
    """Genuine system-scope tasks pass SYSTEM_ORG explicitly — the stamp
    is the deliberate org-system attribution, not a silent fallback."""
    assert SYSTEM_ORG == "org-system"
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id=SYSTEM_ORG)
    row = env.get_task(task_id)
    assert row.organization_id == "org-system"


def test_enqueue_defaults(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    row = env.get_task(task_id)
    before = now_addis_iso()
    after = now_addis_iso()
    assert row.status == "pending"
    assert row.organization_id == "org-acme"  # exactly what the caller passed
    assert row.priority == 100
    assert row.attempts == 0
    assert row.max_attempts == 3
    assert row.payload == '{"x": 1}'
    assert before <= row.scheduled_ts <= after  # due immediately
    assert row.lease_token is None and row.lease_owner is None
    assert row.started_ts is None and row.completed_ts is None
    assert row.last_error is None and row.result is None


def test_enqueue_custom_org_and_priority(env: DurableTaskQueue):
    task_id = env.enqueue(
        "test.echo", {"x": 1}, organization_id="org-acme", priority=10, max_attempts=5
    )
    row = env.get_task(task_id)
    assert row.organization_id == "org-acme"
    assert row.priority == 10
    assert row.max_attempts == 5


def test_enqueue_future_scheduled(env: DurableTaskQueue):
    task_id = env.enqueue(
        "test.echo", {"x": 1}, organization_id="org-acme", scheduled_delay_seconds=3600
    )
    row = env.get_task(task_id)
    assert row.scheduled_ts > now_addis_iso()
    assert env.claim_next("w1") is None  # nothing due yet


# ── claim ─────────────────────────────────────────────────────────


def test_claim_sets_lease_and_attempts(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id=SYSTEM_ORG)
    before = now_addis_iso()
    claimed = env.claim_next("w1")
    assert claimed is not None and claimed.task_id == task_id
    assert claimed.task_type == "test.echo"
    assert claimed.attempts == 1
    assert claimed.organization_id == "org-system"
    assert claimed.payload_text == '{"x": 1}'
    assert claimed.lease_owner == "w1"
    assert len(claimed.token) >= 32  # uuid4
    assert parse_iso(before) <= parse_iso(claimed.lease_expires_ts)  # ~now+300s
    assert parse_iso(claimed.lease_expires_ts) <= parse_iso(addis_iso_after(301))
    row = env.get_task(task_id)
    assert row.status == "leased"
    assert row.lease_token == claimed.token
    assert row.attempts == 1
    assert row.started_ts is not None


def test_claim_order_priority_then_scheduled(env: DurableTaskQueue):
    low = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme", priority=200)  # runs 3rd
    high = env.enqueue("test.echo", {"x": 2}, organization_id="org-acme", priority=1)  # runs 1st
    mid = env.enqueue("test.echo", {"x": 3}, organization_id="org-acme", priority=100)  # runs 2nd
    assert env.claim_next("w1").task_id == high
    assert env.claim_next("w1").task_id == mid
    assert env.claim_next("w1").task_id == low
    assert env.claim_next("w1") is None  # all leased, none due


def test_claim_respects_scheduled_ts(env: DurableTaskQueue):
    env.enqueue(
        "test.echo", {"x": 1}, organization_id="org-acme", scheduled_delay_seconds=120
    )
    assert env.claim_next("w1") is None
    # same task with a past scheduled_ts is due
    env.enqueue(
        "test.echo",
        {"x": 2},
        organization_id="org-acme",
        scheduled_ts="2000-01-01T00:00:00+03:00",
    )
    claimed = env.claim_next("w1")
    assert claimed is not None and claimed.payload_text == '{"x": 2}'


def test_started_ts_set_once_across_retries(tmp_path: Path):
    env = _make_env(tmp_path, backoff_base=1, name="started")
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    first = env.claim_next("w1")
    started_first = env.get_task(task_id).started_ts
    assert started_first is not None
    env.fail(task_id, first.token, "retry please")
    time.sleep(1.05)  # backoff 1*2^0 = 1s
    env.claim_next("w1")
    row = env.get_task(task_id)
    assert row.attempts == 2
    assert row.started_ts == started_first  # coalesce kept the first claim time


# ── lease fencing ─────────────────────────────────────────────────


def test_complete_fenced_by_token(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    claimed = env.claim_next("w1")
    # wrong token, right task
    assert env.complete(task_id, "not-the-token", {"r": 1}) is False
    row = env.get_task(task_id)
    assert row.status == "leased"  # untouched
    assert row.result is None and row.completed_ts is None
    # stale token after another claim (simulated: requeue+reclaim)
    assert env.complete(task_id, claimed.token, {"r": 1}) is True
    assert env.complete(task_id, claimed.token, {"again": 1}) is False  # second complete
    row = env.get_task(task_id)
    assert row.status == "completed"
    assert row.result == '{"r": 1}'
    assert row.completed_ts is not None
    assert row.lease_token is None and row.lease_owner is None


def test_fail_fenced_by_token(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    claimed = env.claim_next("w1")
    assert env.fail(task_id, "wrong-token", "boom") is None  # fenced out
    assert env.get_task(task_id).status == "leased"
    assert env.fail(task_id, claimed.token, ValueError("handler exploded")) == "retry"
    assert env.fail(task_id, claimed.token, "again") is None  # lease already released


def test_fail_non_retryable_to_failed(env: DurableTaskQueue):
    """retryable=False terminates the task as failed on its FIRST attempt
    — lease cleared, error recorded, not claimable, no backoff. The
    failed path is fenced by the lease token exactly like retry/dead:
    a wrong token changes nothing."""
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    claimed = env.claim_next("w1")
    # wrong token on the non-retryable path → fenced out, row untouched
    assert env.fail(task_id, "wrong-token", "permanent", retryable=False) is None
    assert env.get_task(task_id).status == "leased"
    assert env.get_task(task_id).lease_token == claimed.token
    assert claimed.attempts == 1  # of 3 — budget remains, must not matter
    assert env.fail(task_id, claimed.token, "permanent error", retryable=False) == "failed"
    row = env.get_task(task_id)
    assert row.status == "failed"
    assert row.attempts == 1  # one attempt is all it took
    assert row.last_error == "permanent error"
    assert row.lease_token is None and row.lease_owner is None and row.lease_expires_ts is None
    # failed is terminal for execution: not claimable, nothing scheduled
    assert env.claim_next("w1") is None
    assert env.stats() == {"pending": 0, "leased": 0, "completed": 0, "failed": 1, "dead": 0}


def test_renew_fenced_by_token(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    claimed = env.claim_next("w1")
    assert env.renew(task_id, "wrong-token") is False
    before = env.get_task(task_id).lease_expires_ts
    # extend well past the TTL so the new expiry is strictly greater even
    # if claim and renew land in the same wall-clock second
    assert env.renew(task_id, claimed.token, extend_seconds=600) is True
    renewed = env.get_task(task_id).lease_expires_ts
    assert parse_iso(renewed) > parse_iso(before)
    # after complete, renew is fenced out (status no longer leased)
    env.complete(task_id, claimed.token)
    assert env.renew(task_id, claimed.token) is False


# ── retry & backoff & terminal states ─────────────────────────────


def test_fail_backoff_exponential(tmp_path: Path):
    env = _make_env(tmp_path, backoff_base=1, name="backoff")
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    for attempt, expected_backoff in ((1, 1), (2, 2)):
        claimed = env.claim_next("w1")
        assert claimed is not None and claimed.attempts == attempt
        t0 = now_addis_iso()
        assert env.fail(task_id, claimed.token, f"fail #{attempt}") == "retry"
        row = env.get_task(task_id)
        assert row.status == "pending"
        assert row.last_error == f"fail #{attempt}"
        got = (parse_iso(row.scheduled_ts) - parse_iso(t0)).total_seconds()
        assert expected_backoff - 0.5 <= got <= expected_backoff + 0.5
        time.sleep(expected_backoff + 0.05)  # let the backoff elapse
    # 3rd failure: attempts (3) >= max (3) → dead
    claimed = env.claim_next("w1")
    assert claimed.attempts == 3
    assert env.fail(task_id, claimed.token, "fail #3") == "dead"
    row = env.get_task(task_id)
    assert row.status == "dead"
    assert row.last_error == "fail #3"
    assert row.lease_token is None
    # dead is terminal for execution: not claimable, nothing runs early
    assert env.claim_next("w1") is None


def test_dead_after_configured_max_attempts(tmp_path: Path):
    env = _make_env(tmp_path, backoff_base=1, name="maxattempts")
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme", max_attempts=2)
    c1 = env.claim_next("w1")
    env.fail(task_id, c1.token, "one")
    time.sleep(1.05)  # backoff for attempt 1
    c2 = env.claim_next("w1")
    assert c2.attempts == 2
    assert env.fail(task_id, c2.token, "two") == "dead"
    assert env.get_task(task_id).status == "dead"
    assert env.claim_next("w1") is None  # dead rows are not claimable


def test_fail_non_retryable_wins_over_exhausted_budget(env: DurableTaskQueue):
    """Decision order: non-retryable takes precedence over an exhausted
    budget — attempts=1, max_attempts=1, retryable=False → failed, NOT
    dead (a task that can never succeed must not consume retries)."""
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme", max_attempts=1)
    claimed = env.claim_next("w1")
    assert claimed.attempts == 1  # == max_attempts: retryable would be dead
    assert env.fail(task_id, claimed.token, "permanent", retryable=False) == "failed"
    row = env.get_task(task_id)
    assert row.status == "failed"  # not dead
    assert env.stats() == {"pending": 0, "leased": 0, "completed": 0, "failed": 1, "dead": 0}


def test_fail_non_retryable_error_type_overrides(env: DurableTaskQueue):
    """Defense in depth: a NonRetryableTaskError error object forces the
    failed path even when a call site wrongly passes retryable=True."""
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    claimed = env.claim_next("w1")
    boom = NonRetryableTaskError("cannot ever succeed")
    assert env.fail(task_id, claimed.token, boom, retryable=True) == "failed"
    row = env.get_task(task_id)
    assert row.status == "failed"
    assert "NonRetryableTaskError" in row.last_error
    assert "cannot ever succeed" in row.last_error


# ── reaper ────────────────────────────────────────────────────────


def _expire_lease(queue: DurableTaskQueue, task_id: str) -> None:
    with queue.engine.begin() as conn:
        conn.execute(
            text("UPDATE agent_tasks SET lease_expires_ts = :past WHERE task_id = :id"),
            {"past": "2000-01-01T00:00:00+03:00", "id": task_id},
        )


def test_reaper_recovers_expired_lease_to_pending(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    env.claim_next("w1")  # worker died mid-task
    _expire_lease(env, task_id)
    summary = env.reap_expired()
    assert summary == {"examined": 1, "requeued": 1, "dead": 0}
    row = env.get_task(task_id)
    assert row.status == "pending"
    assert row.attempts == 1  # budget preserved: 2 tries left
    assert row.lease_token is None
    assert "lease expired" in row.last_error
    got = (parse_iso(row.scheduled_ts) - parse_iso(now_addis_iso())).total_seconds()
    assert 55 <= got <= 65  # backoff for attempt 1


def test_reaper_buries_exhausted_expired_lease(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme", max_attempts=1)
    env.claim_next("w1")
    _expire_lease(env, task_id)
    summary = env.reap_expired()
    assert summary == {"examined": 1, "requeued": 0, "dead": 1}
    row = env.get_task(task_id)
    assert row.status == "dead"
    assert "lease expired" in row.last_error


def test_reaper_idempotent_and_ignores_live_leases(env: DurableTaskQueue):
    live = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    env.claim_next("w1")  # lease TTL 300s — alive
    dead_task = env.enqueue(
        "test.echo", {"x": 2}, organization_id="org-acme", max_attempts=1
    )
    env.claim_next("w1")
    _expire_lease(env, dead_task)
    first = env.reap_expired()
    again = env.reap_expired()  # second pass: nothing left to do
    assert first["dead"] == 1 and again == {"examined": 0, "requeued": 0, "dead": 0}
    assert env.get_task(live).status == "leased"  # untouched
    assert env.get_task(live).lease_expires_ts is not None


# ── requeue (operator action) ─────────────────────────────────────


def test_requeue_dead_task(env: DurableTaskQueue):
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme", max_attempts=1)
    c = env.claim_next("w1")
    env.fail(task_id, c.token, "fatal")
    assert env.get_task(task_id).status == "dead"
    assert env.requeue(task_id) is True
    row = env.get_task(task_id)
    assert row.status == "pending"
    assert row.attempts == 0  # fresh budget
    assert row.scheduled_ts <= now_addis_iso()  # due immediately
    assert row.lease_token is None and row.completed_ts is None
    # and it runs end-to-end
    claimed = env.claim_next("w1")
    assert claimed.attempts == 1
    assert env.complete(task_id, claimed.token, {"ok": True}) is True


def test_requeue_failed_task(env: DurableTaskQueue):
    """failed → pending: fresh budget, due immediately, and the task runs
    end-to-end after the operator fixed the cause."""
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme")
    c = env.claim_next("w1")
    assert env.fail(task_id, c.token, "permanent", retryable=False) == "failed"
    assert env.get_task(task_id).status == "failed"
    assert env.requeue(task_id) is True
    row = env.get_task(task_id)
    assert row.status == "pending"
    assert row.attempts == 0  # fresh budget
    assert row.scheduled_ts <= now_addis_iso()  # due immediately
    assert row.lease_token is None and row.completed_ts is None
    # and it runs end-to-end
    claimed = env.claim_next("w1")
    assert claimed is not None and claimed.task_id == task_id
    assert claimed.attempts == 1
    assert env.complete(task_id, claimed.token, {"ok": True}) is True
    assert env.get_task(task_id).status == "completed"


def test_requeue_terminal_states_only(env: DurableTaskQueue):
    """failed and dead are the two operator-requeueable terminal states;
    pending / leased / completed are refused."""
    # priorities make the claim order deterministic while several rows pend
    pending_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-a", priority=100)
    assert env.requeue(pending_id) is False  # pending: nothing to requeue

    leased_id = env.enqueue("test.echo", {"x": 2}, organization_id="org-a", priority=1)
    claimed = env.claim_next("w1")
    assert claimed.task_id == leased_id
    assert env.get_task(leased_id).status == "leased"
    assert env.requeue(leased_id) is False  # leased: belongs to a live claim

    done_id = env.enqueue("test.echo", {"x": 3}, organization_id="org-a", priority=2)
    claimed = env.claim_next("w1")
    assert claimed.task_id == done_id
    assert env.complete(done_id, claimed.token) is True
    assert env.requeue(done_id) is False  # completed: history is immutable

    # drive one task to failed (non-retryable) and one to dead (exhausted)
    failed_id = env.enqueue("test.echo", {"x": 4}, organization_id="org-a", priority=3)
    claimed = env.claim_next("w1")
    assert claimed.task_id == failed_id
    assert env.fail(failed_id, claimed.token, "permanent", retryable=False) == "failed"

    dead_id = env.enqueue(
        "test.echo", {"x": 5}, organization_id="org-a", priority=4, max_attempts=1
    )
    claimed = env.claim_next("w1")
    assert claimed.task_id == dead_id
    assert env.fail(dead_id, claimed.token, "fatal") == "dead"

    # the two terminal states ARE requeueable
    assert env.requeue(failed_id) is True
    assert env.requeue(dead_id) is True
    for tid in (failed_id, dead_id):
        row = env.get_task(tid)
        assert row.status == "pending"
        assert row.attempts == 0

    # refusals changed nothing for the non-terminal rows
    for tid in (pending_id, leased_id, done_id):
        row = env.get_task(tid)
        assert row.status in ("pending", "leased", "completed")
        assert row.attempts in (0, 1)


def test_missing_task_ops(env: DurableTaskQueue):
    assert env.get_task("does-not-exist") is None
    assert env.complete("does-not-exist", "tok") is False
    assert env.fail("does-not-exist", "tok", "x") is None
    assert env.renew("does-not-exist", "tok") is False
    assert env.requeue("does-not-exist") is False


def test_invalid_status_list(env: DurableTaskQueue):
    with pytest.raises(ValueError):
        env.list_tasks(status="running")


# ── crash recovery end-to-end ─────────────────────────────────────


def test_crash_recovery_rerun_from_pending(tmp_path: Path):
    """Worker dies mid-task (lease left to expire); the reaper recovers
    the task to pending; another worker claims and completes it."""
    env = _make_env(tmp_path, backoff_base=1, name="crash")
    task_id = env.enqueue("test.echo", {"x": 1}, organization_id="org-acme", max_attempts=3)
    died = env.claim_next("w-crashed")  # this worker never comes back
    _expire_lease(env, task_id)
    summary = env.reap_expired()
    assert summary["requeued"] == 1
    assert env.get_task(task_id).status == "pending"
    time.sleep(1.05)  # reaper backoff for attempt 1 (base 1s)
    revived = env.claim_next("w2")
    assert revived is not None and revived.task_id == task_id
    assert revived.attempts == 2  # second real attempt
    assert env.complete(task_id, revived.token, {"revived": True}) is True
    # the dead worker's stale token can no longer do anything
    assert env.complete(task_id, died.token, {"zombie": True}) is False
    assert env.get_task(task_id).result == '{"revived": true}'


# ── concurrency: two claimers, one SQLite file ─────────────────────


def test_two_claimers_exactly_once(tmp_path: Path):
    url = f"sqlite:///{tmp_path}/conc.db"
    engine = create_queue_engine(url)
    AgentTask.__table__.create(engine)
    reg = TaskRegistry()
    reg.register("test.echo", _echo, validator=_require_x)
    q1 = DurableTaskQueue(
        reg, create_queue_engine(url), lease_ttl_seconds=60, backoff_base_seconds=60
    )
    q2 = DurableTaskQueue(
        reg, create_queue_engine(url), lease_ttl_seconds=60, backoff_base_seconds=60
    )

    n = 24
    ids = [
        q1.enqueue("test.echo", {"x": i}, priority=i % 3, organization_id="org-acme")
        for i in range(n)
    ]

    completed: dict[str, str] = {}
    errors: list[Exception] = []

    def claimer(name: str, q: DurableTaskQueue) -> None:
        try:
            while True:
                task = q.claim_next(name)
                if task is None:
                    return
                ok = q.complete(task.task_id, task.token, {"by": name})
                if ok:
                    completed[task.task_id] = name
                else:
                    errors.append(AssertionError(f"{name}: complete fenced out unexpectedly"))
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    t1 = threading.Thread(target=claimer, args=("w1", q1))
    t2 = threading.Thread(target=claimer, args=("w2", q2))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors == [], errors
    assert len(completed) == n
    counts = q1.stats()
    assert counts == {"pending": 0, "leased": 0, "completed": n, "failed": 0, "dead": 0}
    for task_id in ids:
        row = q1.get_task(task_id)
        assert row.attempts == 1, f"{task_id} was claimed {row.attempts} times"


def test_concurrent_reapers_are_idempotent(env: DurableTaskQueue):
    for _ in range(6):
        env.enqueue("test.echo", {"x": 1}, organization_id="org-acme", max_attempts=1)
    for _ in range(6):
        env.claim_next("w1")
    for row in env.list_tasks(status="leased"):
        _expire_lease(env, row.task_id)
    results: list[dict] = []
    errors: list[Exception] = []

    def reaper() -> None:
        try:
            results.append(env.reap_expired())
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    ts = [threading.Thread(target=reaper) for _ in range(3)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert errors == [], errors
    total_requeued = sum(r["requeued"] for r in results)
    total_dead = sum(r["dead"] for r in results)
    # every row recovered exactly once across all reapers
    assert (total_requeued, total_dead) == (0, 6)  # max_attempts=1 → dead
    assert env.stats() == {"pending": 0, "leased": 0, "completed": 0, "failed": 0, "dead": 6}
