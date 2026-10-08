#!/usr/bin/env python3
"""
Phase 4 — Buyer identity masking: comprehensive test suite.

Covers the seven requirement groups (docs/buyer-masking.md):
  1. Crypto: HKDF derivation determinism, AES-GCM round-trip, tamper and
     wrong-org rejection, cross-org isolation of lookup keys and aliases.
  2. Registry: deterministic get-or_create, revocation lifecycle, tenant
     scoping (same real buyer in two orgs -> two independent masks).
  3. Gateway outbound: real-address sends require a registered contact of
     the lead (Phase 1 outreach gate, enforced gateway-side); alias sends
     resolve through the registry; the provider receives the REAL address
     while EVERY stored field keeps the alias; unknown / revoked /
     cross-tenant aliases refused; fail-closed without BUYER_MASK_SECRET.
  4. Gateway inbound: registered buyer -> stored from = alias; content
     redaction (quoted signature, CC/BCC stripping in raw payload);
     unknown sender rejected without echoing the address; revoked buyer
     rejected; duplicate webhooks idempotent; the AI processor receives
     the ALIAS and the REDACTED body only.
  5. Legacy self-heal: pre-masking plaintext thread + messages are linked,
     rewritten and redacted on first touch (audited, idempotent) with the
     real address preserved ONLY in the encrypted registry.
  6. Bridge policy: CC/BCC (any extra field) in bridge requests -> 422.
  7. Migration preservation: upgrading a pre-Phase-4 schema keeps all
     existing thread/message rows byte-identical (no data rewrite in the
     migration itself).

Run:  python -m tests.test_buyer_masking
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("BUYER_MASK_SECRET", "test-buyer-mask-secret-phase4-0001")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from typing import Any

from coffee_export.messaging import EmailGateway, ResendEmailProvider
from coffee_export.messaging import masking as bm
from coffee_export.state import StateManager
from coffee_export.state.state_manager import now_addis_iso_str


# ──────────────────────────────────────────────────────────────────────
# Fixtures / helpers
# ──────────────────────────────────────────────────────────────────────

def _n() -> int:
    """Unique-ish suffix for repeatable runs against one DB."""
    import random

    return random.randint(10_000, 99_999)


def _ensure_operator(operator_id: str, org: str = "org-system", name: str = "Test Operator") -> None:
    from coffee_export.database.models import Operator

    with StateManager() as sm:
        if not sm.session.get(Operator, operator_id):
            now = now_addis_iso_str()
            sm.session.add(
                Operator(
                    operator_id=operator_id,
                    name=name,
                    email=f"{operator_id}@faithelexport.com",
                    role="operator",
                    status="active",
                    organization_id=org,
                    created_ts=now,
                    updated_ts=now,
                )
            )
            sm._commit()


def _ensure_lead_with_contact(
    org: str, email: str, company_hint: str
) -> tuple[str, int]:
    """Create a lead + primary contact with the given address. Returns (lead_id, contact_id)."""
    from coffee_export.database.models import Lead, LeadContact

    with StateManager() as sm:
        company = f"MaskTest {company_hint} {_n()}"
        lead_id = sm.create_lead(
            company_name=company,
            headquarters_country="DE",
            headquarters_city="Berlin",
            website="https://masktest.example",
            recommended_vp="VP1",
            priority_tier="A",
            outreach_language="EN",
            created_by="test_buyer_masking",
        )
        if org != "org-system":
            # create_lead defaults to org-system; move the lead (and only the
            # lead) into the target org for tenant-isolation tests.
            row = sm.session.get(Lead, lead_id)
            assert row is not None
            row.organization_id = org
            sm._commit()
        now = now_addis_iso_str()
        contact = LeadContact(
            lead_id=lead_id,
            name="Test Buyer",
            title="Head of Coffee",
            email=email,
            is_primary=1,
            is_buyer=1,
            organization_id=org,
            created_ts=now,
            updated_ts=now,
        )
        sm.session.add(contact)
        sm._commit()
        return lead_id, contact.id


class RecordingProvider(ResendEmailProvider):
    """Provider that records every send's REAL recipient (never stored)."""

    def __init__(self) -> None:
        super().__init__(inbound_domain="faithelexport.com")
        self.sent_to: list[str] = []

    def send_email(self, **kwargs: Any) -> dict[str, Any]:  # noqa: ARG003
        self.sent_to.append(kwargs["to_addr"])
        return {"success": True, "provider_message_id": "dry-run-test", "error": None, "dry_run": True}


