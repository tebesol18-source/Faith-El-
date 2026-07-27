/**
 * GET /api/vessel-tracking
 *
 * Returns live vessel tracking data for all shipments.
 * Simulates MarineTraffic / VesselFinder API integration.
 *
 * In production, this would call:
 *   - MarineTraffic API (https://services.marinetraffic.com/api/)
 *   - or VesselFinder API (https://api.vesselfinder.com/)
 *
 * The simulation calculates realistic vessel positions based on:
 *   - Departure date (ETD)
 *   - Arrival date (ETA)
 *   - Route (Djibouti → destination via Suez Canal or Cape of Good Hope)
 *   - Days elapsed vs total voyage
 *
 * Response: {
 *   ok, source,
 *   vessels: [{
 *     shipment_id, vessel_name, imo, flag, type,
 *     current_position: { lat, lon, status },
 *     speed_knots, heading,
 *     route_progress_pct,
 *     route_waypoints: [{ name, lat, lon, passed, eta }],
 *     next_port, eta,
 *     days_to_arrival,
 *     weather: { condition, wind_knots, wave_height_m },
 *     alerts: []
 *   }]
 * }
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

// Route waypoints (lat, lon) — Djibouti → Suez → Mediterranean → European ports
const ROUTES: Record<string, { name: string; lat: number; lon: number }[]> = {
  "Hamburg": [
    { name: "Djibouti", lat: 11.5731, lon: 43.1456 },
    { name: "Bab el-Mandeb Strait", lat: 12.6, lon: 43.3 },
    { name: "Red Sea (South)", lat: 15.0, lon: 41.5 },
    { name: "Red Sea (North)", lat: 27.0, lon: 35.0 },
    { name: "Suez Canal (South)", lat: 29.9, lon: 32.5 },
    { name: "Suez Canal (North)", lat: 31.0, lon: 32.3 },
    { name: "Mediterranean (East)", lat: 34.0, lon: 28.0 },
    { name: "Mediterranean (Central)", lat: 37.5, lon: 15.0 },
    { name: "Strait of Gibraltar", lat: 36.0, lon: -5.5 },
    { name: "Atlantic (Bay of Biscay)", lat: 45.0, lon: -5.0 },
    { name: "English Channel", lat: 50.0, lon: 2.0 },
    { name: "Hamburg", lat: 53.5511, lon: 9.9937 },
  ],
  "Antwerp": [
    { name: "Djibouti", lat: 11.5731, lon: 43.1456 },
    { name: "Bab el-Mandeb Strait", lat: 12.6, lon: 43.3 },
    { name: "Red Sea (North)", lat: 27.0, lon: 35.0 },
    { name: "Suez Canal (South)", lat: 29.9, lon: 32.5 },
    { name: "Mediterranean (Central)", lat: 37.5, lon: 15.0 },
    { name: "Strait of Gibraltar", lat: 36.0, lon: -5.5 },
    { name: "Atlantic (Bay of Biscay)", lat: 45.0, lon: -5.0 },
    { name: "English Channel", lat: 50.5, lon: 1.0 },
    { name: "Antwerp", lat: 51.2194, lon: 4.4025 },
  ],
  "Trieste": [
    { name: "Djibouti", lat: 11.5731, lon: 43.1456 },
    { name: "Red Sea (North)", lat: 27.0, lon: 35.0 },
    { name: "Suez Canal (South)", lat: 29.9, lon: 32.5 },
    { name: "Mediterranean (East)", lat: 34.0, lon: 28.0 },
    { name: "Mediterranean (Adriatic)", lat: 42.0, lon: 18.0 },
    { name: "Trieste", lat: 45.6495, lon: 13.7768 },
  ],
  "_default": [
    { name: "Djibouti", lat: 11.5731, lon: 43.1456 },
    { name: "Indian Ocean", lat: 5.0, lon: 50.0 },
    { name: "Destination Port", lat: 0, lon: 0 },
  ],
};

// Weather conditions for different regions
function getWeatherForPosition(lat: number, lon: number): { condition: string; wind_knots: number; wave_height_m: number } {
  // Red Sea
  if (lat > 12 && lat < 30 && lon > 32 && lon < 44) {
    return { condition: "Clear, hot", wind_knots: 8 + Math.floor(Math.random() * 8), wave_height_m: 0.5 + Math.random() * 0.8 };
  }
  // Mediterranean
  if (lat > 30 && lat < 46 && lon > -6 && lon < 30) {
    return { condition: "Partly cloudy", wind_knots: 10 + Math.floor(Math.random() * 12), wave_height_m: 0.8 + Math.random() * 1.2 };
  }
  // Atlantic / English Channel
  if (lat > 40 && lon < 5) {
    return { condition: "Overcast, rough seas", wind_knots: 18 + Math.floor(Math.random() * 15), wave_height_m: 1.5 + Math.random() * 2.0 };
  }
  // Indian Ocean
  if (lat < 12) {
    return { condition: "Tropical, humid", wind_knots: 6 + Math.floor(Math.random() * 10), wave_height_m: 0.6 + Math.random() * 1.0 };
  }
  return { condition: "Clear", wind_knots: 10 + Math.floor(Math.random() * 10), wave_height_m: 1.0 + Math.random() * 1.0 };
}

// Interpolate position between two waypoints
function interpolatePosition(w1: { lat: number; lon: number }, w2: { lat: number; lon: number }, fraction: number) {
  return {
    lat: w1.lat + (w2.lat - w1.lat) * fraction,
    lon: w1.lon + (w2.lon - w1.lon) * fraction,
  };
}

export async function GET() {
  try {
    const db = new Database(getDbPath(), { readonly: true });

    try {
      const shipments = db.prepare(`
        SELECT s.shipment_id, s.vessel_name, s.carrier, s.container_number,
               s.departure_port, s.arrival_port, s.etd, s.eta, s.status,
               c.total_volume_bags,
               l.company_name AS buyer_name, l.headquarters_city
        FROM shipments s
        LEFT JOIN contracts c ON s.contract_id = c.contract_id
        LEFT JOIN leads l ON c.lead_id = l.lead_id
        WHERE s.deleted_ts IS NULL
        ORDER BY s.created_ts DESC
      `).all() as any[];

      if (shipments.length === 0) {
        return NextResponse.json({ ok: true, source: "simulated (MarineTraffic-style)", vessels: [], count: 0 });
      }

      const vessels = shipments.map((s) => {
        const arrivalPort = s.arrival_port || "Hamburg";
        const route = ROUTES[arrivalPort] || ROUTES["_default"];

        // Calculate voyage progress
        const etd = s.etd ? new Date(s.etd) : new Date();
        const eta = s.eta ? new Date(s.eta) : new Date(Date.now() + 21 * 86400000);
        const now = new Date();

        const totalMs = eta.getTime() - etd.getTime();
        const elapsedMs = now.getTime() - etd.getTime();
        const progressPct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));

        const daysTotal = Math.ceil(totalMs / 86400000);
        const daysElapsed = Math.max(0, Math.ceil(elapsedMs / 86400000));
        const daysRemaining = Math.max(0, Math.ceil((eta.getTime() - now.getTime()) / 86400000));

        // Determine current position along route
        const routeProgress = progressPct / 100;
        const segmentCount = route.length - 1;
        const exactSegment = routeProgress * segmentCount;
        const currentSegmentIdx = Math.min(Math.floor(exactSegment), segmentCount - 1);
        const segmentFraction = exactSegment - currentSegmentIdx;

        const currentWaypoint = route[currentSegmentIdx];
        const nextWaypoint = route[currentSegmentIdx + 1];
        const position = interpolatePosition(currentWaypoint, nextWaypoint, segmentFraction);

        // Build waypoints with passed/eta status
        const waypoints = route.map((wp, i) => {
          const wpProgress = (i / segmentCount) * 100;
          return {
            name: wp.name,
            lat: wp.lat,
            lon: wp.lon,
            passed: wpProgress <= progressPct,
            eta: wpProgress <= progressPct ? null : `+${Math.ceil((wpProgress - progressPct) / 100 * daysTotal)} days`,
          };
        });

        // Determine status
        let vesselStatus = "Under Way";
        if (progressPct >= 100) vesselStatus = "Arrived";
        else if (progressPct < 5) vesselStatus = "Departed";
        else if (progressPct > 95) vesselStatus = "Approaching Port";

        // Weather at current position
        const weather = getWeatherForPosition(position.lat, position.lon);

        // Generate alerts
        const alerts: string[] = [];
        if (weather.wind_knots > 25) alerts.push(`High wind warning: ${weather.wind_knots} knots`);
        if (weather.wave_height_m > 2.5) alerts.push(`Rough seas: ${weather.wave_height_m.toFixed(1)}m waves`);
        if (daysRemaining <= 2 && progressPct < 95) alerts.push(`Arriving soon — prepare customs documentation`);
        if (s.status === "delayed") alerts.push(`Vessel delayed — original ETA exceeded`);

        // Speed (typical container ship: 18-24 knots)
        const speed = s.status === "delayed" ? 14 + Math.floor(Math.random() * 3) : 20 + Math.floor(Math.random() * 4);
        const heading = Math.round((Math.atan2(nextWaypoint.lon - currentWaypoint.lon, nextWaypoint.lat - currentWaypoint.lat) * 180 / Math.PI + 360) % 360);

        // IMO number (synthetic but consistent)
        const imo = 9000000 + (s.shipment_id.charCodeAt(s.shipment_id.length - 1) - 48) * 10000 + s.shipment_id.charCodeAt(s.shipment_id.length - 2) * 100;

        return {
          shipment_id: s.shipment_id,
          vessel_name: s.vessel_name || "Unknown Vessel",
          imo: String(imo),
          flag: "Liberia",
          type: "Container Ship",
          carrier: s.carrier || "—",
          container_number: s.container_number || "—",
          buyer: s.buyer_name || "Unknown",
          destination_port: arrivalPort,
          current_position: {
            lat: Math.round(position.lat * 10000) / 10000,
            lon: Math.round(position.lon * 10000) / 10000,
            status: vesselStatus,
            nearest_land: currentWaypoint.name,
          },
          speed_knots: speed,
          heading,
          route_progress_pct: Math.round(progressPct),
          route_waypoints: waypoints,
          next_port: nextWaypoint.name,
          eta: s.eta,
          days_to_arrival: daysRemaining,
          days_elapsed: daysElapsed,
          days_total: daysTotal,
          weather,
          alerts,
        };
      });

      return NextResponse.json({
        ok: true,
        source: "simulated (MarineTraffic-style)",
        timestamp: new Date().toISOString(),
        count: vessels.length,
        vessels,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
