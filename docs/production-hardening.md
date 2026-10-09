# Production Hardening — Phase F

**Date:** 2026-10-09 · **Base:** Phase E (commit `e835b26`) · **Status:** implemented and verified here; deployment-host validation is the one remaining user action.

Phase E closed the Agent 6 runtime, Agent 6→7 handoff and shipment-level arrival gaps, and listed what still needed attention before relying on the system in production. This document records the disposition of each of those items.

| Priority | Item (from the Phase E report) | Disposition |
|---|---|---|
| High | Continuous supervisor behavior under load is untested | **Closed** — supervisor soak test (load + duplicates, timeout storm, SIGKILL crash, stale-PID takeover) |
| High | Production Python venv layout unverified | **Validated here from a fresh venv** + `scripts/validate-python-runtime.sh` for the actual host (user action) |
| Medium | Agent 5 is still CLI-driven | **Decided and implemented** — drafting is runtime-triggered; signing stays manual (intentional) |
| Medium | Broader Python organization-scoping debt | **Audited** (AST tool) + runtime-reachable bypasses fixed with regression tests |

---

## 1. Supervisor soak — continuous runtime under load

`tests/integration/supervisor-soak.test.ts` drives the REAL continuous supervisor (`--interval 1`, not `--once`) on a throwaway DB:

- **Stage 1 — load + duplicates.** Events published *while the supervisor runs*: 6× duplicate `CONTRACT_SIGNED` across 2 real signed contracts (seeded through the real Agent 5 path), informational noise, one cross-org event, then 3× duplicate `SHIPMENT_DELIVERED`/`CONTRACT_COMPLETED` pairs for both shipments. Graceful SIGTERM stop. Result: **exactly-once everywhere** — 2 shipments, 36 checklist rows, 2 accounts, 1 follow-up each, 0 pending, 0 dead-letter, 0 supervisor errors.
- **Stage 2 — timeout storm + recovery.** With `SUPERVISOR_PYTHON_TIMEOUT_MS=1` every Python spawn is killed instantly across ≥3 ticks. The supervisor **survives and keeps ticking**, events **stay pending** (never silently consumed), failures land in `supervisor_log` (`AGENT_ERROR … killed`). After a restart with a normal timeout, the backlog drains with exactly-once outcomes.
- **Stage 3 — crash + stale-PID takeover.** SIGKILL of the whole process group mid-processing (no cleanup handlers). The stale PID file is taken over by the next start (observable: "Stale PID file found — taking over"), the backlog drains, and exactly-once holds.

**Unchanged scope:** this proves recovery and idempotency semantics, not capacity planning. Multi-hour soak with hundreds of orgs would need a dedicated environment.

## 2. Python runtime layout validation

`resolvePythonBin()` (scripts/supervisor.js) resolves `SUPERVISOR_PYTHON_BIN` → `coffee_export/venv/bin/python` (the layout `deploy-oracle.sh` creates) → `.venv/bin/python` → `python3`.

Verified in this environment with a **fresh venv built exactly like the deployment script** (`python3 -m venv` + `pip install -r requirements.txt bcrypt`):

- All 17 `validate-python-runtime.sh` checks pass (interpreter, ≥3.11, agent module imports, Agent 5/6/7 CLI launches, DB present, alembic at head).
- A supervisor tick with `SUPERVISOR_PYTHON_BIN` pointed at the fresh venv spawned **Agent 5 from it** and drafted a contract end-to-end (`SAMPLE_APPROVED → consumed by Agent 5`).

For the actual deployment host, run after `deploy-oracle.sh` (also added to `docs/deployment-oracle.md` Step 5):

```bash
npm run validate:python            # read-only
npm run validate:python -- --tick  # + one live supervisor tick
```

**Still a user action:** running the above on the real Oracle host. A missing/broken venv does not crash anything — it surfaces as `AGENT_ERROR` rows in `supervisor_log` while events stay pending — but you want to know *before* relying on it.

## 3. Agent 5 — decision: drafting automated, signing manual

**Decision:** `SAMPLE_APPROVED` now triggers Python Agent 5 through the supervisor runtime, exactly like Agents 6 and 7. **Contract signing stays a manual, human act** (`coffee_export/scripts/run_agent5.py sign`) — an automated signature would be precisely the pretend-a-sale behavior this system is built to prevent.

Rationale and context:

