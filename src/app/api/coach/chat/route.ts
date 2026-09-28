/**
 * POST /api/coach/chat
 *
 * AI Coach chat endpoint. Accepts a user message + conversation history
 * and returns a contextual response grounded in the operator's real data
 * (leads, contracts, inventory lots, shipments).
 *
 * Uses z-ai-web-dev-sdk (server-side only).
 *
 * Body: {
 *   message: string,
 *   history?: { role: "user" | "assistant", text: string }[]
 * }
 *
 * Response: { ok: true, reply: string } | { ok: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getReadonlyDb } from "@/lib/db";

// 20 messages per minute per user — LLM calls are expensive but a normal
// back-and-forth chat can easily hit 5/min.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

/**
 * Build a compact context snapshot of the operator's data so the LLM
 * can give grounded answers instead of hallucinating.
 */
function buildContextSnapshot(orgId: string): string {
  const db = getReadonlyDb();

  const parts: string[] = ["Operator business snapshot:"];

  try {
    const leads = db
      .prepare(
        `SELECT status, COUNT(*) as n FROM leads
         WHERE organization_id = ? AND deleted_ts IS NULL
         GROUP BY status`
      )
      .all(orgId) as { status: string; n: number }[];
    parts.push(
      `  Leads: ${leads.map((l) => `${l.status || "unknown"}=${l.n}`).join(", ") || "none"}`
    );
  } catch (err) {
    console.warn("[coach/chat] leads snapshot failed:", err);
  }

  try {
    const contracts = db
      .prepare(
        `SELECT status, COUNT(*) as n, COALESCE(SUM(total_value), 0) as total
         FROM contracts
         WHERE organization_id = ? AND deleted_ts IS NULL
         GROUP BY status`
      )
      .all(orgId) as { status: string; n: number; total: number }[];
    parts.push(
      `  Contracts: ${
        contracts.map((c) => `${c.status || "unknown"}=${c.n} ($${c.total})`).join(", ") ||
        "none"
      }`
    );
  } catch (err) {
    console.warn("[coach/chat] contracts snapshot failed:", err);
  }

  try {
    const lots = db
      .prepare(
        `SELECT COUNT(*) as lots, COALESCE(SUM(quantity_lb), 0) as lbs,
                COALESCE(SUM(quantity_lb * price_per_lb), 0) as value
         FROM lots
         WHERE organization_id = ? AND deleted_ts IS NULL`
      )
      .get(orgId) as { lots: number; lbs: number; value: number } | undefined;
    if (lots) {
      parts.push(
        `  Inventory: ${lots.lots} lots, ${lots.lbs} lbs, $${lots.value} total value`
      );
    }
  } catch (err) {
    console.warn("[coach/chat] inventory snapshot failed:", err);
  }

  try {
    const shipments = db
      .prepare(
        `SELECT status, COUNT(*) as n FROM shipments
         WHERE organization_id = ? AND deleted_ts IS NULL
         GROUP BY status`
      )
      .all(orgId) as { status: string; n: number }[];
    parts.push(
      `  Shipments: ${
        shipments.map((s) => `${s.status || "unknown"}=${s.n}`).join(", ") || "none"
      }`
    );
  } catch (err) {
    console.warn("[coach/chat] shipments snapshot failed:", err);
  }

  return parts.join("\n");
}

export async function POST(request: NextRequest) {
  // 1. Auth
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const user = auth.user;

  // 2. Rate limit per user (not per IP — authed endpoint)
  const rl = rateLimit(`coach-chat:${user.email}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Rate limit exceeded — please wait a moment before sending more messages.",
        retryAfterMs: rl.resetAt - Date.now(),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      }
    );
  }

  // 3. Parse body
  let body: { message?: string; history?: ChatMsg[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, error: "Message is required" },
      { status: 400 }
    );
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Message too long (max 2000 chars)" },
      { status: 400 }
    );
  }

  // 4. Build context snapshot
  const snapshot = buildContextSnapshot(user.organizationId);

  // 5. Build message list for LLM
  const systemPrompt = `You are the AI Coach for a coffee export ERP system.
You help operators (sales, logistics, compliance staff) make better decisions about leads, deals, shipments, contracts, and inventory.

Be concise, practical, and grounded in the operator's actual data. Avoid marketing fluff.
When the user asks about specific numbers, refer to the snapshot below. If data is missing or zero, say so honestly.
Suggest concrete next steps when appropriate (e.g., "follow up with the 3 at-risk leads", "check the 2 pending shipments").

${snapshot}`;

  // Cap history to last 10 messages to bound token usage
  const history = (body.history ?? []).slice(-10);
  const messages: { role: "assistant" | "user"; content: string }[] = [
    { role: "assistant", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    })),
    { role: "user", content: message },
  ];

  // 6. Call LLM
  try {
    // Dynamic import — z-ai-web-dev-sdk must only run server-side
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json(
        { ok: false, error: "AI returned an empty response — please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    console.error("[coach/chat] LLM call failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI service is temporarily unavailable. Please try again in a moment.",
      },
      { status: 502 }
    );
  }
}
