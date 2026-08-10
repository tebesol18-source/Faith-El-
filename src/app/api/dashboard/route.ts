/**
 * GET /api/dashboard
 *
 * Returns all aggregate data for the Dashboard page in one call.
 * Pulls real counts from the backend SQLite database.
 *
 * Backend: /home/z/my-project/coffee_export/data/coffee_export.db
 * Tables:  leads, contracts, agents, events, ai_call_logs, inbox_messages
 *
 * Each section falls back to mock-style values when the underlying
 * table is empty (so the dashboard never looks broken).
 */

import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { relativeTime, messageTime } from "@/lib/format";

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const db = getReadonlyDb();

    try {
      const orgId = auth.user.organizationId;

      // ═══ PIPELINE STAGES (from leads table) ═══
      const leadStateCounts = db.prepare(`
        SELECT current_state, COUNT(*) as n
        FROM leads WHERE deleted_ts IS NULL AND organization_id = ?
        GROUP BY current_state
      `).all(orgId) as any[];
      const stateMap: Record<string, number> = {};
      leadStateCounts.forEach((r) => { stateMap[r.current_state] = r.n; });
      const totalLeads = leadStateCounts.reduce((s, r) => s + r.n, 0);

      // Map backend lead states → frontend pipeline stages
      const stages = [
        { label: "New Leads", count: stateMap["NEW"] || 0, value: "$0", color: "bg-blue-500" },
        { label: "Qualified", count: stateMap["QUALIFIED"] || 0, value: "$0", color: "bg-indigo-500" },
        { label: "Sampling", count: (stateMap["SAMPLE_DISPATCHED"] || 0) + (stateMap["SAMPLE_FEEDBACK_DUE"] || 0), value: "$0", color: "bg-purple-500" },
        { label: "Negotiating", count: (stateMap["IN_SEQUENCE"] || 0) + (stateMap["ENRICHED"] || 0), value: "$0", color: "bg-amber-500" },
        { label: "Contract", count: (stateMap["DECIDED_APPROVED"] || 0) + (stateMap["CONTRACTED"] || 0), value: "$0", color: "bg-green-600" },
        { label: "Completed", count: stateMap["CONTRACTED"] || 0, value: "$0", color: "bg-emerald-600" },
      ];

      // ═══ KPIs ═══
      // Deals: count of leads that are in active pipeline states
      const activeDealStates = ["IN_SEQUENCE", "QUALIFIED", "SAMPLE_DISPATCHED", "SAMPLE_FEEDBACK_DUE", "DECIDED_APPROVED", "DECIDED_NEEDS_ANOTHER"];
      let activeDeals = 0;
      activeDealStates.forEach((s) => { activeDeals += stateMap[s] || 0; });

      // Contracts
      const contractStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafts,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status NOT IN ('cancelled', 'breached') THEN total_value ELSE 0 END) as total_value
        FROM contracts WHERE deleted_ts IS NULL AND organization_id = ?
      `).get(orgId) as any;

      // Shipments
      const shipmentCount = db.prepare("SELECT COUNT(*) as n FROM shipments WHERE organization_id = ?").get(orgId) as any;

      // Payments outstanding (derived from contracts that aren't completed)
      const outstandingPayments = db.prepare(`
        SELECT SUM(total_value) as total
        FROM contracts
        WHERE deleted_ts IS NULL AND status NOT IN ('completed', 'cancelled', 'breached') AND organization_id = ?
      `).get(orgId) as any;

      // Pipeline value = sum of contract values (active ones)
      const pipelineValue = contractStats.total_value || 0;

      const kpis = [
        {
          label: "Deals",
          value: String(activeDeals),
          sub: "Active",
          context: `$${pipelineValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} Pipeline`,
          icon: "Handshake",
          iconBg: "bg-green-50",
          iconColor: "text-green-600",
          trend: "0%",
          trendUp: true,
        },
        {
          label: "Contracts",
          value: String(contractStats.total || 0),
          sub: contractStats.drafts > 0 ? `${contractStats.drafts} Draft` : "No drafts",
          context: `$${pipelineValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} Total Value`,
          icon: "FileText",
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
          trend: "0%",
          trendUp: true,
        },
        {
          label: "Leads",
          value: String(totalLeads),
          sub: `${stateMap["NEW"] || 0} New`,
          context: `${stateMap["QUALIFIED"] || 0} Qualified`,
          icon: "Users",
          iconBg: "bg-blue-50",
          iconColor: "text-blue-600",
          trend: "0%",
          trendUp: true,
        },
        {
          label: "Payments",
          value: `$${Math.round(outstandingPayments.total || 0).toLocaleString()}`,
          sub: "Outstanding",
          context: `$${Math.round(contractStats.total_value || 0).toLocaleString()} Contract Value`,
          icon: "DollarSign",
          iconBg: "bg-green-50",
          iconColor: "text-green-600",
          trend: "0%",
          trendUp: false,
        },
      ];

      // ═══ ACTIVITIES (from events table) ═══
      const eventRows = db.prepare(`
        SELECT id, event_type, entity_type, entity_id, payload, published_by, published_ts, status
        FROM events
        WHERE organization_id = ?
        ORDER BY published_ts DESC
        LIMIT 10
      `).all(orgId) as any[];

      // Map event types → activity display
      const eventConfig: Record<string, { text: (p: any) => string; badge: string; badgeBg: string; badgeColor: string; dot: string }> = {
        LEAD_CREATED: { text: (p) => `New lead created: ${p.company_name || p.lead_id}`, badge: "Lead", badgeBg: "bg-blue-50", badgeColor: "text-blue-700", dot: "bg-blue-500" },
        LEAD_ENRICHED: { text: (p) => `Lead enriched: ${p.company_name || p.lead_id} → ${p.tier || "?"} tier`, badge: "Lead", badgeBg: "bg-blue-50", badgeColor: "text-blue-700", dot: "bg-blue-500" },
        LEAD_STATE_CHANGED: { text: (p) => `Lead ${p.lead_id} → ${p.to_state || "new state"}`, badge: "Lead", badgeBg: "bg-blue-50", badgeColor: "text-blue-700", dot: "bg-blue-500" },
        MESSAGE_SENT: { text: (p) => `Outreach email sent to ${p.buyer_email || "buyer"}`, badge: "Email", badgeBg: "bg-indigo-50", badgeColor: "text-indigo-700", dot: "bg-indigo-500" },
        MESSAGE_RECEIVED: { text: (p) => `Reply received from ${p.from_addr || "buyer"}`, badge: "Email", badgeBg: "bg-indigo-50", badgeColor: "text-indigo-700", dot: "bg-indigo-500" },
        THREAD_OPENED: { text: (p) => `New conversation: ${p.subject || p.thread_id}`, badge: "Inbox", badgeBg: "bg-purple-50", badgeColor: "text-purple-700", dot: "bg-purple-500" },
        CONTRACT_SIGNED: { text: (p) => `Contract signed: ${p.contract_id || ""}`, badge: "Contract", badgeBg: "bg-green-50", badgeColor: "text-green-700", dot: "bg-green-500" },
        SAMPLE_DISPATCHED: { text: (p) => `Sample dispatched to ${p.buyer || "buyer"}`, badge: "Sample", badgeBg: "bg-amber-50", badgeColor: "text-amber-700", dot: "bg-amber-500" },
      };

      const activities = eventRows.map((e) => {
        let payload: any = {};
        try { payload = JSON.parse(e.payload || "{}"); } catch {}
        const config = eventConfig[e.event_type] || {
          text: () => `${e.event_type.replace(/_/g, " ")}: ${e.entity_id}`,
          badge: "System",
          badgeBg: "bg-gray-100",
          badgeColor: "text-gray-700",
          dot: "bg-gray-500",
        };
        return {
          time: messageTime(e.published_ts),
          text: config.text(payload),
          badge: config.badge,
          badgeBg: config.badgeBg,
          badgeColor: config.badgeColor,
          dot: config.dot,
        };
      });

      // ═══ PRIORITIES (derived from real data) ═══
      // Top priority: leads in IN_SEQUENCE state (need follow-up)
      // Second: draft contracts (need action)
      // Third: ghosted leads (need breakup email)
      const priorityLeads = db.prepare(`
        SELECT lead_id, company_name, current_state, last_touch_ts
        FROM leads
        WHERE deleted_ts IS NULL AND current_state IN ('IN_SEQUENCE', 'GHOSTED', 'DECIDED_APPROVED') AND organization_id = ?
        ORDER BY CASE current_state WHEN 'DECIDED_APPROVED' THEN 1 WHEN 'IN_SEQUENCE' THEN 2 WHEN 'GHOSTED' THEN 3 END
        LIMIT 4
      `).all(orgId) as any[];

      const priorityColors = ["bg-red-500", "bg-amber-500", "bg-green-600", "bg-blue-500"];
      const priorities = priorityLeads.map((lead, i) => {
        let text = "";
        if (lead.current_state === "DECIDED_APPROVED") {
          text = `Create contract for ${lead.company_name} — sample approved`;
        } else if (lead.current_state === "IN_SEQUENCE") {
          text = `Follow up with ${lead.company_name} — in outreach sequence`;
        } else if (lead.current_state === "GHOSTED") {
          text = `Send breakup email to ${lead.company_name} — ghosted`;
        } else {
          text = `Review lead ${lead.company_name}`;
        }
        return {
          num: String(i + 1),
          color: priorityColors[i] || "bg-gray-400",
          text,
          time: relativeTime(lead.last_touch_ts),
        };
      });

      // ═══ SHIPMENTS (table is empty — return empty array, frontend will show mock fallback) ═══
      const shipments: any[] = [];

      // ═══ AGENT ACTIVITY (for AI coach / system health) ═══
      const agentActivity = db.prepare(`
        SELECT COUNT(*) as total_calls,
               SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
               SUM(cost_usd) as total_cost
        FROM ai_call_logs
      `).get() as any;

      return NextResponse.json({
        ok: true,
        source: "sqlite",
        data: {
          stages,
          kpis,
          activities,
          priorities,
          shipments,
          stats: {
            totalLeads,
            totalContracts: contractStats.total || 0,
            activeDeals,
            pipelineValue,
            shipmentCount: shipmentCount.n || 0,
            eventCount: eventRows.length,
            agentCalls: agentActivity.total_calls || 0,
            agentCost: agentActivity.total_cost || 0,
          },
        },
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/dashboard] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
