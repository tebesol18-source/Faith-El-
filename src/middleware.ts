/**
 * Next.js middleware — rate limiting for all API routes.
 *
 * Limits:
 *   - POST /api/auth/login:  10 req/min per IP   (brute-force protection)
 *   - All other /api/* routes: 120 req/min per IP (general API limit)
 *   - Static assets + pages: not limited
 *
 * When the limit is exceeded, returns 429 Too Many Requests with
 * standard rate-limit headers:
 *   - X-RateLimit-Limit:     total requests allowed per window
 *   - X-RateLimit-Remaining: requests left in current window
 *   - X-RateLimit-Reset:     epoch seconds when window resets
 *   - Retry-After:           seconds until reset
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, getClientId } from "@/lib/rate-limit";

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

  // Only rate-limit /api/* routes — static assets and pages pass through
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip the root /api route (just a health check)
  if (pathname === "/api") {
    return NextResponse.next();
  }

  const clientId = getClientId(request);

  // Find the matching route limit (or use default)
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
  });

  if (!result.allowed) {
    const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
    headers.set("Retry-After", String(retryAfterSec));
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests — please slow down.",
        retryAfter: retryAfterSec,
      },
      { status: 429, headers }
    );
  }

  // Pass through — the route handler will run
  const response = NextResponse.next();
  // Copy rate-limit headers onto the response
  for (const [k, v] of headers.entries()) {
    response.headers.set(k, v);
  }
  return response;
}

export const config = {
  /**
   * Match all /api/* routes. Static assets (_next/static, _next/image,
   * favicon.ico) are excluded automatically by Next.js.
   */
  matcher: ["/api/:path*"],
};
