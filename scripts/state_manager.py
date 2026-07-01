"""
State Manager — single entry point for ALL state mutations.

Agents never touch the database directly. They call semantic methods on
StateManager, which validates, enforces business rules, logs the audit
trail, and executes the transaction.

USAGE
-----
    from state_manager import StateManager

    sm = StateManager()

    # Lead lifecycle
    lead_id = sm.create_lead(company_name="Falcon Coffees",
                             headquarters_country="United Kingdom")
    sm.update_lead_state(lead_id, "ENRICHED", agent="Agent 2",
                         priority_tier="S", recommended_vp="VP1",
                         outreach_language="EN")
    sm.transfer_ownership(lead_id, from_agent="Agent 2", to_agent="Agent 3")

    # Lot inventory
    lot_id = sm.add_lot({...})
    result = sm.confirm_lot_for_sample(
        lot_id="LOT-25-0001", lead_id=lead_id,
        sample_type="350g", buyer_company="Falcon Coffees",
        destination_country="United Kingdom", crop_year="25/26"
    )

    # Sample budget (atomic, auto-resetting)
    if sm.consume_sample_budget("350g", lead_id):
        # ... dispatch the sample ...
    else:
        sm.add_to_waitlist(lead_id, tier="S")

    # KPIs
    snapshot = sm.get_kpi_snapshot()

ARCHITECTURE
------------
    LLM Agent (reasons about business actions)
        ↓  calls semantic function
    StateManager (validates, enforces rules, logs audit)
        ↓  executes transaction
    SQLite (single source of truth, ACID, WAL mode)

The database is a single file. WAL mode allows concurrent reads while
writes are serialized. Upgrade path to PostgreSQL: swap the connection
string, no agent code changes.
"""

from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from config import ADDIS_TZ_OFFSET_HOURS, DB_PATH, ensure_dirs, doc_path

# =====================================================================
# CONSTANTS
# =====================================================================

ADDIS_TZ = timezone(timedelta(hours=ADDIS_TZ_OFFSET_HOURS))

# Allowed lead states
ALLOWED_STATES = frozenset({
    "NEW", "ENRICHED", "IN_SEQUENCE", "QUALIFIED",
    "SAMPLE_DISPATCHED", "SAMPLE_FEEDBACK_DUE",
    "DECIDED_APPROVED", "DECIDED_REJECTED", "DECIDED_NEEDS_ANOTHER",
    "GHOSTED", "CONTRACTED", "NURTURE", "BLOCKED",
})

# Allowed state transitions (from_state → {allowed to_states})
STATE_TRANSITIONS: dict[str, frozenset[str]] = {
    "NEW":                    frozenset({"ENRICHED", "BLOCKED"}),
    "ENRICHED":               frozenset({"IN_SEQUENCE", "BLOCKED", "NURTURE"}),
    "IN_SEQUENCE":            frozenset({"IN_SEQUENCE", "QUALIFIED", "NURTURE",
                                          "GHOSTED", "BLOCKED"}),
    "QUALIFIED":              frozenset({"SAMPLE_DISPATCHED", "BLOCKED", "NURTURE"}),
    "SAMPLE_DISPATCHED":      frozenset({"SAMPLE_FEEDBACK_DUE", "BLOCKED"}),
    "SAMPLE_FEEDBACK_DUE":    frozenset({"DECIDED_APPROVED", "DECIDED_REJECTED",
                                          "DECIDED_NEEDS_ANOTHER", "GHOSTED", "BLOCKED"}),
    "DECIDED_NEEDS_ANOTHER":  frozenset({"QUALIFIED", "NURTURE", "BLOCKED"}),
    "DECIDED_APPROVED":       frozenset({"CONTRACTED", "BLOCKED"}),
    "DECIDED_REJECTED":       frozenset({"NURTURE", "BLOCKED"}),
    "GHOSTED":                frozenset({"NURTURE", "BLOCKED"}),
    "CONTRACTED":             frozenset({"BLOCKED"}),  # terminal (unless re-contract)
    "NURTURE":                frozenset({"IN_SEQUENCE", "BLOCKED"}),
    "BLOCKED":                frozenset(set(ALLOWED_STATES) - {"BLOCKED"}),
}

# Allowed enum values
ALLOWED_REGIONS = frozenset({
    "Yirgacheffe", "Sidamo", "Guji", "Limu", "Jimma", "Harrar", "other",
})
ALLOWED_PROCESSES = frozenset({"Washed", "Natural", "Honey", "Anaerobic"})
ALLOWED_EUDR_STATUS = frozenset({"complete", "partial", "missing"})
ALLOWED_LOT_STATUS = frozenset({"active", "committed", "depleted", "hold"})
ALLOWED_VPS = frozenset({"VP1", "VP2", "VP3", "VP4"})
ALLOWED_TIERS = frozenset({"S", "A", "B", "C", "Disqualify"})
ALLOWED_LANGS = frozenset({"EN", "DE", "FR", "IT", "JA", "KO", "ZH",
                            "AR", "TR", "RU"})
ALLOWED_AGENTS = frozenset({"Agent 1", "Agent 2", "Agent 3", "Agent 4",
                             "Agent 5", "operator", "none"})

# Sample type → grams
SAMPLE_QUANTITIES_GRAMS = {
    "350g": 350,   # Type A — pre-shipment
    "200g": 200,   # Type B — forward-program representative
    "500g": 500,   # Type C — shipment sample (post-contract)
    "150g": 150,   # Fallback 150g (partial QUAL)
}

# Weekly sample budget caps
SAMPLE_BUDGET_CAPS = {
    "350g": 3,   # full Type A sets per week
    "150g": 2,   # fallback 150g per week
    "200g": 2,   # Type B forward-program per week (separate budget)
    "500g": -1,  # Type C — no cap (post-contract, mandatory)
}

# EU countries (EUDR required)
EU_COUNTRIES = frozenset({
    "Germany", "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Denmark", "Estonia", "Finland", "France",
    "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania",
    "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal",
    "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
    "United Kingdom", "Norway", "Switzerland", "Iceland", "Liechtenstein",
})

# Critical feedback keywords that trigger QA auto-flag
CRITICAL_KEYWORDS = ("musty", "fermented", "sour", "phenolic",
                     "rio", "potato defect", "defective")

# Default bag size
DEFAULT_BAG_SIZE_KG = 60


# =====================================================================
# SCHEMA — single source of truth for the database structure
# =====================================================================

