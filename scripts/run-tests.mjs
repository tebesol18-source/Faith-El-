#!/usr/bin/env node
/**
 * scripts/run-tests.mjs — Hermetic test runner.
 *
 * WHY THIS EXISTS: the integration suite talks to a live Next.js server over
 * HTTP, and that server used to run against the COMMITTED database
 * (state/coffee_export.db). Every `npm test` therefore wrote test operators,
 * sessions, password-history rows and audit entries into the repo artifact —
 * that is exactly how the 8 leaked "Phase 2 Test" operators ended up
 * committed (see worklog: audit-74d55f6 findings).
 *
 * WHAT THIS DOES (root-cause fix):
 *   1. Copies state/coffee_export.db -> state/test-coffee_export.db
 *      (name deliberately contains "coffee_export.db" — tests/lib/db.test.ts
 *      asserts the resolved path contains that substring).
 *   2. Boots a dedicated `next dev` server on port 3100 with
 *      DATABASE_PATH pointed at the throwaway copy.
 *   3. Warms up every /api route (next dev compiles per-route on first hit;
 *      warming avoids first-request timeouts inside the suite).
 *   4. Runs vitest (full suite, or the path glob you pass) with
 *      TEST_BASE_URL=http://localhost:<port> and DATABASE_PATH set so
 *      in-process tests (tests/lib/*) hit the same throwaway copy.
 *   5. Tears the server down, deletes the throwaway DB (+ -wal/-shm),
 *      and exits with vitest's exit code.
 *
 * The committed DB is NEVER opened for writing by anything in this flow.
 * Verify anytime: git status --short state/coffee_export.db  (must stay clean)
 *
 * Usage:
 *   node scripts/run-tests.mjs                     # full suite
 *   node scripts/run-tests.mjs tests/integration   # just integration tests
 *   TEST_PORT=3200 node scripts/run-tests.mjs      # custom port
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DB = path.join(ROOT, "state", "coffee_export.db");
const TEST_DB = path.join(ROOT, "state", "test-coffee_export.db");
const PORT = parseInt(process.env.TEST_PORT || "3100", 10);
const BASE_URL = `http://localhost:${PORT}`;

// Optional positional argument: test path filter (default: full suite)
const filter = process.argv[2] || "";

const log = (...a) => console.log("[run-tests]", ...a);

// ─── Preflight ─────────────────────────────────────────────────────────────
if (!fs.existsSync(SRC_DB) || fs.statSync(SRC_DB).size === 0) {
  console.error(`[run-tests] FATAL: committed DB not found or empty: ${SRC_DB}`);
  process.exit(1);
}

// Refuse to clobber a live DB copy left behind by a crashed run — remove it.
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

// ─── 1. Fresh throwaway copy of the committed DB ───────────────────────────
fs.copyFileSync(SRC_DB, TEST_DB);
log("created throwaway test DB:", TEST_DB);

// ─── 2. Boot the isolated dev server ───────────────────────────────────────
// Spawn the Next binary directly (not via npm run dev) so we own the exact
// process tree and can kill it reliably. detached:true gives it its own
// process group on POSIX, so cleanup can kill the whole group.
const server = spawn(
  process.execPath,
  [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT)],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_PATH: TEST_DB,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  }
);

const serverLog = fs.createWriteStream(path.join(ROOT, "state", "test-server.log"), { flags: "w" });
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);

/** Kill the server (whole process group on POSIX, tree on Windows). */
function killServer() {
  if (server.killed || server.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-server.pid, "SIGTERM"); // negative pid = process group
    }
  } catch {
    try { server.kill("SIGTERM"); } catch { /* already gone */ }
  }
}

async function shutdown(code) {
  killServer();
  await new Promise((r) => {
    const t = setTimeout(() => {
      try { if (process.platform !== "win32") process.kill(-server.pid, "SIGKILL"); } catch { /* gone */ }
      r();
    }, 5000);
    server.on("exit", () => { clearTimeout(t); r(); });
  });
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  log("server stopped, throwaway DB removed");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

// ─── 3. Wait for boot, then warm every /api route ──────────────────────────
async function waitForServer(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not become healthy on ${BASE_URL} within ${timeoutMs}ms (see state/test-server.log)`);
}

/** Login helper for warmup. */
async function warmLogin(email, password) {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify({ email, password }),
  });
  const setCookies = r.headers.getSetCookie?.() || [];
  const cookies = setCookies.map(c => c.split(";")[0]).join("; ");
  return { ok: r.ok, cookies };
}

async function warmRoutes() {
  // Collect every /api route path from the filesystem
  const apiRoot = path.join(ROOT, "src", "app", "api");
  const routes = [];
  const walk = (dir, routePath) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith("[") && e.name.endsWith("]")) {
        // Dynamic segment — warm with a placeholder (an operator id that
        // exists, else a generic "1"). Compiling the route module is what
        // matters: even a 404 response still compiles it.
        const placeholder = e.name.includes("operator") ? "exporter-002" : "1";
        routes.push(`${routePath}/${placeholder}`);
        continue;
      }
      walk(path.join(dir, e.name), `${routePath}/${e.name}`);
    }
    if (routePath) routes.push(routePath);
  };
  if (fs.existsSync(apiRoot)) walk(apiRoot, "/api");

  const admin = await warmLogin("admin@faithel.com", "admin123");
  // GET every route (405/404 responses still compile the route module).
  await Promise.all(routes.map(async (route) => {
    try {
      await fetch(`${BASE_URL}${route}`, { headers: { cookie: admin.cookies } });
    } catch { /* warmup is best-effort */ }
  }));
  log(`warmed ${routes.length} API routes`);
}

// ─── 4. Run vitest against the isolated server ──────────────────────────────
async function main() {
  try {
    await waitForServer();
    log("server healthy at", BASE_URL);
    await warmRoutes();
  } catch (e) {
    console.error(`[run-tests] ${e.message}`);
    await shutdown(1);
  }

  const vitestArgs = ["vitest", "run", ...(filter ? [filter] : [])];
  log("running: npx", vitestArgs.join(" "));

  const code = await new Promise((resolve) => {
    const vitest = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      vitestArgs,
      {
        cwd: ROOT,
        env: { ...process.env, TEST_BASE_URL: BASE_URL, DATABASE_PATH: TEST_DB },
        stdio: "inherit",
      }
    );
    vitest.on("exit", (c) => resolve(c ?? 1));
    vitest.on("error", (e) => { console.error("[run-tests] failed to start vitest:", e.message); resolve(1); });
  });

  await shutdown(code);
}

main();
