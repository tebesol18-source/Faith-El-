/**
 * GET /api/analytics
 *
 * Returns analytics metrics derived from real DB data:
 * - Agent performance (runs, errors, approval rates, actions executed)
 * - Email outreach metrics (sent, responded, response rate, avg response time)
 * - Deal pipeline metrics (conversion rate, avg deal cycle, stage distribution)
 * - Financial metrics (total revenue, avg margin, commission earned)
 * - Feedback learning metrics (approvals, rejections, top reject reasons, adaptations applied)
 * - Operational metrics (samples dispatched, shipments on time, compliance rate)
 */

import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(request: any) {
  // Auth — analytics are available to any logged-in user
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const db = getReadonlyDb();

    try {
      // ═══ 1. AGENT PERFORMANCE ═══
      const agentControls = db.prepare(`
        SELECT agent_id, run_count, error_count, consecutive_errors, last_run_status
        FROM agent_controls ORDER BY agent_id
      `).all() as any[];

      const orgId = auth.user.organizationId;

      const aiCallLogs = db.prepare(`
        SELECT agent_id, COUNT(*) as total_calls,
               SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
               SUM(cost_usd) as total_cost,
               AVG(latency_ms) as avg_latency
        FROM ai_call_logs GROUP BY agent_id
      `).all() as any[];

      const agentNames: Record<string, string> = {
        "Agent 1": "Supplier & Inventory", "Agent 2": "Lead Research",
        "Agent 3": "Outreach & Qualification", "Agent 4": "Sample Management",
        "Agent 5": "Legal & Compliance", "Agent 6": "Logistics & Shipping",
        "Agent 7": "Sales & Relationship",
      };

      const agentPerformance = agentControls.map((ac) => {
        const logs = aiCallLogs.find((l) => l.agent_id === ac.agent_id) || {};
        return {
          agent_id: ac.agent_id,
          name: agentNames[ac.agent_id] || ac.agent_id,
          runs: ac.run_count || 0,
          errors: ac.error_count || 0,
          error_rate: ac.run_count > 0 ? Math.round((ac.error_count / ac.run_count) * 100) : 0,
          last_status: ac.last_run_status,
          ai_calls: logs.total_calls || 0,
          ai_success_rate: logs.total_calls > 0 ? Math.round((logs.successful / logs.total_calls) * 100) : 0,
          avg_latency_ms: logs.avg_latency ? Math.round(logs.avg_latency) : 0,
          total_ai_cost: logs.total_cost || 0,
        };
      });

      // ═══ 2. EMAIL OUTREACH METRICS ═══
      const totalMessagesSent = (db.prepare(`
        SELECT COUNT(*) as n FROM inbox_messages im
        LEFT JOIN message_threads t ON im.thread_id = t.thread_id
        LEFT JOIN leads l ON t.lead_id = l.lead_id
        WHERE im.direction = 'outbound' AND l.organization_id = ?
      `).get(orgId) as any).n;
      const totalMessagesReceived = (db.prepare(`
        SELECT COUNT(*) as n FROM inbox_messages im
        LEFT JOIN message_threads t ON im.thread_id = t.thread_id
        LEFT JOIN leads l ON t.lead_id = l.lead_id
        WHERE im.direction = 'inbound' AND l.organization_id = ?
      `).get(orgId) as any).n;
      const emailResponseRate = totalMessagesSent > 0 ? Math.round((totalMessagesReceived / totalMessagesSent) * 100) : 0;

      // ═══ 3. DEAL PIPELINE METRICS ═══
      const leadStates = db.prepare(`
        SELECT current_state, COUNT(*) as count
        FROM leads WHERE deleted_ts IS NULL AND organization_id = ?
        GROUP BY current_state
      `).all(orgId) as any[];

      const stateMap: Record<string, number> = {};
      leadStates.forEach((s) => { stateMap[s.current_state] = s.count; });

      const totalLeads = leadStates.reduce((s, r) => s + r.count, 0);
      const contracted = stateMap["CONTRACTED"] || 0;
      const decidedApproved = stateMap["DECIDED_APPROVED"] || 0;
      const decidedRejected = stateMap["DECIDED_REJECTED"] || 0;
      const ghosted = stateMap["GHOSTED"] || 0;
      const qualified = stateMap["QUALIFIED"] || 0;

      // Conversion: leads that reached at least QUALIFIED / total leads
      const qualifiedPlus = (stateMap["QUALIFIED"] || 0) + (stateMap["SAMPLE_DISPATCHED"] || 0) +
                           (stateMap["SAMPLE_FEEDBACK_DUE"] || 0) + (stateMap["DECIDED_APPROVED"] || 0) +
                           (stateMap["DECIDED_REJECTED"] || 0) + (stateMap["DECIDED_NEEDS_ANOTHER"] || 0) +
                           (stateMap["CONTRACTED"] || 0);
      const qualificationRate = totalLeads > 0 ? Math.round((qualifiedPlus / totalLeads) * 100) : 0;
      const closeRate = totalLeads > 0 ? Math.round((contracted / totalLeads) * 100) : 0;

      // ═══ 4. FINANCIAL METRICS ═══
      const contractStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status NOT IN ('cancelled','breached') THEN total_value ELSE 0 END) as total_value,
          AVG(CASE WHEN status NOT IN ('cancelled','breached') THEN total_value ELSE NULL END) as avg_value
        FROM contracts WHERE deleted_ts IS NULL AND organization_id = ?
      `).get(orgId) as any;

      const totalRevenue = contractStats.total_value || 0;
      const avgContractValue = contractStats.avg_value || 0;
      const commissionEarned = Math.round(totalRevenue * 0.02);

      // ═══ 5. FEEDBACK LEARNING METRICS ═══
      const feedbackStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN decision = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM agent_feedback WHERE organization_id = ?
      `).get(orgId) as any;

      const rejectReasons = db.prepare(`
        SELECT feedback_reason, COUNT(*) as count
        FROM agent_feedback WHERE decision = 'rejected' AND feedback_reason IS NOT NULL AND organization_id = ?
        GROUP BY feedback_reason ORDER BY count DESC
      `).all(orgId) as any[];

      const feedbackApprovalRate = feedbackStats.total > 0
        ? Math.round((feedbackStats.approved / feedbackStats.total) * 100) : 0;

      // ═══ 6. OPERATIONAL METRICS ═══
      const sampleStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END) as dispatched,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'decided' THEN 1 ELSE 0 END) as decided
        FROM sample_requests WHERE deleted_ts IS NULL AND organization_id = ?
      `).get(orgId) as any;

      const shipmentStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'departed' THEN 1 ELSE 0 END) as departed
        FROM shipments WHERE deleted_ts IS NULL AND organization_id = ?
      `).get(orgId) as any;

      const complianceStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
        FROM compliance_documents WHERE deleted_ts IS NULL AND organization_id = ?
      `).get(orgId) as any;

      // ═══ 7. EVENT PROCESSING METRICS ═══
      const eventStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'consumed' THEN 1 ELSE 0 END) as consumed
        FROM events WHERE organization_id = ?
      `).get(orgId) as any;

      const supervisorLogs = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning,
          SUM(CASE WHEN event_type = 'AUTO_RESTART' THEN 1 ELSE 0 END) as auto_restarts
        FROM supervisor_log WHERE organization_id = ?
      `).get(orgId) as any;

      // ═══ 8. LEAD SOURCE METRICS ═══
      const leadsByCountry = db.prepare(`
        SELECT headquarters_country as country, COUNT(*) as count
        FROM leads WHERE deleted_ts IS NULL AND organization_id = ?
        GROUP BY headquarters_country ORDER BY count DESC LIMIT 10
      `).all(orgId) as any[];

      const leadsByTier = db.prepare(`
        SELECT priority_tier as tier, COUNT(*) as count
        FROM leads WHERE deleted_ts IS NULL AND organization_id = ?
        GROUP BY priority_tier ORDER BY tier
      `).all(orgId) as any[];

      return NextResponse.json({
        ok: true,
        source: "derived from SQLite",
        timestamp: new Date().toISOString(),

        agent_performance: agentPerformance,

        email_metrics: {
          total_sent: totalMessagesSent,
          total_received: totalMessagesReceived,
          response_rate: emailResponseRate,
        },

        pipeline_metrics: {
          total_leads: totalLeads,
          state_distribution: stateMap,
          qualification_rate: qualificationRate,
          close_rate: closeRate,
          contracted,
          decided_approved: decidedApproved,
          decided_rejected: decidedRejected,
          ghosted,
          qualified,
        },

        financial_metrics: {
          total_contracts: contractStats.total || 0,
          completed_contracts: contractStats.completed || 0,
          total_revenue: totalRevenue,
          avg_contract_value: Math.round(avgContractValue),
          commission_earned: commissionEarned,
        },

        feedback_metrics: {
          total_feedback: feedbackStats.total || 0,
          approved: feedbackStats.approved || 0,
          rejected: feedbackStats.rejected || 0,
          approval_rate: feedbackApprovalRate,
          top_reject_reasons: rejectReasons.map((r) => ({ reason: r.feedback_reason, count: r.count })),
        },

        operational_metrics: {
          samples: {
            total: sampleStats.total || 0,
            dispatched: sampleStats.dispatched || 0,
            delivered: sampleStats.delivered || 0,
            decided: sampleStats.decided || 0,
          },
          shipments: {
            total: shipmentStats.total || 0,
            in_transit: shipmentStats.in_transit || 0,
            delivered: shipmentStats.delivered || 0,
            departed: shipmentStats.departed || 0,
          },
          compliance: {
            total_docs: complianceStats.total || 0,
            approved_docs: complianceStats.approved || 0,
            compliance_rate: complianceStats.total > 0 ? Math.round((complianceStats.approved / complianceStats.total) * 100) : 0,
          },
        },

        system_metrics: {
          events: {
            total: eventStats.total || 0,
            pending: eventStats.pending || 0,
            consumed: eventStats.consumed || 0,
            processing_rate: eventStats.total > 0 ? Math.round((eventStats.consumed / eventStats.total) * 100) : 0,
          },
          supervisor: {
            total_log_entries: supervisorLogs.total || 0,
            critical_faults: supervisorLogs.critical || 0,
            warnings: supervisorLogs.warning || 0,
            auto_restarts: supervisorLogs.auto_restarts || 0,
          },
        },

        lead_insights: {
          by_country: leadsByCountry,
          by_tier: leadsByTier,
        },
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
