# Buyer Identity Masking (Phase 4)

End-to-end masking of **buyer** email identities, complementing the
exporter-side masking shipped in Phases 2–3. Every buyer gets a platform
alias (`buyer.<12hex>@faithelexport.com`); their real address is stored in
exactly one place — the encrypted `buyer_masks` registry — and is decrypted
transiently at the provider boundary (the SMTP `To:` header) and nowhere
else.

```
Exporter dashboard            Resend (SMTP)             Buyer mailbox
   alias only        ──────►  sees real To:  ──────►   matt@falconspecialty.com
      ▲                                                        │
      │ alias only          buyer replies to                   │
      │                     marcus.bell@faithelexport.com ◄────┘
   ┌──┴────────────────────────────────────────────────────────┴──┐
   │ EmailGateway: buyer_masks registry (HMAC lookup + AES-GCM)   │
   └──────────────────────────────────────────────────────────────┘
```

## Guarantees (enforced + tested)

| Surface | Buyer identity shown |
|---|---|
| `message_threads.buyer_email` | alias |
| `inbox_messages.from_addr` / `to_addr` | alias |
| Event bus payloads (`MESSAGE_SENT`, `MESSAGE_RECEIVED`, …) | alias |
| Gateway / provider / StateManager logs | alias or "withheld" — never the real address |
| `GET /api/inbox` (conversations + messages) | alias; legacy unhealed rows are redacted to a placeholder, never emitted |
| Compose form (`InboxPage`) | alias (or "assigned on first send"); the form holds no real address — the client sends only `leadId` |
| AI triage prompt (`MessageAIProcessor`) | alias + redacted body — the real address never reaches the LLM |
| Stored raw webhook payload | redacted (registered real addresses replaced) + CC/BCC keys stripped |
| `buyer_masks.real_email_encrypted` | the ONLY home of the real address (AES-256-GCM, org-bound AAD) |

## The registry (`buyer_masks`)

- `lookup_key` = HMAC-SHA256(HKDF(BUYER_MASK_SECRET), `"{org}:{email}"`) —
  **deterministic**: the same (org, address) always resolves to the same row,
  with no plaintext email in any index.
- `alias_address` = `buyer.<12hex>@<inbound domain>` — deterministic per
  (org, address), globally unique, random-suffix retry on collision.
- `real_email_encrypted` = AES-256-GCM, AAD = `organization_id` (a ciphertext
  from org A cannot be decrypted as org B).
- Tenant isolation: `UNIQUE(organization_id, lookup_key)` — the same
  real-world buyer tracked by two orgs gets two independent masks with
  different aliases; neither org can resolve or use the other's.
- Lifecycle: `active → revoked` (terminal). A revoked mask blocks BOTH
  directions: inbound from that address is rejected, outbound resolution
  refuses. Revocation is a deliberate admin action (`StateManager.
  revoke_buyer_mask`), never automatic.

## Routing rules (fail closed everywhere)

**Outbound (`EmailGateway.send`)**
1. Tenant check: the lead must belong to the caller's org (unchanged).
2. Recipient resolution — the registry, never the client, decides:
   - **Alias input** (how the UI sends): must exist, be ACTIVE, and belong
     to the caller's org. Unknown / revoked / cross-tenant → `send_refused`.
   - **Real-address input** (first contact / Agent 3): must be a registered
     contact of that lead in that org — the Phase 1 verified-contact outreach
     gate, now enforced at the gateway itself as defense in depth.
3. Provider gets the real address (delivery requires it); everything stored,
   logged, or emitted carries the alias.
4. CC/BCC: **outbound platform email carries no CC/BCC, ever.** The bridge
   rejects any request containing `cc`/`bcc` (or unknown) keys with a 422
   before the gateway runs — every CC'd address would be disclosed to all
   recipients and would bypass masking.

**Inbound (`EmailGateway.process_inbound`)**
1. Svix signature verification + replay window + idempotency (provider
   message id) — unchanged from Phase 2.
2. The real `From:` is resolved through the deterministic HMAC lookup:
   registered → alias; revoked → rejected; unknown → org-scoped lead-contact
   fallback (registers a mask on first contact); still unknown → rejected
   **without echoing the address** in the reason or logs.
3. Content redaction before storage: every *registered* real address found
   in subject/body/quoted text/signatures is replaced with its alias; CC/BCC
   keys are stripped from the stored raw payload.
