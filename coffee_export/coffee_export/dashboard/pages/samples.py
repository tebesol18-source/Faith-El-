"""
Samples page — sample requests, budget tracking, and decisions.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import format_ts, get_snapshot, kpi_card


def render() -> None:
    st.title("🧪 Samples")
    st.caption("Sample requests, budget tracking, and cupping decisions")

    try:
        snapshot = get_snapshot()
    except Exception as e:
        st.error(f"Failed to load data: {e}")
        return

    samples = snapshot["samples"]
    budget = samples.get("budget", {})

    # ── Budget Cards ──
    st.subheader("📊 Sample Budget This Week")

    col1, col2, col3, col4 = st.columns(4)
    full_used = budget.get("full_sets_used", 0)
    fallback_used = budget.get("fallback_150g_used", 0)
    type_b_used = budget.get("type_b_used", 0)
    type_c_used = budget.get("type_c_used", 0)

    kpi_card(col1, "Full Sets (350g)", f"{full_used}/3")
    kpi_card(col2, "Fallback (150g)", f"{fallback_used}/2")
    kpi_card(col3, "Type B (200g)", f"{type_b_used}/2")
    kpi_card(col4, "Type C (500g)", type_c_used)

    # Budget progress bars
    st.write("**Budget Utilization**")
    col1, col2 = st.columns(2)
    with col1:
        st.caption("Full Sets (350g)")
        st.progress(min(full_used / 3, 1.0))
        st.caption("Fallback (150g)")
        st.progress(min(fallback_used / 2, 1.0))
    with col2:
        st.caption("Type B (200g)")
        st.progress(min(type_b_used / 2, 1.0))
        st.caption("Type C — No cap (post-contract)")
        st.progress(0.0)

    # ── Reservations & Waitlist ──
    st.subheader("📦 Active Reservations & Waitlist")
    col1, col2 = st.columns(2)
    kpi_card(col1, "Active Reservations", samples["active_reservations"])
    kpi_card(col2, "Waitlist Depth", samples["waitlist_depth"])

    # ── Sample Requests ──
    st.subheader("📋 Sample Requests")
    from coffee_export.state import StateManager

    try:
        with StateManager():
            # Query sample requests from the database
            from sqlalchemy import select

            from coffee_export.database.base import SessionLocal
            from coffee_export.database.models import SampleRequest

            with SessionLocal() as session:
                srs = (
                    session.execute(
                        select(SampleRequest).order_by(SampleRequest.created_ts.desc()).limit(50)
                    )
                    .scalars()
                    .all()
                )

            if srs:
                display_data = []
                for sr in srs:
                    display_data.append(
                        {
                            "Sample Request ID": sr.sample_request_id,
                            "Lead ID": sr.lead_id,
                            "Buyer": sr.buyer_company,
                            "Type": sr.sample_type,
                            "Crop Year": sr.crop_year,
                            "Status": sr.status,
                            "Dispatched": format_ts(sr.dispatched_ts),
                            "Delivered": format_ts(sr.delivered_ts),
                            "Decided": format_ts(sr.decided_ts),
                        }
                    )

                st.dataframe(display_data, use_container_width=True, hide_index=True)
            else:
                st.info("No sample requests yet. Leads need to be qualified first (Agent 3).")

    except Exception as e:
        st.warning(f"Could not load sample requests: {e}")

    # ── Feedback & QA ──
    st.subheader("💬 Feedback & QA")
    feedback = snapshot["feedback"]
    col1, col2 = st.columns(2)
    kpi_card(col1, "Total Feedback Logged", feedback["total_logged"])
    kpi_card(col2, "Lots with ≥2 Rejections", len(feedback["multi_rejection_lots"]))

    if feedback["multi_rejection_lots"]:
        st.warning("⚠️ The following lots have multiple rejections — review for QA:")
        for lot in feedback["multi_rejection_lots"]:
            st.write(f"  • **{lot['lot_id']}** — {lot['n']} rejections")

    # ── Week Info ──
    if budget.get("week_start"):
        st.caption(
            f"Week: {budget.get('week_start')} → {budget.get('week_end')} | "
            f"Last updated: {format_ts(budget.get('last_updated_ts'))}"
        )
