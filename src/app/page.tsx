"use client";

import { useState } from "react";
import {
  LayoutDashboard, Inbox, Users, Handshake, Package, FlaskConical,
  FileText, ScrollText, Truck, DollarSign, ShieldCheck, BarChart3,
  Sparkles, Search, Bell, ChevronDown, Menu, Plus, ArrowUpRight,
  TrendingUp, AlertTriangle, Clock, Mail, CheckCircle2, Edit3,
  UserPlus, ArrowRight, Ship, MapPin, Award, FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Sidebar Component ─────────────────────────────────────
const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Inbox, label: "Inbox", badge: 8 },
  { icon: Users, label: "Leads" },
  { icon: Handshake, label: "Deals" },
  { icon: Package, label: "Inventory" },
  { icon: FlaskConical, label: "Samples" },
  { icon: FileText, label: "Quotes" },
  { icon: ScrollText, label: "Contracts" },
  { icon: Truck, label: "Shipments" },
  { icon: DollarSign, label: "Finance" },
  { icon: ShieldCheck, label: "Compliance" },
  { icon: BarChart3, label: "Reports" },
  { icon: Sparkles, label: "AI Coach" },
];

const quickActions = [
  { label: "New Quote" },
  { label: "Add Inventory" },
  { label: "Import Leads" },
  { label: "New Sample" },
  { label: "Record Payment" },
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
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="px-3 mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Main Navigation</p>
        </div>
        <ul className="space-y-0.5">
          {navItems.map((item, i) => (
            <li key={i}>
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  item.active
                    ? "bg-amber-50 text-amber-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <item.icon className="h-5 w-5" strokeWidth={1.5} />
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

        {/* Quick Actions */}
        <div className="mt-6 px-3 mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Quick Actions</p>
        </div>
        <ul className="space-y-0.5">
          {quickActions.map((action, i) => (
            <li key={i}>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                {action.label}
              </button>
            </li>
          ))}
        </ul>
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

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search anything..."
            className="h-10 w-[280px] rounded-lg border border-gray-200 bg-white pl-10 pr-12 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">⌘K</kbd>
        </div>

        {/* Notifications */}
        <button className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100">
          <Bell className="h-5 w-5 text-gray-600" strokeWidth={1.5} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>

        {/* User Menu */}
        <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-gray-100">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-semibold text-sm">
            AS
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">Abi Solomon</p>
            <p className="text-xs text-gray-500">Administrator</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </header>
  );
}

// ─── Stat Card ─────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  subtext: string;
  trend: string;
  trendUp: boolean;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

function StatCard({ label, value, subtext, trend, trendUp, icon: Icon, iconBg, iconColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900 tracking-tight">{value}</p>
          <p className="mt-0.5 text-xs text-gray-500">{subtext}</p>
          <div className="mt-2 flex items-center gap-1">
            <TrendingUp className={cn("h-3.5 w-3.5", trendUp ? "text-green-500" : "text-red-500")} />
            <span className={cn("text-xs font-medium", trendUp ? "text-green-600" : "text-red-600")}>{trend}</span>
          </div>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

// ─── Today's Mission Card ──────────────────────────────────
const missionItems = [
  { icon: Mail, iconBg: "bg-red-50", iconColor: "text-red-500", title: "Reply to Buyer ABC", desc: "Marcus Coffee GmbH asked for pricing details", badge: "3 Pending", badgeBg: "bg-red-50", badgeColor: "text-red-600" },
  { icon: CheckCircle2, iconBg: "bg-amber-50", iconColor: "text-amber-500", title: "Approve Quote V2", desc: "Quote QU-2026-0004-V2 waiting for approval", badge: "2 Pending", badgeBg: "bg-amber-50", badgeColor: "text-amber-600" },
  { icon: Edit3, iconBg: "bg-yellow-50", iconColor: "text-yellow-600", title: "Review Contract", desc: "Contract CT-2026-0003 pending signature", badge: "1 Pending", badgeBg: "bg-amber-50", badgeColor: "text-amber-600" },
  { icon: UserPlus, iconBg: "bg-rose-50", iconColor: "text-rose-500", title: "Follow up with Falcon UK", desc: "No response in 5 days on sample dispatch", badge: "4 Overdue", badgeBg: "bg-red-50", badgeColor: "text-red-600" },
];

function MissionCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Today&apos;s Mission</h3>
      <p className="text-[13px] text-gray-500 mt-0.5">Focus on what matters most today.</p>
      <div className="mt-4">
        {missionItems.map((item, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-100 py-3 last:border-0">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", item.iconBg)}>
              <item.icon className={cn("h-5 w-5", item.iconColor)} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              <p className="text-[13px] text-gray-500 mt-0.5 truncate">{item.desc}</p>
            </div>
            <span className={cn("shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold", item.badgeBg, item.badgeColor)}>
              {item.badge}
            </span>
            <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
          </div>
        ))}
      </div>
      {/* Commission banner */}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3">
        <span className="text-sm font-medium text-amber-900">Potential Commission Today</span>
        <span className="text-lg font-bold text-gray-900">$2,480</span>
      </div>
    </div>
  );
}

