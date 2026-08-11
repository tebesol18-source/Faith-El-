/**
 * GET /api/samples
 * Reads sample requests from the SQLite database.
 * Maps sample_requests → frontend shape { id, lead, leadId, lots[], type, status, dispatched, delivered, feedback, score, decision, budget }
 * Joins with sample_request_lots for lot info, leads for company name.
 */
import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

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
