"use client";

import { useState, useEffect } from "react";
import {
  Bot, CheckCircle2, FileSignature, LogOut, Mail, Menu, Send, ShieldCheck, Sparkles, Users, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract, Priority, Quote, Seller } from "@/lib/types";
import { apiFetch } from "@/lib/auth-client";

export function TopHeader({ userRole, onLogout }: { userRole: "admin" | "seller"; onLogout: () => void }) {
  const [showApprovals, setShowApprovals] = useState(false);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  const fetchApprovals = () => {
    apiFetch("/api/approvals")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (data.ok) setPendingActions(data.actions || []); })
      .catch(() => {});
  };

  useEffect(() => {
    if (userRole === "seller") {
      fetchApprovals();
      const interval = setInterval(fetchApprovals, 15000);
      return () => clearInterval(interval);
    }
  }, [userRole]);

  const handleApprove = (id: number) => {
    setActionLoading(id);
    apiFetch("/api/approvals", { method: "POST", body: JSON.stringify({ id, action: "approve", reviewer: "seller" }) })
      .then(() => { fetchApprovals(); })
      .finally(() => setActionLoading(null));
  };

  const handleReject = (id: number) => {
    setActionLoading(id);
    apiFetch("/api/approvals", { method: "POST", body: JSON.stringify({
      id, action: "reject", reviewer: "seller",
      feedback_reason: rejectReason || "other",
      seller_notes: rejectNotes || undefined,
    }) })
      .then(() => { fetchApprovals(); setRejectingId(null); setRejectReason(""); setRejectNotes(""); })
      .finally(() => setActionLoading(null));
  };

  const riskConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
    low: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", label: "Low Risk" },
    medium: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Medium Risk" },
    high: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "High Risk" },
  };

  const actionLabels: Record<string, string> = {
    send_email: "Send Email to Buyer",
    create_contract: "Create Contract",
    dispatch_sample: "Dispatch Sample",
    send_follow_up: "Send Follow-up",
    send_breakup_email: "Send Breakup Email",
    create_quote: "Create Quote",
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-8 backdrop-blur-sm">
        <button className="p-2 rounded-lg hover:bg-gray-100"><Menu className="h-5 w-5 text-gray-600" strokeWidth={1.5} /></button>
        <div className="flex items-center gap-3">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold",
            userRole === "admin" ? "bg-[#4A3520] text-white" : "bg-blue-50 text-blue-700"
          )}>
            {userRole === "admin" ? <ShieldCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {userRole === "admin" ? "Admin" : "Seller"}
          </span>
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50 transition-colors">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-600">4</span>
            <span className="text-sm font-medium text-gray-700">High Priority</span>
          </button>
          {/* AI Suggestions button — only for sellers, shows real pending count */}
          {userRole === "seller" && (
            <button
              onClick={() => { setShowApprovals(true); fetchApprovals(); }}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                pendingActions.length > 0
                  ? "border-amber-300 bg-amber-50 hover:bg-amber-100 animate-pulse"
                  : "border-indigo-100 bg-indigo-50 hover:bg-indigo-100"
              )}
            >
              <Bot className="h-4 w-4 text-indigo-600" strokeWidth={1.5} />
              <span className="text-sm font-medium text-indigo-700">
                {pendingActions.length > 0 ? `${pendingActions.length} Pending Approval` : "AI Suggestions"}
              </span>
              {pendingActions.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">{pendingActions.length}</span>
              )}
            </button>
          )}
          <button onClick={onLogout} title="Sign out" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-red-600 transition-colors">
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] flex items-center justify-center text-white font-semibold text-sm">AS</div>
        </div>
      </header>

      {/* Seller Approval Modal — where sellers approve/reject AI-drafted actions */}
      {showApprovals && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setShowApprovals(false)}>
          <div className="w-[560px] max-h-[80vh] rounded-xl bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                  <Bot className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">AI Agent Actions — Your Review</h3>
                  <p className="text-xs text-gray-500">{pendingActions.length} action(s) drafted by AI agents, awaiting your approval</p>
                </div>
              </div>
              <button onClick={() => setShowApprovals(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
            </div>

            {/* Body — scrollable list of pending actions */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {pendingActions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-green-100 mb-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium text-gray-700">All caught up!</p>
                  <p className="text-xs text-gray-400 mt-1">No pending AI actions. Agents are working — check back later.</p>
                </div>
              ) : (
                pendingActions.map((a) => {
                  const rc = riskConfig[a.riskLevel] || riskConfig.medium;
                  const p = a.payload || {};
                  const isEmail = a.actionType === "send_email" && p.email_subject;
                  const isContract = a.actionType === "create_contract" && p.contract_terms;
                  return (
                    <div key={a.id} className={cn("rounded-lg border p-4", rc.border, rc.bg)}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white", rc.text)}>
                          <Bot className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", rc.bg, rc.text)}>{rc.label}</span>
                            <span className="text-[10px] text-gray-400">·</span>
                            <span className="text-[10px] font-medium text-gray-500">{a.agentId}</span>
                            <span className="text-[10px] text-gray-400">·</span>
                            <span className="text-[10px] text-gray-500">{actionLabels[a.actionType] || a.actionType}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-900">{a.description}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Submitted {a.submittedAt}</p>
                        </div>
                      </div>

                      {/* Email draft preview */}
                      {isEmail && (
                        <div className="mb-3 rounded-lg bg-white border border-gray-200 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                            <Mail className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                            <span className="text-[11px] font-semibold text-gray-500">EMAIL DRAFT</span>
                            <span className="text-[10px] text-gray-400">— review before sending</span>
                          </div>
                          <div className="px-3 py-2 space-y-1.5">
                            <div className="flex gap-2 text-xs">
                              <span className="text-gray-400 shrink-0 w-12">To:</span>
                              <span className="text-gray-700 font-mono">{p.email_to}</span>
                            </div>
                            <div className="flex gap-2 text-xs">
                              <span className="text-gray-400 shrink-0 w-12">From:</span>
                              <span className="text-gray-700 font-mono">{p.email_from}</span>
                            </div>
                            <div className="flex gap-2 text-xs">
                              <span className="text-gray-400 shrink-0 w-12">Subject:</span>
                              <span className="text-gray-900 font-semibold">{p.email_subject}</span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">{p.email_body}</pre>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Reasoning panel — "Why I recommended this" */}
                      {p.reasoning && (
                        <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.5} />
                            <span className="text-[11px] font-semibold text-indigo-700">WHY I RECOMMENDED THIS</span>
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                              {p.reasoning.confidence}% confidence
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                            {p.reasoning.buyer_tier && (
                              <div><span className="text-gray-400">Buyer Tier:</span> <span className="font-medium text-gray-700">{p.reasoning.buyer_tier}</span></div>
                            )}
                            {p.reasoning.buyer_country && (
                              <div><span className="text-gray-400">Country:</span> <span className="font-medium text-gray-700">{p.reasoning.buyer_country}</span></div>
                            )}
                            {p.reasoning.recommended_vp && (
                              <div><span className="text-gray-400">Strategy:</span> <span className="font-medium text-gray-700">{p.reasoning.recommended_vp}</span></div>
                            )}
                            {p.reasoning.language_detected && (
                              <div><span className="text-gray-400">Language:</span> <span className="font-medium text-gray-700">{p.reasoning.language_detected}</span></div>
                            )}
                            {p.reasoning.available_lots_considered !== undefined && (
                              <div><span className="text-gray-400">Lots Considered:</span> <span className="font-medium text-gray-700">{p.reasoning.available_lots_considered}</span></div>
                            )}
                            {p.reasoning.lots_selected !== undefined && (
                              <div><span className="text-gray-400">Lots Selected:</span> <span className="font-medium text-gray-700">{p.reasoning.lots_selected}</span></div>
                            )}
                          </div>
                          {/* Rationale lines */}
                          <div className="space-y-1 text-[11px] text-gray-600">
                            {p.reasoning.vp_rationale && (
                              <div className="flex gap-1.5"><span className="text-indigo-400 shrink-0">•</span><span>{p.reasoning.vp_rationale}</span></div>
                            )}
                            {p.reasoning.lot_selection_rationale && (
                              <div className="flex gap-1.5"><span className="text-indigo-400 shrink-0">•</span><span>{p.reasoning.lot_selection_rationale}</span></div>
                            )}
                            {p.reasoning.cta_rationale && (
                              <div className="flex gap-1.5"><span className="text-indigo-400 shrink-0">•</span><span>{p.reasoning.cta_rationale}</span></div>
                            )}
                            {p.reasoning.incoterm_rationale && (
                              <div className="flex gap-1.5"><span className="text-indigo-400 shrink-0">•</span><span>{p.reasoning.incoterm_rationale}</span></div>
                            )}
                            {p.reasoning.price_rationale && (
                              <div className="flex gap-1.5"><span className="text-indigo-400 shrink-0">•</span><span>{p.reasoning.price_rationale}</span></div>
                            )}
                            {p.reasoning.payment_rationale && (
                              <div className="flex gap-1.5"><span className="text-indigo-400 shrink-0">•</span><span>{p.reasoning.payment_rationale}</span></div>
                            )}
                            {p.reasoning.volume_rationale && (
                              <div className="flex gap-1.5"><span className="text-indigo-400 shrink-0">•</span><span>{p.reasoning.volume_rationale}</span></div>
                            )}
                          </div>
                          {/* Recommended lots */}
                          {p.reasoning.top_lots_recommended && p.reasoning.top_lots_recommended.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-indigo-100">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Recommended Lots</p>
                              <div className="space-y-0.5">
                                {p.reasoning.top_lots_recommended.map((lot: any, i: number) => (
                                  <div key={i} className="text-[11px] text-gray-600 flex justify-between">
                                    <span>{lot.lot_id}: {lot.region} {lot.process}</span>
                                    <span className="text-gray-400">score {lot.cupping_score} · {lot.stock} bags</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Confidence factors */}
                          {p.reasoning.confidence_factors && p.reasoning.confidence_factors.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-indigo-100">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Confidence Factors</p>
                              <div className="space-y-0.5">
                                {p.reasoning.confidence_factors.map((factor: string, i: number) => (
                                  <div key={i} className="flex gap-1.5 text-[11px] text-gray-500">
                                    <span className={cn("shrink-0", p.reasoning.confidence >= 80 ? "text-green-500" : p.reasoning.confidence >= 60 ? "text-amber-500" : "text-red-500")}>✓</span>
                                    <span>{factor}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Feedback learning — shows past seller decisions */}
                          {p.reasoning.feedback_learning && (
                            <div className="mt-2 pt-2 border-t border-indigo-100">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Learning from Your Past Decisions</p>
                              <div className="flex items-center gap-3 text-[11px] mb-1">
                                <span className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-green-700">{p.reasoning.feedback_learning.past_approvals} approved</span>
                                <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-red-600">{p.reasoning.feedback_learning.past_rejections} rejected</span>
                                <span className="text-gray-500">Approval rate: {p.reasoning.feedback_learning.approval_rate}</span>
                              </div>
                              {p.reasoning.feedback_learning.adaptations_applied && p.reasoning.feedback_learning.adaptations_applied.length > 0 && (
                                <div className="space-y-0.5 mt-1">
                                  {p.reasoning.feedback_learning.adaptations_applied.map((adaptation: string, i: number) => (
                                    <div key={i} className="flex gap-1.5 text-[11px] text-indigo-600">
                                      <span className="shrink-0">⚡</span>
                                      <span>{adaptation}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {p.reasoning.feedback_learning.top_reject_reasons && p.reasoning.feedback_learning.top_reject_reasons.length > 0 && (
                                <div className="mt-1 text-[10px] text-gray-400">
                                  Past reject reasons: {p.reasoning.feedback_learning.top_reject_reasons.join(", ")}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Buyer memory — "What I know about this buyer" */}
                          {p.reasoning.buyer_memory_summary && p.reasoning.buyer_memory_summary.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-indigo-100">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">What I Know About This Buyer</p>
                              <div className="space-y-0.5">
                                {p.reasoning.buyer_memory_summary.map((item: string, i: number) => (
                                  <div key={i} className="flex gap-1.5 text-[11px] text-gray-600">
                                    <span className="text-indigo-400 shrink-0">•</span>
                                    <span>{item}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Buyer memory — what Agent 3 knows about this buyer */}
                          {p.reasoning.buyer_memory && (
                            <div className="mt-2 pt-2 border-t border-indigo-100">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Buyer Memory ({p.reasoning.buyer_memory.memory_count} records)</p>
                              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                {p.reasoning.buyer_memory.past_contracts !== "0" && (
                                  <div><span className="text-gray-400">Past Contracts:</span> <span className="font-medium text-gray-700">{p.reasoning.buyer_memory.past_contracts}</span></div>
                                )}
                                {p.reasoning.buyer_memory.preferred_incoterm && (
                                  <div><span className="text-gray-400">Preferred Incoterm:</span> <span className="font-medium text-gray-700">{p.reasoning.buyer_memory.preferred_incoterm}</span></div>
                                )}
                                {p.reasoning.buyer_memory.outreach_touches !== "0" && (
                                  <div><span className="text-gray-400">Outreach Touches:</span> <span className="font-medium text-gray-700">{p.reasoning.buyer_memory.outreach_touches}</span></div>
                                )}
                                {p.reasoning.buyer_memory.ghosted_count !== "0" && (
                                  <div><span className="text-gray-400">Ghosted Count:</span> <span className="font-medium text-red-600">{p.reasoning.buyer_memory.ghosted_count}</span></div>
                                )}
                                {p.reasoning.buyer_memory.tone_preference && (
                                  <div><span className="text-gray-400">Tone Pref:</span> <span className="font-medium text-indigo-600">{p.reasoning.buyer_memory.tone_preference}</span></div>
                                )}
                                {p.reasoning.buyer_memory.email_length_preference && (
                                  <div><span className="text-gray-400">Length Pref:</span> <span className="font-medium text-indigo-600">{p.reasoning.buyer_memory.email_length_preference}</span></div>
                                )}
                                {p.reasoning.buyer_memory.cta_preference && (
                                  <div><span className="text-gray-400">CTA Pref:</span> <span className="font-medium text-indigo-600">{p.reasoning.buyer_memory.cta_preference}</span></div>
                                )}
                                {p.reasoning.buyer_memory.journey_stage && (
                                  <div><span className="text-gray-400">Journey:</span> <span className="font-medium text-gray-700">{p.reasoning.buyer_memory.journey_stage.replace(/_/g, " ")}</span></div>
                                )}
                              </div>
                              {p.reasoning.buyer_memory.already_contacted && (
                                <div className="mt-1 flex gap-1.5 text-[11px] text-amber-600">
                                  <span className="shrink-0">⚠️</span>
                                  <span>Buyer was previously marked as "already contacted"</span>
                                </div>
                              )}
                              {p.reasoning.buyer_memory.adaptations_from_memory && p.reasoning.buyer_memory.adaptations_from_memory.length > 0 && (
                                <div className="space-y-0.5 mt-1">
                                  {p.reasoning.buyer_memory.adaptations_from_memory.map((adaptation: string, i: number) => (
                                    <div key={i} className="flex gap-1.5 text-[11px] text-indigo-600">
                                      <span className="shrink-0">🧠</span>
                                      <span>{adaptation}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {p.reasoning.buyer_memory.latest_seller_note && (
                                <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700 italic">
                                  Last seller note: "{p.reasoning.buyer_memory.latest_seller_note}"
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Contract draft preview */}
                      {isContract && (
                        <div className="mb-3 rounded-lg bg-white border border-gray-200 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                            <FileSignature className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                            <span className="text-[11px] font-semibold text-gray-500">CONTRACT DRAFT</span>
                            <span className="text-[10px] text-gray-400">— review terms before creating</span>
                          </div>
                          <div className="px-3 py-2 space-y-1.5">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div><span className="text-gray-400">Volume:</span> <span className="font-medium text-gray-700">{p.total_volume_bags} bags</span></div>
                              <div><span className="text-gray-400">Value:</span> <span className="font-bold text-gray-900">${(p.total_value || 0).toLocaleString()}</span></div>
                              <div><span className="text-gray-400">Incoterm:</span> <span className="font-medium text-gray-700">{p.incoterm} {p.destination_port}</span></div>
                              <div><span className="text-gray-400">Payment:</span> <span className="font-medium text-gray-700">{p.payment_terms}</span></div>
                            </div>
                            {p.lots && p.lots.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <p className="text-[10px] text-gray-400 mb-1">LOTS:</p>
                                {p.lots.map((lot: any, i: number) => (
                                  <div key={i} className="text-[11px] text-gray-600 flex justify-between">
                                    <span>{lot.lotId} — {lot.region} {lot.process}</span>
                                    <span>{lot.quantityBags} bags @ ${lot.unitPrice}/kg</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto">{p.contract_terms}</pre>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2">
                        {rejectingId === a.id ? (
                          /* Reject reason form */
                          <div className="w-full space-y-2">
                            <select
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-red-300"
                            >
                              <option value="">Select reason…</option>
                              <option value="wrong_tone">Wrong tone / too formal</option>
                              <option value="too_long">Email too long</option>
                              <option value="wrong_lots">Wrong lots recommended</option>
                              <option value="wrong_price">Price too high / too low</option>
                              <option value="wrong_language">Wrong language</option>
                              <option value="already_contacted">Already contacted this buyer</option>
                              <option value="not_ready">Buyer not ready for outreach</option>
                              <option value="wrong_cta">Call-to-action not appropriate</option>
                              <option value="other">Other (explain below)</option>
                            </select>
                            <textarea
                              value={rejectNotes}
                              onChange={(e) => setRejectNotes(e.target.value)}
                              placeholder="Optional: tell Agent 3 what to do differently next time…"
                              rows={2}
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-300 resize-none"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { setRejectingId(null); setRejectReason(""); setRejectNotes(""); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                              <button onClick={() => handleReject(a.id)} disabled={!rejectReason || actionLoading === a.id} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                                {actionLoading === a.id ? <><div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</> : <>Confirm Reject</>}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => { setRejectingId(a.id); setRejectReason(""); setRejectNotes(""); }}
                              disabled={actionLoading === a.id}
                              className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === a.id ? "..." : "Reject"}
                            </button>
                            <button
                              onClick={() => handleApprove(a.id)}
                              disabled={actionLoading === a.id}
                              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === a.id ? (
                                <><div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
                              ) : (
                                <><CheckCircle2 className="h-3.5 w-3.5" /> Approve & Execute</>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-3 shrink-0">
              <p className="text-[11px] text-gray-400 text-center">
                Approved actions are executed automatically by the supervisor within 10 seconds.
                Rejected actions are discarded — the agent will not retry.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