4. The AI processor receives the alias + redacted body.

**Replies (`EmailGateway.reply`)** resolve the thread's alias through the
registry; legacy plaintext threads are self-healed first (below).

## Legacy self-healing (audited, never silent)

The Alembic migration (`a7b8c9d0e1f2`) is **schema-only** — it never
rewrites data and never needs the secret. Threads created before Phase 4
keep their plaintext `buyer_email` until the gateway first touches them
(send / reply / inbound), at which point
`StateManager.heal_thread_buyer_mask`:

1. registers the plaintext address in the encrypted registry,
2. links the thread (`buyer_mask_id`) and stores the alias in `buyer_email`,
3. rewrites that thread's message rows (`from_addr`/`to_addr`/`reply_to`)
   to the alias and redacts stored bodies/subjects/raw payloads,
4. logs exactly what changed (identified by alias — the real address is
   never in the log line).

The heal is idempotent and preserves everything: the real address is
*moved into* the registry, not deleted. As a final safety net, the Next.js
inbox API refuses to emit any buyer address that is not on the platform
domain (unhealed legacy rows are redacted to a placeholder client-side of
the API).

## Secret management (`BUYER_MASK_SECRET`)

- Untracked (`.env`), never committed, never logged. Derives three
  independent HKDF subkeys (lookup / AEAD / alias).
- **Fail closed**: without it the gateway refuses sends and rejects inbound
  rather than storing any buyer address in plaintext.
- **Rotation is not free**: lookup keys and ciphertexts are derived from the
  secret. Rotating requires a re-encryption migration with both old and new
  secrets, or accepting that legacy real addresses become unrecoverable
  (aliases keep working; a new first-contact send would create a fresh mask
  for the same buyer).

## Honest limitations (documented, not hidden)

1. **The transport layer sees real addresses.** Resend necessarily receives
   the real `To:` on outbound, and the buyer's real `From:` arrives in the
   webhook. Masking is a platform/storage/UI guarantee, not cryptography at
   the mail provider. The provider logs never contain the recipient
   ("withheld"), but the provider itself is trusted by necessity.
2. **Buyers see their own addresses** in their own mail clients, and a
   buyer's mail client will include their real address in quoted replies
   back to us (redacted on storage) and in anything they forward to third
   parties outside the platform.
3. **Redaction covers registered addresses only.** Unknown third-party
   addresses inside quoted/forwarded content remain visible — we only
   redact identities we are custodians of.
4. **The CRM keeps verified contact data.** The Leads page (Phase 1
   verified-contact evidence display) intentionally still shows the org's
   own verified contact emails — that is the outreach gate's source of
   truth. Messaging surfaces (inbox, threads, messages) are alias-only.
5. **First contact necessarily uses the real verified address** at the
   provider boundary (the buyer has never seen our alias yet); from the
   first send onward, every platform surface shows only the alias.

## Where the code lives

| Piece | File |
|---|---|
| Crypto + redaction primitives | `coffee_export/coffee_export/messaging/masking.py` |
| Registry model | `coffee_export/coffee_export/database/models/messaging.py` (`BuyerMask`) |
| Migration (schema-only) | `coffee_export/alembic/versions/a7b8c9d0e1f2_buyer_masks_registry.py` |
| Registry + heal | `coffee_export/coffee_export/state/state_manager.py` (BUYER MASK REGISTRY section) |
| Bidirectional gateway | `coffee_export/coffee_export/messaging/gateway.py` |
| CC/BCC policy + bridge API | `coffee_export/coffee_export/messaging/webhook.py` |
| Alias-only API | `src/app/api/inbox/route.ts` |
| Alias join for compose | `src/app/api/leads/route.ts` (`maskedBuyer`) |
| Compose UI (alias-only) | `src/components/pages/InboxPage.tsx` |
| Python tests | `coffee_export/tests/test_buyer_masking.py` (+ updated `test_messaging_gateway.py`, `test_email_security.py`) |
| JS integration tests | `tests/integration/phase4-masking.test.ts` (spawns the real bridge, dry-run) |

## Dry-run status

No `RESEND_API_KEY` is configured: the provider stores messages with
`dry-run-…` ids and **delivers nothing**. Real sending requires owner
approval and real Resend credentials, exactly as in Phase 3. The masked
round-trip (outbound → inbound webhook → alias routing) is fully tested in
dry-run through the real bridge process.
