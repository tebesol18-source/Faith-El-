/**
 * POST /api/leads/[id]/verify
 *
 * The human verification workflow for real-lead intake (Phase 1):
 *
 *   { action: "check" }
 *       Run an automated reachability check against the lead's website and
 *       every evidence source URL (server-side fetch, 6s timeout each).
 *       Results are recorded on each lead_sources row and in the audit log.
 *       A failed/unreachable check is NOT a rejection — it is advisory
 *       evidence for the human reviewer (sites go down; air-gapped dev
 *       environments have no network).
 *
 *   { action: "confirm", level: "company" }
 *       Human marks the company as VERIFIED. Requires at least one evidence
 *       row to exist (you cannot verify nothing).
 *
 *   { action: "confirm", level: "contact", contactId }
 *       Human marks a specific contact as VERIFIED. The contact must have
 *       at least one evidence row (evidence_for 'contact' or 'both').
 *
 *   { action: "reject", reason }
 *       Mark the company (or a contact) as REJECTED with a reason — the
 *       lead can then never enter outreach.
 *
 *   { action: "reset" }
 *       Move a verified/rejected company back to unverified (audited).
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getLeadSources, logVerificationAction } from "@/lib/leads-evidence";

const FETCH_TIMEOUT_MS = 6000;

function nowAddisISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

/** Fetch with timeout; returns a compact status string. Never throws. */
async function reachabilityCheck(url: string): Promise<{ status: string; detail: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "FaithEl-Intake/1.0 (lead evidence check)" },
      });
      return {
        status: res.ok ? "reachable" : `http-${res.status}`,
        detail: `HTTP ${res.status} ${res.statusText || ""}`.trim(),
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return { status: "timeout", detail: `no response within ${FETCH_TIMEOUT_MS}ms` };
    return { status: "unreachable", detail: String(e?.cause?.message || e?.message || "network error").slice(0, 200) };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const actor = auth.user.email;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { action, level = "company", contactId, reason } = body || {};
  const { id: leadId } = await params;

  if (!["check", "confirm", "reject", "reset"].includes(action)) {
    return NextResponse.json(
      { ok: false, error: "action must be one of: check, confirm, reject, reset" },
      { status: 400 }
    );
  }
  if (level !== "company" && level !== "contact") {
    return NextResponse.json({ ok: false, error: "level must be 'company' or 'contact'" }, { status: 400 });
  }

  const db = getWritableDb();
  try {
    const lead = db
      .prepare(`SELECT lead_id, company_name, verification_status FROM leads WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`)
      .get(leadId, orgId) as { lead_id: string; company_name: string; verification_status: string } | undefined;
    if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

    const now = nowAddisISO();

    // ── Reachability check ─────────────────────────────────────────
    if (action === "check") {
      const sources = getLeadSources(db, leadId, orgId);
      const website = (db.prepare(`SELECT website FROM leads WHERE lead_id = ?`).get(leadId) as any)?.website;
      const urls = new Set<string>();
      if (typeof website === "string" && website.startsWith("http")) urls.add(website);
      for (const s of sources) {
        if (s.source_url && s.source_url.startsWith("http")) urls.add(s.source_url);
      }
      if (urls.size === 0) {
        return NextResponse.json(
          { ok: false, error: "Nothing to check — the lead has no website and no evidence URLs" },
          { status: 422 }
        );
      }

      const results: { url: string; status: string; detail: string }[] = [];
      for (const url of urls) {
        const r = await reachabilityCheck(url);
        results.push({ url, ...r });
        for (const s of sources.filter((row) => row.source_url === url)) {
          db.prepare(
            `UPDATE lead_sources SET last_check_status = ?, last_check_detail = ?, last_check_ts = ?, updated_ts = ? WHERE id = ?`
          ).run(r.status, r.detail, now, now, s.id);
        }
      }
      logVerificationAction(db, {
        lead_id: leadId, organization_id: orgId, level: "company", action: "check",
        result: results.some((r) => r.status === "reachable") ? "reachable" : "not-reachable",
        detail: JSON.stringify(results), actor, now,
      });

      return NextResponse.json({
        ok: true,
        action: "check",
        results,
        notice: "Reachability results are advisory evidence. Review them, open the URLs yourself, then confirm or reject.",
      });
    }

    // ── Contact-level actions ──────────────────────────────────────
    if (level === "contact") {
      if (!contactId) {
        return NextResponse.json({ ok: false, error: "contactId is required for contact-level actions" }, { status: 400 });
      }
      const contact = db
        .prepare(`SELECT id, name, email, verification_status FROM lead_contacts WHERE id = ? AND lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`)
        .get(contactId, leadId, orgId) as { id: number; name: string; email: string | null; verification_status: string } | undefined;
      if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

      if (action === "confirm") {
        const contactEvidence = (db
          .prepare(`SELECT COUNT(*) n FROM lead_sources WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL AND contact_id = ? AND evidence_for IN ('contact','both')`)
          .get(leadId, orgId, contactId) as any).n;
        if (contactEvidence === 0) {
          return NextResponse.json(
            { ok: false, error: "This contact has no evidence. Add the contact with the source URL where you found them, then verify." },
            { status: 422 }
          );
        }
        db.prepare(`UPDATE lead_contacts SET verification_status = 'verified', verified_by = ?, verified_ts = ?, updated_ts = ? WHERE id = ? AND organization_id = ?`)
          .run(actor, now, now, contactId, orgId);
        logVerificationAction(db, {
          lead_id: leadId, organization_id: orgId, level: "contact", contact_id: contactId,
          action: "confirm", result: "verified", actor, now,
        });
        return NextResponse.json({ ok: true, level: "contact", contactId, verificationStatus: "verified" });
      }

      if (action === "reject") {
        db.prepare(`UPDATE lead_contacts SET verification_status = 'rejected', verified_by = ?, verified_ts = ?, updated_ts = ? WHERE id = ? AND organization_id = ?`)
          .run(actor, now, now, contactId, orgId);
        logVerificationAction(db, {
          lead_id: leadId, organization_id: orgId, level: "contact", contact_id: contactId,
          action: "reject", result: "rejected", detail: reason || null, actor, now,
        });
        return NextResponse.json({ ok: true, level: "contact", contactId, verificationStatus: "rejected" });
      }

      // reset
      db.prepare(`UPDATE lead_contacts SET verification_status = 'unverified', verified_by = NULL, verified_ts = NULL, updated_ts = ? WHERE id = ? AND organization_id = ?`)
        .run(now, contactId, orgId);
      logVerificationAction(db, {
        lead_id: leadId, organization_id: orgId, level: "contact", contact_id: contactId,
        action: "reset", result: "unverified", actor, now,
      });
      return NextResponse.json({ ok: true, level: "contact", contactId, verificationStatus: "unverified" });
    }

    // ── Company-level confirm / reject / reset ─────────────────────
    if (action === "confirm") {
      const evidenceCount = (db
        .prepare(`SELECT COUNT(*) n FROM lead_sources WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL AND evidence_for IN ('company','both')`)
        .get(leadId, orgId) as any).n;
      if (evidenceCount === 0) {
        return NextResponse.json(
          { ok: false, error: "Cannot verify a company with no evidence — add at least one source URL first." },
          { status: 422 }
        );
      }
      db.prepare(`UPDATE leads SET verification_status = 'verified', verified_by = ?, verified_ts = ?, updated_ts = ? WHERE lead_id = ? AND organization_id = ?`)
        .run(actor, now, now, leadId, orgId);
      logVerificationAction(db, {
        lead_id: leadId, organization_id: orgId, level: "company",
        action: "confirm", result: "verified", detail: `evidence rows: ${evidenceCount}`, actor, now,
      });
      return NextResponse.json({ ok: true, level: "company", verificationStatus: "verified" });
    }

    if (action === "reject") {
      db.prepare(`UPDATE leads SET verification_status = 'rejected', verified_by = ?, verified_ts = ?, updated_ts = ? WHERE lead_id = ? AND organization_id = ?`)
        .run(actor, now, now, leadId, orgId);
      logVerificationAction(db, {
        lead_id: leadId, organization_id: orgId, level: "company",
        action: "reject", result: "rejected", detail: reason || null, actor, now,
      });
      return NextResponse.json({ ok: true, level: "company", verificationStatus: "rejected" });
    }

    // reset
    db.prepare(`UPDATE leads SET verification_status = 'unverified', verified_by = NULL, verified_ts = NULL, updated_ts = ? WHERE lead_id = ? AND organization_id = ?`)
      .run(now, leadId, orgId);
    logVerificationAction(db, {
      lead_id: leadId, organization_id: orgId, level: "company",
      action: "reset", result: "unverified", actor, now,
    });
    return NextResponse.json({ ok: true, level: "company", verificationStatus: "unverified" });
  } catch (error: any) {
    console.error("[/api/leads/[id]/verify] Error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Verification failed" }, { status: 500 });
  } finally {
    db.close();
  }
}
