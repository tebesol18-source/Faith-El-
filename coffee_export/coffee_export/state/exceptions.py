"""
StateManager exceptions — custom hierarchy for all state-related errors.

Each exception has a specific meaning so agents can catch and handle
appropriately (e.g., retry on ConcurrencyError, give up on InvalidTransitionError).
"""

from __future__ import annotations


class StateManagerError(Exception):
    """Base exception for all StateManager errors."""


class ValidationFailedError(StateManagerError):
    """Raised when input data fails validation (invalid enum, missing field, duplicate)."""


class InvalidTransitionError(StateManagerError):
    """Raised when a state transition is not in the allowed map.

    The agent should not retry — it needs to pick a different action.
    """


class ConcurrencyError(StateManagerError):
    """Raised when an ownership transfer fails (agent doesn't own the lead).

    The agent should re-read the lead's current state and adapt.
    """


class BudgetExceededError(StateManagerError):
    """Raised when sample budget is exhausted.

    The agent should add the lead to the waitlist instead of retrying.
    """


class NotFoundError(StateManagerError):
    """Raised when an entity (lead, lot, etc.) is not found."""


class BusinessRuleError(StateManagerError):
    """Raised when a business rule is violated (e.g., shipping without QUAL pass)."""
