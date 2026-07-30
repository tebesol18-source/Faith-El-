/**
 * GET /api/leads
 *
 * Reads leads directly from the backend SQLite database.
 * Maps backend Lead model fields to the frontend's expected shape.
 *
 * Backend: /home/z/my-project/coffee_export/data/coffee_export.db
 * Table:   leads (joined with lead_contacts for primary contact)
 *
 * Query params:
 *   - state: filter by current_state (e.g. "QUALIFIED")
 *   - tier:  filter by priority_tier (e.g. "S")
 *   - agent: filter by current_agent (e.g. "Agent 3")
 *   - limit: max results (default 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";

// Frontend-expected lead shape — matches ALL fields shown in the Streamlit leads page
type FrontendLead = {
  id: string;
  company: string;
  country: string | null;
  city: string | null;
  tier: string | null;
  vp: string | null;
  vpLabel: string | null;       // "VP1 — Origin Access" etc.
  state: string;
  language: string;
  languageFlag: string;          // 🇬🇧 🇩🇪 etc.
  score: number;
  lastTouch: string;             // relative ("2h ago")
  updatedTs: string | null;      // raw ISO for sorting
  updatedFormatted: string;      // "2026-07-03 09:49:00"
  tags: string[];                // real tags from lead_tags table
  enriched: boolean;
  // Extra fields from backend (for detail drawer — matches Streamlit detail view)
  website?: string | null;
  agent?: string | null;         // current_agent
  sequenceStep?: number;         // 0-6
  ghostedCount?: number;
  substituteRound?: number;
  nextActionDueTs?: string | null;
  nextActionAgent?: string | null;
  createdAt?: string | null;
  primaryContact?: {
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

/**
 * VP label — matches Streamlit's vp_label() function.
 */
function vpLabel(vp: string | null): string | null {
  if (!vp) return null;
  const labels: Record<string, string> = {
    VP1: "VP1 — Origin Access",
    VP2: "VP2 — Sustainability",
    VP3: "VP3 — Commercial FOB",
    VP4: "VP4 — Microlot Exclusivity",
  };
  return labels[vp] || vp;
}

/**
 * Language flag — matches Streamlit's language_flag() function.
 */
function languageFlag(lang: string): string {
  const flags: Record<string, string> = {
    EN: "🇬🇧",
    DE: "🇩🇪",
    FR: "🇫🇷",
    IT: "🇮🇹",
    JA: "🇯🇵",
    KO: "🇰🇷",
    ZH: "🇨🇳",
    AR: "🇸🇦",
    TR: "🇹🇷",
    RU: "🇷🇺",
  };
  return flags[lang] || "🌍";
}

/**
 * Format ISO timestamp to "YYYY-MM-DD HH:MM:SS" — matches Streamlit's format_ts().
 */
function formatTs(ts: string | null): string {
  if (!ts) return "—";
  return ts.substring(0, 19).replace("T", " ");
}

/**
 * Calculate a heuristic "score" 0-100 for sorting/display.
 * Based on tier, state progression, and enrichment.
 */
function calculateScore(
  tier: string | null,
  state: string,
  enriched: boolean,
  sequenceStep: number
): number {
  let score = 0;
  // Tier bonus
  if (tier === "S") score += 30;
  else if (tier === "A") score += 20;
  else if (tier === "B") score += 10;
  else if (tier === "C") score += 5;
  // State bonus
  const stateBonus: Record<string, number> = {
    NEW: 0,
    ENRICHED: 10,
    IN_SEQUENCE: 15,
    QUALIFIED: 25,
    SAMPLE_DISPATCHED: 30,
    SAMPLE_FEEDBACK_DUE: 32,
    DECIDED_APPROVED: 40,
    CONTRACTED: 50,
    DECIDED_REJECTED: 5,
    DECIDED_NEEDS_ANOTHER: 25,
    GHOSTED: 0,
    NURTURE: 5,
    BLOCKED: 0,
  };
  score += stateBonus[state] || 0;
  if (enriched) score += 10;
  score += Math.min(sequenceStep * 2, 10);
  return Math.min(score, 100);
}

/**
 * Derive display tags from lead fields.
 */
