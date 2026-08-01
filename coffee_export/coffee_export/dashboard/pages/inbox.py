"""
Exporter Inbox page - Streamlit dashboard for the Messaging Gateway.

Shows every conversation thread between this exporter and buyers, with:
  - Thread list (left): unread badges, last message preview, classification chip
  - Message view (center): chat bubbles for outbound + inbound, AI banner on inbound
  - Structured extraction panel: GLM-extracted intent/volume/origin/grade/etc.
  - Reply box (bottom): plain-text reply, sent through gateway from masked address

The exporter NEVER sees the buyer's email client. They NEVER log into Gmail.
Everything happens here, inside the platform.
"""

from __future__ import annotations

from typing import Any

import streamlit as st

from coffee_export.state import StateManager
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


CLASSIFICATION_STYLE: dict[str, tuple[str, str]] = {
    "positive": ("🟢", "Buyer is positive — likely ready to proceed"),
    "negative": ("🔴", "Buyer declined — consider nurture or close"),
    "question": ("🔵", "Buyer asked a question — reply with info"),
    "objection": ("🟠", "Buyer raised a concern — address before proceeding"),
    "meeting_request": ("📅", "Buyer wants a call — send calendar link"),
    "out_of_office": ("💤", "Automated away message — no action needed"),
    "auto_reply": ("🤖", "Automated reply — no action needed"),
}


def _ensure_inbox(operator_id: str = "exporter-001") -> dict[str, Any] | None:
    """Get-or-create the exporter's masked inbox."""
    import os

    inbound_domain = os.environ.get("INBOUND_EMAIL_DOMAIN", "faithelexport.com")
    try:
        with StateManager() as sm:
            return sm.get_or_create_exporter_inbox(
                operator_id=operator_id,
                display_name="Faith Export — Sales",
                inbound_domain=inbound_domain,
                operator_name="Marcus Bell",  # derives → marcus.bell@faithelexport.com
            )
    except Exception as exc:  # noqa: BLE001
        st.error(f"Could not load inbox: {exc}")
        return None


