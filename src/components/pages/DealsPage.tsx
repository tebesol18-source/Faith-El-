"use client";

import { useState, useEffect } from "react";
import {
  ChevronRight, Coffee, FileText, Sparkles, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract, Insight, Quote } from "@/lib/types";

const mockDealsData = [
  { id: "DEAL-2026-0001", lead: "Marcus Coffee GmbH", leadId: "L-2026-00501", stage: "negotiating", origin: "Guji", process: "Washed", volume: "320 bags", incoterm: "FOB", value: 1305, probability: 75, health: "healthy", updated: "2h ago", quotes: 2, lastQuote: "QUOTE-2026-0004-V2" },
  { id: "DEAL-2026-0002", lead: "Falcon Coffee UK", leadId: "L-2026-00502", stage: "quoting", origin: "Yirgacheffe", process: "Natural", volume: "500 bags", incoterm: "CIF", value: 2400, probability: 60, health: "healthy", updated: "5h ago", quotes: 1, lastQuote: "QUOTE-2026-0005-V1" },
  { id: "DEAL-2026-0003", lead: "Hashimoto Coffee", leadId: "L-2026-00503", stage: "sampling", origin: "Sidamo", process: "Washed", volume: "200 bags", incoterm: "FOB", value: 696, probability: 40, health: "waiting", updated: "1d ago", quotes: 0, lastQuote: null },
  { id: "DEAL-2026-0004", lead: "Aurora Imports", leadId: "L-2026-00504", stage: "negotiating", origin: "Limu", process: "Washed", volume: "150 bags", incoterm: "FOB", value: 540, probability: 75, health: "at_risk", updated: "3d ago", quotes: 3, lastQuote: "QUOTE-2026-0007-V3" },
  { id: "DEAL-2026-0005", lead: "Nordic Bean Co", leadId: "L-2026-00505", stage: "quoting", origin: "Guji", process: "Natural", volume: "100 bags", incoterm: "CIF", value: 438, probability: 60, health: "healthy", updated: "4d ago", quotes: 1, lastQuote: "QUOTE-2026-0008-V1" },
  { id: "DEAL-2026-0006", lead: "Blue Mountain Traders", leadId: "L-2026-00507", stage: "closed_won", origin: "Yirgacheffe", process: "Washed", volume: "1000 bags", incoterm: "FOB", value: 4200, probability: 100, health: "healthy", updated: "Yesterday", quotes: 4, lastQuote: "QUOTE-2026-0001-V4" },
  { id: "DEAL-2026-0007", lead: "Rösterei Berlin", leadId: "L-2026-00508", stage: "closed_lost", origin: "Sidamo", process: "Honey", volume: "80 bags", incoterm: "FOB", value: 374, probability: 0, health: "at_risk", updated: "8d ago", quotes: 2, lastQuote: "QUOTE-2026-0003-V2" },
  { id: "DEAL-2026-0008", lead: "Seoul Coffee Lab", leadId: "L-2026-00509", stage: "sampling", origin: "Guji", process: "Washed", volume: "300 bags", incoterm: "CIF", value: 1314, probability: 40, health: "waiting", updated: "2d ago", quotes: 0, lastQuote: null },
];

const stageConfig: Record<string, { label: string; color: string; bg: string }> = {
  prospecting: { label: "Prospecting", color: "text-blue-600", bg: "bg-blue-50" },
  qualified: { label: "Qualified", color: "text-indigo-600", bg: "bg-indigo-50" },
  sampling: { label: "Sampling", color: "text-purple-600", bg: "bg-purple-50" },
  quoting: { label: "Quoting", color: "text-amber-600", bg: "bg-amber-50" },
  negotiating: { label: "Negotiating", color: "text-orange-600", bg: "bg-orange-50" },
  contract_drafted: { label: "Contract Drafted", color: "text-teal-600", bg: "bg-teal-50" },
  closed_won: { label: "Closed Won", color: "text-green-600", bg: "bg-green-50" },
  closed_lost: { label: "Closed Lost", color: "text-red-500", bg: "bg-red-50" },
};

