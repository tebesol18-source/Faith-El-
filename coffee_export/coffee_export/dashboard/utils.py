"""
Dashboard utilities — shared helpers for all pages.

Provides consistent styling, formatting, and data access.
"""

from __future__ import annotations

from typing import Any

import streamlit as st

from coffee_export.state import StateManager


def get_snapshot() -> dict[str, Any]:
    """Get KPI snapshot from StateManager. Caches for 10 seconds."""

    @st.cache_data(ttl=10)
    def _fetch():
        with StateManager() as sm:
            return sm.get_kpi_snapshot()

    return _fetch()


def get_leads(
    state: str | None = None,
    agent: str | None = None,
    tier: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Fetch leads with optional filters."""

    @st.cache_data(ttl=5)
    def _fetch(state, agent, tier, limit):
        with StateManager() as sm:
            return sm.list_leads(state=state, agent=agent, tier=tier, limit=limit)

    return _fetch(state, agent, tier, limit)


def get_lots(
    region: str | None = None,
    process: str | None = None,
    status: str | None = None,
    eudr: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch lots with optional filters."""

    @st.cache_data(ttl=5)
    def _fetch(region, process, status, eudr):
        with StateManager() as sm:
            return sm.list_lots(region=region, process=process, status=status, eudr=eudr)

    return _fetch(region, process, status, eudr)


def get_events(
    event_type: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Fetch events for the dashboard."""

    @st.cache_data(ttl=5)
    def _fetch(event_type, status, limit):
        from coffee_export.events import EventBus

        with EventBus() as bus:
            return bus.replay(event_type=event_type, status=status, limit=limit)

    return _fetch(event_type, status, limit)


def get_registered_agents() -> list[str]:
    """Get list of registered agents."""
    from coffee_export.agents.registry import list_registered_agents

    return list_registered_agents()


# ── Styling helpers ──


def state_badge(state: str) -> str:
    """Return an emoji + color hint for a lead state."""
    badges = {
        "NEW": "🔵 NEW",
        "ENRICHED": "🟡 ENRICHED",
        "IN_SEQUENCE": "🟠 IN SEQUENCE",
        "QUALIFIED": "🟢 QUALIFIED",
        "SAMPLE_DISPATCHED": "🟣 SAMPLE DISPATCHED",
        "SAMPLE_FEEDBACK_DUE": "🟪 FEEDBACK DUE",
        "DECIDED_APPROVED": "✅ APPROVED",
        "DECIDED_REJECTED": "❌ REJECTED",
        "DECIDED_NEEDS_ANOTHER": "🔄 NEEDS ANOTHER",
        "GHOSTED": "👻 GHOSTED",
        "CONTRACTED": "🤝 CONTRACTED",
        "NURTURE": "🌱 NURTURE",
        "BLOCKED": "🚫 BLOCKED",
    }
    return badges.get(state, f"❓ {state}")


def tier_badge(tier: str | None) -> str:
    """Return a formatted tier badge."""
    if not tier:
        return "—"
    badges = {
        "S": "🥇 S",
        "A": "🥈 A",
        "B": "🥉 B",
        "C": "⚪ C",
        "Disqualify": "🚫 DQ",
    }
    return badges.get(tier, tier)


def eudr_badge(status: str) -> str:
    """Return a formatted EUDR status badge."""
    badges = {
        "complete": "✅ Complete",
        "partial": "⚠️ Partial",
        "missing": "❌ Missing",
    }
    return badges.get(status, status)


def vp_label(vp: str | None) -> str:
    """Return a human-readable VP label."""
    if not vp:
        return "—"
    labels = {
        "VP1": "VP1 — Origin Access",
        "VP2": "VP2 — Sustainability",
        "VP3": "VP3 — Commercial FOB",
        "VP4": "VP4 — Microlot Exclusivity",
    }
    return labels.get(vp, vp)


def language_flag(lang: str) -> str:
    """Return a flag emoji for a language code."""
    flags = {
        "EN": "🇬🇧",
        "DE": "🇩🇪",
        "FR": "🇫🇷",
        "IT": "🇮🇹",
        "JA": "🇯🇵",
        "KO": "🇰🇷",
        "ZH": "🇨🇳",
        "AR": "🇸🇦",
        "TR": "🇹🇷",
        "RU": "🇷🇺",
    }
    return flags.get(lang, "🌍")


def format_ts(ts: str | None) -> str:
    """Format an ISO timestamp for display."""
    if not ts:
        return "—"
    # Show just date + time (no timezone)
    return ts[:19].replace("T", " ")


def kpi_card(col, label: str, value: int | str, delta: str = "") -> None:
    """Render a KPI card in a column."""
    col.metric(label, value, delta if delta else None)
