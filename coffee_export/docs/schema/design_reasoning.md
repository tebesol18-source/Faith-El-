# Database Schema — Design Reasoning

## Overview

This document explains the reasoning behind every table, relationship, and
design decision in the coffee export database schema. The schema has **33
tables** across **8 domains**, designed to support Agents 1–7 and scale
from 698 leads (current) to 50,000+ leads with multiple operators and
concurrent agents.

## Design Principles

### 1. Normalization to 3NF

**Problem:** The prototype had `decision_maker_1_name`, `decision_maker_1_title`,
`decision_maker_1_linkedin`, `decision_maker_1_email`, `decision_maker_2_*` as
columns on the leads table. This is a repeating group — if a company has 5
decision makers, we'd need 20 columns.

**Solution:** A separate `lead_contacts` table. Each contact is a row.
A lead can have unlimited contacts. This is 1:many normalization.

**Applied to:**
- Lead contacts (was `decision_maker_1_*`, `decision_maker_2_*`)
- Washing stations (was a string on `lots`; now `washing_stations` table with FK)
- Coops (was a string on `lots`; now `coops` table with FK)
- Sample lots (was implicit; now `sample_request_lots` junction table)
- Contract items (now `contract_line_items` junction table)
- Shipment items (now `shipment_items` junction table)

### 2. Soft Deletes

**Problem:** Hard deletes break audit trails. If you `DELETE FROM leads
WHERE lead_id = 'L-2026-00047'`, the state_history, outreach_touches,
samples, contracts — all become orphans.

**Solution:** Every business table has a `deleted_ts` column (nullable).
When set, the record is "deleted" but remains in the database. Queries
filter `WHERE deleted_ts IS NULL`.

**Exception:** Temporary data (expired reservations, fulfilled waitlist
entries) can be hard-deleted by a cleanup job.

### 3. Human-Readable Business IDs

**Problem:** Auto-increment integers (`1, 2, 3...`) are meaningless to
humans. An operator looking at "lead 42" has no context.

**Solution:** Business entities use formatted IDs:
- Leads: `L-YYYY-NNNNN` (e.g., `L-2026-00047`)
- Lots: `LOT-YY-NNNN` (e.g., `LOT-25-0001`)
- Sample requests: `SR-YYYY-NNNN` (e.g., `SR-2026-0142`)
- Contracts: `CT-YYYY-NNNN` (e.g., `CT-2026-0023`)
- Shipments: `SH-YYYY-NNNN` (e.g., `SH-2026-0015`)

Junction tables and audit logs use auto-increment integers (performance).

### 4. PostgreSQL-Portable Types

| SQLite type | PostgreSQL equivalent | Notes |
|-------------|----------------------|-------|
| `TEXT` | `TEXT` or `VARCHAR(n)` | SQLite TEXT is unlimited; Postgres TEXT is also unlimited |
| `INTEGER` | `INTEGER` or `BIGINT` | For IDs, counts, booleans (0/1) |
| `REAL` | `DOUBLE PRECISION` or `REAL` | For scores, prices, coordinates |
| `INTEGER` (0/1) | `BOOLEAN` | SQLite has no native BOOLEAN; use CHECK constraint |

**Avoided:** SQLite-specific types like `NUMERIC` (which has quirky behavior),
`BLOB` (use TEXT path instead).

### 5. Audit Fields on Every Table

Every table has:
- `created_ts` — when the row was inserted
- `updated_ts` — when the row was last modified

Business tables also have:
- `created_by` — which agent or operator created it
- `updated_by` — which agent or operator last modified it
- `deleted_ts` — soft delete timestamp (nullable)

### 6. Indexes on FKs + Common Queries

