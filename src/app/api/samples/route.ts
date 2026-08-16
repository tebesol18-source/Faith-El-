/**
 * GET /api/samples
 * Reads sample requests from the SQLite database.
 * Maps sample_requests → frontend shape { id, lead, leadId, lots[], type, status, dispatched, delivered, feedback, score, decision, budget }
 * Joins with sample_request_lots for lot info, leads for company name.
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

/** Compute the current Ethiopian coffee crop year (e.g. "2024/25"). */
function currentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  // Ethiopian crop year runs roughly Oct→Sep; if we're past October,
  // the crop year is year/year+1. Otherwise it's (year-1)/year.
  // For simplicity we always use year/year+1 here — the caller can override.
  return `${year}/${String(year + 1).slice(-2)}`;
}

function formatDate(ts: string | null): string | null {
  if (!ts) return null;
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return null; }
}

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();
    try {
      const rows = db.prepare(`
        SELECT sr.sample_request_id, sr.lead_id, sr.sample_type, sr.status,
               sr.dispatched_ts, sr.delivered_ts, sr.buyer_company,
               sr.crop_year, sr.created_ts,
               l.company_name
        FROM sample_requests sr
        LEFT JOIN leads l ON sr.lead_id = l.lead_id
        WHERE sr.deleted_ts IS NULL AND sr.organization_id = ?
        ORDER BY sr.created_ts DESC
      `).all(orgId) as any[];

      // For each sample, get its lots
      const lotStmt = db.prepare(`
        SELECT srl.lot_id, lt.region, lt.process
        FROM sample_request_lots srl
        LEFT JOIN lots lt ON srl.lot_id = lt.lot_id
        WHERE srl.organization_id = ? AND srl.sample_request_id = ?
      `);

      // Get cupping scores
      const scoreStmt = db.prepare(`
        SELECT AVG(total_score) as avg_score FROM cupping_scores
        WHERE organization_id = ? AND sample_request_id = ? AND deleted_ts IS NULL
      `);

      // Get decision
      const decisionStmt = db.prepare(`
        SELECT decision FROM sample_decisions
        WHERE organization_id = ? AND sample_request_id = ? ORDER BY created_ts DESC LIMIT 1
      `);

      const samples = rows.map((r) => {
        const lots = (lotStmt.all(orgId, r.sample_request_id) as any[]) || [];
        const lotLabels = lots.map((l) => l.lot_id + (l.region ? ` (${l.region})` : ""));
        const scoreRow = scoreStmt.get(orgId, r.sample_request_id) as any;
        const decisionRow = decisionStmt.get(orgId, r.sample_request_id) as any;

        // Map status: draft → pending (frontend expects "pending" not "draft")
        const statusMap: Record<string, string> = {
          draft: "pending", dispatched: "dispatched", delivered: "delivered",
          feedback_due: "feedback_due", decided: "decided", ghosted: "decided", cancelled: "decided",
        };

        return {
          id: r.sample_request_id,
          lead: r.company_name || r.buyer_company || "Unknown",
          leadId: r.lead_id,
          lots: lotLabels.length > 0 ? lotLabels : ["No lots assigned"],
          type: r.sample_type || "350g",
          status: statusMap[r.status] || r.status || "pending",
          dispatched: formatDate(r.dispatched_ts),
          delivered: formatDate(r.delivered_ts),
          feedback: null,
          score: scoreRow?.avg_score || null,
          decision: decisionRow?.decision || null,
          budget: "used",
        };
      });

      return NextResponse.json({ ok: true, count: samples.length, samples });
    } finally { db.close(); }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/samples
 *
 * Creates a new sample request.
 *
 * Body:
 *   leadId: string                    (required)
 *   sampleType: string                (required — 350g|200g|500g|150g)
 *   buyerCompany: string              (required)
 *   buyerDestinationCountry: string   (required)
 *   cropYear?: string                 (optional, defaults to current crop year e.g. "2024/25")
 *   buyerAttentionName?: string       (optional)
 *   buyerShippingAddress?: string     (optional)
 *   buyerLanguage?: string            (optional, default "EN")
 *   shippingArrangement?: string      (optional — paid|pre_paid|fallback_150g)
 *
 * Response: 201 { ok: true, sample: {...} } | 400 | 500
 */
const VALID_SAMPLE_TYPES = ["350g", "200g", "500g", "150g"];
const VALID_SHIPPING_ARRANGEMENTS = ["paid", "pre_paid", "fallback_150g"];

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    leadId, sampleType, buyerCompany, buyerDestinationCountry,
    cropYear, buyerAttentionName, buyerShippingAddress,
    buyerLanguage, shippingArrangement,
  } = body || {};

  // ─── Validate required fields ───
  const missing: string[] = [];
  if (!leadId) missing.push("leadId");
  if (!sampleType) missing.push("sampleType");
  if (!buyerCompany) missing.push("buyerCompany");
  if (!buyerDestinationCountry) missing.push("buyerDestinationCountry");
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  if (!VALID_SAMPLE_TYPES.includes(sampleType)) {
    return NextResponse.json(
      { ok: false, error: `sampleType must be one of: ${VALID_SAMPLE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (shippingArrangement && !VALID_SHIPPING_ARRANGEMENTS.includes(shippingArrangement)) {
    return NextResponse.json(
      { ok: false, error: `shippingArrangement must be one of: ${VALID_SHIPPING_ARRANGEMENTS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      // Verify lead exists (FK enforcement)
      const lead = db.prepare(`
        SELECT lead_id, company_name, headquarters_country FROM leads
        WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(leadId, orgId) as { lead_id: string; company_name: string; headquarters_country: string | null } | undefined;
      if (!lead) {
        return NextResponse.json(
          { ok: false, error: `Lead not found: ${leadId}` },
          { status: 404 }
        );
      }

      const now = nowISO();
      const yyyy = String(new Date().getFullYear());
      const prefix = `SR-${yyyy}-`;

      // ─── Generate sample_request_id: SR-YYYY-NNNN ───
      const last = db.prepare(`
        SELECT sample_request_id FROM sample_requests
        WHERE sample_request_id LIKE ?
        ORDER BY sample_request_id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { sample_request_id: string } | undefined;

      let nextNum = 1;
      if (last?.sample_request_id) {
        const m = last.sample_request_id.match(/(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }
      const sampleRequestId = `${prefix}${String(nextNum).padStart(4, "0")}`;

      const finalCropYear = cropYear || currentCropYear();

      // ─── Insert the sample request ───
      db.prepare(`
        INSERT INTO sample_requests (
          sample_request_id, lead_id, organization_id,
          sample_type, crop_year,
          buyer_company, buyer_attention_name, buyer_shipping_address,
          buyer_destination_country, buyer_language, shipping_arrangement,
          status,
          created_ts, updated_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      `).run(
        sampleRequestId, leadId, orgId,
        sampleType, finalCropYear,
        buyerCompany, buyerAttentionName || null, buyerShippingAddress || null,
        buyerDestinationCountry, buyerLanguage || "EN", shippingArrangement || null,
        now, now
      );

      return NextResponse.json({
        ok: true,
        sample: {
          id: sampleRequestId,
          leadId,
          sampleType,
          cropYear: finalCropYear,
          buyerCompany,
          buyerDestinationCountry,
          buyerAttentionName: buyerAttentionName || null,
          buyerShippingAddress: buyerShippingAddress || null,
          buyerLanguage: buyerLanguage || "EN",
          shippingArrangement: shippingArrangement || null,
          status: "draft",
          organization_id: orgId,
          created_ts: now,
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/samples POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create sample request" },
      { status: 500 }
    );
  }
}
