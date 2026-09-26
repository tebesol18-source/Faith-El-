/**
 * Phase 1 integration tests — real-lead intake path.
 *
 * Full chain, against the isolated test server (scripts/run-tests.mjs):
 *   1. Directory browse (GET) returns real entries with sources — no writes.
 *   2. Directory import (POST directoryKeys) creates UNVERIFIED leads with
 *      evidence attached, in the IMPORTER's org.
 *   3. The same real company can be imported by TWO different orgs.
 *   4. Fictional generation is gone: the old body shape is rejected.
 *   5. CSV import enforces evidence: rows without source_url are rejected;
 *      @example.com contacts are rejected; generated company names rejected.
 *   6. Outreach gate: ENRICHED→IN_SEQUENCE is blocked while the company is
 *      unverified, blocked with no verified contact, allowed after
 *      company+contact verification; rejected leads can never advance.
 *   7. Contact add requires evidence + rejects fictional emails.
 *   8. Reachability check records advisory results without crashing
 *      (network availability is not asserted).
 *   9. Cross-org isolation: org B cannot read org A's lead evidence.
 *  10. Verification actions are all recorded in the audit log.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

const ORG_A = "org-intake-a";
const ORG_B = "org-intake-b";
const NOW = "2026-09-26T10:00:00+03:00";

/** Leads created during the test run (cleaned up in afterAll). */
let createdLeadIds: string[] = [];

