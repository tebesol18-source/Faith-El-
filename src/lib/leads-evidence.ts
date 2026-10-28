/**
 * Lead evidence & verification — shared library (Phase 1: real-lead intake).
 *
 * Three concerns live here:
 *
 *  1. FICTION GUARD — keeps fictional/sample records out of production.
 *     Every lead-creation path (CSV import, directory import, manual contact
 *     add) runs these checks. There is NO sandbox flag on purpose: if you
 *     need demo data, use a separate seeded database — the production DB
 *     must only ever contain real, evidence-backed companies.
 *
 *  2. EVIDENCE HELPERS — reading/writing lead_sources rows (the stored proof
 *     of where a company or contact was found).
 *
 *  3. OUTREACH GATE — the server-side rule that a lead may not enter an
 *     outreach sequence until the COMPANY is verified AND at least one
 *     verified, non-fictional CONTACT email exists.
 */

import type Database from "better-sqlite3";

// ─── 1. Fiction guard ─────────────────────────────────────────────────────

/** Reserved / documentation / test email domains that must never be buyers. */
export const FICTIONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "example.com", "example.org", "example.net",
  "test.com", "test.org", "test.example",
  "invalid", "invalid.com",
  "fake.com", "fakemail.com",
  "dummy.com", "placeholder.com",
  "localhost",
  // The platform's own masked domain — a real buyer is never @faithelexport.com
  "faithelexport.com",
]);

export const FICTIONAL_EMAIL_TLDS: readonly string[] = [".test", ".example", ".invalid", ".localhost"];

export function isFictionalEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return false;
  const domain = trimmed.split("@").pop() || "";
  if (FICTIONAL_EMAIL_DOMAINS.has(domain)) return true;
  return FICTIONAL_EMAIL_TLDS.some((tld) => domain.endsWith(tld));
}

export function isEmailFormatValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * Heuristics for generated/placeholder company names. The old synthetic
 * generator's signature was a trailing 5-digit number ("Heritage Bean Co 24238").
 */
export function looksFictionalCompany(name: string | null | undefined): string | null {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (/\s\d{5}$/.test(trimmed)) {
    return `company name ends with a 5-digit number ("${trimmed}") — generated-data pattern`;
  }
  if (/\b(test|sample|demo|placeholder|fictional|dummy|fake)\b/i.test(trimmed)) {
    return `company name contains a placeholder word ("${trimmed}")`;
  }
  return null;
}

/** Validate a lead's contact email; returns an error string or null. */
export function contactEmailError(email: string | null | undefined): string | null {
  if (email === null || email === undefined || email === "") return null; // no email is allowed (unverified lead)
  if (!isEmailFormatValid(email)) return `"${email}" is not a valid email address`;
  if (isFictionalEmail(email)) return `"${email}" is on a reserved/test domain — real buyer contacts only`;
  return null;
}

/** Validate a source URL; returns an error string or null. Empty is handled by the caller. */
export function sourceUrlError(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string" || url.trim() === "") return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return `source URL must be http(s), got "${url.trim()}"`;
    }
    return null;
  } catch {
    return `"${url}" is not a valid URL`;
  }
}

