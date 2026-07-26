/**
 * /api/approvals
 *
 * GET  — List all pending agent actions awaiting admin review
 * POST — Approve or reject a pending action
 *        Body: { id: number, action: "approve" | "reject", reviewer?: string, notes?: string }
 *
 * When approved:
 *   - Status → "approved"
 *   - The supervisor will execute the action on its next tick
 *   - The associated event (if any) gets marked for processing
 *
 * When rejected:
 *   - Status → "rejected"
 *   - The associated event gets marked as consumed with "rejected by admin"
 *   - Agent is notified (via supervisor_log) that the action was declined
 */

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

function getDbPath(): string {
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

function nowISO() {
  return new Date().toISOString();
}

function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return "—";
  }
}

const RISK_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  low: { label: "Low Risk", bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  medium: { label: "Medium Risk", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  high: { label: "High Risk", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  send_email: "Send Email to Buyer",
  create_contract: "Create Contract",
  dispatch_sample: "Dispatch Sample",
  send_follow_up: "Send Follow-up Email",
  send_breakup_email: "Send Breakup Email",
  update_lead_state: "Update Lead State",
  create_quote: "Create Quote",
};

export async function GET() {
  try {
    const db = new Database(getDbPath(), { readonly: true });

    try {
      const rows = db.prepare(`
        SELECT * FROM pending_agent_actions
        WHERE status = 'pending'
        ORDER BY submitted_ts DESC
      `).all() as any[];

      const actions = rows.map((a) => {
        const rc = RISK_CONFIG[a.risk_level] || RISK_CONFIG.medium;
        return {
          id: a.id,
          agentId: a.agent_id,
          actionType: a.action_type,
          actionLabel: ACTION_TYPE_LABELS[a.action_type] || a.action_type,
          description: a.action_description,
          targetType: a.target_entity_type,
          targetId: a.target_entity_id,
          payload: a.payload ? JSON.parse(a.payload) : null,
          riskLevel: a.risk_level,
          riskLabel: rc.label,
          riskBg: rc.bg,
          riskText: rc.text,
          riskBorder: rc.border,
          status: a.status,
          submittedAt: relativeTime(a.submitted_ts),
          submittedTsRaw: a.submitted_ts,
        };
      });

      return NextResponse.json({
        ok: true,
        count: actions.length,
        actions,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/approvals GET] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action, reviewer, notes, feedback_reason, edited_fields, seller_notes } = body;

    if (!id || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'id' or 'action' (must be 'approve' or 'reject')" },
        { status: 400 }
      );
    }

    const db = new Database(getDbPath());

    try {
      const pending = db.prepare("SELECT * FROM pending_agent_actions WHERE id = ? AND status = 'pending'").get(id) as any;

      if (!pending) {
        return NextResponse.json({ ok: false, error: "Pending action not found or already reviewed" }, { status: 404 });
      }

      const now = nowISO();
      const reviewerName = reviewer || "seller";
      const reviewNotes = notes || "";
      const newStatus = action === "approve" ? "approved" : "rejected";

      // Update the pending action
      db.prepare(`
        UPDATE pending_agent_actions
        SET status = ?, reviewed_by = ?, reviewed_ts = ?, review_notes = ?
        WHERE id = ?
      `).run(newStatus, reviewerName, now, reviewNotes, id);

      // ═══ Capture human feedback for learning ═══
      db.prepare(`
        INSERT INTO agent_feedback (
          action_id, agent_id, action_type, target_entity_id,
          decision, feedback_reason, edited_fields, original_payload, seller_notes, created_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        pending.agent_id,
        pending.action_type,
        pending.target_entity_id,
        newStatus,
        feedback_reason || null,
        edited_fields ? JSON.stringify(edited_fields) : null,
        pending.payload,
        seller_notes || reviewNotes || null,
        now
      );

      // Log to supervisor_log
      db.prepare(`
        INSERT INTO supervisor_log (timestamp, agent_id, event_type, severity, message, action_taken, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        now,
        pending.agent_id,
        action === "approve" ? "ACTION_APPROVED" : "ACTION_REJECTED",
        action === "approve" ? "info" : "warning",
        `${pending.agent_id}'s action "${pending.action_description}" was ${newStatus} by ${reviewerName}${feedback_reason ? ` — reason: ${feedback_reason}` : ''}`,
        action === "approve" ? "Action approved — supervisor will execute on next tick" : "Action rejected — feedback recorded for learning",
        JSON.stringify({ actionId: id, actionType: pending.action_type, reviewer: reviewerName, feedbackReason: feedback_reason, hasEdits: !!edited_fields })
      );

      // If rejected, mark the associated event as consumed (so the agent doesn't retry)
      if (action === "reject" && pending.payload) {
        try {
          const payload = JSON.parse(pending.payload);
          if (payload.event_id) {
            db.prepare(`
              UPDATE events SET status = 'consumed', consumed_ts = ?, consumed_by = 'admin_rejected'
              WHERE id = ? AND status = 'pending'
            `).run(now, payload.event_id);
          }
        } catch {}
      }

      // If approved, mark the associated event for priority processing
      if (action === "approve" && pending.payload) {
        try {
          const payload = JSON.parse(pending.payload);
          if (payload.event_id) {
            // The supervisor will pick this up on the next tick since the event is still pending
            // Just log that it's approved and ready
          }
        } catch {}
      }

      return NextResponse.json({
        ok: true,
        action: newStatus,
        actionId: id,
        agentId: pending.agent_id,
        description: pending.action_description,
        reviewer: reviewerName,
        timestamp: now,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/approvals POST] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
