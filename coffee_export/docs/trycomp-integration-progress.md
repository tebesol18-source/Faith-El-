# TryComp Selective Integration — Progress & Project Memory

This is the permanent project memory for the selective TryComp AI integration into
Faith-El Export. Every implementation phase updates this file. A new coding session
must be able to continue from this document alone.

- **Integration branch:** `trycomp-selective-integration` (workspace lost a THIRD time on 2026-11-25, AFTER the Phase 2 commit — restored loss-free from the exported bundle; see §0.2)
- **Last updated:** Phase 3 (durable research execution) — 2026-11-25
- **Current phase:** 3 complete (250-test full suite on the working tree; commit follows); next action in §12

---

## 0. Recovery record (2026-11-18)

The original integration ran in a workspace that was recycled by the
sandbox on 2026-11-17/18, destroying its unpushed commits. Verified
2026-11-18: no `trycomp-selective-integration` branch, no dangling
Phase 0/Phase 1 commits, and no `research/` source files survive in any
workspace or object store on this machine. What survives is this
document (recovered) and the Phase 0 deliverables in the operator's
download folder (baseline audit, design-decision report, Phase 1A
reports).

| Item | Original (LOST) | First rebuild (LOST AGAIN) | Second rebuild (current) |
| --- | --- | --- | --- |
| Five-state correction | `7bea4f52` (local only, never pushed) | `491ecf614271743a62f3f8bfcba927341045fdb9` — verified, pushed | unchanged — still secured on `origin/phase-1a-five-state-contract` (re-verified via `git ls-remote` at the second rebuild) |
| Phase 0 doc commit | `bffb554` | `7e370f8` | `0fa2940` (restored verbatim from the recovered document) |
| Phase 1 (evidence + facts) | complete, 145 tests, migration `f2a3b4c5d6e7` | `1babbc4` — complete, 30-test battery + 145 full suite (§13.5) | rebuilt again to the same §13 semantics — same migration id, same test counts (§13.6) |

Rebuild protocol: this branch (`trycomp-selective-integration`) is cut
from the verified base `491ecf61`. Phase 0 is restored first; Phase 1 is
then rebuilt to the semantics recorded in §13 before Phase 2 starts.
Nothing else changes: the rejected list (§3) and the standing security
decisions (§4) remain binding.

### 0.1 Second loss and second rebuild (2026-11-18, later the same day)

The first rebuild (§13.5) was done in an isolated clone that lived under
the session-scoped storage (`/tmp/my-project/workspace/faithel-trycomp`)
and was destroyed when that sandbox was recycled — hours after its
completion report was written. Verified before rebuilding again: the
clone directory exists but is empty; no `trycomp-selective-integration`
branch, no dangling commits and no `research/` source files in any
workspace or object store on this machine; the remote still shows only
the six known branches (five-state checkpoint intact at `491ecf6`).
Survivors: this document, the Phase 1 completion report and the Phase 0
deliverables in the operator's download folder.

Second-rebuild changes (everything else identical to the §13 spec):

1. **Location** — the clone now lives in the storage that demonstrably
   survives recycling (`/home/z/my-project/workspace/faithel-trycomp`,
   next to `faithel-1a-clean` and `Faith-El-`, which survived every
   previous recycling). The two pre-existing workspaces remain
   untouched.
2. **Backup** — a `git bundle` of the branch is exported to the
   operator's download folder after every commit, so the work survives
   ANY future workspace loss and the owner can push it at any time
   (`git fetch <bundle> trycomp-selective-integration`), independent of
   a live session.
3. Same migration id `f2a3b4c5d6e7`, same file set, same test counts
   (§13.6). Design notes for the second rebuild are recorded in §13.6
   because the first rebuild's code is as unrecoverable as the
   original's.

### 0.2 Third loss and bundle restore (2026-11-25)

The persistent workspace directory itself
(`/home/z/my-project/workspace/faithel-trycomp`) was lost to a sandbox
recycling AFTER the Phase 2 commit (`e65c287`, committed 2026-11-25
08:25 UTC) — but the §0.1 backup protocol held: the post-commit bundle
export (`trycomp-selective-integration-phase2.bundle`, written minutes
after the commit) survived in the operator's download folder. The
branch was restored the same day with zero loss:

1. fresh clone from the bundle → `/home/z/my-project/workspace/
   faithel-trycomp` (branch `trycomp-selective-integration`, HEAD
   `e65c287`, working tree clean, remote re-pointed at the GitHub
   origin — bundle clones carry no origin URL);
2. full re-verification on the restored tree: research battery
   **72 passed**, full suite **213 passed, 1 warning** (pre-existing
   starlette/httpx) on a throwaway copy of the operational DB, and the
   operational DB itself byte-identical (`ce14d7b0…`) before and after;
3. protocol gap found during the restore and fixed by the docs commit
   that follows: the Phase 2 commit had NOT updated this document
   (§8/§9/§11/§12/§14 now carry the Phase 2 record).

Lesson absorbed: the bundle export is now the LAST step of every phase
commit, immediately after `git commit` and before any verification run
that could itself be interrupted.

---

## 1. Objectives

Build Faith-El Export into an AI-powered Ethiopian coffee export brokerage and
exporter operating platform. The commercial center of gravity is the **Buyer
Opportunity Radar**: find real international coffee buyers, identify their
purchasing decision-makers, verify their requirements with evidence, match them
with suitable Ethiopian exporters and coffee, facilitate qualified commercial
conversations, and track opportunities through quotations, samples, negotiations
and export contracts.

The system must be useful to real Ethiopian coffee exporters: reliable,
multi-tenant, research-driven, with autonomous research capabilities, persistent
execution, traceable intelligence, controlled AI spending, and human-controlled
commercial decisions.

## 2. TryComp source situation (honest record)

**No TryComp source code exists in this environment and no TryComp repository URL
was provided.** A full-filesystem search for TryComp content found nothing. The
directive's approved capability list (§3 below) is therefore implemented as
Faith-El-native modules. Nothing is imported from TryComp because nothing exists
to import. This also guarantees the rejected list below cannot be imported.

## 3. Approved capabilities vs rejected architecture

Approved (to be implemented as Faith-El-native):

| ID | Capability | Faith-El implementation surface |
| --- | --- | --- |
| A | Research Agent (coffee-trade specialized) | new `coffee_export/research/` package: session engine, objective → plan → tools → evidence → structured result; LLM-assisted planning through existing `AIGateway` with deterministic fallback |
| B | Evidence Ledger | new org-scoped table `research_evidence` (append-only, immutable history, conflict retention, human-verified protection, source suppression) — Phase 1 |
| C | Persistent Facts | new org-scoped table `research_facts` (current-state layer keyed to evidence; human overrides protected; no contradictory duplicates) — Phase 1 |
| D | Persistent Follow-ups | new org-scoped table `research_followups` (reason, due time, subject, status); driven by the durable queue — Phase 3 |
| E | Durable Task Execution | existing five-state queue only (`agent_tasks`); new task types registered in the currently-empty `default_registry` with validators, idempotent handlers, explicit org, `NonRetryableTaskError` classification — Phase 3 |
| F | Skills / Modular Tools | `coffee_export/research/tools/` registry: typed input/output schemas, permissions, org scope, error handling, cost accounting, tests; no arbitrary code execution — Phases 2/4/5 |
| G | Provider Manifest | `coffee_export/research/providers.py`: runtime detection of AI providers (existing `AIGateway` env keys) and research/search providers (new adapters, none configured by default → honest `capability_unavailable`); never pretend a capability exists — Phase 2 |
| H | Budgets & Usage Controls | per-session budgets (tool calls, model calls, wall clock, estimated cost), usage counters, stop-on-exhaustion; never fabricate costs — Phase 2 |
| I | Research History & Search | `research_sessions` + tool-call log; duplicate-research detection before starting new sessions; org-scoped reuse — Phase 2 |
| J | Monitoring & Observability | extend the existing Streamlit dashboard and queue admin CLI; no second monitoring system — Phase 7 |