Every foreign key gets an index (SQLite doesn't auto-index FKs; Postgres
doesn't either). Plus indexes on:
- `leads.current_state` — dashboard filters by state
- `leads.priority_tier` — agents process S-tier first
- `leads.current_agent` — agent picks up its own leads
- `leads.next_action_due_ts` — what's due now
- `lots.status` + `lots.eudr_data_status` — inventory filtering
- `lots.region` + `lots.process` — lot matching algorithm

### 7. CHECK Constraints for Enums

Allowed values are enforced at the database level, not just in Python:
```sql
CHECK (current_state IN ('NEW', 'ENRICHED', 'IN_SEQUENCE', ...))
CHECK (priority_tier IN ('S', 'A', 'B', 'C', 'Disqualify'))
CHECK (process IN ('Washed', 'Natural', 'Honey', 'Anaerobic'))
```

This prevents invalid data even if a bug bypasses the StateManager.

---

## Domain: Infrastructure (3 tables)

### `agents`
**Purpose:** Registry of the 7 agents. Each agent has a name, description,
and status (active/paused/disabled). This allows the AgentRunner to query
"which agents should run now?" and provides a FK target for `created_by`
fields throughout the schema.

**Why a table (not hardcoded)?** Future agents might be added. The operator
can pause an agent without code changes. Audit logs reference `agent_id`
rather than a string — no typos possible.

### `operators`
**Purpose:** Human users who can intervene (approve samples, unblock leads,
QA release lots). Each operator has a name, email, role, and status.

**Why separate from agents?** Humans and AI agents have different
permissions and behaviors. The `created_by` / `updated_by` columns
throughout the schema accept either an `agent_id` or `operator_id` —
enforced by a CHECK constraint that exactly one is non-null.

### `audit_log`
**Purpose:** Generic audit trail for ALL entities. Any state change on any
table can be logged here with: entity type, entity ID, action (insert/
update/delete), old values (JSON), new values (JSON), who changed it, when.

**Why generic (not per-table)?** A single audit table is easier to query
("show me everything that happened to lead L-2026-00047 across all tables")
and easier to maintain (one table, one set of indexes).

**Trade-off:** Can't enforce FK constraints on `entity_id` (it's polymorphic).
This is acceptable — the application layer (StateManager) ensures valid
references.

---

## Domain: Lead (4 tables)

### `leads`
**Purpose:** The core entity — a buyer company. Contains company name,
headquarters country, and the **denormalized** `current_state`,
`current_agent`, `priority_tier`, `recommended_vp`, `outreach_language`.

**Why denormalize state?** The `lead_state_history` table has the full
audit trail, but querying "all leads in QUALIFIED state" would require a
subquery on history every time. Storing `current_state` on `leads` with an
index makes dashboard queries O(1).

**Unique constraint:** `(company_name, headquarters_country)` — prevents
duplicate leads. The Agent 2 enrichment script generates a `source_row_hash`
(SHA1 of company+country) for fast dedup checks.

### `lead_contacts`
**Purpose:** Multiple decision makers per lead. Each contact has name,
title, LinkedIn URL, email, phone, and a `is_primary` flag.

**Why separate?** A company might have a CEO (decision maker), a head of
coffee (actual buyer), and a sustainability lead (influencer). Agent 3
needs to contact the right person — storing all of them lets the
StateManager pick the best one (buyer title preferred).

### `lead_tags`
**Purpose:** Free-form tags (fairtrade, organic, microlot, eudr-aware,
VIP, do-not-contact). Many-to-many: a lead can have many tags, a tag can
be on many leads.

