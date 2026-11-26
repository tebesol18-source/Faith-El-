"""
Task registry tests — Phase 1A.

Proves the registration and dual-gate validation contract:
  * unknown task types are rejected (the mechanism that keeps Phase 1A
    infrastructure-only — no unapproved business job can be enqueued)
  * duplicate registration is refused (an approved handler can never be
    silently swapped)
  * default validation: payload must be a JSON object
  * custom validators run at both gates (enqueue + before execution)
  * NonRetryableTaskError — the handler-side permanent-failure marker
    that drives leased → failed (terminal)
  * the production default_registry ships EMPTY

Every test uses its own registry instance (no shared state); nothing
here touches any database.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from coffee_export.tasks.registry import (
    NonRetryableTaskError,
    PayloadValidationError,
    TaskRegistry,
    TaskSnapshot,
    UnknownTaskTypeError,
    default_registry,
)


def _echo(payload, snapshot):
    return {"echo": payload}


def test_register_and_lookup() -> None:
    reg = TaskRegistry()
    spec = reg.register("test.echo", _echo, description="echoes the payload")
    assert reg.known_types() == ("test.echo",)
    assert "test.echo" in reg
    assert reg.require("test.echo") is spec
    assert spec.description == "echoes the payload"


def test_unknown_task_type_rejected() -> None:
    reg = TaskRegistry()
    with pytest.raises(UnknownTaskTypeError):
        reg.validate_payload("not.registered", {})
    with pytest.raises(UnknownTaskTypeError):
        reg.require("not.registered")
    assert reg.spec("not.registered") is None


def test_duplicate_registration_refused() -> None:
    reg = TaskRegistry()
    reg.register("test.echo", _echo)
    with pytest.raises(ValueError, match="already registered"):
        reg.register("test.echo", _echo)


def test_bad_registration_arguments() -> None:
    reg = TaskRegistry()
    with pytest.raises(ValueError):
        reg.register("", _echo)
    with pytest.raises(TypeError):
        reg.register("test.echo", "not-callable")  # type: ignore[arg-type]


def test_default_validation_requires_object() -> None:
    reg = TaskRegistry()
    reg.register("test.echo", _echo)
    # dict (incl. empty) passes; None is treated as {}
    assert reg.validate_payload("test.echo", {}) == {}
    assert reg.validate_payload("test.echo", None) == {}
    assert reg.validate_payload("test.echo", {"k": 1}) == {"k": 1}
    # non-objects fail — everything the payload column cannot represent
    for bad in ([1, 2], "text", 42, True, 3.14):
        with pytest.raises(PayloadValidationError):
            reg.validate_payload("test.echo", bad)  # type: ignore[arg-type]


def test_custom_validator() -> None:
    reg = TaskRegistry()

    def require_x(payload: dict) -> None:
        if "x" not in payload:
            raise PayloadValidationError("missing required key 'x'")
        if not isinstance(payload["x"], int):
            raise PayloadValidationError("'x' must be an int")

    reg.register("test.x", _echo, validator=require_x)
    assert reg.validate_payload("test.x", {"x": 1}) == {"x": 1}
    with pytest.raises(PayloadValidationError, match="missing required key 'x'"):
        reg.validate_payload("test.x", {})
    with pytest.raises(PayloadValidationError, match="must be an int"):
        reg.validate_payload("test.x", {"x": "1"})


def test_default_registry_ships_empty() -> None:
    """Phase 1A contract: no business task type is registered in
    production — in particular none of the 8 recurring jobs."""
    assert default_registry.known_types() == ()


def test_non_retryable_error_contract() -> None:
    """NonRetryableTaskError is the handler-side permanent-failure marker:
    importable, a plain Exception subclass (distinct from the gate
    exceptions UnknownTaskTypeError/PayloadValidationError, so a handler
    can raise it without colliding with gate classification), and
    raisable from a handler signature."""
    assert issubclass(NonRetryableTaskError, Exception)
    assert not issubclass(NonRetryableTaskError, UnknownTaskTypeError)
    assert not issubclass(NonRetryableTaskError, PayloadValidationError)

    def permanent_handler(payload, snapshot):
        raise NonRetryableTaskError("cannot ever succeed")

    with pytest.raises(NonRetryableTaskError, match="cannot ever succeed"):
        permanent_handler({"x": 1}, None)


def test_task_snapshot_is_readonly_view() -> None:
    snap = TaskSnapshot(
        task_id="t1",
        task_type="test.echo",
        organization_id="org-system",
        attempts=2,
        payload={"x": 1},
    )
    assert snap.attempts == 2
    with pytest.raises(FrozenInstanceError):
        snap.attempts = 99  # type: ignore[misc] — frozen
