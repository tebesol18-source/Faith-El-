/**
 * /api/logistics/bookings — records of REAL external bookings.
 *
 * GET  (auth): list the org's booking records (?shipment_id= filters).
 * POST (auth): record a booking the OPERATOR made on a provider's official
 *              channel. Faith-El places no bookings — this endpoint stores
 *              the operator's attestation: provider, the provider's OWN
 *              reference, container type/quantity, depot/pickup, vessel,
 *              voyage, ETD/ETA, and an optional confirmation document path.
 *
 *              Side effects (all honest): shipment → 'booked', carrier/vessel/
 *              ETD/ETA merged onto the shipment when provided, a
 *              'booking_recorded' timeline event, and — when container
 *              numbers are supplied — container rows in BOOKED status.
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/logistics";

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
        SELECT * FROM logistics_bookings
        WHERE deleted_ts IS NULL AND organization_id = ?
      `;
      const params: unknown[] = [orgId];
      if (shipmentId) {
        sql += ` AND shipment_id = ?`;
        params.push(shipmentId);
      }
      sql += ` ORDER BY created_ts DESC`;
      const bookings = db.prepare(sql).all(...params);
      return NextResponse.json({ ok: true, count: bookings.length, bookings });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list bookings";
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

  const providerName = typeof body.provider_name === "string" ? body.provider_name.trim() : "";
  const bookingReference = typeof body.booking_reference === "string" ? body.booking_reference.trim() : "";
  const providerIdRaw = Number.isInteger(Number(body.provider_id)) && body.provider_id ? Number(body.provider_id) : null;
  // provider_name may be omitted when provider_id is given — the name is
  // then resolved from the directory (the UI's Record Booking modal picks
  // a provider, it does not retype the name).
  if (!providerName && !providerIdRaw) {
    return NextResponse.json({ ok: false, error: "provider_name (or provider_id) is required" }, { status: 400 });
  }
  if (!bookingReference) {
    return NextResponse.json(
      { ok: false, error: "booking_reference is required — record the reference the provider gave you" },
      { status: 400 }
    );
  }

  const shipmentId = typeof body.shipment_id === "string" && body.shipment_id ? body.shipment_id : null;
  const providerId = providerIdRaw;
  const quantity = Number.isInteger(Number(body.quantity)) && Number(body.quantity) > 0 ? Number(body.quantity) : 1;

  const str = (key: string): string | null => {
    const v = body[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
  };

  try {
    const db = getWritableDb();
    try {
      // Shipment must exist AND belong to the caller's org
      let shipment: { contract_id: string } | undefined;
      if (shipmentId) {
        shipment = db.prepare(
          `SELECT contract_id FROM shipments
           WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL`
        ).get(shipmentId, orgId) as { contract_id: string } | undefined;
        if (!shipment) {
          return NextResponse.json(
            { ok: false, error: `Shipment not found: ${shipmentId}` },
            { status: 404 }
          );
        }
      }
      // Provider (if linked) must be visible to the org (own or global)
      let providerNameFinal = providerName;
      if (providerId) {
        const provider = db.prepare(
          `SELECT name, active FROM logistics_providers
           WHERE id = ? AND deleted_ts IS NULL
             AND (organization_id IS NULL OR organization_id = ?)`
        ).get(providerId, orgId) as { name: string; active: number } | undefined;
        if (!provider) {
          return NextResponse.json(
            { ok: false, error: `Provider not found: ${providerId}` },
            { status: 404 }
          );
        }
        if (!provider.active) {
          return NextResponse.json(
            { ok: false, error: `Provider is deactivated — re-enable it before recording bookings` },
            { status: 400 }
          );
        }
        providerNameFinal = provider.name;
      }

      const now = nowIso();
      const result = db.prepare(
        `INSERT INTO logistics_bookings (
           organization_id, shipment_id, provider_id, provider_name,
           booking_reference, booked_date, container_type, quantity,
           pickup_location, depot, available_date, container_numbers,
           vessel, voyage, etd, eta, confirmation_document, status, notes,
           created_by, created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recorded', ?, ?, ?, ?)`
      ).run(
        orgId, shipmentId, providerId, providerNameFinal,
        bookingReference, str("booked_date"), str("container_type"), quantity,
        str("pickup_location"), str("depot"), str("available_date"), str("container_numbers"),
        str("vessel"), str("voyage"), str("etd"), str("eta"), str("confirmation_document"),
        str("notes"), auth.user.email, now, now
      );
      const bookingId = result.lastInsertRowid;

      // Honest side effects on the shipment
      if (shipmentId) {
        const sets = [`status = 'booked'`];
        const values: unknown[] = [];
        // Merge real data onto the shipment when the booking carries it
        const merge: [string, string | null][] = [
          ["vessel_name", str("vessel")],
          ["etd", str("etd")],
          ["eta", str("eta")],
        ];
        for (const [col, val] of merge) {
          if (val) { sets.push(`${col} = ?`); values.push(val); }
        }
        if (providerNameFinal) { sets.push(`carrier = ?`); values.push(providerNameFinal); }
        values.push(now, shipmentId, orgId);
        db.prepare(
          `UPDATE shipments SET ${sets.join(", ")}, updated_ts = ? WHERE shipment_id = ? AND organization_id = ?`
        ).run(...values);

        db.prepare(
          `INSERT INTO logistics_events (
             organization_id, shipment_id, event_type, title, detail,
             event_ts, source, created_by, created_ts, updated_ts
           ) VALUES (?, ?, 'booking_recorded', ?, ?, ?, 'operator', ?, ?, ?)`
        ).run(
          orgId, shipmentId,
          `External booking recorded: ${providerNameFinal} ${bookingReference}`,
          `${quantity} × ${str("container_type") || "container"} booked with ${providerNameFinal} ` +
            `(reference ${bookingReference}). The booking was made on the provider's official ` +
            `channel — Faith-El recorded the operator's attestation.`,
          now, auth.user.email, now, now
        );

        // Container numbers supplied → create container records in BOOKED state
        const containerNumbers = (str("container_numbers") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const cn of containerNumbers) {
          const cr = db.prepare(
            `INSERT INTO logistics_containers (
               organization_id, shipment_id, booking_id, container_number,
               container_type, depot, vessel, voyage, status, created_ts, updated_ts
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?)`
          ).run(
            orgId, shipmentId, bookingId, cn,
            str("container_type") || "20GP", str("depot"),
            str("vessel"), str("voyage"), now, now
          );
          db.prepare(
            `INSERT INTO logistics_events (
               organization_id, shipment_id, container_id, event_type, title,
               detail, event_ts, source, created_by, created_ts, updated_ts
             ) VALUES (?, ?, ?, 'container_created', ?, ?, ?, 'operator', ?, ?, ?)`
          ).run(
            orgId, shipmentId, cr.lastInsertRowid,
            `Container added: ${cn} (BOOKED)`,
            `Recorded with booking ${bookingReference} (${providerNameFinal}).`,
            now, auth.user.email, now, now
          );
        }
      }

      const booking = db.prepare(`SELECT * FROM logistics_bookings WHERE id = ?`).get(bookingId);
      return NextResponse.json({ ok: true, booking }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to record booking";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
