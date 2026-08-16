/**
 * GET /api/finance
 *
 * Derives financial transactions from the contracts table.
 * Since the backend doesn't have a transactions/invoices table,
 * we synthesize transactions from contract data:
 *   - Invoice (money in) for each contract
 *   - Coffee cost (money out) — estimated at 80% of contract value
 *   - Commission (money out) — 2% of contract value
 *   - Freight (money out) — estimated at $3/bag
 *
 * Frontend expects: { ok, transactions: [...], stats: {...} }
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return "—";
  }
}

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

type TxnType = "invoice" | "payment_in" | "cost_coffee" | "cost_freight" | "cost_insurance" | "cost_commission" | "cost_other";
type TxnStatus = "paid" | "pending" | "overdue" | "due_soon";

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();

    try {
      const contracts = db.prepare(`
        SELECT c.contract_id, c.lead_id, c.status, c.total_value, c.total_volume_bags,
               c.currency, c.incoterm, c.created_ts, c.signed_ts,
               l.company_name AS buyer_name
        FROM contracts c
        LEFT JOIN leads l ON c.lead_id = l.lead_id
        WHERE c.deleted_ts IS NULL AND c.organization_id = ?
        ORDER BY c.created_ts DESC
      `).all(orgId) as any[];

      const transactions: any[] = [];

      for (const c of contracts) {
        const value = c.total_value || 0;
        const bags = c.total_volume_bags || 0;
        const buyer = c.buyer_name || "Unknown Buyer";
        const isCompleted = c.status === "completed";
        const isDraft = c.status === "draft";
        const status: TxnStatus = isCompleted ? "paid" : isDraft ? "pending" : "due_soon";

        // Invoice (money in)
        transactions.push({
          id: `INV-${c.contract_id}`,
          type: "invoice",
          description: `Invoice for ${c.contract_id} (${buyer})`,
          counterparty: buyer,
          amount: value,
          currency: c.currency || "USD",
          date: formatDate(c.created_ts),
          dueDate: isCompleted ? null : formatDate(c.signed_ts || c.created_ts),
          status,
          contractId: c.contract_id,
          shipmentId: null,
          invoiceRef: `INV-${c.contract_id}`,
          category: "Revenue",
        });

        // Payment received (if completed)
        if (isCompleted) {
          transactions.push({
            id: `PAY-${c.contract_id}`,
            type: "payment_in",
            description: `Payment received — ${c.contract_id}`,
            counterparty: `${buyer} via bank transfer`,
            amount: value,
            currency: c.currency || "USD",
            date: formatDate(c.signed_ts || c.created_ts),
            dueDate: null,
            status: "paid" as TxnStatus,
            contractId: c.contract_id,
            shipmentId: null,
            invoiceRef: `INV-${c.contract_id}`,
            category: "Revenue",
          });
        }

        // Coffee cost (money out) — estimated 80% of value
        const coffeeCost = value * 0.80;
        transactions.push({
          id: `COST-${c.contract_id}-coffee`,
          type: "cost_coffee",
          description: `Coffee purchase — ${bags} bags for ${c.contract_id}`,
          counterparty: "Cooperative Union",
          amount: -coffeeCost,
          currency: c.currency || "USD",
          date: formatDate(c.created_ts),
          dueDate: null,
          status: "paid" as TxnStatus,
          contractId: c.contract_id,
          shipmentId: null,
          invoiceRef: null,
          category: "Cost of Goods",
        });

        // Freight (money out) — $3/bag
        const freight = bags * 3;
        transactions.push({
          id: `COST-${c.contract_id}-freight`,
          type: "cost_freight",
          description: `Freight — ${c.contract_id} (${bags} bags)`,
          counterparty: "Shipping Line",
          amount: -freight,
          currency: c.currency || "USD",
          date: formatDate(c.created_ts),
          dueDate: null,
          status: "paid" as TxnStatus,
          contractId: c.contract_id,
          shipmentId: null,
          invoiceRef: null,
          category: "Freight",
        });

        // Commission (money out) — 2% of value
        const commission = value * 0.02;
        transactions.push({
          id: `COST-${c.contract_id}-commission`,
          type: "cost_commission",
          description: `Agent commission — ${c.contract_id} (2%)`,
          counterparty: "Coffee Trade Desk",
          amount: -commission,
          currency: c.currency || "USD",
          date: formatDate(c.signed_ts || c.created_ts),
          dueDate: null,
          status: isCompleted ? ("paid" as TxnStatus) : ("pending" as TxnStatus),
          contractId: c.contract_id,
          shipmentId: null,
          invoiceRef: null,
          category: "Commission",
          notes: "2% commission via masked escrow",
        });
      }

      // Calculate stats
      const paidRevenue = transactions.filter(t => t.amount > 0 && t.status === "paid").reduce((s, t) => s + t.amount, 0);
      const totalCosts = Math.abs(transactions.filter(t => t.amount < 0 && t.status === "paid").reduce((s, t) => s + t.amount, 0));
      const netProfit = paidRevenue - totalCosts;
      const marginPct = paidRevenue > 0 ? (netProfit / paidRevenue) * 100 : 0;
      const outstanding = transactions.filter(t => t.amount > 0 && (t.status === "pending" || t.status === "due_soon")).reduce((s, t) => s + t.amount, 0);
      const overdue = 0; // no overdue in current data

      // Cost breakdown
      const costBreakdown = {
        coffee: Math.abs(transactions.filter(t => t.type === "cost_coffee" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
        freight: Math.abs(transactions.filter(t => t.type === "cost_freight" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
        insurance: 0,
        commission: Math.abs(transactions.filter(t => t.type === "cost_commission" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
        other: 0,
      };

      return NextResponse.json({
        ok: true,
        source: "sqlite",
        transactions,
        stats: {
          totalRevenue: paidRevenue,
          totalCosts,
          netProfit,
          marginPct,
          outstanding,
          overdue,
          dueThisWeek: transactions.filter(t => t.amount > 0 && t.status === "due_soon").reduce((s, t) => s + t.amount, 0),
          monthRevenue: paidRevenue,
          monthCosts: totalCosts,
          costBreakdown,
        },
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/finance] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance
 *
 * Records a payment against a contract. If no invoice exists for the
 * contract yet, one is created automatically (using the contract's
 * total_value as the invoice total). The payment is then linked to the
 * invoice and the invoice's paid_amount / outstanding_balance / status
 * are updated.
 *
 * Body:
 *   contractId: string       (required)
 *   amountUsd: number        (required, > 0)
 *   paymentDate: string      (required, ISO date)
 *   paymentMethod: string    (required — wire|lc|paypal|crypto|other)
 *   referenceNumber?: string (optional, bank ref)
 *   bankName?: string        (optional)
 *   notes?: string           (optional)
 *
 * Response: 201 { ok: true, payment: {...}, invoice: {...} } | 400 | 404 | 500
 */
