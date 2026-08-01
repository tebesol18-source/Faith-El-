# Agent Interaction Architecture

## Overview

This document defines the **allowed interactions** for each agent. No agent
may bypass the StateManager, EventBus, or TaskQueue to access the database
directly.

## Architecture Diagram

```
    ┌─────────────────────────────────────────────────────────┐
    │                    AGENTS (1-7)                         │
    │                                                         │
    │  Agent 1    Agent 2    Agent 3    Agent 4    ...        │
    │  Supplier   Lead       Outreach   Sample                │
    │  & Inv.     Research   & Qual.    Mgmt                  │
    └──────┬──────────┬──────────┬──────────┬─────────────────┘
           │          │          │          │
           ▼          ▼          ▼          ▼
    ┌─────────────────────────────────────────────────────────┐
    │                   EVENT BUS                             │
    │  (publish/consume events — no direct agent-to-agent)    │
    └──────┬──────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────────────────────────────────┐
    │                  STATE MANAGER                          │
    │  (validates, enforces rules, logs audit — single        │
    │   entry point for ALL database mutations)               │
    └──────┬──────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────────────────────────────────┐
    │              SQLAlchemy ORM Models                      │
    │  (typed ORM layer — 34 models across 9 domains)         │
    └──────┬──────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────────────────────────────────┐
    │           SQLite / PostgreSQL Database                  │
    │  (single source of truth, ACID, WAL mode)               │
    └─────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────┐
    │                   TASK QUEUE                            │
    │  (APScheduler — recurring + one-off jobs)               │
    │  Calls StateManager + EventBus (not agents directly)    │
    └─────────────────────────────────────────────────────────┘
```

## Allowed Interactions Per Agent

### Agent 1 — Supplier & Inventory

| Component | Allowed | How |
|-----------|---------|-----|
| **StateManager** | ✅ | `sm.confirm_lot_for_sample()`, `sm.list_lots()`, `sm.flag_lot_for_qa()`, `sm.get_stock_freshness()`, etc. |
| **EventBus** | ✅ | Consumes `SAMPLE_REQUESTED`, publishes `LOT_CONFIRMED` / `LOT_CONFIRMATION_FAILED` |
| **TaskQueue** | ✅ | Maintenance jobs call Agent 1 methods |
| **Agent 4** | ✅ (indirect) | Via EventBus — Agent 4 publishes `SAMPLE_REQUESTED`, Agent 1 responds |
| **Database (direct)** | ❌ | **FORBIDDEN** — must go through StateManager |

### Agent 2 — Lead Research & Enrichment

| Component | Allowed | How |
|-----------|---------|-----|
| **StateManager** | ✅ | `sm.create_lead()`, `sm.update_lead_state()`, `sm.add_contact()`, `sm.add_tag()` |
| **EventBus** | ✅ | Publishes `LEAD_CREATED`, `LEAD_ENRICHED` |
| **TaskQueue** | ✅ | Not directly — triggered by operator (CSV import) |
| **Database (direct)** | ❌ | **FORBIDDEN** |

### Agent 3 — Outreach & Qualification

| Component | Allowed | How |
|-----------|---------|-----|
| **StateManager** | ✅ | `sm.log_outreach_touch()`, `sm.store_qual_answer()`, `sm.check_qual_gate()`, `sm.store_memory()`, `sm.get_conversation_context()`, etc. |
| **EventBus** | ✅ | Consumes `LEAD_ENRICHED`, publishes `LEAD_QUALIFIED` / `LEAD_GHOSTED` / `LEAD_NURTURED` |
| **TaskQueue** | ✅ | `nurture_reactivation` and `ghost_to_nurture` jobs transition leads back to Agent 3 |
| **Conversation Memory** | ✅ | Via StateManager — `sm.store_memory()`, `sm.get_memories()`, `sm.get_conversation_context()` |
| **Database (direct)** | ❌ | **FORBIDDEN** |

### Agent 4 — Sample Management (Step 10 — not yet built)

| Component | Allowed | How |
|-----------|---------|-----|
| **StateManager** | ✅ | `sm.confirm_lot_for_sample()` (via Agent 1 events), `sm.consume_sample_budget()`, `sm.add_to_waitlist()`, sample request CRUD |
| **EventBus** | ✅ | Consumes `LEAD_QUALIFIED` + `LOT_CONFIRMED`, publishes `SAMPLE_REQUESTED`, `SAMPLE_DISPATCHED`, `SAMPLE_APPROVED` / `SAMPLE_REJECTED` |
| **Agent 1** | ✅ (indirect) | Via EventBus — Agent 4 publishes `SAMPLE_REQUESTED`, Agent 1 confirms lots, publishes `LOT_CONFIRMED` / `LOT_CONFIRMATION_FAILED` |
| **TaskQueue** | ✅ | `sample_reminder_check` job, `schedule_sample_reminder()` for Day +7/+10/+14/+18 |
| **Database (direct)** | ❌ | **FORBIDDEN** — must go through StateManager |

