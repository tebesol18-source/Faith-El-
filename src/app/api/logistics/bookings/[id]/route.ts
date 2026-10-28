/**
 * /api/logistics/bookings/[id] — update a booking record.
 *
 * PATCH (auth): correct details (container numbers, dates, document,
 *               notes) or mark status confirmed/cancelled. All changes are
 *               org-scoped; cross-org rows are invisible (404). Status
 *               changes write an honest timeline event on the shipment.
 */
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/logistics";

const BOOKING_STATUSES = new Set(["recorded", "confirmed", "cancelled"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id } = await params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) {
    return NextResponse.json({ ok: false, error: "Invalid booking id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if ("status" in body && (typeof body.status !== "string" || !BOOKING_STATUSES.has(body.status))) {
    return NextResponse.json(
      { ok: false, error: "status must be 'recorded', 'confirmed' or 'cancelled'" },
      { status: 400 }
    );
  }

  const STRING_FIELDS = [
    "booked_date", "container_type", "pickup_location", "depot",
    "available_date", "container_numbers", "vessel", "voyage", "etd", "eta",
    "confirmation_document", "notes",
  ] as const;

  try {
    const db = getWritableDb();
    try {
      const existing = db.prepare(
        `SELECT * FROM logistics_bookings WHERE id = ? AND organization_id = ? AND deleted_ts IS NULL`
      ).get(bookingId, orgId) as
        | { shipment_id: string | null; status: string; booking_reference: string; [k: string]: unknown }
        | undefined;
      if (!existing) {
        return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      for (const f of STRING_FIELDS) {
        if (f in body) {
          const v = body[f];
          if (v !== null && v !== undefined && typeof v !== "string") {
            return NextResponse.json({ ok: false, error: `${f} must be a string` }, { status: 400 });
          }
          sets.push(`${f} = ?`);
          values.push(v === undefined ? null : v);
        }
      }
      if ("quantity" in body) {
        const q = Number(body.quantity);
        if (!Number.isInteger(q) || q < 1) {
          return NextResponse.json({ ok: false, error: "quantity must be a positive integer" }, { status: 400 });
        }
        sets.push(`quantity = ?`);
        values.push(q);
      }
      if ("status" in body) {
        sets.push(`status = ?`);
        values.push(body.status);
      }
      if (sets.length === 0) {
        return NextResponse.json({ ok: false, error: "No updatable fields provided" }, { status: 400 });
      }

      const now = nowIso();
      sets.push(`updated_ts = ?`);
      values.push(now);
      values.push(bookingId);
      db.prepare(`UPDATE logistics_bookings SET ${sets.join(", ")} WHERE id = ?`).run(...values);

      // Timeline event on status change
      if ("status" in body && existing.shipment_id && body.status !== existing.status) {
        db.prepare(
          `INSERT INTO logistics_events (
             organization_id, shipment_id, event_type, title, detail,
             event_ts, source, created_by, created_ts, updated_ts
           ) VALUES (?, ?, 'booking_updated', ?, ?, ?, 'operator', ?, ?, ?)`
        ).run(
          orgId, existing.shipment_id,
          `Booking ${existing.booking_reference}: ${existing.status} → ${body.status}`,
          typeof body.notes === "string" && body.notes ? body.notes : null,
          now, auth.user.email, now, now
        );
      }

      const booking = db.prepare(`SELECT * FROM logistics_bookings WHERE id = ?`).get(bookingId);
      return NextResponse.json({ ok: true, booking });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update booking";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
