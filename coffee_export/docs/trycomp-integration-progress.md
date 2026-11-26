# TryComp Selective Integration — Progress & Project Memory

This is the permanent project memory for the selective TryComp AI integration into
Faith-El Export. Every implementation phase updates this file. A new coding session
must be able to continue from this document alone.

- **Integration branch:** `trycomp-selective-integration` (workspace lost a THIRD time on 2026-11-25, AFTER the Phase 2 commit — restored loss-free from the exported bundle; see §0.2; a FOURTH loss on 2026-11-25 was restored the same way from the phase5 bundle — §0.3; a FIFTH loss on 2026-11-26 wiped `faithel-trycomp/.git` only — files intact, repo rebuilt from `faith-el-trycomp-complete.bundle` and the branch pushed to origin the same day)
- **Last updated:** Phase 8 (end-to-end validation & stabilization) — 2026-11-26
- **Current phase:** 8 complete — THE INTEGRATION ARC (Phases 0–8) IS FINISHED (Phase 8 commit `1ad066e` + docs commit); branch pushed to `origin/trycomp-selective-integration`; remaining items are owner decisions (§12)

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

### 0.3 Fourth loss and bundle restore (2026-11-25, later the same day)

The persistent workspace was lost a FOURTH time (after the Phase 5 docs
commit `7cfc449`, before Phase 6 started). The §0.1 protocol held again:
the phase5 bundle (`trycomp-selective-integration-phase5.bundle`) restored
the branch with zero loss (HEAD `7cfc449`, clean tree, operational DB
sha256 `ce14d7b0…` byte-identical). The Python venv was rebuilt at the
REPO ROOT (`workspace/faithel-trycomp/.venv` — the migration tests spawn
`REPO_ROOT/.venv/bin/python` subprocesses) and the full suite was
re-verified on the restored tree BEFORE Phase 6 started: **355 passed,
1 warning** — the exact Phase 5 baseline. Phase 6 (`5e7ae11`) and Phase 7
(`d85c928`) were then implemented on the restored branch, each committed
with an immediate bundle export (phase6/phase7 bundles in the download
folder).

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
- [UPDATED Phase 8, 2026-11-26] The deployment migration HAS NOW RUN for
  real: `b9d0e1f2a4b5 → b4c5d6e7f8a9` (five additive revisions) applied to
  `state/coffee_export.db` — 64 → 70 tables, **zero row-count drift** on
  pre-existing tables (proven first on a byte-copy, then applied).
  Post-deployment sha256 baseline:
  `55363dbb18d867f9a9048b41d63263e157fa6d1b4bb83a45329fa045feafdb05` —
  the one-time change vs `ce14d7b0…` is the migration itself plus the WAL
  checkpoint settle; data preserved. The suite's hermeticity guard
  re-verified the NEW baseline byte-identical across every battery. The
  chain is now 21 revisions, single head, linear, history untouched.

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
- [x] **Phase 3 — Durable research execution** (commit `56e4006`, 2026-11-25,
      on top of `596692c`): `research.run_session` +
      `research.revalidate_evidence`
      registered in `default_registry` (the first real business types —
      §5.5 #6 closed) with tight validators, idempotent org-scoped
      handlers and honest failure classification; `research_followups`
      table (migration `b4c5d6e7f8a9`) + service + queue-side dispatcher
      (reconcile + dispatch-due) wired into the worker loop and the
      admin CLI; worker monitoring hooks (WorkerHooks) + admin `research`
      / `followups` subcommands; the §11.5 revalidation sweep landed as
      durable work. Record: §15.
- [x] **Phase 4 — Buyer discovery & enrichment** (four commits, 2026-11-25:
      `4e4285f` §12.1 LLM-assisted planning + §12.4 revalidation-followup
      wiring; `3586bc3` §12.2 search adapters + discovery chain; `1059685`
      §12.3 contact-verification gate; `beb6c04` §12.5 Agent 2 durable
      research scheduling): plan_objective_ai (strictly validated LLM
      planning through AIGateway, honest deterministic fallback),
      create_session_with_planning (Agent-2 entry point), record_evidence
      schedules revalidate followups at expires_ts (§11.5 automated),
      tavily/brave/serpapi adapters behind the capability gate (bounded,
      sanitized, never faked), search_buyers / classify_buyer /
      find_decision_makers (deterministic, explainable, no invented
      channels), ContactVerificationService + verify_contact tool
      (llm_inference never verifies), Agent2.schedule_research_session
      (queue-only, explicit org, duplicate protection). Record: §16.
- [x] **Phase 5 — Buyer qualification & matching** (commit `7af0def`,
      2026-11-25): QualificationService — requirement extraction from
      persistent facts (live-evidence-checked, honest misses),
      explainable weighted qualification scoring (evidence-linked;
      unknowns never pass), inventory matching against org-scoped active
      lots with criterion-by-criterion explanations and
      missing-information detection; qualify_buyer + match_inventory
      research tools. Record: §17.
- [x] **Phase 6 — Outreach & relationship integration** (commit `5e7ae11`,
      2026-11-25): OutreachService — evidence-based drafts into the
      EXISTING pending_agent_actions approval queue (the supervisor's
      exact send_email payload contract; never sends — §4.5 dual gate
      unchanged), §12.2 duplicate-send prevention mirroring the Node
      guard, §12.1 contact-gated channels (the §12.3 gate is binding),
      deterministic draft composition (only satisfied dimensions enter
      the body; missing information goes to the human approver),
      outreach milestones → Phase 3 followups, qualification scorecards
      as evidence rows (§12.4) with the Agent 3 QUAL-pass transition
      citing the evidence_id; draft_outreach research tool; explicit
      tenant org on every agent entry point. Record: §18.
- [x] **Phase 7 — Monitoring & UX** (commit `d85c928`, 2026-11-25):
      ResearchHealthService — ONE read-only, org-scoped health snapshot
      (sessions, evidence quality incl. corroboration rate + expiry
      backlog, facts, budgets & usage with reported-cost honesty,
      followups incl. overdue, research.* queue health, the Phase 6
      outreach approval queue) feeding the EXISTING Streamlit dashboard
      (new 'Research Monitor' page, existing design system) and the
      queue admin CLI (`health --org`); list_research_orgs org picker
      (ids only). Record: §19.
- [x] **Phase 8 — End-to-end validation & stabilization** (commit
      `1ad066e`, 2026-11-26): full regression on the deployed schema (400
      Python + 8 smoke suites + supervisor tick; vitest 136; tsc 0 errors;
      DB hermeticity), the REAL deployment migration b9d0e1f2a4b5 → head
      with zero data drift (§5.2 update), the 9-stage Buyer Opportunity
      Radar scenario on synthetic data as a permanent suite test, migration
      test stabilization (baseline reconstruction on throwaway copies),
      the Phase 8-verified deployment runbook
      (`coffee_export/docs/deployment-runbook.md`), and the final
      technical/business/security reports + final bundle. Record: §20.

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

Phase 4 (commits 4e4285f + 3586bc3 + 1059685 + beb6c04):
- NEW `coffee_export/coffee_export/research/search_adapters.py`,
  `research/contact_verification.py`,
  `research/tools/discovery.py`, `research/tools/contact_verify.py`
- MOD `research/planning.py` (plan_objective_ai + PlanOutcome +
  discovery/verification tools in PLAN_ALLOWED_TOOLS),
  `research/providers.py` (credential() execution-site accessor),
  `research/tools/web_search.py` (real adapter calls),
  `research/tools/registry.py` + `tools/__init__.py` + `research/__init__.py`
  (registrations/exports), `research/tools/evidence_record.py`
  (§12.4 followup wiring), `tasks/research_tasks.py`
  (create_session_with_planning), `agents/agent2_enrichment.py`
  (schedule_research_session)
- MOD tests: `test_research_tools.py` (web_search adapter reality)
- NEW tests: `test_research_planning_ai.py` (25),
  `test_research_discovery.py` (31), `test_contact_verification.py` (21),
  `test_agent2_research.py` (7)

Phase 5 (commit 7af0def):
- NEW `coffee_export/coffee_export/research/qualification.py`,
  `research/tools/qualification.py`
- MOD `research/tools/registry.py`, `tools/__init__.py`,
  `research/__init__.py` (registrations/exports), `research/planning.py`
  (qualify/match planner phases)
- NEW tests: `test_qualification_matching.py` (21)

Phase 6 (commit 5e7ae11):
- NEW `coffee_export/coffee_export/research/outreach.py`,
  `research/tools/outreach.py`
- MOD `research/__init__.py`, `research/tools/__init__.py`,
  `research/tools/registry.py` (exports/registration),
  `research/planning.py` (draft_outreach in PLAN_ALLOWED_TOOLS,
  'outreach' phase)
- MOD `agents/agent3_outreach.py` (submit_research_outreach,
  schedule_outreach_followup, research_engine threading through
  record_buyer_reply → QUAL-pass scorecard citation;
  _require_tenant_org refusal)
- NEW tests: `test_research_outreach.py` (33)

Phase 7 (commit d85c928):
- NEW `coffee_export/coffee_export/research/monitoring.py`,
  `coffee_export/coffee_export/dashboard/pages/research_monitoring.py`
- MOD `coffee_export/coffee_export/dashboard/app.py` (nav + routing),
  `research/__init__.py` (exports), `tasks/admin.py`
  (health subcommand)
- NEW tests: `test_research_monitoring.py` (10)

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
12. [UPDATED Phase 4] LLM-assisted planning HAS landed (plan_objective_ai,
    strictly validated, honest fallback — §16); the deterministic template
    remains the floor, not the only path.
13. [UPDATED Phase 4] `web_search` now calls REAL adapters (tavily/brave/
    serpapi) when a provider key is configured — wire formats are
    fixture-tested only (offline sandbox; no live provider call was ever
    made by the suite). Unconfigured stays the honest refusal.
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
17. Person/role extraction (find_decision_makers) is regex-based over a
    fixed role vocabulary — recall is bounded by ROLE_PATTERNS (roles
    outside the list are honest misses); no ML NLP is used, by design
    (explainability over recall).
18. classify_buyer's keyword table is deliberately conservative (the
    common coffee-trade sectors); unusual sectors land in
    insufficient_evidence rather than a nearest-guess.
