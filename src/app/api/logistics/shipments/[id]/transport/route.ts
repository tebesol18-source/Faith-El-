/**
 * /api/logistics/shipments/[id]/transport — inland transport legs.
 *
 * GET  (auth): the shipment's transport segments.
 * POST (auth): record a transport leg the operator arranged (trucking /
 *              rail / barge / port handling / warehouse move) with the
 *              REAL provider reference. Writes an honest timeline event.
 */
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/logistics";

const SEGMENT_TYPES = new Set(["trucking", "rail", "barge", "port_handling", "warehouse"]);
const SEGMENT_STATUSES = new Set(["planned", "confirmed", "in_progress", "completed", "cancelled"]);

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
      const segments = db.prepare(
        `SELECT * FROM logistics_transport_segments
         WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL
         ORDER BY id ASC`
      ).all(id, orgId);
      return NextResponse.json({ ok: true, segments });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load transport";
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

  const segmentType = typeof body.segment_type === "string" ? body.segment_type : "trucking";
  if (!SEGMENT_TYPES.has(segmentType)) {
    return NextResponse.json(
      { ok: false, error: `segment_type must be one of ${[...SEGMENT_TYPES].join(", ")}` },
      { status: 400 }
    );
  }
  const status = typeof body.status === "string" ? body.status : "planned";
  if (!SEGMENT_STATUSES.has(status)) {
    return NextResponse.json(
      { ok: false, error: `status must be one of ${[...SEGMENT_STATUSES].join(", ")}` },
      { status: 400 }
    );
  }

  const str = (key: string): string | null => {
    const v = body[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
  };

  const containerId = Number.isInteger(Number(body.container_id)) && body.container_id ? Number(body.container_id) : null;
  const providerId = Number.isInteger(Number(body.provider_id)) && body.provider_id ? Number(body.provider_id) : null;

  try {
    const db = getWritableDb();
    try {
      const shipment = db.prepare(
        `SELECT shipment_id FROM shipments WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL`
      ).get(shipmentId, orgId);
      if (!shipment) {
        return NextResponse.json({ ok: false, error: "Shipment not found" }, { status: 404 });
      }
      if (containerId) {
        const container = db.prepare(
          `SELECT id FROM logistics_containers WHERE id = ? AND organization_id = ? AND deleted_ts IS NULL`
        ).get(containerId, orgId);
        if (!container) {
          return NextResponse.json({ ok: false, error: `Container not found: ${containerId}` }, { status: 404 });
        }
      }
      let providerName = str("provider_name");
      if (providerId) {
        const provider = db.prepare(
          `SELECT name FROM logistics_providers
           WHERE id = ? AND deleted_ts IS NULL AND active = 1
             AND (organization_id IS NULL OR organization_id = ?)`
        ).get(providerId, orgId) as { name: string } | undefined;
        if (!provider) {
          return NextResponse.json({ ok: false, error: `Provider not found: ${providerId}` }, { status: 404 });
        }
        providerName = provider.name;
      }

      const now = nowIso();
      const result = db.prepare(
        `INSERT INTO logistics_transport_segments (
           organization_id, shipment_id, container_id, segment_type,
           provider_id, provider_name, origin, destination, planned_date,
           actual_date, reference, cost, currency, status, notes, created_by,
           created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        orgId, shipmentId, containerId, segmentType,
        providerId, providerName, str("origin"), str("destination"), str("planned_date"),
        str("actual_date"), str("reference"),
        typeof body.cost === "number" && isFinite(body.cost) ? body.cost : null,
        str("currency"), status, str("notes"), auth.user.email, now, now
      );

      const seg = db.prepare(`SELECT * FROM logistics_transport_segments WHERE id = ?`).get(result.lastInsertRowid) as
        | { origin: string | null; destination: string | null; provider_name: string | null; reference: string | null; status: string }
        | undefined;
      db.prepare(
        `INSERT INTO logistics_events (
           organization_id, shipment_id, container_id, event_type, title,
           detail, event_ts, source, created_by, created_ts, updated_ts
         ) VALUES (?, ?, ?, 'transport_added', ?, ?, ?, 'operator', ?, ?, ?)`
      ).run(
        orgId, shipmentId, containerId,
        `Transport added: ${segmentType} ${seg?.origin || "?"} → ${seg?.destination || "?"}`,
        `${seg?.provider_name || "unrecorded provider"} — ref ${seg?.reference || "n/a"} (${seg?.status})`,
        now, auth.user.email, now, now
      );

      const segment = db.prepare(`SELECT * FROM logistics_transport_segments WHERE id = ?`).get(result.lastInsertRowid);
      return NextResponse.json({ ok: true, segment }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add transport";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
