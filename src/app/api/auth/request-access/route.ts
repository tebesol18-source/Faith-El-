/**
 * POST /api/auth/request-access
 *
 * Public endpoint — submits an account access request for admin review.
 *
 * Flow:
 *   1. Validate input (name + email required, format checks)
 *   2. Check if a request already exists with the same email + status='pending'
 *      → return 409 Conflict (don't create duplicates)
 *   3. Check if an operator already exists with this email
 *      → return 409 with a "you already have an account" hint (don't reveal
 *         more than necessary)
 *   4. Insert into account_requests table with status='pending'
 *   5. Return 201 Created
 *
 * Rate limit: 5 requests/minute per IP (configured in src/middleware.ts)
 *
 * Body: { name, email, company?, jobTitle?, message? }
 * Response: { ok: true, requestId, status: "pending" }
 *           | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";

// ─── Input validation ───
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_LIMITS = {
  name: 100,
  email: 200,
  company: 100,
  jobTitle: 100,
  message: 500,
  phone: 50,
} as const;

function validateField(name: keyof typeof FIELD_LIMITS, value: any): string | null {
  // Optional fields may be undefined/null/empty — skip them
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return `${name} must be a string`;
  if (value.length > FIELD_LIMITS[name]) {
    return `${name} must be at most ${FIELD_LIMITS[name]} characters`;
  }
  return null;
}

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { name, email, company, jobTitle, message, phone } = body;

    // ─── Required fields ───
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Name is required" },
        { status: 400 }
      );
    }
    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // ─── Email format ───
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    // ─── Length limits (prevent DoS via large bodies) ───
    const fields: Record<string, any> = { name, email: normalizedEmail, company, jobTitle, message, phone };
    for (const [field, value] of Object.entries(fields)) {
      const err = validateField(field as keyof typeof FIELD_LIMITS, value);
      if (err) {
        return NextResponse.json({ ok: false, error: err }, { status: 400 });
      }
    }

    // ─── Optional fields: coerce to null if empty ───
    const trimmedName = name.trim();
    const trimmedCompany = company && company.trim() ? company.trim() : null;
    const trimmedJobTitle = jobTitle && jobTitle.trim() ? jobTitle.trim() : null;
    const trimmedMessage = message && message.trim() ? message.trim() : null;
    const trimmedPhone = phone && phone.trim() ? phone.trim() : null;

    const db = getWritableDb();
    try {
      // ─── Check 1: already-pending request with this email ───
      const existingPending = db.prepare(`
        SELECT id, submitted_ts FROM account_requests
        WHERE email = ? AND status = 'pending'
        LIMIT 1
      `).get(normalizedEmail) as { id: number; submitted_ts: string } | undefined;

      if (existingPending) {
        return NextResponse.json(
          {
            ok: false,
            error: "You already have a pending request. An administrator will review it soon.",
            requestId: existingPending.id,
          },
          { status: 409 }
        );
      }

      // ─── Check 2: an operator already exists with this email ───
      const existingOperator = db.prepare(`
        SELECT operator_id FROM operators WHERE LOWER(email) = ? LIMIT 1
      `).get(normalizedEmail) as { operator_id: string } | undefined;

      if (existingOperator) {
        return NextResponse.json(
          {
            ok: false,
            error: "An account with this email already exists. Try logging in or use 'Forgot password?' to reset.",
          },
          { status: 409 }
        );
      }

      // ─── Insert the request ───
      const now = nowISO();
      const result = db.prepare(`
        INSERT INTO account_requests (name, email, company, job_title, message, phone, status, submitted_ts)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(trimmedName, normalizedEmail, trimmedCompany, trimmedJobTitle, trimmedMessage, trimmedPhone, now);

      const requestId = (result as any).lastInsertRowid as number;

      return NextResponse.json(
        {
          ok: true,
          requestId,
          status: "pending",
          submittedAt: now,
        },
        { status: 201 }
      );
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/auth/request-access] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to submit request — please try again" },
      { status: 500 }
    );
  }
}
