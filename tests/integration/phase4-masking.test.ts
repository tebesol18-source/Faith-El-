/**
 * Phase 4 integration — buyer identity masking, end-to-end.
 *
 * Spawns the REAL Python email bridge (uvicorn, dry-run provider — no
 * RESEND_API_KEY, nothing is actually delivered) against the SAME throwaway
 * database the isolated Next.js test server uses, then verifies:
 *
 *   1. COMPOSE: POST /api/inbox with leadId only (no buyer address in the
 *      client payload) → 200 + buyer_alias; NO real buyer address anywhere
 *      in the API response.
 *   2. LEAK: GET /api/inbox returns only the alias — the lead's real contact
 *      address (served by the CRM endpoint /api/leads, which is in scope)
 *      never appears in any messaging payload.
 *   3. ROUND-TRIP: a Svix-SIGNED inbound webhook from the buyer's REAL
 *      address (delivered directly to the bridge, like Resend would) is
 *      routed back to the thread and stored/displayed under the ALIAS, with
 *      the real address redacted from body and raw payload.
 *   4. CROSS-TENANT: composing to another org's lead → 404 (fail closed).
 *   5. REVOCATION: after the mask is revoked, outbound compose → refused
 *      (403) and inbound from that buyer → rejected.
 *
 * Requires the hermetic runner (scripts/run-tests.mjs) environment:
 * TEST_BASE_URL + DATABASE_PATH point at the isolated server/DB, and
 * EMAIL_BRIDGE_URL (from .env) must be http://localhost:8000 — the bridge is
 * spawned on that port. If a bridge is already running there, the file
 * skips (its secrets would not match this test's).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAdminClient } from "./helpers";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const BRIDGE_PORT = Number(new URL(process.env.EMAIL_BRIDGE_URL || "http://localhost:8000").port || 8000);
const BRIDGE_URL = `http://localhost:${BRIDGE_PORT}`;
const TEST_DB_PATH = path.resolve(process.cwd(), process.env.DATABASE_PATH || "state/coffee_export.db");
const WEBHOOK_SECRET = "phase4-test-webhook-secret";
const MASK_SECRET = "phase4-test-mask-secret";
const REPO_ROOT = process.cwd(); // run-tests.mjs and vitest both run from the repo root

/** Read EMAIL_BRIDGE_SECRET from the repo .env (the Next server booted with it). */
function readBridgeSecretFromEnvFile(): string {
  try {
    const envFile = fs.readFileSync(path.join(REPO_ROOT, ".env"), "utf-8");
    const m = envFile.match(/^EMAIL_BRIDGE_SECRET=(.+)$/m);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

/** Real Resend/Svix webhook headers for a payload (same scheme as the Python tests). */
function svixHeaders(rawBody: string, msgId: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const signed = `${msgId}.${ts}.${rawBody}`;
  const sig = createHmac("sha256", Buffer.from(WEBHOOK_SECRET, "utf-8"))
    .update(signed, "utf-8")
    .digest("base64");
  return {
    "svix-id": msgId,
    "svix-timestamp": String(ts),
    "svix-signature": `t=${ts},v1=${sig}`,
    "Content-Type": "application/json",
  };
}

const serverAvailable = await (async () => {
  try {
    const r = await fetch(`${BASE_URL}/api`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 401 || r.status === 404;
  } catch {
    return false;
  }
})();
const itOrSkip = serverAvailable ? it : it.skip;

let bridge: ChildProcess | null = null;
let bridgeReady = false;
let admin: Awaited<ReturnType<typeof getAdminClient>> | null = null;

// The lead under test: the committed DB carries the Phase 3 Falcon lead with
// one VERIFIED contact. Its real address is the leak sentinel.
let falconLeadId = "";
let falconRealEmail = "";
let buyerAlias = "";
let maskedFrom = "";
let threadId = "";

async function startBridge(): Promise<void> {
  // If something is already listening (a developer bridge with different
  // secrets), do not fight it — skip the file.
  try {
    const r = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(1000) });
    if (r.ok) {
      console.warn(`[phase4-masking] a bridge is already running on :${BRIDGE_PORT} — skipping (secrets would not match)`);
      return;
    }
  } catch {
    /* port free — spawn ours */
  }

  const bridgeSecret = readBridgeSecretFromEnvFile();
  if (!bridgeSecret) throw new Error("EMAIL_BRIDGE_SECRET missing from .env — cannot authenticate the bridge");

  const py = path.join(REPO_ROOT, ".venv", "bin", "python");
  bridge = spawn(py, ["-m", "uvicorn", "coffee_export.messaging.webhook:app", "--host", "127.0.0.1", "--port", String(BRIDGE_PORT)], {
    cwd: path.join(REPO_ROOT, "coffee_export"),
    env: {
      ...process.env,
      COFFEE_DATABASE_URL: `sqlite:///${TEST_DB_PATH}`,
      BUYER_MASK_SECRET: MASK_SECRET,
      RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
      EMAIL_BRIDGE_SECRET: bridgeSecret,
      INBOUND_EMAIL_DOMAIN: "faithelexport.com",
      // RESEND_API_KEY deliberately absent → provider stays in honest DRY-RUN.
      EMAIL_ALLOW_UNSIGNED_WEBHOOKS: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  bridge.stderr?.on("data", (d: Buffer) => {
    const s = d.toString();
    if (/error|traceback/i.test(s)) console.error("[bridge]", s.trim().slice(0, 400));
  });

  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) {
        bridgeReady = true;
        return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error("bridge did not become healthy within 20s");
}

beforeAll(async () => {
  if (!serverAvailable) return;
  await startBridge();
  admin = await getAdminClient();

  // Find the Falcon lead + its verified contact (the CRM endpoint serves the
  // real address — Phase 1 domain; here it is only the leak SENTINEL).
  const r = await admin.fetch("/api/leads?limit=100");
  const d = await r.json();
  const lead = (d.leads || []).find((l: any) => (l.verifiedContactCount || 0) > 0 && l.primaryContact?.email);
  if (!lead) throw new Error("no lead with a verified contact in the test DB — expected the Falcon lead");
  falconLeadId = lead.id;
  falconRealEmail = String(lead.primaryContact.email).toLowerCase();
}, 60_000);

afterAll(() => {
  if (bridge && bridgeReady) {
    try {
      bridge.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
});

describe("Phase 4 — buyer email masking (compose, leak, round-trip, tenant, revocation)", () => {
  itOrSkip("compose with leadId only: alias assigned, no real address in the response", async () => {
    expect(bridgeReady).toBe(true);
    const r = await admin!.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({
        leadId: falconLeadId,
        subject: "Phase 4 masked first contact",
        bodyText: "Integration test — dry-run outreach from the masked compose flow.",
      }),
    });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.dry_run).toBe(true); // no RESEND_API_KEY on the spawned bridge
    expect(d.buyer_alias).toMatch(/^buyer\.[0-9a-f]{12}@faithelexport\.com$/);
    expect(d.masked_from).toMatch(/@faithelexport\.com$/);
    buyerAlias = d.buyer_alias;
    maskedFrom = d.masked_from;
    threadId = d.thread_id;
    // The leak sentinel: the real contact address must not be echoed anywhere.
    expect(JSON.stringify(d)).not.toContain(falconRealEmail);
    expect(JSON.stringify(d)).not.toContain(falconRealEmail.split("@")[1]);
  });

  itOrSkip("GET /api/inbox carries the alias and never the real buyer address", async () => {
    const r = await admin!.fetch("/api/inbox");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    const conv = (d.conversations || []).find((c: any) => c.threadId === threadId);
    expect(conv).toBeTruthy();
    expect(conv.buyerAlias).toBe(buyerAlias);
    expect(conv.buyer).toBe(buyerAlias.split("@")[0] + "@");
    // Whole-payload leak scan (conversations + messages): neither the full
    // real address nor its domain may appear anywhere in the payload.
    const whole = JSON.stringify(d);
    expect(whole).not.toContain(falconRealEmail);
    expect(whole).not.toContain(`@${falconRealEmail.split("@")[1]}`);
  });

  itOrSkip("round-trip: signed inbound webhook from the buyer's real address routes back under the alias", async () => {
    // Buyer replies from their REAL address, quoting it in the signature —
    // exactly what a real mail client does. Delivered to the bridge with a
    // valid Svix signature (like Resend would).
    const body = `Hello,\n\nWe would like 320 bags of Guji. Please send cupping scores.\n\nBest,\nMatt\n${falconRealEmail}\n`;
    const payload = {
      data: {
        from: `Matt <${falconRealEmail}>`,
        to: [maskedFrom],
        subject: "Re: Phase 4 masked first contact",
        text: body,
        message_id: `phase4-inbound-${Date.now()}`,
      },
    };
    const raw = JSON.stringify(payload);
    const r = await fetch(`${BRIDGE_URL}/webhooks/email/inbound`, {
      method: "POST",
      headers: svixHeaders(raw, `msg_${Date.now()}`),
      body: raw,
    });
    expect(r.status).toBe(200); // received
    const d = await r.json();
    expect(d.action).toBe("received");
    expect(d.buyer_alias).toBe(buyerAlias);
    expect(JSON.stringify(d)).not.toContain(falconRealEmail);

    // The message appears in the exporter's inbox under the ALIAS.
    const r2 = await admin!.fetch(`/api/inbox?threadId=${threadId}`);
    const d2 = await r2.json();
    expect(d2.ok).toBe(true);
    const inbound = (d2.messages || []).find((m: any) => m.direction === "inbound");
    expect(inbound).toBeTruthy();
    expect(inbound.from).toBe(buyerAlias.split("@")[0] + "@");
    // Redaction reached the stored body: the signature address is the alias.
    expect(inbound.body).toContain(buyerAlias);
    const whole = JSON.stringify(d2);
    expect(whole).not.toContain(falconRealEmail);
    expect(whole).not.toContain(`@${falconRealEmail.split("@")[1]}`);
  });

  itOrSkip("cross-tenant compose refused (another org's lead is invisible)", async () => {
    // Insert an org-B lead + contact directly into the throwaway DB (this is
    // the hermetic copy — the committed DB is never touched).
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(TEST_DB_PATH);
    try {
      const now = new Date().toISOString();
      const leadId = `L-TEST-ORG-B-${Date.now()}`;
      db.prepare(
        `INSERT INTO leads (lead_id, company_name, headquarters_country, current_state, priority_tier,
           outreach_language, organization_id, created_ts, updated_ts)
         VALUES (?, 'Org B Lead', 'IT', 'NEW', 'A', 'EN', 'org-test-b', ?, ?)`
      ).run(leadId, now, now);
      const r = await admin!.fetch("/api/inbox", {
        method: "POST",
        body: JSON.stringify({
          leadId,
          subject: "cross-tenant attempt",
          bodyText: "must be refused",
        }),
      });
      expect(r.status).toBe(404); // tenant fail-closed — "Lead not found"
      const d = await r.json();
      expect(d.ok).toBe(false);
    } finally {
      db.close();
    }
  });

  itOrSkip("revoked mask blocks BOTH directions", async () => {
    // Revoke the mask created by the compose test.
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(TEST_DB_PATH);
    try {
      const res = db
        .prepare("UPDATE buyer_masks SET status='revoked', revoked_ts=?, revoke_reason='integration test' WHERE alias_address=?")
        .run(new Date().toISOString(), buyerAlias);
      expect(res.changes).toBe(1);
    } finally {
      db.close();
    }

    // Outbound: compose to the same lead → refused with the revocation reason.
    const r = await admin!.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({
        leadId: falconLeadId,
        subject: "after revocation",
        bodyText: "must be refused",
      }),
    });
    expect(r.status).toBe(403);
    const d = await r.json();
    expect(d.ok).toBe(false);
    expect(String(d.error)).toMatch(/revoked/);
    expect(JSON.stringify(d)).not.toContain(falconRealEmail);

    // Inbound: the revoked buyer's reply is rejected (acknowledged, not routed).
    const payload = {
      data: {
        from: falconRealEmail,
        to: [maskedFrom],
        subject: "Re: after revocation",
        text: "still there?",
        message_id: `phase4-revoked-${Date.now()}`,
      },
    };
    const raw = JSON.stringify(payload);
    const r2 = await fetch(`${BRIDGE_URL}/webhooks/email/inbound`, {
      method: "POST",
      headers: svixHeaders(raw, `msg_revoked_${Date.now()}`),
      body: raw,
    });
    expect(r2.status).toBe(202); // rejected ≠ 500: acknowledged, not retryable
    const d2 = await r2.json();
    expect(d2.action).toBe("rejected");
    expect(String(d2.reason)).toMatch(/revoked/);
    expect(JSON.stringify(d2)).not.toContain(falconRealEmail);
  });
});
