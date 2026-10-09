"use client";

/**
 * ShipmentDrawer — the Command Center shipment detail view.
 *
 * Five tabs, all fed by GET /api/logistics/shipments/[id] (real DB rows
 * only): Overview & Tasks (facts, next actions, 18-step checklist,
 * recorded bookings), Containers (lifecycle), Transport (inland legs),
 * Documents (booking confirmations + customs docs), Timeline (stored
 * events + manual external updates). Every write goes through the real
 * API; nothing here simulates a provider action.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, Circle,
  ClipboardList, Download, FileText, Plus, Ship, Truck, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-client";
import type {
  LogisticsBooking, LogisticsChecklistItem, LogisticsContainer, LogisticsEvent,
  LogisticsProvider, LogisticsTask, LogisticsTransportSegment,
} from "@/lib/types";

const CONTAINER_STATUSES = [
  "REQUESTED", "AVAILABLE", "BOOKED", "ALLOCATED", "PICKED_UP", "AT_WAREHOUSE",
  "STUFFED", "SEALED", "IN_TRANSIT", "AT_PORT", "LOADED_ON_VESSEL", "DEPARTED",
  "ARRIVED", "DELIVERED", "CANCELLED",
];

const SEGMENT_TYPES: { value: string; label: string }[] = [
  { value: "trucking", label: "Trucking" },
  { value: "rail", label: "Rail" },
  { value: "barge", label: "Barge" },
  { value: "port_handling", label: "Port handling" },
  { value: "warehouse", label: "Warehouse move" },
];

export type ShipmentDetail = {
  shipment: Record<string, unknown> & {
    shipment_id: string;
    contract_id: string | null;
    status: string;
    carrier: string | null;
    vessel_name: string | null;
    bill_of_lading_number: string | null;
    departure_port: string | null;
    arrival_port: string | null;
    etd: string | null;
    eta: string | null;
    atd: string | null;
    ata: string | null;
    buyer_name: string | null;
    total_volume_bags: number | null;
    notes: string | null;
  };
  checklist: LogisticsChecklistItem[];
  bookings: LogisticsBooking[];
  containers: LogisticsContainer[];
  transport: LogisticsTransportSegment[];
  events: LogisticsEvent[];
  customsDocs: { document_type: string; status: string; file_path: string | null }[];
  tasks: LogisticsTask[];
};

function statusPill(status: string) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 border-gray-200",
    booked: "bg-blue-50 text-blue-700 border-blue-200",
    departed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_transit: "bg-indigo-50 text-indigo-700 border-indigo-200",
    arrived: "bg-teal-50 text-teal-700 border-teal-200",
    customs_hold: "bg-red-50 text-red-700 border-red-200",
    delayed: "bg-amber-50 text-amber-700 border-amber-200",
    delivered: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return cn("text-[11px] font-semibold rounded-full px-2.5 py-0.5 border capitalize", map[status] || map.draft);
}

function containerStatusPill(status: string) {
  const done = ["DELIVERED"].includes(status);
  const moving = ["IN_TRANSIT", "AT_PORT", "LOADED_ON_VESSEL", "DEPARTED", "ARRIVED"].includes(status);
  return cn(
    "text-[10px] font-bold rounded px-1.5 py-0.5 border whitespace-nowrap",
    done ? "bg-green-50 text-green-700 border-green-200"
      : moving ? "bg-indigo-50 text-indigo-700 border-indigo-200"
      : status === "CANCELLED" ? "bg-gray-100 text-gray-500 border-gray-200"
      : "bg-amber-50 text-amber-700 border-amber-200"
  );
}

function parseDoc(v: string | null): { path: string; fileName: string } | null {
  if (!v) return null;
  try {
    const d = JSON.parse(v);
    if (d && typeof d.path === "string" && /^upload\/logistics\//.test(d.path)) return d;
    return null;
  } catch {
    return null;
  }
}

export function ShipmentDrawer({
  shipmentId,
  onClose,
  onRecordBooking,
  onChanged,
}: {
  shipmentId: string;
  onClose: () => void;
  onRecordBooking: (shipmentId: string) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "containers" | "transport" | "documents" | "timeline">("overview");

  // Transport add form state
  const [showTransportForm, setShowTransportForm] = useState(false);
  const [tType, setTType] = useState("trucking");
  const [tProvider, setTProvider] = useState("");
  const [tOrigin, setTOrigin] = useState("");
  const [tDestination, setTDestination] = useState("");
  const [tDate, setTDate] = useState("");
  const [tReference, setTReference] = useState("");

  // Timeline add form state
  const [showEventForm, setShowEventForm] = useState(false);
  const [eTitle, setETitle] = useState("");
  const [eDetail, setEDetail] = useState("");
  const [eDate, setEDate] = useState("");

  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await apiFetch(`/api/logistics/shipments/${shipmentId}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed to load shipment");
      setDetail(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load shipment");
    }
  }

  useEffect(() => {
    void load();
  }, [shipmentId]);

  async function toggleChecklistItem(item: LogisticsChecklistItem) {
    const next = item.status === "done" ? "pending" : "done";
    setBusy(true);
    try {
      const r = await apiFetch(`/api/logistics/shipments/${shipmentId}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ item_id: item.id, status: next }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      await load();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update checklist");
    } finally {
      setBusy(false);
    }
  }

  async function updateContainerStatus(c: LogisticsContainer, status: string) {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/logistics/containers/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      await load();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update container");
    } finally {
      setBusy(false);
    }
  }

  async function addTransport() {
    if (!tOrigin.trim() || !tDestination.trim()) {
      setError("Transport needs an origin and destination.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/logistics/shipments/${shipmentId}/transport`, {
        method: "POST",
        body: JSON.stringify({
          segment_type: tType,
          provider_name: tProvider || null,
          origin: tOrigin,
          destination: tDestination,
          planned_date: tDate || null,
          reference: tReference || null,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setShowTransportForm(false);
      setTProvider(""); setTOrigin(""); setTDestination(""); setTDate(""); setTReference("");
      await load();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add transport");
    } finally {
      setBusy(false);
    }
  }

  async function addEvent() {
    if (!eTitle.trim()) {
      setError("Give the update a title.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/logistics/shipments/${shipmentId}/events`, {
        method: "POST",
        body: JSON.stringify({
          title: eTitle,
          detail: eDetail || null,
          event_type: "external_update",
          event_date: eDate || null,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setShowEventForm(false);
      setETitle(""); setEDetail(""); setEDate("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add event");
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={onClose} className="mt-4 text-sm font-semibold text-stone-700 underline">Close</button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl p-6 text-sm text-gray-500">Loading shipment…</div>
      </div>
    );
  }

  const s = detail.shipment;
  const openSteps = detail.checklist.filter((c) => c.status === "pending").length;
  const doneSteps = detail.checklist.filter((c) => c.status === "done").length;
  const docsCount =
    detail.bookings.filter((b) => parseDoc(b.confirmation_document)).length +
    (detail.customsDocs || []).length;

  const tabs: { key: typeof tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview & Tasks", badge: detail.tasks.length || undefined },
    { key: "containers", label: "Containers", badge: detail.containers.length || undefined },
    { key: "transport", label: "Transport" },
    { key: "documents", label: "Documents", badge: docsCount || undefined },
    { key: "timeline", label: "Timeline" },
  ];

  const facts: [string, string][] = [
    ["Contract", s.contract_id || "—"],
    ["Buyer", s.buyer_name || "—"],
    ["Carrier", s.carrier || "—"],
    ["Vessel", s.vessel_name || "—"],
    ["B/L number", s.bill_of_lading_number || "—"],
    ["ETD", s.etd || "—"],
    ["ETA", s.eta || "—"],
    ["ATD", s.atd || "—"],
    ["ATA", s.ata || "—"],
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-stone-50 w-full max-w-xl h-full overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-gray-900">{s.shipment_id}</h2>
                <span className={statusPill(s.status)}>{s.status.replace("_", " ")}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">
                {s.buyer_name || "Unknown buyer"} · {s.departure_port || "?"} <ArrowRight className="w-3 h-3 inline" /> {s.arrival_port || "?"} · {s.total_volume_bags ?? 0} bags
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "text-xs font-semibold rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors",
                  tab === t.key ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-100"
                )}
              >
                {t.label}
                {t.badge ? <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 rounded-full px-1.5 py-px">{t.badge}</span> : null}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        )}

        <div className="p-5 space-y-5">
          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <>
              {/* Shipment facts */}
              <section className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
                  <Ship className="w-3.5 h-3.5" /> Shipment facts
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {facts.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[10px] uppercase font-semibold text-gray-400">{k}</dt>
                      <dd className="text-sm text-gray-800 truncate" title={v}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* Next actions */}
              {detail.tasks.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Next actions
                    <span className="bg-amber-100 text-amber-800 rounded-full px-1.5 text-[10px]">{detail.tasks.length}</span>
                  </h3>
                  <div className="space-y-2">
                    {detail.tasks.map((t, i) => (
                      <div key={i} className={cn(
                        "rounded-xl border p-3",
                        t.severity === "warning" ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"
                      )}>
                        <p className="text-sm font-semibold text-gray-800">{t.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{t.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Checklist */}
              <section className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" /> Export checklist
                  </h3>
                  <span className={cn(
                    "text-[11px] font-semibold rounded-full px-2 py-0.5",
                    openSteps === 0 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                  )}>
                    {doneSteps}/{detail.checklist.length} done
                  </span>
                </div>
                {openSteps > 0 && (
                  <p className="text-xs text-gray-500 mb-3">
                    {openSteps} checklist item(s) still open — {detail.checklist.find((c) => c.status === "pending")?.title}
                    {openSteps > 1 ? ` (+${openSteps - 1} more)` : ""}
                  </p>
                )}
                <ul className="space-y-1">
                  {detail.checklist.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => !busy && void toggleChecklistItem(item)}
                        disabled={busy}
                        className={cn(
                          "w-full flex items-start gap-2.5 rounded-lg p-2 text-left transition-colors",
                          item.status === "done" ? "bg-green-50/60" : "hover:bg-stone-50",
                          busy && "opacity-60"
                        )}
                      >
                        {item.status === "done"
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                          : <Circle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />}
                        <span className="min-w-0">
                          <span className={cn("block text-sm", item.status === "done" ? "text-gray-400 line-through" : "text-gray-800")}>
                            {item.title}
                          </span>
                          {item.detail && <span className="block text-[11px] text-gray-400">{item.detail}</span>}
                          {item.status === "done" && item.completed_by && (
                            <span className="block text-[10px] text-gray-400 mt-0.5">✓ {item.completed_by} · {item.completed_ts?.slice(0, 10)}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Bookings */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Recorded bookings
                  </h3>
                  <button
                    onClick={() => onRecordBooking(s.shipment_id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Record External Booking
                  </button>
                </div>
                {detail.bookings.length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-500">
                    No bookings recorded yet. Find a provider, book on their official channel, then record it here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.bookings.map((b) => (
                      <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold text-gray-900">{b.booking_reference}</span>
                          <span className="text-xs text-gray-500 text-right">{b.provider_name}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {b.quantity} × {b.container_type || "container"}
                          {b.container_numbers ? ` (${b.container_numbers})` : ""}
                          {b.booked_date ? ` · booked ${b.booked_date.slice(0, 10)}` : ""}
                        </p>
                        {(b.vessel || b.voyage || b.eta) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[b.vessel, b.voyage && `Voyage ${b.voyage}`, b.eta && `ETA ${b.eta.slice(0, 10)}`].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ── CONTAINERS ── */}
          {tab === "containers" && (
            <section className="space-y-3">
              {detail.containers.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-500">
                  No containers recorded. Container numbers entered with a booking create container records automatically.
                </div>
              ) : (
                detail.containers.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-sm font-semibold text-gray-900 truncate">{c.container_number || "(number pending)"}</span>
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{c.container_type}</span>
                        <span className={containerStatusPill(c.status)}>{c.status.replace(/_/g, " ")}</span>
                      </div>
                      <div className="relative">
                        <select
                          value={c.status}
                          disabled={busy}
                          onChange={(e) => void updateContainerStatus(c, e.target.value)}
                          className="appearance-none text-xs font-semibold bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          aria-label={`Update status of ${c.container_number || "container"}`}
                        >
                          {CONTAINER_STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-stone-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 mt-3">
                      {([
                        ["Pickup", c.pickup_date], ["Loaded", c.loaded_date], ["Stuffed", c.stuffed_date],
                        ["Sealed", c.sealed_date], ["Gate-in", c.gate_in_date], ["Port arrival", c.port_arrival_date],
                        ["Vessel", c.vessel], ["Voyage", c.voyage], ["B/L", c.bill_of_lading],
                        ["Seal", c.seal_number], ["Depot", c.depot],
                      ] as [string, string | null][]).map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="text-[10px] uppercase font-semibold text-gray-400">{k}</dt>
                          <dd className="text-xs text-gray-700 truncate">{v ? String(v).slice(0, 10) : "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))
              )}
            </section>
          )}

          {/* ── TRANSPORT ── */}
          {tab === "transport" && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> Inland legs
                </h3>
                <button
                  onClick={() => setShowTransportForm((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add transport
                </button>
              </div>

              {showTransportForm && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Type</span>
                      <select value={tType} onChange={(e) => setTType(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        {SEGMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Provider</span>
                      <input type="text" value={tProvider} placeholder="e.g. Modjo Trucking" onChange={(e) => setTProvider(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Origin *</span>
                      <input type="text" value={tOrigin} onChange={(e) => setTOrigin(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Destination *</span>
                      <input type="text" value={tDestination} onChange={(e) => setTDestination(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Planned date</span>
                      <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Reference</span>
                      <input type="text" value={tReference} placeholder="the provider's booking/ref" onChange={(e) => setTReference(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowTransportForm(false)} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">Cancel</button>
                    <button onClick={() => void addTransport()} disabled={busy}
                      className="text-sm font-semibold text-white bg-stone-800 hover:bg-stone-900 rounded-lg px-4 py-1.5 disabled:opacity-60">
                      {busy ? "Saving…" : "Add segment"}
                    </button>
                  </div>
                </div>
              )}

              {detail.transport.length === 0 && !showTransportForm ? (
                <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-500">
                  No transport recorded. Add the trucking / rail legs arranged for this shipment.
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.transport.map((seg) => (
                    <div key={seg.id} className="bg-white rounded-xl border border-gray-200 p-3.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 capitalize">
                          {seg.segment_type.replace("_", " ")}: {seg.origin || "?"} <ArrowRight className="w-3 h-3 inline" /> {seg.destination || "?"}
                        </span>
                        <span className="text-[10px] font-bold bg-stone-100 text-stone-700 rounded px-1.5 py-0.5 uppercase">{seg.status}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {seg.provider_name || "unrecorded provider"}
                        {seg.reference ? ` · ref ${seg.reference}` : ""}
                        {seg.planned_date ? ` · planned ${seg.planned_date.slice(0, 10)}` : ""}
                        {seg.actual_date ? ` · actual ${seg.actual_date.slice(0, 10)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── DOCUMENTS ── */}
          {tab === "documents" && (
            <section className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Booking confirmations
                </h3>
                {detail.bookings.filter((b) => parseDoc(b.confirmation_document)).length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-500">
                    No confirmation documents uploaded. Upload the provider&apos;s confirmation when recording or updating a booking.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.bookings.filter((b) => parseDoc(b.confirmation_document)).map((b) => {
                      const doc = parseDoc(b.confirmation_document)!;
                      return (
                        <a
                          key={b.id}
                          href={`/api/logistics/documents?path=${encodeURIComponent(doc.path)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3.5 hover:border-stone-400 transition-colors"
                        >
                          <Download className="w-4 h-4 text-stone-500 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-gray-800 truncate">{doc.fileName}</span>
                            <span className="block text-xs text-gray-500">booking {b.booking_reference} · {b.provider_name}</span>
                          </span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Customs documents</h3>
                {(detail.customsDocs || []).length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-500">
                    No customs documents recorded for this shipment.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.customsDocs.map((d, i) => (
                      <div key={i} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3.5">
                        <span className="text-sm text-gray-800 capitalize">{d.document_type.replace(/_/g, " ")}</span>
                        <span className={cn("text-[10px] font-bold rounded px-1.5 py-0.5 uppercase",
                          d.status === "cleared" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
                          {d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── TIMELINE ── */}
          {tab === "timeline" && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Timeline</h3>
                <button
                  onClick={() => setShowEventForm((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add external update
                </button>
              </div>

              {showEventForm && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">What happened? *</span>
                    <input type="text" value={eTitle} placeholder="e.g. Depot called: containers released"
                      onChange={(e) => setETitle(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">Details</span>
                    <textarea value={eDetail} rows={2} onChange={(e) => setEDetail(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">When it happened</span>
                    <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowEventForm(false)} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">Cancel</button>
                    <button onClick={() => void addEvent()} disabled={busy}
                      className="text-sm font-semibold text-white bg-stone-800 hover:bg-stone-900 rounded-lg px-4 py-1.5 disabled:opacity-60">
                      {busy ? "Saving…" : "Add to timeline"}
                    </button>
                  </div>
                </div>
              )}

              {detail.events.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-500">
                  No events recorded yet.
                </div>
              ) : (
                <ol className="relative border-l-2 border-stone-200 ml-2 space-y-4">
                  {detail.events.map((ev) => (
                    <li key={ev.id} className="ml-4">
                      <span className={cn(
                        "absolute -left-[7px] w-3 h-3 rounded-full border-2 border-white",
                        ev.event_type === "delay_recorded" || ev.event_type === "status_change" && ev.title.includes("hold")
                          ? "bg-amber-500" : "bg-stone-400"
                      )} />
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">{ev.title}</span>
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {ev.event_ts.slice(0, 10)}
                          </span>
                        </div>
                        {ev.detail && <p className="text-xs text-gray-500 mt-1">{ev.detail}</p>}
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          {ev.source}{ev.created_by ? ` · ${ev.created_by}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
