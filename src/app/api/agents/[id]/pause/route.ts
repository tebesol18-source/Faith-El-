/**
 * POST /api/agents/[id]/pause
 * Pauses an agent — the supervisor will skip it on subsequent ticks.
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
        SET is_paused = 1, paused_by = 'admin', paused_ts = ?, updated_ts = ?
        WHERE agent_id = ?
      `).run(nowISO(), nowISO(), agentId);

      if (result.changes === 0) {
        return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
      }

      // Log to supervisor_log
      db.prepare(`
        INSERT INTO supervisor_log (timestamp, agent_id, event_type, severity, message, action_taken)
        VALUES (?, ?, 'AGENT_PAUSED', 'info', ?, 'Agent paused via admin UI')
      `).run(nowISO(), agentId, `${agentId} paused by admin`);

      return NextResponse.json({ ok: true, agentId, action: "paused" });
    } finally {
      db.close();
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
