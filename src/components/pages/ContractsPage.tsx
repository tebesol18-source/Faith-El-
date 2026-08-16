"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, Clock, Coffee, DollarSign, FileSignature, Filter, Plus, Send, Ship, Sparkles, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-client";
import type { Contract, ContractStatus, Insight, PaymentMilestone, Seller, Shipment } from "@/lib/types";




const contractStatusConfig: Record<ContractStatus, { label: string; bg: string; text: string; dot: string; action?: string }> = {
  draft: { label: "Draft", bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400", action: "Send for Signature" },
  pending_buyer_sig: { label: "Awaiting Buyer", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", action: "Send Reminder" },
  pending_seller_sig: { label: "Needs Your Signature", bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-600", action: "Sign Now" },
  executed: { label: "Executed", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", action: "View" },
  in_progress: { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", action: "View Shipment" },
  completed: { label: "Completed", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", action: "View History" },
  expired: { label: "Expired", bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", action: "Renew" },
  cancelled: { label: "Cancelled", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", action: "View" },
};

const mockContractsData: Contract[] = [];

function ContractCard({ contract, onClick }: { contract: Contract; onClick: () => void }) {
  const sc = contractStatusConfig[contract.status];
  const paidAmount = contract.paymentSchedule.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalDue = contract.paymentSchedule.reduce((s, p) => s + p.amount, 0);
  const paidPct = totalDue > 0 ? (paidAmount / totalDue) * 100 : 0;
  const isUrgent = contract.status === "pending_buyer_sig" || contract.status === "pending_seller_sig";

  return (
    <div
      onClick={onClick}
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
          {/* Top row */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">{contract.id}</span>
              <span className="text-sm text-gray-600">{contract.flag} {contract.buyer}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">from {contract.quoteId}</span>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
              {sc.label}
            </span>
          </div>

          {/* Lots */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {contract.lots.map((l, i) => (
              <span key={i} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-xs text-gray-600">
                {l.lotId} · {l.origin} {l.process} · {(l.weightKg / 1000).toFixed(1)}t @ ${l.pricePerKg.toFixed(2)}/kg
              </span>
            ))}
          </div>

          {/* Key terms */}
          <div className="flex items-center gap-6 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Value:</span>
              <span className="font-bold text-gray-900">${contract.totalValue.toLocaleString()}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{(contract.weightKg / 1000).toFixed(1)}t</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Incoterm:</span>
              <span className="font-medium text-gray-700">{contract.incoterm}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Margin:</span>
              <span className={cn("font-bold", contract.marginPct >= 20 ? "text-green-600" : contract.marginPct >= 12 ? "text-amber-600" : "text-red-600")}>{contract.marginPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileSignature className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
              <span className="text-gray-500">
                {contract.buyerSigned && contract.sellerSigned ? `Both signed ${contract.executedDate}`
                : contract.buyerSigned ? `Buyer signed ${contract.buyerSignedDate}, awaiting you`
                : contract.sellerSigned ? `You signed ${contract.sellerSignedDate}, awaiting buyer`
                : "Awaiting both signatures"}
              </span>
            </div>
          </div>

          {/* Payment progress + shipment strip */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 text-[11px]">
            {contract.paymentSchedule.length > 0 && (
              <>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3 text-gray-400" strokeWidth={1.5} />
                  <span className="text-gray-500">Payment</span>
                  <span className={cn("font-medium", paidPct === 100 ? "text-green-600" : paidPct > 0 ? "text-amber-600" : "text-gray-700")}>
                    {paidPct === 100 ? "Paid in full" : paidPct > 0 ? `${paidPct.toFixed(0)}% received` : "Awaiting payment"}
                  </span>
                </div>
                <div className="text-gray-300">·</div>
              </>
            )}
            {contract.shipmentId ? (
              <div className="flex items-center gap-1.5">
                <Ship className="h-3 w-3 text-blue-500" strokeWidth={1.5} />
                <span className="text-gray-500">Shipment</span>
                <span className="font-medium text-blue-600">{contract.shipmentId}</span>
                <span className="text-gray-400">· {contract.shipmentStatus}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-gray-400" strokeWidth={1.5} />
                <span className="text-gray-500">Valid until {contract.validUntil}</span>
              </div>
            )}
          </div>

          {/* AI insight for pending contracts */}
          {contract.notes && isUrgent && (
            <div className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 flex items-start gap-2">
              <Sparkles className="h-3 w-3 text-indigo-500 mt-0.5 shrink-0" strokeWidth={1.5} />
              <p className="text-xs text-gray-700 italic">{contract.notes}</p>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onClick}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              contract.status === "pending_seller_sig" ? "bg-[#4A3520] text-white hover:bg-[#6B4E33]"
              : contract.status === "pending_buyer_sig" ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : contract.status === "draft" ? "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {sc.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContractDetailDrawer({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const sc = contractStatusConfig[contract.status];
  const paidAmount = contract.paymentSchedule.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-[520px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{contract.id}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{contract.flag} {contract.buyer} · {contract.buyerCountry}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
              {sc.label}
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">From quote {contract.quoteId}</span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Signature status — the key action for pending contracts */}
          {(contract.status === "pending_buyer_sig" || contract.status === "pending_seller_sig" || contract.status === "draft") && (
            <div className={cn("rounded-lg p-4 border", contract.status === "pending_seller_sig" ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-gray-50")}>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Signature Status</p>
              <div className="grid grid-cols-2 gap-3">
                <div className={cn("rounded-lg p-3 border-2", contract.sellerSigned ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Seller</span>
                    {contract.sellerSigned ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Clock className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{contract.seller}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{contract.sellerContact}</p>
                  {contract.sellerSigned ? (
                    <p className="text-[10px] text-green-600 font-medium mt-1">Signed {contract.sellerSignedDate}</p>
                  ) : (
                    <p className="text-[10px] text-amber-600 font-medium mt-1">Awaiting your signature</p>
                  )}
                </div>
                <div className={cn("rounded-lg p-3 border-2", contract.buyerSigned ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Buyer</span>
                    {contract.buyerSigned ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Clock className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{contract.buyer}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{contract.buyerContact}</p>
                  {contract.buyerSigned ? (
                    <p className="text-[10px] text-green-600 font-medium mt-1">Signed {contract.buyerSignedDate}</p>
                  ) : (
                    <p className="text-[10px] text-amber-600 font-medium mt-1">Awaiting buyer signature</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contract terms */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Contract Terms</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Value</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">${contract.totalValue.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{contract.currency}</span></p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Weight</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{(contract.weightKg / 1000).toFixed(1)}t <span className="text-[10px] font-normal text-gray-400">{contract.weightKg.toLocaleString()} kg</span></p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Incoterm</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.incoterm}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Payment Terms</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.paymentTerms}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Valid From</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.validFrom}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Valid Until</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{contract.validUntil}</p>
              </div>
            </div>
          </div>

          {/* Margin analysis */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Margin</span>
              <span className={cn("text-sm font-bold", contract.marginPct >= 20 ? "text-green-600" : contract.marginPct >= 12 ? "text-amber-600" : "text-red-600")}>{contract.marginPct.toFixed(1)}%</span>
            </div>
            <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={cn("h-full", contract.marginPct >= 20 ? "bg-green-500" : contract.marginPct >= 12 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(contract.marginPct * 3, 100)}%` }} />
              <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: "60%" }} title="Target 20%" />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0%</span>
              <span>Target 20%</span>
              <span>33%+</span>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
              <span className="text-gray-500">Agent commission ({contract.commissionPct}%)</span>
              <span className="font-medium text-gray-700">${(contract.totalValue * contract.commissionPct / 100).toLocaleString()} <span className="text-gray-400">via {contract.agent}</span></span>
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Coffee Lots</p>
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
                  {contract.lots.map((l, i) => (
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

          {/* Payment schedule */}
          {contract.paymentSchedule.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Payment Schedule</p>
              <div className="space-y-2">
                {contract.paymentSchedule.map((p, i) => {
                  const payConfig: Record<string, { bg: string; text: string; label: string }> = {
                    paid: { bg: "bg-green-50", text: "text-green-700", label: `Paid ${p.paidDate}` },
                    due: { bg: "bg-amber-50", text: "text-amber-700", label: `Due ${p.dueDate}` },
                    late: { bg: "bg-red-50", text: "text-red-700", label: `Late — was due ${p.dueDate}` },
                    pending: { bg: "bg-gray-50", text: "text-gray-600", label: p.dueDate ? `Due ${p.dueDate}` : "TBD" },
                  };
                  const pc = payConfig[p.status];
                  return (
                    <div key={i} className={cn("rounded-lg border p-3 flex items-center justify-between", pc.bg, "border-gray-200")}>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.label}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{p.pct}% of total · {pc.label}</p>
                      </div>
                      <p className={cn("text-sm font-bold", pc.text)}>${p.amount.toLocaleString()}</p>
                    </div>
                  );
                })}
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Received</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">of ${contract.totalValue.toLocaleString()} contract value</p>
                  </div>
                  <p className={cn("text-sm font-bold", paidAmount === contract.totalValue ? "text-green-600" : paidAmount > 0 ? "text-amber-600" : "text-gray-700")}>
                    ${paidAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Linked shipment */}
          {contract.shipmentId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">Linked Shipment</p>
                  <p className="text-sm font-bold text-gray-900">{contract.shipmentId}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Status: {contract.shipmentStatus}</p>
                </div>
                <button className="text-xs font-medium text-[#4A3520] hover:underline shrink-0">View in Shipments →</button>
              </div>
            </div>
          )}

          {/* AI Notes */}
          {contract.notes && (
            <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
                <span className="text-xs font-semibold text-indigo-600">AI NOTE</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{contract.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            {contract.status === "draft" && (
              <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Send Contract for Signatures</button>
            )}
            {contract.status === "pending_seller_sig" && (
              <>
                <button className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">Sign Contract (E-Signature)</button>
                <button className="w-full rounded-lg border border-red-200 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors">Decline to Sign</button>
              </>
            )}
            {contract.status === "pending_buyer_sig" && (
              <>
                <button className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">Send Reminder to Buyer</button>
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Contract PDF</button>
              </>
            )}
            {contract.status === "executed" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Signed Contract</button>
            )}
            {contract.status === "in_progress" && contract.shipmentId && (
              <button className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">View Shipment {contract.shipmentId}</button>
            )}
            {contract.status === "completed" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Final Documents</button>
            )}
            {contract.status === "cancelled" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Cancellation Reason</button>
            )}
            {contract.status === "expired" && (
              <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Renew Contract</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContractsPage() {
  const [filter, setFilter] = useState("All");
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const filters = ["All", "Needs Signature", "Executed", "In Progress", "Completed", "Cancelled"];

  // ─── Live data from backend ───
  const [contractsData, setContractsData] = useState<Contract[] | null>(null);

  // ─── Create Contract modal state ───
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formLeadId, setFormLeadId] = useState("");
  const [formTotalVolumeBags, setFormTotalVolumeBags] = useState("");
  const [formTotalValue, setFormTotalValue] = useState("");
  const [formIncoterm, setFormIncoterm] = useState("FOB");
  const [formCurrency, setFormCurrency] = useState("USD");
  const [formShipmentWindowStart, setFormShipmentWindowStart] = useState("");
  const [formShipmentWindowEnd, setFormShipmentWindowEnd] = useState("");
  const [formPaymentTerms, setFormPaymentTerms] = useState("");
  const [leadsForSelect, setLeadsForSelect] = useState<any[]>([]);

  // Fetch leads list when modal opens
  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    apiFetch("/api/leads")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.leads)) setLeadsForSelect(data.leads);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showCreate]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contracts")
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.contracts) && data.contracts.length > 0) {
          setContractsData(data.contracts);
        } else {
          setContractsData([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[ContractsPage] API fetch failed, using mock data:", err);
        setContractsData([]);
      });
    return () => { cancelled = true; };
  }, []);

  const filterMap: Record<string, (c: Contract) => boolean> = {
    "All": () => true,
    "Needs Signature": (c) => c.status === "pending_buyer_sig" || c.status === "pending_seller_sig" || c.status === "draft",
    "Executed": (c) => c.status === "executed",
    "In Progress": (c) => c.status === "in_progress",
    "Completed": (c) => c.status === "completed",
    "Cancelled": (c) => c.status === "cancelled" || c.status === "expired",
  };

  // Loading state
  if (!contractsData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contracts</h1>
            <p className="text-sm text-gray-500 mt-1">Which contracts need signing?</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading contracts from database…</p>
        </div>
      </main>
    );
  }

  const filtered = contractsData.filter(filterMap[filter]);

  const stats = {
    total: contractsData.length,
    needsAction: contractsData.filter(c => c.status === "pending_buyer_sig" || c.status === "pending_seller_sig" || c.status === "draft").length,
    active: contractsData.filter(c => c.status === "executed" || c.status === "in_progress").length,
    completed: contractsData.filter(c => c.status === "completed").length,
    totalValue: contractsData.filter(c => c.status !== "cancelled" && c.status !== "expired").reduce((s, c) => s + c.totalValue, 0),
    avgMargin: (() => {
      const actionable = contractsData.filter(c => c.status !== "cancelled" && c.status !== "expired");
      return actionable.length > 0 ? actionable.reduce((s, c) => s + c.marginPct, 0) / actionable.length : 0;
    })(),
    awaitingYourSig: contractsData.filter(c => c.status === "pending_seller_sig").length,
    awaitingBuyerSig: contractsData.filter(c => c.status === "pending_buyer_sig").length,
  };

  const selected = contractsData.find(c => c.id === selectedContract);

  // ─── Refetch contracts list ───
  const refetchContracts = () => {
    apiFetch("/api/contracts")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok && Array.isArray(data.contracts)) setContractsData(data.contracts);
        else setContractsData([]);
      })
      .catch(() => setContractsData([]));
  };

  // ─── Create Contract handler ───
  const handleCreate = () => {
    setCreateError(null);
    if (!formLeadId.trim()) {
      setCreateError("Please select a lead.");
      return;
    }
    if (formTotalVolumeBags === "" || formTotalValue === "") {
      setCreateError("Total volume (bags) and total value are required.");
      return;
    }
    if (!formShipmentWindowStart.trim() || !formShipmentWindowEnd.trim()) {
      setCreateError("Shipment window start and end dates are required.");
      return;
    }
    if (!formPaymentTerms.trim()) {
      setCreateError("Payment terms are required.");
      return;
    }
    setCreating(true);
    apiFetch("/api/contracts", {
      method: "POST",
      body: JSON.stringify({
        leadId: formLeadId.trim(),
        totalVolumeBags: Number(formTotalVolumeBags),
        totalValue: Number(formTotalValue),
        incoterm: formIncoterm,
        currency: formCurrency.trim() || "USD",
        shipmentWindowStart: formShipmentWindowStart.trim(),
        shipmentWindowEnd: formShipmentWindowEnd.trim(),
        paymentTerms: formPaymentTerms.trim(),
      }),
    })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok) {
          setShowCreate(false);
          setFormLeadId(""); setFormTotalVolumeBags(""); setFormTotalValue("");
          setFormIncoterm("FOB"); setFormCurrency("USD");
          setFormShipmentWindowStart(""); setFormShipmentWindowEnd("");
          setFormPaymentTerms("");
          refetchContracts();
        } else {
          setCreateError(data.error || "Failed to create contract.");
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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contracts</h1>
          <p className="text-sm text-gray-500 mt-1">Which contracts need signing?</p>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(null); }} className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Plus className="h-4 w-4" /> New Contract
        </button>
      </div>

      {/* AI Insight Banner — only shows if there's something actionable */}
      {stats.needsAction > 0 && (
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <FileSignature className="h-5 w-5 text-amber-600" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-amber-700">{stats.needsAction} contracts need attention</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {stats.awaitingYourSig > 0 && <><span className="font-semibold text-amber-700">{stats.awaitingYourSig} contract{stats.awaitingYourSig > 1 ? "s" : ""} awaiting your signature</span> — Hashimoto Coffee (CT-2026-0005) has been waiting 2 days. Margin compressed to 14.8% but Limu G1 is scarce. </>}
                {stats.awaitingBuyerSig > 0 && <>{stats.awaitingBuyerSig} awaiting buyer — Marcus Coffee (CT-2026-0004) sent yesterday, typical response is 2-3 days. </>}
                Aurora Imports (CT-2026-0007) is a draft — verify credit before sending.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Needs Action</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.needsAction}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.awaitingYourSig} yours · {stats.awaitingBuyerSig} buyer's</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.active}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">executed or in progress</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${(stats.totalValue / 1000).toFixed(0)}K</p>
          <p className="text-[11px] text-gray-400 mt-0.5">across {stats.total - 2} active contracts</p>
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
      <div className="flex gap-1 mb-4">
        {filters.map((f) => {
          const count = contractsData.filter(filterMap[f]).length;
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

      {/* Contract cards */}
      <div className="space-y-3">
        {filtered.map((c) => (
          <ContractCard key={c.id} contract={c} onClick={() => setSelectedContract(c.id)} />
        ))}
      </div>

      {/* Create Contract Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold">Create Contract</h2>
              <button onClick={() => !creating && setShowCreate(false)} className="text-white/60 hover:text-white p-1">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Lead *</label>
                <select value={formLeadId} onChange={(e) => setFormLeadId(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10">
                  <option value="">— Select a lead —</option>
                  {leadsForSelect.map((l) => (
                    <option key={l.id} value={l.id}>{l.id} · {l.company}</option>
                  ))}
                </select>
                {leadsForSelect.length === 0 && <p className="text-[11px] text-gray-400 mt-1">No leads available. Create leads first.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Total Volume (bags) *</label>
                  <input type="number" value={formTotalVolumeBags} onChange={(e) => setFormTotalVolumeBags(e.target.value)} disabled={creating} placeholder="500" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Total Value (USD) *</label>
                  <input type="number" step="0.01" value={formTotalValue} onChange={(e) => setFormTotalValue(e.target.value)} disabled={creating} placeholder="125000.00" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Incoterm *</label>
                  <select value={formIncoterm} onChange={(e) => setFormIncoterm(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10">
                    <option>FOB</option>
                    <option>CIF</option>
                    <option>EXW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Currency</label>
                  <input type="text" value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} disabled={creating} placeholder="USD" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Shipment Window Start *</label>
                  <input type="date" value={formShipmentWindowStart} onChange={(e) => setFormShipmentWindowStart(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Shipment Window End *</label>
                  <input type="date" value={formShipmentWindowEnd} onChange={(e) => setFormShipmentWindowEnd(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Payment Terms *</label>
                <input type="text" value={formPaymentTerms} onChange={(e) => setFormPaymentTerms(e.target.value)} disabled={creating} placeholder="e.g. 30% deposit, 70% on B/L" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
              </div>
              {createError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{createError}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => !creating && setShowCreate(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 rounded-lg bg-[#4A3520] px-4 py-2 text-sm text-white disabled:opacity-60">
                  {creating ? "Creating..." : "Create Contract"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selected && (
        <ContractDetailDrawer contract={selected} onClose={() => setSelectedContract(null)} />
      )}
    </main>
  );
}