SCHEMA_SQL = """
-- ============================================================
-- LEADS — one row per buyer lead (replaces leads.jsonl)
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
    lead_id                TEXT PRIMARY KEY,
    company_name           TEXT NOT NULL,
    headquarters_country   TEXT,
    source_row_hash        TEXT,  -- for dedup
    current_state          TEXT NOT NULL DEFAULT 'NEW',
    current_agent          TEXT DEFAULT 'none',
    last_touch_ts          TEXT,
    next_action_due_ts     TEXT,
    next_action_agent      TEXT DEFAULT 'none',
    priority_tier          TEXT,
    recommended_vp         TEXT,
    outreach_language      TEXT DEFAULT 'EN',
    sequence_step          INTEGER DEFAULT 0,
    sample_lead_id         TEXT,
    substitute_round       INTEGER DEFAULT 0,
    ghosted_count          INTEGER DEFAULT 0,
    created_ts             TEXT NOT NULL,
    updated_ts             TEXT NOT NULL,
    UNIQUE(company_name, headquarters_country)
);

-- ============================================================
-- STATE_HISTORY — append-only audit trail (one row per transition)
-- ============================================================
CREATE TABLE IF NOT EXISTS state_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id      TEXT NOT NULL,
    from_state   TEXT,
    to_state     TEXT NOT NULL,
    agent        TEXT NOT NULL,
    ts           TEXT NOT NULL,
    notes        TEXT,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
);

-- ============================================================
-- LEAD_TAGS — free-form tags per lead
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_tags (
    lead_id      TEXT NOT NULL,
    tag          TEXT NOT NULL,
    tagged_ts    TEXT NOT NULL,
    PRIMARY KEY (lead_id, tag),
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
);

-- ============================================================
-- LOTS — one row per coffee lot (replaces lot_inventory.csv)
-- ============================================================
CREATE TABLE IF NOT EXISTS lots (
    lot_id                              TEXT PRIMARY KEY,
    region                              TEXT,
    washing_station                     TEXT,
    coop_name                           TEXT,
    process                             TEXT,
    screen_size                         INTEGER,
    cupping_score                       REAL,
    q_grader_name                       TEXT,
    grading_date                        TEXT,
    defect_count_sca                    INTEGER,
    moisture_pct                        REAL,
    water_activity                      REAL,
    crop_year                           TEXT,
    harvest_date_range                  TEXT,
    milling_date                        TEXT,
    stock_bags_remaining                INTEGER,
    bag_size_kg                         INTEGER DEFAULT 60,
    certifications                      TEXT,
    certificate_of_origin               TEXT,
    eudr_data_status                    TEXT,
    eudr_gps_lat                        REAL,
    eudr_gps_lon                        REAL,
    eudr_farmgate_price_etb_per_kg      REAL,
    eudr_deforestation_attestation      TEXT,
    reserved_for_forward_program        TEXT DEFAULT 'No',
    status                              TEXT DEFAULT 'active',
    last_updated_ts                     TEXT NOT NULL
);

-- ============================================================
-- RESERVATIONS — 7-day sample holds on lots
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id       TEXT PRIMARY KEY,
    lot_id               TEXT NOT NULL,
    lead_id              TEXT,
    sample_type          TEXT,
    quantity_grams       INTEGER,
    reserved_ts          TEXT NOT NULL,
    reserved_until_ts    TEXT NOT NULL,
    buyer_company        TEXT,
    crop_year            TEXT,
    status               TEXT DEFAULT 'active',
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id),
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
);

-- ============================================================
-- FEEDBACK — rejection logs from Agent 4
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id          TEXT PRIMARY KEY,
    lot_id               TEXT NOT NULL,
    buyer_company        TEXT,
    buyer_segment        TEXT,
    rejection_reason     TEXT,
    logged_ts            TEXT NOT NULL,
    qa_auto_flagged      INTEGER DEFAULT 0,
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
);

-- ============================================================
-- QA_FLAGS — audit trail of QA holds
-- ============================================================
CREATE TABLE IF NOT EXISTS qa_flags (
    qa_flag_id           TEXT PRIMARY KEY,
    lot_id               TEXT NOT NULL,
    auto                 INTEGER DEFAULT 0,
    reason               TEXT,
    flagged_ts           TEXT NOT NULL,
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
);

-- ============================================================
-- SAMPLE_BUDGET — weekly counter (one row per week)
-- ============================================================
CREATE TABLE IF NOT EXISTS sample_budget (
    week_start           TEXT PRIMARY KEY,  -- ISO Monday date
    week_end             TEXT NOT NULL,
    full_sets_used       INTEGER DEFAULT 0,
    fallback_150g_used   INTEGER DEFAULT 0,
    type_b_used          INTEGER DEFAULT 0,
    type_c_used          INTEGER DEFAULT 0,
    last_updated_ts      TEXT NOT NULL,
    last_updated_by      TEXT
);

-- ============================================================
-- SAMPLE_WAITLIST — leads queued for next week's budget
-- ============================================================
CREATE TABLE IF NOT EXISTS sample_waitlist (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id              TEXT NOT NULL,
    tier                 TEXT,
    sample_type          TEXT,
    queued_ts            TEXT NOT NULL,
    fulfilled_ts         TEXT,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
);

-- ============================================================
-- INDEXES — for the queries agents actually run
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_state           ON leads(current_state);
CREATE INDEX IF NOT EXISTS idx_leads_agent           ON leads(current_agent);
CREATE INDEX IF NOT EXISTS idx_leads_tier            ON leads(priority_tier);
CREATE INDEX IF NOT EXISTS idx_leads_next_action     ON leads(next_action_due_ts);
CREATE INDEX IF NOT EXISTS idx_history_lead          ON state_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_history_ts            ON state_history(ts);
CREATE INDEX IF NOT EXISTS idx_lots_region_process   ON lots(region, process);
CREATE INDEX IF NOT EXISTS idx_lots_status_eudr      ON lots(status, eudr_data_status);
CREATE INDEX IF NOT EXISTS idx_lots_crop_year        ON lots(crop_year);
CREATE INDEX IF NOT EXISTS idx_reservations_lot      ON reservations(lot_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status   ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_feedback_lot          ON feedback(lot_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_fulfilled    ON sample_waitlist(fulfilled_ts);
"""


# =====================================================================
# EXCEPTIONS
# =====================================================================

class StateManagerError(Exception):
    """Base exception for all StateManager errors."""


class InvalidTransitionError(StateManagerError):
    """Raised when a state transition is not allowed."""


class ValidationFailedError(StateManagerError):
    """Raised when input data fails validation."""


class ConcurrencyError(StateManagerError):
    """Raised when an ownership transfer fails (agent doesn't own the lead)."""


class BudgetExceededError(StateManagerError):
    """Raised when sample budget is exhausted."""


# =====================================================================
# HELPERS
# =====================================================================

def now_addis() -> datetime:
    return datetime.now(ADDIS_TZ)


def now_addis_iso() -> str:
    return now_addis().isoformat(timespec="seconds")


def _to_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _week_start(date: Optional[datetime] = None) -> str:
    """Return the ISO date of the Monday of the given date's week (Addis tz)."""
    if date is None:
        date = now_addis()
    monday = date - timedelta(days=date.weekday())
    return monday.strftime("%Y-%m-%d")


def _week_end(week_start_str: str) -> str:
    """Return the ISO date of the Sunday given a Monday ISO date string."""
    start = datetime.fromisoformat(week_start_str)
    return (start + timedelta(days=6)).strftime("%Y-%m-%d")


# =====================================================================
# STATE MANAGER
# =====================================================================

