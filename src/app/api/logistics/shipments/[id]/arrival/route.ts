/**
 * /api/logistics/shipments/[id]/arrival — the shipment-level arrival and
 * final-delivery action.
 *
 * POST (auth): { action: "arrive" | "deliver", ata?: ISO-string, notes?: string }
 *
 *   arrive  — the operator attests the vessel/shipment ARRIVED at the
 *             destination port (shipments: → 'arrived', ATA persisted,
 *             timeline status_change event). Mirrors Python Agent 6
 *             record_arrival().
 *
 *   deliver — the operator attests FINAL DELIVERY of the whole shipment
 *             (shipments: → 'delivered', contract → 'completed', timeline
 *             event). Mirrors Python Agent 6 record_delivery(), INCLUDING
 *             its downstream handoff: SHIPMENT_DELIVERED +
 *             CONTRACT_COMPLETED are published to the shared event bus so
 *             the supervisor triggers Python Agent 7 (account + delivery
 *             follow-up) asynchronously — no Python is called from this
 *             request path.
 *
 * Guard rails (org-scoped; 404 cross-org):
 *   - 'arrive' only from departed / in_transit / delayed
 *   - 'deliver' only from departed / in_transit / arrived / customs_hold /
 *     delayed — never from draft/booked/loaded (nothing has shipped) and
 *     never backwards from delivered/cancelled
 *   - duplicate/terminal transitions are rejected (409), not silently
 *     reapplied — no duplicate delivery events can be published
 *   - 'deliver' requires EVERY non-cancelled container on the shipment to
 *     be DELIVERED first (a partial shipment — one container arrived —
 *     must NOT be marked delivered while others are still out; the
 *     blocking containers are listed in the error). A shipment with no
 *     container records can be delivered (there are none to contradict
 *     the operator's attestation).
 *   - Customs/legal compliance is a SEPARATE flow (Agent 5 compliance
 *     documents / customs_documents): delivering a shipment never marks
 *     any compliance or customs document cleared.
 */
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/logistics";

/** Statuses from which the vessel can be attested arrived at destination. */
const ARRIVE_ALLOWED_FROM = new Set(["departed", "in_transit", "delayed"]);

/** Statuses from which final delivery can be attested (at or past departure). */
const DELIVER_ALLOWED_FROM = new Set([
  "departed", "in_transit", "arrived", "customs_hold", "delayed",
]);

