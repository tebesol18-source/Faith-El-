"""
Event Bus — decoupled inter-agent communication.

Agents don't call each other directly. They publish events to the bus;
subscribers receive them asynchronously. The `events` table is the
persistent message queue (at-least-once delivery).

USAGE
-----
    from coffee_export.events import EventBus, LEAD_QUALIFIED

    bus = EventBus()
    bus.publish(LEAD_QUALIFIED, entity_type="lead", entity_id="L-2026-00047",
                payload={"lead_id": "L-2026-00047"}, published_by="Agent 3")

    events = bus.consume(subscriber_id="Agent 4", event_type=LEAD_QUALIFIED)
    for event in events:
        # process event
        bus.mark_consumed(event["id"], subscriber_id="Agent 4")
"""

from __future__ import annotations

import contextlib
import json
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from coffee_export.database.base import SessionLocal, now_addis_iso
from coffee_export.database.models import Event
from coffee_export.events.event_types import ALL_EVENT_TYPES
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))
MAX_RETRIES: int = 3


class EventBus:
    """Persistent event bus backed by the `events` table."""

    def __init__(self) -> None:
        self.session = SessionLocal()
        self._subscribers: dict[str, list[Callable[[dict], None]]] = {}
        log.debug("EventBus initialized")

    def __enter__(self) -> EventBus:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def close(self) -> None:
        """Close the underlying session."""
        with contextlib.suppress(Exception):
            self.session.close()

    def _commit(self) -> None:
        self.session.commit()

    def _rollback(self) -> None:
        self.session.rollback()

    # ── PUBLISH ──

    def publish(
        self,
        event_type: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        payload: dict[str, Any] | None = None,
        published_by: str = "system",
    ) -> int:
        """Publish an event to the bus. Returns the event ID."""
        if event_type not in ALL_EVENT_TYPES:
            raise ValueError(
                f"Unknown event_type '{event_type}'. " f"Must be one of {sorted(ALL_EVENT_TYPES)}"
            )

        now = now_addis_iso()
        payload_json = json.dumps(payload, ensure_ascii=False) if payload else None

        try:
            event = Event(
                event_type=event_type,
                entity_type=entity_type,
                entity_id=entity_id,
                payload=payload_json,
                published_by=published_by,
                published_ts=now,
                status="pending",
            )
            self.session.add(event)
            self.session.flush()
            event_id = event.id
            self._commit()

            log.info(
                f"Event published: #{event_id} {event_type} "
                f"by {published_by} (entity={entity_type}:{entity_id})"
            )

            self._fire_subscribers(event_type, event)
            return event_id

        except Exception as e:
            self._rollback()
            raise RuntimeError(f"Failed to publish event: {e}") from e

    def _fire_subscribers(self, event_type: str, event: Event) -> None:
        """Fire all in-process subscribers for this event type."""
        callbacks = self._subscribers.get(event_type, [])
        callbacks += self._subscribers.get("*", [])

        event_dict = {
            "id": event.id,
            "event_type": event.event_type,
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "payload": json.loads(event.payload) if event.payload else None,
            "published_by": event.published_by,
            "published_ts": event.published_ts,
        }

        for callback in callbacks:
            try:
                callback(event_dict)
            except Exception as e:
                log.warning(f"Subscriber callback failed for {event_type}: {e}")

    # ── SUBSCRIBE (in-process, real-time) ──

    def subscribe(self, event_type: str, callback: Callable[[dict], None]) -> None:
        """Register an in-process callback for an event type."""
        if event_type != "*" and event_type not in ALL_EVENT_TYPES:
            raise ValueError(
                f"Unknown event_type '{event_type}'. "
                f"Use '*' for wildcard, or one of {sorted(ALL_EVENT_TYPES)}"
            )
        self._subscribers.setdefault(event_type, []).append(callback)
        log.debug(f"Subscriber registered for {event_type}")

    def unsubscribe(self, event_type: str, callback: Callable[[dict], None]) -> None:
        """Remove a previously registered callback."""
        callbacks = self._subscribers.get(event_type, [])
        if callback in callbacks:
            callbacks.remove(callback)

    # ── CONSUME (poll-based, for agents) ──

    def consume(
        self,
        subscriber_id: str,
        event_type: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Fetch pending events for a subscriber."""
        stmt = (
            select(Event)
            .where(Event.status == "pending")
            .order_by(Event.published_ts.asc())
            .limit(limit)
        )
        if event_type:
            stmt = stmt.where(Event.event_type == event_type)
        if entity_type:
            stmt = stmt.where(Event.entity_type == entity_type)
        if entity_id:
            stmt = stmt.where(Event.entity_id == entity_id)

        events = self.session.execute(stmt).scalars().all()

        now = now_addis_iso()
        for event in events:
            event.consumed_by = subscriber_id
            event.consumed_ts = now
        self._commit()

        return [self._event_to_dict(e) for e in events]

    def mark_consumed(self, event_id: int, subscriber_id: str) -> bool:
        """Mark an event as successfully consumed."""
        event = self.session.get(Event, event_id)
        if not event:
            return False
        event.status = "consumed"
        event.consumed_by = subscriber_id
        event.consumed_ts = now_addis_iso()
        self._commit()
        log.debug(f"Event #{event_id} consumed by {subscriber_id}")
        return True

    def mark_failed(self, event_id: int, subscriber_id: str, error_message: str) -> bool:
        """Mark an event as failed (will be retried). After MAX_RETRIES → dead_letter."""
        event = self.session.get(Event, event_id)
        if not event:
            return False

        retry_count = 0
        if event.error_message:
            parts = event.error_message.split(":", 2)
            if len(parts) == 3 and parts[0] == "retry":
                with contextlib.suppress(ValueError):
                    retry_count = int(parts[1])

        retry_count += 1

        if retry_count >= MAX_RETRIES:
            event.status = "dead_letter"
            event.error_message = f"retry:{retry_count}:{error_message}"
            log.warning(
                f"Event #{event_id} moved to dead_letter "
                f"after {retry_count} retries: {error_message}"
            )
        else:
            event.status = "pending"
            event.consumed_by = None
            event.consumed_ts = None
            event.error_message = f"retry:{retry_count}:{error_message}"
            log.info(
                f"Event #{event_id} failed (retry {retry_count}/{MAX_RETRIES}): " f"{error_message}"
            )

        self._commit()
        return True

    # ── REPLAY (debugging) ──

    def replay(
        self,
        event_type: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        since: str | None = None,
        until: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Query past events (read-only)."""
        stmt = select(Event).order_by(Event.published_ts.desc()).limit(limit)
        if event_type:
            stmt = stmt.where(Event.event_type == event_type)
        if entity_type:
            stmt = stmt.where(Event.entity_type == entity_type)
        if entity_id:
            stmt = stmt.where(Event.entity_id == entity_id)
        if since:
            stmt = stmt.where(Event.published_ts >= since)
        if until:
            stmt = stmt.where(Event.published_ts <= until)
        if status:
            stmt = stmt.where(Event.status == status)

        events = self.session.execute(stmt).scalars().all()
        return [self._event_to_dict(e) for e in events]

    # ── MANAGEMENT ──

    def get_pending_count(self) -> int:
        """Count of pending events."""
        from sqlalchemy import func

        return (
            self.session.execute(
                select(func.count(Event.id)).where(Event.status == "pending")
            ).scalar()
            or 0
        )

    def get_dead_letter_count(self) -> int:
        """Count of dead-letter events."""
        from sqlalchemy import func

        return (
            self.session.execute(
                select(func.count(Event.id)).where(Event.status == "dead_letter")
            ).scalar()
            or 0
        )

    def get_dead_letter_events(self, limit: int = 20) -> list[dict[str, Any]]:
        """Return dead-letter events for operator review."""
        events = (
            self.session.execute(
                select(Event)
                .where(Event.status == "dead_letter")
                .order_by(Event.published_ts.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )
        return [self._event_to_dict(e) for e in events]

    def requeue_dead_letter(self, event_id: int) -> bool:
        """Move a dead-letter event back to pending."""
        event = self.session.get(Event, event_id)
        if not event or event.status != "dead_letter":
            return False
        event.status = "pending"
        event.consumed_by = None
        event.consumed_ts = None
        event.error_message = None
        self._commit()
        log.info(f"Event #{event_id} requeued from dead_letter")
        return True

    def cleanup_old_events(self, days: int = 90) -> int:
        """Delete consumed events older than N days. Pending/dead_letter never deleted."""
        cutoff = (datetime.now(ADDIS_TZ) - timedelta(days=days)).isoformat()
        events = (
            self.session.execute(
                select(Event).where(Event.status == "consumed", Event.published_ts < cutoff)
            )
            .scalars()
            .all()
        )
        count = 0
        for event in events:
            self.session.delete(event)
            count += 1
        if count:
            self._commit()
            log.info(f"Cleaned up {count} consumed events older than {days} days")
        return count

    def _event_to_dict(self, event: Event) -> dict[str, Any]:
        """Convert an Event ORM object to a dict."""
        return {
            "id": event.id,
            "event_type": event.event_type,
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "payload": json.loads(event.payload) if event.payload else None,
            "published_by": event.published_by,
            "published_ts": event.published_ts,
            "consumed_by": event.consumed_by,
            "consumed_ts": event.consumed_ts,
            "status": event.status,
            "error_message": event.error_message,
        }
