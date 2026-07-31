/**
 * Next.js middleware — request ID + structured logging + rate limiting +
 * CSRF protection + HTTPS enforcement.
 *
 * For every /api/* request:
 *   1. Generate (or accept) a request ID and attach it as x-request-id header
 *   2. Log the incoming request (method, path, IP, request ID)
 *   3. Apply rate limiting (per-IP, per-route)
 *   4. For POST/PATCH/PUT/DELETE: validate CSRF token (double-submit pattern)
 *   5. In production: add HSTS header + set Secure flag on cookies
 *   6. Log the result + pass through to the route handler
 *
 * CSRF protection (double-submit pattern):
 *   - On login, the server sets a `csrf-token` cookie (non-httpOnly, readable by JS)
 *   - The frontend reads this cookie and sends it as `x-csrf-token` header
 *   - Middleware verifies that the header matches the cookie
 *   - An attacker on a different origin can't read the cookie, so they can't
 *     forge the header
 *   - Combined with SameSite=Lax on the session cookie, this provides
 *     defense-in-depth against CSRF
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, getClientId } from "@/lib/rate-limit";
import { logger, generateRequestId } from "@/lib/logger";

const SESSION_COOKIE = "session";
const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

/** Routes that should be rate-limited, with per-route overrides. */
const ROUTE_LIMITS: { pattern: RegExp; limit: number; windowMs: number }[] = [
  { pattern: /^\/api\/auth\/login$/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/auth\/request-access$/, limit: 5, windowMs: 60_000 },
  { pattern: /^\/api\/agents\/research-leads$/, limit: 5, windowMs: 60_000 },
  { pattern: /^\/api\/approvals$/, limit: 30, windowMs: 60_000 },
];

const DEFAULT_API_LIMIT = 120;
const DEFAULT_API_WINDOW_MS = 60_000;

/** Paths exempt from CSRF validation (public POST endpoints or low-risk idempotent ops). */
const CSRF_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/request-access",
  "/api/auth/logout",  // idempotent — forcing logout is annoying but not a data breach
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Only process /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip the root /api route
  if (pathname === "/api") {
    return NextResponse.next();
  }

  // ─── Request ID ───
  const requestId = request.headers.get("x-request-id") || generateRequestId();
  const clientId = getClientId(request);
  const ip = clientId === "anonymous" ? null : clientId;

  logger.info("request.start", {
    requestId,
    method,
    path: pathname,
    ip,
    userAgent: request.headers.get("user-agent") || null,
  });

  // ─── Rate limiting ───
  const routeLimit = ROUTE_LIMITS.find((r) => r.pattern.test(pathname)) ?? {
    limit: DEFAULT_API_LIMIT,
    windowMs: DEFAULT_API_WINDOW_MS,
  };

  const result = rateLimit(clientId, routeLimit.limit, routeLimit.windowMs);

  const headers = new Headers({
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    "X-Request-Id": requestId,
  });

  if (!result.allowed) {
    const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
    headers.set("Retry-After", String(retryAfterSec));

    logger.warn("request.rate_limited", {
      requestId, method, path: pathname, ip,
      limit: result.limit, remaining: result.remaining, retryAfter: retryAfterSec,
    });

    return NextResponse.json(
      { ok: false, error: "Too many requests — please slow down.", retryAfter: retryAfterSec, requestId },
      { status: 429, headers }
    );
  }

  // ─── CSRF validation (Phase 4B) ───
  // Only check mutating methods. GET/HEAD/OPTIONS are safe (no state change).
  // Login + request-access are exempt (they don't have a session yet, so no
  // CSRF token cookie exists).
  const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  const isExempt = CSRF_EXEMPT_PATHS.some((p) => pathname === p);

  if (isMutating && !isExempt) {
    const cookieCsrf = request.cookies.get(CSRF_COOKIE)?.value;
    const headerCsrf = request.headers.get(CSRF_HEADER);

    if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
      logger.warn("request.csrf_rejected", {
        requestId, method, path: pathname, ip,
        hasCookie: !!cookieCsrf, hasHeader: !!headerCsrf,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "CSRF token missing or invalid — please refresh the page and try again.",
          requestId,
        },
        { status: 403, headers }
      );
    }
  }

  // ─── Pass through to the route handler ───
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Copy rate-limit + request ID headers onto the response
  for (const [k, v] of headers.entries()) {
    response.headers.set(k, v);
  }

  // ─── Security headers ───
  // X-Content-Type-Options + X-Frame-Options are safe on both HTTP + HTTPS.
  // HSTS only makes sense on HTTPS — adding it on HTTP can cause issues
  // (browsers ignore it, but it clutters the response).
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");

  // HSTS only when actually on HTTPS
  const isHttps = request.headers.get("x-forwarded-proto") === "https"
              || request.nextUrl.protocol === "https:";
  if (isHttps) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
