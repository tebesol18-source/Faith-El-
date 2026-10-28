"use client";

/**
 * LogisticsPage — the Logistics Command Center.
 *
 * Replaces the previous AI-agent shipments page. Everything shown is real
 * DB data via /api/logistics/* and /api/shipments; every action either
 * (a) runs for real (create shipment, record booking, toggle checklist,
 *     update container status, add transport/event),
 * (b) opens the provider's OFFICIAL channel (site / booking / tracking
 *     URLs, tel: / mailto:), or
 * (c) is not shown at all (no dead buttons, no simulated availability).
 *
 * Sections: stats (8 real counters) · Active Shipments & Tasks (alerts,
 * filters, shipment cards, detail drawer) · Logistics Resources (DB
 * provider directory + admin management).
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, Box, CalendarDays, CheckCircle2, Clock,
  FileWarning, Package, Plus, Radar, Search, Ship, Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-client";
import type { LogisticsProvider, LogisticsStats, LogisticsTask, Shipment } from "@/lib/types";
import { ProviderCard } from "@/components/logistics/ProviderCard";
import { FindContainerModal } from "@/components/logistics/FindContainerModal";
import { RecordBookingModal } from "@/components/logistics/RecordBookingModal";
import { ShipmentDrawer } from "@/components/logistics/ShipmentDrawer";
import { ProviderAdminModal } from "@/components/logistics/ProviderAdminModal";
import { NewShipmentModal } from "@/components/logistics/NewShipmentModal";

type ShipmentRow = Shipment & {
  rawStatus: string;
  logistics: {
    containers: number;
    containersDelivered: number;
    bookings: number;
    checklistDone: number;
    checklistTotal: number;
    actionsNeeded: number;
  };
};

type TaskWithShipment = LogisticsTask & { shipmentId: string };

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "booked", label: "Booked" },
  { key: "in_transit", label: "In Transit" },
  { key: "at_destination", label: "At Destination" },
  { key: "delivered", label: "Delivered" },
  { key: "attention", label: "Attention" },
];

function filterOf(s: ShipmentRow): string {
  const st = s.rawStatus;
  if (["delivered", "cancelled"].includes(st)) return "delivered";
  if (["departed", "in_transit"].includes(st)) return "in_transit";
  if (["arrived", "customs_hold"].includes(st)) return "at_destination";
  if (["booked", "loaded"].includes(st)) return "booked";
  return "draft";
}

export function LogisticsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<LogisticsStats | null>(null);
  const [shipments, setShipments] = useState<ShipmentRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskWithShipment[]>([]);
  const [providers, setProviders] = useState<LogisticsProvider[] | null>(null);
  const [tab, setTab] = useState<"shipments" | "resources">("shipments");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [showFindContainer, setShowFindContainer] = useState(false);
  const [showNewShipment, setShowNewShipment] = useState(false);
  const [drawerShipmentId, setDrawerShipmentId] = useState<string | null>(null);
  const [recordBooking, setRecordBooking] = useState<{
    provider: LogisticsProvider | null;
    shipmentId: string | null;
    highlight?: { containerType?: string; quantity?: number; pickup?: string; destination?: string; neededBy?: string; shipmentId?: string };
  } | null>(null);
  const [adminModal, setAdminModal] = useState<{ provider: LogisticsProvider | null } | null>(null);

  const loadStatsAndShipments = useCallback(async () => {
    try {
      const [dashR, shipR] = await Promise.all([
        apiFetch("/api/logistics/dashboard"),
        apiFetch("/api/shipments"),
      ]);
      const dashD = await dashR.json();
      const shipD = await shipR.json();
      if (!dashD.ok) throw new Error(dashD.error);
      if (!shipD.ok) throw new Error(shipD.error);
      setStats(dashD.stats);
      setShipments(shipD.shipments || []);

      // Next actions: fetch the detail bundle for ACTIVE shipments (bounded
      // set — usually a handful) and aggregate their real tasks.
      const active = (shipD.shipments || []).filter(
        (s: ShipmentRow) => !["delivered", "cancelled"].includes(s.rawStatus)
      );
      const allTasks: TaskWithShipment[] = [];
      for (const s of active.slice(0, 10)) {
        try {
          const r = await apiFetch(`/api/logistics/shipments/${s.id}`);
          const d = await r.json();
          if (d.ok && Array.isArray(d.tasks)) {
            for (const t of d.tasks as LogisticsTask[]) {
              allTasks.push({ ...t, shipmentId: s.id });
            }
          }
        } catch { /* per-shipment failure shouldn't break the page */ }
      }
      // Warnings first, then info
      allTasks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1));
      setTasks(allTasks);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load logistics data");
    }
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const r = await apiFetch("/api/logistics/providers");
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setProviders(d.providers || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    }
  }, []);

  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setIsAdmin(d.user?.role === "admin" || d.role === "admin"); })
      .catch(() => { /* non-admin by default */ });
    void loadStatsAndShipments();
    void loadProviders();
  }, [loadStatsAndShipments, loadProviders]);

  function refreshAll() {
    void loadStatsAndShipments();
    void loadProviders();
  }

  const visibleShipments = (shipments || []).filter((s) => {
    if (filter === "all") return !["delivered", "cancelled"].includes(s.rawStatus);
    if (filter === "attention") return s.logistics.actionsNeeded > 0 || ["delayed", "customs_hold"].includes(s.rawStatus);
    if (filter === "delivered") return ["delivered", "cancelled"].includes(s.rawStatus);
    return filterOf(s) === filter;
  });

  const statCards: { label: string; value: number; hint: string; icon: any }[] = stats
    ? [
        { label: "Active shipments", value: stats.activeShipments, hint: "not delivered or cancelled", icon: Truck },
        { label: "Containers booked", value: stats.containersBooked, hint: "booked or further along", icon: Box },
        { label: "Awaiting booking", value: stats.containersAwaitingBooking, hint: "requested / available", icon: Clock },
        { label: "In transit", value: stats.inTransit, hint: "departed or at sea", icon: Ship },
        { label: "Upcoming departures", value: stats.upcomingDepartures, hint: "ETD today or later", icon: CalendarDays },
        { label: "Delayed / holds", value: stats.delayedOrHolds, hint: "delayed or customs hold", icon: AlertTriangle },
        { label: "Missing booking docs", value: stats.missingBookingDocs, hint: "booked, no confirmation", icon: FileWarning },
        { label: "Completed", value: stats.completed, hint: "delivered", icon: CheckCircle2 },
      ]
    : [];

  return (
    <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logistics Command Center</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Find logistics services, manage bookings, and track every shipment from origin to destination.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowFindContainer(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 bg-white hover:bg-stone-50 border border-stone-300 rounded-lg px-3.5 py-2 transition-colors"
          >
            <Box className="w-4 h-4" /> Find Empty Container
          </button>
          <button
            onClick={() => setShowNewShipment(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg px-3.5 py-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Shipment
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      {/* Stats — real counts only */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">{c.label}</span>
              <c.icon className="w-4 h-4 text-stone-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1.5">{stats ? c.value : "…"}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{c.hint}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("shipments")}
          className={cn(
            "text-sm font-semibold px-4 py-2.5 -mb-px border-b-2 transition-colors",
            tab === "shipments" ? "border-stone-800 text-stone-900" : "border-transparent text-gray-500 hover:text-gray-800"
          )}
        >
          Active Shipments &amp; Tasks
        </button>
        <button
          onClick={() => { setTab("resources"); void loadProviders(); }}
          className={cn(
            "text-sm font-semibold px-4 py-2.5 -mb-px border-b-2 transition-colors",
            tab === "resources" ? "border-stone-800 text-stone-900" : "border-transparent text-gray-500 hover:text-gray-800"
          )}
        >
          Logistics Resources
        </button>
      </div>

      {/* ── SHIPMENTS TAB ── */}
      {tab === "shipments" && (
        <div className="space-y-4">
          {/* Next actions */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Next actions
              {tasks.length > 0 && (
                <span className="bg-amber-100 text-amber-800 rounded-full px-1.5 text-[10px]">{tasks.length}</span>
              )}
            </h2>
            {tasks.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-500">
                No pending actions — nothing needs attention right now.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {tasks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setDrawerShipmentId(t.shipmentId)}
                    className={cn(
                      "text-left rounded-xl border p-3 transition-colors hover:border-stone-400",
                      t.severity === "warning" ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">{t.title}</p>
                      <span className="text-[10px] font-mono text-gray-400 shrink-0">{t.shipmentId}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{t.detail}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Filters */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap transition-colors",
                  filter === f.key ? "bg-stone-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Shipment cards */}
          {shipments === null ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">Loading shipments…</div>
          ) : visibleShipments.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">
                {filter === "all" ? "No active shipments yet." : `No shipments in “${FILTERS.find((f) => f.key === filter)?.label}”.`}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Create one from a signed contract, then find providers and record the booking.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleShipments.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setDrawerShipmentId(s.id)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-stone-400 p-4 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{s.id}</span>
                      <span className={cn(
                        "text-[11px] font-semibold rounded-full px-2 py-0.5 border capitalize",
                        s.rawStatus === "delivered" ? "bg-green-50 text-green-700 border-green-200"
                          : s.rawStatus === "delayed" || s.rawStatus === "customs_hold" ? "bg-red-50 text-red-700 border-red-200"
                          : s.rawStatus === "draft" ? "bg-gray-100 text-gray-700 border-gray-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      )}>
                        {s.rawStatus.replace("_", " ")}
                      </span>
                      <span className="text-sm text-gray-600">{s.buyer} · {s.weightKg / 60 || s.weightKg} bags</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {s.originPort} <ArrowRight className="w-3 h-3 inline" /> {s.destinationPort}
                      {s.etaDate ? ` · ETA ${s.etaDate}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2.5 text-xs text-gray-500 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Box className="w-3.5 h-3.5" /> {s.logistics.containers} container{s.logistics.containers === 1 ? "" : "s"} ({s.logistics.containersDelivered} delivered)</span>
                    <span className="inline-flex items-center gap-1"><FileWarning className="w-3.5 h-3.5" /> {s.logistics.bookings} booking record{s.logistics.bookings === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {s.logistics.checklistTotal > 0 ? `${s.logistics.checklistDone}/${s.logistics.checklistTotal} checklist` : "checklist not seeded"}</span>
                    {s.logistics.actionsNeeded > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" /> {s.logistics.actionsNeeded} action{s.logistics.actionsNeeded === 1 ? "" : "s"} needed
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RESOURCES TAB ── */}
      {tab === "resources" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                placeholder="Search providers…"
                value={search}
                onChange={(e) => setSearch(e.target.value.toLowerCase())}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {isAdmin && (
              <button
                onClick={() => setAdminModal({ provider: null })}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg px-3.5 py-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add provider
              </button>
            )}
          </div>

          {providers === null ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">Loading providers…</div>
          ) : providers.filter((p) => p.active).length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
              <Radar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">No providers in your directory yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                {isAdmin ? "Add the carriers, forwarders and truckers you work with — store their official contact details." : "An admin can add providers with their verified contact details."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {providers
                .filter((p) => p.active)
                .filter((p) => !search || p.name.toLowerCase().includes(search) || (p.services || "").toLowerCase().includes(search) || (p.city || "").toLowerCase().includes(search) || (p.country || "").toLowerCase().includes(search))
                .map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    isAdmin={isAdmin}
                    onRecordBooking={(prov) => setRecordBooking({ provider: prov, shipmentId: null })}
                    onEdit={isAdmin ? (prov) => setAdminModal({ provider: prov }) : undefined}
                  />
                ))}
            </div>
          )}

          <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
            Provider details come from your organization&apos;s directory. &ldquo;Verified&rdquo; marks details confirmed
            against official sources — always re-check before relying on them. Faith-El does not book or track on its own.
          </p>
        </div>
      )}

      {/* ── MODALS ── */}
      {showFindContainer && (
        <FindContainerModal
          onClose={() => setShowFindContainer(false)}
          shipments={(shipments || []).map((s) => ({ id: s.id, buyer: s.buyer }))}
          onRecordBooking={(provider, highlight) => {
            setShowFindContainer(false);
            setRecordBooking({ provider, shipmentId: null, highlight });
          }}
        />
      )}

      {recordBooking && (
        <RecordBookingModal
          provider={recordBooking.provider}
          shipmentId={recordBooking.shipmentId}
          highlight={recordBooking.highlight}
          onClose={() => setRecordBooking(null)}
          onSaved={() => {
            setRecordBooking(null);
            refreshAll();
            if (drawerShipmentId) setDrawerShipmentId(drawerShipmentId); // refresh drawer
          }}
        />
      )}

      {showNewShipment && (
        <NewShipmentModal
          onClose={() => setShowNewShipment(false)}
          onSaved={() => {
            setShowNewShipment(false);
            refreshAll();
          }}
        />
      )}

      {drawerShipmentId && (
        <ShipmentDrawer
          key={drawerShipmentId}
          shipmentId={drawerShipmentId}
          onClose={() => setDrawerShipmentId(null)}
          onRecordBooking={(sid) => setRecordBooking({ provider: null, shipmentId: sid })}
          onChanged={refreshAll}
        />
      )}

      {adminModal && (
        <ProviderAdminModal
          provider={adminModal.provider}
          onClose={() => setAdminModal(null)}
          onSaved={() => {
            setAdminModal(null);
            void loadProviders();
          }}
        />
      )}
    </main>
  );
}
