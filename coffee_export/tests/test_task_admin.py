"""
Durable task queue admin CLI tests — Phase 1A.

Proves the operator surface against a disposable DB (injected queue —
no subprocess, no production registry needed):
  * stats — counts by status (all five states)
  * list — status filter (incl. failed), limit, output shape
  * show — full field dump incl. lease fields; miss → exit 1
  * requeue — dead → pending with reset budget, --keep-attempts variant,
    the failed-task requeue leg, and rejection for non-terminal rows
    (exit 1)
  * usage errors → exit 2
"""

from __future__ import annotations

from pathlib import Path

import pytest

from coffee_export.database.models.agent_tasks import AgentTask
from coffee_export.tasks.admin import EXIT_NOT_FOUND, EXIT_OK, EXIT_USAGE, main
from coffee_export.tasks.durable_queue import (
    DurableTaskQueue,
    create_queue_engine,
)
from coffee_export.tasks.registry import TaskRegistry


@pytest.fixture()
def cli(tmp_path: Path, capsys):
    url = f"sqlite:///{tmp_path}/admin.db"
    engine = create_queue_engine(url)
    AgentTask.__table__.create(engine)
    reg = TaskRegistry()
    reg.register("test.echo", lambda p, s: {"ok": True}, validator=lambda p: None)
    queue = DurableTaskQueue(reg, engine, lease_ttl_seconds=300, backoff_base_seconds=60)

    def run(*args: str) -> tuple[int, str]:
        code = main(list(args), queue=queue)
        out = capsys.readouterr().out
        return code, out

    return queue, run


def test_stats_empty(cli):
    queue, run = cli
    code, out = run("stats")
    assert code == EXIT_OK
    for status in ("pending", "leased", "completed", "failed", "dead"):
        assert status in out
    assert "0" in out


def test_list_and_show(cli):
    queue, run = cli
    # one row per status, created via priorities so claims are deterministic
    t_pending = queue.enqueue("test.echo", {"role": "pending"}, organization_id="org-acme")
    t_leased = queue.enqueue(
        "test.echo", {"role": "leased"}, organization_id="org-acme", priority=1
    )
    t_done = queue.enqueue(
        "test.echo", {"role": "done"}, organization_id="org-acme", priority=2
    )
    t_dead = queue.enqueue(
        "test.echo", {"role": "dead"}, organization_id="org-acme", priority=3, max_attempts=1
    )
    t_failed = queue.enqueue(
        "test.echo", {"role": "failed"}, organization_id="org-acme", priority=4, max_attempts=3
    )

    claimed_leased = queue.claim_next("w-lease")
    assert claimed_leased.task_id == t_leased
    claimed_done = queue.claim_next("w-done")
    assert claimed_done.task_id == t_done
    assert queue.complete(t_done, claimed_done.token, {"finished": True}) is True
    claimed_dead = queue.claim_next("w-dead")
    assert claimed_dead.task_id == t_dead
    assert queue.fail(t_dead, claimed_dead.token, "fatal") == "dead"
    claimed_failed = queue.claim_next("w-fail")
    assert claimed_failed.task_id == t_failed
    assert queue.fail(t_failed, claimed_failed.token, "permanent", retryable=False) == "failed"

    assert queue.stats() == {
        "pending": 1,
        "leased": 1,
        "completed": 1,
        "failed": 1,
        "dead": 1,
    }

    code, out = run("list")
    assert code == EXIT_OK
    for expect in (t_pending, t_leased, t_done, t_dead, t_failed):
        assert expect[:12] in out
    assert "test.echo" in out

    code, out = run("list", "--status", "leased", "--limit", "5")
    assert code == EXIT_OK
    assert t_leased[:12] in out
    assert t_pending[:12] not in out  # filter actually filters

    code, out = run("list", "--status", "failed")
    assert code == EXIT_OK
    assert t_failed[:12] in out
    assert t_dead[:12] not in out  # failed filter excludes dead
    assert t_pending[:12] not in out

    code, out = run("show", t_leased)
    assert code == EXIT_OK
    for field in (
        "task_id",
        "task_type",
        "status",
        "organization_id",
        "lease_token",
        "lease_owner",
        "lease_expires_ts",
        "payload",
        "last_error",
        "result",
    ):
        assert field in out
    assert "w-lease" in out  # lease owner visible

    code, out = run("show", t_done)
    assert code == EXIT_OK
    assert '"finished": true' in out  # result JSON is dumped sorted

    code, out = run("show", "no-such-task")
    assert code == EXIT_NOT_FOUND


def test_requeue_flow(cli):
    queue, run = cli
    # drive a task to dead
    task_id = queue.enqueue("test.echo", {}, organization_id="org-acme", max_attempts=1)
    c = queue.claim_next("w1")
    assert c.task_id == task_id
    queue.fail(task_id, c.token, "fatal")
    assert queue.get_task(task_id).status == "dead"

    code, out = run("requeue", task_id)
    assert code == EXIT_OK
    row = queue.get_task(task_id)
    assert row.status == "pending" and row.attempts == 0
    assert "retry budget" in out

    # keep-attempts variant: budget preserved
    c2 = queue.claim_next("w1")
    queue.fail(task_id, c2.token, "fatal again")  # attempts was 1 (reset) → >= 1 → dead
    code, out = run("requeue", task_id, "--keep-attempts")
    assert code == EXIT_OK
    row = queue.get_task(task_id)
    assert row.status == "pending" and row.attempts == 1

    # the failed-task requeue leg: failed is the other requeueable terminal
    failed_id = queue.enqueue(
        "test.echo", {}, organization_id="org-acme", priority=1, max_attempts=3
    )
    cf = queue.claim_next("w1")
    assert cf.task_id == failed_id
    assert queue.fail(failed_id, cf.token, "permanent", retryable=False) == "failed"
    code, out = run("requeue", failed_id)
    assert code == EXIT_OK
    row = queue.get_task(failed_id)
    assert row.status == "pending" and row.attempts == 0  # fresh budget

    # non-terminal rows are refused — with the terminal-states message
    pending_id = queue.enqueue("test.echo", {}, organization_id="org-acme")
    code, out = run("requeue", pending_id)
    assert code == EXIT_NOT_FOUND
    assert "only failed or dead tasks" in out


def test_usage_errors(cli):
    queue, run = cli
    with pytest.raises(SystemExit) as exc:
        run("bogus-command")
    assert exc.value.code == EXIT_USAGE