Rejected (never to be imported): TryComp `eve` architecture; single-tenant
assumptions; replacing CRM/frontend/SQLAlchemy/Alembic/supervisor; a second
competing task queue; PostgreSQL-specific locking; unrelated UI redesigns;
paid provider dependencies by default; unverifiable buyer claims.

## 4. Standing security decisions

1. **No silent org-system fallbacks in new code.** New tables follow the
   `LeadSource`/`LeadVerificationLog` pattern (models/lead.py:215/275):
   `organization_id` NOT NULL with **no default**, org index, and every call
   site passes org explicitly. `SYSTEM_ORG` is used only for genuine system-wide
   tasks, never as a fallback.
2. **Tenant isolation** is enforced at the repository/service layer of the new
   `research/` package (fail-closed cross-tenant access, `NotFoundError`
   semantics like `state/repositories.py`), tested per surface.
3. **Human corrections are protected**: `human_locked`/`human_override` rows can
   never be overwritten by AI paths; conflicts are retained, not silently
   resolved.
4. **Evidence honesty**: AI inference is never converted into a verified fact.
   Verification states: observed → corroborated (independent sources) →
   human_verified; conflicting/stale → disputed/outdated, retained.
5. **Outbound commercial communication** only through the existing dual gate:
   evidence gate (`checkOutreachGate`, src/lib/leads-evidence.ts:236) + human
   approval queue (`pending_agent_actions`) + fail-closed bridge. No autonomous
   sending.
6. **No secrets in code or logs.** Env var names only in docs. Bounded HTTP for
   any research egress (timeouts, size limits, robots-aware fetching). No
   arbitrary AI-generated SQL or code execution.
7. **Migration rules**: additive only, chained on the single head, historical
   revisions never edited, upgrade/downgrade tested on isolated DBs including
   the deployment path (copy of the operational DB). Prisma stays vestigial; no
   new tables modeled in Prisma.

## 5. Verified baseline (Phase 0, 2026-11-17)

### 5.1 Git state

| Item | Value |
| --- | --- |
| Integration base | `491ecf614271743a62f3f8bfcba927341045fdb9` on `phase-1a-five-state-contract` (REBUILT five-state correction; parent `54b76e5d…` verified exact; working tree clean; pushed to origin 2026-11-18) |
| Integration branch | `trycomp-selective-integration` created from `491ecf61` (rebuild — see §0) |
| Remote refs (verified via `git ls-remote`, 2026-11-18) | `main` = `97a2988`; `phase-1a-durable-task-queue` = `54b76e5`; `phase-1a-five-state-contract` = `491ecf6` (pushed 2026-11-18); `work/round11f-safe-remediation-2026-10-28` = `recovery/round11-workspace-checkpoint-2026-10-28` = `4310ac4` (stale checkpoint, see §5.4); `fix/security-remediations-…` = `1208228` (stale, see §5.4) |
| Lost original chain | `7bea4f52` (original five-state) → `bffb554` (Phase 0) → Phase 1 commit — unrecoverable, superseded by the rebuild (§0) |

### 5.2 Database & migration state

- Alembic: **single head `d9e0f1a2b3c4`**, strictly linear 18-revision chain from
  `47eb259e4dd2`; no revision has multiple children; pushed migrations never
  edited (immutable-history rule verified in the five-state work).
- Migration-ownership nuance: `b7e1f3c9a2d4` (lead evidence) is canonically
  applied by the Node script `scripts/migrations/2026-09-26-lead-evidence.mjs`
  followed by `alembic stamp`. New Python-side tables get normal Alembic
  revisions chained on the head; nothing new is modeled in Prisma
  (prisma/schema.prisma is vestigial demo models only).
- Operational DB (`state/coffee_export.db`, deployment target): alembic
  version `b9d0e1f2a4b5`, 65 tables, no `agent_tasks` table yet (the two queue
  revisions are undeployed, additive-only). sha256
  `ce14d7b0edce930de510e450d2642fa04b06c8860a473eec7a3d230145669ed7` verified
  **byte-identical before and after every baseline run** — no production
  migration was run.

### 5.3 Baseline test results (all on isolated/throwaway DBs)

| Check | Command | Result |
| --- | --- | --- |
| Python full suite | `COFFEE_DATABASE_URL=sqlite:////tmp/baseline/operational-copy.db .venv/bin/python -m pytest tests/ -q` (fresh copy of operational DB) | **120 passed, 1 warning** (pre-existing starlette/httpx deprecation in fastapi testclient) |
| Agent smoke suites 2–7 + StateManager + Logistics | `.venv/bin/python -m tests.<module>`, each on its own fresh DB copy | **8/8 PASS** |
| Supervisor single tick | `COFFEE_DATABASE_URL=… SUPERVISOR_PYTHON_BIN=…/.venv/bin/python node scripts/supervisor.js --once` | **PASS** — tick completes; the Agent-3 bridge transport error is the expected offline-sandbox behavior (no bridge running); lead NOT advanced, action marked `execution_failed` (honest failure semantics intact) |
| JS unit tests | `npx vitest run tests/lib` | **136 passed** (8 files) |
| TypeScript | `npx tsc --noEmit` | **0 errors** |

### 5.4 Round 11F / migration-ownership establishment

- The `work/round11f-safe-remediation-2026-10-28` branch is a **pre-remediation
  checkpoint** (`4310ac4`, 2026-10-28) on top of `97a2988`. Its entire diff vs
  the current chain is: removal of untracked junk (`upload/` binaries, pasted
  content, enriched CSVs), file-mode normalization, and the deletion of
  `src/app/api/inventory/upload/route.ts` (54 lines). **No functional additions.**
  No remediation commits follow it on the remote.
- The Round 11F migration-ownership **rules** are established and hold at HEAD:
  single head, linear chain, additive revisions, historical migrations never
  edited (the five-state work re-verified this: pushed `c8d9e0f1a2b3` untouched).
- The stale August branch `fix/security-remediations-…` (`1208228`, 2026-08-10,
  diverged at `1ca8e75`) added org scoping to 10 API routes and **edited a
  historical migration** (8df0417b9935). Its content is superseded: all 10
  routes in the current chain carry `const orgId = auth.user.organizationId`
  scoping (verified by grep at HEAD) and evolved further; the chain landed the
  multi-tenancy infrastructure below the divergence point and the hardening-F
  org-scoping audit above it. It is recorded here and **will not be merged**
  (merging is not authorized and its migration edit violates ownership rules).
- Open item from the checkpoint (recorded, **not** silently fixed): the
  checkpoint deletes `src/app/api/inventory/upload/route.ts`. That route exists
  at HEAD, stamps `organization_id` on `lots` (coops/washing_stations are
  intentionally global tables per the tenant-isolation report). No committed
  rationale for the deletion exists anywhere. Flagged for owner decision; not
  part of this integration.

### 5.5 Pre-existing conditions recorded (not silently fixed)

1. starlette/httpx deprecation warning in fastapi testclient (cosmetic).
2. Two APScheduler jobs mutate leads without org filters
   (`tasks/jobs.py:201–259`, `nurture_reactivation`/`ghost_to_nurture`) —
   pre-existing; out of scope for this integration.
3. `conversation_memory` has no org column (tenant scope only transitive via
   lead); Node-only `buyer_memory` likewise. New facts/evidence tables are
   org-scoped by design; retrofitting these is a separate hardening pass.
4. `ai_call_logs.organization_id` exists at DB level (migration
   `a1b2c3d4e5f7`) but is unmapped in the ORM (models/ai.py:16). To be mapped
   when research budget accounting lands (Phase 2) — schema-neutral ORM change.
   **[CLOSED by Phase 2 — mapped at `e65c287`; see §14.]**
