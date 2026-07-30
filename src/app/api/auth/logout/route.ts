/**
 * POST /api/auth/logout
 *
 * Revokes the current session + clears the session and CSRF cookies.
 * The session ID becomes invalid immediately.
 *
 * Body: (none)
 * Response: { ok: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAuth, SESSION_COOKIE, CSRF_COOKIE } from "@/lib/auth";
import { revokeSession } from "@/lib/sessions";

export async function POST(request: NextRequest) {
  try {
    const user = checkAuth(request);
    if (user) {
      revokeSession(user.sessionId, "self (logout)");
    }

    // Clear both cookies
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,  // immediately expires
    });
    response.cookies.set(CSRF_COOKIE, "", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error: any) {
    console.error("[/api/auth/logout] Error:", error);
    // Even if revoke fails, tell the client to clear the token
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    response.cookies.set(CSRF_COOKIE, "", { httpOnly: false, path: "/", maxAge: 0 });
    return response;
  }
}
