/**
 * POST /api/auth/change-password
 *
 * Allows an authenticated user to change their own password.
 * Required when `must_change_password=1` (set on first login after admin
 * creates the account, or after an admin resets the password).
 *
 * Flow:
 *   1. Validate the old password against the stored hash
 *   2. Validate the new password meets strength requirements
 *   3. Reject if new password == old password (no-op)
 *   4. Hash the new password + update the operator row
 *   5. Clear `must_change_password=0`
 *   6. Revoke all OTHER sessions for this operator (so a stolen old
 *      session can't be used after the password is changed). Keep the
 *      current session alive so the user doesn't get logged out.
 *   7. Return success
 *
 * Body: { oldPassword: string, newPassword: string }
 * Response: { ok: true } | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "@/lib/password";
import { writeAuditLog } from "@/lib/audit";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(request: NextRequest) {
  // Auth — any logged-in user can change their own password.
  // (requireAuth allows this endpoint through even when mustChangePassword is true.)
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const user = auth.user;

  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { oldPassword, newPassword } = body;

    // ─── Validate inputs ───
    if (!oldPassword || typeof oldPassword !== "string") {
      return NextResponse.json(
        { ok: false, error: "Current password is required" },
        { status: 400 }
      );
    }
    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { ok: false, error: "New password is required" },
        { status: 400 }
      );
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return NextResponse.json({ ok: false, error: strengthError }, { status: 400 });
    }

    if (oldPassword === newPassword) {
      return NextResponse.json(
        { ok: false, error: "New password must be different from the current password" },
        { status: 400 }
      );
    }

    const db = getWritableDb();
    try {
      // ─── Fetch the operator's current password hash ───
      const op = db.prepare(`
        SELECT password_hash, must_change_password FROM operators WHERE operator_id = ?
      `).get(user.operatorId) as {
        password_hash: string | null;
        must_change_password: number;
      } | undefined;

      if (!op || !op.password_hash) {
        return NextResponse.json(
          { ok: false, error: "Account not found — please log in again" },
          { status: 404 }
        );
      }

      // ─── Verify the old password ───
      if (!verifyPassword(oldPassword, op.password_hash)) {
        return NextResponse.json(
          { ok: false, error: "Current password is incorrect" },
          { status: 401 }
        );
      }

      // ─── Phase 4B: Check password history (prevent reusing last 5) ───
      const recentHashes = db.prepare(`
        SELECT password_hash FROM password_history
        WHERE operator_id = ?
        ORDER BY created_ts DESC
        LIMIT 5
      `).all(user.operatorId) as { password_hash: string }[];

      for (const row of recentHashes) {
        if (verifyPassword(newPassword, row.password_hash)) {
          return NextResponse.json(
            { ok: false, error: "Cannot reuse a recent password — please choose a different one" },
            { status: 400 }
          );
        }
      }

      // ─── Store old hash in history BEFORE updating ───
      db.prepare(`
        INSERT INTO password_history (operator_id, password_hash, created_ts)
        VALUES (?, ?, ?)
      `).run(user.operatorId, op.password_hash, nowISO());

      // ─── Hash the new password + update ───
      const newHash = hashPassword(newPassword);
      db.prepare(`
        UPDATE operators
        SET password_hash = ?, must_change_password = 0, updated_ts = ?
        WHERE operator_id = ?
      `).run(newHash, nowISO(), user.operatorId);

      // ─── Revoke all OTHER sessions (keep current alive) ───
      db.prepare(`
        UPDATE sessions SET revoked_ts = ?, revoked_by = ?
        WHERE operator_id = ? AND id != ? AND revoked_ts IS NULL
      `).run(nowISO(), `self (password change)`, user.operatorId, user.sessionId);

      // ─── Audit log ───
      writeAuditLog({
        actorEmail: user.email,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
        action: "operator.reset_password",
        targetType: "operator",
        targetId: user.operatorId,
        targetEmail: user.email,
        details: { selfInitiated: true },
      });

      return NextResponse.json({
        ok: true,
        mustChangePassword: false,  // flag is now cleared
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/auth/change-password] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to change password — please try again" },
      { status: 500 }
    );
  }
}