- `SAMPLE_APPROVED` was **unrouted** in the supervisor — any event published by a Python Agent 4 run would have sat `pending` forever (the same starvation class Phase E fixed for `SHIPMENT_DELIVERED`/`CONTRACT_COMPLETED`). Routing it to Agent 5 closes that hole.
- Drafting a contract + compliance checklist is not a legal commitment; the contract row is created in `draft` status and the signing gate (all compliance documents approved + explicit `sign_contract`) is unchanged.
- The agent-side run is org-scoped (`run_agent5.py run --organization ORG`, same contract as Agents 6/7) and **idempotent**: a redelivered approval finds the existing contract for the same `(lead, sample_request)` pair and returns `contract_exists` — no second contract, line item, checklist or `CONTRACT_DRAFTED` event (`StateManager.get_contract_for_sample`, tests in `coffee_export/tests/test_org_scoping.py` + `tests/integration/agent-runtime.test.ts`).

## 4. Organization-scoping audit — findings and fixes

A systematic audit (`scripts/audit_org_scoping.py`, AST-based: every mutating/read method checked for org references) confirmed the class of bypass: **repositories.py scopes reads, but StateManager methods that fetched rows by primary key via `session.get()` skipped the org check entirely** — a caller scoped to org A could mutate org B's row by id.

### Fixed (with `_scoped_get` / `_require_same_org` guards + org stamping)

| Cluster | Methods |
|---|---|
| Leads | `update_lead_state`, `transfer_ownership`, `advance_sequence_step`, `set_lead_field`, `add_tag`, `add_contact` |
| Lots | `update_lot` |
| Samples | `create_sample_request`, `add_lot_to_sample_request`, `update_sample_request_status`, `record_sample_shipment`, `update_shipment_status`, `record_cupping_score`, `record_sample_decision` |
| Contracts | `update_contract_status`, `add_contract_line_item`, `get_contract_for_sample` (new) |
| Compliance | `add_compliance_document`, `update_compliance_document`, `get_compliance_document` |
| Logistics | `update_shipment`, `get_shipment`, `add_shipment_item`, `add_customs_document`, `update_customs_document` (and `record_logistics_booking`'s internal shipment update now carries its explicit org) |
| Accounts | `create_account` (stamps the owning org — previously relied on the DB default, which is wrong for any org besides org-system), `get_account`, `get_account_by_lead`, `get_accounts`, `update_account`, `add_account_activity`, `get_account_activities` |
| Messaging | `update_message_ai_fields`, `mark_message_read`, `mark_message_status` (org-aware via explicit `organization_id` param — the email bridge and dashboard pass the owning inbox's org), `close_thread` |

Guard semantics: a cross-tenant row is **indistinguishable from a missing row** — `NotFoundError` for mutations, `None`/`False` for reads that already had that contract — so blocked attempts leak no information about other orgs, and every block is logged (`Cross-tenant access blocked: …`).

ORM models now map `organization_id` where the DB column already existed (migration `a1b2c3d4e5f7`) but the app layer could not stamp it: `Account`, `AccountActivity`, `ContractLineItem`, `ShipmentItem`, `CustomsDocument`, `SampleShipment`, `CuppingScore`, `SampleDecision`, `SampleRequestLot`, `LeadTag`. No schema change was needed — the columns pre-existed.

Regression tests: `coffee_export/tests/test_org_scoping.py` (7 tests: every cluster above, account org-stamping/isolation, messaging explicit-org behavior, Agent 5 idempotency).

### Audited, deliberately not guarded (documented)

- `update_memory` / `forget_memory` / `store_memory` / `set_buyer_preference` — the `conversation_memory` table has **no organization_id column** (org-agnostic by schema). Fixing this requires a migration + a decision about agent memory tenancy; tracked as debt.
- `set_agent_status` — `agent_controls` is a global infrastructure table (no org column); intentional.
- `add_to_waitlist` / waitlist + budget reads — CLI/dashboard-only paths today (org-system callers); guard before any of them becomes runtime-reachable.
- Remaining `get_*` list/read methods outside the runtime paths (e.g. `get_kpi_snapshot`, `get_outreach_stats`, finance summaries) — mostly aggregate/reporting reads reachable only from the single-org dashboard. Guard them before exposing any multi-tenant surface to them.

## 5. Verification summary

- Python suites (`npm run test:python`): all green including the new org-scoping suite; committed DB sha-identical before/after (`ce14d7b0…`).
- JS integration: `agent-runtime.test.ts` 6/6 (new Agent 5 stage), `supervisor-soak.test.ts` 3/3.
- Full JS suite, eslint, tsc, production build: see the commit's verification record in `worklog.md`.

## 6. What is still NOT proven

- **The actual deployment host.** Everything venv-related was proven from a freshly built venv in a test environment; `npm run validate:python -- --tick` must run once on the Oracle host.
- **Capacity planning.** The soak proves correctness under stress, not throughput numbers. If event volume grows, measure tick duration (`supervisor_log`) before scaling expectations.
- **Multi-tenant agent memory** (see audit deferrals) and the dashboard-only read paths remain org-scoped debt, listed above with their trigger conditions.
