/**
 * Tests for src/lib/auth-client.ts — apiFetch content-type behavior.
 *
 * Regression test for the booking-confirmation upload defect found by the
 * Logistics Command Center E2E journey: apiFetch used to force
 * `Content-Type: application/json` onto EVERY request with a body, which
 * broke multipart uploads (the browser must set multipart/form-data with
 * its own boundary). The fix: never override the content type of a
 * FormData body.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch } from "@/lib/auth-client";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

function captureFetch(): { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  global.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init || {} });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  return { calls };
}

describe("apiFetch content-type handling", () => {
  it("sets application/json for string bodies by default", async () => {
    const { calls } = captureFetch();
    await apiFetch("/api/x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does NOT set a content-type for FormData bodies (browser sets multipart)", async () => {
    const { calls } = captureFetch();
    const form = new FormData();
    form.append("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), "confirm.pdf");
    await apiFetch("/api/logistics/documents", { method: "POST", body: form });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("keeps an explicitly provided content-type", async () => {
    const { calls } = captureFetch();
    await apiFetch("/api/x", {
      method: "POST",
      body: "raw",
      headers: { "Content-Type": "text/plain" },
    });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Content-Type")).toBe("text/plain");
  });
});