19. Qualification weights/thresholds (40/30/30; ≈1 FCL) are documented
    defaults, injectable per call — business tuning is the operator's
    decision, never a hidden constant opinion.
20. The planner records its model call against a session only when the
    session is CREATED (the reuse path stays un-accounted on the session;
    the gateway still logs it to ai_call_logs like every call).
21. Decision-maker candidates from search hits win dedupe over
    text-extracted ones (URL attribution preferred) — a text-only
    duplicate of a URL-backed candidate is dropped, documented behavior.
22. [Phase 6] Research outreach drafts target ENRICHED leads ONLY: the
    supervisor's approved-send path advances exactly
    ENRICHED→IN_SEQUENCE, and IN_SEQUENCE continuation belongs to the
    Agent 3 sequence machinery (untouched — two writers to the same
    sequence would drift).
23. [Phase 6] Research drafts are ENGLISH-ONLY in Phase 6 (the lead's
    outreach_language is recorded in the payload but not applied);
    language adaptation stays on the Node template path.
24. [Phase 6] A machine-recorded qualification scorecard is stored as
    source_type 'llm_inference' BY CONVENTION — derived analysis, never
    an independent source, never verification; the operator path
    (actor given) is the true human attestation and locks.
25. [Phase 6] The Node supervisor's own pending_agent_actions INSERT
    relies on the column's org-system DEFAULT (pre-existing condition,
    recorded here, NOT silently fixed — out of this integration's
    scope); Python Phase 6 inserts always stamp the real org.
