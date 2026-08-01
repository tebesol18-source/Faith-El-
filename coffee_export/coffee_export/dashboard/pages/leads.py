"""
Leads page — lead management with filters and detail view.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import (
    format_ts,
    get_leads,
    language_flag,
    state_badge,
    tier_badge,
    vp_label,
)


def render() -> None:
    st.title("👥 Leads")
    st.caption("Browse and filter buyer leads across the pipeline")

    # ── Filters ──
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        state_filter = st.selectbox(
            "State",
            options=[
                "All",
                "NEW",
                "ENRICHED",
                "IN_SEQUENCE",
                "QUALIFIED",
                "SAMPLE_DISPATCHED",
                "SAMPLE_FEEDBACK_DUE",
                "DECIDED_APPROVED",
                "DECIDED_REJECTED",
                "DECIDED_NEEDS_ANOTHER",
                "GHOSTED",
                "CONTRACTED",
                "NURTURE",
                "BLOCKED",
            ],
        )
    with col2:
        tier_filter = st.selectbox("Priority Tier", options=["All", "S", "A", "B", "C"])
    with col3:
        agent_filter = st.selectbox(
            "Current Agent",
            options=["All", "Agent 1", "Agent 2", "Agent 3", "Agent 4", "Agent 5", "none"],
        )
    with col4:
        limit = st.selectbox("Show", options=[25, 50, 100, 200, 500], index=1)

    # Fetch leads
    state = None if state_filter == "All" else state_filter
    tier = None if tier_filter == "All" else tier_filter
    agent = None if agent_filter == "All" else agent_filter

    leads = get_leads(state=state, agent=agent, tier=tier, limit=limit)

    # ── Summary ──
    st.subheader(f"Results: {len(leads)} lead(s)")

    if not leads:
        st.info("No leads match the current filters. Try adjusting or run Agent 2 to import leads.")
        return

    # ── Lead Table ──
    # Convert to display format
    display_data = []
    for lead in leads:
        display_data.append(
            {
                "Lead ID": lead.get("lead_id", ""),
                "Company": lead.get("company_name", ""),
                "Country": lead.get("headquarters_country", ""),
                "State": state_badge(lead.get("current_state", "")),
                "Tier": tier_badge(lead.get("priority_tier")),
                "VP": vp_label(lead.get("recommended_vp")),
                "Lang": language_flag(lead.get("outreach_language", "EN")),
                "Agent": lead.get("current_agent", ""),
                "Step": lead.get("sequence_step", 0),
                "Updated": format_ts(lead.get("updated_ts")),
            }
        )

    st.dataframe(
        display_data,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Step": st.column_config.ProgressColumn(
                "Sequence", min_value=0, max_value=6, format="%d/6"
            ),
        },
    )

    # ── Lead Detail ──
    st.subheader("Lead Detail")
    lead_ids = [lead["lead_id"] for lead in leads]
    selected_id = st.selectbox("Select a lead to view details", options=lead_ids)

    if selected_id:
        selected_lead = next(lead for lead in leads if lead["lead_id"] == selected_id)

        col1, col2 = st.columns(2)
        with col1:
            st.write("**Company:**", selected_lead.get("company_name", "—"))
            st.write("**Country:**", selected_lead.get("headquarters_country", "—"))
            st.write("**Website:**", selected_lead.get("website", "—"))
            st.write("**State:**", state_badge(selected_lead.get("current_state", "")))
            st.write("**Current Agent:**", selected_lead.get("current_agent", "—"))

        with col2:
            st.write("**Priority Tier:**", tier_badge(selected_lead.get("priority_tier")))
            st.write("**Recommended VP:**", vp_label(selected_lead.get("recommended_vp")))
            st.write(
                "**Language:**",
                language_flag(selected_lead.get("outreach_language", "EN")),
                selected_lead.get("outreach_language", ""),
            )
            st.write("**Sequence Step:**", f"{selected_lead.get('sequence_step', 0)}/6")
            st.write("**Ghosted Count:**", selected_lead.get("ghosted_count", 0))
            st.write("**Substitute Round:**", selected_lead.get("substitute_round", 0))

        # State history
        st.write("**State History**")
        from coffee_export.state import StateManager

        with StateManager() as sm:
            history = sm.get_lead_history(selected_id)

        if history:
            for h in history:
                from_state = h.get("from_state") or "—"
                to_state = state_badge(h.get("to_state", ""))
                agent = h.get("agent_id", "—")
                ts = format_ts(h.get("ts"))
                notes = h.get("notes") or ""
                st.write(f"  {ts} | {from_state} → {to_state} | by {agent} | {notes}")
        else:
            st.write("  No history available")
