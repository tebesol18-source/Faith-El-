"""
Agents page — agent registry, status, and recent activity.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import format_ts, get_events, get_registered_agents


def render() -> None:
    st.title("🤖 Agents")
    st.caption("Registered agents and their recent activity")

    # ── Agent Registry ──
    st.subheader("Registered Agents")
    agents = get_registered_agents()

    if not agents:
        st.info("No agents registered yet. Import agent modules to register them.")
        return

    # Agent descriptions
    agent_info = {
        "Agent 1": {
            "role": "Supplier & Inventory",
            "icon": "📦",
            "desc": "Lot confirmation, EUDR data, QA flags, stock management",
        },
        "Agent 2": {
            "role": "Lead Research & Enrichment",
            "icon": "🔍",
            "desc": "CSV import, VP/segment/tier/language classification",
        },
        "Agent 3": {
            "role": "Outreach & Qualification",
            "icon": "📧",
            "desc": "LinkedIn/email sequences, Q1-Q5 QUAL gate, conversation memory",
        },
        "Agent 4": {
            "role": "Sample Management",
            "icon": "🧪",
            "desc": "Lot recommendation, sample dispatch, cupping scores, decisions",
        },
        "Agent 5": {
            "role": "Legal & Compliance",
            "icon": "⚖️",
            "desc": "Contract execution, ICC terms, compliance documentation",
        },
        "Agent 6": {
            "role": "Logistics & Shipping",
            "icon": "🚢",
            "desc": "Freight booking, customs, delivery tracking",
        },
        "Agent 7": {
            "role": "Sales & Relationship Mgmt",
            "icon": "🤝",
            "desc": "Long-term buyer relationships, NPS, repeat orders",
        },
    }

    for agent_id in agents:
        info = agent_info.get(agent_id, {"role": "Unknown", "icon": "❓", "desc": ""})
        col1, col2 = st.columns([1, 4])
        with col1:
            st.write(f"### {info['icon']}")
        with col2:
            st.write(f"**{agent_id}** — {info['role']}")
            st.caption(info["desc"])

    st.divider()

    # ── Recent Agent Activity (from events) ──
    st.subheader("Recent Agent Activity")

    # Fetch AGENT_STARTED, AGENT_COMPLETED, AGENT_FAILED events
    activity_events = []

    for evt_type in ("AGENT_COMPLETED", "AGENT_FAILED", "AGENT_STARTED"):
        events = get_events(event_type=evt_type, limit=20)
        activity_events.extend(events)

    # Sort by published_ts descending
    activity_events.sort(key=lambda e: e.get("published_ts", ""), reverse=True)

    if not activity_events:
        st.info("No agent activity yet. Run an agent to see events here.")
        return

    # Show last 25 events
    display_data = []
    for event in activity_events[:25]:
        status_icon = {"AGENT_STARTED": "▶️", "AGENT_COMPLETED": "✅", "AGENT_FAILED": "❌"}.get(
            event.get("event_type", ""), "❓"
        )

        payload = event.get("payload") or {}
        agent_id = payload.get("agent_id", event.get("entity_id", ""))

        display_data.append(
            {
                "Status": status_icon,
                "Agent": agent_id,
                "Event": event.get("event_type", ""),
                "Processed": payload.get("processed", "—"),
                "Failed": payload.get("failed", "—"),
                "Duration": f"{payload.get('duration_seconds', '—')}s",
                "Time": format_ts(event.get("published_ts")),
            }
        )

    st.dataframe(display_data, use_container_width=True, hide_index=True)

    # ── Pipeline Flow Diagram ──
    st.subheader("Pipeline Flow")
    st.markdown("""
    ```
    Agent 2          Agent 3            Agent 4           Agent 1
    (Enrich)  ──→   (Outreach)  ──→   (Sample)   ←──→  (Inventory)
        │               │                  │
        ↓               ↓                  ↓
    LEAD_ENRICHED   LEAD_QUALIFIED   SAMPLE_REQUESTED
                        │                  │
                        ↓                  ↓
                    QUAL gate         LOT_CONFIRMED
                        │                  │
                        ↓                  ↓
                    Agent 4            Sample dispatch
                    (Sample Mgmt)           │
                                            ↓
                                    SAMPLE_APPROVED
                                            │
                                            ↓
                                       Agent 5 (Contract)
    ```
    """)
