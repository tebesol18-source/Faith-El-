# Email Bridge — Production Readiness & Verification (Phase 2)

> **Phase 4 update — buyer identity masking is live.** Buyers now reply to
> platform aliases (`buyer.<hex>@faithelexport.com`); real buyer addresses
> live only in the encrypted `buyer_masks` registry and appear solely at the
> SMTP transport boundary. The bridge additionally requires
> `BUYER_MASK_SECRET` (fail closed without it) and rejects CC/BCC keys with
> 422. Full policies + honest limitations: **docs/buyer-masking.md**. The
> checklist below still applies; for step 6 also verify the stored thread
> shows the buyer's ALIAS, never their real address.

**Status:** implemented 2026-09-28 · architecture unchanged (Next.js → Python bridge → Resend), hardened for real delivery
**Honest boundary:** nothing in this repo proves real external delivery. Tests below use mocked providers. Real send + real reply can only be verified with real credentials — see the checklist at the bottom, which only the owner can perform.

## Configuration matrix

| Variable | Where it's read | What it does | If missing |
|---|---|---|---|
| `RESEND_API_KEY` | Python bridge (`ResendEmailProvider.__init__`) | Real outbound delivery via `POST api.resend.com/emails` | Provider runs in **DRY-RUN** (stored, ids `dry-run-…`, never delivered, clearly labeled everywhere) |
| `RESEND_WEBHOOK_SECRET` | Python bridge (`verify_webhook_signature`) | Verifies inbound webhooks (real Resend/Svix scheme: `svix-id` + `svix-timestamp` + `svix-signature`, HMAC-SHA256-base64 over `{id}.{ts}.{body}`, `whsec_` key) | Inbound webhooks are **REJECTED** (fail closed) |
| `EMAIL_BRIDGE_SECRET` | Python bridge (`_verify_bridge_token`) + Next.js (`src/app/api/inbox/route.ts`) | Bearer auth between Next.js API and the bridge | Bridge calls are **REJECTED** (fail closed) |
| `EMAIL_BRIDGE_URL` | Next.js + supervisor.js | Where the bridge listens (default `http://localhost:8000`) | default used |
| `INBOUND_EMAIL_DOMAIN` | Python bridge (gateway + provider) | Domain of the masked addresses buyers see/reply to | `faithelexport.com` |
| `EMAIL_ALLOW_UNSIGNED_WEBHOOKS=1` | Python bridge | **Dev-only**: accept unsigned webhooks / unauthenticated bridge calls with a loud warning | unset (fail closed) |

Set these in the environment of the process running the bridge (`uvicorn coffee_export.messaging.webhook:app`), and for Next.js / supervisor in their own environment. Never in client bundles, logs, Git, or chat.

## What Phase 2 changed (audit-driven, in-place — no architecture replacement)

1. **Real Resend webhook signatures.** The old verifier (plain hex-HMAC over the raw body, `v1,` tokens) could never verify a real Resend delivery. Now implements the actual Svix scheme (base64 HMAC over `{svix-id}.{svix-timestamp}.{raw_body}` with the base64-decoded `whsec_` key, `t=…,v1=…` header parsing, 5-minute replay window). The legacy scheme still verifies for local/dev fixtures.
2. **Fail-closed secrets.** Missing `RESEND_WEBHOOK_SECRET` or `EMAIL_BRIDGE_SECRET` now REJECTS instead of silently accepting; the dev override is explicit (`EMAIL_ALLOW_UNSIGNED_WEBHOOKS=1`) and loud.
3. **Idempotent inbound.** Resend retries webhooks on non-2xx/timeouts. `process_inbound` now deduplicates by `provider_message_id` and returns `action: "duplicate"` (HTTP 200) so retries can't double-store messages or double-count unread stats.
4. **Tenant attribution on the Python side.** The ORM models now map `organization_id` (the DB columns existed but were never written by Python — every bridge write silently landed in `org-system`, hiding threads from their real org). Inbox/thread/message writes are org-attributed; `EmailGateway.send` refuses leads outside the caller's org (`send_refused` → 403); `reply` enforces the message's org (`reply_refused` → 403); inbound buyer resolution (`_resolve_buyer`) is scoped to the inbox's org, so the same real-world buyer tracked by two orgs can no longer cross-route.
5. **First-contact path.** `POST /api/inbox` now supports `leadId` + `buyerEmail` (+ subject) for the first email of a conversation — until now a fresh exporter could never start one (reply-only API). Fiction guard applies: reserved/test buyer domains are refused.
6. **Proper reply threading.** `POST /api/inbox` with `messageId` routes through the bridge's `/api/bridge/reply`, which sets `In-Reply-To`/`References` headers and the `Re:` subject so the buyer's mail client threads the reply. The UI uses this automatically when replying to an inbound message.
7. **Honest supervisor execution.** Approved `send_email` actions now go through the REAL bridge (masked address, Resend or labeled dry-run). On failure the action is marked `execution_failed`, the lead is NOT advanced, and the error is logged — no more fake "email sent" log lines. Approved `create_contract` actions now insert the **drafted, approved terms** (incoterm/volume/value) instead of hardcoded 100 bags/$500/FOB, and attribute the org.
8. **Honest inbox UI.** Send states are visible (sending / sent / failed with the actual error), dry-run sends are labeled (`DRY-RUN` notice after sending + badge on stored dry-run messages), and the stale "using mock data" console warning is gone (the UI shows an empty inbox on API failure — it never showed mock data, the message was a lie).
9. **Tolerant inbound parsing.** Handles both the real Resend `email.inbound` shape (`data.email.*`, `from` as object) and the legacy dev fixture shape.

