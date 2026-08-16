"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Coffee, FileCheck, Filter, MapPin, Package, Plus, Search, ShieldCheck, Ship, TrendingUp, Truck, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-client";
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

const mockShipmentsData: Shipment[] = [];

export function ShipmentsPage() {
  // ─── Live data from backend ───
  const [shipmentsData, setShipmentsData] = useState<any[] | null>(null);
  const [vesselTracking, setVesselTracking] = useState<any[]>([]);
  const [filter, setFilter] = useState("All");
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);

  // ─── Create Shipment modal state ───
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formContractId, setFormContractId] = useState("");
  const [formCarrier, setFormCarrier] = useState("");
  const [formDeparturePort, setFormDeparturePort] = useState("");
  const [formArrivalPort, setFormArrivalPort] = useState("");
  const [formEtd, setFormEtd] = useState("");
  const [formEta, setFormEta] = useState("");
  const [contractsForSelect, setContractsForSelect] = useState<any[]>([]);

  // Fetch contracts list when modal opens
  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    apiFetch("/api/contracts")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.contracts)) setContractsForSelect(data.contracts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showCreate]);

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

  // ─── Refetch shipments list ───
  const refetchShipments = () => {
    apiFetch("/api/shipments")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok && Array.isArray(data.shipments)) setShipmentsData(data.shipments);
        else setShipmentsData([]);
      })
      .catch(() => setShipmentsData([]));
  };

  // ─── Create Shipment handler ───
  const handleCreate = () => {
    setCreateError(null);
    if (!formContractId.trim()) {
      setCreateError("Please select a contract.");
      return;
    }
    if (!formCarrier.trim() || !formDeparturePort.trim() || !formArrivalPort.trim()) {
      setCreateError("Carrier, departure port, and arrival port are required.");
      return;
    }
    if (!formEtd.trim() || !formEta.trim()) {
      setCreateError("ETD and ETA dates are required.");
      return;
    }
    setCreating(true);
    apiFetch("/api/shipments", {
      method: "POST",
      body: JSON.stringify({
        contractId: formContractId.trim(),
        carrier: formCarrier.trim(),
        departurePort: formDeparturePort.trim(),
        arrivalPort: formArrivalPort.trim(),
        etd: formEtd.trim(),
        eta: formEta.trim(),
      }),
    })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok) {
          setShowCreate(false);
          setFormContractId(""); setFormCarrier("");
          setFormDeparturePort(""); setFormArrivalPort("");
          setFormEtd(""); setFormEta("");
          refetchShipments();
        } else {
          setCreateError(data.error || "Failed to create shipment.");
        }
      })
      .catch((err) => setCreateError(`Failed: ${err.message}`))
      .finally(() => setCreating(false));
  };

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
          <button onClick={() => { setShowCreate(true); setCreateError(null); }} className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
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
      {/* Create Shipment Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold">Create Shipment</h2>
              <button onClick={() => !creating && setShowCreate(false)} className="text-white/60 hover:text-white p-1">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Contract *</label>
                <select value={formContractId} onChange={(e) => setFormContractId(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10">
                  <option value="">— Select a contract —</option>
                  {contractsForSelect.map((c) => (
                    <option key={c.id} value={c.id}>{c.id} · {c.buyer}</option>
                  ))}
                </select>
                {contractsForSelect.length === 0 && <p className="text-[11px] text-gray-400 mt-1">No contracts available. Create contracts first.</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Carrier *</label>
                <input type="text" value={formCarrier} onChange={(e) => setFormCarrier(e.target.value)} disabled={creating} placeholder="e.g. Maersk" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Departure Port *</label>
                <input type="text" value={formDeparturePort} onChange={(e) => setFormDeparturePort(e.target.value)} disabled={creating} placeholder="e.g. Djibouti" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Arrival Port *</label>
                <input type="text" value={formArrivalPort} onChange={(e) => setFormArrivalPort(e.target.value)} disabled={creating} placeholder="e.g. Hamburg" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">ETD *</label>
                  <input type="date" value={formEtd} onChange={(e) => setFormEtd(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">ETA *</label>
                  <input type="date" value={formEta} onChange={(e) => setFormEta(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
              </div>
              {createError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{createError}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => !creating && setShowCreate(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 rounded-lg bg-[#4A3520] px-4 py-2 text-sm text-white disabled:opacity-60">
                  {creating ? "Creating..." : "Create Shipment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

