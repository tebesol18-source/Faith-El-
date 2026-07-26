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
import Database from "better-sqlite3";
import path from "path";

function getDbPath(): string {
  const fs = require("fs");
  const candidates = [
    path.resolve(process.cwd(), "..", "coffee_export", "data", "coffee_export.db"),
    path.resolve(process.cwd(), "coffee_export", "data", "coffee_export.db"),
    "/home/z/my-project/coffee_export/data/coffee_export.db",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1];
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  return ts.substring(0, 19).replace("T", " ");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;

    if (!leadId) {
      return NextResponse.json(
        { ok: false, error: "Missing lead id" },
        { status: 400 }
      );
    }

    const db = new Database(getDbPath(), { readonly: true, fileMustExist: true });

    try {
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
