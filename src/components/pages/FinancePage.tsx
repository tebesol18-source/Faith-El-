"use client";

import { useState, useEffect } from "react";
import {
  ArrowDown, Coffee, DollarSign, FileText, Filter, Handshake, Package, Plus, Send, ShieldCheck, Ship, Sparkles, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract, Insight, Shipment, Transaction, TxnStatus, TxnType } from "@/lib/types";




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

const mockTransactionsData: Transaction[] = [];

export function FinancePage() {
  const [filter, setFilter] = useState("All");
  const [selectedTxn, setSelectedTxn] = useState<string | null>(null);
  const filters = ["All", "Receivables", "Payables", "Overdue", "This Month"];

  // ─── Live data from backend ───
  const [transactionsData, setTransactionsData] = useState<Transaction[] | null>(null);
  const [apiStats, setApiStats] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.transactions) && data.transactions.length > 0) {
          setTransactionsData(data.transactions);
          setApiStats(data.stats);
        } else {
          setTransactionsData([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[FinancePage] API fetch failed, using mock data:", err);
        setTransactionsData([]);
      });
    return () => { cancelled = true; };
  }, []);

  const filterMap: Record<string, (t: Transaction) => boolean> = {
    "All": () => true,
    "Receivables": (t) => t.amount > 0,
    "Payables": (t) => t.amount < 0,
    "Overdue": (t) => t.status === "overdue",
    "This Month": (t) => t.date.includes("Jul") || t.date.includes("2026"),
  };

  // Loading state
  if (!transactionsData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Finance</h1>
            <p className="text-sm text-gray-500 mt-1">How much money have I made?</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading financial data from database…</p>
        </div>
      </main>
    );
  }

  const filtered = transactionsData.filter(filterMap[filter]);

  // Use API stats if available, otherwise calculate from transactions
  const totalRevenue = apiStats?.totalRevenue ?? transactionsData.filter(t => t.amount > 0 && t.status === "paid").reduce((s, t) => s + t.amount, 0);
  const totalCosts = apiStats?.totalCosts ?? Math.abs(transactionsData.filter(t => t.amount < 0 && t.status === "paid").reduce((s, t) => s + t.amount, 0));
  const netProfit = apiStats?.netProfit ?? totalRevenue - totalCosts;
  const marginPct = apiStats?.marginPct ?? (totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0);

  // Cash position
  const outstanding = apiStats?.outstanding ?? transactionsData.filter(t => t.amount > 0 && (t.status === "pending" || t.status === "due_soon" || t.status === "overdue")).reduce((s, t) => s + t.amount, 0);
  const overdue = apiStats?.overdue ?? transactionsData.filter(t => t.amount > 0 && t.status === "overdue").reduce((s, t) => s + t.amount, 0);
  const dueThisWeek = apiStats?.dueThisWeek ?? transactionsData.filter(t => t.amount > 0 && t.status === "due_soon").reduce((s, t) => s + t.amount, 0);

  // Cost breakdown
  const costBreakdown = apiStats?.costBreakdown ?? {
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
}