## Domain changes (masked addresses)

- Masked addresses are generated from `INBOUND_EMAIL_DOMAIN` at inbox creation and **stored on the inbox row**. Threads/messages reference the inbox — nothing is erased or orphaned when the domain changes.
- After a change: new conversations use the new domain; existing threads keep replying from the OLD stored masked address (they stay consistent).
- Mail a buyer sends to an OLD masked address keeps arriving **only if** you keep an inbound route (or catch-all forward) for the old domain in Resend. Plan the domain switch while no active conversations are mid-flight, or keep the old domain routed.

## Deployment sketch (bridge)

```
# On the host with a public HTTPS endpoint (e.g. behind Caddy/nginx):
cd <repo>/coffee_export
export COFFEE_DATABASE_URL=sqlite:////absolute/path/to/state/coffee_export.db
export RESEND_API_KEY=re_...            # real delivery
export RESEND_WEBHOOK_SECRET=whsec_...  # inbound verification
export EMAIL_BRIDGE_SECRET=<random>     # same value as the Next.js side
export INBOUND_EMAIL_DOMAIN=mail.your-domain.com
uvicorn coffee_export.messaging.webhook:app --host 0.0.0.0 --port 8000
# Health:  GET  https://<host>/health
# Config:  GET  https://<host>/webhooks/email/test   (shows dry_run + secret flags, never values)
```

Then in the Resend dashboard: Domains → verify the sending domain; Webhooks → endpoint `https://<host>/webhooks/email/inbound`, subscribe to the **inbound email** event types; copy the `whsec_…` signing secret into `RESEND_WEBHOOK_SECRET`.

## Tests vs. reality

- `coffee_export/tests/test_bridge_endpoints.py`, `test_messaging_gateway.py` (+ Phase-2 additions): mocked providers / throwaway DBs. They prove routing, auth, dedup, tenant isolation, and signature logic — **not** external delivery.
- `tests/integration/inbox-bridge.test.ts` (JS): full Next.js chain against a throwaway DB with a stubbed bridge — proves the new conversation/reply/IDOR/failure-honesty contracts.
- **Real delivery remains unverified until the owner checklist below is executed with real credentials.**

## Owner manual verification checklist (when credentials + domain are ready)

Do everything from the owner's own machine/services. Never paste secrets into chat or commit them.

1. **Resend key** — create a dedicated sending key with the narrowest available permission/domain scope (Resend dashboard → API Keys). Store it in your secret manager.
2. **Domain + sender** — verify the sending domain in Resend (DKIM/SPF records), confirm the sender identity you'll send from.
3. **Secrets** — set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_BRIDGE_SECRET`, `INBOUND_EMAIL_DOMAIN`, `COFFEE_DATABASE_URL` in the bridge's environment; `EMAIL_BRIDGE_URL` + `EMAIL_BRIDGE_SECRET` on the Next.js side. Confirm `GET /webhooks/email/test` shows `dry_run: false` and both secrets configured.
4. **Bridge public** — deploy the bridge at a public HTTPS endpoint; `GET /health` → ok; call `/api/bridge/send` without the bearer token → 401 (proves auth is on).
5. **Webhook endpoint** — configure `https://<host>/webhooks/email/inbound` in Resend for inbound email events; save the signing secret; send a signed test from the dashboard if available.
6. **Real send** — from the Faith-El inbox UI, compose a message to an email address YOU control (not a real buyer). Verify it arrives; check the `From:`/`Reply-To:` show only the masked address; confirm the message appears in the Faith-El thread with a real provider id (not `dry-run-…`).
7. **Real reply** — reply from that inbox. Verify the reply lands in the SAME Faith-El thread, unread count increments, the masked identity is preserved, and the exporter's real email appears nowhere (inspect the raw email headers too).
8. **Isolation spot-check** — log in as a second org's operator: the thread must be invisible (and the IDOR probe must 404).
9. **Evidence** — save redacted proof: timestamps, provider message ids, webhook event status, screenshots. Never save the API key or full message bodies.