function deriveTags(
  country: string | null,
  tier: string | null,
  state: string
): string[] {
  const tags: string[] = [];
  // Region tag
  if (country) {
    const eu = ["Germany", "United Kingdom", "Italy", "France", "Belgium", "Sweden", "Netherlands", "Spain", "Austria", "Switzerland"];
    const asia = ["Japan", "South Korea", "China", "Singapore", "Taiwan"];
    const americas = ["USA", "Canada", "Brazil", "Colombia"];
    if (eu.includes(country)) tags.push("EU");
    else if (asia.includes(country)) tags.push("Asia");
    else if (americas.includes(country)) tags.push("Americas");
    else tags.push(country);
  }
  // Quality tag
  if (tier === "S" || tier === "A") tags.push("specialty");
  else tags.push("commercial");
  // State tag (if interesting)
  if (state === "CONTRACTED") tags.push("won");
  else if (state === "GHOSTED") tags.push("at-risk");
  return tags;
}

export async function GET(request: NextRequest) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const stateFilter = searchParams.get("state");
    const tierFilter = searchParams.get("tier");
    const agentFilter = searchParams.get("agent");
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    const db = getReadonlyDb();

    try {
      // Build query — join leads with lead_contacts (primary) and lead_tags
      // Matches ALL fields shown in the Streamlit leads page
      let query = `
        SELECT
          l.lead_id,
          l.company_name,
          l.headquarters_country,
          l.headquarters_city,
          l.website,
          l.current_state,
          l.current_agent,
          l.last_touch_ts,
          l.next_action_due_ts,
          l.next_action_agent,
          l.priority_tier,
          l.recommended_vp,
          l.outreach_language,
          l.sequence_step,
          l.ghosted_count,
          l.substitute_round,
          l.created_ts,
          l.updated_ts,
          lc.name AS contact_name,
          lc.title AS contact_title,
          lc.email AS contact_email,
          lc.phone AS contact_phone,
          (SELECT GROUP_CONCAT(tag, ', ') FROM lead_tags WHERE lead_id = l.lead_id) AS tags_csv
        FROM leads l
        LEFT JOIN lead_contacts lc ON l.lead_id = lc.lead_id AND lc.is_primary = 1 AND lc.deleted_ts IS NULL
        WHERE l.deleted_ts IS NULL
      `;
      const params: (string | number)[] = [];
      const conditions: string[] = [];
      if (stateFilter) {
        conditions.push("l.current_state = ?");
        params.push(stateFilter);
      }
      if (tierFilter) {
        conditions.push("l.priority_tier = ?");
        params.push(tierFilter);
      }
      if (agentFilter) {
        conditions.push("l.current_agent = ?");
        params.push(agentFilter);
      }
      if (conditions.length > 0) {
        query += " AND " + conditions.join(" AND ");
      }
      query += " ORDER BY l.created_ts DESC LIMIT ?";
      params.push(limit);

      const rows = db.prepare(query).all(...params) as any[];

      // Map to frontend shape — includes ALL Streamlit fields
      const leads: FrontendLead[] = rows.map((row) => {
        const enriched = row.current_state !== "NEW";
        const score = calculateScore(
          row.priority_tier,
          row.current_state,
          enriched,
          row.sequence_step || 0
        );
        // Use real tags from DB; fall back to derived tags if none
        const realTags = row.tags_csv
          ? row.tags_csv.split(", ").filter(Boolean)
          : deriveTags(row.headquarters_country, row.priority_tier, row.current_state);
        return {
          id: row.lead_id,
          company: row.company_name,
          country: row.headquarters_country,
          city: row.headquarters_city || null,
          tier: row.priority_tier,
          vp: row.recommended_vp,
          vpLabel: vpLabel(row.recommended_vp),
          state: row.current_state,
          language: row.outreach_language || "EN",
          languageFlag: languageFlag(row.outreach_language || "EN"),
          score,
          lastTouch: relativeTime(row.last_touch_ts),
          updatedTs: row.updated_ts || null,
          updatedFormatted: formatTs(row.updated_ts),
          tags: realTags,
          enriched,
          website: row.website || null,
          agent: row.current_agent,
          sequenceStep: row.sequence_step || 0,
          ghostedCount: row.ghosted_count || 0,
          substituteRound: row.substitute_round || 0,
          nextActionDueTs: row.next_action_due_ts || null,
          nextActionAgent: row.next_action_agent || null,
          createdAt: row.created_ts,
          primaryContact: row.contact_name
            ? {
                name: row.contact_name,
                title: row.contact_title,
                email: row.contact_email,
                phone: row.contact_phone,
              }
            : null,
        };
      });

      return NextResponse.json({
        ok: true,
        count: leads.length,
        source: "sqlite",
        leads,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/leads] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to fetch leads",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