5. Old workspace `/home/z/my-project/workspace/Faith-El-` (104 modified /
   13 deleted files at `54b76e5`) — left untouched by protocol; it contains no
   commits newer than this chain.
6. Queue registry ships empty and there are **zero production enqueue
   callers** today (verified: only tests and the admin CLI construct the
   queue) — Phase 3 registers the first real task types.
7. **JS test-isolation leak (observed and restored in Phase 0):** running
   `npx vitest run tests/lib` without `COFFEE_DATABASE_URL` set lets
   `tests/lib/db.test.ts` write into the default Node DB target
   (`state/coffee_export.db`, repo root). This is the same incident class the
   worklog documents historically. The artifact was restored wholesale from
   HEAD (sha256 verified identical to the committed blob). **Rule: every JS
   test run must point `COFFEE_DATABASE_URL` at a throwaway DB.**

## 6. Architecture map (verified, with file:line anchors)

Full map produced in Phase 0; the durable facts relied on by later phases:

- **Agents**: 7 self-registering agents (`agents/registry.py:15`, per-agent
  `register_agent` at module bottom) + `BaseAgent(organization_id)` ctor
  (`agents/base.py:102`); `AgentRunner` publishes AGENT_* events. Supervisor
  (`scripts/supervisor.js`) routes 15 event types; only Agents 5/6/7 run in the
  Python runtime via `coffee_export/scripts/run_agent{5,6,7}.py` with
  `--organization` and per-event org grouping (supervisor.js:380–530).
- **State layer**: `StateManager(organization_id="org-system")`
  (state_manager.py:164) owns 7 tenant-enforced repositories
  (state/repositories.py, BaseRepository raises on empty org at :23–27);
  `_scoped_get`/`_require_same_org` (state_manager.py:210–243) make cross-tenant
  PK reads indistinguishable from missing. AdminStateManager is the only
  sanctioned cross-tenant reader.
- **Buyer data model**: `leads` (org-scoped UNIQUE(company,country,org);
  verification_status at models/lead.py:65), `lead_contacts` (contact-level
  verification :147), `lead_sources` = existing evidence rows (org NOT NULL no
  default :230), `lead_verification_log` (append-only audit), `buyer_masks`
  (AES-GCM alias registry), `message_threads`/`inbox_messages` (alias-only).
- **Queue**: five-state `agent_tasks` with lease fencing
  (`tasks/durable_queue.py`), `NonRetryableTaskError`
  (`tasks/registry.py`), worker gates 2a/2b/2c → non-retryable `failed`
  (`tasks/worker.py`). Registry empty; `SYSTEM_ORG` explicit-only
  (`durable_queue.py:100`). `events.job_id` + `EventBus.publish(job_id=…)`
  already exist for task↔event correlation (models/events.py:35).
- **AI**: everything funnels through `AIGateway` (ai/gateway.py:109) with env-key
  provider init (GLM preferred: `GLM_API_KEY`, glm rate limit 30/min, in-memory
  cache, `ai_call_logs` accounting, no spend cap). **No web-search egress
  exists anywhere in the Python backend** — research egress is net-new and will
  be added as provider-shaped adapters behind a manifest (§3 G/H).
- **Outreach gate**: evidence gate + human approval queue + fail-closed bridge
  (supervisor.js `generatePendingActions`/`executeApprovedEmail`;
  messaging/gateway.py `EmailGateway.send` org fail-closed at :137–148).
- **Pipeline vocabulary**: 13 states (state/constants.py:14) with
  STATE_TRANSITIONS map; the Buyer Radar maps onto these (§7), no new pipeline
  model, no duplicate CRM entities.

## 7. Buyer Opportunity Radar — stage → existing terminology mapping

| Radar stage (directive) | Existing Faith-El surface |
| --- | --- |
| Discovered | `NEW` lead (org-scoped, evidence-required intake; fiction guard) |
| Researching | `ENRICHED` + research evidence/facts (Phase 1/2/4) |
| Qualified | `QUALIFIED` (existing Q1–Q5 gate) |
| Decision-maker identified | `lead_contacts` + verification_status + evidence (no new state) |
| Outreach prepared / approved / contacted | draft → `pending_agent_actions` approval → `IN_SEQUENCE` (existing dual gate) |
| Replied / interested | `IN_SEQUENCE` + touch logging + qualification answers |
| Sample requested / sent | `SAMPLE_DISPATCHED` / `SAMPLE_FEEDBACK_DUE` (Agent 4, sample budget) |
| Quotation issued | `quotes` data (Agent 5 flow) |
| Negotiation / contract | `DECIDED_*` → `CONTRACTED` (Agent 5 human-only signing) |
| Won / lost | `CONTRACTED` / `DECIDED_REJECTED` + `NURTURE` (Agent 7 accounts) |

Agent allocation (§6 of directive): shared research services + evidence
storage; Agent 2 = company research/decision-maker discovery; Agent 3 = outreach
preparation behind approvals; Agent 7 = buyer history & opportunity tracking;
supervisor unchanged (research jobs run through the durable queue, not the
event loop).

## 8. Phase plan & checklist

Status: `[ ]` pending, `[x]` complete (with commit SHA).

- [x] **Phase 0 — Baseline & architecture reconciliation** (original commit `bffb554` LOST — restored 2026-11-18 on the rebuilt base, see §0):
      verified Git/migration/DB state; Round 11F + stale branches established
      (§5.4); baseline tests recorded (§5.3 — re-verified on the rebuilt base
      2026-11-18: 120 passed, 1 pre-existing warning); capability/agent/
      pipeline mapping (§3/§6/§7); this document.
- [x] **Phase 1 — Evidence & facts foundation** (original LOST; first
      rebuild `1babbc4` LOST AGAIN — §0.1; SECOND REBUILD 2026-11-18 on
      this branch, same §13 semantics): `research_evidence` + `research_facts`
      models, additive migration f2a3b4c5d6e7 (parent d9e0f1a2b3c4), the
      `coffee_export/research` service layer (conflict retention,
      corroboration via independent sources, human-verified locking, source
      suppression), 30 Phase 1 tests + full-suite regression 145 passed.
      Record: §13 + §13.5 + §13.6.