const VALID_PAYMENT_METHODS = ["wire", "lc", "paypal", "crypto", "other"];

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

  const { contractId, amountUsd, paymentDate, paymentMethod, referenceNumber, bankName, notes } = body || {};

  // ─── Validate required fields ───
  const missing: string[] = [];
  if (!contractId) missing.push("contractId");
  if (amountUsd == null) missing.push("amountUsd");
  if (!paymentDate) missing.push("paymentDate");
  if (!paymentMethod) missing.push("paymentMethod");
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json(
      { ok: false, error: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}` },
      { status: 400 }
    );
  }

  const amountNum = Number(amountUsd);
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json(
      { ok: false, error: "amountUsd must be a positive number" },
      { status: 400 }
    );
  }

  const paymentDateTs = new Date(paymentDate);
  if (isNaN(paymentDateTs.getTime())) {
    return NextResponse.json(
      { ok: false, error: "paymentDate must be a valid ISO date string" },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      // Verify contract exists (and grab lead_id + total_value for the invoice)
      const contract = db.prepare(`
        SELECT contract_id, lead_id, total_value, currency
        FROM contracts
        WHERE contract_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(contractId, orgId) as {
        contract_id: string;
        lead_id: string;
        total_value: number | null;
        currency: string | null;
      } | undefined;

      if (!contract) {
        return NextResponse.json(
          { ok: false, error: `Contract not found: ${contractId}` },
          { status: 404 }
        );
      }

      const now = nowISO();
      const yyyy = String(new Date().getFullYear());

      // ─── Find or create the invoice for this contract ───
      let invoice = db.prepare(`
        SELECT invoice_id, total_usd, paid_amount_usd, outstanding_balance_usd, status
        FROM invoices
        WHERE contract_id = ? AND organization_id = ?
        ORDER BY created_ts DESC LIMIT 1
      `).get(contractId, orgId) as {
        invoice_id: string;
        total_usd: number;
        paid_amount_usd: number;
        outstanding_balance_usd: number;
        status: string;
      } | undefined;

      let invoiceCreated = false;
      if (!invoice) {
        // Generate invoice_id: INV-YYYY-NNNN
        const invPrefix = `INV-${yyyy}-`;
        const lastInv = db.prepare(`
          SELECT invoice_id FROM invoices
          WHERE invoice_id LIKE ?
          ORDER BY invoice_id DESC
          LIMIT 1
        `).get(`${invPrefix}%`) as { invoice_id: string } | undefined;

        let invNum = 1;
        if (lastInv?.invoice_id) {
          const m = lastInv.invoice_id.match(/(\d+)$/);
          if (m) invNum = parseInt(m[1], 10) + 1;
        }
        const invoiceId = `${invPrefix}${String(invNum).padStart(4, "0")}`;
        const invoiceTotal = contract.total_value || 0;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        db.prepare(`
          INSERT INTO invoices (
            invoice_id, contract_id, lead_id, organization_id,
            invoice_number, issue_date, due_date,
            currency, subtotal_usd, tax_usd, total_usd,
            status, paid_amount_usd, outstanding_balance_usd,
            created_ts, updated_ts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'issued', 0, ?, ?, ?)
        `).run(
          invoiceId, contractId, contract.lead_id, orgId,
          invoiceId,                 // invoice_number (human-readable)
          now,                       // issue_date
          dueDate.toISOString(),     // due_date (30 days from now)
          contract.currency || "USD",
          invoiceTotal,              // subtotal_usd
          invoiceTotal,              // total_usd
          invoiceTotal,              // outstanding_balance_usd
          now, now
        );

        invoice = {
          invoice_id: invoiceId,
          total_usd: invoiceTotal,
          paid_amount_usd: 0,
          outstanding_balance_usd: invoiceTotal,
          status: "issued",
        };
        invoiceCreated = true;
      }

      // ─── Generate payment_id: PAY-YYYY-NNNN ───
      const payPrefix = `PAY-${yyyy}-`;
      const lastPay = db.prepare(`
        SELECT payment_id FROM payments
        WHERE payment_id LIKE ?
        ORDER BY payment_id DESC
        LIMIT 1
      `).get(`${payPrefix}%`) as { payment_id: string } | undefined;

      let payNum = 1;
      if (lastPay?.payment_id) {
        const m = lastPay.payment_id.match(/(\d+)$/);
        if (m) payNum = parseInt(m[1], 10) + 1;
      }
      const paymentId = `${payPrefix}${String(payNum).padStart(4, "0")}`;

      // ─── Insert the payment ───
      db.prepare(`
        INSERT INTO payments (
          payment_id, invoice_id, contract_id, lead_id, organization_id,
          amount_usd, payment_date, payment_method,
          reference_number, bank_name,
          status, notes, created_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
      `).run(
        paymentId, invoice.invoice_id, contractId, contract.lead_id, orgId,
        amountNum, paymentDate, paymentMethod,
        referenceNumber || null, bankName || null,
        notes || null, now
      );

      // ─── Update the invoice: paid_amount + outstanding_balance + status ───
      const newPaidAmount = (invoice.paid_amount_usd || 0) + amountNum;
      const totalUsd = invoice.total_usd || 0;
      const newOutstanding = Math.max(0, totalUsd - newPaidAmount);
      let newStatus = invoice.status;
      if (totalUsd > 0 && newPaidAmount >= totalUsd) {
        newStatus = "paid";
      } else if (newPaidAmount > 0) {
        newStatus = "partial";
      }

      db.prepare(`
        UPDATE invoices
        SET paid_amount_usd = ?, outstanding_balance_usd = ?, status = ?, updated_ts = ?
        WHERE invoice_id = ? AND organization_id = ?
      `).run(newPaidAmount, newOutstanding, newStatus, now, invoice.invoice_id, orgId);

      return NextResponse.json({
        ok: true,
        payment: {
          id: paymentId,
          invoiceId: invoice.invoice_id,
          contractId,
          leadId: contract.lead_id,
          amountUsd: amountNum,
          paymentDate,
          paymentMethod,
          referenceNumber: referenceNumber || null,
          bankName: bankName || null,
          status: "confirmed",
          notes: notes || null,
          organization_id: orgId,
          created_ts: now,
        },
        invoice: {
          id: invoice.invoice_id,
          contractId,
          totalUsd: invoice.total_usd || 0,
          paidAmountUsd: newPaidAmount,
          outstandingBalanceUsd: newOutstanding,
          status: newStatus,
          created: invoiceCreated,
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/finance POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to record payment" },
      { status: 500 }
    );
  }
}
