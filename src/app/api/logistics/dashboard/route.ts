/**
 * /api/logistics/dashboard — real DB statistics for the Command Center.
 *
 * GET (auth): the 8 stat cards + a compact "needs attention" list, ALL
 * computed from the org's stored rows. No simulated numbers, no defaults:
 * an org with no shipments gets zeros and empty lists. The UI renders
 * honest empty states from this.
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();
    try {
      const one = (sql: string, ...params: unknown[]): number =>
        Number((db.prepare(sql).get(...params) as { n: number } | undefined)?.n ?? 0);

      const today = new Date().toISOString().slice(0, 10);

      const activeShipments = one(
        `SELECT COUNT(*) AS n FROM shipments
         WHERE organization_id = ? AND deleted_ts IS NULL
           AND status NOT IN ('delivered', 'cancelled')`,
        orgId
      );
      const containersBooked = one(
        `SELECT COUNT(*) AS n FROM logistics_containers
         WHERE organization_id = ? AND deleted_ts IS NULL
           AND status NOT IN ('REQUESTED', 'AVAILABLE', 'CANCELLED')`,
        orgId
      );
      const containersAwaiting = one(
        `SELECT COUNT(*) AS n FROM logistics_containers
         WHERE organization_id = ? AND deleted_ts IS NULL
           AND status IN ('REQUESTED', 'AVAILABLE')`,
        orgId
      );
      const inTransit = one(
        `SELECT COUNT(*) AS n FROM shipments
         WHERE organization_id = ? AND deleted_ts IS NULL
           AND status IN ('departed', 'in_transit')`,
        orgId
      );
      const upcomingDepartures = one(
        `SELECT COUNT(*) AS n FROM shipments
         WHERE organization_id = ? AND deleted_ts IS NULL
           AND etd IS NOT NULL AND etd >= ? AND status NOT IN ('delivered', 'cancelled')`,
        orgId, today
      );
      const delayedOrHolds = one(
        `SELECT COUNT(*) AS n FROM shipments
         WHERE organization_id = ? AND deleted_ts IS NULL
           AND status IN ('delayed', 'customs_hold')`,
        orgId
      );
      const missingBookingDocs = one(
        `SELECT COUNT(*) AS n FROM logistics_bookings b
         JOIN shipments s ON b.shipment_id = s.shipment_id
              AND s.organization_id = ? AND s.deleted_ts IS NULL
         WHERE b.organization_id = ? AND b.deleted_ts IS NULL
           AND (b.confirmation_document IS NULL OR b.confirmation_document = '')
           AND b.status != 'cancelled'`,
        orgId, orgId
      );
      const completed = one(
        `SELECT COUNT(*) AS n FROM shipments
         WHERE organization_id = ? AND deleted_ts IS NULL AND status = 'delivered'`,
        orgId
      );

      // Compact "needs attention" roll-up (same rules as the detail bundle)
      const attention = db.prepare(
        `SELECT shipment_id, status, etd, atd FROM shipments
         WHERE organization_id = ? AND deleted_ts IS NULL
           AND status NOT IN ('delivered', 'cancelled')
         ORDER BY created_ts DESC LIMIT 50`
      ).all(orgId) as { shipment_id: string; status: string; etd: string | null; atd: string | null }[];

      const attentionItems: { shipmentId: string; reason: string }[] = [];
      for (const s of attention) {
        if (s.status === "delayed" || s.status === "customs_hold") {
          attentionItems.push({ shipmentId: s.shipment_id, reason: `Status: ${s.status.replace("_", " ")}` });
        } else if (s.etd && !s.atd && s.etd < today) {
          attentionItems.push({ shipmentId: s.shipment_id, reason: "ETD passed without a recorded departure" });
        }
      }

      return NextResponse.json({
        ok: true,
        stats: {
          activeShipments,
          containersBooked,
          containersAwaitingBooking: containersAwaiting,
          inTransit,
          upcomingDepartures,
          delayedOrHolds,
          missingBookingDocs,
          completed,
        },
        attention: attentionItems,
      });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
