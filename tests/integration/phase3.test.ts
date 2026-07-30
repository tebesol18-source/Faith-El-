/**
 * Integration tests for Phase 3 features:
 *   - Audit log endpoint (GET /api/admin/audit-log)
 *   - Sessions endpoint (GET /api/admin/sessions)
 *   - Session revocation (POST /api/admin/sessions/[id]/revoke)
 *   - Change password endpoint (POST /api/auth/change-password)
 *   - Logout endpoint (POST /api/auth/logout)
 *   - must_change_password flag is set correctly on operator create + reset
 */

import { describe, it, expect } from "vitest";

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

let _adminToken: string | undefined;
async function adminToken(): Promise<string> {
  if (_adminToken) return _adminToken;
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
    body: JSON.stringify({ email: "admin@coelrodan.com", password: "admin123" }),
  });
  const d = await r.json();
  _adminToken = d.token as string;
  return _adminToken;
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
      const token = await adminToken();
      const r = await fetch(`${BASE_URL}/api/admin/audit-log?limit=10`, {
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
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
      const token = await adminToken();
      const uniqueEmail = `audit-${Date.now()}@test.com`;

      // Create an operator
      const createR = await fetch(`${BASE_URL}/api/admin/operators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ name: "Audit Test", email: uniqueEmail, password: "TestPass123" }),
      });
      const createD = await createR.json();
      expect(createD.ok).toBe(true);

      // Fetch audit log
      const auditR = await fetch(`${BASE_URL}/api/admin/audit-log?limit=20`, {
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
      const auditD = await auditR.json();
      const createEntry = auditD.entries.find((e: any) =>
        e.action === "operator.create" && e.targetEmail === uniqueEmail
      );
      expect(createEntry).toBeDefined();
      expect(createEntry.actorEmail).toBe("admin@coelrodan.com");

      // Cleanup
      await fetch(`${BASE_URL}/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
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
      const token = await adminToken();
      const r = await fetch(`${BASE_URL}/api/admin/sessions`, {
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
      expect(r.status).toBe(200);
      const d = await r.json();
      expect(d.ok).toBe(true);
      expect(Array.isArray(d.sessions)).toBe(true);
      // The admin's own session should be in the list
      const ownSession = d.sessions.find((s: any) => s.id === token);
      expect(ownSession).toBeDefined();
      expect(ownSession.operatorEmail).toBe("admin@coelrodan.com");
      expect(ownSession.operatorRole).toBe("admin");
    });
  });

  describe("POST /api/admin/sessions/[id]/revoke", () => {
    itOrSkip("admin can revoke another user's session", async () => {
      const adminTok = await adminToken();

      // Login as a seller (creates a separate session)
      const sellerLoginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: "abi@coelrodan.com", password: "coffee123" }),
      });
      const sellerLoginD = await sellerLoginR.json();
      const sellerToken = sellerLoginD.token;

      // Verify seller can access /api/dashboard
      const beforeR = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-auth-token": sellerToken, "x-forwarded-for": uniqueIp() },
      });
      expect(beforeR.status).toBe(200);

      // Admin revokes the seller's session
      const revokeR = await fetch(`${BASE_URL}/api/admin/sessions/${sellerToken}/revoke`, {
        method: "POST",
        headers: { "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
      });
      expect(revokeR.status).toBe(200);
      const revokeD = await revokeR.json();
      expect(revokeD.ok).toBe(true);

      // Verify seller can no longer access /api/dashboard
      const afterR = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-auth-token": sellerToken, "x-forwarded-for": uniqueIp() },
      });
      expect(afterR.status).toBe(401);
    });

    itOrSkip("returns 404 for non-existent session", async () => {
      const token = await adminToken();
      const fakeSessionId = "a".repeat(32);
      const r = await fetch(`${BASE_URL}/api/admin/sessions/${fakeSessionId}/revoke`, {
        method: "POST",
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
      expect(r.status).toBe(404);
    });
  });

  describe("POST /api/auth/change-password", () => {
    itOrSkip("returns 401 without auth", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ oldPassword: "x", newPassword: "y" }),
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("returns 400 for missing fields", async () => {
      const adminTok = await adminToken();
      const r = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("returns 401 for wrong old password", async () => {
      const adminTok = await adminToken();
      const r = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ oldPassword: "wrongPassword", newPassword: "NewPass123" }),
      });
      expect(r.status).toBe(401);
      const d = await r.json();
      expect(d.error).toMatch(/current password/i);
    });

    itOrSkip("returns 400 when new password == old password", async () => {
      const adminTok = await adminToken();
      const r = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ oldPassword: "admin123", newPassword: "admin123" }),
      });
      expect(r.status).toBe(400);
      const d = await r.json();
      expect(d.error).toMatch(/different/i);
    });

    itOrSkip("returns 400 for weak new password", async () => {
      const adminTok = await adminToken();
      const r = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ oldPassword: "admin123", newPassword: "abc" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("full lifecycle: change password + old password fails + new password works", async () => {
      const adminTok = await adminToken();

      // Create a fresh operator for this test
      const uniqueEmail = `changepwd-${Date.now()}@test.com`;
      const createR = await fetch(`${BASE_URL}/api/admin/operators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ name: "Change Pwd Test", email: uniqueEmail, password: "InitialPass1" }),
      });
      const createD = await createR.json();
      const opId = createD.operator.operator_id;

      // Login
      const login1R = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "InitialPass1" }),
      });
      const login1D = await login1R.json();
      expect(login1D.mustChangePassword).toBe(true);
      const token1 = login1D.token;

      // Change password
      const changeR = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token1, "x-forwarded-for": uniqueIp() },
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

      // Current session (token1) STAYS alive — UX choice so the user doesn't
      // get logged out immediately after changing their password.
      // Only OTHER sessions for this operator get revoked.
      const sameSessionR = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-auth-token": token1, "x-forwarded-for": uniqueIp() },
      });
      expect(sameSessionR.status).toBe(200);

      // Cleanup
      await fetch(`${BASE_URL}/api/admin/operators/${opId}`, {
        method: "DELETE",
        headers: { "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
      });
    });
  });

  describe("POST /api/auth/logout", () => {
    itOrSkip("logout revokes the current session", async () => {
      // Login
      const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: "abi@coelrodan.com", password: "coffee123" }),
      });
      const loginD = await loginR.json();
      const token = loginD.token;

      // Verify token works
      const r1 = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
      expect(r1.status).toBe(200);

      // Logout
      const logoutR = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
      expect(logoutR.status).toBe(200);

      // Verify token no longer works
      const r2 = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
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
      const adminTok = await adminToken();
      const uniqueEmail = `mustflag-${Date.now()}@test.com`;
      const createR = await fetch(`${BASE_URL}/api/admin/operators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
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
      await fetch(`${BASE_URL}/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
        headers: { "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
      });
    });

    itOrSkip("reset-password with auto-generated password sets must_change_password=true", async () => {
      const adminTok = await adminToken();
      const uniqueEmail = `resetmust-${Date.now()}@test.com`;
      const createR = await fetch(`${BASE_URL}/api/admin/operators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ name: "Reset Must Test", email: uniqueEmail, password: "InitialPass1" }),
      });
      const createD = await createR.json();

      // First change the password to clear must_change_password (so we can test reset)
      const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "InitialPass1" }),
      });
      const loginD = await loginR.json();
      await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": loginD.token, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ oldPassword: "InitialPass1", newPassword: "ChangedPass1" }),
      });

      // Now admin resets password (auto-generate)
      const resetR = await fetch(`${BASE_URL}/api/admin/operators/${createD.operator.operator_id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
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
      await fetch(`${BASE_URL}/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
        headers: { "x-auth-token": adminTok, "x-forwarded-for": uniqueIp() },
      });
    });
  });
});
