/**
 * Tests for src/lib/rate-limit.ts
 * Verifies the in-memory rate limiter behaves correctly under various scenarios.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, getClientId } from "@/lib/rate-limit";

// The rate-limit module keeps a global Map of buckets. To test in isolation,
// we use unique IDs per test so they don't interfere with each other.
let testCounter = 0;
function uniqueId(): string {
  testCounter += 1;
  return `test-id-${testCounter}`;
}

describe("lib/rate-limit", () => {
  describe("rateLimit — basic behavior", () => {
    it("allows the first request up to the limit", () => {
      const id = uniqueId();
      const result = rateLimit(id, 10, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.limit).toBe(10);
    });

    it("decrements remaining on each hit", () => {
      const id = uniqueId();
      for (let i = 10; i > 0; i--) {
        const result = rateLimit(id, 10, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(i - 1);
      }
    });

    it("blocks requests when the limit is exhausted", () => {
      const id = uniqueId();
      // Exhaust the bucket
      for (let i = 0; i < 10; i++) {
        rateLimit(id, 10, 60_000);
      }
      // 11th request should be blocked
      const result = rateLimit(id, 10, 60_000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("returns resetAt when blocked", () => {
      const id = uniqueId();
      for (let i = 0; i < 5; i++) rateLimit(id, 5, 60_000);
      const result = rateLimit(id, 5, 60_000);
      expect(result.allowed).toBe(false);
      expect(result.resetAt).toBeGreaterThan(Date.now());
      // Reset should be within the window
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60_000);
    });
  });

  describe("rateLimit — separate buckets per ID", () => {
    it("does not share state between different IDs", () => {
      const id1 = uniqueId();
      const id2 = uniqueId();
      // Exhaust id1
      for (let i = 0; i < 10; i++) rateLimit(id1, 10, 60_000);
      // id2 should still have its full quota
      const result = rateLimit(id2, 10, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("blocks id1 but allows id2 independently", () => {
      const id1 = uniqueId();
      const id2 = uniqueId();
      for (let i = 0; i < 10; i++) rateLimit(id1, 10, 60_000);
      expect(rateLimit(id1, 10, 60_000).allowed).toBe(false);
      expect(rateLimit(id2, 10, 60_000).allowed).toBe(true);
    });
  });

  describe("rateLimit — window behavior", () => {
    it("uses a sliding window (old hits expire)", () => {
      const id = uniqueId();
      // Use a very short window (10ms) so we can test expiry
      const windowMs = 10;
      // Hit the limit
      for (let i = 0; i < 5; i++) rateLimit(id, 5, windowMs);
      // Should be blocked
      expect(rateLimit(id, 5, windowMs).allowed).toBe(false);
      // Wait for the window to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Should be allowed again after the window expires
          const result = rateLimit(id, 5, windowMs);
          expect(result.allowed).toBe(true);
          resolve();
        }, windowMs + 50);
      });
    });
  });

  describe("rateLimit — limit boundaries", () => {
    it("works with limit=1 (single request)", () => {
      const id = uniqueId();
      expect(rateLimit(id, 1, 60_000).allowed).toBe(true);
      expect(rateLimit(id, 1, 60_000).allowed).toBe(false);
    });

    it("works with very high limits", () => {
      const id = uniqueId();
      const result = rateLimit(id, 10_000, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9_999);
    });
  });

  describe("getClientId", () => {
    function makeRequest(headers: Record<string, string>): Request {
      return new Request("https://example.com", {
        headers: new Headers(headers),
      });
    }

    it("extracts the first IP from x-forwarded-for", () => {
      const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
      expect(getClientId(req)).toBe("1.2.3.4");
    });

    it("extracts the IP from x-real-ip when no x-forwarded-for", () => {
      const req = makeRequest({ "x-real-ip": "9.8.7.6" });
      expect(getClientId(req)).toBe("9.8.7.6");
    });

    it("prefers x-forwarded-for over x-real-ip", () => {
      const req = makeRequest({
        "x-forwarded-for": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
      });
      expect(getClientId(req)).toBe("1.1.1.1");
    });

    it("falls back to 'anonymous' when no headers are present", () => {
      const req = makeRequest({});
      expect(getClientId(req)).toBe("anonymous");
    });

    it("trims whitespace from x-forwarded-for", () => {
      const req = makeRequest({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" });
      expect(getClientId(req)).toBe("1.2.3.4");
    });
  });
});
