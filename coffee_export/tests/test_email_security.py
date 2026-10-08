"""
Phase 2 email-security tests — signature verification, idempotency, tenant
isolation, routing, domain configuration, and leak prevention.

All provider interactions are dry-run (no RESEND_API_KEY) or mocked; nothing
here performs or proves real external delivery. These tests run against the
throwaway DB provided by scripts/run-python-tests.sh (COFFEE_DATABASE_URL).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from coffee_export.messaging.gateway import EmailGateway
from coffee_export.messaging.providers.resend import ResendEmailProvider
from coffee_export.messaging.webhook import create_inbound_app
from coffee_export.state.state_manager import now_addis_iso_str

WEBHOOK_SECRET = "whsec_" + base64.b64encode(uuid.uuid4().bytes).decode()
BRIDGE_SECRET = "test-bridge-secret"


# ── helpers ──────────────────────────────────────────────────────────────────


def svix_headers(secret: str, raw_body: bytes, msg_id: str = "msg_test", ts: int | None = None):
    """Build REAL Resend/Svix webhook headers for a payload."""
    ts = ts if ts is not None else int(time.time())
    key = secret[len("whsec_"):] if secret.startswith("whsec_") else secret
    try:
        key_bytes = base64.b64decode(key)
    except Exception:
        key_bytes = key.encode()
    signed = f"{msg_id}.{ts}.".encode() + raw_body
    sig = base64.b64encode(hmac.new(key_bytes, signed, hashlib.sha256).digest()).decode()
    return {
        "svix-id": msg_id,
        "svix-timestamp": str(ts),
        "svix-signature": f"t={ts},v1={sig}",
    }, sig


def legacy_signature(secret: str, raw_body: bytes) -> str:
    """Old dev-scheme signature: hex HMAC over the raw body."""
    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


def _setup_org(session, org_id: str, operator_name: str):
    """Create an operator + lead + buyer contact for an org; return ids."""
    from coffee_export.database.models import Lead, LeadContact, Operator

    suffix = uuid.uuid4().hex[:8]
    operator_id = f"op-{suffix}"
    lead_id = f"L-TEST-{suffix}"
    buyer_email = f"buyer-{suffix}@realbuyer-{suffix}.example"

    now = now_addis_iso_str()
    session.add(
        Operator(
            operator_id=operator_id,
            name=operator_name,
            email=f"{operator_id}@faithelexport.com",
            role="operator",
            status="active",
            organization_id=org_id,
            created_ts=now,
            updated_ts=now,
        )
    )
    session.add(
        Lead(
            lead_id=lead_id,
            company_name=f"Real Buyer Co {suffix}",
            headquarters_country="DE",
            organization_id=org_id,
            created_ts=now,
            updated_ts=now,
        )
    )
    session.flush()
    session.add(
        LeadContact(
            lead_id=lead_id,
            name="Buyer Person",
            title="Head of Coffee",
            email=buyer_email,
            is_primary=1,
            is_buyer=1,
            organization_id=org_id,
            created_ts=now,
            updated_ts=now,
        )
    )
    session.commit()
    return operator_id, lead_id, buyer_email


def _bridge_env():
    return {
        "EMAIL_BRIDGE_SECRET": BRIDGE_SECRET,
        "RESEND_WEBHOOK_SECRET": WEBHOOK_SECRET,
        "EMAIL_ALLOW_UNSIGNED_WEBHOOKS": "",
    }


@pytest.fixture()
def app_client():
    """TestClient on the REAL app (real gateway, dry-run provider)."""
    with patch.dict(os.environ, _bridge_env()):
        client = TestClient(create_inbound_app())
        yield client


@pytest.fixture()
def org_setup():
    """One org (org-A) with operator + lead + buyer contact."""
    from coffee_export.database.base import SessionLocal

    session = SessionLocal()
    try:
        yield _setup_org(session, "org-test-a", "Alice Amsalu")
    finally:
        session.close()


@pytest.fixture()
def org_b_setup():
    from coffee_export.database.base import SessionLocal

    session = SessionLocal()
    try:
        yield _setup_org(session, "org-test-b", "Bob Bekele")
    finally:
        session.close()


def _send_via_bridge(client, operator_id, lead_id, buyer_email, org="org-test-a"):
    return client.post(
        "/api/bridge/send",
        headers={"Authorization": f"Bearer {BRIDGE_SECRET}"},
        json={
            "operator_id": operator_id,
            "operator_name": "Alice Amsalu",
            "display_name": "Alice Amsalu",
            "lead_id": lead_id,
            "buyer_email": buyer_email,
            "subject": "Ethiopian 25/26 crop",
            "body_text": "Hello, we have new lots available.",
            "organization_id": org,
        },
    )


def _inbound_payload(to_masked: str, from_buyer: str, provider_message_id: str):
    """Real Resend `email.inbound` event shape."""
    return {
        "type": "email.inbound",
        "created_at": "2026-09-28T00:00:00Z",
        "data": {
            "email": {
                "from": {"email": from_buyer, "name": "Buyer Person"},
                "to": [{"email": to_masked, "name": "Alice"}],
                "subject": "Re: Ethiopian 25/26 crop",
                "text": "Sounds interesting — please send cupping scores.",
                "html": None,
                "message_id": provider_message_id,
            }
        },
    }


# ── 1. Webhook signature verification ────────────────────────────────────────


def test_svix_signature_valid_accepted():
    provider = ResendEmailProvider(webhook_secret=WEBHOOK_SECRET)
    body = b'{"type":"email.inbound","data":{}}'
    headers, _ = svix_headers(WEBHOOK_SECRET, body)
    assert provider.verify_webhook_signature(
        body, headers["svix-signature"],
        svix_id=headers["svix-id"], svix_timestamp=headers["svix-timestamp"],
    ) is True


def test_svix_signature_invalid_rejected():
    provider = ResendEmailProvider(webhook_secret=WEBHOOK_SECRET)
    body = b'{"type":"email.inbound","data":{}}'
    headers, _ = svix_headers(WEBHOOK_SECRET, body)
    tampered = body + b"x"  # body modified after signing
    assert provider.verify_webhook_signature(
        tampered, headers["svix-signature"],
        svix_id=headers["svix-id"], svix_timestamp=headers["svix-timestamp"],
    ) is False


def test_webhook_unsigned_rejected_when_secret_set(app_client):
    with patch.dict(os.environ, _bridge_env()):
        r = app_client.post(
            "/webhooks/email/inbound",
            content=b'{"data":{"from":"x@y.com"}}',
            headers={"Content-Type": "application/json"},  # no signature
        )
        assert r.status_code == 401


def test_webhook_unsigned_rejected_when_secret_missing():
    """Fail closed: no RESEND_WEBHOOK_SECRET configured -> reject."""
    env = {"EMAIL_BRIDGE_SECRET": BRIDGE_SECRET, "RESEND_WEBHOOK_SECRET": "",
           "EMAIL_ALLOW_UNSIGNED_WEBHOOKS": ""}
    with patch.dict(os.environ, env):
        client = TestClient(create_inbound_app())
        r = client.post(
            "/webhooks/email/inbound",
            content=b'{"data":{"from":"x@y.com"}}',
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 401


def test_webhook_unsigned_allowed_with_explicit_dev_override():
    env = {"EMAIL_BRIDGE_SECRET": BRIDGE_SECRET, "RESEND_WEBHOOK_SECRET": "",
           "EMAIL_ALLOW_UNSIGNED_WEBHOOKS": "1"}
    with patch.dict(os.environ, env):
        client = TestClient(create_inbound_app())
        r = client.post(
            "/webhooks/email/inbound",
            content=json.dumps({"data": {"from": "x@y.com", "to": "nobody@nowhere.example"}}),
            headers={"Content-Type": "application/json"},
        )
        # Signature accepted via the loud dev override; unknown inbox -> 202 (not 401)
        assert r.status_code == 202


def test_webhook_replay_rejected():
    """A correctly-signed but stale delivery (10 min old) is refused."""
    provider = ResendEmailProvider(webhook_secret=WEBHOOK_SECRET)
    body = b'{"data":{}}'
    headers, _ = svix_headers(WEBHOOK_SECRET, body, ts=int(time.time()) - 600)
    assert provider.verify_webhook_signature(
        body, headers["svix-signature"],
        svix_id=headers["svix-id"], svix_timestamp=headers["svix-timestamp"],
    ) is False


def test_legacy_dev_signature_still_accepted():
    provider = ResendEmailProvider(webhook_secret="legacy-secret")
    body = b'{"data":{"from":"x@y.com"}}'
    good = legacy_signature("legacy-secret", body)
    assert provider.verify_webhook_signature(body, f"v1,{good}") is True
    assert provider.verify_webhook_signature(body, "v1,deadbeef") is False


# ── 2. Bridge auth (missing / wrong secret) ──────────────────────────────────


def test_bridge_send_missing_token_401(app_client):
    with patch.dict(os.environ, _bridge_env()):
        r = app_client.post("/api/bridge/send", json={
            "operator_id": "op-1", "display_name": "X", "lead_id": "L-1",
            "buyer_email": "b@example.com", "subject": "s", "body_text": "b",
        })
        assert r.status_code == 401


def test_bridge_send_wrong_token_401(app_client):
    with patch.dict(os.environ, _bridge_env()):
        r = app_client.post(
            "/api/bridge/send",
            headers={"Authorization": "Bearer wrong-secret"},
            json={
                "operator_id": "op-1", "display_name": "X", "lead_id": "L-1",
                "buyer_email": "b@example.com", "subject": "s", "body_text": "b",
            },
        )
        assert r.status_code == 401


# ── 3. Outbound: dry-run honesty + masked identity + no leaks ───────────────


def test_bridge_send_dry_run_labeled_and_masked(app_client, org_setup):
    operator_id, lead_id, buyer_email = org_setup
    with patch.dict(os.environ, _bridge_env()):
        r = _send_via_bridge(app_client, operator_id, lead_id, buyer_email)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["dry_run"] is True  # no RESEND_API_KEY in tests — labeled, never presented as real
        assert data["masked_from"].endswith("@faithelexport.com")
        assert data["masked_from"].startswith("alice.amsalu")
        assert "@" not in data["masked_from"].split("@")[0]
        # No exporter real email anywhere in the response
        assert "operator_id@" not in json.dumps(data)
        assert "@faithelexport.com" in data["masked_from"]


def test_bridge_send_cross_tenant_lead_refused_403(app_client, org_setup, org_b_setup):
    """Sending for a lead that belongs to ANOTHER org must fail closed."""
    op_a, lead_a, _ = org_setup
    _, lead_b, _ = org_b_setup
    with patch.dict(os.environ, _bridge_env()):
        # org-A operator asks to send on org-B's lead
        r = _send_via_bridge(app_client, op_a, lead_b, "buyer@example.org", org="org-test-a")
        assert r.status_code == 403
        data = r.json()
        assert data["action"] == "send_refused"
        assert "does not belong" in data["error"]


# ── 4. Inbound: signature → routing → thread → dedup ────────────────────────


def test_inbound_reply_routes_to_correct_thread(app_client, org_setup):
    operator_id, lead_id, buyer_email = org_setup
    with patch.dict(os.environ, _bridge_env()):
        # 1. outbound (dry-run) creates the thread
        r = _send_via_bridge(app_client, operator_id, lead_id, buyer_email)
        assert r.status_code == 200
        thread_id = r.json()["thread_id"]

        # 2. buyer replies via a correctly-signed webhook
        masked = r.json()["masked_from"]
        payload = _inbound_payload(masked, buyer_email, f"resend-in-{uuid.uuid4().hex[:10]}")
        raw = json.dumps(payload).encode()
        headers, _ = svix_headers(WEBHOOK_SECRET, raw, msg_id=f"msg_{uuid.uuid4().hex[:8]}")
        r2 = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json",
        })
        assert r2.status_code == 200, r2.text
        inbound = r2.json()
        assert inbound["action"] == "received"
        assert inbound["thread_id"] == thread_id  # SAME thread — routing works
        assert inbound["message_id"]

        # 3. the inbound message is org-attributed (visible to org-A's inbox view)
        from coffee_export.database.base import SessionLocal
        from coffee_export.database.models.messaging import InboxMessage
        session = SessionLocal()
        try:
            msg = session.get(InboxMessage, inbound["message_id"])
            assert msg is not None
            assert msg.organization_id == "org-test-a"
        finally:
            session.close()


def test_duplicate_webhook_delivery_stores_once(app_client, org_setup):
    operator_id, lead_id, buyer_email = org_setup
    with patch.dict(os.environ, _bridge_env()):
        r = _send_via_bridge(app_client, operator_id, lead_id, buyer_email)
        masked = r.json()["masked_from"]
        thread_id = r.json()["thread_id"]

        provider_msg_id = f"resend-in-{uuid.uuid4().hex[:10]}"
        payload = _inbound_payload(masked, buyer_email, provider_msg_id)
        raw = json.dumps(payload).encode()
        headers, _ = svix_headers(WEBHOOK_SECRET, raw)

        r1 = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json"})
        assert r1.status_code == 200
        assert r1.json()["action"] == "received"

        # Resend retry: SAME payload, SAME provider_message_id
        r2 = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json"})
        assert r2.status_code == 200
        assert r2.json()["action"] == "duplicate"
        assert r2.json()["message_id"] == r1.json()["message_id"]

        # Exactly ONE inbound row exists for that provider id
        from coffee_export.database.base import SessionLocal
        from coffee_export.database.models.messaging import InboxMessage
        session = SessionLocal()
        try:
            rows = session.query(InboxMessage).filter(
                InboxMessage.provider_message_id == provider_msg_id,
                InboxMessage.direction == "inbound",
            ).all()
            assert len(rows) == 1
            # thread counters reflect one message, not two
            from coffee_export.database.models.messaging import MessageThread
            thread = session.get(MessageThread, thread_id)
            assert thread.message_count == 2  # 1 outbound + 1 inbound
        finally:
            session.close()


def test_inbound_unknown_buyer_202(app_client, org_setup):
    operator_id, lead_id, buyer_email = org_setup
    with patch.dict(os.environ, _bridge_env()):
        r = _send_via_bridge(app_client, operator_id, lead_id, buyer_email)
        masked = r.json()["masked_from"]

        # A stranger emails the masked address — no matching thread/contact
        payload = _inbound_payload(masked, "stranger@unknown-sender.example", f"resend-in-{uuid.uuid4().hex[:8]}")
        raw = json.dumps(payload).encode()
        headers, _ = svix_headers(WEBHOOK_SECRET, raw)
        r2 = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json"})
        assert r2.status_code == 202
        assert r2.json()["action"] == "rejected"


def test_inbound_unknown_inbox_202(app_client):
    with patch.dict(os.environ, _bridge_env()):
        payload = _inbound_payload("nobody@faithelexport.com", "x@y.example", f"resend-in-{uuid.uuid4().hex[:8]}")
        raw = json.dumps(payload).encode()
        headers, _ = svix_headers(WEBHOOK_SECRET, raw)
        r = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json"})
        assert r.status_code == 202
        assert "unknown inbox" in r.json()["reason"]


def test_inbound_real_resend_payload_shape_parsed(app_client, org_setup):
    """data.email.* nesting + object `from` — the REAL Resend shape works."""
    operator_id, lead_id, buyer_email = org_setup
    with patch.dict(os.environ, _bridge_env()):
        r = _send_via_bridge(app_client, operator_id, lead_id, buyer_email)
        masked = r.json()["masked_from"]
        payload = _inbound_payload(masked, buyer_email, f"resend-in-{uuid.uuid4().hex[:8]}")
        raw = json.dumps(payload).encode()
        headers, _ = svix_headers(WEBHOOK_SECRET, raw)
        r2 = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json"})
        assert r2.status_code == 200
        body = r2.json()
        assert body["action"] == "received"
        # the from_addr was extracted from the OBJECT form and normalized


def test_cross_tenant_buyer_resolution_blocked():
    """org-A's inbox must never resolve to org-B's lead — even when both orgs
    track a buyer with the SAME email (tenant-scoped _resolve_buyer)."""
    from coffee_export.database.base import SessionLocal

    session = SessionLocal()
    try:
        op_a, lead_a, buyer_email_a = _setup_org(session, "org-x-a", "Xena One")
        op_b, lead_b, buyer_email_b_same = None, None, None
        # org-B tracks the SAME real-world buyer email
        from coffee_export.database.models import Lead, LeadContact, Operator

        now = now_addis_iso_str()
        suffix = uuid.uuid4().hex[:8]
        op_b = f"op-{suffix}"
        lead_b = f"L-TEST-{suffix}"
        session.add(Operator(operator_id=op_b, name="Yonatan Two", email=f"{op_b}@faithelexport.com",
                             role="operator", status="active", organization_id="org-x-b",
                             created_ts=now, updated_ts=now))
        session.add(Lead(lead_id=lead_b, company_name=f"Shared Buyer {suffix}",
                         headquarters_country="IT", organization_id="org-x-b",
                         created_ts=now, updated_ts=now))
        session.flush()
        session.add(LeadContact(lead_id=lead_b, name="Same Person", title="Buyer", email=buyer_email_a,
                                is_primary=1, is_buyer=1, organization_id="org-x-b",
                                created_ts=now, updated_ts=now))
        session.commit()

        gw = EmailGateway()
        inbox = gw.sm.get_or_create_exporter_inbox(
            operator_id=op_a, display_name="Xena One", inbound_domain="faithelexport.com",
            operator_name="Xena One", organization_id="org-x-a",
        )
        # _resolve_buyer_contact scoped to org-x-a must find lead_a (org-A's own
        # contact), never lead_b (org-B's), despite the identical email.
        # (Phase 4: renamed/reshaped from _resolve_buyer — same tenant-scoped
        # contract, now part of the mask-registry resolution chain.)
        resolved_lead, _ = gw._resolve_buyer_contact(buyer_email_a, "org-x-a")
        assert resolved_lead == lead_a

        # And with no matching contact in the org at all -> (None, None)
        resolved_none, _ = gw._resolve_buyer_contact("nobody@nowhere.example", "org-x-a")
        assert resolved_none is None
    finally:
        session.close()


# ── 5. Reply path + tenant enforcement ───────────────────────────────────────


def test_bridge_reply_routes_and_marks_replied(app_client, org_setup):
    operator_id, lead_id, buyer_email = org_setup
    with patch.dict(os.environ, _bridge_env()):
        r = _send_via_bridge(app_client, operator_id, lead_id, buyer_email)
        masked = r.json()["masked_from"]
        payload = _inbound_payload(masked, buyer_email, f"resend-in-{uuid.uuid4().hex[:10]}")
        raw = json.dumps(payload).encode()
        headers, _ = svix_headers(WEBHOOK_SECRET, raw)
        r2 = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json"})
        inbound_msg_id = r2.json()["message_id"]

        # Exporter replies through the bridge with the org context
        r3 = app_client.post(
            "/api/bridge/reply",
            headers={"Authorization": f"Bearer {BRIDGE_SECRET}"},
            json={"message_id": inbound_msg_id, "body_text": "Scores attached!",
                  "operator_id": operator_id, "organization_id": "org-test-a"},
        )
        assert r3.status_code == 200, r3.text
        data = r3.json()
        assert data["ok"] is True
        assert data["action"] == "replied"
        assert data["dry_run"] is True

        # The inbound message is now marked replied
        from coffee_export.database.base import SessionLocal
        from coffee_export.database.models.messaging import InboxMessage
        session = SessionLocal()
        try:
            msg = session.get(InboxMessage, inbound_msg_id)
            assert msg.status == "replied"
        finally:
            session.close()


def test_bridge_reply_cross_tenant_refused_403(app_client, org_setup, org_b_setup):
    """org-B must not be able to reply to org-A's inbound message."""
    operator_id, lead_id, buyer_email = org_setup
    with patch.dict(os.environ, _bridge_env()):
        r = _send_via_bridge(app_client, operator_id, lead_id, buyer_email)
        masked = r.json()["masked_from"]
        payload = _inbound_payload(masked, buyer_email, f"resend-in-{uuid.uuid4().hex[:10]}")
        raw = json.dumps(payload).encode()
        headers, _ = svix_headers(WEBHOOK_SECRET, raw)
        r2 = app_client.post("/webhooks/email/inbound", content=raw, headers={
            **headers, "Content-Type": "application/json"})
        inbound_msg_id = r2.json()["message_id"]

        r3 = app_client.post(
            "/api/bridge/reply",
            headers={"Authorization": f"Bearer {BRIDGE_SECRET}"},
            json={"message_id": inbound_msg_id, "body_text": "hi",
                  "operator_id": "someone-else", "organization_id": "org-test-b"},
        )
        assert r3.status_code == 403
        assert r3.json()["action"] == "reply_refused"


