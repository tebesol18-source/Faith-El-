"""
agent_tasks migration tests — Phase 1A.

Proves, on disposable DBs only (never the committed operational DB):

  * fresh install — `alembic upgrade head` from an empty file creates
    agent_tasks with the approved shape (columns, defaults, check
    constraints, indexes) and lands at revision c8d9e0f1a2b3
  * the deployment path — upgrading a THROWAWAY COPY of the committed
    operational DB from b9d0e1f2a4b5 to head adds exactly one table and
    leaves all 65 pre-existing tables and their row counts byte-identical
    (additive migration, no data touched)
  * reversibility — `downgrade b9d0e1f2a4b5` drops only agent_tasks and
    returns the version pointer; a re-upgrade works

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

NEW_HEAD = "c8d9e0f1a2b3"
PARENT = "b9d0e1f2a4b5"


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
        assert dflt("organization_id") == "org-system"
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

    # CHECK constraints enforced — needs a WRITABLE connection
    con = sqlite3.connect(db)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO agent_tasks (task_id, task_type, status, priority, attempts,"
                " max_attempts, scheduled_ts, created_ts, updated_ts)"
                " VALUES ('t1','x','running',100,0,3,'2026-01-01T00:00:00+03:00',"
                "'2026-01-01T00:00:00+03:00','2026-01-01T00:00:00+03:00')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO agent_tasks (task_id, task_type, status, priority, attempts,"
                " max_attempts, scheduled_ts, created_ts, updated_ts)"
                " VALUES ('t2','x','pending',100,-1,3,'2026-01-01T00:00:00+03:00',"
                "'2026-01-01T00:00:00+03:00','2026-01-01T00:00:00+03:00')"
            )
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
    operational DB (already at b9d0e1f2a4b5) to the new head. Must add
    exactly one table and touch zero existing rows."""
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
    assert after_tables - before_tables == {"agent_tasks"}
    after_counts = _row_counts(db)
    for table, count in before_counts.items():
        assert after_counts[table] == count, f"row count changed for {table}"

    # and back down — the copy is again a b9d0e1f2a4b5 database
    alembic("downgrade", PARENT)
    assert _version(db) == PARENT
    assert _table_names(db) == before_tables
    assert _row_counts(db) == before_counts
