"use client";

import {
  Coffee, Search, Bell, Plus, ArrowRight, ArrowUp, ArrowDown,
  Check, X, Clock, AlertTriangle, Mail, FileText, Truck,
  Package, DollarSign, Users, Handshake, Ship, MapPin,
  TrendingUp, TrendingDown, Sparkles, ChevronRight, ChevronDown,
  Filter, MoreHorizontal, Calendar, Download, Edit3, Trash2,
  Eye, Send, Copy, Archive, Star, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Design Tokens ─────────────────────────────────────────
const colors = [
  { name: "Coffee", hex: "#4A3520", desc: "Primary brand, buttons, active states", text: "text-white" },
  { name: "Coffee Dark", hex: "#2D1810", desc: "Pressed, hover-dark", text: "text-white" },
  { name: "Coffee Light", hex: "#6B4E33", desc: "Hover-light, secondary actions", text: "text-white" },
  { name: "Cream", hex: "#FAF8F5", desc: "Page background", text: "text-gray-900" },
  { name: "Earth Beige", hex: "#E8E0D5", desc: "Borders, dividers, subtle bg", text: "text-gray-900" },
  { name: "Forest Green", hex: "#2D5F3F", desc: "Success, paid, approved", text: "text-white" },
  { name: "Emerald Accent", hex: "#10B981", desc: "Trends up, small highlights", text: "text-white" },
  { name: "Charcoal", hex: "#1A1A1A", desc: "Primary text, headings", text: "text-white" },
  { name: "Warning Amber", hex: "#D97706", desc: "Pending, overdue", text: "text-white" },
  { name: "Danger Red", hex: "#DC2626", desc: "Rejected, error, delete", text: "text-white" },
  { name: "Info Blue", hex: "#2563EB", desc: "Links, info badges", text: "text-white" },
  { name: "Muted Gray", hex: "#8B7E6E", desc: "Secondary text, labels", text: "text-white" },
];

const typography = [
  { name: "H1", className: "text-4xl font-bold tracking-tight text-charcoal", sample: "Good Morning, Abi" },
  { name: "H2", className: "text-2xl font-bold tracking-tight text-charcoal", sample: "Today's Mission" },
  { name: "H3", className: "text-lg font-semibold text-coffee", sample: "Pipeline Overview" },
  { name: "Body Large", className: "text-base text-gray-600", sample: "You have 12 tasks worth $84,300 today." },
  { name: "Body", className: "text-sm text-gray-700", sample: "Marcus Coffee GmbH accepted Quote QU-2026-0004-V2" },
  { name: "Caption", className: "text-xs text-gray-500", sample: "ETA: July 24, 2026" },
  { name: "Label", className: "text-xs font-semibold uppercase tracking-wider text-gray-400", sample: "AWAITING APPROVAL" },
];

const statusBadges = [
  { label: "Draft", variant: "draft" },
  { label: "Pending", variant: "pending" },
  { label: "Sent", variant: "sent" },
  { label: "Approved", variant: "approved" },
  { label: "Rejected", variant: "rejected" },
  { label: "Paid", variant: "paid" },
  { label: "Overdue", variant: "overdue" },
  { label: "In Transit", variant: "transit" },
];

function Badge({ variant, label }: { variant: string; label: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    pending: "bg-amber-50 text-amber-700",
    sent: "bg-blue-50 text-blue-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
    paid: "bg-emerald-50 text-emerald-700",
    overdue: "bg-red-50 text-red-600",
    transit: "bg-blue-50 text-blue-600",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold", styles[variant])}>
      {label}
    </span>
  );
}

// ─── Sample Table Data ─────────────────────────────────────
const tableData = [
  { id: "QU-2026-0004", buyer: "Marcus Coffee GmbH", origin: "Guji", volume: "320 bags", price: "$0.068/kg", value: "$1,305", status: "pending" },
  { id: "QU-2026-0005", buyer: "Falcon UK", origin: "Yirgacheffe", volume: "500 bags", price: "$0.080/kg", value: "$2,400", status: "approved" },
  { id: "QU-2026-0006", buyer: "Hashimoto Japan", origin: "Sidamo", volume: "200 bags", price: "$0.058/kg", value: "$696", status: "sent" },
  { id: "QU-2026-0007", buyer: "Aurora Imports", origin: "Limu", volume: "150 bags", price: "$0.060/kg", value: "$540", status: "rejected" },
];

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* Header */}
      <div className="border-b border-[#E8E0D5] bg-white">
        <div className="mx-auto max-w-5xl px-8 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A3520]">
              <Coffee className="h-5 w-5 text-[#FAF8F5]" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">Coffee Export Design System</h1>
              <p className="text-sm text-[#8B7E6E]">Source of truth — colors, typography, components</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-10 space-y-12">

        {/* ── Colors ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Color Palette</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Coffee-themed earth tones. No rainbows.</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {colors.map((c, i) => (
              <div key={i} className="rounded-xl border border-[#E8E0D5] bg-white overflow-hidden">
                <div className={cn("h-20 flex items-center justify-center", c.text)} style={{ backgroundColor: c.hex }}>
                  <span className="text-xs font-mono opacity-70">{c.hex}</span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-[#1A1A1A]">{c.name}</p>
                  <p className="text-xs text-[#8B7E6E] mt-0.5">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Typography ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Typography</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Inter font family. Comfortable spacing. Very little bold.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6 space-y-5">
            {typography.map((t, i) => (
              <div key={i} className="flex items-baseline gap-6 border-b border-[#F5F2EE] pb-4 last:border-0 last:pb-0">
                <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wider text-[#8B7E6E]">{t.name}</span>
                <span className={t.className}>{t.sample}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Buttons ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Buttons</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Coffee brown primary. Ghost secondary. No shadows.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
            <div className="flex flex-wrap gap-3">
              <button className="rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-[#FAF8F5] hover:bg-[#6B4E33] active:bg-[#2D1810]">
                Approve & Send
              </button>
              <button className="rounded-lg bg-[#2D5F3F] px-4 py-2 text-sm font-medium text-white hover:bg-[#3A7050]">
                Accept
              </button>
              <button className="rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C]">
                Reject
              </button>
              <button className="rounded-lg border border-[#E8E0D5] bg-white px-4 py-2 text-sm font-medium text-[#4A3520] hover:bg-[#FAF8F5]">
                Cancel
              </button>
              <button className="rounded-lg px-4 py-2 text-sm font-medium text-[#4A3520] hover:bg-[#F0EBE3]">
                Ghost
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-[#FAF8F5] hover:bg-[#6B4E33]">
                <Plus className="h-4 w-4" strokeWidth={1.5} /> New Quote
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-[#E8E0D5] px-4 py-2 text-sm font-medium text-[#4A3520] hover:bg-[#FAF8F5]">
                <Download className="h-4 w-4" strokeWidth={1.5} /> Export
              </button>
              <button className="rounded-lg border border-[#E8E0D5] p-2 text-[#8B7E6E] hover:bg-[#F0EBE3] hover:text-[#4A3520]">
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </section>

        {/* ── Status Badges ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Status Badges</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Clear, color-coded. Instantly scannable.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
            <div className="flex flex-wrap gap-3">
              {statusBadges.map((b, i) => (
                <Badge key={i} variant={b.variant} label={b.label} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Cards ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Cards</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">White on cream. Subtle border. No heavy shadows.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Stat Card */}
            <div className="rounded-xl border border-[#E8E0D5] bg-white p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                  <Handshake className="h-5 w-5 text-[#2D5F3F]" strokeWidth={1.5} />
                </div>
                <span className="flex items-center gap-0.5 text-xs font-semibold text-[#10B981]">
                  <ArrowUp className="h-3 w-3" /> 12%
                </span>
              </div>
              <p className="text-2xl font-bold text-[#1A1A1A] tracking-tight">18</p>
              <p className="text-[13px] font-medium text-[#8B7E6E] mt-0.5">Deals — Active</p>
              <p className="text-xs text-[#B5A893] mt-1">$45,680 Potential Revenue</p>
            </div>

            {/* Action Card */}
            <div className="rounded-xl border border-[#E8E0D5] bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8B7E6E] mb-2">Priority</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">Reply to Marcus Coffee</p>
              <p className="text-xs text-[#8B7E6E] mt-1">They asked for pricing 2h ago</p>
              <div className="mt-3 flex items-center gap-2">
                <button className="rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-[#FAF8F5] hover:bg-[#6B4E33]">
                  Reply Now
                </button>
                <button className="text-xs text-[#8B7E6E] hover:text-[#4A3520]">Snooze</button>
              </div>
            </div>

            {/* AI Card */}
            <div className="rounded-xl border border-[#E8F5ED] bg-gradient-to-br from-[#E8F5ED] to-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-[#2D5F3F]" strokeWidth={1.5} />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#2D5F3F]">AI Insight</span>
              </div>
              <p className="text-[13px] text-[#1A1A1A] leading-relaxed">
                3 buyers from Germany showing increased activity. Consider a bulk offer.
              </p>
              <button className="mt-3 text-xs font-medium text-[#2D5F3F] hover:underline">View Buyers →</button>
            </div>
          </div>
        </section>

        {/* ── Table ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Data Table</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Clean rows. Status badges inline. Hover highlight.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E0D5] bg-[#FAF8F5]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8B7E6E]">Quote ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8B7E6E]">Buyer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8B7E6E]">Origin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8B7E6E]">Volume</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8B7E6E]">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8B7E6E]">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8B7E6E]">Status</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={i} className="border-b border-[#F5F2EE] last:border-0 hover:bg-[#FAF8F5] transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-[#4A3520]">{row.id}</td>
                    <td className="px-4 py-3 text-sm text-[#1A1A1A]">{row.buyer}</td>
                    <td className="px-4 py-3 text-sm text-[#8B7E6E]">{row.origin}</td>
                    <td className="px-4 py-3 text-sm text-[#8B7E6E]">{row.volume}</td>
                    <td className="px-4 py-3 text-sm text-[#8B7E6E]">{row.price}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#1A1A1A]">{row.value}</td>
                    <td className="px-4 py-3"><Badge variant={row.status} label={row.status.charAt(0).toUpperCase() + row.status.slice(1)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Form Controls ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Form Controls</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Clean inputs. Coffee focus ring.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#8B7E6E] mb-1.5 block">Buyer Name</label>
                <input type="text" placeholder="Marcus Coffee GmbH" className="w-full rounded-lg border border-[#E8E0D5] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#B5A893] focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#8B7E6E] mb-1.5 block">Origin</label>
                <select className="w-full rounded-lg border border-[#E8E0D5] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 focus:outline-none">
                  <option>Yirgacheffe</option>
                  <option>Guji</option>
                  <option>Sidamo</option>
                  <option>Limu</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#8B7E6E] mb-1.5 block">Volume (bags)</label>
                <input type="number" placeholder="320" className="w-full rounded-lg border border-[#E8E0D5] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#B5A893] focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#8B7E6E] mb-1.5 block">Incoterm</label>
                <div className="flex gap-2">
                  {["FOB", "CIF", "EXW"].map((term, i) => (
                    <button key={i} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors", i === 0 ? "border-[#4A3520] bg-[#4A3520] text-[#FAF8F5]" : "border-[#E8E0D5] text-[#4A3520] hover:bg-[#F0EBE3]")}>
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Timeline ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Timeline</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Deal history. Colored dots. Subtle connecting line.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
            <div className="relative">
              {[
                { time: "10:24 AM", text: "Buyer accepted Quote V2", dot: "bg-[#2D5F3F]", badge: "Deal" },
                { time: "Yesterday", text: "Payment received: $12,800", dot: "bg-[#2563EB]", badge: "Payment" },
                { time: "2 days ago", text: "Shipment departed Djibouti", dot: "bg-[#4A3520]", badge: "Shipment" },
                { time: "3 days ago", text: "Contract signed by buyer", dot: "bg-[#7C3AED]", badge: "Contract" },
              ].map((item, i, arr) => (
                <div key={i} className="relative flex items-start gap-4 pb-5 last:pb-0">
                  {i < arr.length - 1 && <div className="absolute left-[7px] top-5 bottom-0 w-px bg-[#E8E0D5]" />}
                  <div className={cn("relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-white", item.dot)} />
                  <div className="flex-1">
                    <p className="text-xs text-[#B5A893]">{item.time}</p>
                    <p className="text-sm text-[#1A1A1A] mt-0.5">{item.text}</p>
                  </div>
                  <span className="rounded-md bg-[#F5F2EE] px-2 py-0.5 text-[11px] font-semibold text-[#8B7E6E]">{item.badge}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── AI Component ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">AI Components</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">AI is invisible. It appears as insights, not chatbots.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* AI Insight */}
            <div className="rounded-xl border border-[#E8F5ED] bg-gradient-to-br from-[#E8F5ED] to-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-[#2D5F3F]" strokeWidth={1.5} />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#2D5F3F]">AI Recommendation</span>
              </div>
              <p className="text-sm text-[#1A1A1A] leading-relaxed">
                Inventory running low on Guji Washed. Only 12 bags left. Consider restocking before quoting new buyers.
              </p>
              <div className="mt-3 flex gap-2">
                <button className="rounded-lg bg-[#2D5F3F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3A7050]">Restock</button>
                <button className="text-xs text-[#8B7E6E] hover:text-[#4A3520]">Dismiss</button>
              </div>
            </div>
            {/* AI Draft */}
            <div className="rounded-xl border border-[#E8E0D5] bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-[#4A3520]" strokeWidth={1.5} />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#4A3520]">AI Drafted Reply</span>
              </div>
              <p className="text-[13px] text-[#8B7E6E] leading-relaxed italic">
                "Hi Marcus, thanks for the inquiry. We have 25/26 Guji Washed available at $0.068/kg FOB Djibouti..."
              </p>
              <div className="mt-3 flex gap-2">
                <button className="rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-[#FAF8F5] hover:bg-[#6B4E33]">Approve & Send</button>
                <button className="rounded-lg border border-[#E8E0D5] px-3 py-1.5 text-xs font-medium text-[#4A3520] hover:bg-[#F0EBE3]">Edit</button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Shipment Visual ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Shipment Route</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Origin → destination. Ship icon moves along progress.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#1A1A1A]">CT-2026-001</span>
              <Badge variant="transit" label="In Transit" />
            </div>
            <div className="flex items-center gap-3 mt-4">
              <div className="text-center">
                <p className="text-2xl">🇪🇹</p>
                <p className="text-xs text-[#8B7E6E] mt-1">Addis</p>
              </div>
              <div className="flex-1 relative h-1.5 rounded-full bg-[#E8E0D5]">
                <div className="absolute h-1.5 rounded-full bg-[#4A3520]" style={{ width: "65%" }} />
                <Ship className="absolute top-1/2 -translate-y-1/2 h-4 w-4 text-[#4A3520]" style={{ left: "calc(65% - 8px)" }} />
              </div>
              <div className="text-center">
                <p className="text-2xl">🇩🇪</p>
                <p className="text-xs text-[#8B7E6E] mt-1">Hamburg</p>
              </div>
            </div>
            <p className="text-xs text-[#B5A893] mt-3 text-center">ETA: 2 days</p>
          </div>
        </section>

        {/* ── Pipeline Visual ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Pipeline Visual</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Connected circles. Counts inside. Flow left to right.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
            <div className="flex items-center justify-between overflow-x-auto">
              {[
                { label: "New Leads", count: 24, color: "bg-[#2563EB]" },
                { label: "Qualified", count: 18, color: "bg-[#4A3520]" },
                { label: "Sampling", count: 12, color: "bg-[#7C3AED]" },
                { label: "Negotiating", count: 8, color: "bg-[#D97706]" },
                { label: "Contract", count: 5, color: "bg-[#2D5F3F]" },
                { label: "Shipping", count: 3, color: "bg-[#10B981]" },
                { label: "Completed", count: 15, color: "bg-[#059669]" },
              ].map((stage, i, arr) => (
                <div key={i} className="flex items-center shrink-0">
                  <div className="flex flex-col items-center gap-2 w-20">
                    <div className={cn("flex h-14 w-14 items-center justify-center rounded-full text-white text-lg font-bold", stage.color)}>
                      {stage.count}
                    </div>
                    <span className="text-[11px] font-medium text-[#8B7E6E] text-center leading-tight">{stage.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex items-center mx-1 mb-6">
                      <div className="h-px w-5 bg-[#E8E0D5]" />
                      <ChevronRight className="h-3 w-3 text-[#D8CFC2]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Icon Set ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Icons</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Lucide Icons. Thin stroke (1.5px). 20px standard.</p>
          <div className="rounded-xl border border-[#E8E0D5] bg-white p-6">
            <div className="grid grid-cols-6 gap-4 md:grid-cols-10">
              {[Coffee, Mail, Users, Handshake, Package, FileText, Truck, DollarSign, Ship, MapPin, TrendingUp, Clock, Check, X, AlertTriangle, Sparkles, Plus, Search, Bell, Filter].map((Icon, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E8E0D5] hover:bg-[#FAF8F5] transition-colors">
                    <Icon className="h-5 w-5 text-[#4A3520]" strokeWidth={1.5} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Design Principles ── */}
        <section>
          <h2 className="text-lg font-semibold text-[#4A3520] mb-1">Design Principles</h2>
          <p className="text-sm text-[#8B7E6E] mb-6">Our constitution.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Less is More", desc: "No screen should overwhelm. Whitespace is a feature." },
              { title: "Action First", desc: "Don't show numbers. Show work. \"3 buyers waiting\" not \"42 deals\"." },
              { title: "Coffee First", desc: "Everything feels like coffee exporting. Not Salesforce. Not SAP." },
              { title: "AI is Invisible", desc: "No chatbots everywhere. AI quietly appears as insights and drafts." },
              { title: "Human in Control", desc: "AI drafts. Human approves. System executes. Always visible in UI." },
              { title: "One Question", desc: "Every page answers ONE question. No clutter." },
            ].map((p, i) => (
              <div key={i} className="rounded-xl border border-[#E8E0D5] bg-white p-5">
                <p className="text-sm font-semibold text-[#4A3520]">{p.title}</p>
                <p className="text-[13px] text-[#8B7E6E] mt-1 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#E8E0D5] pt-6 pb-4">
          <p className="text-center text-xs text-[#B5A893]">
            Coffee Export Design System v1.0 — The Operating System for Coffee Exporters
          </p>
        </footer>
      </div>
    </div>
  );
}
