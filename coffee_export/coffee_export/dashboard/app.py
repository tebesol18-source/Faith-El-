"""
Coffee Export Dashboard — Streamlit application.

A clean, intuitive operator interface for the coffee export ERP.

Run:
    streamlit run coffee_export/dashboard/app.py

Or use the launcher:
    python scripts/run_dashboard.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import streamlit as st

from coffee_export.config import settings
from coffee_export.utils.logging import setup_logging


def main() -> None:
    """Main entry point for the Streamlit dashboard."""
    setup_logging()

    st.set_page_config(
        page_title=f"{settings.APP_NAME} — Dashboard",
        page_icon="☕",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    # ── Sidebar ──
    st.sidebar.title("☕ Coffee Export")
    st.sidebar.caption(f"Environment: **{settings.APP_ENV}**")

    st.sidebar.divider()

    page = st.sidebar.radio(
        "Navigate",
        options=[
            "📊 Overview",
            "📥 Import Leads",
            "🌱 Seed Inventory",
            "🔔 Notifications",
            "🔍 Search",
            "👥 Leads",
            "📬 Exporter Inbox",
            "🧠 AI Memory",
            "📦 Inventory",
            "🧪 Samples",
            "🤖 Agent Controls",
            "📡 Events",
            "🤖 AI Monitor",
            "💻 System Health",
        ],
        index=0,
    )

    st.sidebar.divider()

    # Quick stats in sidebar
    from coffee_export.state import StateManager

    try:
        with StateManager() as sm:
            snapshot = sm.get_kpi_snapshot()
            st.sidebar.metric("Total Leads", snapshot["leads"]["total"])
            st.sidebar.metric("Active Lots", snapshot["lots"]["total"])

            # Notification count
            notifications = sm.get_notifications()
            critical_count = sum(1 for n in notifications if n["severity"] == "critical")
            if critical_count > 0:
                st.sidebar.error(f"🔴 {critical_count} critical item(s) need attention")
            else:
                st.sidebar.success("✅ All clear")
    except Exception:
        st.sidebar.warning("Database not available")

    # ── Page routing ──
    if page == "📊 Overview":
        from coffee_export.dashboard.pages.overview import render

        render()
    elif page == "📥 Import Leads":
        from coffee_export.dashboard.pages.import_leads import render

        render()
    elif page == "🌱 Seed Inventory":
        from coffee_export.dashboard.pages.seed_inventory import render

        render()
    elif page == "🔔 Notifications":
        from coffee_export.dashboard.pages.notifications import render

        render()
    elif page == "🔍 Search":
        from coffee_export.dashboard.pages.search import render

        render()
    elif page == "👥 Leads":
        from coffee_export.dashboard.pages.leads import render

        render()
    elif page == "📬 Exporter Inbox":
        from coffee_export.dashboard.pages.inbox import render

        render()
    elif page == "🧠 AI Memory":
        from coffee_export.dashboard.pages.memory_viewer import render

        render()
    elif page == "📦 Inventory":
        from coffee_export.dashboard.pages.inventory import render

        render()
    elif page == "🧪 Samples":
        from coffee_export.dashboard.pages.samples import render

        render()
    elif page == "🤖 Agent Controls":
        from coffee_export.dashboard.pages.agent_controls import render

        render()
    elif page == "📡 Events":
        from coffee_export.dashboard.pages.events import render

        render()
    elif page == "🤖 AI Monitor":
        from coffee_export.dashboard.pages.ai_monitoring import render

        render()
    elif page == "💻 System Health":
        from coffee_export.dashboard.pages.system_health import render

        render()


if __name__ == "__main__":
    main()
