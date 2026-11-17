# Phase 1A — Durable Task Queue Infrastructure

Status: **Phase 1A complete.** Infrastructure only — no business task type
is registered, no recurring job is scheduled, and nothing in the
application enqueues work. Recurring-job integration is a separately
approved later phase.

## 1. What this adds and why

Before Phase 1A, background work ran on APScheduler inside the API
process (`tasks/task_queue.py`). Anything not yet executed when the
process exits is lost, jobs carry no retry budget, and Agent 4's ad-hoc
`with TaskQueue() as queue:` pattern drops queued work on shutdown.
Phase 1A adds a *durable* queue so that a task, once enqueued, survives
process restarts and crashes:

* `agent_tasks` table (migrations `c8d9e0f1a2b3` → `d9e0f1a2b3c4`, from
  parent `b9d0e1f2a4b5`)
* `DurableTaskQueue` service (`tasks/durable_queue.py`)
* task registry with dual-gate payload validation (`tasks/registry.py`)
* dedicated worker process with lease heartbeat (`tasks/worker.py`)
* admin CLI for inspection and terminal-task requeue (`tasks/admin.py`)

Migration `d9e0f1a2b3c4` (Phase 1A correction) widens the status CHECK
from 4 to 5 states (adds `failed`, the terminal non-retryable failure)
and removes the `organization_id` `server_default='org-system'` —
see §3 and §10.

## 2. State machine and lease fencing

Five-state contract:

```
pending ──claim──▶ leased ──complete──▶ completed   [terminal, immutable history]
   ▲                  │
   │ retryable fail,  │ retryable fail, attempts ≥ max_attempts
   │ budget remains   ├──▶ dead      [terminal]
   └──────────────────┤
                      │ non-retryable fail
                      └──▶ failed    [terminal]

operator requeue: failed | dead ──▶ pending (attempts reset; --keep-attempts preserved)
```

| State | Meaning |
| --- | --- |
| `pending` | waiting to execute or retry |
| `leased` | claimed by a worker |
| `completed` | success — terminal, immutable history |
| `failed` | terminal NON-retryable error (unregistered type, corrupt payload, validator rejection, handler-raised `NonRetryableTaskError`) |
| `dead` | retryable errors exhausted the configured retry budget |

Transition rules:

* Retryable failure below the limit → `pending` with exponential
  backoff `BASE × 2^(attempts−1)`.
* Non-retryable failure → `failed` **directly, taking precedence over an
  exhausted budget** — a task that can never succeed must not consume
  retries (`attempts=1, max_attempts=1, retryable=False` → `failed`,
  not `dead`).
* `NonRetryableTaskError` forces the non-retryable path even if a call
  site wrongly passes `retryable=True` (defense in depth).
* Expired leases are recovered by the reaper to `pending` (backoff,
  budget preserved) or `dead` when exhausted — the reaper **never
  produces `failed`**: an expired lease is retryable by nature (the
  worker died, not the task).
* Operator requeue: `failed|dead → pending`, fresh budget by default;
  `completed` is never requeueable; `pending`/`leased` are refused.

Every claim mints a fresh **UUID4 `lease_token`**. Only the claim that
currently holds the token may `complete` / `fail` / `renew` — every one
of those statements is fenced:

```sql
UPDATE agent_tasks SET … WHERE task_id = :id
                        AND status   = 'leased'
                        AND lease_token = :token
```

`rowcount != 1` means the lease was lost (reaper recovered it, another
claim owns it). The caller must then **discard its result** and never
overwrite the row — the worker logs this and moves on. Fencing is keyed
on the token, never on `lease_owner`: two claims by the same owner must
not both be valid.

## 3. Semantics

| Operation | Behavior |
| --- | --- |
| `enqueue(type, payload, *, organization_id)` | INSERT `pending`. Registry-validated first (gate 1) — unknown types and invalid payloads raise before anything is written. `organization_id` is **required** (empty/falsy → `ValueError`); pass `SYSTEM_ORG` explicitly for genuine system-scope tasks. |
| `claim_next(owner)` | Atomic `pending → leased`. Order: `priority, scheduled_ts, created_ts`. Nothing due before `scheduled_ts` is claimed. `attempts` +1 per claim; `started_ts` set once (first claim). |
| `renew(id, token)` | Extends `lease_expires_ts` by the TTL. Fenced by token. |
| `complete(id, token, result)` | `leased → completed`, result stored as JSON. Fenced by token. |
| `fail(id, token, error, retryable=True)` | `retryable=False` → `leased → failed` (terminal, one attempt — precedence over an exhausted budget); retryable with budget left → `pending` with backoff `BASE × 2^(attempts−1)`; retryable and `attempts ≥ max_attempts` → `dead`. A `NonRetryableTaskError` error object forces the failed path even if `retryable=True`. Fenced by token. |
| `reap_expired()` | Every `leased` row with `lease_expires_ts ≤ now` → pending with backoff, or dead when exhausted. Idempotent under concurrent reapers. Never produces `failed`. |
| `requeue(id)` | Operator action: `failed|dead → pending`, attempts reset (or kept with `--keep-attempts`), due immediately. Terminal states only. |

