/**
 * POST /api/agents/[id]/resume
 * Resumes a paused agent — the supervisor will process its events on subsequent ticks.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getWritableDb } from "@/lib/db";

function nowISO() {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request);
    if ("error" in auth) return auth.error;

    const { id: agentId } = await params;
    const db = getWritableDb();

    try {
      const result = db.prepare(`
        UPDATE agent_controls
        SET is_paused = 0, paused_by = NULL, paused_ts = NULL,
            consecutive_errors = 0, last_error = NULL, last_error_ts = NULL,
            updated_ts = ?
        WHERE agent_id = ?
      `).run(nowISO(), agentId);

      if (result.changes === 0) {
        return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
      }

      // Log to supervisor_log
      db.prepare(`
        INSERT INTO supervisor_log (timestamp, agent_id, event_type, severity, message, action_taken)
        VALUES (?, ?, 'AGENT_RESUMED', 'info', ?, 'Agent resumed via admin UI')
      `).run(nowISO(), agentId, `${agentId} resumed by admin`);

      return NextResponse.json({ ok: true, agentId, action: "resumed" });
    } finally {
      db.close();
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
