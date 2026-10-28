/**
 * /api/logistics/shipments/[id]/events — the shipment timeline.
 *
 * GET  (auth): stored events, oldest first. Only REAL events — this
 *              endpoint never generates, infers or decorates history.
 * POST (auth): add a manual EXTERNAL update the operator learned outside
 *              Faith-El (a call with the depot, a carrier notice, a
 *              recorded delay). Requires a title; the event records who
 *              entered it and when it actually happened (event_date,
 *              defaulting to now — operators may backdate to the date the
 *              external event occurred).
 */
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/logistics";

const MANUAL_EVENT_TYPES = new Set([
  "external_update", "note", "status_change", "delay_recorded",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id } = await params;

  try {
    const db = getWritableDb();
    try {
      const shipment = db.prepare(
        `SELECT shipment_id FROM shipments WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL`
      ).get(id, orgId);
      if (!shipment) {
        return NextResponse.json({ ok: false, error: "Shipment not found" }, { status: 404 });
      }
      const events = db.prepare(
        `SELECT * FROM logistics_events
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY event_ts ASC, id ASC`
      ).all(id, orgId);
      return NextResponse.json({ ok: true, events });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load events";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id: shipmentId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
  }
  const eventType = typeof body.event_type === "string" ? body.event_type : "external_update";
  if (!MANUAL_EVENT_TYPES.has(eventType)) {
    return NextResponse.json(
      { ok: false, error: `event_type must be one of ${[...MANUAL_EVENT_TYPES].join(", ")}` },
      { status: 400 }
    );
  }
  const detail = typeof body.detail === "string" && body.detail.trim() ? body.detail.trim() : null;
  const eventDate = typeof body.event_date === "string" && body.event_date.trim() ? body.event_date.trim() : null;
  if (eventDate && isNaN(new Date(eventDate).getTime())) {
    return NextResponse.json({ ok: false, error: "event_date must be a valid date" }, { status: 400 });
  }

  try {
    const db = getWritableDb();
    try {
      const shipment = db.prepare(
        `SELECT shipment_id FROM shipments WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL`
      ).get(shipmentId, orgId);
      if (!shipment) {
        return NextResponse.json({ ok: false, error: "Shipment not found" }, { status: 404 });
      }

      const now = nowIso();
      const result = db.prepare(
        `INSERT INTO logistics_events (
           organization_id, shipment_id, event_type, title, detail,
           event_ts, source, created_by, created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, ?, ?, 'operator', ?, ?, ?)`
      ).run(orgId, shipmentId, eventType, title, detail, eventDate || now, auth.user.email, now, now);
      const event = db.prepare(`SELECT * FROM logistics_events WHERE id = ?`).get(result.lastInsertRowid);
      return NextResponse.json({ ok: true, event }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add event";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