**Why not a JSON column?** Tags need to be queryable ("find all leads
with tag='organic'"). A junction table with an index on `tag` is faster
than JSON extraction in SQLite.

### `lead_state_history`
**Purpose:** Append-only audit trail of state transitions. Every time a
lead's state changes, a row is inserted here — never updated, never deleted.

**Why separate from `audit_log`?** Lead state transitions have a specific
state machine (enforced by the StateManager) and are queried frequently
("show me the full history of this lead"). A dedicated table with a FK
to `leads` is cleaner than filtering the generic audit log.

---

## Domain: Outreach & Qualification (3 tables)

### `sequence_templates`
**Purpose:** Defines the outreach sequences (Sequence A: LinkedIn-first,
Sequence B: Email-first). Each template has 6 steps with channel, timing,
and message template reference.

**Why a table?** Sequences evolve. The operator might add a Sequence C
(WhatsApp-first for MENA buyers) without code changes. Agent 3 reads
the template to know what to do at each step.

### `outreach_touches`
**Purpose:** Individual outreach events — each LinkedIn message, email,
or phone call is a row. Tracks: step number, channel, direction (outbound/
inbound), content summary, sent_ts, response_ts, response_content.

**Why one row per touch?** This lets us calculate:
- Response rate per channel (LinkedIn vs email)
- Average response time
- Which step gets the most replies
- Which sequence template converts best

A JSON column on `leads` couldn't answer these questions efficiently.

### `qualification_answers`
**Purpose:** The Q1–Q5 QUAL gate answers. Each answer is a row: lead_id,
question (Q1–Q5), answer, answer_ts, answered_by (agent or buyer).

**Why separate?** Questions might be re-asked (buyer's volume changes
over time). Multiple answers per question create a history. The
StateManager checks "are all 5 Qs answered with positive values?" to
pass the QUAL gate.

---

## Domain: Inventory (7 tables)

### `coops`
**Purpose:** Cooperatives that own washing stations. Normalized out of
the `lots` table so we can query "all lots from Yirgacheffe Union" and
track coop-level certifications.

### `washing_stations`
**Purpose:** Washing stations, each belonging to a coop. Normalized so
we can track station-level GPS coordinates (for EUDR), station-level
cupping score history, and station-level capacity.

**FK:** `coop_id → coops.id`

### `lots`
**Purpose:** Coffee lots — the core inventory entity. Each lot has region,
process, screen size, cupping score, defect count, moisture, crop year,
stock level, EUDR data, and status.

**FKs:** `washing_station_id → washing_stations.id`

**EUDR columns on `lots`:** GPS lat/lon, farmgate price, deforestation
attestation. These are 1:1 with the lot, so columns are appropriate (not
a separate table). If we later need multiple plot polygons per lot, we'd
add a `lot_plots` table.

### `stock_movements`
**Purpose:** Audit trail of stock changes. Every time stock changes
(sample pulled, lot committed to contract, lot depleted, stock corrected),
a row is inserted: lot_id, delta (positive or negative), reason, timestamp.

**Why not just update `lots.stock_bags_remaining`?** Because you lose
the history. "Why did stock drop from 45 to 30?" is unanswerable without
this audit trail. The `lots.stock_bags_remaining` column is the current
balance; `stock_movements` is the ledger.

### `lot_reservations`
**Purpose:** 7-day holds on lots for sample dispatch. Prevents two
sample requests from double-counting the same stock.

**FKs:** `lot_id → lots.id`, `lead_id → leads.id`

### `lot_feedback`
**Purpose:** Rejection feedback from buyers. Each rejection is a row:
lot_id, buyer, segment, reason, timestamp. The StateManager auto-flags
QA when ≥2 rejections match critical keywords (musty, fermented, etc.).

### `qa_flags`
**Purpose:** Audit trail of QA holds. When a lot is flagged (auto or
manual), a row is inserted here and `lots.status` is set to 'hold'.
When released, the lot returns to 'active' but the flag record remains
for audit.

---

## Domain: Sample (7 tables)

### `sample_requests`
**Purpose:** The sample dispatch record. One per sample cycle. Contains:
sample type (A/B/C/fallback), buyer, shipping address, crop year, status
(dispatched/delivered/feedback_due/decided/ghosted).

### `sample_request_lots`
**Purpose:** Junction table — a sample request can include 1–5 lots.
Each row links a lot to a sample request with the quantity sent.

**Why not a comma-separated list?** Junction tables are queryable:
"how many times has LOT-25-0001 been sampled?" is a simple JOIN.

### `sample_shipments`
**Purpose:** Tracking information for dispatched samples. Carrier,
tracking number, pickup_ts, estimated_arrival_ts, delivered_ts.

**Why separate from `sample_requests`?** A sample might be re-shipped
(damaged in transit, wrong address). Each shipment is a row; the
`sample_request` can have multiple shipments.

### `cupping_scores`
**Purpose:** Buyer's cupping evaluation per lot per sample event.
Captures all 10 SCA attributes (fragrance, flavor, aftertaste, acidity,
body, balance, uniformity, clean_cup, sweetness, overall) plus total
score, defect count, and free-text notes.

**Why one row per lot per buyer?** Different buyers cup the same lot
differently. Storing all evaluations lets Agent 1 identify patterns
("LOT-25-0003 scores 86 with us but buyers consistently score it 83").

### `sample_decisions`
**Purpose:** The Approved/Rejected/Needs-another-sample decision per lot.
Links to the cupping score and captures the buyer's target terms (FOB,
volume, port) if approved.

### `sample_budget`
**Purpose:** Weekly counter for sample budget. One row per week (Monday–
Sunday). Tracks full sets, fallback 150g, Type B, and Type C usage.

**Why not a global counter?** Weekly reset is a hard business rule.
A per-week table makes "how many samples did we ship last week?" a
simple query.

### `sample_waitlist`
**Purpose:** Leads queued for next week's sample budget. Processed in
tier order (S → A → B → C) on Monday 00:01 Addis time.

---

## Domain: Contract & Compliance (3 tables)

### `contracts`
**Purpose:** Contract records. Links a lead to one or more lots with
agreed terms: FOB/CIF price, volume, shipment window, payment terms,
contract template (ICC), status.

**FKs:** `lead_id → leads.id`

### `contract_line_items`
**Purpose:** Junction table — a contract can include multiple lots. Each
line item has lot_id, quantity (bags), unit price, and total.

