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

import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

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
      `).all(auth.user.organizationId) as any[];

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
