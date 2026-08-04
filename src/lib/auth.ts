/**
 * Shared authentication module.
 * Validates session tokens for API routes.
 *
 * Phase 4B: Session ID is now sent via httpOnly cookie (preferred) or
 * x-auth-token header (backward compat for tests + API clients).
 *
 * Cookie-based auth is more secure because:
 *   - JavaScript can't read the session cookie (XSS can't steal it)
 *   - SameSite=Lax prevents cross-site request forgery on mutations
 *   - Secure flag (in production) prevents transmission over HTTP
 *
 * The x-auth-token header fallback is kept for:
 *   - Integration tests (easier to set headers than cookies in fetch())
 *   - API clients (curl, scripts) that don't have cookie jars
 *   - Backward compatibility during the transition period
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession, type SessionUser } from "@/lib/sessions";

/** Cookie names used for session + CSRF. */
export const SESSION_COOKIE = "session";
export const CSRF_COOKIE = "csrf-token";
export const CSRF_HEADER = "x-csrf-token";

/**
 * Extract the session ID from the request.
 *
 * Priority:
 *   1. httpOnly `session` cookie (set by /api/auth/login)
 *   2. `x-auth-token` header (backward compat)
 *   3. `Authorization: Bearer <sessionId>` header (backward compat)
 */
export function extractToken(request: NextRequest): string | null {
  // 1. Cookie (preferred — Phase 4B)
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) return cookieToken;

  // 2. x-auth-token header (backward compat)
  const headerToken = request.headers.get("x-auth-token");
  if (headerToken) return headerToken;

  // 3. Authorization: Bearer header (backward compat)
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.substring(7);
  }

  return null;
}

/**
 * Check if the request is authenticated. Returns the user or null.
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

/**
 * Guard utility for checking object-level tenant ownership (prevents IDOR).
 */
export function checkTenantOwnership(
  userOrgId: string,
  targetResourceOrgId: string | null | undefined
): { error: NextResponse } | {} {
  const resourceOrg = targetResourceOrgId || "org-system";
  if (userOrgId !== resourceOrg) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Resource not found" },
        { status: 404 }
      ),
    };
  }
  return {};
}

// Re-export for backward compatibility
export type { SessionUser };
