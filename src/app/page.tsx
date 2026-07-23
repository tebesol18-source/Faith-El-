"use client";

import {
  LayoutDashboard, Inbox, Users, Handshake, Package, FlaskConical,
  FileText, ScrollText, Truck, DollarSign, Sparkles,
  ChevronDown, Menu, Plus, ArrowRight, ArrowUp,
  Mail, CheckCircle2, Ship, MapPin, Clock, Package as PackageIcon,
  TrendingUp, ChevronRight, Coffee, Bot,
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
    items: [{ icon: Truck, label: "Shipments" }],
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
    <aside className="fixed left-0 top-0 z-40 h-screen w-[240px] border-r border-[#E8E0D5] bg-white flex flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-[#E8E0D5]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4A3520]">
          <Coffee className="h-5 w-5 text-[#FAF8F5]" strokeWidth={1.5} />
        </div>
        <div>
          <span className="font-bold text-[#1A1A1A] text-sm tracking-tight">COFFEE</span>
          <span className="font-light text-[#8B7E6E] text-sm ml-1">EXPORT</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.label && (
              <p className="px-3 mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#B5A893]">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item, i) => (
                <li key={i}>
                  <button
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      item.active
                        ? "bg-[#4A3520] text-[#FAF8F5] font-medium"
                        : item.highlight
                        ? "text-[#1A1A1A] font-medium hover:bg-[#FAF8F5]"
                        : "text-[#8B7E6E] hover:bg-[#FAF8F5] hover:text-[#4A3520]"
                    )}
                  >
                    <item.icon
                      className={cn("h-[18px] w-[18px]", item.active ? "text-[#FAF8F5]" : item.highlight ? "text-[#4A3520]" : "text-[#B5A893]")}
                      strokeWidth={1.5}
                    />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[11px] font-semibold text-white">
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

      <div className="border-t border-[#E8E0D5] p-4">
        <button className="flex w-full items-center gap-3 rounded-lg p-1 hover:bg-[#FAF8F5] transition-colors">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] flex items-center justify-center text-[#FAF8F5] font-semibold text-sm">
            AS
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-[#1A1A1A]">Abi Solomon</p>
            <p className="text-xs text-[#8B7E6E]">Coelrodan PLC</p>
          </div>
          <ChevronDown className="h-4 w-4 text-[#B5A893]" />
        </button>
      </div>
    </aside>
  );
}

// ─── Top Header ────────────────────────────────────────────
function TopHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E8E0D5] bg-[#FAF8F5]/80 px-8 backdrop-blur-sm">
      <button className="p-2 rounded-lg hover:bg-[#E8E0D5]">
        <Menu className="h-5 w-5 text-[#4A3520]" strokeWidth={1.5} />
      </button>

      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 rounded-lg border border-[#E8E0D5] bg-white px-3 py-2 hover:bg-[#FAF8F5] transition-colors">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-[#DC2626]">12</span>
          <span className="text-sm font-medium text-[#4A3520]">Tasks Today</span>
        </button>
        <button className="flex items-center gap-2 rounded-lg border border-[#E8F5ED] bg-[#E8F5ED] px-3 py-2 hover:bg-[#D5EEDC] transition-colors">
          <Bot className="h-4 w-4 text-[#2D5F3F]" strokeWidth={1.5} />
          <span className="text-sm font-medium text-[#2D5F3F]">3 AI Suggestions</span>
        </button>
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] flex items-center justify-center text-[#FAF8F5] font-semibold text-sm">
          AS
        </div>
      </div>
    </header>
  );
}

// ─── Today's Priority ──────────────────────────────────────
const priorities = [
  { num: "1", color: "bg-[#DC2626]", text: "Reply to Buyer ABC — Marcus Coffee GmbH", time: "2h ago" },
  { num: "2", color: "bg-[#D97706]", text: "Approve Quote V2 — QU-2026-0004", time: "3h ago" },
  { num: "3", color: "bg-[#2D5F3F]", text: "Sign Contract CT-2026-0003", time: "5h ago" },
  { num: "4", color: "bg-[#2563EB]", text: "Shipment CT-2026-001 arrives tomorrow", time: "Tomorrow" },
];

