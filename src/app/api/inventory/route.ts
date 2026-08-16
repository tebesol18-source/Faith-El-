/**
 * GET /api/inventory
 * Reads coffee lots from the SQLite database.
 * Maps lots table → frontend shape { id, region, station, coop, process, score, screen, stock, cropYear, eudr, certifications[], status }
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import crypto from "crypto";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();
    try {
      const rows = db.prepare(`
        SELECT lot_id, region, washing_station_name, coop_name, process,
               screen_size, cupping_score, stock_bags_remaining, crop_year,
               certifications, eudr_data_status, status, bag_size_kg
        FROM lots WHERE deleted_ts IS NULL AND organization_id = ? ORDER BY created_ts DESC
      `).all(orgId) as any[];

      const lots = rows.map((r) => ({
        id: r.lot_id,
        region: r.region,
        station: r.washing_station_name || "—",
        coop: r.coop_name || "—",
        process: r.process,
        score: r.cupping_score || 0,
        screen: r.screen_size || 0,
        stock: r.stock_bags_remaining || 0,
        cropYear: r.crop_year || "—",
        eudr: r.eudr_data_status || "missing",
        certifications: r.certifications
          ? r.certifications.split(";").filter(Boolean).map((c: string) => {
              const cleaned = c.trim().toLowerCase();
              const certMap: Record<string, string> = { ft: "Fairtrade", organic: "Organic", ra: "Rainforest Alliance", utz: "UTZ" };
              return certMap[cleaned] || (cleaned.charAt(0).toUpperCase() + cleaned.slice(1));
            })
          : [],
        status: r.status || "active",
      }));

      return NextResponse.json({ ok: true, count: lots.length, lots });
    } finally { db.close(); }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/inventory
 *
 * Creates a new coffee lot.
 *
 * Body:
 *   region: string              (required — Yirgacheffe|Sidamo|Guji|Limu|Jimma|Harrar|other)
 *   washingStationName: string  (required)
 *   coopName: string            (required)
 *   process: string             (required — Washed|Natural|Honey|Anaerobic)
 *   screenSize: number          (required)
 *   cuppingScore: number        (required)
 *   stockBags: number           (required, initial stock)
 *   cropYear: string            (required, e.g. "2024/25")
 *   certifications?: string     (optional, semicolon-separated: FT;Organic;RA;UTZ)
 *   bagSizeKg?: number          (optional, default 60)
 *   eudrDataStatus?: string     (optional, default "missing")
 *
 * Response: 201 { ok: true, lot: {...} } | 400 { ok: false, error } | 500
 */
