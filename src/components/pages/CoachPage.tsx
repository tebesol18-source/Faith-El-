"use client";

import { useState } from "react";
import {
  AlertTriangle, Bot, CheckCircle2, ChevronRight, Sparkles, Star, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIAction, Contract, Insight, Opportunity, Page, Priority, Quote, RiskItem } from "@/lib/types";

const coachPriorities: any[] = [];

const coachInsights: any[] = [];

const coachRisks: any[] = [];

const coachOpportunities: any[] = [];

const coachAiActions: any[] = [];

const urgencyConfig: Record<string, { color: string; bg: string; text: string; label: string }> = {
  critical: { color: "bg-red-500", bg: "bg-red-50", text: "text-red-700", label: "Critical" },
  high: { color: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", label: "High" },
  medium: { color: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", label: "Medium" },
  low: { color: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-700", label: "Low" },
};

const categoryConfig: Record<string, { icon: any; label: string }> = {
  deal: { icon: TrendingUp, label: "Deal" },
  compliance: { icon: CheckCircle2, label: "Compliance" },
  inventory: { icon: AlertTriangle, label: "Inventory" },
  risk: { icon: AlertTriangle, label: "Risk" },
};

const insightTypeConfig: Record<string, { icon: any; bg: string; text: string; label: string }> = {
  trend: { icon: TrendingUp, bg: "bg-blue-50", text: "text-blue-700", label: "Trend" },
  opportunity: { icon: Star, bg: "bg-green-50", text: "text-green-700", label: "Opportunity" },
  warning: { icon: AlertTriangle, bg: "bg-amber-50", text: "text-amber-700", label: "Warning" },
};

const severityConfig: Record<string, { bg: string; text: string; bar: string; label: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500", label: "Critical" },
  high: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500", label: "High" },
  medium: { bg: "bg-blue-50", text: "text-blue-700", bar: "bg-blue-500", label: "Medium" },
  low: { bg: "bg-gray-50", text: "text-gray-700", bar: "bg-gray-400", label: "Low" },
};

export function CoachPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: "ai", text: "I'll analyze your data and get back to you. Try creating some leads or contracts first — I need real data to provide insights." }]);
    }, 800);
  };

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Coach</h1>
        <p className="text-sm text-gray-500 mt-1">What should I do next?</p>
      </div>

      {/* Morning Brief — dynamic, shows empty state when no data */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
            <Bot className="h-6 w-6 text-indigo-600" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-gray-900">Morning Brief</h2>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">Today</span>
            </div>
            {coachPriorities.length === 0 ? (
              <p className="text-sm text-gray-500 leading-relaxed">
                No active priorities yet. Once you start creating leads and closing deals,
                your AI coach will provide a daily morning brief with priorities, risks, and opportunities.
              </p>
            ) : (
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                You have <span className="font-semibold text-red-700">{coachRisks.filter(r => r.severity === "critical").length} critical risk(s)</span>,
                <span className="font-semibold text-amber-700"> {coachPriorities.filter(p => p.urgency === "high").length} high-priority action(s)</span>.
                See details below.
              </p>
            )}
            <div className="grid grid-cols-5 gap-3 pt-4 border-t border-indigo-100">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Priorities</p>
                <p className="text-lg font-bold text-gray-900">{coachPriorities.length}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Risks</p>
                <p className="text-lg font-bold text-red-600">{coachRisks.length}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Opportunities</p>
                <p className="text-lg font-bold text-green-600">{coachOpportunities.length}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Insights</p>
                <p className="text-lg font-bold text-blue-600">{coachInsights.length}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">AI Actions</p>
                <p className="text-lg font-bold text-indigo-600">{coachAiActions.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Empty state when no data */}
      {coachPriorities.length === 0 && coachRisks.length === 0 && coachOpportunities.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center mb-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 mb-4">
            <Sparkles className="h-7 w-7 text-indigo-400" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Your AI Coach is ready</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Once you have leads, contracts, or shipments in the system, your AI coach will
            generate personalized priorities, risk alerts, and opportunities.
          </p>
          <button
            onClick={() => onNavigate("leads")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors"
          >
            Go to Leads <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          {/* Top 5 Priorities */}
          {coachPriorities.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Today&apos;s Top 5 Priorities</h3>
                <span className="text-xs text-gray-400">ordered by impact</span>
              </div>
              <div className="space-y-3">
                {coachPriorities.map((p) => {
                  const uc = urgencyConfig[p.urgency] || urgencyConfig.low;
                  const cc = categoryConfig[p.category] || categoryConfig.deal;
                  const pageLabel = p.page ? (p.page.charAt(0).toUpperCase() + p.page.slice(1)) : "";
                  return (
                    <div key={p.rank} className={cn("rounded-lg border p-4 flex items-start gap-4", uc.bg, "border-gray-200")}>
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", uc.color)}>
                        {p.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">{p.action}</p>
                          <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold", uc.bg, uc.text)}>
                            {uc.label}
                          </span>
                        </div>
                        {p.detail && <p className="text-xs text-gray-500">{p.detail}</p>}
                      </div>
                      {pageLabel && (
                        <button onClick={() => onNavigate(p.page)} className="shrink-0 text-xs font-medium text-[#4A3520] hover:underline flex items-center gap-0.5">
                          {pageLabel} <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Risks + Opportunities */}
          {coachRisks.length > 0 && (
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Risk Radar</h3>
                <div className="space-y-3">
                  {coachRisks.map((r, i) => {
                    const sc = severityConfig[r.severity] || severityConfig.low;
                    return (
                      <div key={i} className={cn("rounded-lg p-3 border", sc.bg, "border-gray-200")}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("h-2 w-2 rounded-full", sc.bar)} />
                          <p className="text-sm font-medium text-gray-900">{r.title}</p>
                        </div>
                        {r.description && <p className="text-xs text-gray-500 pl-4">{r.description}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Opportunities</h3>
                <div className="space-y-3">
                  {coachOpportunities.map((o, i) => (
                    <div key={i} className="rounded-lg p-3 bg-green-50 border border-green-200">
                      <p className="text-sm font-medium text-gray-900">{o.title}</p>
                      {o.description && <p className="text-xs text-gray-500 mt-0.5">{o.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Insights */}
          {coachInsights.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Market Insights</h3>
              <div className="space-y-3">
                {coachInsights.map((ins, i) => {
                  const ic = insightTypeConfig[ins.type] || insightTypeConfig.trend;
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", ic.bg)}>
                        <ins.icon className={cn("h-4 w-4", ic.text)} />
                      </div>
                      <div>
                        <p className="text-sm text-gray-800">{ins.text}</p>
                        {ins.source && <p className="text-[11px] text-gray-400 mt-0.5">{ins.source}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Actions Timeline */}
          {coachAiActions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent AI Actions</h3>
              <div className="space-y-4">
                {coachAiActions.map((a, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100">
                        <Bot className="h-3.5 w-3.5 text-indigo-600" />
                      </div>
                      {i < coachAiActions.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" style={{ minHeight: "20px" }} />}
                    </div>
                    <div className="flex-1 pb-2">
                      <p className="text-sm font-medium text-gray-900">{a.title}</p>
                      <p className="text-xs text-gray-500">{a.description}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{a.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Chat */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-gray-900">Ask your AI Coach</h3>
        </div>
        <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
          {chatMessages.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Ask about margins, contracts, shipments, or priorities.</p>
          ) : (
            chatMessages.map((m, i) => (
              <div key={i} className={cn("rounded-lg p-3 text-sm", m.role === "user" ? "bg-gray-50 text-gray-800 ml-8" : "bg-indigo-50 text-gray-700 mr-8")}>
                {m.text}
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about your business..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520]"
          />
          <button
            onClick={sendMessage}
            className="rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33]"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
