"""
Research foundation migration tests — TryComp Phase 1 (f2a3b4c5d6e7),
updated for the Phase 2 chain (a3b4c5d6e7f8 on top) and the Phase 3
chain (b4c5d6e7f8a9 on top of that).

Proves, on disposable DBs only (never the committed operational DB):

  * fresh install — `alembic upgrade head` creates research_evidence and
    research_facts with the approved shape: every model column present,
    the org-scoped UNIQUE key uq_research_facts_key, both org/status
    indexes, and the honesty CHECKs that actually bite (junk source_type,
    fetched row without an http(s) URL, human row without an actor)
  * the SQLite autoindex contract — a NAMED table-level UNIQUE constraint
    is implemented by SQLite as an automatic index
    (sqlite_autoindex_<table>_<n>, origin 'u'), and the constraint NAME
    never appears as an index name. The test asserts the actual contract:
    exactly one origin-'u' unique index covering
    [organization_id, subject_type, subject_id, fact_key] in order, plus
    the named constraint in the CREATE TABLE SQL — so nobody "fixes" it
    backwards later (original-implementation incident #3).
  * the deployment path — upgrading a THROWAWAY COPY of the committed
    operational DB from b9d0e1f2a4b5 to head (five revisions) adds
    exactly six tables (agent_tasks + the two research tables + the
    two research-engine tables + the followups table) and leaves every
    pre-existing table and row count untouched
  * downgrade scope — head → d9e0f1a2b3c4 drops ONLY the research,
    research-engine and followup tables (agent_tasks survives); the
    version pointer moves correctly
  * migration graph — exactly one head (b4c5d6e7f8a9) and a linear
    21-revision chain from the initial schema

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

from coffee_export.database.models.research import ResearchEvidence, ResearchFact

REPO_COFFEE = Path(__file__).resolve().parent.parent  # coffee_export/ (app dir)
REPO_ROOT = REPO_COFFEE.parent  # workspace root
VENV_PY = REPO_ROOT / ".venv" / "bin" / "python"
REAL_DB = REPO_ROOT / "state" / "coffee_export.db"

NEW_HEAD = "b4c5d6e7f8a9"  # research followups (TryComp Phase 3)
PHASE2_HEAD = "a3b4c5d6e7f8"  # research engine: sessions + tool calls
PHASE1_HEAD = "f2a3b4c5d6e7"  # this suite's own revision (research evidence + facts)
FIVE_STATE_HEAD = "d9e0f1a2b3c4"  # parent — agent_tasks five-state contract
OPS_BASE = "b9d0e1f2a4b5"  # where the committed operational DB sits

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
    assert {"research_evidence", "research_facts"} <= tables

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        for table, model in (
            ("research_evidence", ResearchEvidence),
            ("research_facts", ResearchFact),
        ):
            cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()}
            expected = {c.name for c in model.__table__.columns}
            assert cols == expected, table

        # ── the SQLite autoindex contract for uq_research_facts_key ──
        # A named table-level UNIQUE constraint is enforced via an
        # automatic index (origin 'u'); the constraint name itself never
        # appears as an index name (original-implementation incident #3).
        indexes = con.execute("PRAGMA index_list(research_facts)").fetchall()
        # (seq, name, unique, origin, partial)
        unique_autoindexes = [i for i in indexes if i[3] == "u" and i[2] == 1]
        assert len(unique_autoindexes) == 1
        autoindex_name = unique_autoindexes[0][1]
        assert autoindex_name.startswith("sqlite_autoindex_research_facts_")
        covered = [r[2] for r in con.execute(f"PRAGMA index_info({autoindex_name})").fetchall()]
        assert covered == ["organization_id", "subject_type", "subject_id", "fact_key"]
        ddl = con.execute("SELECT sql FROM sqlite_master WHERE name='research_facts'").fetchone()[0]
        assert "CONSTRAINT uq_research_facts_key UNIQUE" in ddl

        # org/status composite index + the evidence subject hot-path index
        named = {i[1] for i in indexes}
        assert "ix_research_facts_org_status" in named
        ev_indexes = {i[1] for i in con.execute("PRAGMA index_list(research_evidence)").fetchall()}
        assert "ix_research_evidence_subject" in ev_indexes
    finally:
        con.close()

    # CHECKs bite + defaults land — needs a WRITABLE connection
    con = sqlite3.connect(db)
    try:
        con.execute("PRAGMA foreign_keys=ON")
        # a well-formed website row is admitted
        con.execute(
            "INSERT INTO research_evidence (evidence_id, organization_id, subject_type,"
            " subject_id, fact_key, value, source_type, source_url, status, suppressed,"
            " created_ts) VALUES ('ev1','org-acme','lead','lead-1','volume','1200',"
            f"'website','https://example.com/x','observed',0,'{TS}')"
        )
        # honesty CHECKs: fetched row without URL, junk source_type,
        # human row without actor, junk status
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_evidence (evidence_id, organization_id,"
                " subject_type, subject_id, fact_key, value, source_type, status,"
                f" suppressed, created_ts) VALUES ('ev2','org-acme','lead','lead-1',"
                f"'volume','1200','website','observed',0,'{TS}')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_evidence (evidence_id, organization_id,"
                " subject_type, subject_id, fact_key, value, source_type, source_url,"
                f" status, suppressed, created_ts) VALUES ('ev3','org-acme','lead',"
                f"'lead-1','volume','1200','rumor','https://x.example','observed',"
                f"0,'{TS}')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_evidence (evidence_id, organization_id,"
                " subject_type, subject_id, fact_key, value, source_type, status,"
                f" suppressed, created_ts) VALUES ('ev4','org-acme','lead','lead-1',"
                f"'volume','1200','human','observed',0,'{TS}')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_evidence (evidence_id, organization_id,"
                " subject_type, subject_id, fact_key, value, source_type, source_url,"
                f" status, suppressed, created_ts) VALUES ('ev5','org-acme','lead',"
                f"'lead-1','volume','1200','website','https://example.com/x','bogus',"
                f"0,'{TS}')"
            )
        # organization_id NOT NULL with NO default: direct SQL without an
        # org fails loudly — no silent org-system attribution
        with pytest.raises(sqlite3.IntegrityError, match="organization_id"):
            con.execute(
                "INSERT INTO research_evidence (evidence_id, subject_type, subject_id,"
                " fact_key, value, source_type, source_url, status, suppressed,"
                f" created_ts) VALUES ('ev6','lead','lead-1','volume','1200','website',"
                f"'https://example.com/x','observed',0,'{TS}')"
            )
        # fact defaults
        con.execute(
            "INSERT INTO research_facts (fact_id, organization_id, subject_type,"
            " subject_id, fact_key, value, created_ts, updated_ts)"
            f" VALUES ('f1','org-acme','lead','lead-1','volume','1200','{TS}','{TS}')"
        )
        row = con.execute(
            "SELECT status, conflicting, source_count FROM research_facts" " WHERE fact_id='f1'"
        ).fetchone()
        assert row == ("observed", 0, 0)
        # the org-scoped UNIQUE key bites (same org + subject + key)
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO research_facts (fact_id, organization_id, subject_type,"
                " subject_id, fact_key, value, created_ts, updated_ts)"
                f" VALUES ('f2','org-acme','lead','lead-1','volume','900','{TS}','{TS}')"
            )
        # ... but the SAME key in another org coexists (tenant scoping)
        con.execute(
            "INSERT INTO research_facts (fact_id, organization_id, subject_type,"
            " subject_id, fact_key, value, created_ts, updated_ts)"
            f" VALUES ('f3','org-beta','lead','lead-1','volume','900','{TS}','{TS}')"
        )
        con.commit()
    finally:
        con.close()


def test_deployment_path_on_copy_of_operational_db(scratch, tmp_path: Path) -> None:
    """The exact deployment step: upgrade a throwaway COPY of the committed
    operational DB (at b9d0e1f2a4b5) to head — five revisions. Must add
    exactly six tables and touch zero existing rows."""
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
            "research_followups",
            "research_sessions",
            "research_tool_calls",
        }
    )

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
    alembic("downgrade", OPS_BASE)
    assert _version(db) == OPS_BASE
    assert _table_names(db) == before_tables
    assert _row_counts(db) == before_counts


def test_downgrade_drops_only_research_tables(scratch) -> None:
    """head → d9e0f1a2b3c4 drops ONLY the research, research-engine and
    followup tables; agent_tasks (created by the two earlier revisions)
    survives."""
    db, alembic = scratch
    alembic("upgrade", "head")
    assert len(_table_names(db)) == 71

    alembic("downgrade", FIVE_STATE_HEAD)

    tables = _table_names(db)
    assert _version(db) == FIVE_STATE_HEAD
    assert "research_evidence" not in tables
    assert "research_facts" not in tables
    assert "research_followups" not in tables
    assert "research_sessions" not in tables
    assert "research_tool_calls" not in tables
    assert "agent_tasks" in tables
    assert len(tables) == 66

    alembic("upgrade", "head")  # re-upgrade works
    assert _version(db) == NEW_HEAD
    assert len(_table_names(db)) == 71


def test_single_head_linear_chain(scratch) -> None:
    """Exactly one head; the chain is linear (21 revisions from the initial
    schema) with the Phase 1 revision linking directly on the five-state
    head, the Phase 2 engine revision on the Phase 1 head, and the Phase 3
    followups revision on the Phase 2 head.

    NOTE: `alembic history` renders lines as "<parent> -> <rev> (head),
    title" — assert the head marker and revision PRESENCE, never the
    position of the revision id in the line (original-implementation
    rebuild incident #2).
    """
    _, alembic = scratch
    heads = alembic("heads")
    assert "b4c5d6e7f8a9" in heads
    assert heads.count("(head)") == 1

    history = alembic("history")
    assert "d9e0f1a2b3c4 -> f2a3b4c5d6e7" in history  # Phase 1 parent link
    assert "f2a3b4c5d6e7 -> a3b4c5d6e7f8" in history  # Phase 2 parent link
    assert "a3b4c5d6e7f8 -> b4c5d6e7f8a9" in history  # Phase 3 parent link
    lines = [ln for ln in history.splitlines() if ln.strip()]
    assert len(lines) == 21  # linear chain, one line per revision
    assert "47eb259e4dd2" in history  # initial schema is the chain tail
