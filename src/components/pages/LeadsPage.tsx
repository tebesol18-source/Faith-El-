"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BadgeCheck, ChevronRight, ExternalLink, Filter, Mail, Plus, Send, ShieldCheck,
  ShieldAlert, UserPlus, X as XIcon, Search, RefreshCw, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-client";

// ─── Types ──────────────────────────────────────────────────────────────────

type Lead = {
  id: string;
  company: string;
  country: string | null;
  city: string | null;
  tier: string | null;
  vp: string | null;
  vpLabel: string | null;
  state: string;
  language: string;
  languageFlag: string;
  score: number;
  lastTouch: string;
  tags: string[];
  enriched: boolean;
  website?: string | null;
  verificationStatus?: string;
  verifiedBy?: string | null;
  verifiedTs?: string | null;
  evidenceCount?: number;
  contactCount?: number;
  verifiedContactCount?: number;
  primaryContact?: { name: string | null; title: string | null; email: string | null; phone: string | null } | null;
};

type DirectoryEntry = {
  key: string;
  company: string;
  country: string;
  city: string;
  segment: string;
  website: string;
  productInterest: string;
  sources: { type: string; url: string; name: string }[];
};

type EvidenceBundle = {
  lead: any;
  sources: any[];
  contacts: any[];
  log: any[];
};

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

function VerificationBadge({ lead, size = "sm" }: { lead: Lead; size?: "sm" | "xs" }) {
  const s = lead.verificationStatus || "unverified";
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  if (s === "verified") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded font-semibold bg-green-50 text-green-700", cls)}>
        <BadgeCheck className="h-3 w-3" /> VERIFIED
      </span>
    );
  }
  if (s === "rejected") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded font-semibold bg-red-50 text-red-600", cls)}>
        <Ban className="h-3 w-3" /> REJECTED
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded font-semibold bg-amber-50 text-amber-600", cls)}>
      <ShieldAlert className="h-3 w-3" /> UNVERIFIED
    </span>
  );
}

