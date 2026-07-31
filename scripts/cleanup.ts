/**
 * scripts/cleanup.ts
 *
 * Periodic cleanup job — deletes expired/old rows from the sessions and
 * admin_audit_log tables. Run daily via cron.
 *
 * What it does:
 *   1. Deletes expired sessions (expires_ts in the past)
 *   2. Deletes revoked sessions older than SESSION_CLEANUP_RETENTION_DAYS (default: 7)
 *   3. Archives audit log entries older than AUDIT_LOG_RETENTION_DAYS (default: 90)
 *      — currently just deletes them. For real archiving, write to a JSONL
 *        file before deleting (TODO).
 *
 * Usage:
 *   npx tsx scripts/cleanup.ts
 *   AUDIT_LOG_RETENTION_DAYS=180 npx tsx scripts/cleanup.ts
 *
 * Recommended cron schedule (daily at 3 AM — after backups):
 *   0 3 * * * cd /home/z/my-project && npx tsx scripts/cleanup.ts >> /var/log/coffee-export-cleanup.log 2>&1
 */

import { getWritableDb, getDbPath } from "../src/lib/db";
import { logger } from "../src/lib/logger";
import fs from "fs";
import path from "path";

interface CleanupResult {
  expiredSessionsDeleted: number;
  revokedSessionsDeleted: number;
  auditEntriesArchived: number;
  auditEntriesDeleted: number;
  durationMs: number;
}

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

function main(): CleanupResult {
  const start = Date.now();
  const result: CleanupResult = {
    expiredSessionsDeleted: 0,
    revokedSessionsDeleted: 0,
    auditEntriesArchived: 0,
    auditEntriesDeleted: 0,
    durationMs: 0,
  };

  const auditRetentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "90", 10);
  const sessionRetentionDays = parseInt(process.env.SESSION_CLEANUP_RETENTION_DAYS || "7", 10);

  logger.info("cleanup.start", {
    dbPath: getDbPath(),
    auditRetentionDays,
    sessionRetentionDays,
  });

  const db = getWritableDb();
  try {
    const now = nowISO();

    // ─── 1. Delete expired sessions (expires_ts in the past) ───
    try {
      const r1 = db.prepare(`
        DELETE FROM sessions
        WHERE expires_ts < ? AND revoked_ts IS NULL
      `).run(now);
      result.expiredSessionsDeleted = r1.changes;
      logger.info("cleanup.expired_sessions", { deleted: r1.changes });
    } catch (err: any) {
      logger.error("cleanup.expired_sessions_failed", { error: err.message });
    }

    // ─── 2. Delete revoked sessions older than the retention window ───
    try {
      const r2 = db.prepare(`
        DELETE FROM sessions
        WHERE revoked_ts IS NOT NULL
          AND revoked_ts < datetime('now', ?)
      `).run(`-${sessionRetentionDays} days`);
      result.revokedSessionsDeleted = r2.changes;
      logger.info("cleanup.revoked_sessions", { deleted: r2.changes });
    } catch (err: any) {
      logger.error("cleanup.revoked_sessions_failed", { error: err.message });
    }

    // ─── 3. Archive + delete old audit log entries ───
    try {
      // Archive to a JSONL file before deleting (best-effort)
      const backupDir = path.resolve(process.cwd(), "..", "coffee_export", "data", "audit-archive");
      try {
        fs.mkdirSync(backupDir, { recursive: true });
        const archiveFile = path.join(backupDir, `audit-${new Date().toISOString().substring(0, 10)}.jsonl`);

        const oldEntries = db.prepare(`
          SELECT id, timestamp, actor_email, actor_ip, action,
                 target_type, target_id, target_email, details, success
          FROM admin_audit_log
          WHERE timestamp < datetime('now', ?)
          ORDER BY timestamp ASC
        `).all(`-${auditRetentionDays} days`) as any[];

        if (oldEntries.length > 0) {
          const stream = fs.createWriteStream(archiveFile, { flags: "a" });
          for (const entry of oldEntries) {
            stream.write(JSON.stringify(entry) + "\n");
          }
          stream.end();
          result.auditEntriesArchived = oldEntries.length;
          logger.info("cleanup.audit_archived", {
            count: oldEntries.length,
            file: archiveFile,
          });
        }
      } catch (err: any) {
        // Archiving is best-effort — continue with deletion even if it fails
        logger.warn("cleanup.audit_archive_failed", { error: err.message });
      }

      // Delete the old entries
      const r3 = db.prepare(`
        DELETE FROM admin_audit_log
        WHERE timestamp < datetime('now', ?)
      `).run(`-${auditRetentionDays} days`);
      result.auditEntriesDeleted = r3.changes;
      logger.info("cleanup.audit_deleted", { deleted: r3.changes });
    } catch (err: any) {
      logger.error("cleanup.audit_failed", { error: err.message });
    }

    // ─── 4. Optimize (reclaim free space) ───
    try {
      db.prepare("VACUUM").run();
      logger.info("cleanup.vacuum_complete");
    } catch (err: any) {
      // VACUUM requires exclusive access — may fail if app is running
      logger.warn("cleanup.vacuum_failed", { error: err.message });
    }
  } finally {
    db.close();
  }

  result.durationMs = Date.now() - start;
  logger.info("cleanup.complete", result);
  return result;
}

// ─── Run ───
if (require.main === module) {
  try {
    const result = main();
    console.log("");
    console.log("═══ Cleanup complete ═══");
    console.log(`  Expired sessions deleted:  ${result.expiredSessionsDeleted}`);
    console.log(`  Revoked sessions deleted:  ${result.revokedSessionsDeleted}`);
    console.log(`  Audit entries archived:    ${result.auditEntriesArchived}`);
    console.log(`  Audit entries deleted:     ${result.auditEntriesDeleted}`);
    console.log(`  Duration:                  ${result.durationMs}ms`);
    process.exit(0);
  } catch (err: any) {
    logger.error("cleanup.fatal", { error: err.message, stack: err.stack });
    console.error("Fatal error:", err.message);
    process.exit(1);
  }
}

export { main as runCleanup };
