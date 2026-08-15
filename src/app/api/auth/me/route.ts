/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's info.
 * Used by the frontend on page load to restore the session
 * (prevents "refresh kicks you back to login").
 *
 * Response: { ok, email, role, mustChangePassword } | { ok: false }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    email: auth.user.email,
    role: auth.user.role,
    mustChangePassword: auth.user.mustChangePassword,
    operatorId: auth.user.operatorId,
    organizationId: auth.user.organizationId,
  });
}