class StateManager:
    """
    Single entry point for ALL state mutations.

    Every method:
      1. Validates inputs (enums, required fields, business rules)
      2. Executes inside a transaction
      3. Logs to the audit trail where applicable
      4. Returns the result (or raises on failure)
    """

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = Path(db_path) if db_path else DB_PATH
        ensure_dirs()
        self.conn = sqlite3.connect(
            str(self.db_path),
            isolation_level=None,  # autocommit; we manage transactions manually
            timeout=30.0,          # wait up to 30s on locked DB
        )
        self.conn.row_factory = sqlite3.Row  # dict-like rows
        self._init_db()

    def _init_db(self) -> None:
        """Enable WAL + FK + create schema."""
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA_SQL)

    @contextmanager
    def transaction(self):
        """
        Context manager for a transaction. Usage:

            with sm.transaction():
                sm._execute("UPDATE ...")
                sm._execute("INSERT ...")

        Commits on success, rolls back on exception.
        """
        self.conn.execute("BEGIN")
        try:
            yield
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise

    def _execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        return self.conn.execute(sql, params)

    def _executemany(self, sql: str, params_list: Iterable[tuple]) -> sqlite3.Cursor:
        return self.conn.executemany(sql, params_list)

    def _fetchone(self, sql: str, params: tuple = ()) -> Optional[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchone()

    def _fetchall(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchall()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "StateManager":
        return self

    def __exit__(self, *args) -> None:
        self.close()

    # =================================================================
    # LEAD LIFECYCLE
    # =================================================================

    def create_lead(
        self,
        company_name: str,
        headquarters_country: str = "",
        source_row_hash: str = "",
        priority_tier: Optional[str] = None,
        recommended_vp: Optional[str] = None,
        outreach_language: str = "EN",
        tags: Optional[list[str]] = None,
    ) -> str:
        """
        Create a new lead. Returns lead_id.
        Fails if company+country already exists (UNIQUE constraint).
        """
        if not company_name.strip():
            raise ValidationFailedError("company_name is required")

        if priority_tier and priority_tier not in ALLOWED_TIERS:
            raise ValidationFailedError(
                f"priority_tier '{priority_tier}' not in {sorted(ALLOWED_TIERS)}"
            )
        if recommended_vp and recommended_vp not in ALLOWED_VPS:
            raise ValidationFailedError(
                f"recommended_vp '{recommended_vp}' not in {sorted(ALLOWED_VPS)}"
            )
        if outreach_language not in ALLOWED_LANGS:
            raise ValidationFailedError(
                f"outreach_language '{outreach_language}' not in {sorted(ALLOWED_LANGS)}"
            )

        # Generate lead_id: L-YYYY-NNNNN
        year = now_addis().year
        prefix = f"L-{year}-"
        row = self._fetchone(
            "SELECT lead_id FROM leads WHERE lead_id LIKE ? ORDER BY lead_id DESC LIMIT 1",
            (f"{prefix}%",)
        )
        if row and row["lead_id"]:
            try:
                next_num = int(row["lead_id"][len(prefix):]) + 1
            except ValueError:
                next_num = 1
        else:
            next_num = 1
        lead_id = f"{prefix}{next_num:05d}"

        now = now_addis_iso()
        try:
            with self.transaction():
                self._execute(
                    """INSERT INTO leads
                    (lead_id, company_name, headquarters_country, source_row_hash,
                     current_state, current_agent, last_touch_ts, next_action_due_ts,
                     next_action_agent, priority_tier, recommended_vp,
                     outreach_language, sequence_step, substitute_round,
                     ghosted_count, created_ts, updated_ts)
                    VALUES (?, ?, ?, ?, 'NEW', 'none', ?, ?, 'none',
                            ?, ?, ?, 0, 0, 0, ?, ?)""",
                    (lead_id, company_name.strip(), headquarters_country.strip(),
                     source_row_hash, now, now,
                     priority_tier, recommended_vp, outreach_language,
                     now, now)
                )
                # Initial state history entry
                self._execute(
                    """INSERT INTO state_history
                    (lead_id, from_state, to_state, agent, ts, notes)
                    VALUES (?, NULL, 'NEW', 'Agent 2', ?, 'Lead created')""",
                    (lead_id, now)
                )
                # Tags
                if tags:
                    for tag in tags:
                        self._execute(
                            "INSERT OR IGNORE INTO lead_tags (lead_id, tag, tagged_ts) VALUES (?, ?, ?)",
                            (lead_id, tag, now)
                        )
        except sqlite3.IntegrityError as e:
            raise ValidationFailedError(
                f"Lead already exists (company_name='{company_name}', "
                f"country='{headquarters_country}'): {e}"
            )

        return lead_id

    def get_lead(self, lead_id: str) -> Optional[dict]:
        """Return full lead record as dict, or None if not found."""
        row = self._fetchone(
            "SELECT * FROM leads WHERE lead_id = ?", (lead_id,)
        )
        if not row:
            return None
        lead = dict(row)
        # Attach tags
        tag_rows = self._fetchall(
            "SELECT tag FROM lead_tags WHERE lead_id = ? ORDER BY tag", (lead_id,)
        )
        lead["tags"] = [r["tag"] for r in tag_rows]
        return lead

    def get_lead_by_company(self, company_name: str,
                            headquarters_country: str = "") -> Optional[dict]:
        """Find a lead by company name (and optionally country)."""
        if headquarters_country:
            row = self._fetchone(
                "SELECT * FROM leads WHERE company_name = ? AND headquarters_country = ?",
                (company_name, headquarters_country)
            )
        else:
            row = self._fetchone(
                "SELECT * FROM leads WHERE company_name = ?", (company_name,)
            )
        return dict(row) if row else None

    def update_lead_state(
        self,
        lead_id: str,
        new_state: str,
        agent: str = "none",
        notes: str = "",
        next_action_due_ts: Optional[str] = None,
        next_action_agent: str = "none",
        **extra_fields,
    ) -> bool:
        """
        Transition a lead to a new state. Validates the transition against
        the allowed map. Logs to state_history. Returns True on success.
        Raises InvalidTransitionError if the transition is not allowed.
        """
        if new_state not in ALLOWED_STATES:
            raise ValidationFailedError(
                f"new_state '{new_state}' not in {sorted(ALLOWED_STATES)}"
            )

        lead = self.get_lead(lead_id)
        if not lead:
            raise ValidationFailedError(f"lead_id '{lead_id}' not found")

        from_state = lead["current_state"]

        # BLOCKED is a special meta-state — allowed from any state, and
        # can return to any state (operator unblocks)
        if from_state != "BLOCKED" and new_state != "BLOCKED":
            allowed = STATE_TRANSITIONS.get(from_state, frozenset())
            if new_state not in allowed:
                raise InvalidTransitionError(
                    f"Transition {from_state} → {new_state} not allowed. "
                    f"Allowed from {from_state}: {sorted(allowed)}"
                )

        now = now_addis_iso()

        # Build UPDATE query
        set_clauses = [
            "current_state = ?",
            "last_touch_ts = ?",
            "next_action_due_ts = ?",
            "next_action_agent = ?",
            "updated_ts = ?",
        ]
        params = [new_state, now, next_action_due_ts, next_action_agent, now]

        # Apply extra fields (priority_tier, recommended_vp, etc.)
        for field, value in extra_fields.items():
            if field in ("priority_tier", "recommended_vp", "outreach_language",
                         "sequence_step", "sample_lead_id", "substitute_round",
                         "ghosted_count", "current_agent"):
                set_clauses.append(f"{field} = ?")
                params.append(value)

        params.append(lead_id)

        with self.transaction():
            self._execute(
                f"UPDATE leads SET {', '.join(set_clauses)} WHERE lead_id = ?",
                tuple(params)
            )
            self._execute(
                """INSERT INTO state_history
                (lead_id, from_state, to_state, agent, ts, notes)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (lead_id, from_state, new_state, agent, now, notes)
            )

        return True

    def transfer_ownership(
        self,
        lead_id: str,
        from_agent: str,
        to_agent: str,
    ) -> bool:
        """
        Atomically transfer lead ownership from one agent to another.
        Fails if current_agent != from_agent (concurrency guard).
        """
        if to_agent not in ALLOWED_AGENTS:
            raise ValidationFailedError(
                f"to_agent '{to_agent}' not in {sorted(ALLOWED_AGENTS)}"
            )

        lead = self.get_lead(lead_id)
        if not lead:
            raise ValidationFailedError(f"lead_id '{lead_id}' not found")

        if lead["current_agent"] != from_agent:
            raise ConcurrencyError(
                f"Ownership transfer failed: lead '{lead_id}' is owned by "
                f"'{lead['current_agent']}', not '{from_agent}'"
            )

        now = now_addis_iso()
        with self.transaction():
            self._execute(
                "UPDATE leads SET current_agent = ?, last_touch_ts = ?, updated_ts = ? WHERE lead_id = ?",
                (to_agent, now, now, lead_id)
            )
        return True

    def advance_sequence_step(self, lead_id: str) -> int:
        """Increment sequence_step. Fails if already at step 6."""
        lead = self.get_lead(lead_id)
        if not lead:
            raise ValidationFailedError(f"lead_id '{lead_id}' not found")
        current_step = lead.get("sequence_step") or 0
        if current_step >= 6:
            raise ValidationFailedError(
                f"Lead '{lead_id}' is at sequence_step 6 (max). Cannot advance."
            )
        new_step = current_step + 1
        now = now_addis_iso()
        with self.transaction():
            self._execute(
                "UPDATE leads SET sequence_step = ?, last_touch_ts = ?, updated_ts = ? WHERE lead_id = ?",
                (new_step, now, now, lead_id)
            )
        return new_step

    def set_lead_field(self, lead_id: str, **fields) -> bool:
        """
        Set one or more fields on a lead (priority_tier, recommended_vp,
        outreach_language, etc.). Validates enum values.
        """
        lead = self.get_lead(lead_id)
        if not lead:
            raise ValidationFailedError(f"lead_id '{lead_id}' not found")

        # Validate enum fields
        if "priority_tier" in fields and fields["priority_tier"] not in ALLOWED_TIERS:
            raise ValidationFailedError(
                f"priority_tier '{fields['priority_tier']}' not in {sorted(ALLOWED_TIERS)}"
            )
        if "recommended_vp" in fields and fields["recommended_vp"] not in ALLOWED_VPS:
            raise ValidationFailedError(
                f"recommended_vp '{fields['recommended_vp']}' not in {sorted(ALLOWED_VPS)}"
            )
        if "outreach_language" in fields and fields["outreach_language"] not in ALLOWED_LANGS:
            raise ValidationFailedError(
                f"outreach_language '{fields['outreach_language']}' not in {sorted(ALLOWED_LANGS)}"
            )

        allowed_fields = {
            "priority_tier", "recommended_vp", "outreach_language",
            "sequence_step", "sample_lead_id", "substitute_round",
            "ghosted_count", "next_action_due_ts", "next_action_agent",
        }
        set_clauses = []
        params = []
        for field, value in fields.items():
            if field in allowed_fields:
                set_clauses.append(f"{field} = ?")
                params.append(value)

        if not set_clauses:
            return False  # nothing to update

        now = now_addis_iso()
        set_clauses.extend(["last_touch_ts = ?", "updated_ts = ?"])
        params.extend([now, now, lead_id])

        with self.transaction():
            self._execute(
                f"UPDATE leads SET {', '.join(set_clauses)} WHERE lead_id = ?",
                tuple(params)
            )
        return True

    def add_tag(self, lead_id: str, tag: str) -> bool:
        """Add a free-form tag to a lead (idempotent)."""
        now = now_addis_iso()
        with self.transaction():
            self._execute(
                "INSERT OR IGNORE INTO lead_tags (lead_id, tag, tagged_ts) VALUES (?, ?, ?)",
                (lead_id, tag, now)
            )
        return True

    def list_leads(
        self,
        state: Optional[str] = None,
        agent: Optional[str] = None,
        tier: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """List leads with optional filters."""
        sql = "SELECT * FROM leads WHERE 1=1"
        params = []
        if state:
            sql += " AND current_state = ?"
            params.append(state)
        if agent:
            sql += " AND current_agent = ?"
            params.append(agent)
        if tier:
            sql += " AND priority_tier = ?"
            params.append(tier)
        sql += " ORDER BY created_ts DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        rows = self._fetchall(sql, tuple(params))
        return [dict(r) for r in rows]

    def get_lead_history(self, lead_id: str) -> list[dict]:
        """Return full state transition history for a lead (oldest first)."""
        rows = self._fetchall(
            "SELECT * FROM state_history WHERE lead_id = ? ORDER BY ts ASC",
            (lead_id,)
        )
        return [dict(r) for r in rows]

    def get_blocked_leads(self) -> list[dict]:
        """Return all leads in BLOCKED state (operator action required)."""
        rows = self._fetchall(
            "SELECT * FROM leads WHERE current_state = 'BLOCKED' ORDER BY last_touch_ts ASC"
        )
        return [dict(r) for r in rows]

    # =================================================================
    # LOT INVENTORY
    # =================================================================

    def _validate_lot(self, lot: dict) -> list[str]:
        """Validate a lot dict. Returns list of error messages (empty if valid)."""
        errors = []

        region = _to_str(lot.get("region"))
        if region not in ALLOWED_REGIONS:
            errors.append(f"region '{region}' not in {sorted(ALLOWED_REGIONS)}")

        process = _to_str(lot.get("process"))
        if process not in ALLOWED_PROCESSES:
            errors.append(f"process '{process}' not in {sorted(ALLOWED_PROCESSES)}")

        eudr_status = _to_str(lot.get("eudr_data_status"))
        if eudr_status not in ALLOWED_EUDR_STATUS:
            errors.append(
                f"eudr_data_status '{eudr_status}' not in {sorted(ALLOWED_EUDR_STATUS)}"
            )

        status = _to_str(lot.get("status"))
        if status not in ALLOWED_LOT_STATUS:
            errors.append(f"status '{status}' not in {sorted(ALLOWED_LOT_STATUS)}")

        crop_year = _to_str(lot.get("crop_year"))
        if crop_year and "/" not in crop_year:
            errors.append(f"crop_year '{crop_year}' must be in YY/YY format")

        return errors

    def add_lot(self, lot_data: dict) -> str:
        """
        Add a lot to inventory. Returns lot_id.
        Auto-generates lot_id if not provided (LOT-YY-NNNN format).
        """
        errors = self._validate_lot(lot_data)
        if errors:
            raise ValidationFailedError(
                "Lot validation failed: " + "; ".join(errors)
            )

        # Generate lot_id if not provided
        lot_id = _to_str(lot_data.get("lot_id"))
        if not lot_id:
            crop_year = _to_str(lot_data.get("crop_year")) or "25/26"
            year_suffix = crop_year.split("/")[0]
            lot_id = self._generate_lot_id(year_suffix)

        # Check for duplicate
        existing = self.get_lot(lot_id)
        if existing:
            raise ValidationFailedError(f"lot_id '{lot_id}' already exists")

        now = now_addis_iso()
        # Insert with all fields from lot_data
        fields = [
            "lot_id", "region", "washing_station", "coop_name", "process",
            "screen_size", "cupping_score", "q_grader_name", "grading_date",
            "defect_count_sca", "moisture_pct", "water_activity", "crop_year",
            "harvest_date_range", "milling_date", "stock_bags_remaining",
            "bag_size_kg", "certifications", "certificate_of_origin",
            "eudr_data_status", "eudr_gps_lat", "eudr_gps_lon",
            "eudr_farmgate_price_etb_per_kg", "eudr_deforestation_attestation",
            "reserved_for_forward_program", "status",
        ]
        values = [lot_id]
        for f in fields[1:]:  # skip lot_id, already have it
            v = lot_data.get(f, "")
            values.append(v)

        with self.transaction():
            placeholders = ", ".join(["?"] * (len(fields) + 1))
            self._execute(
                f"INSERT INTO lots ({', '.join(fields)}, last_updated_ts) "
                f"VALUES ({placeholders})",
                tuple(values + [now])
            )
        return lot_id

    def _generate_lot_id(self, year_suffix: str) -> str:
        prefix = f"LOT-{year_suffix}-"
        row = self._fetchone(
            "SELECT lot_id FROM lots WHERE lot_id LIKE ? ORDER BY lot_id DESC LIMIT 1",
            (f"{prefix}%",)
        )
        if row and row["lot_id"]:
            try:
                next_num = int(row["lot_id"][len(prefix):]) + 1
            except ValueError:
                next_num = 1
        else:
            next_num = 1
        return f"{prefix}{next_num:04d}"

    def get_lot(self, lot_id: str) -> Optional[dict]:
        """Return full lot record as dict, or None if not found."""
        row = self._fetchone("SELECT * FROM lots WHERE lot_id = ?", (lot_id,))
        return dict(row) if row else None

    def update_lot(self, lot_id: str, **fields) -> bool:
        """Update one or more fields on a lot."""
        lot = self.get_lot(lot_id)
        if not lot:
            raise ValidationFailedError(f"lot_id '{lot_id}' not found")

        # Validate enum fields if present
        if "status" in fields and fields["status"] not in ALLOWED_LOT_STATUS:
            raise ValidationFailedError(
                f"status '{fields['status']}' not in {sorted(ALLOWED_LOT_STATUS)}"
            )
        if "eudr_data_status" in fields and fields["eudr_data_status"] not in ALLOWED_EUDR_STATUS:
            raise ValidationFailedError(
                f"eudr_data_status '{fields['eudr_data_status']}' not in {sorted(ALLOWED_EUDR_STATUS)}"
            )

        allowed_fields = {
            "region", "washing_station", "coop_name", "process", "screen_size",
            "cupping_score", "q_grader_name", "grading_date", "defect_count_sca",
            "moisture_pct", "water_activity", "crop_year", "harvest_date_range",
            "milling_date", "stock_bags_remaining", "bag_size_kg",
            "certifications", "certificate_of_origin", "eudr_data_status",
            "eudr_gps_lat", "eudr_gps_lon", "eudr_farmgate_price_etb_per_kg",
            "eudr_deforestation_attestation", "reserved_for_forward_program",
            "status",
        }
        set_clauses = []
        params = []
        for field, value in fields.items():
            if field in allowed_fields:
                set_clauses.append(f"{field} = ?")
                params.append(value)

        if not set_clauses:
            return False

        now = now_addis_iso()
        set_clauses.append("last_updated_ts = ?")
        params.extend([now, lot_id])

        with self.transaction():
            self._execute(
                f"UPDATE lots SET {', '.join(set_clauses)} WHERE lot_id = ?",
                tuple(params)
            )
        return True

    def list_lots(
        self,
        region: Optional[str] = None,
        process: Optional[str] = None,
        status: Optional[str] = None,
        eudr: Optional[str] = None,
        crop_year: Optional[str] = None,
        min_score: Optional[float] = None,
    ) -> list[dict]:
        """List lots with optional filters."""
        sql = "SELECT * FROM lots WHERE 1=1"
        params = []
        if region:
            sql += " AND region = ?"
            params.append(region)
        if process:
            sql += " AND process = ?"
            params.append(process)
        if status:
            sql += " AND status = ?"
            params.append(status)
        if eudr:
            sql += " AND eudr_data_status = ?"
            params.append(eudr)
        if crop_year:
            sql += " AND crop_year = ?"
            params.append(crop_year)
        if min_score is not None:
            sql += " AND cupping_score >= ?"
            params.append(min_score)
        sql += " ORDER BY lot_id"
        rows = self._fetchall(sql, tuple(params))
        return [dict(r) for r in rows]

    def reserve_lot(
        self,
        lot_id: str,
        lead_id: str,
        sample_type: str,
        buyer_company: str,
        crop_year: str,
    ) -> str:
        """
        Create a 7-day reservation on a lot for a sample dispatch.
        Returns reservation_id.
        Does NOT check stock — that's confirm_lot_for_sample's job.
        """
        if sample_type not in SAMPLE_QUANTITIES_GRAMS:
            raise ValidationFailedError(
                f"sample_type '{sample_type}' not in {sorted(SAMPLE_QUANTITIES_GRAMS)}"
            )

        now = now_addis()
        until = now + timedelta(days=7)
        reservation_id = f"RES-{now.strftime('%Y%m%d%H%M%S')}-{lot_id}"

        with self.transaction():
            self._execute(
                """INSERT INTO reservations
                (reservation_id, lot_id, lead_id, sample_type, quantity_grams,
                 reserved_ts, reserved_until_ts, buyer_company, crop_year, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')""",
                (reservation_id, lot_id, lead_id, sample_type,
                 SAMPLE_QUANTITIES_GRAMS[sample_type],
                 now.isoformat(timespec="seconds"),
                 until.isoformat(timespec="seconds"),
                 buyer_company, crop_year)
            )
        return reservation_id

    def get_active_reservations(self, lot_id: Optional[str] = None) -> list[dict]:
        """Return active (non-expired) reservations, optionally for a specific lot."""
        now = now_addis_iso()
        if lot_id:
            rows = self._fetchall(
                """SELECT * FROM reservations
                WHERE lot_id = ? AND status = 'active' AND reserved_until_ts > ?
                ORDER BY reserved_until_ts ASC""",
                (lot_id, now)
            )
        else:
            rows = self._fetchall(
                """SELECT * FROM reservations
                WHERE status = 'active' AND reserved_until_ts > ?
                ORDER BY reserved_until_ts ASC""",
                (now,)
            )
        return [dict(r) for r in rows]

    def expire_reservations(self) -> int:
        """Mark expired reservations as 'expired'. Returns count expired."""
        now = now_addis_iso()
        with self.transaction():
            cur = self._execute(
                """UPDATE reservations SET status = 'expired'
                WHERE status = 'active' AND reserved_until_ts <= ?""",
                (now,)
            )
        return cur.rowcount

    def confirm_lot_for_sample(
        self,
        lot_id: str,
        lead_id: str,
        sample_type: str,
        buyer_company: str,
        destination_country: str,
        crop_year: str,
    ) -> dict:
        """
        Full confirmation logic. Validates lot status, stock, crop year,
        EUDR requirements. On success, creates a reservation and returns
        the result with docs_attached.

        Returns dict:
            {
              "lot_id": ...,
              "confirmed": bool,
              "reason_if_not": str,
              "stock_after_sample_bags": float,
              "docs_attached": {...} | None,
              "reserved_until": str | None,
              "substitute_suggestion": dict | None,
            }
        """
        if sample_type not in SAMPLE_QUANTITIES_GRAMS:
            raise ValidationFailedError(
                f"sample_type '{sample_type}' not in {sorted(SAMPLE_QUANTITIES_GRAMS)}"
            )

        lot = self.get_lot(lot_id)
        eudr_required = destination_country.strip() in EU_COUNTRIES
        crop_year_match = crop_year.replace(" representative", "")

        # Lot not found
        if not lot:
            return {
                "lot_id": lot_id,
                "confirmed": False,
                "reason_if_not": f"Lot {lot_id} not found in inventory.",
                "stock_after_sample_bags": 0,
                "docs_attached": None,
                "reserved_until": None,
                "substitute_suggestion": self.find_substitute(
                    excluded_lot_id=lot_id, region=None, process=None,
                    target_score=None, crop_year=crop_year_match,
                ),
            }

        # Status check
        if lot["status"] != "active":
            return {
                "lot_id": lot_id,
                "confirmed": False,
                "reason_if_not": f"Lot status is '{lot['status']}' (must be 'active').",
                "stock_after_sample_bags": lot.get("stock_bags_remaining") or 0,
                "docs_attached": self._build_docs_payload(lot, include_eudr=False),
                "reserved_until": None,
                "substitute_suggestion": self.find_substitute(
                    excluded_lot_id=lot_id, region=lot.get("region"),
                    process=lot.get("process"),
                    target_score=lot.get("cupping_score"),
                    crop_year=crop_year_match,
                    eudr_required=eudr_required,
                ),
            }

        # Stock check
        stock_bags = lot.get("stock_bags_remaining") or 0
        if stock_bags <= 0:
            return {
                "lot_id": lot_id,
                "confirmed": False,
                "reason_if_not": "Stock depleted.",
                "stock_after_sample_bags": 0,
                "docs_attached": self._build_docs_payload(lot, include_eudr=False),
                "reserved_until": None,
                "substitute_suggestion": self.find_substitute(
                    excluded_lot_id=lot_id, region=lot.get("region"),
                    process=lot.get("process"),
                    target_score=lot.get("cupping_score"),
                    crop_year=crop_year_match,
                    eudr_required=eudr_required,
                ),
            }

        # Crop year check
        if (lot.get("crop_year") or "") != crop_year_match:
            return {
                "lot_id": lot_id,
                "confirmed": False,
                "reason_if_not": (
                    f"Crop year mismatch: lot is {lot.get('crop_year')}, "
                    f"request is {crop_year_match}."
                ),
                "stock_after_sample_bags": stock_bags,
                "docs_attached": self._build_docs_payload(lot, include_eudr=False),
                "reserved_until": None,
                "substitute_suggestion": self.find_substitute(
                    excluded_lot_id=lot_id, region=lot.get("region"),
                    process=lot.get("process"),
                    target_score=lot.get("cupping_score"),
                    crop_year=crop_year_match,
                    eudr_required=eudr_required,
                ),
            }

        # EUDR check
        eudr_status = lot.get("eudr_data_status") or ""
        if eudr_required and eudr_status != "complete":
            return {
                "lot_id": lot_id,
                "confirmed": False,
                "reason_if_not": (
                    f"EUDR data is '{eudr_status}' — required for EU destination "
                    f"({buyer_company}). Trigger EUDR completion before re-requesting."
                ),
                "stock_after_sample_bags": stock_bags,
                "docs_attached": self._build_docs_payload(lot, include_eudr=False),
                "reserved_until": None,
                "substitute_suggestion": self.find_substitute(
                    excluded_lot_id=lot_id, region=lot.get("region"),
                    process=lot.get("process"),
                    target_score=lot.get("cupping_score"),
                    crop_year=crop_year_match,
                    eudr_required=eudr_required,
                ),
            }

        # All checks passed — confirm and reserve
        sample_grams = SAMPLE_QUANTITIES_GRAMS[sample_type]
        bag_size_kg = lot.get("bag_size_kg") or DEFAULT_BAG_SIZE_KG
        sample_bags = sample_grams / (bag_size_kg * 1000)
        stock_after = max(0, stock_bags - sample_bags)

        reservation_id = self.reserve_lot(
            lot_id=lot_id, lead_id=lead_id, sample_type=sample_type,
            buyer_company=buyer_company, crop_year=crop_year,
        )
        # Fetch the reservation to get reserved_until_ts
        res = self._fetchone(
            "SELECT reserved_until_ts FROM reservations WHERE reservation_id = ?",
            (reservation_id,)
        )
        reserved_until = res["reserved_until_ts"] if res else None

        return {
            "lot_id": lot_id,
            "confirmed": True,
            "reason_if_not": "",
            "stock_after_sample_bags": round(stock_after, 4),
            "docs_attached": self._build_docs_payload(lot, include_eudr=eudr_required),
            "reserved_until": reserved_until,
            "substitute_suggestion": None,
        }

    def _build_docs_payload(self, lot: dict, include_eudr: bool) -> dict:
        """Build the docs_attached payload for a confirmed/refused lot."""
        lot_id = lot.get("lot_id", "")
        certs = []
        cert_field = _to_str(lot.get("certifications"))
        if cert_field:
            for cert in cert_field.split(";"):
                cert = cert.strip().lower()
                if cert:
                    if cert in ("organic", "ft", "fairtrade", "fair trade"):
                        certs.append(str(doc_path("certs", f"{lot_id}_{cert}")))
                    elif cert in ("ra", "rainforest alliance"):
                        certs.append(str(doc_path("certs", f"{lot_id}_ra")))
                    elif cert == "4c":
                        certs.append(str(doc_path("certs", f"{lot_id}_4c")))
                    else:
                        certs.append(str(doc_path("certs", f"{lot_id}_{cert}")))

        eudr_pack = None
        if include_eudr and (lot.get("eudr_data_status") or "") == "complete":
            eudr_pack = str(doc_path("eudr", lot_id))

        return {
            "cupping_score_sheet": str(doc_path("cupping", lot_id)),
            "green_analysis": str(doc_path("green_analysis", lot_id)),
            "eudr_data_pack": eudr_pack,
            "cert_of_origin": str(doc_path("origin", lot_id)),
            "certs_copies": certs,
        }

    def find_substitute(
        self,
        excluded_lot_id: str,
        region: Optional[str],
        process: Optional[str],
        target_score: Optional[float],
        crop_year: str,
        eudr_required: bool = False,
    ) -> Optional[dict]:
        """
        Find the next-best substitute lot.
        Same region + same process + cupping score within ±1.0.
        """
        crop_year_match = crop_year.replace(" representative", "")
        sql = """SELECT * FROM lots
                 WHERE lot_id != ? AND status = 'active'
                 AND crop_year = ? AND stock_bags_remaining > 0"""
        params = [excluded_lot_id, crop_year_match]
        if region:
            sql += " AND region = ?"
            params.append(region)
        if process:
            sql += " AND process = ?"
            params.append(process)
        if eudr_required:
            sql += " AND eudr_data_status = 'complete'"

        rows = self._fetchall(sql, tuple(params))
        candidates = []
        for row in rows:
            lot_score = row["cupping_score"] or 0
            if target_score is not None and abs(lot_score - target_score) > 1.0:
                continue
            candidates.append((dict(row), lot_score, row["stock_bags_remaining"] or 0))

        if not candidates:
            return None

        candidates.sort(key=lambda x: (
            abs(x[1] - (target_score or 0)),
            -x[2],
        ))

        best = candidates[0][0]
        return {
            "lot_id": best["lot_id"],
            "region": best["region"],
            "washing_station": best["washing_station"],
            "process": best["process"],
            "screen_size": best["screen_size"],
            "cupping_score": best["cupping_score"],
            "stock_bags_remaining": best["stock_bags_remaining"],
            "eudr_data_status": best["eudr_data_status"],
            "reason": (
                f"Substitute for {excluded_lot_id}: same region ({region}), "
                f"same process ({process}), score {best['cupping_score']} "
                f"(target was {target_score})."
            ),
        }

    def flag_lot_for_qa(self, lot_id: str, reason: str, auto: bool = False) -> bool:
        """Flag a lot for QA review (status → hold)."""
        lot = self.get_lot(lot_id)
        if not lot:
            raise ValidationFailedError(f"lot_id '{lot_id}' not found")

        now = now_addis_iso()
        qa_flag_id = f"QA-{now_addis().strftime('%Y%m%d%H%M%S')}-{lot_id}"
        with self.transaction():
            self._execute(
                "UPDATE lots SET status = 'hold', last_updated_ts = ? WHERE lot_id = ?",
                (now, lot_id)
            )
            self._execute(
                """INSERT INTO qa_flags (qa_flag_id, lot_id, auto, reason, flagged_ts)
                VALUES (?, ?, ?, ?, ?)""",
                (qa_flag_id, lot_id, 1 if auto else 0, reason, now)
            )
        return True

    def release_lot_from_qa(self, lot_id: str) -> bool:
        """Release a lot from hold → active."""
        lot = self.get_lot(lot_id)
        if not lot:
            raise ValidationFailedError(f"lot_id '{lot_id}' not found")
        if lot["status"] != "hold":
            return False
        now = now_addis_iso()
        with self.transaction():
            self._execute(
                "UPDATE lots SET status = 'active', last_updated_ts = ? WHERE lot_id = ?",
                (now, lot_id)
            )
        return True

    def log_feedback(
        self,
        lot_id: str,
        buyer_company: str,
        buyer_segment: str,
        rejection_reason: str,
    ) -> dict:
        """
        Log rejection feedback from Agent 4.
        Auto-flags QA if ≥2 rejections with same critical keyword.
        """
        # Generate unique feedback_id (include microseconds to avoid collisions)
        now = now_addis()
        feedback_id = f"FB-{now.strftime('%Y%m%d%H%M%S')}-{now.microsecond:06d}-{lot_id}"
        now_iso = now.isoformat(timespec="seconds")

        with self.transaction():
            self._execute(
                """INSERT INTO feedback
                (feedback_id, lot_id, buyer_company, buyer_segment,
                 rejection_reason, logged_ts, qa_auto_flagged)
                VALUES (?, ?, ?, ?, ?, ?, 0)""",
                (feedback_id, lot_id, buyer_company, buyer_segment,
                 rejection_reason, now_iso)
            )

        # Check for pattern: ≥2 rejections with same critical keyword
        all_feedback = self._fetchall(
            "SELECT * FROM feedback WHERE lot_id = ? ORDER BY logged_ts ASC",
            (lot_id,)
        )
        reason_lower = rejection_reason.lower()
        matched_keyword = None
        pattern_match = False
        for fb in all_feedback[:-1]:  # exclude the one we just added
            old_reason = (fb["rejection_reason"] or "").lower()
            for kw in CRITICAL_KEYWORDS:
                if kw in reason_lower and kw in old_reason:
                    pattern_match = True
                    matched_keyword = kw
                    break
            if pattern_match:
                break

        qa_flagged = False
        if pattern_match and len(all_feedback) >= 2:
            self.flag_lot_for_qa(
                lot_id,
                reason=f"≥2 rejections with critical keyword match "
                       f"(keyword: {matched_keyword})",
                auto=True
            )
            qa_flagged = True
            # Update the feedback row to mark qa_auto_flagged
            with self.transaction():
                self._execute(
                    "UPDATE feedback SET qa_auto_flagged = 1 WHERE feedback_id = ?",
                    (feedback_id,)
                )

        return {
            "feedback_id": feedback_id,
            "lot_id": lot_id,
            "buyer_company": buyer_company,
            "buyer_segment": buyer_segment,
            "rejection_reason": rejection_reason,
            "logged_ts": now_iso,
            "qa_auto_flagged": qa_flagged,
        }

    # =================================================================
    # SAMPLE BUDGET (atomic, auto-resetting)
    # =================================================================

    def get_sample_budget(self, week_start: Optional[str] = None) -> dict:
        """Return the sample budget for the given week (default: current week)."""
        if week_start is None:
            week_start = _week_start()
        row = self._fetchone(
            "SELECT * FROM sample_budget WHERE week_start = ?", (week_start,)
        )
        if not row:
            # Auto-create the week
            week_end = _week_end(week_start)
            now = now_addis_iso()
            with self.transaction():
                self._execute(
                    """INSERT OR IGNORE INTO sample_budget
                    (week_start, week_end, full_sets_used, fallback_150g_used,
                     type_b_used, type_c_used, last_updated_ts, last_updated_by)
                    VALUES (?, ?, 0, 0, 0, 0, ?, 'system')""",
                    (week_start, week_end, now)
                )
            row = self._fetchone(
                "SELECT * FROM sample_budget WHERE week_start = ?", (week_start,)
            )
        return dict(row) if row else {}

    def consume_sample_budget(self, sample_type: str, lead_id: str) -> bool:
        """
        Atomically consume one unit of sample budget for the given type.
        Auto-resets on Monday 00:01 Addis time.
        Returns True if budget was available, False if exhausted.
        """
        if sample_type not in SAMPLE_QUANTITIES_GRAMS:
            raise ValidationFailedError(
                f"sample_type '{sample_type}' not in {sorted(SAMPLE_QUANTITIES_GRAMS)}"
            )

        cap = SAMPLE_BUDGET_CAPS.get(sample_type, -1)
        if cap == -1:
            # No cap (Type C)
            return True

        budget = self.get_sample_budget()  # auto-creates current week
        week_start = budget["week_start"]

        # Map sample_type to budget column
        column_map = {
            "350g": "full_sets_used",
            "150g": "fallback_150g_used",
            "200g": "type_b_used",
        }
        column = column_map.get(sample_type)
        if not column:
            return False

        current_used = budget.get(column, 0)
        if current_used >= cap:
            return False

        now = now_addis_iso()
        with self.transaction():
            # Atomic increment with cap check (prevents race condition)
            cur = self._execute(
                f"""UPDATE sample_budget
                SET {column} = {column} + 1,
                    last_updated_ts = ?,
                    last_updated_by = ?
                WHERE week_start = ? AND {column} < ?""",
                (now, f"lead:{lead_id}", week_start, cap)
            )
            if cur.rowcount == 0:
                # Cap was hit between our read and write — budget exhausted
                return False
        return True

    def add_to_waitlist(
        self,
        lead_id: str,
        tier: str,
        sample_type: str = "350g",
    ) -> bool:
        """Add a lead to the sample waitlist."""
        now = now_addis_iso()
        with self.transaction():
            self._execute(
                """INSERT INTO sample_waitlist
                (lead_id, tier, sample_type, queued_ts, fulfilled_ts)
                VALUES (?, ?, ?, ?, NULL)""",
                (lead_id, tier, sample_type, now)
            )
        return True

    def get_waitlist(self, fulfilled: bool = False) -> list[dict]:
        """Return waitlist entries (default: unfulfilled only)."""
        if fulfilled:
            rows = self._fetchall(
                "SELECT * FROM sample_waitlist ORDER BY queued_ts ASC"
            )
        else:
            rows = self._fetchall(
                "SELECT * FROM sample_waitlist WHERE fulfilled_ts IS NULL ORDER BY queued_ts ASC"
            )
        return [dict(r) for r in rows]

    def process_waitlist(self) -> list[str]:
        """
        Process the waitlist in tier order (S → A → B → C).
        Returns list of lead_ids that received budget allocation.
        Called on Monday 00:01 Addis time, or manually.
        """
        # Tier priority
        tier_order = {"S": 0, "A": 1, "B": 2, "C": 3}
        waitlist = self.get_waitlist(fulfilled=False)
        waitlist.sort(key=lambda x: (tier_order.get(x["tier"], 99), x["queued_ts"]))

        fulfilled_lead_ids = []
        for entry in waitlist:
            if self.consume_sample_budget(entry["sample_type"], entry["lead_id"]):
                now = now_addis_iso()
                with self.transaction():
                    self._execute(
                        "UPDATE sample_waitlist SET fulfilled_ts = ? WHERE id = ?",
                        (now, entry["id"])
                    )
                fulfilled_lead_ids.append(entry["lead_id"])
        return fulfilled_lead_ids

    # =================================================================
    # KPI / DASHBOARD
    # =================================================================

    def get_kpi_snapshot(self) -> dict:
        """Return a full KPI snapshot for the daily dashboard."""
        # Lead states
        state_rows = self._fetchall(
            "SELECT current_state, COUNT(*) as n FROM leads GROUP BY current_state"
        )
        states = {r["current_state"]: r["n"] for r in state_rows}
        total_leads = sum(states.values())

        # Lot stats
        lot_status_rows = self._fetchall(
            "SELECT status, COUNT(*) as n FROM lots GROUP BY status"
        )
        lot_status = {r["status"]: r["n"] for r in lot_status_rows}

        eudr_rows = self._fetchall(
            "SELECT eudr_data_status, COUNT(*) as n FROM lots WHERE status = 'active' GROUP BY eudr_data_status"
        )
        eudr_counts = {r["eudr_data_status"]: r["n"] for r in eudr_rows}

        region_rows = self._fetchall(
            "SELECT region, COUNT(*) as n FROM lots WHERE status = 'active' GROUP BY region ORDER BY n DESC"
        )
        regions = {r["region"]: r["n"] for r in region_rows}

        total_stock_bags = self._fetchone(
            "SELECT COALESCE(SUM(stock_bags_remaining), 0) as n FROM lots WHERE status IN ('active', 'hold')"
        )["n"]

        # Reservations
        active_reservations = len(self.get_active_reservations())

        # Feedback
        feedback_count = self._fetchone("SELECT COUNT(*) as n FROM feedback")["n"]
        multi_rejection_rows = self._fetchall(
            """SELECT lot_id, COUNT(*) as n FROM feedback
            GROUP BY lot_id HAVING n >= 2 ORDER BY n DESC"""
        )
        multi_rejection_lots = [dict(r) for r in multi_rejection_rows]

        # Sample budget
        budget = self.get_sample_budget()

        # Waitlist depth
        waitlist_count = self._fetchone(
            "SELECT COUNT(*) as n FROM sample_waitlist WHERE fulfilled_ts IS NULL"
        )["n"]

        # Blocked leads
        blocked_count = states.get("BLOCKED", 0)

        return {
            "generated_ts": now_addis_iso(),
            "leads": {
                "total": total_leads,
                "by_state": states,
                "blocked_count": blocked_count,
            },
            "lots": {
                "total": sum(lot_status.values()),
                "by_status": lot_status,
                "eudr_completeness": eudr_counts,
                "regional_distribution": regions,
                "total_stock_bags": total_stock_bags,
            },
            "samples": {
                "active_reservations": active_reservations,
                "budget": budget,
                "waitlist_depth": waitlist_count,
            },
            "feedback": {
                "total_logged": feedback_count,
                "multi_rejection_lots": multi_rejection_lots,
            },
        }
