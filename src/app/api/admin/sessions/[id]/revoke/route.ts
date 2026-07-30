/**
 * POST /api/admin/sessions/[id]/revoke
 *
 * Revokes a single session (force-logout). Admin-only.
 *
 * Body: (none)
 * Response: { ok: true, revokedSessionId } | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revokeSession } from "@/lib/sessions";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { id: sessionId } = await params;

    const revoked = revokeSession(sessionId, `admin (${auth.user.email})`);
    if (!revoked) {
      return NextResponse.json(
        { ok: false, error: "Session not found or already revoked" },
        { status: 404 }
      );
    }

    writeAuditLog({
      actorEmail: auth.user.email,
      actorIp: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
      action: "session.revoke",
      targetType: "session",
      targetId: sessionId,
    });

    return NextResponse.json({
      ok: true,
      revokedSessionId: sessionId,
    });
  } catch (error: any) {
    console.error("[/api/admin/sessions/[id]/revoke] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to revoke session — please try again" },
      { status: 500 }
    );
  }
}
