/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's info including their name
 * and organization name (for personalized greeting + footer).
 *
 * Response: { ok, email, name, role, mustChangePassword, organizationId, organizationName } | { ok: false }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getReadonlyDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // Fetch the operator's name + organization name from the DB
  let operatorName = auth.user.email.split("@")[0]; // fallback: email prefix
  let organizationName = "Faith-El";

  try {
    const db = getReadonlyDb();
    try {
      const op = db.prepare(`
        SELECT o.name AS operator_name, org.name AS org_name
        FROM operators o
        LEFT JOIN organizations org ON o.organization_id = org.organization_id
        WHERE o.operator_id = ?
      `).get(auth.user.operatorId) as { operator_name: string; org_name: string | null } | undefined;

      if (op) {
        operatorName = op.operator_name || operatorName;
        organizationName = op.org_name || organizationName;
      }
    } finally {
      db.close();
    }
  } catch {
    // If DB query fails, use fallbacks
  }

  return NextResponse.json({
    ok: true,
    email: auth.user.email,
    name: operatorName,
    role: auth.user.role,
    mustChangePassword: auth.user.mustChangePassword,
    operatorId: auth.user.operatorId,
    organizationId: auth.user.organizationId,
    organizationName,
  });
}
