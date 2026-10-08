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
import { getReadonlyDb, getWritableDb } from "@/lib/db";
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

// ── Phase 4: buyer identity masking (docs/buyer-masking.md) ───────────
// Exporter-facing payloads may ONLY carry buyer addresses that are platform
// aliases on the inbound domain. A stored buyer address on any other domain
// is a legacy unhealed row — it must NEVER be emitted (redact to a
// placeholder instead). Exporter masked inboxes are also on this domain.
const INBOUND_DOMAIN = (process.env.INBOUND_EMAIL_DOMAIN || "faithelexport.com").toLowerCase();

function isPlatformAddress(addr: string | null | undefined): boolean {
  return !!addr && addr.toLowerCase().endsWith("@" + INBOUND_DOMAIN);
}

/** Buyer display value: the alias local part + "@" (frontend appends the domain). */
function buyerDisplay(addr: string | null | undefined): string {
  if (addr && isPlatformAddress(addr)) return addr.split("@")[0] + "@";
  return "buyer@"; // legacy/unhealed — real address withheld
}

// SR-1 (security review): on UNHEALED legacy threads (buyer_email not a
// platform alias) the stored subject/body/preview may still contain the
// plaintext buyer address — the gateway heals threads on first touch, but
// until then this API must not emit those addresses. We cannot run the
// registry resolver here (no masking secret on the JS side), so every
// email-looking token that is NOT on the platform domain is replaced with
// a generic placeholder. Platform aliases and the exporter's own masked
// addresses pass through.
const EMAIL_TOKEN_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

function redactExternalAddresses(text: string | null | undefined): string {
  if (!text) return text ?? "";
  return text.replace(EMAIL_TOKEN_RE, (token) =>
    token.toLowerCase().endsWith("@" + INBOUND_DOMAIN) ? token : "[redacted address]"
  );
}

