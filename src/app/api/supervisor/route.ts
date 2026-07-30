/**
 * GET /api/supervisor
 *
 * Returns the complete health status of all 7 AI agents + supervisor log.
 * This is the "controller dashboard" data — shows what the supervisor sees.
 *
 * Response: {
 *   ok, source,
 *   supervisor: { running, lastTick, totalTicks },
 *   agents: [{ agent_id, name, description, status, is_paused, ... }],
 *   faults: [{ timestamp, agent_id, event_type, severity, message, action_taken }],
 *   pendingActions: [{ id, agent_id, action_description, risk_level, status }],
 *   stats: { totalEvents, pendingEvents, consumedEvents, totalAgentRuns, totalErrors }
 * }
 */

import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const AGENT_NAMES: Record<string, string> = {
  "Agent 1": "Supplier & Inventory",
  "Agent 2": "Lead Research & Enrichment",
  "Agent 3": "Outreach & Qualification",
  "Agent 4": "Sample Management",
  "Agent 5": "Legal & Compliance",
  "Agent 6": "Logistics & Shipping",
  "Agent 7": "Sales & Relationship Management",
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  "Agent 1": "Owns lot inventory, EUDR data, stock levels, QA flags",
  "Agent 2": "Enriches raw leads with VP, segment, tier, language",
  "Agent 3": "Runs outreach sequences, enforces QUAL gate",
  "Agent 4": "Owns sample lifecycle from dispatch to decision",
  "Agent 5": "Contract execution, ICC terms, compliance documentation",
  "Agent 6": "Freight booking, customs, delivery",
  "Agent 7": "Long-term buyer relationships, repeat orders, NPS",
};

