/**
 * /api/logistics/containers — physical container records.
 *
 * GET  (auth): list the org's containers (?shipment_id= filters).
 * POST (auth): record a container. A container row is DATA the operator
 *              entered (requested/booked with a provider externally) —
 *              creating it here never claims the provider did anything.
 *              Optionally links to a shipment (org-checked) and a booking.
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/logistics";

const CONTAINER_STATUSES = new Set([
  "REQUESTED", "AVAILABLE", "BOOKED", "ALLOCATED", "PICKED_UP", "AT_WAREHOUSE",
  "STUFFED", "SEALED", "IN_TRANSIT", "AT_PORT", "LOADED_ON_VESSEL", "DEPARTED",
  "ARRIVED", "DELIVERED", "CANCELLED",
]);

const STRING_FIELDS = [
  "container_number", "container_type", "seal_number", "depot", "pickup_date",
  "loaded_date", "stuffed_date", "sealed_date", "gate_in_date",
  "port_arrival_date", "vessel", "voyage", "bill_of_lading", "notes",
] as const;

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  const url = new URL(request.url);
  const shipmentId = url.searchParams.get("shipment_id");

  try {
    const db = getReadonlyDb();
    try {
      let sql = `
        SELECT * FROM logistics_containers
        WHERE deleted_ts IS NULL AND organization_id = ?
      `;
      const params: unknown[] = [orgId];
      if (shipmentId) {
        sql += ` AND shipment_id = ?`;
        params.push(shipmentId);
      }
      sql += ` ORDER BY id DESC`;
      const containers = db.prepare(sql).all(...params);
      return NextResponse.json({ ok: true, count: containers.length, containers });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list containers";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "REQUESTED";
  if (!CONTAINER_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: `Invalid container status: ${status}` }, { status: 400 });
  }

  const shipmentId = typeof body.shipment_id === "string" && body.shipment_id ? body.shipment_id : null;
  const bookingId = Number.isInteger(Number(body.booking_id)) && body.booking_id ? Number(body.booking_id) : null;
  const providerId = Number.isInteger(Number(body.provider_id)) && body.provider_id ? Number(body.provider_id) : null;

  try {
    const db = getWritableDb();
    try {
      // Shipment must exist AND belong to the caller's org
      if (shipmentId) {
        const shipment = db.prepare(
          `SELECT shipment_id FROM shipments
           WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL`
        ).get(shipmentId, orgId);
        if (!shipment) {
          return NextResponse.json(
            { ok: false, error: `Shipment not found: ${shipmentId}` },
            { status: 404 }
          );
        }
      }
      // Booking (if linked) must belong to the org
      if (bookingId) {
        const booking = db.prepare(
          `SELECT id FROM logistics_bookings WHERE id = ? AND organization_id = ? AND deleted_ts IS NULL`
        ).get(bookingId, orgId);
        if (!booking) {
          return NextResponse.json({ ok: false, error: `Booking not found: ${bookingId}` }, { status: 404 });
        }
      }

      const now = nowIso();
      const fields: string[] = ["organization_id", "status", "created_ts", "updated_ts"];
      const values: unknown[] = [orgId, status, now, now];
      if (shipmentId) { fields.push("shipment_id"); values.push(shipmentId); }
      if (bookingId) { fields.push("booking_id"); values.push(bookingId); }
      if (providerId) { fields.push("provider_id"); values.push(providerId); }
      for (const f of STRING_FIELDS) {
        if (f in body) {
          const v = body[f];
          if (v !== null && v !== undefined && typeof v !== "string") {
            return NextResponse.json({ ok: false, error: `${f} must be a string` }, { status: 400 });
          }
          fields.push(f);
          values.push(v === undefined ? null : v);
        }
      }

      const placeholders = fields.map(() => "?").join(", ");
      const result = db.prepare(
        `INSERT INTO logistics_containers (${fields.join(", ")}) VALUES (${placeholders})`
      ).run(...values);
      const container = db.prepare(`SELECT * FROM logistics_containers WHERE id = ?`).get(result.lastInsertRowid);

      // Timeline event — only the real fact: a container record was added
      if (shipmentId) {
        const c = container as { container_number: string | null; container_type: string };
        db.prepare(
          `INSERT INTO logistics_events (
             organization_id, shipment_id, container_id, event_type, title,
             detail, event_ts, source, created_by, created_ts, updated_ts
           ) VALUES (?, ?, ?, 'container_created', ?, ?, ?, 'operator', ?, ?, ?)`
        ).run(
          orgId, shipmentId, result.lastInsertRowid,
          `Container added: ${c.container_number || c.container_type} (${status})`,
          typeof body.notes === "string" && body.notes ? body.notes : null,
          now, auth.user.email, now, now
        );
      }

      return NextResponse.json({ ok: true, container }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create container";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
