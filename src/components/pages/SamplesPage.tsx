"use client";

import { useState, useEffect } from "react";
import {
  Clock, Coffee, Filter, Plus, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract } from "@/lib/types";

const mockSamplesData = [];

const sampleStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending: { label: "Pending Dispatch", bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
  dispatched: { label: "Dispatched", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  delivered: { label: "Delivered", bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  feedback_due: { label: "Feedback Due", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  decided: { label: "Decided", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
};

const decisionConfig: Record<string, { label: string; bg: string; text: string }> = {
  approved: { label: "Approved", bg: "bg-green-100", text: "text-green-700" },
  rejected: { label: "Rejected", bg: "bg-red-100", text: "text-red-600" },
  needs_another: { label: "Needs Another", bg: "bg-amber-100", text: "text-amber-700" },
};

export function SamplesPage() {
  // ─── Live data from backend ───
  const [samplesData, setSamplesData] = useState<any[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/samples")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.samples) && data.samples.length > 0) {
          setSamplesData(data.samples);
        } else {
          setSamplesData([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[SamplesPage] API fetch failed, using mock data:", err);
        setSamplesData([]);
      });
    return () => { cancelled = true; };
  }, []);

  const [filter, setFilter] = useState("All");

  // Loading state
  if (!samplesData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading from database…</p>
        </div>
      </main>
    );
  }

  const filters = ["All", "Pending", "Dispatched", "Delivered", "Feedback Due", "Decided"];

  const filteredSamples = filter === "All"
    ? samplesData
    : samplesData.filter(s => s.status.replace(/_/g, " ").toLowerCase() === filter.toLowerCase());

  const stats = {
    total: samplesData.length,
    pending: samplesData.filter(s => s.status === "pending").length,
    inTransit: samplesData.filter(s => s.status === "dispatched" || s.status === "delivered").length,
    feedbackDue: samplesData.filter(s => s.status === "feedback_due").length,
    decided: samplesData.filter(s => s.status === "decided").length,
  };

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Samples</h1>
          <p className="text-sm text-gray-500 mt-1">Which samples are moving?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Plus className="h-4 w-4" /> New Sample Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-gray-400 mt-1">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">In Transit</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.inTransit}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Feedback Due</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.feedbackDue}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Decided</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.decided}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Sample cards */}
      <div className="space-y-3">
        {filteredSamples.map((sample) => {
          const sc = sampleStatusConfig[sample.status];
          const dc = sample.decision ? decisionConfig[sample.decision] : null;
          return (
            <div key={sample.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-4">
                {/* Status indicator */}
                <div className="flex flex-col items-center gap-2 pt-1">
                  <span className={cn("h-3 w-3 rounded-full", sc.dot)} />
                  <div className="w-px flex-1 bg-gray-100" style={{ minHeight: "40px" }} />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{sample.id}</span>
                      <span className="text-sm text-gray-500">{sample.lead}</span>
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{sample.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dc && <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", dc.bg, dc.text)}>{dc.label}</span>}
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  {/* Lots */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {sample.lots.map((lot, li) => (
                      <span key={li} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-xs text-gray-600">{lot}</span>
                    ))}
                  </div>

                  {/* Timeline + feedback */}
                  <div className="flex items-center gap-6 text-xs">
                    {/* Timeline */}
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                      <span className="text-gray-500">
                        {sample.dispatched ? `Dispatched: ${sample.dispatched}` : "Not dispatched"}
                        {sample.delivered && ` → Delivered: ${sample.delivered}`}
                      </span>
                    </div>

                    {/* Score */}
                    {sample.score !== null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Score:</span>
                        <span className={cn("font-bold", sample.score >= 86 ? "text-green-600" : sample.score >= 84 ? "text-amber-600" : "text-red-500")}>{sample.score}</span>
                      </div>
                    )}

                    {/* Budget */}
                    <div className="flex items-center gap-1.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", sample.budget === "used" ? "bg-gray-100 text-gray-500" : "bg-green-50 text-green-600")}>
                        {sample.budget === "used" ? "Budget Used" : "Budget Available"}
                      </span>
                    </div>
                  </div>

                  {/* Feedback */}
                  {sample.feedback && (
                    <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-xs text-gray-600">{sample.feedback}</p>
                    </div>
                  )}
                </div>

                {/* Action button */}
                <div className="shrink-0">
                  {sample.status === "pending" && (
                    <button className="rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors">Dispatch</button>
                  )}
                  {sample.status === "feedback_due" && (
                    <button className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors">Follow Up</button>
                  )}
                  {sample.status === "delivered" && (
                    <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Log Feedback</button>
                  )}
                  {sample.status === "decided" && sample.decision === "approved" && (
                    <button className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors">View Contract</button>
                  )}
                  {sample.status === "decided" && sample.decision === "rejected" && (
                    <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Send Substitute</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sample Budget banner */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Sample Budget (This Week)</h3>
            <p className="text-xs text-gray-500 mt-0.5">Full sets: 3/3 used · Fallback 150g: 2/2 used · Type B: 1/2 used</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">7<span className="text-sm font-normal text-gray-400">/8</span></p>
            <p className="text-xs text-gray-400">samples sent</p>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-gray-100">
          <div className="h-2 rounded-full bg-amber-500" style={{ width: "87.5%" }} />
        </div>
      </div>
    </main>
  );
}