// Frontend-expected shapes
type FrontendConversation = {
  id: number;
  threadId: string;      // backend thread id — used to fetch a specific thread's messages
  maskedFrom: string | null; // the exporter's masked inbox address for this thread
  buyer: string;        // buyer display — alias local part + "@" (frontend appends the domain)
  buyerAlias: string | null; // FULL platform alias (buyer.<hex>@<inbound domain>) — null on legacy rows
  buyerCompany: string | null; // lead company name (display context)
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
  /** DB id — used to reply with proper In-Reply-To threading. */
  messageId?: number;
  /** True when the provider was in dry-run (nothing was really delivered). */
  dryRun?: boolean;
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
        // Unhealed legacy thread? Its content fields may carry plaintext
        // buyer addresses — redact every non-platform token (SR-1).
        const legacyThread = !isPlatformAddress(t.buyer_email);
        const contentRedactor = legacyThread ? redactExternalAddresses : (s: string | null | undefined) => s ?? "";
        const threadMessages = (msgStmt.all(orgId, t.thread_id) as any[]) || [];
        const msgs: FrontendMessage[] = threadMessages.map((m) => {
          // Phase 4: inbound senders are buyer aliases (platform domain).
          // Any non-platform inbound address is a legacy unhealed row — the
          // real address is NEVER emitted to the client.
          let fromAddr = m.from_addr || "";
          if (m.direction === "inbound" && !isPlatformAddress(fromAddr)) {
            fromAddr = "buyer@" + INBOUND_DOMAIN; // redacted placeholder
          }
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
            subject: contentRedactor(m.subject || ""),
            body: contentRedactor(m.body_text || ""),
            time: messageTime(m.sent_ts || m.received_ts || m.created_ts),
            messageId: m.id,
            dryRun:
              m.direction === "outbound" &&
              typeof m.provider_message_id === "string" &&
              m.provider_message_id.startsWith("dry-run-"),
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

        // Build preview from the last message (redacted on legacy threads)
        const lastMsg = threadMessages[threadMessages.length - 1];
        const preview = lastMsg?.body_text
          ? contentRedactor(lastMsg.body_text).substring(0, 100).replace(/\n/g, " ")
          : "";

        // Phase 4: buyer identity is the platform alias — never a real
        // address. Legacy unhealed rows are redacted to a placeholder.
        const buyerPart = buyerDisplay(t.buyer_email);
        const buyerAlias = isPlatformAddress(t.buyer_email) ? t.buyer_email : null;

        conversations.push({
          id: i + 1, // 1-based ID for frontend compatibility
          threadId: t.thread_id, // backend thread id — frontend uses this to fetch a specific thread
          maskedFrom: t.exporter_masked_email || null, // real masked sender identity
          buyer: buyerPart,
          buyerAlias,
          buyerCompany: t.lead_company || null,
          subject: contentRedactor(t.subject || "(no subject)"),
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

  const { threadId, bodyText, subject, leadId, buyerEmail, messageId } = body || {};
  const bridgeUrl = process.env.EMAIL_BRIDGE_URL || "http://localhost:8000";
  const bridgeSecret = process.env.EMAIL_BRIDGE_SECRET || "";

  if (!bodyText) {
    return NextResponse.json(
      { ok: false, error: "bodyText required" },
      { status: 400 }
    );
  }

  const db = getWritableDb();

  try {
    // ── Mode A: REPLY to a specific inbound message (proper threading) ──
    // Uses the bridge's /api/bridge/reply, which sets In-Reply-To/References
    // headers and the "Re:" subject so the buyer's mail client threads it.
    if (messageId) {
      // IDOR protection: the inbound message must belong to this org.
      const msg = db.prepare(`
        SELECT m.id, m.thread_id, m.direction, m.organization_id
        FROM inbox_messages m
        WHERE m.id = ? AND m.organization_id = ?
      `).get(Number(messageId), orgId) as any;

      if (!msg) {
        return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
      }
      if (msg.direction !== "inbound") {
        return NextResponse.json(
          { ok: false, error: "Can only reply to inbound messages" },
          { status: 422 }
        );
      }

      let bridgeResult: any;
      let response: Response;
      try {
        response = await fetch(`${bridgeUrl}/api/bridge/reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(bridgeSecret ? { Authorization: `Bearer ${bridgeSecret}` } : {}),
          },
          body: JSON.stringify({
            message_id: msg.id,
            body_text: bodyText,
            operator_id: auth.user.operatorId,
            organization_id: orgId, // Python enforces this tenant-side too (fail closed)
          }),
        });
        bridgeResult = await response.json();
      } catch (error: any) {
        console.error("[/api/inbox POST] Python email bridge unreachable:", error);
        return NextResponse.json(
          { ok: false, sent: false, error: "Email service unavailable. Message was not sent." },
          { status: 503 }
        );
      }

      if (!response.ok || !bridgeResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            sent: false,
            error: bridgeResult?.error || "Email gateway failed to send reply",
            action: bridgeResult?.action || "reply_failed",
            dry_run: bridgeResult?.dry_run || false,
          },
          { status: response.status === 403 ? 403 : 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        sent: true,
        action: "replied",
        outbound_message_id: bridgeResult.outbound_message_id,
        thread_id: bridgeResult.thread_id,
        dry_run: bridgeResult.dry_run || false,
      });
    }

    // ── Mode B: NEW conversation (first email to a lead's buyer) ──
    // Required until now a fresh exporter could never start a conversation.
    // Phase 4: buyerEmail is optional — alias or omitted (server resolves
    // the lead's verified contact). Real addresses are still accepted for
    // backward compatibility and re-verified gateway-side.
    if (leadId) {
      // Tenant fail-closed: the lead must belong to this org.
      const lead = db.prepare(`
        SELECT lead_id, company_name FROM leads
        WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(leadId, orgId) as any;
      if (!lead) {
        return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
      }

      // Phase 4: buyerEmail is OPTIONAL here. When the client omits it
      // (the compose form no longer handles real addresses), the lead's
      // best contact email is resolved server-side — preferring VERIFIED
      // contacts (Phase 1 outreach gate). The client may also pass a
      // platform ALIAS; the Python gateway's registry — never the client —
      // decides who the mail actually goes to.
      const { isFictionalEmail, isEmailFormatValid } = await import("@/lib/leads-evidence");
      let email = buyerEmail ? String(buyerEmail).trim().toLowerCase() : "";
      if (!email) {
        const contact = db.prepare(`
          SELECT email FROM lead_contacts
          WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL
            AND email IS NOT NULL AND email != ''
          ORDER BY (verification_status = 'verified') DESC, is_primary DESC, id ASC
          LIMIT 1
        `).get(leadId, orgId) as any;
        if (!contact?.email) {
          return NextResponse.json(
            { ok: false, error: "This lead has no contact with an email address — add a verified contact on the Leads page first." },
            { status: 422 }
          );
        }
        email = String(contact.email).trim().toLowerCase();
      }
      // Fiction guard: refuse to send to reserved/test domains (only for
      // non-alias addresses — aliases are on our own platform domain).
      if (!isPlatformAddress(email)) {
        if (!isEmailFormatValid(email)) {
          return NextResponse.json({ ok: false, error: `"${email}" is not a valid email address` }, { status: 422 });
        }
        if (isFictionalEmail(email)) {
          return NextResponse.json(
            { ok: false, error: `"${email}" is on a reserved/test domain — real buyer contacts only` },
            { status: 422 }
          );
        }
      }

      const finalSubject = (subject || `Introduction — ${lead.company_name}`).trim();

      // Operator display name drives the masked address local part
      // ("Marcus Bell" -> marcus.bell@<inbound domain>).
      const operator = db.prepare(`
        SELECT name FROM operators WHERE operator_id = ?
      `).get(auth.user.operatorId) as any;
      const operatorName: string | null = operator?.name || null;

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
            operator_id: auth.user.operatorId,
            operator_name: operatorName,
            display_name: operatorName || "Faith Export",
            lead_id: leadId,
            buyer_email: email,
            subject: finalSubject,
            body_text: bodyText,
            organization_id: orgId, // Audit trail; Python re-verifies the lead's org
          }),
        });
        bridgeResult = await response.json();
      } catch (error: any) {
        console.error("[/api/inbox POST] Python email bridge unreachable:", error);
        return NextResponse.json(
          { ok: false, sent: false, error: "Email service unavailable. Message was not sent." },
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
          { status: response.status === 403 ? 403 : 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        sent: true,
        action: bridgeResult.action,
        message_id: bridgeResult.message_id,
        thread_id: bridgeResult.thread_id,
        provider_message_id: bridgeResult.provider_message_id,
        dry_run: bridgeResult.dry_run || false,
        masked_from: bridgeResult.masked_from,
        buyer_alias: bridgeResult.buyer_alias || null,
      });
    }

    // ── Mode C (legacy): send on an existing thread by threadId ──
    if (!threadId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Provide messageId (reply to an inbound message), leadId + buyerEmail (new conversation), or threadId (existing thread)",
        },
        { status: 400 }
      );
    }

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
        { status: response.status === 403 ? 403 : 502 }
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