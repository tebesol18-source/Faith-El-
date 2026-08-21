/**
 * GET /api/inbox
 *
 * Reads inbox threads + messages from the backend SQLite database.
 * Joins message_threads → inbox_messages → exporter_inboxes → leads.
 * Maps to the frontend's expected conversations[] + messages[] shape.
 *
 * Backend: /home/z/my-project/coffee_export/data/coffee_export.db
 * Tables:  message_threads, inbox_messages, exporter_inboxes, leads
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/** ISO timestamp → "2h ago" / "5d ago" / "Never" */
function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffMs = now - then;
    if (diffMs < 0) return "Just now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  } catch {
    return "—";
  }
}

/** ISO timestamp → "Yesterday 4:30 PM" / "Today 10:24 AM" */
function messageTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    if (isToday) return `Today ${time}`;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
  } catch {
    return "—";
  }
}

/** Map backend thread status → frontend priority */
function threadPriority(status: string | null): "high" | "medium" | "low" {
  if (!status) return "low";
  const high = ["awaiting_buyer", "awaiting_exporter", "urgent"];
  const medium = ["in_progress", "replied"];
  if (high.includes(status)) return "high";
  if (medium.includes(status)) return "medium";
  return "low";
}

// Frontend-expected shapes
type FrontendConversation = {
  id: number;
  buyer: string;        // masked buyer email (without domain — frontend appends "faithelexport.com")
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
  priority: "high" | "medium" | "low";
  intent: string;
  confidence: number;
};

type FrontendMessage = {
  direction: "outbound" | "inbound";
  from: string;
  subject: string;
  body: string;
  time: string;
  ai?: {
    classification: string;
    summary: string;
    intent: string;
    volume: number | null;
    origin: string | null;
    destination: string | null;
    incoterm: string | null;
    urgency: string | null;
    nextAction: string | null;
  };
};

