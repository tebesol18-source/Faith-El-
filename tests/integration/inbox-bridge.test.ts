/**
 * Phase 2 integration tests — inbox → email-bridge contract.
 *
 * Full chain against the isolated test server (scripts/run-tests.mjs):
 * a STUB bridge is started on the default EMAIL_BRIDGE_URL port (8000) that
 * records every request and replies with scripted (clearly-labeled dry-run)
 * responses. This proves the Next.js routing/tenant/fiction/error contracts —
 * it does NOT prove real external delivery (mocked provider by design).
 *
 *   1. New conversation (leadId + buyerEmail) → bridge /api/bridge/send with
 *      the session's org attributed; dry-run relayed honestly.
 *   2. Fictional buyer emails (reserved domains) are refused before the bridge.
 *   3. Cross-org lead ids fail closed (404, bridge never called).
 *   4. Reply by messageId → bridge /api/bridge/reply (proper threading path).
 *   5. Reply IDOR across orgs → 404; replying to an outbound message → 422.
 *   6. Legacy threadId mode still works.
 *   7. Bridge failures are surfaced honestly (502, sent:false, error) —
 *      never shown as sent.
 *   8. GET /api/inbox exposes messageId + dryRun; no operator real-email leak.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { getWritableDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createTestClient } from "./helpers";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

const serverAvailable = await (async () => {
  try {
    const r = await fetch(`${BASE_URL}/api`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 401 || r.status === 404;
  } catch {
    return false;
  }
})();

const itOrSkip = serverAvailable ? it : it.skip;

const ORG_A = "org-inbox-a";
const ORG_B = "org-inbox-b";
const NOW = "2026-09-28T10:00:00+03:00";

// ── Stub bridge (records requests; scripted responses) ──────────────────────

type RecordedRequest = { path: string; body: any; authorization?: string };
const recorded: RecordedRequest[] = [];
let stubServer: http.Server | null = null;
let stubPort = 8000;

function startStubBridge(): Promise<void> {
  return new Promise((resolve, reject) => {
    stubServer = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let body: any = {};
        try { body = JSON.parse(raw || "{}"); } catch { /* keep {} */ }
        recorded.push({ path: req.url || "", body, authorization: req.headers.authorization as string | undefined });

        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/bridge/send" && body.subject === "FORCE_BRIDGE_FAILURE") {
          res.statusCode = 502;
          res.end(JSON.stringify({ ok: false, action: "send_failed", error: "Resend API error: HTTP 422 invalid_to_address", dry_run: false }));
          return;
        }
        if (req.url === "/api/bridge/send") {
          res.statusCode = 200;
          res.end(JSON.stringify({
            ok: true, action: "sent", message_id: 4242, thread_id: "T-TEST-00001",
            masked_from: "intake.a@faithelexport.com", provider_message_id: "dry-run-stub-0001", dry_run: true,
          }));
          return;
        }
        if (req.url === "/api/bridge/reply") {
          res.statusCode = 200;
          res.end(JSON.stringify({
            ok: true, action: "replied", outbound_message_id: 5252,
            in_reply_to_message_id: body.message_id, thread_id: "T-TEST-00001", dry_run: true,
          }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: "stub: unknown route" }));
      });
    });
    stubServer.on("error", (e: NodeJS.ErrnoException) => reject(e));
    stubServer.listen(8000, "127.0.0.1", () => {
      stubPort = (stubServer!.address() as AddressInfo).port;
      resolve();
    });
  });
}

function stopStubBridge(): Promise<void> {
  return new Promise((resolve) => {
    if (!stubServer) return resolve();
    stubServer.close(() => resolve());
  });
}

const sendCalls = () => recorded.filter((r) => r.path === "/api/bridge/send");
const replyCalls = () => recorded.filter((r) => r.path === "/api/bridge/reply");

// ── Test fixture ────────────────────────────────────────────────────────────