const healthConfig: Record<string, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-green-500", text: "text-green-600" },
  waiting: { label: "Waiting", dot: "bg-amber-500", text: "text-amber-600" },
  at_risk: { label: "At Risk", dot: "bg-red-500", text: "text-red-600" },
};

export function DealsPage() {
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);

  // ─── Live data from backend ───
  const [dealsData, setDealsData] = useState<typeof mockDealsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deals")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.deals) && data.deals.length > 0) {
          setDealsData(data.deals);
        } else {
          setDealsData([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[DealsPage] API fetch failed, using mock data:", err);
        setDealsData([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Loading state
  if (!dealsData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Deals</h1>
            <p className="text-sm text-gray-500 mt-1">Where is every opportunity?</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading deals from database…</p>
        </div>
      </main>
    );
  }

  const activeDeals = dealsData.filter(d => d.stage !== "closed_won" && d.stage !== "closed_lost");
  const wonDeals = dealsData.filter(d => d.stage === "closed_won");
  const lostDeals = dealsData.filter(d => d.stage === "closed_lost");
  const totalValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);

  const pipelineStages = ["prospecting", "qualified", "sampling", "quoting", "negotiating", "contract_drafted"];
  const selected = dealsData.find(d => d.id === selectedDeal);

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Deals</h1>
          <p className="text-sm text-gray-500 mt-1">Where is every opportunity?</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("pipeline")}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", view === "pipeline" ? "bg-[#4A3520] text-white" : "border border-gray-200 text-gray-500 hover:bg-gray-50")}
          >
            Pipeline View
          </button>
          <button
            onClick={() => setView("list")}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", view === "list" ? "bg-[#4A3520] text-white" : "border border-gray-200 text-gray-500 hover:bg-gray-50")}
          >
            List View
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Deals</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{activeDeals.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Won</p>
          <p className="text-2xl font-bold text-green-600 mt-1">${wonValue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">At Risk</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{dealsData.filter(d => d.health === "at_risk").length}</p>
        </div>
      </div>

      {view === "pipeline" ? (
        /* Pipeline View — Kanban-style columns */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipelineStages.map((stage) => {
            const stageDeals = activeDeals.filter(d => d.stage === stage);
            const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);
            const sc = stageConfig[stage];
            return (
              <div key={stage} className="w-[240px] shrink-0">
                {/* Column header */}
                <div className="rounded-lg bg-gray-50 px-3 py-2 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{sc.label}</span>
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", sc.bg, sc.color)}>{stageDeals.length}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">${stageValue.toLocaleString()}</p>
                </div>
                {/* Deal cards */}
                <div className="space-y-2">
                  {stageDeals.map((deal) => {
                    const hc = healthConfig[deal.health];
                    return (
                      <button
                        key={deal.id}
                        onClick={() => setSelectedDeal(deal.id)}
                        className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-gray-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <span className="text-xs font-semibold text-gray-900 truncate">{deal.lead}</span>
                          <span className={cn("h-2 w-2 rounded-full shrink-0 ml-2 mt-1", hc.dot)} />
                        </div>
                        <p className="text-[11px] text-gray-400 mb-2">{deal.id}</p>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{deal.origin}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{deal.process}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{deal.incoterm}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-900">${deal.value.toLocaleString()}</span>
                          <span className="text-[10px] text-gray-400">{deal.volume}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-gray-100">
                            <div className={cn("h-1 rounded-full", deal.probability >= 75 ? "bg-green-500" : deal.probability >= 50 ? "bg-amber-500" : "bg-blue-500")} style={{ width: `${deal.probability}%` }} />
                          </div>
                          <span className="text-[10px] font-medium text-gray-500">{deal.probability}%</span>
                        </div>
                        {deal.quotes > 0 && (
                          <p className="text-[10px] text-gray-400 mt-1.5">{deal.quotes} quote{deal.quotes > 1 ? "s" : ""} · {deal.lastQuote}</p>
                        )}
                      </button>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center">
                      <p className="text-[11px] text-gray-300">No deals</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View — Table */
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Deal ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Lead</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Origin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Volume</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Health</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Prob.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Quotes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {dealsData.map((deal) => {
                const sc = stageConfig[deal.stage];
                const hc = healthConfig[deal.health];
                return (
                  <tr
                    key={deal.id}
                    onClick={() => setSelectedDeal(deal.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">{deal.id}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{deal.lead}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.color)}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{deal.origin} {deal.process}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{deal.volume}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">${deal.value.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", hc.text)}>
                        <span className={cn("h-2 w-2 rounded-full", hc.dot)} />
                        {hc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1.5 rounded-full bg-gray-100">
                          <div className={cn("h-1.5 rounded-full", deal.probability >= 75 ? "bg-green-500" : deal.probability >= 50 ? "bg-amber-500" : deal.probability > 0 ? "bg-blue-500" : "bg-gray-300")} style={{ width: `${deal.probability}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{deal.probability}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{deal.quotes > 0 ? `${deal.quotes} (${deal.lastQuote})` : "—"}</td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Won/Lost summary at bottom */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-green-700">Closed Won</p>
              <p className="text-xl font-bold text-gray-900 mt-1">${wonValue.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">{wonDeals.length}</p>
              <p className="text-[10px] text-gray-400">deals</p>
            </div>
          </div>
          {wonDeals.map((d, i) => (
            <div key={i} className="mt-2 pt-2 border-t border-green-100 flex items-center justify-between">
              <span className="text-xs text-gray-600">{d.lead}</span>
              <span className="text-xs font-semibold text-gray-900">${d.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-red-700">Closed Lost</p>
              <p className="text-xl font-bold text-gray-900 mt-1">${lostDeals.reduce((s, d) => s + d.value, 0).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-red-500">{lostDeals.length}</p>
              <p className="text-[10px] text-gray-400">deals</p>
            </div>
          </div>
          {lostDeals.map((d, i) => (
            <div key={i} className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between">
              <span className="text-xs text-gray-600">{d.lead}</span>
              <span className="text-xs font-semibold text-gray-900">${d.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deal Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedDeal(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[420px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">Deal Details</h3>
              <button onClick={() => setSelectedDeal(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
            </div>
            <div className="p-6 space-y-6">
              {/* Deal info */}
              <div>
                <p className="text-lg font-bold text-gray-900">{selected.lead}</p>
                <p className="text-xs text-gray-500 mt-0.5">{selected.id} · Lead: {selected.leadId}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", stageConfig[selected.stage].bg, stageConfig[selected.stage].color)}>
                    {stageConfig[selected.stage].label}
                  </span>
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", healthConfig[selected.health].text)}>
                    <span className={cn("h-2 w-2 rounded-full", healthConfig[selected.health].dot)} />
                    {healthConfig[selected.health].label}
                  </span>
                </div>
              </div>

              {/* Deal terms */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Value</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">${selected.value.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Probability</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{selected.probability}%</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Origin</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.origin} {selected.process}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Volume</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.volume}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Incoterm</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.incoterm}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Updated</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.updated}</p>
                </div>
              </div>

              {/* Quotes */}
              {selected.quotes > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Quotes ({selected.quotes})</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{selected.lastQuote}</p>
                        <p className="text-[11px] text-gray-400">Latest version</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </div>
                  </div>
                </div>
              )}

              {/* AI Insight */}
              <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
                  <span className="text-xs font-semibold text-indigo-600">AI INSIGHT</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {selected.health === "at_risk"
                    ? "This deal is at risk. Buyer hasn't responded in 3 days. Consider sending a breakup email or offering a 2% discount to close."
                    : selected.stage === "negotiating"
                    ? "Buyer is actively negotiating. They've received 2 quote versions. The counter-offer on V2 ($0.062/kg CIF) is within acceptable margin — recommend accepting."
                    : selected.stage === "sampling"
                    ? "Samples dispatched. Waiting for cupping feedback. Follow up in 2 days if no response."
                    : "Deal is progressing well through the pipeline. Continue current approach."}
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {selected.stage === "quoting" && (
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4A3520] py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
                    <FileText className="h-4 w-4" /> View Quote
                  </button>
                )}
                {selected.stage === "negotiating" && (
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4A3520] py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
                    <FileText className="h-4 w-4" /> Review Counter-Offer
                  </button>
                )}
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  View Full Timeline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