26. [Phase 7] Monitoring is snapshot-pull (service calls), not
    push/streaming; the dashboard re-queries on page render. Streamlit
    page rendering itself is not unit-tested (module surface only) —
    the service and CLI behind it are.

## 12. Exact next action

Phase 8 is COMPLETE (§20; commit `1ad066e`). **The TryComp selective
integration arc (Phases 0–8) is finished.** The branch
`trycomp-selective-integration` is pushed to origin; the operational DB
is deployed at head; the tree is clean. Remaining items are OWNER
decisions, not integration work:

1. Configure real providers when going live (a search-provider key for
   buyer discovery; Resend/bridge credentials for email) — unconfigured
   capabilities stay honestly disabled (§11.2/§11.13), never faked.
2. Merge/PR decision: `trycomp-selective-integration` → `main` (the
   Round 11F stale-branch ruling in §5.4 is unaffected).
3. Business tuning of qualification weights/thresholds (§11.19) and
   outreach followup cadence — operator-level settings, documented
   defaults in place.

(The historical Phase 6 §12 directive is retained below verbatim.)

1. Evidence-based drafts through Agent 3 + the EXISTING approval
   queue: research outputs (scorecard, matches, decision-maker
   candidates) feed draft generation; every contact channel used MUST
   pass the §12.3 ContactVerificationService gate first (it is already
   the qualify_buyer contact dimension); the §4.5 dual gate and the
   fail-closed bridge are unchanged — no autonomous sending.