/** Terminal states — repeating any action from these is a conflict. */
const TERMINAL_STATUSES = new Set(["delivered", "cancelled"]);

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

  const action = body.action;
  if (action !== "arrive" && action !== "deliver") {
    return NextResponse.json(
      { ok: false, error: "action must be 'arrive' or 'deliver'" },
      { status: 400 }
    );
  }

  let ata: string | null = null;
  if (body.ata !== undefined && body.ata !== null && body.ata !== "") {
    if (typeof body.ata !== "string" || isNaN(new Date(body.ata).getTime())) {
      return NextResponse.json(
        { ok: false, error: "ata must be an ISO date-time string (or omitted for now)" },
        { status: 400 }
      );
    }
    ata = body.ata;
  }
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  try {
    const db = getWritableDb();
    try {
      const shipment = db.prepare(
        `SELECT s.*, c.lead_id FROM shipments s
         LEFT JOIN contracts c ON s.contract_id = c.contract_id
         WHERE s.shipment_id = ? AND s.organization_id = ? AND s.deleted_ts IS NULL`
      ).get(shipmentId, orgId) as
        | {
            shipment_id: string;
            contract_id: string | null;
            status: string;
            ata: string | null;
            [k: string]: unknown;
          }
        | undefined;
      if (!shipment) {
        return NextResponse.json({ ok: false, error: "Shipment not found" }, { status: 404 });
      }

      const current = shipment.status;

      // ── Duplicate / terminal transition guards (409, never re-applied) ──
      if (TERMINAL_STATUSES.has(current)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              current === "delivered"
                ? `Shipment ${shipmentId} is already delivered — a delivery cannot be recorded twice (no correction workflow exists)`
                : `Shipment ${shipmentId} is cancelled — no arrival/delivery can be recorded`,
          },
          { status: 409 }
        );
      }

      if (action === "arrive") {
        if (current === "arrived") {
          return NextResponse.json(
            { ok: false, error: `Shipment ${shipmentId} has already been recorded arrived` },
            { status: 409 }
          );
        }
        if (!ARRIVE_ALLOWED_FROM.has(current)) {
          return NextResponse.json(
            {
              ok: false,
              error: `Shipment ${shipmentId} cannot be recorded arrived from status '${current}' — the vessel must have departed first (departed/in_transit/delayed)`,
            },
            { status: 400 }
          );
        }
      } else {
        if (!DELIVER_ALLOWED_FROM.has(current)) {
          return NextResponse.json(
            {
              ok: false,
              error: `Shipment ${shipmentId} cannot be recorded delivered from status '${current}' — final delivery requires the shipment to be at or past departure (departed/in_transit/arrived/customs_hold/delayed)`,
            },
            { status: 400 }
          );
        }

        // ── Container completeness: NO partial-shipment delivery ──
        const containers = db.prepare(
          `SELECT id, container_number, status FROM logistics_containers
           WHERE shipment_id = ? AND organization_id = ? AND deleted_ts IS NULL`
        ).all(shipmentId, orgId) as { id: number; container_number: string | null; status: string }[];
        const blockers = containers.filter((c) => c.status !== "DELIVERED" && c.status !== "CANCELLED");
        if (blockers.length > 0) {
          return NextResponse.json(
            {
              ok: false,
              error:
                `Cannot record final delivery — ${blockers.length} container(s) on this shipment are not yet DELIVERED: ` +
                blockers
                  .map((c) => `${c.container_number || `#${c.id}`} (${c.status})`)
                  .join(", ") +
                ". Deliver or cancel every container first, then record the shipment-level delivery.",
            },
            { status: 400 }
          );
        }
      }

      // ── Apply the transition atomically ──
      const now = nowIso();
      const published: string[] = [];
      const contractId = shipment.contract_id || null;

      const txn = db.transaction(() => {
        if (action === "arrive") {
          db.prepare(
            `UPDATE shipments SET status = 'arrived', ata = ?, updated_ts = ? WHERE shipment_id = ?`
          ).run(ata || now, now, shipmentId);
          db.prepare(
            `INSERT INTO logistics_events (
               organization_id, shipment_id, event_type, title, detail,
               event_ts, source, created_by, created_ts, updated_ts
             ) VALUES (?, ?, 'status_change', ?, ?, ?, 'operator', ?, ?, ?)`
          ).run(
            orgId, shipmentId,
            `Shipment arrived at destination port (${current} → arrived)`,
            notes
              ? `Operator attested arrival. ATA ${ata || now}. Notes: ${notes}`
              : `Operator attested arrival of the shipment at the destination port. ATA ${ata || now}.`,
            now, auth.user.email, now, now
          );
        } else {
          // Keep an existing arrival ATA; only set one if none exists (the
          // timeline event below carries the delivery attestation time).
          const effectiveAta = ata || shipment.ata || now;
          db.prepare(
            `UPDATE shipments SET status = 'delivered', ata = ?, updated_ts = ? WHERE shipment_id = ?`
          ).run(effectiveAta, now, shipmentId);
          db.prepare(
            `INSERT INTO logistics_events (
               organization_id, shipment_id, event_type, title, detail,
               event_ts, source, created_by, created_ts, updated_ts
             ) VALUES (?, ?, 'status_change', ?, ?, ?, 'operator', ?, ?, ?)`
          ).run(
            orgId, shipmentId,
            `Shipment delivered — final delivery recorded (${current} → delivered)`,
            notes
              ? `Operator attested final delivery${contractId ? `; contract ${contractId} completed` : ""}. Notes: ${notes}`
              : `Operator attested final delivery of the entire shipment${contractId ? `; contract ${contractId} marked completed` : ""}.`,
            now, auth.user.email, now, now
          );

          // Contract completion — same business rule as Python
          // Agent 6 record_delivery().
          if (contractId) {
            db.prepare(
              `UPDATE contracts SET status = 'completed', updated_ts = ? WHERE contract_id = ?`
            ).run(now, contractId);
          }

          // ── The Agent 6 → Agent 7 runtime handoff: publish the two
          // events the Python side consumes (same shapes Agent 6
          // publishes). The supervisor picks them up asynchronously —
          // this request never waits for Python.
          const insertEvent = db.prepare(
            `INSERT INTO events (
               event_type, entity_type, entity_id, payload, published_by,
               published_ts, status, organization_id
             ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
          );
          insertEvent.run(
            "SHIPMENT_DELIVERED", "shipment", shipmentId,
            JSON.stringify({ shipment_id: shipmentId, contract_id: contractId || "", ata: effectiveAta }),
            auth.user.email, now, orgId
          );
          published.push("SHIPMENT_DELIVERED");
          if (contractId) {
            insertEvent.run(
              "CONTRACT_COMPLETED", "contract", contractId,
              JSON.stringify({ contract_id: contractId, shipment_id: shipmentId, delivered_ts: now }),
              auth.user.email, now, orgId
            );
            published.push("CONTRACT_COMPLETED");
          }
        }
      });
      txn();

      const updated = db.prepare(
        `SELECT * FROM shipments WHERE shipment_id = ?`
      ).get(shipmentId);
      return NextResponse.json({
        ok: true,
        action: action === "arrive" ? "arrived" : "delivered",
        shipment: updated,
        published,
      });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to record arrival/delivery";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
