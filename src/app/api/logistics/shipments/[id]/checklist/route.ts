/**
 * /api/logistics/shipments/[id]/checklist — the 18-step export checklist.
 *
 * GET   (auth): list the shipment's checklist items.
 * PATCH (auth): toggle one item — { item_id, status } where status is
 *               'pending' | 'done' | 'not_applicable'. Faith-El never
 *               toggles a step itself: completing a step (booking, pickup,
 *               customs…) happens with external providers and can only be
 *               attested by an operator. Every toggle writes a timeline
 *               event recording WHO attested it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/logistics";

const STATUSES = new Set(["pending", "done", "not_applicable"]);

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
      const items = db.prepare(
        `SELECT * FROM logistics_checklist_items
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY position ASC`
      ).all(id, orgId);
      return NextResponse.json({ ok: true, items });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load checklist";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
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

  const itemId = Number(body.item_id);
  const status = body.status;
  if (!Number.isInteger(itemId)) {
    return NextResponse.json({ ok: false, error: "item_id is required" }, { status: 400 });
  }
  if (typeof status !== "string" || !STATUSES.has(status)) {
    return NextResponse.json(
      { ok: false, error: "status must be 'pending', 'done' or 'not_applicable'" },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      const item = db.prepare(
        `SELECT * FROM logistics_checklist_items
         WHERE id = ? AND shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL`
      ).get(itemId, shipmentId, orgId) as
        | { title: string; status: string; [k: string]: unknown }
        | undefined;
      if (!item) {
        return NextResponse.json({ ok: false, error: "Checklist item not found" }, { status: 404 });
      }

      const now = nowIso();
      db.prepare(
        `UPDATE logistics_checklist_items
         SET status = ?, completed_ts = ?, completed_by = ?, updated_ts = ?
         WHERE id = ?`
      ).run(
        status,
        status === "done" ? now : null,
        status === "done" ? auth.user.email : null,
        now,
        itemId
      );

      // Timeline: record the human attestation
      if (status !== item.status) {
        db.prepare(
          `INSERT INTO logistics_events (
             organization_id, shipment_id, event_type, title, detail,
             event_ts, source, created_by, created_ts, updated_ts
           ) VALUES (?, ?, 'checklist_updated', ?, ?, ?, 'operator', ?, ?, ?)`
        ).run(
          orgId, shipmentId,
          `Checklist: ${item.title} → ${status}`,
          status === "done"
            ? `Marked done by ${auth.user.email} — attested by the operator.`
            : `Set to ${status} by ${auth.user.email}.`,
          now, auth.user.email, now, now
        );
      }

      const items = db.prepare(
        `SELECT * FROM logistics_checklist_items
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY position ASC`
      ).all(shipmentId, orgId);
      return NextResponse.json({ ok: true, items });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update checklist";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
