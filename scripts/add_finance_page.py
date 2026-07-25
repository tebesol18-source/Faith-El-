#!/usr/bin/env python3
"""Insert FinancePage before PlaceholderPage and wire into router."""
from pathlib import Path

FILE = Path("/home/z/my-project/src/app/page.tsx")
content = FILE.read_text()

# Insert FinancePage before the PlaceholderPage comment block
insert_marker = "\n// ═══════════════════════════════════════════════════════════\nfunction PlaceholderPage"

FINANCE_PAGE = '''

// ═══════════════════════════════════════════════════════════
// FINANCE PAGE — "How much money have I made?"
// ═══════════════════════════════════════════════════════════
type TxnType = "invoice" | "payment_in" | "cost_coffee" | "cost_freight" | "cost_insurance" | "cost_commission" | "cost_other";
type TxnStatus = "paid" | "pending" | "overdue" | "due_soon";

type Transaction = {
  id: string;
  type: TxnType;
  description: string;
  counterparty: string;
  amount: number;  // positive = money in, negative = money out
  currency: string;
  date: string;
  dueDate: string | null;
  status: TxnStatus;
  contractId: string | null;
  shipmentId: string | null;
  invoiceRef: string | null;
  category: string;
  notes?: string;
};

const txnTypeConfig: Record<TxnType, { label: string; icon: any; sign: "in" | "out" }> = {
  invoice: { label: "Invoice Issued", icon: FileText, sign: "in" },
  payment_in: { label: "Payment Received", icon: ArrowDown, sign: "in" },
  cost_coffee: { label: "Coffee Purchase", icon: Coffee, sign: "out" },
  cost_freight: { label: "Freight", icon: Ship, sign: "out" },
  cost_insurance: { label: "Insurance", icon: ShieldCheck, sign: "out" },
  cost_commission: { label: "Agent Commission", icon: Handshake, sign: "out" },
  cost_other: { label: "Other Cost", icon: Package, sign: "out" },
};

const txnStatusConfig: Record<TxnStatus, { label: string; bg: string; text: string; dot: string }> = {
  paid: { label: "Paid", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  pending: { label: "Pending", bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
  overdue: { label: "Overdue", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  due_soon: { label: "Due Soon", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
};

const transactionsData: Transaction[] = [
  // ─── INVOICES & PAYMENTS (Money IN) ───
  {
    id: "INV-2026-003", type: "invoice", description: "Invoice for CT-2026-0003 (Blue Mountain Traders)", counterparty: "Blue Mountain Traders",
    amount: 84600, currency: "USD", date: "Jul 20", dueDate: "Jul 25", status: "paid",
    contractId: "CT-2026-0003", shipmentId: "CT-2026-001", invoiceRef: "INV-2026-003",
    category: "Revenue",
  },
  {
    id: "PAY-2026-003", type: "payment_in", description: "LC Payment received — CT-2026-0003", counterparty: "Blue Mountain Traders via Deutsche Bank",
    amount: 84600, currency: "USD", date: "Jul 22", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: null, invoiceRef: "INV-2026-003",
    category: "Revenue",
    notes: "LC at sight — released against B/L presentation. Funds cleared same day.",
  },
  {
    id: "INV-2026-008", type: "invoice", description: "Invoice for CT-2026-0008 (Seoul Coffee Lab) — 50% advance", counterparty: "Seoul Coffee Lab",
    amount: 13800, currency: "USD", date: "Jul 18", dueDate: "Jul 24", status: "paid",
    contractId: "CT-2026-0008", shipmentId: "CT-2026-005", invoiceRef: "INV-2026-008-A",
    category: "Revenue",
  },
  {
    id: "PAY-2026-008a", type: "payment_in", description: "50% advance received — CT-2026-0008", counterparty: "Seoul Coffee Lab via Woori Bank",
    amount: 13800, currency: "USD", date: "Jul 22", dueDate: null, status: "paid",
    contractId: "CT-2026-0008", shipmentId: null, invoiceRef: "INV-2026-008-A",
    category: "Revenue",
  },
  {
    id: "INV-2026-008b", type: "invoice", description: "Invoice for CT-2026-0008 (Seoul Coffee Lab) — 50% balance", counterparty: "Seoul Coffee Lab",
    amount: 13800, currency: "USD", date: "Jul 22", dueDate: "Aug 10", status: "due_soon",
    contractId: "CT-2026-0008", shipmentId: "CT-2026-005", invoiceRef: "INV-2026-008-B",
    category: "Revenue",
    notes: "Balance due before vessel arrives Busan (Aug 16). Buyer has good payment history.",
  },
  {
    id: "INV-2025-198", type: "invoice", description: "Invoice for CT-2025-0195 (Marcus Coffee GmbH)", counterparty: "Marcus Coffee GmbH",
    amount: 58900, currency: "USD", date: "Jun 14", dueDate: "Jul 09", status: "paid",
    contractId: "CT-2025-0195", shipmentId: "CT-2025-0198", invoiceRef: "INV-2025-198",
    category: "Revenue",
  },
  {
    id: "PAY-2025-198", type: "payment_in", description: "LC Payment received — CT-2025-0195", counterparty: "Marcus Coffee GmbH via Commerzbank",
    amount: 58900, currency: "USD", date: "Jul 11", dueDate: null, status: "paid",
    contractId: "CT-2025-0195", shipmentId: null, invoiceRef: "INV-2025-198",
    category: "Revenue",
  },
  {
    id: "INV-2026-004", type: "invoice", description: "Invoice for CT-2026-0004 (Marcus Coffee GmbH) — 30% deposit", counterparty: "Marcus Coffee GmbH",
    amount: 21150, currency: "USD", date: "Jul 24", dueDate: "Jul 31", status: "pending",
    contractId: "CT-2026-0004", shipmentId: null, invoiceRef: "INV-2026-004-A",
    category: "Revenue",
    notes: "Contract pending buyer signature. Deposit due within 7 days of execution.",
  },

  // ─── COSTS (Money OUT) ───
  {
    id: "COST-2026-001a", type: "cost_coffee", description: "Coffee purchase — LOT-25-0001 (Yirgacheffe G1, 6t)", counterparty: "Yirgacheffe Cooperative Union",
    amount: -32400, currency: "USD", date: "Jul 10", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: null, invoiceRef: null,
    category: "Cost of Goods",
    notes: "Farmgate price $5.40/kg. ECX auction lot.",
  },
  {
    id: "COST-2026-001b", type: "cost_coffee", description: "Coffee purchase — LOT-25-0003 (Guji G1, 6t)", counterparty: "Guji Highland Farmers",
    amount: -30600, currency: "USD", date: "Jul 10", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: null, invoiceRef: null,
    category: "Cost of Goods",
  },
  {
    id: "COST-2026-001c", type: "cost_coffee", description: "Coffee purchase — LOT-25-0005 (Sidamo G2, 4t)", counterparty: "Sidamo Union",
    amount: -19400, currency: "USD", date: "Jul 11", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: null, invoiceRef: null,
    category: "Cost of Goods",
  },
  {
    id: "COST-2026-001d", type: "cost_freight", description: "Sea freight — Djibouti to Hamburg (MSC Hamburg)", counterparty: "MSC Mediterranean Shipping",
    amount: -3200, currency: "USD", date: "Jul 19", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: "CT-2026-001", invoiceRef: null,
    category: "Freight",
  },
  {
    id: "COST-2026-001e", type: "cost_insurance", description: "Cargo insurance — CT-2026-001 (110% of value)", counterparty: "Nyala Insurance Co.",
    amount: -680, currency: "USD", date: "Jul 18", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: "CT-2026-001", invoiceRef: null,
    category: "Insurance",
  },
  {
    id: "COST-2026-001f", type: "cost_commission", description: "Agent commission — CT-2026-0003 (2%)", counterparty: "Coffee Trade Desk",
    amount: -1692, currency: "USD", date: "Jul 22", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: null, invoiceRef: null,
    category: "Commission",
    notes: "Auto-calculated on LC payment receipt. Paid via masked escrow.",
  },
  {
    id: "COST-2026-001g", type: "cost_other", description: "ECX grading + processing + fumigation", counterparty: "ECX + Fumigatix Ltd",
    amount: -1850, currency: "USD", date: "Jul 13", dueDate: null, status: "paid",
    contractId: "CT-2026-0003", shipmentId: null, invoiceRef: null,
    category: "Other Costs",
  },

  // ─── Historical ───
  {
    id: "COST-2025-198a", type: "cost_coffee", description: "Coffee purchase — LOT-24-0089 (Yirgacheffe G1, 8t)", counterparty: "Yirgacheffe Cooperative Union",
    amount: -43200, currency: "USD", date: "Jun 05", dueDate: null, status: "paid",
    contractId: "CT-2025-0195", shipmentId: null, invoiceRef: null,
    category: "Cost of Goods",
  },
  {
    id: "COST-2025-198b", type: "cost_freight", description: "Sea freight — Djibouti to Hamburg (Hapag-Lloyd Berlin)", counterparty: "Hapag-Lloyd",
    amount: -2800, currency: "USD", date: "Jun 18", dueDate: null, status: "paid",
    contractId: "CT-2025-0195", shipmentId: "CT-2025-0198", invoiceRef: null,
    category: "Freight",
  },
  {
    id: "COST-2025-198c", type: "cost_commission", description: "Agent commission — CT-2025-0195 (2%)", counterparty: "Coffee Trade Desk",
    amount: -1178, currency: "USD", date: "Jul 11", dueDate: null, status: "paid",
    contractId: "CT-2025-0195", shipmentId: null, invoiceRef: null,
    category: "Commission",
  },
];

function FinancePage() {
  const [filter, setFilter] = useState("All");
  const [selectedTxn, setSelectedTxn] = useState<string | null>(null);
  const filters = ["All", "Receivables", "Payables", "Overdue", "This Month"];

  const filterMap: Record<string, (t: Transaction) => boolean> = {
    "All": () => true,
    "Receivables": (t) => t.amount > 0,
    "Payables": (t) => t.amount < 0,
    "Overdue": (t) => t.status === "overdue",
    "This Month": (t) => t.date.includes("Jul"),
  };

  const filtered = transactionsData.filter(filterMap[filter]);

  // Calculate profit summary
  const totalRevenue = transactionsData.filter(t => t.amount > 0 && t.status === "paid").reduce((s, t) => s + t.amount, 0);
  const totalCosts = Math.abs(transactionsData.filter(t => t.amount < 0 && t.status === "paid").reduce((s, t) => s + t.amount, 0));
  const netProfit = totalRevenue - totalCosts;
  const marginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Cash position
  const outstanding = transactionsData.filter(t => t.amount > 0 && (t.status === "pending" || t.status === "due_soon" || t.status === "overdue")).reduce((s, t) => s + t.amount, 0);
  const overdue = transactionsData.filter(t => t.amount > 0 && t.status === "overdue").reduce((s, t) => s + t.amount, 0);
  const dueThisWeek = transactionsData.filter(t => t.amount > 0 && t.status === "due_soon").reduce((s, t) => s + t.amount, 0);

  // This month metrics
  const monthRevenue = transactionsData.filter(t => t.amount > 0 && t.date.includes("Jul") && t.status === "paid").reduce((s, t) => s + t.amount, 0);
  const monthCosts = Math.abs(transactionsData.filter(t => t.amount < 0 && t.date.includes("Jul") && t.status === "paid").reduce((s, t) => s + t.amount, 0));

  // Cost breakdown
  const costBreakdown = {
    coffee: Math.abs(transactionsData.filter(t => t.type === "cost_coffee" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
    freight: Math.abs(transactionsData.filter(t => t.type === "cost_freight" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
    insurance: Math.abs(transactionsData.filter(t => t.type === "cost_insurance" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
    commission: Math.abs(transactionsData.filter(t => t.type === "cost_commission" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
    other: Math.abs(transactionsData.filter(t => t.type === "cost_other" && t.status === "paid").reduce((s, t) => s + t.amount, 0)),
  };

  const selected = transactionsData.find(t => t.id === selectedTxn);

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Finance</h1>
          <p className="text-sm text-gray-500 mt-1">How much money have I made?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Plus className="h-4 w-4" /> New Invoice
        </button>
      </div>

      {/* Profit Hero Card — the most important number */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="grid grid-cols-4 gap-6">
          {/* Net Profit — hero */}
          <div className="col-span-1">
            <p className="text-xs font-medium text-gray-500">Net Profit (YTD)</p>
            <p className={cn("text-3xl font-bold mt-1", netProfit >= 0 ? "text-green-600" : "text-red-600")}>${netProfit.toLocaleString()}</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className={cn("text-sm font-bold", marginPct >= 20 ? "text-green-600" : marginPct >= 12 ? "text-amber-600" : "text-red-600")}>{marginPct.toFixed(1)}%</span>
              <span className="text-xs text-gray-400">margin · target 20%</span>
            </div>
          </div>
          {/* Revenue */}
          <div className="border-l border-gray-100 pl-6">
            <p className="text-xs font-medium text-gray-500">Revenue Received</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">${totalRevenue.toLocaleString()}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">from {transactionsData.filter(t => t.type === "payment_in" && t.status === "paid").length} payments</p>
          </div>
          {/* Costs */}
          <div className="border-l border-gray-100 pl-6">
            <p className="text-xs font-medium text-gray-500">Total Costs</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">${totalCosts.toLocaleString()}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">across 5 categories</p>
          </div>
          {/* Outstanding */}
          <div className="border-l border-gray-100 pl-6">
            <p className="text-xs font-medium text-gray-500">Outstanding</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">${outstanding.toLocaleString()}</p>
            <p className="text-[11px] text-amber-500 mt-0.5">{overdue > 0 ? `$${overdue.toLocaleString()} overdue · ` : ""}${dueThisWeek > 0 ? `$${dueThisWeek.toLocaleString()} due this week` : "no overdue"}</p>
          </div>
        </div>

        {/* Cost breakdown bar */}
        <div className="mt-6 pt-5 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Cost Breakdown</p>
            <p className="text-xs text-gray-500">${totalCosts.toLocaleString()} total</p>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-[#4A3520]" style={{ width: `${(costBreakdown.coffee / totalCosts) * 100}%` }} title={`Coffee: $${costBreakdown.coffee.toLocaleString()}`} />
            <div className="bg-blue-500" style={{ width: `${(costBreakdown.freight / totalCosts) * 100}%` }} title={`Freight: $${costBreakdown.freight.toLocaleString()}`} />
            <div className="bg-green-500" style={{ width: `${(costBreakdown.insurance / totalCosts) * 100}%` }} title={`Insurance: $${costBreakdown.insurance.toLocaleString()}`} />
            <div className="bg-purple-500" style={{ width: `${(costBreakdown.commission / totalCosts) * 100}%` }} title={`Commission: $${costBreakdown.commission.toLocaleString()}`} />
            <div className="bg-amber-500" style={{ width: `${(costBreakdown.other / totalCosts) * 100}%` }} title={`Other: $${costBreakdown.other.toLocaleString()}`} />
          </div>
          <div className="flex items-center gap-4 mt-2 flex-wrap text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#4A3520]" /> Coffee ${(costBreakdown.coffee / 1000).toFixed(1)}K</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Freight ${(costBreakdown.freight / 1000).toFixed(1)}K</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Insurance ${(costBreakdown.insurance / 1000).toFixed(1)}K</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /> Commission ${(costBreakdown.commission / 1000).toFixed(1)}K</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Other ${(costBreakdown.other / 1000).toFixed(1)}K</span>
          </div>
        </div>
      </div>

      {/* AI Insight Banner — only shows when actionable */}
      {(overdue > 0 || dueThisWeek > 0) && (
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <DollarSign className="h-5 w-5 text-amber-600" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-amber-700">Cash Flow Alert</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {dueThisWeek > 0 && <><span className="font-semibold text-amber-700">${dueThisWeek.toLocaleString()} due this week</span> — Seoul Coffee Lab balance (INV-2026-008-B) due Aug 10 before vessel arrives Busan. </>}
                {overdue > 0 ? <>{overdue > 0 && <span className="font-semibold text-red-700">${overdue.toLocaleString()} overdue</span>} — needs immediate follow-up. </> : <>No overdue payments. </>}
                Next invoice to issue: Marcus Coffee deposit ($21,150) once contract CT-2026-0004 is signed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {filters.map((f) => {
          const count = transactionsData.filter(filterMap[f]).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                filter === f ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {f}
              <span className={cn("rounded-full px-1.5 text-[10px]", filter === f ? "bg-white/20" : "bg-gray-100 text-gray-500")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Transaction ledger */}
      <div className="space-y-2">
        {filtered.map((t) => {
          const tc = txnTypeConfig[t.type];
          const sc = txnStatusConfig[t.status];
          const isMoneyIn = t.amount > 0;
          return (
            <div
              key={t.id}
              onClick={() => setSelectedTxn(t.id)}
              className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300"
            >
              <div className="flex items-center gap-4">
                {/* Type icon */}
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  isMoneyIn ? "bg-green-50" : "bg-gray-50"
                )}>
                  <tc.icon className={cn("h-5 w-5", isMoneyIn ? "text-green-600" : "text-gray-500")} strokeWidth={1.5} />
                </div>

                {/* Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs">
                    <span className="text-gray-500">{t.counterparty}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">{tc.label}</span>
                    {t.contractId && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{t.contractId}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Date */}
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">{t.date}</p>
                  {t.dueDate && <p className="text-[10px] text-gray-400">due {t.dueDate}</p>}
                </div>

                {/* Status */}
                <div className="shrink-0">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                    {sc.label}
                  </span>
                </div>

                {/* Amount */}
                <div className="text-right shrink-0 min-w-[100px]">
                  <p className={cn("text-base font-bold", isMoneyIn ? "text-green-600" : "text-gray-700")}>
                    {isMoneyIn ? "+" : ""}${Math.abs(t.amount).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-gray-400">{t.currency}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedTxn(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[480px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selected.id}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{txnTypeConfig[selected.type].label} · {selected.category}</p>
                </div>
                <button onClick={() => setSelectedTxn(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Amount hero */}
              <div className={cn(
                "rounded-lg p-4 text-center",
                selected.amount > 0 ? "bg-green-50" : "bg-gray-50"
              )}>
                <p className={cn("text-3xl font-bold", selected.amount > 0 ? "text-green-600" : "text-gray-700")}>
                  {selected.amount > 0 ? "+" : "-"}${Math.abs(selected.amount).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">{selected.currency} · {selected.amount > 0 ? "Money In" : "Money Out"}</p>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Status</p>
                <div className={cn("rounded-lg p-3", txnStatusConfig[selected.status].bg)}>
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", txnStatusConfig[selected.status].dot)} />
                    <span className={cn("text-sm font-medium", txnStatusConfig[selected.status].text)}>{txnStatusConfig[selected.status].label}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {selected.status === "paid" && selected.amount > 0 && `Payment received on ${selected.date}.`}
                    {selected.status === "paid" && selected.amount < 0 && `Paid on ${selected.date}.`}
                    {selected.status === "pending" && `Awaiting payment — due ${selected.dueDate}.`}
                    {selected.status === "due_soon" && `Due ${selected.dueDate}. Payment expected within 7 days.`}
                    {selected.status === "overdue" && `Overdue — was due ${selected.dueDate}. Follow up immediately.`}
                  </p>
                </div>
              </div>

              {/* Details grid */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Date</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{selected.date}</p>
                  </div>
                  {selected.dueDate && (
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Due Date</p>
                      <p className="text-sm font-medium text-gray-900 mt-0.5">{selected.dueDate}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-gray-50 p-3 col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Counterparty</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{selected.counterparty}</p>
                  </div>
                  {selected.contractId && (
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contract</p>
                      <p className="text-sm font-medium text-[#4A3520] mt-0.5">{selected.contractId}</p>
                    </div>
                  )}
                  {selected.shipmentId && (
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Shipment</p>
                      <p className="text-sm font-medium text-[#4A3520] mt-0.5">{selected.shipmentId}</p>
                    </div>
                  )}
                  {selected.invoiceRef && (
                    <div className="rounded-lg bg-gray-50 p-3 col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Invoice Ref</p>
                      <p className="text-sm font-mono font-medium text-gray-900 mt-0.5">{selected.invoiceRef}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Description</p>
                <p className="text-sm text-gray-700">{selected.description}</p>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
                    <span className="text-xs font-semibold text-indigo-600">NOTE</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.amount > 0 && selected.status === "overdue" && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Send Payment Reminder</button>
                )}
                {selected.amount > 0 && selected.status === "due_soon" && (
                  <button className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">Send Payment Reminder</button>
                )}
                {selected.amount > 0 && selected.status === "pending" && (
                  <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Send Invoice to Buyer</button>
                )}
                {selected.amount > 0 && selected.status === "paid" && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Receipt</button>
                )}
                {selected.amount < 0 && selected.status === "paid" && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Receipt</button>
                )}
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  {selected.contractId ? `View Contract ${selected.contractId}` : "View Linked Records"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}'''

content = content.replace(insert_marker, FINANCE_PAGE + insert_marker, 1)

# Wire into router
old_router = '{currentPage === "shipments" && <ShipmentsPage />}\n        {currentPage === "contracts" && <ContractsPage />}'
new_router = '{currentPage === "shipments" && <ShipmentsPage />}\n        {currentPage === "contracts" && <ContractsPage />}\n        {currentPage === "finance" && <FinancePage />}'

assert old_router in content, "Router pattern not found"
content = content.replace(old_router, new_router)

# Update the placeholder exclusion
old_exclude = 'currentPage !== "shipments" && currentPage !== "contracts" && ('
new_exclude = 'currentPage !== "shipments" && currentPage !== "contracts" && currentPage !== "finance" && ('
content = content.replace(old_exclude, new_exclude)

FILE.write_text(content)
print(f"Inserted FinancePage. New file size: {len(content)} chars")
