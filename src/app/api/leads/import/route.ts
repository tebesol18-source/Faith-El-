import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import crypto from "crypto";

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

  try {
    for (let i = 0; i < leads.length; i++) {
      const row = leads[i] || {};
      const company = String(row.company || row.company_name || "").trim();
      if (!company) {
        errors.push(`Row ${i + 1}: missing company name`);
        continue;
      }

      const country = String(row.country || row.headquarters_country || "").trim() || "Unknown";
      const city = String(row.city || row.headquarters_city || "").trim();
      const website = String(row.website || "").trim();
      const contactName = String(row.contact_name || row.contact || "").trim();
      const contactEmail = String(row.contact_email || row.email || "").trim();

      const leadId = `L-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      try {
        db.prepare(`
          INSERT INTO leads (lead_id, company_name, headquarters_country, headquarters_city, website, current_state, current_agent, priority_tier, recommended_vp, outreach_language, organization_id, created_ts, updated_ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          leadId,
          company,
          country,
          city,
          website || null,
          "NEW",
          "Agent 2",
          "B",
          "VP1",
          "EN",
          orgId,
          now,
          now
        );

        if (contactName || contactEmail) {
          db.prepare(`
            INSERT INTO lead_contacts (lead_id, name, title, email, is_primary, is_buyer, created_ts, updated_ts)
            VALUES (?, ?, ?, ?, 1, 1, ?, ?)
          `).run(leadId, contactName || "Primary Contact", "", contactEmail || null, now, now);
        }

        created++;
      } catch (e: any) {
        errors.push(`Row ${i + 1} (${company}): ${e.message}`);
      }
    }

    return NextResponse.json({ ok: true, created, errors: errors.slice(0, 10), totalErrors: errors.length });
  } finally {
    db.close();
  }
}
