"use client";

import { useState, useEffect } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUp, ChevronRight, Coffee, DollarSign, FileText, Handshake, Mail, Phone, Ship, Sparkles, Star, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract, Quote, Shipment } from "@/lib/types";

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

export function DashboardPage() {
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

