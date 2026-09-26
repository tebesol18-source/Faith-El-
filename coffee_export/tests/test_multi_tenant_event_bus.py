"""
Multi-tenant EventBus and StateManager isolation tests.
Verifies that event publishing and consumption are strictly isolated by organization_id.

Hermetic by design: this test previously wrote rows into whatever DB the engine
pointed at and never cleaned up, so (a) it polluted the configured database with
org-test-* events and (b) its absolute count assertion failed on the second run
(leftover events from run 1 were also consumed). It now sweeps any stale
org-test-a/b events before asserting and deletes everything it created.
"""

from __future__ import annotations

import pytest
from sqlalchemy import delete

from coffee_export.database.base import SessionLocal
from coffee_export.database.models.events import Event
from coffee_export.events.event_bus import EventBus
from coffee_export.state.state_manager import StateManager

TEST_ORGS = ("org-test-a", "org-test-b")


def _sweep_test_events() -> None:
    """Delete every event row belonging to the test orgs (idempotency guard)."""
    with SessionLocal() as session:
        session.execute(delete(Event).where(Event.organization_id.in_(TEST_ORGS)))
        session.commit()


def test_event_bus_tenant_isolation() -> None:
    _sweep_test_events()

    # 1. Initialize two isolated EventBus instances
    bus_a = EventBus(organization_id="org-test-a")
    bus_b = EventBus(organization_id="org-test-b")

    try:
        # 2. Publish an event in Tenant B
        event_id = bus_b.publish(
            "LEAD_CREATED",
            entity_type="lead",
            entity_id="L-TEST-B-001",
            payload={"info": "test"},
            published_by="Agent 1",
        )
        assert event_id > 0

        # 3. Consume from Tenant A -> must be empty
        events_a = bus_a.consume(subscriber_id="Agent 2")
        assert len(events_a) == 0

        # 4. Consume from Tenant B -> must successfully receive the event
        events_b = bus_b.consume(subscriber_id="Agent 2")
        assert len(events_b) == 1
        assert events_b[0]["entity_id"] == "L-TEST-B-001"
        assert events_b[0]["published_by"] == "Agent 1"

    finally:
        bus_a.close()
        bus_b.close()
        _sweep_test_events()
