/**
 * Smoke test for the new /api/coach/chat endpoint.
 *
 * Verifies:
 *   1. Unauthenticated request → 401
 *   2. Authenticated request with valid message → 200 + ok=true + reply
 *   3. Empty message → 400
 *   4. Conversation history is honored (the AI remembers prior turn)
 *
 * Run with: npx tsx scripts/test-coach-chat.mts
 * Requires dev server running on http://localhost:3000
 */

import { getAdminClient } from "../tests/integration/helpers.ts";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function main() {
  console.log("Coach chat smoke test");
  console.log("=====================");

  // 0. Server reachable?
  try {
    const r = await fetch(`${BASE_URL}/api`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok && r.status !== 401 && r.status !== 404) throw new Error(`status ${r.status}`);
    console.log(`[OK] Server reachable at ${BASE_URL}`);
  } catch (err) {
    console.error(`[FAIL] Server not reachable at ${BASE_URL}: ${err.message}`);
    console.error("      Start it with: npm run dev");
    process.exit(1);
  }

  // 1. Unauthenticated → 403 (CSRF middleware rejects before auth check)
  //    or 401 (if CSRF somehow passes). Both are "rejected".
  {
    const r = await fetch(`${BASE_URL}/api/coach/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    const ok = r.status === 401 || r.status === 403;
    console.log(`[${ok ? "OK" : "FAIL"}] Unauthenticated → 401|403 (got ${r.status})`);
    if (!ok) process.exitCode = 1;
  }

  // 2. Authenticated → 200 + ok=true + reply
  const admin = await getAdminClient();
  {
    const r = await admin.fetch(`/api/coach/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What should I focus on today?" }),
    });
    const data = await r.json();
    const ok =
      r.status === 200 &&
      data.ok === true &&
      typeof data.reply === "string" &&
      data.reply.length > 0;
    console.log(
      `[${ok ? "OK" : "FAIL"}] Authenticated → 200 + reply (status=${r.status}, replyLen=${data.reply?.length ?? 0})`
    );
    if (!ok) {
      console.error("      Response:", JSON.stringify(data).slice(0, 400));
      process.exitCode = 1;
    } else {
      console.log(
        `      Reply preview: ${data.reply.slice(0, 160).replace(/\n/g, " ")}...`
      );
    }
  }

  // 3. Empty message → 400
  {
    const r = await admin.fetch(`/api/coach/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });
    const ok = r.status === 400;
    console.log(`[${ok ? "OK" : "FAIL"}] Empty message → 400 (got ${r.status})`);
    if (!ok) process.exitCode = 1;
  }

  // 4. Conversation history honored — tell the AI my name, then ask what it is.
  {
    const r1 = await admin.fetch(`/api/coach/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Please remember that my favorite coffee is Geisha.",
        history: [],
      }),
    });
    const d1 = await r1.json();
    if (!r1.ok || !d1.ok) {
      console.log(`[FAIL] History turn 1 failed: ${JSON.stringify(d1).slice(0, 200)}`);
      process.exitCode = 1;
    } else {
      const r2 = await admin.fetch(`/api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "What is my favorite coffee?",
          history: [
            { role: "user", text: "Please remember that my favorite coffee is Geisha." },
            { role: "assistant", text: d1.reply },
          ],
        }),
      });
      const d2 = await r2.json();
      const mentionsGeisha = (d2.reply || "").toLowerCase().includes("geisha");
      console.log(
        `[${mentionsGeisha ? "OK" : "FAIL"}] History honored — reply mentions "Geisha" (status=${r2.status})`
      );
      if (!mentionsGeisha) {
        console.error("      Reply:", (d2.reply || "").slice(0, 300));
        process.exitCode = 1;
      }
    }
  }

  console.log("=====================");
  console.log(process.exitCode ? "FAIL" : "PASS");
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(2);
});
