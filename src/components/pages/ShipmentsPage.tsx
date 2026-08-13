"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Coffee, FileCheck, Filter, MapPin, Package, Plus, Search, ShieldCheck, Ship, TrendingUp, Truck, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract, Insight, Shipment, ShipmentMilestone, ShipmentStage, ShipmentStatus, TempReading } from "@/lib/types";






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

const mockShipmentsData: Shipment[] = [
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

export function ShipmentsPage() {
  // ─── Live data from backend ───
  const [shipmentsData, setShipmentsData] = useState<typeof mockShipmentsData | null>(null);
  const [vesselTracking, setVesselTracking] = useState<any[]>([]);
  const [filter, setFilter] = useState("All");
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shipments")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.shipments) && data.shipments.length > 0) {
          setShipmentsData(data.shipments);
        } else {
          setShipmentsData([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[ShipmentsPage] API fetch failed, using mock data:", err);
        setShipmentsData([]);
      });
    // Fetch vessel tracking
    fetch("/api/vessel-tracking")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (!cancelled && data.ok) setVesselTracking(data.vessels || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Helper: get vessel tracking for a shipment
  const getVesselData = (shipmentId: string) => vesselTracking.find((v) => v.shipment_id === shipmentId);

  // Loading state
  if (!shipmentsData) {
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

      {/* Vessel Tracking Live Banner */}
      {vesselTracking.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                <Ship className="h-4 w-4 text-blue-600" strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Live Vessel Tracking</h3>
              <span className="text-xs text-gray-400">· {vesselTracking.length} vessel{vesselTracking.length > 1 ? "s" : ""} at sea</span>
            </div>
            <span className="text-[10px] text-gray-400">Simulated MarineTraffic feed · updates on refresh</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {vesselTracking.map((v) => {
              const pos = v.current_position;
              const weather = v.weather;
              const hasAlerts = v.alerts && v.alerts.length > 0;
              return (
                <div key={v.shipment_id} className={cn(
                  "rounded-lg border bg-white p-3",
                  hasAlerts ? "border-amber-200" : "border-gray-200"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-900">{v.vessel_name}</span>
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      pos.status === "Arrived" ? "bg-green-50 text-green-700"
                      : pos.status === "Approaching Port" ? "bg-amber-50 text-amber-700"
                      : "bg-blue-50 text-blue-700"
                    )}>{pos.status}</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-gray-500">
                    <div>📍 {pos.nearest_land} ({pos.lat.toFixed(2)}°, {pos.lon.toFixed(2)}°)</div>
                    <div>🚢 {v.speed_knots} kn · HDG {v.heading}° · IMO {v.imo}</div>
                    <div>📊 Progress: {v.route_progress_pct}% · ETA {v.days_to_arrival}d</div>
                    <div>🌤️ {weather.condition} · {weather.wind_knots}kt wind · {weather.wave_height_m.toFixed(1)}m waves</div>
                    {hasAlerts && v.alerts.map((alert: string, i: number) => (
                      <div key={i} className="text-amber-600 font-medium">⚠️ {alert}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

