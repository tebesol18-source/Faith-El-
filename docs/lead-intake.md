# Lead Intake & Verification — Phase 1 Contract

**Status:** implemented 2026-09-26 · supersedes the synthetic lead "research" feature
**Pass condition (owner's wording):** *A user can research or import real companies, inspect evidence for each one, and select actual prospects for outreach.*

## The problem this phase fixes

Until now, every "lead" in the system was fiction: the research endpoint generated
companies like *Heritage Bean Co 24238* with `@example.com` contacts, and the CSV
import accepted anything with no questions asked. A polished outreach email could be
sent to a company that does not exist. All of that has been removed.

## The five rules

1. **Real companies only.** Lead intake happens from a curated directory of real,
   publicly documented coffee importers/roasters (`data/lead-directory.json`) or from
   CSV import where every row must cite a `source_url`. A fiction guard
   (`src/lib/leads-evidence.ts`) rejects reserved email domains
   (`example.com`, `*.test`, `*.invalid`, the platform's own masked domain …) and
   generated/placeholder company names. There is no sandbox flag — if you need demo
   data, use a separate seeded database.

2. **Evidence is stored, not assumed.** Every lead carries at least one
   `lead_sources` row: the source URL, what it documents (`company` / `contact` /
   `both`), the product interest, the date checked, and the result of the latest
   automated reachability check. The DB enforces org-consistency and that an evidence
   row always cites a URL or a note (triggers).

3. **Unverified is the default state.** Directory imports and CSV imports create
   leads with `verification_status = 'unverified'`. Directory entries deliberately
   ship **without contacts** — finding a real person is a human step, recorded as
   contact evidence when the contact is added.

4. **Verification is a human action with an audit trail.**
   `POST /api/leads/[id]/verify` supports:
   - `action: "check"` — automated reachability check of the website and every
     evidence URL. Results are **advisory** evidence (sites go down; offline
     environments exist); they never auto-verify.
   - `action: "confirm"` (level `company` or `contact`) — marks verified. Requires
     at least one evidence row; the actor and timestamp are stamped on the row.
   - `action: "reject"` — marks rejected, with a reason. Terminal for outreach.
   - `action: "reset"` — back to unverified (audited).
   Every action is appended to `lead_verification_log` with the actor.

5. **Outreach is gated.** `ENRICHED → IN_SEQUENCE` (the outreach entry point) is
   refused server-side unless the company is **verified** AND at least one contact
   is **verified** with a valid, non-fictional email. Rejected leads can never
   enter outreach. This is enforced in the API, not just disabled in the UI.

## Multi-tenant lead pool

`leads` used to have a GLOBAL `UNIQUE(company_name, headquarters_country)` — two
exporter organizations could never each track the same real company (both import
"Sucafina" → constraint error). The constraint is now
`UNIQUE(company_name, headquarters_country, organization_id)`, so each org owns its
own relationship with a company while cross-org visibility remains blocked
(404 on IDOR, org-scoped listings).

## API surface

| Route | What it does |
|---|---|
| `GET /api/agents/research-leads` | Browse the curated directory (filters: `country`, `segment`, `q`, `limit`). Never writes. |
| `POST /api/agents/research-leads` | `{directoryKeys: [...]}` imports selected entries as unverified leads with evidence. `{country, segment, count}` imports the first N matching REAL entries. `{enrichLeadId, segment}` classifies an existing lead (tier/VP/language — rule-based). The old fictional generator is gone. |
| `POST /api/leads/import` | CSV/bulk import. Every row needs `source_url` (or an explicit note for offline sources). Fiction guard enforced per row; valid rows import, invalid rows are reported. |
| `GET /api/leads/[id]/evidence` | Lead + evidence rows + contacts + verification audit log (org-scoped). |
| `POST /api/leads/[id]/verify` | `check` / `confirm` / `reject` / `reset` at company and contact level. |
| `POST /api/leads/[id]/contacts` | Add a contact **with mandatory evidence** (`sourceUrl` or note). Rejects fictional emails. |
| `DELETE /api/leads/[id]/contacts?contactId=N` | Soft-delete a contact (+ its evidence rows). |
| `POST /api/leads/[id]/advance` | Unchanged transitions + the outreach gate above. |

`GET /api/leads` now also returns `verificationStatus`, `verifiedBy`, `verifiedTs`,
`evidenceCount`, `contactCount`, `verifiedContactCount` per lead.

## The curated directory (`data/lead-directory.json`)

- 45 real, publicly documented companies in the green-coffee trade
  (importers, traders, roasters) across 18 countries.
- Each entry: company, country, city, segment, website, product interest, and at
  least one **source URL** (its official site) — compiled 2026-09-26 from public
  knowledge, **not** a live crawl. Details may be stale; that is exactly why
  everything imports unverified and requires human verification.
- **No contact persons or emails are included, by design.** Inventing plausible
  contact data is how the fictional-buyer problem started. Find real people and
  record where you found them.
- Extend it with the same shape; never add a company or contact you cannot point to
  a public source for.

## Schema (migration `2026-09-26-lead-evidence`)

- `leads` + `lead_contacts`: `verification_status` ('unverified'|'verified'|'rejected',
  trigger-enforced), `verified_by`, `verified_ts` (verified/rejected requires both —
  DB trigger).
- New `lead_sources` (evidence rows, org-matched to their lead by trigger).
- New `lead_verification_log` (append-only audit).
- Alembic lineage: revision `b7e1f3c9a2d4` (the canonical applier is the Node script;
  alembic is stamped, not run).
- Canonical applier: `node scripts/migrations/2026-09-26-lead-evidence.mjs` (idempotent).

## Data purge performed with this phase

The committed production DB contained the full fictional demo chain. Removed with a
timestamped backup (`/home/z/my-project/backups/pre-fictional-purge-*.db`) via
`scripts/purge-fictional-leads.mjs`:
6 fictional leads ("Heritage Bean Co 24238" etc.), 6 `@example.com` contacts,
15 tags, 1 state-history row, 15 bus events, 3 draft contracts/quotes
(QU-2026-0001/2, CT-2026-0001), 1 pretend-paid invoice (INV-2026-0001) + payment,
1 "Test Buyer Co" sample request, 1 draft shipment. Admin audit-log rows were kept
(real records of real operator actions), per the P3 purge policy.

## Verification evidence

- `npm test` — 266/266 (18 files), hermetic; committed DB sha-identical after run.
- `npm run test:python` — all suites + agent smokes + supervisor tick.
- `npx tsc --noEmit` — 0 errors; `npm run build` — green.
- `node /home/z/my-project/scripts/verify-lead-intake.mjs` — 30/30 live-server
  checks: browse-without-writes, evidence-backed import, org attribution, the full
  gate journey (blocked → verify company → still blocked → add+verify contact →
  allowed), rejected-lead block, CSV fiction rejection, cross-org 404s, audit trail.

## What Phase 1 does NOT do (honest boundary)

- It does not verify companies for you. Reachability checks are advisory; the
  verification decision is human.
- It does not discover contact emails. That is deliberate — automated contact
  scraping has legal/accuracy problems; a human adding a sourced contact is cheap
  and correct.
- The directory is a starter set, not a database of every buyer on earth. Extend it
  deliberately; each extension cites sources.
- Outreach still requires the (separately blocked) email bridge for actual sending —
  that is Phase 2 of the roadmap.
