"""
Research Monitor page — the Phase 7 research health dashboard (§3 J).

The Streamlit surface of research/monitoring.py: research sessions,
evidence quality, budgets & usage, follow-ups, queue health and the
Phase 6 outreach approval queue — one org at a time, existing design
system (metrics + dataframes), no second monitoring system.

Everything here is READ-ONLY and honest: counts that are zero show as
zero, costs that were never reported show as not reported, and drafts
are labelled as awaiting human approval.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.database.base import engine as app_engine
from coffee_export.research.monitoring import (
    ResearchHealthService,
    list_research_orgs,
)


def render() -> None:
    st.title("🔬 Research Monitor")
    st.caption(
        "Research sessions, evidence quality, budgets, follow-ups, queue "
        "health and outreach drafts — one org at a time (read-only)"
    )

    try:
        orgs = list_research_orgs(app_engine)
    except Exception as exc:  # noqa: BLE001 — dashboard stays up
        st.error(f"Database not available: {exc}")
        return

    if not orgs:
        st.info(
            "No research data yet. Research sessions, evidence and follow-ups "
            "appear here once agents or operators run research for an org."
        )
        return

    org = st.selectbox(
        "Organization",
        orgs,
        help="Orgs carrying research data (ids only — pick the tenant to inspect)",
    )

    service = ResearchHealthService(org, app_engine)
    try:
        overview = service.overview()
    except Exception as exc:  # noqa: BLE001 — dashboard stays up
        st.error(f"Could not build the research health snapshot: {exc}")
        return

    _render_sessions(overview["sessions"])
    st.divider()
    _render_evidence(overview["evidence"])
    st.divider()
    _render_budgets(overview["budgets"])
    st.divider()
    _render_followups(overview["followups"])
    st.divider()
    _render_queue(overview["queue"])
    st.divider()
    _render_outreach(overview["outreach"])


def _render_sessions(sessions: dict) -> None:
    st.subheader("🧭 Research Sessions")
    by_status = sessions["by_status"]
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total", sessions["total"])
    col2.metric("Completed", by_status.get("completed", 0))
    col3.metric("Running / Pending", by_status.get("running", 0) + by_status.get("pending", 0))
    col4.metric("Budget Exhausted", by_status.get("budget_exhausted", 0))

    if sessions["budget_exhausted_ids"]:
        st.warning(
            f"{len(sessions['budget_exhausted_ids'])} session(s) stopped by budget — "
            "the human resume path (new budgets) is the ONLY continuation: "
            + ", ".join(sessions["budget_exhausted_ids"][:10])
        )
    last = sessions["last_completed"]
    if last:
        st.caption(f"Last completed: {last['session_id']} — {last['objective'][:80]}")
    if sessions["total"] == 0:
        st.caption("No sessions for this org yet.")


def _render_evidence(evidence: dict) -> None:
    st.subheader("📚 Evidence Quality")
    by_status = evidence["by_status"]
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Evidence Rows", evidence["total"])
    col2.metric("Corroborated", by_status.get("corroborated", 0))
    col3.metric("Disputed", by_status.get("disputed", 0))
    col4.metric("Suppressed", evidence["suppressed"])

    rate = evidence["corroboration_rate"]
    col1, col2, col3 = st.columns(3)
    col1.metric("Corroboration Rate", f"{rate * 100:.1f}%")
    col2.metric("Expiring Soon (7d)", evidence["expiring_soon"])
    col3.metric("Expired, Still Live", evidence["expired_still_live"])

    if evidence["expired_still_live"]:
        st.warning(
            f"{evidence['expired_still_live']} live evidence row(s) are past "
            "their expiry — the revalidation sweep (research.revalidate_evidence) "
            "or a due follow-up will mark them outdated."
        )
    if evidence["total"] == 0:
        st.caption("No evidence recorded for this org yet.")


def _render_budgets(budgets: dict) -> None:
    st.subheader("💰 Budgets & Usage")
    cost = budgets["reported_cost_usd"]
    cost_display = "not reported" if cost is None else f"${cost:.4f}"
    col1, col2, col3 = st.columns(3)
    col1.metric("Tool Calls (usage)", budgets["usage_tool_calls"])
    col2.metric("Model Calls (usage)", budgets["usage_model_calls"])
    col3.metric("Reported Cost", cost_display)
    st.caption(budgets["note"])
    if budgets["sessions_counted"] == 0:
        st.caption("No sessions to account yet.")


def _render_followups(followups: dict) -> None:
    st.subheader("⏰ Follow-ups")
    by_status = followups["by_status"]
    col1, col2, col3 = st.columns(3)
    col1.metric("Scheduled", by_status.get("scheduled", 0))
    col2.metric("Overdue (scheduled, past due)", followups["overdue_scheduled"])
    col3.metric("Done", by_status.get("done", 0))
    next_due = followups["next_due"]
    if next_due:
        st.caption(f"Next due: {next_due['followup_id']} at {next_due['due_ts']}")
    if followups["overdue_scheduled"]:
        st.warning(
            f"{followups['overdue_scheduled']} follow-up(s) are past due and still "
            "scheduled — the worker's followup pass (or `admin followups dispatch`) "
            "will enqueue them."
        )
    if followups["total"] == 0:
        st.caption("No follow-ups for this org yet.")


def _render_queue(queue: dict) -> None:
    st.subheader("⚙️ Research Queue (durable tasks)")
    by_status = queue["by_status"]
    col1, col2, col3 = st.columns(3)
    col1.metric("Total research.* tasks", queue["total"])
    col2.metric("In Flight (pending + leased)", queue["in_flight"])
    col3.metric("Failed / Dead", by_status.get("failed", 0) + by_status.get("dead", 0))

    if queue["in_flight_detail"]:
        st.dataframe(
            [
                {
                    "Task": row["task_id"],
                    "Type": row["task_type"],
                    "Attempts": row["attempts"],
                }
                for row in queue["in_flight_detail"]
            ],
            use_container_width=True,
            hide_index=True,
        )
    if queue["total"] == 0:
        st.caption("No research tasks enqueued for this org yet.")


def _render_outreach(outreach: dict) -> None:
    st.subheader("✉️ Outreach Approval Queue (Phase 6)")
    by_status = outreach["by_status"]
    col1, col2, col3 = st.columns(3)
    col1.metric("Awaiting Human Review", outreach["awaiting_human_review"])
    col2.metric("Research-Drafted (pending)", outreach["research_drafted_pending"])
    col3.metric("Executed", by_status.get("executed", 0))

    if outreach["pending_recent"]:
        st.dataframe(
            [
                {
                    "Action": row["action_id"],
                    "Lead": row["lead_id"],
                    "Drafted By": row["source"] or "supervisor template",
                    "Submitted": row["submitted_ts"],
                }
                for row in outreach["pending_recent"]
            ],
            use_container_width=True,
            hide_index=True,
        )
    st.caption(outreach["note"])
