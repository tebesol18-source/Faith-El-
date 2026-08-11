/**
 * GET /api/quotes
 * Derives quotes from contracts + contract_line_items.
 * Since there's no quotes table in the backend, we map:
 *   - Contract status "draft" → Quote status "pending_approval"
 *   - Contract status "completed" → Quote status "accepted"
 *   - Contract status "cancelled" → Quote status "rejected"
 * Each contract becomes a quote with its line items as quote lines.
 */
import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return "—"; }
}

function daysFromNow(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try { return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000); } catch { return null; }
}

function mapContractStatusToQuote(status: string): string {
  const map: Record<string, string> = {
    draft: "pending_approval",
    pending_signature: "pending_review",
    signed: "accepted",
    active: "accepted",
    completed: "accepted",
    cancelled: "rejected",
    breached: "rejected",
  };
  return map[status] || "pending_review";
}

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();
    try {
      const contracts = db.prepare(`
        SELECT c.contract_id, c.lead_id, c.total_value, c.total_volume_bags,
               c.incoterm, c.currency, c.payment_terms, c.status,
               c.contract_date, c.created_ts, c.signed_ts,
               l.company_name AS buyer_name, l.headquarters_country AS buyer_country,
               l.headquarters_city AS buyer_city, l.priority_tier
        FROM contracts c
        LEFT JOIN leads l ON c.lead_id = l.lead_id
        WHERE c.deleted_ts IS NULL AND c.organization_id = ?
        ORDER BY c.created_ts DESC
      `).all(orgId) as any[];

      const lineItemsStmt = db.prepare(`
        SELECT cli.lot_id, cli.quantity_bags, cli.unit_price, cli.total_price,
               lt.region, lt.process, lt.screen_size
        FROM contract_line_items cli
        LEFT JOIN lots lt ON cli.lot_id = lt.lot_id
        WHERE cli.organization_id = ? AND cli.contract_id = ? AND cli.deleted_ts IS NULL
      `);

      const quotes = contracts.map((c, idx) => {
        const lineItems = (lineItemsStmt.all(orgId, c.contract_id) as any[]) || [];
        const quoteStatus = mapContractStatusToQuote(c.status);
        const weightKg = (c.total_volume_bags || 0) * 60;
        const linesSubtotal = c.total_value || 0;
        const freight = Math.round((c.total_volume_bags || 0) * 3);
        const insurance = Math.round(linesSubtotal * 0.008);
        const commissionPct = 2;
        const commission = Math.round(linesSubtotal * commissionPct / 100);
        const total = linesSubtotal + freight + insurance;
        const costBasis = Math.round(linesSubtotal * 0.80);
        const grossMargin = total - costBasis - freight - insurance - commission;
        const marginPct = total > 0 ? (grossMargin / total) * 100 : 0;

        const lines = lineItems.length > 0 ? lineItems.map((li) => ({
          lotId: li.lot_id,
          origin: li.region || "—",
          process: li.process || "—",
          grade: li.screen_size ? `G${li.screen_size}` : "—",
          weightKg: (li.quantity_bags || 0) * 60,
          pricePerKg: li.unit_price || 0,
          costPerKg: (li.unit_price || 0) * 0.80,
        })) : [{
          lotId: "—",
          origin: c.buyer_country || "—",
          process: "—",
          grade: "—",
          weightKg: weightKg,
          pricePerKg: weightKg > 0 ? Math.round((linesSubtotal / weightKg) * 100) / 100 : 0,
          costPerKg: weightKg > 0 ? Math.round((linesSubtotal * 0.80 / weightKg) * 100) / 100 : 0,
        }];

        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 30);

        return {
          id: `QU-${c.contract_id}`,
          lead: c.buyer_name || "Unknown",
          leadId: c.lead_id,
          version: 1,
          status: quoteStatus,
          incoterm: c.incoterm || "FOB",
          destination: c.buyer_city || c.buyer_country || "—",
          currency: c.currency || "USD",
          paymentTerms: c.payment_terms || "LC at sight",
          validUntil: formatDate(validUntil.toISOString()),
          createdAt: formatDate(c.created_ts),
          sentAt: c.signed_ts ? formatDate(c.signed_ts) : null,
          respondedAt: c.signed_ts ? formatDate(c.signed_ts) : null,
          lines,
          freight,
          insurance,
          commissionPct,
          aiDrafted: false,
          aiConfidence: 0,
          aiSuggestion: `Contract ${c.contract_id} mapped to quote. Margin ${marginPct.toFixed(1)}%.`,
          buyerNote: null,
          daysToExpiry: Math.ceil((validUntil.getTime() - Date.now()) / 86400000),
        };
      });

      return NextResponse.json({ ok: true, count: quotes.length, quotes });
    } finally { db.close(); }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
