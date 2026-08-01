"""
System Health page — CPU, memory, disk, database, event stats.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import format_ts
from coffee_export.state import StateManager


def render() -> None:
    st.title("💻 System Health")
    st.caption("System resources, database size, and event throughput")

    try:
        with StateManager() as sm:
            health = sm.get_system_health()
    except Exception as e:
        st.error(f"Failed to get system health: {e}")
        return

    # ── System Resources ──
    st.subheader("🖥️ System Resources")

    sys_data = health["system"]
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("CPU Usage", f"{sys_data['cpu_percent']:.1f}%")
        st.progress(sys_data["cpu_percent"] / 100)

    with col2:
        st.metric(
            "Memory",
            f"{sys_data['memory_used_gb']:.1f} / {sys_data['memory_total_gb']:.1f} GB",
            f"{sys_data['memory_percent']:.0f}%",
        )
        st.progress(sys_data["memory_percent"] / 100)

    with col3:
        st.metric(
            "Disk",
            f"{sys_data['disk_used_gb']:.0f} / {sys_data['disk_total_gb']:.0f} GB",
            f"{sys_data['disk_percent']:.0f}%",
        )
        st.progress(sys_data["disk_percent"] / 100)

    st.divider()

    # ── Database ──
    st.subheader("🗄️ Database")
    db = health["database"]
    col1, col2 = st.columns(2)
    col1.metric("Database Size", f"{db['size_mb']:.2f} MB")
    col2.metric("Path", db["path"])

    st.divider()

    # ── Event Bus ──
    st.subheader("📡 Event Bus")
    events = health["events"]
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Events", events["total"])
    col2.metric("Events/min", events["events_last_minute"])
    col3.metric("Pending", events["pending"])
    col4.metric("Dead Letter", events["dead_letter"])

    if events["pending"] > 10:
        st.warning(
            f"⚠️ {events['pending']} pending events in queue — agents may be slow to consume"
        )

    if events["dead_letter"] > 0:
        st.error(f"💀 {events['dead_letter']} dead-letter events need operator attention")

    st.divider()

    # ── Queue Depth ──
    st.subheader("📦 Queue Depth")
    queue = health["queue"]
    col1, col2 = st.columns(2)
    col1.metric("Active Reservations", queue["active_reservations"])
    col2.metric("Waitlist Depth", queue["waitlist_depth"])

    st.divider()

    # ── Process Info ──
    st.subheader("⚙️ Process")
    proc = health["process"]
    col1, col2, col3 = st.columns(3)
    col1.metric("PID", proc["pid"])
    col2.metric("Process Memory", f"{proc['memory_mb']:.1f} MB")
    col3.metric("Process CPU", f"{proc['cpu_percent']:.1f}%")

    st.caption(f"Last updated: {format_ts(health['timestamp'])}")

    # Auto-refresh toggle
    st.divider()
    auto_refresh = st.checkbox("Auto-refresh every 5 seconds", value=False)
    if auto_refresh:
        import time

        time.sleep(5)
        st.rerun()
