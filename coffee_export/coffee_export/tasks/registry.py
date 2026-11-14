"""
Task registry — the catalogue of task types the durable queue may run.

Phase 1A ships the registry EMPTY of business types: no recurring job
from coffee_export/tasks/jobs.py is registered and nothing in the
application enqueues work. Only tests (and, in a later approved phase,
the business integration) register task types. This is the mechanism
that keeps Phase 1A infrastructure-only: enqueue() rejects any task_type
the registry does not know, so no unapproved business job can sneak in.

Validation contract (payload is validated at BOTH gates):
  1. at enqueue time   — DurableTaskQueue.enqueue() calls validate_payload
  2. before execution  — the worker re-validates after claiming; a row
     tampered directly in the DB (invalid JSON / failing validator) is
     failed through the fenced path, never executed.

A validator is any callable that takes the parsed payload dict and
raises PayloadValidationError on bad input. The default (no validator
registered) requires the payload to be a JSON object (dict) — matching
the payload column contract "TEXT (JSON object)".
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

Validator = Callable[[dict], None]
Handler = Callable[[dict, "TaskSnapshot"], Any]


class UnknownTaskTypeError(KeyError):
    """The task_type is not in the registry."""


class PayloadValidationError(ValueError):
    """The payload does not satisfy the task type's contract."""


@dataclass(frozen=True)
class TaskSnapshot:
    """Read-only view of a task handed to handlers."""

    task_id: str
    task_type: str
    organization_id: str
    attempts: int
    payload: dict


@dataclass(frozen=True)
class TaskSpec:
    """One registered task type."""

    task_type: str
    handler: Handler
    validator: Validator | None = None
    description: str = ""


def require_object(payload: Any) -> None:
    """Default validator: payload must be a JSON object (dict)."""
    if not isinstance(payload, dict):
        raise PayloadValidationError(f"payload must be a JSON object, got {type(payload).__name__}")


class TaskRegistry:
    """Registry of runnable task types. Thread-safe for registration
    before workers start (registration happens once at process start)."""

    def __init__(self) -> None:
        self._specs: dict[str, TaskSpec] = {}

    # ── registration / lookup ──────────────────────────────────
    def register(
        self,
        task_type: str,
        handler: Handler,
        validator: Validator | None = None,
        description: str = "",
    ) -> TaskSpec:
        if not task_type or not isinstance(task_type, str):
            raise ValueError("task_type must be a non-empty string")
        if task_type in self._specs:
            raise ValueError(
                f"task_type {task_type!r} is already registered — refusing to "
                "overwrite (a silent overwrite could swap an approved handler)"
            )
        if not callable(handler):
            raise TypeError("handler must be callable")
        if validator is not None and not callable(validator):
            raise TypeError("validator must be callable or None")
        spec = TaskSpec(
            task_type=task_type,
            handler=handler,
            validator=validator,
            description=description,
        )
        self._specs[task_type] = spec
        log.debug(f"registered task type {task_type!r}")
        return spec

    def spec(self, task_type: str) -> TaskSpec | None:
        return self._specs.get(task_type)

    def require(self, task_type: str) -> TaskSpec:
        found = self._specs.get(task_type)
        if found is None:
            raise UnknownTaskTypeError(task_type)
        return found

    def known_types(self) -> tuple[str, ...]:
        return tuple(sorted(self._specs))

    def __contains__(self, task_type: str) -> bool:
        return task_type in self._specs

    # ── validation (both gates) ─────────────────────────────────
    def validate_payload(self, task_type: str, payload: Any) -> dict:
        """Validate and return the payload. Raises UnknownTaskTypeError /
        PayloadValidationError. Used by enqueue() and by the worker
        before execution."""
        spec = self.require(task_type)  # UnknownTaskTypeError if not registered
        if payload is None:
            payload = {}
        require_object(payload)  # always: payload column is a JSON object
        if spec.validator is not None:
            spec.validator(payload)  # may raise PayloadValidationError
        return payload


# ── Module-level default registry ──────────────────────────────
# Production processes (worker / admin CLI) use this instance. It ships
# EMPTY in Phase 1A — business task types are a later approved phase.
default_registry = TaskRegistry()
