"use client";

/**
 * FindContainerModal — the empty-container workflow entry point.
 *
 * The operator describes the REAL requirement (type, quantity, dates,
 * places, optional shipment reference). Faith-El then surfaces matching
 * providers from the DB directory with their verified contact channels —
 * it NEVER claims to check availability (every provider is external).
 * Availability is confirmed by the provider, on their channel.
 */

import { useState } from "react";
import { Package, Search, X as XIcon } from "lucide-react";
import { apiFetch } from "@/lib/auth-client";
import type { LogisticsProvider } from "@/lib/types";
import { ProviderCard } from "./ProviderCard";

const CONTAINER_TYPES = ["20GP", "40GP", "40HC", "40RF", "20RF", "20TK"];

export function FindContainerModal({
  onClose,
  onRecordBooking,
  shipments,
}: {
  onClose: () => void;
  onRecordBooking: (provider: LogisticsProvider, highlight?: Record<string, string | number | undefined>) => void;
  shipments: { id: string; buyer: string }[];
}) {
  const [containerType, setContainerType] = useState("20GP");
  const [quantity, setQuantity] = useState("2");
  const [neededBy, setNeededBy] = useState("");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<LogisticsProvider[]>([]);

  async function findProviders() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch("/api/logistics/providers");
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed to load providers");
      // Rank: providers that support empty-container supply first, then the rest
      const all: LogisticsProvider[] = d.providers || [];
      all.sort((a, b) => (b.supports_empty_container ? 1 : 0) - (a.supports_empty_container ? 1 : 0));
      setProviders(all);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }

  const highlight = {
    containerType,
    quantity: Math.max(1, parseInt(quantity || "1", 10) || 1),
    neededBy: neededBy || undefined,
    pickup: pickup || undefined,
    destination: destination || undefined,
    shipmentId: shipmentId || undefined,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Find Empty Container</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Faith-El finds providers to contact — availability is confirmed by the provider.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Requirement form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Container type</span>
              <select
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Quantity</span>
              <input
                type="number" min={1} value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Needed by</span>
              <input
                type="date" value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Pickup location</span>
              <input
                type="text" value={pickup} placeholder="e.g. Addis Ababa"
                onChange={(e) => setPickup(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Destination / port</span>
              <input
                type="text" value={destination} placeholder="e.g. Djibouti"
                onChange={(e) => setDestination(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Shipment / order reference (optional)</span>
              <select
                value={shipmentId}
                onChange={(e) => setShipmentId(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">— none —</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>{s.id} · {s.buyer}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={findProviders}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
          >
            <Search className="w-4 h-4" />
            {loading ? "Finding providers…" : "Find providers"}
          </button>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}

          {/* Results */}
          {searched && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 border-t border-gray-100 pt-4">
                <Package className="w-3.5 h-3.5" />
                {providers.length === 0 ? (
                  <span>
                    No providers in your directory yet. An admin can add providers in this tab — or add
                    the provider you use and record their details.
                  </span>
                ) : (
                  <span>
                    {providers.length} provider(s) from your organization&apos;s directory. Contact them on
                    their official channel, then record the booking.
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3">
                {providers.map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    isAdmin={false}
                    highlight={highlight}
                    onRecordBooking={(prov) => onRecordBooking(prov, highlight)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
