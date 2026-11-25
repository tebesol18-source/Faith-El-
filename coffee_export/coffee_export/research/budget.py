"""
Budget enforcement for research sessions (TryComp Phase 2, §12.4 / §3 H).

Per-session limits with stop-on-exhaustion:

  * max_tool_calls  — executed tool invocations
  * max_model_calls — AI gateway calls made on behalf of the session
  * max_wall_seconds — wall-clock seconds of the CURRENT active run
    (measured from started_ts; reset on resume — each run gets a fresh
    window, no fabricated cross-pause counter)
  * max_cost_usd    — the sum of costs ACTUALLY REPORTED by providers

All limits are optional — a missing/null field means unlimited. Usage is
execution fact, never estimate: cost accounting only sums numbers a
provider really reported (usage_cost_usd stays NULL while nothing has
been reported — NULL means "nothing reported yet", never "zero"), so an
unknown cost can never silently pass a cost budget AND can never fake
satisfaction of one. A cost limit with no reported costs is simply not
(yet) evaluable; check_budget treats it as not exhausted and the session
carries the honest unknown.

BudgetExhaustedError is the stop signal: the engine refuses the call,
records a budget_exhausted audit row (not counted as usage) and moves the
session to budget_exhausted. Continuation is a HUMAN decision —
resume_session with new budgets (the intervention path, §12.4).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from coffee_export.research.common import canonical_json

#: Budget limit fields, in canonical-JSON sort order (stable serialization).
BUDGET_FIELDS: tuple[str, ...] = (
    "max_cost_usd",
    "max_model_calls",
    "max_tool_calls",
    "max_wall_seconds",
)


class BudgetExhaustedError(Exception):
    """Raised when a session's budget refuses an action BEFORE it runs.

    ``reason`` is the exhausted budget axis (a BUDGET_FIELDS name), or
    'session' when raised because the session is already in the
    budget_exhausted state. The engine records an honest
    budget_exhausted tool-call row (audit, not usage) and stops the
    session; only the human resume path (new budgets) may continue it.
    """

    def __init__(self, reason: str, message: str | None = None) -> None:
        self.reason = reason
        super().__init__(message or f"research budget exhausted before execution: {reason}")


@dataclass(frozen=True)
class BudgetSpec:
    """Per-session budget limits. None = unlimited on that axis."""

    max_tool_calls: int | None = None
    max_model_calls: int | None = None
    max_wall_seconds: float | None = None
    max_cost_usd: float | None = None

    def __post_init__(self) -> None:
        for field in ("max_tool_calls", "max_model_calls"):
            value = getattr(self, field)
            if value is not None and (not isinstance(value, int) or isinstance(value, bool)):
                raise ValueError(f"{field} must be an int or None, got {value!r}")
        for field in ("max_wall_seconds", "max_cost_usd"):
            value = getattr(self, field)
            if value is not None and not isinstance(value, (int, float)):
                raise ValueError(f"{field} must be a number or None, got {value!r}")
        for field in BUDGET_FIELDS:
            value = getattr(self, field)
            if value is not None and value < 0:
                raise ValueError(f"{field} must be >= 0, got {value!r}")

    def to_dict(self) -> dict:
        """Canonical storage form (canonical_json of this dict is the row)."""
        return {
            "max_cost_usd": self.max_cost_usd,
            "max_model_calls": self.max_model_calls,
            "max_tool_calls": self.max_tool_calls,
            "max_wall_seconds": self.max_wall_seconds,
        }

    def to_json(self) -> str:
        return canonical_json(self.to_dict())

    @classmethod
    def from_dict(cls, data: dict | None) -> BudgetSpec:
        if data is None:
            return cls()
        unknown = set(data) - set(BUDGET_FIELDS)
        if unknown:
            raise ValueError(f"unknown budget fields: {sorted(unknown)}")
        return cls(
            max_cost_usd=data.get("max_cost_usd"),
            max_model_calls=data.get("max_model_calls"),
            max_tool_calls=data.get("max_tool_calls"),
            max_wall_seconds=data.get("max_wall_seconds"),
        )

    @classmethod
    def from_json(cls, raw: str | None) -> BudgetSpec:
        if raw is None:
            return cls()
        return cls.from_dict(json.loads(raw))


def check_budget(
    spec: BudgetSpec,
    *,
    tool_calls: int,
    model_calls: int,
    wall_seconds: float,
    cost_usd: float | None,
) -> str | None:
    """Evaluate the next action against the budgets.

    Returns the exhausted BUDGET_FIELD name, or None when the action is
    within budget. Callers pass the post-action projections (e.g. tool
    calls INCLUDING the call about to run). cost_usd is the sum of
    REPORTED costs — None means nothing has been reported, in which case
    the cost axis is honestly not evaluable and cannot trip.
    """
    if spec.max_tool_calls is not None and tool_calls > spec.max_tool_calls:
        return "max_tool_calls"
    if spec.max_model_calls is not None and model_calls > spec.max_model_calls:
        return "max_model_calls"
    if spec.max_wall_seconds is not None and wall_seconds > spec.max_wall_seconds:
        return "max_wall_seconds"
    if spec.max_cost_usd is not None and cost_usd is not None and cost_usd > spec.max_cost_usd:
        return "max_cost_usd"
    return None
