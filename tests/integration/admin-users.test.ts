/**
 * Integration tests for the admin user-management endpoints.
 *
 * Covers Phase 2 functionality:
 *   - POST /api/admin/operators (create operator)
 *   - PATCH /api/admin/operators/[id] (update role/status/name)
 *   - POST /api/admin/operators/[id]/reset-password (reset password)
 *   - DELETE /api/admin/operators/[id] (delete operator)
 *   - POST /api/admin/access-requests/[id]/approve (approve request + create account)
 *   - POST /api/admin/access-requests/[id]/reject (reject request)
 *
 * Phase 4B: switched to cookie-based auth via the shared `./helpers` module
 * so POST/PATCH/DELETE requests automatically include the CSRF token.
 * Fresh test-operator logins still use a unique x-forwarded-for IP to avoid
 * shared rate-limit buckets on /api/auth/login.
 * Creates + cleans up test operators so the test run is idempotent.
 */
import { describe, it, expect } from "vitest";
import { getAdminClient, getSellerClient } from "./helpers";

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

let ipCounter = 200;
function uniqueIp(): string {
  ipCounter += 1;
  return `70.0.0.${ipCounter}`;
}

describe("Admin user management (integration)", () => {
  describe("POST /api/admin/operators — create operator", () => {
    itOrSkip("returns 403 without auth (CSRF middleware rejects before auth check)", async () => {
      // Phase 4B: POST without CSRF token is rejected at the middleware layer (403)
      // before the route handler can check auth (which would return 401).
      // This is the intended behavior — don't reveal whether the endpoint exists.
      const r = await fetch(`${BASE_URL}/api/admin/operators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ name: "Test", email: "test@test.com", password: "Password1" }),
      });
      expect(r.status).toBe(403);
    });

    itOrSkip("returns 403 for seller tokens (admin-only)", async () => {
      const sellerClient = await getSellerClient();
      const r = await sellerClient.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Test", email: "test@test.com", password: "Password1" }),
      });
      expect(r.status).toBe(403);
    });

    itOrSkip("returns 400 for missing name", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ email: "test@test.com", password: "Password1" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("returns 400 for weak password (< 8 chars)", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Test User", email: `weak-${Date.now()}@test.com`, password: "abc1" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("returns 400 for password with no digit", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Test User", email: `noDigit-${Date.now()}@test.com`, password: "abcdefgh" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("returns 409 for duplicate email", async () => {
      const client = await getAdminClient();
      // abi@coelrodan.com already exists
      const r = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Dup", email: "abi@coelrodan.com", password: "Password1" }),
      });
      expect(r.status).toBe(409);
    });

    itOrSkip("returns 201 for valid create + creates a real loggable account", async () => {
      const client = await getAdminClient();
      const uniqueEmail = `phase2-${Date.now()}@test.com`;
      const r = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({
          name: "Phase 2 Test",
          email: uniqueEmail,
          password: "Password1",
          role: "operator",
        }),
      });
      expect(r.status).toBe(201);
      const d = await r.json();
      expect(d.ok).toBe(true);
      expect(d.operator.email).toBe(uniqueEmail);
      expect(d.operator.operator_id).toMatch(/^exporter-\d{3}$/);

      // Verify the new account can actually log in
      const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "Password1" }),
      });
      expect(loginR.status).toBe(200);
      const loginD = await loginR.json();
      expect(loginD.ok).toBe(true);
      expect(loginD.role).toBe("seller");
      expect(loginD.name).toBe("Phase 2 Test");
    });
  });

  describe("PATCH /api/admin/operators/[id] — update role/status", () => {
    itOrSkip("returns 404 for non-existent operator", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators/nonexistent-999", {
        method: "PATCH",
        body: JSON.stringify({ role: "manager" }),
      });
      expect(r.status).toBe(404);
    });

    itOrSkip("returns 400 when no fields provided", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators/exporter-002", {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("returns 400 for invalid role", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators/exporter-002", {
        method: "PATCH",
        body: JSON.stringify({ role: "superuser" }),
      });
      expect(r.status).toBe(400);
    });
  });

  describe("POST /api/admin/operators/[id]/reset-password", () => {
    itOrSkip("returns 404 for non-existent operator", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators/nonexistent-999/reset-password", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(404);
    });

    itOrSkip("returns 400 for weak custom password", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators/exporter-002/reset-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: "weak" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("generates a random password when none provided + new password works for login", async () => {
      const client = await getAdminClient();
      // Create a fresh operator to test on (don't mess with the demo accounts)
      const createR = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({
          name: "Reset Pwd Test",
          email: `reset-${Date.now()}@test.com`,
          password: "InitialPass1",
        }),
      });
      const createD = await createR.json();
      const opId = createD.operator.operator_id;
      const opEmail = createD.operator.email;

      // Now reset the password (auto-generated)
      const resetR = await client.fetch(`/api/admin/operators/${opId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(resetR.status).toBe(200);
      const resetD = await resetR.json();
      expect(resetD.ok).toBe(true);
      expect(resetD.generatedPassword).toBeTruthy();
      expect(resetD.generatedPassword.length).toBe(16);

      // Verify the OLD password no longer works
      const oldLoginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: opEmail, password: "InitialPass1" }),
      });
      expect(oldLoginR.status).toBe(401);

      // Verify the NEW password works
      const newLoginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: opEmail, password: resetD.generatedPassword }),
      });
      expect(newLoginR.status).toBe(200);

      // Cleanup: delete the test operator
      await client.fetch(`/api/admin/operators/${opId}`, {
        method: "DELETE",
      });
    });
  });

  describe("DELETE /api/admin/operators/[id]", () => {
    itOrSkip("returns 404 for non-existent operator", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/operators/nonexistent-999", {
        method: "DELETE",
      });
      expect(r.status).toBe(404);
    });

    itOrSkip("deletes an operator + they can no longer log in", async () => {
      const client = await getAdminClient();
      // Create a fresh operator to delete
      const createR = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({
          name: "Delete Test",
          email: `delete-${Date.now()}@test.com`,
          password: "DeleteMe1",
        }),
      });
      const createD = await createR.json();
      const opId = createD.operator.operator_id;
      const opEmail = createD.operator.email;

      // Verify they can log in
      const loginR1 = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: opEmail, password: "DeleteMe1" }),
      });
      expect(loginR1.status).toBe(200);

      // Delete them
      const delR = await client.fetch(`/api/admin/operators/${opId}`, {
        method: "DELETE",
      });
      expect(delR.status).toBe(200);

      // Verify they can no longer log in
      const loginR2 = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: opEmail, password: "DeleteMe1" }),
      });
      expect(loginR2.status).toBe(401);
    });
  });

  describe("POST /api/admin/access-requests/[id]/approve + reject", () => {
    itOrSkip("returns 404 for non-existent request", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/access-requests/99999/approve", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(404);
    });

    itOrSkip("approves a request → creates operator + request status flips on approved", async () => {
      const client = await getAdminClient();
      // Submit a fresh request via the public endpoint
      const uniqueEmail = `approve-${Date.now()}@test.com`;
      const submitR = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({
          name: "Approve Test",
          email: uniqueEmail,
          company: "Test Co",
          phone: "+251911234567",
        }),
      });
      const submitD = await submitR.json();
      const requestId = submitD.requestId;

      // Approve it
      const approveR = await client.fetch(`/api/admin/access-requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify({ role: "operator" }),
      });
      expect(approveR.status).toBe(200);
      const approveD = await approveR.json();
      expect(approveD.ok).toBe(true);
      expect(approveD.status).toBe("approved");
      expect(approveD.operator.email).toBe(uniqueEmail);
      expect(approveD.generatedPassword).toBeTruthy();
      expect(approveD.generatedPassword.length).toBe(16);

      // Verify the new operator can log in with the generated password
      const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: approveD.generatedPassword }),
      });
      expect(loginR.status).toBe(200);

      // Try to approve the same request again → should get 409
      const reApproveR = await client.fetch(`/api/admin/access-requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(reApproveR.status).toBe(409);

      // Cleanup: delete the created operator
      await client.fetch(`/api/admin/operators/${approveD.operator.operator_id}`, {
        method: "DELETE",
      });
    });

    itOrSkip("rejects a request → status flips to rejected", async () => {
      const client = await getAdminClient();
      // Submit a fresh request
      const uniqueEmail = `reject-${Date.now()}@test.com`;
      const submitR = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ name: "Reject Test", email: uniqueEmail }),
      });
      const submitD = await submitR.json();
      const requestId = submitD.requestId;

      // Reject it
      const rejectR = await client.fetch(`/api/admin/access-requests/${requestId}/reject`, {
        method: "POST",
        body: JSON.stringify({ notes: "Test rejection" }),
      });
      expect(rejectR.status).toBe(200);
      const rejectD = await rejectR.json();
      expect(rejectD.ok).toBe(true);
      expect(rejectD.status).toBe("rejected");

      // Try to reject again → should get 409
      const reRejectR = await client.fetch(`/api/admin/access-requests/${requestId}/reject`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(reRejectR.status).toBe(409);
    });
  });
});
