/**
 * Test helper: cookie-aware HTTP client for integration tests.
 *
 * Node's fetch() doesn't manage cookies automatically (unlike browsers).
 * This helper:
 *   1. Logs in via the API
 *   2. Extracts the session + CSRF cookies from the Set-Cookie response
 *   3. Returns a `fetchWithCookies` function that sends both cookies
 *      + the CSRF header on mutations
 *
 * Usage:
 *   const client = await createTestClient("admin@faithel.com", "admin123");
 *   const r = await client.fetch("/api/admin/operators", { method: "POST", body: ... });
 */

// Base URL of the server under test.
// - Default: a dev server the developer started themselves (npm run dev).
// - scripts/run-tests.mjs sets TEST_BASE_URL to an ISOLATED server it boots
//   against a throwaway COPY of the committed DB (state/test-coffee_export.db)
//   so the test suite can never pollute the committed database.
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

interface TestClient {
  /** The session token (for backward-compat header auth). */
  token: string;
  /** The CSRF token (from the non-httpOnly cookie). */
  csrfToken: string;
  /** Cookie string for the Cookie header. */
  cookieString: string;
  /** fetch wrapper that includes cookies + CSRF header. */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
}

function extractCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookie = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookie) {
    const match = cookie.match(/^([^=]+)=([^;]*)/);
    if (match) {
      cookies[match[1]] = match[2];
    }
  }
  return cookies;
}

let _ipCounter = 0;

/** Unique-per-login test IP — prevents the suite from self-rate-limiting when
 * many parallel test files log in within the same minute. Vitest runs each
 * test file in its OWN worker process, so a plain counter would restart at 0
 * in every file and collide across files. Mixing process.pid (unique per
 * worker) + a per-call counter + randomness makes collisions effectively
 * impossible. Explicitly passed IPs always win. */
function nextTestIp(): string {
  _ipCounter++;
  const pidSlot = (typeof process !== "undefined" ? process.pid : 1) % 200 + 1;
  const counter = (_ipCounter % 250) + 1;
  const rand = Math.floor(Math.random() * 250) + 1;
  return `10.${pidSlot}.${counter}.${rand}`;
}

export async function createTestClient(
  email: string = "admin@faithel.com",
  password: string = "admin123",
  ip: string = nextTestIp()
): Promise<TestClient> {
  const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email, password }),
  });

  const loginD = await loginR.json();
  if (!loginD.ok) {
    throw new Error(`Login failed for ${email}: ${loginD.error}`);
  }

  const cookies = extractCookies(loginR);
  const sessionToken = cookies["session"] || loginD.token;
  const csrfToken = cookies["csrf-token"] || "";

  if (!csrfToken) {
    throw new Error("Login response did not include csrf-token cookie");
  }

  const cookieString = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  return {
    token: sessionToken,
    csrfToken,
    cookieString,
    fetch(url: string, options: RequestInit = {}): Promise<Response> {
      const headers = new Headers(options.headers);

      // Send cookies
      headers.set("cookie", cookieString);

      // Also send x-auth-token for backward compat (some routes may still check it)
      headers.set("x-auth-token", sessionToken);

      // Send the client IP — otherwise every test client lands in the shared
      // "anonymous" rate-limit bucket and the suite 429s itself once it
      // exceeds the default 120 req/min. Per-client IPs give each test its
      // own bucket (matches real-world distinct clients). Explicit
      // per-request overrides still win.
      if (!headers.has("x-forwarded-for")) {
        headers.set("x-forwarded-for", ip);
      }

      // Add CSRF token for mutations
      const method = (options.method || "GET").toUpperCase();
      if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
        headers.set("x-csrf-token", csrfToken);
      }

      if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(`${BASE_URL}${url}`, { ...options, headers });
    },
  };
}

/** Simple fetch with just the auth header (for backward-compat tests that
 *  don't need cookies — e.g., testing that header auth still works). */
export function fetchWithHeader(
  url: string,
  token: string,
  options: RequestInit = {},
  ip: string = nextTestIp()
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("x-auth-token", token);
  headers.set("x-forwarded-for", ip);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${BASE_URL}${url}`, { ...options, headers });
}

// ─── Cached clients (one per role) ───
let _adminClient: Promise<TestClient> | null = null;
let _sellerClient: Promise<TestClient> | null = null;

/** Get a cached admin test client (creates one on first call — unique IP per file/process). */
export function getAdminClient(): Promise<TestClient> {
  if (!_adminClient) {
    _adminClient = createTestClient("admin@faithel.com", "admin123", nextTestIp());
  }
  return _adminClient;
}

/** Get a cached seller test client (creates one on first call — unique IP per file/process). */
export function getSellerClient(): Promise<TestClient> {
  if (!_sellerClient) {
    _sellerClient = createTestClient("abi@faithel.com", "coffee123", nextTestIp());
  }
  return _sellerClient;
}

/** Get just the admin token (for backward-compat GET-only tests). */
export async function getAdminToken(): Promise<string> {
  const client = await getAdminClient();
  return client.token;
}

/** Get just the seller token (for backward-compat GET-only tests). */
export async function getSellerToken(): Promise<string> {
  const client = await getSellerClient();
  return client.token;
}
