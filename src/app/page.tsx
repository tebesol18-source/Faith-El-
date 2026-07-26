"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard, Inbox as InboxIcon, Users, Handshake, Package, FlaskConical,
  FileText, ScrollText, Truck, DollarSign, Sparkles,
  ChevronDown, Menu, Plus, ArrowRight, ArrowUp,
  Mail, CheckCircle2, Ship, Clock,
  TrendingUp, ChevronRight, Coffee, Bot, Star,
  AlertTriangle, Phone, Send, Search, Filter,
  Paperclip, MoreHorizontal, Archive, Trash2,
  Circle, Tag, Calendar, MapPin, FileSignature, X as XIcon,
  ArrowDown, DollarSign as Dollar, Package as PackageIcon,
  PanelLeftClose, PanelLeft,
  ShieldCheck, Leaf, Award, FileCheck, Globe, Wind, CheckSquare, AlertCircle, Upload, RefreshCw, FileX, FileClock,
  LogOut, Lock, Eye, EyeOff, UserCog, Activity, Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────
type Page = "dashboard" | "inbox" | "leads" | "deals" | "inventory" | "samples" | "quotes" | "contracts" | "shipments" | "compliance" | "finance" | "coach" | "admin";

// ─── Sidebar Data ──────────────────────────────────────────
const navGroups: { label: string | null; items: { icon: any; label: string; page: Page; badge?: number; highlight?: boolean }[] }[] = [
  { label: null, items: [{ icon: LayoutDashboard, label: "Dashboard", page: "dashboard", highlight: true }] },
  { label: "Sales", items: [
    { icon: InboxIcon, label: "Inbox", page: "inbox", badge: 8, highlight: true },
    { icon: Users, label: "Leads", page: "leads" },
    { icon: Handshake, label: "Deals", page: "deals", highlight: true },
  ]},
  { label: "Coffee", items: [
    { icon: Package, label: "Inventory", page: "inventory" },
    { icon: FlaskConical, label: "Samples", page: "samples" },
  ]},
  { label: "Documents", items: [
    { icon: FileText, label: "Quotes", page: "quotes" },
    { icon: ScrollText, label: "Contracts", page: "contracts" },
  ]},
  { label: "Operations", items: [
    { icon: Truck, label: "Shipments", page: "shipments" },
    { icon: ShieldCheck, label: "Compliance", page: "compliance", badge: 3, highlight: true },
  ] },
  { label: null, items: [
    { icon: DollarSign, label: "Finance", page: "finance", highlight: true },
    { icon: Sparkles, label: "AI Coach", page: "coach" },
  ]},
  { label: "System", items: [
    { icon: ShieldCheck, label: "Portfolio", page: "admin", highlight: true },
  ]},
];

