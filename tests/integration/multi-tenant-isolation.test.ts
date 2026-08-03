/**
 * Multi-tenant isolation and IDOR protection tests.
 *
 * Programmatically inserts two distinct tenants and operators:
 *   - Organization: org-test-a, Operator: op-a@test.com
 *   - Organization: org-test-b, Operator: op-b@test.com
 *
 * Verifies that:
 *   1. op-a cannot access lead history owned by org-test-b (returns 403)
 *   2. op-b can successfully access lead history owned by org-test-b
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getWritableDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createTestClient } from "./helpers";

const BASE_URL = "http://localhost:3000";

const serverAvailable = await (async () => {
  try {
    const r = await fetch(`${BASE_URL}/api`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 401 || r.status === 404;
  } catch {
    return false;
  }
})();

const itOrSkip = serverAvailable ? it : it.skip;

describe("Multi-Tenant Isolation & IDOR Guards", () => {
  beforeAll(() => {
    // Seed test organizations and operators directly in SQLite
    const db = getWritableDb();
    try {
      // 1. Insert organizations
      db.prepare("INSERT OR IGNORE INTO organizations (organization_id, name, status, created_ts, updated_ts) VALUES (?, ?, 'active', ?, ?)")
        .run("org-test-a", "Org Test A", "2026-08-03T12:00:00+03:00", "2026-08-03T12:00:00+03:00");
      db.prepare("INSERT OR IGNORE INTO organizations (organization_id, name, status, created_ts, updated_ts) VALUES (?, ?, 'active', ?, ?)")
        .run("org-test-b", "Org Test B", "2026-08-03T12:00:00+03:00", "2026-08-03T12:00:00+03:00");

      // 2. Insert operators
      const hashedPass = hashPassword("testpass123");
      db.prepare(`
        INSERT OR IGNORE INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts, organization_id)
        VALUES (?, ?, ?, 'operator', 'active', ?, 0, ?, ?, ?)
      `).run("op-test-a", "Operator A", "op-a@test.com", hashedPass, "2026-08-03T12:00:00+03:00", "2026-08-03T12:00:00+03:00", "org-test-a");

      db.prepare(`
        INSERT OR IGNORE INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts, organization_id)
        VALUES (?, ?, ?, 'operator', 'active', ?, 0, ?, ?, ?)
      `).run("op-test-b", "Operator B", "op-b@test.com", hashedPass, "2026-08-03T12:00:00+03:00", "2026-08-03T12:00:00+03:00", "org-test-b");

      // 3. Insert a lead owned by Org Test B
      db.prepare(`
        INSERT OR IGNORE INTO leads (lead_id, company_name, headquarters_country, organization_id, current_state, created_ts, updated_ts)
        VALUES (?, ?, ?, ?, 'NEW', ?, ?)
      `).run("L-TEST-B-001", "Confidential Buyers Inc.", "Germany", "org-test-b", "2026-08-03T12:00:00+03:00", "2026-08-03T12:00:00+03:00");
    } finally {
      db.close();
    }
  });

  afterAll(() => {
    // Clean up test seed data
    const db = getWritableDb();
    try {
      db.prepare("DELETE FROM leads WHERE lead_id = 'L-TEST-B-001'").run();
      db.prepare("DELETE FROM operators WHERE operator_id IN ('op-test-a', 'op-test-b')").run();
      db.prepare("DELETE FROM organizations WHERE organization_id IN ('org-test-a', 'org-test-b')").run();
    } finally {
      db.close();
    }
  });

  itOrSkip("Operator A (org-test-a) is BLOCKED from accessing Operator B's lead history (IDOR Guard)", async () => {
    const clientA = await createTestClient("op-a@test.com", "testpass123", "160.0.0.1");
    const r = await clientA.fetch("/api/leads/L-TEST-B-001/history");

    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body.error).toContain("Access Denied");
  });

  itOrSkip("Operator B (org-test-b) CAN successfully access their own lead history", async () => {
    const clientB = await createTestClient("op-b@test.com", "testpass123", "160.0.0.2");
    const r = await clientB.fetch("/api/leads/L-TEST-B-001/history");

    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
  });
});
