/**
 * Agent runtime integration — the REAL production event path, end to end.
 *
 * Proven here (through the actual runtime, NOT by calling Python functions
 * directly):
 *
 *   1. Agent 5 sign_contract (the real CONTRACT_SIGNED source, driven via
 *      coffee_export/scripts/dev_seed_contract.py) → event on the bus.
 *   2. `node scripts/supervisor.js --once` sees the pending CONTRACT_SIGNED,
 *      spawns the Python Agent 6 CLI (org-scoped), which claims it via the
 *      org-scoped event bus, creates the shipment record + 18-step export
 *      checklist + customs checklist + timeline event, and marks the event
 *      consumed BY THE AGENT.
 *   3. Event replay (at-least-once redelivery) does NOT duplicate the
 *      shipment, checklist, or timeline.
 *   4. Cross-org CONTRACT_SIGNED (event owned by org-abi, contract owned by
 *      org-system) is rejected by org scoping — no shipment is created for
 *      a contract the event's org does not own.
 *   5. SHIPMENT_DELIVERED + CONTRACT_COMPLETED (exactly what the Node
 *      arrival API publishes) → supervisor tick → Python Agent 7 creates
 *      the account + ONE delivery follow-up; redelivery does not duplicate
 *      the activity or ACCOUNT_CREATED.
 *   6. A Python spawn failure (missing interpreter) leaves events PENDING
 *      — never silently consumed — and is recorded in supervisor_log.
 *
 * The tests in this file run SEQUENTIALLY and share one throwaway DB (a
 * copy of the committed DB) — each `it` is one stage of the same runtime
 * journey. This file uses its own child processes and no HTTP server.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = process.cwd(); // run-tests.mjs and vitest both run from the repo root
const SRC_DB = path.join(ROOT, "state", "coffee_export.db");
const TEST_DB = path.join(ROOT, "state", "test-agent-runtime.db");
const VENV_PYTHON = path.join(ROOT, ".venv", "bin", "python");

/** Create the venv (once) if it is missing so `npm test` is self-sufficient. */
function ensureVenv() {
  if (fs.existsSync(VENV_PYTHON)) return;
  execFileSync("python3", ["-m", "venv", path.join(ROOT, ".venv")], { stdio: "pipe" });
  execFileSync(
    VENV_PYTHON,
    ["-m", "pip", "install", "-q", "-r", path.join(ROOT, "coffee_export", "requirements.txt")],
    { stdio: "pipe", timeout: 300_000 }
  );
}

function freshDb() {
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  fs.copyFileSync(SRC_DB, TEST_DB);
}

function cleanupDb() {
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
}

function runPython(args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync(VENV_PYTHON, args, {
    encoding: "utf-8",
    timeout: 120_000,
    cwd: ROOT,
    env: {
      ...process.env,
      COFFEE_DATABASE_URL: `sqlite:///${TEST_DB}`,
      PYTHONUNBUFFERED: "1",
      ...extraEnv,
    },
  });
}

function runSupervisorOnce(extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, "scripts", "supervisor.js"), "--once"], {
    encoding: "utf-8",
    timeout: 120_000,
    cwd: ROOT,
    env: {
      ...process.env,
      COFFEE_DATABASE_URL: `sqlite:///${TEST_DB}`,
      ...extraEnv,
    },
  });
}

/** Run a query against the throwaway DB (opened per call — no stale handles). */
function q<T = unknown>(sql: string, ...params: unknown[]): T {
  const d = new Database(TEST_DB);
  try {
    return d.prepare(sql).get(...params) as T;
  } finally {
    d.close();
  }
}

function qAll<T = unknown>(sql: string, ...params: unknown[]): T[] {
  const d = new Database(TEST_DB);
  try {
    return d.prepare(sql).all(...params) as T[];
  } finally {
    d.close();
  }
}

interface SeedResult {
  ok: boolean;
  contract_id?: string;
  lead_id?: string;
  lot_id?: string;
  error?: string;
}