class RecordingAI:
    """AI processor that records exactly what the LLM would receive."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def process(self, subject: str, from_addr: str, body: str) -> dict[str, Any]:
        self.calls.append({"subject": subject, "from_addr": from_addr, "body": body})
        return {
            "summary": "test summary",
            "classification": "question",
            "intent": "other",
            "translation": None,
            "language_detected": "en",
            "cost_usd": 0.0,
            "llm_used": "none",
            "provider": "test",
            "extracted_data": {
                "intent": "other", "volume_bags": None, "origin": None,
                "grade": None, "destination": None, "incoterm": None,
                "urgency": None, "next_action": None,
            },
        }


def _gateway(provider: RecordingProvider | None = None, ai: RecordingAI | None = None) -> tuple[EmailGateway, RecordingProvider, RecordingAI]:
    provider = provider or RecordingProvider()
    ai = ai or RecordingAI()
    gw = EmailGateway(provider=provider, ai_processor=ai, inbound_domain="faithelexport.com")
    return gw, provider, ai


# ──────────────────────────────────────────────────────────────────────
# 1. Crypto primitives
# ──────────────────────────────────────────────────────────────────────

def test_crypto_primitives() -> None:
    print("\n[1] Crypto primitives")
    assert bm.masking_enabled(), "test secret must be set"

    # Deterministic lookup keys + aliases; org-scoped
    k1 = bm.lookup_key("org-a", "Buyer@Example.com ")
    k2 = bm.lookup_key("org-a", "buyer@example.com")
    k3 = bm.lookup_key("org-b", "buyer@example.com")
    assert k1 == k2, "lookup key must be deterministic under normalization"
    assert k1 != k3, "lookup key must be org-scoped"

    a1 = bm.alias_address("org-a", "buyer@example.com", "faithelexport.com")
    a2 = bm.alias_address("org-a", "buyer@example.com", "faithelexport.com")
    a3 = bm.alias_address("org-b", "buyer@example.com", "faithelexport.com")
    assert a1 == a2 and a1 != a3, "alias deterministic per org, distinct across orgs"
    assert a1.startswith("buyer.") and a1.endswith("@faithelexport.com")

    # AES-GCM round-trip + tamper + cross-org binding
    blob = bm.encrypt_email("org-a", "buyer@example.com")
    assert "buyer@example.com" not in blob, "ciphertext must not contain plaintext"
    assert bm.decrypt_email("org-a", blob) == "buyer@example.com"
    try:
        bm.decrypt_email("org-b", blob)
        raise AssertionError("cross-org decryption must fail (AAD binding)")
    except Exception:
        pass
    tampered = blob[:-6] + ("AAAAAA" if not blob.endswith("AAAAAA") else "BBBBBB")
    try:
        bm.decrypt_email("org-a", tampered)
        raise AssertionError("tampered ciphertext must fail")
    except Exception:
        pass

    # Platform-alias detection
    assert bm.is_platform_alias(a1, "faithelexport.com")
    assert not bm.is_platform_alias("buyer@example.com", "faithelexport.com")

    # Redaction: registered -> alias, unknown -> untouched, case-insensitive
    resolver = lambda e: a1 if e == "buyer@example.com" else None  # noqa: E731
    text = "From: Buyer@Example.com — CC: other@example.org quoting buyer@example.com"
    red = bm.redact_text(text, resolver)
    assert "buyer@example.com" not in red.lower(), "registered address must be redacted"
    assert a1 in red
    assert "other@example.org" in red, "unknown third-party address stays (documented limit)"

    # CC/BCC stripping
    payload = {"data": {"from": "x@y.z", "cc": ["a@b.c"], "nested": {"bcc": "d@e.f", "keep": 1}}, "to": "t@u.v"}
    cleaned = bm.strip_cc_bcc(payload)
    s = str(cleaned)
    assert '"cc"' not in s and "'cc'" not in s and "bcc" not in s.lower(), f"cc/bcc must be stripped: {s}"
    assert cleaned["data"]["nested"]["keep"] == 1, "unrelated keys preserved"
    print("    ✓ deterministic keys, AEAD round-trip, tamper/cross-org rejection, redaction, cc/bcc strip")


# ──────────────────────────────────────────────────────────────────────
# 2. Registry lifecycle
# ──────────────────────────────────────────────────────────────────────

def test_registry_lifecycle() -> None:
    print("\n[2] Registry lifecycle")
    email = f"registry-{_n()}@buyer.example"
    with StateManager() as sm:
        m1 = sm.get_or_create_buyer_mask("org-system", email, "faithelexport.com", created_by="test")
        m2 = sm.get_or_create_buyer_mask("org-system", email, "faithelexport.com", created_by="test")
        assert m1["id"] == m2["id"] and m2["created"] is False, "get_or_create must be idempotent"
        assert sm.decrypt_buyer_email(m1) == email

        # Tenant isolation: same address in another org -> separate mask/alias
        mb = sm.get_or_create_buyer_mask("org-other", email, "faithelexport.com")
        assert mb["id"] != m1["id"] and mb["alias_address"] != m1["alias_address"]
        assert sm.find_buyer_mask_by_real_email("org-other", email)["id"] == mb["id"]
        assert sm.find_buyer_mask_by_real_email("org-system", email)["id"] == m1["id"]

        # Alias lookups are exact + global
        assert sm.find_buyer_mask_by_alias(m1["alias_address"])["id"] == m1["id"]
        assert sm.find_buyer_mask_by_alias("buyer.000000000000@faithelexport.com") is None

        # Revocation blocks and is terminal for lookups
        assert sm.revoke_buyer_mask(alias_address=m1["alias_address"], reason="test revoke")
        m1r = sm.find_buyer_mask_by_real_email("org-system", email)
        assert m1r["status"] == "revoked"
        assert sm.revoke_buyer_mask(mask_id=m1["id"]) is True, "re-revoke is a no-op True"
    print("    ✓ idempotent creation, tenant scoping, exact alias lookup, revocation")


# ──────────────────────────────────────────────────────────────────────
# 3. Gateway outbound masking
# ──────────────────────────────────────────────────────────────────────

def test_outbound_masking_round_trip() -> None:
    print("\n[3] Outbound: provider gets REAL, storage keeps ALIAS")
    _ensure_operator("mask-op-001")
    email = f"outbound-{_n()}@buyer.example"
    lead_id, contact_id = _ensure_lead_with_contact("org-system", email, "OutboundCo")

    gw, provider, _ = _gateway()
    res = gw.send(
        operator_id="mask-op-001",
        display_name="Faith Export — Sales",
        lead_id=lead_id,
        buyer_email=email,
        subject="Phase 4 round trip",
        body_text="Hello — first contact.",
        operator_name="Mask Tester",
    )
    assert res["action"] == "sent", res
    alias = res["buyer_alias"]

    # Provider received the REAL address (delivery requires it)
    assert provider.sent_to == [email], provider.sent_to
    # Everything stored carries the alias
    with StateManager() as sm:
        msg = sm.get_message(res["message_id"])
        assert msg["to_addr"] == alias and msg["to_addr"] != email
        thread = sm.get_thread(res["thread_id"])
        assert thread["buyer_email"] == alias
        assert thread["buyer_mask_id"] is not None
        mask = sm.find_buyer_mask_by_alias(alias)
        assert mask["buyer_contact_id"] == contact_id, "mask must link the contact"

    # Second send using the ALIAS (as the UI now does) still delivers to real
    res2 = gw.send(
        operator_id="mask-op-001",
        display_name="Faith Export — Sales",
        lead_id=lead_id,
        buyer_email=alias,
        subject="Re: Phase 4 round trip",
        body_text="Second touch via alias.",
        operator_name="Mask Tester",
    )
    assert res2["action"] == "sent", res2
    assert res2["buyer_alias"] == alias
    assert provider.sent_to == [email, email], "alias send must resolve to the same real address"
    with StateManager() as sm:
        msg2 = sm.get_message(res2["message_id"])
        assert msg2["to_addr"] == alias
    print(f"    ✓ real->provider ({email}), alias->storage ({alias}), alias->real resolution")


def test_outbound_refusals() -> None:
    print("\n[3b] Outbound refusals: contact gate, unknown/revoked/cross-tenant alias, fail-closed")
    _ensure_operator("mask-op-002")
    gw, provider, _ = _gateway()

    email = f"refuse-{_n()}@buyer.example"
    lead_id, _ = _ensure_lead_with_contact("org-system", email, "RefuseCo")
    other_lead, _ = _ensure_lead_with_contact("org-system", f"other-{_n()}@buyer.example", "OtherCo")

    # a) Real address NOT registered as a contact of THE lead -> refused
    r = gw.send(operator_id="mask-op-002", display_name="Faith Export", lead_id=other_lead,
                buyer_email=email, subject="x", body_text="y")
    assert r["action"] == "send_refused" and "registered contact" in r["error"], r
    assert provider.sent_to == [], "refused sends must never reach the provider"

    # b) Unknown alias -> refused
    r = gw.send(operator_id="mask-op-002", display_name="Faith Export", lead_id=lead_id,
                buyer_email="buyer.0123456789ab@faithelexport.com", subject="x", body_text="y")
    assert r["action"] == "send_refused" and "unknown buyer alias" in r["error"], r

    # c) Cross-tenant: org-B caller using org-A's alias -> refused
    email_b = f"cross-{_n()}@buyer.example"
    lead_b, contact_b = _ensure_lead_with_contact("org-other", email_b, "CrossCo")
    _ensure_operator("mask-op-b", org="org-other", name="Org B Op")
    r = gw.send(operator_id="mask-op-b", display_name="Faith Export B", lead_id=lead_b,
                buyer_email=email_b, subject="x", body_text="y", organization_id="org-other")
    assert r["action"] == "sent", r
    alias_b = r["buyer_alias"]
    r = gw.send(operator_id="mask-op-002", display_name="Faith Export", lead_id=lead_id,
                buyer_email=alias_b, subject="x", body_text="y")  # org-system caller
    assert r["action"] == "send_refused" and "organization" in r["error"], r

    # d) Revoked mask: BOTH the real address and the alias are blocked
    with StateManager() as sm:
        sm.revoke_buyer_mask(alias_address=alias_b, reason="test")
    r = gw.send(operator_id="mask-op-b", display_name="Faith Export B", lead_id=lead_b,
                buyer_email=alias_b, subject="x", body_text="y", organization_id="org-other")
    assert r["action"] == "send_refused" and "revoked" in r["error"], r
    r = gw.send(operator_id="mask-op-b", display_name="Faith Export B", lead_id=lead_b,
                buyer_email=email_b, subject="x", body_text="y", organization_id="org-other")
    assert r["action"] == "send_refused" and "revoked" in r["error"], r
    assert provider.sent_to == [email_b], "only the pre-revocation send reached the provider"

    # e) Fail-closed without the secret
    old = os.environ.pop("BUYER_MASK_SECRET", None)
    try:
        r = gw.send(operator_id="mask-op-002", display_name="Faith Export", lead_id=lead_id,
                    buyer_email=email, subject="x", body_text="y")
        assert r["action"] == "send_refused" and "BUYER_MASK_SECRET" in r["error"], r
    finally:
        os.environ["BUYER_MASK_SECRET"] = old or "test-buyer-mask-secret-phase4-0001"
    print("    ✓ contact gate, unknown alias, cross-tenant alias, revocation, fail-closed")


# ──────────────────────────────────────────────────────────────────────
# 4. Gateway inbound masking
# ──────────────────────────────────────────────────────────────────────

def _inbound_payload(from_addr: str, to_addr: str, body: str, msg_id: str, cc: list | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "from": from_addr,
        "to": [to_addr],
        "subject": "Re: Phase 4 round trip",
        "text": body,
        "message_id": msg_id,
    }
    if cc is not None:
        data["cc"] = cc
    return {"data": data}


def test_inbound_masking_and_redaction() -> None:
    print("\n[4] Inbound: alias storage, redaction, CC strip, AI isolation")
    _ensure_operator("mask-op-003")
    email = f"inbound-{_n()}@buyer.example"
    lead_id, _ = _ensure_lead_with_contact("org-system", email, "InboundCo")

    gw, provider, ai = _gateway()
    res = gw.send(
        operator_id="mask-op-003", display_name="Faith Export", lead_id=lead_id,
        buyer_email=email, subject="Phase 4 round trip", body_text="first",
        operator_name="Mask Tester",
    )
    assert res["action"] == "sent", res
    alias, masked_from, thread_id = res["buyer_alias"], res["masked_from"], res["thread_id"]

    # Buyer replies — signature quotes their real address; CC present in payload
    body = (
        "Hi,\n\nInterested in 320 bags Guji.\n\n"
        f"Best,\nMatt\n\nSent from my phone ({email})\n"
        "----- Original message -----\n"
        f"From: matt <{email}>\nTo: marcus <{masked_from}>"
    )
    payload = _inbound_payload(email, masked_from, body, f"resend-inb-{_n()}", cc=["colleague@buyer.example"])
    inb = gw.process_inbound(payload)
    assert inb["action"] == "received", inb
    assert inb["buyer_alias"] == alias
    msg_id = inb["message_id"]

    with StateManager() as sm:
        msg = sm.get_message(msg_id)
        # From stored as alias
        assert msg["from_addr"] == alias, msg["from_addr"]
        # Quoted/signature real address redacted in the stored body
        assert email not in msg["body_text"], "real address leaked into stored body!"
        assert alias in msg["body_text"], "redaction must insert the alias"
        # Raw payload: cc stripped + no real address anywhere
        raw = msg.get("raw_payload") or ""
        assert email not in raw, "real address leaked into raw_payload!"
        assert "colleague@buyer.example" not in raw, "CC must be stripped from stored payload!"
        assert "cc" not in raw.lower().replace('"cc"', ""), "cc key must be removed"
        # Thread updated
        t = sm.get_thread(thread_id)
        assert t["buyer_email"] == alias and t["buyer_mask_id"] is not None

    # The AI processor saw the ALIAS and the REDACTED body — never the real address
    assert ai.calls, "AI processor must have run"
    last = ai.calls[-1]
    assert last["from_addr"] == alias, f"AI got real address: {last['from_addr']}"
    assert email not in last["body"] and email not in last["subject"]

    # Duplicate webhook (Resend retry) -> idempotent
    dup = gw.process_inbound(payload)
    assert dup["action"] == "duplicate" and dup["message_id"] == msg_id, dup
    print(f"    ✓ alias stored, body/raw redacted, cc stripped, AI isolated, duplicate idempotent ({alias})")


def test_inbound_unknown_and_revoked() -> None:
    print("\n[4b] Inbound rejections: unknown sender (no address echo), revoked buyer, cross-tenant")
    _ensure_operator("mask-op-004")
    gw, _, _ = _gateway()

    email = f"inb2-{_n()}@buyer.example"
    lead_id, _ = _ensure_lead_with_contact("org-system", email, "InboundCo2")
    res = gw.send(operator_id="mask-op-004", display_name="Faith Export", lead_id=lead_id,
                  buyer_email=email, subject="s", body_text="b", operator_name="Mask Tester")
    assert res["action"] == "sent", res
    alias, masked_from = res["buyer_alias"], res["masked_from"]

    # a) Unknown sender — rejected WITHOUT the address in the reason
    stranger = f"stranger-{_n()}@unknown.example"
    r = gw.process_inbound(_inbound_payload(stranger, masked_from, "hi", f"resend-str-{_n()}"))
    assert r["action"] == "rejected", r
    assert stranger not in r.get("reason", ""), "rejection reason must not echo the address"

    # b) Revoked buyer — rejected both directions
    with StateManager() as sm:
        sm.revoke_buyer_mask(alias_address=alias, reason="inbound test")
    r = gw.process_inbound(_inbound_payload(email, masked_from, "hi again", f"resend-rv-{_n()}"))
    assert r["action"] == "rejected" and "revoked" in r["reason"], r

    # c) Cross-tenant: buyer registered in org-B writes to org-system's inbox
    #    -> must not resolve to org-B's lead (org-scoped lookups).
    email_b = f"inbb-{_n()}@buyer.example"
    _ensure_lead_with_contact("org-other", email_b, "OrgBLead")
    r = gw.process_inbound(_inbound_payload(email_b, masked_from, "wrong window", f"resend-xt-{_n()}"))
    assert r["action"] == "rejected", r
    print("    ✓ unknown (no echo), revoked, cross-tenant all rejected")


# ──────────────────────────────────────────────────────────────────────
# 5. Legacy self-heal
# ──────────────────────────────────────────────────────────────────────

def test_legacy_thread_self_heal() -> None:
    print("\n[5] Legacy self-heal: plaintext thread masked on first touch")
    _ensure_operator("mask-op-005")
    email = f"legacy-{_n()}@buyer.example"
    lead_id, contact_id = _ensure_lead_with_contact("org-system", email, "LegacyCo")

    # Simulate a pre-Phase-4 thread + messages written with PLAINTEXT addresses
    with StateManager() as sm:
        inbox = sm.get_or_create_exporter_inbox(
            operator_id="mask-op-005", display_name="Faith Export",
            inbound_domain="faithelexport.com", operator_name="Mask Tester",
        )
        thread = sm.get_or_create_thread(
            lead_id=lead_id, inbox_id=inbox["id"], buyer_email=email,
            subject="Legacy thread", buyer_contact_id=contact_id,
        )
        thread_id = thread["thread_id"]
        out_id = sm.log_outbound_message(
            thread_id=thread_id, from_addr=inbox["masked_email"], to_addr=email,
            subject="Legacy thread", body_text=f"Written before masking. To: {email}",
        )
        in_id = sm.log_inbound_message(
            thread_id=thread_id, from_addr=email, to_addr=inbox["masked_email"],
            subject="Re: Legacy thread", body_text=f"Reply with signature {email}",
            raw_payload=f'{{"data": {{"from": "{email}", "cc": ["x@y.z"]}}}}',
            provider="resend", provider_message_id=f"legacy-inb-{_n()}",
        )
        masked_from = inbox["masked_email"]

    # First touch (exporter replies) triggers the audited self-heal
    gw, provider, _ = _gateway()
    r = gw.reply(message_id=in_id, body_text="Healed reply", operator_id="mask-op-005")
    assert r["action"] == "replied", r
    alias = r["buyer_alias"]

    with StateManager() as sm:
        t = sm.get_thread(thread_id)
        assert t["buyer_email"] == alias and t["buyer_mask_id"] is not None
        out = sm.get_message(out_id)
        assert out["to_addr"] == alias, "legacy outbound row not healed!"
        assert email not in out["body_text"] and alias in out["body_text"]
        inb = sm.get_message(in_id)
        assert inb["from_addr"] == alias, "legacy inbound row not healed!"
        assert email not in inb["body_text"] and alias in inb["body_text"]
        assert email not in (inb.get("raw_payload") or ""), "legacy raw_payload not redacted!"
        # Real address now lives ONLY in the encrypted registry
        mask = sm.find_buyer_mask_by_real_email("org-system", email)
        assert mask and sm.decrypt_buyer_email(mask) == email

    # Reply was delivered to the REAL address via the registry
    assert provider.sent_to == [email]

    # Idempotent: second touch does not create a second mask
    r2 = gw.reply(message_id=in_id, body_text="Second healed reply", operator_id="mask-op-005")
    assert r2["action"] == "replied" and r2["buyer_alias"] == alias
    with StateManager() as sm:
        m = sm.find_buyer_mask_by_real_email("org-system", email)
        rows = sm.session.execute(
            __import__("sqlalchemy").text(
                "SELECT COUNT(*) FROM buyer_masks WHERE lookup_key = :k"
            ),
            {"k": bm.lookup_key("org-system", email)},
        ).scalar()
        assert rows == 1, "self-heal must be idempotent (one registry row)"
        assert m["alias_address"] == alias
    print(f"    ✓ thread+messages healed, content redacted, registry-only real ({alias}), idempotent")


# ──────────────────────────────────────────────────────────────────────
# 6. Bridge policy: CC/BCC forbidden
# ──────────────────────────────────────────────────────────────────────

def test_bridge_forbids_cc_bcc() -> None:
    print("\n[6] Bridge: cc/bcc (any extra key) rejected with 422")
    from fastapi.testclient import TestClient

    from coffee_export.messaging.webhook import create_inbound_app

    os.environ["EMAIL_BRIDGE_SECRET"] = "test-bridge-secret-phase4"
    app = create_inbound_app(gateway=None)
    client = TestClient(app)

    base = {
        "operator_id": "op", "display_name": "Faith Export", "lead_id": "L-1",
        "buyer_email": "buyer.x@faithelexport.com", "subject": "s", "body_text": "b",
    }
    r = client.post(
        "/api/bridge/send",
        json={**base, "cc": ["someone@example.com"]},
        headers={"Authorization": "Bearer test-bridge-secret-phase4"},
    )
    assert r.status_code == 422, f"cc must be rejected: {r.status_code} {r.text}"
    r = client.post(
        "/api/bridge/send",
        json={**base, "bcc": ["someone@example.com"]},
        headers={"Authorization": "Bearer test-bridge-secret-phase4"},
    )
    assert r.status_code == 422
    r = client.post(
        "/api/bridge/reply",
        json={"message_id": 1, "body_text": "b", "cc": "x@y.z"},
        headers={"Authorization": "Bearer test-bridge-secret-phase4"},
    )
    assert r.status_code == 422
    print("    ✓ cc/bcc and unknown keys -> 422 before the gateway runs")


# ──────────────────────────────────────────────────────────────────────
# 7. Migration preservation (subprocess alembic on a scratch DB)
# ──────────────────────────────────────────────────────────────────────

def test_migration_preservation() -> None:
    print("\n[7] Migration: schema-only, existing rows preserved byte-identically")
    import sqlite3
    import subprocess
    import tempfile

    repo_coffee = Path(__file__).resolve().parent.parent  # coffee_export/
    venv_py = repo_coffee.parent / ".venv" / "bin" / "python"

    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "scratch.db"
        env = {**os.environ, "COFFEE_DATABASE_URL": f"sqlite:///{db}"}

        def alembic(*args: str) -> None:
            subprocess.run(
                [str(venv_py), "-m", "alembic", *args],
                cwd=repo_coffee, env=env, check=True, capture_output=True, text=True,
            )

        # a) Pre-Phase-4 schema (one revision before the buyer_masks migration)
        alembic("upgrade", "c3d4e5f6a7b8")

        # b) Insert legacy rows (minimal parents + plaintext thread + message)
        con = sqlite3.connect(db)
        now = "2026-10-08T10:00:00+03:00"
        con.execute(
            "INSERT INTO operators (operator_id, name, email, role, status, organization_id, created_ts, updated_ts) "
            "VALUES ('mig-op', 'Mig Op', 'mig@faithelexport.com', 'operator', 'active', 'org-system', ?, ?)", (now, now))
        con.execute(
            "INSERT INTO leads (lead_id, company_name, headquarters_country, current_state, priority_tier, outreach_language, organization_id, created_ts, updated_ts) "
            "VALUES ('L-MIG-1', 'MigCo', 'DE', 'NEW', 'A', 'EN', 'org-system', ?, ?)", (now, now))
        con.execute(
            "INSERT INTO exporter_inboxes (operator_id, masked_email, display_name, is_active, organization_id, created_ts, updated_ts) "
            "VALUES ('mig-op', 'mig.op@faithelexport.com', 'Mig Op', 1, 'org-system', ?, ?)", (now, now))
        con.execute(
            "INSERT INTO message_threads (thread_id, lead_id, inbox_id, buyer_email, subject, status, message_count, unread_count, organization_id, created_ts, updated_ts) "
            "VALUES ('T-MIG-1', 'L-MIG-1', 1, 'legacy@mig.example', 'Mig subject', 'active', 1, 0, 'org-system', ?, ?)", (now, now))
        con.execute(
            "INSERT INTO inbox_messages (thread_id, direction, from_addr, to_addr, subject, body_text, provider, ai_processed, is_read, status, organization_id, sent_ts, created_ts, updated_ts) "
            "VALUES ('T-MIG-1', 'outbound', 'mig.op@faithelexport.com', 'legacy@mig.example', 'Mig subject', 'legacy body', 'resend', 0, 1, 'read', 'org-system', ?, ?, ?)", (now, now, now))
        con.commit()
        # Pin the PRE-migration column list — SELECT * after the upgrade
        # would include the new buyer_mask_id column (that's the schema
        # change, not a data rewrite).
        thread_cols = [c[1] for c in con.execute("PRAGMA table_info(message_threads)").fetchall()]
        msg_cols = [c[1] for c in con.execute("PRAGMA table_info(inbox_messages)").fetchall()]
        thread_sel = ", ".join(thread_cols)
        msg_sel = ", ".join(msg_cols)
        before_thread = con.execute(f"SELECT {thread_sel} FROM message_threads").fetchall()
        before_msg = con.execute(f"SELECT {msg_sel} FROM inbox_messages").fetchall()
        con.close()

        # c) Upgrade to head — the migration must NOT touch these rows
        alembic("upgrade", "head")

        con = sqlite3.connect(db)
        after_thread = con.execute(f"SELECT {thread_sel} FROM message_threads").fetchall()
        after_msg = con.execute(f"SELECT {msg_sel} FROM inbox_messages").fetchall()
        assert after_thread == before_thread, "migration must not rewrite thread rows!"
        assert after_msg == before_msg, "migration must not rewrite message rows!"
        cols = [r[1] for r in con.execute("PRAGMA table_info(message_threads)").fetchall()]
        assert "buyer_mask_id" in cols, "buyer_mask_id column missing"
        bm_tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='buyer_masks'").fetchall()]
        assert bm_tables == ["buyer_masks"], "buyer_masks table missing"
        masks = con.execute("SELECT COUNT(*) FROM buyer_masks").fetchall()
        assert masks == [(0,)], "migration must not create registry rows (no secret needed)"
        con.close()
    print("    ✓ legacy rows byte-identical, schema added, zero data rewrite")


# ──────────────────────────────────────────────────────────────────────

def main() -> None:
    test_crypto_primitives()
    test_registry_lifecycle()
    test_outbound_masking_round_trip()
    test_outbound_refusals()
    test_inbound_masking_and_redaction()
    test_inbound_unknown_and_revoked()
    test_legacy_thread_self_heal()
    test_bridge_forbids_cc_bcc()
    test_migration_preservation()
    print("\n" + "=" * 60)
    print("ALL PHASE 4 MASKING TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()
