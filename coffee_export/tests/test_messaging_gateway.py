#!/usr/bin/env python3
"""
Messaging Gateway - end-to-end test.

Verifies the full flow:
  1. Create exporter inbox (masked email generation from operator name)
  2. Send outbound email via gateway (DRY-RUN mode)
  3. Simulate inbound buyer reply webhook
  4. Verify GLM triage ran (or fell back gracefully)
  5. Verify message + thread stored in DB
  6. Verify structured extraction fields populated
  7. Verify events published
  8. Exporter replies via dashboard path (gateway.reply)
  9. Inbox stats correct
 10. Webhook signature verification works
 11. Webhook FastAPI app builds

Run:  python -m tests.test_messaging_gateway
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.events import (
    EventBus,
    MESSAGE_PROCESSED,
    MESSAGE_RECEIVED,
    MESSAGE_REPLIED,
    MESSAGE_SENT,
    THREAD_OPENED,
)
from coffee_export.messaging import EmailGateway, ResendEmailProvider
from coffee_export.state import StateManager


def _abs_int(s: str) -> int:
    return abs(hash(s)) % 100000


def _ensure_test_operator(operator_id: str = "exporter-001") -> None:
    """Make sure the operator row exists (so FK constraint passes)."""
    from coffee_export.database.models import Operator
    from coffee_export.database.base import SessionLocal
    from coffee_export.state.state_manager import now_addis_iso_str

    session = SessionLocal()
    try:
        existing = session.query(Operator).filter_by(operator_id=operator_id).first()
        if not existing:
            now = now_addis_iso_str()
            session.add(
                Operator(
                    operator_id=operator_id,
                    name="Marcus Bell",
                    email=f"{operator_id}@faithelexport.com",
                    role="operator",
                    status="active",
                    created_ts=now,
                    updated_ts=now,
                )
            )
            session.commit()
        else:
            if existing.name != "Marcus Bell":
                existing.name = "Marcus Bell"
                existing.email = f"{operator_id}@faithelexport.com"
                session.commit()
    finally:
        session.close()


def _ensure_test_lead(buyer_email: str) -> str:
    from coffee_export.database.models import LeadContact
    from coffee_export.state.state_manager import now_addis_iso_str

    with StateManager() as sm:
        company = f"Test Buyer Co {_abs_int(buyer_email)}"
        try:
            lead_id = sm.create_lead(
                company_name=company,
                headquarters_country="DE",
                headquarters_city="Berlin",
                website="https://test-buyer.example",
                recommended_vp="VP1",
                priority_tier="A",
                outreach_language="EN",
                created_by="test_messaging",
            )
        except Exception:
            lead = sm.get_lead_by_company(company_name=company, headquarters_country="DE")
            lead_id = lead["lead_id"] if lead else None

        if not lead_id:
            raise RuntimeError("could not create or find test lead")

        now = now_addis_iso_str()
        sm.session.add(
            LeadContact(
                lead_id=lead_id,
                name="Konrad Brits",
                title="Head of Coffee",
                email=buyer_email,
                is_primary=1,
                is_buyer=1,
                created_ts=now,
                updated_ts=now,
            )
        )
        sm._commit()

    return lead_id


def test_full_gateway_flow() -> None:
    print("\n[1] Setup: operator + lead + buyer contact")
    _ensure_test_operator("exporter-001")
    buyer_email = f"konrad@testbuyer{_abs_int('konrad_reply')}.example"
    lead_id = _ensure_test_lead(buyer_email)
    print(f"    lead_id={lead_id}, buyer_email={buyer_email}")

    print("\n[2] Send outbound email via gateway (DRY-RUN)")
    gateway = EmailGateway()
    send_result = gateway.send(
        operator_id="exporter-001",
        display_name="Faith Export — Sales",
        lead_id=lead_id,
        buyer_email=buyer_email,
        subject="Ethiopian 25/26 Yirgacheffe — first container spot",
        body_text=(
            "Hi Konrad,\n\n"
            "Following up on our LinkedIn exchange. We have 25/26 Yirgacheffe "
            "lots available now with full EUDR data packs.\n\n"
            "Would you have 20 minutes this week for a quick call?\n\nBest"
        ),
        operator_name="Marcus Bell",  # derives → marcus.bell@faithelexport.com
    )
    print(f"    send_result={send_result}")
    assert send_result["action"] == "sent", f"send failed: {send_result}"
    assert send_result["dry_run"] is True, "expected dry_run=True (no RESEND_API_KEY)"
    masked_from = send_result["masked_from"]
    thread_id = send_result["thread_id"]
    outbound_msg_id = send_result["message_id"]
    print(f"    masked_from={masked_from}")
    print(f"    thread_id={thread_id}")
    # NEW: assert professional-looking masked email derived from operator name
    assert masked_from == "marcus.bell@faithelexport.com", (
        f"expected marcus.bell@faithelexport.com, got {masked_from}"
    )
    assert "exporter-" not in masked_from, "masked email should NOT reveal 'exporter-' prefix"
    assert "faithelexport.com" in masked_from, "masked email should use Faith Export domain"

    print("\n[3] Verify outbound message stored in DB")
    with StateManager() as sm:
        msg = sm.get_message(outbound_msg_id)
        assert msg, "outbound message not found"
        assert msg["direction"] == "outbound"
        assert msg["from_addr"] == masked_from
        assert msg["to_addr"] == buyer_email
        print(f"    stored: dir={msg['direction']} from={msg['from_addr']}")

    print("\n[4] Simulate inbound buyer reply (Resend webhook payload)")
    inbound_payload = {
        "data": {
            "from": f"Konrad Brits <{buyer_email}>",
            "to": [masked_from],
            "subject": "Re: Ethiopian 25/26 Yirgacheffe — first container spot",
            "text": (
                "Hi,\n\nThanks for the note. Looks interesting — can you send me the "
                "cupping scores for the Guji lots too? And what's your earliest FOB "
                "Djibouti date?\n\nI could do a call next Tuesday at 14:00 CET.\n\n"
                "Konrad"
            ),
            "html": None,
            "reply_to": buyer_email,
            "message_id": f"resend-inbound-{_abs_int('reply1')}",
            "in_reply_to": send_result["provider_message_id"],
            "received_at": None,
        }
    }
    inbound_result = gateway.process_inbound(inbound_payload)
    print(f"    inbound_result={inbound_result}")
    assert inbound_result["action"] == "received", f"inbound failed: {inbound_result}"
    inbound_msg_id = inbound_result["message_id"]

    print("\n[5] Verify inbound message + AI triage + structured extraction stored")
    with StateManager() as sm:
        msg = sm.get_message(inbound_msg_id)
        assert msg, "inbound message not found"
        assert msg["direction"] == "inbound"
        assert msg["from_addr"] == buyer_email
        assert msg["to_addr"] == masked_from
        assert msg["is_read"] == 0, "inbound should start unread"
        assert msg["ai_processed"] == 1, "AI should have processed"
        print(f"    classification={msg['glm_classification']}")
        print(f"    summary={msg['glm_summary']}")
        print(f"    intent={msg['glm_intent']}")
        print(f"    language={msg['glm_language_detected']}")

        # Structured extraction fields
        print(f"    extracted_intent={msg['extracted_intent']}")
        print(f"    extracted_volume_bags={msg['extracted_volume_bags']}")
        print(f"    extracted_origin={msg['extracted_origin']}")
        print(f"    extracted_grade={msg['extracted_grade']}")
        print(f"    extracted_destination={msg['extracted_destination']}")
        print(f"    extracted_incoterm={msg['extracted_incoterm']}")
        print(f"    extracted_urgency={msg['extracted_urgency']}")
        print(f"    extracted_next_action={msg['extracted_next_action']}")
        print(f"    extracted_data (JSON)={msg['extracted_data']}")

        # intent must always be set (one of the 10 valid values)
        assert msg["extracted_intent"] in {
            "sample_request", "pricing_question", "logistics_question",
            "meeting_request", "objection", "complaint", "confirmation",
            "out_of_office", "auto_reply", "other"
        }, f"invalid extracted_intent: {msg['extracted_intent']}"

        # extracted_data should be a JSON string containing all 8 keys
        import json as _json
        ed = _json.loads(msg["extracted_data"]) if msg["extracted_data"] else {}
        for key in ("intent", "volume_bags", "origin", "grade",
                    "destination", "incoterm", "urgency", "next_action"):
            assert key in ed, f"missing key in extracted_data: {key}"
        print(f"    ✓ all 8 structured fields present in extracted_data JSON")

    print("\n[6] Verify thread stats updated")
    with StateManager() as sm:
        thread = sm.get_thread(thread_id)
        assert thread, "thread not found"
        assert thread["message_count"] == 2, f"expected 2 messages, got {thread['message_count']}"
        assert thread["unread_count"] == 1, f"expected 1 unread, got {thread['unread_count']}"
        assert thread["status"] == "awaiting_exporter", f"wrong status: {thread['status']}"
        print(
            f"    messages={thread['message_count']}, "
            f"unread={thread['unread_count']}, status={thread['status']}"
        )

    print("\n[7] Exporter replies via dashboard path")
    reply_result = gateway.reply(
        message_id=inbound_msg_id,
        body_text=(
            "Hi Konrad,\n\n"
            "Guji scores attached. Earliest FOB Djibouti is 12 Aug.\n\n"
            "Tuesday 14:00 CET works — I'll send a Meet invite.\n\nBest"
        ),
        operator_id="exporter-001",
    )
    print(f"    reply_result={reply_result}")
    assert reply_result["action"] == "replied", f"reply failed: {reply_result}"
    outbound_reply_id = reply_result["outbound_message_id"]

    print("\n[8] Verify reply stored + inbound marked 'replied'")
    with StateManager() as sm:
        original = sm.get_message(inbound_msg_id)
        assert original["status"] == "replied", f"inbound not replied: {original['status']}"
        reply = sm.get_message(outbound_reply_id)
        assert reply["direction"] == "outbound"
        assert reply["in_reply_to"] is not None, "reply should set in_reply_to"
        print(f"    outbound reply id={outbound_reply_id} in_reply_to={reply['in_reply_to']}")

    print("\n[9] Inbox stats")
    with StateManager() as sm:
        inbox = sm.get_inbox_by_masked_email(masked_from)
        stats = sm.get_inbox_stats(inbox["id"])
        print(f"    stats={stats}")
        assert stats["active_threads"] >= 1
        assert stats["awaiting_buyer"] >= 1

    print("\n[10] Events published")
    with EventBus() as bus:
        expected_types = (
            MESSAGE_SENT, MESSAGE_RECEIVED, MESSAGE_PROCESSED,
            MESSAGE_REPLIED, THREAD_OPENED,
        )
        seen: set[str] = set()
        for et in expected_types:
            events = bus.replay(event_type=et, limit=10)
            if events:
                seen.add(et)
        for expected in (MESSAGE_SENT, MESSAGE_RECEIVED, MESSAGE_PROCESSED, MESSAGE_REPLIED):
            assert expected in seen, f"missing event: {expected}"
        print(f"    events seen: {sorted(seen)}")

    print("\n[11] Webhook signature verification")
    provider = ResendEmailProvider(webhook_secret="test-secret-123")
    raw_body = b'{"data":{"from":"x@y.com"}}'
    import hmac, hashlib
    good_sig = hmac.new(b"test-secret-123", raw_body, hashlib.sha256).hexdigest()
    assert provider.verify_webhook_signature(raw_body, f"v1,{good_sig}"), "valid sig rejected"
    assert not provider.verify_webhook_signature(raw_body, "v1,deadbeef"), "bad sig accepted"
    print("    ✓ valid signature accepted, invalid rejected")

    print("\n[12] Webhook FastAPI app builds")
    from coffee_export.messaging.webhook import create_inbound_app
    app = create_inbound_app(gateway=gateway)
    routes = [r.path for r in app.routes]
    assert "/webhooks/email/inbound" in routes, "webhook route missing"
    assert "/health" in routes, "health route missing"
    print(f"    routes: {routes}")

    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED — Messaging Gateway is fully operational.")
    print("=" * 60)
    print(f"\nMasked address used: {masked_from}")
    print(f"Buyer email:         {buyer_email}")
    print(f"Thread ID:           {thread_id}")


if __name__ == "__main__":
    test_full_gateway_flow()
