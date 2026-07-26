/**
 * GET /api/inventory
 * Reads coffee lots from the SQLite database.
 * Maps lots table → frontend shape { id, region, station, coop, process, score, screen, stock, cropYear, eudr, certifications[], status }
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
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return candidates[candidates.length - 1];
}

export async function GET() {
  try {
    const db = new Database(getDbPath(), { readonly: true });
    try {
      const rows = db.prepare(`
        SELECT lot_id, region, washing_station_name, coop_name, process,
               screen_size, cupping_score, stock_bags_remaining, crop_year,
               certifications, eudr_data_status, status, bag_size_kg
        FROM lots WHERE deleted_ts IS NULL ORDER BY created_ts DESC
      `).all() as any[];

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
