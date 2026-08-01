"""
Global Search page — search across all entities.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import state_badge
from coffee_export.state import StateManager


def render() -> None:
    st.title("🔍 Global Search")
    st.caption("Find any lead, lot, sample, contract, or shipment")

    # Search box
    query = st.text_input(
        "Search",
        placeholder="Type a company name, lot ID, region, or any keyword...",
        label_visibility="collapsed",
    )

    if not query or len(query.strip()) < 2:
        st.info("💡 Type at least 2 characters to search across all entities.")
        return

    with StateManager() as sm:
        results = sm.global_search(query.strip())

    total = sum(len(v) for v in results.values())

    if total == 0:
        st.warning(f"No results found for '{query}'")
        return

    st.success(f"Found **{total}** result(s) for '{query}'")

    # Results by type
    type_icons = {
        "leads": "👥 Leads",
        "lots": "📦 Lots",
        "sample_requests": "🧪 Sample Requests",
        "contracts": "📄 Contracts",
        "shipments": "🚢 Shipments",
    }

    for entity_type, label in type_icons.items():
        matches = results.get(entity_type, [])
        if not matches:
            continue

        st.subheader(f"{label} ({len(matches)})")

        for item in matches:
            col1, col2, col3 = st.columns([3, 2, 1])
            with col1:
                st.write(f"**{item['label']}**")
                st.caption(item["subtitle"])
            with col2:
                st.write(state_badge(item.get("state", "")))
            with col3:
                st.caption(item["id"])