function PriorityCard() {
  return (
    <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
      <h3 className="text-lg font-semibold text-[#1A1A1A]">Today&apos;s Mission</h3>
      <p className="text-sm text-[#8B7E6E] mt-0.5 mb-5">Focus on these first.</p>
      <div className="space-y-1">
        {priorities.map((p, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-[#F5F2EE] last:border-0">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", p.color)}>
              {p.num}
            </span>
            <span className="flex-1 text-sm text-[#1A1A1A]">{p.text}</span>
            <span className="text-xs text-[#B5A893]">{p.time}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-[#FAF8F5] border border-[#E8E0D5] px-4 py-3">
        <span className="text-sm font-medium text-[#4A3520]">Potential Commission Today</span>
        <span className="text-lg font-bold text-[#2D5F3F]">$2,480</span>
      </div>
    </div>
  );
}

// ─── Revenue Hero ──────────────────────────────────────────
function RevenueHero() {
  return (
    <div className="rounded-xl border border-[#E8F5ED] bg-gradient-to-br from-[#E8F5ED] to-white p-6">
      <p className="text-[13px] font-medium text-[#8B7E6E]">Revenue This Month</p>
      <p className="mt-1 text-3xl font-bold text-[#1A1A1A] tracking-tight">$86,450</p>
      <div className="mt-2 flex items-center gap-1">
        <TrendingUp className="h-4 w-4 text-[#10B981]" />
        <span className="text-sm font-semibold text-[#2D5F3F]">↑ 24%</span>
        <span className="text-xs text-[#8B7E6E] ml-1">vs last month</span>
      </div>
      <div className="mt-4 pt-4 border-t border-[#D5EEDC]">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#4A3520]">Commission Earned</span>
          <span className="text-lg font-bold text-[#2D5F3F]">$2,480</span>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Cards ─────────────────────────────────────────────
const kpis = [
  { label: "Deals", value: "18", sub: "Active", context: "$45,680 Potential", icon: Handshake, iconBg: "bg-[#E8F5ED]", iconColor: "text-[#2D5F3F]", trend: "12%", trendUp: true },
  { label: "Quotes", value: "8", sub: "Awaiting Approval", context: "$84,000 Pipeline", icon: FileText, iconBg: "bg-[#FFF7ED]", iconColor: "text-[#D97706]", trend: "5%", trendUp: true },
  { label: "Shipments", value: "3", sub: "In Transit", context: "All on schedule", icon: Ship, iconBg: "bg-[#EFF6FF]", iconColor: "text-[#2563EB]", trend: "0%", trendUp: true },
  { label: "Payments", value: "$42K", sub: "Outstanding", context: "$86K Paid", icon: DollarSign, iconBg: "bg-[#E8F5ED]", iconColor: "text-[#2D5F3F]", trend: "8%", trendUp: false },
];

function KpiRow() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((c, i) => (
        <div key={i} className="rounded-xl border border-[#E8E0D5] bg-white p-5">
          <div className="flex items-start justify-between mb-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", c.iconBg)}>
              <c.icon className={cn("h-5 w-5", c.iconColor)} strokeWidth={1.5} />
            </div>
            <span className={cn("flex items-center gap-0.5 text-xs font-semibold", c.trendUp ? "text-[#2D5F3F]" : "text-[#D97706]")}>
              <ArrowUp className="h-3 w-3" /> {c.trend}
            </span>
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A] tracking-tight">{c.value}</p>
          <p className="text-[13px] font-medium text-[#4A3520] mt-0.5">
            {c.label} <span className="text-[#8B7E6E] font-normal">— {c.sub}</span>
          </p>
          <p className="text-xs text-[#B5A893] mt-1">{c.context}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Visual Pipeline ───────────────────────────────────────
const stages = [
  { label: "New Leads", count: 24, color: "bg-[#2563EB]" },
  { label: "Qualified", count: 18, color: "bg-[#4A3520]" },
  { label: "Sampling", count: 12, color: "bg-[#7C3AED]" },
  { label: "Negotiating", count: 8, color: "bg-[#D97706]" },
  { label: "Contract", count: 5, color: "bg-[#2D5F3F]" },
  { label: "Shipping", count: 3, color: "bg-[#10B981]" },
  { label: "Completed", count: 15, color: "bg-[#059669]" },
];

function PipelineCard() {
  return (
    <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
      <h3 className="text-lg font-semibold text-[#1A1A1A] mb-1">Pipeline</h3>
      <p className="text-sm text-[#8B7E6E] mb-6">From lead to completed deal.</p>
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {stages.map((s, i) => (
          <div key={i} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-2 w-20">
              <div className={cn("flex h-14 w-14 items-center justify-center rounded-full text-white text-lg font-bold", s.color)}>
                {s.count}
              </div>
              <span className="text-[11px] font-medium text-[#8B7E6E] text-center leading-tight">{s.label}</span>
            </div>
            {i < stages.length - 1 && (
              <div className="flex items-center mx-1 mb-6">
                <div className="h-px w-5 bg-[#E8E0D5]" />
                <ChevronRight className="h-3 w-3 text-[#D8CFC2]" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Deal Health ───────────────────────────────────────────
function DealHealth() {
  return (
    <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
      <h3 className="text-lg font-semibold text-[#1A1A1A] mb-4">Deal Health</h3>
      <div className="space-y-2">
        <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-[#FAF8F5] transition-colors">
          <span className="h-3 w-3 rounded-full bg-[#2D5F3F]" />
          <span className="text-sm font-medium text-[#4A3520] flex-1 text-left">Healthy</span>
          <span className="text-lg font-bold text-[#1A1A1A]">12</span>
          <ChevronRight className="h-4 w-4 text-[#D8CFC2]" />
        </button>
        <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-[#FAF8F5] transition-colors">
          <span className="h-3 w-3 rounded-full bg-[#D97706]" />
          <span className="text-sm font-medium text-[#4A3520] flex-1 text-left">Waiting</span>
          <span className="text-lg font-bold text-[#1A1A1A]">3</span>
          <ChevronRight className="h-4 w-4 text-[#D8CFC2]" />
        </button>
        <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-red-50 transition-colors">
          <span className="h-3 w-3 rounded-full bg-[#DC2626]" />
          <span className="text-sm font-medium text-[#DC2626] flex-1 text-left">At Risk</span>
          <span className="text-lg font-bold text-[#DC2626]">2</span>
          <ChevronRight className="h-4 w-4 text-[#D8CFC2]" />
        </button>
      </div>
    </div>
  );
}

// ─── AI Coach Brief ────────────────────────────────────────
const briefs = [
  { icon: Mail, color: "text-[#DC2626]", text: "Reply to Marcus Coffee — they asked for pricing 2h ago." },
  { icon: CheckCircle2, color: "text-[#D97706]", text: "Approve Quote V2 — buyer is waiting, don't lose momentum." },
  { icon: Package, color: "text-[#D97706]", text: "Inventory running low on Guji Washed. Only 12 bags left." },
  { icon: Clock, color: "text-[#2563EB]", text: "Buyer Aurora hasn't replied for 8 days. Time for a breakup email." },
];

function CoachBrief() {
  return (
    <div className="rounded-xl border border-[#E8F5ED] bg-gradient-to-br from-[#E8F5ED] to-white p-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2D5F3F]">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-[#1A1A1A]">AI Coach — Morning Brief</h3>
      </div>
      <p className="text-sm text-[#8B7E6E] mb-4">Here&apos;s what I recommend today:</p>
      <div className="space-y-3">
        {briefs.map((b, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg bg-white/70 p-3 border border-[#D5EEDC]">
            <b.icon className={cn("h-4 w-4 shrink-0 mt-0.5", b.color)} strokeWidth={1.5} />
            <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{b.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E8E0D5] bg-white p-2">
        <input
          type="text"
          placeholder="Ask AI anything..."
          className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#B5A893] focus:outline-none px-2"
        />
        <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2D5F3F] hover:bg-[#3A7050] transition-colors">
          <ArrowRight className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  );
}

// ─── Shipments ─────────────────────────────────────────────
const shipments = [
  { id: "CT-2026-001", dest: "Hamburg", flag: "🇩🇪", status: "In Transit", statusColor: "text-[#2563EB]", statusBg: "bg-[#EFF6FF]", eta: "2 days", progress: 65 },
  { id: "CT-2026-002", dest: "Antwerp", flag: "🇧🇪", status: "Departed", statusColor: "text-[#D97706]", statusBg: "bg-[#FFF7ED]", eta: "5 days", progress: 20 },
  { id: "CT-2026-003", dest: "Trieste", flag: "🇮🇹", status: "On Schedule", statusColor: "text-[#2D5F3F]", statusBg: "bg-[#E8F5ED]", eta: "10 days", progress: 10 },
];

function ShipmentsCard() {
  return (
    <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[#1A1A1A]">Shipments</h3>
        <button className="text-xs font-medium text-[#4A3520] hover:underline">View all →</button>
      </div>
      <div className="space-y-4">
        {shipments.map((s, i) => (
          <div key={i} className="border-b border-[#F5F2EE] pb-4 last:border-0 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-[#1A1A1A]">{s.id}</span>
              <span className={cn("rounded px-2 py-0.5 text-xs font-medium", s.statusBg, s.statusColor)}>{s.status}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-[#8B7E6E]">🇪🇹 Addis</span>
              <div className="flex-1 relative h-1 rounded-full bg-[#E8E0D5]">
                <div className="absolute h-1 rounded-full bg-[#4A3520]" style={{ width: `${s.progress}%` }} />
                <Ship className="absolute top-1/2 -translate-y-1/2 h-3 w-3 text-[#4A3520]" style={{ left: `calc(${s.progress}% - 6px)` }} />
              </div>
              <span className="text-xs text-[#8B7E6E]">{s.flag} {s.dest}</span>
            </div>
            <p className="text-xs text-[#B5A893]">ETA: {s.eta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Activity ───────────────────────────────────────
const activities = [
  { time: "10:24 AM", text: "Marcus Coffee accepted Quote V2", badge: "Deal", badgeBg: "bg-[#E8F5ED]", badgeColor: "text-[#2D5F3F]", dot: "bg-[#2D5F3F]" },
  { time: "Yesterday", text: "Payment received: $12,800 from Falcon UK", badge: "Payment", badgeBg: "bg-[#EFF6FF]", badgeColor: "text-[#2563EB]", dot: "bg-[#2563EB]" },
  { time: "Yesterday", text: "Shipment CT-2026-001 departed Djibouti", badge: "Shipment", badgeBg: "bg-[#F3F0EB]", badgeColor: "text-[#4A3520]", dot: "bg-[#4A3520]" },
  { time: "2 days ago", text: "Sample dispatched to Hashimoto Japan", badge: "Sample", badgeBg: "bg-[#FFF7ED]", badgeColor: "text-[#D97706]", dot: "bg-[#D97706]" },
  { time: "3 days ago", text: "Contract CT-2026-0003 signed by buyer", badge: "Contract", badgeBg: "bg-[#F5F3FF]", badgeColor: "text-[#7C3AED]", dot: "bg-[#7C3AED]" },
];

function ActivityCard() {
  return (
    <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[#1A1A1A]">Recent Activity</h3>
        <button className="text-xs font-medium text-[#4A3520] hover:underline">View all →</button>
      </div>
      <div className="relative">
        {activities.map((a, i) => (
          <div key={i} className="relative flex items-start gap-4 pb-5 last:pb-0">
            {i < activities.length - 1 && <div className="absolute left-[7px] top-5 bottom-0 w-px bg-[#E8E0D5]" />}
            <div className={cn("relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-white", a.dot)} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#B5A893]">{a.time}</p>
              <p className="text-sm text-[#1A1A1A] mt-0.5">{a.text}</p>
            </div>
            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", a.badgeBg, a.badgeColor)}>
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
    <div className="min-h-screen bg-[#FAF8F5]">
      <Sidebar />

      <div className="ml-[240px]">
        <TopHeader />

        <main className="p-8 max-w-[1200px] mx-auto">
          {/* Greeting */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#1A1A1A] tracking-tight">
              Good Morning, Abi <span className="inline-block">👋</span>
            </h1>
            <p className="text-sm text-[#8B7E6E] mt-2">
              You have <span className="font-semibold text-[#1A1A1A]">12 tasks</span> worth{" "}
              <span className="font-semibold text-[#2D5F3F]">$84,300</span> to complete today.
            </p>
          </div>

          {/* Row 1: Priority + Revenue */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PriorityCard />
            </div>
            <RevenueHero />
          </div>

          {/* Row 2: KPIs */}
          <div className="mb-6">
            <KpiRow />
          </div>

          {/* Row 3: Pipeline + Deal Health */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PipelineCard />
            </div>
            <DealHealth />
          </div>

          {/* Row 4: AI Coach + Shipments */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
            <CoachBrief />
            <ShipmentsCard />
          </div>

          {/* Row 5: Activity */}
          <div className="mb-6">
            <ActivityCard />
          </div>

          {/* Footer */}
          <footer className="mt-8 flex items-center justify-between border-t border-[#E8E0D5] pt-4">
            <p className="text-xs text-[#B5A893]">© 2026 Coffee Export ERP</p>
            <p className="text-xs text-[#B5A893]">Made with ❤️ in Ethiopia 🇪🇹</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