/** Seed a signed contract through the REAL Agent 5 path. */
function seedSignedContract(): SeedResult {
  const r = runPython([
    path.join(ROOT, "coffee_export", "scripts", "dev_seed_contract.py"),
    "--organization",
    "org-system",
  ]);
  if (r.status !== 0) {
    throw new Error(`seed failed (${r.status}): ${r.stderr || r.stdout}`);
  }
  return JSON.parse(String(r.stdout).trim().split("\n").pop() || "{}") as SeedResult;
}

/** Seed a DECIDED_APPROVED lead + PENDING SAMPLE_APPROVED (no inline Agent 5). */
function seedPendingSampleApproval(): { ok: boolean; lead_id?: string; lot_id?: string; sample_request_id?: string; error?: string } {
  const r = runPython([
    path.join(ROOT, "coffee_export", "scripts", "dev_seed_contract.py"),
    "--organization",
    "org-system",
    "--no-process",
  ]);
  if (r.status !== 0) {
    throw new Error(`seed --no-process failed (${r.status}): ${r.stderr || r.stdout}`);
  }
  return JSON.parse(String(r.stdout).trim().split("\n").pop() || "{}");
}

/** Insert a bus event the same way the Node API routes do. */
function insertEvent(
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  org: string
): number {
  const d = new Database(TEST_DB);
  try {
    const info = d
      .prepare(
        `INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status, organization_id)
         VALUES (?, ?, ?, ?, 'test@faithel.com', ?, 'pending', ?)`
      )
      .run(eventType, entityType, entityId, JSON.stringify(payload), new Date().toISOString(), org);
    return Number(info.lastInsertRowid);
  } finally {
    d.close();
  }
}

