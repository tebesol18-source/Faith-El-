"use client";

/**
 * ProviderAdminModal — admin management of a directory entry.
 *
 * Create / edit provider details (contact channels, capabilities, notes),
 * verify against an official source (records source + date), deactivate.
 * "Verified" can only be set WITH a source URL — provenance is mandatory.
 */

import { useEffect, useState } from "react";
import { BadgeCheck, Power, Save, X as XIcon } from "lucide-react";
import { apiFetch } from "@/lib/auth-client";
import type { LogisticsProvider } from "@/lib/types";

const PROVIDER_TYPES: { value: string; label: string }[] = [
  { value: "national_carrier", label: "National Carrier" },
  { value: "shipping_line", label: "Shipping Line" },
  { value: "freight_forwarder", label: "Freight Forwarder" },
  { value: "trucking", label: "Trucking" },
  { value: "railway", label: "Railway" },
  { value: "port_terminal", label: "Port & Terminal" },
  { value: "customs_clearing", label: "Customs & Clearing" },
  { value: "warehouse", label: "Warehouse" },
  { value: "other", label: "Other" },
];

const TEXT_FIELDS: { key: keyof LogisticsProvider; label: string; placeholder?: string }[] = [
  { key: "name", label: "Name *", placeholder: "e.g. Ethiopian Shipping and Logistics" },
  { key: "phone", label: "Phone", placeholder: "+251…" },
  { key: "email", label: "Email", placeholder: "contact@provider.com" },
  { key: "website_url", label: "Website URL", placeholder: "https://…" },
  { key: "booking_url", label: "Booking URL (official)", placeholder: "https://…" },
  { key: "tracking_url", label: "Tracking URL (official)", placeholder: "https://…" },
  { key: "empty_container_url", label: "Empty-container URL (official)", placeholder: "https://…" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "service_area", label: "Service area" },
  { key: "services", label: "Services (comma-separated)" },
  { key: "address", label: "Address" },
  { key: "notes", label: "Notes" },
];

const BOOLS: { key: keyof LogisticsProvider; label: string }[] = [
  { key: "supports_contact", label: "Contactable" },
  { key: "supports_external_booking", label: "External booking" },
  { key: "supports_tracking", label: "Tracking" },
  { key: "supports_quotation", label: "Quotes" },
  { key: "supports_empty_container", label: "Empty containers" },
  { key: "supports_document_submission", label: "Document submission" },
];

export function ProviderAdminModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: LogisticsProvider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [bools, setBools] = useState<Record<string, boolean>>({});
  const [providerType, setProviderType] = useState("other");
  const [verifySource, setVerifySource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (provider) {
      const v: Record<string, string> = {};
      for (const f of TEXT_FIELDS) v[f.key] = (provider[f.key] as string | null) || "";
      setValues(v);
      const b: Record<string, boolean> = {};
      for (const f of BOOLS) b[f.key] = Boolean(provider[f.key]);
      setBools(b);
      setProviderType(provider.provider_type);
      setVerifySource(provider.official_source_url || "");
    } else {
      setValues({});
      setBools({ supports_contact: true });
      setProviderType("other");
      setVerifySource("");
    }
  }, [provider]);

  async function save() {
    setError(null);
    setNotice(null);
    if (!values.name?.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: values.name.trim(),
        provider_type: providerType,
        ...Object.fromEntries(
          TEXT_FIELDS.filter((f) => f.key !== "name").map((f) => [f.key, values[f.key]?.trim() || null])
        ),
        ...Object.fromEntries(BOOLS.map((f) => [f.key, bools[f.key] ? 1 : 0])),
      };
      const r = provider
        ? await apiFetch(`/api/logistics/providers/${provider.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiFetch("/api/logistics/providers", { method: "POST", body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Save failed");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setError(null);
    setNotice(null);
    if (!provider) return;
    if (!verifySource.trim()) {
      setError("Enter the official source URL you checked the details against.");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(`/api/logistics/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "verify", official_source_url: verifySource.trim() }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Verification failed");
      setNotice(`Marked verified against ${d.provider.official_source_url} on ${d.provider.last_verified_at.slice(0, 10)}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!provider) return;
    setError(null);
    setSaving(true);
    try {
      const r = await apiFetch(`/api/logistics/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !provider.active }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {provider ? "Edit provider" : "Add provider"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {provider?.organization_id === null
                ? "Global (shared) entry — editable by the platform org."
                : "Your organization's directory entry. Store details exactly as published by the provider."}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-gray-700">Provider type</span>
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            {TEXT_FIELDS.map((f) => (
              <label key={f.key} className={cnField(f.key)}>
                <span className="text-xs font-semibold text-gray-700">{f.label}</span>
                <input
                  type="text"
                  value={values[f.key] || ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
            ))}
          </div>

          <div>
            <span className="text-xs font-semibold text-gray-700">Capabilities</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {BOOLS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setBools((b) => ({ ...b, [f.key]: !b[f.key] }))}
                  className={bools[f.key]
                    ? "text-xs font-semibold text-stone-800 bg-amber-100 border border-amber-300 rounded-full px-3 py-1"
                    : "text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1"}
                >
                  {bools[f.key] ? "✓ " : ""}{f.label}
                </button>
              ))}
            </div>
          </div>

          {provider && (
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <BadgeCheck className={`w-4 h-4 ${provider.verified ? "text-green-600" : "text-gray-300"}`} />
                <span className={provider.verified ? "text-green-700 font-semibold" : "text-gray-400"}>
                  {provider.verified
                    ? `Verified (last checked ${provider.last_verified_at?.slice(0, 10) ?? "—"} against ${provider.official_source_url})`
                    : "Not verified yet"}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={verifySource}
                  onChange={(e) => setVerifySource(e.target.value)}
                  placeholder="official source URL checked (https://…)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => void verify()}
                  disabled={saving}
                  className="text-xs font-semibold text-green-800 bg-green-50 hover:bg-green-100 border border-green-300 rounded-lg px-3 py-2 disabled:opacity-60"
                >
                  Mark verified
                </button>
              </div>
              <p className="text-[11px] text-gray-400">
                Verification records WHERE and WHEN the details were checked. Never mark details verified without checking them.
              </p>
            </div>
          )}

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
          {notice && <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">{notice}</div>}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            {provider ? (
              <button
                onClick={() => void toggleActive()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-red-700 border border-gray-200 hover:border-red-300 rounded-lg px-3 py-2 disabled:opacity-60"
              >
                <Power className="w-3.5 h-3.5" />
                {provider.active ? "Deactivate" : "Reactivate"}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2">Cancel</button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 disabled:opacity-60 rounded-lg px-5 py-2 transition-colors"
              >
                <Save className="w-4 h-4" /> {saving ? "Saving…" : provider ? "Save changes" : "Add provider"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cnField(key: string): string {
  // Wide fields get the full row
  return ["name", "address", "service_area", "services", "notes"].includes(key)
    ? "block sm:col-span-2"
    : "block";
}
