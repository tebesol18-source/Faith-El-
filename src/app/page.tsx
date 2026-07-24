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
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────
type Page = "dashboard" | "inbox" | "leads" | "deals" | "inventory" | "samples" | "quotes" | "contracts" | "shipments" | "compliance" | "finance" | "coach";

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
}// ═══════════════════════════════════════════════════════════
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
    compliance: { title: "Compliance", question: "Which documents are missing or expiring?" },
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
        {currentPage === "quotes" && <QuotesPage />}
        {currentPage === "compliance" && <CompliancePage />}
        {currentPage === "shipments" && <ShipmentsPage />}
        {currentPage !== "dashboard" && currentPage !== "inbox" && currentPage !== "leads" && currentPage !== "deals" && currentPage !== "inventory" && currentPage !== "samples" && currentPage !== "quotes" && currentPage !== "compliance" && currentPage !== "shipments" && (
          <PlaceholderPage title={pageTitles[currentPage].title} question={pageTitles[currentPage].question} />
        )}
      </div>
    </div>
  );
}