// ─── Collapsible Sidebar ───────────────────────────────────
function Sidebar({ currentPage, onNavigate, expanded, onToggle, navGroups: groups }: { currentPage: Page; onNavigate: (p: Page) => void; expanded: boolean; onToggle: () => void; navGroups?: typeof navGroups }) {
  const renderedGroups = groups ?? navGroups;
  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen border-r border-gray-200 bg-white flex flex-col transition-all duration-300",
      expanded ? "w-[240px]" : "w-[64px]"
    )}>
      {/* Logo / Toggle */}
      <div className="flex h-16 items-center border-b border-gray-100" style={{ justifyContent: expanded ? "space-between" : "center", padding: expanded ? "0 1.25rem" : "0" }}>
        <div className="flex items-center gap-2.5" style={{ display: expanded ? "flex" : "none" }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4A3520] shrink-0">
            <Coffee className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <span className="font-bold text-gray-900 text-sm tracking-tight">COFFEE</span>
            <span className="font-light text-gray-400 text-sm ml-1">EXPORT</span>
          </div>
        </div>
        <button onClick={onToggle} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0">
          {expanded ? <PanelLeftClose className="h-5 w-5 text-gray-500" strokeWidth={1.5} /> : <PanelLeft className="h-5 w-5 text-gray-500" strokeWidth={1.5} />}
        </button>
        {!expanded && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4A3520]">
            <Coffee className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3" style={{ padding: expanded ? "0.75rem 0.75rem" : "0.75rem 0.5rem" }}>
        {renderedGroups.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.label && expanded && <p className="px-3 mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>}
            {group.label && !expanded && gi > 0 && <div className="my-2 mx-2 border-t border-gray-100" />}
            <ul className="space-y-0.5">
              {group.items.map((item, i) => (
                <li key={i}>
                  <button
                    onClick={() => onNavigate(item.page)}
                    title={item.label}
                    className={cn(
                      "flex items-center rounded-lg transition-colors relative",
                      expanded ? "w-full gap-3 px-3 py-2 text-sm" : "w-full justify-center p-2.5",
                      currentPage === item.page
                        ? "bg-[#4A3520] text-white font-medium"
                        : item.highlight
                        ? "text-gray-900 font-medium hover:bg-gray-50"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <item.icon
                      className={cn("h-[18px] w-[18px] shrink-0", currentPage === item.page ? "text-white" : item.highlight ? "text-gray-700" : "text-gray-400")}
                      strokeWidth={1.5}
                    />
                    {expanded && <span className="flex-1 text-left">{item.label}</span>}
                    {item.badge && expanded && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{item.badge}</span>
                    )}
                    {item.badge && !expanded && (
                      <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{item.badge}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="border-t border-gray-100" style={{ padding: expanded ? "1rem" : "0.75rem 0.5rem" }}>
        <button className={cn("flex items-center rounded-lg transition-colors hover:bg-gray-50", expanded ? "w-full gap-3 p-1" : "w-full justify-center p-1")}>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] flex items-center justify-center text-white font-semibold text-sm shrink-0">AS</div>
          {expanded && (
            <div className="flex-1 text-left overflow-hidden">
              <p className="text-sm font-semibold text-gray-900 truncate">Abi Solomon</p>
              <p className="text-xs text-gray-400 truncate">Coelrodan PLC</p>
            </div>
          )}
          {expanded && <ChevronDown className="h-4 w-4 text-gray-300 shrink-0" />}
        </button>
      </div>
    </aside>
  );
}

// ─── Top Header (with seller approval modal) ────────────────
function TopHeader({ userRole, onLogout }: { userRole: "admin" | "seller"; onLogout: () => void }) {
  const [showApprovals, setShowApprovals] = useState(false);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchApprovals = () => {
    fetch("/api/approvals")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (data.ok) setPendingActions(data.actions || []); })
      .catch(() => {});
  };

  useEffect(() => {
    if (userRole === "seller") {
      fetchApprovals();
      const interval = setInterval(fetchApprovals, 15000);
      return () => clearInterval(interval);
    }
  }, [userRole]);

  const handleApprove = (id: number) => {
    setActionLoading(id);
    fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "approve" }) })
      .then(() => { fetchApprovals(); })
      .finally(() => setActionLoading(null));
  };

  const handleReject = (id: number) => {
    setActionLoading(id);
    fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "reject" }) })
      .then(() => { fetchApprovals(); })
      .finally(() => setActionLoading(null));
  };

  const riskConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
    low: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", label: "Low Risk" },
    medium: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Medium Risk" },
    high: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "High Risk" },
  };

  const actionLabels: Record<string, string> = {
    send_email: "Send Email to Buyer",
    create_contract: "Create Contract",
    dispatch_sample: "Dispatch Sample",
    send_follow_up: "Send Follow-up",
    send_breakup_email: "Send Breakup Email",
    create_quote: "Create Quote",
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-8 backdrop-blur-sm">
        <button className="p-2 rounded-lg hover:bg-gray-100"><Menu className="h-5 w-5 text-gray-600" strokeWidth={1.5} /></button>
        <div className="flex items-center gap-3">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold",
            userRole === "admin" ? "bg-[#4A3520] text-white" : "bg-blue-50 text-blue-700"
          )}>
            {userRole === "admin" ? <ShieldCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {userRole === "admin" ? "Admin" : "Seller"}
          </span>
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50 transition-colors">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-600">4</span>
            <span className="text-sm font-medium text-gray-700">High Priority</span>
          </button>
          {/* AI Suggestions button — only for sellers, shows real pending count */}
          {userRole === "seller" && (
            <button
              onClick={() => { setShowApprovals(true); fetchApprovals(); }}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                pendingActions.length > 0
                  ? "border-amber-300 bg-amber-50 hover:bg-amber-100 animate-pulse"
                  : "border-indigo-100 bg-indigo-50 hover:bg-indigo-100"
              )}
            >
              <Bot className="h-4 w-4 text-indigo-600" strokeWidth={1.5} />
              <span className="text-sm font-medium text-indigo-700">
                {pendingActions.length > 0 ? `${pendingActions.length} Pending Approval` : "AI Suggestions"}
              </span>
              {pendingActions.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">{pendingActions.length}</span>
              )}
            </button>
          )}
          <button onClick={onLogout} title="Sign out" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-red-600 transition-colors">
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] flex items-center justify-center text-white font-semibold text-sm">AS</div>
        </div>
      </header>

      {/* Seller Approval Modal — where sellers approve/reject AI-drafted actions */}
      {showApprovals && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setShowApprovals(false)}>
          <div className="w-[560px] max-h-[80vh] rounded-xl bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                  <Bot className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">AI Agent Actions — Your Review</h3>
                  <p className="text-xs text-gray-500">{pendingActions.length} action(s) drafted by AI agents, awaiting your approval</p>
                </div>
              </div>
              <button onClick={() => setShowApprovals(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
            </div>

            {/* Body — scrollable list of pending actions */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {pendingActions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-green-100 mb-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium text-gray-700">All caught up!</p>
                  <p className="text-xs text-gray-400 mt-1">No pending AI actions. Agents are working — check back later.</p>
                </div>
              ) : (
                pendingActions.map((a) => {
                  const rc = riskConfig[a.riskLevel] || riskConfig.medium;
                  return (
                    <div key={a.id} className={cn("rounded-lg border p-4", rc.border, rc.bg)}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white", rc.text)}>
                          <Bot className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", rc.bg, rc.text)}>{rc.label}</span>
                            <span className="text-[10px] text-gray-400">·</span>
                            <span className="text-[10px] font-medium text-gray-500">{a.agentId}</span>
                            <span className="text-[10px] text-gray-400">·</span>
                            <span className="text-[10px] text-gray-500">{actionLabels[a.actionType] || a.actionType}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-900">{a.description}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Submitted {a.submittedAt}</p>
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleReject(a.id)}
                          disabled={actionLoading === a.id}
                          className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === a.id ? "..." : "Reject"}
                        </button>
                        <button
                          onClick={() => handleApprove(a.id)}
                          disabled={actionLoading === a.id}
                          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === a.id ? (
                            <><div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
                          ) : (
                            <><CheckCircle2 className="h-3.5 w-3.5" /> Approve & Execute</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-3 shrink-0">
              <p className="text-[11px] text-gray-400 text-center">
                Approved actions are executed automatically by the supervisor within 10 seconds.
                Rejected actions are discarded — the agent will not retry.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════
// Mock dashboard data — used as fallback when /api/dashboard is unreachable.
const mockPriorities = [
  { num: "1", color: "bg-red-500", text: "Reply to Aurora Coffee — asked for pricing 2h ago", time: "2h ago" },
  { num: "2", color: "bg-amber-500", text: "Approve Quote V2 — QU-2026-0004", time: "3h ago" },
  { num: "3", color: "bg-green-600", text: "Sign Contract CT-2026-0003", time: "5h ago" },
  { num: "4", color: "bg-blue-500", text: "Shipment CT-2026-001 arrives tomorrow", time: "Tomorrow" },
];

const mockStages = [
  { label: "New Leads", count: 24, value: "$0", color: "bg-blue-500" },
  { label: "Qualified", count: 18, value: "$45K", color: "bg-indigo-500" },
  { label: "Sampling", count: 12, value: "$32K", color: "bg-purple-500" },
  { label: "Negotiating", count: 8, value: "$245K", color: "bg-amber-500" },
  { label: "Contract", count: 5, value: "$18K", color: "bg-green-600" },
  { label: "Shipping", count: 3, value: "$13K", color: "bg-teal-500" },
  { label: "Completed", count: 15, value: "$86K", color: "bg-emerald-600" },
];

const mockKpis = [
  { label: "Deals", value: "18", sub: "Active", context: "$45,680 Potential", icon: Handshake, iconBg: "bg-green-50", iconColor: "text-green-600", trend: "12%", trendUp: true },
  { label: "Quotes", value: "8", sub: "Awaiting Approval", context: "$84,000 Pipeline", icon: FileText, iconBg: "bg-amber-50", iconColor: "text-amber-600", trend: "5%", trendUp: true },
  { label: "Shipments", value: "3", sub: "In Transit", context: "All on schedule", icon: Ship, iconBg: "bg-blue-50", iconColor: "text-blue-600", trend: "0%", trendUp: true },
  { label: "Payments", value: "$42K", sub: "Outstanding", context: "$86K Paid", icon: DollarSign, iconBg: "bg-green-50", iconColor: "text-green-600", trend: "8%", trendUp: false },
];

const mockActivities = [
  { time: "10:24 AM", text: "Marcus Coffee accepted Quote V2", badge: "Deal", badgeBg: "bg-green-50", badgeColor: "text-green-700", dot: "bg-green-500" },
  { time: "Yesterday", text: "Contract CT-2026-0003 signed by buyer", badge: "Contract", badgeBg: "bg-purple-50", badgeColor: "text-purple-700", dot: "bg-purple-500" },
  { time: "Yesterday", text: "Payment received: $12,800 from Falcon UK", badge: "Payment", badgeBg: "bg-blue-50", badgeColor: "text-blue-700", dot: "bg-blue-500" },
  { time: "2 days ago", text: "Shipment CT-2026-001 departed Djibouti", badge: "Shipment", badgeBg: "bg-gray-100", badgeColor: "text-gray-700", dot: "bg-gray-500" },
  { time: "3 days ago", text: "AI generated Quote V3 for Aurora Coffee", badge: "AI", badgeBg: "bg-indigo-50", badgeColor: "text-indigo-700", dot: "bg-indigo-500" },
];

const mockShipments = [
  { id: "CT-2026-001", dest: "Hamburg", flag: "🇩🇪", status: "In Transit", statusColor: "text-blue-600", statusBg: "bg-blue-50", eta: "2 days", progress: 68 },
  { id: "CT-2026-002", dest: "Antwerp", flag: "🇧🇪", status: "Departed", statusColor: "text-amber-600", statusBg: "bg-amber-50", eta: "5 days", progress: 20 },
  { id: "CT-2026-003", dest: "Trieste", flag: "🇮🇹", status: "On Schedule", statusColor: "text-green-600", statusBg: "bg-green-50", eta: "10 days", progress: 10 },
];

function DashboardPage() {
  // ─── Live data from backend ───
  const [dashboardData, setDashboardData] = useState<{
    priorities: typeof mockPriorities;
    stages: typeof mockStages;
    kpis: typeof mockKpis;
    activities: typeof mockActivities;
    shipments: typeof mockShipments;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.data) {
          const d = data.data;
          // Map API kpis (which have icon as string) to use real icon components
          const iconMap: Record<string, any> = {
            Handshake,
            FileText,
            Users,
            DollarSign,
            Ship,
          };
          const mappedKpis = (d.kpis || []).map((k: any) => ({
            ...k,
            icon: iconMap[k.icon] || Handshake,
          }));
          setDashboardData({
            priorities: d.priorities?.length > 0 ? d.priorities : mockPriorities,
            stages: d.stages?.length > 0 ? d.stages : mockStages,
            kpis: mappedKpis.length > 0 ? mappedKpis : mockKpis,
            activities: d.activities?.length > 0 ? d.activities : mockActivities,
            shipments: d.shipments?.length > 0 ? d.shipments : mockShipments,
          });
        } else {
          setDashboardData({
            priorities: mockPriorities,
            stages: mockStages,
            kpis: mockKpis,
            activities: mockActivities,
            shipments: mockShipments,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[DashboardPage] API fetch failed, using mock data:", err);
        setDashboardData({
          priorities: mockPriorities,
          stages: mockStages,
          kpis: mockKpis,
          activities: mockActivities,
          shipments: mockShipments,
        });
      });
    return () => { cancelled = true; };
  }, []);

  // Loading state
  if (!dashboardData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Good Morning, Abi <span className="inline-block">👋</span></h1>
          <p className="text-sm text-gray-500 mt-2">Loading dashboard data…</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Fetching live data from database…</p>
        </div>
      </main>
    );
  }

  const { priorities, stages, kpis, activities, shipments } = dashboardData;

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Good Morning, Abi <span className="inline-block">👋</span></h1>
        <p className="text-sm text-gray-500 mt-2">You have <span className="font-semibold text-gray-900">{priorities.length} priority tasks</span> and <span className="font-semibold text-green-600">{kpis[3]?.value}</span> in active pipeline.</p>
      </div>

      {/* Priorities + AI Coach */}
      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-gray-900">Today&apos;s Priorities</h3>
            <span className="text-xs text-gray-400">4 high · 8 normal</span>
          </div>
          <p className="text-sm text-gray-500 mb-5">Focus on these first.</p>
          <div className="space-y-1">
            {priorities.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", p.color)}>{p.num}</span>
                <span className="flex-1 text-sm text-gray-800">{p.text}</span>
                <span className="text-xs text-gray-400">{p.time}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500"><Sparkles className="h-4 w-4 text-white" /></div>
            <h3 className="text-lg font-semibold text-gray-900">AI Coach — Morning Brief</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-white/70 p-3 border border-indigo-100">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" strokeWidth={1.5} />
              <div className="flex-1">
                <p className="text-sm text-gray-800 leading-relaxed">You have <span className="font-semibold">3 deals at risk</span>. I recommend calling Falcon Coffee first.</p>
                <p className="text-xs text-gray-500 mt-1">Probability of closing: 78%</p>
              </div>
              <button className="shrink-0 flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 transition-colors"><Phone className="h-3 w-3" /> Call</button>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-white/70 p-3 border border-indigo-100">
              <Mail className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" strokeWidth={1.5} />
              <p className="flex-1 text-sm text-gray-800 leading-relaxed">Marcus Coffee asked for pricing 2h ago. Don&apos;t lose momentum — I drafted a reply for you.</p>
              <button className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors">Review</button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
            <input type="text" placeholder="Ask AI anything..." className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none px-2" />
            <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-600 transition-colors"><ArrowRight className="h-4 w-4 text-white" /></button>
          </div>
        </div>
      </div>

      {/* Revenue Hero */}
      <div className="mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-gray-500">Revenue This Month</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 tracking-tight">$86,450</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="flex items-center gap-0.5 text-sm font-semibold text-green-600"><ArrowUp className="h-3.5 w-3.5" /> +$12,300</span>
                <span className="text-xs text-gray-400">vs last month</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[13px] font-medium text-gray-500">Commission Earned</p>
              <p className="mt-1 text-2xl font-bold text-green-600 tracking-tight">$2,480</p>
              <p className="text-xs text-gray-400 mt-1">↑ 24% vs last month</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        {kpis.map((c, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", c.iconBg)}><c.icon className={cn("h-5 w-5", c.iconColor)} strokeWidth={1.5} /></div>
              <span className={cn("flex items-center gap-0.5 text-xs font-semibold", c.trendUp ? "text-green-600" : "text-amber-600")}><ArrowUp className="h-3 w-3" /> {c.trend}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{c.value}</p>
            <p className="text-[13px] font-medium text-gray-700 mt-0.5">{c.label} <span className="text-gray-400 font-normal">— {c.sub}</span></p>
            <p className="text-xs text-gray-400 mt-1">{c.context}</p>
          </div>
        ))}
      </div>

      {/* Pipeline (full width) */}
      <div className="mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Pipeline</h3>
          <p className="text-sm text-gray-500 mb-6">From lead to completed deal.</p>
          <div className="flex items-center justify-between overflow-x-auto pb-2">
            {stages.map((s, i) => (
              <div key={i} className="flex items-center shrink-0">
                <div className="flex flex-col items-center gap-1 w-20">
                  <div className={cn("flex h-14 w-14 items-center justify-center rounded-full text-white text-lg font-bold", s.color)}>{s.count}</div>
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{s.label}</span>
                  <span className="text-[10px] text-gray-400">{s.value}</span>
                </div>
                {i < stages.length - 1 && (<div className="flex items-center mx-1 mb-8"><div className="h-px w-5 bg-gray-200" /><ChevronRight className="h-3 w-3 text-gray-300" /></div>)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deal Health + Business Health + Shipments (3 columns) */}
      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
        {/* Deal Health */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Deal Health</h3>
          <div className="space-y-2">
            <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-gray-50 transition-colors">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-gray-700 flex-1 text-left">Healthy</span>
              <span className="text-lg font-bold text-gray-900">12</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-gray-50 transition-colors">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-sm font-medium text-gray-700 flex-1 text-left">Waiting</span>
              <span className="text-lg font-bold text-gray-900">3</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-red-50 transition-colors">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-red-700 flex-1 text-left">At Risk</span>
              <span className="text-lg font-bold text-red-600">2</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
          </div>
        </div>

        {/* Business Health */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Business Health</h3>
            <span className="text-xs font-medium text-green-600 flex items-center gap-0.5"><ArrowUp className="h-3 w-3" /> +12%</span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="text-3xl font-bold text-gray-900">92</div>
            <div>
              <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className={cn("h-3.5 w-3.5", s <= 4 ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200")} />)}</div>
              <p className="text-xs text-green-600 font-medium mt-0.5">Excellent</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Revenue", score: 95, color: "bg-green-500" },
              { label: "Sales", score: 88, color: "bg-green-500" },
              { label: "Compliance", score: 90, color: "bg-green-500" },
              { label: "Cash Flow", score: 85, color: "bg-amber-500" },
              { label: "Response Time", score: 92, color: "bg-green-500" },
              { label: "Inventory", score: 78, color: "bg-amber-500" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">{item.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100"><div className={cn("h-1.5 rounded-full", item.color)} style={{ width: `${item.score}%` }} /></div>
                <span className="text-xs font-medium text-gray-700 w-7 text-right">{item.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Shipments */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Shipments</h3>
            <button className="text-xs font-medium text-gray-600 hover:underline">View all →</button>
          </div>
          <div className="space-y-4">
            {shipments.map((s, i) => (
              <div key={i} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-gray-900">{s.id}</span>
                  <span className={cn("rounded px-2 py-0.5 text-xs font-medium", s.statusBg, s.statusColor)}>{s.status}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">🇪🇹 Addis</span>
                  <div className="flex-1 relative h-1.5 rounded-full bg-gray-100">
                    <div className="absolute h-1.5 rounded-full bg-[#4A3520]" style={{ width: `${s.progress}%` }} />
                    <Ship className="absolute top-1/2 -translate-y-1/2 h-3 w-3 text-[#4A3520]" style={{ left: `calc(${s.progress}% - 6px)` }} />
                  </div>
                  <span className="text-xs text-gray-500">{s.flag} {s.dest}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-400">{s.progress}% complete</span>
                  <span className="text-xs text-gray-400">ETA: {s.eta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <button className="text-xs font-medium text-gray-600 hover:underline">View all →</button>
          </div>
          <div className="relative">
            {activities.map((a, i) => (
              <div key={i} className="relative flex items-start gap-4 pb-5 last:pb-0">
                {i < activities.length - 1 && <div className="absolute left-[7px] top-5 bottom-0 w-px bg-gray-200" />}
                <div className={cn("relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-white", a.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{a.time}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{a.text}</p>
                </div>
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", a.badgeBg, a.badgeColor)}>{a.badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="mt-8 flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">© 2026 Coffee Export ERP</p>
        <p className="text-xs text-gray-400">Made with ❤️ in Ethiopia 🇪🇹</p>
      </footer>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// INBOX PAGE — Original detailed version
// ═══════════════════════════════════════════════════════════
// Mock inbox data — used as fallback when /api/inbox is unreachable.
const mockConversations = [
  { id: 1, buyer: "buyer-47@", subject: "Re: Ethiopian 25/26 Yirgacheffe", preview: "Can you send cupping scores for Guji? Need 320 bags FOB Hamburg ASAP.", time: "2h ago", unread: true, priority: "high", intent: "sample_request", confidence: 94 },
  { id: 2, buyer: "buyer-12@", subject: "Re: Quote QU-2026-0004-V2", preview: "Can you do $0.062/kg CIF instead of FOB?", time: "5h ago", unread: true, priority: "high", intent: "counter_offer", confidence: 96 },
  { id: 3, buyer: "buyer-3@", subject: "Re: Contract CT-2026-0003", preview: "We confirm and accept the terms. Please proceed with signing.", time: "1d ago", unread: true, priority: "medium", intent: "confirmation", confidence: 91 },
  { id: 4, buyer: "buyer-8@", subject: "Sample received — feedback", preview: "The Guji washed scored 86.5. We'd like to proceed to contract.", time: "2d ago", unread: false, priority: "medium", intent: "positive", confidence: 88 },
  { id: 5, buyer: "buyer-21@", subject: "Re: Shipment delay", preview: "When can we expect the container to arrive in Antwerp?", time: "3d ago", unread: false, priority: "low", intent: "logistics_question", confidence: 85 },
  { id: 6, buyer: "buyer-5@", subject: "Out of office", preview: "I will be back in the office on Monday. Please expect a delay in my response.", time: "4d ago", unread: false, priority: "low", intent: "auto_reply", confidence: 99 },
];

const mockMessages = [
  { direction: "outbound", from: "marcus.bell@", subject: "Ethiopian 25/26 Yirgacheffe — first container spot", body: "Hi,\n\nFollowing up on our LinkedIn exchange. We have 25/26 Yirgacheffe lots available now with full EUDR data packs.\n\nWould you have 20 minutes this week for a quick call?\n\nBest", time: "Yesterday 4:30 PM" },
  { direction: "inbound", from: "buyer-47@", subject: "Re: Ethiopian 25/26 Yirgacheffe — first container spot", body: "Hi,\n\nThanks for the note. Looks interesting — can you send me the cupping scores for the Guji lots too? And what's your earliest FOB Djibouti date?\n\nI could do a call next Tuesday at 14:00 CET.\n\nKonrad", time: "Today 10:24 AM", ai: { classification: "question", summary: "Buyer interested in Yirgacheffe and requests cupping scores for Guji", intent: "sample_request", volume: 320, origin: "Guji", destination: "Hamburg", incoterm: "FOB", urgency: "High", nextAction: "Send Cupping Scores" } },
];

function InboxPage() {
  const [selectedConv, setSelectedConv] = useState(1);
  const [replyText, setReplyText] = useState("");
  const [conversations, setConversations] = useState<typeof mockConversations | null>(null);
  const [messages, setMessages] = useState<typeof mockMessages | null>(null);

  // ─── Live data from backend ───
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox")
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.conversations) && data.conversations.length > 0) {
          setConversations(data.conversations);
          setMessages(data.messages || mockMessages);
        } else {
          setConversations(mockConversations);
          setMessages(mockMessages);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[InboxPage] API fetch failed, using mock data:", err);
        setConversations(mockConversations);
        setMessages(mockMessages);
      });
    return () => { cancelled = true; };
  }, []);

  // Loading state
  if (!conversations || !messages) {
    return (
      <main className="flex h-[calc(100vh-4rem)]">
        <div className="w-[360px] border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Inbox</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-[#FAFAF9]">
          <p className="text-sm text-gray-500">Loading messages from database…</p>
        </div>
      </main>
    );
  }

  const conv = conversations.find(c => c.id === selectedConv) || conversations[0];

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      {/* Conversation List */}
      <div className="w-[360px] border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Inbox</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
              <input type="text" placeholder="Search conversations..." className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-gray-300 focus:outline-none" />
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"><Filter className="h-4 w-4 text-gray-500" strokeWidth={1.5} /></button>
          </div>
          <div className="flex gap-1 mt-3">
            {["All", "Unread", "High Priority", "AI Drafted"].map((tab, i) => (
              <button key={tab} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", i === 0 ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100")}>{tab}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedConv(c.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b border-gray-50 p-4 text-left transition-colors",
                selectedConv === c.id ? "bg-indigo-50/50" : "hover:bg-gray-50"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {c.unread && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                  <span className="text-sm font-semibold text-gray-900">{c.buyer}faithelexport.com</span>
                </div>
                <span className="text-xs text-gray-400">{c.time}</span>
              </div>
              <p className="text-xs text-gray-600 truncate pl-4">{c.subject}</p>
              <p className="text-xs text-gray-400 truncate pl-4">{c.preview}</p>
              <div className="flex items-center gap-1.5 mt-1 pl-4">
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                  c.intent === "sample_request" ? "bg-amber-50 text-amber-700" :
                  c.intent === "counter_offer" ? "bg-purple-50 text-purple-700" :
                  c.intent === "confirmation" ? "bg-green-50 text-green-700" :
                  c.intent === "positive" ? "bg-green-50 text-green-700" :
                  c.intent === "logistics_question" ? "bg-blue-50 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {c.intent.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-gray-400">AI: {c.confidence}%</span>
                {c.priority === "high" && <span className="text-[10px] font-semibold text-red-600">● HIGH</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Message View */}
      <div className="flex-1 flex flex-col bg-[#FAFAF9]">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{conv.subject}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Buyer: {conv.buyer}faithelexport.com · Lead: L-2026-00507 · Status: Awaiting Exporter</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Archive className="h-3.5 w-3.5" /> Archive</button>
            <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><MoreHorizontal className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[70%] rounded-xl p-4",
                m.direction === "outbound" ? "bg-[#4A3520] text-white" : "bg-white border border-gray-200 text-gray-800"
              )}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium opacity-70">{m.direction === "outbound" ? `You (${m.from}faithelexport.com)` : m.from + "faithelexport.com"}</span>
                  <span className="text-xs opacity-50">·</span>
                  <span className="text-xs opacity-50">{m.time}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</p>

                {m.ai && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.5} />
                      <span className="text-xs font-semibold text-indigo-600">AI TRIAGE</span>
                    </div>
                    <div className="bg-indigo-50/50 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-gray-700"><span className="font-semibold">Summary:</span> {m.ai.summary}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-gray-400">Intent:</span> <span className="font-medium text-gray-800">{m.ai.intent.replace(/_/g, " ")}</span></div>
                        <div><span className="text-gray-400">Urgency:</span> <span className="font-medium text-red-600">{m.ai.urgency}</span></div>
                        {m.ai.volume && <div><span className="text-gray-400">Volume:</span> <span className="font-medium text-gray-800">{m.ai.volume} bags</span></div>}
                        {m.ai.origin && <div><span className="text-gray-400">Origin:</span> <span className="font-medium text-gray-800">{m.ai.origin}</span></div>}
                        {m.ai.destination && <div><span className="text-gray-400">Destination:</span> <span className="font-medium text-gray-800">{m.ai.destination}</span></div>}
                        {m.ai.incoterm && <div><span className="text-gray-400">Incoterm:</span> <span className="font-medium text-gray-800">{m.ai.incoterm}</span></div>}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs font-semibold text-indigo-600">→ {m.ai.nextAction}</span>
                        <button className="ml-auto rounded-md bg-indigo-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-600">Auto-Action</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 bg-white p-4">
          <div className="rounded-xl border border-gray-200">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your reply to buyer..."
              className="w-full resize-none rounded-t-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
              rows={3}
            />
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"><Paperclip className="h-3.5 w-3.5" /> Attach</button>
                <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Sparkles className="h-3.5 w-3.5" /> AI Draft</button>
                <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Sparkles className="h-3.5 w-3.5" /> Improve</button>
                <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Sparkles className="h-3.5 w-3.5" /> Translate</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Reply from: marcus.bell@faithelexport.com</span>
                <button
                  onClick={() => setReplyText("")}
                  className="rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// LEADS PAGE — "Who should I sell to?"
// ═══════════════════════════════════════════════════════════
// Mock leads data — used as fallback when /api/leads is unreachable.
// Real data is fetched at runtime from the backend SQLite database.
const mockLeadsData = [
  { id: "L-2026-00501", company: "Marcus Coffee GmbH", country: "Germany", city: "Hamburg", tier: "S", vp: "VP1", state: "QUALIFIED", language: "EN", score: 92, lastTouch: "2h ago", tags: ["specialty", "EU"], enriched: true },
  { id: "L-2026-00502", company: "Falcon Coffee UK", country: "United Kingdom", city: "London", tier: "A", vp: "VP2", state: "IN_SEQUENCE", language: "EN", score: 85, lastTouch: "5h ago", tags: ["commercial", "UK"], enriched: true },
  { id: "L-2026-00503", company: "Hashimoto Coffee", country: "Japan", city: "Tokyo", tier: "S", vp: "VP3", state: "SAMPLE_DISPATCHED", language: "JA", score: 88, lastTouch: "1d ago", tags: ["specialty", "Asia"], enriched: true },
  { id: "L-2026-00504", company: "Aurora Imports", country: "Italy", city: "Trieste", tier: "A", vp: "VP1", state: "IN_SEQUENCE", language: "IT", score: 79, lastTouch: "2d ago", tags: ["commercial", "EU"], enriched: true },
  { id: "L-2026-00505", company: "Nordic Bean Co", country: "Sweden", city: "Stockholm", tier: "B", vp: "VP2", state: "ENRICHED", language: "EN", score: 72, lastTouch: "3d ago", tags: ["specialty", "EU"], enriched: true },
  { id: "L-2026-00506", company: "Café de Paris", country: "France", city: "Paris", tier: "A", vp: "VP1", state: "NEW", language: "FR", score: 0, lastTouch: "Never", tags: [], enriched: false },
  { id: "L-2026-00507", company: "Blue Mountain Traders", country: "USA", city: "New York", tier: "S", vp: "VP4", state: "CONTRACTED", language: "EN", score: 95, lastTouch: "Yesterday", tags: ["specialty", "US"], enriched: true },
  { id: "L-2026-00508", company: "Rösterei Berlin", country: "Germany", city: "Berlin", tier: "B", vp: "VP2", state: "GHOSTED", language: "DE", score: 65, lastTouch: "8d ago", tags: ["specialty", "EU"], enriched: true },
  { id: "L-2026-00509", company: "Seoul Coffee Lab", country: "South Korea", city: "Seoul", tier: "A", vp: "VP3", state: "ENRICHED", language: "KO", score: 81, lastTouch: "4d ago", tags: ["specialty", "Asia"], enriched: true },
  { id: "L-2026-00510", company: "Antwerp Trading", country: "Belgium", city: "Antwerp", tier: "C", vp: "VP2", state: "NEW", language: "EN", score: 0, lastTouch: "Never", tags: [], enriched: false },
];

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

function LeadsPage() {
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
  const [leadsData, setLeadsData] = useState<typeof mockLeadsData | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const refetchLeads = () => {
    fetch("/api/leads")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok && Array.isArray(data.leads) && data.leads.length > 0) setLeadsData(data.leads);
        else setLeadsData(mockLeadsData);
      })
      .catch(() => setLeadsData(mockLeadsData));
  };

  useEffect(() => {
    refetchLeads();
  }, []);

  // ─── Lead Research handler ───
  const handleResearch = () => {
    setResearching(true);
    setResearchResult(null);
    fetch("/api/agents/research-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

// ═══════════════════════════════════════════════════════════
// DEALS PAGE — "Where is every opportunity?"
// ═══════════════════════════════════════════════════════════
// Mock deals data — used as fallback when /api/deals is unreachable.
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

function DealsPage() {
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
          setDealsData(mockDealsData);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[DealsPage] API fetch failed, using mock data:", err);
        setDealsData(mockDealsData);
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

// ═══════════════════════════════════════════════════════════
// INVENTORY PAGE — "What coffee can I sell?"
// ═══════════════════════════════════════════════════════════
const lotsData = [
  { id: "LOT-25-0001", region: "Yirgacheffe", station: "Konga Station", coop: "Konga Coop", process: "Washed", score: 87.5, screen: 14, stock: 85, cropYear: "25/26", eudr: "complete", certifications: ["Organic", "Fairtrade"], status: "active" },
  { id: "LOT-25-0002", region: "Yirgacheffe", station: "Biloya Station", coop: "Biloya Coop", process: "Natural", score: 88.0, screen: 15, stock: 60, cropYear: "25/26", eudr: "complete", certifications: ["Organic"], status: "active" },
  { id: "LOT-25-0003", region: "Guji", station: "Shakisso Station", coop: "Shakisso Coop", process: "Washed", score: 86.5, screen: 14, stock: 45, cropYear: "25/26", eudr: "complete", certifications: [], status: "active" },
  { id: "LOT-25-0004", region: "Guji", station: "Shakisso Station", coop: "Shakisso Coop", process: "Natural", score: 85.0, screen: 14, stock: 30, cropYear: "25/26", eudr: "partial", certifications: [], status: "active" },
  { id: "LOT-25-0005", region: "Sidamo", station: "Bensa Station", coop: "Bensa Coop", process: "Washed", score: 84.5, screen: 14, stock: 12, cropYear: "25/26", eudr: "complete", certifications: ["Fairtrade"], status: "active" },
  { id: "LOT-25-0006", region: "Sidamo", station: "Bensa Station", coop: "Bensa Coop", process: "Natural", score: 83.0, screen: 13, stock: 0, cropYear: "25/26", eudr: "missing", certifications: [], status: "depleted" },
  { id: "LOT-25-0007", region: "Limu", station: "Limu Station", coop: "Limu Coop", process: "Washed", score: 82.0, screen: 14, stock: 50, cropYear: "25/26", eudr: "partial", certifications: [], status: "active" },
  { id: "LOT-25-0008", region: "Harrar", station: "Harrar Station", coop: "Harrar Coop", process: "Natural", score: 84.0, screen: 15, stock: 25, cropYear: "25/26", eudr: "missing", certifications: [], status: "hold" },
];

const eudrConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  complete: { label: "Complete", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  partial: { label: "Partial", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  missing: { label: "Missing", bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: "Active", bg: "bg-green-50", text: "text-green-700" },
  depleted: { label: "Depleted", bg: "bg-gray-100", text: "text-gray-500" },
  hold: { label: "On Hold", bg: "bg-amber-50", text: "text-amber-700" },
};

const regionColors: Record<string, string> = {
  Yirgacheffe: "bg-purple-100 text-purple-700",
  Guji: "bg-blue-100 text-blue-700",
  Sidamo: "bg-green-100 text-green-700",
  Limu: "bg-teal-100 text-teal-700",
  Harrar: "bg-orange-100 text-orange-700",
};

function InventoryPage() {
  const [filterRegion, setFilterRegion] = useState("All");
  const [filterEudr, setFilterEudr] = useState("All");

  // ─── Inventory upload state ───
  const [showUpload, setShowUpload] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const regions = ["All", "Yirgacheffe", "Guji", "Sidamo", "Limu", "Harrar"];
  const eudrFilters = ["All", "Complete", "Partial", "Missing"];

  const filteredLots = lotsData.filter(lot => {
    const regionMatch = filterRegion === "All" || lot.region === filterRegion;
    const eudrMatch = filterEudr === "All" || lot.eudr === filterEudr.toLowerCase();
    return regionMatch && eudrMatch;
  });

  const totalStock = lotsData.reduce((sum, l) => sum + l.stock, 0);
  const activeLots = lotsData.filter(l => l.status === "active").length;
  const eudrComplete = lotsData.filter(l => l.eudr === "complete").length;
  const lowStock = lotsData.filter(l => l.stock > 0 && l.stock < 20).length;

  // ─── Inventory upload handler ───
  const handleUpload = () => {
    setUploading(true);
    setUploadResult(null);
    fetch("/api/inventory/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
    })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok) {
          setUploadResult(`✓ Agent 1 created ${data.created} new lots in inventory`);
          setCsvText("");
        } else {
          setUploadResult(`✗ Error: ${data.error}`);
        }
      })
      .catch((err) => setUploadResult(`✗ Failed: ${err.message}`))
      .finally(() => setUploading(false));
  };

  const sampleCsv = `region,washing_station_name,coop_name,process,screen_size,cupping_score,crop_year,stock_bags_remaining,certifications,eudr_data_status,eudr_gps_lat,eudr_gps_lon,eudr_farmgate_price_etb_per_kg
Yirgacheffe,Konga Station,Yirgacheffe Union,Washed,14,87.5,25/26,45,organic,complete,6.1627,38.1964,28.5
Guji,Hambela Station,Hambela Co-op,Washed,15,86.8,25/26,60,organic;FT,complete,5.9847,38.2856,27.5`;

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">What coffee can I sell?</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowUpload(true); setUploadResult(null); }} className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
            <Upload className="h-4 w-4" /> Upload Inventory
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
            <Plus className="h-4 w-4" /> Add Lot
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total Stock</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalStock} <span className="text-sm font-normal text-gray-400">bags</span></p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Lots</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{activeLots}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">EUDR Complete</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{eudrComplete}<span className="text-sm font-normal text-gray-400">/{lotsData.length}</span></p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Low Stock</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{lowStock}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 mr-1">Region:</span>
            {regions.map(r => (
              <button
                key={r}
                onClick={() => setFilterRegion(r)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", filterRegion === r ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100")}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 mr-1">EUDR:</span>
            {eudrFilters.map(e => (
              <button
                key={e}
                onClick={() => setFilterEudr(e)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", filterEudr === e ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100")}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-gray-400">{filteredLots.length} lots</span>
      </div>

      {/* Lot Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredLots.map((lot) => {
          const ec = eudrConfig[lot.eudr];
          const sc = statusConfig[lot.status];
          const rc = regionColors[lot.region] || "bg-gray-100 text-gray-600";
          return (
            <div key={lot.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", rc)}>{lot.region}</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{lot.process}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">{lot.id} · {lot.station}</p>
                </div>
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>{sc.label}</span>
              </div>

              {/* Cupping Score */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
                  <span className="text-lg font-bold text-amber-600">{lot.score}</span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cupping Score</p>
                  <p className="text-xs text-gray-500 mt-0.5">Screen {lot.screen} · Crop {lot.cropYear}</p>
                </div>
              </div>

              {/* Stock bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-500">Stock</span>
                  <span className={cn("text-sm font-bold", lot.stock === 0 ? "text-gray-400" : lot.stock < 20 ? "text-amber-600" : "text-gray-900")}>
                    {lot.stock} bags
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className={cn("h-2 rounded-full transition-all", lot.stock === 0 ? "bg-gray-200" : lot.stock < 20 ? "bg-amber-500" : "bg-green-500")}
                    style={{ width: `${Math.min((lot.stock / 100) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* EUDR + Certifications */}
              <div className="flex items-center justify-between">
                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", ec.bg, ec.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", ec.dot)} />
                  EUDR {ec.label}
                </span>
                <div className="flex gap-1">
                  {lot.certifications.map((cert, ci) => (
                    <span key={ci} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{cert}</span>
                  ))}
                  {lot.certifications.length === 0 && <span className="text-[10px] text-gray-300">No certs</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Insight banner */}
      <div className="mt-6 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 shrink-0">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-600 mb-1">AI Inventory Insight</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              Guji Washed stock is running low (45 bags). You have 2 active deals requiring Guji lots totaling 620 bags.
              Consider restocking from Shakisso Coop before committing to new quotes.
              EUDR compliance is missing for 2 lots — required for all EU shipments.
            </p>
            <button className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
              View restocking recommendations <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => !uploading && setShowUpload(false)}>
          <div className="w-[560px] rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                  <Upload className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Agent 1 — Upload Inventory</h3>
                  <p className="text-xs text-gray-500">Paste CSV data to create coffee lots</p>
                </div>
              </div>
              {!uploading && <button onClick={() => setShowUpload(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>}
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">CSV Data</label>
                  <button onClick={() => setCsvText(sampleCsv)} className="text-[11px] font-medium text-indigo-600 hover:underline">Load Sample Data</button>
                </div>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  disabled={uploading}
                  placeholder="region,washing_station_name,coop_name,process,screen_size,cupping_score,..."
                  rows={8}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 resize-none"
                />
                <p className="text-[11px] text-gray-400 mt-1">Columns: region, washing_station_name, coop_name, process, screen_size, cupping_score, crop_year, stock_bags_remaining, certifications, eudr_data_status, eudr_gps_lat, eudr_gps_lon, eudr_farmgate_price_etb_per_kg</p>
              </div>
              {uploadResult && (
                <div className={cn("rounded-lg p-3 text-sm", uploadResult.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>{uploadResult}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowUpload(false)} disabled={uploading} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">Close</button>
                <button onClick={handleUpload} disabled={uploading || !csvText.trim()} className="flex items-center gap-2 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60">
                  {uploading ? (<><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</>) : (<><Upload className="h-4 w-4" /> Upload & Create Lots</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// SAMPLES PAGE — "Which samples are moving?"
// ═══════════════════════════════════════════════════════════
const samplesData = [
  { id: "SR-2026-0001", lead: "Marcus Coffee GmbH", leadId: "L-2026-00501", lots: ["LOT-25-0001 (Yirgacheffe)", "LOT-25-0003 (Guji)"], type: "350g", status: "delivered", dispatched: "Jul 10", delivered: "Jul 14", feedback: "Yirgacheffe scored 87.5 — excellent. Guji pending.", score: 87.5, decision: "approved", budget: "used" },
  { id: "SR-2026-0002", lead: "Falcon Coffee UK", leadId: "L-2026-00502", lots: ["LOT-25-0002 (Yirgacheffe Natural)"], type: "350g", status: "dispatched", dispatched: "Jul 16", delivered: null, feedback: null, score: null, decision: null, budget: "used" },
  { id: "SR-2026-0003", lead: "Hashimoto Coffee", leadId: "L-2026-00503", lots: ["LOT-25-0005 (Sidamo)", "LOT-25-0007 (Limu)"], type: "350g", status: "dispatched", dispatched: "Jul 18", delivered: null, feedback: null, score: null, decision: null, budget: "used" },
  { id: "SR-2026-0004", lead: "Aurora Imports", leadId: "L-2026-00504", lots: ["LOT-25-0004 (Guji Natural)"], type: "150g", status: "pending", dispatched: null, delivered: null, feedback: null, score: null, decision: null, budget: "used" },
  { id: "SR-2026-0005", lead: "Nordic Bean Co", leadId: "L-2026-00505", lots: ["LOT-25-0001 (Yirgacheffe)"], type: "350g", status: "feedback_due", dispatched: "Jul 5", delivered: "Jul 9", feedback: "No response in 7 days", score: null, decision: null, budget: "used" },
  { id: "SR-2026-0006", lead: "Blue Mountain Traders", leadId: "L-2026-00507", lots: ["LOT-25-0001 (Yirgacheffe)", "LOT-25-0003 (Guji)", "LOT-25-0005 (Sidamo)"], type: "350g", status: "decided", dispatched: "Jun 20", delivered: "Jun 25", feedback: "All lots approved. Proceeding to contract.", score: 88.0, decision: "approved", budget: "used" },
  { id: "SR-2026-0007", lead: "Rösterei Berlin", leadId: "L-2026-00508", lots: ["LOT-25-0004 (Guji Natural)"], type: "350g", status: "decided", dispatched: "Jun 15", delivered: "Jun 20", feedback: "Score too low. Looking for 86+ Guji.", score: 83.0, decision: "rejected", budget: "used" },
  { id: "SR-2026-0008", lead: "Seoul Coffee Lab", leadId: "L-2026-00509", lots: ["LOT-25-0003 (Guji)"], type: "350g", status: "pending", dispatched: null, delivered: null, feedback: null, score: null, decision: null, budget: "available" },
];

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

function SamplesPage() {
  const [filter, setFilter] = useState("All");
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

// ═══════════════════════════════════════════════════════════
// QUOTES PAGE — "Which quotes need approval?"
// ═══════════════════════════════════════════════════════════
type QuoteLineItem = {
  lotId: string;
  origin: string;
  process: string;
  grade: string;
  weightKg: number;
  pricePerKg: number;
  costPerKg: number;
};

type Quote = {
  id: string;
  lead: string;
  leadId: string;
  version: number;
  status: "ai_draft" | "pending_review" | "pending_approval" | "sent" | "accepted" | "rejected" | "revised" | "expired";
  incoterm: string;
  destination: string;
  currency: string;
  paymentTerms: string;
  validUntil: string;
  createdAt: string;
  sentAt: string | null;
  respondedAt: string | null;
  lines: QuoteLineItem[];
  freight: number;
  insurance: number;
  commissionPct: number;
  aiDrafted: boolean;
  aiConfidence: number;
  aiSuggestion: string;
  buyerNote: string | null;
  daysToExpiry: number | null;
};

const quotesData: Quote[] = [
  {
    id: "QU-2026-0004", lead: "Marcus Coffee GmbH", leadId: "L-2026-00501", version: 2,
    status: "pending_approval", incoterm: "CIF Hamburg", destination: "Hamburg, DE", currency: "USD",
    paymentTerms: "30% deposit · 70% against B/L copy", validUntil: "Aug 02", createdAt: "Jul 21", sentAt: null, respondedAt: null,
    lines: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", weightKg: 5000, pricePerKg: 7.20, costPerKg: 5.40 },
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", weightKg: 5000, pricePerKg: 6.85, costPerKg: 5.10 },
    ],
    freight: 1850, insurance: 420, commissionPct: 2,
    aiDrafted: true, aiConfidence: 92,
    aiSuggestion: "Margin of 22.4% is above target (20%). Yirgacheffe price bumped from V1's $7.05 to $7.20 based on buyer signal. Recommend approval and dispatch today — samples expire in 8 days.",
    buyerNote: null, daysToExpiry: 8,
  },
  {
    id: "QU-2026-0005", lead: "Falcon Coffee UK", leadId: "L-2026-00502", version: 1,
    status: "pending_review", incoterm: "FOB Djibouti", destination: "Felixstowe, UK", currency: "USD",
    paymentTerms: "LC at sight", validUntil: "Aug 05", createdAt: "Jul 22", sentAt: null, respondedAt: null,
    lines: [
      { lotId: "LOT-25-0002", origin: "Yirgacheffe", process: "Natural", grade: "G1", weightKg: 8000, pricePerKg: 6.95, costPerKg: 5.20 },
    ],
    freight: 0, insurance: 0, commissionPct: 2,
    aiDrafted: true, aiConfidence: 78,
    aiSuggestion: "Margin of 25.2% is healthy but Falcon historically negotiates 3-5% down. Consider pre-discounting to $6.75 to avoid round 2. Sample SR-2026-0002 is still in transit — send now while interest is hot.",
    buyerNote: null, daysToExpiry: 11,
  },
  {
    id: "QU-2026-0006", lead: "Hashimoto Coffee", leadId: "L-2026-00503", version: 3,
    status: "revised", incoterm: "CIF Yokohama", destination: "Yokohama, JP", currency: "USD",
    paymentTerms: "T/T 50/50", validUntil: "Jul 30", createdAt: "Jul 18", sentAt: "Jul 19", respondedAt: "Jul 23",
    lines: [
      { lotId: "LOT-25-0005", origin: "Sidamo", process: "Washed", grade: "G2", weightKg: 6000, pricePerKg: 6.40, costPerKg: 4.85 },
      { lotId: "LOT-25-0007", origin: "Limu", process: "Washed", grade: "G1", weightKg: 4000, pricePerKg: 6.20, costPerKg: 4.70 },
    ],
    freight: 2400, insurance: 510, commissionPct: 2,
    aiDrafted: true, aiConfidence: 68,
    aiSuggestion: "Buyer counter-offered at $6.10/$5.95 (4.7% under ask). Margin would compress to 14.8% — still above 12% floor. Recommend accepting the Sidamo price but holding Limu at $6.10 (Limu G1 is scarce).",
    buyerNote: "Price is 5% above market. Can you do $6.10 Sidamo / $5.95 Limu? Need answer by Friday.",
    daysToExpiry: 5,
  },
  {
    id: "QU-2026-0007", lead: "Aurora Imports", leadId: "L-2026-00504", version: 1,
    status: "ai_draft", incoterm: "CIF New York", destination: "New York, US", currency: "USD",
    paymentTerms: "30% deposit · 70% against B/L copy", validUntil: "Aug 08", createdAt: "Jul 24", sentAt: null, respondedAt: null,
    lines: [
      { lotId: "LOT-25-0004", origin: "Guji", process: "Natural", grade: "G1", weightKg: 3000, pricePerKg: 7.50, costPerKg: 5.60 },
    ],
    freight: 2100, insurance: 380, commissionPct: 2,
    aiDrafted: true, aiConfidence: 71,
    aiSuggestion: "Aurora is a new lead with no transaction history. Pricing at $7.50 is competitive vs. US market for G1 Guji Natural ($7.80 median). Margin 21.3%. Recommend adding a 2-week validity to create urgency.",
    buyerNote: null, daysToExpiry: 14,
  },
  {
    id: "QU-2026-0003", lead: "Blue Mountain Traders", leadId: "L-2026-00507", version: 1,
    status: "accepted", incoterm: "CIF Hamburg", destination: "Hamburg, DE", currency: "USD",
    paymentTerms: "LC at sight", validUntil: "Jul 25", createdAt: "Jul 12", sentAt: "Jul 13", respondedAt: "Jul 20",
    lines: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", weightKg: 6000, pricePerKg: 7.10, costPerKg: 5.40 },
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", weightKg: 6000, pricePerKg: 6.75, costPerKg: 5.10 },
      { lotId: "LOT-25-0005", origin: "Sidamo", process: "Washed", grade: "G2", weightKg: 4000, pricePerKg: 6.30, costPerKg: 4.85 },
    ],
    freight: 3200, insurance: 680, commissionPct: 2,
    aiDrafted: false, aiConfidence: 0,
    aiSuggestion: "Accepted in full on Jul 20. Contract CT-2026-0003 has been generated. Margin captured: 19.6%. Recommend proceeding to shipment scheduling immediately — buyer requested August vessel.",
    buyerNote: "All lots approved. Proceeding to contract.",
    daysToExpiry: 1,
  },
  {
    id: "QU-2026-0002", lead: "Rösterei Berlin", leadId: "L-2026-00508", version: 2,
    status: "rejected", incoterm: "FOB Djibouti", destination: "Hamburg, DE", currency: "USD",
    paymentTerms: "T/T 30 days", validUntil: "Jul 20", createdAt: "Jul 08", sentAt: "Jul 09", respondedAt: "Jul 15",
    lines: [
      { lotId: "LOT-25-0004", origin: "Guji", process: "Natural", grade: "G1", weightKg: 5000, pricePerKg: 7.80, costPerKg: 5.60 },
    ],
    freight: 0, insurance: 0, commissionPct: 2,
    aiDrafted: false, aiConfidence: 0,
    aiSuggestion: "Rejected after sample SR-2026-0007 scored 83.0 (target was 86+). Buyer is looking for premium Guji Natural. Review current Guji inventory for lots with 86+ cupping scores before re-quoting.",
    buyerNote: "Sample scored 83 — too low for our specialty line. Looking elsewhere for now.",
    daysToExpiry: -5,
  },
  {
    id: "QU-2026-0001", lead: "Nordic Bean Co", leadId: "L-2026-00505", version: 1,
    status: "expired", incoterm: "CIF Gothenburg", destination: "Gothenburg, SE", currency: "USD",
    paymentTerms: "LC at sight", validUntil: "Jul 10", createdAt: "Jun 25", sentAt: "Jun 26", respondedAt: null,
    lines: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", weightKg: 4000, pricePerKg: 7.00, costPerKg: 5.40 },
    ],
    freight: 1600, insurance: 360, commissionPct: 2,
    aiDrafted: false, aiConfidence: 0,
    aiSuggestion: "Expired with no response after 14 days. Buyer may have sourced elsewhere or lost interest. Recommend a breakup email in 30 days — Yirgacheffe LOT-25-0001 was later sold to Blue Mountain at $7.10.",
    buyerNote: null, daysToExpiry: -15,
  },
  {
    id: "QU-2026-0008", lead: "Seoul Coffee Lab", leadId: "L-2026-00509", version: 1,
    status: "sent", incoterm: "CIF Busan", destination: "Busan, KR", currency: "USD",
    paymentTerms: "T/T 50/50", validUntil: "Jul 31", createdAt: "Jul 18", sentAt: "Jul 20", respondedAt: null,
    lines: [
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", weightKg: 4000, pricePerKg: 6.90, costPerKg: 5.10 },
    ],
    freight: 1950, insurance: 410, commissionPct: 2,
    aiDrafted: true, aiConfidence: 84,
    aiSuggestion: "Sent 4 days ago, no response yet. Buyer's typical response time is 3-5 days. Suggest waiting 2 more days before follow-up — follow-up too early signals desperation.",
    buyerNote: null, daysToExpiry: 6,
  },
];

const quoteStatusConfig: Record<Quote["status"], { label: string; bg: string; text: string; dot: string }> = {
  ai_draft: { label: "AI Draft", bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  pending_review: { label: "Needs Review", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  pending_approval: { label: "Awaiting Approval", bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-600" },
  sent: { label: "Sent", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  accepted: { label: "Accepted", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  rejected: { label: "Rejected", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  revised: { label: "Buyer Revised", bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  expired: { label: "Expired", bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
};

function quoteTotals(q: Quote) {
  const linesSubtotal = q.lines.reduce((s, l) => s + l.weightKg * l.pricePerKg, 0);
  const lineCost = q.lines.reduce((s, l) => s + l.weightKg * l.costPerKg, 0);
  const totalKg = q.lines.reduce((s, l) => s + l.weightKg, 0);
  const total = linesSubtotal + q.freight + q.insurance;
  const commission = total * (q.commissionPct / 100);
  const grossMargin = total - lineCost - q.freight - q.insurance - commission;
  const marginPct = total > 0 ? (grossMargin / total) * 100 : 0;
  return { linesSubtotal, lineCost, totalKg, total, commission, grossMargin, marginPct };
}

function marginTier(pct: number) {
  if (pct >= 20) return { label: "Healthy", text: "text-green-600", bg: "bg-green-50", bar: "bg-green-500" };
  if (pct >= 12) return { label: "Thin", text: "text-amber-600", bg: "bg-amber-50", bar: "bg-amber-500" };
  return { label: "Risky", text: "text-red-600", bg: "bg-red-50", bar: "bg-red-500" };
}

// ─── Negotiation Simulator ─────────────────────────────────
// Lets the exporter model a buyer counter-offer in real-time.
// For each line item, drag the price → see margin impact instantly.
// Reference markers: Floor (12%), Target (20%), Stretch (25%).
function NegotiationSimulator({ quote }: { quote: Quote }) {
  // Initial slider state = current quote prices
  const [prices, setPrices] = useState<number[]>(quote.lines.map(l => l.pricePerKg));

  // Reset when quote changes
  useEffect(() => {
    setPrices(quote.lines.map(l => l.pricePerKg));
  }, [quote.id]);

  // Compute simulated margin
  const linesSubtotal = quote.lines.reduce((s, l, i) => s + l.weightKg * prices[i], 0);
  const lineCost = quote.lines.reduce((s, l) => s + l.weightKg * l.costPerKg, 0);
  const total = linesSubtotal + quote.freight + quote.insurance;
  const commission = total * (quote.commissionPct / 100);
  const grossMargin = total - lineCost - quote.freight - quote.insurance - commission;
  const marginPct = total > 0 ? (grossMargin / total) * 100 : 0;
  const mt = marginTier(marginPct);

  // Original margin for delta comparison
  const origLines = quote.lines.reduce((s, l) => s + l.weightKg * l.pricePerKg, 0);
  const origTotal = origLines + quote.freight + quote.insurance;
  const origCommission = origTotal * (quote.commissionPct / 100);
  const origMargin = origTotal - lineCost - quote.freight - quote.insurance - origCommission;
  const origMarginPct = origTotal > 0 ? (origMargin / origTotal) * 100 : 0;
  const deltaPct = marginPct - origMarginPct;
  const deltaTotal = total - origTotal;

  // Per-line reference prices
  const lineRefs = quote.lines.map(l => {
    // Per-line margin benchmarks (commission-adjusted, ignoring fixed costs for simplicity)
    const floorPrice = l.costPerKg / (1 - quote.commissionPct / 100) * 1.12; // 12% margin floor
    const targetPrice = l.costPerKg / (1 - quote.commissionPct / 100) * 1.20; // 20% margin target
    const stretchPrice = l.costPerKg / (1 - quote.commissionPct / 100) * 1.25; // 25% margin stretch
    const breakEven = l.costPerKg / (1 - quote.commissionPct / 100); // 0% margin (covers cost + commission)
    return { floorPrice, targetPrice, stretchPrice, breakEven };
  });

  return (
    <div className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50/50 to-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-600" strokeWidth={1.5} />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Negotiation Simulator</span>
        </div>
        <button
          onClick={() => setPrices(quote.lines.map(l => l.pricePerKg))}
          className="text-[10px] text-gray-400 hover:text-gray-700 font-medium"
        >
          Reset
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
        Drag each lot&apos;s price to model a counter-offer. Margin updates live. <span className="text-amber-700 font-medium">Floor = 12%</span> · <span className="text-green-600 font-medium">Target = 20%</span> · <span className="text-emerald-600 font-medium">Stretch = 25%</span>
      </p>

      {/* Per-line sliders */}
      <div className="space-y-3 mb-4">
        {quote.lines.map((l, i) => {
          const ref = lineRefs[i];
          const sliderMin = ref.breakEven * 0.95; // slightly below break-even for visibility
          const sliderMax = ref.stretchPrice * 1.10;
          const val = prices[i];
          const floorPct = ((ref.floorPrice - sliderMin) / (sliderMax - sliderMin)) * 100;
          const targetPct = ((ref.targetPrice - sliderMin) / (sliderMax - sliderMin)) * 100;
          const stretchPct = ((ref.stretchPrice - sliderMin) / (sliderMax - sliderMin)) * 100;
          const origPct = ((l.pricePerKg - sliderMin) / (sliderMax - sliderMin)) * 100;
          const lineDelta = val - l.pricePerKg;
          return (
            <div key={i} className="rounded-md bg-white border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-semibold text-gray-900">{l.lotId}</span>
                  <span className="text-[10px] text-gray-400 ml-1.5">{l.origin} {l.process}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-gray-900">${val.toFixed(2)}</span>
                  <span className="text-[10px] text-gray-400">/kg</span>
                  {lineDelta !== 0 && (
                    <span className={cn("ml-1.5 text-[10px] font-medium", lineDelta < 0 ? "text-red-600" : "text-green-600")}>
                      {lineDelta > 0 ? "+" : ""}{lineDelta.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              {/* Slider */}
              <div className="relative h-6 flex items-center">
                {/* Track background zones */}
                <div className="absolute inset-x-0 h-1.5 rounded-full overflow-hidden flex">
                  <div className="bg-red-100" style={{ width: `${floorPct}%` }} />
                  <div className="bg-amber-100" style={{ width: `${targetPct - floorPct}%` }} />
                  <div className="bg-green-100" style={{ width: `${stretchPct - targetPct}%` }} />
                  <div className="bg-emerald-100" style={{ width: `${100 - stretchPct}%` }} />
                </div>
                {/* Reference markers */}
                <div className="absolute top-0 bottom-0 w-px bg-amber-500" style={{ left: `${floorPct}%` }} title={`Floor $${ref.floorPrice.toFixed(2)}`} />
                <div className="absolute top-0 bottom-0 w-px bg-green-500" style={{ left: `${targetPct}%` }} title={`Target $${ref.targetPrice.toFixed(2)}`} />
                <div className="absolute top-0 bottom-0 w-px bg-emerald-500" style={{ left: `${stretchPct}%` }} title={`Stretch $${ref.stretchPrice.toFixed(2)}`} />
                {/* Original price marker (triangle) */}
                <div className="absolute -top-1 w-0 h-0" style={{
                  left: `${origPct}%`,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "5px solid #4A3520",
                  transform: "translateX(-50%)",
                }} title={`Original $${l.pricePerKg.toFixed(2)}`} />
                {/* Native range input on top */}
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={0.01}
                  value={val}
                  onChange={(e) => {
                    const newPrices = [...prices];
                    newPrices[i] = parseFloat(e.target.value);
                    setPrices(newPrices);
                  }}
                  className="relative w-full appearance-none bg-transparent cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2
                    [&::-webkit-slider-thumb]:border-amber-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
                    [&::-webkit-slider-thumb]:-mt-1.5
                    [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-amber-500 [&::-moz-range-thumb]:cursor-grab"
                  style={{ height: "6px" }}
                />
              </div>
              {/* Reference labels */}
              <div className="flex justify-between text-[9px] text-gray-400 mt-1.5">
                <span>Break-even ${ref.breakEven.toFixed(2)}</span>
                <span className="text-amber-600">Floor ${ref.floorPrice.toFixed(2)}</span>
                <span className="text-green-600">Target ${ref.targetPrice.toFixed(2)}</span>
                <span className="text-emerald-600">Stretch ${ref.stretchPrice.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulated margin result */}
      <div className="rounded-md bg-white border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Simulated Margin</span>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-xl font-bold", mt.text)}>{marginPct.toFixed(1)}%</span>
            {deltaPct !== 0 && (
              <span className={cn("text-[11px] font-medium", deltaPct < 0 ? "text-red-600" : "text-green-600")}>
                {deltaPct > 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}pp
              </span>
            )}
          </div>
        </div>
        {/* Margin bar */}
        <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={cn("h-full transition-all", mt.bar)} style={{ width: `${Math.min(marginPct * 3, 100)}%` }} />
          <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: "60%" }} title="Target 20%" />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
          <div className="rounded bg-gray-50 px-2 py-1.5">
            <span className="text-gray-400 block">New Total</span>
            <span className="font-semibold text-gray-900">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            {deltaTotal !== 0 && (
              <span className={cn("block text-[10px]", deltaTotal < 0 ? "text-red-600" : "text-green-600")}>
                {deltaTotal > 0 ? "+" : "-"}${Math.abs(deltaTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          <div className="rounded bg-gray-50 px-2 py-1.5">
            <span className="text-gray-400 block">Gross Profit</span>
            <span className={cn("font-semibold", mt.text)}>${grossMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="rounded bg-gray-50 px-2 py-1.5">
            <span className="text-gray-400 block">Verdict</span>
            <span className={cn("font-semibold", mt.text)}>{mt.label}</span>
          </div>
        </div>
        {/* Action button */}
        <button className="w-full mt-3 rounded-lg bg-[#4A3520] px-4 py-2 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={Math.abs(deltaPct) < 0.01}>
          Generate V{quote.version + 1} at these prices
        </button>
      </div>
    </div>
  );
}

function QuotesPage() {
  const [filter, setFilter] = useState("All");
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const filters = ["All", "AI Drafts", "Needs Review", "Awaiting Approval", "Sent", "Accepted", "Rejected", "Expired"];

  const filterMap: Record<string, Quote["status"] | null> = {
    "All": null, "AI Drafts": "ai_draft", "Needs Review": "pending_review",
    "Awaiting Approval": "pending_approval", "Sent": "sent", "Accepted": "accepted",
    "Rejected": "rejected", "Expired": "expired",
  };

  const filtered = filterMap[filter] === null
    ? quotesData
    : quotesData.filter(q => q.status === filterMap[filter]);

  const stats = {
    total: quotesData.length,
    needsAction: quotesData.filter(q => q.status === "ai_draft" || q.status === "pending_review" || q.status === "pending_approval" || q.status === "revised").length,
    inMarket: quotesData.filter(q => q.status === "sent").length,
    accepted: quotesData.filter(q => q.status === "accepted").length,
    pipeline: quotesData.filter(q => ["pending_approval", "pending_review", "ai_draft", "sent", "revised"].includes(q.status)).reduce((s, q) => s + quoteTotals(q).total, 0),
    avgMargin: (() => {
      const actionable = quotesData.filter(q => ["pending_approval", "pending_review", "ai_draft", "sent", "revised"].includes(q.status));
      if (actionable.length === 0) return 0;
      return actionable.reduce((s, q) => s + quoteTotals(q).marginPct, 0) / actionable.length;
    })(),
  };

  const selected = quotesData.find(q => q.id === selectedQuote);
  const urgentQuotes = quotesData.filter(q => q.daysToExpiry !== null && q.daysToExpiry > 0 && q.daysToExpiry <= 7 && ["sent", "pending_approval", "revised"].includes(q.status));

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quotes</h1>
          <p className="text-sm text-gray-500 mt-1">Which quotes need approval?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Sparkles className="h-4 w-4" /> New Quote (AI Draft)
        </button>
      </div>

      {/* AI Insight Banner */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
            <Bot className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-indigo-700">AI Coach</span>
              <span className="text-xs text-indigo-400">·</span>
              <span className="text-xs text-indigo-500">{stats.needsAction} quotes need your action</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {urgentQuotes.length > 0 ? (
                <>You have <span className="font-semibold text-gray-900">{urgentQuotes.length} quote{urgentQuotes.length > 1 ? "s" : ""} expiring within 7 days</span>. Highest priority: <span className="font-semibold text-gray-900">{urgentQuotes.sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))[0].id}</span> ({urgentQuotes[0].daysToExpiry}d). Average margin across active quotes is <span className="font-semibold text-green-600">{stats.avgMargin.toFixed(1)}%</span> — above the 20% target.</>
              ) : (
                <>All active quotes are healthy. Average margin is <span className="font-semibold text-green-600">{stats.avgMargin.toFixed(1)}%</span>. Consider sending the next batch of follow-ups for sent quotes that haven&apos;t had a response in 4+ days.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Quotes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">{stats.needsAction} need action</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">In Market</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.inMarket}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Awaiting buyer response</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${(stats.pipeline / 1000).toFixed(1)}K</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Across actionable quotes</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Avg Margin</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn("text-2xl font-bold", stats.avgMargin >= 20 ? "text-green-600" : stats.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{stats.avgMargin.toFixed(1)}%</p>
            <span className="text-[11px] text-gray-400">target 20%</span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {filters.map((f) => {
          const count = f === "All" ? quotesData.length : quotesData.filter(q => q.status === filterMap[f]).length;
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

      {/* Quote list */}
      <div className="space-y-3">
        {filtered.map((q) => {
          const sc = quoteStatusConfig[q.status];
          const t = quoteTotals(q);
          const mt = marginTier(t.marginPct);
          const isUrgent = q.daysToExpiry !== null && q.daysToExpiry > 0 && q.daysToExpiry <= 7 && ["sent", "pending_approval", "revised"].includes(q.status);
          return (
            <div
              key={q.id}
              onClick={() => setSelectedQuote(q.id)}
              className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300"
            >
              <div className="flex items-start gap-4">
                {/* Status indicator */}
                <div className="flex flex-col items-center gap-2 pt-1">
                  <span className={cn("h-3 w-3 rounded-full", sc.dot)} />
                  <div className="w-px flex-1 bg-gray-100" style={{ minHeight: "40px" }} />
                </div>

                {/* Main */}
                <div className="flex-1 min-w-0">
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{q.id}</span>
                      {q.version > 1 && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">V{q.version}</span>}
                      <span className="text-sm text-gray-600">{q.lead}</span>
                      {q.aiDrafted && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                          <Sparkles className="h-2.5 w-2.5" /> AI {q.aiConfidence}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isUrgent && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                          <Clock className="h-2.5 w-2.5" /> {q.daysToExpiry}d left
                        </span>
                      )}
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  {/* Line items */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {q.lines.map((l, i) => (
                      <span key={i} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-xs text-gray-600">
                        {l.lotId} · {l.origin} {l.process} · {(l.weightKg / 1000).toFixed(1)}t @ ${l.pricePerKg.toFixed(2)}/kg
                      </span>
                    ))}
                  </div>

                  {/* Terms */}
                  <div className="flex items-center gap-6 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Incoterm:</span>
                      <span className="font-medium text-gray-700">{q.incoterm}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Total:</span>
                      <span className="font-bold text-gray-900">${t.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{(t.totalKg / 1000).toFixed(1)}t</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Margin:</span>
                      <span className={cn("font-bold", mt.text)}>{t.marginPct.toFixed(1)}%</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", mt.bg, mt.text)}>{mt.label}</span>
                    </div>
                    {q.daysToExpiry !== null && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                        <span className={cn(q.daysToExpiry < 0 ? "text-gray-400" : q.daysToExpiry <= 7 ? "text-red-600 font-medium" : "text-gray-500")}>
                          {q.daysToExpiry < 0 ? `Expired ${Math.abs(q.daysToExpiry)}d ago` : `${q.daysToExpiry}d to expiry`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Buyer note preview */}
                  {q.buyerNote && (
                    <div className="mt-2 rounded-lg bg-purple-50 px-3 py-2 flex items-start gap-2">
                      <span className="text-[10px] font-semibold text-purple-600 mt-0.5">BUYER:</span>
                      <p className="text-xs text-gray-700 flex-1 italic">&ldquo;{q.buyerNote}&rdquo;</p>
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  {q.status === "ai_draft" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">Review Draft</button>
                  )}
                  {q.status === "pending_review" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors">Send for Approval</button>
                  )}
                  {q.status === "pending_approval" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors">Approve & Send</button>
                  )}
                  {q.status === "sent" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">View</button>
                  )}
                  {q.status === "revised" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors">Respond to Counter</button>
                  )}
                  {q.status === "accepted" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors">View Contract</button>
                  )}
                  {q.status === "rejected" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Reason</button>
                  )}
                  {q.status === "expired" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Renew</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quote Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedQuote(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[480px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-white">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{selected.id}{selected.version > 1 && ` · V${selected.version}`}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selected.lead} · {selected.leadId}</p>
              </div>
              <button onClick={() => setSelectedQuote(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status + meta */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", quoteStatusConfig[selected.status].bg, quoteStatusConfig[selected.status].text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", quoteStatusConfig[selected.status].dot)} />
                    {quoteStatusConfig[selected.status].label}
                  </span>
                  {selected.aiDrafted && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      <Sparkles className="h-3 w-3" /> AI Drafted · {selected.aiConfidence}% confidence
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-gray-400">Created</span><br /><span className="font-medium text-gray-700">{selected.createdAt}</span></div>
                  <div><span className="text-gray-400">Valid until</span><br /><span className="font-medium text-gray-700">{selected.validUntil}</span></div>
                  {selected.sentAt && <div><span className="text-gray-400">Sent</span><br /><span className="font-medium text-gray-700">{selected.sentAt}</span></div>}
                  {selected.respondedAt && <div><span className="text-gray-400">Buyer responded</span><br /><span className="font-medium text-gray-700">{selected.respondedAt}</span></div>}
                </div>
              </div>

              {/* Shipment terms */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Incoterm</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.incoterm}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Destination</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.destination}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Payment Terms</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.paymentTerms}</p>
                </div>
              </div>

              {/* Line items */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Line Items</p>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Lot</th>
                        <th className="px-3 py-2 text-left font-medium">Origin</th>
                        <th className="px-3 py-2 text-right font-medium">Kg</th>
                        <th className="px-3 py-2 text-right font-medium">$/kg</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((l, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium text-gray-900">{l.lotId}</td>
                          <td className="px-3 py-2 text-gray-600">{l.origin} {l.process} {l.grade}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{l.weightKg.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-700">${l.pricePerKg.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">${(l.weightKg * l.pricePerKg).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pricing breakdown */}
              {(() => {
                const t = quoteTotals(selected);
                return (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Pricing Breakdown</p>
                    <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Coffee subtotal</span><span className="font-medium text-gray-900">${t.linesSubtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Freight</span><span className="font-medium text-gray-700">${selected.freight.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Insurance</span><span className="font-medium text-gray-700">${selected.insurance.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Commission ({selected.commissionPct}%)</span><span className="font-medium text-gray-700">-${t.commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between"><span className="font-semibold text-gray-900">Quote Total</span><span className="font-bold text-gray-900">${t.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                    </div>

                    {/* Margin bar */}
                    <div className="mt-3 rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Margin Analysis</span>
                        <span className={cn("text-sm font-bold", marginTier(t.marginPct).text)}>{t.marginPct.toFixed(1)}%</span>
                      </div>
                      <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={cn("h-full", marginTier(t.marginPct).bar)} style={{ width: `${Math.min(t.marginPct * 3, 100)}%` }} />
                        {/* 20% target marker */}
                        <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: "60%" }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>0%</span>
                        <span>Target 20%</span>
                        <span>33%+</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div className="rounded bg-gray-50 px-2 py-1.5"><span className="text-gray-400">Cost basis</span><br /><span className="font-medium text-gray-700">${t.lineCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                        <div className="rounded bg-gray-50 px-2 py-1.5"><span className="text-gray-400">Gross profit</span><br /><span className={cn("font-medium", marginTier(t.marginPct).text)}>${t.grossMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Negotiation Simulator — only show for actionable quotes */}
              {["ai_draft", "pending_review", "pending_approval", "sent", "revised"].includes(selected.status) && (
                <NegotiationSimulator quote={selected} />
              )}

              {/* Buyer note */}
              {selected.buyerNote && (
                <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
                  <p className="text-xs font-semibold text-purple-700 mb-1">BUYER NOTE</p>
                  <p className="text-sm text-gray-700 italic">&ldquo;{selected.buyerNote}&rdquo;</p>
                </div>
              )}

              {/* AI Suggestion */}
              <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
                  <span className="text-xs font-semibold text-indigo-600">AI SUGGESTION</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{selected.aiSuggestion}</p>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.status === "ai_draft" && (
                  <>
                    <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Send for Approval</button>
                    <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Edit Line Items</button>
                  </>
                )}
                {selected.status === "pending_review" && (
                  <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Submit for Admin Approval</button>
                )}
                {selected.status === "pending_approval" && (
                  <>
                    <button className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">Approve & Send to Buyer</button>
                    <button className="w-full rounded-lg border border-red-200 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors">Reject Quote</button>
                  </>
                )}
                {selected.status === "sent" && (
                  <>
                    <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Send Follow-up</button>
                    <button className="w-full rounded-lg border border-amber-200 text-amber-700 px-4 py-2.5 text-sm font-medium hover:bg-amber-50 transition-colors">Revise Quote (V{selected.version + 1})</button>
                  </>
                )}
                {selected.status === "revised" && (
                  <>
                    <button className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">Accept Counter & Send</button>
                    <button className="w-full rounded-lg border border-amber-200 text-amber-700 px-4 py-2.5 text-sm font-medium hover:bg-amber-50 transition-colors">Counter at Midpoint</button>
                    <button className="w-full rounded-lg border border-red-200 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors">Decline Counter</button>
                  </>
                )}
                {selected.status === "accepted" && (
                  <button className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">Generate Contract</button>
                )}
                {selected.status === "rejected" && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Send Substitute Quote</button>
                )}
                {selected.status === "expired" && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Renew Quote (V{selected.version + 1})</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPLIANCE TRACKER PAGE — "Which documents are missing or expiring?"
// ═══════════════════════════════════════════════════════════
type DocStatus = "missing" | "in_progress" | "submitted" | "approved" | "expiring" | "expired";
type DocType = "phytosanitary" | "ecx_grade" | "export_permit" | "certificate_of_origin" | "ico_certificate" | "fumigation" | "quality_inspection" | "bill_of_lading";

type ComplianceDoc = {
  type: DocType;
  status: DocStatus;
  issuedDate: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  issuedBy: string | null;
  refNumber: string | null;
  fileName: string | null;
};

type ComplianceShipment = {
  id: string;
  destination: string;
  flag: string;
  eta: string;
  lots: string[];
  contractValue: number;
  vessel: string;
  docs: ComplianceDoc[];
};

const docTypeConfig: Record<DocType, { label: string; short: string; issuer: string; validityDays: number | null; icon: any }> = {
  phytosanitary: { label: "Phytosanitary Certificate", short: "PHY", issuer: "Ethiopian Agricultural Authority", validityDays: 60, icon: Leaf },
  ecx_grade: { label: "ECX Grading Certificate", short: "ECX", issuer: "Ethiopia Commodity Exchange", validityDays: 90, icon: Award },
  export_permit: { label: "Export Permit", short: "EXP", issuer: "Ministry of Trade", validityDays: 30, icon: FileCheck },
  certificate_of_origin: { label: "Certificate of Origin", short: "CO", issuer: "Ethiopian Chamber of Commerce", validityDays: 180, icon: Globe },
  ico_certificate: { label: "ICO Certificate", short: "ICO", issuer: "International Coffee Org", validityDays: 365, icon: Coffee },
  fumigation: { label: "Fumigation Certificate", short: "FUM", issuer: "Licensed Fumigator", validityDays: 30, icon: Wind },
  quality_inspection: { label: "Quality Inspection", short: "QC", issuer: "EQSA", validityDays: 90, icon: CheckSquare },
  bill_of_lading: { label: "Bill of Lading", short: "B/L", issuer: "Shipping Line", validityDays: null, icon: Ship },
};

const docStatusConfig: Record<DocStatus, { label: string; bg: string; text: string; dot: string; border: string; icon: any }> = {
  missing: { label: "Missing", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", border: "border-red-200", icon: FileX },
  in_progress: { label: "In Progress", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", border: "border-amber-200", icon: FileClock },
  submitted: { label: "Submitted", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", border: "border-blue-200", icon: Send },
  approved: { label: "Approved", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", border: "border-green-200", icon: CheckCircle2 },
  expiring: { label: "Expiring Soon", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", border: "border-orange-200", icon: AlertTriangle },
  expired: { label: "Expired", bg: "bg-red-100", text: "text-red-800", dot: "bg-red-600", border: "border-red-300", icon: AlertCircle },
};

const complianceShipments: ComplianceShipment[] = [
  {
    id: "CT-2026-001", destination: "Hamburg, DE", flag: "🇩🇪", eta: "Jul 28", lots: ["LOT-25-0001", "LOT-25-0003"], contractValue: 84600, vessel: "MSC Hamburg",
    docs: [
      { type: "phytosanitary", status: "expiring", issuedDate: "May 30", expiryDate: "Jul 30", daysToExpiry: 4, issuedBy: "EAA", refNumber: "PHY-2026-0892", fileName: "phyto-0892.pdf" },
      { type: "ecx_grade", status: "approved", issuedDate: "Jul 12", expiryDate: "Oct 10", daysToExpiry: 77, issuedBy: "ECX", refNumber: "ECX-G-25-441", fileName: "ecx-441.pdf" },
      { type: "export_permit", status: "approved", issuedDate: "Jul 14", expiryDate: "Aug 13", daysToExpiry: 19, issuedBy: "MoT", refNumber: "EP-2026-3398", fileName: "permit-3398.pdf" },
      { type: "certificate_of_origin", status: "approved", issuedDate: "Jul 15", expiryDate: "Jan 12", daysToExpiry: 171, issuedBy: "EACC", refNumber: "CO-2026-7781", fileName: "co-7781.pdf" },
      { type: "ico_certificate", status: "approved", issuedDate: "Jul 15", expiryDate: "Jul 15 2027", daysToExpiry: 365, issuedBy: "ICO", refNumber: "ICO-ET-25-091", fileName: "ico-091.pdf" },
      { type: "fumigation", status: "approved", issuedDate: "Jul 18", expiryDate: "Aug 17", daysToExpiry: 23, issuedBy: "Fumigatix Ltd", refNumber: "FUM-25-2287", fileName: "fum-2287.pdf" },
      { type: "quality_inspection", status: "approved", issuedDate: "Jul 13", expiryDate: "Oct 11", daysToExpiry: 78, issuedBy: "EQSA", refNumber: "QI-2026-4419", fileName: "qi-4419.pdf" },
      { type: "bill_of_lading", status: "submitted", issuedDate: "Jul 22", expiryDate: null, daysToExpiry: null, issuedBy: "Maersk", refNumber: "MAEU-782991", fileName: "bl-782991.pdf" },
    ],
  },
  {
    id: "CT-2026-002", destination: "Antwerp, BE", flag: "🇧🇪", eta: "Aug 02", lots: ["LOT-25-0002"], contractValue: 52400, vessel: "CMA CGM Antoine",
    docs: [
      { type: "phytosanitary", status: "approved", issuedDate: "Jul 10", expiryDate: "Sep 08", daysToExpiry: 45, issuedBy: "EAA", refNumber: "PHY-2026-0945", fileName: "phyto-0945.pdf" },
      { type: "ecx_grade", status: "approved", issuedDate: "Jul 11", expiryDate: "Oct 09", daysToExpiry: 76, issuedBy: "ECX", refNumber: "ECX-G-25-450", fileName: "ecx-450.pdf" },
      { type: "export_permit", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
      { type: "certificate_of_origin", status: "approved", issuedDate: "Jul 16", expiryDate: "Jan 13", daysToExpiry: 172, issuedBy: "EACC", refNumber: "CO-2026-7790", fileName: "co-7790.pdf" },
      { type: "ico_certificate", status: "approved", issuedDate: "Jul 16", expiryDate: "Jul 16 2027", daysToExpiry: 366, issuedBy: "ICO", refNumber: "ICO-ET-25-098", fileName: "ico-098.pdf" },
      { type: "fumigation", status: "in_progress", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: "Fumigatix Ltd", refNumber: null, fileName: null },
      { type: "quality_inspection", status: "approved", issuedDate: "Jul 12", expiryDate: "Oct 10", daysToExpiry: 77, issuedBy: "EQSA", refNumber: "QI-2026-4425", fileName: "qi-4425.pdf" },
      { type: "bill_of_lading", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
    ],
  },
  {
    id: "CT-2026-003", destination: "Trieste, IT", flag: "🇮🇹", eta: "Aug 08", lots: ["LOT-25-0005", "LOT-25-0007"], contractValue: 67800, vessel: "Evergreen Typhoon",
    docs: [
      { type: "phytosanitary", status: "approved", issuedDate: "Jul 18", expiryDate: "Sep 16", daysToExpiry: 53, issuedBy: "EAA", refNumber: "PHY-2026-1011", fileName: "phyto-1011.pdf" },
      { type: "ecx_grade", status: "approved", issuedDate: "Jul 19", expiryDate: "Oct 17", daysToExpiry: 84, issuedBy: "ECX", refNumber: "ECX-G-25-458", fileName: "ecx-458.pdf" },
      { type: "export_permit", status: "approved", issuedDate: "Jul 20", expiryDate: "Aug 19", daysToExpiry: 25, issuedBy: "MoT", refNumber: "EP-2026-3411", fileName: "permit-3411.pdf" },
      { type: "certificate_of_origin", status: "approved", issuedDate: "Jul 21", expiryDate: "Jan 18", daysToExpiry: 177, issuedBy: "EACC", refNumber: "CO-2026-7802", fileName: "co-7802.pdf" },
      { type: "ico_certificate", status: "approved", issuedDate: "Jul 21", expiryDate: "Jul 21 2027", daysToExpiry: 367, issuedBy: "ICO", refNumber: "ICO-ET-25-103", fileName: "ico-103.pdf" },
      { type: "fumigation", status: "approved", issuedDate: "Jul 22", expiryDate: "Aug 21", daysToExpiry: 27, issuedBy: "Fumigatix Ltd", refNumber: "FUM-25-2301", fileName: "fum-2301.pdf" },
      { type: "quality_inspection", status: "approved", issuedDate: "Jul 20", expiryDate: "Oct 18", daysToExpiry: 85, issuedBy: "EQSA", refNumber: "QI-2026-4438", fileName: "qi-4438.pdf" },
      { type: "bill_of_lading", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
    ],
  },
  {
    id: "CT-2026-004", destination: "Yokohama, JP", flag: "🇯🇵", eta: "Aug 15", lots: ["LOT-25-0004"], contractValue: 41200, vessel: "ONE Stork",
    docs: [
      { type: "phytosanitary", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
      { type: "ecx_grade", status: "in_progress", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: "ECX", refNumber: null, fileName: null },
      { type: "export_permit", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
      { type: "certificate_of_origin", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
      { type: "ico_certificate", status: "approved", issuedDate: "Jul 22", expiryDate: "Jul 22 2027", daysToExpiry: 367, issuedBy: "ICO", refNumber: "ICO-ET-25-110", fileName: "ico-110.pdf" },
      { type: "fumigation", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
      { type: "quality_inspection", status: "submitted", issuedDate: "Jul 23", expiryDate: null, daysToExpiry: null, issuedBy: "EQSA", refNumber: null, fileName: null },
      { type: "bill_of_lading", status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, issuedBy: null, refNumber: null, fileName: null },
    ],
  },
];

const allDocTypes: DocType[] = ["phytosanitary", "ecx_grade", "export_permit", "certificate_of_origin", "ico_certificate", "fumigation", "quality_inspection", "bill_of_lading"];

function shipmentReadiness(s: ComplianceShipment): { approved: number; total: number; pct: number; blocked: boolean } {
  const approved = s.docs.filter(d => d.status === "approved").length;
  const total = allDocTypes.length;
  const pct = (approved / total) * 100;
  const blocked = s.docs.some(d => d.status === "missing" || d.status === "expired");
  return { approved, total, pct, blocked };
}

function CompliancePage() {
  const [filter, setFilter] = useState("All");
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
  const filters = ["All", "Blocked", "Expiring", "Ready to Ship"];

  const filtered = filter === "All"
    ? complianceShipments
    : complianceShipments.filter(s => {
        if (filter === "Blocked") return shipmentReadiness(s).blocked;
        if (filter === "Expiring") return s.docs.some(d => d.status === "expiring" || d.status === "expired");
        if (filter === "Ready to Ship") return !shipmentReadiness(s).blocked && !s.docs.some(d => d.status === "expiring");
        return true;
      });

  const stats = {
    totalShipments: complianceShipments.length,
    blockedShipments: complianceShipments.filter(s => shipmentReadiness(s).blocked).length,
    blockedValue: complianceShipments.filter(s => shipmentReadiness(s).blocked).reduce((sum, s) => sum + s.contractValue, 0),
    expiringDocs: complianceShipments.flatMap(s => s.docs).filter(d => d.status === "expiring").length,
    expiring7d: complianceShipments.flatMap(s => s.docs).filter(d => d.daysToExpiry !== null && d.daysToExpiry > 0 && d.daysToExpiry <= 7).length,
    missingDocs: complianceShipments.flatMap(s => s.docs).filter(d => d.status === "missing").length,
    approvedDocs: complianceShipments.flatMap(s => s.docs).filter(d => d.status === "approved").length,
    totalDocs: complianceShipments.length * allDocTypes.length,
  };

  // Critical alerts — top 3 things needing immediate action
  const allDocs = complianceShipments.flatMap(s => s.docs.map(d => ({ ...d, shipment: s })));
  const criticalAlerts = allDocs
    .filter(d => d.status === "missing" || d.status === "expiring" || d.status === "expired")
    .sort((a, b) => {
      const order: Record<DocStatus, number> = { expired: 0, expiring: 1, missing: 2, in_progress: 3, submitted: 4, approved: 5 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return (a.daysToExpiry ?? 999) - (b.daysToExpiry ?? 999);
    })
    .slice(0, 5);

  const selected = complianceShipments.find(s => s.id === selectedShipment);

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Compliance Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">Which documents are missing or expiring?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Upload className="h-4 w-4" /> Upload Document
        </button>
      </div>

      {/* AI Insight Banner */}
      <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-red-700">Compliance Alert</span>
              <span className="text-xs text-red-400">·</span>
              <span className="text-xs text-red-500">{stats.blockedShipments} shipments blocked · {stats.missingDocs} documents missing</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {stats.expiring7d > 0 ? (
                <><span className="font-semibold text-red-700">{stats.expiring7d} documents expire within 7 days</span>. Phytosanitary cert for CT-2026-001 expires Jul 30 (4 days) — renewal takes 5-7 business days at EAA. <span className="font-semibold">Submit renewal application today</span> to avoid container detention at Hamburg port (~$420/day demurrage).</>
              ) : (
                <>All documents current. No immediate expiry risks. Recommend pre-emptive renewal of any document with &lt;15 days validity.</>
              )}
              {" "}{stats.blockedShipments > 0 && <>CT-2026-004 (Yokohama) is missing <span className="font-semibold">{complianceShipments.find(s => s.id === "CT-2026-004")?.docs.filter(d => d.status === "missing").length} documents</span> — vessel departure in 8 days.</>}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Shipments</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalShipments}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.totalDocs} documents tracked</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-4">
          <p className="text-xs font-medium text-red-700">Blocked Shipments</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{stats.blockedShipments}</p>
          <p className="text-[11px] text-red-500 mt-0.5">${(stats.blockedValue / 1000).toFixed(0)}K at risk</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50/30 p-4">
          <p className="text-xs font-medium text-orange-700">Expiring ≤7 Days</p>
          <p className="text-2xl font-bold text-orange-700 mt-1">{stats.expiring7d}</p>
          <p className="text-[11px] text-orange-500 mt-0.5">Renew immediately</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Compliance Rate</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{((stats.approvedDocs / stats.totalDocs) * 100).toFixed(0)}%</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.approvedDocs} of {stats.totalDocs} approved</p>
        </div>
      </div>

      {/* Critical Alerts */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Critical Actions Required</h3>
          <span className="text-xs text-gray-400">{criticalAlerts.length} items</span>
        </div>
        <div className="space-y-2">
          {criticalAlerts.map((d, i) => {
            const dt = docTypeConfig[d.type];
            const ds = docStatusConfig[d.status];
            return (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", ds.bg)}>
                  <ds.icon className={cn("h-4 w-4", ds.text)} strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{dt.label}</span>
                    <span className="text-gray-500"> · {d.shipment.id} → {d.shipment.destination}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {d.status === "missing" && <>Not yet started · Issuer: {dt.issuer}</>}
                    {d.status === "expiring" && <>Expires {d.expiryDate} · Only {d.daysToExpiry} days left · Renewal takes 5-7 days</>}
                    {d.status === "expired" && <>Expired {d.expiryDate} · Must reapply immediately</>}
                  </p>
                </div>
                <button className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  {d.status === "missing" && "Start Application"}
                  {d.status === "expiring" && "Renew Now"}
                  {d.status === "expired" && "Reapply"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {filters.map((f) => {
          const count = f === "All"
            ? complianceShipments.length
            : f === "Blocked" ? stats.blockedShipments
            : f === "Expiring" ? complianceShipments.filter(s => s.docs.some(d => d.status === "expiring" || d.status === "expired")).length
            : complianceShipments.filter(s => !shipmentReadiness(s).blocked && !s.docs.some(d => d.status === "expiring")).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {f}
              <span className={cn("rounded-full px-1.5 text-[10px]", filter === f ? "bg-white/20" : "bg-gray-100 text-gray-500")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Compliance Matrix */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sticky left-0 bg-gray-50 z-10">Shipment</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Destination</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">ETA</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Value</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Readiness</th>
                {allDocTypes.map(dt => (
                  <th key={dt} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500" title={docTypeConfig[dt].label}>
                    {docTypeConfig[dt].short}
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const r = shipmentReadiness(s);
                return (
                  <tr key={s.id} onClick={() => setSelectedShipment(s.id)} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{s.id}</span>
                        {r.blocked && <span className="h-2 w-2 rounded-full bg-red-500" title="Blocked" />}
                      </div>
                      <p className="text-[11px] text-gray-400">{s.vessel} · {s.lots.length} lot{s.lots.length > 1 ? "s" : ""}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{s.flag} {s.destination}</td>
                    <td className="px-3 py-3 text-gray-700">{s.eta}</td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">${(s.contractValue / 1000).toFixed(1)}K</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[60px]">
                          <div className={cn("h-full", r.pct === 100 ? "bg-green-500" : r.blocked ? "bg-red-500" : "bg-amber-500")} style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="text-[11px] font-medium text-gray-600">{r.approved}/{r.total}</span>
                      </div>
                    </td>
                    {allDocTypes.map(dt => {
                      const doc = s.docs.find(d => d.type === dt);
                      if (!doc) return <td key={dt} className="px-2 py-3 text-center text-gray-300">—</td>;
                      const ds = docStatusConfig[doc.status];
                      return (
                        <td key={dt} className="px-2 py-3 text-center">
                          <div
                            className={cn("inline-flex items-center justify-center w-8 h-7 rounded-md text-[10px] font-bold", ds.bg, ds.text)}
                            title={`${docTypeConfig[dt].label}: ${ds.label}${doc.daysToExpiry !== null ? ` · ${doc.daysToExpiry}d` : ""}`}
                          >
                            {doc.status === "approved" ? "✓" : doc.status === "missing" ? "✕" : doc.status === "expiring" ? `${doc.daysToExpiry}d` : doc.status === "expired" ? "!" : doc.status === "submitted" ? "→" : "..."}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setSelectedShipment(s.id)} className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        r.blocked ? "bg-red-600 text-white hover:bg-red-700" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}>
                        {r.blocked ? "Resolve" : "View"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
          <span className="font-medium text-gray-600">Legend:</span>
          <span className="flex items-center gap-1"><span className="inline-flex w-5 h-4 rounded bg-green-50 text-green-700 text-[9px] font-bold items-center justify-center">✓</span> Approved</span>
          <span className="flex items-center gap-1"><span className="inline-flex w-5 h-4 rounded bg-blue-50 text-blue-700 text-[9px] font-bold items-center justify-center">→</span> Submitted</span>
          <span className="flex items-center gap-1"><span className="inline-flex w-5 h-4 rounded bg-amber-50 text-amber-700 text-[9px] font-bold items-center justify-center">...</span> In Progress</span>
          <span className="flex items-center gap-1"><span className="inline-flex w-5 h-4 rounded bg-orange-50 text-orange-700 text-[9px] font-bold items-center justify-center">4d</span> Expiring</span>
          <span className="flex items-center gap-1"><span className="inline-flex w-5 h-4 rounded bg-red-50 text-red-700 text-[9px] font-bold items-center justify-center">✕</span> Missing</span>
          <span className="flex items-center gap-1"><span className="inline-flex w-5 h-4 rounded bg-red-100 text-red-800 text-[9px] font-bold items-center justify-center">!</span> Expired</span>
        </div>
      </div>

      {/* Shipment Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedShipment(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[520px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-white">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{selected.id}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selected.flag} {selected.destination} · ETA {selected.eta} · {selected.vessel}</p>
              </div>
              <button onClick={() => setSelectedShipment(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Readiness summary */}
              {(() => {
                const r = shipmentReadiness(selected);
                return (
                  <div className={cn("rounded-lg p-4 border", r.pct === 100 ? "border-green-200 bg-green-50/50" : r.blocked ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50")}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Shipment Readiness</span>
                      <span className={cn("text-sm font-bold", r.pct === 100 ? "text-green-700" : r.blocked ? "text-red-700" : "text-amber-700")}>{r.approved}/{r.total} · {r.pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white overflow-hidden">
                      <div className={cn("h-full", r.pct === 100 ? "bg-green-500" : r.blocked ? "bg-red-500" : "bg-amber-500")} style={{ width: `${r.pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      {r.pct === 100 ? "All required documents approved. Shipment is ready for departure." : r.blocked ? "Shipment is blocked — missing or expired documents must be resolved before vessel departure." : "Shipment is partially ready. Some documents are still in progress."}
                    </p>
                  </div>
                );
              })()}

              {/* Shipment meta */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contract Value</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">${selected.contractValue.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lots</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.lots.length}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Vessel</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.vessel}</p>
                </div>
              </div>

              {/* Documents list */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Required Documents ({selected.docs.length})</p>
                <div className="space-y-2">
                  {selected.docs.map((doc) => {
                    const dt = docTypeConfig[doc.type];
                    const ds = docStatusConfig[doc.status];
                    return (
                      <div key={doc.type} className={cn("rounded-lg border p-3", ds.border, ds.bg)}>
                        <div className="flex items-start gap-3">
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white", ds.text)}>
                            <dt.icon className="h-4 w-4" strokeWidth={1.5} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900">{dt.label}</p>
                              <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold", ds.bg, ds.text)}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", ds.dot)} />
                                {ds.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">Issuer: {dt.issuer}{doc.refNumber && ` · Ref: ${doc.refNumber}`}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                              {doc.issuedDate && <span className="text-gray-500">Issued: <span className="font-medium text-gray-700">{doc.issuedDate}</span></span>}
                              {doc.expiryDate && (
                                <span className={cn(doc.daysToExpiry !== null && doc.daysToExpiry <= 7 ? "text-red-600 font-medium" : "text-gray-500")}>
                                  Expires: <span className="font-medium">{doc.expiryDate}</span>
                                  {doc.daysToExpiry !== null && ` (${doc.daysToExpiry}d)`}
                                </span>
                              )}
                              {doc.fileName && (
                                <span className="inline-flex items-center gap-1 text-gray-500">
                                  <Paperclip className="h-3 w-3" /> {doc.fileName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Per-doc action */}
                        <div className="mt-2 flex justify-end">
                          {doc.status === "missing" && (
                            <button className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 transition-colors">Start Application</button>
                          )}
                          {doc.status === "in_progress" && (
                            <button className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 transition-colors">Submit to Authority</button>
                          )}
                          {doc.status === "submitted" && (
                            <button className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 transition-colors">Track Status</button>
                          )}
                          {doc.status === "approved" && (
                            <button className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Document</button>
                          )}
                          {doc.status === "expiring" && (
                            <button className="rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-orange-700 transition-colors">Renew Now</button>
                          )}
                          {doc.status === "expired" && (
                            <button className="rounded-md bg-red-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-800 transition-colors">Reapply</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Compliance Timeline */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Vessel Departure Checklist</p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Vessel <span className="font-medium text-gray-900">{selected.vessel}</span> departs Djibouti on <span className="font-medium text-gray-900">{selected.eta}</span>. All required documents must be submitted to the shipping line at least <span className="font-medium text-gray-900">48 hours before departure</span>. Missing documents at cutoff will result in container roll to next vessel (~10-14 day delay) and ~$420/day demurrage.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// SHIPMENTS PAGE — "Where is every container?"
// ═══════════════════════════════════════════════════════════
type ShipmentStage = "processing" | "to_port" | "at_port" | "loaded" | "in_transit" | "arrived" | "customs" | "delivered";
type ShipmentStatus = "on_schedule" | "delayed" | "demurrage_risk" | "arrived" | "delivered" | "loading";

type ShipmentMilestone = {
  stage: ShipmentStage;
  label: string;
  date: string | null;
  completed: boolean;
  note?: string;
};

type TempReading = {
  day: string;
  temp: number;
  humidity: number;
};

type Shipment = {
  id: string;
  containerNo: string;
  sealNo: string;
  bookingRef: string;
  vessel: string;
  voyage: string;
  originPort: string;
  destinationPort: string;
  destinationCity: string;
  destinationCountry: string;
  flag: string;
  buyer: string;
  contractId: string;
  contractValue: number;
  weightKg: number;
  lots: string[];
  departureDate: string;
  etaDate: string;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  status: ShipmentStatus;
  stage: ShipmentStage;
  stageProgress: number; // 0-100
  temperature: number;
  humidity: number;
  tempOk: boolean;
  insuranceValue: number;
  demurrageRisk: number | null; // days until demurrage starts
  docReadiness: number; // 0-100, links to compliance
  milestones: ShipmentMilestone[];
  tempLog: TempReading[];
  events: { date: string; text: string; type: "info" | "warning" | "success" }[];
};

const shipmentStageConfig: Record<ShipmentStage, { label: string; short: string; icon: any }> = {
  processing: { label: "Processing", short: "Proc", icon: Coffee },
  to_port: { label: "Truck to Djibouti", short: "Truck", icon: Truck },
  at_port: { label: "At Djibouti Port", short: "Port", icon: Package },
  loaded: { label: "Loaded on Vessel", short: "Load", icon: Ship },
  in_transit: { label: "In Transit", short: "Sea", icon: TrendingUp },
  arrived: { label: "Arrived at Port", short: "Arr", icon: MapPin },
  customs: { label: "Customs Clearance", short: "Cust", icon: FileCheck },
  delivered: { label: "Delivered to Buyer", short: "Del", icon: CheckCircle2 },
};

const stageOrder: ShipmentStage[] = ["processing", "to_port", "at_port", "loaded", "in_transit", "arrived", "customs", "delivered"];

const shipmentStatusConfig: Record<ShipmentStatus, { label: string; bg: string; text: string; dot: string }> = {
  loading: { label: "Loading", bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400" },
  on_schedule: { label: "On Schedule", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  delayed: { label: "Delayed", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  demurrage_risk: { label: "Demurrage Risk", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  arrived: { label: "Arrived", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  delivered: { label: "Delivered", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const shipmentsData: Shipment[] = [
  {
    id: "CT-2026-001", containerNo: "MSCU-7729340", sealNo: "SL-8847291", bookingRef: "MSC-2026-088234",
    vessel: "MSC Hamburg", voyage: "V.244W", originPort: "Djibouti", destinationPort: "Hamburg",
    destinationCity: "Hamburg", destinationCountry: "Germany", flag: "🇩🇪",
    buyer: "Blue Mountain Traders", contractId: "CT-2026-0003", contractValue: 84600,
    weightKg: 16000, lots: ["LOT-25-0001", "LOT-25-0003"],
    departureDate: "Jul 19", etaDate: "Aug 09", daysElapsed: 6, daysTotal: 21, daysRemaining: 15,
    status: "demurrage_risk", stage: "in_transit", stageProgress: 56,
    temperature: 18.5, humidity: 58, tempOk: true, insuranceValue: 93060,
    demurrageRisk: 4, docReadiness: 88,
    milestones: [
      { stage: "processing", label: "Processing Complete", date: "Jul 12", completed: true },
      { stage: "to_port", label: "Trucked to Djibouti", date: "Jul 15", completed: true },
      { stage: "at_port", label: "Arrived at Djibouti Port", date: "Jul 16", completed: true },
      { stage: "loaded", label: "Loaded on MSC Hamburg", date: "Jul 19", completed: true },
      { stage: "in_transit", label: "In Transit (via Suez Canal)", date: "Jul 19", completed: true, note: "Crossing Suez Jul 24" },
      { stage: "arrived", label: "Arrives Hamburg Port", date: "Aug 09", completed: false },
      { stage: "customs", label: "EU Customs Clearance", date: null, completed: false },
      { stage: "delivered", label: "Delivered to Blue Mountain", date: null, completed: false },
    ],
    tempLog: [
      { day: "Jul 19", temp: 18.2, humidity: 56 },
      { day: "Jul 20", temp: 18.4, humidity: 57 },
      { day: "Jul 21", temp: 18.5, humidity: 58 },
      { day: "Jul 22", temp: 18.6, humidity: 59 },
      { day: "Jul 23", temp: 18.5, humidity: 58 },
      { day: "Jul 24", temp: 18.5, humidity: 58 },
    ],
    events: [
      { date: "Jul 24", text: "Crossed Suez Canal — on schedule", type: "success" },
      { date: "Jul 19", text: "Vessel departed Djibouti", type: "success" },
      { date: "Jul 16", text: "Container arrived at Djibouti port", type: "info" },
      { date: "Jul 14", text: "Phytosanitary cert expires Jul 30 — renewal required before Hamburg arrival", type: "warning" },
    ],
  },
  {
    id: "CT-2026-002", containerNo: "CMAU-8834210", sealNo: "SL-9921034", bookingRef: "CMA-2026-441288",
    vessel: "CMA CGM Antoine", voyage: "V.188E", originPort: "Djibouti", destinationPort: "Antwerp",
    destinationCity: "Antwerp", destinationCountry: "Belgium", flag: "🇧🇪",
    buyer: "Falcon Coffee UK", contractId: "CT-2026-0004", contractValue: 52400,
    weightKg: 8000, lots: ["LOT-25-0002"],
    departureDate: "Jul 24", etaDate: "Aug 18", daysElapsed: 1, daysTotal: 25, daysRemaining: 24,
    status: "on_schedule", stage: "in_transit", stageProgress: 14,
    temperature: 19.2, humidity: 61, tempOk: true, insuranceValue: 57640,
    demurrageRisk: null, docReadiness: 75,
    milestones: [
      { stage: "processing", label: "Processing Complete", date: "Jul 16", completed: true },
      { stage: "to_port", label: "Trucked to Djibouti", date: "Jul 20", completed: true },
      { stage: "at_port", label: "Arrived at Djibouti Port", date: "Jul 21", completed: true },
      { stage: "loaded", label: "Loaded on CMA CGM Antoine", date: "Jul 24", completed: true },
      { stage: "in_transit", label: "In Transit (via Suez Canal)", date: "Jul 24", completed: true },
      { stage: "arrived", label: "Arrives Antwerp Port", date: "Aug 18", completed: false },
      { stage: "customs", label: "EU Customs Clearance", date: null, completed: false },
      { stage: "delivered", label: "Delivered to Falcon Coffee", date: null, completed: false },
    ],
    tempLog: [
      { day: "Jul 24", temp: 19.2, humidity: 61 },
    ],
    events: [
      { date: "Jul 24", text: "Vessel departed Djibouti — tracking active", type: "success" },
      { date: "Jul 22", text: "Export permit missing — submit to Ministry of Trade urgently", type: "warning" },
      { date: "Jul 20", text: "Container loaded onto truck for Djibouti", type: "info" },
    ],
  },
  {
    id: "CT-2026-003", containerNo: "EGLU-5521098", sealNo: "SL-7712983", bookingRef: "EG-2026-220914",
    vessel: "Evergreen Typhoon", voyage: "V.0931S", originPort: "Djibouti", destinationPort: "Trieste",
    destinationCity: "Trieste", destinationCountry: "Italy", flag: "🇮🇹",
    buyer: "Hashimoto Coffee", contractId: "CT-2026-0005", contractValue: 67800,
    weightKg: 10000, lots: ["LOT-25-0005", "LOT-25-0007"],
    departureDate: "Jul 30", etaDate: "Aug 28", daysElapsed: 0, daysTotal: 29, daysRemaining: 29,
    status: "loading", stage: "at_port", stageProgress: 38,
    temperature: 22.4, humidity: 65, tempOk: true, insuranceValue: 74580,
    demurrageRisk: null, docReadiness: 88,
    milestones: [
      { stage: "processing", label: "Processing Complete", date: "Jul 22", completed: true },
      { stage: "to_port", label: "Trucked to Djibouti", date: "Jul 24", completed: true },
      { stage: "at_port", label: "Arrived at Djibouti Port", date: "Jul 25", completed: true, note: "Awaiting vessel loading" },
      { stage: "loaded", label: "Loaded on Evergreen Typhoon", date: null, completed: false },
      { stage: "in_transit", label: "In Transit (via Suez Canal)", date: null, completed: false },
      { stage: "arrived", label: "Arrives Trieste Port", date: null, completed: false },
      { stage: "customs", label: "EU Customs Clearance", date: null, completed: false },
      { stage: "delivered", label: "Delivered to Hashimoto", date: null, completed: false },
    ],
    tempLog: [],
    events: [
      { date: "Jul 25", text: "Container arrived at Djibouti port — waiting for vessel", type: "info" },
      { date: "Jul 23", text: "Bill of Lading not yet issued — shipping line cutoff Jul 28", type: "warning" },
    ],
  },
  {
    id: "CT-2026-004", containerNo: "ONEU-1193847", sealNo: "SL-5547210", bookingRef: "ONE-2026-778201",
    vessel: "ONE Stork", voyage: "V.067N", originPort: "Djibouti", destinationPort: "Yokohama",
    destinationCity: "Yokohama", destinationCountry: "Japan", flag: "🇯🇵",
    buyer: "Aurora Imports", contractId: "CT-2026-0007", contractValue: 41200,
    weightKg: 3000, lots: ["LOT-25-0004"],
    departureDate: "Aug 02", etaDate: "Sep 04", daysElapsed: 0, daysTotal: 33, daysRemaining: 33,
    status: "loading", stage: "to_port", stageProgress: 14,
    temperature: 24.1, humidity: 68, tempOk: true, insuranceValue: 45320,
    demurrageRisk: null, docReadiness: 25,
    milestones: [
      { stage: "processing", label: "Processing Complete", date: "Jul 23", completed: true },
      { stage: "to_port", label: "Trucked to Djibouti", date: null, completed: false, note: "Scheduled Jul 30" },
      { stage: "at_port", label: "Arrived at Djibouti Port", date: null, completed: false },
      { stage: "loaded", label: "Loaded on ONE Stork", date: null, completed: false },
      { stage: "in_transit", label: "In Transit (via Suez + Cape)", date: null, completed: false },
      { stage: "arrived", label: "Arrives Yokohama Port", date: null, completed: false },
      { stage: "customs", label: "Japan Customs (JAS)", date: null, completed: false },
      { stage: "delivered", label: "Delivered to Aurora Imports", date: null, completed: false },
    ],
    tempLog: [],
    events: [
      { date: "Jul 24", text: "5 documents missing — vessel departs Aug 02, cutoff Jul 31", type: "warning" },
      { date: "Jul 23", text: "Coffee processing complete — ready for trucking", type: "success" },
    ],
  },
  {
    id: "CT-2026-005", containerNo: "MAEU-6647129", sealNo: "SL-3301847", bookingRef: "MAEU-2026-558901",
    vessel: "Maersk Kinloss", voyage: "V.441E", originPort: "Djibouti", destinationPort: "Busan",
    destinationCity: "Busan", destinationCountry: "South Korea", flag: "🇰🇷",
    buyer: "Seoul Coffee Lab", contractId: "CT-2026-0008", contractValue: 27600,
    weightKg: 4000, lots: ["LOT-25-0003"],
    departureDate: "Jul 10", etaDate: "Aug 12", daysElapsed: 15, daysTotal: 33, daysRemaining: 18,
    status: "delayed", stage: "in_transit", stageProgress: 45,
    temperature: 21.8, humidity: 63, tempOk: true, insuranceValue: 30360,
    demurrageRisk: null, docReadiness: 100,
    milestones: [
      { stage: "processing", label: "Processing Complete", date: "Jul 02", completed: true },
      { stage: "to_port", label: "Trucked to Djibouti", date: "Jul 06", completed: true },
      { stage: "at_port", label: "Arrived at Djibouti Port", date: "Jul 07", completed: true },
      { stage: "loaded", label: "Loaded on Maersk Kinloss", date: "Jul 10", completed: true },
      { stage: "in_transit", label: "In Transit (via Singapore)", date: "Jul 10", completed: true, note: "Singapore stopover Jul 28" },
      { stage: "arrived", label: "Arrives Busan Port", date: "Aug 16", completed: false, note: "Delayed 4 days — congestion at Singapore" },
      { stage: "customs", label: "Korea Customs (KCS)", date: null, completed: false },
      { stage: "delivered", label: "Delivered to Seoul Coffee Lab", date: null, completed: false },
    ],
    tempLog: [
      { day: "Jul 10", temp: 20.1, humidity: 60 },
      { day: "Jul 12", temp: 20.5, humidity: 61 },
      { day: "Jul 15", temp: 21.2, humidity: 62 },
      { day: "Jul 18", temp: 21.8, humidity: 63 },
      { day: "Jul 22", temp: 21.6, humidity: 63 },
      { day: "Jul 24", temp: 21.8, humidity: 63 },
    ],
    events: [
      { date: "Jul 26", text: "Vessel delayed at Singapore — new ETA Aug 16 (was Aug 12)", type: "warning" },
      { date: "Jul 24", text: "All documents approved — no customs risk", type: "success" },
      { date: "Jul 10", text: "Vessel departed Djibouti", type: "success" },
    ],
  },
  {
    id: "CT-2025-0198", containerNo: "HLCU-8821047", sealNo: "SL-2209173", bookingRef: "HL-2025-889401",
    vessel: "Hapag-Lloyd Berlin", voyage: "V.221W", originPort: "Djibouti", destinationPort: "Hamburg",
    destinationCity: "Hamburg", destinationCountry: "Germany", flag: "🇩🇪",
    buyer: "Marcus Coffee GmbH", contractId: "CT-2025-0195", contractValue: 58900,
    weightKg: 8000, lots: ["LOT-24-0089"],
    departureDate: "Jun 18", etaDate: "Jul 09", daysElapsed: 37, daysTotal: 21, daysRemaining: 0,
    status: "delivered", stage: "delivered", stageProgress: 100,
    temperature: 18.9, humidity: 59, tempOk: true, insuranceValue: 64790,
    demurrageRisk: null, docReadiness: 100,
    milestones: [
      { stage: "processing", label: "Processing Complete", date: "Jun 08", completed: true },
      { stage: "to_port", label: "Trucked to Djibouti", date: "Jun 12", completed: true },
      { stage: "at_port", label: "Arrived at Djibouti Port", date: "Jun 13", completed: true },
      { stage: "loaded", label: "Loaded on Hapag-Lloyd Berlin", date: "Jun 18", completed: true },
      { stage: "in_transit", label: "In Transit (via Suez Canal)", date: "Jun 18", completed: true },
      { stage: "arrived", label: "Arrives Hamburg Port", date: "Jul 09", completed: true },
      { stage: "customs", label: "EU Customs Clearance", date: "Jul 11", completed: true },
      { stage: "delivered", label: "Delivered to Marcus Coffee", date: "Jul 14", completed: true },
    ],
    tempLog: [
      { day: "Jun 18", temp: 18.5, humidity: 58 },
      { day: "Jun 25", temp: 18.8, humidity: 59 },
      { day: "Jul 02", temp: 19.1, humidity: 60 },
      { day: "Jul 09", temp: 18.9, humidity: 59 },
    ],
    events: [
      { date: "Jul 14", text: "Container delivered to Marcus Coffee — shipment complete", type: "success" },
      { date: "Jul 11", text: "EU customs cleared — no issues", type: "success" },
      { date: "Jul 09", text: "Vessel arrived Hamburg on schedule", type: "success" },
    ],
  },
];

function ShipmentsPage() {
  const [filter, setFilter] = useState("All");
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
  const filters = ["All", "In Transit", "At Port", "Loading", "Delayed", "Delivered"];

  const filterMap: Record<string, (s: Shipment) => boolean> = {
    "All": () => true,
    "In Transit": (s) => s.stage === "in_transit" || s.stage === "loaded",
    "At Port": (s) => s.stage === "at_port" || s.stage === "arrived" || s.stage === "customs",
    "Loading": (s) => s.stage === "processing" || s.stage === "to_port",
    "Delayed": (s) => s.status === "delayed" || s.status === "demurrage_risk",
    "Delivered": (s) => s.status === "delivered",
  };

  const filtered = shipmentsData.filter(filterMap[filter]);

  const stats = {
    total: shipmentsData.length,
    inTransit: shipmentsData.filter(s => s.stage === "in_transit" || s.stage === "loaded").length,
    loading: shipmentsData.filter(s => s.stage === "processing" || s.stage === "to_port" || s.stage === "at_port").length,
    delivered: shipmentsData.filter(s => s.status === "delivered").length,
    atRisk: shipmentsData.filter(s => s.status === "delayed" || s.status === "demurrage_risk").length,
    onTimeRate: (() => {
      const completed = shipmentsData.filter(s => s.status === "delivered" || s.status === "on_schedule");
      const onTime = completed.filter(s => s.status !== "delayed").length;
      return completed.length > 0 ? (onTime / completed.length) * 100 : 100;
    })(),
    totalValue: shipmentsData.filter(s => s.status !== "delivered").reduce((sum, s) => sum + s.contractValue, 0),
    demurrageRisk: shipmentsData.filter(s => s.demurrageRisk !== null).length,
  };

  const selected = shipmentsData.find(s => s.id === selectedShipment);

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Shipments</h1>
          <p className="text-sm text-gray-500 mt-1">Where is every container?</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Search className="h-4 w-4" /> Track Container
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
            <Plus className="h-4 w-4" /> New Shipment
          </button>
        </div>
      </div>

      {/* AI Insight Banner — TRIMMED to be more concise */}
      {stats.atRisk > 0 && (
        <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-red-700">{stats.atRisk} shipments need attention</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {stats.demurrageRisk > 0 && <><span className="font-semibold text-red-700">CT-2026-001 (Hamburg)</span> — phytosanitary cert expires in 4 days, vessel arrives Aug 09. Renew at EAA today (~$420/day demurrage risk). </>}
                CT-2026-004 (Yokohama) departs in 8 days with only 25% doc readiness.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">In Transit</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.inTransit}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">containers at sea</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">At Risk</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.atRisk}</p>
          <p className="text-[11px] text-red-500 mt-0.5">delayed or demurrage</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${(stats.totalValue / 1000).toFixed(0)}K</p>
          <p className="text-[11px] text-gray-400 mt-0.5">across {stats.total - stats.delivered} shipments</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">On-time Rate</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.onTimeRate.toFixed(0)}%</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.delivered} delivered this season</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {filters.map((f) => {
          const count = shipmentsData.filter(filterMap[f]).length;
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

      {/* Shipment cards — DECLUTTERED */}
      <div className="space-y-3">
        {filtered.map((s) => {
          const sc = shipmentStatusConfig[s.status];
          const currentStageIdx = stageOrder.indexOf(s.stage);
          return (
            <div
              key={s.id}
              onClick={() => setSelectedShipment(s.id)}
              className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300"
            >
              <div className="flex items-start gap-4">
                {/* Status indicator */}
                <div className="flex flex-col items-center gap-2 pt-1">
                  <span className={cn("h-3 w-3 rounded-full", sc.dot)} />
                  <div className="w-px flex-1 bg-gray-100" style={{ minHeight: "40px" }} />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  {/* Top row — TRIMMED: removed container# chip, removed redundant badges */}
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{s.id}</span>
                      <span className="text-sm text-gray-600">{s.flag} {s.destinationCity}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{s.buyer}</span>
                    </div>
                    {/* Status pill alone carries urgency (color + label) */}
                    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                      {sc.label}
                    </span>
                  </div>

                  {/* Stage timeline (8-segment) */}
                  <div className="flex items-center gap-1 mb-3">
                    {stageOrder.map((st, i) => {
                      const isComplete = i < currentStageIdx || s.stage === "delivered";
                      const isCurrent = i === currentStageIdx && s.stage !== "delivered";
                      return (
                        <div key={st} className="flex-1 flex items-center">
                          <div
                            className={cn(
                              "h-1.5 flex-1 rounded-full",
                              isComplete ? "bg-green-500" : isCurrent ? "bg-blue-500" : "bg-gray-100"
                            )}
                          />
                          {i < stageOrder.length - 1 && <div className="w-1" />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Lots */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {s.lots.map((lot, li) => (
                      <span key={li} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-xs text-gray-600">{lot}</span>
                    ))}
                  </div>

                  {/* Key details — TRIMMED: removed voyage number */}
                  <div className="flex items-center gap-6 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Ship className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                      <span className="text-gray-500">{s.vessel}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Route:</span>
                      <span className="font-medium text-gray-700">{s.originPort} → {s.destinationPort}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Value:</span>
                      <span className="font-bold text-gray-900">${(s.contractValue / 1000).toFixed(1)}K</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{(s.weightKg / 1000).toFixed(0)}t</span>
                    </div>
                    {s.status !== "delivered" && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                        <span className={cn(s.daysRemaining <= 7 ? "text-amber-600 font-medium" : "text-gray-500")}>
                          ETA {s.etaDate} · {s.daysRemaining}d
                        </span>
                      </div>
                    )}
                    {s.status === "delivered" && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" strokeWidth={1.5} />
                        <span className="text-green-600 font-medium">Delivered {s.milestones.find(m => m.stage === "delivered")?.date}</span>
                      </div>
                    )}
                  </div>

                  {/* Temperature + doc readiness strip */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("flex h-2 w-2 rounded-full", s.tempOk ? "bg-green-500" : "bg-red-500")} />
                      <span className="text-gray-500">Temp</span>
                      <span className={cn("font-medium", s.tempOk ? "text-gray-700" : "text-red-600")}>{s.temperature.toFixed(1)}°C</span>
                      <span className="text-gray-400">/ {s.humidity}% RH</span>
                    </div>
                    <div className="text-gray-300">·</div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className={cn("h-3 w-3", s.docReadiness === 100 ? "text-green-500" : s.docReadiness < 50 ? "text-red-500" : "text-amber-500")} strokeWidth={1.5} />
                      <span className="text-gray-500">Docs</span>
                      <span className={cn("font-medium", s.docReadiness === 100 ? "text-green-600" : s.docReadiness < 50 ? "text-red-600" : "text-amber-600")}>{s.docReadiness}%</span>
                    </div>
                  </div>
                </div>

                {/* Action button — only show when there's a real action needed */}
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setSelectedShipment(s.id)} className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    s.demurrageRisk !== null ? "bg-red-600 text-white hover:bg-red-700"
                    : s.status === "delayed" ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : s.docReadiness < 50 ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}>
                    {s.demurrageRisk !== null ? "Resolve Risk"
                    : s.status === "delivered" ? "View History"
                    : s.docReadiness < 50 ? "View Docs"
                    : "Track"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Shipment Detail Drawer — DECLUTTERED (removed Recent Events section) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedShipment(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[520px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selected.id}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selected.flag} {selected.destinationCity}, {selected.destinationCountry}</p>
                </div>
                <button onClick={() => setSelectedShipment(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", shipmentStatusConfig[selected.status].bg, shipmentStatusConfig[selected.status].text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", shipmentStatusConfig[selected.status].dot)} />
                  {shipmentStatusConfig[selected.status].label}
                </span>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Voyage progress — the centerpiece */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Voyage Progress</p>
                <div className="space-y-3">
                  {selected.milestones.map((m, i) => {
                    const stg = shipmentStageConfig[m.stage];
                    const isComplete = m.completed;
                    const isCurrent = !m.completed && i > 0 && selected.milestones[i - 1].completed;
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full shrink-0",
                            isComplete ? "bg-green-100" : isCurrent ? "bg-blue-100 ring-2 ring-blue-200" : "bg-gray-100"
                          )}>
                            <stg.icon className={cn("h-3.5 w-3.5", isComplete ? "text-green-600" : isCurrent ? "text-blue-600" : "text-gray-400")} strokeWidth={1.5} />
                          </div>
                          {i < selected.milestones.length - 1 && (
                            <div className={cn("w-0.5 flex-1 mt-1 mb-1", isComplete ? "bg-green-200" : "bg-gray-100")} style={{ minHeight: "16px" }} />
                          )}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center justify-between">
                            <p className={cn("text-sm", isComplete ? "font-medium text-gray-900" : isCurrent ? "font-semibold text-blue-700" : "text-gray-500")}>
                              {m.label}
                            </p>
                            {m.date && <span className={cn("text-xs", isComplete ? "text-gray-700" : "text-gray-400")}>{m.date}</span>}
                          </div>
                          {m.note && (
                            <p className={cn("text-[11px] mt-0.5", isCurrent ? "text-blue-600" : "text-gray-500")}>{m.note}</p>
                          )}
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-blue-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" /> Current stage
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Container & Booking — DECLUTTERED: removed booking ref (redundant) */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Container & Booking</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Container No</p>
                    <p className="text-sm font-mono font-medium text-gray-900 mt-0.5">{selected.containerNo}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Seal No</p>
                    <p className="text-sm font-mono font-medium text-gray-900 mt-0.5">{selected.sealNo}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Vessel / Voyage</p>
                    <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.vessel} <span className="text-gray-400">· {selected.voyage}</span></p>
                  </div>
                </div>
              </div>

              {/* Cargo + value + insurance */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cargo</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{(selected.weightKg / 1000).toFixed(1)}t</p>
                  <p className="text-[10px] text-gray-400">{selected.lots.length} lot{selected.lots.length > 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contract Value</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">${selected.contractValue.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">{selected.contractId}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Insurance</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">${selected.insuranceValue.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">110% of value</p>
                </div>
              </div>

              {/* Temperature log */}
              {selected.tempLog.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Temperature & Humidity Log</p>
                    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", selected.tempOk ? "text-green-600" : "text-red-600")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", selected.tempOk ? "bg-green-500" : "bg-red-500")} />
                      {selected.tempOk ? "Normal" : "Alert"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="relative h-16 flex items-end gap-1">
                      {selected.tempLog.map((t, i) => {
                        const max = Math.max(...selected.tempLog.map(x => x.temp));
                        const min = Math.min(...selected.tempLog.map(x => x.temp));
                        const range = max - min || 1;
                        const height = 20 + ((t.temp - min) / range) * 60;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${t.day}: ${t.temp}°C / ${t.humidity}% RH`}>
                            <div className={cn("w-full rounded-t", selected.tempOk ? "bg-green-300" : "bg-red-300")} style={{ height: `${height}px` }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                      <span>{selected.tempLog[0]?.day}</span>
                      <span>Latest: {selected.temperature.toFixed(1)}°C · {selected.humidity}% RH</span>
                      <span>{selected.tempLog[selected.tempLog.length - 1]?.day}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Document readiness (links to compliance) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Document Readiness</p>
                  <span className={cn("text-xs font-bold", selected.docReadiness === 100 ? "text-green-600" : selected.docReadiness < 50 ? "text-red-600" : "text-amber-600")}>
                    {selected.docReadiness}%
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                    <div className={cn("h-full", selected.docReadiness === 100 ? "bg-green-500" : selected.docReadiness < 50 ? "bg-red-500" : "bg-amber-500")} style={{ width: `${selected.docReadiness}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-gray-600">
                      {selected.docReadiness === 100 ? "All documents approved — shipment ready at destination port." : selected.docReadiness < 50 ? "Critical: multiple documents missing." : "Some documents still pending."}
                    </p>
                    <button className="text-[11px] font-medium text-[#4A3520] hover:underline shrink-0 ml-2">View in Compliance →</button>
                  </div>
                </div>
              </div>

              {/* REMOVED: Recent Events section (milestone timeline already shows this info) */}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.demurrageRisk !== null && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Renew Phytosanitary Cert</button>
                )}
                {selected.status === "delayed" && (
                  <button className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">Notify Buyer of Delay</button>
                )}
                {selected.docReadiness < 50 && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Resolve Missing Documents</button>
                )}
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Track on Vessel Website</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// CONTRACTS PAGE — "Which contracts need signing?"
// ═══════════════════════════════════════════════════════════
type ContractStatus = "draft" | "pending_buyer_sig" | "pending_seller_sig" | "executed" | "in_progress" | "completed" | "expired" | "cancelled";

type PaymentMilestone = {
  label: string;
  pct: number;
  amount: number;
  dueDate: string | null;
  status: "pending" | "due" | "paid" | "late";
  paidDate?: string | null;
};

type Contract = {
  id: string;
  quoteId: string;
  buyer: string;
  buyerCountry: string;
  buyerContact: string;
  buyerEmail: string;
  seller: string;
  sellerContact: string;
  agent: string;
  commissionPct: number;
  status: ContractStatus;
  incoterm: string;
  destinationPort: string;
  destinationCity: string;
  flag: string;
  currency: string;
  totalValue: number;
  weightKg: number;
  lots: { lotId: string; origin: string; process: string; grade: string; pricePerKg: number; weightKg: number }[];
  paymentTerms: string;
  paymentSchedule: PaymentMilestone[];
  validFrom: string;
  validUntil: string;
  buyerSigned: boolean;
  buyerSignedDate: string | null;
  sellerSigned: boolean;
  sellerSignedDate: string | null;
  shipmentId: string | null;
  shipmentStatus: string | null;
  createdDate: string;
  executedDate: string | null;
  marginPct: number;
  notes?: string;
};

const contractStatusConfig: Record<ContractStatus, { label: string; bg: string; text: string; dot: string; action?: string }> = {
  draft: { label: "Draft", bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400", action: "Send for Signature" },
  pending_buyer_sig: { label: "Awaiting Buyer", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", action: "Send Reminder" },
  pending_seller_sig: { label: "Needs Your Signature", bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-600", action: "Sign Now" },
  executed: { label: "Executed", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", action: "View" },
  in_progress: { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", action: "View Shipment" },
  completed: { label: "Completed", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", action: "View History" },
  expired: { label: "Expired", bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", action: "Renew" },
  cancelled: { label: "Cancelled", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", action: "View" },
};

// Mock contracts data — used as fallback when /api/contracts is unreachable.
// Real data is fetched at runtime from the backend SQLite database.
const mockContractsData: Contract[] = [
  {
    id: "CT-2026-0003", quoteId: "QU-2026-0003", buyer: "Blue Mountain Traders", buyerCountry: "Germany",
    buyerContact: "Hans Müller", buyerEmail: "h.mueller@bluemountain.de", seller: "Coelrodan PLC", sellerContact: "Abi Solomon",
    agent: "Coffee Trade Desk", commissionPct: 2,
    status: "in_progress", incoterm: "CIF Hamburg", destinationPort: "Hamburg", destinationCity: "Hamburg", flag: "🇩🇪",
    currency: "USD", totalValue: 84600, weightKg: 16000,
    lots: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", pricePerKg: 7.10, weightKg: 6000 },
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", pricePerKg: 6.75, weightKg: 6000 },
      { lotId: "LOT-25-0005", origin: "Sidamo", process: "Washed", grade: "G2", pricePerKg: 6.30, weightKg: 4000 },
    ],
    paymentTerms: "LC at sight",
    paymentSchedule: [
      { label: "LC Opening", pct: 100, amount: 84600, dueDate: "Jul 25", status: "paid", paidDate: "Jul 22" },
    ],
    validFrom: "Jul 13", validUntil: "Aug 13",
    buyerSigned: true, buyerSignedDate: "Jul 20", sellerSigned: true, sellerSignedDate: "Jul 13",
    shipmentId: "CT-2026-001", shipmentStatus: "In Transit",
    createdDate: "Jul 13", executedDate: "Jul 20",
    marginPct: 19.6,
  },
  {
    id: "CT-2026-0004", quoteId: "QU-2026-0004", buyer: "Marcus Coffee GmbH", buyerCountry: "Germany",
    buyerContact: "Marcus Bauer", buyerEmail: "marcus@marcuscoffee.de", seller: "Coelrodan PLC", sellerContact: "Abi Solomon",
    agent: "Coffee Trade Desk", commissionPct: 2,
    status: "pending_buyer_sig", incoterm: "CIF Hamburg", destinationPort: "Hamburg", destinationCity: "Hamburg", flag: "🇩🇪",
    currency: "USD", totalValue: 70500, weightKg: 10000,
    lots: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", pricePerKg: 7.20, weightKg: 5000 },
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", pricePerKg: 6.85, weightKg: 5000 },
    ],
    paymentTerms: "30% deposit · 70% against B/L copy",
    paymentSchedule: [
      { label: "30% Deposit", pct: 30, amount: 21150, dueDate: "Jul 31", status: "due" },
      { label: "70% Against B/L", pct: 70, amount: 49350, dueDate: null, status: "pending" },
    ],
    validFrom: "Jul 24", validUntil: "Aug 24",
    buyerSigned: false, buyerSignedDate: null, sellerSigned: true, sellerSignedDate: "Jul 24",
    shipmentId: null, shipmentStatus: null,
    createdDate: "Jul 24", executedDate: null,
    marginPct: 22.4,
    notes: "Buyer asked to review V2 quote terms before signing. Follow up in 3 days if no signature.",
  },
  {
    id: "CT-2026-0005", quoteId: "QU-2026-0006", buyer: "Hashimoto Coffee", buyerCountry: "Japan",
    buyerContact: "Yuki Hashimoto", buyerEmail: "y.hashimoto@hashimoto-coffee.jp", seller: "Coelrodan PLC", sellerContact: "Abi Solomon",
    agent: "Coffee Trade Desk", commissionPct: 2,
    status: "pending_seller_sig", incoterm: "CIF Yokohama", destinationPort: "Yokohama", destinationCity: "Yokohama", flag: "🇯🇵",
    currency: "USD", totalValue: 67800, weightKg: 10000,
    lots: [
      { lotId: "LOT-25-0005", origin: "Sidamo", process: "Washed", grade: "G2", pricePerKg: 6.10, weightKg: 6000 },
      { lotId: "LOT-25-0007", origin: "Limu", process: "Washed", grade: "G1", pricePerKg: 6.10, weightKg: 4000 },
    ],
    paymentTerms: "T/T 50/50",
    paymentSchedule: [
      { label: "50% Advance", pct: 50, amount: 33900, dueDate: "Aug 05", status: "pending" },
      { label: "50% Before Arrival", pct: 50, amount: 33900, dueDate: null, status: "pending" },
    ],
    validFrom: "Jul 25", validUntil: "Aug 25",
    buyerSigned: true, buyerSignedDate: "Jul 23", sellerSigned: false, sellerSignedDate: null,
    shipmentId: null, shipmentStatus: null,
    createdDate: "Jul 23", executedDate: null,
    marginPct: 14.8,
    notes: "Counter-offer accepted at $6.10 (midpoint). Margin compressed from 19.8% to 14.8% but Limu G1 is scarce — accept to retain relationship.",
  },
  {
    id: "CT-2026-0002", quoteId: "QU-2026-0002", buyer: "Rösterei Berlin", buyerCountry: "Germany",
    buyerContact: "Anna Schmidt", buyerEmail: "anna@roesterei-berlin.de", seller: "Coelrodan PLC", sellerContact: "Abi Solomon",
    agent: "Coffee Trade Desk", commissionPct: 2,
    status: "cancelled", incoterm: "FOB Djibouti", destinationPort: "Hamburg", destinationCity: "Hamburg", flag: "🇩🇪",
    currency: "USD", totalValue: 39000, weightKg: 5000,
    lots: [
      { lotId: "LOT-25-0004", origin: "Guji", process: "Natural", grade: "G1", pricePerKg: 7.80, weightKg: 5000 },
    ],
    paymentTerms: "T/T 30 days",
    paymentSchedule: [],
    validFrom: "Jul 09", validUntil: "Jul 30",
    buyerSigned: false, buyerSignedDate: null, sellerSigned: true, sellerSignedDate: "Jul 09",
    shipmentId: null, shipmentStatus: null,
    createdDate: "Jul 08", executedDate: null,
    marginPct: 25.4,
    notes: "Cancelled after sample scored 83.0 — below buyer's 86+ threshold for specialty Guji Natural.",
  },
  {
    id: "CT-2026-0007", quoteId: "QU-2026-0007", buyer: "Aurora Imports", buyerCountry: "USA",
    buyerContact: "Sarah Chen", buyerEmail: "sarah@auroraimports.com", seller: "Coelrodan PLC", sellerContact: "Abi Solomon",
    agent: "Coffee Trade Desk", commissionPct: 2,
    status: "draft", incoterm: "CIF New York", destinationPort: "New York", destinationCity: "New York", flag: "🇺🇸",
    currency: "USD", totalValue: 22500, weightKg: 3000,
    lots: [
      { lotId: "LOT-25-0004", origin: "Guji", process: "Natural", grade: "G1", pricePerKg: 7.50, weightKg: 3000 },
    ],
    paymentTerms: "30% deposit · 70% against B/L copy",
    paymentSchedule: [
      { label: "30% Deposit", pct: 30, amount: 6750, dueDate: null, status: "pending" },
      { label: "70% Against B/L", pct: 70, amount: 15750, dueDate: null, status: "pending" },
    ],
    validFrom: "Jul 24", validUntil: "Aug 24",
    buyerSigned: false, buyerSignedDate: null, sellerSigned: false, sellerSignedDate: null,
    shipmentId: null, shipmentStatus: null,
    createdDate: "Jul 24", executedDate: null,
    marginPct: 21.3,
    notes: "Generated from AI-drafted quote. Buyer is new lead — verify creditworthiness before sending for signature.",
  },
  {
    id: "CT-2025-0195", quoteId: "QU-2025-0198", buyer: "Marcus Coffee GmbH", buyerCountry: "Germany",
    buyerContact: "Marcus Bauer", buyerEmail: "marcus@marcuscoffee.de", seller: "Coelrodan PLC", sellerContact: "Abi Solomon",
    agent: "Coffee Trade Desk", commissionPct: 2,
    status: "completed", incoterm: "CIF Hamburg", destinationPort: "Hamburg", destinationCity: "Hamburg", flag: "🇩🇪",
    currency: "USD", totalValue: 58900, weightKg: 8000,
    lots: [
      { lotId: "LOT-24-0089", origin: "Yirgacheffe", process: "Washed", grade: "G1", pricePerKg: 7.00, weightKg: 8000 },
    ],
    paymentTerms: "LC at sight",
    paymentSchedule: [
      { label: "LC Payment", pct: 100, amount: 58900, dueDate: "Jul 09", status: "paid", paidDate: "Jul 11" },
    ],
    validFrom: "Jun 12", validUntil: "Jul 12",
    buyerSigned: true, buyerSignedDate: "Jun 14", sellerSigned: true, sellerSignedDate: "Jun 12",
    shipmentId: "CT-2025-0198", shipmentStatus: "Delivered",
    createdDate: "Jun 12", executedDate: "Jun 14",
    marginPct: 23.1,
  },
  {
    id: "CT-2026-0008", quoteId: "QU-2026-0008", buyer: "Seoul Coffee Lab", buyerCountry: "South Korea",
    buyerContact: "Min-jun Park", buyerEmail: "park@seoulcoffee.kr", seller: "Coelrodan PLC", sellerContact: "Abi Solomon",
    agent: "Coffee Trade Desk", commissionPct: 2,
    status: "executed", incoterm: "CIF Busan", destinationPort: "Busan", destinationCity: "Busan", flag: "🇰🇷",
    currency: "USD", totalValue: 27600, weightKg: 4000,
    lots: [
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", pricePerKg: 6.90, weightKg: 4000 },
    ],
    paymentTerms: "T/T 50/50",
    paymentSchedule: [
      { label: "50% Advance", pct: 50, amount: 13800, dueDate: "Jul 24", status: "paid", paidDate: "Jul 22" },
      { label: "50% Before Arrival", pct: 50, amount: 13800, dueDate: "Aug 10", status: "pending" },
    ],
    validFrom: "Jul 18", validUntil: "Aug 18",
    buyerSigned: true, buyerSignedDate: "Jul 20", sellerSigned: true, sellerSignedDate: "Jul 18",
    shipmentId: "CT-2026-005", shipmentStatus: "In Transit",
    createdDate: "Jul 18", executedDate: "Jul 20",
    marginPct: 20.8,
  },
];

function ContractCard({ contract, onClick }: { contract: Contract; onClick: () => void }) {
  const sc = contractStatusConfig[contract.status];
  const paidAmount = contract.paymentSchedule.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalDue = contract.paymentSchedule.reduce((s, p) => s + p.amount, 0);
  const paidPct = totalDue > 0 ? (paidAmount / totalDue) * 100 : 0;
  const isUrgent = contract.status === "pending_buyer_sig" || contract.status === "pending_seller_sig";

  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300"
    >
      <div className="flex items-start gap-4">
        {/* Status indicator */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <span className={cn("h-3 w-3 rounded-full", sc.dot)} />
          <div className="w-px flex-1 bg-gray-100" style={{ minHeight: "40px" }} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">{contract.id}</span>
              <span className="text-sm text-gray-600">{contract.flag} {contract.buyer}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">from {contract.quoteId}</span>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
              {sc.label}
            </span>
          </div>

          {/* Lots */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {contract.lots.map((l, i) => (
              <span key={i} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-xs text-gray-600">
                {l.lotId} · {l.origin} {l.process} · {(l.weightKg / 1000).toFixed(1)}t @ ${l.pricePerKg.toFixed(2)}/kg
              </span>
            ))}
          </div>

          {/* Key terms */}
          <div className="flex items-center gap-6 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Value:</span>
              <span className="font-bold text-gray-900">${contract.totalValue.toLocaleString()}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{(contract.weightKg / 1000).toFixed(1)}t</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Incoterm:</span>
              <span className="font-medium text-gray-700">{contract.incoterm}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Margin:</span>
              <span className={cn("font-bold", contract.marginPct >= 20 ? "text-green-600" : contract.marginPct >= 12 ? "text-amber-600" : "text-red-600")}>{contract.marginPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileSignature className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
              <span className="text-gray-500">
                {contract.buyerSigned && contract.sellerSigned ? `Both signed ${contract.executedDate}`
                : contract.buyerSigned ? `Buyer signed ${contract.buyerSignedDate}, awaiting you`
                : contract.sellerSigned ? `You signed ${contract.sellerSignedDate}, awaiting buyer`
                : "Awaiting both signatures"}
              </span>
            </div>
          </div>

          {/* Payment progress + shipment strip */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 text-[11px]">
            {contract.paymentSchedule.length > 0 && (
              <>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3 text-gray-400" strokeWidth={1.5} />
                  <span className="text-gray-500">Payment</span>
                  <span className={cn("font-medium", paidPct === 100 ? "text-green-600" : paidPct > 0 ? "text-amber-600" : "text-gray-700")}>
                    {paidPct === 100 ? "Paid in full" : paidPct > 0 ? `${paidPct.toFixed(0)}% received` : "Awaiting payment"}
                  </span>
                </div>
                <div className="text-gray-300">·</div>
              </>
            )}
            {contract.shipmentId ? (
              <div className="flex items-center gap-1.5">
                <Ship className="h-3 w-3 text-blue-500" strokeWidth={1.5} />
                <span className="text-gray-500">Shipment</span>
                <span className="font-medium text-blue-600">{contract.shipmentId}</span>
                <span className="text-gray-400">· {contract.shipmentStatus}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-gray-400" strokeWidth={1.5} />
                <span className="text-gray-500">Valid until {contract.validUntil}</span>
              </div>
            )}
          </div>

          {/* AI insight for pending contracts */}
          {contract.notes && isUrgent && (
            <div className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 flex items-start gap-2">
              <Sparkles className="h-3 w-3 text-indigo-500 mt-0.5 shrink-0" strokeWidth={1.5} />
              <p className="text-xs text-gray-700 italic">{contract.notes}</p>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onClick}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              contract.status === "pending_seller_sig" ? "bg-[#4A3520] text-white hover:bg-[#6B4E33]"
              : contract.status === "pending_buyer_sig" ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : contract.status === "draft" ? "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {sc.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContractDetailDrawer({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const sc = contractStatusConfig[contract.status];
  const paidAmount = contract.paymentSchedule.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-[520px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{contract.id}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{contract.flag} {contract.buyer} · {contract.buyerCountry}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
              {sc.label}
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">From quote {contract.quoteId}</span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Signature status — the key action for pending contracts */}
          {(contract.status === "pending_buyer_sig" || contract.status === "pending_seller_sig" || contract.status === "draft") && (
            <div className={cn("rounded-lg p-4 border", contract.status === "pending_seller_sig" ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-gray-50")}>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Signature Status</p>
              <div className="grid grid-cols-2 gap-3">
                <div className={cn("rounded-lg p-3 border-2", contract.sellerSigned ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Seller</span>
                    {contract.sellerSigned ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Clock className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{contract.seller}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{contract.sellerContact}</p>
                  {contract.sellerSigned ? (
                    <p className="text-[10px] text-green-600 font-medium mt-1">Signed {contract.sellerSignedDate}</p>
                  ) : (
                    <p className="text-[10px] text-amber-600 font-medium mt-1">Awaiting your signature</p>
                  )}
                </div>
                <div className={cn("rounded-lg p-3 border-2", contract.buyerSigned ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Buyer</span>
                    {contract.buyerSigned ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Clock className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{contract.buyer}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{contract.buyerContact}</p>
                  {contract.buyerSigned ? (
                    <p className="text-[10px] text-green-600 font-medium mt-1">Signed {contract.buyerSignedDate}</p>
                  ) : (
                    <p className="text-[10px] text-amber-600 font-medium mt-1">Awaiting buyer signature</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contract terms */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Contract Terms</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Value</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">${contract.totalValue.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{contract.currency}</span></p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Weight</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{(contract.weightKg / 1000).toFixed(1)}t <span className="text-[10px] font-normal text-gray-400">{contract.weightKg.toLocaleString()} kg</span></p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Incoterm</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.incoterm}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Payment Terms</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.paymentTerms}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Valid From</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.validFrom}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Valid Until</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.validUntil}</p>
              </div>
            </div>
          </div>

          {/* Margin analysis */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Margin</span>
              <span className={cn("text-sm font-bold", contract.marginPct >= 20 ? "text-green-600" : contract.marginPct >= 12 ? "text-amber-600" : "text-red-600")}>{contract.marginPct.toFixed(1)}%</span>
            </div>
            <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={cn("h-full", contract.marginPct >= 20 ? "bg-green-500" : contract.marginPct >= 12 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(contract.marginPct * 3, 100)}%` }} />
              <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: "60%" }} title="Target 20%" />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0%</span>
              <span>Target 20%</span>
              <span>33%+</span>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
              <span className="text-gray-500">Agent commission ({contract.commissionPct}%)</span>
              <span className="font-medium text-gray-700">${(contract.totalValue * contract.commissionPct / 100).toLocaleString()} <span className="text-gray-400">via {contract.agent}</span></span>
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Coffee Lots</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Lot</th>
                    <th className="px-3 py-2 text-left font-medium">Origin</th>
                    <th className="px-3 py-2 text-right font-medium">Kg</th>
                    <th className="px-3 py-2 text-right font-medium">$/kg</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.lots.map((l, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{l.lotId}</td>
                      <td className="px-3 py-2 text-gray-600">{l.origin} {l.process} {l.grade}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{l.weightKg.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-gray-700">${l.pricePerKg.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">${(l.weightKg * l.pricePerKg).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment schedule */}
          {contract.paymentSchedule.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Payment Schedule</p>
              <div className="space-y-2">
                {contract.paymentSchedule.map((p, i) => {
                  const payConfig: Record<string, { bg: string; text: string; label: string }> = {
                    paid: { bg: "bg-green-50", text: "text-green-700", label: `Paid ${p.paidDate}` },
                    due: { bg: "bg-amber-50", text: "text-amber-700", label: `Due ${p.dueDate}` },
                    late: { bg: "bg-red-50", text: "text-red-700", label: `Late — was due ${p.dueDate}` },
                    pending: { bg: "bg-gray-50", text: "text-gray-600", label: p.dueDate ? `Due ${p.dueDate}` : "TBD" },
                  };
                  const pc = payConfig[p.status];
                  return (
                    <div key={i} className={cn("rounded-lg border p-3 flex items-center justify-between", pc.bg, "border-gray-200")}>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.label}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{p.pct}% of total · {pc.label}</p>
                      </div>
                      <p className={cn("text-sm font-bold", pc.text)}>${p.amount.toLocaleString()}</p>
                    </div>
                  );
                })}
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Received</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">of ${contract.totalValue.toLocaleString()} contract value</p>
                  </div>
                  <p className={cn("text-sm font-bold", paidAmount === contract.totalValue ? "text-green-600" : paidAmount > 0 ? "text-amber-600" : "text-gray-700")}>
                    ${paidAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Linked shipment */}
          {contract.shipmentId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">Linked Shipment</p>
                  <p className="text-sm font-bold text-gray-900">{contract.shipmentId}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Status: {contract.shipmentStatus}</p>
                </div>
                <button className="text-xs font-medium text-[#4A3520] hover:underline shrink-0">View in Shipments →</button>
              </div>
            </div>
          )}

          {/* AI Notes */}
          {contract.notes && (
            <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
                <span className="text-xs font-semibold text-indigo-600">AI NOTE</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{contract.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            {contract.status === "draft" && (
              <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Send Contract for Signatures</button>
            )}
            {contract.status === "pending_seller_sig" && (
              <>
                <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Sign Contract (E-Signature)</button>
                <button className="w-full rounded-lg border border-red-200 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors">Decline to Sign</button>
              </>
            )}
            {contract.status === "pending_buyer_sig" && (
              <>
                <button className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">Send Reminder to Buyer</button>
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Contract PDF</button>
              </>
            )}
            {contract.status === "executed" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Signed Contract</button>
            )}
            {contract.status === "in_progress" && contract.shipmentId && (
              <button className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">View Shipment {contract.shipmentId}</button>
            )}
            {contract.status === "completed" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Final Documents</button>
            )}
            {contract.status === "cancelled" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Cancellation Reason</button>
            )}
            {contract.status === "expired" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Renew Contract</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractsPage() {
  const [filter, setFilter] = useState("All");
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const filters = ["All", "Needs Signature", "Executed", "In Progress", "Completed", "Cancelled"];

  // ─── Live data from backend ───
  const [contractsData, setContractsData] = useState<Contract[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contracts")
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.contracts) && data.contracts.length > 0) {
          setContractsData(data.contracts);
        } else {
          setContractsData(mockContractsData);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[ContractsPage] API fetch failed, using mock data:", err);
        setContractsData(mockContractsData);
      });
    return () => { cancelled = true; };
  }, []);

  const filterMap: Record<string, (c: Contract) => boolean> = {
    "All": () => true,
    "Needs Signature": (c) => c.status === "pending_buyer_sig" || c.status === "pending_seller_sig" || c.status === "draft",
    "Executed": (c) => c.status === "executed",
    "In Progress": (c) => c.status === "in_progress",
    "Completed": (c) => c.status === "completed",
    "Cancelled": (c) => c.status === "cancelled" || c.status === "expired",
  };

  // Loading state
  if (!contractsData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contracts</h1>
            <p className="text-sm text-gray-500 mt-1">Which contracts need signing?</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading contracts from database…</p>
        </div>
      </main>
    );
  }

  const filtered = contractsData.filter(filterMap[filter]);

  const stats = {
    total: contractsData.length,
    needsAction: contractsData.filter(c => c.status === "pending_buyer_sig" || c.status === "pending_seller_sig" || c.status === "draft").length,
    active: contractsData.filter(c => c.status === "executed" || c.status === "in_progress").length,
    completed: contractsData.filter(c => c.status === "completed").length,
    totalValue: contractsData.filter(c => c.status !== "cancelled" && c.status !== "expired").reduce((s, c) => s + c.totalValue, 0),
    avgMargin: (() => {
      const actionable = contractsData.filter(c => c.status !== "cancelled" && c.status !== "expired");
      return actionable.length > 0 ? actionable.reduce((s, c) => s + c.marginPct, 0) / actionable.length : 0;
    })(),
    awaitingYourSig: contractsData.filter(c => c.status === "pending_seller_sig").length,
    awaitingBuyerSig: contractsData.filter(c => c.status === "pending_buyer_sig").length,
  };

  const selected = contractsData.find(c => c.id === selectedContract);

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contracts</h1>
          <p className="text-sm text-gray-500 mt-1">Which contracts need signing?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Plus className="h-4 w-4" /> New Contract
        </button>
      </div>

      {/* AI Insight Banner — only shows if there's something actionable */}
      {stats.needsAction > 0 && (
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <FileSignature className="h-5 w-5 text-amber-600" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-amber-700">{stats.needsAction} contracts need attention</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {stats.awaitingYourSig > 0 && <><span className="font-semibold text-amber-700">{stats.awaitingYourSig} contract{stats.awaitingYourSig > 1 ? "s" : ""} awaiting your signature</span> — Hashimoto Coffee (CT-2026-0005) has been waiting 2 days. Margin compressed to 14.8% but Limu G1 is scarce. </>}
                {stats.awaitingBuyerSig > 0 && <>{stats.awaitingBuyerSig} awaiting buyer — Marcus Coffee (CT-2026-0004) sent yesterday, typical response is 2-3 days. </>}
                Aurora Imports (CT-2026-0007) is a draft — verify credit before sending.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Needs Action</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.needsAction}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.awaitingYourSig} yours · {stats.awaitingBuyerSig} buyer's</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.active}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">executed or in progress</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${(stats.totalValue / 1000).toFixed(0)}K</p>
          <p className="text-[11px] text-gray-400 mt-0.5">across {stats.total - 2} active contracts</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Avg Margin</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn("text-2xl font-bold", stats.avgMargin >= 20 ? "text-green-600" : stats.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{stats.avgMargin.toFixed(1)}%</p>
            <span className="text-[11px] text-gray-400">target 20%</span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {filters.map((f) => {
          const count = contractsData.filter(filterMap[f]).length;
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

      {/* Contract cards */}
      <div className="space-y-3">
        {filtered.map((c) => (
          <ContractCard key={c.id} contract={c} onClick={() => setSelectedContract(c.id)} />
        ))}
      </div>

      {/* Detail Drawer */}
      {selected && (
        <ContractDetailDrawer contract={selected} onClose={() => setSelectedContract(null)} />
      )}
    </main>
  );
}


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

// Mock finance data — used as fallback when /api/finance is unreachable.
const mockTransactionsData: Transaction[] = [
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
          setTransactionsData(mockTransactionsData);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[FinancePage] API fetch failed, using mock data:", err);
        setTransactionsData(mockTransactionsData);
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

// ═══════════════════════════════════════════════════════════
// AI COACH PAGE — "What should I do next?"
// ═══════════════════════════════════════════════════════════
type Priority = {
  rank: number;
  category: "revenue" | "risk" | "relationship" | "operational";
  action: string;
  context: string;
  impact: string;
  eta: string;
  page: Page;
  urgency: "critical" | "high" | "medium";
};

type Insight = {
  type: "pattern" | "opportunity" | "warning";
  title: string;
  body: string;
  metric?: string;
};

type RiskItem = {
  title: string;
  severity: "critical" | "high" | "medium";
  probability: number;
  impact: string;
  mitigation: string;
  daysToImpact: number;
};

type Opportunity = {
  title: string;
  buyer: string;
  potentialValue: number;
  action: string;
  deadline: string;
};

type AIAction = {
  time: string;
  agent: string;
  action: string;
  status: "completed" | "pending_approval" | "in_progress";
  detail: string;
};

const coachPriorities: Priority[] = [
  {
    rank: 1,
    category: "risk",
    action: "Renew phytosanitary certificate for CT-2026-001",
    context: "Container MSCU-7729340 is at sea heading to Hamburg. Cert expires Jul 30, vessel arrives Aug 09.",
    impact: "$420/day demurrage if cert not ready at port",
    eta: "Submit today — 5-7 day processing at EAA",
    page: "compliance",
    urgency: "critical",
  },
  {
    rank: 2,
    category: "revenue",
    action: "Sign contract CT-2026-0005 (Hashimoto Coffee)",
    context: "Buyer signed Jul 23. Counter-offer accepted at $6.10 (midpoint). Margin compressed to 14.8% but Limu G1 is scarce.",
    impact: "$67,800 contract value · retain Japanese relationship",
    eta: "Sign today — buyer waiting 2 days",
    page: "contracts",
    urgency: "high",
  },
  {
    rank: 3,
    category: "operational",
    action: "Resolve 5 missing documents for CT-2026-004 (Yokohama)",
    context: "Aurora Imports shipment. Phytosanitary, export permit, certificate of origin, fumigation, B/L all missing.",
    impact: "$41,200 shipment · vessel departs Aug 02 (8 days)",
    eta: "Start applications today — cutoff is Jul 31",
    page: "compliance",
    urgency: "high",
  },
  {
    rank: 4,
    category: "revenue",
    action: "Send follow-up on Quote QU-2026-0008 (Seoul Coffee Lab)",
    context: "Sent Jul 20, no response in 4 days. Buyer's typical response time is 3-5 days.",
    impact: "$27,600 potential · vessel CT-2026-005 already en route to Busan",
    eta: "Wait 1 more day, then follow up",
    page: "quotes",
    urgency: "medium",
  },
  {
    rank: 5,
    category: "relationship",
    action: "Send breakup email to Nordic Bean Co (QU-2026-0001)",
    context: "Quote expired 15 days ago with no response. Yirgacheffe LOT-25-0001 was later sold at $7.10.",
    impact: "Re-engage prospect · $28K potential if renewed",
    eta: "Send this week — 30-day re-engagement window",
    page: "quotes",
    urgency: "medium",
  },
];

const coachInsights: Insight[] = [
  {
    type: "pattern",
    title: "Yirgacheffe is your best performer",
    body: "Yirgacheffe G1 lots have closed at $7.00-$7.20/kg this season — 8% above ECX auction average. Buyers consistently approve samples. Consider expanding Yirgacheffe supplier relationships for next harvest.",
    metric: "$7.10/kg avg · 4 deals closed",
  },
  {
    type: "opportunity",
    title: "Marcus Coffee wants more Guji",
    body: "Marcus Coffee accepted V2 quote at $6.85/kg Guji. Their buyer asked about long-term supply. They typically order 8-10t per quarter. A standing offer could lock in $70K+ annual revenue.",
    metric: "$70K+ potential annual",
  },
  {
    type: "warning",
    title: "Sidamo G2 margin compressing",
    body: "Sidamo G2 sold at $6.30/kg in CT-2026-0003 (margin 19.6%) but cost basis rose to $4.85/kg. If trend continues, Sidamo G2 margins will fall below 15% target. Consider sourcing Sidamo G1 or shifting to Limu.",
    metric: "Margin trend: 22% → 19.6% → 17.5% projected",
  },
  {
    type: "pattern",
    title: "CIF Hamburg is your strongest route",
    body: "3 of 5 active shipments go to Hamburg. MSC and Hapag-Lloyd both reliable. Avg transit 21 days. On-time rate 100%. Consider negotiating volume freight discount with MSC for next quarter.",
    metric: "$2,800-$3,200/shipment · 21-day transit",
  },
];

const coachRisks: RiskItem[] = [
  {
    title: "Phytosanitary expiry blocks Hamburg arrival",
    severity: "critical",
    probability: 95,
    impact: "$8,400+ demurrage (20+ days at $420/day) + buyer relationship damage",
    mitigation: "Submit EAA renewal application today. Express processing available for +50% fee.",
    daysToImpact: 4,
  },
  {
    title: "Yokohama shipment may miss vessel cutoff",
    severity: "high",
    probability: 70,
    impact: "Container roll to next vessel (10-14 day delay) + $41K contract at risk",
    mitigation: "Prioritize ECX grading + export permit applications. Use broker for expedited processing.",
    daysToImpact: 7,
  },
  {
    title: "Hashimoto contract lapses if not signed",
    severity: "high",
    probability: 40,
    impact: "Lose $67.8K contract + Japanese market relationship",
    mitigation: "Sign today. Margin 14.8% is acceptable — Limu G1 scarcity justifies acceptance.",
    daysToImpact: 5,
  },
  {
    title: "Seoul Coffee Lab may source elsewhere",
    severity: "medium",
    probability: 35,
    impact: "Lose $27.6K quote + future Korean business",
    mitigation: "Wait 1 more day, then send value-focused follow-up referencing Busan shipment progress.",
    daysToImpact: 3,
  },
];

const coachOpportunities: Opportunity[] = [
  {
    title: "Aurora Imports — New US market entry",
    buyer: "Aurora Imports",
    potentialValue: 22500,
    action: "Verify credit → send contract for QU-2026-0007",
    deadline: "This week",
  },
  {
    title: "Marcus Coffee — Standing supply offer",
    buyer: "Marcus Coffee GmbH",
    potentialValue: 70000,
    action: "Draft annual supply MOU for Guji G1",
    deadline: "Next 2 weeks",
  },
  {
    title: "Falcon Coffee UK — Pre-discount quote",
    buyer: "Falcon Coffee UK",
    potentialValue: 55600,
    action: "Send revised QU-2026-0005 at $6.75/kg (pre-discount)",
    deadline: "While sample SR-2026-0002 is in transit",
  },
];

const coachAiActions: AIAction[] = [
  { time: "2h ago", agent: "Outreach Agent", action: "Drafted Quote QU-2026-0007 for Aurora Imports", status: "completed", detail: "Pulled pricing from comparable US deals. Margin 21.3%." },
  { time: "5h ago", agent: "Compliance Agent", action: "Flagged phytosanitary expiry on CT-2026-001", status: "completed", detail: "Cross-referenced EAA renewal timeline vs vessel ETA." },
  { time: "Yesterday", agent: "Supplier Agent", action: "Identified LOT-25-0007 (Limu G1) for Hashimoto counter", status: "completed", detail: "Substituted higher-margin lot in V3 quote." },
  { time: "Yesterday", agent: "Logistics Agent", action: "Tracked MSC Hamburg through Suez Canal", status: "completed", detail: "On schedule. Updated milestone timeline." },
  { time: "2 days ago", agent: "Customer Agent", action: "Drafted breakup email for Nordic Bean Co", status: "pending_approval", detail: "Awaiting your review before sending." },
  { time: "3 days ago", agent: "Outreach Agent", action: "Researched 12 new German specialty roasters", status: "in_progress", detail: "Found 4 with annual imports >5t. Adding to Leads." },
];

const urgencyConfig: Record<Priority["urgency"], { color: string; bg: string; text: string; label: string }> = {
  critical: { color: "bg-red-500", bg: "bg-red-50", text: "text-red-700", label: "Critical" },
  high: { color: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", label: "High" },
  medium: { color: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", label: "Medium" },
};

const categoryConfig: Record<Priority["category"], { icon: any; label: string }> = {
  revenue: { icon: DollarSign, label: "Revenue" },
  risk: { icon: AlertTriangle, label: "Risk" },
  relationship: { icon: Users, label: "Relationship" },
  operational: { icon: Ship, label: "Operational" },
};

const insightTypeConfig: Record<Insight["type"], { icon: any; bg: string; text: string; label: string }> = {
  pattern: { icon: TrendingUp, bg: "bg-blue-50", text: "text-blue-700", label: "Pattern" },
  opportunity: { icon: Star, bg: "bg-green-50", text: "text-green-700", label: "Opportunity" },
  warning: { icon: AlertTriangle, bg: "bg-amber-50", text: "text-amber-700", label: "Warning" },
};

const severityConfig: Record<RiskItem["severity"], { bg: string; text: string; bar: string; label: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500", label: "Critical" },
  high: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500", label: "High" },
  medium: { bg: "bg-yellow-50", text: "text-yellow-700", bar: "bg-yellow-500", label: "Medium" },
};

const aiActionStatusConfig: Record<AIAction["status"], { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-green-50", text: "text-green-700", label: "Completed" },
  pending_approval: { bg: "bg-amber-50", text: "text-amber-700", label: "Needs Approval" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", label: "In Progress" },
};

function CoachPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Good morning, Abi. I've reviewed all 11 active deals, 6 shipments, and your compliance tracker. You have 2 critical items needing action today — the phytosanitary renewal and the Hashimoto contract signature. Want me to walk you through them?" },
  ]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    setTimeout(() => {
      let response = "I'll look into that for you.";
      const lower = userMsg.toLowerCase();
      if (lower.includes("margin")) {
        response = "Your average margin across active quotes is 21.9% — above the 20% target. Lowest is Hashimoto at 14.8% (counter-offer accepted). Highest is Rösterei Berlin at 25.4% (rejected on quality). I recommend accepting Hashimoto — Limu G1 scarcity justifies the compressed margin.";
      } else if (lower.includes("hashimoto") || lower.includes("sign")) {
        response = "Hashimoto Coffee (CT-2026-0005) is awaiting your signature. Buyer signed Jul 23. Contract value $67,800. Margin 14.8% (compressed from 19.8% after counter at $6.10). Recommend signing today — Limu G1 is scarce and retaining the Japanese relationship has long-term value.";
      } else if (lower.includes("phyto") || lower.includes("hamburg") || lower.includes("demurrage")) {
        response = "Phytosanitary cert PHY-2026-0892 for CT-2026-001 expires Jul 30 (4 days). Vessel MSC Hamburg arrives Aug 09. Renewal takes 5-7 days at EAA. If you submit today, cert will be ready Aug 01 — 8 days before arrival. Risk cost: $420/day demurrage if not ready. Express processing (+50% fee) available if needed.";
      } else if (lower.includes("priority") || lower.includes("today")) {
        response = "Today's top 3 priorities: 1) Renew phytosanitary cert (critical — $420/day risk), 2) Sign Hashimoto contract (high — $67.8K value), 3) Start CT-2026-004 doc applications (high — vessel departs Aug 02). All 3 are listed in the priorities panel above with one-click navigation.";
      } else {
        response = "I can help with margins, contracts, shipments, compliance, or strategic decisions. Try asking 'Should I sign the Hashimoto contract?' or 'What's my risk exposure this week?'";
      }
      setChatMessages(prev => [...prev, { role: "ai", text: response }]);
    }, 800);
  };

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Coach</h1>
        <p className="text-sm text-gray-500 mt-1">What should I do next?</p>
      </div>

      {/* Morning Brief */}
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
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              You have <span className="font-semibold text-red-700">1 critical risk</span> (phytosanitary expiry), <span className="font-semibold text-amber-700">2 high-priority actions</span> (sign Hashimoto contract, resolve CT-2026-004 docs), and <span className="font-semibold text-green-600">$84,600 in received revenue</span> this month. Pipeline is healthy at 21.9% avg margin. Net profit YTD is <span className="font-semibold text-green-600">$42,580</span> (19.4% margin). Two opportunities worth <span className="font-semibold text-gray-900">$92,500</span> are ripe for action this week.
            </p>
            <div className="grid grid-cols-5 gap-3 pt-4 border-t border-indigo-100">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Active Deals</p>
                <p className="text-lg font-bold text-gray-900">11</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Pipeline</p>
                <p className="text-lg font-bold text-gray-900">$245K</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">At Risk</p>
                <p className="text-lg font-bold text-red-600">2</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Margin</p>
                <p className="text-lg font-bold text-green-600">21.9%</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Net Profit</p>
                <p className="text-lg font-bold text-green-600">$42.6K</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Priorities */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Today&apos;s Top 5 Priorities</h3>
          <span className="text-xs text-gray-400">ordered by impact</span>
        </div>
        <div className="space-y-3">
          {coachPriorities.map((p) => {
            const uc = urgencyConfig[p.urgency];
            const cc = categoryConfig[p.category];
            const pageLabel = p.page.charAt(0).toUpperCase() + p.page.slice(1);
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
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200">
                      <cc.icon className="h-2.5 w-2.5" /> {cc.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{p.context}</p>
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3 w-3 text-gray-400" />
                      <span className="text-gray-500">{p.impact}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span className="text-gray-500">{p.eta}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate(p.page)}
                  className="shrink-0 rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors"
                >
                  Go to {pageLabel} →
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk Radar + Opportunities */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-gray-900">Risk Radar</h3>
            <span className="text-xs text-gray-400 ml-auto">next 7 days</span>
          </div>
          <div className="space-y-3">
            {coachRisks.map((r, i) => {
              const sc = severityConfig[r.severity];
              return (
                <div key={i} className={cn("rounded-lg p-3 border", sc.bg, "border-gray-200")}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-900 flex-1">{r.title}</p>
                    <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold", sc.bg, sc.text)}>
                      {sc.label} · {r.probability}%
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mb-2">{r.impact}</p>
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Fix:</span>
                    <p className="text-[11px] text-gray-700 flex-1">{r.mitigation}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{r.daysToImpact} days to impact</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-4 w-4 text-green-500" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-gray-900">Opportunities</h3>
            <span className="text-xs text-gray-400 ml-auto">act this week</span>
          </div>
          <div className="space-y-3">
            {coachOpportunities.map((o, i) => (
              <div key={i} className="rounded-lg border border-green-200 bg-green-50/30 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 flex-1">{o.title}</p>
                  <p className="text-sm font-bold text-green-600 shrink-0">${(o.potentialValue / 1000).toFixed(1)}K</p>
                </div>
                <p className="text-[11px] text-gray-500 mb-2">{o.buyer}</p>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <p className="text-[11px] text-gray-700">{o.action}</p>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{o.deadline}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategic Insights */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-gray-900">Strategic Insights</h3>
          <span className="text-xs text-gray-400 ml-auto">patterns I&apos;ve spotted</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {coachInsights.map((ins, i) => {
            const ic = insightTypeConfig[ins.type];
            return (
              <div key={i} className={cn("rounded-lg border p-4", ic.bg, "border-gray-200")}>
                <div className="flex items-center gap-2 mb-2">
                  <ic.icon className={cn("h-4 w-4", ic.text)} strokeWidth={1.5} />
                  <span className={cn("text-[10px] font-semibold uppercase tracking-wider", ic.text)}>{ic.label}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">{ins.title}</p>
                <p className="text-xs text-gray-600 leading-relaxed mb-2">{ins.body}</p>
                {ins.metric && (
                  <p className={cn("text-xs font-semibold pt-2 border-t border-gray-100", ic.text)}>{ins.metric}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent AI Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-gray-900">Recent AI Agent Actions</h3>
          </div>
          <span className="text-xs text-gray-400">last 3 days</span>
        </div>
        <div className="space-y-2">
          {coachAiActions.map((a, i) => {
            const sc = aiActionStatusConfig[a.status];
            return (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex flex-col items-center pt-1">
                  <span className={cn("h-2 w-2 rounded-full", a.status === "completed" ? "bg-green-500" : a.status === "pending_approval" ? "bg-amber-500" : "bg-blue-500")} />
                  {i < coachAiActions.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" style={{ minHeight: "20px" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-gray-900">{a.action}</p>
                    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", sc.bg, sc.text)}>{sc.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{a.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400">{a.time}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{a.agent}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ask AI Anything */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-gray-900">Ask AI Anything</h3>
        </div>

        <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
          {chatMessages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-lg px-4 py-2.5 text-sm",
                m.role === "user" ? "bg-[#4A3520] text-white" : "bg-white border border-gray-200 text-gray-700"
              )}>
                {m.role === "ai" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bot className="h-3 w-3 text-indigo-500" />
                    <span className="text-[10px] font-semibold text-indigo-600">COACH</span>
                  </div>
                )}
                <p className="leading-relaxed">{m.text}</p>
              </div>
            </div>
          ))}
        </div>

        {chatMessages.length <= 2 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              "Should I sign the Hashimoto contract?",
              "What's my risk exposure this week?",
              "How are my margins trending?",
              "What should I prioritize today?",
            ].map((q) => (
              <button
                key={q}
                onClick={() => { setChatInput(q); }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about margins, contracts, shipments, risks..."
            className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={sendMessage}
            className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// ADMIN PAGE — Portfolio view for overseeing sellers, commission, and risk
// ═══════════════════════════════════════════════════════════

// ─── Seller Data Model ─────────────────────────────────────
type SellerRisk = "healthy" | "warning" | "critical";

type Seller = {
  id: string;
  name: string;
  contact: string;
  email: string;
  region: string;
  dealsClosed: number;
  dealsActive: number;
  pipelineValue: number;
  revenueYTD: number;
  commissionEarned: number;   // 2% of revenueYTD — already received
  commissionPending: number;  // 2% of pipeline — will be received when deals close
  riskLevel: SellerRisk;
  atRiskDeals: number;
  overduePayments: number;
  missingDocs: number;
  avgMargin: number;
  lastActive: string;
  joinedDate: string;
  status: "active" | "warning" | "suspended";
  topBuyer: string;
  topOrigin: string;
};

type SellerDeal = {
  id: string;
  buyer: string;
  value: number;
  margin: number;
  status: "completed" | "in_progress" | "at_risk" | "rejected";
  commission: number;
};

const sellersData: Seller[] = [
  {
    id: "SEL-001", name: "Coelrodan PLC", contact: "Abi Solomon", email: "abi@coelrodan.com", region: "Yirgacheffe",
    dealsClosed: 18, dealsActive: 11, pipelineValue: 245000, revenueYTD: 84600,
    commissionEarned: 1692, commissionPending: 4900,
    riskLevel: "healthy", atRiskDeals: 1, overduePayments: 0, missingDocs: 0,
    avgMargin: 21.9, lastActive: "2 min ago", joinedDate: "Jan 2026", status: "active",
    topBuyer: "Blue Mountain Traders", topOrigin: "Yirgacheffe G1",
  },
  {
    id: "SEL-002", name: "Sidamo Trading Co", contact: "Sara Bekele", email: "sara@sidamotrade.com", region: "Sidamo",
    dealsClosed: 12, dealsActive: 8, pipelineValue: 180000, revenueYTD: 64000,
    commissionEarned: 1280, commissionPending: 3600,
    riskLevel: "healthy", atRiskDeals: 0, overduePayments: 1, missingDocs: 2,
    avgMargin: 19.8, lastActive: "1h ago", joinedDate: "Feb 2026", status: "active",
    topBuyer: "Falcon Coffee UK", topOrigin: "Sidamo G2",
  },
  {
    id: "SEL-003", name: "Yirgacheffe Exports Ltd", contact: "Dawit Tadesse", email: "dawit@yirgexports.com", region: "Yirgacheffe",
    dealsClosed: 8, dealsActive: 5, pipelineValue: 120000, revenueYTD: 42000,
    commissionEarned: 840, commissionPending: 2400,
    riskLevel: "warning", atRiskDeals: 2, overduePayments: 0, missingDocs: 3,
    avgMargin: 18.2, lastActive: "3h ago", joinedDate: "Mar 2026", status: "active",
    topBuyer: "Marcus Coffee GmbH", topOrigin: "Yirgacheffe G1",
  },
  {
    id: "SEL-004", name: "Guji Highland Coffee", contact: "Helen Girma", email: "helen@gujihighland.com", region: "Guji",
    dealsClosed: 5, dealsActive: 3, pipelineValue: 75000, revenueYTD: 28000,
    commissionEarned: 560, commissionPending: 1500,
    riskLevel: "warning", atRiskDeals: 1, overduePayments: 0, missingDocs: 5,
    avgMargin: 17.5, lastActive: "Yesterday", joinedDate: "Apr 2026", status: "active",
    topBuyer: "Hashimoto Coffee", topOrigin: "Guji G1",
  },
  {
    id: "SEL-005", name: "Limu Valley Trading", contact: "Marcus Asfaw", email: "marcus@limuvalley.com", region: "Limu",
    dealsClosed: 3, dealsActive: 2, pipelineValue: 45000, revenueYTD: 15000,
    commissionEarned: 300, commissionPending: 900,
    riskLevel: "critical", atRiskDeals: 2, overduePayments: 1, missingDocs: 4,
    avgMargin: 14.2, lastActive: "2 days ago", joinedDate: "May 2026", status: "warning",
    topBuyer: "Rösterei Berlin", topOrigin: "Limu G1",
  },
  {
    id: "SEL-006", name: "Harar Coffee Exports", contact: "Yusuf Omar", email: "yusuf@hararcoffee.com", region: "Harar",
    dealsClosed: 2, dealsActive: 1, pipelineValue: 30000, revenueYTD: 8000,
    commissionEarned: 160, commissionPending: 600,
    riskLevel: "critical", atRiskDeals: 1, overduePayments: 2, missingDocs: 6,
    avgMargin: 12.8, lastActive: "1 week ago", joinedDate: "Jun 2026", status: "warning",
    topBuyer: "Aurora Imports", topOrigin: "Harar G4",
  },
];

const sellerRiskConfig: Record<SellerRisk, { label: string; bg: string; text: string; dot: string; border: string }> = {
  healthy: { label: "Healthy", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", border: "border-green-200" },
  warning: { label: "Warning", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", border: "border-amber-200" },
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", border: "border-red-200" },
};

// Per-seller deal breakdowns (for drawer)
const sellerDealsData: Record<string, SellerDeal[]> = {
  "SEL-001": [
    { id: "CT-2026-0003", buyer: "Blue Mountain Traders", value: 84600, margin: 19.6, status: "in_progress", commission: 1692 },
    { id: "CT-2026-0004", buyer: "Marcus Coffee GmbH", value: 70500, margin: 22.4, status: "in_progress", commission: 1410 },
    { id: "CT-2025-0195", buyer: "Marcus Coffee GmbH", value: 58900, margin: 23.1, status: "completed", commission: 1178 },
    { id: "CT-2026-0008", buyer: "Seoul Coffee Lab", value: 27600, margin: 20.8, status: "in_progress", commission: 552 },
    { id: "CT-2026-0002", buyer: "Rösterei Berlin", value: 39000, margin: 25.4, status: "rejected", commission: 0 },
  ],
  "SEL-002": [
    { id: "CT-2026-0020", buyer: "Falcon Coffee UK", value: 52400, margin: 19.2, status: "in_progress", commission: 1048 },
    { id: "CT-2026-0018", buyer: "Nordic Bean Co", value: 42000, margin: 21.5, status: "completed", commission: 840 },
    { id: "CT-2026-0015", buyer: "Antwerp Roasters", value: 38000, margin: 18.7, status: "completed", commission: 760 },
    { id: "CT-2026-0022", buyer: "Trieste Coffee", value: 28000, margin: 16.2, status: "at_risk", commission: 560 },
  ],
  "SEL-003": [
    { id: "CT-2026-0030", buyer: "Marcus Coffee GmbH", value: 32000, margin: 20.1, status: "in_progress", commission: 640 },
    { id: "CT-2026-0028", buyer: "Berlin Specialty", value: 28000, margin: 17.8, status: "at_risk", commission: 560 },
    { id: "CT-2026-0025", buyer: "Hamburg Beans", value: 22000, margin: 16.5, status: "completed", commission: 440 },
  ],
  "SEL-004": [
    { id: "CT-2026-0040", buyer: "Hashimoto Coffee", value: 30200, margin: 18.9, status: "in_progress", commission: 604 },
    { id: "CT-2026-0038", buyer: "Yokohama Trading", value: 24800, margin: 16.2, status: "at_risk", commission: 496 },
    { id: "CT-2026-0035", buyer: "Osaka Coffee", value: 20000, margin: 17.5, status: "completed", commission: 400 },
  ],
  "SEL-005": [
    { id: "CT-2026-0050", buyer: "Rösterei Berlin", value: 19500, margin: 14.8, status: "at_risk", commission: 390 },
    { id: "CT-2026-0048", buyer: "Munich Roasters", value: 16800, margin: 13.5, status: "at_risk", commission: 336 },
    { id: "CT-2026-0045", buyer: "Frankfurt Coffee", value: 15000, margin: 15.2, status: "completed", commission: 300 },
  ],
  "SEL-006": [
    { id: "CT-2026-0060", buyer: "Aurora Imports", value: 18000, margin: 12.8, status: "at_risk", commission: 360 },
    { id: "CT-2026-0058", buyer: "NYC Coffee Co", value: 12000, margin: 11.5, status: "completed", commission: 240 },
  ],
};

// ─── Operator/Agent/Audit data (moved from old AdminPage for System tab) ───
type OperatorRole = "admin" | "manager" | "operator" | "viewer";

type Operator = {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  status: "active" | "disabled";
  lastActive: string;
  actionsToday: number;
};

type AIAgent = {
  id: string;
  name: string;
  model: string;
  status: "active" | "idle" | "error" | "paused";
  lastAction: string;
  lastActionTime: string;
  actionsToday: number;
  approvalsWaiting: number;
};

type ApprovalItem = {
  id: string;
  agent: string;
  action: string;
  target: string;
  submittedAt: string;
  riskLevel: "low" | "medium" | "high";
  detail: string;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actorType: "operator" | "agent";
  action: string;
  entityType: string;
  entityId: string;
};

const mockOperatorsData: Operator[] = [
  { id: "OP-001", name: "Abi Solomon", email: "abi@coelrodan.com", role: "admin", status: "active", lastActive: "2 min ago", actionsToday: 47 },
  { id: "OP-002", name: "Sara Bekele", email: "sara@coelrodan.com", role: "manager", status: "active", lastActive: "1h ago", actionsToday: 23 },
  { id: "OP-003", name: "Dawit Tadesse", email: "dawit@coelrodan.com", role: "operator", status: "active", lastActive: "3h ago", actionsToday: 12 },
  { id: "OP-004", name: "Helen Girma", email: "helen@coelrodan.com", role: "operator", status: "active", lastActive: "Yesterday", actionsToday: 0 },
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

// ─── Admin Page (5 tabs: Portfolio / Sellers / Commission / Risk / System) ───
function AdminPage({ onLogout }: { onLogout: () => void; onNavigate: (p: Page) => void }) {
  const [activeTab, setActiveTab] = useState<"portfolio" | "sellers" | "commission" | "risk" | "system">("portfolio");
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);

  // ─── System tab data (fetched from backend) ───
  const [operatorsData, setOperatorsData] = useState<Operator[] | null>(null);
  const [aiAgentsData, setAiAgentsData] = useState<AIAgent[] | null>(null);
  const [approvalsData, setApprovalsData] = useState<ApprovalItem[] | null>(null);
  const [auditData, setAuditData] = useState<AuditEntry[] | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin")
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          if (Array.isArray(data.operators) && data.operators.length > 0) {
            setOperatorsData(data.operators);
          } else {
            setOperatorsData(mockOperatorsData);
          }
          if (Array.isArray(data.agents) && data.agents.length > 0) {
            setAiAgentsData(data.agents);
          } else {
            setAiAgentsData(mockAiAgentsData);
          }
          setApprovalsData(Array.isArray(data.approvals) ? data.approvals : mockApprovalsData);
          if (Array.isArray(data.audit) && data.audit.length > 0) {
            setAuditData(data.audit);
          } else {
            setAuditData(mockAuditData);
          }
        } else {
          setOperatorsData(mockOperatorsData);
          setAiAgentsData(mockAiAgentsData);
          setApprovalsData(mockApprovalsData);
          setAuditData(mockAuditData);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[AdminPage] API fetch failed, using mock data:", err);
        setOperatorsData(mockOperatorsData);
        setAiAgentsData(mockAiAgentsData);
        setApprovalsData(mockApprovalsData);
        setAuditData(mockAuditData);
      });
    return () => { cancelled = true; };
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

  const selected = sellersData.find(s => s.id === selectedSeller);
  const selectedDeals = selectedSeller ? (sellerDealsData[selectedSeller] || []) : [];

  const tabs = [
    { id: "portfolio" as const, label: "Portfolio", icon: LayoutDashboard },
    { id: "sellers" as const, label: "Sellers", icon: Users, count: totals.sellers },
    { id: "commission" as const, label: "Commission", icon: DollarSign },
    { id: "risk" as const, label: "Risk", icon: AlertTriangle, count: totals.atRiskSellers + totals.warningSellers },
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
              <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">System Operators</h3></div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Operator</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions Today</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorsData.map((op) => {
                    const rc = operatorRoleConfig[op.role];
                    return (
                      <tr key={op.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900">{op.name}</p>
                          <p className="text-[11px] text-gray-400">{op.email}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", rc.bg, rc.text)}>{rc.label}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{op.actionsToday}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{op.lastActive}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
    </main>
  );
}
// ═══════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════

// Admin credentials — recognized by email
const ADMIN_EMAIL = "admin@coelrodan.com";
const ADMIN_PASSWORD = "admin123";

function LoginPage({ onLogin }: { onLogin: (role: "admin" | "seller") => void }) {
  const [email, setEmail] = useState("abi@coelrodan.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }
    setLoading(true);
    setError("");
    setTimeout(() => {
      setLoading(false);
      // Auto-detect role from email
      const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL;
      onLogin(isAdmin ? "admin" : "seller");
    }, 800);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#2D1810] via-[#4A3520] to-[#6B4E33] relative overflow-hidden">
        {/* Decorative coffee bean pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-32 h-32 rounded-full bg-white" />
          <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-white" />
          <div className="absolute bottom-32 left-32 w-40 h-40 rounded-full bg-white" />
          <div className="absolute bottom-20 right-40 w-28 h-28 rounded-full bg-white" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <Coffee className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold text-lg tracking-tight">COFFEE</p>
              <p className="font-light text-sm text-white/60 -mt-1">EXPORT ERP</p>
            </div>
          </div>

          <div>
            <h2 className="text-4xl font-bold leading-tight mb-4">
              From Addis to the<br />world&apos;s best roasters.
            </h2>
            <p className="text-white/70 text-lg leading-relaxed max-w-md">
              Manage leads, samples, quotes, contracts, shipments, and compliance — all in one AI-powered platform built for Ethiopian coffee exporters.
            </p>
            <div className="grid grid-cols-3 gap-4 mt-8 max-w-md">
              <div>
                <p className="text-3xl font-bold">11</p>
                <p className="text-xs text-white/60 mt-1">Integrated modules</p>
              </div>
              <div>
                <p className="text-3xl font-bold">7</p>
                <p className="text-xs text-white/60 mt-1">AI agents working</p>
              </div>
              <div>
                <p className="text-3xl font-bold">2%</p>
                <p className="text-xs text-white/60 mt-1">Commission shielded</p>
              </div>
            </div>
          </div>

          <div className="text-xs text-white/40">
            © 2026 Coelrodan PLC · Powered by Coffee Export ERP
          </div>
        </div>
      </div>

      {/* Right side — login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#FAFAF9]">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A3520]">
              <Coffee className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold text-gray-900 tracking-tight">COFFEE</p>
              <p className="font-light text-xs text-gray-400 -mt-0.5">EXPORT ERP</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-1.5">Sign in to your Coffee Export ERP account</p>
          </div>

          {/* Role selector — REMOVED. Role is auto-detected from email. */}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-10 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Remember + forgot */}
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-gray-300 text-[#4A3520] focus:ring-[#4A3520]" />
                <span className="text-gray-600">Remember me for 30 days</span>
              </label>
              <button type="button" className="font-medium text-[#4A3520] hover:underline">Forgot password?</button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-6 rounded-lg bg-indigo-50/50 border border-indigo-100 p-4">
            <div className="flex items-start gap-2 mb-3">
              <Bot className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" strokeWidth={1.5} />
              <div className="text-xs">
                <p className="font-semibold text-indigo-700">Demo Credentials</p>
                <p className="text-gray-600 mt-0.5">Role is detected automatically from the email you use.</p>
              </div>
            </div>
            <div className="space-y-2">
              {/* Admin quick-fill */}
              <button
                type="button"
                onClick={() => { setEmail(ADMIN_EMAIL); setPassword(ADMIN_PASSWORD); setError(""); }}
                className="w-full flex items-center justify-between rounded-md bg-white border border-[#4A3520]/20 px-3 py-2 text-left hover:bg-[#4A3520]/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#4A3520]" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Admin (Portfolio Manager)</p>
                    <p className="text-[11px] text-gray-500 font-mono">{ADMIN_EMAIL} · {ADMIN_PASSWORD}</p>
                  </div>
                </div>
                <span className="text-[10px] text-[#4A3520] font-medium">Use →</span>
              </button>
              {/* Seller quick-fill */}
              <button
                type="button"
                onClick={() => { setEmail("abi@coelrodan.com"); setPassword("seller123"); setError(""); }}
                className="w-full flex items-center justify-between rounded-md bg-white border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Seller (Operator)</p>
                    <p className="text-[11px] text-gray-500 font-mono">abi@coelrodan.com · seller123</p>
                  </div>
                </div>
                <span className="text-[10px] text-gray-500 font-medium">Use →</span>
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Don&apos;t have an account? <button className="font-medium text-[#4A3520] hover:underline">Contact your administrator</button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
function PlaceholderPage({ title, question }: { title: string; question: string }) {
  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">{title}</h1>
      <p className="text-sm text-gray-500 mb-8">{question}</p>
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-gray-50 mb-4">
          <Coffee className="h-8 w-8 text-gray-300" strokeWidth={1} />
        </div>
        <p className="text-sm font-medium text-gray-500">This page is coming next.</p>
        <p className="text-xs text-gray-400 mt-1">Using the same design system and principles.</p>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP SHELL
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "seller">("admin");
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const handleLogin = (role: "admin" | "seller") => {
    setUserRole(role);
    setIsLoggedIn(true);
    setCurrentPage(role === "admin" ? "admin" : "dashboard");
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole("admin");
    setCurrentPage("dashboard");
  };

  // Show login page if not authenticated
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Filter nav based on role:
  // Admin sees ONLY the System group (portfolio/commission/risk view)
  // Seller sees everything EXCEPT System (operational tools)
  const visibleNavGroups = userRole === "admin"
    ? navGroups.filter(g => g.label === "System")
    : navGroups.filter(g => g.label !== "System");

  const pageTitles: Record<Page, { title: string; question: string }> = {
    dashboard: { title: "", question: "" },
    inbox: { title: "", question: "" },
    leads: { title: "Leads", question: "Who should I sell to?" },
    deals: { title: "Deals", question: "Where is every opportunity?" },
    inventory: { title: "Inventory", question: "What coffee can I sell?" },
    samples: { title: "Samples", question: "Which samples are moving?" },
    quotes: { title: "Quotes", question: "Which quotes need approval?" },
    contracts: { title: "Contracts", question: "Which contracts need signing?" },
    shipments: { title: "Shipments", question: "Where is every container?" },
    compliance: { title: "Compliance", question: "Which documents are missing or expiring?" },
    finance: { title: "Finance", question: "How much money have I made?" },
    coach: { title: "AI Coach", question: "What should I do next?" },
    admin: { title: "Admin", question: "System operators, agents, and audit trail" },
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        navGroups={visibleNavGroups}
      />
      <div className={cn("transition-all duration-300", sidebarExpanded ? "ml-[240px]" : "ml-[64px]")}>
        <TopHeader userRole={userRole} onLogout={handleLogout} />
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "inbox" && <InboxPage />}
        {currentPage === "leads" && <LeadsPage />}
        {currentPage === "deals" && <DealsPage />}
        {currentPage === "inventory" && <InventoryPage />}
        {currentPage === "samples" && <SamplesPage />}
        {currentPage === "quotes" && <QuotesPage />}
        {currentPage === "compliance" && <CompliancePage />}
        {currentPage === "shipments" && <ShipmentsPage />}
        {currentPage === "contracts" && <ContractsPage />}
        {currentPage === "finance" && <FinancePage />}
        {currentPage === "coach" && <CoachPage onNavigate={setCurrentPage} />}
        {currentPage === "admin" && userRole === "admin" && <AdminPage onLogout={handleLogout} onNavigate={setCurrentPage} />}
        {currentPage !== "dashboard" && currentPage !== "inbox" && currentPage !== "leads" && currentPage !== "deals" && currentPage !== "inventory" && currentPage !== "samples" && currentPage !== "quotes" && currentPage !== "compliance" && currentPage !== "shipments" && currentPage !== "contracts" && currentPage !== "finance" && currentPage !== "coach" && currentPage !== "admin" && (
          <PlaceholderPage title={pageTitles[currentPage].title} question={pageTitles[currentPage].question} />
        )}
      </div>
    </div>
  );
}
