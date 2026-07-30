/**
 * Integration tests for API route authentication (Phase 3 — session-based).
 *
 * Verifies that:
 *   1. Every GET route requires a valid session (returns 401 without a token)
 *   2. Every GET route accepts a real session token (returns 200)
 *   3. Admin-only routes (e.g., /api/admin) return 403 for seller sessions
 *   4. POST routes that were already protected still work correctly
 *   5. Login endpoint is public + creates a session
 *   6. Request Access endpoint is public
 *
 * Tests hit the running dev server at http://localhost:3000.
 * Each test uses a unique x-forwarded-for IP to avoid shared rate-limit buckets.
 */
import { describe, it, expect, beforeAll } from "vitest";

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

let ipCounter = 300;
function uniqueIp(): string {
  ipCounter += 1;
  return `80.0.0.${ipCounter}`;
}

// Cache real session tokens — these are obtained by actually logging in,
// so they exist in the sessions table and pass session validation.
let _adminToken: string | undefined;
let _sellerToken: string | undefined;

async function getAdminToken(): Promise<string> {
  if (_adminToken) return _adminToken;
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
    body: JSON.stringify({ email: "admin@coelrodan.com", password: "admin123" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(`Admin login failed: ${d.error}`);
  _adminToken = d.token as string;
  return _adminToken;
}

async function getSellerToken(): Promise<string> {
  if (_sellerToken) return _sellerToken;
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
    body: JSON.stringify({ email: "abi@coelrodan.com", password: "coffee123" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(`Seller login failed: ${d.error}`);
  _sellerToken = d.token as string;
  return _sellerToken;
}

describe("API authentication (integration, Phase 3 sessions)", () => {
  describe("GET routes require authentication", () => {
    const getRoutes = [
      "/api/dashboard",
      "/api/inbox",
      "/api/leads",
      "/api/deals",
      "/api/inventory",
      "/api/samples",
      "/api/quotes",
      "/api/contracts",
      "/api/shipments",
      "/api/compliance",
      "/api/finance",
      "/api/analytics",
      "/api/approvals",
    ];

    for (const route of getRoutes) {
      itOrSkip(`${route} → 401 without token`, async () => {
        const r = await fetch(`${BASE_URL}${route}`, {
          headers: { "x-forwarded-for": uniqueIp() },
        });
        expect(r.status).toBe(401);
        const body = await r.json();
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/Unauthorized|please log in/i);
      });

      itOrSkip(`${route} → 200 with real admin session`, async () => {
        const token = await getAdminToken();
        const r = await fetch(`${BASE_URL}${route}`, {
          headers: {
            "x-auth-token": token,
            "x-forwarded-for": uniqueIp(),
          },
        });
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.ok).toBe(true);
      });
    }
  });

  describe("Admin-only routes", () => {
    itOrSkip("/api/admin → 403 for seller sessions", async () => {
      const token = await getSellerToken();
      const r = await fetch(`${BASE_URL}/api/admin`, {
        headers: {
          "x-auth-token": token,
          "x-forwarded-for": uniqueIp(),
        },
      });
      expect(r.status).toBe(403);
      const body = await r.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/Forbidden|admin/i);
    });

    itOrSkip("/api/admin → 200 for admin sessions", async () => {
      const token = await getAdminToken();
      const r = await fetch(`${BASE_URL}/api/admin`, {
        headers: {
          "x-auth-token": token,
          "x-forwarded-for": uniqueIp(),
        },
      });
      expect(r.status).toBe(200);
    });
  });

  describe("POST routes also require authentication", () => {
    itOrSkip("/api/approvals POST → 401 without token", async () => {
      const r = await fetch(`${BASE_URL}/api/approvals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ id: 99999, action: "approve" }),
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("/api/agents/research-leads POST → 401 without token", async () => {
      const r = await fetch(`${BASE_URL}/api/agents/research-leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ country: "Germany", segment: "roaster", count: 1 }),
      });
      expect(r.status).toBe(401);
    });
  });

  describe("Login endpoint is public", () => {
    itOrSkip("/api/auth/login POST → 401 for wrong password", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: "admin@coelrodan.com", password: "wrong" }),
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("/api/auth/login POST → 400 for missing email", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("/api/auth/login POST → 200 with correct admin credentials", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: "admin@coelrodan.com", password: "admin123" }),
      });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.token).toBeTruthy();
      expect(body.token.length).toBe(32);  // 32-char hex session ID
      expect(body.role).toBe("admin");
      expect(body.mustChangePassword).toBe(false);  // admin account already has changed password
    });

    itOrSkip("/api/auth/login POST → 401 for old demo behavior (any password no longer works)", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: "abi@coelrodan.com", password: "demo" }),
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("/api/auth/login POST → 200 with correct seller credentials (coffee123)", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: "abi@coelrodan.com", password: "coffee123" }),
      });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.token).toBeTruthy();
      expect(body.role).toBe("seller");
      expect(body.name).toBe("Abi Solomon");
    });

    itOrSkip("/api/auth/login POST → 401 for non-existent email (same error as wrong password)", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: "nonexistent@example.com", password: "anything" }),
      });
      expect(r.status).toBe(401);
      const body = await r.json();
      expect(body.error).toBe("Invalid email or password");
    });

    itOrSkip("/api/auth/login POST → 401 for password > 200 chars", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: "admin@coelrodan.com", password: "a".repeat(201) }),
      });
      expect(r.status).toBe(401);
    });
  });

  describe("Request Access endpoint (public)", () => {
    itOrSkip("/api/auth/request-access POST → 400 for missing name", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ email: "newuser@example.com" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("/api/auth/request-access POST → 400 for missing email", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ name: "Test User" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("/api/auth/request-access POST → 400 for invalid email format", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ name: "Test User", email: "not-an-email" }),
      });
      expect(r.status).toBe(400);
    });

    itOrSkip("/api/auth/request-access POST → 409 when email matches existing operator", async () => {
      const r = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ name: "Imposter", email: "abi@coelrodan.com" }),
      });
      expect(r.status).toBe(409);
      const body = await r.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/already exists/i);
    });

    itOrSkip("/api/auth/request-access POST → 201 for valid new request (with phone)", async () => {
      const uniqueEmail = `test-${Date.now()}@example.com`;
      const r = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({
          name: "Test User",
          email: uniqueEmail,
          company: "Test Co",
          jobTitle: "Buyer",
          phone: "+251911987654",
          message: "Integration test",
        }),
      });
      expect(r.status).toBe(201);
      const body = await r.json();
      expect(body.ok).toBe(true);
      expect(body.requestId).toBeGreaterThan(0);
      expect(body.status).toBe("pending");
    });

    itOrSkip("/api/auth/request-access POST → 409 when same email already has pending request", async () => {
      const uniqueEmail = `dup-${Date.now()}@example.com`;
      const headers = {
        "Content-Type": "application/json",
        "x-forwarded-for": uniqueIp(),
      };
      const body = JSON.stringify({ name: "Dup User", email: uniqueEmail });

      const r1 = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST", headers, body,
      });
      expect(r1.status).toBe(201);

      const r2 = await fetch(`${BASE_URL}/api/auth/request-access`, {
        method: "POST", headers, body,
      });
      expect(r2.status).toBe(409);
      const b2 = await r2.json();
      expect(b2.error).toMatch(/pending/i);
    });
  });

  describe("Phase 3 — session validation", () => {
    itOrSkip("malformed tokens (not 32-char hex) are rejected with 401", async () => {
      const r = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: {
          "x-auth-token": "not-a-real-session",
          "x-forwarded-for": uniqueIp(),
        },
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("well-formed but non-existent session IDs are rejected with 401", async () => {
      const fakeId = "a".repeat(32);  // valid format, doesn't exist
      const r = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: {
          "x-auth-token": fakeId,
          "x-forwarded-for": uniqueIp(),
        },
      });
      expect(r.status).toBe(401);
    });

    itOrSkip("logout revokes the session — token becomes invalid", async () => {
      // Login to get a fresh session
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
  });

  describe("Phase 3 — must_change_password gate", () => {
    itOrSkip("account with must_change_password=1 cannot access non-auth endpoints", async () => {
      // Create an operator with must_change_password=1
      const adminToken = await getAdminToken();
      const uniqueEmail = `mustchange-${Date.now()}@test.com`;
      const createR = await fetch(`${BASE_URL}/api/admin/operators`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": adminToken,
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({
          name: "Must Change Test",
          email: uniqueEmail,
          password: "TempPass123",
        }),
      });
      const createD = await createR.json();
      expect(createD.ok).toBe(true);
      expect(createD.operator.must_change_password).toBe(true);

      // Login as the new operator
      const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "TempPass123" }),
      });
      const loginD = await loginR.json();
      expect(loginD.ok).toBe(true);
      expect(loginD.mustChangePassword).toBe(true);
      const token = loginD.token;

      // Try to access /api/dashboard — should be 403
      const r = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
      expect(r.status).toBe(403);
      const body = await r.json();
      expect(body.mustChangePassword).toBe(true);

      // Cleanup: delete the operator
      await fetch(`${BASE_URL}/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
        headers: { "x-auth-token": adminToken, "x-forwarded-for": uniqueIp() },
      });
    });

    itOrSkip("must_change_password account CAN access /api/auth/change-password", async () => {
      const adminToken = await getAdminToken();
      const uniqueEmail = `mustchange2-${Date.now()}@test.com`;
      const createR = await fetch(`${BASE_URL}/api/admin/operators`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": adminToken,
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({
          name: "Must Change Test 2",
          email: uniqueEmail,
          password: "TempPass123",
        }),
      });
      const createD = await createR.json();

      const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: uniqueEmail, password: "TempPass123" }),
      });
      const loginD = await loginR.json();
      const token = loginD.token;

      // Try to change password — should work even with must_change_password=1
      const changeR = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token, "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ oldPassword: "TempPass123", newPassword: "NewPass456" }),
      });
      expect(changeR.status).toBe(200);
      const changeD = await changeR.json();
      expect(changeD.ok).toBe(true);
      expect(changeD.mustChangePassword).toBe(false);

      // Now try to access /api/dashboard — should work
      const r = await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-auth-token": token, "x-forwarded-for": uniqueIp() },
      });
      expect(r.status).toBe(200);

      // Cleanup
      await fetch(`${BASE_URL}/api/admin/operators/${createD.operator.operator_id}`, {
        method: "DELETE",
        headers: { "x-auth-token": adminToken, "x-forwarded-for": uniqueIp() },
      });
    });
  });
});
