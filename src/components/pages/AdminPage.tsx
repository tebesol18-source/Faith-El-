"use client";

import { useState, useEffect } from "react";
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2, Clock, Coffee, DollarSign, LayoutDashboard, LogOut, RefreshCw, Send, Server, ShieldCheck, TrendingUp, Users, X as XIcon,
  Plus, UserPlus, Trash2, KeyRound, Power, MoreVertical, Check, X,
  History, Globe, Monitor, LogOut as LogOutIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIAgent, ApprovalItem, AuditEntry, Contract, Operator, OperatorRole, Page, Quote, Seller, SellerDeal, SellerRisk, Shipment } from "@/lib/types";
import { getCsrfToken } from "@/lib/auth-client";




const sellersData: Seller[] = [];

const sellerRiskConfig: Record<SellerRisk, { label: string; bg: string; text: string; dot: string; border: string }> = {
  healthy: { label: "Healthy", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", border: "border-green-200" },
  warning: { label: "Warning", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", border: "border-amber-200" },
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", border: "border-red-200" },
};

const sellerDealsData: Record<string, SellerDeal[]> = {};






const mockOperatorsData: Operator[] = [
  { id: "OP-001", name: "Abi Solomon", email: "abi@faithel.com", role: "admin", status: "active", lastActive: "2 min ago", actionsToday: 47 },
  { id: "OP-002", name: "Sara Bekele", email: "sara@faithel.com", role: "manager", status: "active", lastActive: "1h ago", actionsToday: 23 },
  { id: "OP-003", name: "Dawit Tadesse", email: "dawit@faithel.com", role: "operator", status: "active", lastActive: "3h ago", actionsToday: 12 },
  { id: "OP-004", name: "Helen Girma", email: "helen@faithel.com", role: "operator", status: "active", lastActive: "Yesterday", actionsToday: 0 },
  { id: "OP-005", name: "Marcus Bauer", email: "marcus@external.com", role: "viewer", status: "active", lastActive: "2 days ago", actionsToday: 0 },
  { id: "OP-006", name: "Yuki Hashimoto", email: "yuki@external.com", role: "viewer", status: "disabled", lastActive: "2 weeks ago", actionsToday: 0 },
];

const mockAiAgentsData: AIAgent[] = [
  { id: "AGT-SUP", name: "Supplier Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Identified LOT-25-0007 for Hashimoto counter", lastActionTime: "Yesterday", actionsToday: 8, approvalsWaiting: 0 },
  { id: "AGT-OUT", name: "Outreach Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Drafted Quote QU-2026-0007 for Aurora", lastActionTime: "2h ago", actionsToday: 12, approvalsWaiting: 1 },
  { id: "AGT-CUS", name: "Customer Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Drafted breakup email for Nordic Bean", lastActionTime: "2 days ago", actionsToday: 4, approvalsWaiting: 1 },
  { id: "AGT-SMP", name: "Sample Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Tracked SR-2026-0003 dispatch", lastActionTime: "Yesterday", actionsToday: 3, approvalsWaiting: 0 },
  { id: "AGT-CMP", name: "Compliance Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Flagged phytosanitary expiry CT-2026-001", lastActionTime: "5h ago", actionsToday: 6, approvalsWaiting: 0 },
  { id: "AGT-LOG", name: "Logistics Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Tracked MSC Hamburg through Suez", lastActionTime: "Yesterday", actionsToday: 9, approvalsWaiting: 0 },
  { id: "AGT-CRM", name: "Customer Insights Agent", model: "Llama 3.3 70B", status: "idle", lastAction: "Generated weekly buyer insights report", lastActionTime: "3 days ago", actionsToday: 1, approvalsWaiting: 0 },
];

const mockApprovalsData: ApprovalItem[] = [
  { id: "APR-0042", agent: "Outreach Agent", action: "Send quote to Aurora Imports", target: "QU-2026-0007", submittedAt: "1h ago", riskLevel: "medium", detail: "First-time buyer, no transaction history. Quote value $22,500. Margin 21.3%." },
  { id: "APR-0041", agent: "Customer Agent", action: "Send breakup email to Nordic Bean Co", target: "QU-2026-0001", submittedAt: "2 days ago", riskLevel: "low", detail: "Quote expired 15 days ago. Standard re-engagement email." },
  { id: "APR-0040", agent: "Outreach Agent", action: "Add 4 new leads from research batch", target: "L-2026-00510 to L-2026-00513", submittedAt: "3 days ago", riskLevel: "low", detail: "4 German specialty roasters identified with annual imports >5t." },
];

const mockAuditData: AuditEntry[] = [
  { id: "AUD-9821", timestamp: "10:42 AM", actor: "Abi Solomon", actorType: "operator", action: "Approved quote V2", entityType: "Quote", entityId: "QU-2026-0004" },
  { id: "AUD-9820", timestamp: "10:15 AM", actor: "Compliance Agent", actorType: "agent", action: "Created alert", entityType: "Shipment", entityId: "CT-2026-001" },
  { id: "AUD-9819", timestamp: "09:48 AM", actor: "Outreach Agent", actorType: "agent", action: "Drafted quote", entityType: "Quote", entityId: "QU-2026-0007" },
  { id: "AUD-9818", timestamp: "09:22 AM", actor: "Sara Bekele", actorType: "operator", action: "Updated lot", entityType: "Inventory", entityId: "LOT-25-0007" },
  { id: "AUD-9817", timestamp: "Yesterday 18:34", actor: "Logistics Agent", actorType: "agent", action: "Updated milestone", entityType: "Shipment", entityId: "CT-2026-001" },
  { id: "AUD-9816", timestamp: "Yesterday 16:12", actor: "Abi Solomon", actorType: "operator", action: "Signed contract", entityType: "Contract", entityId: "CT-2026-0003" },
];

const operatorRoleConfig: Record<OperatorRole, { label: string; bg: string; text: string }> = {
  admin: { label: "Admin", bg: "bg-[#4A3520]", text: "text-white" },
  manager: { label: "Manager", bg: "bg-indigo-50", text: "text-indigo-700" },
  operator: { label: "Operator", bg: "bg-blue-50", text: "text-blue-700" },
  viewer: { label: "Viewer", bg: "bg-gray-100", text: "text-gray-600" },
};

export function AdminPage({ onLogout }: { onLogout: () => void; onNavigate: (p: Page) => void }) {
  const [activeTab, setActiveTab] = useState<"portfolio" | "sellers" | "commission" | "risk" | "system" | "analytics">("portfolio");
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);

  // ─── System tab data (fetched from backend) ───
  const [operatorsData, setOperatorsData] = useState<Operator[] | null>(null);
  const [aiAgentsData, setAiAgentsData] = useState<AIAgent[] | null>(null);
  const [approvalsData, setApprovalsData] = useState<ApprovalItem[] | null>(null);
  const [auditData, setAuditData] = useState<AuditEntry[] | null>(null);
  const [accessRequests, setAccessRequests] = useState<any[] | null>(null);
  // Phase 3: audit log + active sessions
  const [auditLog, setAuditLog] = useState<any[] | null>(null);
  const [activeSessions, setActiveSessions] = useState<any[] | null>(null);
  // Modals for Phase 2 user management
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<Operator | null>(null);
  const [editTarget, setEditTarget] = useState<Operator | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);  // operatorId or requestId being mutated
  const [actionError, setActionError] = useState<string | null>(null);

  // ─── Supervisor data (agent health + fault log) ───
  const [supervisorAgents, setSupervisorAgents] = useState<any[] | null>(null);
  const [supervisorFaults, setSupervisorFaults] = useState<any[]>([]);
  const [supervisorRunning, setSupervisorRunning] = useState(false);
  const [supervisorStats, setSupervisorStats] = useState<any>({});
  const [liveApprovals, setLiveApprovals] = useState<any[]>([]);

  const fetchSupervisor = () => {
    fetch("/api/supervisor")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok) {
          setSupervisorAgents(data.agents || []);
          setSupervisorFaults(data.faults || []);
          setSupervisorRunning(data.supervisor?.running || false);
          setSupervisorStats(data.stats || {});
        }
      })
      .catch((err) => console.warn("[AdminPage] Supervisor fetch failed:", err));
    // Also fetch pending approvals
    fetch("/api/approvals")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => { if (data.ok) setLiveApprovals(data.actions || []); })
      .catch(() => {});
  };

  // ─── Pause/Resume handlers (REAL — calls backend API) ───
  const handlePauseAgent = (agentId: string) => {
    fetch(`/api/agents/${encodeURIComponent(agentId)}/pause`, { method: "POST" })
      .then(() => fetchSupervisor()); // Refresh after pause
  };
  const handleResumeAgent = (agentId: string) => {
    fetch(`/api/agents/${encodeURIComponent(agentId)}/resume`, { method: "POST" })
      .then(() => fetchSupervisor()); // Refresh after resume
  };

  // ─── Approve/Reject handlers (REAL) ───
  const handleApprove = (actionId: number) => {
    fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: actionId, action: "approve" }) })
      .then(() => fetchSupervisor());
  };
  const handleReject = (actionId: number) => {
    fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: actionId, action: "reject" }) })
      .then(() => fetchSupervisor());
  };

  useEffect(() => {
    fetchSupervisor();
    const interval = setInterval(fetchSupervisor, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, []);

  // Reusable admin-data fetcher — called on mount + after every mutation
  const refreshAdminData = () => {
    fetch("/api/admin")
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.ok) {
          if (Array.isArray(data.operators) && data.operators.length > 0) {
            setOperatorsData(data.operators);
          } else {
            setOperatorsData([]);
          }
          if (Array.isArray(data.agents) && data.agents.length > 0) {
            setAiAgentsData(data.agents);
          } else {
            setAiAgentsData([]);
          }
          setApprovalsData(Array.isArray(data.approvals) ? data.approvals : []);
          if (Array.isArray(data.audit) && data.audit.length > 0) {
            setAuditData(data.audit);
          } else {
            setAuditData([]);
          }
          // Pending access requests from the login "Request Access" form
          setAccessRequests(Array.isArray(data.accessRequests) ? data.accessRequests : []);
        } else {
          setOperatorsData([]);
          setAiAgentsData([]);
          setApprovalsData([]);
          setAuditData([]);
          setAccessRequests([]);
        }
      })
      .catch((err) => {
        console.warn("[AdminPage] API fetch failed, using mock data:", err);
        setOperatorsData([]);
        setAiAgentsData([]);
        setApprovalsData([]);
        setAuditData([]);
        setAccessRequests([]);
      });

    // Phase 3: fetch audit log + active sessions in parallel
    fetch("/api/admin/audit-log?limit=50", {
      headers: { "x-csrf-token": getCsrfToken() || "" },
    })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setAuditLog(d.entries || []); })
      .catch(() => {});

    fetch("/api/admin/sessions", {
      headers: { "x-csrf-token": getCsrfToken() || "" },
    })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setActiveSessions(d.sessions || []); })
      .catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    // Wrap so the cancellation flag is honored
    const orig = refreshAdminData;
    refreshAdminData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Portfolio totals
  const totals = {
    sellers: sellersData.length,
    dealsClosed: sellersData.reduce((s, x) => s + x.dealsClosed, 0),
    dealsActive: sellersData.reduce((s, x) => s + x.dealsActive, 0),
    pipelineValue: sellersData.reduce((s, x) => s + x.pipelineValue, 0),
    revenueYTD: sellersData.reduce((s, x) => s + x.revenueYTD, 0),
    commissionEarned: sellersData.reduce((s, x) => s + x.commissionEarned, 0),
    commissionPending: sellersData.reduce((s, x) => s + x.commissionPending, 0),
    atRiskSellers: sellersData.filter(s => s.riskLevel === "critical").length,
    warningSellers: sellersData.filter(s => s.riskLevel === "warning").length,
    healthySellers: sellersData.filter(s => s.riskLevel === "healthy").length,
  };

  // ─── Analytics data ───
  const [analytics, setAnalytics] = useState<any>(null);

  const fetchAnalytics = () => {
    fetch("/api/analytics")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (data.ok) setAnalytics(data); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const selected = sellersData.find(s => s.id === selectedSeller);
  const selectedDeals = selectedSeller ? (sellerDealsData[selectedSeller] || []) : [];

  const tabs = [
    { id: "portfolio" as const, label: "Portfolio", icon: LayoutDashboard },
    { id: "sellers" as const, label: "Sellers", icon: Users, count: totals.sellers },
    { id: "commission" as const, label: "Commission", icon: DollarSign },
    { id: "risk" as const, label: "Risk", icon: AlertTriangle, count: totals.atRiskSellers + totals.warningSellers },
    { id: "analytics" as const, label: "Analytics", icon: TrendingUp },
    { id: "system" as const, label: "System", icon: Server },
  ];

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#4A3520] px-2 py-0.5 text-[10px] font-semibold text-white">
              <ShieldCheck className="h-2.5 w-2.5" /> Admin
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Portfolio overview — sellers, commission, and risk</p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px", activeTab === tab.id ? "border-[#4A3520] text-[#4A3520]" : "border-transparent text-gray-500 hover:text-gray-900")}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {"count" in tab && tab.count !== undefined && tab.count > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", activeTab === tab.id ? "bg-[#4A3520] text-white" : "bg-gray-100 text-gray-500")}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ PORTFOLIO TAB ═══ */}
      {activeTab === "portfolio" && (
        <div className="space-y-6">
          {/* Commission hero — the admin's main number */}
          <div className="rounded-xl border border-[#4A3520] bg-gradient-to-br from-[#4A3520] to-[#6B4E33] p-6 text-white">
            <div className="grid grid-cols-4 gap-6">
              <div>
                <p className="text-xs font-medium text-white/60">Commission Earned (YTD)</p>
                <p className="text-3xl font-bold mt-1">${totals.commissionEarned.toLocaleString()}</p>
                <p className="text-[11px] text-white/50 mt-0.5">2% of ${totals.revenueYTD.toLocaleString()} revenue</p>
              </div>
              <div className="border-l border-white/10 pl-6">
                <p className="text-xs font-medium text-white/60">Pending Commission</p>
                <p className="text-3xl font-bold mt-1 text-amber-300">${totals.commissionPending.toLocaleString()}</p>
                <p className="text-[11px] text-white/50 mt-0.5">from {totals.dealsActive} active deals</p>
              </div>
              <div className="border-l border-white/10 pl-6">
                <p className="text-xs font-medium text-white/60">Total Pipeline</p>
                <p className="text-3xl font-bold mt-1">${(totals.pipelineValue / 1000).toFixed(0)}K</p>
                <p className="text-[11px] text-white/50 mt-0.5">{totals.dealsClosed + totals.dealsActive} deals total</p>
              </div>
              <div className="border-l border-white/10 pl-6">
                <p className="text-xs font-medium text-white/60">At-Risk Sellers</p>
                <p className="text-3xl font-bold mt-1 text-red-300">{totals.atRiskSellers}<span className="text-lg font-normal text-white/50"> / {totals.sellers}</span></p>
                <p className="text-[11px] text-white/50 mt-0.5">{totals.warningSellers} warnings</p>
              </div>
            </div>
          </div>

          {/* Seller performance cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Seller Performance</h3>
              <button onClick={() => setActiveTab("sellers")} className="text-xs font-medium text-[#4A3520] hover:underline">View all →</button>
            </div>
            <div className="space-y-2">
              {sellersData.map((s) => {
                const rc = sellerRiskConfig[s.riskLevel];
                return (
                  <div key={s.id} onClick={() => { setSelectedSeller(s.id); }} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300">
                    <div className="flex items-center gap-4">
                      {/* Risk indicator */}
                      <span className={cn("h-10 w-1 rounded-full shrink-0", rc.dot)} />
                      {/* Seller info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", rc.bg, rc.text)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", rc.dot)} /> {rc.label}
                          </span>
                          <span className="text-[11px] text-gray-400">· {s.region}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">{s.contact} · {s.lastActive}</p>
                      </div>
                      {/* Metrics */}
                      <div className="flex items-center gap-6 text-xs">
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Closed</p>
                          <p className="text-base font-bold text-gray-900">{s.dealsClosed}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Active</p>
                          <p className="text-base font-bold text-blue-600">{s.dealsActive}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Revenue</p>
                          <p className="text-base font-bold text-gray-900">${(s.revenueYTD / 1000).toFixed(0)}K</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Commission</p>
                          <p className="text-base font-bold text-[#4A3520]">${s.commissionEarned.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Margin</p>
                          <p className={cn("text-base font-bold", s.avgMargin >= 20 ? "text-green-600" : s.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{s.avgMargin.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SELLERS TAB ═══ */}
      {activeTab === "sellers" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{sellersData.length} sellers · {totals.dealsClosed} deals closed · ${totals.commissionEarned.toLocaleString()} commission earned</p>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Seller</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Risk</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Closed</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Active</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Revenue</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Commission</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Margin</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {sellersData.map((s) => {
                  const rc = sellerRiskConfig[s.riskLevel];
                  return (
                    <tr key={s.id} onClick={() => setSelectedSeller(s.id)} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] text-white font-semibold text-sm shrink-0">
                            {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{s.name}</p>
                            <p className="text-[11px] text-gray-400">{s.contact} · {s.region}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", rc.bg, rc.text)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", rc.dot)} /> {rc.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-gray-900">{s.dealsClosed}</td>
                      <td className="px-3 py-3 text-right font-medium text-blue-600">{s.dealsActive}</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">${(s.revenueYTD / 1000).toFixed(0)}K</td>
                      <td className="px-3 py-3 text-right font-bold text-[#4A3520]">${s.commissionEarned.toLocaleString()}</td>
                      <td className={cn("px-3 py-3 text-right font-bold", s.avgMargin >= 20 ? "text-green-600" : s.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{s.avgMargin.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setSelectedSeller(s.id)} className="text-xs font-medium text-[#4A3520] hover:underline">View →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ COMMISSION TAB ═══ */}
      {activeTab === "commission" && (
        <div className="space-y-6">
          {/* Commission summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-green-200 bg-green-50/30 p-5">
              <p className="text-xs font-medium text-green-700">Commission Received</p>
              <p className="text-3xl font-bold text-green-700 mt-1">${totals.commissionEarned.toLocaleString()}</p>
              <p className="text-[11px] text-green-500 mt-0.5">2% of ${totals.revenueYTD.toLocaleString()} revenue</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
              <p className="text-xs font-medium text-amber-700">Commission Pending</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">${totals.commissionPending.toLocaleString()}</p>
              <p className="text-[11px] text-amber-500 mt-0.5">from {totals.dealsActive} active deals</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-medium text-gray-500">Total Commission (YTD)</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">${(totals.commissionEarned + totals.commissionPending).toLocaleString()}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">received + pending</p>
            </div>
          </div>

          {/* Per-seller commission breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Commission by Seller</h3>
            <div className="space-y-3">
              {sellersData.map((s) => {
                const totalComm = s.commissionEarned + s.commissionPending;
                const maxComm = Math.max(...sellersData.map(x => x.commissionEarned + x.commissionPending));
                const pct = (totalComm / maxComm) * 100;
                return (
                  <div key={s.id} onClick={() => setSelectedSeller(s.id)} className="cursor-pointer hover:bg-gray-50 rounded-lg p-3 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] text-white font-semibold text-xs shrink-0">
                          {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.name}</p>
                          <p className="text-[11px] text-gray-400">{s.dealsClosed} deals closed · {s.dealsActive} active</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#4A3520]">${totalComm.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-400">${s.commissionEarned.toLocaleString()} received · ${s.commissionPending.toLocaleString()} pending</p>
                      </div>
                    </div>
                    <div className="flex h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="bg-green-500" style={{ width: `${(s.commissionEarned / maxComm) * 100}%` }} title="Received" />
                      <div className="bg-amber-400" style={{ width: `${(s.commissionPending / maxComm) * 100}%` }} title="Pending" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ RISK TAB ═══ */}
      {activeTab === "risk" && (
        <div className="space-y-6">
          {/* Risk summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-green-200 bg-green-50/30 p-5">
              <p className="text-xs font-medium text-green-700">Healthy</p>
              <p className="text-3xl font-bold text-green-700 mt-1">{totals.healthySellers}</p>
              <p className="text-[11px] text-green-500 mt-0.5">no significant risk</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
              <p className="text-xs font-medium text-amber-700">Warning</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">{totals.warningSellers}</p>
              <p className="text-[11px] text-amber-500 mt-0.5">needs attention</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
              <p className="text-xs font-medium text-red-700">Critical</p>
              <p className="text-3xl font-bold text-red-700 mt-1">{totals.atRiskSellers}</p>
              <p className="text-[11px] text-red-500 mt-0.5">immediate action needed</p>
            </div>
          </div>

          {/* At-risk sellers detail */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Sellers Needing Attention</h3>
            <div className="space-y-3">
              {sellersData.filter(s => s.riskLevel !== "healthy").sort((a, b) => {
                const order = { critical: 0, warning: 1, healthy: 2 };
                return order[a.riskLevel] - order[b.riskLevel];
              }).map((s) => {
                const rc = sellerRiskConfig[s.riskLevel];
                return (
                  <div key={s.id} onClick={() => setSelectedSeller(s.id)} className={cn("rounded-lg border p-4 cursor-pointer hover:shadow-sm transition-all", rc.border, rc.bg)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", rc.bg, rc.text)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", rc.dot)} /> {rc.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">At-Risk Deals</p>
                            <p className="font-bold text-red-600">{s.atRiskDeals}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Overdue Payments</p>
                            <p className={cn("font-bold", s.overduePayments > 0 ? "text-red-600" : "text-gray-700")}>{s.overduePayments}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Missing Docs</p>
                            <p className={cn("font-bold", s.missingDocs > 0 ? "text-amber-600" : "text-gray-700")}>{s.missingDocs}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Avg Margin</p>
                            <p className={cn("font-bold", s.avgMargin >= 20 ? "text-green-600" : s.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{s.avgMargin.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                      <button className="shrink-0 rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors">Review →</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ANALYTICS TAB ═══ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {!analytics ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
              <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
                <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
              </div>
              <p className="text-sm font-medium text-gray-700">Loading analytics…</p>
            </div>
          ) : (
            <>
              {/* KPI summary cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-medium text-gray-500">Total Leads</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.pipeline_metrics.total_leads}</p>
                  <p className="text-[11px] text-green-600 mt-0.5">{analytics.pipeline_metrics.qualification_rate}% qualified</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-medium text-gray-500">Close Rate</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.pipeline_metrics.close_rate}%</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{analytics.pipeline_metrics.contracted} contracted</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-medium text-gray-500">Email Response Rate</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.email_metrics.response_rate}%</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{analytics.email_metrics.total_sent} sent · {analytics.email_metrics.total_received} received</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-medium text-gray-500">AI Approval Rate</p>
                  <p className={cn("text-2xl font-bold mt-1", analytics.feedback_metrics.approval_rate >= 50 ? "text-green-600" : "text-amber-600")}>{analytics.feedback_metrics.approval_rate}%</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{analytics.feedback_metrics.approved} approved · {analytics.feedback_metrics.rejected} rejected</p>
                </div>
              </div>

              {/* Agent Performance Table */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Agent Performance</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Agent</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Runs</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Errors</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Error Rate</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">AI Calls</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">AI Success</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.agent_performance.map((a: any) => (
                      <tr key={a.agent_id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{a.agent_id}</p>
                          <p className="text-[11px] text-gray-400">{a.name}</p>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{a.runs}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{a.errors}</td>
                        <td className={cn("px-3 py-2 text-right font-medium", a.error_rate > 10 ? "text-red-600" : "text-gray-700")}>{a.error_rate}%</td>
                        <td className="px-3 py-2 text-right text-gray-700">{a.ai_calls}</td>
                        <td className={cn("px-3 py-2 text-right font-medium", a.ai_success_rate === 100 ? "text-green-600" : "text-amber-600")}>{a.ai_success_rate}%</td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                            a.last_status === "success" ? "bg-green-50 text-green-700"
                            : a.last_status === "never" ? "bg-gray-100 text-gray-500"
                            : "bg-amber-50 text-amber-700"
                          )}>{a.last_status || "never"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pipeline + Financial side by side */}
              <div className="grid grid-cols-2 gap-6">
                {/* Pipeline funnel */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Pipeline Funnel</h3>
                  <div className="space-y-2">
                    {Object.entries(analytics.pipeline_metrics.state_distribution)
                      .sort((a: any, b: any) => b[1] - a[1])
                      .map(([state, count]: any) => {
                        const max = Math.max(...Object.values(analytics.pipeline_metrics.state_distribution) as number[]);
                        const pct = max > 0 ? (count / max) * 100 : 0;
                        const colors: Record<string, string> = {
                          NEW: "bg-gray-400", ENRICHED: "bg-blue-500", IN_SEQUENCE: "bg-amber-500",
                          QUALIFIED: "bg-green-500", SAMPLE_DISPATCHED: "bg-purple-500",
                          SAMPLE_FEEDBACK_DUE: "bg-purple-600", DECIDED_APPROVED: "bg-green-600",
                          DECIDED_REJECTED: "bg-red-500", DECIDED_NEEDS_ANOTHER: "bg-amber-600",
                          GHOSTED: "bg-red-400", CONTRACTED: "bg-emerald-500", NURTURE: "bg-lime-500", BLOCKED: "bg-gray-600",
                        };
                        return (
                          <div key={state} className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-600 w-32 truncate">{state.replace(/_/g, " ")}</span>
                            <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                              <div className={cn("h-full flex items-center justify-end px-2", colors[state] || "bg-gray-400")} style={{ width: `${pct}%` }}>
                                <span className="text-[10px] font-bold text-white">{count}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Financial summary */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Financial Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Total Revenue</span>
                      <span className="text-sm font-bold text-gray-900">${(analytics.financial_metrics.total_revenue || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Avg Contract Value</span>
                      <span className="text-sm font-bold text-gray-900">${(analytics.financial_metrics.avg_contract_value || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Commission Earned (2%)</span>
                      <span className="text-sm font-bold text-[#4A3520]">${(analytics.financial_metrics.commission_earned || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Contracts Completed</span>
                      <span className="text-sm font-bold text-gray-900">{analytics.financial_metrics.completed_contracts} / {analytics.financial_metrics.total_contracts}</span>
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Feedback Learning</p>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-500">AI Draft Approval Rate</span>
                        <span className={cn("text-xs font-bold", analytics.feedback_metrics.approval_rate >= 50 ? "text-green-600" : "text-amber-600")}>{analytics.feedback_metrics.approval_rate}%</span>
                      </div>
                      {analytics.feedback_metrics.top_reject_reasons.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] text-gray-400">Top reject reasons:</p>
                          {analytics.feedback_metrics.top_reject_reasons.map((r: any, i: number) => (
                            <div key={i} className="text-[11px] text-gray-600 flex justify-between">
                              <span>{r.reason.replace(/_/g, " ")}</span>
                              <span>{r.count}x</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lead Insights */}
              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Leads by Country</h3>
                  <div className="space-y-2">
                    {analytics.lead_insights.by_country.map((c: any, i: number) => {
                      const max = analytics.lead_insights.by_country[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600 w-32 truncate">{c.country || "Unknown"}</span>
                          <div className="flex-1 h-4 rounded bg-gray-100 overflow-hidden">
                            <div className="h-full bg-[#4A3520] flex items-center justify-end px-2" style={{ width: `${(c.count / max) * 100}%` }}>
                              <span className="text-[10px] font-bold text-white">{c.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Leads by Tier</h3>
                  <div className="space-y-2">
                    {analytics.lead_insights.by_tier.map((t: any, i: number) => {
                      const tierColors: Record<string, string> = { S: "bg-[#4A3520]", A: "bg-indigo-500", B: "bg-gray-400", C: "bg-gray-300" };
                      const max = analytics.lead_insights.by_tier[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600 w-8">{t.tier || "?"}</span>
                          <div className="flex-1 h-4 rounded bg-gray-100 overflow-hidden">
                            <div className={cn("h-full flex items-center justify-end px-2", tierColors[t.tier] || "bg-gray-400")} style={{ width: `${(t.count / max) * 100}%` }}>
                              <span className="text-[10px] font-bold text-white">{t.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* System Health */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">System Health</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Event Processing</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{analytics.system_metrics.events.processing_rate}%</p>
                    <p className="text-[11px] text-gray-400">{analytics.system_metrics.events.consumed}/{analytics.system_metrics.events.total} consumed</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Supervisor Logs</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{analytics.system_metrics.supervisor.total_log_entries}</p>
                    <p className="text-[11px] text-gray-400">{analytics.system_metrics.supervisor.critical_faults} critical · {analytics.system_metrics.supervisor.warnings} warnings</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Auto-Restarts</p>
                    <p className="text-xl font-bold text-green-600 mt-1">{analytics.system_metrics.supervisor.auto_restarts}</p>
                    <p className="text-[11px] text-gray-400">agents recovered</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Compliance Rate</p>
                    <p className="text-xl font-bold text-green-600 mt-1">{analytics.operational_metrics.compliance.compliance_rate}%</p>
                    <p className="text-[11px] text-gray-400">{analytics.operational_metrics.compliance.approved_docs}/{analytics.operational_metrics.compliance.total_docs} docs approved</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ SYSTEM TAB ═══ */}
      {activeTab === "system" && (
        <div className="space-y-6">
          {/* Supervisor status banner */}
          <div className={cn(
            "rounded-xl border p-4 flex items-center justify-between",
            supervisorRunning ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                supervisorRunning ? "bg-green-100" : "bg-red-100"
              )}>
                <Activity className={cn("h-5 w-5", supervisorRunning ? "text-green-600" : "text-red-600")} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Agent Supervisor {supervisorRunning ? "Running" : "Stopped"}
                </p>
                <p className="text-xs text-gray-500">
                  {supervisorRunning
                    ? "Monitoring all 7 agents every 10 seconds — auto-correcting faults"
                    : "Supervisor is not running — agents will not process events automatically"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Agent Runs</p>
                <p className="text-base font-bold text-gray-900">{supervisorStats.totalAgentRuns || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Errors</p>
                <p className={cn("text-base font-bold", (supervisorStats.totalErrors || 0) > 0 ? "text-red-600" : "text-gray-900")}>{supervisorStats.totalErrors || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Pending Events</p>
                <p className="text-base font-bold text-amber-600">{supervisorStats.pendingEvents || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Faults</p>
                <p className={cn("text-base font-bold", (supervisorStats.criticalFaults || 0) > 0 ? "text-red-600" : (supervisorStats.warningFaults || 0) > 0 ? "text-amber-600" : "text-green-600")}>{(supervisorStats.warningFaults || 0) + (supervisorStats.criticalFaults || 0)}</p>
              </div>
            </div>
          </div>

          {/* Agent health cards with working pause/resume */}
          {supervisorAgents && supervisorAgents.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">AI Agent Health (Live)</h3>
                <span className="text-xs text-gray-400">Auto-refreshes every 15s</span>
              </div>
              <div className="space-y-2">
                {supervisorAgents.map((agent) => {
                  const statusConfig: Record<string, { dot: string; bg: string; text: string; label: string }> = {
                    active: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700", label: "Active" },
                    working: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", label: "Working" },
                    idle: { dot: "bg-gray-400", bg: "bg-gray-100", text: "text-gray-600", label: "Idle" },
                    paused: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", label: "Paused" },
                    error: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700", label: "Error" },
                  };
                  const sc = statusConfig[agent.status] || statusConfig.idle;
                  return (
                    <div key={agent.id} className={cn("rounded-lg border p-3 flex items-center gap-4", sc.bg, "border-gray-200")}>
                      <span className={cn("h-3 w-3 rounded-full shrink-0", sc.dot, agent.status === "working" && "animate-pulse")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", sc.bg, sc.text)}>{sc.label}</span>
                          {agent.pendingEvents > 0 && <span className="text-[10px] text-amber-600 font-medium">{agent.pendingEvents} pending</span>}
                          {agent.consecutiveErrors > 0 && <span className="text-[10px] text-red-600 font-medium">{agent.consecutiveErrors} errors</span>}
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-gray-500">
                          <span>{agent.id}</span>
                          <span>Runs: <span className="font-medium text-gray-700">{agent.runCount}</span></span>
                          <span>Last: <span className="font-medium text-gray-700">{agent.lastRunTs}</span></span>
                          {agent.lastError && <span className="text-red-500">Error: {agent.lastError}</span>}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {agent.isPaused ? (
                          <button onClick={() => handleResumeAgent(agent.id)} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors">
                            <RefreshCw className="h-3 w-3" /> Resume
                          </button>
                        ) : (
                          <button onClick={() => handlePauseAgent(agent.id)} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors">
                            <Clock className="h-3 w-3" /> Pause
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <div className="flex h-8 w-8 mx-auto items-center justify-center rounded-full bg-gray-100 mb-3">
                <div className="h-4 w-4 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
              </div>
              <p className="text-sm text-gray-500">Loading agent health from supervisor…</p>
            </div>
          )}

          {/* Supervisor fault log */}
          {supervisorFaults.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Supervisor Fault Log</h3>
                <span className="text-xs text-gray-400">{supervisorFaults.length} recent events</span>
              </div>
              <div className="space-y-2">
                {supervisorFaults.slice(0, 10).map((f) => {
                  const severityConfig: Record<string, { bg: string; text: string; icon: any }> = {
                    critical: { bg: "bg-red-50", text: "text-red-700", icon: AlertCircle },
                    warning: { bg: "bg-amber-50", text: "text-amber-700", icon: AlertTriangle },
                    info: { bg: "bg-blue-50", text: "text-blue-700", icon: CheckCircle2 },
                  };
                  const sc = severityConfig[f.severity] || severityConfig.info;
                  return (
                    <div key={f.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", sc.bg)}>
                        <sc.icon className={cn("h-3 w-3", sc.text)} strokeWidth={1.5} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-900">{f.message}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-gray-400">{f.timestamp}</span>
                          {f.agentId && <span className="text-[10px] text-gray-400">· {f.agentId}</span>}
                          {f.actionTaken && <span className="text-[10px] text-green-600">→ {f.actionTaken}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NOTE: Approval queue is now on the SELLER side (TopHeader modal).
              Admin does not approve agent actions — sellers do. */}

          {/* Operators table */}
          {operatorsData && operatorsData.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">System Operators</h3>
                <button
                  onClick={() => { setShowCreateModal(true); setActionError(null); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Operator
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Operator</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions Today</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Last Active</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorsData.map((op) => {
                    const rc = operatorRoleConfig[op.role] || operatorRoleConfig.operator;
                    const isBusy = actionInProgress === op.id;
                    return (
                      <tr key={op.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900">{op.name}</p>
                          <p className="text-[11px] text-gray-400">{op.email}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", rc.bg, rc.text)}>{rc.label}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                            op.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                          )}>
                            {op.status === "active" ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{op.actionsToday}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{op.lastActive}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            {/* Edit role/status */}
                            <button
                              onClick={() => { setEditTarget(op); setActionError(null); }}
                              disabled={isBusy}
                              title="Edit role / status"
                              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                            {/* Reset password */}
                            <button
                              onClick={() => { setResetTarget(op); setActionError(null); }}
                              disabled={isBusy}
                              title="Reset password"
                              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            {/* Disable / Enable */}
                            <button
                              onClick={async () => {
                                if (isBusy) return;
                                const newStatus = op.status === "active" ? "disabled" : "active";
                                const verb = newStatus === "active" ? "enable" : "disable";
                                if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} operator "${op.name}"?`)) return;
                                setActionInProgress(op.id);
                                setActionError(null);
                                try {
                                  const r = await fetch(`/api/admin/operators/${encodeURIComponent(op.id)}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() || "" },
                                    body: JSON.stringify({ status: newStatus }),
                                  });
                                  const d = await r.json();
                                  if (!d.ok) {
                                    setActionError(d.error || `Failed to ${verb} operator`);
                                  } else {
                                    refreshAdminData();
                                  }
                                } catch (e) {
                                  setActionError(`Network error — failed to ${verb} operator`);
                                } finally {
                                  setActionInProgress(null);
                                }
                              }}
                              disabled={isBusy}
                              title={op.status === "active" ? "Disable account" : "Enable account"}
                              className={cn(
                                "p-1.5 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50",
                                op.status === "active" ? "text-gray-500 hover:text-amber-600" : "text-gray-400 hover:text-green-600"
                              )}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            {/* Delete */}
                            <button
                              onClick={async () => {
                                if (isBusy) return;
                                if (!confirm(`Delete operator "${op.name}"?\n\nThis cannot be undone. Their account will be permanently removed.`)) return;
                                setActionInProgress(op.id);
                                setActionError(null);
                                try {
                                  const r = await fetch(`/api/admin/operators/${encodeURIComponent(op.id)}`, {
                                    method: "DELETE",
                                    headers: { "x-csrf-token": getCsrfToken() || "" },
                                  });
                                  const d = await r.json();
                                  if (!d.ok) {
                                    setActionError(d.error || "Failed to delete operator");
                                  } else {
                                    refreshAdminData();
                                  }
                                } catch (e) {
                                  setActionError("Network error — failed to delete operator");
                                } finally {
                                  setActionInProgress(null);
                                }
                              }}
                              disabled={isBusy}
                              title="Delete operator"
                              className="p-1.5 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {actionError && (
                <div className="px-5 py-2 bg-red-50 border-t border-red-200 text-xs text-red-700">
                  {actionError}
                </div>
              )}
            </div>
          )}

          {/* Pending Access Requests (from login page "Request Access" form) */}
          {accessRequests && accessRequests.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Pending Access Requests</h3>
                  <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-semibold h-5 min-w-5 px-1.5">
                    {accessRequests.length}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">Submitted via the login "Request access" form</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-amber-50 border-b border-amber-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Company / Title</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Phone</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Message</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Submitted</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accessRequests.map((req) => {
                    const isBusy = actionInProgress === `req-${req.id}`;
                    return (
                      <tr key={req.id} className="border-b border-amber-100 last:border-0 bg-white">
                        <td className="px-4 py-2 font-medium text-gray-900">{req.name}</td>
                        <td className="px-3 py-2 text-gray-700 text-xs">{req.email}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">
                          {req.company && <p className="font-medium text-gray-700">{req.company}</p>}
                          {req.job_title && <p>{req.job_title}</p>}
                          {!req.company && !req.job_title && <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">
                          {req.phone ? <span>{req.phone}</span> : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs max-w-xs">
                          {req.message ? (
                            <p className="truncate" title={req.message}>{req.message}</p>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{req.submitted_ts?.substring(0, 16).replace("T", " ") || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={async () => {
                                if (isBusy) return;
                                if (!confirm(`Approve access request from "${req.name}" (${req.email})?\n\nA new operator account will be created with role "operator" and a random 16-char password. The password will be shown once after creation.`)) return;
                                setActionInProgress(`req-${req.id}`);
                                setActionError(null);
                                try {
                                  const r = await fetch(`/api/admin/access-requests/${req.id}/approve`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() || "" },
                                    body: JSON.stringify({ role: "operator" }),
                                  });
                                  const d = await r.json();
                                  if (!d.ok) {
                                    setActionError(d.error || "Failed to approve request");
                                  } else {
                                    const pwd = d.generatedPassword;
                                    if (pwd) {
                                      alert(`✓ Account created for ${d.operator.name} (${d.operator.email})\n\nOperator ID: ${d.operator.operator_id}\nTemporary password: ${pwd}\n\nCommunicate this password to the user out-of-band. They will be prompted to change it on first login.`);
                                    } else {
                                      alert(`✓ Account created for ${d.operator.name} (${d.operator.email})\n\nOperator ID: ${d.operator.operator_id}`);
                                    }
                                    refreshAdminData();
                                  }
                                } catch (e) {
                                  setActionError("Network error — failed to approve request");
                                } finally {
                                  setActionInProgress(null);
                                }
                              }}
                              disabled={isBusy}
                              title="Approve & create account"
                              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              onClick={async () => {
                                if (isBusy) return;
                                const notes = prompt(`Reject access request from "${req.name}" (${req.email})?\n\nOptional reason (visible to other admins):`);
                                if (notes === null) return; // user cancelled
                                setActionInProgress(`req-${req.id}`);
                                setActionError(null);
                                try {
                                  const r = await fetch(`/api/admin/access-requests/${req.id}/reject`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() || "" },
                                    body: JSON.stringify({ notes: notes || null }),
                                  });
                                  const d = await r.json();
                                  if (!d.ok) {
                                    setActionError(d.error || "Failed to reject request");
                                  } else {
                                    refreshAdminData();
                                  }
                                } catch (e) {
                                  setActionError("Network error — failed to reject request");
                                } finally {
                                  setActionInProgress(null);
                                }
                              }}
                              disabled={isBusy}
                              title="Reject request"
                              className="inline-flex items-center gap-1 rounded-md bg-white border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                              <X className="h-3 w-3" />
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ Active Sessions (Phase 3) ═══ */}
          {activeSessions && activeSessions.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/30 overflow-hidden">
              <div className="px-5 py-3 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Active Sessions</h3>
                  <span className="inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-semibold h-5 min-w-5 px-1.5">
                    {activeSessions.length}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">Users currently logged in</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-blue-50 border-b border-blue-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Operator</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Role</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">IP</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Issued</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Expires</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSessions.map((s) => (
                    <tr key={s.id} className="border-b border-blue-100 last:border-0 bg-white">
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-900">{s.operatorEmail}</p>
                        <p className="text-[11px] text-gray-400">{s.operatorId}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                          s.operatorRole === "admin" ? "bg-[#4A3520] text-white" : "bg-blue-50 text-blue-700"
                        )}>
                          {s.operatorRole}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">
                        {s.ipAddress ? (
                          <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{s.ipAddress}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{s.issuedAt?.substring(0, 16).replace("T", " ") || "—"}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{s.expiresAt?.substring(0, 16).replace("T", " ") || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={async () => {
                            if (actionInProgress === s.id) return;
                            if (!confirm(`Revoke session for ${s.operatorEmail}?\n\nThey will be logged out immediately.`)) return;
                            setActionInProgress(s.id);
                            setActionError(null);
                            try {
                              const r = await fetch(`/api/admin/sessions/${encodeURIComponent(s.id)}/revoke`, {
                                method: "POST",
                                headers: { "x-csrf-token": getCsrfToken() || "" },
                              });
                              const d = await r.json();
                              if (!d.ok) {
                                setActionError(d.error || "Failed to revoke session");
                              } else {
                                refreshAdminData();
                              }
                            } catch {
                              setActionError("Network error — failed to revoke session");
                            } finally {
                              setActionInProgress(null);
                            }
                          }}
                          disabled={actionInProgress === s.id}
                          title="Force logout"
                          className="inline-flex items-center gap-1 rounded-md bg-white border border-red-300 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <LogOutIcon className="h-3 w-3" />
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ Admin Audit Log (Phase 3) ═══ */}
          {auditLog && auditLog.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-900">Admin Audit Log</h3>
                  <span className="text-[11px] text-gray-400">Last {auditLog.length} actions</span>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">When</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Admin</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Target</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{entry.timestamp?.substring(0, 16).replace("T", " ") || "—"}</td>
                        <td className="px-3 py-2 text-gray-700 text-xs">
                          <p className="font-medium">{entry.actorEmail}</p>
                          {entry.actorIp && <p className="text-[10px] text-gray-400">{entry.actorIp}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <code className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-mono",
                            entry.action.startsWith("operator.create") ? "bg-green-50 text-green-700" :
                            entry.action.startsWith("operator.delete") ? "bg-red-50 text-red-700" :
                            entry.action.startsWith("operator.disable") ? "bg-amber-50 text-amber-700" :
                            entry.action.startsWith("operator.enable") ? "bg-green-50 text-green-700" :
                            entry.action.startsWith("operator.reset_password") ? "bg-purple-50 text-purple-700" :
                            entry.action.startsWith("access_request.approve") ? "bg-green-50 text-green-700" :
                            entry.action.startsWith("access_request.reject") ? "bg-red-50 text-red-700" :
                            entry.action.startsWith("session.revoke") ? "bg-amber-50 text-amber-700" :
                            "bg-gray-100 text-gray-700"
                          )}>{entry.action}</code>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {entry.targetEmail ? (
                            <p className="font-medium text-gray-700">{entry.targetEmail}</p>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                          {entry.targetId && <p className="text-[10px] text-gray-400">{entry.targetId}</p>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">
                          {entry.details ? (
                            <pre className="text-[10px] bg-gray-50 rounded p-1 max-w-xs overflow-x-auto">{JSON.stringify(entry.details)}</pre>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ SELLER DETAIL DRAWER ═══ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedSeller(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative w-[520px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selected.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selected.contact} · {selected.region}</p>
                </div>
                <button onClick={() => setSelectedSeller(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", sellerRiskConfig[selected.riskLevel].bg, sellerRiskConfig[selected.riskLevel].text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", sellerRiskConfig[selected.riskLevel].dot)} /> {sellerRiskConfig[selected.riskLevel].label}
                </span>
                <span className="text-xs text-gray-400">· Joined {selected.joinedDate}</span>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Financial summary */}
              <div className="rounded-xl border border-[#4A3520] bg-gradient-to-br from-[#4A3520] to-[#6B4E33] p-4 text-white">
                <p className="text-xs font-medium text-white/60 mb-3">Your Commission from This Seller</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold">${selected.commissionEarned.toLocaleString()}</p>
                    <p className="text-[11px] text-white/50">Received (2% of ${selected.revenueYTD.toLocaleString()})</p>
                  </div>
                  <div className="border-l border-white/10 pl-4">
                    <p className="text-2xl font-bold text-amber-300">${selected.commissionPending.toLocaleString()}</p>
                    <p className="text-[11px] text-white/50">Pending ({selected.dealsActive} active deals)</p>
                  </div>
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Deals Closed</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{selected.dealsClosed}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active Deals</p>
                  <p className="text-lg font-bold text-blue-600 mt-0.5">{selected.dealsActive}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Avg Margin</p>
                  <p className={cn("text-lg font-bold mt-0.5", selected.avgMargin >= 20 ? "text-green-600" : selected.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{selected.avgMargin.toFixed(1)}%</p>
                </div>
              </div>

              {/* Risk factors */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Risk Factors</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">At-Risk Deals</span>
                    <span className={cn("text-sm font-bold", selected.atRiskDeals > 0 ? "text-red-600" : "text-green-600")}>{selected.atRiskDeals}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">Overdue Payments</span>
                    <span className={cn("text-sm font-bold", selected.overduePayments > 0 ? "text-red-600" : "text-green-600")}>{selected.overduePayments}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">Missing Compliance Docs</span>
                    <span className={cn("text-sm font-bold", selected.missingDocs > 0 ? "text-amber-600" : "text-green-600")}>{selected.missingDocs}</span>
                  </div>
                </div>
              </div>

              {/* Recent deals */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Recent Deals</p>
                <div className="space-y-2">
                  {selectedDeals.map((d) => {
                    const statusConfig: Record<SellerDeal["status"], { label: string; bg: string; text: string }> = {
                      completed: { label: "Completed", bg: "bg-green-50", text: "text-green-700" },
                      in_progress: { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700" },
                      at_risk: { label: "At Risk", bg: "bg-red-50", text: "text-red-700" },
                      rejected: { label: "Rejected", bg: "bg-gray-100", text: "text-gray-500" },
                    };
                    const sc = statusConfig[d.status];
                    return (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.buyer}</p>
                          <p className="text-[11px] text-gray-400">{d.id} · {d.margin.toFixed(1)}% margin</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">${d.value.toLocaleString()}</p>
                          <div className="flex items-center gap-2 justify-end mt-0.5">
                            <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", sc.bg, sc.text)}>{sc.label}</span>
                            <span className="text-[10px] text-[#4A3520] font-semibold">+${d.commission.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.riskLevel === "critical" && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Contact Seller Urgently</button>
                )}
                {selected.riskLevel === "warning" && (
                  <button className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">Schedule Review Call</button>
                )}
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Full Deal History</button>
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Commission Report</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREATE OPERATOR MODAL ═══ */}
      {showCreateModal && (
        <CreateOperatorModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); refreshAdminData(); }}
        />
      )}

      {/* ═══ EDIT OPERATOR MODAL (role / status) ═══ */}
      {editTarget && (
        <EditOperatorModal
          operator={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); refreshAdminData(); }}
        />
      )}

      {/* ═══ RESET PASSWORD MODAL ═══ */}
      {resetTarget && (
        <ResetPasswordModal
          operator={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => { setResetTarget(null); refreshAdminData(); }}
        />
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// CREATE OPERATOR MODAL
// ═══════════════════════════════════════════════════════════
function CreateOperatorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "operator" | "viewer">("operator");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setError("Name, email, and password are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/\d/.test(password)) {
      setError("Password must contain at least one digit");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch("/api/admin/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() || "" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password, role, status }),
      });
      const d = await r.json();
      if (d.ok) {
        onCreated();
      } else {
        setError(d.error || "Failed to create operator");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2"><UserPlus className="h-5 w-5" /> New Operator</h2>
              <p className="text-sm text-white/70 mt-1">Create a new account. The password is bcrypt-hashed before storage.</p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white p-1" aria-label="Close">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={100} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Email <span className="text-red-500">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" maxLength={200} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Password <span className="text-red-500">*</span></label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars, at least 1 letter + 1 digit" maxLength={200} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
            <p className="text-[11px] text-gray-400 mt-1">Communicate this to the operator out-of-band. They cannot recover it if lost.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520]">
                <option value="operator">Operator</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520]">
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</> : <><Plus className="h-4 w-4" /> Create Operator</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EDIT OPERATOR MODAL (role / status / name)
// ═══════════════════════════════════════════════════════════
function EditOperatorModal({ operator, onClose, onSaved }: { operator: Operator; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(operator.name);
  const [role, setRole] = useState<"admin" | "manager" | "operator" | "viewer">(operator.role as any);
  const [status, setStatus] = useState<"active" | "disabled">(operator.status === "active" ? "active" : "disabled");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const body: any = {};
      if (name.trim() !== operator.name) body.name = name.trim();
      if (role !== operator.role) body.role = role;
      if (status !== operator.status) body.status = status;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      const r = await fetch(`/api/admin/operators/${encodeURIComponent(operator.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() || "" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) {
        onSaved();
      } else {
        setError(d.error || "Failed to update operator");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">Edit Operator</h2>
              <p className="text-sm text-white/70 mt-1">{operator.email}</p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white p-1"><XIcon className="h-5 w-5" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520]">
                <option value="operator">Operator</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#4A3520]">
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : <>Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RESET PASSWORD MODAL
// ═══════════════════════════════════════════════════════════
function ResetPasswordModal({ operator, onClose, onDone }: { operator: Operator; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"generate" | "custom">("generate");
  const [customPassword, setCustomPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ generatedPassword?: string } | null>(null);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const body = mode === "custom" ? { newPassword: customPassword } : {};
      const r = await fetch(`/api/admin/operators/${encodeURIComponent(operator.id)}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() || "" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) {
        setResult({ generatedPassword: d.generatedPassword });
      } else {
        setError(d.error || "Failed to reset password");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2"><KeyRound className="h-5 w-5" /> Reset Password</h2>
              <p className="text-sm text-white/70 mt-1">{operator.name} · {operator.email}</p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white p-1"><XIcon className="h-5 w-5" /></button>
          </div>
        </div>

        {result ? (
          // Success state — show generated password (or just confirmation if custom)
          <div className="p-6 space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-sm font-semibold text-green-800">Password reset successfully</p>
              </div>
              {result.generatedPassword ? (
                <div>
                  <p className="text-xs text-gray-600 mb-1">New temporary password (shown once):</p>
                  <div className="rounded bg-white border border-green-200 px-3 py-2 font-mono text-sm select-all">{result.generatedPassword}</div>
                  <p className="text-[11px] text-gray-500 mt-2">Communicate this to the operator out-of-band. The previous password no longer works.</p>
                </div>
              ) : (
                <p className="text-xs text-gray-600">The new password you set is now active. The previous password no longer works.</p>
              )}
            </div>
            <button onClick={onDone} className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33]">Done</button>
          </div>
        ) : (
          // Form state
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === "generate"} onChange={() => setMode("generate")} className="text-[#4A3520]" />
                <span className="text-sm text-gray-700">Generate a random 16-char password</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} className="text-[#4A3520]" />
                <span className="text-sm text-gray-700">Set a custom password</span>
              </label>
            </div>
            {mode === "custom" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">New Password</label>
                <input type="text" value={customPassword} onChange={(e) => setCustomPassword(e.target.value)} placeholder="Min 8 chars, 1 letter + 1 digit" maxLength={200} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#4A3520]" />
              </div>
            )}
            {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
              The operator will be logged out of any active sessions on their next request.
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Resetting...</> : <><KeyRound className="h-4 w-4" /> Reset Password</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