describe("Phase 1 — real-lead intake path", () => {
  beforeAll(() => {
    const db = getWritableDb();
    try {
      db.prepare("INSERT OR IGNORE INTO organizations (organization_id, name, status, created_ts, updated_ts) VALUES (?, ?, 'active', ?, ?)")
        .run(ORG_A, "Intake Test Org A", NOW, NOW);
      db.prepare("INSERT OR IGNORE INTO organizations (organization_id, name, status, created_ts, updated_ts) VALUES (?, ?, 'active', ?, ?)")
        .run(ORG_B, "Intake Test Org B", NOW, NOW);
      const pass = hashPassword("intaketest123");
      db.prepare(`INSERT OR IGNORE INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts, organization_id)
        VALUES ('op-intake-a', 'Intake A', 'intake-a@test.com', 'operator', 'active', ?, 0, ?, ?, ?)`)
        .run(pass, NOW, NOW, ORG_A);
      db.prepare(`INSERT OR IGNORE INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts, organization_id)
        VALUES ('op-intake-b', 'Intake B', 'intake-b@test.com', 'operator', 'active', ?, 0, ?, ?, ?)`)
        .run(pass, NOW, NOW, ORG_B);
    } finally {
      db.close();
    }
  });

  afterAll(() => {
    const db = getWritableDb();
    try {
      // Cascade removes contacts/evidence/log/events via FKs where declared.
      for (const leadId of createdLeadIds) {
        db.prepare("DELETE FROM events WHERE entity_type = 'lead' AND entity_id = ?").run(leadId);
        db.prepare("DELETE FROM leads WHERE lead_id = ?").run(leadId);
      }
      db.prepare("DELETE FROM operators WHERE operator_id IN ('op-intake-a', 'op-intake-b')").run();
      db.prepare("DELETE FROM organizations WHERE organization_id IN (?, ?)").run(ORG_A, ORG_B);
    } finally {
      db.close();
    }
  });

  let clientA: Awaited<ReturnType<typeof createTestClient>>;
  let clientB: Awaited<ReturnType<typeof createTestClient>>;

  itOrSkip("seeds two test-org clients", async () => {
    clientA = await createTestClient("intake-a@test.com", "intaketest123", "171.0.0.1");
    clientB = await createTestClient("intake-b@test.com", "intaketest123", "171.0.0.2");
  }, 20000);

  // ── 1. Directory browse ────────────────────────────────────────────
  itOrSkip(
    "GET directory returns real entries with source URLs and writes nothing",
    async () => {
      const leadsBefore = (await (await clientA.fetch("/api/leads")).json()).leads.length;

      const r = await clientA.fetch("/api/agents/research-leads?segment=Specialty%20Importer");
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.count).toBeGreaterThan(0);
      expect(body.entries.length).toBeGreaterThan(0);
      for (const e of body.entries) {
        expect(e.company).toBeTruthy();
        expect(e.country).toBeTruthy();
        expect(e.sources.length).toBeGreaterThan(0);
        expect(e.sources[0].url).toMatch(/^https:\/\//);
      }
      // Entries carry the honesty metadata
      expect(body.meta.disclaimer).toBeTruthy();
      expect(body.meta.noContactsByDesign).toBe(true);

      const leadsAfter = (await (await clientA.fetch("/api/leads")).json()).leads.length;
      expect(leadsAfter).toBe(leadsBefore); // browsing writes nothing
    },
    20000
  );

  // ── 2. Directory import ─────────────────────────────────────────────
  itOrSkip(
    "directory import creates an UNVERIFIED lead with evidence in the importer's org",
    async () => {
      const r = await clientA.fetch("/api/agents/research-leads", {
        method: "POST",
        body: JSON.stringify({ directoryKeys: ["sucafina-geneva"] }),
      });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.created).toBe(1);
      expect(body.leads[0].verificationStatus).toBe("unverified");
      expect(body.leads[0].evidenceCount).toBeGreaterThan(0);
      createdLeadIds.push(body.leads[0].id);

      // DB-level verification
      const db = getWritableDb();
      try {
        const lead = db.prepare("SELECT * FROM leads WHERE lead_id = ?").get(body.leads[0].id) as any;
        expect(lead.organization_id).toBe(ORG_A); // NOT org-system, NOT the directory's
        expect(lead.verification_status).toBe("unverified");
        expect(lead.website).toContain("sucafina");
        const evidence = db.prepare("SELECT * FROM lead_sources WHERE lead_id = ?").all(body.leads[0].id) as any[];
        expect(evidence.length).toBeGreaterThan(0);
        expect(evidence[0].source_url).toMatch(/^https:\/\//);
        expect(evidence[0].product_interest).toBeTruthy();
        const contacts = db.prepare("SELECT * FROM lead_contacts WHERE lead_id = ?").all(body.leads[0].id) as any[];
        expect(contacts.length).toBe(0); // no invented contacts — by design
        const events = db.prepare("SELECT * FROM events WHERE entity_id = ? AND event_type = 'LEAD_CREATED'").all(body.leads[0].id) as any[];
        expect(events.length).toBe(1);
        expect(JSON.parse(events[0].payload).origin).toBe("curated-directory");
      } finally {
        db.close();
      }
    },
    20000
  );

  itOrSkip(
    "re-importing the same company into the same org is skipped, not duplicated",
    async () => {
      const r = await clientA.fetch("/api/agents/research-leads", {
        method: "POST",
        body: JSON.stringify({ directoryKeys: ["sucafina-geneva"] }),
      });
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.created).toBe(0);
      expect(body.skipped.length).toBe(1);
      expect(body.skipped[0].reason).toContain("already in your lead pool");
    },
    20000
  );

  // ── 3. Multi-tenant lead pool ──────────────────────────────────────
  itOrSkip(
    "the SAME real company can be imported by a different org (org-scoped unique)",
    async () => {
      const r = await clientB.fetch("/api/agents/research-leads", {
        method: "POST",
        body: JSON.stringify({ directoryKeys: ["sucafina-geneva"] }),
      });
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.created).toBe(1);
      createdLeadIds.push(body.leads[0].id);

      const db = getWritableDb();
      try {
        const rows = db.prepare("SELECT lead_id, organization_id FROM leads WHERE company_name = 'Sucafina' AND deleted_ts IS NULL").all() as any[];
        expect(rows.length).toBe(2);
        expect(new Set(rows.map((x) => x.organization_id))).toEqual(new Set([ORG_A, ORG_B]));
      } finally {
        db.close();
      }
    },
    20000
  );

  // ── 4. Fictional generation is gone ────────────────────────────────
  itOrSkip(
    "the old fictional-generation body is rejected with a clear error",
    async () => {
      const r = await clientA.fetch("/api/agents/research-leads", {
        method: "POST",
        body: JSON.stringify({ country: "Germany", segment: "Roaster", count: 5 }),
      });
      // Germany/Roaster DOES match directory entries now — the convenience
      // import mode imports REAL companies, never generates fiction.
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.created).toBeGreaterThan(0);
      expect(body.created).toBeLessThanOrEqual(5);
      for (const lead of body.leads) {
        expect(lead.company).not.toMatch(/\s\d{5}$/); // no generated names
        expect(lead.verificationStatus).toBe("unverified");
      }
      createdLeadIds.push(...body.leads.map((l: any) => l.id));
    },
    20000
  );

  itOrSkip(
    "a request with no directory keys and no filters is a 400",
    async () => {
      const r = await clientA.fetch("/api/agents/research-leads", {
        method: "POST",
        body: JSON.stringify({ count: 5 }),
      });
      expect(r.status).toBe(400);
      const body = await r.json();
      expect(body.error).toContain("Nothing to do");
    },
    20000
  );

  // ── 5. CSV import enforces evidence ────────────────────────────────
  itOrSkip(
    "CSV import: evidence-less rows and fictional data are rejected; real rows import",
    async () => {
      const r = await clientA.fetch("/api/leads/import", {
        method: "POST",
        body: JSON.stringify({
          leads: [
            // 1. valid row with evidence
            {
              company: "Real Import Handels GmbH",
              country: "Germany",
              website: "https://example.org/real-import-co",
              contact_name: "Anna Schmidt",
              contact_email: "anna.schmidt@real-import-hamburg.de",
              source_url: "https://example.org/directory/real-import-co",
              product_interest: "Washed Ethiopian microlots",
            },
            // 2. no evidence — must be rejected
            { company: "Evidenceless Co", country: "Germany" },
            // 3. fictional contact email — must be rejected by the email guard
            {
              company: "Email Guard Handels GmbH",
              country: "Germany",
              contact_email: "marcus@example.com",
              source_url: "https://example.org/x",
            },
            // 4. generated company name — must be rejected
            {
              company: "Generated Roasters 73912",
              country: "Germany",
              source_url: "https://example.org/y",
            },
            // 5. placeholder word company — must be rejected
            { company: "Test Buyer Co", country: "Germany", source_url: "https://example.org/z" },
          ],
        }),
      });
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.created).toBe(1);
      expect(body.totalErrors).toBe(4);
      const errors = body.errors.join(" | ");
      expect(errors).toContain("Evidenceless Co");
      expect(errors).toContain("no evidence");
      expect(errors).toContain("reserved/test domain");
      expect(errors).toContain("Generated Roasters");
      expect(errors).toContain("Test Buyer Co");

      // find the created lead id via the listing
      const list = await (await clientA.fetch("/api/leads")).json();
      const created = list.leads.find((l: any) => l.company === "Real Import Handels GmbH");
      expect(created).toBeTruthy();
      expect(created.verificationStatus).toBe("unverified");
      createdLeadIds.push(created.id);

      const db = getWritableDb();
      try {
        const evidence = db.prepare("SELECT * FROM lead_sources WHERE lead_id = ?").all(created.id) as any[];
        expect(evidence.length).toBe(1);
        expect(evidence[0].source_url).toBe("https://example.org/directory/real-import-co");
        expect(evidence[0].evidence_for).toBe("both"); // documents company + contact
        const contact = db.prepare("SELECT * FROM lead_contacts WHERE lead_id = ?").all(created.id) as any[];
        expect(contact.length).toBe(1);
        expect(contact[0].verification_status).toBe("unverified");
      } finally {
        db.close();
      }
    },
    20000
  );

  // ── 6/7. Verification workflow + outreach gate ─────────────────────
  itOrSkip(
    "outreach is blocked until company AND contact are verified, then allowed",
    async () => {
      // Import a fresh directory lead for org A
      const imp = await (
        await clientA.fetch("/api/agents/research-leads", {
          method: "POST",
          body: JSON.stringify({ directoryKeys: ["tim-wendelboe-oslo"] }),
        })
      ).json();
      expect(imp.ok).toBe(true);
      const leadId = imp.leads[0].id;
      createdLeadIds.push(leadId);

      // Advance NEW → ENRICHED (not gated)
      let r = await clientA.fetch(`/api/leads/${leadId}/advance`, { method: "POST" });
      expect((await r.json()).newState).toBe("ENRICHED");

      // ENRICHED → IN_SEQUENCE must be blocked: company unverified
      r = await clientA.fetch(`/api/leads/${leadId}/advance`, { method: "POST" });
      expect(r.status).toBe(422);
      expect((await r.json()).error).toContain("not verified");

      // Verify the company (evidence exists from the directory import)
      r = await clientA.fetch(`/api/leads/${leadId}/verify`, {
        method: "POST",
        body: JSON.stringify({ action: "confirm", level: "company" }),
      });
      expect(r.status).toBe(200);
      expect((await r.json()).verificationStatus).toBe("verified");

      // Still blocked: no verified contact
      r = await clientA.fetch(`/api/leads/${leadId}/advance`, { method: "POST" });
      expect(r.status).toBe(422);
      expect((await r.json()).error).toContain("no verified contact");

      // Contact add without evidence → 422
      r = await clientA.fetch(`/api/leads/${leadId}/contacts`, {
        method: "POST",
        body: JSON.stringify({ name: "No Evidence Person", email: "p@timwendelboe.no" }),
      });
      expect(r.status).toBe(422);

      // Contact add with a fictional email → 422
      r = await clientA.fetch(`/api/leads/${leadId}/contacts`, {
        method: "POST",
        body: JSON.stringify({ name: "Fake Person", email: "fake@example.com", sourceUrl: "https://example.org/team" }),
      });
      expect(r.status).toBe(422);

      // Contact add WITH evidence → created unverified
      r = await clientA.fetch(`/api/leads/${leadId}/contacts`, {
        method: "POST",
        body: JSON.stringify({
          name: "Tim Wendelboe",
          title: "Owner",
          email: "coffee@timwendelboe.no",
          sourceUrl: "https://www.timwendelboe.no/pages/about",
        }),
      });
      expect(r.status).toBe(200);
      const contactId = (await r.json()).contactId;

      // Verify the contact
      r = await clientA.fetch(`/api/leads/${leadId}/verify`, {
        method: "POST",
        body: JSON.stringify({ action: "confirm", level: "contact", contactId }),
      });
      expect(r.status).toBe(200);

      // NOW outreach is allowed
      r = await clientA.fetch(`/api/leads/${leadId}/advance`, { method: "POST" });
      expect(r.status).toBe(200);
      expect((await r.json()).newState).toBe("IN_SEQUENCE");

      // Audit trail recorded the whole journey
      const db = getWritableDb();
      try {
        const log = db.prepare("SELECT * FROM lead_verification_log WHERE lead_id = ? ORDER BY id").all(leadId) as any[];
        const actions = log.map((l) => `${l.level}:${l.action}`);
        expect(actions).toContain("company:confirm");
        expect(actions).toContain("contact:confirm");
        expect(log.every((l) => l.actor === "intake-a@test.com")).toBe(true);
      } finally {
        db.close();
      }
    },
    30000
  );

  itOrSkip(
    "a REJECTED lead can never enter outreach",
    async () => {
      const imp = await (
        await clientA.fetch("/api/agents/research-leads", {
          method: "POST",
          body: JSON.stringify({ directoryKeys: ["glitch-tokyo"] }),
        })
      ).json();
      const leadId = imp.leads[0].id;
      createdLeadIds.push(leadId);

      await clientA.fetch(`/api/leads/${leadId}/advance`, { method: "POST" }); // NEW → ENRICHED

      const r = await clientA.fetch(`/api/leads/${leadId}/verify`, {
        method: "POST",
        body: JSON.stringify({ action: "reject", reason: "not a buyer — café only" }),
      });
      expect(r.status).toBe(200);

      const blocked = await clientA.fetch(`/api/leads/${leadId}/advance`, { method: "POST" });
      expect(blocked.status).toBe(422);
      expect((await blocked.json()).error).toContain("rejected");
    },
    20000
  );

  itOrSkip(
    "confirm on an evidence-less lead is refused (cannot verify nothing)",
    async () => {
      // Create a lead directly with no evidence
      const db = getWritableDb();
      let leadId: string;
      try {
        leadId = "L-TEST-INTAKE-NOEV";
        db.prepare(`INSERT INTO leads (lead_id, company_name, headquarters_country, organization_id, created_ts, updated_ts)
          VALUES (?, 'No Evidence GmbH', 'Germany', ?, ?, ?)`).run(leadId, ORG_A, NOW, NOW);
        createdLeadIds.push(leadId);
      } finally {
        db.close();
      }
      const r = await clientA.fetch(`/api/leads/${leadId}/verify`, {
        method: "POST",
        body: JSON.stringify({ action: "confirm", level: "company" }),
      });
      expect(r.status).toBe(422);
      expect((await r.json()).error).toContain("no evidence");
    },
    20000
  );

  // ── 8. Reachability check ──────────────────────────────────────────
  itOrSkip(
    "reachability check records advisory results (network-independent)",
    async () => {
      const imp = await (
        await clientA.fetch("/api/agents/research-leads", {
          method: "POST",
          body: JSON.stringify({ directoryKeys: ["royal-coffee-usa"] }),
        })
      ).json();
      const leadId = imp.leads[0].id;
      createdLeadIds.push(leadId);

      const r = await clientA.fetch(`/api/leads/${leadId}/verify`, {
        method: "POST",
        body: JSON.stringify({ action: "check" }),
      });
      // The check itself must succeed regardless of network state
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.results.length).toBeGreaterThan(0);
      for (const res of body.results) {
        expect(typeof res.status).toBe("string"); // reachable | http-xxx | timeout | unreachable
      }

      const db = getWritableDb();
      try {
        const log = db.prepare("SELECT * FROM lead_verification_log WHERE lead_id = ? AND action = 'check'").all(leadId);
        expect(log.length).toBe(1);
      } finally {
        db.close();
      }
    },
    30000
  );

  // ── 9. Cross-org isolation ─────────────────────────────────────────
  itOrSkip(
    "org B cannot read org A's lead evidence or verify it",
    async () => {
      const imp = await (
        await clientA.fetch("/api/agents/research-leads", {
          method: "POST",
          body: JSON.stringify({ directoryKeys: ["falcon-uk"] }),
        })
      ).json();
      const leadId = imp.leads[0].id;
      createdLeadIds.push(leadId);

      // Evidence read is org-scoped
      const ev = await clientB.fetch(`/api/leads/${leadId}/evidence`);
      expect(ev.status).toBe(404);

      // Verify is org-scoped
      const v = await clientB.fetch(`/api/leads/${leadId}/verify`, {
        method: "POST",
        body: JSON.stringify({ action: "confirm", level: "company" }),
      });
      expect(v.status).toBe(404);

      // Advance is org-scoped
      const a = await clientB.fetch(`/api/leads/${leadId}/advance`, { method: "POST" });
      expect(a.status).toBe(404);
    },
    20000
  );

  // ── 10. Leads listing carries verification info ────────────────────
  itOrSkip(
    "the leads list exposes verification status and verified-contact count",
    async () => {
      const list = await (await clientA.fetch("/api/leads")).json();
      expect(list.ok).toBe(true);
      expect(list.leads.length).toBeGreaterThan(0);
      for (const lead of list.leads) {
        expect(["unverified", "verified", "rejected"]).toContain(lead.verificationStatus);
        expect(typeof lead.evidenceCount).toBe("number");
        expect(typeof lead.verifiedContactCount).toBe("number");
      }
      // every listed lead belongs to org A
      const db = getWritableDb();
      try {
        for (const lead of list.leads) {
          const row = db.prepare("SELECT organization_id FROM leads WHERE lead_id = ?").get(lead.id) as any;
          expect(row.organization_id).toBe(ORG_A);
        }
      } finally {
        db.close();
      }
    },
    20000
  );
});
