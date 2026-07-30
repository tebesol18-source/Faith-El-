/**
 * /api/admin/operators/[id]
 *
 * PATCH  — Update an operator's role, status, and/or name.
 *          Body: { name?, role?, status? }  (at least one must be provided)
 *          Admin-only. Cannot delete the last admin.
 *
 * DELETE — Remove an operator. Admin-only.
 *          Refuses to delete if it would leave zero admins in the system.
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb, getReadonlyDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { revokeAllSessionsForOperator } from "@/lib/sessions";

const VALID_ROLES = ["admin", "manager", "operator", "viewer"];
const VALID_STATUSES = ["active", "disabled"];

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { id: operatorId } = await params;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { name, role, status } = body;

    // ─── Validate at least one field is provided ───
    if (name === undefined && role === undefined && status === undefined) {
      return NextResponse.json(
        { ok: false, error: "Provide at least one of: name, role, status" },
        { status: 400 }
      );
    }

    // ─── Validate individual fields if provided ───
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ ok: false, error: "Name cannot be empty" }, { status: 400 });
      }
      if (name.length > 100) {
        return NextResponse.json({ ok: false, error: "Name must be at most 100 characters" }, { status: 400 });
      }
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { ok: false, error: `Role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { ok: false, error: `Status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getWritableDb();
    try {
      // ─── Fetch the operator ───
      const existing = db.prepare(`
        SELECT operator_id, name, email, role, status FROM operators WHERE operator_id = ?
      `).get(operatorId) as { operator_id: string; name: string; email: string; role: string; status: string } | undefined;

      if (!existing) {
        return NextResponse.json({ ok: false, error: "Operator not found" }, { status: 404 });
      }

      // ─── Safety: don't allow demoting/disabling the last admin ───
      const newRole = role !== undefined ? role : existing.role;
      const newStatus = status !== undefined ? status : existing.status;
      if (existing.role === "admin" && (newRole !== "admin" || newStatus === "disabled")) {
        const adminCount = (db.prepare(`
          SELECT COUNT(*) as n FROM operators WHERE role = 'admin' AND status = 'active'
        `).get() as any).n;
        if (adminCount <= 1) {
          return NextResponse.json(
            { ok: false, error: "Cannot demote or disable the last active admin — promote another operator first" },
            { status: 400 }
          );
        }
      }

      // ─── Apply the update ───
      const updates: string[] = [];
      const values: any[] = [];
      if (name !== undefined) {
        updates.push("name = ?");
        values.push(name.trim());
      }
      if (role !== undefined) {
        updates.push("role = ?");
        values.push(role);
      }
      if (status !== undefined) {
        updates.push("status = ?");
        values.push(status);
      }
      updates.push("updated_ts = ?");
      values.push(nowISO());
      values.push(operatorId);

      db.prepare(`
        UPDATE operators SET ${updates.join(", ")} WHERE operator_id = ?
      `).run(...values);

      // ─── If disabling, revoke all active sessions for this operator ───
      if (status === "disabled") {
        revokeAllSessionsForOperator(operatorId, `admin (${auth.user.email})`);
      }

      // ─── Audit log ───
      const auditAction = status === "disabled" ? "operator.disable" :
                          status === "active" ? "operator.enable" :
                          "operator.update";
      writeAuditLog({
        actorEmail: auth.user.email,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
        action: auditAction,
        targetType: "operator",
        targetId: existing.operator_id,
        targetEmail: existing.email,
        details: { before: { name: existing.name, role: existing.role, status: existing.status }, after: { name: name ?? existing.name, role: role ?? existing.role, status: status ?? existing.status } },
      });

      // ─── Return the updated operator ───
      const updated = db.prepare(`
        SELECT operator_id, name, email, role, status, updated_ts FROM operators WHERE operator_id = ?
      `).get(operatorId) as any;

      return NextResponse.json({
        ok: true,
        operator: {
          id: updated.operator_id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          status: updated.status,
          updatedTs: updated.updated_ts,
        },
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/admin/operators/[id] PATCH] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update operator — please try again" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { id: operatorId } = await params;

    const db = getWritableDb();
    try {
      // ─── Fetch the operator ───
      const existing = db.prepare(`
        SELECT operator_id, name, email, role, status FROM operators WHERE operator_id = ?
      `).get(operatorId) as { operator_id: string; name: string; email: string; role: string; status: string } | undefined;

      if (!existing) {
        return NextResponse.json({ ok: false, error: "Operator not found" }, { status: 404 });
      }

      // ─── Safety: don't allow deleting the last admin ───
      if (existing.role === "admin" && existing.status === "active") {
        const adminCount = (db.prepare(`
          SELECT COUNT(*) as n FROM operators WHERE role = 'admin' AND status = 'active'
        `).get() as any).n;
        if (adminCount <= 1) {
          return NextResponse.json(
            { ok: false, error: "Cannot delete the last active admin — promote another operator first" },
            { status: 400 }
          );
        }
      }

      // ─── Revoke all sessions for this operator (so they can't log in with old tokens) ───
      revokeAllSessionsForOperator(operatorId, `admin (${auth.user.email}) — account deleted`);

      db.prepare("DELETE FROM operators WHERE operator_id = ?").run(operatorId);

      // ─── Audit log ───
      writeAuditLog({
        actorEmail: auth.user.email,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
        action: "operator.delete",
        targetType: "operator",
        targetId: existing.operator_id,
        targetEmail: existing.email,
      });

      return NextResponse.json({
        ok: true,
        deletedOperatorId: operatorId,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/admin/operators/[id] DELETE] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete operator — please try again" },
      { status: 500 }
    );
  }
}
