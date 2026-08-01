"""
Agent Controls page — start, pause, run, and manage agents.
"""

from __future__ import annotations

import threading

import streamlit as st

from coffee_export.dashboard.utils import format_ts
from coffee_export.state import StateManager

# Agent metadata for display
AGENT_META = {
    "Agent 1": {
        "icon": "📦",
        "role": "Supplier & Inventory",
        "desc": "Lot confirmation, EUDR data, QA flags, stock management",
    },
    "Agent 2": {
        "icon": "🔍",
        "role": "Lead Research & Enrichment",
        "desc": "CSV import, VP/segment/tier/language classification",
    },
    "Agent 3": {
        "icon": "📧",
        "role": "Outreach & Qualification",
        "desc": "LinkedIn/email sequences, Q1-Q5 QUAL gate, conversation memory",
    },
    "Agent 4": {
        "icon": "🧪",
        "role": "Sample Management",
        "desc": "Lot recommendation, sample dispatch, cupping scores, decisions",
    },
    "Agent 5": {
        "icon": "⚖️",
        "role": "Legal & Compliance",
        "desc": "Contract execution, ICC terms, compliance documentation",
    },
    "Agent 6": {
        "icon": "🚢",
        "role": "Logistics & Shipping",
        "desc": "Freight booking, customs, delivery tracking",
    },
    "Agent 7": {
        "icon": "🤝",
        "role": "Sales & Relationship Mgmt",
        "desc": "Long-term buyer relationships, NPS, repeat orders",
    },
}


def render() -> None:
    st.title("🤖 Agent Controls")
    st.caption("Control center — start, pause, run, and monitor all agents")

    with StateManager() as sm:
        agents = sm.get_all_agent_statuses()

    if not agents:
        st.info("No agents registered. Database may need initialization.")
        return

    # ── Agent Control Cards ──
    for agent in agents:
        agent_id = agent["agent_id"]
        meta = AGENT_META.get(
            agent_id,
            {"icon": "❓", "role": agent.get("name", ""), "desc": agent.get("description", "")},
        )
        status = agent.get("status", "active")

        # Status badge
        status_badge = {
            "active": "🟢 Active",
            "paused": "🟡 Paused",
            "disabled": "🔴 Disabled",
        }.get(status, f"❓ {status}")

        with st.container():
            col1, col2, col3, col4 = st.columns([1, 4, 1, 1])

            with col1:
                st.write(f"### {meta['icon']}")

            with col2:
                st.write(f"**{agent_id}** — {meta['role']}")
                st.caption(meta["desc"])
                st.caption(
                    f"Status: {status_badge} | Updated: {format_ts(agent.get('updated_ts'))}"
                )

            with col3:
                # Run Now button
                if st.button("▶ Run Now", key=f"run_{agent_id}", disabled=(status != "active")):
                    _run_agent_async(agent_id)

            with col4:
                # Control dropdown
                action = st.selectbox(
                    "Action",
                    options=["—", "Pause", "Resume", "Disable", "Enable"],
                    key=f"action_{agent_id}",
                    label_visibility="collapsed",
                )
                if action != "—":
                    _handle_agent_action(agent_id, action)
                    st.rerun()

        st.divider()

    # ── Run History ──
    st.subheader("📋 Recent Run History")
    from coffee_export.dashboard.utils import get_events

    activity = []
    for evt_type in ("AGENT_COMPLETED", "AGENT_FAILED", "AGENT_STARTED"):
        activity.extend(get_events(event_type=evt_type, limit=20))

    activity.sort(key=lambda e: e.get("published_ts", ""), reverse=True)

    if activity:
        display_data = []
        for event in activity[:15]:
            payload = event.get("payload") or {}
            icon = {"AGENT_STARTED": "▶️", "AGENT_COMPLETED": "✅", "AGENT_FAILED": "❌"}.get(
                event.get("event_type", ""), "❓"
            )
            display_data.append(
                {
                    "": icon,
                    "Agent": payload.get("agent_id", event.get("entity_id", "")),
                    "Event": event.get("event_type", "").replace("AGENT_", ""),
                    "Processed": payload.get("processed", "—"),
                    "Failed": payload.get("failed", "—"),
                    "Duration": f"{payload.get('duration_seconds', '—')}s",
                    "Time": format_ts(event.get("published_ts")),
                }
            )
        st.dataframe(display_data, use_container_width=True, hide_index=True)
    else:
        st.info("No agent runs yet.")


def _run_agent_async(agent_id: str) -> None:
    """Run an agent in a background thread."""
    from coffee_export.agents.base import AgentRunner
    from coffee_export.agents.registry import create_agent

    agent = create_agent(agent_id)
    if not agent:
        st.error(f"Agent '{agent_id}' is not registered (may not be built yet)")
        return

    def _run():
        runner = AgentRunner(agent)
        runner.run()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    st.success(f"▶ {agent_id} started in background!")


def _handle_agent_action(agent_id: str, action: str) -> None:
    """Handle pause/resume/disable/enable actions."""
    with StateManager() as sm:
        if action == "Pause":
            sm.set_agent_status(agent_id, "paused")
            st.success(f"⏸ {agent_id} paused")
        elif action == "Resume":
            sm.set_agent_status(agent_id, "active")
            st.success(f"▶ {agent_id} resumed")
        elif action == "Disable":
            sm.set_agent_status(agent_id, "disabled")
            st.warning(f"⛔ {agent_id} disabled")
        elif action == "Enable":
            sm.set_agent_status(agent_id, "active")
            st.success(f"▶ {agent_id} enabled")