export async function GET(request: NextRequest) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  const { searchParams } = new URL(request.url);
  const threadIdFilter = searchParams.get("threadId");

  try {
    const db = getReadonlyDb();

    try {
      // Fetch all threads with their inbox info
      const threads = db.prepare(`
        SELECT
          t.thread_id,
          t.lead_id,
          t.inbox_id,
          t.buyer_email,
          t.subject,
          t.status,
          t.last_message_ts,
          t.last_message_direction,
          t.message_count,
          t.unread_count,
          t.created_ts,
          t.updated_ts,
          ei.masked_email AS exporter_masked_email,
          ei.display_name AS exporter_display_name,
          l.company_name AS lead_company
        FROM message_threads t
        LEFT JOIN exporter_inboxes ei ON t.inbox_id = ei.id
        LEFT JOIN leads l ON t.lead_id = l.lead_id
        WHERE t.closed_ts IS NULL AND t.organization_id = ?
        ORDER BY t.last_message_ts DESC
      `).all(orgId) as any[];

      if (threads.length === 0) {
        return NextResponse.json({
          ok: true,
          count: 0,
          conversations: [],
          messages: [],
        });
      }

      // Build conversations array
      const conversations: FrontendConversation[] = [];
      const allMessages: FrontendMessage[] = [];
      const messagesByThread: Record<string, FrontendMessage[]> = {};

      // Prepare statement for fetching messages per thread
      const msgStmt = db.prepare(`
        SELECT * FROM inbox_messages
        WHERE organization_id = ? AND thread_id = ?
        ORDER BY created_ts ASC
      `);

      for (let i = 0; i < threads.length; i++) {
        const t = threads[i];
        const threadMessages = (msgStmt.all(orgId, t.thread_id) as any[]) || [];
        const msgs: FrontendMessage[] = threadMessages.map((m) => {
          const fromAddr = m.from_addr || "";
          // The frontend appends "faithelexport.com" to the from field,
          // so we strip that domain if present, and strip the @ too (frontend adds it back).
          // Actually looking at the frontend more carefully:
          //   `{m.direction === "outbound" ? \`You (${m.from}faithelexport.com)\` : m.from + "faithelexport.com"}`
          // So `from` should be the part WITHOUT the domain. For outbound, it's the masked user part.
          // For inbound, it's the buyer's email prefix.
          // We'll pass the full email and the frontend will append "faithelexport.com" (which is a quirk).
          // To match the mock pattern (e.g. "buyer-47@", "marcus.bell@"), we extract the part before @ and add @ back.
          const fromPart = fromAddr.includes("@") ? fromAddr.split("@")[0] + "@" : fromAddr;

          const msg: FrontendMessage = {
            direction: m.direction as "outbound" | "inbound",
            from: fromPart,
            subject: m.subject || "",
            body: m.body_text || "",
            time: messageTime(m.sent_ts || m.received_ts || m.created_ts),
          };

          // Add AI triage if the message was processed
          if (m.ai_processed && m.direction === "inbound") {
            msg.ai = {
              classification: m.glm_classification || m.extracted_intent || "other",
              summary: m.glm_summary || "AI triage unavailable",
              intent: m.glm_intent || m.extracted_intent || "other",
              volume: m.extracted_volume_bags || null,
              origin: m.extracted_origin || null,
              destination: m.extracted_destination || null,
              incoterm: m.extracted_incoterm || null,
              urgency: m.extracted_urgency || null,
              nextAction: m.extracted_next_action || null,
            };
          }
          return msg;
        });

        messagesByThread[t.thread_id] = msgs;
        allMessages.push(...msgs);

        // Find the last inbound message with AI data for the conversation-level intent
        const lastInboundWithAi = [...threadMessages].reverse().find(
          (m) => m.direction === "inbound" && m.ai_processed
        );

        // Build preview from the last message
        const lastMsg = threadMessages[threadMessages.length - 1];
        const preview = lastMsg?.body_text
          ? lastMsg.body_text.substring(0, 100).replace(/\n/g, " ")
          : "";

        // Buyer email prefix (without domain — frontend appends "faithelexport.com")
        const buyerPart = t.buyer_email?.includes("@")
          ? t.buyer_email.split("@")[0] + "@"
          : t.buyer_email || "buyer@";

        conversations.push({
          id: i + 1, // 1-based ID for frontend compatibility
          threadId: t.thread_id, // ADD THIS for frontend to fetch specific thread
          buyer: buyerPart,
          subject: t.subject || "(no subject)",
          preview,
          time: relativeTime(t.last_message_ts),
          unread: (t.unread_count || 0) > 0,
          priority: threadPriority(t.status),
          intent: lastInboundWithAi?.glm_intent || lastInboundWithAi?.extracted_intent || "other",
          confidence: lastInboundWithAi?.ai_processed ? 94 : 0,
        });
      }

      // If a specific threadId is requested, return only that thread's messages
      if (threadIdFilter && messagesByThread[threadIdFilter]) {
        return NextResponse.json({
          ok: true,
          count: conversations.length,
          conversations,
          messages: messagesByThread[threadIdFilter],
        });
      }

      return NextResponse.json({
        ok: true,
        count: conversations.length,
        conversations,
        // Default: return messages of the FIRST thread (backward compat)
        messages: threads.length > 0 ? (messagesByThread[threads[0].thread_id] || []) : [],
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/inbox] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch inbox" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { threadId, bodyText, subject } = body || {};
  if (!threadId || !bodyText) {
    return NextResponse.json(
      { ok: false, error: "threadId and bodyText required" },
      { status: 400 }
    );
  }

  const db = getWritableDb();

  try {
    // Strict IDOR protection:
    // The thread must belong to the authenticated user's organization.
    // The client is never allowed to supply or override organization_id.
    const thread = db.prepare(`
      SELECT
        t.thread_id,
        t.lead_id,
        t.buyer_email,
        t.subject,
        t.inbox_id,
        ei.masked_email,
        ei.display_name,
        ei.operator_id AS inbox_operator_id
      FROM message_threads t
      LEFT JOIN exporter_inboxes ei ON t.inbox_id = ei.id
      WHERE t.thread_id = ? AND t.organization_id = ?
    `).get(threadId, orgId) as any;

    if (!thread) {
      return NextResponse.json({ ok: false, error: "Thread not found" }, { status: 404 });
    }

    const finalSubject = subject || thread.subject || "(no subject)";
    const bridgeUrl = process.env.EMAIL_BRIDGE_URL || "http://localhost:8000";
    const bridgeSecret = process.env.EMAIL_BRIDGE_SECRET || "";
    const operatorId = thread.inbox_operator_id || auth.user.operatorId;

    // Call Python EmailGateway bridge.
    // Do NOT expose bridge secret or Resend credentials to the browser.
    let bridgeResult: any;
    let response: Response;

    try {
      response = await fetch(`${bridgeUrl}/api/bridge/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bridgeSecret ? { Authorization: `Bearer ${bridgeSecret}` } : {}),
        },
        body: JSON.stringify({
          operator_id: operatorId,
          operator_name: null,
          display_name: thread.display_name || "Faith Export",
          lead_id: thread.lead_id,
          buyer_email: thread.buyer_email,
          subject: finalSubject,
          body_text: bodyText,
          organization_id: orgId, // Audit only; Python must not trust this for auth.
        }),
      });

      bridgeResult = await response.json();
    } catch (error: any) {
      console.error("[/api/inbox POST] Python email bridge unreachable:", error);
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: "Email service unavailable. Message was not sent.",
        },
        { status: 503 }
      );
    }

    if (!response.ok || !bridgeResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: bridgeResult?.error || "Email gateway failed to send message",
          action: bridgeResult?.action || "send_failed",
          dry_run: bridgeResult?.dry_run || false,
        },
        { status: 502 }
      );
    }

    // Important:
    // We do NOT write a fake message here.
    // Python EmailGateway.send() is responsible for:
    // - Resend delivery or dry-run
    // - masked sender address
    // - thread handling
    // - inbox_messages insert
    // - event publishing
    return NextResponse.json({
      ok: true,
      sent: true,
      action: bridgeResult.action,
      message_id: bridgeResult.message_id,
      thread_id: bridgeResult.thread_id,
      provider_message_id: bridgeResult.provider_message_id,
      dry_run: bridgeResult.dry_run || false,
      masked_from: bridgeResult.masked_from,
    });
  } finally {
    db.close();
  }
}