# Logistics Command Center

**Module**: Logistics Resource & Shipment Management
**Replaces**: the previous AI-agent shipments page and its autonomous booking workflow
**Status**: functional (see the [capability contract](#capability-contract) — what is real, what is external, what is future)

The Logistics Command Center is the honest version of logistics management for a
coffee exporter: find real logistics services, record real external bookings, manage
containers, and track every shipment from origin to destination — **without ever
pretending Faith-El contacted, booked or tracked anything with an external provider.**

---

## Capability contract

Every visible action in the module falls into exactly one of three categories. This
is the contract the UI is built against; if you change a component, keep it true.

### FUNCTIONAL INSIDE FAITH-EL (fully real, DB-backed)

| Capability | Where |
|---|---|
| Provider directory (add / edit / verify / deactivate) | `logistics_providers` table + `/api/logistics/*` |
| Create shipment records from signed contracts (with 18-step export checklist) | `POST /api/shipments` |
| Record external bookings (reference, containers, dates, confirmation upload) | `POST /api/logistics/bookings` |
| Container lifecycle (15 states, dates, per-container events) | `/api/logistics/containers` |
| Inland transport legs with real references | `/api/logistics/shipments/[id]/transport` |
| Shipment timeline (stored events only + manual external updates) | `/api/logistics/shipments/[id]/events` |
| Checklist progress with per-step human attestation (who + when) | `/api/logistics/shipments/[id]/checklist` |
| Dashboard statistics (8 cards, real aggregates, honest zeros) | `/api/logistics/dashboard` |
| Booking confirmation uploads (hashed storage, tenant-checked download) | `/api/logistics/documents` |
| Next-actions/task derivation (from stored facts: dates, missing docs, status) | detail bundle + dashboard routes |
| Multi-tenant isolation (org-scoped queries everywhere; global providers read-only for tenants) | all routes |

### EXTERNAL ACTION REQUIRED (opens the provider's official channel — never simulated)

| Action | Mechanism |
|---|---|
| Call a provider | `tel:` link with the **stored** phone number (shown only when stored) |
| Email a provider | `mailto:` link with the stored address |
| Open website / booking / tracking / empty-container pages | `target=_blank` links to **stored official URLs** — the buttons do not render when no URL exists |
| Place the actual booking / check availability / get a quote / track a container | Happens on the provider's channel. Faith-El only records the outcome. Cards and modals say so explicitly ("Faith-El finds providers to contact — availability is confirmed by the provider", "Faith-El does not book or track on its own"). |

### FUTURE API INTEGRATION (deliberate seam, no fake implementations)

`coffee_export/logistics/adapters.py` defines `LogisticsProviderAdapter`
(`get_availability` / `get_quote` / `create_booking` / `get_booking` / `get_tracking` /
`cancel_booking`). **Every provider today returns `NOT_CONNECTED`** — the only honest
answer, because no logistics API integration exists. The DB column
`logistics_providers.integration_status` (`external` today) is the switch a real
integration will flip; the API **refuses** to set it to `api_connected` and the UI
already branches on it, so a future integration needs no UI redesign.

---

## ESL — the verified directory entry

The seeded global provider is **Ethiopian Shipping and Logistics (ESL)**, the
national carrier. Every stored field was checked against ESL's official web
presence on **2026-10-08**:

| Field | Value | Source |
|---|---|---|
| Name | Ethiopian Shipping and Logistics (ESL) | esl.et |
| Type | national_carrier | esl.et |
| Phone | +251115518280 | eslse.et "Overview of ESL" |
| Email | esl@eslse-et.com | eslse.et "Overview of ESL" |
| Address | Ras Mekonen Street, Leghar behind Ethiopian Insurance Corporation H.Q., Addis Ababa, Ethiopia (P.O.BOX 11551) | eslse.et |
| Website / booking / tracking | https://esl.et/ | esl.et (canonical) |
| Empty containers | https://www.eslse.et/ | eslse.et (enterprise portal incl. Empty Container Suppliers Portal) |
| Hours | Monday–Friday 8:00AM–5:30PM | eslse.et |

`official_source_url` and `last_verified_at` record provenance. `verified=1` means
exactly "checked against these official sources on this date" — nothing more.
`integration_status` is **`external`**: Faith-El has no ESL API, does not book
through ESL, does not crawl ESL, and does not pretend to. All ESL actions in the UI
open official channels or record operator attestations.

**Re-verification policy**: "Verified" is a point-in-time mark. Admins re-verify via
`PATCH /api/logistics/providers/[id] {action:"verify", official_source_url}` after
checking details against an official source; the source + date are stored. Details
that cannot be verified against an official source must not be marked verified.

---

## Data model (migration `b9d0e1f2a4b5`)

| Table | Purpose |
|---|---|
| `logistics_providers` | Provider directory. `organization_id NULL` = global shared row (platform-managed); org rows are private. Capability flags are data-driven. |
| `logistics_bookings` | Records of REAL external bookings (operator attestations with the provider's own reference). |
| `logistics_containers` | Physical container lifecycle: REQUESTED → AVAILABLE → BOOKED → ALLOCATED → PICKED_UP → AT_WAREHOUSE → STUFFED → SEALED → IN_TRANSIT → AT_PORT → LOADED_ON_VESSEL → DEPARTED → ARRIVED → DELIVERED (or CANCELLED). |
| `logistics_events` | Shipment timeline. Events are written ONLY when something happened — never generated for display. |
| `logistics_checklist_items` | The 18-step export checklist, seeded per shipment from `data/logistics-checklist-template.json` (shared single source with the Python runtime). |
| `logistics_transport_segments` | Inland legs (trucking / rail / barge / port handling / warehouse) with real references. |

## API surface

| Route | Methods | Notes |
|---|---|---|
| `/api/logistics/providers` | GET, POST | List (own + global) · admin create (unverified, URL-validated) |
| `/api/logistics/providers/[id]` | GET, PATCH | Update · `action:"verify"` (source required) · deactivate · global rows platform-org only |
| `/api/logistics/containers` | GET, POST | Org-scoped; shipment/booking/org checked |
| `/api/logistics/containers/[id]` | PATCH | Status + date updates; status changes write timeline events |
| `/api/logistics/bookings` | GET, POST | Record external booking (reference mandatory; container numbers → BOOKED container rows; shipment → booked) |
| `/api/logistics/bookings/[id]` | PATCH | Correct details / confirm / cancel (with events) |
| `/api/logistics/shipments/[id]` | GET | Detail bundle: shipment, checklist (auto-seeded), bookings, containers, transport, events, customs docs, next actions |
| `/api/logistics/shipments/[id]/checklist` | GET, PATCH | Human toggles (attestation: who + when) |
| `/api/logistics/shipments/[id]/events` | GET, POST | Stored timeline · manual external updates |
| `/api/logistics/shipments/[id]/transport` | GET, POST | Inland legs |
| `/api/logistics/dashboard` | GET | 8 real stat cards + attention roll-up (honest zeros) |
| `/api/logistics/documents` | POST, GET | Confirmation upload (sha256-hashed, ≤10MB, PDF/PNG/JPG) · tenant-checked download |
| `POST /api/shipments` | POST | Carrier now optional; seeds the checklist + a `shipment_created` event |

## Event semantics (Agent 6 honesty reshape)

* `SHIPMENT_CREATED` — a shipment RECORD was created (from CONTRACT_SIGNED or the
  UI). Publishing this **never** implies a booking exists.
* `SHIPMENT_BOOKED` — published **only** when an operator records a real external
  booking (`record_external_booking`); the payload carries the provider's own
  booking reference as evidence.
* Timeline events record `source` (operator/agent) and `created_by` for every
  human attestation (checklist toggles, manual updates, bookings).

## Honest limitations

* Faith-El has **no logistics API integrations**. Availability checks, quotes,
  bookings, cancellations and live tracking all happen on provider channels.
* The dashboard's "Delayed / holds" and attention items reflect **recorded** data;
  a delay nobody entered is invisible until entered.
* Container milestones advance when an operator updates them — there is no
  automatic carrier feed.
* `buyer_masks`-style secrets are unrelated to this module; see
  [buyer-masking.md](./buyer-masking.md) for that domain.

## Tests

* Python: `coffee_export/tests/test_logistics_resources.py` (template integrity,
  adapter honesty, directory tenancy, bookings, containers, checklist, transport,
  isolation) + the reshaped `test_agent6.py` — both in the hermetic runner
  (`npm run test:python`).
* JS: `tests/integration/logistics.test.ts` (21 integration tests: directory,
  verification provenance, URL validation, no-fake-integration, booking records,
  container lifecycle, transport, manual events, dashboard zeros, tenant
  isolation, login lockout regression).