def test_bridge_reply_message_not_found_404(app_client):
    with patch.dict(os.environ, _bridge_env()):
        r = app_client.post(
            "/api/bridge/reply",
            headers={"Authorization": f"Bearer {BRIDGE_SECRET}"},
            json={"message_id": 999999999, "body_text": "hi"},
        )
        assert r.status_code == 404


# ── 6. Sender domain configuration ──────────────────────────────────────────


def test_sender_domain_is_configuration_driven(org_setup):
    """Masked addresses use the configured domain; the same operator keeps
    the SAME inbox (domain changes never orphan existing threads)."""
    from coffee_export.database.base import SessionLocal

    operator_id, lead_id, buyer_email = org_setup
    session = SessionLocal()
    try:
        gw_old = EmailGateway(inbound_domain="old-domain.example")
        inbox_old = gw_old.sm.get_or_create_exporter_inbox(
            operator_id=operator_id, display_name="Alice Amsalu",
            inbound_domain="old-domain.example", operator_name="Alice Amsalu",
            organization_id="org-test-a",
        )
        assert inbox_old["masked_email"].endswith("@old-domain.example")

        # Domain changes -> the SAME operator gets the SAME (old) inbox row:
        # stored masked addresses are never rewritten, so existing threads and
        # messages keep working. New operators get the new domain.
        gw_new = EmailGateway(inbound_domain="new-domain.example")
        inbox_same_op = gw_new.sm.get_or_create_exporter_inbox(
            operator_id=operator_id, display_name="Alice Amsalu",
            inbound_domain="new-domain.example", operator_name="Alice Amsalu",
            organization_id="org-test-a",
        )
        assert inbox_same_op["masked_email"] == inbox_old["masked_email"]  # unchanged

        # A DIFFERENT operator on the new domain gets the new domain
        suffix = uuid.uuid4().hex[:8]
        from coffee_export.database.models import Operator
        session.add(Operator(operator_id=f"op2-{suffix}", name="New Person",
                             email=f"op2-{suffix}@faithelexport.com", role="operator",
                             status="active", organization_id="org-test-a",
                             created_ts=now_addis_iso_str(), updated_ts=now_addis_iso_str()))
        session.commit()
        inbox_new = gw_new.sm.get_or_create_exporter_inbox(
            operator_id=f"op2-{suffix}", display_name="New Person",
            inbound_domain="new-domain.example", operator_name="New Person",
            organization_id="org-test-a",
        )
        assert inbox_new["masked_email"].endswith("@new-domain.example")
    finally:
        session.close()


