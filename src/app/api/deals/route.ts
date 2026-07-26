/**
 * GET /api/deals
 *
 * Derives deals from the leads table. Maps lead states to deal pipeline stages:
 *   NEW / ENRICHED          → prospecting
 *   IN_SEQUENCE / QUALIFIED → qualified / quoting
 *   SAMPLE_DISPATCHED       → sampling
 *   DECIDED_APPROVED        → contract_drafted
 *   CONTRACTED              → closed_won
 *   DECIDED_REJECTED        → closed_lost
 *   GHOSTED / NURTURE       → prospecting (with health: at_risk)
 *
 * Joins with contracts for value and with lead_contacts for buyer info.
 */

import { NextResponse } from "next/server";
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

function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return "—";
  }
}

function mapLeadStateToDealStage(state: string): { stage: string; health: string } {
  switch (state) {
    case "NEW": return { stage: "prospecting", health: "healthy" };
    case "ENRICHED": return { stage: "prospecting", health: "healthy" };
    case "IN_SEQUENCE": return { stage: "qualified", health: "healthy" };
    case "QUALIFIED": return { stage: "quoting", health: "healthy" };
    case "SAMPLE_DISPATCHED": return { stage: "sampling", health: "waiting" };
    case "SAMPLE_FEEDBACK_DUE": return { stage: "sampling", health: "waiting" };
    case "DECIDED_APPROVED": return { stage: "contract_drafted", health: "healthy" };
    case "DECIDED_NEEDS_ANOTHER": return { stage: "sampling", health: "at_risk" };
    case "CONTRACTED": return { stage: "closed_won", health: "healthy" };
    case "DECIDED_REJECTED": return { stage: "closed_lost", health: "at_risk" };
    case "GHOSTED": return { stage: "prospecting", health: "at_risk" };
    case "NURTURE": return { stage: "prospecting", health: "waiting" };
    case "BLOCKED": return { stage: "prospecting", health: "at_risk" };
    default: return { stage: "prospecting", health: "healthy" };
  }
}

export async function GET() {
  try {
    const db = new Database(getDbPath(), { readonly: true });

    try {
      const leads = db.prepare(`
        SELECT l.lead_id, l.company_name, l.headquarters_country, l.headquarters_city,
               l.current_state, l.current_agent, l.priority_tier, l.recommended_vp,
               l.outreach_language, l.sequence_step, l.ghosted_count,
               l.last_touch_ts, l.updated_ts,
               lc.name AS contact_name
        FROM leads l
        LEFT JOIN lead_contacts lc ON l.lead_id = lc.lead_id AND lc.is_primary = 1 AND lc.deleted_ts IS NULL
        WHERE l.deleted_ts IS NULL
        ORDER BY l.created_ts DESC
      `).all() as any[];

      // Get contract info per lead
      const contractStmt = db.prepare(`
        SELECT contract_id, total_value, status FROM contracts
        WHERE lead_id = ? AND deleted_ts IS NULL LIMIT 1
      `);

      const deals = leads.map((l) => {
        const { stage, health } = mapLeadStateToDealStage(l.current_state);
        const contract = contractStmt.get(l.lead_id) as any;

        // Estimate deal value based on tier
        const tierValues: Record<string, number> = { S: 50000, A: 30000, B: 15000, C: 5000 };
        const estimatedValue = contract?.total_value || tierValues[l.priority_tier] || 10000;

        // Estimate probability based on stage
        const stageProbabilities: Record<string, number> = {
          prospecting: 10, qualified: 25, quoting: 40, sampling: 50,
          negotiating: 60, contract_drafted: 80, closed_won: 100, closed_lost: 0,
        };

        return {
          id: `DEAL-${l.lead_id}`,
          lead: l.company_name,
          leadId: l.lead_id,
          stage,
          origin: l.headquarters_country || "Unknown",
          process: l.priority_tier === "S" ? "Specialty" : "Commercial",
          volume: `${(tierValues[l.priority_tier] || 10000) / 50} bags`,
          incoterm: contract?.status === "completed" ? "FOB" : "TBD",
          value: estimatedValue,
          probability: stageProbabilities[stage] || 10,
          health,
          updated: relativeTime(l.updated_ts || l.last_touch_ts),
          quotes: 0,
          lastQuote: null,
          contractId: contract?.contract_id || null,
          contractStatus: contract?.status || null,
          contact: l.contact_name,
          agent: l.current_agent,
          tier: l.priority_tier,
          vp: l.recommended_vp,
          language: l.outreach_language,
          sequenceStep: l.sequence_step,
          ghostedCount: l.ghosted_count,
        };
      });

      // Stats
      const stageCounts: Record<string, number> = {};
      deals.forEach(d => { stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1; });

      const totalValue = deals.filter(d => d.stage !== "closed_lost").reduce((s, d) => s + d.value, 0);
      const weightedValue = deals.filter(d => d.stage !== "closed_lost").reduce((s, d) => s + (d.value * d.probability / 100), 0);
      const wonDeals = deals.filter(d => d.stage === "closed_won").length;
      const lostDeals = deals.filter(d => d.stage === "closed_lost").length;
      const activeDeals = deals.filter(d => !["closed_won", "closed_lost"].includes(d.stage)).length;
      const atRiskDeals = deals.filter(d => d.health === "at_risk").length;

      return NextResponse.json({
        ok: true,
        source: "sqlite",
        deals,
        stats: {
          total: deals.length,
          active: activeDeals,
          won: wonDeals,
          lost: lostDeals,
          atRisk: atRiskDeals,
          totalValue,
          weightedValue,
          stageCounts,
        },
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/deals] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
