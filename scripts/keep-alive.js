/**
 * scripts/keep-alive.js
 *
 * Pings /api/health every 5 minutes to prevent the workspace's
 * dev server from going to sleep (cold starts).
 *
 * Also restarts the supervisor if it's not running (checked via
 * the health endpoint's "supervisor" field).
 *
 * Usage:
 *   node scripts/keep-alive.js
 *
 * Runs forever — kill with Ctrl+C or pkill.
 */

const HEALTH_URL = process.env.HEALTH_URL || "http://localhost:3000/api/health";
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SUPERVISOR_SCRIPT = require("path").resolve(__dirname, "supervisor.js");

let consecutiveFailures = 0;
const MAX_FAILURES = 3;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function ping() {
  try {
    const response = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log(`⚠️  Health check returned HTTP ${response.status}`);
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_FAILURES) {
        log(`❌ ${consecutiveFailures} consecutive failures — server may be down`);
      }
      return;
    }

    const data = await response.json();
    consecutiveFailures = 0; // reset on success

    log(
      `✅ ${data.status} | DB: ${data.database} | Supervisor: ${data.supervisor} | ` +
      `Queue: ${data.queueDepth} | Uptime: ${data.uptime}s | Latency: ${data.checks.dbLatencyMs}ms`
    );

    // If supervisor is stopped/unknown, try to restart it
    if (data.database === "up" && (data.supervisor === "stopped" || data.supervisor === "unknown")) {
      log(`🔄 Supervisor is ${data.supervisor} — attempting to restart...`);
      try {
        const { spawn } = require("child_process");
        const child = spawn("node", [SUPERVISOR_SCRIPT], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        log(`   ✓ Supervisor restart signal sent (PID: ${child.pid})`);
      } catch (err) {
        log(`   ❌ Failed to restart supervisor: ${err.message}`);
      }
    }
  } catch (err) {
    consecutiveFailures++;
    log(`❌ Ping failed: ${err.message}`);
    if (consecutiveFailures >= MAX_FAILURES) {
      log(`   ${consecutiveFailures} consecutive failures — server may be down`);
      log(`   The workspace may have restarted. Run "npm run start:all" to restart everything.`);
    }
  }
}

log(`Keep-alive monitor started`);
log(`  Health URL: ${HEALTH_URL}`);
log(`  Ping interval: ${PING_INTERVAL_MS / 1000}s`);
log(`  Will auto-restart supervisor if it's stopped`);
log("");

// Ping immediately, then every 5 minutes
ping();
setInterval(ping, PING_INTERVAL_MS);
