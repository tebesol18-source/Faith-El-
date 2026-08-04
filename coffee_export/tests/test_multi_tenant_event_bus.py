"""
Multi-tenant EventBus and StateManager isolation tests.
Verifies that event publishing and consumption are strictly isolated by organization_id.
"""

from __future__ import annotations

import pytest
from coffee_export.events.event_bus import EventBus
from coffee_export.state.state_manager import StateManager


def test_event_bus_tenant_isolation() -> None:
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
