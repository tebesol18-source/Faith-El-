"use client";

import { useState, useEffect } from "react";
import {
  Bot, Clock, Coffee, Filter, Send, Sparkles, TrendingUp, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract, Insight, Quote, QuoteLineItem, Shipment } from "@/lib/types";



const mockQuotesData: Quote[] = [
  {
    id: "QU-2026-0004", lead: "Marcus Coffee GmbH", leadId: "L-2026-00501", version: 2,
    status: "pending_approval", incoterm: "CIF Hamburg", destination: "Hamburg, DE", currency: "USD",
    paymentTerms: "30% deposit · 70% against B/L copy", validUntil: "Aug 02", createdAt: "Jul 21", sentAt: null, respondedAt: null,
    lines: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", weightKg: 5000, pricePerKg: 7.20, costPerKg: 5.40 },
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", weightKg: 5000, pricePerKg: 6.85, costPerKg: 5.10 },
    ],
    freight: 1850, insurance: 420, commissionPct: 2,
    aiDrafted: true, aiConfidence: 92,
    aiSuggestion: "Margin of 22.4% is above target (20%). Yirgacheffe price bumped from V1's $7.05 to $7.20 based on buyer signal. Recommend approval and dispatch today — samples expire in 8 days.",
    buyerNote: null, daysToExpiry: 8,
  },
  {
    id: "QU-2026-0005", lead: "Falcon Coffee UK", leadId: "L-2026-00502", version: 1,
    status: "pending_review", incoterm: "FOB Djibouti", destination: "Felixstowe, UK", currency: "USD",
    paymentTerms: "LC at sight", validUntil: "Aug 05", createdAt: "Jul 22", sentAt: null, respondedAt: null,
    lines: [
      { lotId: "LOT-25-0002", origin: "Yirgacheffe", process: "Natural", grade: "G1", weightKg: 8000, pricePerKg: 6.95, costPerKg: 5.20 },
    ],
    freight: 0, insurance: 0, commissionPct: 2,
    aiDrafted: true, aiConfidence: 78,
    aiSuggestion: "Margin of 25.2% is healthy but Falcon historically negotiates 3-5% down. Consider pre-discounting to $6.75 to avoid round 2. Sample SR-2026-0002 is still in transit — send now while interest is hot.",
    buyerNote: null, daysToExpiry: 11,
  },
  {
    id: "QU-2026-0006", lead: "Hashimoto Coffee", leadId: "L-2026-00503", version: 3,
    status: "revised", incoterm: "CIF Yokohama", destination: "Yokohama, JP", currency: "USD",
    paymentTerms: "T/T 50/50", validUntil: "Jul 30", createdAt: "Jul 18", sentAt: "Jul 19", respondedAt: "Jul 23",
    lines: [
      { lotId: "LOT-25-0005", origin: "Sidamo", process: "Washed", grade: "G2", weightKg: 6000, pricePerKg: 6.40, costPerKg: 4.85 },
      { lotId: "LOT-25-0007", origin: "Limu", process: "Washed", grade: "G1", weightKg: 4000, pricePerKg: 6.20, costPerKg: 4.70 },
    ],
    freight: 2400, insurance: 510, commissionPct: 2,
    aiDrafted: true, aiConfidence: 68,
    aiSuggestion: "Buyer counter-offered at $6.10/$5.95 (4.7% under ask). Margin would compress to 14.8% — still above 12% floor. Recommend accepting the Sidamo price but holding Limu at $6.10 (Limu G1 is scarce).",
    buyerNote: "Price is 5% above market. Can you do $6.10 Sidamo / $5.95 Limu? Need answer by Friday.",
    daysToExpiry: 5,
  },
  {
    id: "QU-2026-0007", lead: "Aurora Imports", leadId: "L-2026-00504", version: 1,
    status: "ai_draft", incoterm: "CIF New York", destination: "New York, US", currency: "USD",
    paymentTerms: "30% deposit · 70% against B/L copy", validUntil: "Aug 08", createdAt: "Jul 24", sentAt: null, respondedAt: null,
    lines: [
      { lotId: "LOT-25-0004", origin: "Guji", process: "Natural", grade: "G1", weightKg: 3000, pricePerKg: 7.50, costPerKg: 5.60 },
    ],
    freight: 2100, insurance: 380, commissionPct: 2,
    aiDrafted: true, aiConfidence: 71,
    aiSuggestion: "Aurora is a new lead with no transaction history. Pricing at $7.50 is competitive vs. US market for G1 Guji Natural ($7.80 median). Margin 21.3%. Recommend adding a 2-week validity to create urgency.",
    buyerNote: null, daysToExpiry: 14,
  },
  {
    id: "QU-2026-0003", lead: "Blue Mountain Traders", leadId: "L-2026-00507", version: 1,
    status: "accepted", incoterm: "CIF Hamburg", destination: "Hamburg, DE", currency: "USD",
    paymentTerms: "LC at sight", validUntil: "Jul 25", createdAt: "Jul 12", sentAt: "Jul 13", respondedAt: "Jul 20",
    lines: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", weightKg: 6000, pricePerKg: 7.10, costPerKg: 5.40 },
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", weightKg: 6000, pricePerKg: 6.75, costPerKg: 5.10 },
      { lotId: "LOT-25-0005", origin: "Sidamo", process: "Washed", grade: "G2", weightKg: 4000, pricePerKg: 6.30, costPerKg: 4.85 },
    ],
    freight: 3200, insurance: 680, commissionPct: 2,
    aiDrafted: false, aiConfidence: 0,
    aiSuggestion: "Accepted in full on Jul 20. Contract CT-2026-0003 has been generated. Margin captured: 19.6%. Recommend proceeding to shipment scheduling immediately — buyer requested August vessel.",
    buyerNote: "All lots approved. Proceeding to contract.",
    daysToExpiry: 1,
  },
  {
    id: "QU-2026-0002", lead: "Rösterei Berlin", leadId: "L-2026-00508", version: 2,
    status: "rejected", incoterm: "FOB Djibouti", destination: "Hamburg, DE", currency: "USD",
    paymentTerms: "T/T 30 days", validUntil: "Jul 20", createdAt: "Jul 08", sentAt: "Jul 09", respondedAt: "Jul 15",
    lines: [
      { lotId: "LOT-25-0004", origin: "Guji", process: "Natural", grade: "G1", weightKg: 5000, pricePerKg: 7.80, costPerKg: 5.60 },
    ],
    freight: 0, insurance: 0, commissionPct: 2,
    aiDrafted: false, aiConfidence: 0,
    aiSuggestion: "Rejected after sample SR-2026-0007 scored 83.0 (target was 86+). Buyer is looking for premium Guji Natural. Review current Guji inventory for lots with 86+ cupping scores before re-quoting.",
    buyerNote: "Sample scored 83 — too low for our specialty line. Looking elsewhere for now.",
    daysToExpiry: -5,
  },
  {
    id: "QU-2026-0001", lead: "Nordic Bean Co", leadId: "L-2026-00505", version: 1,
    status: "expired", incoterm: "CIF Gothenburg", destination: "Gothenburg, SE", currency: "USD",
    paymentTerms: "LC at sight", validUntil: "Jul 10", createdAt: "Jun 25", sentAt: "Jun 26", respondedAt: null,
    lines: [
      { lotId: "LOT-25-0001", origin: "Yirgacheffe", process: "Washed", grade: "G1", weightKg: 4000, pricePerKg: 7.00, costPerKg: 5.40 },
    ],
    freight: 1600, insurance: 360, commissionPct: 2,
    aiDrafted: false, aiConfidence: 0,
    aiSuggestion: "Expired with no response after 14 days. Buyer may have sourced elsewhere or lost interest. Recommend a breakup email in 30 days — Yirgacheffe LOT-25-0001 was later sold to Blue Mountain at $7.10.",
    buyerNote: null, daysToExpiry: -15,
  },
  {
    id: "QU-2026-0008", lead: "Seoul Coffee Lab", leadId: "L-2026-00509", version: 1,
    status: "sent", incoterm: "CIF Busan", destination: "Busan, KR", currency: "USD",
    paymentTerms: "T/T 50/50", validUntil: "Jul 31", createdAt: "Jul 18", sentAt: "Jul 20", respondedAt: null,
    lines: [
      { lotId: "LOT-25-0003", origin: "Guji", process: "Washed", grade: "G1", weightKg: 4000, pricePerKg: 6.90, costPerKg: 5.10 },
    ],
    freight: 1950, insurance: 410, commissionPct: 2,
    aiDrafted: true, aiConfidence: 84,
    aiSuggestion: "Sent 4 days ago, no response yet. Buyer's typical response time is 3-5 days. Suggest waiting 2 more days before follow-up — follow-up too early signals desperation.",
    buyerNote: null, daysToExpiry: 6,
  },
];

