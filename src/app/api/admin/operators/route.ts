/**
 * POST /api/admin/operators
 *
 * Creates a new operator account. Admin-only.
 *
 * Body: {
 *   name: string,           (required, 1-100 chars)
 *   email: string,          (required, valid email, 1-200 chars)
 *   password: string,       (required, 8-200 chars, must pass strength check)
 *   role?: "admin" | "manager" | "operator" | "viewer",  (default: "operator")
 *   status?: "active" | "disabled",                       (default: "active")
 *   operatorId?: string,    (optional, auto-generated if not provided)
 * }
 *
 * Response: { ok: true, operator: {...} } | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb, getReadonlyDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { writeAuditLog } from "@/lib/audit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ["admin", "manager", "operator", "viewer"];
const VALID_STATUSES = ["active", "disabled"];

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

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;

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

    const { name, email, password, role, status, operatorId } = body;

    // ─── Validate required fields ───
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ ok: false, error: "Name must be at most 100 characters" }, { status: 400 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json({ ok: false, error: "Please enter a valid email address" }, { status: 400 });
    }
    if (normalizedEmail.length > 200) {
      return NextResponse.json({ ok: false, error: "Email must be at most 200 characters" }, { status: 400 });
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      return NextResponse.json({ ok: false, error: strengthError }, { status: 400 });
    }

    // ─── Validate optional fields ───
    const finalRole = role || "operator";
    if (!VALID_ROLES.includes(finalRole)) {
      return NextResponse.json(
        { ok: false, error: `Role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const finalStatus = status || "active";
    if (!VALID_STATUSES.includes(finalStatus)) {
      return NextResponse.json(
        { ok: false, error: `Status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (operatorId && (typeof operatorId !== "string" || operatorId.length > 50)) {
      return NextResponse.json({ ok: false, error: "Operator ID must be a string of at most 50 characters" }, { status: 400 });
    }

    const db = getWritableDb();
    try {
      // ─── Check for duplicate email ───
      const existing = db.prepare(`
        SELECT operator_id FROM operators WHERE LOWER(email) = ?
      `).get(normalizedEmail) as { operator_id: string } | undefined;
      if (existing) {
        return NextResponse.json(
          { ok: false, error: "An operator with this email already exists" },
          { status: 409 }
        );
      }

      // ─── Resolve operator_id ───
      const finalOperatorId = (operatorId && operatorId.trim()) || generateOperatorId();

      // Check the auto-generated or provided ID isn't already taken
      const idTaken = db.prepare(`
        SELECT operator_id FROM operators WHERE operator_id = ?
      `).get(finalOperatorId) as { operator_id: string } | undefined;
      if (idTaken) {
        return NextResponse.json(
          { ok: false, error: `Operator ID "${finalOperatorId}" is already taken` },
          { status: 409 }
        );
      }

      // ─── Hash the password ───
      const passwordHash = hashPassword(password);

      // ─── Insert (set must_change_password=1 so user must change on first login) ───
      const now = nowISO();
      db.prepare(`
        INSERT INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(finalOperatorId, name.trim(), normalizedEmail, finalRole, finalStatus, passwordHash, now, now);

      // ─── Audit log ───
      writeAuditLog({
        actorEmail: auth.user.email,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
        action: "operator.create",
        targetType: "operator",
        targetId: finalOperatorId,
        targetEmail: normalizedEmail,
        details: { role: finalRole, status: finalStatus },
      });

      // ─── Return the new operator (without the hash) ───
      return NextResponse.json({
        ok: true,
        operator: {
          operator_id: finalOperatorId,
          name: name.trim(),
          email: normalizedEmail,
          role: finalRole,
          status: finalStatus,
          created_ts: now,
          must_change_password: true,
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/admin/operators POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create operator — please try again" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/operators
 * Returns the full list of operators (without password hashes).
 * Admin-only.
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const db = getReadonlyDb();
    try {
      const rows = db.prepare(`
        SELECT operator_id, name, email, role, status, created_ts, updated_ts
        FROM operators
        ORDER BY created_ts ASC
      `).all() as any[];

      const operators = rows.map((r) => ({
        id: r.operator_id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
        createdTs: r.created_ts,
        updatedTs: r.updated_ts,
      }));

      return NextResponse.json({ ok: true, operators });
    } finally {
      db.close();
    }
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch operators" },
      { status: 500 }
    );
  }
}
