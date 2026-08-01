# State Manager API

The StateManager is the **single entry point for all state mutations**.
Agents never touch the database directly — they call semantic methods on
StateManager, which validates inputs, enforces business rules, logs to the
audit trail, and executes the transaction.

## Architecture

```
Agent (reasons about business actions)
    ↓  calls semantic method
StateManager (validates, enforces rules, logs audit)
    ↓  executes transaction
SQLite / PostgreSQL (single source of truth, ACID)
```

## Initialization

```python
from coffee_export.state.state_manager import StateManager

# Context manager (auto-closes connection)
with StateManager() as sm:
    lead_id = sm.create_lead(company_name="Falcon Coffees", ...)
    sm.update_lead_state(lead_id, "ENRICHED", agent="Agent 2")
```

## Lead Lifecycle Methods

### `create_lead()`

Create a new lead. Returns `lead_id`. Fails if company+country already exists.

```python
lead_id = sm.create_lead(
    company_name="Falcon Coffees",
    headquarters_country="United Kingdom",
    source_row_hash="sha1...",          # for dedup
    priority_tier="S",                   # S | A | B | C | Disqualify
    recommended_vp="VP1",                # VP1 | VP2 | VP3 | VP4
    outreach_language="EN",              # EN | DE | FR | IT | JA | KO | ZH | AR | TR | RU
    tags=["fairtrade", "organic"],       # free-form
)
```

### `get_lead()` / `get_lead_by_company()`

Read a lead by ID or by company name (+ optional country).

```python
lead = sm.get_lead("L-2026-00047")
# Returns dict with all columns + 'tags' list, or None

lead = sm.get_lead_by_company("Falcon Coffees", "United Kingdom")
```

### `update_lead_state()`

Transition a lead to a new state. Validates the transition against the
allowed map. Logs to `state_history`. Raises `InvalidTransitionError` if
the transition is not allowed.

```python
sm.update_lead_state(
    lead_id="L-2026-00047",
    new_state="QUALIFIED",
    agent="Agent 3",
    notes="Q1-Q5 all confirmed in writing",
    next_action_due_ts="2026-07-02T09:00:00+03:00",
    next_action_agent="Agent 4",
    current_agent="Agent 4",  # also updates ownership
    priority_tier="S",        # can update other fields in same call
)
```

### `transfer_ownership()`

Atomically transfer lead ownership. Fails if `from_agent` doesn't currently
own the lead (concurrency guard).

```python
sm.transfer_ownership(
    lead_id="L-2026-00047",
    from_agent="Agent 3",
    to_agent="Agent 4",
)
```

### `advance_sequence_step()`

Increment Agent 3's outreach step. Fails if already at step 6 (max).

```python
new_step = sm.advance_sequence_step("L-2026-00047")
# Returns the new step number (1-6)
```

### `set_lead_field()` / `add_tag()`

Update individual fields or add tags.

```python
sm.set_lead_field("L-2026-00047", priority_tier="S", recommended_vp="VP1")
sm.add_tag("L-2026-00047", "eudr-aware")
```

### `list_leads()` / `get_lead_history()` / `get_blocked_leads()`

Query methods (read-only).

```python
# Filter leads by state, agent, or tier
leads = sm.list_leads(state="QUALIFIED", agent="Agent 4", limit=50)

# Full audit trail for a lead
history = sm.get_lead_history("L-2026-00047")

# All leads needing operator attention
blocked = sm.get_blocked_leads()
```

## Lot Inventory Methods

### `add_lot()` / `get_lot()` / `update_lot()` / `list_lots()`

CRUD operations with validation.

```python
lot_id = sm.add_lot({
    "region": "Yirgacheffe",
    "process": "Washed",
    "cupping_score": 87.5,
    "crop_year": "25/26",
    "stock_bags_remaining": 45,
    "eudr_data_status": "complete",
    ...
})

lot = sm.get_lot("LOT-25-0001")
sm.update_lot("LOT-25-0001", stock_bags_remaining=40, status="committed")

lots = sm.list_lots(region="Guji", eudr="complete", min_score=85.0)
```

### `confirm_lot_for_sample()`

Full confirmation logic. Validates lot status, stock, crop year, EUDR
requirements (for EU buyers). On success, creates a 7-day reservation.

