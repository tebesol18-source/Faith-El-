/**
 * GET /api/leads/[id]/history
 *
 * Returns the full state transition history for a specific lead.
 * Matches Streamlit's StateManager.get_lead_history() — the "State History"
 * section shown in the Streamlit lead detail view.
 *
 * Response: { ok, count, history: [{ id, fromState, toState, agentId, ts, tsFormatted, notes }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth, checkTenantOwnership } from "@/lib/auth";

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  return ts.substring(0, 19).replace("T", " ");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { id: leadId } = await params;

    if (!leadId) {
      return NextResponse.json(
        { ok: false, error: "Missing lead id" },
        { status: 400 }
      );
    }

    const db = getReadonlyDb();

    try {
      // Fetch the lead to check tenant ownership (prevents IDOR)
      const lead = db.prepare("SELECT organization_id FROM leads WHERE lead_id = ?").get(leadId) as { organization_id: string } | undefined;
      if (lead) {
        const ownership = checkTenantOwnership(auth.user.organizationId, lead.organization_id);
        if ("error" in ownership) {
          return ownership.error;
        }
      }

      const rows = db
        .prepare(
          `SELECT id, lead_id, from_state, to_state, agent_id, ts, notes
           FROM lead_state_history
           WHERE lead_id = ?
           ORDER BY ts ASC`
        )
        .all(leadId) as any[];

      const history = rows.map((row) => ({
        id: row.id,
        fromState: row.from_state || null,
        toState: row.to_state,
        agentId: row.agent_id,
        ts: row.ts,
        tsFormatted: formatTs(row.ts),
        notes: row.notes || "",
      }));

      return NextResponse.json({
        ok: true,
        leadId,
        count: history.length,
        history,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/leads/[id]/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch lead history" },
      { status: 500 }
    );
  }
}
