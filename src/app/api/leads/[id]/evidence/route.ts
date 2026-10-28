/**
 * GET /api/leads/[id]/evidence
 *
 * Everything the verification drawer needs, org-scoped:
 *   - the lead (with verification status / verified-by / verified-ts)
 *   - evidence rows (lead_sources) with reachability-check results
 *   - contacts with their verification status
 *   - the append-only verification audit trail (lead_verification_log)
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id: leadId } = await params;

  const db = getReadonlyDb();
  try {
    const lead = db
      .prepare(
        `SELECT lead_id, company_name, headquarters_country, headquarters_city, website,
                current_state, priority_tier, recommended_vp, outreach_language,
                verification_status, verified_by, verified_ts, created_ts
         FROM leads WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`
      )
      .get(leadId, orgId) as any;
    if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

    const sources = db
      .prepare(
        `SELECT id, evidence_for, contact_id, source_type, source_url, source_name,
                company_as_listed, country, product_interest, checked_ts, checked_by, note,
                last_check_status, last_check_detail, last_check_ts
         FROM lead_sources WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL ORDER BY id ASC`
      )
      .all(leadId, orgId);

    const contacts = db
      .prepare(
        `SELECT id, name, title, email, phone, linkedin_url, is_primary,
                verification_status, verified_by, verified_ts
         FROM lead_contacts WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL ORDER BY is_primary DESC, id ASC`
      )
      .all(leadId, orgId);

    const log = db
      .prepare(
        `SELECT id, level, contact_id, action, result, detail, actor, created_ts
         FROM lead_verification_log WHERE lead_id = ? AND organization_id = ? ORDER BY id DESC LIMIT 50`
      )
      .all(leadId, orgId);

    return NextResponse.json({ ok: true, lead, sources, contacts, log });
  } catch (error: any) {
    console.error("[/api/leads/[id]/evidence] Error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to load evidence" }, { status: 500 });
  } finally {
    db.close();
  }
}