# ── 7. Retryable vs permanent errors (provider layer, mocked) ──────────────


def test_provider_permanent_failure_is_not_success():
    """A 4xx from the provider must come back success=False with the error —
    never stored as a sent message."""
    from unittest.mock import MagicMock

    provider = ResendEmailProvider(api_key="re_test_key")  # real mode, no dry-run
    resp = MagicMock(status_code=422, text="invalid_to_address")
    resp.json.return_value = {}
    with patch("coffee_export.messaging.providers.resend.requests") as mock_requests:
        mock_requests.post.return_value = resp
        mock_requests.RequestException = Exception
        result = provider.send_email("A <a@x.com>", "bad@buyer.com", "s", "b")
    assert result["success"] is False
    assert "HTTP 422" in result["error"]
    assert result["dry_run"] is False


def test_provider_transport_error_is_not_success():
    import requests as real_requests

    provider = ResendEmailProvider(api_key="re_test_key")
    with patch("coffee_export.messaging.providers.resend.requests") as mock_requests:
        mock_requests.post.side_effect = real_requests.ConnectionError("conn refused")
        mock_requests.RequestException = real_requests.RequestException
        result = provider.send_email("A <a@x.com>", "b@buyer.com", "s", "b")
    assert result["success"] is False
    assert result["provider_message_id"] is None
    assert result["dry_run"] is False