describe("Phase 2 — inbox → email bridge contract (stubbed provider)", () => {
  let clientA: Awaited<ReturnType<typeof createTestClient>>;
  let clientB: Awaited<ReturnType<typeof createTestClient>>;
  let leadIdA = "";
  let leadIdB = "";
  let inboundMessageId = 0;
  let outboundMessageId = 0;
  let threadIdA = "";
  let threadIdB = "";

  beforeAll(async () => {
    // 1. Stub bridge on the port the Next.js server expects (EMAIL_BRIDGE_URL
    //    default http://localhost:8000). If a real bridge is running there,
    //    fail loudly rather than testing against an unknown service.
    try {
      await startStubBridge();
    } catch (e: any) {
      if (e?.code === "EADDRINUSE") {
        throw new Error(
          "Port 8000 is already in use — a real email bridge may be running. " +
          "Stop it (or set EMAIL_BRIDGE_URL for the test server) so the stub can bind."
        );
      }
      throw e;
    }

    // 2. Orgs + operators (direct DB writes on the throwaway DB)
    const db = getWritableDb();
    try {
      for (const org of [ORG_A, ORG_B]) {
        db.prepare("INSERT OR IGNORE INTO organizations (organization_id, name, status, created_ts, updated_ts) VALUES (?, ?, 'active', ?, ?)")
          .run(org, `Inbox Test ${org}`, NOW, NOW);
      }
      const pass = hashPassword("inboxtest123");
      db.prepare(`INSERT OR IGNORE INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts, organization_id)
        VALUES ('op-inbox-a', 'Inbox Person A', 'inbox-a@test.com', 'operator', 'active', ?, 0, ?, ?, ?)`)
        .run(pass, NOW, NOW, ORG_A);
      db.prepare(`INSERT OR IGNORE INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts, organization_id)
        VALUES ('op-inbox-b', 'Inbox Person B', 'inbox-b@test.com', 'operator', 'active', ?, 0, ?, ?, ?)`)
        .run(pass, NOW, NOW, ORG_B);

      // Leads (one per org) with a real-looking buyer contact
      leadIdA = "L-ITEST-A";
      leadIdB = "L-ITEST-B";
      for (const [leadId, org, company] of [[leadIdA, ORG_A, "Inbox Bridge Buyer A"], [leadIdB, ORG_B, "Inbox Bridge Buyer B"]] as const) {
        db.prepare(`INSERT OR IGNORE INTO leads (lead_id, company_name, headquarters_country, organization_id, current_state, current_agent, outreach_language, sequence_step, substitute_round, ghosted_count, verification_status, created_ts, updated_ts)
          VALUES (?, ?, 'DE', ?, 'NEW', 'Agent 2', 'EN', 0, 0, 0, 'unverified', ?, ?)`)
          .run(leadId, company, org, NOW, NOW);
      }
      db.prepare(`INSERT OR IGNORE INTO lead_contacts (lead_id, name, title, email, is_primary, is_buyer, verification_status, organization_id, created_ts, updated_ts)
        VALUES (?, 'Real Buyer', 'Head of Coffee', 'real.buyer@genuine-importer-check.com', 1, 1, 'unverified', ?, ?, ?)`)
        .run(leadIdA, ORG_A, NOW, NOW);

      // Messaging fixture for reply-mode tests: inbox + threads + messages
      db.prepare(`INSERT OR IGNORE INTO exporter_inboxes (id, operator_id, masked_email, display_name, real_email, is_active, organization_id, created_ts, updated_ts)
        VALUES (9101, 'op-inbox-a', 'inbox.person.a@faithelexport.com', 'Inbox Person A', 'inbox-a@test.com', 1, ?, ?, ?)`)
        .run(ORG_A, NOW, NOW);
      db.prepare(`INSERT OR IGNORE INTO exporter_inboxes (id, operator_id, masked_email, display_name, real_email, is_active, organization_id, created_ts, updated_ts)
        VALUES (9102, 'op-inbox-b', 'inbox.person.b@faithelexport.com', 'Inbox Person B', 'inbox-b@test.com', 1, ?, ?, ?)`)
        .run(ORG_B, NOW, NOW);

      threadIdA = "T-ITEST-00001";
      threadIdB = "T-ITEST-00002";
      db.prepare(`INSERT OR IGNORE INTO message_threads (thread_id, lead_id, inbox_id, buyer_email, subject, status, message_count, unread_count, organization_id, created_ts, updated_ts)
        VALUES (?, ?, 9101, 'real.buyer@genuine-importer-check.com', 'Ethiopian 25/26 — first contact', 'awaiting_exporter', 2, 1, ?, ?, ?)`)
        .run(threadIdA, leadIdA, ORG_A, NOW, NOW);
      db.prepare(`INSERT OR IGNORE INTO message_threads (thread_id, lead_id, inbox_id, buyer_email, subject, status, message_count, unread_count, organization_id, created_ts, updated_ts)
        VALUES (?, ?, 9102, 'buyer.b@genuine-other-coffee.com', 'Org B private thread', 'awaiting_exporter', 1, 1, ?, ?, ?)`)
        .run(threadIdB, leadIdB, ORG_B, NOW, NOW);

      const inbound = db.prepare(`INSERT INTO inbox_messages (thread_id, direction, from_addr, to_addr, reply_to, subject, body_text, provider, provider_message_id, in_reply_to, ai_processed, is_read, status, organization_id, received_ts, created_ts, updated_ts)
        VALUES (?, 'inbound', 'real.buyer@genuine-importer-check.com', 'inbox.person.a@faithelexport.com', 'real.buyer@genuine-importer-check.com', 'Re: Ethiopian 25/26 — first contact', 'Please send cupping scores.', 'resend', 'resend-in-stub-1', NULL, 0, 0, 'new', ?, ?, ?, ?)`)
        .run(threadIdA, ORG_A, NOW, NOW, NOW);
      inboundMessageId = Number(inbound.lastInsertRowid);

      const outbound = db.prepare(`INSERT INTO inbox_messages (thread_id, direction, from_addr, to_addr, reply_to, subject, body_text, provider, provider_message_id, in_reply_to, ai_processed, is_read, status, organization_id, sent_ts, created_ts, updated_ts)
        VALUES (?, 'outbound', 'inbox.person.a@faithelexport.com', 'real.buyer@genuine-importer-check.com', 'inbox.person.a@faithelexport.com', 'Ethiopian 25/26 — first contact', 'Initial outreach.', 'resend', 'dry-run-stub-0000', NULL, 0, 1, 'read', ?, ?, ?, ?)`)
        .run(threadIdA, ORG_A, NOW, NOW, NOW);
      outboundMessageId = Number(outbound.lastInsertRowid);
    } finally {
      db.close();
    }

    clientA = await createTestClient("inbox-a@test.com", "inboxtest123", "172.0.0.1");
    clientB = await createTestClient("inbox-b@test.com", "inboxtest123", "172.0.0.2");
  }, 30000);

  afterAll(async () => {
    await stopStubBridge();
    const db = getWritableDb();
    try {
      db.prepare("DELETE FROM inbox_messages WHERE thread_id IN (?, ?)").run(threadIdA, threadIdB);
      db.prepare("DELETE FROM message_threads WHERE thread_id IN (?, ?)").run(threadIdA, threadIdB);
      db.prepare("DELETE FROM exporter_inboxes WHERE id IN (9101, 9102)").run();
      db.prepare("DELETE FROM lead_contacts WHERE lead_id = ?").run(leadIdA);
      db.prepare("DELETE FROM leads WHERE lead_id IN (?, ?)").run(leadIdA, leadIdB);
      db.prepare("DELETE FROM operators WHERE operator_id IN ('op-inbox-a', 'op-inbox-b')").run();
      db.prepare("DELETE FROM organizations WHERE organization_id IN (?, ?)").run(ORG_A, ORG_B);
    } finally {
      db.close();
    }
  });

  // ── 1. New conversation ─────────────────────────────────────────────
  itOrSkip("new conversation goes through the bridge with org attribution + honest dry-run", async () => {
    const before = sendCalls().length;
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({
        leadId: leadIdA,
        buyerEmail: "real.buyer@genuine-importer-check.com",
        subject: "Introduction — Ethiopian 25/26 crop",
        bodyText: "Hello, we have new lots available.",
      }),
    });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.ok).toBe(true);
    expect(data.sent).toBe(true);
    expect(data.dry_run).toBe(true); // stub is clearly-labeled dry-run — never presented as real delivery

    expect(sendCalls().length).toBe(before + 1);
    const call = sendCalls()[sendCalls().length - 1];
    expect(call.body.lead_id).toBe(leadIdA);
    expect(call.body.buyer_email).toBe("real.buyer@genuine-importer-check.com");
    expect(call.body.organization_id).toBe(ORG_A); // session org attributed
    expect(call.body.operator_id).toBe("op-inbox-a");
    expect(call.body.operator_name).toBe("Inbox Person A"); // drives the masked local part
    // If a bridge secret is configured, it must be a Bearer; never a raw secret in the body
    if (call.authorization !== undefined) {
      expect(call.authorization.startsWith("Bearer ")).toBe(true);
    }
    expect(JSON.stringify(call.body)).not.toContain("inbox-a@test.com"); // no real email forwarded
  }, 20000);

  itOrSkip("fictional buyer email is refused before the bridge (no send)", async () => {
    const before = sendCalls().length;
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ leadId: leadIdA, buyerEmail: "buyer@example.com", bodyText: "hello" }),
    });
    expect(r.status).toBe(422);
    const data = await r.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain("reserved/test domain");
    expect(sendCalls().length).toBe(before); // bridge never called
  }, 20000);

  itOrSkip("cross-org lead id fails closed (404, bridge never called)", async () => {
    const before = sendCalls().length;
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ leadId: leadIdB, buyerEmail: "buyer.b@genuine-other-coffee.com", bodyText: "hello" }),
    });
    expect(r.status).toBe(404);
    expect(sendCalls().length).toBe(before);
  }, 20000);

  // ── 2. Reply mode ───────────────────────────────────────────────────
  itOrSkip("reply by messageId routes through /api/bridge/reply with org enforcement", async () => {
    const before = replyCalls().length;
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ messageId: inboundMessageId, bodyText: "Scores attached." }),
    });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.ok).toBe(true);
    expect(data.action).toBe("replied");

    expect(replyCalls().length).toBe(before + 1);
    const call = replyCalls()[replyCalls().length - 1];
    expect(call.body.message_id).toBe(inboundMessageId);
    expect(call.body.organization_id).toBe(ORG_A);
  }, 20000);

  itOrSkip("reply IDOR across orgs → 404, bridge never called", async () => {
    const before = replyCalls().length;
    const r = await clientB.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ messageId: inboundMessageId, bodyText: "intruding" }),
    });
    expect(r.status).toBe(404);
    expect(replyCalls().length).toBe(before);
  }, 20000);

  itOrSkip("replying to an OUTBOUND message → 422", async () => {
    const before = replyCalls().length;
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ messageId: outboundMessageId, bodyText: "self-reply" }),
    });
    expect(r.status).toBe(422);
    expect(replyCalls().length).toBe(before);
  }, 20000);

  // ── 3. Legacy thread mode ───────────────────────────────────────────
  itOrSkip("legacy threadId mode still routes through the bridge", async () => {
    const before = sendCalls().length;
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ threadId: threadIdA, bodyText: "Following up." }),
    });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.ok).toBe(true);
    expect(sendCalls().length).toBe(before + 1);
    const call = sendCalls()[sendCalls().length - 1];
    expect(call.body.lead_id).toBe(leadIdA);
    expect(call.body.organization_id).toBe(ORG_A);
  }, 20000);

  itOrSkip("legacy threadId cross-org → 404", async () => {
    const before = sendCalls().length;
    const r = await clientB.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ threadId: threadIdA, bodyText: "intrude" }),
    });
    expect(r.status).toBe(404);
    expect(sendCalls().length).toBe(before);
  }, 20000);

  // ── 4. Failure honesty ──────────────────────────────────────────────
  itOrSkip("bridge failure is surfaced honestly — never shown as sent", async () => {
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({
        leadId: leadIdA,
        buyerEmail: "real.buyer@genuine-importer-check.com",
        subject: "FORCE_BRIDGE_FAILURE",
        bodyText: "this must fail",
      }),
    });
    expect(r.status).toBe(502);
    const data = await r.json();
    expect(data.ok).toBe(false);
    expect(data.sent).toBe(false);
    expect(data.error).toContain("Resend API error");
    expect(data.dry_run).toBe(false);
  }, 20000);

  itOrSkip("missing parameters → 400 with guidance", async () => {
    const r = await clientA.fetch("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ bodyText: "no routing info" }),
    });
    expect(r.status).toBe(400);
    const data = await r.json();
    expect(data.error).toContain("messageId");
    expect(data.error).toContain("leadId");
    expect(data.error).toContain("threadId");
  }, 20000);

  // ── 5. GET contract + no leakage ────────────────────────────────────
  itOrSkip("GET exposes messageId + dryRun flags; no operator real-email leak", async () => {
    const r = await clientA.fetch(`/api/inbox?threadId=${threadIdA}`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.ok).toBe(true);
    expect(data.messages.length).toBe(2);

    const inbound = data.messages.find((m: any) => m.direction === "inbound");
    expect(inbound.messageId).toBe(inboundMessageId);
    expect(inbound.dryRun).toBe(false);

    const outbound = data.messages.find((m: any) => m.direction === "outbound");
    expect(outbound.dryRun).toBe(true); // provider_message_id "dry-run-stub-0000" → labeled

    // The operator's REAL email must never appear anywhere in the payload
    const raw = JSON.stringify(data);
    expect(raw).not.toContain("inbox-a@test.com");
    expect(raw).not.toContain("inbox-b@test.com");
  }, 20000);

  itOrSkip("org B sees only its own thread (isolation on read)", async () => {
    const r = await clientB.fetch(`/api/inbox?threadId=${threadIdA}`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.messages.length).toBe(0); // thread A invisible to B even with a direct filter
    expect(JSON.stringify(data.conversations)).not.toContain("Ethiopian 25/26");
  }, 20000);
});
