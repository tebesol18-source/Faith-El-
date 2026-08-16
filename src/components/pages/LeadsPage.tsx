"use client";

import { useState, useEffect } from "react";
import {
  Bot, ChevronRight, Coffee, Filter, Mail, Plus, Send, Sparkles, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-client";
import type { Insight } from "@/lib/types";

const mockLeadsData = [];

const stateColors: Record<string, { bg: string; text: string; dot: string }> = {
  NEW: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
  ENRICHED: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  IN_SEQUENCE: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  QUALIFIED: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  SAMPLE_DISPATCHED: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  SAMPLE_FEEDBACK_DUE: { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-600" },
  DECIDED_APPROVED: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-600" },
  DECIDED_REJECTED: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
  DECIDED_NEEDS_ANOTHER: { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-600" },
  GHOSTED: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
  CONTRACTED: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  NURTURE: { bg: "bg-lime-50", text: "text-lime-700", dot: "bg-lime-500" },
  BLOCKED: { bg: "bg-gray-200", text: "text-gray-700", dot: "bg-gray-600" },
};

const tierColors: Record<string, string> = {
  S: "bg-[#4A3520] text-white",
  A: "bg-indigo-100 text-indigo-700",
  B: "bg-gray-100 text-gray-600",
  C: "bg-gray-50 text-gray-400",
};

export function LeadsPage() {
  const [filter, setFilter] = useState("All");
  const [selectedLead, setSelectedLead] = useState<string | null>(null);

  // ─── Lead Research modal state ───
  const [showResearch, setShowResearch] = useState(false);
  const [researchCountry, setResearchCountry] = useState("Germany");
  const [researchSegment, setResearchSegment] = useState("Specialty Importer");
  const [researchCount, setResearchCount] = useState(5);
  const [researching, setResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<string | null>(null);

  // ─── Live data from backend ───
  // Replaces the old static `leadsData` array. Falls back to mock data
  // if the API is unreachable (e.g. during offline development).
  const [leadsData, setLeadsData] = useState<any[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const refetchLeads = () => {
    apiFetch("/api/leads")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok && Array.isArray(data.leads) && data.leads.length > 0) setLeadsData(data.leads);
        else setLeadsData([]);
      })
      .catch(() => setLeadsData([]));
  };

  useEffect(() => {
    refetchLeads();
  }, []);

  // ─── Lead Research handler ───
  const handleResearch = () => {
    setResearching(true);
    setResearchResult(null);
    apiFetch("/api/agents/research-leads", {
      method: "POST",
      body: JSON.stringify({ country: researchCountry, segment: researchSegment, count: researchCount }),
    })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok) {
          setResearchResult(`✓ Agent 2 created ${data.created} new leads for ${researchCountry} (${researchSegment})`);
          refetchLeads(); // Refresh the leads list
        } else {
          setResearchResult(`✗ Error: ${data.error}`);
        }
      })
      .catch((err) => setResearchResult(`✗ Failed: ${err.message}`))
      .finally(() => setResearching(false));
  };

  const filters = ["All", "New", "Enriched", "In Sequence", "Qualified", "Ghosted"];

  // Loading state
  if (!leadsData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Leads</h1>
            <p className="text-sm text-gray-500 mt-1">Who should I sell to?</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading leads from database…</p>
          <p className="text-xs text-gray-400 mt-1">Fetching live data from backend</p>
        </div>
      </main>
    );
  }

  const filteredLeads = filter === "All"
    ? leadsData
    : leadsData.filter(l => l.state.replace(/_/g, " ").toLowerCase() === filter.toLowerCase());

  const selected = leadsData.find(l => l.id === selectedLead);

  const stats = {
    total: leadsData.length,
    qualified: leadsData.filter(l => l.state === "QUALIFIED").length,
    inSequence: leadsData.filter(l => l.state === "IN_SEQUENCE").length,
    ghosted: leadsData.filter(l => l.state === "GHOSTED").length,
  };

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Leads</h1>
        <p className="text-sm text-gray-500 mt-1">Who should I sell to?</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total Leads</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Qualified</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.qualified}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">In Sequence</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.inSequence}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Ghosted</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{stats.ghosted}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
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
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Filter className="h-3.5 w-3.5" /> Filter</button>
          <button onClick={() => { setShowResearch(true); setResearchResult(null); }} className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"><Bot className="h-3.5 w-3.5" /> Research New Leads</button>
          <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33]"><Plus className="h-3.5 w-3.5" /> Import Leads</button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Lead ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Country</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">VP</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">State</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Score</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Last Touch</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => {
              const sc = stateColors[lead.state] || stateColors.NEW;
              return (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedLead(lead.id)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-600">{lead.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{lead.company}</span>
                      {!lead.enriched && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">NEW</span>}
                    </div>
                    {lead.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {lead.tags.map((tag, ti) => (
                          <span key={ti} className="text-[10px] text-gray-400">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{lead.country}</td>
                  <td className="px-4 py-3">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold", tierColors[lead.tier])}>{lead.tier}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{lead.vp}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                      {lead.state.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.score > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-gray-100">
                          <div className={cn("h-1.5 rounded-full", lead.score >= 85 ? "bg-green-500" : lead.score >= 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${lead.score}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-600">{lead.score}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{lead.lastTouch}</td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Lead Detail Drawer (slide-in) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedLead(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[420px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">Lead Details</h3>
              <button onClick={() => setSelectedLead(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Company info */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4A3520] text-white font-bold text-lg">{selected.company.charAt(0)}</div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">{selected.company}</p>
                    <p className="text-xs text-gray-500">{selected.id} · {selected.city}, {selected.country}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold", tierColors[selected.tier])}>Tier {selected.tier}</span>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", stateColors[selected.state].bg, stateColors[selected.state].text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", stateColors[selected.state].dot)} />
                    {selected.state.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-gray-400">VP: {selected.vp}</span>
                  <span className="text-xs text-gray-400">Lang: {selected.language}</span>
                </div>
              </div>

              {/* AI Score */}
              {selected.score > 0 && (
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">AI Match Score</span>
                    <span className="text-2xl font-bold text-gray-900">{selected.score}<span className="text-sm text-gray-400">/100</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200">
                    <div className={cn("h-2 rounded-full", selected.score >= 85 ? "bg-green-500" : selected.score >= 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${selected.score}%` }} />
                  </div>
                </div>
              )}

              {/* Tags */}
              {selected.tags.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((tag, i) => (
                      <span key={i} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Insight */}
              {selected.enriched && (
                <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
                    <span className="text-xs font-semibold text-indigo-600">AI INSIGHT</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {selected.tier === "S"
                      ? "Premium buyer with high volume potential. Recommend VP1 approach — lead with specialty Yirgacheffe lots and EUDR compliance."
                      : selected.tier === "A"
                      ? "Strong buyer. Recommend VP2 approach — lead with Guji/Sidamo washed lots and competitive FOB pricing."
                      : "Standard buyer. Recommend VP3 approach — lead with value-oriented Sidamo and Limu lots."}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.state === "NEW" && (
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4A3520] py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
                    <Sparkles className="h-4 w-4" /> Enrich with AI
                  </button>
                )}
                {selected.state === "ENRICHED" && (
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4A3520] py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
                    <Send className="h-4 w-4" /> Start Outreach Sequence
                  </button>
                )}
                {selected.state === "GHOSTED" && (
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    <Mail className="h-4 w-4" /> Send Breakup Email
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

      {/* Lead Research Modal */}
      {showResearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => !researching && setShowResearch(false)}>
          <div className="w-[480px] rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                  <Bot className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Agent 2 — Lead Research</h3>
                  <p className="text-xs text-gray-500">Generates & enriches new buyer leads automatically</p>
                </div>
              </div>
              {!researching && <button onClick={() => setShowResearch(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>}
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Target Country</label>
                <input
                  type="text"
                  list="country-suggestions"
                  value={researchCountry}
                  onChange={(e) => setResearchCountry(e.target.value)}
                  disabled={researching}
                  placeholder="Type any country (e.g. Germany, Japan, Brazil…)"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10"
                />
                <datalist id="country-suggestions">
                  <option value="Germany" /><option value="United Kingdom" /><option value="USA" /><option value="Japan" /><option value="Italy" /><option value="France" /><option value="Belgium" /><option value="Sweden" /><option value="South Korea" /><option value="Netherlands" /><option value="Spain" /><option value="Switzerland" /><option value="Austria" /><option value="Denmark" /><option value="Norway" /><option value="Finland" /><option value="Australia" /><option value="Canada" /><option value="Brazil" /><option value="China" /><option value="India" /><option value="Russia" /><option value="Taiwan" /><option value="Singapore" /><option value="United Arab Emirates" /><option value="Saudi Arabia" /><option value="South Africa" /><option value="Ireland" /><option value="Poland" /><option value="Czech Republic" /><option value="Greece" /><option value="Portugal" /><option value="Mexico" /><option value="Argentina" /><option value="Chile" /><option value="Colombia" /><option value="Turkey" /><option value="Israel" /><option value="Thailand" /><option value="Malaysia" /><option value="Philippines" /><option value="Indonesia" /><option value="Vietnam" /><option value="Hong Kong" /><option value="New Zealand" /><option value="Egypt" /><option value="Nigeria" /><option value="Kenya" /><option value="Ethiopia" /><option value="Iceland" /><option value="Croatia" /><option value="Hungary" /><option value="Romania" /><option value="Bulgaria" /><option value="Serbia" /><option value="Ukraine" /><option value="Qatar" /><option value="Kuwait" /><option value="Oman" /><option value="Bahrain" /><option value="Lebanon" /><option value="Jordan" /><option value="Morocco" /><option value="Algeria" /><option value="Tunisia" /><option value="Peru" /><option value="Ecuador" /><option value="Uruguay" /><option value="Paraguay" /><option value="Bolivia" /><option value="Venezuela" /><option value="Dominican Republic" /><option value="Guatemala" /><option value="Honduras" /><option value="Costa Rica" /><option value="Panama" />
                </datalist>
                <p className="text-[11px] text-gray-400 mt-1">Type any country name — suggestions appear as you type. Agent 2 will detect the language and assign cities automatically.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Buyer Segment</label>
                <select value={researchSegment} onChange={(e) => setResearchSegment(e.target.value)} disabled={researching} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10">
                  <option>Specialty Importer</option><option>Commercial Importer</option><option>Roaster</option><option>Distributor</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">How Many Leads?</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={20} value={researchCount} onChange={(e) => setResearchCount(parseInt(e.target.value))} disabled={researching} className="flex-1 accent-[#4A3520]" />
                  <span className="text-sm font-bold text-gray-900 w-8 text-right">{researchCount}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Agent 2 will generate {researchCount} lead{researchCount > 1 ? "s" : ""}, enrich each with tier/VP/language, create contacts, and publish events.</p>
              </div>
              {researchResult && (
                <div className={cn("rounded-lg p-3 text-sm", researchResult.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>{researchResult}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowResearch(false)} disabled={researching} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">Close</button>
                <button onClick={handleResearch} disabled={researching} className="flex items-center gap-2 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60">
                  {researching ? (<><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Researching…</>) : (<><Sparkles className="h-4 w-4" /> Start Research</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