```python
result = sm.confirm_lot_for_sample(
    lot_id="LOT-25-0001",
    lead_id="L-2026-00047",
    sample_type="350g",                    # 350g | 200g | 500g | 150g
    buyer_company="Falcon Coffees",
    destination_country="United Kingdom",  # triggers EUDR check if EU
    crop_year="25/26",
)

# Returns:
# {
#   "lot_id": "LOT-25-0001",
#   "confirmed": True,
#   "reason_if_not": "",
#   "stock_after_sample_bags": 44.9942,
#   "docs_attached": { ... },
#   "reserved_until": "2026-07-08T09:00:00+03:00",
#   "substitute_suggestion": None,
# }
```

### `find_substitute()`

Find the next-best lot. Same region + same process + cupping score within
±1.0 point.

```python
sub = sm.find_substitute(
    excluded_lot_id="LOT-25-0001",
    region="Yirgacheffe",
    process="Washed",
    target_score=87.5,
    crop_year="25/26",
    eudr_required=True,    # for EU buyers
)
# Returns dict with substitute lot details, or None
```

### `flag_lot_for_qa()` / `release_lot_from_qa()`

QA hold workflow.

```python
sm.flag_lot_for_qa("LOT-25-0003", reason="≥2 rejections with 'musty' keyword", auto=True)
sm.release_lot_from_qa("LOT-25-0003")
```

### `log_feedback()`

Log rejection feedback. Auto-flags QA if ≥2 rejections with the same
critical keyword (musty, fermented, sour, phenolic, rio, potato defect,
defective).

```python
result = sm.log_feedback(
    lot_id="LOT-25-0003",
    buyer_company="Falcon Coffees",
    buyer_segment="Specialty Importer",
    rejection_reason="Musty undertone, defect count higher than expected",
)
# result["qa_auto_flagged"] == True if this triggered QA hold
```

## Sample Budget Methods

### `consume_sample_budget()`

Atomically consume one unit of sample budget. Auto-resets on Monday 00:01
Addis time. Returns `False` if budget exhausted (does NOT raise).

```python
if sm.consume_sample_budget("350g", lead_id="L-2026-00047"):
    # dispatch the sample
else:
    sm.add_to_waitlist("L-2026-00047", tier="S", sample_type="350g")
```

### `add_to_waitlist()` / `get_waitlist()` / `process_waitlist()`

Waitlist management. `process_waitlist()` is called on Monday 00:01 to
allocate the new week's budget in tier order (S → A → B → C).

```python
sm.add_to_waitlist("L-2026-00047", tier="S", sample_type="350g")
waiting = sm.get_waitlist()  # unfulfilled only
fulfilled = sm.process_waitlist()  # returns list of lead_ids that got budget
```

## KPI Methods

### `get_kpi_snapshot()`

Single call returns everything the dashboard needs.

```python
snapshot = sm.get_kpi_snapshot()
# {
#   "generated_ts": "2026-07-01T09:00:00+03:00",
#   "leads": { "total": 670, "by_state": {...}, "blocked_count": 2 },
#   "lots": { "total": 11, "by_status": {...}, "eudr_completeness": {...}, ... },
#   "samples": { "active_reservations": 3, "budget": {...}, "waitlist_depth": 1 },
#   "feedback": { "total_logged": 5, "multi_rejection_lots": [...] },
# }
```

## Exceptions

| Exception | When raised |
|-----------|-------------|
| `ValidationFailedError` | Invalid enum value, missing required field, duplicate lead |
| `InvalidTransitionError` | State transition not in the allowed map |
| `ConcurrencyError` | Ownership transfer failed (agent doesn't own the lead) |
| `BudgetExceededError` | Sample budget exhausted (alternative: `consume_sample_budget` returns False) |

## Design Principles

1. **Agents never write to the database directly.** They call StateManager methods.
2. **Every mutation is validated.** Enums checked, required fields enforced, business rules applied.
3. **Every mutation is atomic.** Uses SQLite transactions (or Postgres equivalents).
4. **Every state change is audited.** Appended to `state_history` — never overwritten.
5. **Concurrency is safe.** Ownership transfers use a guard; budget increments use atomic UPDATE...WHERE.
