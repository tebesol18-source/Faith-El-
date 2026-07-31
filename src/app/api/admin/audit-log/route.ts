/**
 * GET /api/admin/audit-log
 *
 * Returns recent admin audit log entries. Admin-only.
 *
 * Query params:
 *   - limit: max entries to return (default 100, max 500)
 *
 * Response: { ok: true, entries: [...] } | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const entries = readAuditLog(limit);

    return NextResponse.json({
      ok: true,
      count: entries.length,
      entries: entries.map((e: any) => ({
        id: e.id,
        timestamp: e.timestamp,
        actorEmail: e.actor_email,
        actorIp: e.actor_ip,
        action: e.action,
        targetType: e.target_type,
        targetId: e.target_id,
        targetEmail: e.target_email,
        details: e.details ? JSON.parse(e.details) : null,
        success: e.success === 1,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch audit log" },
      { status: 500 }
    );
  }
}