const quoteStatusConfig: Record<Quote["status"], { label: string; bg: string; text: string; dot: string }> = {
  ai_draft: { label: "AI Draft", bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  pending_review: { label: "Needs Review", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  pending_approval: { label: "Awaiting Approval", bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-600" },
  sent: { label: "Sent", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  accepted: { label: "Accepted", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  rejected: { label: "Rejected", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  revised: { label: "Buyer Revised", bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  expired: { label: "Expired", bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
};

function quoteTotals(q: Quote) {
  const linesSubtotal = q.lines.reduce((s, l) => s + l.weightKg * l.pricePerKg, 0);
  const lineCost = q.lines.reduce((s, l) => s + l.weightKg * l.costPerKg, 0);
  const totalKg = q.lines.reduce((s, l) => s + l.weightKg, 0);
  const total = linesSubtotal + q.freight + q.insurance;
  const commission = total * (q.commissionPct / 100);
  const grossMargin = total - lineCost - q.freight - q.insurance - commission;
  const marginPct = total > 0 ? (grossMargin / total) * 100 : 0;
  return { linesSubtotal, lineCost, totalKg, total, commission, grossMargin, marginPct };
}

function marginTier(pct: number) {
  if (pct >= 20) return { label: "Healthy", text: "text-green-600", bg: "bg-green-50", bar: "bg-green-500" };
  if (pct >= 12) return { label: "Thin", text: "text-amber-600", bg: "bg-amber-50", bar: "bg-amber-500" };
  return { label: "Risky", text: "text-red-600", bg: "bg-red-50", bar: "bg-red-500" };
}

function NegotiationSimulator({ quote }: { quote: Quote }) {
  // Initial slider state = current quote prices
  const [prices, setPrices] = useState<number[]>(quote.lines.map(l => l.pricePerKg));

  // Reset when quote changes
  useEffect(() => {
    setPrices(quote.lines.map(l => l.pricePerKg));
  }, [quote.id]);

  // Compute simulated margin
  const linesSubtotal = quote.lines.reduce((s, l, i) => s + l.weightKg * prices[i], 0);
  const lineCost = quote.lines.reduce((s, l) => s + l.weightKg * l.costPerKg, 0);
  const total = linesSubtotal + quote.freight + quote.insurance;
  const commission = total * (quote.commissionPct / 100);
  const grossMargin = total - lineCost - quote.freight - quote.insurance - commission;
  const marginPct = total > 0 ? (grossMargin / total) * 100 : 0;
  const mt = marginTier(marginPct);

  // Original margin for delta comparison
  const origLines = quote.lines.reduce((s, l) => s + l.weightKg * l.pricePerKg, 0);
  const origTotal = origLines + quote.freight + quote.insurance;
  const origCommission = origTotal * (quote.commissionPct / 100);
  const origMargin = origTotal - lineCost - quote.freight - quote.insurance - origCommission;
  const origMarginPct = origTotal > 0 ? (origMargin / origTotal) * 100 : 0;
  const deltaPct = marginPct - origMarginPct;
  const deltaTotal = total - origTotal;

  // Per-line reference prices
  const lineRefs = quote.lines.map(l => {
    // Per-line margin benchmarks (commission-adjusted, ignoring fixed costs for simplicity)
    const floorPrice = l.costPerKg / (1 - quote.commissionPct / 100) * 1.12; // 12% margin floor
    const targetPrice = l.costPerKg / (1 - quote.commissionPct / 100) * 1.20; // 20% margin target
    const stretchPrice = l.costPerKg / (1 - quote.commissionPct / 100) * 1.25; // 25% margin stretch
    const breakEven = l.costPerKg / (1 - quote.commissionPct / 100); // 0% margin (covers cost + commission)
    return { floorPrice, targetPrice, stretchPrice, breakEven };
  });

  return (
    <div className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50/50 to-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-600" strokeWidth={1.5} />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Negotiation Simulator</span>
        </div>
        <button
          onClick={() => setPrices(quote.lines.map(l => l.pricePerKg))}
          className="text-[10px] text-gray-400 hover:text-gray-700 font-medium"
        >
          Reset
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
        Drag each lot&apos;s price to model a counter-offer. Margin updates live. <span className="text-amber-700 font-medium">Floor = 12%</span> · <span className="text-green-600 font-medium">Target = 20%</span> · <span className="text-emerald-600 font-medium">Stretch = 25%</span>
      </p>

      {/* Per-line sliders */}
      <div className="space-y-3 mb-4">
        {quote.lines.map((l, i) => {
          const ref = lineRefs[i];
          const sliderMin = ref.breakEven * 0.95; // slightly below break-even for visibility
          const sliderMax = ref.stretchPrice * 1.10;
          const val = prices[i];
          const floorPct = ((ref.floorPrice - sliderMin) / (sliderMax - sliderMin)) * 100;
          const targetPct = ((ref.targetPrice - sliderMin) / (sliderMax - sliderMin)) * 100;
          const stretchPct = ((ref.stretchPrice - sliderMin) / (sliderMax - sliderMin)) * 100;
          const origPct = ((l.pricePerKg - sliderMin) / (sliderMax - sliderMin)) * 100;
          const lineDelta = val - l.pricePerKg;
          return (
            <div key={i} className="rounded-md bg-white border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-semibold text-gray-900">{l.lotId}</span>
                  <span className="text-[10px] text-gray-400 ml-1.5">{l.origin} {l.process}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-gray-900">${val.toFixed(2)}</span>
                  <span className="text-[10px] text-gray-400">/kg</span>
                  {lineDelta !== 0 && (
                    <span className={cn("ml-1.5 text-[10px] font-medium", lineDelta < 0 ? "text-red-600" : "text-green-600")}>
                      {lineDelta > 0 ? "+" : ""}{lineDelta.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              {/* Slider */}
              <div className="relative h-6 flex items-center">
                {/* Track background zones */}
                <div className="absolute inset-x-0 h-1.5 rounded-full overflow-hidden flex">
                  <div className="bg-red-100" style={{ width: `${floorPct}%` }} />
                  <div className="bg-amber-100" style={{ width: `${targetPct - floorPct}%` }} />
                  <div className="bg-green-100" style={{ width: `${stretchPct - targetPct}%` }} />
                  <div className="bg-emerald-100" style={{ width: `${100 - stretchPct}%` }} />
                </div>
                {/* Reference markers */}
                <div className="absolute top-0 bottom-0 w-px bg-amber-500" style={{ left: `${floorPct}%` }} title={`Floor $${ref.floorPrice.toFixed(2)}`} />
                <div className="absolute top-0 bottom-0 w-px bg-green-500" style={{ left: `${targetPct}%` }} title={`Target $${ref.targetPrice.toFixed(2)}`} />
                <div className="absolute top-0 bottom-0 w-px bg-emerald-500" style={{ left: `${stretchPct}%` }} title={`Stretch $${ref.stretchPrice.toFixed(2)}`} />
                {/* Original price marker (triangle) */}
                <div className="absolute -top-1 w-0 h-0" style={{
                  left: `${origPct}%`,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "5px solid #4A3520",
                  transform: "translateX(-50%)",
                }} title={`Original $${l.pricePerKg.toFixed(2)}`} />
                {/* Native range input on top */}
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={0.01}
                  value={val}
                  onChange={(e) => {
                    const newPrices = [...prices];
                    newPrices[i] = parseFloat(e.target.value);
                    setPrices(newPrices);
                  }}
                  className="relative w-full appearance-none bg-transparent cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2
                    [&::-webkit-slider-thumb]:border-amber-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
                    [&::-webkit-slider-thumb]:-mt-1.5
                    [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-amber-500 [&::-moz-range-thumb]:cursor-grab"
                  style={{ height: "6px" }}
                />
              </div>
              {/* Reference labels */}
              <div className="flex justify-between text-[9px] text-gray-400 mt-1.5">
                <span>Break-even ${ref.breakEven.toFixed(2)}</span>
                <span className="text-amber-600">Floor ${ref.floorPrice.toFixed(2)}</span>
                <span className="text-green-600">Target ${ref.targetPrice.toFixed(2)}</span>
                <span className="text-emerald-600">Stretch ${ref.stretchPrice.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulated margin result */}
      <div className="rounded-md bg-white border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Simulated Margin</span>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-xl font-bold", mt.text)}>{marginPct.toFixed(1)}%</span>
            {deltaPct !== 0 && (
              <span className={cn("text-[11px] font-medium", deltaPct < 0 ? "text-red-600" : "text-green-600")}>
                {deltaPct > 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}pp
              </span>
            )}
          </div>
        </div>
        {/* Margin bar */}
        <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={cn("h-full transition-all", mt.bar)} style={{ width: `${Math.min(marginPct * 3, 100)}%` }} />
          <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: "60%" }} title="Target 20%" />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
          <div className="rounded bg-gray-50 px-2 py-1.5">
            <span className="text-gray-400 block">New Total</span>
            <span className="font-semibold text-gray-900">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            {deltaTotal !== 0 && (
              <span className={cn("block text-[10px]", deltaTotal < 0 ? "text-red-600" : "text-green-600")}>
                {deltaTotal > 0 ? "+" : "-"}${Math.abs(deltaTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          <div className="rounded bg-gray-50 px-2 py-1.5">
            <span className="text-gray-400 block">Gross Profit</span>
            <span className={cn("font-semibold", mt.text)}>${grossMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="rounded bg-gray-50 px-2 py-1.5">
            <span className="text-gray-400 block">Verdict</span>
            <span className={cn("font-semibold", mt.text)}>{mt.label}</span>
          </div>
        </div>
        {/* Action button */}
        <button className="w-full mt-3 rounded-lg bg-[#4A3520] px-4 py-2 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={Math.abs(deltaPct) < 0.01}>
          Generate V{quote.version + 1} at these prices
        </button>
      </div>
    </div>
  );
}

export function QuotesPage() {
  // ─── Live data from backend ───
  const [quotesData, setQuotesData] = useState<typeof mockQuotesData | null>(null);
  const [marketPrice, setMarketPrice] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quotes")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.quotes) && data.quotes.length > 0) {
          setQuotesData(data.quotes);
        } else {
          setQuotesData(mockQuotesData);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[QuotesPage] API fetch failed, using mock data:", err);
        setQuotesData(mockQuotesData);
      });
    // Fetch market prices
    fetch("/api/market-prices")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (!cancelled && data.ok) setMarketPrice(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [filter, setFilter] = useState("All");
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);

  // Loading state
  if (!quotesData) {
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

  const filters = ["All", "AI Drafts", "Needs Review", "Awaiting Approval", "Sent", "Accepted", "Rejected", "Expired"];

  const filterMap: Record<string, Quote["status"] | null> = {
    "All": null, "AI Drafts": "ai_draft", "Needs Review": "pending_review",
    "Awaiting Approval": "pending_approval", "Sent": "sent", "Accepted": "accepted",
    "Rejected": "rejected", "Expired": "expired",
  };

  const filtered = filterMap[filter] === null
    ? quotesData
    : quotesData.filter(q => q.status === filterMap[filter]);

  const stats = {
    total: quotesData.length,
    needsAction: quotesData.filter(q => q.status === "ai_draft" || q.status === "pending_review" || q.status === "pending_approval" || q.status === "revised").length,
    inMarket: quotesData.filter(q => q.status === "sent").length,
    accepted: quotesData.filter(q => q.status === "accepted").length,
    pipeline: quotesData.filter(q => ["pending_approval", "pending_review", "ai_draft", "sent", "revised"].includes(q.status)).reduce((s, q) => s + quoteTotals(q).total, 0),
    avgMargin: (() => {
      const actionable = quotesData.filter(q => ["pending_approval", "pending_review", "ai_draft", "sent", "revised"].includes(q.status));
      if (actionable.length === 0) return 0;
      return actionable.reduce((s, q) => s + quoteTotals(q).marginPct, 0) / actionable.length;
    })(),
  };

  const selected = quotesData.find(q => q.id === selectedQuote);
  const urgentQuotes = quotesData.filter(q => q.daysToExpiry !== null && q.daysToExpiry > 0 && q.daysToExpiry <= 7 && ["sent", "pending_approval", "revised"].includes(q.status));

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quotes</h1>
          <p className="text-sm text-gray-500 mt-1">Which quotes need approval?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Sparkles className="h-4 w-4" /> New Quote (AI Draft)
        </button>
      </div>

      {/* Market Price Ticker */}
      {marketPrice && (
        <div className={cn(
          "rounded-xl border p-4 mb-6 flex items-center justify-between",
          marketPrice.recommendations.margin_warning_level === "critical" ? "border-red-200 bg-red-50/50"
          : marketPrice.recommendations.margin_warning_level === "caution" ? "border-amber-200 bg-amber-50/50"
          : "border-green-200 bg-green-50/30"
        )}>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">ICE Coffee C</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-gray-900">{marketPrice.futures.current}<span className="text-xs font-normal text-gray-400">¢/lb</span></span>
                <span className={cn("text-sm font-semibold", marketPrice.futures.change >= 0 ? "text-green-600" : "text-red-600")}>
                  {marketPrice.futures.change >= 0 ? "▲" : "▼"} {Math.abs(marketPrice.futures.change)} ({marketPrice.futures.change_pct}%)
                </span>
              </div>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">USD/kg equiv.</p>
              <p className="text-xl font-bold text-gray-900">${marketPrice.fob_pricing.current_ice_usd_per_kg}<span className="text-xs font-normal text-gray-400">/kg</span></p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Yirgacheffe</p>
              <p className="text-xl font-bold text-[#4A3520]">${marketPrice.ethiopian_premiums.usd_per_kg.yirgacheffe}<span className="text-xs font-normal text-gray-400">/kg</span></p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">USD/ETB</p>
              <p className="text-xl font-bold text-gray-900">{marketPrice.exchange_rate.usd_to_etb}</p>
            </div>
          </div>
          <div className="text-right max-w-xs">
            <p className={cn("text-xs font-semibold", marketPrice.recommendations.margin_warning_level === "critical" ? "text-red-700" : marketPrice.recommendations.margin_warning_level === "caution" ? "text-amber-700" : "text-green-700")}>
              {marketPrice.recommendations.margin_warning_level === "critical" ? "⚠️ Critical" : marketPrice.recommendations.margin_warning_level === "caution" ? "⚡ Caution" : "✓ Normal"}
            </p>
            <p className="text-[11px] text-gray-500">{marketPrice.recommendations.recommendation.substring(0, 80)}…</p>
          </div>
        </div>
      )}

      {/* AI Insight Banner */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
            <Bot className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-indigo-700">AI Coach</span>
              <span className="text-xs text-indigo-400">·</span>
              <span className="text-xs text-indigo-500">{stats.needsAction} quotes need your action</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {urgentQuotes.length > 0 ? (
                <>You have <span className="font-semibold text-gray-900">{urgentQuotes.length} quote{urgentQuotes.length > 1 ? "s" : ""} expiring within 7 days</span>. Highest priority: <span className="font-semibold text-gray-900">{urgentQuotes.sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))[0].id}</span> ({urgentQuotes[0].daysToExpiry}d). Average margin across active quotes is <span className="font-semibold text-green-600">{stats.avgMargin.toFixed(1)}%</span> — above the 20% target.</>
              ) : (
                <>All active quotes are healthy. Average margin is <span className="font-semibold text-green-600">{stats.avgMargin.toFixed(1)}%</span>. Consider sending the next batch of follow-ups for sent quotes that haven&apos;t had a response in 4+ days.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Quotes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">{stats.needsAction} need action</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">In Market</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.inMarket}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Awaiting buyer response</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${(stats.pipeline / 1000).toFixed(1)}K</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Across actionable quotes</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Avg Margin</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn("text-2xl font-bold", stats.avgMargin >= 20 ? "text-green-600" : stats.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{stats.avgMargin.toFixed(1)}%</p>
            <span className="text-[11px] text-gray-400">target 20%</span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {filters.map((f) => {
          const count = f === "All" ? quotesData.length : quotesData.filter(q => q.status === filterMap[f]).length;
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

      {/* Quote list */}
      <div className="space-y-3">
        {filtered.map((q) => {
          const sc = quoteStatusConfig[q.status];
          const t = quoteTotals(q);
          const mt = marginTier(t.marginPct);
          const isUrgent = q.daysToExpiry !== null && q.daysToExpiry > 0 && q.daysToExpiry <= 7 && ["sent", "pending_approval", "revised"].includes(q.status);
          return (
            <div
              key={q.id}
              onClick={() => setSelectedQuote(q.id)}
              className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300"
            >
              <div className="flex items-start gap-4">
                {/* Status indicator */}
                <div className="flex flex-col items-center gap-2 pt-1">
                  <span className={cn("h-3 w-3 rounded-full", sc.dot)} />
                  <div className="w-px flex-1 bg-gray-100" style={{ minHeight: "40px" }} />
                </div>

                {/* Main */}
                <div className="flex-1 min-w-0">
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{q.id}</span>
                      {q.version > 1 && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">V{q.version}</span>}
                      <span className="text-sm text-gray-600">{q.lead}</span>
                      {q.aiDrafted && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                          <Sparkles className="h-2.5 w-2.5" /> AI {q.aiConfidence}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isUrgent && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                          <Clock className="h-2.5 w-2.5" /> {q.daysToExpiry}d left
                        </span>
                      )}
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  {/* Line items */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {q.lines.map((l, i) => (
                      <span key={i} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-xs text-gray-600">
                        {l.lotId} · {l.origin} {l.process} · {(l.weightKg / 1000).toFixed(1)}t @ ${l.pricePerKg.toFixed(2)}/kg
                      </span>
                    ))}
                  </div>

                  {/* Terms */}
                  <div className="flex items-center gap-6 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Incoterm:</span>
                      <span className="font-medium text-gray-700">{q.incoterm}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Total:</span>
                      <span className="font-bold text-gray-900">${t.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{(t.totalKg / 1000).toFixed(1)}t</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Margin:</span>
                      <span className={cn("font-bold", mt.text)}>{t.marginPct.toFixed(1)}%</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", mt.bg, mt.text)}>{mt.label}</span>
                    </div>
                    {q.daysToExpiry !== null && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                        <span className={cn(q.daysToExpiry < 0 ? "text-gray-400" : q.daysToExpiry <= 7 ? "text-red-600 font-medium" : "text-gray-500")}>
                          {q.daysToExpiry < 0 ? `Expired ${Math.abs(q.daysToExpiry)}d ago` : `${q.daysToExpiry}d to expiry`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Buyer note preview */}
                  {q.buyerNote && (
                    <div className="mt-2 rounded-lg bg-purple-50 px-3 py-2 flex items-start gap-2">
                      <span className="text-[10px] font-semibold text-purple-600 mt-0.5">BUYER:</span>
                      <p className="text-xs text-gray-700 flex-1 italic">&ldquo;{q.buyerNote}&rdquo;</p>
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  {q.status === "ai_draft" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">Review Draft</button>
                  )}
                  {q.status === "pending_review" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors">Send for Approval</button>
                  )}
                  {q.status === "pending_approval" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors">Approve & Send</button>
                  )}
                  {q.status === "sent" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">View</button>
                  )}
                  {q.status === "revised" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors">Respond to Counter</button>
                  )}
                  {q.status === "accepted" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors">View Contract</button>
                  )}
                  {q.status === "rejected" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Reason</button>
                  )}
                  {q.status === "expired" && (
                    <button onClick={() => setSelectedQuote(q.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Renew</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quote Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedQuote(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[480px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-white">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{selected.id}{selected.version > 1 && ` · V${selected.version}`}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selected.lead} · {selected.leadId}</p>
              </div>
              <button onClick={() => setSelectedQuote(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status + meta */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", quoteStatusConfig[selected.status].bg, quoteStatusConfig[selected.status].text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", quoteStatusConfig[selected.status].dot)} />
                    {quoteStatusConfig[selected.status].label}
                  </span>
                  {selected.aiDrafted && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      <Sparkles className="h-3 w-3" /> AI Drafted · {selected.aiConfidence}% confidence
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-gray-400">Created</span><br /><span className="font-medium text-gray-700">{selected.createdAt}</span></div>
                  <div><span className="text-gray-400">Valid until</span><br /><span className="font-medium text-gray-700">{selected.validUntil}</span></div>
                  {selected.sentAt && <div><span className="text-gray-400">Sent</span><br /><span className="font-medium text-gray-700">{selected.sentAt}</span></div>}
                  {selected.respondedAt && <div><span className="text-gray-400">Buyer responded</span><br /><span className="font-medium text-gray-700">{selected.respondedAt}</span></div>}
                </div>
              </div>

              {/* Shipment terms */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Incoterm</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.incoterm}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Destination</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.destination}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Payment Terms</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.paymentTerms}</p>
                </div>
              </div>

              {/* Line items */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Line Items</p>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Lot</th>
                        <th className="px-3 py-2 text-left font-medium">Origin</th>
                        <th className="px-3 py-2 text-right font-medium">Kg</th>
                        <th className="px-3 py-2 text-right font-medium">$/kg</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((l, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium text-gray-900">{l.lotId}</td>
                          <td className="px-3 py-2 text-gray-600">{l.origin} {l.process} {l.grade}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{l.weightKg.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-700">${l.pricePerKg.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">${(l.weightKg * l.pricePerKg).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pricing breakdown */}
              {(() => {
                const t = quoteTotals(selected);
                return (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Pricing Breakdown</p>
                    <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Coffee subtotal</span><span className="font-medium text-gray-900">${t.linesSubtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Freight</span><span className="font-medium text-gray-700">${selected.freight.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Insurance</span><span className="font-medium text-gray-700">${selected.insurance.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Commission ({selected.commissionPct}%)</span><span className="font-medium text-gray-700">-${t.commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between"><span className="font-semibold text-gray-900">Quote Total</span><span className="font-bold text-gray-900">${t.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                    </div>

                    {/* Margin bar */}
                    <div className="mt-3 rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Margin Analysis</span>
                        <span className={cn("text-sm font-bold", marginTier(t.marginPct).text)}>{t.marginPct.toFixed(1)}%</span>
                      </div>
                      <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={cn("h-full", marginTier(t.marginPct).bar)} style={{ width: `${Math.min(t.marginPct * 3, 100)}%` }} />
                        {/* 20% target marker */}
                        <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: "60%" }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>0%</span>
                        <span>Target 20%</span>
                        <span>33%+</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div className="rounded bg-gray-50 px-2 py-1.5"><span className="text-gray-400">Cost basis</span><br /><span className="font-medium text-gray-700">${t.lineCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                        <div className="rounded bg-gray-50 px-2 py-1.5"><span className="text-gray-400">Gross profit</span><br /><span className={cn("font-medium", marginTier(t.marginPct).text)}>${t.grossMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Negotiation Simulator — only show for actionable quotes */}
              {["ai_draft", "pending_review", "pending_approval", "sent", "revised"].includes(selected.status) && (
                <NegotiationSimulator quote={selected} />
              )}

              {/* Buyer note */}
              {selected.buyerNote && (
                <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
                  <p className="text-xs font-semibold text-purple-700 mb-1">BUYER NOTE</p>
                  <p className="text-sm text-gray-700 italic">&ldquo;{selected.buyerNote}&rdquo;</p>
                </div>
              )}

              {/* AI Suggestion */}
              <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
                  <span className="text-xs font-semibold text-indigo-600">AI SUGGESTION</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{selected.aiSuggestion}</p>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.status === "ai_draft" && (
                  <>
                    <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Send for Approval</button>
                    <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Edit Line Items</button>
                  </>
                )}
                {selected.status === "pending_review" && (
                  <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Submit for Admin Approval</button>
                )}
                {selected.status === "pending_approval" && (
                  <>
                    <button className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">Approve & Send to Buyer</button>
                    <button className="w-full rounded-lg border border-red-200 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors">Reject Quote</button>
                  </>
                )}
                {selected.status === "sent" && (
                  <>
                    <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Send Follow-up</button>
                    <button className="w-full rounded-lg border border-amber-200 text-amber-700 px-4 py-2.5 text-sm font-medium hover:bg-amber-50 transition-colors">Revise Quote (V{selected.version + 1})</button>
                  </>
                )}
                {selected.status === "revised" && (
                  <>
                    <button className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">Accept Counter & Send</button>
                    <button className="w-full rounded-lg border border-amber-200 text-amber-700 px-4 py-2.5 text-sm font-medium hover:bg-amber-50 transition-colors">Counter at Midpoint</button>
                    <button className="w-full rounded-lg border border-red-200 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors">Decline Counter</button>
                  </>
                )}
                {selected.status === "accepted" && (
                  <button className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">Generate Contract</button>
                )}
                {selected.status === "rejected" && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Send Substitute Quote</button>
                )}
                {selected.status === "expired" && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Renew Quote (V{selected.version + 1})</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

