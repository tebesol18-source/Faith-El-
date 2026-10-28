/**
 * Supervisor SOAK test — continuous runtime under load, with the failure
 * modes a production deployment actually meets (Phase F hardening item).
 *
 * What this proves, through the REAL continuous supervisor (not --once):
 *
 *   Stage 1 — LOAD + DUPLICATES:
 *     A continuous supervisor (1s ticks) processes a stream of events
 *     published WHILE it runs — including at-least-once duplicates
 *     (6× CONTRACT_SIGNED across 2 contracts, 3× SHIPMENT_DELIVERED /
 *     CONTRACT_COMPLETED pairs), informational events and a cross-org
 *     event — and lands on EXACTLY-ONCE outcomes for every side effect
 *     (shipments, checklists, accounts, follow-ups). Graceful SIGTERM
 *     stop, no uncaught errors.
 *
 *   Stage 2 — TIMEOUT STORM + RECOVERY:
 *     With SUPERVISOR_PYTHON_TIMEOUT_MS=1 every Python spawn is killed
 *     instantly. Events must stay PENDING (never silently consumed),
 *     failures must be observable in supervisor_log, and the supervisor
 *     must SURVIVE (keep ticking). After a restart with a normal timeout,
 *     everything drains with exactly-once outcomes.
 *
 *   Stage 3 — CRASH (SIGKILL) + STALE-PID TAKEOVER:
 *     The supervisor is SIGKILLed mid-processing (no cleanup). The stale
 *     PID file must be taken over by the next start, and every event
 *     that was in flight lands exactly-once after recovery.
 *
 * The whole file shares ONE throwaway DB; stages run sequentially and
 * build on each other. No HTTP server is involved — this file drives
 * child processes only, like agent-runtime.test.ts.
 */
import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const SRC_DB = path.join(ROOT, "state", "coffee_export.db");
const TEST_DB = path.join(ROOT, "state", "test-supervisor-soak.db");
const PID_FILE = path.join(ROOT, "state", "test-supervisor-soak.pid");
const VENV_PYTHON = path.join(ROOT, ".venv", "bin", "python");
const SUPERVISOR = path.join(ROOT, "scripts", "supervisor.js");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ensureVenv() {
  if (fs.existsSync(VENV_PYTHON)) return;
  spawnSync("python3", ["-m", "venv", path.join(ROOT, ".venv")], { stdio: "pipe" });
  spawnSync(
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
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`, PID_FILE]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
}

function q<T = unknown>(sql: string, ...params: unknown[]): T {
  const d = new Database(TEST_DB);
  try {
    d.pragma("busy_timeout = 5000");
    return d.prepare(sql).get(...params) as T;
  } finally {
    d.close();
  }
}

function qAll<T = unknown>(sql: string, ...params: unknown[]): T[] {
  const d = new Database(TEST_DB);
  try {
    d.pragma("busy_timeout = 5000");
    return d.prepare(sql).all(...params) as T[];
  } finally {
    d.close();
  }
}

function insertEvent(
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  org: string
): number {
  const d = new Database(TEST_DB);
  try {
    d.pragma("busy_timeout = 5000");
    const info = d
      .prepare(
        `INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status, organization_id)
         VALUES (?, ?, ?, ?, 'soak@test', ?, 'pending', ?)`
      )
      .run(eventType, entityType, entityId, JSON.stringify(payload), new Date().toISOString(), org);
    return Number(info.lastInsertRowid);
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

function seedSignedContract(): SeedResult {
  const r = spawnSync(
    VENV_PYTHON,
    [path.join(ROOT, "coffee_export", "scripts", "dev_seed_contract.py"), "--organization", "org-system"],
    {
      encoding: "utf-8",
      timeout: 120_000,
      cwd: ROOT,
      env: {
        ...process.env,
        COFFEE_DATABASE_URL: `sqlite:///${TEST_DB}`,
        PYTHONUNBUFFERED: "1",
      },
    }
  );
  if (r.status !== 0) throw new Error(`seed failed (${r.status}): ${r.stderr || r.stdout}`);
  return JSON.parse(String(r.stdout).trim().split("\n").pop() || "{}") as SeedResult;
}