Execution semantics are **at-least-once**: a worker that dies mid-task
has its lease recovered by the reaper and the task re-run. Handlers
integrated in a later phase must therefore be idempotent — that
requirement is part of the integration contract, not optional.

## 4. Dialect handling

* **SQLite (current deployment target)** — the queue uses its own engine
  (`create_queue_engine`) whose *every* transaction starts with
  `BEGIN IMMEDIATE` (write lock up front), plus
  `busy_timeout = TASK_QUEUE_SQLITE_BUSY_TIMEOUT_MS` (5 000 ms) so
  concurrent claimers wait instead of failing. `FOR UPDATE` is a no-op
  on SQLite (verified against the dialect); `BEGIN IMMEDIATE` provides
  the serialization. The shared application engine additionally sets
  `PRAGMA busy_timeout=5000` (`database/base.py`) so app writes and
  queue writes do not error under each other.
* **PostgreSQL (future)** — claims use `SELECT … FOR UPDATE SKIP LOCKED`,
  the standard multi-worker pattern. **Runtime testing against a real
  PostgreSQL server has NOT been performed and is a documented future
  requirement** (see §9); SQLite is the only supported deployment target
  in Phase 1A.

## 5. Worker

```
python -m coffee_export.tasks.worker
```

* **Singleton**: `flock(LOCK_EX|LOCK_NB)` on `TASK_WORKER_LOCK_FILE`
  (`data/worker.lock`, resolved against the Python `BASE_DIR`,
  gitignored). A second worker exits immediately with code 3. The OS
  releases the lock when the process dies — a crashed worker never
  wedges the slot; its leased rows are recovered by the reaper.
  Exactly one worker process is the SQLite deployment contract.
* **Loop**: poll every 5 s (`TASK_QUEUE_POLL_INTERVAL_SECONDS`) when
  idle; a reap pass every 60 s (`TASK_QUEUE_REAPER_INTERVAL_SECONDS`).
* **Heartbeat**: while a handler runs, a daemon thread renews the lease
  every 100 s (`TASK_QUEUE_HEARTBEAT_SECONDS`) against the 300 s TTL
  (`TASK_QUEUE_LEASE_TTL_SECONDS`). If a renewal is fenced out, the
  worker finishes the handler but discards the result.
* **Gate 2**: after claiming, the payload is re-validated — a row
  tampered directly in the DB (invalid JSON / failing validator) is
  failed through the fenced path and never executed. Gate-2 rejections
  are **non-retryable**: the task terminates as `failed` on its first
  attempt (no pointless retry cycling of tampered rows).
* **Failure classification** (worker `_execute`):

  | Site | Classification | Resulting state |
  | --- | --- | --- |
  | Gate 2a — unregistered task type | non-retryable | `failed` (1 attempt) |
  | Gate 2b — payload not valid JSON | non-retryable | `failed` (1 attempt) |
  | Gate 2c — validator rejection | non-retryable | `failed` (1 attempt) |
  | Handler raises `NonRetryableTaskError` | non-retryable | `failed` (1 attempt) |
  | Handler raises anything else | retryable | `pending` w/ backoff → `dead` when exhausted |
* **Graceful shutdown**: SIGTERM/SIGINT stop claiming; a running task is
  finished first; exit 0. A hard kill leaves the lease to expire and the
  reaper to recover — safe by design.
* **Robustness**: an unexpected exception in an iteration is logged and
  the loop continues; the worst case is a leased row that the reaper
  recovers.

## 6. Admin CLI

```
python -m coffee_export.tasks.admin stats
python -m coffee_export.tasks.admin list [--status S] [--limit N]
python -m coffee_export.tasks.admin show  <task_id>
python -m coffee_export.tasks.admin requeue <task_id> [--keep-attempts]
```

`requeue` gives a fresh retry budget by default;
`--keep-attempts` preserves the count so the next retryable failure
goes straight to dead (a non-retryable one goes to failed either way).
Only `failed` and `dead` tasks are requeueable — fix the underlying
cause first; requeue re-validates nothing. Exit codes: 0 ok, 1 not
found / not requeueable, 2 usage.

## 7. Configuration (defaults)