def render() -> None:
    st.title("📬 Exporter Inbox")
    st.caption(
        "All buyer conversations, routed through your masked platform address. "
        "Buyers never see your personal email."
    )

    inbox = _ensure_inbox()
    if not inbox:
        st.stop()

    # ── Inbox header ─────────────────────────────────────────────
    col_addr, col_status, col_unread = st.columns([2, 2, 1])
    with col_addr:
        st.metric("Your masked address", inbox["masked_email"])
    with col_status:
        try:
            with StateManager() as sm:
                stats = sm.get_inbox_stats(inbox["id"])
            st.metric(
                "Active threads",
                stats["active_threads"],
                f"{stats['awaiting_exporter']} awaiting you",
            )
        except Exception:  # noqa: BLE001
            st.metric("Active threads", 0)
    with col_unread:
        try:
            with StateManager() as sm:
                stats = sm.get_inbox_stats(inbox["id"])
            unread = stats["total_unread"]
            st.metric(
                "Unread",
                unread,
                delta=None if unread == 0 else f"🔴 {unread}",
                delta_color="inverse",
            )
        except Exception:  # noqa: BLE001
            st.metric("Unread", 0)

    st.divider()

    # ── Load threads ─────────────────────────────────────────────
    try:
        with StateManager() as sm:
            threads = sm.list_threads_for_inbox(inbox["id"], include_closed=False)
    except Exception as exc:  # noqa: BLE001
        st.error(f"Could not load threads: {exc}")
        threads = []

    if not threads:
        st.info(
            "📭 No active conversations yet. Threads will appear here when "
            "Agent 3 sends outreach emails on your behalf, or when buyers reply."
        )
        st.stop()

    # ── Two-pane layout: thread list | message view ─────────────
    col_list, col_view = st.columns([1, 2], gap="medium")

    with col_list:
        st.subheader("Conversations")
        if "inbox_selected_thread" not in st.session_state:
            st.session_state.inbox_selected_thread = threads[0]["thread_id"]

        for t in threads:
            label = f"{t['subject'][:40]}"
            if t["unread_count"]:
                label = f"🔴 {label}  ({t['unread_count']})"
            if t["status"] == "awaiting_exporter":
                label = f"⬅ {label}"
            elif t["status"] == "awaiting_buyer":
                label = f"➡ {label}"

            is_selected = st.session_state.inbox_selected_thread == t["thread_id"]
            if st.button(
                label,
                key=f"thread_btn_{t['thread_id']}",
                use_container_width=True,
                type="primary" if is_selected else "secondary",
            ):
                st.session_state.inbox_selected_thread = t["thread_id"]
                st.rerun()

    # ── Message view ─────────────────────────────────────────────
    selected_thread_id = st.session_state.inbox_selected_thread

    try:
        with StateManager() as sm:
            thread = sm.get_thread(selected_thread_id)
            messages = sm.get_messages_for_thread(selected_thread_id) if thread else []
    except Exception as exc:  # noqa: BLE001
        st.error(f"Could not load thread: {exc}")
        thread = None
        messages = []

    with col_view:
        if not thread:
            st.info("Select a conversation from the left to view messages.")
            st.stop()

        st.subheader(thread["subject"])
        st.caption(
            f"Buyer: {thread['buyer_email']}  ·  Lead: {thread['lead_id']}  "
            f"·  Status: {thread['status']}  ·  Messages: {thread['message_count']}"
        )

        # Mark unread inbound messages as read when viewed
        for m in messages:
            if m["direction"] == "inbound" and not m["is_read"]:
                try:
                    with StateManager() as sm:
                        sm.mark_message_read(m["id"])
                except Exception:  # noqa: BLE001
                    pass

        st.markdown("---")
        for m in messages:
            _render_message_bubble(m, inbox["masked_email"])

        st.markdown("---")

        # ── Reply box ───────────────────────────────────────────
        st.markdown("#### ✍ Reply to buyer")
        st.caption(
            f"Your reply will be sent from **{inbox['masked_email']}**. "
            f"The buyer will never see your real email address."
        )

        reply_text = st.text_area(
            "Message",
            height=160,
            placeholder="Type your reply to the buyer...",
            key=f"reply_text_{selected_thread_id}",
        )

        col_send, col_clear = st.columns([1, 4])
        with col_send:
            send_clicked = st.button(
                "📨 Send Reply",
                type="primary",
                disabled=not reply_text.strip(),
                key=f"send_reply_{selected_thread_id}",
            )
        with col_clear:
            if st.button("Clear", key=f"clear_reply_{selected_thread_id}"):
                st.session_state[f"reply_text_{selected_thread_id}"] = ""
                st.rerun()

        if send_clicked and reply_text.strip():
            try:
                from coffee_export.messaging import EmailGateway

                inbound_msgs = [m for m in messages if m["direction"] == "inbound"]
                if inbound_msgs:
                    reply_to_id = inbound_msgs[-1]["id"]
                else:
                    reply_to_id = messages[-1]["id"] if messages else None

                if reply_to_id is None:
                    st.warning(
                        "Cannot reply — no message on this thread to anchor the reply to."
                    )
                else:
                    gateway = EmailGateway()
                    result = gateway.reply(
                        message_id=reply_to_id,
                        body_text=reply_text.strip(),
                        operator_id="exporter-001",
                    )
                    if result.get("action") == "replied":
                        if result.get("dry_run"):
                            st.success(
                                "✅ Reply stored (DRY-RUN mode — email not actually sent)."
                            )
                        else:
                            st.success("✅ Reply sent to buyer.")
                        st.rerun()
                    else:
                        st.error(
                            f"Reply failed: {result.get('error') or result.get('reason')}"
                        )
            except Exception as exc:  # noqa: BLE001
                st.error(f"Reply failed: {exc}")