- [x] **Phase 2 — Research engine** (commit `e65c287`, 2026-11-25; the
      workspace was lost after the commit and restored from the bundle the
      same day — §0.2; re-verified 72 + 213 passed): `research_sessions`
      (plan/status, budgets, usage counters, sanctioned transitions,
      duplicate-research reuse), `research_tool_calls` log, tool registry +
      first tools (bounded robots-aware fetch, identity resolution, evidence
      recording, duplicate detection, capability-gated web_search), provider
      manifest with honest runtime capability detection, budget enforcement
      with stop-on-exhaustion, ORM mapping of `ai_call_logs.organization_id`
      (closes §5.5 #4). Record: §14.
- [x] **Phase 3 — Durable research execution** (2026-11-25, on top of
      `596692c`): `research.run_session` + `research.revalidate_evidence`
      registered in `default_registry` (the first real business types —
      §5.5 #6 closed) with tight validators, idempotent org-scoped
      handlers and honest failure classification; `research_followups`
      table (migration `b4c5d6e7f8a9`) + service + queue-side dispatcher
      (reconcile + dispatch-due) wired into the worker loop and the
      admin CLI; worker monitoring hooks (WorkerHooks) + admin `research`
      / `followups` subcommands; the §11.5 revalidation sweep landed as
      durable work. Record: §15.
- [ ] **Phase 4 — Buyer discovery & enrichment**: company discovery tooling on
      configured providers (honest `capability_unavailable` otherwise), identity
      resolution/dedupe, coffee-sector classification, decision-maker discovery
      with honest verification status, contact verification rules (no invented
      emails).
- [ ] **Phase 5 — Buyer qualification & matching**: explainable qualification
      scoring (evidence-linked), requirement extraction, exporter/inventory
      matching with compatibility explanations + missing-information detection.
- [ ] **Phase 6 — Outreach & relationship integration**: evidence-based drafts
      through Agent 3 + existing approval queue, duplicate-send prevention,
      reply tracking, follow-ups, CRM pipeline integration.
- [ ] **Phase 7 — Monitoring & UX**: dashboard views for research status,
      evidence quality, budgets, follow-ups, queue health (existing design
      system; no unrelated redesign).
- [ ] **Phase 8 — End-to-end validation & stabilization**: full regression,
      business-workflow scenario on synthetic data, final technical/business/
      security reports + deployment runbook; clean tree.

## 9. Changed files (cumulative)

Phase 0 (original commit bffb554, LOST — restored on the rebuilt base
2026-11-18): `coffee_export/docs/trycomp-integration-progress.md`
(new). No application code changed in Phase 0.

Phase 1 (original commit LOST; first rebuild `1babbc4` LOST AGAIN;
SECOND REBUILD 2026-11-18 on this branch — same file set, same migration
id, per the §13 spec):
- NEW `coffee_export/coffee_export/database/models/research.py`
- NEW `coffee_export/alembic/versions/f2a3b4c5d6e7_research_evidence_facts.py`
- NEW `coffee_export/coffee_export/research/` (`__init__.py`, `common.py`,
  `evidence.py`, `facts.py`)
- NEW `coffee_export/tests/test_evidence_foundation.py`,
  `coffee_export/tests/test_research_foundation_migration.py`
- MOD `coffee_export/coffee_export/database/models/__init__.py` (register the
  two models; import block sorted — the file carried pre-existing I001
  lint debt at `491ecf6`)
- MOD `coffee_export/tests/test_agent_task_migration.py` (new head
  f2a3b4c5d6e7; deployment path expects three new tables; also
  reformatted — the file carried pre-existing black drift at `491ecf6`)
- MOD this file (§0, §0.1, §8, §9, §11, §13.6)

Phase 2 (commit `e65c287`, 2026-11-25 — workspace lost after the commit,
restored from the bundle, §0.2):
- NEW `coffee_export/alembic/versions/a3b4c5d6e7f8_research_engine_sessions_tool_calls.py`
- MOD `coffee_export/coffee_export/database/models/__init__.py` (register
  ResearchSession + ResearchToolCall)
- MOD `coffee_export/coffee_export/database/models/ai.py` (map the existing
  `ai_call_logs.organization_id` column — schema-neutral, §5.5 #4)
- MOD `coffee_export/coffee_export/database/models/research.py` (+ the two
  Phase 2 models, same conventions as the Phase 1 tables)
- MOD `coffee_export/coffee_export/research/__init__.py` (exports)
- MOD `coffee_export/coffee_export/research/common.py` (session/tool-call
  vocabulary, transitions, IDs, normalize_objective)
- NEW `coffee_export/coffee_export/research/budget.py`, `engine.py`,
  `planning.py`, `providers.py`, `sessions.py`
- NEW `coffee_export/coffee_export/research/tools/` (`__init__.py`,
  `base.py`, `dedupe.py`, `evidence_record.py`, `fetch.py`, `identity.py`,
  `registry.py`, `web_search.py`)
- MOD `coffee_export/tests/test_agent_task_migration.py` (new head
  a3b4c5d6e7f8; deployment path expects two more tables)
- NEW `coffee_export/tests/test_provider_manifest.py`,
  `coffee_export/tests/test_research_engine_migration.py`
- MOD `coffee_export/tests/test_research_foundation_migration.py`
  (new head a3b4c5d6e7f8; table-count assertions extended)
- NEW `coffee_export/tests/test_research_sessions.py`,
  `coffee_export/tests/test_research_tools.py`
- MOD this file (§0.2, §5.5 #4, §8, §9, §11, §12, §14 — in the docs commit
  that follows the restore; see §0.2 #3)

Phase 3 (2026-11-25, on top of `596692c`):
- NEW `coffee_export/alembic/versions/b4c5d6e7f8a9_research_followups.py`
- NEW `coffee_export/coffee_export/research/followups.py`
- NEW `coffee_export/coffee_export/tasks/research_tasks.py`
- MOD `coffee_export/coffee_export/database/models/research.py`
  (+ResearchFollowup), `database/models/__init__.py` (register)
- MOD `coffee_export/coffee_export/research/common.py` (followup
  vocabulary: RESEARCH_TASK_TYPES, FOLLOWUP_STATUSES,
  FOLLOWUP_TRANSITIONS, new_followup_id)
- MOD `coffee_export/coffee_export/research/evidence.py`
  (+sweep_expired — the revalidation sweep)
- MOD `coffee_export/coffee_export/research/__init__.py` (exports)
- MOD `coffee_export/coffee_export/tasks/worker.py` (WorkerHooks,
  followup pass, hooks wired into _execute, research registration in
  main())
- MOD `coffee_export/coffee_export/tasks/admin.py` (research +
  followups subcommands; pre-existing I001 import debt cleaned)
- MOD `coffee_export/coffee_export/config.py`
  (TASK_WORKER_FOLLOWUP_INTERVAL_SECONDS, default 60)
- NEW `coffee_export/tests/test_research_tasks.py` (22),
  `coffee_export/tests/test_research_followups.py` (11),
  `coffee_export/tests/test_research_followups_migration.py` (4)
- MOD `coffee_export/tests/test_agent_task_migration.py`,
  `coffee_export/tests/test_research_foundation_migration.py`,
  `coffee_export/tests/test_research_engine_migration.py`
  (NEW_HEAD b4c5d6e7f8a9; five revisions; six tables; 21-revision chain)
- MOD this file (§8, §9, §11, §12, §15)

## 10. Provider requirements

- AI chat: existing `AIGateway` env keys (`GLM_API_KEY` preferred; also
  `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`,
  `OLLAMA_BASE_URL`). None are configured in a fresh clone; the mock provider
  keeps tests deterministic. A missing provider is reported as unavailable —
  never faked.
- Research/search providers: new optional adapters (Phase 2). **No paid API is
  introduced by default.** With none configured, research tools return honest
  `capability_unavailable` results; provider-independent work is tested with
  mocks. A GLM/Z.ai key does **not** imply search API access — the manifest
  detects actual capability.
- Email bridge: existing (`RESEND_API_KEY` optional dry-run,
  `EMAIL_BRIDGE_SECRET`, `BUYER_MASK_SECRET`) — unchanged.

## 11. Known limitations (current)

1. No TryComp source exists to compare against (§2); integration is
   capability-level by design.
2. Live buyer discovery requires a configured search provider; until then the
   capability is implemented but marked awaiting configuration (mock-tested).
3. SQLite single-writer; single-worker queue; at-least-once execution
   (handlers must be idempotent) — unchanged platform constraints.
4. Pre-existing conditions in §5.5 remain open by policy (item 4 closed by
   Phase 2; item 6 closed by Phase 3).
5. [UPDATED Phase 3] The revalidation sweep EXISTS as durable work
   (`research.revalidate_evidence`, org-wide or subject-filtered), but
   nothing yet schedules revalidation followups automatically when
   evidence with `expires_ts` is recorded — that wiring is Phase 4+
   business logic. Staleness is otherwise still explicit.
6. Fact recompute loads all rows for one fact_key per call — fine at expected
   volumes; no pagination.
7. On dispute the retained display form is the FIRST observation's; when
   corroboration is lost, surviving rows are honestly downgraded to observed
   (documented behavior, test-verified).
8. human_locked facts freeze `source_count` (recompute skipped entirely) —
   by design; the evidence rows are still visible via list_evidence.
9. [UPDATED Phase 3] The research services are now called by the durable
   `research.*` handlers (the engine facade is the one execution path); no
   AGENT calls them yet — Phase 4+ wires buyer-discovery agents.
10. Suppressing or outdating the human attestation behind a locked fact does
    NOT unlock it — human decisions can only be superseded by a NEWER human
    attestation (by design; AI paths must never be able to dissolve a human
    correction by hiding its evidence row).
11. [CLOSED by Phase 3 — the durable `research.*` handlers are registered and
    drive stored plans through the budget-enforced engine.]
12. Planning is the deterministic template only (planning.py); LLM-assisted
    planning through AIGateway is the Phase 4 upgrade on the same stored-JSON
    plan contract (§3 A).
13. `web_search` is the honest capability-gated slot: with no search
    adapter (Phase 4) it always reports capability_unavailable — never a
    cached or fabricated result.
14. The wall-clock budget is measured from `started_ts` with second-
    granularity ISO timestamps; sub-second jitter is invisible (documented,
    test-verified with the injectable clock).
15. Plan steps without explicit tool `input` objects are honestly skipped by
    `research.run_session` (the Phase 2 template carries no inputs) — real
    tool inputs arrive with Phase 4 LLM-assisted planning; steps with inputs
    execute end-to-end today.
16. The followup dispatcher is the one sanctioned cross-org reader of
    research_followups (queue-bridge trust level, dispatch data only); every
    other research read stays org-scoped.

## 12. Exact next action

Implement **Phase 4 (Buyer discovery & enrichment)** on top of the
Phase 3 head (b4c5d6e7f8a9; completed code and semantics: §14 + §15):

1. LLM-assisted planning through the existing AIGateway on the SAME
   stored-JSON plan contract (§3 A / §11.12): when a chat provider is
   configured, generate plan steps WITH tool inputs; deterministic
   template stays the fallback. Model calls go through
   engine.record_model_call (budget accounting) — never a side channel.
2. Buyer discovery tooling on configured providers (honest
   capability_unavailable otherwise — never faked): the web_search
   adapter behind the existing capability-gated slot; company
   discovery → identity resolution (tools/identity.py) → dedupe
   (tools/dedupe.py) → coffee-sector classification → decision-maker
   discovery with honest verification status.
3. Contact verification rules: no invented emails — every contact
   claim must cite evidence (Phase 1 ledger) before it can be used by
   outreach (§4.5 dual gate unchanged).
4. Wire the revalidation-followup scheduling (§11.5): when evidence
   with expires_ts is recorded, schedule the
   `research.revalidate_evidence` followup at the expiry time.
5. Agent integration: Agent 2 (company research / decision-maker
   discovery) becomes the first agent to create research sessions and
   enqueue `research.run_session` tasks — through the queue, never
   the event loop (§7).

---

## 13. Phase 1 record — evidence ledger + persistent facts (ORIGINAL implementation, 2026-11-17; LOST — this section is the rebuild specification)

### 13.1 What was built

| Layer | Files |
| --- | --- |
| Models | `database/models/research.py` (ResearchEvidence, ResearchFact; org NOT NULL **no default**, org-scoped UNIQUE `uq_research_facts_key`; registered in `models/__init__.py`) |
| Migration | `alembic/versions/f2a3b4c5d6e7_research_evidence_facts.py` (additive; parent d9e0f1a2b3c4; clean downgrade to the five-state head) |
| Service | `coffee_export/research/` — `common.py` (enums, canonical JSON, source identity, validation), `evidence.py` (EvidenceLedger), `facts.py` (FactStore + recompute), `__init__.py` |
| Tests | `tests/test_evidence_foundation.py` (21), `tests/test_research_foundation_migration.py` (4), `tests/test_agent_task_migration.py` updated to the new head (5) |

Semantics implemented (all test-verified):

- explicit org everywhere; cross-tenant access raises ResearchNotFoundError
  (indistinguishable from missing — no existence oracle);
- corroboration requires ≥2 INDEPENDENT sources (the same source twice is
  not corroboration; `llm_inference` can never corroborate anything);
- conflicts RETAINED: first observation wins, both rows disputed, fact
  flagged conflicting — nothing silently overwritten or deleted;
- human verify/correct → `human_locked`; AI recompute can never touch a
  locked fact (contradicting AI observations are kept as disputed);
- outdated evidence is INERT in recompute (fresh evidence revalidates);
- source suppression is org-scoped, reversible, preserves rows; losing
  corroboration honestly downgrades surviving rows to observed.

### 13.2 Test incidents, root causes, fixes

Three failures were found and fixed before Phase 1 passed — none papered
over:

1. **Migration FK crash (6 failures).** The first migration draft passed
   `sa.ForeignKeyConstraint(...)` inside a `sa.Column(...)`, so every alembic
   subprocess aborted (`upgrade head` non-zero). Fix: `sa.ForeignKey` in the
   column. Verified by the then-failing subprocess tests.
2. **Suppression/corroboration inconsistency (1 failure).** After
   suppressing one of two corroborating sources, the fact honestly dropped to
   observed but the surviving row still said `corroborated`, and the test
   asserted the wrong list element. Fix: `_recompute` now downgrades
   orphaned `corroborated` rows to `observed` (rows stay consistent with the
   fact), and the test keys rows by `source_url`.
3. **Unique-constraint index name (1 failure — the directed debugging
   round).** `test_fresh_install_shape_and_constraints` asserted
   `any("uq_research_facts_key" in i for i in <PRAGMA index_list names>)`.

   Directed inspection (isolated DB /tmp/inspect.db, read-only):
   `PRAGMA index_list(research_facts)` → `ix_research_facts_org_status`
   (origin 'c') and `sqlite_autoindex_research_facts_1` (origin 'u',
   unique=1); `PRAGMA index_info` on the autoindex → exactly
   [organization_id, subject_type, subject_id, fact_key] in order; the
   sqlite_master index row for the autoindex has `sql=None` (implicit); the
   CREATE TABLE SQL carries
   `CONSTRAINT uq_research_facts_key UNIQUE (...)`. Cross-check on `leads`:
   `uq_leads_company_country` is implemented as `sqlite_autoindex_leads_2`
   (origin 'u') — the codebase-wide pattern.

   Root cause: SQLite implements a NAMED table-level UNIQUE constraint via
   an AUTOMATIC index (`sqlite_autoindex_<table>_<n>`); the constraint name
   never appears as an index name. The schema was CORRECT (model, migration
   and DB all agree); the TEST assertion was wrong. Per the rule "do not
   rename an index merely to satisfy a test", nothing was renamed: the test
   now asserts the actual contract — exactly one origin-'u' unique index
   covering the four constraint columns in order, plus the named constraint
   in the CREATE TABLE SQL — with a comment explaining the autoindex naming
   so it is not "fixed" backwards later.

### 13.3 Verification results (actual commands, actual results)

| Check | Command | Result |
| --- | --- | --- |
| Failing test alone | `pytest tests/test_research_foundation_migration.py::test_fresh_install_shape_and_constraints -q` | 1 passed |
| Phase 1 battery | `pytest tests/test_evidence_foundation.py tests/test_research_foundation_migration.py tests/test_agent_task_migration.py -q` | 30 passed |
| Full Python suite | fresh copy of operational DB → `COFFEE_DATABASE_URL=sqlite:////tmp/ph1-full.db pytest tests/ -q` | 145 passed, 1 warning (pre-existing starlette/httpx) |
| Manual up/down demo | fresh /tmp/updown.db: head → d9e0f1a2b3c4 → b9d0e1f2a4b5 → head | 68 → 66 (only the research tables dropped, agent_tasks kept) → 65 → 68 tables at every step |
| Operational DB | sha256 before/after every run | `ce14d7b0…` unchanged; no `M` entry in git status |
| Migration graph | `alembic heads` | exactly one head: f2a3b4c5d6e7 |
| Working tree | `git status --porcelain` | only the intended Phase 1 files; no package.json/JS noise; no secrets |

### 13.4 Diff review (security & semantics)

- Tenant isolation: every query in `research/` filters `organization_id`;
  constructors raise on empty org; cross-tenant reads/writes raise
  ResearchNotFoundError. Grep: zero `org-system` fallbacks (the only matches
  are doc strings stating there is none); zero raw SQL (`execute("SELECT`,
  `.format(`, `text(`, `exec_driver_sql` — none); all queries go through the
  SQLAlchemy expression API with bound parameters.
- Source attribution: every evidence row carries source_type (+ http(s) URL
  for website/search/api; human requires the actor's name);
  `llm_inference` excluded from INDEPENDENT_SOURCE_TYPES.
- Evidence lifecycle: rows never deleted; only sanctioned status transitions;
  suppression flagged + reversible + org-scoped.
- Stale evidence: outdated rows inert in recompute (tested by
  test_fresh_evidence_revalidates_outdated_fact).
- Human overrides: human_locked immunity tested three ways (contradicting AI
  row, agreeing AI row, human_correct audit trail).
- Fact recomputation: deterministic from the unsuppressed, non-outdated set;
  first-observation display form retained on dispute.

### 13.5 Rebuild record (2026-11-18, this branch)

The original Phase 1 was lost with the recycled workspace (§0) and was
rebuilt from this §13 record on `trycomp-selective-integration`
(base `491ecf61`, Phase 0 restoration commit `7e370f8`). Same file set,
same migration id `f2a3b4c5d6e7`, same test counts.

Rebuild-specific design decisions (recorded because the original code
is unrecoverable — semantics follow §13.1 exactly, naming may differ):

- services take an injectable `engine` (tests + future task handlers);
  omitted → the application engine (database.base.SessionLocal)
- `recompute_fact` is a module function in facts.py shared by
  EvidenceLedger and FactStore (single code path, one transaction per
  operation)
- human rows recorded directly via `record(source_type="human", …)`
  lock the fact immediately, same as `FactStore.verify_fact`
- a NEWER human attestation supersedes an older one (most recent human
  decision wins); the superseded attestation is retained as disputed
- `recompute_fact(..., human_action=True)` is used ONLY by
  verify_fact — every AI-driven trigger uses the default and can never
  touch a locked fact
- DB-enforced honesty CHECKs added beyond the service layer: website/
  search/api rows require a source_url, human rows require an actor

Test incidents found and fixed during the rebuild (none papered over):

1. **Stale recompute after in-place mutations (5 failures).** With
   `autoflush=False` sessions, `suppress`/`unsuppress`/`mark_outdated`
   mutated a row in memory but `recompute_fact`'s SELECT still read the
   old DB state, so the fact never changed. Fix: explicit
   `session.flush()` before recompute in all three mutation paths
   (record() already flushed). Caught by the suppression/outdated
   tests.
2. **`alembic history` line format (1 failure).** The line renders as
   `parent -> rev (head), title`; the test asserted `startswith(rev)`.
   Fix: assert the head marker + revision presence, not position.
3. Two SIM102 lint findings in `validate_source` — combined into
   single conditions (behavior identical).

Verification results (actual commands, actual results — matching the
original §13.3 exactly):

| Check | Command | Result |
| --- | --- | --- |
| Phase 1 battery | `pytest tests/test_evidence_foundation.py tests/test_research_foundation_migration.py tests/test_agent_task_migration.py -q` | **30 passed** |
| Full Python suite | fresh copy of operational DB → `COFFEE_DATABASE_URL=sqlite:////tmp/trycomp/ph1-final.db pytest tests/ -q` | **145 passed, 1 warning** (pre-existing starlette/httpx) |
| Manual up/down demo | fresh /tmp/updown.db: head → d9e0f1a2b3c4 → b9d0e1f2a4b5 → head | 68 → 66 (only the research tables dropped, agent_tasks kept) → 65 → 68 tables at every step |
| Operational DB | sha256 before/after every run | `ce14d7b0…` unchanged; no `M` entry in git status |
| Migration graph | `alembic heads` / `alembic history` | exactly one head f2a3b4c5d6e7; linear 19-revision chain from 47eb259e4dd2 |
| Lint/format | `ruff check` + `black --check` on research/ + models + tests | clean (alembic/versions matches its sibling-migration conventions) |
| Working tree | `git status --porcelain` | only the intended Phase 1 files; no package.json/JS noise; no secrets |

Security & semantics re-verified post-rebuild: every query in
`research/` filters organization_id; zero org-system fallbacks (doc
strings only); zero raw SQL; llm_inference excluded from independent
sources; rows never deleted; sanctioned transitions only; suppression
reversible + org-scoped; outdated inert; human locks immune to AI
recompute (contradicting AND agreeing rows tested).


### 13.6 Second rebuild record (2026-11-18, this branch)

The first rebuild (§13.5) was itself lost when its session-scoped
workspace was recycled (§0.1) and was rebuilt a second time from the §13
record on `trycomp-selective-integration` (base `491ecf61` → Phase 0
restoration `0fa2940` → Phase 1 **`fdee0ef`**, this commit's parent
chain). Same file set, same migration id
`f2a3b4c5d6e7`, same test counts (21 + 4 + 5). All §13.5 rebuild design
decisions were carried over verbatim (injectable engine, shared module
`recompute_fact`, immediate locking on human rows, newest-human-wins,
`human_action=True` only from the human path, DB-enforced honesty
CHECKs, flush-before-recompute).

Second-rebuild design decisions (recorded because the first rebuild's
code is unrecoverable — semantics follow §13.1 exactly, naming may
differ):

- `source_identity` = the cited source URL. The URL IS the source
  document: the same URL observed twice never corroborates, even via
  different source_types (a website fetch and a search result that cite
  the same page are ONE source).
- conflict generalization: when live evidence holds ≥2 distinct values,
  ALL live rows become disputed (the fact is contested as a whole), the
  display form is the FIRST observation's, and the fact's status drops
  to observed until the conflict is resolved by suppression, outdating,
  or a human decision. A majority cannot outvote silently.
- `source_count` = live rows supporting the current display value;
  frozen while a fact is human_verified (AI recompute is skipped
  entirely — not even updated_ts moves).
- `status='human_verified'` IS the lock (no separate flag column); the
  model exposes it as one concept and the tests pin the freeze three
  ways (contradicting row, agreeing row, superseding attestation).
- suppressing/outdating a human attestation does NOT unlock its fact
  (§11.10) — only a newer human attestation can change a locked fact.

Pre-existing lint debt found at `491ecf6` and cleaned in the two files
Phase 1 already touches (nothing else was reformatted):
`database/models/__init__.py` had an unsorted import block (I001) and
`tests/test_agent_task_migration.py` had black drift.

Verification results (actual commands, actual results — matching §13.3
and §13.5 exactly):

| Check | Command | Result |
| --- | --- | --- |
| Phase 1 battery | `pytest tests/test_evidence_foundation.py tests/test_research_foundation_migration.py tests/test_agent_task_migration.py -q` | **30 passed** (21 + 4 + 5) |
| Full Python suite | fresh copy of operational DB → `COFFEE_DATABASE_URL=sqlite:////tmp/phase1b/ph1-final.db pytest tests/ -q` | **145 passed, 1 warning** (pre-existing starlette/httpx) |
| Manual up/down demo | fresh /tmp/updown.db: head → d9e0f1a2b3c4 → b9d0e1f2a4b5 → head | 68 → 66 (only the research tables dropped, agent_tasks kept) → 65 → 68 tables at every step |
| Operational DB | sha256 before/after every run | `ce14d7b0…` unchanged; no `M` entry in git status |
| Migration graph | `alembic heads` / `alembic history` | exactly one head f2a3b4c5d6e7; linear 19-revision chain from 47eb259e4dd2 |
| Lint/format | `ruff check` + `black --check` on research/ + models + the three test files | clean (both tools; pre-existing debt in the two MOD files cleaned, see above) |
| Working tree | `git status --porcelain` | only the intended Phase 1 files; no package.json/JS noise; no secrets |

Security & semantics re-verified after the second rebuild: every query
in `research/` filters organization_id (6 query sites, all org-scoped);
constructors raise on empty org; zero org-system fallbacks; zero raw
SQL (expression API with bound parameters only); llm_inference excluded
from independent sources; rows never deleted; sanctioned transitions
only; suppression reversible + org-scoped; outdated inert; human locks
immune to AI recompute (contradicting AND agreeing rows tested); the
org-scoped UNIQUE key is enforced at the DB level and tested via the
SQLite autoindex contract (§13.2 #3 lesson).

---

## 14. Phase 2 record — research engine (commit `e65c287`, 2026-11-25)

This record was written AFTER the restore (§0.2): the implementation
session's workspace was lost, so the record is derived from the
commit's own tree (every claim re-verified by re-running the suites on
the restored clone) plus the commit message. The §13-style conventions
apply: this section is the rebuild specification should the tree be
lost again.

### 14.1 What was built

| Layer | Files | Semantics |
| --- | --- | --- |
| Data model | models/research.py (+ResearchSession, +ResearchToolCall), models/ai.py, models/__init__.py | session lifecycle fields (objective, objective_key, plan JSON, budgets JSON, usage counters, sanctioned status), append-only tool-call log (honest status set, reported cost only, measured duration); `ai_call_logs.organization_id` finally mapped in the ORM (schema-neutral — column existed since a1b2c3d4e5f7) |
| Migration | alembic a3b4c5d6e7f8 (parent f2a3b4c5d6e7) | two additive org-scoped tables; organization_id NOT NULL with NO default on both; status CHECKs; org_status + org_key indexes on sessions, org+session+created_ts index on tool calls; server_defaults only for status/usage/UNLIMITED_BUDGETS/duration (canonical canonical_json form); downgrade drops exactly the two tables |
| Budgets | research/budget.py | BudgetSpec (4 optional axes: max_tool_calls, max_model_calls, max_wall_seconds, max_cost_usd; None = unlimited), check_budget with post-action projections, BudgetExhaustedError(reason) — stop-on-exhaustion; cost only ever sums REPORTED costs (None never trips a cost budget and is never treated as zero) |
| Provider manifest | research/providers.py | runtime capability detection: ai_chat via the SAME env keys AIGateway reads (GLM preferred; never instantiates the gateway, never probes); web_search slot for the Phase 4 adapters (none configured by default); env var NAMES only, never values; mock excluded from production capability; manifest never mutates os.environ |
| Sessions | research/sessions.py | create with org-scoped duplicate-research reuse (LIVE = pending/running, same objective_key), on_duplicate='error' variant; sanctioned transitions per common.SESSION_TRANSITIONS; start/complete/fail/cancel; mark_budget_exhausted; resume_session (human path: NEW budgets, wall window restarts, usage preserved); org-scoped reads + history search (case-insensitive substring on objective_key — deterministic, no AI ranking) |
| Engine | research/engine.py | run_tool: session gate (auto-start pending; refuse finished; exhausted raises), budget PRE-check (refusal → budget_exhausted audit row, NOT usage, session stops), tool invocation OUTSIDE any DB transaction, audit row + usage in ONE commit; record_model_call (recorded first, exhaustion marked after — the NEXT action is refused); list_tool_calls; injectable clock + registry + manifest |
| Planning | research/planning.py | deterministic 5-phase template (resolve_identity → collect_evidence → record_evidence → dedupe_check → summarize) mapped onto registered tool names; the plan is DATA (canonical JSON on the row), never blindly executed |
| Tools | research/tools/ (base, registry, fetch, identity, dedupe, evidence_record, web_search) | typed schemas validated before AND after execution (unknown fields rejected); registry converts ToolCapabilityUnavailableError → honest capability_unavailable result; web_fetch = the ONLY new HTTP egress (http/https only, RFC 9309 robots with conservative unreachable-robots = disallow, 5s/10s timeouts, 512 KiB cap REFUSED not truncated, ≤3 redirects, content-type allowlist); resolve_identity + detect_duplicates deterministic and org-scoped (no AI, no network; strong signal = domain or name+country, name-only = weak, never alone a duplicate); record_evidence goes through the Phase 1 EvidenceLedger (never a direct row write); web_search capability-gated — reports capability_unavailable until the Phase 4 adapter exists, even with a chat key set |
| Tests | test_research_sessions.py (28), test_research_tools.py (26), test_provider_manifest.py (10), test_research_engine_migration.py (4), MOD test_research_foundation_migration.py, MOD test_agent_task_migration.py | 68 new tests; full suite 213 passed |

### 14.2 Design decisions (test-pinned)

- The engine is the ONE in-process path from session to tool invocation;
  Phase 3 task handlers call exactly this facade so in-process and
  durable semantics stay identical (stated in engine.py's docstring).
- A budget refusal is recorded as an audit row (status
  budget_exhausted) and NOT counted as usage — a refused call never
  consumed anything.
- Tool execution happens outside DB transactions (bounded HTTP can hold
  seconds; no write lock held); the audit row + usage update is one
  atomic commit afterwards.
- Unknown-cost honesty: usage_cost_usd stays NULL until a provider
  reports a cost; check_budget treats a cost limit with no reported
  costs as not-yet-evaluable (§14.1 budgets).
- Wall-clock is derived from started_ts per active run (reset on
  resume — each run gets a fresh window); an injectable epoch clock
  keeps tests deterministic.
- Tool inputs/outputs are validated against declared schemas on BOTH
  sides; an output contract violation becomes an honest error row
  rather than a contract-breaking result.
- Duplicate-research detection is deliberately shallow
  (normalize_objective: lowercase + whitespace collapse) — semantic
  similarity would be an AI judgement, not a deterministic key.
- No FK from research_tool_calls to research_sessions (same Phase 1
  decision): the org-scoped service layer is the integrity gate
  (ResearchNotFoundError for missing AND other-tenant alike — no
  existence oracle).

### 14.3 Verification (re-run on the restored tree, 2026-11-25)

| Check | Command | Result |
| --- | --- | --- |
| Research battery | `pytest tests/test_provider_manifest.py tests/test_research_engine_migration.py tests/test_research_foundation_migration.py tests/test_research_sessions.py tests/test_research_tools.py -q` | **72 passed** (10 + 4 + 4 + 28 + 26) |
| Full Python suite | fresh copy of operational DB → `COFFEE_DATABASE_URL=sqlite:////tmp/... pytest tests/ -q` | **213 passed, 1 warning** (pre-existing starlette/httpx) |
| Operational DB | sha256 before/after the runs | `ce14d7b0…` byte-identical; no `M` entry in git status |
| Migration graph | (from the Phase 2 commit message + test_research_engine_migration) | single head a3b4c5d6e7f8; additive; deployment-path test updated |

The original Phase 2 session's verification claims (from the commit
message): 68 new tests, full suite 213 passed, operational DB
byte-identical — all re-confirmed on the restored tree above.

### 14.4 Security review (re-derived from the restored tree)

- Org scoping: every query in research/ filters organization_id;
  cross-tenant reads raise ResearchNotFoundError identically to
  missing (no existence oracle); constructors take explicit org.
- Egress: web_fetch is the only new HTTP surface, bounds enforced
  (timeouts, byte cap, redirects, schemes, content types, robots).
  Unreachable robots.txt is treated as disallow-all (permission that
  cannot be verified is not granted). Refusals are auditable
  blocked_policy rows, never silent.
- Capability honesty: nothing fakes a provider, a cost, or a search
  result; capability_unavailable is a first-class outcome. A GLM chat
  key never implies search access.
- Secrets: the manifest records env var NAMES only (test-pinned with a
  sentinel value); no tool logs payload secrets; error strings are
  bounded.
- Immutability: research_tool_calls is append-only; rows are never
  deleted or mutated (the engine only INSERTs).
- jobs.py / task_queue.py / APScheduler boundary untouched at this
  commit (0 lines changed — Phase 2 stays engine-level).

---

## 15. Phase 3 record — durable research execution (2026-11-25)

### 15.1 What was built

| Layer | Files | Semantics |
| --- | --- | --- | ---
| Task types | tasks/research_tasks.py | `research.run_session` (session_id payload) + `research.revalidate_evidence` (optional subject pair) — the FIRST business registrations in default_registry (§5.5 #6); tight validators (unknown fields rejected, subject pair together, non-empty strings); handler factories with injectable engine/tool-registry/clock (production main() forwards the queue engine so research writes share the queue's BEGIN IMMEDIATE engine) |
| run_session semantics | (same file) | idempotent short-circuits for finished + budget_exhausted sessions (NEVER re-executed); missing/other-tenant session → NonRetryableTaskError (task failed, ONE attempt); corrupt plan → NonRetryableTaskError; BudgetExhaustedError mid-plan → task COMPLETES with the honest budget_stopped outcome (session stays budget_exhausted — human resume path only); steps with explicit inputs run through the Phase 2 engine facade; steps without inputs honestly skipped; step-progress idempotency under at-least-once: a step counts as executed iff a tool-call row exists for (tool, canonical input) — the append-only log IS the progress ledger; followup closure via payload followup_id |
| Revalidation sweep | research/evidence.py (+sweep_expired) | marks expired live evidence outdated via mark_outdated (each with honest fact recompute); org-scoped, optional subject filter, idempotent (second sweep = 0); human-verified facts stay locked (§11.10) |
| Followups model + migration | models/research.py (+ResearchFollowup), alembic b4c5d6e7f8a9 (parent a3b4c5d6e7f8) | org NOT NULL no default; status CHECK (scheduled|enqueued|done|failed|cancelled); followup_type CHECK (run_session|revalidate_evidence — enumerated, typos cannot produce un-dispatchable rows); due-index + org_status index; additive; downgrade drops exactly the one table |
| Followups service | research/followups.py | schedule (validated type/due/actor/subject-pair, canonical payload), org-scoped get/list (no existence oracle), sanctioned transitions per FOLLOWUP_TRANSITIONS (cancel is pre-dispatch only), mark_enqueued/mark_done/mark_failed |
| Dispatcher + reconcile | tasks/research_tasks.py | dispatch_due_followups: bounded batch (≤50/pass), cross-org DUE scan (the one sanctioned cross-org reader — queue-bridge trust level, dispatch data only), enqueues with the row's OWN org, injects followup_id into the task payload, unregistered-type rows marked failed honestly; reconcile_followups: enqueued rows converge to their task's terminal state, in-flight (pending/leased) left alone, taskless rows fail loudly |
| Worker integration | tasks/worker.py | followup pass every TASK_WORKER_FOLLOWUP_INTERVAL_SECONDS (default 60; disabled without followup_engine — Phase 1A behavior unchanged for opt-outs); _guarded (a pass failure never kills the worker); WorkerHooks (on_claimed/on_completed/on_failed, terminal-only for failures, hook exceptions swallowed+logged); main() registers the research types and passes the queue engine |
| Admin CLI | tasks/admin.py | `research [--org]` (org detail vs counts-only rollup — the queue-stats trust level), `followups dispatch` (manual idempotent trigger of the worker pass), `followups list --org` (org-scoped only); pre-existing I001 import debt cleaned |
| Config | config.py | TASK_WORKER_FOLLOWUP_INTERVAL_SECONDS (env-overridable, default 60) |
| Tests | test_research_tasks.py (22), test_research_followups.py (11), test_research_followups_migration.py (4) + 3 migration suites updated | 37 new tests; validators, idempotency (incl. crash-recovery never-double-execute), org isolation, budget-stop classification through a REAL worker, hooks (incl. raising hook never kills), dispatcher/reconcile semantics, restart recovery, full worker loop (schedule → dispatch → execute → followup done) |

### 15.2 Design decisions (test-pinned)

- The durable handlers call exactly the Phase 2 ResearchEngine facade —
  one execution path, identical semantics in-process and durable
  (engine.py's stated contract).
- A budget stop is a SESSION outcome, not a task failure: the task
  completes honestly so the followup closes and the queue is not
  polluted with retryable budget fights; only the human resume path
  continues an exhausted session.
- Step-progress idempotency is derived from the append-only tool-call
  log (no separate progress column to drift): a re-run resumes at the
  first unrecorded step; an interrupted handler never double-records
  (test: simulated DB hiccup on complete_session → re-run → 0 duplicate
  rows, usage counted once).
- Followup rows are DATA: due_ts + payload; dispatch is a bounded
  queue-bridge scan (the ONLY cross-org research read, documented at
  the model and the dispatcher); the worker loop owns the cadence —
  jobs.py / APScheduler untouched (0 lines changed).
- Hook contract: pure observers, terminal-failure events only, never
  fatal — observability can never take the worker down (test-pinned
  with a raising hook).
- Admin trust split: `research` without --org shows COUNTS ONLY (the
  `stats` precedent); `followups list` requires --org (no cross-org
  research-row listing); dispatch is the manual idempotent operator
  trigger of the worker pass.
- Supervisor/JS surface: untouched — the Python worker is the durable
  execution entry point; no new API route, no supervisor change
  (supervisor integration is a Phase 7+ deployment concern).

### 15.3 Verification (actual commands, actual results)

| Check | Command | Result |
| --- | --- | --- |
| Task-type battery | `pytest tests/test_research_tasks.py -q` | **22 passed** |
| Followups battery | `pytest tests/test_research_followups.py -q` | **11 passed** |
| Followups migration | `pytest tests/test_research_followups_migration.py -q` | **4 passed** (fresh shape + CHECKs + defaults + downgrade + head/parent + deployment path on an operational-DB copy) |
| Updated migration suites | `pytest tests/test_research_foundation_migration.py tests/test_research_engine_migration.py tests/test_agent_task_migration.py -q` | **13 passed** (five revisions, six tables, 21-revision linear chain, single head b4c5d6e7f8a9) |
| Queue regression | `pytest tests/test_task_admin.py tests/test_worker.py tests/test_task_registry.py tests/test_durable_queue.py -q` | **54 passed** (worker hooks + followup pass are additive; Phase 1A semantics intact) |
| Full suite | fresh copy of operational DB → `COFFEE_DATABASE_URL=sqlite:////tmp/p3-full.db pytest tests/ -q` | **250 passed, 1 warning** (pre-existing starlette/httpx; 213 + 37 new) |
| Operational DB | sha256 before/after every run | `ce14d7b0…` byte-identical; no `M` entry in git status |
| Lint/format | `ruff check` + `black --check` on every touched file (research/, tasks/, models, config, all six test files) | clean (pre-existing I001 in admin.py cleaned in-file, per §13.6 convention) |
| Working tree | `git status --porcelain` | exactly the §9 Phase 3 file set; no package.json/JS noise; no secrets |

### 15.4 Security review

- Org scoping: every research read/write stays org-scoped; the handlers
  bind ResearchEngine/EvidenceLedger/ResearchFollowups to
  snapshot.organization_id; cross-tenant session ids fail as
  NonRetryableTaskError (task failed in one attempt — no existence
  oracle, no retry storm).
- The one cross-org read (dispatch due-scan) reads dispatch data only
  (followup_id/org/type/payload) and stamps each task with the row's
  OWN org — explicit attribution, never a silent fallback; documented
  at the model, the service and the dispatcher.
- Budget honesty: unchanged Phase 2 rules — a budget stop is honest
  and terminal for the run; the task never retries to fight it.
- Idempotency: at-least-once double-execution is prevented by the
  tool-call-log progress rule (no duplicate evidence/audit rows, no
  double usage counting).
- Egress: no new network surface (web_fetch bounds unchanged; the
  sweep and dispatcher touch only the DB and the queue).
- Secrets: none in code; env var names only; logs carry ids/statuses.
- Boundary: jobs.py / task_queue.py / APScheduler / supervisor / API
  routes — 0 lines changed (verified in the diff).
