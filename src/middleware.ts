/**
 * Next.js middleware — request ID + structured logging + rate limiting.
 *
 * For every /api/* request:
 *   1. Generate (or accept) a request ID and attach it as `x-request-id` header
 *   2. Log the incoming request (method, path, IP, request ID)
 *   3. Apply rate limiting (per-IP, per-route)
 *   4. Log the response status + duration
 *   5. Pass through to the route handler
 *
 * Rate limits:
 *   - POST /api/auth/login:           10 req/min per IP (brute-force protection)
 *   - POST /api/auth/request-access:   5 req/min per IP (spam protection)
 *   - POST /api/agents/research-leads: 5 req/min per IP (expensive)
 *   - POST /api/approvals:            30 req/min per IP
 *   - All other /api/* routes:       120 req/min per IP (general API limit)
 *
 * When the limit is exceeded, returns 429 Too Many Requests with standard
 * rate-limit headers + Retry-After.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, getClientId } from "@/lib/rate-limit";
import { logger, generateRequestId } from "@/lib/logger";

/** Routes that should be rate-limited, with per-route overrides. */
const ROUTE_LIMITS: { pattern: RegExp; limit: number; windowMs: number }[] = [
  // Login — strict limit to prevent brute-force
  { pattern: /^\/api\/auth\/login$/, limit: 10, windowMs: 60_000 },
  // Request access — even stricter to prevent spam of the admin queue
  { pattern: /^\/api\/auth\/request-access$/, limit: 5, windowMs: 60_000 },
  // Lead research — expensive (creates leads in DB)
  { pattern: /^\/api\/agents\/research-leads$/, limit: 5, windowMs: 60_000 },
  // Approvals — moderately expensive (DB writes + supervisor interaction)
  { pattern: /^\/api\/approvals$/, limit: 30, windowMs: 60_000 },
];

/** Default limit for any other /api/* route. */
const DEFAULT_API_LIMIT = 120;
const DEFAULT_API_WINDOW_MS = 60_000;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Only process /api/* routes — static assets and pages pass through
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip the root /api route (just a health check)
  if (pathname === "/api") {
    return NextResponse.next();
  }

  // ─── Request ID ───
  // Accept an incoming x-request-id header (so callers can correlate logs
  // across services), or generate one if not provided.
  const requestId = request.headers.get("x-request-id") || generateRequestId();

  // ─── Client identification ───
  const clientId = getClientId(request);
  const ip = clientId === "anonymous" ? null : clientId;

  // ─── Log the incoming request ───
  logger.info("request.start", {
    requestId,
    method,
    path: pathname,
    ip,
    userAgent: request.headers.get("user-agent") || null,
  });

  const startTime = Date.now();

  // ─── Rate limiting ───
  const routeLimit = ROUTE_LIMITS.find((r) => r.pattern.test(pathname)) ?? {
    limit: DEFAULT_API_LIMIT,
    windowMs: DEFAULT_API_WINDOW_MS,
  };

  const result = rateLimit(clientId, routeLimit.limit, routeLimit.windowMs);

  // Always set rate-limit headers on the response, even on success
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
      requestId,
      method,
      path: pathname,
      ip,
      limit: result.limit,
      remaining: result.remaining,
      retryAfter: retryAfterSec,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests — please slow down.",
        retryAfter: retryAfterSec,
        requestId,
      },
      { status: 429, headers }
    );
  }

  // ─── Pass through to the route handler ───
  // We attach the request ID as a header so the route handler can read it
  // via `request.headers.get("x-request-id")` and include it in its own logs.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Copy rate-limit + request ID headers onto the response
  for (const [k, v] of headers.entries()) {
    response.headers.set(k, v);
  }

  // ─── Log the response (we can't easily capture the status code here because
  // Next.js middleware runs before the route handler. The route handler logs
  // its own completion. But we can log that we passed through.) ───
  // Note: actual response status + duration is logged by the route handler
  // via getRequestLogger().info("request.complete", { status, durationMs }).

  return response;
}

export const config = {
  /**
   * Match all /api/* routes. Static assets (_next/static, _next/image,
   * favicon.ico) are excluded automatically by Next.js.
   */
  matcher: ["/api/:path*"],
};