describe("agent runtime — the production event path", () => {
  it(
    "CONTRACT_SIGNED reaches Python Agent 6 through the supervisor runtime",
    { timeout: 180_000 },
    () => {
      ensureVenv();
      freshDb();
      const seed = seedSignedContract();
      expect(seed.ok).toBe(true);
      const contractId = seed.contract_id!;
      expect(contractId).toMatch(/^CT-\d{4}-\d{4}$/);

      // The real Agent 5 path published CONTRACT_SIGNED as pending.
      const pending = qAll<{ id: number; organization_id: string }>(
        `SELECT id, organization_id FROM events WHERE event_type = 'CONTRACT_SIGNED' AND status = 'pending'`
      );
      expect(pending.length).toBe(1);
      expect(pending[0].organization_id).toBe("org-system");

      // ── THE runtime trigger: one supervisor tick ──
      const tick = runSupervisorOnce();
      expect(tick.status).toBe(0);

      // Agent 6 (Python) consumed the event and created the shipment.
      const event = q<{ status: string; consumed_by: string }>(
        `SELECT status, consumed_by FROM events WHERE id = ?`, pending[0].id
      );
      expect(event.status).toBe("consumed");
      expect(event.consumed_by).toBe("Agent 6");

      const shipments = qAll<{ shipment_id: string; contract_id: string; organization_id: string; status: string }>(
        `SELECT shipment_id, contract_id, organization_id, status FROM shipments`
      );
      expect(shipments.length).toBe(1);
      expect(shipments[0].contract_id).toBe(contractId);
      expect(shipments[0].organization_id).toBe("org-system");
      expect(shipments[0].status).toBe("draft");

      // 18-step export checklist seeded on the shipment.
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM logistics_checklist_items WHERE shipment_id = ?`, shipments[0].shipment_id).n).toBe(18);

      // Customs checklist: EU destination requires the EUDR declaration.
      const customs = qAll<{ document_type: string }>(
        `SELECT document_type FROM customs_documents WHERE shipment_id = ?`, shipments[0].shipment_id
      );
      expect(customs.map((c) => c.document_type)).toContain("eudr_declaration");

      // Honest timeline event.
      const timeline = qAll<{ event_type: string }>(
        `SELECT event_type FROM logistics_events WHERE shipment_id = ?`, shipments[0].shipment_id
      );
      expect(timeline.map((t) => t.event_type)).toContain("shipment_created");

      // Nothing was booked (honesty contract: SHIPMENT_BOOKED never published).
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE event_type = 'SHIPMENT_BOOKED'`).n).toBe(0);

      // The informational SHIPMENT_CREATED the agent published was drained
      // by the supervisor (queue hygiene), not left as a fake backlog.
      const created = q<{ status: string; consumed_by: string }>(
        `SELECT status, consumed_by FROM events WHERE event_type = 'SHIPMENT_CREATED'`
      );
      expect(created.status).toBe("consumed");
      expect(created.consumed_by).toBe("supervisor");
    }
  );

  it(
    "CONTRACT_SIGNED redelivery is idempotent through the runtime (no duplicate shipment)",
    { timeout: 180_000 },
    () => {
      const { contract_id: contractId } = q<{ contract_id: string }>(
        `SELECT contract_id FROM shipments LIMIT 1`
      );
      expect(contractId).toBeTruthy();

      insertEvent(
        "CONTRACT_SIGNED",
        "contract",
        contractId,
        { contract_id: contractId, lead_id: "" },
        "org-system"
      );

      const tick = runSupervisorOnce();
      expect(tick.status).toBe(0);

      // NOT 2 shipments / 36 checklist rows / 2 timeline events — replay created nothing.
      expect(qAll<{ shipment_id: string }>(
        `SELECT shipment_id FROM shipments WHERE contract_id = ?`, contractId
      ).length).toBe(1);
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM logistics_checklist_items`).n).toBe(18);
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM logistics_events WHERE event_type = 'shipment_created'`
      ).n).toBe(1);
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM events WHERE event_type = 'SHIPMENT_CREATED'`
      ).n).toBe(1);
    }
  );

  it(
    "cross-org CONTRACT_SIGNED creates nothing (event ownership enforced)",
    { timeout: 180_000 },
    () => {
      const before = q<{ n: number }>(`SELECT COUNT(*) n FROM shipments`).n;
      const { contract_id: contractId } = q<{ contract_id: string }>(
        `SELECT contract_id FROM shipments LIMIT 1`
      );

      // An event OWNED by org-abi pointing at a contract that belongs to
      // org-system: the org-abi-scoped Agent 6 run cannot see the contract.
      const eventId = insertEvent(
        "CONTRACT_SIGNED",
        "contract",
        contractId,
        { contract_id: contractId, lead_id: "" },
        "org-abi-1786882934"
      );

      const tick = runSupervisorOnce();
      expect(tick.status).toBe(0);

      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM shipments`).n).toBe(before);

      const ev = q<{ status: string; consumed_by: string }>(
        `SELECT status, consumed_by FROM events WHERE id = ?`, eventId
      );
      expect(ev.status).toBe("consumed");
      expect(ev.consumed_by).toBe("Agent 6"); // consumed with a logged skip — terminal, honest
    }
  );

  it(
    "SHIPMENT_DELIVERED + CONTRACT_COMPLETED reach Python Agent 7 through the supervisor runtime",
    { timeout: 180_000 },
    () => {
      const shipment = q<{ shipment_id: string; contract_id: string }>(
        `SELECT shipment_id, contract_id FROM shipments LIMIT 1`
      );
      expect(shipment).toBeTruthy();

      // Mark the shipment delivered + contract completed EXACTLY like the
      // Node arrival API route does, then publish the two events it emits.
      const now = new Date().toISOString();
      const d = new Database(TEST_DB);
      try {
        d.prepare(`UPDATE shipments SET status = 'delivered', ata = ?, updated_ts = ? WHERE shipment_id = ?`)
          .run(now, now, shipment.shipment_id);
        d.prepare(`UPDATE contracts SET status = 'completed', updated_ts = ? WHERE contract_id = ?`)
          .run(now, shipment.contract_id);
      } finally {
        d.close();
      }
      insertEvent(
        "SHIPMENT_DELIVERED",
        "shipment",
        shipment.shipment_id,
        { shipment_id: shipment.shipment_id, contract_id: shipment.contract_id, ata: now },
        "org-system"
      );
      insertEvent(
        "CONTRACT_COMPLETED",
        "contract",
        shipment.contract_id,
        { contract_id: shipment.contract_id, shipment_id: shipment.shipment_id, delivered_ts: now },
        "org-system"
      );

      const tick = runSupervisorOnce();
      expect(tick.status).toBe(0);

      // Agent 7 (Python) consumed BOTH events.
      const deliveredEvents = qAll<{ status: string; consumed_by: string }>(
        `SELECT status, consumed_by FROM events WHERE event_type = 'SHIPMENT_DELIVERED'`
      );
      expect(deliveredEvents.length).toBe(1);
      expect(deliveredEvents[0].status).toBe("consumed");
      expect(deliveredEvents[0].consumed_by).toBe("Agent 7");
      const completedEvents = qAll<{ status: string; consumed_by: string }>(
        `SELECT status, consumed_by FROM events WHERE event_type = 'CONTRACT_COMPLETED'`
      );
      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].consumed_by).toBe("Agent 7");

      // Account created for the delivered buyer with ONE follow-up.
      const accounts = qAll<{ account_id: string; lead_id: string; relationship_status: string }>(
        `SELECT account_id, lead_id, relationship_status FROM accounts`
      );
      expect(accounts.length).toBe(1);
      expect(accounts[0].account_id).toMatch(/^ACC-\d{4}-\d{4}$/);
      expect(accounts[0].relationship_status).toBe("active");
      const activities = qAll<{ activity_type: string }>(
        `SELECT activity_type FROM account_activities WHERE account_id = ?`, accounts[0].account_id
      );
      expect(activities.map((a) => a.activity_type)).toContain("delivery_followup");

      // Legal/compliance separation: delivering did NOT clear any customs
      // document (those stay in their own operator/Agent 5 flow).
      const customsStatuses = qAll<{ status: string }>(`SELECT DISTINCT status FROM customs_documents`);
      expect(customsStatuses.every((c) => c.status === "draft")).toBe(true);

      // ── Redelivery: no duplicate follow-up, no duplicate ACCOUNT_CREATED ──
      insertEvent(
        "SHIPMENT_DELIVERED",
        "shipment",
        shipment.shipment_id,
        { shipment_id: shipment.shipment_id, contract_id: shipment.contract_id, ata: now },
        "org-system"
      );
      const tick2 = runSupervisorOnce();
      expect(tick2.status).toBe(0);

      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM account_activities WHERE account_id = ? AND activity_type = 'delivery_followup'`,
        accounts[0].account_id
      ).n).toBe(1); // NOT 2
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM events WHERE event_type = 'ACCOUNT_CREATED'`
      ).n).toBe(1); // NOT 2
    }
  );

  it(
    "Python spawn failure leaves events PENDING and is observable in supervisor_log",
    { timeout: 180_000 },
    () => {
      const before = q<{ n: number }>(`SELECT COUNT(*) n FROM shipments`).n;

      insertEvent(
        "SHIPMENT_DELIVERED",
        "shipment",
        "SH-NOT-REAL-9999",
        { shipment_id: "SH-NOT-REAL-9999", contract_id: "CT-DOES-NOT-EXIST", ata: new Date().toISOString() },
        "org-system"
      );

      // Force a spawn-level failure with a nonexistent interpreter.
      const tick = runSupervisorOnce({ SUPERVISOR_PYTHON_BIN: "/nonexistent/python-binary" });
      expect(tick.status).toBe(0); // the supervisor itself survives

      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM shipments`).n).toBe(before);

      // The event was NOT swallowed — still pending, no consumer.
      const ev = q<{ status: string; consumed_by: string | null }>(
        `SELECT status, consumed_by FROM events WHERE entity_id = 'SH-NOT-REAL-9999' AND event_type = 'SHIPMENT_DELIVERED'`
      );
      expect(ev.status).toBe("pending");
      expect(ev.consumed_by).toBeNull();

      // The failure is observable in supervisor_log.
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM supervisor_log WHERE event_type = 'AGENT_ERROR' AND message LIKE '%Python runtime failed%'`
      ).n).toBeGreaterThan(0);

      cleanupDb();
    }
  );
});