2. Duplicate-send prevention: a lead with a pending/in-flight approved
   action must never receive a second draft (research-side detection
   before draft creation).
3. Reply tracking + follow-ups: research followups (Phase 3) may be
   scheduled from outreach milestones (e.g. sample feedback due); the
   dispatcher already owns the cadence.
4. CRM pipeline integration: qualification scorecards land as evidence
   rows (record_evidence) so ENRICHED→QUALIFIED transitions cite the
   research; no new pipeline states (§7 mapping unchanged).

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

## 16. Phase 4 record — buyer discovery & enrichment (2026-11-25)

### 16.1 What was built (four commits)

| Layer | Files | Semantics |
| --- | --- | --- |
| LLM-assisted planning (§12.1) | research/planning.py | plan_objective_ai: AIGateway chat → STRICT validation (allowed tools only, per-tool input schemas, ≤12 steps, ≤300-char descriptions, JSON-list-only) — ANY violation falls back to the deterministic template with the honest parse_error (never a partially-trusted plan); PlanOutcome carries source/provider/model/cost/parse_error audit data; discovery/verification tools admitted to PLAN_ALLOWED_TOOLS (discover_buyers / verify_contacts phases) |
| Agent-2 entry point (§12.1) | tasks/research_tasks.py | create_session_with_planning: plan → create-or-org-reuse the session with the winning plan → account the model call through engine.record_model_call (budget accounting, never a side channel; recording auto-starts a pending session — documented); reuse never double-accounts |
| Revalidation wiring (§12.4) | research/tools/evidence_record.py | record_evidence with expires_ts schedules a subject-scoped revalidate_evidence followup AT the expiry time (§11.5 automated end-to-end: record → followup → dispatcher → sweep); followup_id returned honestly; scheduling failure degrades (evidence stays recorded, warning logged, no followup_id) |
| Search adapters (§12.2) | research/search_adapters.py | tavily/brave/serpapi adapters behind the manifest gate: injectable transport, 256 KiB refuse-not-truncate body cap, 10 s timeout, ≤20 results, http(s) URLs only, snippets bounded (display data); non-200 / malformed / non-list results RAISE (never coerced to empty "no results"); raw transport exceptions SANITIZED to type-only messages (a key-bearing URL can never reach a recorded row — serpapi carries the key in the URL); wire formats from public docs, fixture-tested (offline sandbox — live compatibility honestly untested) |
| web_search upgrade | research/tools/web_search.py | real adapter calls behind the SAME capability gate; unconfigured → honest capability_unavailable; transport failure → honest error row (never a faked empty success); the key reaches the adapter via manifest.credential (the ONE sanctioned execution-site value accessor — snapshots stay names-only, sentinel test intact) |
| Discovery chain (§12.2) | research/tools/discovery.py | search_buyers (name-hints from REAL result titles, domain-deduped, honest "not verified identities" note), classify_buyer (deterministic keyword sectors, every match lists keyword+location; zero evidence → insufficient_evidence, ties → ambiguous, never a guess), find_decision_makers (deterministic role-pattern extraction from provided text and/or search hits; URL-attributed extractions win dedupe; every candidate unverified with bounded context; NO emails/phones ever extracted or invented) |
| Contact gate (§12.3) | research/contact_verification.py + tools/contact_verify.py | ContactVerificationService: a contact channel is usable ONLY with admissible evidence rows (non-suppressed/outdated/disputed, source ≠ llm_inference, value match — emails case-insensitive, phones digits-only); llm_inference NEVER verifies; usable ≠ verified (§4.5 human approval queue unchanged, downstream); org-scoped, no existence oracle; verify_contact tool composes it into sessions/plans |
| Agent 2 integration (§12.5) | agents/agent2_enrichment.py | schedule_research_session: plan + create the org-scoped session + enqueue research.run_session THROUGH THE QUEUE (never the event loop); explicit-tenant-org refusal (no silent org-system, §4.1); duplicate protection (live-session reuse + pending/leased task scan → honest task_pending skip); registry reuse without re-registration |