// ── Continuous supervisor control ──────────────────────────────────────────

interface RunningSupervisor {
  pid: number;
  stdout: () => string;
  isAlive: () => boolean;
  stop: (signal: "SIGTERM" | "SIGKILL") => Promise<void>;
}

function startSupervisor(extraEnv: Record<string, string> = {}): RunningSupervisor {
  const child = spawn(process.execPath, [SUPERVISOR, "--interval", "1"], {
    cwd: ROOT,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      COFFEE_DATABASE_URL: `sqlite:///${TEST_DB}`,
      SUPERVISOR_PID_FILE: PID_FILE,
      PYTHONUNBUFFERED: "1",
      ...extraEnv,
    },
  });
  let out = "";
  child.stdout!.on("data", (c: Buffer) => { out += c.toString(); });
  child.stderr!.on("data", (c: Buffer) => { out += c.toString(); });
  const childPid = child.pid;
  if (childPid === undefined) {
    child.kill("SIGKILL");
    throw new Error("failed to spawn supervisor");
  }
  const isAlive = () => {
    try { process.kill(childPid, 0); return true; } catch { return false; }
  };
  const stop = async (signal: "SIGTERM" | "SIGKILL") => {
    if (!isAlive()) return;
    try {
      // Negative pid = the whole process group (supervisor + any in-flight
      // Python child) — a realistic crash/stop.
      process.kill(-childPid, signal);
    } catch {
      try { child.kill(signal); } catch { /* already gone */ }
    }
    const deadline = Date.now() + 15_000;
    while (isAlive() && Date.now() < deadline) await sleep(200);
    if (isAlive()) {
      try { process.kill(-childPid, "SIGKILL"); } catch { /* gone */ }
      while (isAlive() && Date.now() < deadline + 5_000) await sleep(200);
    }
  };
  return { pid: childPid, stdout: () => out, isAlive, stop };
}

