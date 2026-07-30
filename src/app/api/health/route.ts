/**
 * GET /api/health
 *
 * Rich health check — used by load balancers, uptime monitors, and the
 * Admin → System tab. Returns 200 if the system is healthy, 503 if any
 * critical component is down.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     status: "healthy" | "degraded" | "down",
 *     database: "up" | "down",
 *     supervisor: "running" | "stopped" | "unknown",
 *     queueDepth: number,           // pending events waiting to be processed
 *     uptime: number,               // process uptime in seconds
 *     version: string,              // app version from package.json
 *     timestamp: string,            // ISO 8601
 *     checks: {
 *       dbLatencyMs: number,        // how long the DB query took
 *       diskFreeBytes?: number,     // free disk space on the DB volume (best-effort)
 *     },
 *     degraded?: string[],          // list of degraded components (only if status != "healthy")
 *   }
 *
 * This endpoint is PUBLIC (no auth) so external monitors can hit it without
 * provisioning credentials. It only exposes operational metadata — no
 * business data, no user info, no secrets.
 *
 * Rate-limited at the default API limit (120/min per IP) by middleware.
 */

import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import fs from "fs";
import path from "path";

// Read version from package.json at module load (cached for the process lifetime)
const APP_VERSION = (() => {
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
})();

// Track process start time for uptime calculation
const PROCESS_START = Date.now();

interface HealthCheck {
  ok: boolean;
  status: "healthy" | "degraded" | "down";
  database: "up" | "down";
  supervisor: "running" | "stopped" | "unknown";
  queueDepth: number;
  uptime: number;
  version: string;
  timestamp: string;
  checks: {
    dbLatencyMs: number;
    diskFreeBytes?: number;
  };
  degraded?: string[];
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const uptime = Math.floor((Date.now() - PROCESS_START) / 1000);
  const degraded: string[] = [];

  // ─── Database check ───
  let database: "up" | "down" = "up";
  let dbLatencyMs = 0;
  let queueDepth = 0;
  let supervisor: "running" | "stopped" | "unknown" = "unknown";

  const dbStart = Date.now();
  try {
    const db = getReadonlyDb();
    try {
      // Simple liveness probe — if this fails, DB is down
      db.prepare("SELECT 1 as n").get();

      // Count pending events (the supervisor's work queue)
      try {
        const row = db.prepare(
          "SELECT COUNT(*) as n FROM events WHERE status = 'pending'"
        ).get() as { n: number };
        queueDepth = row.n;
      } catch {
        // events table might not exist on a fresh DB — treat as 0
        queueDepth = 0;
      }

      // Check if the supervisor has run recently (last 60 seconds = running,
      // last 5 minutes = stopped, older = unknown)
      try {
        const row = db.prepare(`
          SELECT timestamp FROM supervisor_log
          ORDER BY timestamp DESC LIMIT 1
        `).get() as { timestamp: string } | undefined;

        if (row?.timestamp) {
          const lastRun = new Date(row.timestamp).getTime();
          const ageSec = (Date.now() - lastRun) / 1000;
          if (ageSec < 60) supervisor = "running";
          else if (ageSec < 300) supervisor = "stopped";
          else supervisor = "unknown";
        } else {
          supervisor = "unknown";  // no log entries
        }
      } catch {
        supervisor = "unknown";  // supervisor_log table missing
      }

      dbLatencyMs = Date.now() - dbStart;
    } finally {
      db.close();
    }
  } catch (err: any) {
    database = "down";
    dbLatencyMs = Date.now() - dbStart;
    degraded.push("database");
    logger.error("health.db_check_failed", {
      error: err.message,
      dbLatencyMs,
    });
  }

  // ─── Disk space check (best-effort — may not work on all filesystems) ───
  let diskFreeBytes: number | undefined;
  try {
    const statfs = (fs as any).statfsSync;
    if (typeof statfs === "function") {
      const dbPath = path.resolve(process.cwd(), "..", "coffee_export", "data", "coffee_export.db");
      if (fs.existsSync(dbPath)) {
        const stats = statfs(dbPath);
        diskFreeBytes = stats.bsize * stats.bavail;
      }
    }
  } catch {
    // Don't fail the health check over disk stats
  }

  // ─── Determine overall status ───
  let status: "healthy" | "degraded" | "down" = "healthy";
  if (database === "down") {
    status = "down";
  } else if (supervisor === "stopped" || supervisor === "unknown" || queueDepth > 50) {
    status = "degraded";
    if (supervisor !== "running") degraded.push("supervisor");
    if (queueDepth > 50) degraded.push("queue-backlog");
  }

  const ok = status !== "down";
  const httpStatus = ok ? 200 : 503;

  const response: HealthCheck = {
    ok,
    status,
    database,
    supervisor,
    queueDepth,
    uptime,
    version: APP_VERSION,
    timestamp,
    checks: {
      dbLatencyMs,
      ...(diskFreeBytes !== undefined ? { diskFreeBytes } : {}),
    },
    ...(degraded.length > 0 ? { degraded } : {}),
  };

  logger.info("health.checked", {
    status,
    database,
    supervisor,
    queueDepth,
    dbLatencyMs,
    degraded,
  });

  return NextResponse.json(response, { status: httpStatus });
}