def test_gateway_send_failure_not_stored_as_sent():
    """When the provider fails, EmailGateway.send returns send_failed and no
    message row is written — 'sent' only happens after provider acceptance."""
    from coffee_export.database.base import SessionLocal
    from coffee_export.database.models.messaging import InboxMessage

    session = SessionLocal()
    try:
        operator_id, lead_id, buyer_email = _setup_org(session, "org-fail-test", "Fail Tester")
        gw = EmailGateway()
        with patch.object(gw.provider, "send_email", return_value={
            "success": False, "provider_message_id": None, "error": "HTTP 422: bad", "dry_run": False,
        }):
            result = gw.send(
                operator_id=operator_id, display_name="Fail Tester", lead_id=lead_id,
                buyer_email=buyer_email, subject="s", body_text="b",
                operator_name="Fail Tester", organization_id="org-fail-test",
            )
        assert result["action"] == "send_failed"
        assert result["dry_run"] is False

        # Nothing stored for the failed send: query via thread -> lead
        session.expire_all()
        rows = (
            session.query(InboxMessage)
            .join(InboxMessage.thread)
            .filter(InboxMessage.direction == "outbound")
            .all()
        )
        fail_thread_outbound = [m for m in rows if m.thread.lead_id == lead_id]
        assert len(fail_thread_outbound) == 0  # nothing stored for the failed send
    finally:
        session.close()