### 16.2 Design decisions (test-pinned)

- An LLM plan is DATA and is only ever stored after STRICT validation;
  the deterministic template is the honest floor, not a patch-up.
- Search results are DISPLAY data; evidence must come from web_fetch
  (cap-and-refuse) or the operator — the adapters never write facts.
- Deterministic extraction/classification everywhere: a name-hint, a
  sector, a person mention is always explainable by a rule over real
  text — never an AI guess. AI proposes (planning); evidence decides.
- The contact gate reuses the Phase 1 ledger as its single source of
  truth: no second contact store, no duplicated verification logic.
- manifest.credential() is the narrow, documented exception to
  "names-only": values reach the execution site from the SAME mapping
  the capability was detected from, and never appear in snapshots,
  results, logs or error messages (sentinel + sanitization tests).

### 16.3 Verification (actual commands, actual results)

| Check | Command | Result |
| --- | --- | --- |
| Planning battery | `pytest tests/test_research_planning_ai.py -q` | **25 passed** |
| Discovery battery | `pytest tests/test_research_discovery.py -q` | **31 passed** |
| Contact gate battery | `pytest tests/test_contact_verification.py -q` | **21 passed** |
| Agent-2 battery | `pytest tests/test_agent2_research.py -q` | **7 passed** (incl. end-to-end worker execution of a scheduled session) |
| Agent-2 smoke suite | `python -m tests.test_agent2` (fresh DB copy) | **PASS** |
| Phase 2 regression | `pytest tests/test_research_tools.py tests/test_provider_manifest.py -q` | **36 passed** (web_search test updated to adapter reality) |
| Phase 3 regression | `pytest tests/test_research_tasks.py tests/test_research_followups.py -q` | **33 passed** |
| Operational DB | sha256 before/after every run | `ce14d7b0…` byte-identical |
| Lint/format | ruff + black on every touched file | clean |

## 17. Phase 5 record — buyer qualification & matching (2026-11-25)

### 17.1 What was built

| Layer | Files | Semantics |
| --- | --- | --- |
| Requirement extraction | research/qualification.py | persistent facts → structured requirements (annual_volume_mt scale, purchase_volume_mt per-lot, sector, certifications, min_cupping_score, preferred_process); live-evidence check — a fact whose rows are ALL outdated/disputed is an honest miss; missing facts are MISSING INFORMATION, never guessed |
| Qualification scoring | research/qualification.py | weighted dimensions — volume 40 (≥ ≈1 FCL/year default, injectable), segment 30 (importer/trader/roaster), contact channel 30 (IS the §12.3 gate; llm_inference never satisfies); every dimension traces to a fact + evidence level; evidenced negatives are 'unsatisfied' (honest zero, not hidden); unknowns score zero AND are listed in missing_information; the human Q1–Q5 conversation remains the commercial gate (documented in every scorecard) |
| Inventory matching | research/qualification.py | org-scoped active/in-stock/not-deleted lots vs extracted requirements, criterion-by-criterion (volume, certifications, cupping floor, process) with pass/fail/missing_info + one-line explanations; ranking by matched criteria; unknown requirements are missing_info on EVERY lot (never counted compatible); ungraded lots honestly missing_info; annual volume (scale) vs purchase volume (per-lot) never conflated |
| Research tools | research/tools/qualification.py | qualify_buyer + match_inventory (registry-composable, org-scoped via ToolContext, engine-required; planner phases 'qualify'/'match') |

### 17.2 Design decisions (test-pinned)

- Scoring weights and thresholds are explicit constants (documented,
  injectable) — every point in a scorecard is explainable by a fact.
- An unknown NEVER passes: not-evidenced dimensions score zero and are
  surfaced; evidenced negatives are recorded as unsatisfied — the
  scorecard can never silently turn missing data into a qualification.
- Matching reads lots read-only (column Rows, no ORM session, no
  mutation); lot data itself is not re-verified here (QA/grading owns
  lot data — ungraded lots are honest missing_info).
- The contact dimension deliberately REUSES the §12.3 gate as the
  authority proxy — one contact-truth source, zero duplication.

### 17.3 Verification (actual commands, actual results)

