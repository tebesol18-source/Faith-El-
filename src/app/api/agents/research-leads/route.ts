/**
 * Lead intake from the curated real-company directory (Phase 1).
 *
 * GET  /api/agents/research-leads
 *      Browse the curated directory (data/lead-directory.json) WITHOUT
 *      writing anything. Filters: ?country=&segment=&q=&limit=
 *      Every entry carries its public source URL(s).
 *
 * POST /api/agents/research-leads
 *      Modes:
 *        { directoryKeys: ["sucafina-geneva", ...] }
 *            Import the selected real companies as UNVERIFIED leads, each
 *            with its directory evidence (source URL, product interest,
 *            date checked) attached.
 *        { country, segment, count }   (no directoryKeys)
 *            Convenience mode: import the first `count` matching entries.
 *            These are REAL directory companies — nothing is generated.
 *        { enrichLeadId, segment }
 *            Classify an existing lead (tier / VP / language) — rule-based,
 *            no data fabrication.
 *
 * HISTORY: this route used to GENERATE fictional companies ("Heritage Bean
 * Co 24238", @example.com contacts). That generator was removed entirely in
 * Phase 1 — fictional/sample records do not belong in the production
 * database. Intake now happens exclusively from the curated directory or
 * the evidence-required CSV import (/api/leads/import).
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { getWritableDb } from "@/lib/db";
import {
  insertLeadSource,
  looksFictionalCompany,
  nextLeadId,
  VERIFICATION_STATUSES,
} from "@/lib/leads-evidence";

// ─── Directory loading ────────────────────────────────────────────────────

type DirectoryEntry = {
  key: string;
  company: string;
  country: string;
  city: string;
  segment: string;
  website: string;
  product_interest: string;
  sources: { type: string; url: string; name: string }[];
};

type Directory = {
  version: number;
  compiled: string;
  compiled_by: string;
  disclaimer: string;
  segments: string[];
  entries: DirectoryEntry[];
};

let directoryCache: { at: number; data: Directory } | null = null;

export function loadDirectory(): Directory {
  // Small file — cache for 30s so edits show up quickly in a dev session.
  if (directoryCache && Date.now() - directoryCache.at < 30_000) return directoryCache.data;
  const p = path.resolve(process.cwd(), "data", "lead-directory.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Directory;
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new Error("lead-directory.json has no entries");
  }
  directoryCache = { at: Date.now(), data: raw };
  return raw;
}

// ─── Rule-based classification (unchanged from Agent 2's logic) ───────────

const SEGMENTS = ["Specialty Importer", "Commercial Importer", "Roaster", "Distributor"] as const;

const COUNTRY_LANGUAGE: Record<string, string> = {
  Germany: "DE", "United Kingdom": "EN", USA: "EN", Japan: "JA",
  Italy: "IT", France: "FR", Belgium: "EN", Sweden: "EN",
  "South Korea": "KO", Netherlands: "EN", Spain: "EN", Austria: "DE",
  Switzerland: "EN", Denmark: "EN", Norway: "EN", Finland: "EN",
  Canada: "EN", Australia: "EN", "New Zealand": "EN",
  Brazil: "EN", Portugal: "EN", Russia: "RU", Turkey: "TR",
  "Saudi Arabia": "AR", "United Arab Emirates": "AR", Israel: "EN",
  Poland: "EN", "Czech Republic": "EN", Greece: "EN",
  Mexico: "EN", Argentina: "EN", Chile: "EN", Colombia: "EN",
  China: "ZH", Taiwan: "ZH", "Hong Kong": "ZH",
  Thailand: "EN", Malaysia: "EN", Singapore: "EN",
  Philippines: "EN", Indonesia: "EN", Vietnam: "EN",
  "South Africa": "EN", Ireland: "EN",
};

function getLanguage(country: string | null | undefined): string {
  return (country && COUNTRY_LANGUAGE[country]) || "EN";
}

function assignTier(segment: string): string {
  if (segment === "Specialty Importer") return "S";
  if (segment === "Roaster") return "A";
  if (segment === "Commercial Importer") return "B";
  return "C";
}

function selectVP(segment: string): string {
  if (segment === "Commercial Importer" || segment === "Distributor") return "VP3";
  return "VP1";
}

function nowAddisISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

// ─── GET: browse the directory (no writes) ────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const dir = loadDirectory();
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country")?.trim().toLowerCase() || null;
    const segment = searchParams.get("segment")?.trim() || null;
    const q = searchParams.get("q")?.trim().toLowerCase() || null;
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);

    let entries = dir.entries;
    if (country) entries = entries.filter((e) => e.country.toLowerCase() === country);
    if (segment) entries = entries.filter((e) => e.segment === segment);
    if (q) {
      entries = entries.filter(
        (e) =>
          e.company.toLowerCase().includes(q) ||
          e.country.toLowerCase().includes(q) ||
          e.city.toLowerCase().includes(q) ||
          e.product_interest.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      ok: true,
      count: entries.length,
      meta: {
        directoryVersion: dir.version,
        compiled: dir.compiled,
        compiledBy: dir.compiled_by,
        disclaimer: dir.disclaimer,
        noContactsByDesign: true,
      },
      entries: entries.slice(0, limit).map((e) => ({
        key: e.key,
        company: e.company,
        country: e.country,
        city: e.city,
        segment: e.segment,
        website: e.website,
        productInterest: e.product_interest,
        sources: e.sources,
      })),
    });
  } catch (error: any) {
    console.error("[/api/agents/research-leads GET] Error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to load directory" }, { status: 500 });
  }
}

// ─── POST: import directory entries / classify a lead ─────────────────────

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const actor = auth.user.email;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const db = getWritableDb();
  try {
    const now = nowAddisISO();

    // ── Mode 1: classify an existing lead (rule-based, no fabrication) ──
    if (body.enrichLeadId) {
      const lead = db
        .prepare(`SELECT * FROM leads WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL`)
        .get(body.enrichLeadId, orgId) as any;
      if (!lead) {
        return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
      }
      const segment = SEGMENTS.includes(body.segment) ? body.segment : "Roaster";
      const tier = assignTier(segment);
      const vp = selectVP(segment);
      const lang = getLanguage(lead.headquarters_country);

      db.prepare(
        `UPDATE leads SET current_state = 'ENRICHED', current_agent = 'Agent 3',
             priority_tier = ?, recommended_vp = ?, outreach_language = ?, updated_ts = ?
        WHERE lead_id = ? AND organization_id = ?`
      ).run(tier, vp, lang, now, body.enrichLeadId, orgId);

      db.prepare(
        `INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status, organization_id)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).run(
        "LEAD_ENRICHED", "lead", body.enrichLeadId,
        JSON.stringify({ lead_id: body.enrichLeadId, tier, vp, language: lang, classification: "rule-based", segment }),
        "Agent 2", now, orgId
      );

      return NextResponse.json({
        ok: true,
        created: 0,
        enriched: 1,
        leads: [{ id: body.enrichLeadId, tier, vp, language: lang }],
      });
    }

    // ── Mode 2/3: import real directory entries as UNVERIFIED leads ─────
    const dir = loadDirectory();
    let selected: DirectoryEntry[] = [];

    if (Array.isArray(body.directoryKeys) && body.directoryKeys.length > 0) {
      if (body.directoryKeys.length > 100) {
        return NextResponse.json({ ok: false, error: "Max 100 entries per import" }, { status: 400 });
      }
      const byKey = new Map(dir.entries.map((e) => [e.key, e]));
      for (const k of body.directoryKeys) {
        const entry = byKey.get(String(k));
        if (!entry) return NextResponse.json({ ok: false, error: `Unknown directory key: ${k}` }, { status: 400 });
        selected.push(entry);
      }
    } else if (body.country || body.segment) {
      const count = Math.min(Math.max(parseInt(body.count) || 5, 1), 20);
      let pool = dir.entries;
      if (body.country) pool = pool.filter((e) => e.country.toLowerCase() === String(body.country).toLowerCase());
      if (body.segment) {
        // Case-insensitive segment matching ("roaster"/"Roaster"/"ROASTER")
        const wanted = String(body.segment).toLowerCase();
        pool = pool.filter((e) => e.segment.toLowerCase() === wanted);
      }
      selected = pool.slice(0, count);
      if (selected.length === 0) {
        return NextResponse.json(
          { ok: false, error: "No directory entries match those filters", directorySize: dir.entries.length },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nothing to do — provide directoryKeys (preferred) or country/segment filters. " +
            "Fictional lead generation was removed; use the curated directory or /api/leads/import (source URLs required).",
        },
        { status: 400 }
      );
    }

    const created: any[] = [];
    const skipped: any[] = [];

    const tx = db.transaction(() => {
      for (const entry of selected) {
        const fictionReason = looksFictionalCompany(entry.company);
        if (fictionReason) {
          skipped.push({ key: entry.key, company: entry.company, reason: fictionReason });
          continue;
        }
        const existing = db
          .prepare(`SELECT lead_id FROM leads WHERE company_name = ? AND headquarters_country = ? AND organization_id = ? AND deleted_ts IS NULL`)
          .get(entry.company, entry.country, orgId) as { lead_id: string } | undefined;
        if (existing) {
          skipped.push({ key: entry.key, company: entry.company, reason: `already in your lead pool (${existing.lead_id})` });
          continue;
        }

        const leadId = nextLeadId(db, now);
        const tier = assignTier(entry.segment);
        const vp = selectVP(entry.segment);
        const lang = getLanguage(entry.country);
        const sourceHash = crypto.createHash("sha256").update(`${entry.key}:${entry.company}:${entry.country}`).digest("hex");

        // The lead itself starts UNVERIFIED.
        db.prepare(
          `INSERT INTO leads (
            lead_id, company_name, headquarters_country, headquarters_city, website,
            source_row_hash, current_state, current_agent, next_action_agent,
            priority_tier, recommended_vp, outreach_language,
            sequence_step, substitute_round, ghosted_count,
            verification_status, created_ts, updated_ts, organization_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'NEW', 'Agent 2', 'Agent 3', ?, ?, ?, 0, 0, 0, 'unverified', ?, ?, ?)`
        ).run(
          leadId, entry.company, entry.country, entry.city, entry.website,
          sourceHash, tier, vp, lang, now, now, orgId
        );

        // No contact is invented — contacts are discovered and verified by humans.

        // Evidence: one row per cited public source.
        for (const src of entry.sources) {
          insertLeadSource(db, {
            lead_id: leadId,
            organization_id: orgId,
            evidence_for: "company",
            source_type: src.type || "website",
            source_url: src.url,
            source_name: src.name || null,
            company_as_listed: entry.company,
            country: entry.country,
            product_interest: entry.product_interest,
            checked_ts: dir.compiled, // date the directory entry was compiled
            checked_by: `directory v${dir.version}`,
            note: `Imported from curated directory (${dir.compiled}). Requires human verification.`,
            now,
          });
        }

        db.prepare(
          `INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status, organization_id)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
        ).run(
          "LEAD_CREATED", "lead", leadId,
          JSON.stringify({
            lead_id: leadId, company_name: entry.company, country: entry.country,
            origin: "curated-directory", directory_key: entry.key, unverified: true,
          }),
          "Agent 2", now, orgId
        );

        created.push({
          id: leadId,
          company: entry.company,
          country: entry.country,
          city: entry.city,
          segment: entry.segment,
          website: entry.website,
          verificationStatus: "unverified",
          evidenceCount: entry.sources.length,
        });
      }
    });
    tx();

    return NextResponse.json({
      ok: true,
      created: created.length,
      skipped,
      leads: created,
      notice: "All imported leads start UNVERIFIED. Verify the company, add a real contact with evidence, then start outreach.",
    });
  } catch (error: any) {
    console.error("[/api/agents/research-leads POST] Error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to import leads" }, { status: 500 });
  } finally {
    db.close();
  }
}
