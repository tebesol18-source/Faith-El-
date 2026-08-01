"""
Constants — state machine, allowed values, sample budget caps.

All business rules that the StateManager enforces are defined here.
Changing a rule = changing a constant here (not hunting through methods).
"""

from __future__ import annotations

# ──────────────────────────────────────────────────────────────
# Lead states & transitions
# ──────────────────────────────────────────────────────────────

ALLOWED_STATES: frozenset[str] = frozenset(
    {
        "NEW",
        "ENRICHED",
        "IN_SEQUENCE",
        "QUALIFIED",
        "SAMPLE_DISPATCHED",
        "SAMPLE_FEEDBACK_DUE",
        "DECIDED_APPROVED",
        "DECIDED_REJECTED",
        "DECIDED_NEEDS_ANOTHER",
        "GHOSTED",
        "CONTRACTED",
        "NURTURE",
        "BLOCKED",
    }
)

# Allowed state transitions: from_state → {allowed to_states}
# BLOCKED is a meta-state: can be entered from any state, can return to any state
STATE_TRANSITIONS: dict[str, frozenset[str]] = {
    "NEW": frozenset({"ENRICHED", "BLOCKED"}),
    "ENRICHED": frozenset({"IN_SEQUENCE", "BLOCKED", "NURTURE"}),
    "IN_SEQUENCE": frozenset({"IN_SEQUENCE", "QUALIFIED", "NURTURE", "GHOSTED", "BLOCKED"}),
    "QUALIFIED": frozenset({"SAMPLE_DISPATCHED", "BLOCKED", "NURTURE"}),
    "SAMPLE_DISPATCHED": frozenset({"SAMPLE_FEEDBACK_DUE", "BLOCKED"}),
    "SAMPLE_FEEDBACK_DUE": frozenset(
        {
            "DECIDED_APPROVED",
            "DECIDED_REJECTED",
            "DECIDED_NEEDS_ANOTHER",
            "GHOSTED",
            "BLOCKED",
        }
    ),
    "DECIDED_NEEDS_ANOTHER": frozenset({"QUALIFIED", "NURTURE", "BLOCKED"}),
    "DECIDED_APPROVED": frozenset({"CONTRACTED", "BLOCKED"}),
    "DECIDED_REJECTED": frozenset({"NURTURE", "BLOCKED"}),
    "GHOSTED": frozenset({"NURTURE", "BLOCKED"}),
    "CONTRACTED": frozenset({"BLOCKED"}),  # terminal (unless re-contract)
    "NURTURE": frozenset({"IN_SEQUENCE", "BLOCKED"}),
    "BLOCKED": frozenset(ALLOWED_STATES - {"BLOCKED"}),
}

# ──────────────────────────────────────────────────────────────
# Enum allowed values
# ──────────────────────────────────────────────────────────────

ALLOWED_REGIONS: frozenset[str] = frozenset(
    {
        "Yirgacheffe",
        "Sidamo",
        "Guji",
        "Limu",
        "Jimma",
        "Harrar",
        "other",
    }
)

ALLOWED_PROCESSES: frozenset[str] = frozenset({"Washed", "Natural", "Honey", "Anaerobic"})

ALLOWED_EUDR_STATUS: frozenset[str] = frozenset({"complete", "partial", "missing"})

ALLOWED_LOT_STATUS: frozenset[str] = frozenset({"active", "committed", "depleted", "hold"})

ALLOWED_VPS: frozenset[str] = frozenset({"VP1", "VP2", "VP3", "VP4"})

ALLOWED_TIERS: frozenset[str] = frozenset({"S", "A", "B", "C", "Disqualify"})

ALLOWED_LANGS: frozenset[str] = frozenset(
    {
        "EN",
        "DE",
        "FR",
        "IT",
        "JA",
        "KO",
        "ZH",
        "AR",
        "TR",
        "RU",
    }
)

ALLOWED_AGENTS: frozenset[str] = frozenset(
    {
        "Agent 1",
        "Agent 2",
        "Agent 3",
        "Agent 4",
        "Agent 5",
        "Agent 6",
        "Agent 7",
        "operator",
        "none",
    }
)

# ──────────────────────────────────────────────────────────────
# Sample types & quantities
# ──────────────────────────────────────────────────────────────

SAMPLE_QUANTITIES_GRAMS: dict[str, int] = {
    "350g": 350,  # Type A — pre-shipment
    "200g": 200,  # Type B — forward-program representative
    "500g": 500,  # Type C — shipment sample (post-contract)
    "150g": 150,  # Fallback 150g (partial QUAL)
}


# Weekly sample budget caps (overridden by settings)
def _get_budget_caps() -> dict[str, int]:
    """Get sample budget caps from settings (called at runtime, not import)."""
    from coffee_export.config import settings

    return {
        "350g": settings.SAMPLE_BUDGET_FULL_SETS,
        "150g": settings.SAMPLE_BUDGET_FALLBACK_150G,
        "200g": settings.SAMPLE_BUDGET_TYPE_B,
        "500g": -1,  # Type C — no cap (post-contract, mandatory)
    }


# ──────────────────────────────────────────────────────────────
# EU countries (EUDR required)
# ──────────────────────────────────────────────────────────────

EU_COUNTRIES: frozenset[str] = frozenset(
    {
        "Germany",
        "Austria",
        "Belgium",
        "Bulgaria",
        "Croatia",
        "Cyprus",
        "Czech Republic",
        "Denmark",
        "Estonia",
        "Finland",
        "France",
        "Greece",
        "Hungary",
        "Ireland",
        "Italy",
        "Latvia",
        "Lithuania",
        "Luxembourg",
        "Malta",
        "Netherlands",
        "Poland",
        "Portugal",
        "Romania",
        "Slovakia",
        "Slovenia",
        "Spain",
        "Sweden",
        "United Kingdom",
        "Norway",
        "Switzerland",
        "Iceland",
        "Liechtenstein",
    }
)


# ──────────────────────────────────────────────────────────────
# Critical feedback keywords (trigger QA auto-flag)
# ──────────────────────────────────────────────────────────────

CRITICAL_KEYWORDS: tuple[str, ...] = (
    "musty",
    "fermented",
    "sour",
    "phenolic",
    "rio",
    "potato defect",
    "defective",
)

# ──────────────────────────────────────────────────────────────
# Defaults
# ──────────────────────────────────────────────────────────────

DEFAULT_BAG_SIZE_KG: int = 60
MAX_SEQUENCE_STEP: int = 6
MAX_SUBSTITUTE_ROUNDS: int = 2
RESERVATION_DAYS: int = 7
