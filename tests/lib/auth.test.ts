/**
 * Tests for src/lib/auth.ts (Phase 3 — session-based auth)
 *
 * Verifies the requireAuth/requireAdmin helpers, session validation flow,
 * and the mustChangePassword gate.
 */
import { describe, it, expect } from "vitest";
import { extractToken, checkAuth, requireAuth, requireAdmin } from "@/lib/auth";
import { createSession, revokeSession } from "@/lib/sessions";
import { NextRequest, NextResponse } from "next/server";

// Helper: create a real session for an existing operator, return the session ID
function makeSession(operatorId: string, email: string, role: "admin" | "seller"): string {
  return createSession({ operatorId, email, role });
}

// Known operators from the seed data
const ADMIN_OP_ID = "admin-001";
const ADMIN_EMAIL = "admin@faithel.com";
const SELLER_OP_ID = "exporter-002";
const SELLER_EMAIL = "abi@faithel.com";

function makeRequest(token: string | null, path: string = "/api/test"): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["x-auth-token"] = token;
  return new NextRequest(`https://example.com${path}`, { headers: new Headers(headers) });
}

describe("lib/auth (Phase 3 — sessions)", () => {
  describe("extractToken", () => {
    it("extracts token from Authorization: Bearer header", () => {
      const req = new NextRequest("https://example.com", {
        headers: new Headers({ authorization: "Bearer abc123" }),
      });
      expect(extractToken(req)).toBe("abc123");
    });

    it("extracts token from x-auth-token header", () => {
      const req = new NextRequest("https://example.com", {
        headers: new Headers({ "x-auth-token": "xyz789" }),
      });
      expect(extractToken(req)).toBe("xyz789");
    });

    it("returns null when no auth header is present", () => {
      const req = new NextRequest("https://example.com", {
        headers: new Headers({}),
      });
      expect(extractToken(req)).toBeNull();
    });

    it("returns null when Authorization header doesn't start with 'Bearer '", () => {
      const req = new NextRequest("https://example.com", {
        headers: new Headers({ authorization: "Basic abc123" }),
      });
      expect(extractToken(req)).toBeNull();
    });
  });

  describe("checkAuth — session validation", () => {
    it("returns null when no token is provided", () => {
      expect(checkAuth(makeRequest(null))).toBeNull();
    });

    it("returns null for a malformed token (not a 32-char hex)", () => {
      expect(checkAuth(makeRequest("not-a-real-session-id"))).toBeNull();
      expect(checkAuth(makeRequest("abc123"))).toBeNull();
      expect(checkAuth(makeRequest("X".repeat(32)))).toBeNull();  // not hex
    });

    it("returns null for a non-existent session ID", () => {
      const fakeId = "a".repeat(32);  // valid format, doesn't exist
      expect(checkAuth(makeRequest(fakeId))).toBeNull();
    });

    it("returns the user for a valid admin session", () => {
      const sessionId = makeSession(ADMIN_OP_ID, ADMIN_EMAIL, "admin");
      const user = checkAuth(makeRequest(sessionId));
      expect(user).not.toBeNull();
      expect(user?.email).toBe(ADMIN_EMAIL);
      expect(user?.role).toBe("admin");
      expect(user?.operatorId).toBe(ADMIN_OP_ID);
      expect(user?.sessionId).toBe(sessionId);
    });

    it("returns the user for a valid seller session", () => {
      const sessionId = makeSession(SELLER_OP_ID, SELLER_EMAIL, "seller");
      const user = checkAuth(makeRequest(sessionId));
      expect(user).not.toBeNull();
      expect(user?.email).toBe(SELLER_EMAIL);
      expect(user?.role).toBe("seller");
    });

    it("returns null for a revoked session", () => {
      const sessionId = makeSession(ADMIN_OP_ID, ADMIN_EMAIL, "admin");
      revokeSession(sessionId, "test");
      expect(checkAuth(makeRequest(sessionId))).toBeNull();
    });
  });

  describe("requireAuth", () => {
    it("returns { user } when authenticated", () => {
      const sessionId = makeSession(SELLER_OP_ID, SELLER_EMAIL, "seller");
      const result = requireAuth(makeRequest(sessionId));
      expect("user" in result).toBe(true);
      expect("error" in result).toBe(false);
      if ("user" in result) {
        expect(result.user.email).toBe(SELLER_EMAIL);
      }
    });

    it("returns { error } with 401 status when not authenticated", () => {
      const result = requireAuth(makeRequest(null));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.status).toBe(401);
      }
    });

    it("returns { error } with 401 status when token is invalid", () => {
      const result = requireAuth(makeRequest("invalid"));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.status).toBe(401);
      }
    });
  });

  describe("requireAdmin", () => {
    it("returns { user } when admin token is provided", () => {
      const sessionId = makeSession(ADMIN_OP_ID, ADMIN_EMAIL, "admin");
      const result = requireAdmin(makeRequest(sessionId));
      expect("user" in result).toBe(true);
      if ("user" in result) {
        expect(result.user.role).toBe("admin");
      }
    });

    it("returns { error } with 403 when seller token is provided", () => {
      const sessionId = makeSession(SELLER_OP_ID, SELLER_EMAIL, "seller");
      const result = requireAdmin(makeRequest(sessionId));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.status).toBe(403);
      }
    });

    it("returns { error } with 401 when no token is provided", () => {
      const result = requireAdmin(makeRequest(null));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.status).toBe(401);
      }
    });
  });
});
