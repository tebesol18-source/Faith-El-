"""
Events page — event bus monitor for inter-agent communication.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import format_ts, get_events


def render() -> None:
    st.title("📡 Events")
    st.caption("Event bus — inter-agent communication monitor")

    # ── Filters ──
    col1, col2, col3 = st.columns(3)

    with col1:
        event_type_filter = st.selectbox(
            "Event Type",
            options=[
                "All",
                "LEAD_CREATED",
                "LEAD_ENRICHED",
                "LEAD_QUALIFIED",
                "LEAD_GHOSTED",
                "LEAD_NURTURED",
                "LEAD_BLOCKED",
                "SAMPLE_REQUESTED",
                "LOT_CONFIRMED",
                "LOT_CONFIRMATION_FAILED",
                "SAMPLE_DISPATCHED",
                "SAMPLE_DELIVERED",
                "CUPPING_SCORE_RECEIVED",
                "SAMPLE_APPROVED",
                "SAMPLE_REJECTED",
                "SAMPLE_NEEDS_ANOTHER",
                "CONTRACT_DRAFTED",
                "CONTRACT_SIGNED",
                "CONTRACT_COMPLETED",
                "SHIPMENT_BOOKED",
                "SHIPMENT_DEPARTED",
                "SHIPMENT_DELIVERED",
                "AGENT_STARTED",
                "AGENT_COMPLETED",
                "AGENT_FAILED",
                "BUDGET_EXHAUSTED",
                "BUDGET_RESET",
            ],
        )
    with col2:
        status_filter = st.selectbox(
            "Status", options=["All", "pending", "consumed", "dead_letter"]
        )
    with col3:
        limit = st.selectbox("Show", options=[25, 50, 100, 200], index=1)

    event_type = None if event_type_filter == "All" else event_type_filter
    status = None if status_filter == "All" else status_filter

    events = get_events(event_type=event_type, status=status, limit=limit)

    # ── Summary ──
    st.subheader(f"Results: {len(events)} event(s)")

    if not events:
        st.info("No events match the current filters.")
        return

    # ── Event Table ──
    display_data = []
    for event in events:
        status_icon = {"pending": "🟡", "consumed": "✅", "dead_letter": "💀"}.get(
            event.get("status", ""), "❓"
        )
        display_data.append(
            {
                "ID": event.get("id"),
                "Type": event.get("event_type", ""),
                "Entity": f"{event.get('entity_type', '')}:{event.get('entity_id', '')}",
                "Published By": event.get("published_by", ""),
                "Published": format_ts(event.get("published_ts")),
                "Consumed By": event.get("consumed_by") or "—",
                "Status": f"{status_icon} {event.get('status', '')}",
            }
        )

    st.dataframe(display_data, use_container_width=True, hide_index=True)

    # ── Event Detail ──
    st.subheader("Event Detail")
    event_ids = [e["id"] for e in events]
    selected_id = st.selectbox("Select an event to view payload", options=event_ids)

    if selected_id:
        selected_event = next(e for e in events if e["id"] == selected_id)
        st.json(selected_event.get("payload") or {})

    # ── Dead Letter Queue ──
    dead_letter_events = [e for e in events if e.get("status") == "dead_letter"]
    if dead_letter_events:
        st.error(f"💀 {len(dead_letter_events)} dead-letter event(s) need operator attention")
        for dl in dead_letter_events:
            st.write(f"  • Event #{dl['id']} ({dl['event_type']}): {dl.get('error_message', '')}")
