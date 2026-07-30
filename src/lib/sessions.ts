/**
 * Session management.
 *
 * Replaces the old stateless base64 token with a DB-backed session.
 * Every login creates a session row; every authenticated request
 * validates the session exists + isn't revoked; admin can revoke
 * any session (force-logout).
 *
 * Token format (backward-compatible with old format for the auth header):
 *   Header: x-auth-token: <sessionId>
 *   Session ID: 32-char hex string (crypto.randomBytes(16).toString("hex"))
 *
 * The session ID is opaque — it doesn't encode any user info. All user
 * info (email, role, must_change_password) is looked up from the sessions
 * table on every request.
 *
 * Sessions expire after 7 days. Expired sessions are treated as revoked.
 */

import crypto from "crypto";
import { getWritableDb, getReadonlyDb } from "@/lib/db";

/** Session lifetime in milliseconds.
 *
 *  Default: 7 days (168 hours).
 *  Override via SESSION_LIFETIME_HOURS env var (see .env.example).
 */
export const SESSION_LIFETIME_MS = (() => {
  const hours = parseInt(process.env.SESSION_LIFETIME_HOURS || "168", 10);
  if (isNaN(hours) || hours < 1) return 7 * 24 * 60 * 60 * 1000;  // fallback: 7 days
  return hours * 60 * 60 * 1000;
})();

export interface Session {
  id: string;
  operator_id: string;
  operator_email: string;
  operator_role: string;
  issued_ts: string;
  expires_ts: string;
  revoked_ts: string | null;
  revoked_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface SessionUser {
  email: string;
  role: string;
  operatorId: string;
  mustChangePassword: boolean;
  sessionId: string;
}

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

function futureISO(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace("Z", "+03:00");
}

/**
 * Create a new session for an operator.
 *
 * @returns The session ID (32-char hex string). The caller should return
 *          this to the client as the auth token.
 */
export function createSession(opts: {
  operatorId: string;
  email: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): string {
  const sessionId = crypto.randomBytes(16).toString("hex");
  const now = nowISO();
  const expires = futureISO(SESSION_LIFETIME_MS);

  const db = getWritableDb();
  try {
    db.prepare(`
      INSERT INTO sessions (id, operator_id, operator_email, operator_role,
                            issued_ts, expires_ts, revoked_ts, revoked_by,
                            ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      sessionId,
      opts.operatorId,
      opts.email,
      opts.role,
      now,
      expires,
      opts.ipAddress || null,
      opts.userAgent || null
    );
    return sessionId;
  } finally {
    db.close();
  }
}

/**
 * Validate a session ID and return the associated user.
 *
 * Returns null if:
 *   - The session ID is malformed
 *   - The session doesn't exist
 *   - The session has been revoked
 *   - The session has expired
 *   - The associated operator has been disabled or deleted
 *
 * @param sessionId  The session ID from the x-auth-token header.
 */
export function validateSession(sessionId: string | null | undefined): SessionUser | null {
  if (!sessionId || typeof sessionId !== "string") return null;
  // Session IDs are 32-char hex strings
  if (!/^[a-f0-9]{32}$/.test(sessionId)) return null;

  let session: Session | null = null;
  try {
    const db = getReadonlyDb();
    try {
      const row = db.prepare(`
        SELECT id, operator_id, operator_email, operator_role,
               issued_ts, expires_ts, revoked_ts, revoked_by,
               ip_address, user_agent
        FROM sessions WHERE id = ?
      `).get(sessionId) as Session | undefined;
      session = row || null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }

  if (!session) return null;

  // Check revoked
  if (session.revoked_ts) return null;

  // Check expired
  const expiresMs = new Date(session.expires_ts).getTime();
  if (Date.now() > expiresMs) return null;

  // Check the operator still exists + is active + has a password hash
  try {
    const db = getReadonlyDb();
    try {
      const op = db.prepare(`
        SELECT status, password_hash, must_change_password
        FROM operators WHERE operator_id = ?
      `).get(session.operator_id) as {
        status: string;
        password_hash: string | null;
        must_change_password: number;
      } | undefined;

      if (!op) return null;  // operator deleted
      if (op.status !== "active") return null;  // operator disabled
      if (!op.password_hash) return null;  // legacy account

      return {
        email: session.operator_email,
        role: session.operator_role,
        operatorId: session.operator_id,
        mustChangePassword: op.must_change_password === 1,
        sessionId: session.id,
      };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * Revoke a session (force-logout).
 *
 * @param sessionId    The session to revoke.
 * @param revokedBy    Who revoked it (typically the admin's email, or "self" for user-initiated logout).
 * @returns            true if a session was revoked, false if it didn't exist.
 */
export function revokeSession(sessionId: string, revokedBy: string): boolean {
  try {
    const db = getWritableDb();
    try {
      const result = db.prepare(`
        UPDATE sessions SET revoked_ts = ?, revoked_by = ?
        WHERE id = ? AND revoked_ts IS NULL
      `).run(nowISO(), revokedBy, sessionId);
      return result.changes > 0;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/**
 * Revoke all sessions for an operator (e.g., when their password is reset
 * or their account is disabled).
 *
 * @param operatorId  The operator whose sessions should be revoked.
 * @param revokedBy   Who initiated the revocation.
 * @returns           Number of sessions revoked.
 */
export function revokeAllSessionsForOperator(operatorId: string, revokedBy: string): number {
  try {
    const db = getWritableDb();
    try {
      const result = db.prepare(`
        UPDATE sessions SET revoked_ts = ?, revoked_by = ?
        WHERE operator_id = ? AND revoked_ts IS NULL
      `).run(nowISO(), revokedBy, operatorId);
      return result.changes;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

/**
 * List active (non-expired, non-revoked) sessions.
 * Used by the admin "Active Sessions" UI.
 */
export function listActiveSessions(limit: number = 100): Session[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  try {
    const db = getReadonlyDb();
    try {
      const now = nowISO();
      return db.prepare(`
        SELECT id, operator_id, operator_email, operator_role,
               issued_ts, expires_ts, revoked_ts, revoked_by,
               ip_address, user_agent
        FROM sessions
        WHERE revoked_ts IS NULL AND expires_ts > ?
        ORDER BY issued_ts DESC
        LIMIT ?
      `).all(now, safeLimit) as Session[];
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}
