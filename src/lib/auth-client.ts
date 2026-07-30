"use client";

/**
 * Client-side authentication helpers.
 *
 * Phase 4B: Session token is now stored in an httpOnly cookie set by the
 * server. JavaScript CANNOT read it (that's the point — XSS can't steal it).
 * The browser automatically sends the cookie with every same-origin request.
 *
 * The only thing the frontend needs to manage is the CSRF token, which is
 * stored in a NON-httpOnly cookie so JS can read it and include it in the
 * x-csrf-token header on mutating requests (POST/PATCH/DELETE).
 *
 * Old functions (setAuthToken, getAuthToken, clearAuthToken) are kept as
 * no-ops for backward compatibility — they're called by existing components
 * but no longer do anything (the cookie is managed by the server).
 */

/** Read the CSRF token from the non-httpOnly cookie.
 *  Returns null if the cookie doesn't exist (e.g., user not logged in). */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return match ? match[1] : null;
}

// ─── Backward-compat no-ops (the server manages cookies now) ───
// These are kept so existing imports don't break. They do nothing.

export const ADMIN_EMAIL = "admin@coelrodan.com";

/** No-op — session is stored in httpOnly cookie, not localStorage. */
export function setAuthToken(_token: string) {
  // intentionally empty — cookie is set by /api/auth/login
}

/** No-op — can't read httpOnly cookies from JS. */
export function getAuthToken(): string | null {
  return null;
}

/** No-op — cookie is cleared by /api/auth/logout. */
export function clearAuthToken() {
  // intentionally empty — cookie is cleared by the server
}

/**
 * Authenticated fetch — sends cookies automatically (same-origin) and
 * adds the CSRF token header on mutating requests.
 *
 * Use this instead of raw `fetch()` for all API calls that need auth.
 */
export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Add CSRF token for mutating requests
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
  }

  // credentials: "same-origin" is the default, but be explicit
  return fetch(url, { ...options, headers, credentials: "same-origin" });
}
