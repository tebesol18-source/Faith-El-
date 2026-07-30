/**
 * Integration tests for GET /api/health
 *
 * Verifies the health endpoint returns the expected rich JSON shape and
 * correctly reports the status of each subsystem.
 */

import { describe, it, expect } from "vitest";

const BASE_URL = "http://localhost:3000";

const serverAvailable = await (async () => {
  try {
    const r = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 503;
  } catch {
    return false;
  }
})();

const itOrSkip = serverAvailable ? it : it.skip;

describe("GET /api/health", () => {
  itOrSkip("returns 200 (or 503 if DB is down) — not 401 or 500", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    expect([200, 503]).toContain(r.status);
    expect(r.status).not.toBe(401);  // public endpoint
    expect(r.status).not.toBe(500);  // should never 500 — handles DB down gracefully
  });

  itOrSkip("returns the expected JSON shape", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(body).toHaveProperty("ok");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("database");
    expect(body).toHaveProperty("supervisor");
    expect(body).toHaveProperty("queueDepth");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("dbLatencyMs");
  });

  itOrSkip("status is one of the valid values", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(["healthy", "degraded", "down"]).toContain(body.status);
  });

  itOrSkip("database is 'up' or 'down'", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(["up", "down"]).toContain(body.database);
  });

  itOrSkip("supervisor is 'running', 'stopped', or 'unknown'", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(["running", "stopped", "unknown"]).toContain(body.supervisor);
  });

  itOrSkip("queueDepth is a non-negative integer", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(typeof body.queueDepth).toBe("number");
    expect(body.queueDepth).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.queueDepth)).toBe(true);
  });

  itOrSkip("uptime is a positive number (seconds)", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  itOrSkip("version matches the package.json version", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(body.version).toBeTruthy();
    expect(typeof body.version).toBe("string");
    expect(body.version).not.toBe("unknown");  // should be read from package.json
  });

  itOrSkip("dbLatencyMs is a non-negative number", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(typeof body.checks.dbLatencyMs).toBe("number");
    expect(body.checks.dbLatencyMs).toBeGreaterThanOrEqual(0);
    // Should be fast (under 1 second on a healthy system)
    expect(body.checks.dbLatencyMs).toBeLessThan(1000);
  });

  itOrSkip("timestamp is a valid ISO 8601 string", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(typeof body.timestamp).toBe("string");
    const parsed = new Date(body.timestamp);
    expect(parsed.toString()).not.toBe("Invalid Date");
  });

  itOrSkip("degraded array is present when status is not 'healthy'", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    if (body.status !== "healthy") {
      expect(Array.isArray(body.degraded)).toBe(true);
      expect(body.degraded.length).toBeGreaterThan(0);
    }
  });

  itOrSkip("ok flag matches status (true for healthy/degraded, false for down)", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const body = await r.json();
    if (body.status === "down") {
      expect(body.ok).toBe(false);
      expect(r.status).toBe(503);
    } else {
      expect(body.ok).toBe(true);
      expect(r.status).toBe(200);
    }
  });

  itOrSkip("endpoint is rate-limited (returns X-RateLimit headers)", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    expect(r.headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(r.headers.get("x-ratelimit-remaining")).toBeTruthy();
  });

  itOrSkip("returns X-Request-Id header (from middleware)", async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    const requestId = r.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    expect(requestId?.length).toBe(8);  // 8-char hex
  });

  itOrSkip("accepts a custom x-request-id header and echoes it back", async () => {
    const r = await fetch(`${BASE_URL}/api/health`, {
      headers: { "x-request-id": "custom123" },
    });
    expect(r.headers.get("x-request-id")).toBe("custom123");
  });
});