/** Poll until the predicate holds (on the shared throwaway DB). */
async function waitFor(what: string, pred: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return;
    await sleep(500);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

/** No pending, non-informational events left (the queue is drained). */
function queueDrained(): boolean {
  return q<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE status = 'pending'`).n === 0;
}

/** Publish the two events the Node arrival API emits for a delivery. */
function publishDelivery(shipmentId: string, contractId: string) {
  const now = new Date().toISOString();
  insertEvent("SHIPMENT_DELIVERED", "shipment", shipmentId,
    { shipment_id: shipmentId, contract_id: contractId, ata: now }, "org-system");
  insertEvent("CONTRACT_COMPLETED", "contract", contractId,
    { contract_id: contractId, shipment_id: shipmentId, delivered_ts: now }, "org-system");
}

describe("supervisor soak — continuous runtime under load", () => {
  it(
    "stage 1: load with duplicates drains to exactly-once outcomes (graceful stop)",
    { timeout: 300_000 },
    async () => {
      ensureVenv();
      freshDb();

      // Two REAL signed contracts (the production CONTRACT_SIGNED source).
      const seed1 = seedSignedContract();
      const seed2 = seedSignedContract();
      expect(seed1.ok && seed2.ok).toBe(true);
      const c1 = seed1.contract_id!;
      const c2 = seed2.contract_id!;

      // ── Start the continuous supervisor, then publish load WHILE it runs.
      const sup = startSupervisor();

      // Duplicate CONTRACT_SIGNED (3× each contract) + informational noise
      // + one cross-org event. This is the at-least-once redelivery storm.
      for (const cid of [c1, c2]) {
        for (let i = 0; i < 3; i++) {
          insertEvent("CONTRACT_SIGNED", "contract", cid,
            { contract_id: cid, lead_id: "" }, "org-system");
        }
      }
      insertEvent("SHIPMENT_CREATED", "shipment", "SH-NOISE-1", {}, "org-system");
      insertEvent("ACCOUNT_CREATED", "account", "ACC-NOISE-1", {}, "org-system");
      insertEvent("CONTRACT_SIGNED", "contract", c1,
        { contract_id: c1, lead_id: "" }, "org-abi-1786882934");

      await waitFor("duplicate CONTRACT_SIGNED batch drained", queueDrained, 120_000);

      // Deliver BOTH shipments (3× redelivery each) — what the arrival API
      // publishes, replayed.
      const shipments = qAll<{ shipment_id: string; contract_id: string }>(
        `SELECT shipment_id, contract_id FROM shipments WHERE contract_id IN (?, ?)`, c1, c2
      );
      expect(shipments.length).toBe(2);
      for (const s of shipments) {
        // The delivery state must exist before Agent 7's follow-up is honest.
        const now = new Date().toISOString();
        const d = new Database(TEST_DB);
        try {
          d.pragma("busy_timeout = 5000");
          d.prepare(`UPDATE shipments SET status = 'delivered', ata = ?, updated_ts = ? WHERE shipment_id = ?`)
            .run(now, now, s.shipment_id);
          d.prepare(`UPDATE contracts SET status = 'completed', updated_ts = ? WHERE contract_id = ?`)
            .run(now, s.contract_id);
        } finally {
          d.close();
        }
        for (let i = 0; i < 3; i++) publishDelivery(s.shipment_id, s.contract_id);
      }

      await waitFor("delivery events drained", queueDrained, 120_000);

      // Graceful stop.
      await sup.stop("SIGTERM");
      expect(sup.isAlive()).toBe(false);

      // ── EXACTLY-ONCE invariants after the whole storm ──
      // 2 shipments (one per contract), never 2× or 3× despite duplicates.
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM shipments`).n).toBe(2);
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM logistics_checklist_items`
      ).n).toBe(36); // 18 steps × 2 shipments
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM logistics_events WHERE event_type = 'shipment_created'`
      ).n).toBe(2);

      // 2 accounts (one per lead), each with exactly ONE delivery follow-up.
      const accounts = qAll<{ account_id: string; lead_id: string }>(
        `SELECT account_id, lead_id FROM accounts`
      );
      expect(accounts.length).toBe(2);
      for (const acc of accounts) {
        expect(q<{ n: number }>(
          `SELECT COUNT(*) n FROM account_activities WHERE account_id = ? AND activity_type = 'delivery_followup'`,
          acc.account_id
        ).n).toBe(1);
      }
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM events WHERE event_type = 'ACCOUNT_CREATED' AND status = 'consumed' AND entity_id != 'ACC-NOISE-1'`
      ).n).toBe(2); // the real accounts only — the noise row is drained separately

      // Queue hygiene: nothing pending, nothing dead-lettered by the storm.
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE status = 'pending'`).n).toBe(0);
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE status = 'dead_letter'`).n).toBe(0);

      // Supervisor survived the whole run without fatal errors.
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM supervisor_log WHERE event_type = 'SUPERVISOR_ERROR'`
      ).n).toBe(0);
      // And it logged its lifecycle honestly.
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM supervisor_log WHERE event_type IN ('SUPERVISOR_START', 'SUPERVISOR_STOP')`
      ).n).toBeGreaterThanOrEqual(2);
    }
  );

  it(
    "stage 2: timeout storm keeps events pending + observable; restart drains them",
    { timeout: 300_000 },
    async () => {
      const c1 = q<{ contract_id: string }>(
        `SELECT contract_id FROM shipments LIMIT 1`
      )!.contract_id;

      // A fresh duplicate batch to process.
      for (let i = 0; i < 4; i++) {
        insertEvent("CONTRACT_SIGNED", "contract", c1,
          { contract_id: c1, lead_id: "" }, "org-system");
      }

      // ── TIMEOUT STORM: every Python run is killed after 1ms. ──
      const storm = startSupervisor({ SUPERVISOR_PYTHON_TIMEOUT_MS: "1" });

      // A few ticks must pass (the supervisor keeps running, each tick
      // failing the spawn and logging it).
      await waitFor("≥3 ticks under the timeout storm", () => {
        const ticks = (storm.stdout().match(/Tick #/g) || []).length;
        return ticks >= 3;
      }, 60_000);

      // The supervisor is STILL ALIVE — the storm cannot kill it.
      expect(storm.isAlive()).toBe(true);

      // Events were NOT silently consumed — all still pending.
      const stormEvents = qAll<{ id: number; status: string }>(
        `SELECT id, status FROM events WHERE event_type = 'CONTRACT_SIGNED' AND status IN ('pending', 'failed', 'dead_letter')`
      );
      expect(stormEvents.length).toBe(4);
      expect(stormEvents.every((e) => e.status === "pending")).toBe(true);

      // The failures are observable.
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM supervisor_log WHERE event_type = 'AGENT_ERROR' AND message LIKE '%killed%'`
      ).n).toBeGreaterThanOrEqual(3);

      await storm.stop("SIGTERM");
      expect(storm.isAlive()).toBe(false);

      // ── RECOVERY: restart with a normal timeout. ──
      const sup = startSupervisor();
      await waitFor("storm backlog drained after recovery", queueDrained, 120_000);
      await sup.stop("SIGTERM");

      // Exactly-once held: still 2 shipments (replays created nothing).
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM shipments`).n).toBe(2);
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM logistics_checklist_items`).n).toBe(36);
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE status = 'pending'`).n).toBe(0);
    }
  );

  it(
    "stage 3: SIGKILL crash mid-processing — stale PID takeover + exactly-once recovery",
    { timeout: 300_000 },
    async () => {
      const shipments = qAll<{ shipment_id: string; contract_id: string }>(
        `SELECT shipment_id, contract_id FROM shipments`
      );
      expect(shipments.length).toBe(2);

      // A mid-flight batch: duplicate deliveries (idempotent replays) plus
      // duplicate CONTRACT_SIGNED — enough work that the kill will land
      // during a Python run, or between runs. Either way is safe; this
      // test proves it.
      for (const s of shipments) {
        for (let i = 0; i < 2; i++) publishDelivery(s.shipment_id, s.contract_id);
      }
      const c1 = shipments[0].contract_id;
      for (let i = 0; i < 2; i++) {
        insertEvent("CONTRACT_SIGNED", "contract", c1,
          { contract_id: c1, lead_id: "" }, "org-system");
      }

      const sup = startSupervisor();
      // Let the first tick start processing (~one Python spawn in flight),
      // then hard-kill the whole process group — no cleanup, no shutdown.
      await sleep(1500);
      await sup.stop("SIGKILL");
      expect(sup.isAlive()).toBe(false);

      // The PID file was NOT cleaned up (SIGKILL ran no exit handler) —
      // the next start must take it over, not refuse to run.
      expect(fs.existsSync(PID_FILE)).toBe(true);

      // ── RECOVERY ──
      const revived = startSupervisor();
      // The takeover is observable in the log output.
      await waitFor("stale PID takeover logged", () =>
        revived.stdout().includes("Stale PID file found"), 30_000);
      await waitFor("crash backlog drained", queueDrained, 120_000);
      await revived.stop("SIGTERM");

      // Exactly-once held across the crash:
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM shipments`).n).toBe(2);
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM logistics_checklist_items`).n).toBe(36);
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM account_activities WHERE activity_type = 'delivery_followup'`
      ).n).toBe(2); // one per shipment — replays after the crash added nothing
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE status = 'pending'`).n).toBe(0);
      expect(q<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE status = 'dead_letter'`).n).toBe(0);

      // No supervisor-level fatal errors across the entire soak.
      expect(q<{ n: number }>(
        `SELECT COUNT(*) n FROM supervisor_log WHERE event_type = 'SUPERVISOR_ERROR'`
      ).n).toBe(0);

      cleanupDb();
    }
  );
});
