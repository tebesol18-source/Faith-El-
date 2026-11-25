"""
agent_tasks migration tests — Phase 1A (five-state correction).

Proves, on disposable DBs only (never the committed operational DB):

  * fresh install — `alembic upgrade head` from an empty file creates
    agent_tasks with the approved shape (columns, defaults, check
    constraints, indexes) and lands at the current head — the
    five-state CHECK (failed admissible, junk rejected) and
    organization_id NOT NULL with NO default
  * batch-rebuild preservation — upgrading c8d9e0f1a2b3 → head rebuilds
    the table on SQLite (CHECK cannot be altered in place); every row,
    all 3 indexes and the other 3 CHECKs must survive. THE critical
    migration-risk test.
  * downgrade remap — failed rows are remapped to dead on downgrade so
    the 4-state CHECK stays satisfiable
  * the deployment path — upgrading a THROWAWAY COPY of the committed
    operational DB from b9d0e1f2a4b5 to head (five revisions:
    c8d9e0f1a2b3 + d9e0f1a2b3c4 + f2a3b4c5d6e7 + a3b4c5d6e7f8 +
    b4c5d6e7f8a9) adds exactly six tables (agent_tasks + the two research
    tables + the two research-engine tables + the followups table) and
    leaves all 65 pre-existing tables and their row counts byte-identical
    (additive, no data touched)
  * reversibility — `downgrade b9d0e1f2a4b5` drops only the six new
    tables and returns the version pointer; a re-upgrade works

Uses the project venv python (same pattern as
test_buyer_masking.test_migration_preservation) with COFFEE_DATABASE_URL
pointing at the throwaway file for every subprocess.
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
from pathlib import Path

import pytest

from coffee_export.database.models.agent_tasks import AgentTask

REPO_COFFEE = Path(__file__).resolve().parent.parent  # coffee_export/ (app dir)
REPO_ROOT = REPO_COFFEE.parent  # Faith-El-/
VENV_PY = REPO_ROOT / ".venv" / "bin" / "python"
REAL_DB = REPO_ROOT / "state" / "coffee_export.db"

OLD_HEAD = "c8d9e0f1a2b3"  # 4-state revision (pushed, immutable)
NEW_HEAD = "b4c5d6e7f8a9"  # research followups (TryComp Phase 3)
PARENT = "b9d0e1f2a4b5"

TS = "2026-01-01T00:00:00+03:00"


@pytest.fixture()
def scratch(tmp_path: Path):
    """A scratch DB + alembic runner bound to it."""
    db = tmp_path / "scratch.db"

    def alembic(*args: str) -> str:
        env = {**os.environ, "COFFEE_DATABASE_URL": f"sqlite:///{db}"}
        proc = subprocess.run(
            [str(VENV_PY), "-m", "alembic", *args],
            cwd=REPO_COFFEE,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
        return proc.stdout + proc.stderr

    return db, alembic


def _table_names(db: Path) -> set[str]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        return {r[0] for r in rows}
    finally:
        con.close()


def _row_counts(db: Path) -> dict[str, int]:
    """Row count per table (excluding alembic_version) — the data fingerprint."""
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        counts: dict[str, int] = {}
        for (name,) in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name != 'alembic_version'"
        ).fetchall():
            counts[name] = con.execute(f"SELECT count(*) FROM [{name}]").fetchone()[0]
        return counts
    finally:
        con.close()


def _version(db: Path) -> str:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    finally:
        con.close()


def test_fresh_install_creates_agent_tasks(scratch) -> None:
    db, alembic = scratch
    alembic("upgrade", "head")
    assert _version(db) == NEW_HEAD
    tables = _table_names(db)
    assert "agent_tasks" in tables

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        cols = {r[1]: r for r in con.execute("PRAGMA table_info(agent_tasks)").fetchall()}
        expected_columns = {c.name for c in AgentTask.__table__.columns}
        assert set(cols) == expected_columns
        # approved defaults (SQLite may or may not quote numeric defaults)
        dflt = lambda name: (cols[name][4] or "").strip("'")  # noqa: E731
        assert dflt("organization_id") == ""  # NO server default — explicit org only
        assert dflt("status") == "pending"
        assert dflt("priority") == "100"
        assert dflt("attempts") == "0"
        assert dflt("max_attempts") == "3"
        # constraints + indexes present
        indexes = {r[1] for r in con.execute("PRAGMA index_list(agent_tasks)").fetchall()}
        assert "ix_agent_tasks_status_scheduled" in indexes
        assert "ix_agent_tasks_task_type" in indexes
        assert "ix_agent_tasks_org" in indexes
    finally:
        con.close()

    # CHECK constraints + NOT NULL org — needs a WRITABLE connection
    con = sqlite3.connect(db)
    try:
        # `failed` is admissible under the five-state CHECK
        con.execute(
            "INSERT INTO agent_tasks (task_id, task_type, organization_id, status, priority,"
            " attempts, max_attempts, scheduled_ts, created_ts, updated_ts)"
            f" VALUES ('f1','x','org-acme','failed',100,1,3,'{TS}','{TS}','{TS}')"
        )
        # junk statuses are not
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO agent_tasks (task_id, task_type, organization_id, status, priority,"
                " attempts, max_attempts, scheduled_ts, created_ts, updated_ts)"
                f" VALUES ('f2','x','org-acme','running',100,0,3,'{TS}','{TS}','{TS}')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO agent_tasks (task_id, task_type, organization_id, status, priority,"
                " attempts, max_attempts, scheduled_ts, created_ts, updated_ts)"
                f" VALUES ('f3','x','org-acme','pending',100,-1,3,'{TS}','{TS}','{TS}')"
            )
        # organization_id is NOT NULL with NO default: a direct SQL insert
        # without an org fails loudly — no silent org-system attribution
        with pytest.raises(sqlite3.IntegrityError, match="organization_id"):
            con.execute(
                "INSERT INTO agent_tasks (task_id, task_type, status, priority, attempts,"
                " max_attempts, scheduled_ts, created_ts, updated_ts)"
                f" VALUES ('f4','x','pending',100,0,3,'{TS}','{TS}','{TS}')"
            )
    finally:
        con.close()


def test_batch_rebuild_preserves_rows_and_indexes(scratch) -> None:
    """THE critical migration-risk test for the SQLite table rebuild:
    a CHECK cannot be altered in place, so d9e0f1a2b3c4 recreates the
    table in batch mode (copy → drop → rename). Starting from the
    pushed 4-state revision with real rows in it, the rebuild must
    preserve every row, all 3 indexes and the other 3 CHECKs."""
    db, alembic = scratch
    alembic("upgrade", OLD_HEAD)  # where dev/CI databases sit today

    rows = [
        ("t1", "jobs.alpha", '{"a": 1}', "org-acme", "pending", 5, 0, 3),
        ("t2", "jobs.beta", '{"b": 2}', "org-beta", "leased", 10, 1, 3),
        ("t3", "jobs.gamma", None, "org-acme", "completed", 20, 1, 3),
        ("t4", "jobs.delta", '{"d": 4}', "org-system", "dead", 30, 3, 3),
    ]
    con = sqlite3.connect(db)
    try:
        for task_id, task_type, payload, org, status, priority, attempts, max_attempts in rows:
            con.execute(
                "INSERT INTO agent_tasks (task_id, task_type, payload, organization_id,"
                " status, priority, attempts, max_attempts, scheduled_ts, created_ts,"
                " updated_ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    task_id,
                    task_type,
                    payload,
                    org,
                    status,
                    priority,
                    attempts,
                    max_attempts,
                    TS,
                    TS,
                    TS,
                ),
            )
        con.commit()
        before = con.execute(
            "SELECT task_id, task_type, payload, organization_id, status, priority,"
            " attempts, max_attempts, scheduled_ts, created_ts, updated_ts"
            " FROM agent_tasks ORDER BY task_id"
        ).fetchall()
    finally:
        con.close()

    alembic("upgrade", NEW_HEAD)  # the rebuild happens inside this step
    assert _version(db) == NEW_HEAD

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        after = con.execute(
            "SELECT task_id, task_type, payload, organization_id, status, priority,"
            " attempts, max_attempts, scheduled_ts, created_ts, updated_ts"
            " FROM agent_tasks ORDER BY task_id"
        ).fetchall()
        assert after == before  # every row survived byte-identical
        indexes = {r[1] for r in con.execute("PRAGMA index_list(agent_tasks)").fetchall()}
        for expected in (
            "ix_agent_tasks_status_scheduled",
            "ix_agent_tasks_task_type",
            "ix_agent_tasks_org",
        ):
            assert expected in indexes, expected
    finally:
        con.close()

    # the other CHECKs still bite after the rebuild (writable connection)
    con = sqlite3.connect(db)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            con.execute("UPDATE agent_tasks SET attempts = -1 WHERE task_id = 't1'")
        with pytest.raises(sqlite3.IntegrityError):
            con.execute("UPDATE agent_tasks SET max_attempts = 0 WHERE task_id = 't1'")
        with pytest.raises(sqlite3.IntegrityError):
            con.execute("UPDATE agent_tasks SET priority = -5 WHERE task_id = 't1'")
        # and the widened CHECK admits `failed`, rejects junk
        con.execute("UPDATE agent_tasks SET status = 'failed' WHERE task_id = 't1'")
        con.commit()
        with pytest.raises(sqlite3.IntegrityError):
            con.execute("UPDATE agent_tasks SET status = 'running' WHERE task_id = 't1'")
        con.rollback()
    finally:
        con.close()


def test_downgrade_remaps_failed_to_dead(scratch) -> None:
    """Reversibility with data: downgrading head → c8d9e0f1a2b3 remaps
    failed rows to dead (the semantically closest terminal under the
    4-state contract) so the restored CHECK stays satisfiable."""
    db, alembic = scratch
    alembic("upgrade", NEW_HEAD)
    con = sqlite3.connect(db)
    try:
        con.execute(
            "INSERT INTO agent_tasks (task_id, task_type, organization_id, status, priority,"
            " attempts, max_attempts, scheduled_ts, created_ts, updated_ts)"
            f" VALUES ('t1','jobs.x','org-acme','failed',100,1,3,'{TS}','{TS}','{TS}')"
        )
        con.commit()
    finally:
        con.close()

    alembic("downgrade", OLD_HEAD)
    assert _version(db) == OLD_HEAD
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        status = con.execute("SELECT status FROM agent_tasks WHERE task_id = 't1'").fetchone()[0]
        assert status == "dead"  # remapped, not dropped, not rejected
        ddl = con.execute("SELECT sql FROM sqlite_master WHERE name='agent_tasks'").fetchone()[0]
        assert "'failed'" not in ddl  # the 4-state CHECK is back
    finally:
        con.close()


def test_upgrade_downgrade_reupgrade_roundtrip(scratch) -> None:
    db, alembic = scratch
    alembic("upgrade", "head")
    before_counts = _row_counts(db)
    assert "agent_tasks" in before_counts

    alembic("downgrade", PARENT)
    assert _version(db) == PARENT
    assert "agent_tasks" not in _table_names(db)
    remaining = _row_counts(db)
    assert "agent_tasks" not in remaining
    # every OTHER table survived the downgrade with its row count
    for table, count in remaining.items():
        assert before_counts[table] == count, table

    alembic("upgrade", "head")  # re-upgrade works
    assert _version(db) == NEW_HEAD
    assert "agent_tasks" in _table_names(db)


def test_deployment_path_on_copy_of_operational_db(scratch, tmp_path: Path) -> None:
    """The exact deployment step: upgrade a throwaway COPY of the committed
    operational DB (already at b9d0e1f2a4b5) to the new head — now FIVE
    revisions (c8d9e0f1a2b3 + d9e0f1a2b3c4 + f2a3b4c5d6e7 + a3b4c5d6e7f8
    + b4c5d6e7f8a9).
    Must add exactly six tables and touch zero existing rows."""
    db, alembic = scratch
    db.write_bytes(REAL_DB.read_bytes())  # COPY — the committed DB is only read
    before_tables = _table_names(db)
    before_counts = _row_counts(db)
    before_version = _version(db)
    assert before_version == PARENT  # operational DB ships at b9d0e1f2a4b5
    assert "agent_tasks" not in before_tables
    assert len(before_tables) == 65  # 64 business tables + alembic_version

    alembic("upgrade", "head")

    assert _version(db) == NEW_HEAD
    after_tables = _table_names(db)
    assert after_tables - before_tables == {
        "agent_tasks",
        "research_evidence",
        "research_facts",
        "research_followups",
        "research_sessions",
        "research_tool_calls",
    }
    after_counts = _row_counts(db)
    for table, count in before_counts.items():
        assert after_counts[table] == count, f"row count changed for {table}"

    # and back down — the copy is again a b9d0e1f2a4b5 database
    alembic("downgrade", PARENT)
    assert _version(db) == PARENT
    assert _table_names(db) == before_tables
    assert _row_counts(db) == before_counts
