"""
AI Memory Viewer — inspect Agent 3's conversation memories per lead.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import (
    format_ts,
    get_leads,
    state_badge,
    tier_badge,
    vp_label,
)
from coffee_export.state import StateManager

# Memory type icons
MEMORY_ICONS = {
    "conversation_summary": "💬",
    "buyer_preference": "❤️",
    "objection": "⚠️",
    "qualification_signal": "✅",
    "context": "📝",
    "next_step": "➡️",
}


def render() -> None:
    st.title("🧠 AI Memory Viewer")
    st.caption("Inspect what Agent 3 remembers about each buyer's conversations")

    # ── Lead selector ──
    leads = get_leads(limit=500)
    if not leads:
        st.info("No leads available. Run Agent 2 to import leads first.")
        return

    lead_options = [f"{lead['lead_id']} — {lead.get('company_name', '?')}" for lead in leads]
    selected = st.selectbox("Select a lead", options=lead_options)

    if not selected:
        return

    lead_id = selected.split(" — ")[0]

    with StateManager() as sm:
        lead = sm.get_lead(lead_id)
        if not lead:
            st.error(f"Lead {lead_id} not found")
            return

        # Lead summary
        col1, col2, col3, col4 = st.columns(4)
        col1.write(f"**Company:** {lead.get('company_name', '—')}")
        col2.write(f"**State:** {state_badge(lead.get('current_state', ''))}")
        col3.write(f"**Tier:** {tier_badge(lead.get('priority_tier'))}")
        col4.write(f"**VP:** {vp_label(lead.get('recommended_vp'))}")

        st.divider()

        # ── Conversation Context ──
        st.subheader("📋 Conversation Context")
        context = sm.get_conversation_context(lead_id)

        col1, col2, col3 = st.columns(3)
        col1.metric("Memories", context.get("memory_count", 0))
        col2.metric("Touches", context.get("touch_count", 0))
        qual = context.get("qual_status", {})
        col3.metric("QUAL Gate", qual.get("summary", "0/5"))

        # ── Memories ──
        st.subheader("🧠 Memories")
        memories = sm.get_memories(lead_id, limit=50)

        if not memories:
            st.info(
                "No memories stored yet. Memories are created as Agent 3 interacts with this lead."
            )
        else:
            # Filter by type
            type_filter = st.selectbox(
                "Filter by type",
                options=["All"] + list(MEMORY_ICONS.keys()),
            )

            for mem in memories:
                if type_filter != "All" and mem["memory_type"] != type_filter:
                    continue

                icon = MEMORY_ICONS.get(mem["memory_type"], "📌")
                importance = mem.get("importance", 5)
                importance_bar = "⭐" * min(importance, 10)

                with st.container():
                    col1, col2 = st.columns([1, 10])
                    with col1:
                        st.write(f"### {icon}")
                    with col2:
                        st.write(f"**{mem['memory_type'].replace('_', ' ').title()}**")
                        st.write(mem["content"])
                        st.caption(
                            f"Importance: {importance_bar} ({importance}/10) | "
                            f"Source: {mem.get('source', '—')} | "
                            f"Created: {format_ts(mem.get('created_ts'))}"
                        )
                    st.divider()

        # ── Outreach Touches ──
        st.subheader("📧 Outreach Touches")
        touches = sm.get_outreach_touches(lead_id, limit=20)

        if not touches:
            st.info("No outreach touches recorded yet.")
        else:
            display_data = []
            for t in touches:
                direction_icon = "→" if t.get("direction") == "outbound" else "←"
                display_data.append(
                    {
                        "": direction_icon,
                        "Step": t.get("step_number", "—"),
                        "Channel": t.get("channel", "—"),
                        "Subject": t.get("subject", "") or t.get("content_summary", ""),
                        "Response": t.get("response_type") or "—",
                        "Time": format_ts(t.get("sent_ts") or t.get("response_ts")),
                    }
                )
            st.dataframe(display_data, use_container_width=True, hide_index=True)

        # ── QUAL Gate Status ──
        st.subheader("✅ QUAL Gate Status")
        qual = sm.check_qual_gate(lead_id)

        col1, col2 = st.columns([1, 3])
        with col1:
            if qual["all_passed"]:
                st.success("✅ All passed!")
            else:
                st.warning(f"{qual['questions_answered']}/5 answered")

        with col2:
            for qid, answer in qual["answers"].items():
                positive = qual["positive"].get(qid, False)
                icon = "✅" if positive else "❌" if answer else "⚪"
                st.write(f"  {icon} **{qid}**: {answer[:80] if answer else '(not answered)'}")
