/**
 * /api/logistics/shipments/[id] — the Command Center shipment detail bundle.
 *
 * GET (auth): one shipment (org-scoped) with everything the detail drawer
 *             needs in a single call:
 *               - shipment facts (contract, buyer, carrier, vessel, B/L,
 *                 ports, ETD/ETA/ATD/ATA, status)
 *               - the 18-step export checklist (auto-seeded on first read
 *                 if missing — idempotent)
 *               - recorded external bookings
 *               - containers with lifecycle dates
 *               - transport segments
 *               - timeline events (only real, stored events — never
 *                 generated here)
 *               - next actions (derived from REAL data: missing booking on
 *                 a departure date, pickup date approaching, booking
 *                 without confirmation document, open checklist steps)
 *               - customs document readiness (existing compliance data)
 */
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { loadChecklistTemplate, nowIso } from "@/lib/logistics";

interface TaskAlert {
  severity: "warning" | "info";
  title: string;
  detail: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id } = await params;
  const shipmentId = id;

  try {
    const db = getWritableDb();
    try {
      const shipment = db.prepare(
        `SELECT s.*, c.total_value, c.total_volume_bags, c.incoterm,
                l.company_name AS buyer_name, l.headquarters_country AS buyer_country,
                l.headquarters_city AS buyer_city
         FROM shipments s
         LEFT JOIN contracts c ON s.contract_id = c.contract_id
         LEFT JOIN leads l ON c.lead_id = l.lead_id
         WHERE s.shipment_id = ? AND s.organization_id = ? AND s.deleted_ts IS NULL`
      ).get(shipmentId, orgId) as Record<string, unknown> | undefined;
      if (!shipment) {
        return NextResponse.json({ ok: false, error: "Shipment not found" }, { status: 404 });
      }

      // ── Checklist (seed idempotently if missing) ──
      let checklist = db.prepare(
        `SELECT * FROM logistics_checklist_items
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY position ASC`
      ).all(shipmentId, orgId);
      if (checklist.length === 0) {
        const now = nowIso();
        const template = loadChecklistTemplate();
        const insert = db.prepare(
          `INSERT INTO logistics_checklist_items (
             organization_id, shipment_id, position, title, detail, status,
             created_ts, updated_ts
           ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
        );
        for (let i = 0; i < template.length; i++) {
          insert.run(orgId, shipmentId, i + 1, template[i].title, template[i].detail || null, now, now);
        }
        checklist = db.prepare(
          `SELECT * FROM logistics_checklist_items
           WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
           ORDER BY position ASC`
        ).all(shipmentId, orgId);
      }

      // ── Bookings / containers / transport / events ──
      const bookings = db.prepare(
        `SELECT * FROM logistics_bookings
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY created_ts DESC`
      ).all(shipmentId, orgId);

      const containers = db.prepare(
        `SELECT * FROM logistics_containers
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY id ASC`
      ).all(shipmentId, orgId);

      const transport = db.prepare(
        `SELECT * FROM logistics_transport_segments
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY id ASC`
      ).all(shipmentId, orgId);

      const events = db.prepare(
        `SELECT * FROM logistics_events
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY event_ts ASC, id ASC`
      ).all(shipmentId, orgId);

      const customsDocs = db.prepare(
        `SELECT * FROM customs_documents WHERE shipment_id = ? AND deleted_ts IS NULL ORDER BY id ASC`
      ).all(shipmentId);

      // ── Next actions — derived ONLY from stored facts ──
      const tasks: TaskAlert[] = [];
      const today = new Date();
      const daysUntil = (iso: string | null | undefined): number | null => {
        if (!iso) return null;
        const d = new Date(String(iso));
        if (isNaN(d.getTime())) return null;
        return Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
      };

      // 1. A container pickup date that is approaching (or past)
      for (const c of containers as Record<string, unknown>[]) {
        const d = daysUntil(c.pickup_date as string | null);
        if (d !== null && c.status !== "PICKED_UP" && c.status !== "CANCELLED" && c.status !== "DELIVERED") {
          if (d <= 0) {
            tasks.push({
              severity: "warning",
              title: "Container pickup date has arrived",
              detail: `Container ${c.container_number || ""} pickup is scheduled for ${c.pickup_date} — confirm pickup with the provider if not yet done.`,
            });
          } else if (d <= 2) {
            tasks.push({
              severity: "warning",
              title: "Container pickup date is approaching",
              detail: `Container pickup date is scheduled for ${c.pickup_date} (${d} day${d === 1 ? "" : "s"} away).`,
            });
          }
        }
      }

      // 2. Booked shipment without any booking record (data gap)
      if ((bookings as unknown[]).length === 0 && shipment.status === "draft") {
        tasks.push({
          severity: "info",
          title: "No booking recorded yet",
          detail: "Find a provider in Logistics Resources and record the external booking once placed.",
        });
      }

      // 3. Booking without a confirmation document
      for (const b of bookings as Record<string, unknown>[]) {
        if (!b.confirmation_document && b.status !== "cancelled") {
          tasks.push({
            severity: "info",
            title: "Booking confirmation not uploaded",
            detail: `Upload the confirmation for ${b.provider_name} booking ${b.booking_reference}.`,
          });
        }
      }

      // 4. Open checklist steps (informational)
      const openSteps = (checklist as Record<string, unknown>[]).filter((c) => c.status === "pending");
      if (openSteps.length > 0) {
        tasks.push({
          severity: "info",
          title: `${openSteps.length} checklist item(s) still open`,
          detail: `${openSteps[0].title} (+${openSteps.length - 1} more)`,
        });
      }

      // 5. ETD approaching without ATD (departure watch)
      const etdDays = daysUntil(shipment.etd as string | null);
      if (etdDays !== null && !shipment.atd && shipment.status !== "delivered" && etdDays <= 2) {
        tasks.push({
          severity: etdDays <= 0 ? "warning" : "info",
          title: etdDays <= 0 ? "Vessel ETD has passed" : "Vessel departure is imminent",
          detail: `ETD ${shipment.etd} — confirm the vessel's actual departure with the carrier and record the ATD.`,
        });
      }

      // 6. Delivery-ready hint: shipment arrived AND every non-cancelled
      //    container DELIVERED — the shipment-level final delivery action
      //    is now available (derived ONLY from stored facts).
      if (shipment.status === "arrived" && (containers as Record<string, unknown>[]).length > 0) {
        const notDelivered = (containers as Record<string, unknown>[]).filter(
          (c) => c.status !== "DELIVERED" && c.status !== "CANCELLED"
        );
        if (notDelivered.length === 0) {
          tasks.push({
            severity: "info",
            title: "All containers delivered — record the final delivery",
            detail:
              "Every container on this shipment is DELIVERED. Record the shipment-level final delivery to complete the contract and hand off to Agent 7 (account + delivery follow-up).",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        shipment,
        checklist,
        bookings,
        containers,
        transport,
        events,
        customsDocs,
        tasks,
      });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load shipment";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