export const VERIFICATION_STATUSES = ["unverified", "verified", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// ─── 2. Evidence helpers ──────────────────────────────────────────────────

export type LeadSourceRow = {
  id: number;
  lead_id: string;
  organization_id: string;
  evidence_for: "company" | "contact" | "both";
  contact_id: number | null;
  source_type: string;
  source_url: string | null;
  source_name: string | null;
  company_as_listed: string | null;
  country: string | null;
  product_interest: string | null;
  checked_ts: string | null;
  checked_by: string | null;
  note: string | null;
  last_check_status: string | null;
  last_check_detail: string | null;
  last_check_ts: string | null;
  created_ts: string;
};

/** Insert an evidence row. Caller supplies verified inputs (org match enforced by DB trigger). */
export function insertLeadSource(
  db: Database.Database,
  row: {
    lead_id: string;
    organization_id: string;
    evidence_for: "company" | "contact" | "both";
    contact_id?: number | null;
    source_type: string;
    source_url?: string | null;
    source_name?: string | null;
    company_as_listed?: string | null;
    country?: string | null;
    product_interest?: string | null;
    checked_ts?: string | null;
    checked_by?: string | null;
    note?: string | null;
    now: string;
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO lead_sources (
        lead_id, organization_id, evidence_for, contact_id, source_type,
        source_url, source_name, company_as_listed, country, product_interest,
        checked_ts, checked_by, note, created_ts, updated_ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.lead_id,
      row.organization_id,
      row.evidence_for,
      row.contact_id ?? null,
      row.source_type,
      row.source_url ?? null,
      row.source_name ?? null,
      row.company_as_listed ?? null,
      row.country ?? null,
      row.product_interest ?? null,
      row.checked_ts ?? row.now,
      row.checked_by ?? null,
      row.note ?? null,
      row.now,
      row.now
    );
  return Number(result.lastInsertRowid);
}

export function getLeadSources(db: Database.Database, leadId: string, orgId: string): LeadSourceRow[] {
  return db
    .prepare(
      `SELECT * FROM lead_sources WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL ORDER BY id ASC`
    )
    .all(leadId, orgId) as LeadSourceRow[];
}

export function logVerificationAction(
  db: Database.Database,
  row: {
    lead_id: string;
    organization_id: string;
    level: "company" | "contact";
    contact_id?: number | null;
    action: "check" | "confirm" | "reject" | "reset";
    result?: string | null;
    detail?: string | null;
    actor: string;
    now: string;
  }
): void {
  db.prepare(
    `INSERT INTO lead_verification_log (lead_id, organization_id, level, contact_id, action, result, detail, actor, created_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.lead_id,
    row.organization_id,
    row.level,
    row.contact_id ?? null,
    row.action,
    row.result ?? null,
    row.detail ?? null,
    row.actor,
    row.now
  );
}

/** Collision-resistant next lead id: L-YYYY-NNNNN, retry with random suffix on collision. */
export function nextLeadId(db: Database.Database, now: string): string {
  const year = now.slice(0, 4);
  const last = db
    .prepare(`SELECT lead_id FROM leads WHERE lead_id LIKE ? ORDER BY CAST(SUBSTR(lead_id, 8) AS INTEGER) DESC LIMIT 1`)
    .get(`L-${year}-%`) as { lead_id: string } | undefined;
  let next = 1;
  if (last?.lead_id) {
    const m = last.lead_id.match(/L-\d{4}-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  let candidate = `L-${year}-${String(next).padStart(5, "0")}`;
  const exists = db.prepare(`SELECT 1 FROM leads WHERE lead_id = ?`).get(candidate);
  if (exists) {
    // Extremely unlikely (concurrent seed), but never fail: fall back to a
    // timestamp-based unique suffix.
    candidate = `L-${year}-${Date.now().toString(36).toUpperCase()}`;
  }
  return candidate;
}

// ─── 3. Outreach gate ─────────────────────────────────────────────────────

export type OutreachGateResult =
  | { ok: true }
  | { ok: false; code: 403 | 404 | 422; error: string; detail?: Record<string, unknown> };

/**
 * The Phase-1 outreach rule, enforced server-side:
 *   a lead may enter an outreach sequence only if
 *     1. it exists in the caller's organization,
 *     2. its company verification_status is 'verified' (not 'rejected', not 'unverified'),
 *     3. it has at least one non-deleted, VERIFIED contact with a valid,
 *        non-fictional email.
 */
export function checkOutreachGate(db: Database.Database, leadId: string, orgId: string): OutreachGateResult {
  const lead = db
    .prepare(
      `SELECT lead_id, company_name, verification_status FROM leads
       WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`
    )
    .get(leadId, orgId) as { lead_id: string; company_name: string; verification_status: string } | undefined;

  if (!lead) return { ok: false, code: 404, error: "Lead not found" };
  if (lead.verification_status === "rejected") {
    return {
      ok: false,
      code: 422,
      error: `Lead "${lead.company_name}" was rejected during verification and cannot enter outreach`,
    };
  }
  if (lead.verification_status !== "verified") {
    return {
      ok: false,
      code: 422,
      error: `Lead "${lead.company_name}" is not verified — verify the company (with evidence) before starting outreach`,
    };
  }

  const contacts = db
    .prepare(
      `SELECT id, name, email, verification_status FROM lead_contacts
       WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL AND email IS NOT NULL AND email <> ''`
    )
    .all(leadId, orgId) as { id: number; name: string; email: string; verification_status: string }[];

  const verified = contacts.filter(
    (c) => c.verification_status === "verified" && !isFictionalEmail(c.email) && isEmailFormatValid(c.email)
  );
  if (verified.length === 0) {
    return {
      ok: false,
      code: 422,
      error: `Lead "${lead.company_name}" has no verified contact with a real email — add a contact with evidence and verify it before outreach`,
      detail: { contactsTotal: contacts.length },
    };
  }
  return { ok: true };
}