def _render_message_bubble(msg: dict[str, Any], masked_email: str) -> None:
    """Render a single message as a chat bubble + AI banner + structured panel."""
    is_outbound = msg["direction"] == "outbound"

    align = "right" if is_outbound else "left"
    bg = "#1f3a5f" if is_outbound else "#2a2a2a"
    sender = f"You ({masked_email})" if is_outbound else msg["from_addr"]
    ts = msg.get("sent_ts") or msg.get("received_ts") or msg.get("created_ts") or ""

    if is_outbound:
        st.markdown(
            f"""
            <div style='text-align:{align}; margin: 8px 0;'>
                <div style='display:inline-block; background:{bg}; color:white;
                            padding:10px 14px; border-radius:12px; max-width:75%;
                            text-align:left;'>
                    <div style='font-size:0.75em; opacity:0.8; margin-bottom:4px;'>
                        {sender} · {ts}
                    </div>
                    <div style='font-weight:600; margin-bottom:4px;'>{msg['subject']}</div>
                    <div style='white-space:pre-wrap;'>{msg['body_text']}</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        classification = msg.get("glm_classification") or ""
        emoji, hint = CLASSIFICATION_STYLE.get(classification, ("❔", "Not yet classified"))
        summary = msg.get("glm_summary") or ""
        translation = msg.get("glm_translation") or ""
        lang = msg.get("glm_language_detected") or ""

        ai_banner = ""
        if msg.get("ai_processed"):
            ai_banner = (
                f"<div style='background:#3a3a1f; border-left:4px solid #FFD700; "
                f"padding:8px 12px; margin:6px 0; border-radius:6px; "
                f"font-size:0.85em;'>"
                f"<strong>{emoji} AI Triage</strong> — {hint}<br>"
                f"<em>Summary:</em> {summary}"
            )
            if translation:
                ai_banner += (
                    f"<br><em>English translation ({lang}):</em> {translation}"
                )
            if msg.get("glm_intent"):
                ai_banner += f"<br><em>Intent tag:</em> <code>{msg['glm_intent']}</code>"
            ai_banner += "</div>"

        extracted_panel = _render_extracted_panel(msg)

        st.markdown(
            f"""
            <div style='text-align:{align}; margin: 8px 0;'>
                <div style='display:inline-block; background:{bg}; color:white;
                            padding:10px 14px; border-radius:12px; max-width:75%;
                            text-align:left;'>
                    <div style='font-size:0.75em; opacity:0.8; margin-bottom:4px;'>
                        {sender} · {ts}
                    </div>
                    <div style='font-weight:600; margin-bottom:4px;'>{msg['subject']}</div>
                    <div style='white-space:pre-wrap;'>{msg['body_text']}</div>
                </div>
            </div>
            {ai_banner}
            {extracted_panel}
            """,
            unsafe_allow_html=True,
        )


def _render_extracted_panel(msg: dict[str, Any]) -> str:
    """Render the structured-extraction panel as HTML. Returns "" if no fields."""
    fields = [
        ("Intent", msg.get("extracted_intent")),
        ("Volume", msg.get("extracted_volume_bags")),
        ("Origin", msg.get("extracted_origin")),
        ("Grade", msg.get("extracted_grade")),
        ("Destination", msg.get("extracted_destination")),
        ("Incoterm", msg.get("extracted_incoterm")),
        ("Urgency", msg.get("extracted_urgency")),
        ("Next action", msg.get("extracted_next_action")),
    ]

    rows = [(label, value) for label, value in fields if value not in (None, "", 0)]
    if not rows:
        return ""

    rows_html = ""
    for label, value in rows:
        value_str = str(value)
        if label == "Urgency":
            color = {"High": "#dc3545", "Medium": "#ffc107", "Low": "#28a745"}.get(
                value_str, "#6c757d"
            )
            value_str = (
                f"<span style='background:{color}; color:white; "
                f"padding:2px 8px; border-radius:4px; font-size:0.85em;'>"
                f"{value_str}</span>"
            )
        elif label == "Next action":
            value_str = (
                f"<span style='background:#0d6efd; color:white; "
                f"padding:2px 8px; border-radius:4px; font-size:0.85em;'>"
                f"→ {value_str}</span>"
            )
        elif label == "Volume":
            value_str = f"{value} bags"
        rows_html += (
            f"<div style='display:flex; gap:8px; padding:3px 0; "
            f"border-bottom:1px solid #444;'>"
            f"<span style='color:#aaa; min-width:90px; font-size:0.8em;'>{label}</span>"
            f"<span style='color:white; font-weight:500;'>{value_str}</span>"
            f"</div>"
        )

    return (
        f"<div style='background:#1a2a1a; border:1px solid #28a745; "
        f"padding:8px 12px; margin:6px 0; border-radius:6px; "
        f"font-size:0.85em;'>"
        f"<div style='color:#28a745; font-weight:600; margin-bottom:4px;'>"
        f"📋 Structured Extraction (GLM)</div>"
        f"{rows_html}"
        f"</div>"
    )