function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 0) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return "—";
  }
}

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const db = getReadonlyDb();

    try {
      // ─── Agent controls (health status) ───
      const controls = db.prepare(`
        SELECT ac.*, a.name, a.description, a.status as agent_table_status
        FROM agent_controls ac
        LEFT JOIN agents a ON ac.agent_id = a.agent_id
        ORDER BY ac.agent_id
      `).all() as any[];

      // Count pending events per agent
      const agents = controls.map((c) => {
        // Count pending events for this agent
        const eventTypes: string[] = [];
        const routing: Record<string, string> = {
          LEAD_CREATED: "Agent 2", LEAD_ENRICHED: "Agent 3", LEAD_STATE_CHANGED: "Agent 3",
          MESSAGE_SENT: "Agent 3", MESSAGE_RECEIVED: "Agent 3", THREAD_OPENED: "Agent 3",
          SAMPLE_REQUESTED: "Agent 1", LOT_CONFIRMED: "Agent 4", LOT_CONFIRMATION_FAILED: "Agent 4",
          CONTRACT_SIGNED: "Agent 5", SHIPMENT_DEPARTED: "Agent 6", SHIPMENT_ARRIVED: "Agent 6",
          LEAD_NURTURED: "Agent 7", LEAD_QUALIFIED: "Agent 7", LEAD_GHOSTED: "Agent 7",
        };
        for (const [et, ag] of Object.entries(routing)) {
          if (ag === c.agent_id) eventTypes.push(et);
        }

        let pendingCount = 0;
        if (eventTypes.length > 0) {
          const placeholders = eventTypes.map(() => "?").join(",");
          pendingCount = (db.prepare(`SELECT COUNT(*) as n FROM events WHERE status = 'pending' AND event_type IN (${placeholders})`).get(...eventTypes) as any).n;
        }

        // Determine display status
        let displayStatus: string;
        if (c.is_paused) displayStatus = "paused";
        else if (c.consecutive_errors >= c.max_consecutive_errors) displayStatus = "error";
        else if (c.last_run_status === "never") displayStatus = "idle";
        else if (pendingCount > 0) displayStatus = "working";
        else displayStatus = "active";

        return {
          id: c.agent_id,
          name: AGENT_NAMES[c.agent_id] || c.name || c.agent_id,
          model: "Llama 3.3 70B",
          status: displayStatus,
          isPaused: c.is_paused === 1,
          pausedBy: c.paused_by,
          pausedTs: c.paused_ts ? relativeTime(c.paused_ts) : null,
          lastRunTs: c.last_run_ts ? relativeTime(c.last_run_ts) : "Never",
          lastRunStatus: c.last_run_status,
          lastError: c.last_error,
          lastErrorTs: c.last_error_ts ? relativeTime(c.last_error_ts) : null,
          runCount: c.run_count,
          errorCount: c.error_count,
          consecutiveErrors: c.consecutive_errors,
          maxConsecutiveErrors: c.max_consecutive_errors,
          autoRestartEnabled: c.auto_restart_enabled === 1,
          pendingEvents: pendingCount,
          description: AGENT_DESCRIPTIONS[c.agent_id] || c.description || "",
        };
      });

      // ─── Supervisor log (recent faults/events, excluding heartbeats) ───
      const faults = db.prepare(`
        SELECT id, timestamp, agent_id, event_type, severity, message, action_taken, details
        FROM supervisor_log
        WHERE event_type != 'HEARTBEAT'
        ORDER BY id DESC
        LIMIT 20
      `).all() as any[];

      const formattedFaults = faults.map((f) => ({
        id: f.id,
        timestamp: f.timestamp ? relativeTime(f.timestamp) : "—",
        timestampRaw: f.timestamp,
        agentId: f.agent_id,
        eventType: f.event_type,
        severity: f.severity,
        message: f.message,
        actionTaken: f.action_taken,
      }));

      // ─── Pending agent actions (approval queue) ───
      const pendingActions = db.prepare(`
        SELECT id, agent_id, action_type, action_description, target_entity_type, target_entity_id,
               risk_level, status, submitted_ts
        FROM pending_agent_actions
        WHERE status = 'pending'
        ORDER BY submitted_ts DESC
      `).all() as any[];

      // ─── Stats ───
      const eventStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'consumed' THEN 1 ELSE 0 END) as consumed
        FROM events
      `).get() as any;

      const totalRuns = db.prepare("SELECT COALESCE(SUM(run_count), 0) as n FROM agent_controls").get() as any;
      const totalErrors = db.prepare("SELECT COALESCE(SUM(error_count), 0) as n FROM agent_controls").get() as any;

      // Check if supervisor is running (heartbeat within last 2 minutes)
      let supervisorRunning = false;
      const heartbeat = db.prepare(`
        SELECT timestamp FROM supervisor_log
        WHERE event_type IN ('HEARTBEAT', 'SUPERVISOR_START')
        ORDER BY id DESC LIMIT 1
      `).get() as any;
      if (heartbeat?.timestamp) {
        const age = (Date.now() - new Date(heartbeat.timestamp).getTime()) / 1000;
        supervisorRunning = age < 120; // heartbeat within 2 minutes
      }

      return NextResponse.json({
        ok: true,
        source: "sqlite",
        supervisor: {
          running: supervisorRunning,
          lastStart: heartbeat?.timestamp ? relativeTime(heartbeat.timestamp) : "Never",
        },
        agents,
        faults: formattedFaults,
        pendingActions: pendingActions.map((a) => ({
          id: a.id,
          agentId: a.agent_id,
          actionType: a.action_type,
          description: a.action_description,
          targetType: a.target_entity_type,
          targetId: a.target_entity_id,
          riskLevel: a.risk_level,
          status: a.status,
          submittedAt: relativeTime(a.submitted_ts),
        })),
        stats: {
          totalEvents: eventStats.total || 0,
          pendingEvents: eventStats.pending || 0,
          consumedEvents: eventStats.consumed || 0,
          totalAgentRuns: totalRuns.n || 0,
          totalErrors: totalErrors.n || 0,
          pendingApprovals: pendingActions.length,
          criticalFaults: faults.filter((f) => f.severity === "critical").length,
          warningFaults: faults.filter((f) => f.severity === "warning").length,
        },
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/supervisor] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch supervisor data" },
      { status: 500 }
    );
  }
}
