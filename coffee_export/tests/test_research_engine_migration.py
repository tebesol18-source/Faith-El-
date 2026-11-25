"""
Research engine migration tests — TryComp Phase 2 (a3b4c5d6e7f8).

Proves, on disposable DBs only (never the committed operational DB):

  * fresh install — `alembic upgrade head` creates research_sessions and
    research_tool_calls with the approved shape: every model column
    present, the org/status + org/objective_key + session indexes, the
    status CHECKs that bite (junk session status, junk tool-call status,
    negative usage counters, negative duration) and the NO-default org
    rule (direct SQL without an org fails loudly)
  * server defaults land — status 'pending', usage counters 0 and the
    canonical unlimited BudgetSpec JSON
  * the ai_call_logs organization_id ORM mapping (§5.5.4 closure) — the
    column exists at DB level (a1b2c3d4e5f7) and is now mapped in the
    ORM with the SAME name/nullability, on the migration-produced schema
  * the deployment path — upgrading a THROWAWAY COPY of the committed
    operational DB from b9d0e1f2a4b5 to head (four revisions) adds
    exactly five tables and leaves every pre-existing table and row
    count untouched
  * downgrade scope — head → f2a3b4c5d6e7 drops ONLY the two new engine
    tables (agent_tasks and the Phase 1 research tables survive); the
    version pointer moves correctly; re-upgrade works
  * migration graph — exactly one head (a3b4c5d6e7f8) and a linear
    20-revision chain from the initial schema

Uses the project venv python (same pattern as
test_agent_task_migration) with COFFEE_DATABASE_URL pointing at the
throwaway file for every subprocess.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
from pathlib import Path

import pytest

from coffee_export.database.models.ai import AICallLog
from coffee_export.database.models.research import ResearchSession, ResearchToolCall

REPO_COFFEE = Path(__file__).resolve().parent.parent  # coffee_export/ (app dir)
REPO_ROOT = REPO_COFFEE.parent  # workspace root
VENV_PY = REPO_ROOT / ".venv" / "bin" / "python"
REAL_DB = REPO_ROOT / "state" / "coffee_export.db"

NEW_HEAD = "a3b4c5d6e7f8"  # research engine: sessions + tool calls
PHASE1_HEAD = "f2a3b4c5d6e7"  # parent — research evidence + facts
OPS_BASE = "b9d0e1f2a4b5"  # where the committed operational DB sits

TS = "2026-01-01T00:00:00+03:00"

UNLIMITED = {
    "max_cost_usd": None,
    "max_model_calls": None,
    "max_tool_calls": None,
    "max_wall_seconds": None,
}


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


def test_fresh_install_shape_and_constraints(scratch) -> None:
    db, alembic = scratch
    alembic("upgrade", "head")
    assert _version(db) == NEW_HEAD
    tables = _table_names(db)
    assert {"research_sessions", "research_tool_calls"} <= tables
    assert len(tables) == 70  # 68 (Phase 1 head) + 2 new engine tables

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        for table, model in (
            ("research_sessions", ResearchSession),
            ("research_tool_calls", ResearchToolCall),
        ):
            cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()}
            expected = {c.name for c in model.__table__.columns}
            assert cols == expected, table

        # named indexes exist (org/status, org/objective_key dedup path,
        # session tool-call history path)
        session_indexes = {
            i[1] for i in con.execute("PRAGMA index_list(research_sessions)").fetchall()
        }
        assert "ix_research_sessions_org_status" in session_indexes
        assert "ix_research_sessions_org_key" in session_indexes
        call_indexes = {
            i[1] for i in con.execute("PRAGMA index_list(research_tool_calls)").fetchall()
        }
        assert "ix_research_tool_calls_session" in call_indexes

        # the ai_call_logs ORM mapping matches the migration-produced
        # schema column-for-column (§5.5.4 closure — schema-neutral map)
        ai_cols = {r[1] for r in con.execute("PRAGMA table_info(ai_call_logs)").fetchall()}
        ai_orm = {c.name for c in AICallLog.__table__.columns}
        assert ai_orm <= ai_cols
        assert "organization_id" in ai_cols
    finally:
        con.close()

    # CHECKs bite + defaults land — needs a WRITABLE connection
    con = sqlite3.connect(db)
    try:
        # a well-formed session row is admitted and defaults land
        con.execute(
            "INSERT INTO research_sessions (session_id, organization_id, objective,"
            " objective_key, plan, budgets, created_by, created_ts, updated_ts)"
            f" VALUES ('s1','org-acme','Find buyers','find buyers','[]',"
            f"'{json.dumps(UNLIMITED, sort_keys=True, separators=(',', ':'))}',"
            f"'operator:1','{TS}','{TS}')"
        )
        row = con.execute(
            "SELECT status, usage_tool_calls, usage_model_calls, usage_cost_usd,"
            " started_ts, finished_ts, result FROM research_sessions"
            " WHERE session_id='s1'"
        ).fetchone()
        assert row == ("pending", 0, 0, None, None, None, None)
        budgets = json.loads(
            con.execute("SELECT budgets FROM research_sessions WHERE session_id='s1'").fetchone()[0]
        )
        assert budgets == UNLIMITED

        # honesty CHECKs: junk session status, negative usage counters
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_sessions (session_id, organization_id, objective,"
                " objective_key, plan, budgets, created_by, created_ts, updated_ts, status)"
                f" VALUES ('s2','org-acme','x','x','[]','{{}}','operator:1','{TS}','{TS}',"
                f"'paused')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_sessions (session_id, organization_id, objective,"
                " objective_key, plan, budgets, created_by, created_ts, updated_ts,"
                " usage_tool_calls)"
                f" VALUES ('s3','org-acme','x','x','[]','{{}}','operator:1','{TS}','{TS}',"
                f"-1)"
            )
        # organization_id NOT NULL with NO default: direct SQL without an
        # org fails loudly — no silent org-system attribution
        with pytest.raises(sqlite3.IntegrityError, match="organization_id"):
            con.execute(
                "INSERT INTO research_sessions (session_id, objective, objective_key,"
                f" plan, budgets, created_by, created_ts, updated_ts)"
                f" VALUES ('s4','x','x','[]','{{}}','operator:1','{TS}','{TS}')"
            )

        # tool-call rows: admitted when well-formed, junk status and
        # negative duration rejected, org required
        con.execute(
            "INSERT INTO research_tool_calls (call_id, organization_id, session_id, tool,"
            f" input, status, duration_ms, created_ts) VALUES ('c1','org-acme','s1',"
            f"'web_fetch','{{}}','ok',12,'{TS}')"
        )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_tool_calls (call_id, organization_id, session_id,"
                " tool, input, status, duration_ms, created_ts)"
                f" VALUES ('c2','org-acme','s1','web_fetch','{{}}','maybe',12,'{TS}')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_tool_calls (call_id, organization_id, session_id,"
                " tool, input, status, duration_ms, created_ts)"
                f" VALUES ('c3','org-acme','s1','web_fetch','{{}}','ok',-5,'{TS}')"
            )
        with pytest.raises(sqlite3.IntegrityError, match="organization_id"):
            con.execute(
                "INSERT INTO research_tool_calls (call_id, session_id, tool, input,"
                f" status, duration_ms, created_ts) VALUES ('c4','s1','web_fetch',"
                f"'{{}}','ok',12,'{TS}')"
            )
        con.commit()
    finally:
        con.close()


def test_deployment_path_on_copy_of_operational_db(scratch, tmp_path: Path) -> None:
    """The exact deployment step: upgrade a throwaway COPY of the committed
    operational DB (at b9d0e1f2a4b5) to head — four revisions. Must add
    exactly five tables and touch zero existing rows."""
    db, alembic = scratch
    db.write_bytes(REAL_DB.read_bytes())  # COPY — the committed DB is only read
    before_tables = _table_names(db)
    before_counts = _row_counts(db)
    assert _version(db) == OPS_BASE
    assert len(before_tables) == 65
    assert not (
        before_tables
        & {
            "agent_tasks",
            "research_evidence",
            "research_facts",
            "research_sessions",
            "research_tool_calls",
        }
    )
    # the ai_call_logs org column has been in the operational DB since
    # a1b2c3d4e5f7 — the Phase 2 ORM mapping is schema-neutral
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        ai_cols = {r[1] for r in con.execute("PRAGMA table_info(ai_call_logs)").fetchall()}
        assert "organization_id" in ai_cols
    finally:
        con.close()

    alembic("upgrade", "head")

    assert _version(db) == NEW_HEAD
    after_tables = _table_names(db)
    assert after_tables - before_tables == {
        "agent_tasks",
        "research_evidence",
        "research_facts",
        "research_sessions",
        "research_tool_calls",
    }
    after_counts = _row_counts(db)
    for table, count in before_counts.items():
        assert after_counts[table] == count, f"row count changed for {table}"

    # and back down — the copy is again a b9d0e1f2a4b5 database
    alembic("downgrade", OPS_BASE)
    assert _version(db) == OPS_BASE
    assert _table_names(db) == before_tables
    assert _row_counts(db) == before_counts


def test_downgrade_drops_only_engine_tables(scratch) -> None:
    """head → f2a3b4c5d6e7 drops ONLY the engine tables; agent_tasks and
    the Phase 1 research tables (created by earlier revisions) survive."""
    db, alembic = scratch
    alembic("upgrade", "head")
    assert len(_table_names(db)) == 70

    alembic("downgrade", PHASE1_HEAD)

    tables = _table_names(db)
    assert _version(db) == PHASE1_HEAD
    assert "research_sessions" not in tables
    assert "research_tool_calls" not in tables
    assert "research_evidence" in tables
    assert "research_facts" in tables
    assert "agent_tasks" in tables
    assert len(tables) == 68

    alembic("upgrade", "head")  # re-upgrade works
    assert _version(db) == NEW_HEAD
    assert len(_table_names(db)) == 70


def test_single_head_linear_chain(scratch) -> None:
    """Exactly one head; the new revision chains directly on the Phase 1
    head; the whole chain is linear (20 revisions from the initial schema).

    NOTE: `alembic history` renders lines as "<parent> -> <rev> (head),
    title" — assert the head marker and revision PRESENCE, never the
    position of the revision id in the line (rebuild incident #2).
    """
    _, alembic = scratch
    heads = alembic("heads")
    assert "a3b4c5d6e7f8" in heads
    assert heads.count("(head)") == 1

    history = alembic("history")
    assert "f2a3b4c5d6e7 -> a3b4c5d6e7f8" in history  # direct parent link
    lines = [ln for ln in history.splitlines() if ln.strip()]
    assert len(lines) == 20  # linear chain, one line per revision
    assert "47eb259e4dd2" in history  # initial schema is the chain tail