### `compliance_documents`
**Purpose:** Legal and compliance documents per contract: EUDR
attestation, certificate of origin, phytosanitary cert, organic/FT/RA
certs. Each document has a type, file path, expiry date, and status.

---

## Domain: Logistics (3 tables)

### `shipments`
**Purpose:** Freight shipments. Links to a contract, with carrier,
vessel/flight, B/L number, departure port, arrival port, ETD, ETA,
status.

### `shipment_items`
**Purpose:** Junction table — a shipment can include multiple lots
(multiple contracts consolidated into one container).

### `customs_documents`
**Purpose:** Customs paperwork per shipment: commercial invoice, packing
list, certificate of origin, bill of lading, insurance cert. Each with
status (draft/submitted/cleared) and file path.

---

## Domain: Relationship (2 tables)

### `accounts`
**Purpose:** Ongoing buyer relationships (post-contract). An account is
created when a lead reaches CONTRACTED state. Tracks account manager,
relationship status (active/dormant/churned), total volume contracted,
total revenue, first contract date.

**Why separate from `leads`?** A lead is pre-contract (prospecting).
An account is post-contract (relationship management). Different agents
own them (Agent 3 vs Agent 7), different KPIs, different cadence.

### `account_activities`
**Purpose:** Relationship touches: calls, meetings, emails, site visits,
gifts. Each activity has type, date, participants, summary, next steps,
and NPS score (if collected).

---

## Domain: Event Bus (1 table)

### `events`
**Purpose:** Event bus log for inter-agent communication. Every event
published by any agent is logged here: event_type (LEAD_QUALIFIED,
SAMPLE_DISPATCHED, etc.), payload (JSON), published_by, published_ts,
consumed_by, consumed_ts.

**Why a table?** The EventBus (step 4) needs persistence for:
- At-least-once delivery (if a consumer is down, events wait)
- Replay (debugging: "what happened yesterday?")
- Audit ("who triggered the sample dispatch?")

---

## State Machine Enforcement

The lead state machine is enforced at two levels:

1. **Database level:** `CHECK (current_state IN (...))` on `leads` prevents
   invalid state values.

2. **Application level:** The StateManager's `update_lead_state()` method
   validates transitions against the `STATE_TRANSITIONS` map. The database
   can't enforce "SAMPLE_DISPATCHED → NEW is invalid" because that's a
   transition rule, not a value rule.

**Allowed transitions** (enforced by StateManager):
```
NEW → ENRICHED, BLOCKED
ENRICHED → IN_SEQUENCE, BLOCKED, NURTURE
IN_SEQUENCE → IN_SEQUENCE, QUALIFIED, NURTURE, GHOSTED, BLOCKED
QUALIFIED → SAMPLE_DISPATCHED, BLOCKED, NURTURE
SAMPLE_DISPATCHED → SAMPLE_FEEDBACK_DUE, BLOCKED
SAMPLE_FEEDBACK_DUE → DECIDED_APPROVED, DECIDED_REJECTED,
                      DECIDED_NEEDS_ANOTHER, GHOSTED, BLOCKED
DECIDED_NEEDS_ANOTHER → QUALIFIED, NURTURE
DECIDED_APPROVED → CONTRACTED, BLOCKED
DECIDED_REJECTED → NURTURE
GHOSTED → NURTURE
NURTURE → IN_SEQUENCE
CONTRACTED → (terminal)
BLOCKED → (any state — operator unblocks)
```

---

## Indexes

Indexes are created for:
- Every foreign key (SQLite and Postgres don't auto-index FKs)
- `leads.current_state` — dashboard state filters
- `leads.priority_tier` — S-tier-first processing
- `leads.current_agent` — agent picks up its own leads
- `leads.next_action_due_ts` — "what's due now?" queries
- `lots.status` + `lots.eudr_data_status` — inventory filtering
- `lots.region` + `lots.process` — lot matching algorithm
- `outreach_touches.lead_id` + `outreach_touches.sent_ts` — cadence tracking
- `cupping_scores.lot_id` — feedback analysis
- `events.event_type` + `events.published_ts` — event bus queries

---

## Migration Strategy

This schema is created in a single initial migration. Future schema
changes follow this workflow:

1. Change SQLAlchemy models (step 2)
2. Run `alembic revision --autogenerate -m "description"`
3. Review the generated migration (autogenerate can miss constraints)
4. Test `upgrade` and `downgrade` locally
5. Commit the migration
6. Deploy: `alembic upgrade head`

**PostgreSQL migration:** Change `DATABASE_URL` in `.env` from
`sqlite:///...` to `postgresql://...`. Run `alembic upgrade head`.
All migrations use portable types — no changes needed.
