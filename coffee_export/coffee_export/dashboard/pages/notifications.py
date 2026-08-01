"""
Notifications page — action items that need operator attention.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.state import StateManager


def render() -> None:
    st.title("🔔 Notifications")
    st.caption("Your daily to-do list — items needing action, sorted by priority")

    with StateManager() as sm:
        notifications = sm.get_notifications()

    if not notifications:
        st.success("✅ All clear! No items need attention.")
        return

    # Count by severity
    critical = [n for n in notifications if n["severity"] == "critical"]
    warning = [n for n in notifications if n["severity"] == "warning"]
    info = [n for n in notifications if n["severity"] == "info"]

    # Summary cards
    col1, col2, col3 = st.columns(3)
    col1.metric("🔴 Critical", len(critical))
    col2.metric("🟠 Warning", len(warning))
    col3.metric("🟢 Info", len(info))

    st.divider()

    # Display notifications
    for notif in notifications:
        severity = notif["severity"]

        if severity == "critical":
            container = st.error
        elif severity == "warning":
            container = st.warning
        else:
            container = st.info

        with container(f"{notif['icon']}  **{notif['title']}**"):
            st.write(notif["detail"])
            st.caption(
                f"Entity: {notif['entity_type']} | ID: {notif['entity_id']} | "
                f"Suggested action: {notif['action']}"
            )
