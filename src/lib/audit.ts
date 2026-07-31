/**
 * Audit log writer.
 *
 * Every admin mutation (create/edit/delete operator, reset password,
 * approve/reject access request) writes an entry here. The log is
 * displayed in the Admin → System tab so admins can see who did what,
 * when, and to whom.
 *
 * The writer is best-effort — if the audit log table doesn't exist
 * (e.g., on a DB that hasn't been migrated yet), the write silently
 * fails. This prevents audit failures from breaking the actual mutation.
 */

import { getWritableDb } from "@/lib/db";

export type AuditAction =
  | "operator.create"
  | "operator.update"
  | "operator.delete"
  | "operator.disable"
  | "operator.enable"
  | "operator.reset_password"
  | "access_request.approve"
  | "access_request.reject"
  | "session.revoke";

export type TargetType = "operator" | "access_request" | "session";

export interface AuditEntry {
  actorEmail: string;
  actorIp?: string | null;
  action: AuditAction;
  targetType: TargetType;
  targetId?: string | null;
  targetEmail?: string | null;
  details?: Record<string, any> | null;
  success?: boolean;
}

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

/**
 * Write an entry to the admin audit log.
 *
 * Best-effort: if the table doesn't exist or the write fails, the function
 * returns silently (so the calling mutation still succeeds). This is a
 * deliberate trade-off — we'd rather have the mutation succeed without an
 * audit trail than fail because of an audit-log problem.
 *
 * @returns true if the entry was written, false otherwise.
 */
export function writeAuditLog(entry: AuditEntry): boolean {
  try {
    const db = getWritableDb();
    try {
      db.prepare(`
        INSERT INTO admin_audit_log (
          timestamp, actor_email, actor_ip, action,
          target_type, target_id, target_email, details, success
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nowISO(),
        entry.actorEmail,
        entry.actorIp || null,
        entry.action,
        entry.targetType,
        entry.targetId || null,
        entry.targetEmail || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.success === false ? 0 : 1
      );
      return true;
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn("[audit] Failed to write audit log entry:", err);
    return false;
  }
}

/**
 * Read recent audit log entries.
 *
 * @param limit  Max entries to return (default 100, max 500).
 * @returns      Array of audit entries, newest first.
 */
export function readAuditLog(limit: number = 100): any[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  try {
    // Use a readonly connection — this is a read operation
    const { getReadonlyDb } = require("@/lib/db");
    const db = getReadonlyDb();
    try {
      return db.prepare(`
        SELECT id, timestamp, actor_email, actor_ip, action,
               target_type, target_id, target_email, details, success
        FROM admin_audit_log
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(safeLimit) as any[];
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn("[audit] Failed to read audit log:", err);
    return [];
  }
}