### Agent 5 — Legal & Compliance (Step 12 — not yet built)

| Component | Allowed | How |
|-----------|---------|-----|
| **StateManager** | ✅ | Contract CRUD, compliance document management |
| **EventBus** | ✅ | Consumes `SAMPLE_APPROVED`, publishes `CONTRACT_DRAFTED` / `CONTRACT_SIGNED` |
| **Database (direct)** | ❌ | **FORBIDDEN** |

### Agent 6 — Logistics & Shipping (Step 13 — not yet built)

| Component | Allowed | How |
|-----------|---------|-----|
| **StateManager** | ✅ | Shipment CRUD, customs document management |
| **EventBus** | ✅ | Consumes `CONTRACT_SIGNED`, publishes `SHIPMENT_BOOKED` / `SHIPMENT_DELIVERED` |
| **Database (direct)** | ❌ | **FORBIDDEN** |

### Agent 7 — Sales & Relationship Management (Step 14 — not yet built)

| Component | Allowed | How |
|-----------|---------|-----|
| **StateManager** | ✅ | Account CRUD, account activity logging |
| **EventBus** | ✅ | Consumes `SHIPMENT_DELIVERED`, publishes `ACCOUNT_CREATED` / `NPS_COLLECTED` |
| **Database (direct)** | ❌ | **FORBIDDEN** |

## Violation Detection

Any code in `coffee_export/agents/` that imports `SessionLocal` or
`from coffee_export.database.base` (except for `now_addis_iso`) is an
**architecture violation**.

### How to check:

```bash
# Find all direct DB access in agents (should return nothing)
grep -rn "SessionLocal\|from coffee_export.database.base import" \
  coffee_export/agents/ | grep -v "StateManager" | grep -v "now_addis_iso"
```

### Allowed imports for agents:

```python
from coffee_export.agents.base import BaseAgent, run_agent
from coffee_export.agents.registry import register_agent
from coffee_export.events import EventBus, LEAD_CREATED, ...  # event types only
from coffee_export.state import StateManager  # state access only
from coffee_export.state.constants import ...  # constants only
from coffee_export.utils.logging import get_logger
```

### FORBIDDEN imports for agents:

```python
from coffee_export.database.base import SessionLocal, engine, SessionLocal  # ❌
from coffee_export.database.models import Lead, Lot, ...  # ❌ (ORM models)
from sqlalchemy import select, update, ...  # ❌ (raw SQL)
```

## Conversation Memory (Agent 3)

Agent 3 has an AI memory system that lets it remember conversations across
touches rather than responding to each message in isolation.

### Memory Table: `conversation_memory`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `lead_id` | TEXT FK → leads | Which lead this memory belongs to |
| `memory_type` | TEXT | `conversation_summary`, `buyer_preference`, `objection`, `qualification_signal`, `context`, `next_step` |
| `content` | TEXT | The memory content |
| `source` | TEXT | Which agent stored it (default: "Agent 3") |
| `importance` | INTEGER | 1-10, higher = more salient |
| `created_ts` | TEXT | When stored |
| `updated_ts` | TEXT | Last updated |

### Memory Flow:

```
1. Agent 3 sends outreach touch (step N)
   → _store_touch_memory() stores "conversation_summary" (importance=4)

2. Buyer replies (positive/negative/neutral)
   → _store_touch_memory() stores "conversation_summary" (importance=5-7)
   → If negative: also stores "objection" (importance=8)
   → If QUAL signal detected: stores "qualification_signal" (importance=7)

3. Agent 3 drafts next message (step N+1)
   → draft_message_with_memory() retrieves context:
     - Lead details (company, VP, tier, state)
     - Top memories (importance-ordered)
     - Recent touches (chronological)
     - QUAL gate status
   → Message includes context from past conversations
   → Avoids repeating questions already asked
   → References buyer's previous replies
```

### Memory Types:

| Type | When stored | Example |
|------|-------------|---------|
| `conversation_summary` | After every touch (outbound or inbound) | "Step 2 (linkedin): buyer replied 'positive' — Yes, we're sourcing 25/26" |
| `buyer_preference` | When buyer states a preference | "Prefers natural process over washed" |
| `objection` | When buyer raises a concern | "Price too high compared to current supplier" |
| `qualification_signal` | When buyer's reply contains QUAL keywords | "Q1 signal detected: we buy 5 FCL/year" |
| `context` | General relationship context | "Met at SCA expo, buyer knows our COO" |
| `next_step` | What to do next | "Follow up in 2 weeks with 26/27 forward pricing" |
