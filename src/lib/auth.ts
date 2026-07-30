/**
 * Shared authentication module.
 * Validates session tokens for API routes.
 *
 * Phase 3: replaced the stateless base64 token with DB-backed sessions
 * (see src/lib/sessions.ts). Old tokens are rejected — all users must
 * log in again after the Phase 3 migration.
 *
 * Token format: 32-char hex session ID, sent via x-auth-token header
 * (or Authorization: Bearer <sessionId>).
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession, type SessionUser } from "@/lib/sessions";

const ADMIN_EMAIL = "admin@coelrodan.com";

/**
 * Extract the session ID from request headers.
 * Accepts either:
 *   - Authorization: Bearer <sessionId>
 *   - x-auth-token: <sessionId>
 */
export function extractToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.substring(7);
  }
  return request.headers.get("x-auth-token");
}

/**
 * Check if the request is authenticated. Returns the user or null.
 *
 * Phase 3: now validates against the sessions table instead of decoding
 * a base64 token. The session ID is opaque; user info comes from the DB.
 */
export function checkAuth(request: NextRequest): SessionUser | null {
  const sessionId = extractToken(request);
  if (!sessionId) return null;
  return validateSession(sessionId);
}

/**
 * Middleware-like helper: returns 401 if not authenticated.
 *
 * Also detects the `mustChangePassword` flag — if set, only allows
 * the user to call /api/auth/change-password and /api/auth/logout.
 * All other API calls return 403 with a clear message.
 */
export function requireAuth(request: NextRequest):
  | { user: SessionUser }
  | { error: NextResponse } {
  const user = checkAuth(request);
  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Unauthorized — please log in" },
        { status: 401 }
      ),
    };
  }

  // If the user must change their password, restrict them to only the
  // change-password + logout endpoints. Everything else returns 403.
  if (user.mustChangePassword) {
    const url = new URL(request.url);
    const allowedPaths = ["/api/auth/change-password", "/api/auth/logout"];
    if (!allowedPaths.some((p) => url.pathname === p)) {
      return {
        error: NextResponse.json(
          {
            ok: false,
            error: "You must change your password before continuing.",
            mustChangePassword: true,
          },
          { status: 403 }
        ),
      };
    }
  }

  return { user };
}

/**
 * Admin-only variant of requireAuth. Returns 403 if the user is not an admin.
 */
export function requireAdmin(request: NextRequest):
  | { user: SessionUser }
  | { error: NextResponse } {
  const result = requireAuth(request);
  if ("error" in result) return result;
  if (result.user.role !== "admin") {
    return {
      error: NextResponse.json(
        { ok: false, error: "Forbidden — admin access required" },
        { status: 403 }
      ),
    };
  }
  return result;
}

// Re-export for backward compatibility with code that imports from @/lib/auth
export type { SessionUser };
