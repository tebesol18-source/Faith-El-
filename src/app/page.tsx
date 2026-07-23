"use client";

import { useState } from "react";
import {
  LayoutDashboard, Inbox, Users, Handshake, Package, FlaskConical,
  FileText, ScrollText, Truck, DollarSign, BarChart3,
  Sparkles, ChevronDown, Menu, Plus, ArrowRight, ArrowUpRight,
  TrendingUp, AlertTriangle, Clock, Mail, CheckCircle2, Edit3,
  UserPlus, Ship, MapPin, Bot, ChevronRight, Circle, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Grouped Sidebar ───────────────────────────────────────
const navGroups = [
  {
    label: null,
    items: [{ icon: LayoutDashboard, label: "Dashboard", active: true, highlight: true }],
  },
  {
    label: "Sales",
    items: [
      { icon: Inbox, label: "Inbox", badge: 8, highlight: true },
      { icon: Users, label: "Leads" },
      { icon: Handshake, label: "Deals", highlight: true },
    ],
  },
  {
    label: "Coffee",
    items: [
      { icon: Package, label: "Inventory" },
      { icon: FlaskConical, label: "Samples" },
    ],
  },
  {
    label: "Documents",
    items: [
      { icon: FileText, label: "Quotes" },
      { icon: ScrollText, label: "Contracts" },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: Truck, label: "Shipments" },
    ],
  },
  {
    label: null,
    items: [
      { icon: DollarSign, label: "Finance", highlight: true },
      { icon: Sparkles, label: "AI Coach" },
    ],
  },
];

function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[260px] border-r border-gray-200 bg-white flex flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-gray-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-600 to-amber-800">
          <span className="text-white font-bold text-sm">☕</span>
        </div>
        <div>
          <span className="font-bold text-gray-900 text-sm">COFFEE</span>
          <span className="font-light text-gray-500 text-sm ml-1">EXPORT</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.label && (
              <p className="px-3 mt-3 mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item, i) => (
                <li key={i}>
                  <button
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      item.active
                        ? "bg-amber-50 text-amber-900"
                        : item.highlight
                        ? "text-gray-800 font-semibold"
                        : "text-gray-500 font-normal hover:bg-gray-50 hover:text-gray-800"
                    )}
                  >
                    <item.icon className={cn("h-[18px] w-[18px]", item.active ? "text-amber-700" : item.highlight ? "text-gray-700" : "text-gray-400")} strokeWidth={1.5} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="border-t border-gray-100 p-4">
        <button className="flex w-full items-center gap-3 rounded-lg p-1 hover:bg-gray-50 transition-colors">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-semibold text-sm">
            AS
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-gray-900">Abi Solomon</p>
            <p className="text-xs text-gray-500">Coelrodan PLC — Exporter</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </aside>
  );
}

// ─── Top Header ────────────────────────────────────────────
function TopHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-6 backdrop-blur-sm">
      <button className="p-2 rounded-lg hover:bg-gray-100">
        <Menu className="h-5 w-5 text-gray-600" strokeWidth={2} />
      </button>

      <div className="flex items-center gap-3">
        {/* Task counter instead of search */}
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-600">12</span>
          <span className="text-sm font-medium text-gray-700">Tasks Today</span>
        </button>

        {/* AI Suggestions */}
        <button className="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2 hover:bg-purple-100 transition-colors">
          <Bot className="h-4 w-4 text-purple-600" strokeWidth={1.5} />
          <span className="text-sm font-medium text-purple-700">3 AI Suggestions</span>
        </button>

        {/* User Menu */}
        <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-gray-100">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-semibold text-sm">
            AS
          </div>
        </button>
      </div>
    </header>
  );
}

// ─── Today's Priority (simplified) ─────────────────────────
const priorities = [
  { num: "1", color: "bg-red-500", text: "Reply to Buyer ABC — Marcus Coffee GmbH", time: "2h ago" },
  { num: "2", color: "bg-amber-500", text: "Approve Quote V2 — QU-2026-0004", time: "3h ago" },
  { num: "3", color: "bg-green-500", text: "Sign Contract CT-2026-0003", time: "5h ago" },
  { num: "4", color: "bg-blue-500", text: "Shipment CT-2026-001 arrives tomorrow", time: "Tomorrow" },
];

function PriorityCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Today&apos;s Priority</h3>
      <p className="text-[13px] text-gray-500 mt-0.5 mb-4">Focus on these first.</p>
      <div className="space-y-1">
        {priorities.map((p, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", p.color)}>
              {p.num}
            </span>
            <span className="flex-1 text-sm text-gray-800">{p.text}</span>
            <span className="text-xs text-gray-400">{p.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Revenue Hero Widget ───────────────────────────────────
function RevenueWidget() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-gray-500">Revenue This Month</p>
          <p className="mt-1 text-3xl font-extrabold text-gray-900 tracking-tight">$86,450</p>
          <div className="mt-2 flex items-center gap-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-green-600">↑ 24%</span>
            <span className="text-xs text-gray-500 ml-1">vs last month</span>
          </div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
          <DollarSign className="h-6 w-6 text-emerald-600" strokeWidth={1.5} />
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-emerald-100">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Commission Earned</span>
          <span className="text-lg font-bold text-emerald-700">$2,480</span>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Cards (answer "so what?") ─────────────────────────
const kpiCards = [
  { label: "Deals", value: "18", sub: "Active", context: "$45,680 Potential Revenue", icon: Handshake, iconBg: "bg-green-50", iconColor: "text-green-600", trend: "12%", trendUp: true },
  { label: "Quotes", value: "8", sub: "Awaiting Approval", context: "$84,000 in Pipeline", icon: FileText, iconBg: "bg-orange-50", iconColor: "text-orange-600", trend: "5%", trendUp: true },
  { label: "Shipments", value: "3", sub: "In Transit", context: "All on schedule", icon: Ship, iconBg: "bg-blue-50", iconColor: "text-blue-600", trend: "0%", trendUp: true },
  { label: "Payments", value: "$42K", sub: "Outstanding", context: "$86K Paid this month", icon: DollarSign, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", trend: "8%", trendUp: false },
];

function KpiRow() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpiCards.map((card, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", card.iconBg)}>
              <card.icon className={cn("h-5 w-5", card.iconColor)} strokeWidth={1.5} />
            </div>
            <div className={cn("flex items-center gap-0.5 text-xs font-semibold", card.trendUp ? "text-green-600" : "text-amber-600")}>
              <TrendingUp className="h-3 w-3" /> {card.trend}
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 tracking-tight">{card.value}</p>
          <p className="text-[13px] font-medium text-gray-600 mt-0.5">{card.label} <span className="text-gray-400 font-normal">— {card.sub}</span></p>
          <p className="text-xs text-gray-400 mt-1">{card.context}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Deal Health Widget ────────────────────────────────────
function DealHealthCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Deal Health</h3>
      <div className="space-y-3">
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
  );
}

// ─── Visual Pipeline ───────────────────────────────────────
const pipelineStages = [
  { label: "New Leads", count: 24, color: "bg-blue-500" },
  { label: "Qualified", count: 18, color: "bg-indigo-500" },
  { label: "Sampling", count: 12, color: "bg-purple-500" },
  { label: "Negotiating", count: 8, color: "bg-amber-500" },
  { label: "Contract", count: 5, color: "bg-green-500" },
  { label: "Shipping", count: 3, color: "bg-teal-500" },
  { label: "Completed", count: 15, color: "bg-emerald-500" },
];

function VisualPipeline() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Pipeline</h3>
      <p className="text-[13px] text-gray-500 mb-6">From lead to completed deal.</p>
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {pipelineStages.map((stage, i) => (
          <div key={i} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-2 w-20">
              <div className={cn("flex h-14 w-14 items-center justify-center rounded-full text-white text-lg font-bold", stage.color)}>
                {stage.count}
              </div>
              <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">{stage.label}</span>
            </div>
            {i < pipelineStages.length - 1 && (
              <div className="flex items-center mx-1 mb-6">
                <div className="h-px w-6 bg-gray-200" />
                <ChevronRight className="h-3 w-3 text-gray-300" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Coach Morning Brief ────────────────────────────────
const coachBrief = [
  { icon: Mail, color: "text-red-500", text: "Reply to Marcus Coffee — they asked for pricing 2h ago." },
  { icon: CheckCircle2, color: "text-amber-500", text: "Approve Quote V2 — buyer is waiting, don't lose momentum." },
  { icon: Package, color: "text-orange-500", text: "Inventory running low on Guji Washed. Only 12 bags left." },
  { icon: Clock, color: "text-blue-500", text: "Buyer Aurora hasn't replied for 8 days. Time for a breakup email." },
];

function CoachBrief() {
  return (
    <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">AI Coach — Morning Brief</h3>
      </div>
      <p className="text-[13px] text-gray-500 mb-4">Here&apos;s what I recommend today:</p>
      <div className="space-y-3">
        {coachBrief.map((item, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg bg-white/70 p-3 border border-purple-100">
            <item.icon className={cn("h-4 w-4 shrink-0 mt-0.5", item.color)} strokeWidth={1.5} />
            <p className="text-[13px] text-gray-700 leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
      {/* Ask AI */}
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-purple-200 bg-white p-2">
        <input
          type="text"
          placeholder="Ask AI anything..."
          className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none px-2"
        />
        <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500 hover:bg-purple-600 transition-colors">
          <ArrowRight className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  );
}

// ─── Shipments with Route Visual ───────────────────────────
const shipments = [
  { id: "CT-2026-001", origin: "Addis", dest: "Hamburg", flag: "🇩🇪", status: "In Transit", statusColor: "text-blue-600", statusBg: "bg-blue-50", eta: "2 days", progress: 65 },
  { id: "CT-2026-002", origin: "Addis", dest: "Antwerp", flag: "🇧🇪", status: "Departed", statusColor: "text-amber-600", statusBg: "bg-amber-50", eta: "5 days", progress: 20 },
  { id: "CT-2026-003", origin: "Addis", dest: "Trieste", flag: "🇮🇹", status: "On Schedule", statusColor: "text-green-600", statusBg: "bg-green-50", eta: "10 days", progress: 10 },
];

function ShipmentsCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Shipments</h3>
        <button className="text-xs font-medium text-blue-600 hover:underline">View all →</button>
      </div>
      <div className="space-y-4">
        {shipments.map((s, i) => (
          <div key={i} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-gray-900">{s.id}</span>
              <span className={cn("rounded px-2 py-0.5 text-xs font-medium", s.statusBg, s.statusColor)}>{s.status}</span>
            </div>
            {/* Route visual */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500">🇪🇹 {s.origin}</span>
              <div className="flex-1 relative h-1 rounded-full bg-gray-100">
                <div className="absolute h-1 rounded-full bg-blue-400" style={{ width: `${s.progress}%` }} />
                <Ship className="absolute top-1/2 -translate-y-1/2 h-3 w-3 text-blue-500 transition-all" style={{ left: `calc(${s.progress}% - 6px)` }} />
              </div>
              <span className="text-xs text-gray-500">{s.flag} {s.dest}</span>
            </div>
            <p className="text-xs text-gray-400">ETA: {s.eta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Activity ───────────────────────────────────────
const activities = [
  { time: "10:24 AM", text: "Marcus Coffee GmbH accepted Quote V2", badge: "Deal", badgeBg: "bg-green-50", badgeColor: "text-green-700", dotColor: "bg-green-500" },
  { time: "Yesterday", text: "Payment received: $12,800 from Falcon UK", badge: "Payment", badgeBg: "bg-blue-50", badgeColor: "text-blue-700", dotColor: "bg-blue-500" },
  { time: "Yesterday", text: "Shipment CT-2026-001 departed Djibouti", badge: "Shipment", badgeBg: "bg-indigo-50", badgeColor: "text-indigo-700", dotColor: "bg-indigo-500" },
  { time: "2 days ago", text: "Sample dispatched to Hashimoto Japan", badge: "Sample", badgeBg: "bg-orange-50", badgeColor: "text-orange-700", dotColor: "bg-orange-500" },
  { time: "3 days ago", text: "Contract CT-2026-0003 signed by buyer", badge: "Contract", badgeBg: "bg-purple-50", badgeColor: "text-purple-700", dotColor: "bg-purple-500" },
];

function ActivityCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Recent Activity</h3>
        <button className="text-xs font-medium text-blue-600 hover:underline">View all →</button>
      </div>
      <div className="relative">
        {activities.map((a, i) => (
          <div key={i} className="relative flex items-start gap-4 pb-5 last:pb-0">
            {i < activities.length - 1 && (
              <div className="absolute left-[7px] top-5 bottom-0 w-px bg-gray-200" />
            )}
            <div className={cn("relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-white", a.dotColor)} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">{a.time}</p>
              <p className="text-[13px] text-gray-700 mt-0.5">{a.text}</p>
            </div>
            <span className={cn("shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold", a.badgeBg, a.badgeColor)}>
              {a.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-white">
      <Sidebar />

      <div className="ml-[260px]">
        <TopHeader />

        <main className="p-6 lg:p-8 max-w-[1200px] mx-auto">
          {/* Greeting */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              Good Morning, Abi <span className="inline-block">👋</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              You have <span className="font-semibold text-gray-900">12 tasks</span> worth <span className="font-semibold text-emerald-600">$84,300</span> to complete today.
            </p>
          </div>

          {/* Row 1: Priority + Revenue */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PriorityCard />
            </div>
            <RevenueWidget />
          </div>

          {/* Row 2: KPI Cards */}
          <div className="mb-6">
            <KpiRow />
          </div>

          {/* Row 3: Pipeline + Deal Health */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <VisualPipeline />
            </div>
            <DealHealthCard />
          </div>

          {/* Row 4: AI Coach + Shipments */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
            <CoachBrief />
            <ShipmentsCard />
          </div>

          {/* Row 5: Recent Activity (full width) */}
          <div className="mb-6">
            <ActivityCard />
          </div>

          {/* Footer */}
          <footer className="mt-8 flex items-center justify-between border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">© 2026 Coffee Export ERP. All rights reserved.</p>
            <p className="text-xs text-gray-400">Made with ❤️ in Ethiopia 🇪🇹</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
