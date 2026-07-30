/**
 * POST /api/admin/access-requests/[id]/reject
 *
 * Rejects a pending access request. Admin-only.
 *
 * Body: {
 *   notes?: string,   (optional reviewer notes — visible to other admins)
 * }
 *
 * Flow:
 *   1. Fetch the access request by ID
 *   2. Verify it's still 'pending' (409 if already reviewed)
 *   3. Update status='rejected', reviewed_by, reviewed_ts, review_notes
 *   4. Return success (no operator is created)
 *
 * The requester is NOT notified automatically — the admin should contact
 * them out-of-band if appropriate.
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
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
      // Empty body is OK — notes are optional
    }
    const { notes } = body;
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 500)) {
      return NextResponse.json(
        { ok: false, error: "Notes must be a string of at most 500 characters" },
        { status: 400 }
      );
    }

    const db = getWritableDb();
    try {
      // ─── Fetch the access request ───
      const req = db.prepare(`
        SELECT id, status FROM account_requests WHERE id = ?
      `).get(requestId) as { id: number; status: string } | undefined;

      if (!req) {
        return NextResponse.json({ ok: false, error: "Access request not found" }, { status: 404 });
      }
      if (req.status !== "pending") {
        return NextResponse.json(
          { ok: false, error: `Request already ${req.status} — cannot reject again` },
          { status: 409 }
        );
      }

      // ─── Update the request ───
      db.prepare(`
        UPDATE account_requests
        SET status = 'rejected',
            reviewed_by = ?,
            reviewed_ts = ?,
            review_notes = ?
        WHERE id = ?
      `).run(reviewer, nowISO(), notes || null, requestId);

      // ─── Audit log ───
      writeAuditLog({
        actorEmail: reviewer,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
        action: "access_request.reject",
        targetType: "access_request",
        targetId: String(requestId),
        details: { notes: notes || null },
      });

      return NextResponse.json({
        ok: true,
        requestId,
        status: "rejected",
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/admin/access-requests/[id]/reject] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to reject request — please try again" },
      { status: 500 }
    );
  }
}
