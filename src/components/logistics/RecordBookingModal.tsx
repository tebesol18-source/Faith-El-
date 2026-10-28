"use client";

/**
 * RecordBookingModal — record a REAL external booking.
 *
 * This form creates NO booking. The operator books on the provider's
 * official channel (via the provider card's links / call / email), and
 * records the outcome here: the provider's OWN reference, container
 * details, dates and the confirmation document. Submitting stores the
 * booking record, moves the shipment to "booked" and writes an honest
 * timeline event ("booking was made on the provider's official channel").
 */

import { useRef, useState } from "react";
import { FileUp, Package, X as XIcon } from "lucide-react";
import { apiFetch } from "@/lib/auth-client";
import type { LogisticsProvider } from "@/lib/types";

const CONTAINER_TYPES = ["20GP", "40GP", "40HC", "40RF", "20RF", "20TK"];

export function RecordBookingModal({
  provider,
  shipmentId,
  highlight,
  onClose,
  onSaved,
}: {
  provider: LogisticsProvider | null;
  shipmentId: string | null;
  highlight?: { containerType?: string; quantity?: number; pickup?: string; destination?: string; neededBy?: string; shipmentId?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(provider?.id ?? null);
  const [reference, setReference] = useState("");
  const [bookedDate, setBookedDate] = useState(new Date().toISOString().slice(0, 10));
  const [containerType, setContainerType] = useState(highlight?.containerType || "20GP");
  const [quantity, setQuantity] = useState(String(highlight?.quantity || 1));
  const [pickupLocation, setPickupLocation] = useState(highlight?.pickup || "");
  const [depot, setDepot] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [containerNumbers, setContainerNumbers] = useState("");
  const [vessel, setVessel] = useState("");
  const [voyage, setVoyage] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [document, setDocument] = useState<{ path: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetShipmentId = shipmentId || highlight?.shipmentId || null;

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await apiFetch("/api/logistics/documents", { method: "POST", body: form });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Upload failed");
      setDocument({ path: d.document.path, fileName: d.document.fileName });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null);
    if (!selectedProviderId && !provider) {
      setError("Pick the provider you booked with.");
      return;
    }
    if (!reference.trim()) {
      setError("Enter the booking reference the provider gave you.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        provider_id: selectedProviderId ?? provider!.id,
        booking_reference: reference.trim(),
        booked_date: bookedDate || null,
        container_type: containerType,
        quantity: Math.max(1, parseInt(quantity || "1", 10) || 1),
        pickup_location: pickupLocation || null,
        depot: depot || null,
        available_date: availableDate || null,
        container_numbers: containerNumbers.trim() || null,
        vessel: vessel || null,
        voyage: voyage || null,
        etd: etd || null,
        eta: eta || null,
        notes: notes || null,
      };
      if (targetShipmentId) payload.shipment_id = targetShipmentId;
      if (document) payload.confirmation_document = JSON.stringify(document);

      const r = await apiFetch("/api/logistics/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed to record booking");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to record booking");
    } finally {
      setSaving(false);
    }
  }

  const providerName = provider?.name || (selectedProviderId ? "selected provider" : "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Record External Booking</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {providerName
                ? `Booked with ${providerName}${targetShipmentId ? ` for ${targetShipmentId}` : ""}. Faith-El records the booking — it does not place it.`
                : "Record the booking you completed on the provider's channel. Faith-El does not place bookings."}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Booking reference *</span>
              <input
                type="text" value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="the provider's own reference, e.g. ESL-88431"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Booked on</span>
              <input
                type="date" value={bookedDate}
                onChange={(e) => setBookedDate(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Container type</span>
              <select
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {CONTAINER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
              <span className="text-xs font-semibold text-gray-700">Pickup location</span>
              <input
                type="text" value={pickupLocation} placeholder="e.g. Addis Ababa"
                onChange={(e) => setPickupLocation(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Container depot / release point</span>
              <input
                type="text" value={depot} placeholder="e.g. Modjo dry port"
                onChange={(e) => setDepot(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Containers available from</span>
              <input
                type="date" value={availableDate}
                onChange={(e) => setAvailableDate(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Container numbers (comma-separated)</span>
              <input
                type="text" value={containerNumbers} placeholder="e.g. ESLU2051001, ESLU2051002"
                onChange={(e) => setContainerNumbers(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Vessel</span>
              <input
                type="text" value={vessel} placeholder="e.g. MV Bahri Dar"
                onChange={(e) => setVessel(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Voyage</span>
              <input
                type="text" value={voyage} placeholder="e.g. V-118"
                onChange={(e) => setVoyage(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">ETD</span>
              <input
                type="date" value={etd}
                onChange={(e) => setEtd(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">ETA</span>
              <input
                type="date" value={eta}
                onChange={(e) => setEta(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Notes</span>
            <textarea
              value={notes} rows={2}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth recording about this booking (free time, cut-off, special instructions…)"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>

          {/* Confirmation document upload — real file, hashed storage */}
          <div>
            <span className="text-xs font-semibold text-gray-700">Booking confirmation (PDF / PNG / JPG)</span>
            <input
              ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg px-3 py-2 disabled:opacity-60 transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                {uploading ? "Uploading…" : document ? "Replace file" : "Upload confirmation"}
              </button>
              {document && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1.5">
                  ✓ {document.fileName}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-[11px] text-gray-400 max-w-[300px]">
              <Package className="w-3 h-3 inline mr-1" />
              Saving stores the record, sets the shipment to Booked and writes a timeline event.
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 disabled:opacity-60 rounded-lg px-5 py-2 transition-colors"
              >
                {saving ? "Saving…" : "Save booking record"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
