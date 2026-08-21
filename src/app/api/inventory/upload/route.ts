import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import crypto from "crypto";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ok: false, error: "Invalid JSON"}, {status: 400}); }
  const { csv } = body || {};
  if (!csv || typeof csv !== "string") return NextResponse.json({ok: false, error: "csv is required"}, {status: 400});

  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return NextResponse.json({ok: false, error: "CSV must have header and data rows"}, {status: 400});

  const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase().replace(/ /g, '_'));
  const db = getWritableDb();
  let created = 0;

  try {
    const yy = String(new Date().getFullYear()).slice(-2);
    const prefix = `LOT-${yy}-`;
    const last = db.prepare(`SELECT lot_id FROM lots WHERE lot_id LIKE ? ORDER BY lot_id DESC LIMIT 1`).get(`${prefix}%`) as any;
    let nextNum = last?.lot_id ? parseInt(last.lot_id.match(/(\d+)$/)[1], 10) + 1 : 1;
    const now = nowISO();

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map((v: string) => v.trim());
      const row: any = {};
      headers.forEach((h: string, idx: number) => { row[h] = vals[idx]; });

      const lotId = `${prefix}${String(nextNum++).padStart(4, "0")}`;
      const coopId = `COOP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const stationId = `STATION-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      db.prepare(`INSERT OR IGNORE INTO coops (coop_id, name, region, created_ts, updated_ts) VALUES (?, ?, ?, ?, ?)`).run(coopId, row.coop_name || "Unknown", row.region || "Unknown", now, now);
      db.prepare(`INSERT OR IGNORE INTO washing_stations (station_id, coop_id, name, region, created_ts, updated_ts) VALUES (?, ?, ?, ?, ?, ?)`).run(stationId, coopId, row.washing_station_name || "Unknown", row.region || "Unknown", now, now);

      db.prepare(`
        INSERT INTO lots (lot_id, station_id, coop_id, organization_id, region, washing_station_name, coop_name, process, screen_size, cupping_score, stock_bags_remaining, crop_year, certifications, bag_size_kg, eudr_data_status, reserved_for_forward_program, status, last_updated_ts, created_ts, updated_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'No', 'active', ?, ?, ?)
      `).run(lotId, stationId, coopId, orgId, row.region || "Unknown", row.washing_station_name || "Unknown", row.coop_name || "Unknown", row.process || "Washed", Number(row.screen_size) || 14, Number(row.cupping_score) || 85, Number(row.stock_bags_remaining) || 0, row.crop_year || "25/26", row.certifications || null, 60, row.eudr_data_status || "missing", now, now, now);
      created++;
    }
    return NextResponse.json({ok: true, created});
  } finally { db.close(); }
}