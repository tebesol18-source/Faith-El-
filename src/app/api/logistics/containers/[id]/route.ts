/**
 * /api/logistics/containers/[id] — update a container record.
 *
 * PATCH (auth): update lifecycle dates, numbers, vessel/voyage, B/L or
 *               status. A status CHANGE writes an honest timeline event
 *               ("Container ESLU…: BOOKED → PICKED_UP"). Cross-org rows
 *               are invisible (404).
 */
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id } = await params;
  const containerId = Number(id);
  if (!Number.isInteger(containerId)) {
    return NextResponse.json({ ok: false, error: "Invalid container id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if ("status" in body && typeof body.status === "string" && !CONTAINER_STATUSES.has(body.status)) {
    return NextResponse.json(
      { ok: false, error: `Invalid container status: ${body.status}` },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      const existing = db.prepare(
        `SELECT * FROM logistics_containers WHERE id = ? AND organization_id = ? AND deleted_ts IS NULL`
      ).get(containerId, orgId) as
        | { shipment_id: string | null; status: string; container_number: string | null; [k: string]: unknown }
        | undefined;
      if (!existing) {
        return NextResponse.json({ ok: false, error: "Container not found" }, { status: 404 });
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
      values.push(containerId);
      db.prepare(`UPDATE logistics_containers SET ${sets.join(", ")} WHERE id = ?`).run(...values);

      // Honest timeline event on status change
      const newStatus = typeof body.status === "string" ? body.status : existing.status;
      if (newStatus !== existing.status && existing.shipment_id) {
        db.prepare(
          `INSERT INTO logistics_events (
             organization_id, shipment_id, container_id, event_type, title,
             detail, event_ts, source, created_by, created_ts, updated_ts
           ) VALUES (?, ?, ?, 'container_updated', ?, ?, ?, 'operator', ?, ?, ?)`
        ).run(
          orgId, existing.shipment_id, containerId,
          `Container ${existing.container_number || containerId}: ${existing.status} → ${newStatus}`,
          typeof body.notes === "string" && body.notes ? body.notes : null,
          now, auth.user.email, now, now
        );
      }

      const container = db.prepare(`SELECT * FROM logistics_containers WHERE id = ?`).get(containerId);
      return NextResponse.json({ ok: true, container });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update container";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