export function LeadsPage() {
  const [filter, setFilter] = useState("All");
  const [selectedLead, setSelectedLead] = useState<string | null>(null);

  // ─── Directory (real-company intake) modal state ───
  const [showDirectory, setShowDirectory] = useState(false);
  const [dirCountry, setDirCountry] = useState("");
  const [dirSegment, setDirSegment] = useState("");
  const [dirQuery, setDirQuery] = useState("");
  const [dirEntries, setDirEntries] = useState<DirectoryEntry[] | null>(null);
  const [dirMeta, setDirMeta] = useState<{ compiled: string; disclaimer: string; noContactsByDesign: boolean } | null>(null);
  const [dirSelected, setDirSelected] = useState<Set<string>>(new Set());
  const [dirLoading, setDirLoading] = useState(false);
  const [dirResult, setDirResult] = useState<string | null>(null);

  // ─── CSV import (evidence-required) ───
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // ─── Leads list ───
  const [leadsData, setLeadsData] = useState<Lead[] | null>(null);

  // ─── Evidence drawer state ───
  const [evidence, setEvidence] = useState<EvidenceBundle | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState<string | null>(null);
  const [evidenceMsg, setEvidenceMsg] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", title: "", email: "", sourceUrl: "", note: "" });

  const refetchLeads = useCallback(() => {
    apiFetch("/api/leads")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => setLeadsData(Array.isArray(data.leads) ? data.leads : []))
      .catch(() => setLeadsData([]));
  }, []);

  const refetchEvidence = useCallback((leadId: string) => {
    apiFetch(`/api/leads/${leadId}/evidence`)
      .then((r) => r.json())
      .then((data) => setEvidence(data.ok ? { lead: data.lead, sources: data.sources, contacts: data.contacts, log: data.log } : null))
      .catch(() => setEvidence(null));
  }, []);

  useEffect(() => { refetchLeads(); }, [refetchLeads]);
  useEffect(() => {
    if (selectedLead) { refetchEvidence(selectedLead); setEvidenceMsg(null); setShowAddContact(false); }
    else { setEvidence(null); setEvidenceMsg(null); }
  }, [selectedLead, refetchEvidence]);

  // ─── Directory browse ───
  const fetchDirectory = useCallback(() => {
    setDirLoading(true);
    const params = new URLSearchParams();
    if (dirCountry) params.set("country", dirCountry);
    if (dirSegment) params.set("segment", dirSegment);
    if (dirQuery) params.set("q", dirQuery);
    apiFetch(`/api/agents/research-leads?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setDirEntries(data.entries);
          setDirMeta({ compiled: data.meta.compiled, disclaimer: data.meta.disclaimer, noContactsByDesign: data.meta.noContactsByDesign });
        } else setDirEntries([]);
      })
      .catch(() => setDirEntries([]))
      .finally(() => setDirLoading(false));
  }, [dirCountry, dirSegment, dirQuery]);

  useEffect(() => {
    if (showDirectory) fetchDirectory();
  }, [showDirectory, fetchDirectory]);

  const importSelected = () => {
    if (dirSelected.size === 0) return;
    setDirLoading(true);
    setDirResult(null);
    apiFetch("/api/agents/research-leads", {
      method: "POST",
      body: JSON.stringify({ directoryKeys: Array.from(dirSelected) }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          const skipped = (data.skipped || []).map((s: any) => `${s.company}: ${s.reason}`).join("; ");
          setDirResult(`Imported ${data.created} unverified lead(s) with evidence attached.` + (skipped ? ` Skipped: ${skipped}` : ""));
          setDirSelected(new Set());
          refetchLeads();
        } else setDirResult(`Import failed: ${data.error}`);
      })
      .catch((err) => setDirResult(`Import failed: ${err.message}`))
      .finally(() => setDirLoading(false));
  };

  // ─── CSV import ───
  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) { setImportResult("CSV must have a header row + at least one data row."); return; }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
      const leads = lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = values[i] || ""; });
        return obj;
      });
      setImporting(true);
      setImportResult(null);
      try {
        const res = await apiFetch("/api/leads/import", { method: "POST", body: JSON.stringify({ leads }) });
        const data = await res.json();
        if (data.ok) {
          setImportResult(
            `Imported ${data.created} lead(s). ` +
            (data.totalErrors ? `${data.totalErrors} row(s) rejected: ${data.errors?.slice(0, 3).join(" | ")}` : "") +
            (data.skipped?.length ? ` Skipped (duplicates): ${data.skipped.length}` : "")
          );
          refetchLeads();
        } else setImportResult(`Import failed: ${data.error || "unknown error"}`);
      } catch (err: any) {
        setImportResult(`Import failed: ${err.message}`);
      } finally { setImporting(false); }
    };
    reader.readAsText(file);
  };

  // ─── Verification actions ───
  const verifyAction = (action: string, opts: { level?: string; contactId?: number; reason?: string } = {}) => {
    if (!selectedLead) return;
    setEvidenceBusy(action + (opts.contactId ?? ""));
    setEvidenceMsg(null);
    apiFetch(`/api/leads/${selectedLead}/verify`, {
      method: "POST",
      body: JSON.stringify({ action, level: opts.level || "company", contactId: opts.contactId, reason: opts.reason }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          if (action === "check") {
            const lines = (data.results || []).map((r: any) => `${r.status}: ${r.url}`).join("\n");
            setEvidenceMsg(`Reachability check complete — advisory evidence:\n${lines}`);
          } else {
            setEvidenceMsg(action === "confirm" ? "Marked verified." : action === "reject" ? "Marked rejected." : "Reset to unverified.");
          }
          refetchEvidence(selectedLead);
          refetchLeads();
        } else setEvidenceMsg(`Failed: ${data.error}`);
      })
      .catch((err) => setEvidenceMsg(`Failed: ${err.message}`))
      .finally(() => setEvidenceBusy(null));
  };

  const addContact = () => {
    if (!selectedLead) return;
    setEvidenceBusy("addContact");
    setEvidenceMsg(null);
    apiFetch(`/api/leads/${selectedLead}/contacts`, {
      method: "POST",
      body: JSON.stringify({
        name: newContact.name,
        title: newContact.title,
        email: newContact.email,
        sourceUrl: newContact.sourceUrl,
        note: newContact.note,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setEvidenceMsg("Contact added as UNVERIFIED — verify it once you've confirmed the source.");
          setNewContact({ name: "", title: "", email: "", sourceUrl: "", note: "" });
          setShowAddContact(false);
          refetchEvidence(selectedLead);
          refetchLeads();
        } else setEvidenceMsg(`Failed: ${data.error}`);
      })
      .catch((err) => setEvidenceMsg(`Failed: ${err.message}`))
      .finally(() => setEvidenceBusy(null));
  };

  const classifyLead = (lead: Lead) => {
    apiFetch("/api/agents/research-leads", {
      method: "POST",
      body: JSON.stringify({ enrichLeadId: lead.id, segment: lead.tier === "S" ? "Specialty Importer" : "Roaster" }),
    })
      .then((r) => r.json())
      .then((data) => { if (data.ok) { setSelectedLead(null); refetchLeads(); } })
      .catch(() => {});
  };

  const advanceLead = (lead: Lead) => {
    apiFetch(`/api/leads/${lead.id}/advance`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) { setSelectedLead(null); refetchLeads(); }
        else setEvidenceMsg(`Cannot advance: ${data.error}`);
      })
      .catch(() => {});
  };

  const filters = ["All", "New", "Enriched", "In Sequence", "Qualified", "Ghosted"];

  if (!leadsData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">Who should I sell to?</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading leads from database…</p>
        </div>
      </main>
    );
  }

  const filteredLeads = filter === "All"
    ? leadsData
    : leadsData.filter((l) => l.state.replace(/_/g, " ").toLowerCase() === filter.toLowerCase());
  const selected = leadsData.find((l) => l.id === selectedLead);
  const stats = {
    total: leadsData.length,
    verified: leadsData.filter((l) => l.verificationStatus === "verified").length,
    qualified: leadsData.filter((l) => l.state === "QUALIFIED").length,
    inSequence: leadsData.filter((l) => l.state === "IN_SEQUENCE").length,
  };

  const inputCls = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10";
  const btnPrimary = "rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60";
  const btnGhost = "rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50";

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Leads</h1>
        <p className="text-sm text-gray-500 mt-1">Real buyers only — every lead carries evidence and a verification state.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total Leads</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50/40 p-4">
          <p className="text-xs font-medium text-green-700">Verified Companies</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{stats.verified}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">In Sequence</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.inSequence}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Qualified</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.qualified}</p>
        </div>
      </div>

      {/* Filter tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex gap-1 flex-wrap">
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
          <button className={cn(btnGhost, "flex items-center gap-1.5")}><Filter className="h-3.5 w-3.5" /> Filter</button>
          <button
            onClick={() => { setShowDirectory(true); setDirResult(null); }}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <Search className="h-3.5 w-3.5" /> Browse Lead Directory
          </button>
          <input type="file" accept=".csv,text/csv" ref={fileInputRef} className="hidden" onChange={handleCSVFile} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={cn(btnPrimary, "flex items-center gap-1.5 px-3 py-1.5 text-xs")}
          >
            <Plus className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Import CSV (source_url required)"}
          </button>
        </div>
      </div>
      {importResult && (
        <div className="mb-4 rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-700 whitespace-pre-wrap">{importResult}</div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Lead ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Country</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Verification</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">State</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Score</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Last Touch</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                  No leads yet. Use <span className="font-medium text-gray-600">Browse Lead Directory</span> to import real,
                  verifiable coffee buyers — every import starts unverified with its evidence attached.
                </td>
              </tr>
            )}
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
                    {lead.tier ? (
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold", tierColors[lead.tier])}>{lead.tier}</span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><VerificationBadge lead={lead} /></td>
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
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{lead.lastTouch}</td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Lead Detail Drawer ─── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedLead(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[480px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 sticky top-0 bg-white z-10">
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
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {selected.tier && <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold", tierColors[selected.tier])}>{selected.tier}</span>}
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", stateColors[selected.state].bg, stateColors[selected.state].text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", stateColors[selected.state].dot)} />
                    {selected.state.replace(/_/g, " ")}
                  </span>
                  <VerificationBadge lead={selected} />
                  {selected.website && (
                    <a href={selected.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                      <ExternalLink className="h-3 w-3" /> website
                    </a>
                  )}
                </div>
              </div>

              {/* Verification & Evidence panel */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50/70 px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[#4A3520]" strokeWidth={1.5} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Verification & Evidence</span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {selected.evidenceCount ?? 0} source{(selected.evidenceCount ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {/* Status line */}
                  {selected.verificationStatus === "verified" ? (
                    <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      Company verified{selected.verifiedBy ? ` by ${selected.verifiedBy}` : ""}.
                    </p>
                  ) : selected.verificationStatus === "rejected" ? (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">Rejected — this lead can never enter outreach.</p>
                  ) : (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                      Unverified. Inspect the evidence below (open each source), run a reachability check, then confirm —
                      or reject if the company doesn&apos;t check out.
                    </p>
                  )}

                  {/* Evidence rows */}
                  {(evidence?.sources ?? []).length === 0 && (
                    <p className="text-xs text-gray-400">No evidence recorded for this lead.</p>
                  )}
                  {(evidence?.sources ?? []).map((src) => (
                    <div key={src.id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{src.source_type}</span>
                        <span className={cn(
                          "text-[10px] font-semibold rounded px-1.5 py-0.5",
                          src.last_check_status === "reachable" ? "bg-green-50 text-green-700"
                          : src.last_check_status ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-400"
                        )}>
                          {src.last_check_status ? `check: ${src.last_check_status}` : "not checked yet"}
                        </span>
                      </div>
                      {src.source_url && (
                        <a href={src.source_url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-indigo-600 hover:underline break-all">
                          <ExternalLink className="h-3 w-3 shrink-0" /> {src.source_url}
                        </a>
                      )}
                      {src.product_interest && <p className="mt-1 text-xs text-gray-600">{src.product_interest}</p>}
                      <p className="mt-1 text-[10px] text-gray-400">checked {String(src.checked_ts || "").slice(0, 10)} · for: {src.evidence_for}</p>
                      {src.note && <p className="mt-1 text-[10px] text-gray-400 italic">{src.note}</p>}
                    </div>
                  ))}

                  {/* Contacts */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Contacts ({selected.verifiedContactCount ?? 0} verified / {selected.contactCount ?? 0})
                      </span>
                      <button onClick={() => setShowAddContact(!showAddContact)} className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline">
                        <UserPlus className="h-3 w-3" /> add contact
                      </button>
                    </div>
                    {(evidence?.contacts ?? []).length === 0 && (
                      <p className="text-xs text-gray-400">
                        No contacts yet. Directory entries ship without contacts on purpose — find a real person
                        (team page, directory, article) and add them with the source URL.
                      </p>
                    )}
                    {(evidence?.contacts ?? []).map((c) => (
                      <div key={c.id} className="rounded-lg border border-gray-100 p-3 mb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{c.name} {c.is_primary ? <span className="text-[10px] text-gray-400">(primary)</span> : null}</p>
                            <p className="text-xs text-gray-500">{c.title || "—"} · {c.email || "no email"}</p>
                          </div>
                          <span className={cn(
                            "text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0",
                            c.verification_status === "verified" ? "bg-green-50 text-green-700"
                            : c.verification_status === "rejected" ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-600"
                          )}>
                            {c.verification_status}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {c.verification_status !== "verified" && (
                            <button
                              onClick={() => verifyAction("confirm", { level: "contact", contactId: c.id })}
                              disabled={evidenceBusy !== null}
                              className="text-[11px] font-medium text-green-700 hover:bg-green-50 rounded px-2 py-1 disabled:opacity-50"
                            >
                              Verify contact
                            </button>
                          )}
                          {c.verification_status === "verified" && (
                            <button
                              onClick={() => verifyAction("reset", { level: "contact", contactId: c.id })}
                              disabled={evidenceBusy !== null}
                              className="text-[11px] font-medium text-gray-500 hover:bg-gray-50 rounded px-2 py-1 disabled:opacity-50"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add-contact form */}
                    {showAddContact && (
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2 mt-2">
                        <input className={inputCls} placeholder="Full name (required)" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                        <input className={inputCls} placeholder="Title (e.g. Head of Green Coffee)" value={newContact.title} onChange={(e) => setNewContact({ ...newContact, title: e.target.value })} />
                        <input className={inputCls} placeholder="Email (must be a real address — test domains are rejected)" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                        <input className={inputCls} placeholder="Source URL — where you found this person (required, or note below)" value={newContact.sourceUrl} onChange={(e) => setNewContact({ ...newContact, sourceUrl: e.target.value })} />
                        <input className={inputCls} placeholder="Note (offline source explanation)" value={newContact.note} onChange={(e) => setNewContact({ ...newContact, note: e.target.value })} />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setShowAddContact(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                          <button onClick={addContact} disabled={evidenceBusy !== null || !newContact.name.trim()} className={cn(btnPrimary, "px-3 py-1.5 text-xs")}>
                            {evidenceBusy === "addContact" ? "Adding…" : "Add Contact"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Company verification actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => verifyAction("check")}
                      disabled={evidenceBusy !== null}
                      className={cn(btnGhost, "flex items-center gap-1.5")}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", evidenceBusy === "check" && "animate-spin")} /> Run Reachability Check
                    </button>
                    {selected.verificationStatus !== "verified" && (
                      <button
                        onClick={() => verifyAction("confirm")}
                        disabled={evidenceBusy !== null || (selected.evidenceCount ?? 0) === 0}
                        className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <BadgeCheck className="h-3.5 w-3.5" /> Mark Company Verified
                      </button>
                    )}
                    {selected.verificationStatus !== "rejected" && (
                      <button
                        onClick={() => { const r = window.prompt("Reason for rejection (recorded in the audit log):"); if (r !== null) verifyAction("reject", { reason: r }); }}
                        disabled={evidenceBusy !== null}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Ban className="h-3.5 w-3.5" /> Reject Lead
                      </button>
                    )}
                    {selected.verificationStatus === "verified" && (
                      <button onClick={() => verifyAction("reset")} disabled={evidenceBusy !== null} className={btnGhost}>Reset verification</button>
                    )}
                  </div>

                  {evidenceMsg && (
                    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-700 whitespace-pre-wrap">{evidenceMsg}</div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.state === "NEW" && (
                  <button onClick={() => classifyLead(selected)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4A3520] py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
                    Classify Lead (Tier / VP / Language)
                  </button>
                )}
                {selected.state === "ENRICHED" && (
                  <div>
                    <button
                      onClick={() => advanceLead(selected)}
                      disabled={selected.verificationStatus !== "verified" || (selected.verifiedContactCount ?? 0) === 0}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4A3520] py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Send className="h-4 w-4" /> Start Outreach Sequence
                    </button>
                    {(selected.verificationStatus !== "verified" || (selected.verifiedContactCount ?? 0) === 0) && (
                      <p className="mt-1.5 text-[11px] text-gray-400 text-center">
                        Outreach is locked until the company is verified AND at least one contact is verified.
                      </p>
                    )}
                  </div>
                )}
                {selected.state === "GHOSTED" && (
                  <button onClick={() => advanceLead(selected)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    <Mail className="h-4 w-4" /> Re-engage
                  </button>
                )}
              </div>

              {/* Verification audit trail */}
              {(evidence?.log ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Verification Log</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(evidence?.log ?? []).map((entry) => (
                      <div key={entry.id} className="text-[11px] text-gray-500 flex gap-2">
                        <span className="text-gray-400 shrink-0">{String(entry.created_ts).replace("T", " ").slice(0, 16)}</span>
                        <span className="font-medium text-gray-600">{entry.action}</span>
                        <span>{entry.level}{entry.contact_id ? `#${entry.contact_id}` : ""}</span>
                        <span className="text-gray-400 truncate">{entry.actor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Lead Directory modal (real-company intake) ─── */}
      {showDirectory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={() => !dirLoading && setShowDirectory(false)}>
          <div className="w-full max-w-3xl max-h-[85vh] rounded-xl bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                  <Search className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Lead Directory — Real Companies</h3>
                  <p className="text-xs text-gray-500">
                    Curated public companies in the green-coffee trade{dirMeta ? ` · compiled ${String(dirMeta.compiled)}` : ""}
                  </p>
                </div>
              </div>
              {!dirLoading && <button onClick={() => setShowDirectory(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>}
            </div>

            {/* Filters */}
            <div className="px-6 py-3 border-b border-gray-100 flex gap-2">
              <input className={inputCls} placeholder="Search company / country / city…" value={dirQuery} onChange={(e) => setDirQuery(e.target.value)} />
              <select className={cn(inputCls, "w-44 shrink-0")} value={dirCountry} onChange={(e) => setDirCountry(e.target.value)}>
                <option value="">All countries</option>
                {["Germany", "Switzerland", "Netherlands", "Belgium", "United Kingdom", "France", "Italy", "Spain", "Austria", "Sweden", "Norway", "Denmark", "USA", "Canada", "Japan", "South Korea", "Australia", "Singapore", "United Arab Emirates"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select className={cn(inputCls, "w-48 shrink-0")} value={dirSegment} onChange={(e) => setDirSegment(e.target.value)}>
                <option value="">All segments</option>
                <option>Specialty Importer</option>
                <option>Commercial Importer</option>
                <option>Roaster</option>
                <option>Distributor</option>
              </select>
            </div>

            {/* Disclaimer */}
            <div className="px-6 py-2 bg-amber-50/60 border-b border-amber-100">
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Every entry imports as <span className="font-semibold">UNVERIFIED</span> with its source URL as evidence. No contacts are
                included — find real people yourself and add them with evidence. Details may be stale; verification is your job.
              </p>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {dirLoading && <p className="text-sm text-gray-400 text-center py-8">Loading directory…</p>}
              {!dirLoading && dirEntries?.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No entries match these filters.</p>
              )}
              {!dirLoading && (dirEntries ?? []).map((e) => {
                const isSelected = dirSelected.has(e.key);
                return (
                  <label
                    key={e.key}
                    className={cn(
                      "flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      isSelected ? "border-indigo-300 bg-indigo-50/50" : "border-gray-100 hover:bg-gray-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const next = new Set(dirSelected);
                        if (isSelected) next.delete(e.key); else next.add(e.key);
                        setDirSelected(next);
                      }}
                      className="mt-1 accent-[#4A3520]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{e.company}</span>
                        <span className="text-[10px] font-semibold rounded bg-gray-100 text-gray-500 px-1.5 py-0.5">{e.segment}</span>
                        <span className="text-xs text-gray-400">{e.city}, {e.country}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{e.productInterest}</p>
                      <div className="mt-1 flex gap-2 items-center flex-wrap">
                        {e.sources.map((s, i) => (
                          <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline" onClick={(ev) => ev.stopPropagation()}>
                            <ExternalLink className="h-3 w-3" /> {s.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-4 space-y-2">
              {dirResult && (
                <div className={cn("rounded-lg p-3 text-xs whitespace-pre-wrap", dirResult.startsWith("Imported") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>{dirResult}</div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{dirSelected.size} selected</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDirectory(false)} disabled={dirLoading} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Close</button>
                  <button onClick={importSelected} disabled={dirLoading || dirSelected.size === 0} className={btnPrimary + " flex items-center gap-2 disabled:opacity-50"}>
                    {dirLoading ? "Importing…" : `Import ${dirSelected.size} as Unverified Leads`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
