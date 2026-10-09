/**
 * GET /api/shipments
 * Reads shipments from the SQLite database.
 * Maps shipments → frontend Shipment shape with vessel, container, route, ETA, status.
 * Joins with contracts for buyer + value info.
 * Also returns `logistics` per shipment: container/booking counts, export
 * checklist progress and actions needed (Logistics Command Center).
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { loadChecklistTemplate, nowIso } from "@/lib/logistics";

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

      // Logistics Command Center per-shipment counters (real DB only)
      const containersStmt = db.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered
        FROM logistics_containers
        WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `);
      const bookingCountStmt = db.prepare(`
        SELECT COUNT(*) AS n FROM logistics_bookings
        WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `);
      const checklistStmt = db.prepare(`
        SELECT SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done, COUNT(*) AS total
        FROM logistics_checklist_items
        WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `);

      const shipments = rows.map((r) => {
        const items = (itemsStmt.all(r.shipment_id) as any[]) || [];
        const lots = items.map((i) => i.lot_id);
        const weightKg = (r.total_volume_bags || 0) * 60;

        const containers = containersStmt.get(r.shipment_id, auth.user.organizationId) as
          | { total: number; delivered: number | null }
          | undefined;
        const bookingCount = (bookingCountStmt.get(r.shipment_id, auth.user.organizationId) as
          | { n: number }
          | undefined)?.n ?? 0;
        const checklist = checklistStmt.get(r.shipment_id, auth.user.organizationId) as
          | { done: number | null; total: number }
          | undefined;

        // Actions needed — derived from stored facts (same rules as the
        // detail bundle's next-actions section)
        let actionsNeeded = 0;
        if (r.status === "delayed" || r.status === "customs_hold") actionsNeeded++;
        if (r.etd && !r.atd && r.etd < new Date().toISOString().slice(0, 10)) actionsNeeded++;
        if (bookingCount === 0 && r.status === "draft") actionsNeeded++;

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
          // Logistics Command Center (real counters from the shared DB)
          rawStatus: r.status,
          logistics: {
            containers: containers?.total ?? 0,
            containersDelivered: containers?.delivered ?? 0,
            bookings: bookingCount,
            checklistDone: checklist?.done ?? 0,
            checklistTotal: checklist?.total ?? 0,
            actionsNeeded,
          },
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
 *   carrier: string        (optional — merged from the external booking record)
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
  // carrier is deliberately OPTIONAL in the Command Center flow: a shipment
  // starts as a draft record (container requirement from the contract) and
  // the carrier is merged on when the operator records the REAL external
  // booking (POST /api/logistics/bookings). Requiring a carrier up front
  // would encourage made-up carrier names.
  const missing: string[] = [];
  if (!contractId) missing.push("contractId");
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

      // ─── Logistics Command Center: seed the 18-step export checklist ───
      // Same template the Python runtime seeds (data/logistics-checklist-
      // template.json is the single source). Creating the checklist does
      // NOT tick anything — every step is completed by a human, with
      // external providers, and attested in Faith-El.
      const template = loadChecklistTemplate();
      const insertItem = db.prepare(`
        INSERT INTO logistics_checklist_items (
          organization_id, shipment_id, position, title, detail, status,
          created_ts, updated_ts
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `);
      for (let i = 0; i < template.length; i++) {
        insertItem.run(orgId, shipmentId, i + 1, template[i].title, template[i].detail || null, now, now);
      }

      // Timeline: the record's creation is a real event (nothing was booked)
      db.prepare(`
        INSERT INTO logistics_events (
          organization_id, shipment_id, event_type, title, detail,
          event_ts, source, created_by, created_ts, updated_ts
        ) VALUES (?, ?, 'shipment_created', ?, ?, ?, 'operator', ?, ?, ?)
      `).run(
        orgId, shipmentId,
        `Shipment record created for contract ${contractId}`,
        "Shipment record created. No booking exists yet — the next step is finding a provider in Logistics Resources and booking on their official channel.",
        now, auth.user.email, now, now
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
          checklistItems: template.length,
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
