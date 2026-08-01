"""
State package — StateManager, exceptions, constants.

The StateManager is the single entry point for ALL state mutations.
Agents never touch the database directly — they call semantic methods.

Usage:
    from coffee_export.state import StateManager, InvalidTransitionError

    with StateManager() as sm:
        lead_id = sm.create_lead(company_name="Falcon Coffees", ...)
        sm.update_lead_state(lead_id, "ENRICHED", agent="Agent 2")
"""

from coffee_export.state.constants import (
    ALLOWED_AGENTS,
    ALLOWED_EUDR_STATUS,
    ALLOWED_LANGS,
    ALLOWED_LOT_STATUS,
    ALLOWED_PROCESSES,
    ALLOWED_REGIONS,
    ALLOWED_STATES,
    ALLOWED_TIERS,
    ALLOWED_VPS,
    CRITICAL_KEYWORDS,
    EU_COUNTRIES,
    MAX_SEQUENCE_STEP,
    MAX_SUBSTITUTE_ROUNDS,
    RESERVATION_DAYS,
    SAMPLE_QUANTITIES_GRAMS,
    STATE_TRANSITIONS,
)
from coffee_export.state.exceptions import (
    BudgetExceededError,
    BusinessRuleError,
    ConcurrencyError,
    InvalidTransitionError,
    NotFoundError,
    StateManagerError,
    ValidationFailedError,
)
from coffee_export.state.state_manager import StateManager

__all__ = [
    # StateManager
    "StateManager",
    # Exceptions
    "StateManagerError",
    "ValidationFailedError",
    "InvalidTransitionError",
    "ConcurrencyError",
    "BudgetExceededError",
    "NotFoundError",
    "BusinessRuleError",
    # Constants
    "ALLOWED_STATES",
    "STATE_TRANSITIONS",
    "ALLOWED_REGIONS",
    "ALLOWED_PROCESSES",
    "ALLOWED_EUDR_STATUS",
    "ALLOWED_LOT_STATUS",
    "ALLOWED_VPS",
    "ALLOWED_TIERS",
    "ALLOWED_LANGS",
    "ALLOWED_AGENTS",
    "EU_COUNTRIES",
    "SAMPLE_QUANTITIES_GRAMS",
    "CRITICAL_KEYWORDS",
    "MAX_SEQUENCE_STEP",
    "MAX_SUBSTITUTE_ROUNDS",
    "RESERVATION_DAYS",
]