// ─── Pipeline Overview Card ────────────────────────────────
const pipelineItems = [
  { label: "New Leads", count: 24, value: "$0", color: "bg-blue-500", pct: 100 },
  { label: "Qualified", count: 18, value: "$45,680", color: "bg-indigo-500", pct: 75 },
  { label: "Sampling", count: 12, value: "$32,400", color: "bg-purple-500", pct: 50 },
  { label: "Negotiating", count: 8, value: "$24,560", color: "bg-amber-500", pct: 33 },
  { label: "Contract", count: 5, value: "$18,200", color: "bg-green-500", pct: 21 },
  { label: "Shipping", count: 3, value: "$12,800", color: "bg-teal-500", pct: 12 },
  { label: "Completed", count: 15, value: "$86,450", color: "bg-emerald-500", pct: 62 },
];

function PipelineCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Pipeline Overview</h3>
        <button className="text-xs font-medium text-blue-600 hover:underline">View all →</button>
      </div>
      <div className="space-y-1">
        {pipelineItems.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <div className="flex items-center gap-2 w-28">
              <span className={cn("h-2 w-2 rounded-full", item.color)} />
              <span className="text-sm text-gray-700">{item.label}</span>
            </div>
            <div className="flex-1">
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div className={cn("h-1.5 rounded-full", item.color)} style={{ width: `${item.pct}%` }} />
              </div>
            </div>
            <span className="w-8 text-right text-sm font-semibold text-gray-900">{item.count}</span>
            <span className="w-20 text-right text-sm text-gray-500">{item.value}</span>
          </div>
        ))}
      </div>
      <button className="mt-4 flex items-center gap-1 text-[13px] text-gray-600 hover:text-gray-900">
        View full pipeline <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Shipments in Transit Card ─────────────────────────────
const shipments = [
  { id: "CT-2026-001", dest: "Hamburg, Germany", status: "In Transit", statusColor: "text-blue-600", statusBg: "bg-blue-50", eta: "Jul 24, 2026" },
  { id: "CT-2026-002", dest: "Antwerp, Belgium", status: "Departed", statusColor: "text-amber-600", statusBg: "bg-amber-50", eta: "Jul 28, 2026" },
  { id: "CT-2026-003", dest: "Trieste, Italy", status: "On Schedule", statusColor: "text-green-600", statusBg: "bg-green-50", eta: "Aug 02, 2026" },
  { id: "CT-2026-004", dest: "Rotterdam, NL", status: "Booked", statusColor: "text-gray-600", statusBg: "bg-gray-100", eta: "Aug 10, 2026" },
  { id: "CT-2026-005", dest: "Yokohama, Japan", status: "In Transit", statusColor: "text-blue-600", statusBg: "bg-blue-50", eta: "Aug 15, 2026" },
];

function ShipmentsCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Shipments in Transit</h3>
        <button className="text-xs font-medium text-blue-600 hover:underline">View all →</button>
      </div>
      <div className="space-y-0">
        {shipments.map((s, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-gray-100 py-3 last:border-0">
            <Ship className="h-5 w-5 text-gray-400 shrink-0" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">{s.id}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" /> {s.dest}
              </p>
            </div>
            <div className="text-right">
              <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-medium", s.statusBg, s.statusColor)}>
                {s.status}
              </span>
              <p className="text-[11px] text-gray-400 mt-1">ETA: {s.eta}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Activity Card ──────────────────────────────────
const activities = [
  { time: "10:24 AM", text: "Marcus Coffee GmbH accepted Quote QU-2026-0004-V2", badge: "Deal", badgeBg: "bg-green-50", badgeColor: "text-green-700", dotColor: "bg-green-500" },
  { time: "Yesterday", text: "Payment received: $12,800 from Falcon UK for INV-2026-0003", badge: "Payment", badgeBg: "bg-blue-50", badgeColor: "text-blue-700", dotColor: "bg-blue-500" },
  { time: "Yesterday", text: "Shipment CT-2026-001 departed Djibouti port", badge: "Shipment", badgeBg: "bg-indigo-50", badgeColor: "text-indigo-700", dotColor: "bg-indigo-500" },
  { time: "2 days ago", text: "Sample SR-2026-0005 dispatched to Hashimoto Japan", badge: "Sample", badgeBg: "bg-orange-50", badgeColor: "text-orange-700", dotColor: "bg-orange-500" },
  { time: "3 days ago", text: "Contract CT-2026-0003 signed by buyer via email", badge: "Contract", badgeBg: "bg-purple-50", badgeColor: "text-purple-700", dotColor: "bg-purple-500" },
];

function ActivityCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Recent Activity</h3>
        <button className="text-xs font-medium text-blue-600 hover:underline">View all →</button>
      </div>
      <div className="relative">
        {activities.map((a, i) => (
          <div key={i} className="relative flex items-start gap-4 pb-4 last:pb-0 pl-1">
            {/* Timeline line */}
            {i < activities.length - 1 && (
              <div className="absolute left-[7px] top-5 bottom-0 w-px bg-gray-200" />
            )}
            {/* Dot */}
            <div className={cn("relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-white", a.dotColor)} />
            {/* Content */}
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

// ─── Payments Overview Card ────────────────────────────────
function PaymentsCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Payments Overview</h3>
        <button className="text-xs font-medium text-blue-600 hover:underline">View all →</button>
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500">Total Revenue</p>
          <p className="text-xl font-bold text-gray-900 mt-1">$128,450</p>
          <p className="text-xs text-green-600 font-medium mt-0.5">↑ 18% vs last month</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Outstanding</p>
          <p className="text-xl font-bold text-gray-900 mt-1">$42,000</p>
          <p className="text-xs text-amber-600 font-medium mt-0.5">↓ 8% vs last month</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Paid This Month</p>
          <p className="text-xl font-bold text-gray-900 mt-1">$86,450</p>
          <p className="text-xs text-green-600 font-medium mt-0.5">↑ 24% vs last month</p>
        </div>
      </div>
      {/* Simple chart placeholder */}
      <div className="relative h-32 border-t border-gray-100 pt-3">
        <svg viewBox="0 0 300 100" className="w-full h-full" preserveAspectRatio="none">
          {/* Grid lines */}
          {[20, 40, 60, 80].map((y) => (
            <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="#F3F4F6" strokeWidth="1" />
          ))}
          {/* Revenue line (green) */}
          <path d="M0,70 C40,60 80,50 120,40 C160,30 200,25 240,20 C270,15 290,12 300,10"
            fill="none" stroke="#10B981" strokeWidth="2" />
          {/* Outstanding line (orange) */}
          <path d="M0,50 C40,55 80,48 120,52 C160,55 200,45 240,48 C270,50 290,45 300,42"
            fill="none" stroke="#F59E0B" strokeWidth="2" />
        </svg>
        {/* X-axis labels */}
        <div className="flex justify-between mt-1 px-1">
          <span className="text-[11px] text-gray-400">Jun 23</span>
          <span className="text-[11px] text-gray-400">Jun 30</span>
          <span className="text-[11px] text-gray-400">Jul 7</span>
          <span className="text-[11px] text-gray-400">Jul 14</span>
          <span className="text-[11px] text-gray-400">Jul 21</span>
        </div>
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-600">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs text-gray-600">Outstanding</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Coach Card ─────────────────────────────────────────
const coachAlerts = [
  { icon: TrendingUp, iconBg: "bg-green-500", text: "3 buyers from Germany are showing increased activity. Consider sending a bulk offer.", action: "View Buyers", actionBg: "bg-green-500" },
  { icon: AlertTriangle, iconBg: "bg-amber-500", text: "Invoice INV-2026-0003 is overdue by 5 days. Send a payment reminder.", action: "Draft Email", actionBg: "bg-amber-500" },
  { icon: BarChart3, iconBg: "bg-purple-500", text: "Yirgacheffe Washed prices are trending up 4%. Good time to quote premium lots.", action: "View Market", actionBg: "bg-purple-500" },
  { icon: Clock, iconBg: "bg-blue-500", text: "Lead #L-2026-0507 hasn't responded in 7 days. Time for a breakup email.", action: "View Details", actionBg: "bg-blue-500" },
];

function CoachCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-gray-900">AI Coach</h3>
        <button className="text-xs font-medium text-blue-600 hover:underline">View all →</button>
      </div>
      <p className="text-[13px] text-gray-500 mb-4">Your AI export assistant.</p>
      <div className="space-y-3">
        {coachAlerts.map((alert, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", alert.iconBg)}>
              <alert.icon className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </div>
            <p className="flex-1 text-[13px] leading-relaxed text-gray-700">{alert.text}</p>
            <button className={cn("shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white", alert.actionBg)}>
              {alert.action}
            </button>
          </div>
        ))}
      </div>
      <button className="mt-4 flex items-center gap-1 text-[13px] font-medium text-purple-600 hover:underline">
        <Sparkles className="h-4 w-4" /> Chat with AI Coach →
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-white">
      <Sidebar />

      {/* Main content */}
      <div className="ml-[260px]">
        <TopHeader />

        <main className="p-6 lg:p-8">
          {/* Greeting */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Good morning, Abi!</h1>
            <p className="text-sm text-gray-500 mt-1">
              Wednesday, July 23 • Addis Ababa, 18°C ☀️ • You have 12 pending items today.
            </p>
          </div>

          {/* Stat Cards Row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 mb-6">
            <StatCard
              label="Active Deals"
              value="18"
              subtext="Total Value: $45,680"
              trend="12% vs last 7 days"
              trendUp
              icon={Handshake}
              iconBg="bg-green-50"
              iconColor="text-green-600"
            />
            <StatCard
              label="Quotes Waiting"
              value="8"
              subtext="3 need approval today"
              trend="5% vs last 7 days"
              trendUp
              icon={FileText}
              iconBg="bg-orange-50"
              iconColor="text-orange-600"
            />
            <StatCard
              label="Contracts"
              value="5"
              subtext="2 pending signature"
              trend="20% vs last 7 days"
              trendUp
              icon={ScrollText}
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
            />
            <StatCard
              label="Shipments"
              value="3"
              subtext="All on schedule"
              trend="0% vs last 7 days"
              trendUp
              icon={Ship}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
            <StatCard
              label="Payments"
              value="$86,450"
              subtext="Commission earned: $2,480"
              trend="24% vs last month"
              trendUp
              icon={DollarSign}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
          </div>

          {/* Middle Row: Mission / Pipeline / Shipments */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            <MissionCard />
            <PipelineCard />
            <ShipmentsCard />
          </div>

          {/* Bottom Row: Activity / Payments / AI Coach */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ActivityCard />
            <PaymentsCard />
            <CoachCard />
          </div>

          {/* Footer */}
          <footer className="mt-12 flex items-center justify-between border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">© 2026 Coffee Export ERP. All rights reserved.</p>
            <p className="text-xs text-gray-400">Made with ❤️ in Ethiopia 🇪🇹</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
