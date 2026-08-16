/**
 * GET /api/quotes
 * Derives quotes from contracts + contract_line_items.
 * Since there's no quotes table in the backend, we map:
 *   - Contract status "draft" → Quote status "pending_approval"
 *   - Contract status "completed" → Quote status "accepted"
 *   - Contract status "cancelled" → Quote status "rejected"
 * Each contract becomes a quote with its line items as quote lines.
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

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

/**
 * POST /api/quotes
 *
 * Creates a new quote. Since the backend has no `quotes` table, a quote is
 * stored as a contract row with status='draft' (the GET handler maps
 * draft contracts → pending_approval quotes).
 *
 * Body:
 *   leadId: string                          (required)
 *   lineItems: Array<{lotId, bags, pricePerBag}>  (required, ≥1 item)
 *   validUntil: string                      (required, ISO date)
 *   contractId?: string                     (optional, ignored — quote_id is generated)
 *   currency?: string                       (optional, default "USD")
 *   incoterm?: string                       (optional, default "FOB")
 *   paymentTerms?: string                   (optional, default "LC at sight")
 *
 * Response: 201 { ok: true, quote: {...} } | 400 | 500
 */
const VALID_QUOTE_INCOTERMS = ["FOB", "CIF", "EXW", "FCA", "CFR"];

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { leadId, contractId, lineItems, validUntil, currency, incoterm, paymentTerms } = body || {};

  // ─── Validate required fields ───
  const missing: string[] = [];
  if (!leadId) missing.push("leadId");
  if (!lineItems) missing.push("lineItems");
  if (!validUntil) missing.push("validUntil");
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return NextResponse.json(
      { ok: false, error: "lineItems must be a non-empty array" },
      { status: 400 }
    );
  }

  // Validate each line item
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    if (!li || typeof li !== "object") {
      return NextResponse.json(
        { ok: false, error: `lineItems[${i}] must be an object` },
        { status: 400 }
      );
    }
    if (!li.lotId) {
      return NextResponse.json(
        { ok: false, error: `lineItems[${i}].lotId is required` },
        { status: 400 }
      );
    }
    const bags = Number(li.bags);
    const pricePerBag = Number(li.pricePerBag);
    if (isNaN(bags) || bags <= 0) {
      return NextResponse.json(
        { ok: false, error: `lineItems[${i}].bags must be a positive number` },
        { status: 400 }
      );
    }
    if (isNaN(pricePerBag) || pricePerBag < 0) {
      return NextResponse.json(
        { ok: false, error: `lineItems[${i}].pricePerBag must be a non-negative number` },
        { status: 400 }
      );
    }
  }

  const finalIncoterm = incoterm || "FOB";
  if (!VALID_QUOTE_INCOTERMS.includes(finalIncoterm)) {
    return NextResponse.json(
      { ok: false, error: `incoterm must be one of: ${VALID_QUOTE_INCOTERMS.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate validUntil is a parseable date
  const validUntilTs = new Date(validUntil);
  if (isNaN(validUntilTs.getTime())) {
    return NextResponse.json(
      { ok: false, error: "validUntil must be a valid ISO date string" },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      // Verify lead exists (FK enforcement)
      const lead = db.prepare(`
        SELECT lead_id FROM leads WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(leadId, orgId) as { lead_id: string } | undefined;
      if (!lead) {
        return NextResponse.json(
          { ok: false, error: `Lead not found: ${leadId}` },
          { status: 404 }
        );
      }

      const now = nowISO();
      const yyyy = String(new Date().getFullYear());
      const prefix = `QU-${yyyy}-`;

      // ─── Generate quote_id: QU-YYYY-NNNN (used as contract_id) ───
      const last = db.prepare(`
        SELECT contract_id FROM contracts
        WHERE contract_id LIKE ?
        ORDER BY contract_id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { contract_id: string } | undefined;

      let nextNum = 1;
      if (last?.contract_id) {
        const m = last.contract_id.match(/(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }
      const quoteId = `${prefix}${String(nextNum).padStart(4, "0")}`;

      // ─── Calculate total_value + total_volume_bags from line items ───
      const totalValue = lineItems.reduce(
        (sum: number, li: any) => sum + Number(li.bags) * Number(li.pricePerBag),
        0
      );
      const totalBags = lineItems.reduce(
        (sum: number, li: any) => sum + Number(li.bags),
        0
      );

      // ─── Insert the contract (representing the quote) ───
      db.prepare(`
        INSERT INTO contracts (
          contract_id, lead_id, organization_id, contract_number, contract_date,
          contract_template, incoterm, currency,
          total_volume_bags, total_value,
          shipment_window_start, shipment_window_end,
          payment_terms, status, is_repeat,
          created_ts, updated_ts
        ) VALUES (?, ?, ?, ?, ?, 'ICC_ECE_7_21', ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?)
      `).run(
        quoteId, leadId, orgId,
        quoteId,                 // contract_number (human-readable)
        now,                     // contract_date
        finalIncoterm,
        currency || "USD",
        totalBags,
        totalValue,
        now,                     // shipment_window_start = now
        validUntil,              // shipment_window_end = validUntil
        paymentTerms || "LC at sight",
        now, now
      );

      // ─── Insert line items ───
      const insertLineItem = db.prepare(`
        INSERT INTO contract_line_items (
          contract_id, lot_id, organization_id,
          quantity_bags, unit_price, total_price,
          created_ts, updated_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const li of lineItems) {
        const bagsNum = Number(li.bags);
        const priceNum = Number(li.pricePerBag);
        insertLineItem.run(
          quoteId, li.lotId, orgId,
          bagsNum, priceNum, bagsNum * priceNum,
          now, now
        );
      }

      return NextResponse.json({
        ok: true,
        quote: {
          id: quoteId,
          leadId,
          contractId: contractId || null,
          status: "draft",
          totalValue,
          totalVolumeBags: totalBags,
          currency: currency || "USD",
          incoterm: finalIncoterm,
          paymentTerms: paymentTerms || "LC at sight",
          validUntil,
          lineItems: lineItems.map((li: any) => ({
            lotId: li.lotId,
            bags: Number(li.bags),
            pricePerBag: Number(li.pricePerBag),
            totalPrice: Number(li.bags) * Number(li.pricePerBag),
          })),
          organization_id: orgId,
          created_ts: now,
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/quotes POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create quote" },
      { status: 500 }
    );
  }
}
