/**
 * POST /api/auth/login
 *
 * Validates credentials against the `operators` table and creates a new
 * session. Returns the session ID as the auth token.
 *
 * Flow:
 *   1. Look up operator by email (case-insensitive)
 *   2. Verify password against bcrypt hash in `password_hash` column
 *   3. If valid + status='active' → create session row, return session ID
 *   4. Otherwise → 401
 *
 * Phase 3 changes:
 *   - Token is now a 32-char hex session ID (was base64-encoded JSON)
 *   - Response includes `mustChangePassword` flag — if true, the frontend
 *     must redirect to /change-password before allowing any other action
 *   - Old tokens are invalid — all users must log in again
 *
 * Body: { email: string, password: string }
 * Response: { ok, token, role, email, name, operatorId, mustChangePassword }
 *           | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { verifyPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/password";
import { createSession } from "@/lib/sessions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // ─── Input validation ───
    if (!email || typeof email !== "string" || email.length > 200) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "Password required" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
                      request.headers.get("x-real-ip") ||
                      null;
    const userAgent = request.headers.get("user-agent") || null;

    // ─── Look up operator by email ───
    const db = getReadonlyDb();
    try {
      const operator = db.prepare(`
        SELECT operator_id, name, email, role, status, password_hash, must_change_password
        FROM operators
        WHERE LOWER(email) = ?
      `).get(normalizedEmail) as {
        operator_id: string;
        name: string;
        email: string;
        role: string;
        status: string;
        password_hash: string | null;
        must_change_password: number;
      } | undefined;

      // ─── Account not found ───
      if (!operator) {
        return NextResponse.json(
          { ok: false, error: "Invalid email or password" },
          { status: 401 }
        );
      }

      // ─── Account disabled ───
      if (operator.status !== "active") {
        return NextResponse.json(
          { ok: false, error: "Account is disabled — contact your administrator" },
          { status: 403 }
        );
      }

      // ─── Password hash missing (legacy account) ───
      if (!operator.password_hash) {
        return NextResponse.json(
          { ok: false, error: "Account not fully set up — contact your administrator" },
          { status: 403 }
        );
      }

      // ─── Verify password against bcrypt hash ───
      const passwordValid = verifyPassword(password, operator.password_hash);
      if (!passwordValid) {
        return NextResponse.json(
          { ok: false, error: "Invalid email or password" },
          { status: 401 }
        );
      }

      // ─── Success — create a session ───
      const role = operator.role === "admin" ? "admin" : "seller";
      const sessionId = createSession({
        operatorId: operator.operator_id,
        email: operator.email,
        role,
        ipAddress,
        userAgent,
      });

      return NextResponse.json({
        ok: true,
        token: sessionId,
        role,
        email: operator.email,
        name: operator.name,
        operatorId: operator.operator_id,
        mustChangePassword: operator.must_change_password === 1,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/auth/login] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Login failed — please try again" },
      { status: 500 }
    );
  }
}
