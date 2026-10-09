"use client";

/**
 * NewShipmentModal — create a shipment record from a signed contract.
 *
 * Creating the record books nothing (the checklist's first steps make
 * that explicit). Carrier is intentionally absent — it is merged onto
 * the shipment when the operator records the real external booking.
 */

import { useEffect, useState } from "react";
import { Save, X as XIcon } from "lucide-react";
import { apiFetch } from "@/lib/auth-client";

export function NewShipmentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [contracts, setContracts] = useState<{ contract_id: string; buyer: string; bags: number }[]>([]);
  const [contractId, setContractId] = useState("");
  const [departurePort, setDeparturePort] = useState("Djibouti");
  const [arrivalPort, setArrivalPort] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/contracts")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.contracts)) {
          setContracts(
            d.contracts.map((c: Record<string, unknown>) => ({
              contract_id: String(c.contract_id || c.id || ""),
              buyer: String((c as { buyer?: string }).buyer || (c as { lead_name?: string }).lead_name || "buyer unknown"),
              bags: Number(c.total_volume_bags || 0),
            })).filter((c: { contract_id: string }) => c.contract_id)
          );
        }
      })
      .catch(() => { /* empty contract list is handled by the empty state */ });
  }, []);

  async function save() {
    setError(null);
    if (!contractId) { setError("Pick the contract this shipment fulfils."); return; }
    if (!departurePort.trim() || !arrivalPort.trim()) { setError("Both ports are required."); return; }
    if (!etd || !eta) { setError("ETD and ETA are required."); return; }
    setSaving(true);
    try {
      const r = await apiFetch("/api/shipments", {
        method: "POST",
        body: JSON.stringify({
          contractId,
          departurePort: departurePort.trim(),
          arrivalPort: arrivalPort.trim(),
          etd,
          eta,
          notes: notes || undefined,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed to create shipment");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create shipment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Shipment</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Creates the shipment record and its 18-step checklist. Nothing is booked — find a provider next.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {contracts.length === 0 ? (
            <div className="text-sm text-gray-500 bg-stone-50 border border-dashed border-gray-300 rounded-xl p-4 text-center">
              No contracts available yet. A shipment is created from a signed contract — close a deal first
              (Deals → contract), then come back.
            </div>
          ) : (
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Contract *</span>
              <select
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">— pick a contract —</option>
                {contracts.map((c) => (
                  <option key={c.contract_id} value={c.contract_id}>
                    {c.contract_id} · {c.buyer} · {c.bags} bags
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Departure port *</span>
              <input type="text" value={departurePort} onChange={(e) => setDeparturePort(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Arrival port *</span>
              <input type="text" value={arrivalPort} placeholder="e.g. Hamburg" onChange={(e) => setArrivalPort(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">ETD *</span>
              <input type="date" value={etd} onChange={(e) => setEtd(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">ETA *</span>
              <input type="date" value={eta} onChange={(e) => setEta(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Notes</span>
            <textarea value={notes} rows={2} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context (cargo readiness, special requirements…)"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </label>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2">Cancel</button>
            <button
              onClick={() => void save()}
              disabled={saving || contracts.length === 0}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-60 rounded-lg px-5 py-2 transition-colors"
            >
              <Save className="w-4 h-4" /> {saving ? "Creating…" : "Create shipment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