| Check | Command | Result |
| --- | --- | --- |
| Phase 5 battery | `pytest tests/test_qualification_matching.py -q` | **21 passed** |
| Full research regression (P1–P5) | `pytest tests/test_provider_manifest.py tests/test_research_*.py tests/test_contact_verification.py tests/test_qualification_matching.py tests/test_agent2_research.py -q` | **202 passed** |
| Operational DB | sha256 before/after every run | `ce14d7b0…` byte-identical |
| Lint/format | ruff + black on every touched file | clean |

## 18. Phase 6 record — outreach & relationship integration (commit `5e7ae11`, 2026-11-25)

### 18.1 What was built

| Layer | Files | Semantics |
| --- | --- | --- |
| Outreach service | research/outreach.py | OutreachService (org-scoped, injectable engine): draft_outreach composes the Phase 5 scorecard + inventory matches + §12.3 contact-gated email into ONE pending_agent_actions row — agent_id 'Agent 3', action_type 'send_email', the EXACT executeApprovedEmail payload contract (lead_id/company/step/language/email_subject/email_body/email_to/email_from) + a reasoning block for the human approver; NEVER sends (no gateway/send surface exists in the module at all — §4.5 dual gate unchanged) |
| Duplicate prevention (§12.2) | research/outreach.py | check_duplicate mirrors the supervisor guard exactly (pending/approved/executed block — regardless of which path drafted; rejected/execution_failed honestly do NOT block); org-scoped read; the guard runs BEFORE any draft work |
| Contact gate (§12.1) | research/outreach.py | the verified primary lead_contacts email is NECESSARY but NOT sufficient: it must ALSO pass the §12.3 ContactVerificationService gate (non-llm_inference evidence rows, value-matched); refusals carry the honest gate reason |
| Draft honesty | research/outreach.py | deterministic composition (no LLM, no invention): only SATISFIED scorecard dimensions enter the buyer-facing body ('your importing program' / 'your sourcing volume' lines appear only when evidenced); matched lots bounded to 3 with region/process/cupping from read-only lot rows; missing information goes to payload.reasoning (the approver), never the body |
| Milestones (§12.3) | research/outreach.py | record_outreach_milestone: no_reply → run_session followup (re-research objective), sample_feedback_due → revalidate_evidence followup (subject-scoped); the Phase 3 dispatcher owns the cadence from there |
| CRM pipeline (§12.4) | research/outreach.py | record_qualification_scorecard: machine path source_type 'llm_inference' (derived analysis, never corroborates — the fact stays observed), operator path source_type 'human' (locks; newer human attestation supersedes, the superseded row retained as disputed); fact_key qualification_scorecard |
| Research tool | research/tools/outreach.py | draft_outreach (registry-composable, ToolContext org, engine required, created_by 'research:<session>'); honest refusals are ok-with-reason results, input errors are error rows; PLAN_ALLOWED_TOOLS + 'outreach' planner phase |
| Agent 3 integration | agents/agent3_outreach.py | submit_research_outreach / schedule_outreach_followup (explicit tenant org — an org-system agent REFUSES, §4.1; injectable engine, production default = the queue engine); record_buyer_reply accepts research_engine and on the QUAL pass records the scorecard + cites the evidence_id in the transition notes AND the LEAD_QUALIFIED event payload (org-system agents or unwired engines honestly skip — the commercial gate NEVER depends on research availability) |

Zero migrations, zero new tables, zero Node changes.

### 18.2 Design decisions (test-pinned)

- The approval queue is the ONE human workflow surface: Python drafts
  and Node drafts write the SAME queue with the SAME payload contract,
  and the SAME duplicate guard protects both — no second approval
  path, no divergence.
