/**
 * GET /api/admin/sessions
 *
 * Returns all active (non-expired, non-revoked) sessions. Admin-only.
 *
 * Response: { ok: true, sessions: [...] } | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listActiveSessions } from "@/lib/sessions";

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const sessions = listActiveSessions(200);

    return NextResponse.json({
      ok: true,
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        operatorId: s.operator_id,
        operatorEmail: s.operator_email,
        operatorRole: s.operator_role,
        issuedAt: s.issued_ts,
        expiresAt: s.expires_ts,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
