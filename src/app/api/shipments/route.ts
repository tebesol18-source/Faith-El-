/**
 * GET /api/shipments
 * Reads shipments from the SQLite database.
 * Maps shipments → frontend Shipment shape with vessel, container, route, ETA, status.
 * Joins with contracts for buyer + value info.
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return "—"; }
}

function countryFlag(country: string | null): string {
  if (!country) return "🌍";
  const flags: Record<string, string> = {
    Germany: "🇩🇪", "United Kingdom": "🇬🇧", USA: "🇺🇸", Japan: "🇯🇵",
    Italy: "🇮🇹", France: "🇫🇷", Belgium: "🇧🇪", Sweden: "🇸🇪",
    "South Korea": "🇰🇷", Netherlands: "🇳🇱",
  };
  return flags[country] || "🌍";
}

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const db = getReadonlyDb();
    try {
      const rows = db.prepare(`
        SELECT s.shipment_id, s.contract_id, s.carrier, s.vessel_name,
               s.bill_of_lading_number, s.container_number,
               s.departure_port, s.arrival_port, s.etd, s.eta, s.atd, s.ata,
               s.status, s.notes, s.created_ts,
               c.total_value, c.total_volume_bags, c.incoterm,
               l.company_name AS buyer_name, l.headquarters_country AS buyer_country,
               l.headquarters_city AS buyer_city
        FROM shipments s
        LEFT JOIN contracts c ON s.contract_id = c.contract_id
        LEFT JOIN leads l ON c.lead_id = l.lead_id
        WHERE s.deleted_ts IS NULL AND s.organization_id = ?
        ORDER BY s.created_ts DESC
      `).all(auth.user.organizationId) as any[];

      // Get shipment items (lots)
      const itemsStmt = db.prepare(`
        SELECT lot_id FROM shipment_items WHERE shipment_id = ? AND deleted_ts IS NULL
      `);

      const shipments = rows.map((r) => {
        const items = (itemsStmt.all(r.shipment_id) as any[]) || [];
        const lots = items.map((i) => i.lot_id);
        const weightKg = (r.total_volume_bags || 0) * 60;

        // Calculate days
        const now = new Date();
        const eta = r.eta ? new Date(r.eta) : null;
        const etd = r.etd ? new Date(r.etd) : null;
        const daysRemaining = eta ? Math.ceil((eta.getTime() - now.getTime()) / 86400000) : 0;
        const daysTotal = (eta && etd) ? Math.ceil((eta.getTime() - etd.getTime()) / 86400000) : 0;
        const daysElapsed = etd ? Math.ceil((now.getTime() - etd.getTime()) / 86400000) : 0;

        // Map status to stage
        const statusMap: Record<string, { status: string; stage: string; stageProgress: number }> = {
          pending: { status: "loading", stage: "processing", stageProgress: 10 },
          departed: { status: "on_schedule", stage: "in_transit", stageProgress: 30 },
          in_transit: { status: "on_schedule", stage: "in_transit", stageProgress: 50 },
          arrived: { status: "arrived", stage: "arrived", stageProgress: 80 },
          delivered: { status: "delivered", stage: "delivered", stageProgress: 100 },
          delayed: { status: "delayed", stage: "in_transit", stageProgress: 45 },
        };
        const mapped = statusMap[r.status] || { status: "loading", stage: "processing", stageProgress: 10 };

        return {
          id: r.shipment_id,
          containerNo: r.container_number || "—",
          sealNo: "—",
          bookingRef: r.bill_of_lading_number || "—",
          vessel: r.vessel_name || r.carrier || "—",
          voyage: "—",
          originPort: r.departure_port || "Djibouti",
          destinationPort: r.arrival_port || "—",
          destinationCity: r.buyer_city || "—",
          destinationCountry: r.buyer_country || "—",
          flag: countryFlag(r.buyer_country),
          buyer: r.buyer_name || "Unknown",
          contractId: r.contract_id,
          contractValue: r.total_value || 0,
          weightKg,
          lots,
          departureDate: formatDate(r.etd || r.atd),
          etaDate: formatDate(r.eta),
          daysElapsed,
          daysTotal,
          daysRemaining,
          status: mapped.status,
          stage: mapped.stage,
          stageProgress: mapped.stageProgress,
          temperature: 20.0,
          humidity: 60,
          tempOk: true,
          insuranceValue: (r.total_value || 0) * 1.1,
          demurrageRisk: null,
          docReadiness: 100,
          milestones: [],
          tempLog: [],
          events: [],
        };
      });

      return NextResponse.json({ ok: true, count: shipments.length, shipments });
    } finally { db.close(); }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/shipments
 *
 * Creates a new shipment.
 *
 * Body:
 *   contractId: string     (required)
 *   carrier: string        (required)
 *   departurePort: string  (required)
 *   arrivalPort: string    (required)
 *   etd: string            (required, ISO date — estimated time of departure)
 *   eta: string            (required, ISO date — estimated time of arrival)
 *   vesselName?: string    (optional)
 *   containerNumber?: string  (optional)
 *   billOfLadingNumber?: string  (optional)
 *   notes?: string         (optional)
 *
 * Response: 201 { ok: true, shipment: {...} } | 400 | 500
 */
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
    contractId, carrier, departurePort, arrivalPort, etd, eta,
    vesselName, containerNumber, billOfLadingNumber, notes,
  } = body || {};

  // ─── Validate required fields ───
  const missing: string[] = [];
  if (!contractId) missing.push("contractId");
  if (!carrier) missing.push("carrier");
  if (!departurePort) missing.push("departurePort");
  if (!arrivalPort) missing.push("arrivalPort");
  if (!etd) missing.push("etd");
  if (!eta) missing.push("eta");
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate dates
  const etdDate = new Date(etd);
  const etaDate = new Date(eta);
  if (isNaN(etdDate.getTime())) {
    return NextResponse.json(
      { ok: false, error: "etd must be a valid ISO date string" },
      { status: 400 }
    );
  }
  if (isNaN(etaDate.getTime())) {
    return NextResponse.json(
      { ok: false, error: "eta must be a valid ISO date string" },
      { status: 400 }
    );
  }
  if (etaDate < etdDate) {
    return NextResponse.json(
      { ok: false, error: "eta must be on or after etd" },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      // Verify contract exists (FK enforcement)
      const contract = db.prepare(`
        SELECT contract_id FROM contracts
        WHERE contract_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(contractId, orgId) as { contract_id: string } | undefined;
      if (!contract) {
        return NextResponse.json(
          { ok: false, error: `Contract not found: ${contractId}` },
          { status: 404 }
        );
      }

      const now = nowISO();
      const yyyy = String(new Date().getFullYear());
      const prefix = `SH-${yyyy}-`;

      // ─── Generate shipment_id: SH-YYYY-NNNN ───
      const last = db.prepare(`
        SELECT shipment_id FROM shipments
        WHERE shipment_id LIKE ?
        ORDER BY shipment_id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { shipment_id: string } | undefined;

      let nextNum = 1;
      if (last?.shipment_id) {
        const m = last.shipment_id.match(/(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }
      const shipmentId = `${prefix}${String(nextNum).padStart(4, "0")}`;

      // ─── Insert the shipment ───
      db.prepare(`
        INSERT INTO shipments (
          shipment_id, contract_id, organization_id,
          carrier, vessel_name, bill_of_lading_number, container_number,
          departure_port, arrival_port, etd, eta,
          status, notes,
          created_ts, updated_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      `).run(
        shipmentId, contractId, orgId,
        carrier, vesselName || null, billOfLadingNumber || null, containerNumber || null,
        departurePort, arrivalPort, etd, eta,
        notes || null,
        now, now
      );

      return NextResponse.json({
        ok: true,
        shipment: {
          id: shipmentId,
          contractId,
          carrier,
          vesselName: vesselName || null,
          billOfLadingNumber: billOfLadingNumber || null,
          containerNumber: containerNumber || null,
          departurePort,
          arrivalPort,
          etd,
          eta,
          status: "draft",
          notes: notes || null,
          organization_id: orgId,
          created_ts: now,
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/shipments POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create shipment" },
      { status: 500 }
    );
  }
}
