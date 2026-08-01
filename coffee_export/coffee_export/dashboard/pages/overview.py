"""
Overview page — pipeline snapshot with KPI cards.

The first thing the operator sees: leads by state, inventory health,
sample budget, and feedback status.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import (
    eudr_badge,
    format_ts,
    get_snapshot,
    kpi_card,
    state_badge,
)


def render() -> None:
    st.title("📊 Overview")
    st.caption("Pipeline snapshot — updated every 10 seconds")

    try:
        snapshot = get_snapshot()
    except Exception as e:
        st.error(f"Failed to load data: {e}")
        st.info("Make sure the database is initialized: `alembic upgrade head`")
        return

    # ── Top KPI Cards ──
    st.subheader("Pipeline")
    col1, col2, col3, col4, col5 = st.columns(5)

    leads = snapshot["leads"]
    kpi_card(col1, "Total Leads", leads["total"])
    kpi_card(col2, "In Sequence", leads["by_state"].get("IN_SEQUENCE", 0))
    kpi_card(col3, "Qualified", leads["by_state"].get("QUALIFIED", 0))
    kpi_card(col4, "Approved", leads["by_state"].get("DECIDED_APPROVED", 0))
    kpi_card(col5, "Contracted", leads["by_state"].get("CONTRACTED", 0))

    # ── Leads by State ──
    st.subheader("Leads by State")
    state_data = leads["by_state"]

    if state_data:
        # Create a visual bar for each state
        max_count = max(state_data.values()) if state_data else 1
        for state, count in sorted(state_data.items(), key=lambda x: -x[1]):
            badge = state_badge(state)
            pct = (count / max_count) * 100 if max_count > 0 else 0
            col_bar, col_num = st.columns([4, 1])
            col_bar.write(f"{badge}")
            col_bar.progress(int(pct) / 100)
            col_num.write(f"**{count}**")
    else:
        st.info("No leads yet. Run Agent 2 to import leads from a CSV.")

    st.divider()

    # ── Inventory ──
    st.subheader("Inventory")
    lots = snapshot["lots"]
    col1, col2, col3, col4 = st.columns(4)
    kpi_card(col1, "Total Lots", lots["total"])
    kpi_card(col2, "Stock (bags)", lots["total_stock_bags"])
    kpi_card(col3, "On Hold", lots["by_status"].get("hold", 0))
    kpi_card(col4, "Depleted", lots["by_status"].get("depleted", 0))

    # EUDR completeness
    st.write("**EUDR Compliance (active lots)**")
    eudr = lots["eudr_completeness"]
    total_active = sum(eudr.values()) if eudr else 0
    if total_active > 0:
        col1, col2, col3 = st.columns(3)
        complete_pct = (eudr.get("complete", 0) / total_active) * 100
        partial_pct = (eudr.get("partial", 0) / total_active) * 100
        missing_pct = (eudr.get("missing", 0) / total_active) * 100

        col1.metric(eudr_badge("complete"), f"{eudr.get('complete', 0)}", f"{complete_pct:.0f}%")
        col2.metric(eudr_badge("partial"), f"{eudr.get('partial', 0)}", f"{partial_pct:.0f}%")
        col3.metric(eudr_badge("missing"), f"{eudr.get('missing', 0)}", f"{missing_pct:.0f}%")
    else:
        st.info("No active lots.")

    # Regional distribution
    regions = lots["regional_distribution"]
    if regions:
        st.write("**Lots by Region**")
        for region, count in regions.items():
            st.write(f"  • {region}: {count}")

    st.divider()

    # ── Samples ──
    st.subheader("Samples")
    samples = snapshot["samples"]
    col1, col2, col3 = st.columns(3)
    kpi_card(col1, "Active Reservations", samples["active_reservations"])
    kpi_card(col2, "Waitlist Depth", samples["waitlist_depth"])

    # Budget
    budget = samples.get("budget", {})
    if budget:
        st.write("**Sample Budget This Week**")
        col1, col2, col3 = st.columns(3)
        col1.metric("Full Sets (350g)", f"{budget.get('full_sets_used', 0)}/3")
        col2.metric("Fallback (150g)", f"{budget.get('fallback_150g_used', 0)}/2")
        col3.metric("Type B (200g)", f"{budget.get('type_b_used', 0)}/2")

    st.divider()

    # ── Feedback / QA ──
    st.subheader("Feedback & QA")
    feedback = snapshot["feedback"]
    col1, col2 = st.columns(2)
    kpi_card(col1, "Total Feedback", feedback["total_logged"])
    kpi_card(col2, "Lots ≥2 Rejections", len(feedback["multi_rejection_lots"]))

    if feedback["multi_rejection_lots"]:
        st.warning("⚠️ Lots needing QA review:")
        for lot in feedback["multi_rejection_lots"]:
            st.write(f"  • {lot['lot_id']}: {lot['n']} rejections")

    # ── Blocked Leads ──
    if leads["blocked_count"] > 0:
        st.error(f"🚫 {leads['blocked_count']} lead(s) are BLOCKED — needs operator attention")

    # ── Timestamp ──
    st.caption(f"Last updated: {format_ts(snapshot['generated_ts'])}")
