/**
 * POST /api/leads/[id]/advance
 *
 * Advances a lead to the next state in the pipeline:
 *   NEW → ENRICHED → IN_SEQUENCE → QUALIFIED → SAMPLE_DISPATCHED → DECIDED_APPROVED → CONTRACTED
 *
 * Also publishes the appropriate event so the supervisor can pick it up.
 * This is the simplest way to move leads through the pipeline without
 * waiting for the supervisor to process events.
 */

import { NextRequest, NextResponse } from "next/server";
import { getWritableDb, getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const STATE_TRANSITIONS: Record<string, string> = {
  NEW: "ENRICHED",
  ENRICHED: "IN_SEQUENCE",
  IN_SEQUENCE: "QUALIFIED",
  QUALIFIED: "SAMPLE_DISPATCHED",
  SAMPLE_DISPATCHED: "SAMPLE_FEEDBACK_DUE",
  SAMPLE_FEEDBACK_DUE: "DECIDED_APPROVED",
  DECIDED_APPROVED: "CONTRACTED",
  DECIDED_NEEDS_ANOTHER: "SAMPLE_DISPATCHED",
  GHOSTED: "IN_SEQUENCE", // re-engage
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const { id: leadId } = await params;
    const now = new Date().toISOString().replace("Z", "+03:00");

    const db = getWritableDb();
    try {
      // Get current state (org-scoped)
      const lead = db.prepare(`
        SELECT current_state FROM leads WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(leadId, orgId) as { current_state: string } | undefined;

      if (!lead) {
        return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
      }

      const nextState = STATE_TRANSITIONS[lead.current_state];
      if (!nextState) {
        return NextResponse.json({ ok: false, error: `Cannot advance from state: ${lead.current_state}` }, { status: 400 });
      }

      // Update lead state
      db.prepare(`
        UPDATE leads SET current_state = ?, updated_ts = ?
        WHERE lead_id = ? AND organization_id = ?
      `).run(nextState, now, leadId, orgId);

      // Publish event for the supervisor
      db.prepare(`
        INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        "LEAD_STATE_CHANGED",
        "lead",
        leadId,
        JSON.stringify({ lead_id: leadId, from_state: lead.current_state, to_state: nextState }),
        auth.user.email,
        now,
        orgId
      );

      return NextResponse.json({
        ok: true,
        leadId,
        previousState: lead.current_state,
        newState: nextState,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
