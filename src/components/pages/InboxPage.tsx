"use client";

import { useState, useEffect } from "react";
import {
  Archive, Calendar, CheckCircle, FileText, Filter, MoreHorizontal, Package,
  Paperclip, Search, Send, Sparkles, Truck, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contract, Priority, Quote, Shipment } from "@/lib/types";

const mockConversations = [];

const mockMessages = [];

export function InboxPage() {
  const [selectedConv, setSelectedConv] = useState(1);
  const [replyText, setReplyText] = useState("");
  const [conversations, setConversations] = useState<any[] | null>(null);
  const [messages, setMessages] = useState<any[] | null>(null);

  // ─── Live data from backend ───
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox")
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.conversations) && data.conversations.length > 0) {
          setConversations(data.conversations);
          setMessages(data.messages || []);
        } else {
          setConversations([]);
          setMessages([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[InboxPage] API fetch failed, using mock data:", err);
        setConversations([]);
        setMessages([]);
      });
    return () => { cancelled = true; };
  }, []);


  // Fetch messages for selected conversation
  useEffect(() => {
    if (!conversations || selectedConv === null) return;
    const conv = conversations.find(c => c.id === selectedConv);
    if (!conv || !conv.threadId) return;

    let cancelled = false;
    apiFetch(`/api/inbox?threadId=${conv.threadId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.ok) setMessages(data.messages); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedConv, conversations]);

  // Loading state
  if (!conversations || !messages) {
    return (
      <main className="flex h-[calc(100vh-4rem)]">
        <div className="w-[360px] border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Inbox</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-[#FAFAF9]">
          <p className="text-sm text-gray-500">Loading messages from database…</p>
        </div>
      </main>
    );
  }

  const conv = conversations.find(c => c.id === selectedConv) || conversations[0] || null;

  const handleCreateQuote = (message: any) => {
    const conv = conversations?.find(c => c.id === selectedConv);
    const threadId = conv?.threadId || "";

    const params = new URLSearchParams({
      threadId,
      buyerEmail: message.from || "",
      subject: message.subject || "",
      volume: message.ai?.volume?.toString() || "",
      origin: message.ai?.origin || "",
      grade: message.ai?.grade || "",
      destination: message.ai?.destination || "",
      incoterm: message.ai?.incoterm || "",
    });

    window.location.href = `/quotes/new?${params.toString()}`;
  };

  const handleCreateSample = (message: any) => {
    const conv = conversations?.find(c => c.id === selectedConv);
    const threadId = conv?.threadId || "";

    const params = new URLSearchParams({
      threadId,
      buyerEmail: message.from || "",
      subject: message.subject || "",
      origin: message.ai?.origin || "",
      grade: message.ai?.grade || "",
    });

    window.location.href = `/samples/new?${params.toString()}`;
  };

  const handleScheduleCall = (message: any) => {
    alert("Calendar integration coming in Phase 3! For now, manually coordinate with the buyer.");
  };

  const handleCreateShipment = (message: any) => {
    const conv = conversations?.find(c => c.id === selectedConv);
    const threadId = conv?.threadId || "";

    const params = new URLSearchParams({
      threadId,
      buyerEmail: message.from || "",
      subject: message.subject || "",
      destination: message.ai?.destination || "",
      incoterm: message.ai?.incoterm || "",
      volume: message.ai?.volume?.toString() || "",
    });

    window.location.href = `/shipments/new?${params.toString()}`;
  };

  const handleCreateContract = (message: any) => {
    const conv = conversations?.find(c => c.id === selectedConv);
    const threadId = conv?.threadId || "";

    const params = new URLSearchParams({
      threadId,
      buyerEmail: message.from || "",
      subject: message.subject || "",
      volume: message.ai?.volume?.toString() || "",
      origin: message.ai?.origin || "",
      grade: message.ai?.grade || "",
      destination: message.ai?.destination || "",
      incoterm: message.ai?.incoterm || "",
    });

    window.location.href = `/contracts/new?${params.toString()}`;
  };

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      {/* Conversation List */}
      <div className="w-[360px] border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Inbox</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
              <input type="text" placeholder="Search conversations..." className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-gray-300 focus:outline-none" />
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"><Filter className="h-4 w-4 text-gray-500" strokeWidth={1.5} /></button>
          </div>
          <div className="flex gap-1 mt-3">
            {["All", "Unread", "High Priority", "AI Drafted"].map((tab, i) => (
              <button key={tab} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", i === 0 ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100")}>{tab}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedConv(c.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b border-gray-50 p-4 text-left transition-colors",
                selectedConv === c.id ? "bg-indigo-50/50" : "hover:bg-gray-50"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {c.unread && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                  <span className="text-sm font-semibold text-gray-900">{c.buyer}faithelexport.com</span>
                </div>
                <span className="text-xs text-gray-400">{c.time}</span>
              </div>
              <p className="text-xs text-gray-600 truncate pl-4">{c.subject}</p>
              <p className="text-xs text-gray-400 truncate pl-4">{c.preview}</p>
              <div className="flex items-center gap-1.5 mt-1 pl-4">
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                  c.intent === "sample_request" ? "bg-amber-50 text-amber-700" :
                  c.intent === "counter_offer" ? "bg-purple-50 text-purple-700" :
                  c.intent === "confirmation" ? "bg-green-50 text-green-700" :
                  c.intent === "positive" ? "bg-green-50 text-green-700" :
                  c.intent === "logistics_question" ? "bg-blue-50 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {c.intent.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-gray-400">AI: {c.confidence}%</span>
                {c.priority === "high" && <span className="text-[10px] font-semibold text-red-600">● HIGH</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Message View */}
      <div className="flex-1 flex flex-col bg-[#FAFAF9]">
        {conv ? (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{conv.subject || "No subject"}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Buyer: {conv.buyer || "—"}{conv.buyer ? "faithelexport.com" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Archive className="h-3.5 w-3.5" /> Archive</button>
                <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><MoreHorizontal className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[70%] rounded-xl p-4",
                    m.direction === "outbound" ? "bg-[#4A3520] text-white" : "bg-white border border-gray-200 text-gray-800"
                  )}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium opacity-70">{m.direction === "outbound" ? `You (${m.from}faithelexport.com)` : m.from + "faithelexport.com"}</span>
                      <span className="text-xs opacity-50">·</span>
                      <span className="text-xs opacity-50">{m.time}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</p>

                    {m.ai && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sparkles className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.5} />
                          <span className="text-xs font-semibold text-indigo-600">AI TRIAGE</span>
                        </div>
                        <div className="bg-indigo-50/50 rounded-lg p-3 space-y-2">
                          <p className="text-xs text-gray-700"><span className="font-semibold">Summary:</span> {m.ai.summary}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-gray-400">Intent:</span> <span className="font-medium text-gray-800">{m.ai.intent.replace(/_/g, " ")}</span></div>
                            <div><span className="text-gray-400">Urgency:</span> <span className="font-medium text-red-600">{m.ai.urgency}</span></div>
                            {m.ai.volume && <div><span className="text-gray-400">Volume:</span> <span className="font-medium text-gray-800">{m.ai.volume} bags</span></div>}
                            {m.ai.origin && <div><span className="text-gray-400">Origin:</span> <span className="font-medium text-gray-800">{m.ai.origin}</span></div>}
                            {m.ai.destination && <div><span className="text-gray-400">Destination:</span> <span className="font-medium text-gray-800">{m.ai.destination}</span></div>}
                            {m.ai.incoterm && <div><span className="text-gray-400">Incoterm:</span> <span className="font-medium text-gray-800">{m.ai.incoterm}</span></div>}
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs font-semibold text-indigo-600">→ {m.ai.nextAction}</span>
                            <button className="ml-auto rounded-md bg-indigo-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-600">Auto-Action</button>
                          </div>
                        </div>

                        {m.ai && m.direction === "inbound" && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {m.ai.intent === "pricing_question" && (
                              <button
                                onClick={() => handleCreateQuote(m)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#4A3520] text-white rounded-lg hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Create Quote
                              </button>
                            )}
                            {m.ai.intent === "sample_request" && (
                              <button
                                onClick={() => handleCreateSample(m)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#4A3520] text-white rounded-lg hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                              >
                                <Package className="h-3.5 w-3.5" />
                                Send Sample
                              </button>
                            )}
                            {m.ai.intent === "meeting_request" && (
                              <button
                                onClick={() => handleScheduleCall(m)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#4A3520] text-white rounded-lg hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                              >
                                <Calendar className="h-3.5 w-3.5" />
                                Schedule Call
                              </button>
                            )}
                            {m.ai.intent === "logistics_question" && (
                              <button
                                onClick={() => handleCreateShipment(m)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#4A3520] text-white rounded-lg hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                              >
                                <Truck className="h-3.5 w-3.5" />
                                Create Shipment
                              </button>
                            )}
                            {m.ai.intent === "confirmation" && (
                              <button
                                onClick={() => handleCreateContract(m)}
                                className="px-3 py-1.5 text-xs font-medium bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors flex items-center gap-1.5"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Create Contract
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 bg-white p-4">
              <div className="rounded-xl border border-gray-200">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply to buyer..."
                  className="w-full resize-none rounded-t-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  rows={3}
                />
                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"><Paperclip className="h-3.5 w-3.5" /> Attach</button>
                    <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Sparkles className="h-3.5 w-3.5" /> AI Draft</button>
                    <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Sparkles className="h-3.5 w-3.5" /> Improve</button>
                    <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Sparkles className="h-3.5 w-3.5" /> Translate</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Reply from: marcus.bell@faithelexport.com</span>
                    <button
                      onClick={() => {
                        if (!replyText.trim() || !conversations) return;
                        const conv = conversations.find(c => c.id === selectedConv);
                        if (!conv || !conv.threadId) return;

                        apiFetch("/api/inbox", {
                          method: "POST",
                          body: JSON.stringify({ threadId: conv.threadId, bodyText: replyText.trim() }),
                        }).then((r) => r.json()).then((data) => {
                          if (data.ok) {
                            setReplyText("");
                            apiFetch(`/api/inbox?threadId=${conv.threadId}`).then(r => r.json()).then(d => { if (d.ok) setMessages(d.messages); });
                          }
                        });
                      }}
                      className="rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" /> Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p className="text-sm">No conversations yet</p>
          </div>
        )}
      </div>
    </main>
  );
}

