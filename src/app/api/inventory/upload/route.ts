/**
 * POST /api/inventory/upload
 *
 * Seller uploads a CSV of coffee lots. The API:
 * 1. Parses the CSV (region, washing_station_name, coop_name, process, etc.)
 * 2. Auto-creates or finds coops + washing_stations records
 * 3. Generates lot_id (LOT-25-XXXX)
 * 4. Inserts into lots table
 * 5. Returns the created lots
 *
 * CSV format (header row required):
 *   region,washing_station_name,coop_name,process,screen_size,cupping_score,
 *   crop_year,stock_bags_remaining,certifications,eudr_data_status,
 *   eudr_gps_lat,eudr_gps_lon,eudr_farmgate_price_etb_per_kg
 *
 * Body: { csv: string }  (raw CSV text)
 * Response: { ok, created: number, lots: [...] }
 */

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

function getDbPath(): string {
  const fs = require("fs");
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

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

// Simple CSV parser (handles quoted fields)
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }
  return { headers, rows };
}

type CreatedLot = {
  lot_id: string;
  region: string;
  process: string;
  cupping_score: number;
  stock_bags: number;
  coop_name: string;
  washing_station_name: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const csvText = body.csv;

    if (!csvText || typeof csvText !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing 'csv' field in request body" },
        { status: 400 }
      );
    }

    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "CSV has no data rows (header only)" },
        { status: 400 }
      );
    }

    const db = new Database(getDbPath());
    const now = nowISO();
    const createdLots: CreatedLot[] = [];

    try {
      // Get next lot number
      const lastLot = db.prepare("SELECT lot_id FROM lots ORDER BY lot_id DESC LIMIT 1").get() as any;
      let nextNum = 1;
      if (lastLot?.lot_id) {
        const match = lastLot.lot_id.match(/LOT-25-(\d+)/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }

      // Get next coop/station numbers
      const lastCoop = db.prepare("SELECT coop_id FROM coops ORDER BY coop_id DESC LIMIT 1").get() as any;
      let nextCoopNum = 1;
      if (lastCoop?.coop_id) {
        const m = lastCoop.coop_id.match(/COOP-(\d+)/);
        if (m) nextCoopNum = parseInt(m[1]) + 1;
      }
      const lastStation = db.prepare("SELECT station_id FROM washing_stations ORDER BY station_id DESC LIMIT 1").get() as any;
      let nextStationNum = 1;
      if (lastStation?.station_id) {
        const m = lastStation.station_id.match(/WS-(\d+)/);
        if (m) nextStationNum = parseInt(m[1]) + 1;
      }

      // Cache for coop/station lookups (avoid duplicates)
      const coopCache: Record<string, string> = {}; // "name|region" → coop_id
      const stationCache: Record<string, string> = {}; // "name|region" → station_id

      const insert = db.transaction(() => {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const region = row.region || "Unknown";
          const coopName = row.coop_name || `${region} Union`;
          const stationName = row.washing_station_name || `${region} Station`;
          const process = row.process || "Washed";
          const cropYear = row.crop_year || "25/26";

          // Find or create coop
          const coopKey = `${coopName}|${region}`;
          let coopId = coopCache[coopKey];
          if (!coopId) {
            // Check if exists in DB
            const existing = db.prepare("SELECT coop_id FROM coops WHERE name = ? AND region = ? AND deleted_ts IS NULL").get(coopName, region) as any;
            if (existing) {
              coopId = existing.coop_id;
            } else {
              coopId = `COOP-${String(nextCoopNum++).padStart(4, "0")}`;
              db.prepare(`
                INSERT INTO coops (coop_id, name, region, registration_number, contact_name, contact_phone, contact_email, created_ts, updated_ts, deleted_ts)
                VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL)
              `).run(coopId, coopName, region, now, now);
            }
            coopCache[coopKey] = coopId;
          }

          // Find or create washing station
          const stationKey = `${stationName}|${region}`;
          let stationId = stationCache[stationKey];
          if (!stationId) {
            const existing = db.prepare("SELECT station_id FROM washing_stations WHERE name = ? AND region = ? AND deleted_ts IS NULL").get(stationName, region) as any;
            if (existing) {
              stationId = existing.station_id;
            } else {
              stationId = `WS-${String(nextStationNum++).padStart(4, "0")}`;
              const lat = row.eudr_gps_lat ? parseFloat(row.eudr_gps_lat) : null;
              const lon = row.eudr_gps_lon ? parseFloat(row.eudr_gps_lon) : null;
              db.prepare(`
                INSERT INTO washing_stations (station_id, coop_id, name, region, gps_lat, gps_lon, altitude_m, capacity_bags_per_year, created_ts, updated_ts, deleted_ts)
                VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)
              `).run(stationId, coopId, stationName, region, lat, lon, now, now);
            }
            stationCache[stationKey] = stationId;
          }

          // Create lot
          const lotId = `LOT-25-${String(nextNum++).padStart(4, "0")}`;
          const screen = row.screen_size ? parseInt(row.screen_size) : null;
          const cupping = row.cupping_score ? parseFloat(row.cupping_score) : null;
          const stockBags = parseInt(row.stock_bags_remaining) || 0;
          const eudrStatus = row.eudr_data_status || "missing";
          const eudrLat = row.eudr_gps_lat ? parseFloat(row.eudr_gps_lat) : null;
          const eudrLon = row.eudr_gps_lon ? parseFloat(row.eudr_gps_lon) : null;
          const farmgatePrice = row.eudr_farmgate_price_etb_per_kg ? parseFloat(row.eudr_farmgate_price_etb_per_kg) : null;
          const certifications = row.certifications || "";

          db.prepare(`
            INSERT INTO lots (
              lot_id, station_id, coop_id, region, washing_station_name, coop_name,
              process, screen_size, cupping_score, q_grader_name, grading_date,
              defect_count_sca, moisture_pct, water_activity, crop_year,
              harvest_date_range, milling_date, stock_bags_remaining, bag_size_kg,
              certifications, certificate_of_origin, eudr_data_status,
              eudr_gps_lat, eudr_gps_lon, eudr_farmgate_price_etb_per_kg,
              eudr_deforestation_attestation, reserved_for_forward_program,
              status, last_updated_ts, created_ts, updated_ts, deleted_ts
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?,
              NULL, NULL, ?, 60, ?, NULL, ?, ?, ?, ?, NULL, 'No',
              'active', ?, ?, ?, NULL
            )
          `).run(
            lotId, stationId, coopId, region, stationName, coopName,
            process, screen, cupping, cropYear,
            stockBags, certifications, eudrStatus,
            eudrLat, eudrLon, farmgatePrice,
            now, now, now
          );

          createdLots.push({
            lot_id: lotId,
            region,
            process,
            cupping_score: cupping || 0,
            stock_bags: stockBags,
            coop_name: coopName,
            washing_station_name: stationName,
          });
        }
      });

      insert();

      return NextResponse.json({
        ok: true,
        created: createdLots.length,
        lots: createdLots,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/inventory/upload] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to upload inventory" },
      { status: 500 }
    );
  }
}
