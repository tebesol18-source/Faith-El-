/**
 * POST /api/leads/import
 *
 * CSV/bulk import of leads researched by a human. Phase 1 contract:
 *
 *   - EVERY row must carry a source_url (where you found this company).
 *     Rows without evidence are rejected — fictional records must never
 *     enter the production database.
 *   - Company names matching generated/placeholder patterns are rejected.
 *   - Contact emails on reserved/test domains (example.com, *.test, the
 *     platform's own masked domain, …) are rejected.
 *   - Accepted rows are created as UNVERIFIED leads with their evidence
 *     attached; verification is a separate, explicit human action
 *     (POST /api/leads/[id]/verify).
 *
 * Expected row shape (any of the alias pairs work):
 *   company|company_name, country|headquarters_country, city|headquarters_city,
 *   website, contact_name|contact, contact_title|title, contact_email|email,
 *   source_url (required), source_type (optional; default "manual"),
 *   product_interest (optional), source_name (optional), note (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  contactEmailError,
  insertLeadSource,
  looksFictionalCompany,
  nextLeadId,
  sourceUrlError,
} from "@/lib/leads-evidence";

const VALID_SOURCE_TYPES = ["directory", "website", "registry", "marketplace", "event", "publication", "manual", "other"];

function nowAddisISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { leads } = body || {};
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ ok: false, error: "leads array is required" }, { status: 400 });
  }
  if (leads.length > 500) {
    return NextResponse.json({ ok: false, error: "Max 500 leads per import" }, { status: 400 });
  }

  const db = getWritableDb();
  const now = nowAddisISO();
  let created = 0;
  const errors: string[] = [];
  const skipped: { row: number; company: string; reason: string }[] = [];

  try {
    for (let i = 0; i < leads.length; i++) {
      const row = leads[i] || {};
      const company = String(row.company || row.company_name || "").trim();
      const rowLabel = `Row ${i + 1}${company ? ` (${company})` : ""}`;

      if (!company) {
        errors.push(`${rowLabel}: missing company name`);
        continue;
      }

      const fictionReason = looksFictionalCompany(company);
      if (fictionReason) {
        errors.push(`${rowLabel}: rejected — ${fictionReason}`);
        continue;
      }

      const country = String(row.country || row.headquarters_country || "").trim() || "Unknown";
      const city = String(row.city || row.headquarters_city || "").trim();
      const website = String(row.website || "").trim();
      const contactName = String(row.contact_name || row.contact || "").trim();
      const contactTitle = String(row.contact_title || row.title || "").trim();
      const contactEmail = String(row.contact_email || row.email || "").trim();
      const sourceUrl = String(row.source_url || row.sourceUrl || "").trim();
      const sourceType = VALID_SOURCE_TYPES.includes(String(row.source_type || "").trim())
        ? String(row.source_type).trim()
        : "manual";
      const productInterest = String(row.product_interest || row.productInterest || "").trim();
      const sourceName = String(row.source_name || row.sourceName || "").trim() || null;
      const note = String(row.note || "").trim() || null;

      // ── Evidence is mandatory ────────────────────────────────────
      if (!sourceUrl && !note) {
        errors.push(`${rowLabel}: rejected — no evidence. Provide source_url (where you found this company) or a note explaining the source.`);
        continue;
      }
      const urlErr = sourceUrlError(sourceUrl);
      if (urlErr) {
        errors.push(`${rowLabel}: rejected — ${urlErr}`);
        continue;
      }

      // ── Contact fiction guard ────────────────────────────────────
      const emailErr = contactEmailError(contactEmail);
      if (emailErr) {
        errors.push(`${rowLabel}: rejected — ${emailErr}`);
        continue;
      }
      if (contactName && /\b(test|sample|demo|placeholder|fictional|dummy)\b/i.test(contactName)) {
        errors.push(`${rowLabel}: rejected — contact name looks like placeholder data ("${contactName}")`);
        continue;
      }

      try {
        const existing = db
          .prepare(`SELECT lead_id FROM leads WHERE company_name = ? AND headquarters_country = ? AND organization_id = ? AND deleted_ts IS NULL`)
          .get(company, country, orgId) as { lead_id: string } | undefined;
        if (existing) {
          skipped.push({ row: i + 1, company, reason: `already in your lead pool (${existing.lead_id})` });
          continue;
        }

        const leadId = nextLeadId(db, now);

        db.prepare(`
          INSERT INTO leads (lead_id, company_name, headquarters_country, headquarters_city, website,
            current_state, current_agent, priority_tier, recommended_vp, outreach_language,
            verification_status, organization_id, created_ts, updated_ts)
          VALUES (?, ?, ?, ?, ?, 'NEW', 'Agent 2', NULL, NULL, 'EN', 'unverified', ?, ?, ?)
        `).run(leadId, company, country, city || null, website || null, orgId, now, now);

        // Optional contact — starts UNVERIFIED like the company.
        // Inserted BEFORE the evidence row so the evidence can reference it.
        let contactId: number | null = null;
        if (contactName || contactEmail) {
          const res = db.prepare(`
            INSERT INTO lead_contacts (lead_id, name, title, email, is_primary, is_buyer, verification_status, organization_id, created_ts, updated_ts)
            VALUES (?, ?, ?, ?, 1, 1, 'unverified', ?, ?, ?)
          `).run(leadId, contactName || "Primary Contact", contactTitle || null, contactEmail || null, orgId, now, now);
          contactId = Number(res.lastInsertRowid);
        }

        // Evidence row (mandatory content guaranteed above) — links to the
        // contact when the same source documents both.
        insertLeadSource(db, {
          lead_id: leadId,
          organization_id: orgId,
          evidence_for: contactId ? "both" : "company",
          contact_id: contactId,
          source_type: sourceType,
          source_url: sourceUrl || null,
          source_name: sourceName,
          company_as_listed: company,
          country,
          product_interest: productInterest || null,
          checked_ts: now,
          checked_by: auth.user.email,
          note: note || (sourceUrl ? null : "Imported with note as evidence (no URL provided)"),
          now,
        });

        created++;
      } catch (e: any) {
        errors.push(`${rowLabel}: ${e.message}`);
      }
    }

    return NextResponse.json({
      ok: created > 0 || errors.length === 0,
      created,
      skipped,
      errors: errors.slice(0, 20),
      totalErrors: errors.length,
      notice: "Imported leads start UNVERIFIED — verify each company before outreach.",
    });
  } finally {
    db.close();
  }
}