/**
 * Contacts under a lead — Phase 1 real-lead intake.
 *
 * POST /api/leads/[id]/contacts
 *      Add a contact you found for this company. Body:
 *        { name, title?, email?, phone?, linkedinUrl?,
 *          sourceUrl, sourceType?, sourceName?, note? }
 *
 *      Contract:
 *        - name is required.
 *        - evidence is REQUIRED: sourceUrl (where you found this person —
 *          a team page, a directory listing, a published interview …) or,
 *          as a fallback for offline/manual sources, an explicit note.
 *        - Emails on reserved/test domains are rejected (fiction guard).
 *        - The contact starts UNVERIFIED; verifying it is a separate human
 *          action (POST /api/leads/[id]/verify { level: "contact" }).
 *
 * DELETE /api/leads/[id]/contacts?contactId=N
 *      Soft-delete a contact (recorded, reversible in DB terms, audited).
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { contactEmailError, insertLeadSource, logVerificationAction, sourceUrlError } from "@/lib/leads-evidence";

function nowAddisISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { id: leadId } = await params;

  const name = String(body.name || "").trim();
  const title = String(body.title || "").trim() || null;
  const email = String(body.email || "").trim() || null;
  const phone = String(body.phone || "").trim() || null;
  const linkedinUrl = String(body.linkedinUrl || body.linkedin_url || "").trim() || null;
  const sourceUrl = String(body.sourceUrl || body.source_url || "").trim();
  const sourceName = String(body.sourceName || body.source_name || "").trim() || null;
  const sourceType = String(body.sourceType || body.source_type || "").trim() || "website";
  const note = String(body.note || "").trim() || null;

  if (!name) {
    return NextResponse.json({ ok: false, error: "Contact name is required" }, { status: 400 });
  }
  if (/\b(test|sample|demo|placeholder|fictional|dummy)\b/i.test(name)) {
    return NextResponse.json({ ok: false, error: `Contact name looks like placeholder data ("${name}")` }, { status: 422 });
  }
  const emailErr = contactEmailError(email);
  if (emailErr) {
    return NextResponse.json({ ok: false, error: emailErr }, { status: 422 });
  }
  const urlErr = sourceUrlError(sourceUrl);
  if (urlErr) {
    return NextResponse.json({ ok: false, error: urlErr }, { status: 422 });
  }
  if (!sourceUrl && !note) {
    return NextResponse.json(
      { ok: false, error: "Evidence required — provide sourceUrl (where you found this contact) or a note explaining the source." },
      { status: 422 }
    );
  }

  const db = getWritableDb();
  try {
    const lead = db
      .prepare(`SELECT lead_id, company_name FROM leads WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`)
      .get(leadId, orgId) as { lead_id: string; company_name: string } | undefined;
    if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

    const now = nowAddisISO();
    const existingContacts = (db
      .prepare(`SELECT COUNT(*) n FROM lead_contacts WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`)
      .get(leadId, orgId) as any).n;

    const res = db.prepare(`
      INSERT INTO lead_contacts (lead_id, name, title, linkedin_url, email, phone, is_primary, is_buyer, verification_status, organization_id, created_ts, updated_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'unverified', ?, ?, ?)
    `).run(leadId, name, title, linkedinUrl, email, phone, existingContacts === 0 ? 1 : 0, orgId, now, now);
    const contactId = Number(res.lastInsertRowid);

    // Evidence row tied to this contact
    insertLeadSource(db, {
      lead_id: leadId,
      organization_id: orgId,
      evidence_for: "contact",
      contact_id: contactId,
      source_type: sourceUrl ? sourceType : "manual",
      source_url: sourceUrl || null,
      source_name: sourceName,
      company_as_listed: lead.company_name,
      checked_ts: now,
      checked_by: auth.user.email,
      note: note || (sourceUrl ? null : "Added with note as evidence (no URL)"),
      now,
    });

    db.prepare(`UPDATE leads SET updated_ts = ? WHERE lead_id = ? AND organization_id = ?`).run(now, leadId, orgId);

    return NextResponse.json({
      ok: true,
      contactId,
      verificationStatus: "unverified",
      notice: "Contact added as UNVERIFIED. Review the evidence, then verify it via /api/leads/[id]/verify.",
    });
  } catch (error: any) {
    console.error("[/api/leads/[id]/contacts POST] Error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to add contact" }, { status: 500 });
  } finally {
    db.close();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id: leadId } = await params;
  const contactId = parseInt(new URL(request.url).searchParams.get("contactId") || "", 10);

  if (!contactId) {
    return NextResponse.json({ ok: false, error: "contactId query parameter is required" }, { status: 400 });
  }

  const db = getWritableDb();
  try {
    const contact = db
      .prepare(`SELECT id, name FROM lead_contacts WHERE id = ? AND lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`)
      .get(contactId, leadId, orgId) as { id: number; name: string } | undefined;
    if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

    const now = nowAddisISO();
    db.prepare(`UPDATE lead_contacts SET deleted_ts = ?, updated_ts = ? WHERE id = ? AND organization_id = ?`)
      .run(now, now, contactId, orgId);
    // Keep the evidence rows but mark them deleted too (they documented this contact)
    db.prepare(`UPDATE lead_sources SET deleted_ts = ?, updated_ts = ? WHERE contact_id = ? AND deleted_ts IS NULL`)
      .run(now, now, contactId);
    logVerificationAction(db, {
      lead_id: leadId, organization_id: orgId, level: "contact", contact_id: contactId,
      action: "reset", result: "deleted", detail: `soft-deleted contact "${contact.name}"`, actor: auth.user.email, now,
    });

    return NextResponse.json({ ok: true, deleted: contactId });
  } catch (error: any) {
    console.error("[/api/leads/[id]/contacts DELETE] Error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to delete contact" }, { status: 500 });
  } finally {
    db.close();
  }
}
