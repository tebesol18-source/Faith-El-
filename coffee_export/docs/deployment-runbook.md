# Faith-El ERP — Deployment Runbook

Status: **Phase 8-verified (2026-11-26).** Every command below was executed
and recorded during the Phase 8 end-to-end validation on the real
operational database. This runbook covers the deployment of the full
TryComp selective-integration arc (Phases 0–8) at git head
`trycomp-selective-integration`.

---

## 1. What is being deployed

| Layer | Contents |
| --- | --- |
| Node/Next.js app | `src/` — CRM pages, API routes, supervisor, email bridge client |
| Python ERP core | `coffee_export/` — 7 agents, StateManager, durable task queue (1A), research engine + evidence/facts/followups (TryComp Phases 1–7), outreach/qualification/monitoring services |
| Database | `state/coffee_export.db` (SQLite) — Alembic chain, head `b4c5d6e7f8a9` (21 revisions) |
| Operators dashboard | Streamlit (`coffee_export/scripts/run_dashboard.py`, incl. the Phase 7 Research Monitor page) |

## 2. Prerequisites

```bash
# Python side (3.12)
python3 -m venv .venv
.venv/bin/pip install -r coffee_export/requirements.txt

# Node side
npm ci            # package-lock.json is authoritative
```

Environment: `COFFEE_DATABASE_URL` (defaults to `state/coffee_export.db`),
bridge/Resend and search-provider keys only if those capabilities are used
— unconfigured capabilities stay honestly disabled, they never fake
results (project rule §4).

## 3. Pre-flight (before touching the operational DB)

```bash
sha256sum state/coffee_export.db        # RECORD THIS
cp state/coffee_export.db state/coffee_export.db.bak-$(date +%Y%m%d-%H%M%S)
cd coffee_export
../.venv/bin/alembic current            # expected: b9d0e1f2a4b5 (pre-Phase-8)
cd ..
```

## 4. The migration (b9d0e1f2a4b5 → head)

Five additive revisions, **proven on the real deployment DB in Phase 8**:

```
b9d0e1f2a4b5 → c8d9e0f1a2b3  agent_tasks (durable queue, 1A)
             → d9e0f1a2b3c4  five-state contract + explicit org scope
             → f2a3b4c5d6e7  research_evidence + research_facts (Phase 1)
             → a3b4c5d6e7f8  research_sessions + research_tool_calls (Phase 2)
             → b4c5d6e7f8a9  research_followups (Phase 3, HEAD)
```

```bash
cd coffee_export
COFFEE_DATABASE_URL=sqlite:////<abs-path>/state/coffee_export.db \
  ../.venv/bin/alembic upgrade head
```

Phase 8 measured effects (must reproduce exactly): 64 → 70 tables (6 new:
`agent_tasks`, `research_evidence`, `research_facts`, `research_followups`,
`research_sessions`, `research_tool_calls`), **zero row-count drift** on all
pre-existing tables, alembic version `b4c5d6e7f8a9`.

> SQLite WAL note: after the upgrade the migration pages may sit in the
> `-wal` file; the next connection checkpoints them into the main file and
> the sha256 changes once (observed in Phase 8:
> `ce14d7b0…` → `55363dbb…`, data identical). Take the post-deployment
> baseline hash AFTER this settles.

## 5. Post-flight verification (all hermetic — the committed DB is never written)

```bash
bash scripts/run-python-tests.sh        # 400 passed + 8 smoke suites + supervisor tick
npx vitest run tests/lib                # 136 passed
npx tsc --noEmit                        # 0 errors
sha256sum state/coffee_export.db        # UNCHANGED by the batteries (hermeticity guard)
```

Expected supervisor-tick behaviour offline: the Agent 3 bridge send fails
with a transport error and the action is marked `execution_failed` — that
is the honest-failure contract, NOT a deployment defect.

The migration-path guard lives in the suite itself
(`test_*_migration.py::test_deployment_path_on_copy_of_operational_db`):
it reconstructs the b9d0e1f2a4b5 baseline on a throwaway copy and re-runs
the full upgrade + downgrade with row-count preservation asserts.

## 6. Rollback

```bash
cd coffee_export
COFFEE_DATABASE_URL=… ../.venv/bin/alembic downgrade b9d0e1f2a4b5
# (Phase 8-verified: returns to the exact baseline table set + row counts)
```

File-level rollback: restore the `.bak-*` copy from §3.

## 7. Runtime

```bash
npm run start:prod        # build + standalone server (see package.json)
node scripts/supervisor.js            # agent supervisor loop
python coffee_export/scripts/run_dashboard.py   # Streamlit operators dashboard
```

Durable work: the queue worker is the single writer for `agent_tasks`
(lease-fenced, five-state, org-scoped). Research sessions, followup
dispatching and the approval-queue outreach flow all run through it.

## 8. Standing invariants (do not deploy around them)

1. `pending_agent_actions` is the ONLY send path — the human approves,
   the supervisor executes (§4.5 dual gate). Research drafts land there
   pending, never auto-send.
2. Every Python-side write stamps the real `organization_id` (§4.1).
3. Unconfigured providers refuse loudly; no fabricated search/evidence
   results ever reach the ledger (§4 honesty rules).
4. Migrations are additive-only, single head, never edited after push.
