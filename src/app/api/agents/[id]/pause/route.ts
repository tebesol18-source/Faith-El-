/**
 * POST /api/agents/[id]/pause
 * Pauses an agent — the supervisor will skip it on subsequent ticks.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getWritableDb } from "@/lib/db";

function nowISO() {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Agent controls are platform-level infrastructure — pausing affects ALL
    // organizations' processing, so this must be admin-only.
    const auth = requireAdmin(request);
    if ("error" in auth) return auth.error;

    const { id: agentId } = await params;
    const actor = auth.user.email;
    const db = getWritableDb();

    try {
      const result = db.prepare(`
        UPDATE agent_controls
        SET is_paused = 1, paused_by = ?, paused_ts = ?, updated_ts = ?
        WHERE agent_id = ?
      `).run(actor, nowISO(), nowISO(), agentId);

      if (result.changes === 0) {
        return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
      }

      // Log to supervisor_log — with the REAL actor, not a hardcoded role
      db.prepare(`
        INSERT INTO supervisor_log (timestamp, agent_id, event_type, severity, message, action_taken)
        VALUES (?, ?, 'AGENT_PAUSED', 'info', ?, 'Agent paused via admin UI')
      `).run(nowISO(), agentId, `${agentId} paused by ${actor}`);

      return NextResponse.json({ ok: true, agentId, action: "paused" });
    } finally {
      db.close();
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
