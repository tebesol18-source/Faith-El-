/**
 * Security regression tests.
 * Verifies specific security remediations and protections:
 *   1. Lead History route auth reinforcement (/api/leads/[id]/history)
 *   2. Content-Security-Policy (CSP) headers on API endpoints
 *   3. Double-submit CSRF cookie validation checks on mutating methods
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

describe("Security Regression and Hardening", () => {
  describe("Lead History Endpoint Authentication Checks", () => {
    itOrSkip("GET /api/leads/L-2026-00001/history returns 401 without auth", async () => {
      const r = await fetch(`${BASE_URL}/api/leads/L-2026-00001/history`);
      expect(r.status).toBe(401);
    });

    itOrSkip("GET /api/leads/L-2026-00001/history returns 200/404 with valid auth", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/leads/L-2026-00001/history");
      // Since it might not exist, 404 is acceptable, but it should NOT be 401
      expect([200, 404]).toContain(r.status);
    });
  });

  describe("Content Security Policy (CSP) Headers on API responses", () => {
    itOrSkip("GET /api/health includes default-src 'self' CSP header", async () => {
      const r = await fetch(`${BASE_URL}/api/health`);
      expect(r.headers.get("content-security-policy")).toBe(
        "default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; connect-src 'self';"
      );
    });

    itOrSkip("GET /api/dashboard with auth includes default-src 'self' CSP header", async () => {
      const client = await getAdminClient();
      const r = await client.fetch("/api/dashboard");
      expect(r.headers.get("content-security-policy")).toBe(
        "default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; connect-src 'self';"
      );
    });
  });

  describe("CSRF Double-Submit Protection on mutating endpoints", () => {
    itOrSkip("POST /api/agents/Agent%201/pause without CSRF header returns 403", async () => {
      const client = await getAdminClient();
      // Use the client cookies but explicitly remove x-csrf-token from options.headers
      const r = await fetch(`${BASE_URL}/api/agents/Agent%201/pause`, {
        method: "POST",
        headers: {
          "cookie": client.cookieString,
          "x-auth-token": client.token,
        },
      });
      expect(r.status).toBe(403);
      const data = await r.json();
      expect(data.error).toContain("CSRF token missing or invalid");
    });

    itOrSkip("POST /api/agents/Agent%201/pause with invalid CSRF header returns 403", async () => {
      const client = await getAdminClient();
      const r = await fetch(`${BASE_URL}/api/agents/Agent%201/pause`, {
        method: "POST",
        headers: {
          "cookie": client.cookieString,
          "x-auth-token": client.token,
          "x-csrf-token": "completely_invalid_csrf_token_value",
        },
      });
      expect(r.status).toBe(403);
    });
  });
});