describe("agent runtime — SAMPLE_APPROVED reaches Python Agent 5 (Phase F)", () => {
  it(
    "SAMPLE_APPROVED drafts the contract through the supervisor runtime, idempotently",
    { timeout: 240_000 },
    () => {
      ensureVenv();
      freshDb();

      // 1. Seed a decided lead + a PENDING SAMPLE_APPROVED (no inline Agent 5).
      const seed = seedPendingSampleApproval();
      expect(seed.ok).toBe(true);
      const leadId = seed.lead_id!;

      const pending = qAll<{ id: number; organization_id: string }>(
        `SELECT id, organization_id FROM events WHERE event_type = 'SAMPLE_APPROVED' AND status = 'pending'`
      );
      expect(pending.length).toBe(1);
      expect(pending[0].organization_id).toBe("org-system");

      // 2. One supervisor tick → spawns Python Agent 5 (org-scoped) →
      //    drafts the contract + compliance checklist.
      const tick = runSupervisorOnce();
      expect(tick.status).toBe(0);

      const ev = q<{ status: string; consumed_by: string }>(
        `SELECT status, consumed_by FROM events WHERE id = ?`, pending[0].id
      );
      expect(ev.status).toBe("consumed");
      expect(ev.consumed_by).toBe("Agent 5");

      const contracts = qAll<{ contract_id: string; lead_id: string; status: string; organization_id: string }>(
        `SELECT contract_id, lead_id, status, organization_id FROM contracts WHERE lead_id = ?`, leadId
      );
      expect(contracts.length).toBe(1);
      expect(contracts[0].status).toBe("draft"); // DRAFTED, not signed — signing is a human act
      expect(contracts[0].organization_id).toBe("org-system");

      // Compliance checklist generated for the drafted contract.
      const docs = qAll<{ document_type: string }>(
        `SELECT document_type FROM compliance_documents WHERE contract_id = ?`,
        contracts[0].contract_id
      );
      expect(docs.length).toBeGreaterThan(0);
      expect(docs.map((d) => d.document_type)).toContain("eudr_attestation"); // EU destination

      // The informational CONTRACT_DRAFTED was drained by the supervisor.
      const drafted = q<{ status: string; consumed_by: string }>(
        `SELECT status, consumed_by FROM events WHERE event_type = 'CONTRACT_DRAFTED'`
      );
      expect(drafted.status).toBe("consumed");
      expect(drafted.consumed_by).toBe("supervisor");

      // 3. Redelivery: publish the SAME approval twice more — no second
      //    contract, no second checklist, no second CONTRACT_DRAFTED.
      for (let i = 0; i < 2; i++) {
        insertEvent(
          "SAMPLE_APPROVED",
          "sample_request",
          seed.sample_request_id!,
          {
            sample_request_id: seed.sample_request_id,
            lead_id: leadId,
            lot_id: seed.lot_id || "",
            decision: "approved",
            buyer_target_fob: 4.5,
            buyer_target_volume_bags: 200,
            buyer_target_port: "Hamburg",
            buyer_payment_terms: "LC at sight",
          },
          "org-system"
        );
      }
      const tick2 = runSupervisorOnce();
      expect(tick2.status).toBe(0);

      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM contracts WHERE lead_id = ?`, leadId
      ).n).toBe(1); // NOT 2/3
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM compliance_documents WHERE contract_id = ?`,
        contracts[0].contract_id
      ).n).toBe(docs.length); // unchanged
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM events WHERE event_type = 'CONTRACT_DRAFTED'`
      ).n).toBe(1); // NOT 2/3

      // 4. Cross-org approval: an event OWNED by another org cannot draft
      //    for this org's lead (org-scoped Agent 5 run cannot see the lead).
      const before = q<{ n: number }>(`SELECT COUNT(*) n FROM contracts`).n;
      insertEvent(
        "SAMPLE_APPROVED",
        "sample_request",
        seed.sample_request_id!,
        {
          sample_request_id: seed.sample_request_id,
          lead_id: leadId,
          decision: "approved",
          buyer_target_fob: 4.5,
          buyer_target_volume_bags: 200,
          buyer_target_port: "Hamburg",
        },
        "org-abi-1786882934"
      );
      const tick3 = runSupervisorOnce();
      expect(tick3.status).toBe(0);
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM contracts`).n).toBe(before);

      cleanupDb();
    }
  );
});