const VALID_LOT_REGIONS = ["Yirgacheffe", "Sidamo", "Guji", "Limu", "Jimma", "Harrar", "other"];
const VALID_LOT_PROCESSES = ["Washed", "Natural", "Honey", "Anaerobic"];

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

  const {
    region, washingStationName, coopName, process,
    screenSize, cuppingScore, stockBags, cropYear,
    certifications, bagSizeKg, eudrDataStatus,
  } = body || {};

  // ─── Validate required fields ───
  const missing: string[] = [];
  if (!region) missing.push("region");
  if (!washingStationName) missing.push("washingStationName");
  if (!coopName) missing.push("coopName");
  if (!process) missing.push("process");
  if (screenSize == null) missing.push("screenSize");
  if (cuppingScore == null) missing.push("cuppingScore");
  if (stockBags == null) missing.push("stockBags");
  if (!cropYear) missing.push("cropYear");
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  if (!VALID_LOT_REGIONS.includes(region)) {
    return NextResponse.json(
      { ok: false, error: `region must be one of: ${VALID_LOT_REGIONS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_LOT_PROCESSES.includes(process)) {
    return NextResponse.json(
      { ok: false, error: `process must be one of: ${VALID_LOT_PROCESSES.join(", ")}` },
      { status: 400 }
    );
  }

  const screenSizeNum = Number(screenSize);
  const cuppingScoreNum = Number(cuppingScore);
  const stockBagsNum = Number(stockBags);
  if (isNaN(screenSizeNum) || isNaN(cuppingScoreNum) || isNaN(stockBagsNum)) {
    return NextResponse.json(
      { ok: false, error: "screenSize, cuppingScore, and stockBags must be numbers" },
      { status: 400 }
    );
  }
  if (stockBagsNum < 0) {
    return NextResponse.json(
      { ok: false, error: "stockBags must be >= 0" },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      const now = nowISO();

      // ─── Resolve station_id and coop_id (FKs are enforced) ───
      // The lots table has NOT NULL FKs to washing_stations and coops.
      // Look up an existing station by name + region; if not found, look up
      // (or create) the coop, then create a washing_station under it.
      let stationId: string;
      let coopId: string;

      const existingStation = db.prepare(`
        SELECT station_id, coop_id FROM washing_stations
        WHERE name = ? AND (region = ? OR region IS NULL) AND deleted_ts IS NULL
        LIMIT 1
      `).get(washingStationName, region) as { station_id: string; coop_id: string } | undefined;

      if (existingStation) {
        stationId = existingStation.station_id;
        coopId = existingStation.coop_id;
      } else {
        const existingCoop = db.prepare(`
          SELECT coop_id FROM coops
          WHERE name = ? AND deleted_ts IS NULL
          LIMIT 1
        `).get(coopName) as { coop_id: string } | undefined;

        if (existingCoop) {
          coopId = existingCoop.coop_id;
        } else {
          // Create a new coop
          coopId = `COOP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
          db.prepare(`
            INSERT INTO coops (coop_id, name, region, created_ts, updated_ts)
            VALUES (?, ?, ?, ?, ?)
          `).run(coopId, coopName, region, now, now);
        }

        // Create a new washing_station under the coop
        stationId = `STATION-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        db.prepare(`
          INSERT INTO washing_stations (station_id, coop_id, name, region, created_ts, updated_ts)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(stationId, coopId, washingStationName, region, now, now);
      }

      // ─── Generate lot_id: LOT-YY-NNNN (auto-increment per year) ───
      const yy = String(new Date().getFullYear()).slice(-2);
      const prefix = `LOT-${yy}-`;
      const last = db.prepare(`
        SELECT lot_id FROM lots
        WHERE lot_id LIKE ?
        ORDER BY lot_id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { lot_id: string } | undefined;

      let nextNum = 1;
      if (last?.lot_id) {
        const m = last.lot_id.match(/(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }
      const lotId = `${prefix}${String(nextNum).padStart(4, "0")}`;

      // ─── Insert the lot ───
      db.prepare(`
        INSERT INTO lots (
          lot_id, station_id, coop_id, organization_id, region,
          washing_station_name, coop_name, process,
          screen_size, cupping_score, stock_bags_remaining,
          crop_year, certifications, bag_size_kg,
          eudr_data_status, reserved_for_forward_program, status,
          last_updated_ts, created_ts, updated_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'No', 'active', ?, ?, ?)
      `).run(
        lotId, stationId, coopId, orgId, region,
        washingStationName, coopName, process,
        screenSizeNum, cuppingScoreNum, stockBagsNum,
        cropYear, certifications || null, bagSizeKg ?? 60,
        eudrDataStatus || "missing",
        now, now, now
      );

      // ─── Record an initial_stock movement (best-effort) ───
      try {
        db.prepare(`
          INSERT INTO stock_movements (lot_id, delta_bags, reason, reference_id, notes, ts)
          VALUES (?, ?, 'initial_stock', ?, 'Initial stock on lot creation', ?)
        `).run(lotId, stockBagsNum, lotId, now);
      } catch (e) {
        // Non-fatal — lot is already created
        console.warn("[/api/inventory POST] stock_movements insert failed:", e);
      }

      return NextResponse.json({
        ok: true,
        lot: {
          id: lotId,
          region,
          station: washingStationName,
          coop: coopName,
          process,
          score: cuppingScoreNum,
          screen: screenSizeNum,
          stock: stockBagsNum,
          cropYear,
          certifications: certifications
            ? certifications.split(";").filter(Boolean)
            : [],
          status: "active",
          eudr: eudrDataStatus || "missing",
          organization_id: orgId,
          created_ts: now,
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/inventory POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create lot" },
      { status: 500 }
    );
  }
}
