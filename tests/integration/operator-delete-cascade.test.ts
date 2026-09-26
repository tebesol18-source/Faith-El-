/**
 * Regression test: operator deletion must cascade to ALL referencing rows.
 *
 * History: DELETE /api/admin/operators/[id] used to delete only the operators
 * row — leaving orphaned password_history, sessions and account_requests rows
 * behind (verified orphans existed in the committed DB for previously deleted
 * operators: exporter-007/012/013, op-test-a/b). The route now deletes every
 * referencing row in one transaction, and getWritableDb() enforces the
 * schema's declared FKs (exporter_inboxes cascades).
 *
 * This test proves the full chain with DB-level evidence:
 *   create operator (API) → login (session row) → change password
 *   (password_history row) → admin DELETE (API) → zero rows in every
 *   referencing table (SQL) + 404 on re-delete (API).
 */
import { describe, it, expect } from "vitest";
import { createTestClient, getAdminClient } from "./helpers";
import { getReadonlyDb, getDbPath } from "@/lib/db";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

// Suite convention: skip cleanly when no server is reachable (plain vitest
// without the runner). scripts/run-tests.mjs always provides a server.
const serverAvailable = await (async () => {
  try {
    const r = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 503;
  } catch {
    return false;
  }
})();
const itOrSkip = serverAvailable ? it : it.skip;

const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const TEST_EMAIL = `cascade-check-${SUFFIX}@cascade-test.local`;

function countRows(table: string, operatorId: string): number {
  const db = getReadonlyDb();
  try {
    return (db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE operator_id = ?`).get(operatorId) as any).c;
  } finally {
    db.close();
  }
}

function countRequestsFor(operatorId: string): number {
  const db = getReadonlyDb();
  try {
    return (db
      .prepare("SELECT COUNT(*) AS c FROM account_requests WHERE created_operator_id = ?")
      .get(operatorId) as any).c;
  } finally {
    db.close();
  }
}

describe("operator delete cascades every referencing row", () => {
  itOrSkip("leaves zero orphan rows in operators, password_history, sessions, account_requests, exporter_inboxes", async () => {
    const admin = await getAdminClient();

    // ─── 1. Create a throwaway operator ───
    const createR = await admin.fetch("/api/admin/operators", {
      method: "POST",
      body: JSON.stringify({
        name: "Cascade Check",
        email: TEST_EMAIL,
        password: "Cascade!Pass123",
        role: "operator",
      }),
    });
    const createD = await createR.json();
    expect(createD.ok).toBe(true);
    expect(createR.status).toBe(201);
    const operatorId: string = createD.operator?.operator_id;
    expect(operatorId).toBeTruthy();

    // ─── 2. Login as the new operator (creates a session row) ───
    const newOp = await createTestClient(TEST_EMAIL, "Cascade!Pass123");

    // ─── 3. Change password (creates a password_history row) ───
    const changeR = await newOp.fetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "Cascade!Pass123", newPassword: "Cascade!Pass456" }),
    });
    const changeD = await changeR.json();
    expect(changeD.ok).toBe(true);

    // ─── 4. DB evidence BEFORE the delete ───
    expect(countRows("operators", operatorId)).toBe(1);
    expect(countRows("sessions", operatorId)).toBeGreaterThan(0);
    expect(countRows("password_history", operatorId)).toBeGreaterThan(0);

    // ─── 5. Admin deletes the operator ───
    const delR = await admin.fetch(`/api/admin/operators/${operatorId}`, { method: "DELETE" });
    const delD = await delR.json();
    expect(delD.ok).toBe(true);
    expect(delD.deletedOperatorId).toBe(operatorId);

    // ─── 6. DB evidence AFTER: zero rows anywhere ───
    expect(countRows("operators", operatorId)).toBe(0);
    expect(countRows("sessions", operatorId)).toBe(0);
    expect(countRows("password_history", operatorId)).toBe(0);
    expect(countRows("exporter_inboxes", operatorId)).toBe(0);
    expect(countRequestsFor(operatorId)).toBe(0);

    // ─── 7. API evidence: re-delete returns 404 ───
    const reDelR = await admin.fetch(`/api/admin/operators/${operatorId}`, { method: "DELETE" });
    expect(reDelR.status).toBe(404);
  });

  itOrSkip("verifies the test DB path contains coffee_export.db (sanity for the isolation runner)", () => {
    expect(getDbPath()).toContain("coffee_export.db");
  });
});
