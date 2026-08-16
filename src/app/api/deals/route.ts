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

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
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

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();

    try {
      const leads = db.prepare(`
        SELECT l.lead_id, l.company_name, l.headquarters_country, l.headquarters_city,
               l.current_state, l.current_agent, l.priority_tier, l.recommended_vp,
               l.outreach_language, l.sequence_step, l.ghosted_count,
               l.last_touch_ts, l.updated_ts,
               lc.name AS contact_name
        FROM leads l
        LEFT JOIN lead_contacts lc ON l.lead_id = lc.lead_id AND lc.is_primary = 1 AND lc.deleted_ts IS NULL
        WHERE l.deleted_ts IS NULL AND l.organization_id = ?
        ORDER BY l.created_ts DESC
      `).all(orgId) as any[];

      // Get contract info per lead
      const contractStmt = db.prepare(`
        SELECT contract_id, total_value, status FROM contracts
        WHERE organization_id = ? AND lead_id = ? AND deleted_ts IS NULL LIMIT 1
      `);

      const deals = leads.map((l) => {
        const { stage, health } = mapLeadStateToDealStage(l.current_state);
        const contract = contractStmt.get(orgId, l.lead_id) as any;

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

/**
 * POST /api/deals
 *
 * Creates a deal from a lead. There is no `deals` table — deals are derived
 * from leads (see GET above). So this endpoint:
 *   1. Validates the lead exists (org-scoped).
 *   2. Promotes the lead's current_state to QUALIFIED (idempotent if already
 *      at or beyond QUALIFIED) and writes a lead_state_history audit row.
 *   3. Returns a synthetic deal object with deal_id = DEAL-YYYY-NNNN.
 *
 * Body:
 *   leadId: string         (required)
 *   estimatedValue: number (required, >= 0)
 *
 * Response: 201 { ok: true, deal: {...} } | 400 | 404 | 500
 *
 * NOTE: The `leads` table has no `deal_value` column, so the estimated value
 * is only returned in the response — it is not persisted on the lead.
 */
const DEAL_STATES = [
  "QUALIFIED",
  "SAMPLE_DISPATCHED",
  "SAMPLE_FEEDBACK_DUE",
  "DECIDED_APPROVED",
  "DECIDED_NEEDS_ANOTHER",
  "CONTRACTED",
];

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { leadId, estimatedValue } = body || {};

  // ─── Validate required fields ───
  const missing: string[] = [];
  if (!leadId) missing.push("leadId");
  if (estimatedValue == null) missing.push("estimatedValue");
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const estimatedValueNum = Number(estimatedValue);
  if (isNaN(estimatedValueNum) || estimatedValueNum < 0) {
    return NextResponse.json(
      { ok: false, error: "estimatedValue must be a non-negative number" },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      // Verify lead exists (org-scoped)
      const lead = db.prepare(`
        SELECT lead_id, company_name, headquarters_country, headquarters_city,
               current_state, priority_tier, current_agent
        FROM leads
        WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(leadId, orgId) as {
        lead_id: string;
        company_name: string;
        headquarters_country: string | null;
        headquarters_city: string | null;
        current_state: string;
        priority_tier: string | null;
        current_agent: string;
      } | undefined;

      if (!lead) {
        return NextResponse.json(
          { ok: false, error: `Lead not found: ${leadId}` },
          { status: 404 }
        );
      }

      const now = nowISO();
      const yyyy = String(new Date().getFullYear());
      const previousState = lead.current_state;

      // ─── Promote lead to QUALIFIED (only if not already past that stage) ───
      if (!DEAL_STATES.includes(lead.current_state)) {
        db.prepare(`
          UPDATE leads
          SET current_state = 'QUALIFIED', updated_ts = ?
          WHERE lead_id = ? AND organization_id = ?
        `).run(now, leadId, orgId);

        // Append to lead_state_history (audit trail)
        try {
          db.prepare(`
            INSERT INTO lead_state_history (lead_id, from_state, to_state, agent_id, ts, notes)
            VALUES (?, ?, 'QUALIFIED', ?, ?, ?)
          `).run(
            leadId,
            previousState,
            auth.user.email,
            now,
            `Deal created (estimatedValue=$${estimatedValueNum.toFixed(2)})`
          );
        } catch (e) {
          // Non-fatal — the lead update already succeeded
          console.warn("[/api/deals POST] lead_state_history insert failed:", e);
        }
      }

      // ─── Generate synthetic deal_id: DEAL-YYYY-NNNN ───
      // Count existing deal-stage leads for this org to derive the next number.
      const countRow = db.prepare(`
        SELECT COUNT(*) AS cnt FROM leads
        WHERE organization_id = ?
          AND current_state IN (${DEAL_STATES.map(() => "?").join(", ")})
      `).get(orgId, ...DEAL_STATES) as { cnt: number };

      const nextNum = (countRow?.cnt || 0) + 1;
      const dealId = `DEAL-${yyyy}-${String(nextNum).padStart(4, "0")}`;

      // ─── Compose the synthetic deal object ───
      // Stage mapping mirrors the GET handler's mapLeadStateToDealStage.
      const newState = DEAL_STATES.includes(lead.current_state) ? lead.current_state : "QUALIFIED";
      const stageMap: Record<string, { stage: string; health: string }> = {
        QUALIFIED: { stage: "quoting", health: "healthy" },
        SAMPLE_DISPATCHED: { stage: "sampling", health: "waiting" },
        SAMPLE_FEEDBACK_DUE: { stage: "sampling", health: "waiting" },
        DECIDED_APPROVED: { stage: "contract_drafted", health: "healthy" },
        DECIDED_NEEDS_ANOTHER: { stage: "sampling", health: "at_risk" },
        CONTRACTED: { stage: "closed_won", health: "healthy" },
      };
      const { stage, health } = stageMap[newState] || { stage: "quoting", health: "healthy" };
      const stageProbabilities: Record<string, number> = {
        prospecting: 10, qualified: 25, quoting: 40, sampling: 50,
        negotiating: 60, contract_drafted: 80, closed_won: 100, closed_lost: 0,
      };

      return NextResponse.json({
        ok: true,
        deal: {
          id: dealId,
          lead: lead.company_name,
          leadId: lead.lead_id,
          stage,
          origin: lead.headquarters_country || "Unknown",
          value: estimatedValueNum,
          probability: stageProbabilities[stage] || 40,
          health,
          status: "open",
          previousState,
          newState,
          contact: null,
          agent: lead.current_agent,
          tier: lead.priority_tier,
          organization_id: orgId,
          created_ts: now,
          note: "Synthetic deal — derived from lead (no deals table). estimatedValue is not persisted on the lead.",
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/deals POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create deal" },
      { status: 500 }
    );
  }
}
