/**
 * Integration tests for Phase 3 features:
 *   - Audit log endpoint (GET /api/admin/audit-log)
 *   - Sessions endpoint (GET /api/admin/sessions)
 *   - Session revocation (POST /api/admin/sessions/[id]/revoke)
 *   - Change password endpoint (POST /api/auth/change-password)
 *   - Logout endpoint (POST /api/auth/logout)
 *   - must_change_password flag is set correctly on operator create + reset
 *
 * Phase 4B: switched to cookie-based auth via the shared `./helpers` module
 * so POST/PATCH/DELETE requests automatically include the CSRF token.
 * Fresh test-operator logins still use a unique x-forwarded-for IP to avoid
 * shared rate-limit buckets on /api/auth/login.
 */

import { describe, it, expect } from "vitest";
import { getAdminClient, createTestClient } from "./helpers";

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

let ipCounter = 400;
function uniqueIp(): string {
  ipCounter += 1;
  return `90.0.0.${ipCounter}`;
}

describe("Phase 3 — audit log + sessions + change password", () => {
  describe("GET /api/admin/audit-log", () => {
    itOrSkip("returns 401 without auth", async () => {
      const r = await fetch(`${BASE_URL}/api/admin/audit-log`, {
        headers: { "x-forwarded-for": uniqueIp() },
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("returns audit log entries for admin", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/audit-log?limit=10");
      expect(r.status).toBe(200);
      const d = await r.json();
      expect(d.ok).toBe(true);
      expect(Array.isArray(d.entries)).toBe(true);
      // Each entry should have the expected fields
      for (const entry of d.entries) {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("timestamp");
        expect(entry).toHaveProperty("actorEmail");
        expect(entry).toHaveProperty("action");
        expect(entry).toHaveProperty("targetType");
      }
    });

    itOrSkip("audit log includes operator.create entry after creating an operator", async () => {
      const client = await getAdminClient();
      const uniqueEmail = `audit-${Date.now()}@test.com`;

      // Create an operator
      const createR = await client.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Audit Test", email: uniqueEmail, password: "TestPass123" }),
      });
      const createD = await createR.json();
      expect(createD.ok).toBe(true);

      // Fetch audit log
      const auditR = await client.fetch("/api/admin/audit-log?limit=20");
      const auditD = await auditR.json();
      const createEntry = auditD.entries.find((e: any) =>
        e.action === "operator.create" && e.targetEmail === uniqueEmail
      );
      expect(createEntry).toBeDefined();
      expect(createEntry.actorEmail).toBe("admin@coelrodan.com");

      // Cleanup
      await client.fetch(`/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
      });
    });
  });

  describe("GET /api/admin/sessions", () => {
    itOrSkip("returns 401 without auth", async () => {
      const r = await fetch(`${BASE_URL}/api/admin/sessions`, {
        headers: { "x-forwarded-for": uniqueIp() },
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("returns active sessions for admin (includes the admin's own session)", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/admin/sessions");
      expect(r.status).toBe(200);
      const d = await r.json();
      expect(d.ok).toBe(true);
      expect(Array.isArray(d.sessions)).toBe(true);
      // The admin's own session should be in the list
      const ownSession = d.sessions.find((s: any) => s.id === client.token);
      expect(ownSession).toBeDefined();
      expect(ownSession.operatorEmail).toBe("admin@coelrodan.com");
      expect(ownSession.operatorRole).toBe("admin");
    });
  });

  describe("POST /api/admin/sessions/[id]/revoke", () => {
    itOrSkip("admin can revoke another user's session", async () => {
      const adminClient = await getAdminClient();

      // Login as a seller (creates a separate session)
      const sellerClient = await createTestClient("abi@coelrodan.com", "coffee123", uniqueIp());

      // Verify seller can access /api/dashboard
      const beforeR = await sellerClient.fetch("/api/dashboard");
      expect(beforeR.status).toBe(200);

      // Admin revokes the seller's session
      const revokeR = await adminClient.fetch(`/api/admin/sessions/${sellerClient.token}/revoke`, {
        method: "POST",
      });
      expect(revokeR.status).toBe(200);
      const revokeD = await revokeR.json();
      expect(revokeD.ok).toBe(true);

      // Verify seller can no longer access /api/dashboard
      const afterR = await sellerClient.fetch("/api/dashboard");
      expect(afterR.status).toBe(401);
    });

    itOrSkip("returns 404 for non-existent session", async () => {
      const client = await getAdminClient();
      const fakeSessionId = "a".repeat(32);
      const r = await client.fetch(`/api/admin/sessions/${fakeSessionId}/revoke`, {
        method: "POST",
      });
      expect(r.status).toBe(404);
    });
  });

  describe("POST /api/auth/change-password", () => {
    itOrSkip("returns 403 without auth (CSRF middleware rejects before auth check)", async () => {
      // Phase 4B: POST without CSRF token is rejected at the middleware layer (403)
      // before the route handler can check auth (which would return 401).
      const r = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ oldPassword: "x", newPassword: "y" }),
      });
      expect(r.status).toBe(403);
    });

    itOrSkip("returns 400 for missing fields", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("returns 401 for wrong old password", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword: "wrongPassword", newPassword: "NewPass123" }),
      });
      expect(r.status).toBe(401);
      const d = await r.json();
      expect(d.error).toMatch(/current password/i);
    });

    itOrSkip("returns 400 when new password == old password", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword: "admin123", newPassword: "admin123" }),
      });
      expect(r.status).toBe(400);
      const d = await r.json();
      expect(d.error).toMatch(/different/i);
    });

    itOrSkip("returns 400 for weak new password", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword: "admin123", newPassword: "abc" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("full lifecycle: change password + old password fails + new password works", async () => {
      const adminClient = await getAdminClient();

      // Create a fresh operator for this test
      const uniqueEmail = `changepwd-${Date.now()}@test.com`;
      const createR = await adminClient.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Change Pwd Test", email: uniqueEmail, password: "InitialPass1" }),
      });
      const createD = await createR.json();
      const opId = createD.operator.operator_id;

      // First login (plain fetch) so we can inspect mustChangePassword in the
      // login response. createTestClient doesn't expose the login body, so we
      // do this separately. This session is not used for subsequent requests.
      const login1R = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "InitialPass1" }),
      });
      const login1D = await login1R.json();
      expect(login1D.mustChangePassword).toBe(true);

      // Create a cookie/CSRF-aware client for this operator (separate session).
      // The operator's must_change_password flag is still set, but the
      // change-password endpoint is always allowed (even when the flag is set).
      const opClient = await createTestClient(uniqueEmail, "InitialPass1", uniqueIp());

      // Change password using the operator's session
      const changeR = await opClient.fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword: "InitialPass1", newPassword: "NewBetterPass456" }),
      });
      expect(changeR.status).toBe(200);
      const changeD = await changeR.json();
      expect(changeD.mustChangePassword).toBe(false);

      // Verify the OLD password no longer works for login
      const login2R = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "InitialPass1" }),
      });
      expect(login2R.status).toBe(401);

      // Verify the NEW password works
      const login3R = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "NewBetterPass456" }),
      });
      expect(login3R.status).toBe(200);
      const login3D = await login3R.json();
      expect(login3D.mustChangePassword).toBe(false);  // flag cleared

      // Current session (opClient's) STAYS alive — UX choice so the user doesn't
      // get logged out immediately after changing their password.
      // Only OTHER sessions for this operator get revoked.
      const sameSessionR = await opClient.fetch("/api/dashboard");
      expect(sameSessionR.status).toBe(200);

      // Cleanup
      await adminClient.fetch(`/api/admin/operators/${opId}`, {
        method: "DELETE",
      });
    });
  });

  describe("POST /api/auth/logout", () => {
    itOrSkip("logout revokes the current session", async () => {
      // Login as a seller (fresh session, not the cached one)
      const sellerClient = await createTestClient("abi@coelrodan.com", "coffee123", uniqueIp());

      // Verify token works
      const r1 = await sellerClient.fetch("/api/dashboard");
      expect(r1.status).toBe(200);

      // Logout
      const logoutR = await sellerClient.fetch("/api/auth/logout", {
        method: "POST",
      });
      expect(logoutR.status).toBe(200);

      // Verify token no longer works
      const r2 = await sellerClient.fetch("/api/dashboard");
      expect(r2.status).toBe(401);
    });

    itOrSkip("logout without auth token still returns 200 (idempotent)", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "x-forwarded-for": uniqueIp() },
      });
      expect(r.status).toBe(200);
    });
  });

  describe("must_change_password flag", () => {
    itOrSkip("create operator sets must_change_password=true", async () => {
      const adminClient = await getAdminClient();
      const uniqueEmail = `mustflag-${Date.now()}@test.com`;
      const createR = await adminClient.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Must Flag Test", email: uniqueEmail, password: "TestPass123" }),
      });
      const createD = await createR.json();
      expect(createD.operator.must_change_password).toBe(true);

      // Login should also return mustChangePassword=true
      const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "TestPass123" }),
      });
      const loginD = await loginR.json();
      expect(loginD.mustChangePassword).toBe(true);

      // Cleanup
      await adminClient.fetch(`/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
      });
    });

    itOrSkip("reset-password with auto-generated password sets must_change_password=true", async () => {
      const adminClient = await getAdminClient();
      const uniqueEmail = `resetmust-${Date.now()}@test.com`;
      const createR = await adminClient.fetch("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ name: "Reset Must Test", email: uniqueEmail, password: "InitialPass1" }),
      });
      const createD = await createR.json();

      // First change the password to clear must_change_password (so we can test reset).
      // Need a cookie/CSRF-aware client for this operator since /api/auth/change-password
      // is a POST (CSRF-protected).
      const opClient = await createTestClient(uniqueEmail, "InitialPass1", uniqueIp());
      await opClient.fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword: "InitialPass1", newPassword: "ChangedPass1" }),
      });

      // Now admin resets password (auto-generate)
      const resetR = await adminClient.fetch(`/api/admin/operators/${createD.operator.operator_id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({}),  // auto-generate
      });
      const resetD = await resetR.json();
      expect(resetD.ok).toBe(true);
      expect(resetD.generatedPassword).toBeTruthy();
      expect(resetD.mustChangePassword).toBe(true);

      // Login with the new password — should return mustChangePassword=true
      const login2R = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: resetD.generatedPassword }),
      });
      const login2D = await login2R.json();
      expect(login2D.mustChangePassword).toBe(true);

      // Cleanup
      await adminClient.fetch(`/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
      });
    });
  });
});
