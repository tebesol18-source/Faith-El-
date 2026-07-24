"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────
type Page = "dashboard" | "inbox" | "leads" | "deals" | "inventory" | "samples" | "quotes" | "contracts" | "shipments" | "finance" | "coach";

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
  { label: "Operations", items: [{ icon: Truck, label: "Shipments", page: "shipments" }] },
  { label: null, items: [
    { icon: DollarSign, label: "Finance", page: "finance", highlight: true },
    { icon: Sparkles, label: "AI Coach", page: "coach" },
  ]},
];

// ─── Collapsible Sidebar ───────────────────────────────────
function Sidebar({ currentPage, onNavigate, expanded, onToggle }: { currentPage: Page; onNavigate: (p: Page) => void; expanded: boolean; onToggle: () => void }) {
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
        {navGroups.map((group, gi) => (
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

// ─── Top Header ────────────────────────────────────────────
function TopHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-8 backdrop-blur-sm">
      <button className="p-2 rounded-lg hover:bg-gray-100"><Menu className="h-5 w-5 text-gray-600" strokeWidth={1.5} /></button>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50 transition-colors">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-600">4</span>
          <span className="text-sm font-medium text-gray-700">High Priority</span>
          <span className="text-sm text-gray-400">·</span>
          <span className="text-sm text-gray-500">8 Normal</span>
        </button>
        <button className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 hover:bg-indigo-100 transition-colors">
          <Bot className="h-4 w-4 text-indigo-600" strokeWidth={1.5} />
          <span className="text-sm font-medium text-indigo-700">3 AI Suggestions</span>
        </button>
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] flex items-center justify-center text-white font-semibold text-sm">AS</div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════
const priorities = [
  { num: "1", color: "bg-red-500", text: "Reply to Aurora Coffee — asked for pricing 2h ago", time: "2h ago" },
  { num: "2", color: "bg-amber-500", text: "Approve Quote V2 — QU-2026-0004", time: "3h ago" },
  { num: "3", color: "bg-green-600", text: "Sign Contract CT-2026-0003", time: "5h ago" },
  { num: "4", color: "bg-blue-500", text: "Shipment CT-2026-001 arrives tomorrow", time: "Tomorrow" },
];

const stages = [
  { label: "New Leads", count: 24, value: "$0", color: "bg-blue-500" },
  { label: "Qualified", count: 18, value: "$45K", color: "bg-indigo-500" },
  { label: "Sampling", count: 12, value: "$32K", color: "bg-purple-500" },
  { label: "Negotiating", count: 8, value: "$245K", color: "bg-amber-500" },
  { label: "Contract", count: 5, value: "$18K", color: "bg-green-600" },
  { label: "Shipping", count: 3, value: "$13K", color: "bg-teal-500" },
  { label: "Completed", count: 15, value: "$86K", color: "bg-emerald-600" },
];

const kpis = [
  { label: "Deals", value: "18", sub: "Active", context: "$45,680 Potential", icon: Handshake, iconBg: "bg-green-50", iconColor: "text-green-600", trend: "12%", trendUp: true },
  { label: "Quotes", value: "8", sub: "Awaiting Approval", context: "$84,000 Pipeline", icon: FileText, iconBg: "bg-amber-50", iconColor: "text-amber-600", trend: "5%", trendUp: true },
  { label: "Shipments", value: "3", sub: "In Transit", context: "All on schedule", icon: Ship, iconBg: "bg-blue-50", iconColor: "text-blue-600", trend: "0%", trendUp: true },
  { label: "Payments", value: "$42K", sub: "Outstanding", context: "$86K Paid", icon: DollarSign, iconBg: "bg-green-50", iconColor: "text-green-600", trend: "8%", trendUp: false },
];

const activities = [
  { time: "10:24 AM", text: "Marcus Coffee accepted Quote V2", badge: "Deal", badgeBg: "bg-green-50", badgeColor: "text-green-700", dot: "bg-green-500" },
  { time: "Yesterday", text: "Contract CT-2026-0003 signed by buyer", badge: "Contract", badgeBg: "bg-purple-50", badgeColor: "text-purple-700", dot: "bg-purple-500" },
  { time: "Yesterday", text: "Payment received: $12,800 from Falcon UK", badge: "Payment", badgeBg: "bg-blue-50", badgeColor: "text-blue-700", dot: "bg-blue-500" },
  { time: "2 days ago", text: "Shipment CT-2026-001 departed Djibouti", badge: "Shipment", badgeBg: "bg-gray-100", badgeColor: "text-gray-700", dot: "bg-gray-500" },
  { time: "3 days ago", text: "AI generated Quote V3 for Aurora Coffee", badge: "AI", badgeBg: "bg-indigo-50", badgeColor: "text-indigo-700", dot: "bg-indigo-500" },
];

const shipments = [
  { id: "CT-2026-001", dest: "Hamburg", flag: "🇩🇪", status: "In Transit", statusColor: "text-blue-600", statusBg: "bg-blue-50", eta: "2 days", progress: 68 },
  { id: "CT-2026-002", dest: "Antwerp", flag: "🇧🇪", status: "Departed", statusColor: "text-amber-600", statusBg: "bg-amber-50", eta: "5 days", progress: 20 },
  { id: "CT-2026-003", dest: "Trieste", flag: "🇮🇹", status: "On Schedule", statusColor: "text-green-600", statusBg: "bg-green-50", eta: "10 days", progress: 10 },
];

function DashboardPage() {
  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Good Morning, Abi <span className="inline-block">👋</span></h1>
        <p className="text-sm text-gray-500 mt-2">You have <span className="font-semibold text-gray-900">4 high priority tasks</span> and <span className="font-semibold text-gray-900">8 normal tasks</span> worth <span className="font-semibold text-green-600">$84,300</span> to complete today.</p>
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
const conversations = [
  { id: 1, buyer: "buyer-47@", subject: "Re: Ethiopian 25/26 Yirgacheffe", preview: "Can you send cupping scores for Guji? Need 320 bags FOB Hamburg ASAP.", time: "2h ago", unread: true, priority: "high", intent: "sample_request", confidence: 94 },
  { id: 2, buyer: "buyer-12@", subject: "Re: Quote QU-2026-0004-V2", preview: "Can you do $0.062/kg CIF instead of FOB?", time: "5h ago", unread: true, priority: "high", intent: "counter_offer", confidence: 96 },
  { id: 3, buyer: "buyer-3@", subject: "Re: Contract CT-2026-0003", preview: "We confirm and accept the terms. Please proceed with signing.", time: "1d ago", unread: true, priority: "medium", intent: "confirmation", confidence: 91 },
  { id: 4, buyer: "buyer-8@", subject: "Sample received — feedback", preview: "The Guji washed scored 86.5. We'd like to proceed to contract.", time: "2d ago", unread: false, priority: "medium", intent: "positive", confidence: 88 },
  { id: 5, buyer: "buyer-21@", subject: "Re: Shipment delay", preview: "When can we expect the container to arrive in Antwerp?", time: "3d ago", unread: false, priority: "low", intent: "logistics_question", confidence: 85 },
  { id: 6, buyer: "buyer-5@", subject: "Out of office", preview: "I will be back in the office on Monday. Please expect a delay in my response.", time: "4d ago", unread: false, priority: "low", intent: "auto_reply", confidence: 99 },
];

const messages = [
  { direction: "outbound", from: "marcus.bell@", subject: "Ethiopian 25/26 Yirgacheffe — first container spot", body: "Hi,\n\nFollowing up on our LinkedIn exchange. We have 25/26 Yirgacheffe lots available now with full EUDR data packs.\n\nWould you have 20 minutes this week for a quick call?\n\nBest", time: "Yesterday 4:30 PM" },
  { direction: "inbound", from: "buyer-47@", subject: "Re: Ethiopian 25/26 Yirgacheffe — first container spot", body: "Hi,\n\nThanks for the note. Looks interesting — can you send me the cupping scores for the Guji lots too? And what's your earliest FOB Djibouti date?\n\nI could do a call next Tuesday at 14:00 CET.\n\nKonrad", time: "Today 10:24 AM", ai: { classification: "question", summary: "Buyer interested in Yirgacheffe and requests cupping scores for Guji", intent: "sample_request", volume: 320, origin: "Guji", destination: "Hamburg", incoterm: "FOB", urgency: "High", nextAction: "Send Cupping Scores" } },
];

function InboxPage() {
  const [selectedConv, setSelectedConv] = useState(1);
  const [replyText, setReplyText] = useState("");
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
const leadsData = [
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
  CONTRACTED: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  GHOSTED: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
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

  const filters = ["All", "New", "Enriched", "In Sequence", "Qualified", "Ghosted"];
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
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// DEALS PAGE — "Where is every opportunity?"
// ═══════════════════════════════════════════════════════════
const dealsData = [
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

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">What coffee can I sell?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Plus className="h-4 w-4" /> Add Lot
        </button>
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
// PLACEHOLDER PAGE
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
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

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
    finance: { title: "Finance", question: "How much money have I made?" },
    coach: { title: "AI Coach", question: "What should I do next?" },
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
      />
      <div className={cn("transition-all duration-300", sidebarExpanded ? "ml-[240px]" : "ml-[64px]")}>
        <TopHeader />
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "inbox" && <InboxPage />}
        {currentPage === "leads" && <LeadsPage />}
        {currentPage === "deals" && <DealsPage />}
        {currentPage === "inventory" && <InventoryPage />}
        {currentPage === "samples" && <SamplesPage />}
        {currentPage !== "dashboard" && currentPage !== "inbox" && currentPage !== "leads" && currentPage !== "deals" && currentPage !== "inventory" && currentPage !== "samples" && (
          <PlaceholderPage title={pageTitles[currentPage].title} question={pageTitles[currentPage].question} />
        )}
      </div>
    </div>
  );
}
