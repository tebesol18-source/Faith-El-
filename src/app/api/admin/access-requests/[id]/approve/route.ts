/**
 * POST /api/admin/access-requests/[id]/approve
 *
 * Approves a pending access request and creates a new operator account.
 *
 * Body: {
 *   password?: string,       (optional — if omitted, a random 16-char password is generated and returned)
 *   role?: "admin" | "manager" | "operator" | "viewer",  (default: "operator")
 *   notes?: string,         (optional reviewer notes)
 * }
 *
 * Flow:
 *   1. Fetch the pending access request by ID
 *   2. Verify it's still 'pending' (409 if already reviewed)
 *   3. Verify no operator exists with that email (409 if exists — admin should
 *      tell the requester to log in instead)
 *   4. Generate operator_id (next available "exporter-NNN")
 *   5. Hash the password + insert into operators
 *   6. Update the access_request: status='approved', reviewed_by, reviewed_ts,
 *      review_notes, created_operator_id
 *   7. Return the new operator + generated password (if auto-generated)
 *
 * The admin must communicate the password to the requester out-of-band
 * (email/phone) — this is the only time the plaintext password is visible.
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb, getReadonlyDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  hashPassword,
  generateTempPassword,
  validatePasswordStrength,
} from "@/lib/password";
import { writeAuditLog } from "@/lib/audit";

const VALID_ROLES = ["admin", "manager", "operator", "viewer"];

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

function generateOperatorId(): string {
  const db = getReadonlyDb();
  try {
    const row = db.prepare(`
      SELECT operator_id FROM operators
      WHERE operator_id LIKE 'exporter-%'
      ORDER BY CAST(SUBSTR(operator_id, 10) AS INTEGER) DESC
      LIMIT 1
    `).get() as { operator_id: string } | undefined;
    if (row) {
      const num = parseInt(row.operator_id.replace("exporter-", ""), 10);
      return `exporter-${String(num + 1).padStart(3, "0")}`;
    }
    return "exporter-001";
  } finally {
    db.close();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;
  const reviewer = auth.user.email;

  try {
    const { id: requestIdStr } = await params;
    const requestId = parseInt(requestIdStr, 10);
    if (isNaN(requestId)) {
      return NextResponse.json({ ok: false, error: "Invalid request ID" }, { status: 400 });
    }

    // ─── Parse body (optional) ───
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK — defaults will be used
    }

    const { password, role, notes } = body;
    const finalRole = role || "operator";
    if (!VALID_ROLES.includes(finalRole)) {
      return NextResponse.json(
        { ok: false, error: `Role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // ─── Determine the password ───
    let pwd: string;
    let wasGenerated: boolean;
    if (password !== undefined && password !== null) {
      if (typeof password !== "string") {
        return NextResponse.json({ ok: false, error: "password must be a string" }, { status: 400 });
      }
      const strengthError = validatePasswordStrength(password);
      if (strengthError) {
        return NextResponse.json({ ok: false, error: strengthError }, { status: 400 });
      }
      pwd = password;
      wasGenerated = false;
    } else {
      pwd = generateTempPassword(16);
      wasGenerated = true;
    }

    const db = getWritableDb();
    try {
      // ─── 1. Fetch the access request ───
      const req = db.prepare(`
        SELECT id, name, email, company, job_title, phone, message, status
        FROM account_requests WHERE id = ?
      `).get(requestId) as any;

      if (!req) {
        return NextResponse.json({ ok: false, error: "Access request not found" }, { status: 404 });
      }
      if (req.status !== "pending") {
        return NextResponse.json(
          { ok: false, error: `Request already ${req.status} — cannot approve again` },
          { status: 409 }
        );
      }

      // ─── 2. Check no operator exists with this email ───
      const existingOp = db.prepare(`
        SELECT operator_id FROM operators WHERE LOWER(email) = ?
      `).get((req.email as string).toLowerCase()) as { operator_id: string } | undefined;
      if (existingOp) {
        return NextResponse.json(
          { ok: false, error: "An operator with this email already exists — reject this request instead" },
          { status: 409 }
        );
      }

      // ─── 3. Generate operator_id + hash password ───
      const newOperatorId = generateOperatorId();
      const passwordHash = hashPassword(pwd);
      const now = nowISO();

      // ─── 4. Insert the new operator (must_change_password=1 since pwd is auto-generated) ───
      db.prepare(`
        INSERT INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts)
        VALUES (?, ?, ?, ?, 'active', ?, 1, ?, ?)
      `).run(newOperatorId, req.name, (req.email as string).toLowerCase(), finalRole, passwordHash, now, now);

      // ─── 5. Update the access request ───
      db.prepare(`
        UPDATE account_requests
        SET status = 'approved',
            reviewed_by = ?,
            reviewed_ts = ?,
            review_notes = ?,
            created_operator_id = ?
        WHERE id = ?
      `).run(reviewer, now, notes || null, newOperatorId, requestId);

      // ─── 6. Audit log ───
      writeAuditLog({
        actorEmail: reviewer,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
        action: "access_request.approve",
        targetType: "access_request",
        targetId: String(requestId),
        targetEmail: req.email,
        details: {
          createdOperatorId: newOperatorId,
          role: finalRole,
          autoGeneratedPassword: wasGenerated,
          notes: notes || null,
        },
      });
      // Also log the operator.create action for the new operator
      writeAuditLog({
        actorEmail: reviewer,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
        action: "operator.create",
        targetType: "operator",
        targetId: newOperatorId,
        targetEmail: req.email,
        details: { role: finalRole, status: "active", viaAccessRequest: requestId },
      });

      return NextResponse.json({
        ok: true,
        requestId,
        status: "approved",
        operator: {
          operator_id: newOperatorId,
          name: req.name,
          email: req.email,
          role: finalRole,
          status: "active",
          created_ts: now,
          must_change_password: true,
        },
        // Only return the password if we generated it
        ...(wasGenerated ? { generatedPassword: pwd } : {}),
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/admin/access-requests/[id]/approve] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to approve request — please try again" },
      { status: 500 }
    );
  }
}