| Setting | Default | Meaning |
| --- | --- | --- |
| `TASK_QUEUE_LEASE_TTL_SECONDS` | 300 | lease lifetime per claim |
| `TASK_QUEUE_HEARTBEAT_SECONDS` | 100 | renewal cadence while a task runs |
| `TASK_QUEUE_REAPER_INTERVAL_SECONDS` | 60 | reaper cadence in the worker |
| `TASK_QUEUE_POLL_INTERVAL_SECONDS` | 5 | idle poll cadence |
| `TASK_QUEUE_BACKOFF_BASE_SECONDS` | 60 | retry backoff base (×2 per attempt) |
| `TASK_QUEUE_MAX_ATTEMPTS` | 3 | retry budget per task |
| `TASK_QUEUE_DEFAULT_PRIORITY` | 100 | lower value = claimed earlier |
| `TASK_QUEUE_SQLITE_BUSY_TIMEOUT_MS` | 5000 | queue-engine busy timeout |
| `TASK_WORKER_LOCK_FILE` | `data/worker.lock` | singleton lock file |

Timestamps are ISO-8601 +03:00 with **seconds precision**
(`now_addis_iso`) — lexicographically comparable; keep any future
queue-related timing comfortably above one second.

## 8. Deployment runbook

1. `alembic upgrade head` — applies `c8d9e0f1a2b3` (creates
   `agent_tasks`, additive only) then `d9e0f1a2b3c4` (widens the status
   CHECK to 5 states and drops the `organization_id` server default).
   On SQLite the second revision rebuilds the table via batch mode —
   verified on a copy of the operational DB: 65 existing tables, all
   row counts, all 3 `agent_tasks` indexes and the 3 other CHECKs
   preserved. **Never** run migrations against a DB that has not been
   backed up; `scripts/backup-db.sh` exists for this.
2. Confirm the table: `python -m coffee_export.tasks.admin stats`
   (all zeros on a fresh install).
3. Start the worker:
   `python -m coffee_export.tasks.worker` (under the existing supervisor
   pattern, one process on SQLite). Watch the first log line
   `worker … started`.
4. Stop the worker with SIGTERM (graceful). A second worker instance
   refuses to start (exit 3) — that is the singleton guard, not an error.
5. Monitoring: `admin stats` (`failed > 0` or `dead > 0` warrants a look
   at `admin list --status failed` / `--status dead`); requeue after
   fixing the cause: `admin requeue <task_id>`.

## 9. Limitations & future requirements

* **PostgreSQL runtime testing is a future requirement.** The PG claim
  path (`FOR UPDATE SKIP LOCKED`) is implemented and unit-level
  reviewed, but has never run against a real PostgreSQL server.
  SQLite is the only supported deployment target in Phase 1A.
* **One worker process on SQLite** (lock-enforced). Multi-worker on
  PostgreSQL is the future deployment mode and requires the PG testing
  above first.
* **No business integration**: the registry ships empty and the 8
  recurring jobs in `tasks/jobs.py` remain unscheduled. Enqueue rejects
  every unregistered task type — that is the mechanism keeping this
  phase infrastructure-only.
* Queue-engine transactions on SQLite all take the write lock up front
  (BEGIN IMMEDIATE), including reads like `list`/`stats`. They are
  millisecond-scale; acceptable for a single-worker deployment.
* Second-granularity timestamps: effects up to ±1 s on expiry/scheduling
  comparisons. Irrelevant at the 300 s / 60 s production defaults.

## 10. Security & tenant notes

* **Explicit org scope (no silent org-system default).** `enqueue()`
  requires `organization_id` (keyword-only, no default); empty/falsy
  values raise `ValueError`. Genuine system-scope tasks pass the
  exported constant `SYSTEM_ORG` ("org-system") deliberately. The ORM
  column has no Python-side default and migration `d9e0f1a2b3c4` drops
  the DB `server_default`, so even direct SQL inserts without an org
  fail NOT NULL loudly. Rationale — this codebase's own incident
  history: leads/import and the messaging bridge both had
  tenant-misattribution bugs caused by silent org-system fallbacks, and
  `src/lib/sessions.ts` carries the project rule "SECURITY: Do NOT fall
  back to org-system". (Pre-existing org-system defaults inside
  `StateManager`/`EventBus`/`supervisor.js` are a separate, pre-existing
  hardening pass — out of scope here.)
* Claims are org-agnostic by design — the queue is a shared transport;
  the org stamp is the attribution/audit record for future handlers,
  which will be contractually required to enforce tenant scoping through
  the existing tenant-enforced repositories when business integration
  is approved.
* The admin CLI and worker never log payloads or results — only ids,
  types, statuses and error strings (truncated to 2 000 chars).
* No credentials, DB files or runtime artifacts are committed
  (`data/worker.lock` is gitignored).
