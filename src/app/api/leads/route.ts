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
import Database from "better-sqlite3";
import path from "path";

// Path to the backend SQLite database (relative to project root)
const DB_PATH = path.resolve(
  process.cwd(),
  "..",
  "coffee_export",
  "data",
  "coffee_export.db"
);

// Fallback path if running inside the project dir itself
const DB_PATH_FALLBACK = path.resolve(
  process.cwd(),
  "coffee_export",
  "data",
  "coffee_export.db"
);

function getDbPath(): string {
  const fs = require("fs");
  if (fs.existsSync(DB_PATH)) return DB_PATH;
  if (fs.existsSync(DB_PATH_FALLBACK)) return DB_PATH_FALLBACK;
  // Last resort: absolute path
  return "/home/z/my-project/coffee_export/data/coffee_export.db";
}

// Frontend-expected lead shape
type FrontendLead = {
  id: string;
  company: string;
  country: string | null;
  city: string | null;
  tier: string | null;
  vp: string | null;
  state: string;
  language: string;
  score: number;
  lastTouch: string;
  tags: string[];
  enriched: boolean;
  // Extra fields from backend (for detail drawer)
  website?: string | null;
  agent?: string | null;
  sequenceStep?: number;
  ghostedCount?: number;
  createdAt?: string | null;
  primaryContact?: {
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

/**
 * Convert ISO timestamp to "X ago" relative format
 * e.g. "2h ago", "5d ago", "Never"
 */
function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffMs = now - then;
    if (diffMs < 0) return "Just now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  } catch {
    return "Unknown";
  }
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
  try {
    const { searchParams } = new URL(request.url);
    const stateFilter = searchParams.get("state");
    const tierFilter = searchParams.get("tier");
    const agentFilter = searchParams.get("agent");
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    const dbPath = getDbPath();
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    try {
      // Build query — join leads with lead_contacts (primary only) in one go
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
          l.priority_tier,
          l.recommended_vp,
          l.outreach_language,
          l.sequence_step,
          l.ghosted_count,
          l.created_ts,
          l.updated_ts,
          lc.name AS contact_name,
          lc.title AS contact_title,
          lc.email AS contact_email,
          lc.phone AS contact_phone
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

      // Map to frontend shape
      const leads: FrontendLead[] = rows.map((row) => {
        const enriched = row.current_state !== "NEW";
        const score = calculateScore(
          row.priority_tier,
          row.current_state,
          enriched,
          row.sequence_step || 0
        );
        return {
          id: row.lead_id,
          company: row.company_name,
          country: row.headquarters_country,
          city: row.headquarters_city || null,
          tier: row.priority_tier,
          vp: row.recommended_vp,
          state: row.current_state,
          language: row.outreach_language || "EN",
          score,
          lastTouch: relativeTime(row.last_touch_ts),
          tags: deriveTags(row.headquarters_country, row.priority_tier, row.current_state),
          enriched,
          website: row.website,
          agent: row.current_agent,
          sequenceStep: row.sequence_step,
          ghostedCount: row.ghosted_count,
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
