"use client";

/**
 * ProviderCard — one logistics provider from the DB-driven directory.
 *
 * HONEST ACTION CONTRACT (docs/logistics-command-center.md):
 *  - Call / Email are real tel: / mailto: links using the STORED contact
 *    details — shown only when the provider has them.
 *  - Website / Empty Containers / Book / Track open the provider's OFFICIAL
 *    URLs — shown only when a URL is stored. No URL → no button (never a
 *    dead link); the card explains that booking/availability happens on
 *    the provider's channel ("External").
 *  - Record Booking does NOT book anything — it opens the record form the
 *    operator fills AFTER booking on the provider's channel.
 *  - "Verified" marks details checked against official sources; the card
 *    shows the date. The section footer carries the standing disclaimer.
 */

import { useState } from "react";
import {
  BadgeCheck, Box, CalendarCheck, ExternalLink, Mail, MapPin, Package, Phone,
  Radar, ShieldQuestion, PencilLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogisticsProvider } from "@/lib/types";

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  national_carrier: "National Carrier",
  shipping_line: "Shipping Line",
  freight_forwarder: "Freight Forwarder",
  trucking: "Trucking",
  railway: "Railway",
  port_terminal: "Port & Terminal",
  customs_clearing: "Customs & Clearing",
  warehouse: "Warehouse",
  other: "Other",
};

const CAPABILITY_BADGES: { key: keyof LogisticsProvider; label: string }[] = [
  { key: "supports_empty_container", label: "Empty containers" },
  { key: "supports_quotation", label: "Quotes" },
  { key: "supports_external_booking", label: "Booking" },
  { key: "supports_tracking", label: "Tracking" },
];

export function providerTypeLabel(t: string): string {
  return PROVIDER_TYPE_LABELS[t] || "Other";
}

export function ProviderCard({
  provider,
  isAdmin,
  onRecordBooking,
  onEdit,
  highlight,
}: {
  provider: LogisticsProvider;
  isAdmin: boolean;
  onRecordBooking: (provider: LogisticsProvider) => void;
  onEdit?: (provider: LogisticsProvider) => void;
  highlight?: { containerType?: string; quantity?: number; pickup?: string; destination?: string; neededBy?: string; shipmentId?: string };
}) {
  const [imgBroken, setImgBroken] = useState(false);
  void imgBroken; // (kept for future logo support; no fake logos are rendered)
  void setImgBroken;

  const services = (provider.services || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const hasPhone = !!provider.phone;
  const hasEmail = !!provider.email;

  return (
    <div className={cn(
      "bg-white rounded-xl border p-5 flex flex-col gap-4",
      highlight ? "border-amber-300 ring-2 ring-amber-100" : "border-gray-200"
    )}>
      {/* Header: name + type + verified */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-[15px] leading-tight">{provider.name}</h3>
            {provider.verified ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                <BadgeCheck className="w-3 h-3" />
                Verified {provider.last_verified_at ? provider.last_verified_at.slice(0, 10) : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                <ShieldQuestion className="w-3 h-3" />
                Unverified
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="font-medium text-gray-600 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5">
              {providerTypeLabel(provider.provider_type)}
            </span>
            {(provider.city || provider.country) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {[provider.city, provider.country].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(provider)}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 hover:border-stone-400 rounded-lg px-2 py-1 transition-colors"
          >
            <PencilLine className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      {/* Services */}
      {services.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {services.map((s) => (
            <span key={s} className="text-[11px] text-stone-700 bg-stone-50 border border-stone-200 rounded-full px-2 py-0.5">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Capability statuses — always honest about being external */}
      <div className="flex flex-wrap gap-1.5">
        {CAPABILITY_BADGES.map(({ key, label }) =>
          provider[key] ? (
            <span key={label} className={cn(
              "text-[11px] font-medium rounded-full px-2 py-0.5 border inline-flex items-center gap-1",
              provider.integration_status === "api_connected"
                ? "text-blue-700 bg-blue-50 border-blue-200"
                : "text-amber-700 bg-amber-50 border-amber-200"
            )}>
              {provider.integration_status === "api_connected" ? "⚡" : "📅"} {label}
              {provider.integration_status === "external" ? " · External" : " · Connected"}
            </span>
          ) : null
        )}
      </div>

      {/* Highlight (from Find Empty Container) */}
      {highlight && (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900">
          <span className="font-semibold">Your requirement:</span>{" "}
          {highlight.quantity} × {highlight.containerType}
          {highlight.neededBy ? ` · needed by ${highlight.neededBy}` : ""}
          {highlight.pickup ? ` · pickup at ${highlight.pickup}` : ""}
          {highlight.destination ? ` → ${highlight.destination}` : ""}
          {highlight.shipmentId ? ` · ${highlight.shipmentId}` : ""}
          <div className="mt-1 text-amber-800/80">
            Faith-El cannot check availability — confirm it on the provider&apos;s channel below.
          </div>
        </div>
      )}

      {/* Contact details — only stored values */}
      {(hasPhone || hasEmail || provider.address) && (
        <div className="text-xs text-gray-600 space-y-1">
          {hasPhone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="font-mono">{provider.phone}</span>
            </div>
          )}
          {hasEmail && (
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="truncate">{provider.email}</span>
            </div>
          )}
          {provider.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span className="text-gray-500">{provider.address}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions — every button does something real */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
        {hasPhone && (
          <a
            href={`tel:${provider.phone!.replace(/[^+\d]/g, "")}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" /> Call
          </a>
        )}
        {hasEmail && (
          <a
            href={`mailto:${provider.email}?subject=${encodeURIComponent("Coffee export shipment enquiry")}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" /> Email
          </a>
        )}
        {provider.website_url && (
          <a
            href={provider.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Website
          </a>
        )}
        {provider.supports_empty_container && provider.empty_container_url && (
          <a
            href={provider.empty_container_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Box className="w-3.5 h-3.5" /> Empty Containers
          </a>
        )}
        {provider.supports_external_booking && provider.booking_url && (
          <a
            href={provider.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-stone-800 hover:bg-stone-900 rounded-lg px-3 py-1.5 transition-colors"
          >
            <CalendarCheck className="w-3.5 h-3.5" /> Book / Request
          </a>
        )}
        {provider.supports_tracking && provider.tracking_url && (
          <a
            href={provider.tracking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Radar className="w-3.5 h-3.5" /> Track
          </a>
        )}
      </div>

      {/* Record booking — the only in-app write path */}
      <button
        onClick={() => onRecordBooking(provider)}
        className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg px-3 py-2 transition-colors"
      >
        <Package className="w-3.5 h-3.5" /> Record Booking (after booking on their channel)
      </button>
    </div>
  );
}
