# Architecture Overview

## System Architecture

```mermaid
graph TB
    subgraph "Presentation Layer"
        DASH[Streamlit Dashboard]
        CLI[CLI Scripts]
    end

    subgraph "Agent Layer"
        A1[Agent 1<br/>Supplier & Inventory]
        A2[Agent 2<br/>Lead Research & Enrichment]
        A3[Agent 3<br/>Outreach & Qualification]
        A4[Agent 4<br/>Sample Management]
        A5[Agent 5<br/>Legal & Compliance]
        A6[Agent 6<br/>Logistics & Shipping]
        A7[Agent 7<br/>Sales & Relationship Mgmt]
    end

    subgraph "Infrastructure Layer"
        RUNNER[Agent Runner<br/>lifecycle, retries, timeout]
        BUS[Event Bus<br/>decoupled messaging]
        QUEUE[Task Queue<br/>APScheduler]
        STATE[State Manager<br/>validates, enforces rules, logs audit]
    end

    subgraph "Data Layer"
        ORM[SQLAlchemy ORM Models]
        DB[(SQLite / PostgreSQL)]
        MIGRATIONS[Alembic Migrations]
    end

    DASH --> STATE
    CLI --> STATE

    A1 --> RUNNER
    A2 --> RUNNER
    A3 --> RUNNER
    A4 --> RUNNER
    A5 --> RUNNER
    A6 --> RUNNER
    A7 --> RUNNER

    RUNNER --> BUS
    BUS --> STATE
    QUEUE --> RUNNER

    STATE --> ORM
    ORM --> DB
    MIGRATIONS --> DB
```

## Key Design Principles

### 1. Single Source of Truth

The database is the only source of truth. No agent writes files directly.
Every state mutation goes through the StateManager, which validates inputs,
enforces business rules, and logs to an append-only audit trail.

### 2. Layered Architecture

| Layer | Responsibility | Cannot |
|-------|---------------|--------|
| Presentation | User interface (dashboard, CLI) | Touch DB directly |
| Agent | Business logic, reasoning | Write files, bypass StateManager |
| Infrastructure | Lifecycle, messaging, scheduling | Contain business rules |
| Data | Persistence, schema, migrations | Contain business logic |

### 3. Event-Driven Communication

Agents don't call each other directly. They publish events to the EventBus
(e.g., `LEAD_QUALIFIED`, `SAMPLE_DISPATCHED`). Other agents subscribe to
events they care about. This decouples agents — Agent 4 doesn't need to
know that Agent 5 exists.

### 4. Reversible Schema Evolution

All schema changes go through Alembic migrations. Every migration has an
`upgrade()` and `downgrade()` function. The database can be rolled back
to any point in time. No manual `ALTER TABLE` statements.

### 5. Configuration via Environment

All settings (database URL, sample budget caps, timezone, log level) come
from environment variables loaded via `.env`. The same code runs in
development, staging, and production — only the env vars change.

## Data Flow: Lead to Contract

```mermaid
sequenceDiagram
    participant OP as Operator
    participant A2 as Agent 2
    participant A3 as Agent 3
    participant A4 as Agent 4
    participant A1 as Agent 1
    participant A5 as Agent 5
    participant SM as StateManager
    participant DB as Database

    OP->>A2: Raw leads CSV
    A2->>SM: create_lead() + enrich
    SM->>DB: INSERT lead (state=ENRICHED)
    A2->>SM: transfer_ownership(A2→A3)

    A3->>SM: update_lead_state(QUALIFIED)
    SM->>DB: UPDATE lead + INSERT state_history
    A3->>SM: transfer_ownership(A3→A4)

    A4->>A1: confirm_lot_for_sample()
    A1->>SM: reserve_lot() + return docs
    A4->>SM: consume_sample_budget()
    A4->>SM: update_lead_state(SAMPLE_DISPATCHED)

    Note over A4: ...buyer cuppings samples...

    A4->>SM: update_lead_state(DECIDED_APPROVED)
    A4->>SM: transfer_ownership(A4→A5)

    A5->>SM: update_lead_state(CONTRACTED)
    SM->>DB: UPDATE lead (terminal state)
```

## Folder Structure

```
coffee_export/
├── coffee_export/          # Main package
│   ├── config.py           # Settings (env-var driven)
│   ├── database/           # SQLAlchemy models + schema
│   ├── state/              # StateManager (single write path)
│   ├── events/             # EventBus
│   ├── tasks/              # TaskQueue (APScheduler)
│   ├── agents/             # All 7 agents
│   ├── dashboard/          # Streamlit UI
│   └── utils/              # Logging, helpers
├── alembic/                # Database migrations
│   ├── env.py              # Wired to our config + models
│   └── versions/           # Migration scripts (one per change)
├── data/                   # Runtime data (gitignored)
│   ├── coffee_export.db    # SQLite database
│   ├── docs/               # Lot attachments (EUDR, cupping, certs)
│   └── logs/               # Application logs
├── docs/                   # This documentation
├── tests/                  # Test suite
└── scripts/                # Utility scripts
```

## Technology Choices

| Concern | Choice | Why |
|---------|--------|-----|
| Database | SQLite → PostgreSQL | SQLite for dev (zero config), Postgres for prod (one-line swap) |
| ORM | SQLAlchemy 2.0 | Industry standard, type-safe, async support |
| Migrations | Alembic | Official SQLAlchemy migration tool, reversible |
| Config | python-dotenv + dataclasses | Typed, env-var driven, no hardcoded paths |
| Logging | Rich + RotatingFileHandler | Pretty console + grep-friendly files |
| Scheduling | APScheduler | Lightweight, no external broker needed |
| Dashboard | Streamlit | Fast to build, Python-only, good for internal tools |
| Formatting | Black | Zero-config, opinionated, eliminates style debates |
| Linting | Ruff | 10x faster than flake8, replaces isort + pyupgrade |
| Pre-commit | pre-commit framework | Enforces quality before every commit |
