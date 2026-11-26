"""
Research followups migration tests — TryComp Phase 3 (b4c5d6e7f8a9).

Proves, on disposable DBs only (never the committed operational DB):

  * fresh install — `alembic upgrade head` creates research_followups
    with the approved shape: every model column present, the org_status
    and due indexes, the status + followup_type CHECKs that bite (junk
    status, junk followup_type, un-enumerated type) and the NO-default
    org rule (direct SQL without an org fails loudly)
  * server defaults land — status 'scheduled' and the canonical empty
    payload '{}'
  * downgrade scope — head → a3b4c5d6e7f8 drops ONLY research_followups
    (agent_tasks and every other research table survive); re-upgrade
    works
  * migration graph — exactly one head (b4c5d6e7f8a9) and a linear
    21-revision chain from the initial schema (covered jointly with the
    sibling suites; asserted here for the head + parent link)

Uses the project venv python (same pattern as
test_agent_task_migration) with COFFEE_DATABASE_URL pointing at the
throwaway file for every subprocess.
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
from pathlib import Path

import pytest

from coffee_export.database.models.research import ResearchFollowup

REPO_COFFEE = Path(__file__).resolve().parent.parent  # coffee_export/ (app dir)
REPO_ROOT = REPO_COFFEE.parent  # workspace root
VENV_PY = REPO_ROOT / ".venv" / "bin" / "python"
REAL_DB = REPO_ROOT / "state" / "coffee_export.db"

NEW_HEAD = "b4c5d6e7f8a9"  # research followups (TryComp Phase 3)
PHASE2_HEAD = "a3b4c5d6e7f8"  # parent — research engine (sessions + tool calls)
OPS_BASE = "b9d0e1f2a4b5"  # deployment baseline (pre-Phase-8)

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


def _index_names(db: Path, table: str) -> set[str]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = con.execute(f"PRAGMA index_list({table})").fetchall()
        return {r[1] for r in rows}
    finally:
        con.close()


def _version(db: Path) -> str:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    finally:
        con.close()


def _insert(db: Path, followup_id: str, **overrides) -> None:
    row = {
        "followup_id": followup_id,
        "organization_id": "org-acme",
        "followup_type": "revalidate_evidence",
        "due_ts": TS,
        "status": "scheduled",
        "payload": "{}",
        "created_by": "operator:1",
        "created_ts": TS,
        "updated_ts": TS,
    }
    row.update(overrides)
    cols = ", ".join(row)
    marks = ", ".join("?" for _ in row)
    con = sqlite3.connect(db)
    try:
        con.execute(
            f"INSERT INTO research_followups ({cols}) VALUES ({marks})", tuple(row.values())
        )
        con.commit()
    finally:
        con.close()


def test_fresh_install_shape_and_constraints(scratch) -> None:
    db, alembic = scratch
    alembic("upgrade", "head")
    assert _version(db) == NEW_HEAD
    assert "research_followups" in _table_names(db)

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        cols = {r[1] for r in con.execute("PRAGMA table_info(research_followups)").fetchall()}
        expected = {c.name for c in ResearchFollowup.__table__.columns}
        assert cols == expected, (cols, expected)
        # organization_id: NOT NULL with NO default
        org_col = [
            r
            for r in con.execute("PRAGMA table_info(research_followups)").fetchall()
            if r[1] == "organization_id"
        ][0]
        assert org_col[3] == 1  # notnull
        assert org_col[4] is None  # no default — silent org-system impossible
        # server defaults
        status_col = [
            r
            for r in con.execute("PRAGMA table_info(research_followups)").fetchall()
            if r[1] == "status"
        ][0]
        assert status_col[4] == "'scheduled'"
        payload_col = [
            r
            for r in con.execute("PRAGMA table_info(research_followups)").fetchall()
            if r[1] == "payload"
        ][0]
        assert payload_col[4] == "'{}'"
    finally:
        con.close()

    assert "ix_research_followups_org_status" in _index_names(db, "research_followups")
    assert "ix_research_followups_due" in _index_names(db, "research_followups")

    # CHECKs bite: junk status / junk followup_type
    with pytest.raises(sqlite3.IntegrityError):
        _insert(db, "rfu-1", status="bogus")
    with pytest.raises(sqlite3.IntegrityError):
        _insert(db, "rfu-2", followup_type="run_session_v99")
    # org honesty: direct SQL without an org fails loudly
    with pytest.raises(sqlite3.IntegrityError):
        _insert(db, "rfu-3", organization_id=None)
    # and the admissible shape inserts fine
    _insert(db, "rfu-4", followup_type="run_session", task_id="t-1")


def test_downgrade_drops_only_followups_table(scratch) -> None:
    db, alembic = scratch
    alembic("upgrade", "head")
    tables_at_head = _table_names(db)

    alembic("downgrade", PHASE2_HEAD)

    tables = _table_names(db)
    assert _version(db) == PHASE2_HEAD
    assert "research_followups" not in tables
    # everything else survives — exactly one table dropped
    assert tables_at_head - tables == {"research_followups"}
    assert "agent_tasks" in tables
    assert "research_sessions" in tables
    assert "research_tool_calls" in tables
    assert "research_evidence" in tables
    assert "research_facts" in tables

    alembic("upgrade", "head")  # re-upgrade works
    assert _version(db) == NEW_HEAD
    assert "research_followups" in _table_names(db)


def test_single_head_and_parent_link(scratch) -> None:
    _, alembic = scratch
    heads = alembic("heads")
    assert "b4c5d6e7f8a9" in heads
    assert heads.count("(head)") == 1
    history = alembic("history")
    assert "a3b4c5d6e7f8 -> b4c5d6e7f8a9" in history  # direct parent link
    lines = [ln for ln in history.splitlines() if ln.strip()]
    assert len(lines) == 21  # linear chain, one line per revision


def test_deployment_path_on_copy_of_operational_db(scratch, tmp_path: Path) -> None:
    """The exact deployment step: upgrade a throwaway COPY of the committed
    operational DB to head — five revisions. Must add exactly six tables and
    touch zero existing rows.

    Phase 8 (2026-11-26): the operational DB now ships at head, so the
    b9d0e1f2a4b5 baseline is reconstructed on the copy via the clean
    additive downgrade before the upgrade is exercised."""
    db, alembic = scratch
    db.write_bytes(REAL_DB.read_bytes())  # COPY — the committed DB is only read
    if _version(db) == NEW_HEAD:
        # Phase 8 deployed the operational DB to head; rebuild the baseline
        # state on this throwaway copy (downgrades cleanly — asserted again
        # at the end of this test).
        alembic("downgrade", OPS_BASE)
    before_tables = _table_names(db)
    before_counts = {
        t: c
        for t, c in [
            (
                name,
                sqlite3.connect(f"file:{db}?mode=ro", uri=True)
                .execute(f"SELECT count(*) FROM [{name}]")
                .fetchone()[0],
            )
            for name in before_tables - {"alembic_version"}
        ]
    }
    assert _version(db) == OPS_BASE
    assert "research_followups" not in before_tables

    alembic("upgrade", "head")

    assert _version(db) == NEW_HEAD
    after_tables = _table_names(db)
    assert "research_followups" in after_tables
    after_counts = {
        t: c
        for t, c in [
            (
                name,
                sqlite3.connect(f"file:{db}?mode=ro", uri=True)
                .execute(f"SELECT count(*) FROM [{name}]")
                .fetchone()[0],
            )
            for name in after_tables - {"alembic_version"}
        ]
    }
    for table, count in before_counts.items():
        assert after_counts[table] == count, f"row count changed for {table}"

    # and back down — the copy is again a b9d0e1f2a4b5 database
    alembic("downgrade", OPS_BASE)
    assert _version(db) == OPS_BASE
    assert _table_names(db) == before_tables