- The queue insert stamps organization_id EXPLICITLY (never the
  column's org-system default) — the pre-existing Node-side default
  insert is recorded (§11.25), not silently fixed.
- A draft refusal is an honest structured result (reason + gate
  detail), never an exception and never a partial draft.
- The QUAL-pass scorecard citation is fail-open BY DESIGN for the
  commercial flow (research unavailable → transition proceeds, nothing
  cited) and never fail-open for honesty (the scorecard is only ever
  recorded through the Phase 1 EvidenceLedger with real source typing).
- Research drafts target ENRICHED leads only (§11.22) — the exact
  state contract of the approved-send executor.

### 18.3 Verification (actual commands, actual results)

| Check | Command | Result |
| --- | --- | --- |
| Phase 6 battery | `pytest tests/test_research_outreach.py -q` | **33 passed** |
| Research regression (P1–P5) | `pytest tests/test_research_planning_ai.py tests/test_qualification_matching.py tests/test_contact_verification.py tests/test_agent2_research.py tests/test_research_tools.py tests/test_provider_manifest.py tests/test_research_sessions.py tests/test_research_tasks.py tests/test_research_followups.py -q` | **171 passed** |
| Full Python suite | fresh copy of operational DB → `COFFEE_DATABASE_URL=sqlite:////tmp/... pytest tests/ -q` | **388 passed, 1 warning** (pre-existing starlette/httpx) |
| Operational DB | sha256 before/after every run | `ce14d7b0…` byte-identical |
| Lint/format | ruff + black on every touched file | clean |
| Security greps | org-system mentions (docstrings only), raw SQL (none — expression API + bound params), secrets (none), send surface (none) | pass |

## 19. Phase 7 record — monitoring & UX (commit `d85c928`, 2026-11-25)

### 19.1 What was built

| Layer | Files | Semantics |
| --- | --- | --- |
| Health service | research/monitoring.py | ResearchHealthService.overview() — org-scoped, READ-ONLY, injectable now_ts: sessions (by status; budget_exhausted ids awaiting the human resume path; last completed), evidence quality (by status, suppressed, human rows, corroboration rate over live rows, expiring-soon window, expired-still-live = the sweep's honest backlog), facts (human_locked), budgets & usage (REPORTED cost sum only — None never zeroed; usage counters; tool-call log rows), followups (by status, overdue scheduled, next due), queue (research.* by status, in-flight, in-flight attempts detail), outreach (approval queue by status, awaiting-human-review, research-drafted share via bounded payload parse) |
| Org picker | research/monitoring.py | list_research_orgs — ids ONLY, bounded, sorted (the operator picker; same trust level as the admin counts-only rollup; no tenant rows leave the DB) |
| Dashboard | dashboard/pages/research_monitoring.py + app.py | 'Research Monitor' page on the EXISTING Streamlit app (nav + routing): org selectbox, metrics/dataframes per section, warnings that name the honest operator action (human resume, dispatch, requeue) — zero write paths, existing design system, no second monitoring system |
| Admin CLI | tasks/admin.py | `health --org ORG [--window-days N]` — the snapshot in CLI form; org-scoped only (cross-org counts rollup stays on the existing `research` subcommand); read-only |

### 19.2 Design decisions (test-pinned)

- ONE snapshot shape serves both surfaces (dashboard renders the same
  dict the CLI prints) — no dual drift.
- Honest zeros everywhere: empty databases report zero, unreported
  costs report 'not reported', and nothing is inferred.
- The service never mutates: monitoring cannot change the thing it
  monitors (read-only by construction — no write methods exist).
- The expiring-soon boundary is inclusive and exact (test-pinned at
  the second).
- Streamlit rendering is not unit-tested (module surface test only);
  the service and CLI behind it carry the test weight — the honest
  boundary for UI code in this stack.

### 19.3 Verification (actual commands, actual results)

| Check | Command | Result |
| --- | --- | --- |
| Phase 7 battery | `pytest tests/test_research_monitoring.py -q` | **10 passed** |
| Full Python suite | fresh copy of operational DB → `COFFEE_DATABASE_URL=sqlite:////tmp/... pytest tests/ -q` | **398 passed, 1 warning** (388 + 10) |
| Operational DB | sha256 before/after every run | `ce14d7b0…` byte-identical |
| Lint/format | ruff + black on every touched file | clean |
| Import smoke | dashboard app + page module + CLI parser + research exports | OK |

## 20. Phase 8 record — end-to-end validation & stabilization (commit `1ad066e`, 2026-11-26)

Directive: **"Phase 8: end-to-end validation and stabilization"** — executed
per the §12 plan written when Phase 7 closed.

### 20.1 What was done

1. **Full regression, twice.** Pre-deploy (operational DB still at
   b9d0e1f2a4b5): 398 Python + 8 smoke suites (agents 2–7, StateManager,
   logistics) + supervisor single tick; vitest tests/lib 136; `tsc
   --noEmit` 0 errors; operational DB byte-identical before/after
   (hermeticity guard). Post-deploy: the same battery re-run against the
   deployed schema — 400 passed (398 + the 2 new scenario tests below).
2. **The deployment migration, for real.** `state/coffee_export.db`
   upgraded `b9d0e1f2a4b5 → b4c5d6e7f8a9` — five additive revisions
   (agent_tasks + five-state + the three research revisions). Proven FIRST
   on a byte-copy (row counts snapshotted before, compared after: zero
   drift; 64 → 70 tables), then applied to the deployment target. See the
   §5.2 Phase 8 update for the post-deployment sha256 baseline.
3. **The business-workflow scenario (§12.2), as a permanent test.**
   `tests/test_phase8_e2e_scenario.py` — one synthetic buyer through the
   full Buyer Opportunity Radar chain in one throwaway DB, nine asserted
   stages: seed → Agent-2 durable scheduling (queue-only) → real
   TaskWorker execution (session completes honestly, fallback plan) →
   evidence via the ledger AND the record_evidence tool (expires_ts →
   auto-scheduled revalidation followup, §12.4) → QualificationService
   100/100 → scorecard stored as llm_inference evidence (§12.4) →
   outreach draft into pending_agent_actions (§4.5 dual gate: pending,
   supervisor payload contract) → no-reply milestone followup →
   ResearchHealthService snapshot reflecting every stage (sessions/
   evidence incl. expiring backlog/facts/budgets/followups/queue/
   outreach). Plus an org-scoping proof (zero cross-org leakage).
4. **Stabilization.** The four `test_*_migration.py`
   `test_deployment_path_on_copy_of_operational_db` tests assumed the
   operational DB ships at b9d0e1f2a4b5 — false after the Phase 8
   deployment (4 failures on the post-deploy battery, the exact defect
   class Phase 8 exists to catch). Fix: the tests now RECONSTRUCT the
   b9d0e1f2a4b5 baseline on their throwaway copies via the (clean,
   additive) downgrade before exercising the upgrade — the deployment
   path stays proven forever, independent of the shipped DB state.
5. **Deployment runbook.** `coffee_export/docs/deployment-runbook.md` —
   the Phase 8-verified procedure (prerequisites, pre-flight hash +
   backup, migration, post-flight hermetic batteries, rollback via
   downgrade or file restore, runtime, standing invariants).
6. **Final reports + final bundle.** Technical / business / security
   reports exported alongside this record; full-history bundle exported
   after every commit (the §0.3 discipline — which also survived the
   FIFTH workspace loss on 2026-11-26, §0 header note).

### 20.2 Verification (actual commands, actual results)

| Check | Command | Result |
| --- | --- | --- |
| Pre-deploy full battery | `bash scripts/run-python-tests.sh` | **398 passed, 1 warning** + 9/9 suites; DB `ce14d7b0…` byte-identical |
| Deployment path (copy) | `alembic upgrade head` on byte-copy | 5 revisions; 64 → 70 tables; **zero row-count drift** |
| ORM ↔ migration parity | `Base.metadata.create_all` vs migrated schema | Python-owned tables (agent_tasks, research_*) match exactly; Node-owned tables are ORM-unmodeled by design |
| Deployment (real) | `alembic upgrade head` on `state/coffee_export.db` | version `b4c5d6e7f8a9`, 70 tables |
| Post-deploy full battery | `bash scripts/run-python-tests.sh` | **400 passed, 1 warning** + 9/9 suites; DB `55363dbb…` byte-identical (new baseline) |
| JS unit | `npx vitest run tests/lib` | **136 passed** (8 files) |
| TypeScript | `npx tsc --noEmit` | **0 errors** |
| Scenario trace | `pytest tests/test_phase8_e2e_scenario.py -s` | 9/9 stages, each asserted (see 20.1.3) |
| Lint/format | ruff + black on every touched file | clean |

### 20.3 Honest notes

- The post-deploy sha256 change (`ce14d7b0…` → `55363dbb…`) is the
  migration + a one-time WAL checkpoint settle, not data modification;
  every battery after it re-verified the NEW baseline byte-identical.
- The supervisor single tick still reports the Agent 3 bridge transport
  error offline — the documented honest-failure contract (action
  `execution_failed`, lead NOT advanced), not a defect.
- The scenario's qualification score (100/100) uses synthetic facts —
  it proves the CHAIN, not any real buyer's quality.
- Live provider calls (search, email) remain honestly unconfigured in
  this sandbox; wire formats are fixture-tested only (§11.13).
