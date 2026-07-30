/**
 * POST /api/auth/logout
 *
 * Revokes the current session. The session ID becomes invalid immediately.
 *
 * Body: (none)
 * Response: { ok: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { revokeSession } from "@/lib/sessions";

export async function POST(request: NextRequest) {
  try {
    const user = checkAuth(request);
    if (user) {
      revokeSession(user.sessionId, "self (logout)");
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[/api/auth/logout] Error:", error);
    // Even if revoke fails, tell the client to clear the token
    return NextResponse.json({ ok: true });
  }
}
