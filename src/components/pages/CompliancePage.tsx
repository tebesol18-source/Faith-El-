"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle, AlertTriangle, Award, CheckCircle2, CheckSquare, Coffee, FileCheck, FileClock, FileX, Filter, Globe, Leaf, Paperclip, Send, Ship, Upload, Wind, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComplianceDoc, ComplianceShipment, Contract, DocStatus, DocType, Insight, Shipment } from "@/lib/types";





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

const mockComplianceShipments: ComplianceShipment[] = [
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

export function CompliancePage() {
  // ─── Live data from backend ───
  const [complianceShipments, setComplianceShipments] = useState<typeof mockComplianceShipments | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/compliance")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.complianceShipments) && data.complianceShipments.length > 0) {
          setComplianceShipments(data.complianceShipments);
        } else {
          setComplianceShipments(mockComplianceShipments);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[CompliancePage] API fetch failed, using mock data:", err);
        setComplianceShipments(mockComplianceShipments);
      });
    return () => { cancelled = true; };
  }, []);

  const [filter, setFilter] = useState("All");
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);

  // Loading state
  if (!complianceShipments) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading from database…</p>
        </div>
      </main>
    );
  }

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

