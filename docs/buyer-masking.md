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
| Gateway / provider / StateManager logs | alias or "withheld" — never the real address; provider error bodies are never echoed (they can quote the recipient) |
| `GET /api/inbox` (conversations + messages) | alias; on unhealed legacy threads BOTH identity fields AND content (subject/body/preview) are redacted to placeholders — no buyer address is ever emitted |
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
4. **Outbound content is redacted too** (SR-1): registered real addresses
   the operator pastes into a subject/body are replaced with the alias
   before the message is stored, logged, published in events, or handed to
   the provider — the recipient sees their own alias even in quoted text.
5. CC/BCC: **outbound platform email carries no CC/BCC, ever.** The bridge
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
3. Content redaction before storage: every *registered* real address (the
   registry row — ACTIVE **or REVOKED**: revocation blocks messaging, not
   redaction hygiene) found in subject/body/quoted text/signatures — plain
   or HTML-entity-encoded — is replaced with its alias; CC/BCC keys are
   stripped from the stored raw payload, which is redacted in full BEFORE
   the 10 000-char audit truncation.
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

### Key rotation runbook (audit → back up → design → re-encrypt → verify → activate → rollback)

**Do not rotate casually.** The registry's `lookup_key`
(HMAC-SHA256 over `"{org}:{email}"`, keyed by a subkey of the secret) and
`real_email_encrypted` (AES-256-GCM under another subkey) are BOTH derived
from `BUYER_MASK_SECRET`. Changing the env var without a re-encryption
(rewrap) migration makes every existing row unresolvable: lookups compute
new keys, find nothing, and the gateway would mint a *second* mask for the
same buyer on their next first-contact send — duplicate identities and a
split thread history. `alias_address`, by contrast, is *stored*, not
derived on read — so a correct rewrap keeps every alias stable (buyers keep
replying to the same address; threads keep pointing at the same alias).

The only safe sequence:

1. **Audit** — inventory the registry (`SELECT organization_id, COUNT(*),
   MIN(created_ts), MAX(created_ts) FROM buyer_masks GROUP BY 1`), confirm
   every referencing surface is alias-based (`message_threads.buyer_email`,
   `inbox_messages.*` — unaffected by re-keying), and record the row count
   per org as the verification baseline.
2. **Back up** — cold copy of the database AND the old secret (into the
   secret manager, not the repo). Restore-test the backup before touching
   anything.
3. **Design** — write a one-off rewrap migration that runs with BOTH
   secrets in the environment (`BUYER_MASK_SECRET_OLD` decrypts,
   `BUYER_MASK_SECRET_NEW` re-keys). For each row: decrypt with the old
   AEAD key (org AAD must verify — a failure means the row was written
   under a third key: STOP), compute the new `lookup_key`, re-encrypt the
   address with the new AEAD key, and keep `alias_address`, provenance
   links and `status` byte-for-byte.
4. **Re-encrypt existing records** — in a maintenance window with the
   email bridge stopped (the gateway fails closed without the correct
   secret, so half-rotated state cannot silently mis-route mail).
5. **Verify** — every row must (a) decrypt under the new secret,
   (b) satisfy `lookup_key(org, decrypted) == stored lookup_key` for ALL
   rows, not a sample, (c) have an unchanged alias, and (d) resolve a test
   send to the same real address as before. Any failure → restore backup.
6. **Activate the new key** — swap `BUYER_MASK_SECRET` to the new value in
   the bridge environment (the only process that reads it) and restart.
7. **Retain controlled rollback** — keep the old secret and the
   pre-rotation backup until the registry has been exercised in production
   (sends + inbound round-trips). Rollback = restore the DB backup and
   reinstate the old secret, accepting that masks created *after* rotation
   are lost — once new activity exists, prefer a forward fix over rollback.

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
6. **Unknown third-party addresses survive redaction.** Redaction covers
   registered identities (any status) — a third party's address quoted by
   the buyer is not ours to mask (see §3 above). Entity-encoded forms of
   *registered* addresses ARE redacted; other encodings (e.g. URL-encoded)
   are not currently covered.
7. **The transport layer error channel**: provider API error bodies are
   never logged or relayed (they can quote request payloads). If Resend
   ever changes its error format, this holds regardless — only HTTP status
   codes cross the boundary.

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

## Independent security review (SR-1, post-e761504)

An independent reviewer audited e761504 against the full masking surface
(crypto, gateway routing, registry isolation, repo-wide leakage, 17
adversarial cross-tenant probes, Svix verification). Verdict: the core
invariant holds — every cross-tenant probe was refused without address
echo — with four edge findings, all fixed in the review-fix commit:

1. Revoked buyers' addresses now redact like active ones (resolver covers
   any registry row).
2. Legacy self-heal rewrites `thread.subject` too, and replies re-fetch the
   message after the heal (no stale pre-heal subject).
3. Operator-authored outbound subject/body redacted before storage/events.
4. Provider error bodies never logged or relayed (status code only).

Plus hardening: legacy dev webhook scheme gated behind
`EMAIL_ALLOW_UNSIGNED_WEBHOOKS=1` (replayable, no timestamp), redact-then-
truncate on the raw payload, unified unknown/cross-org alias error (no
tenant-existence oracle), org-scoped inbound idempotency, deterministic
thread pick when multiple open threads exist, heal refuses foreign-org
aliases, HTML-entity-encoded address redaction, and the rotation runbook
above.
