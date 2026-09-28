"""
Resend email provider - outbound send + inbound webhook signature verification.

Outbound:
    POST https://api.resend.com/emails
    Headers: Authorization: Bearer {RESEND_API_KEY}
    Body:    {"from": "...", "to": ["..."], "subject": "...",
              "html": "...", "text": "...", "reply_to": "...",
              "headers": {"In-Reply-To": "...", "References": "..."}}

Inbound:
    Resend Posts incoming emails to your webhook URL. Each request is signed
    with an HMAC-SHA256 of the raw body using RESEND_WEBHOOK_SECRET.
    Verify before trusting.

Configuration (env vars):
    RESEND_API_KEY         - secret API key for outbound
    RESEND_WEBHOOK_SECRET  - shared secret for verifying inbound webhooks
    INBOUND_EMAIL_DOMAIN   - e.g. faithelexport.com (used for masked addresses)

If RESEND_API_KEY is missing, the gateway falls back to "dry-run" mode:
messages are stored in the database with provider_message_id="dry-run-..."
but never actually sent. This lets the system run end-to-end in dev/test
without a real Resend account.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Any

import requests

from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


RESEND_API_URL = "https://api.resend.com/emails"

# How old a signed webhook timestamp may be before we treat it as a replay
# (Svix scheme carries t=<unix seconds>). Resend retries within minutes, so
# 5 minutes is generous; anything older is rejected.
WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60


class ResendEmailProvider:
    """Resend API client - outbound send + inbound signature verification."""

    name = "resend"

    def __init__(
        self,
        api_key: str | None = None,
        webhook_secret: str | None = None,
        inbound_domain: str | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("RESEND_API_KEY", "")
        self.webhook_secret = webhook_secret or os.environ.get(
            "RESEND_WEBHOOK_SECRET", ""
        )
        self.inbound_domain = (
            inbound_domain
            or os.environ.get("INBOUND_EMAIL_DOMAIN", "faithelexport.com")
        ).lower()

        self.dry_run = not bool(self.api_key)
        if self.dry_run:
            log.warning(
                "ResendEmailProvider in DRY-RUN mode (RESEND_API_KEY not set). "
                "Messages will be stored but NOT actually sent."
            )

    # ──────────────────────────────────────────────────────────────
    # OUTBOUND
    # ──────────────────────────────────────────────────────────────

    def send_email(
        self,
        from_addr: str,
        to_addr: str,
        subject: str,
        text_body: str,
        html_body: str | None = None,
        reply_to: str | None = None,
        in_reply_to_message_id: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """
        Send an email via Resend.

        Returns dict with:
            success: bool
            provider_message_id: str | None  (Resend's email id, or dry-run id)
            error: str | None
        """
        if self.dry_run:
            dry_id = f"dry-run-{uuid.uuid4().hex[:12]}"
            log.info(
                f"[DRY-RUN] email not sent: from={from_addr} to={to_addr} "
                f"subject={subject!r} -> fake id={dry_id}"
            )
            return {
                "success": True,
                "provider_message_id": dry_id,
                "error": None,
                "dry_run": True,
            }

        payload: dict[str, Any] = {
            "from": from_addr,
            "to": [to_addr],
            "subject": subject,
            "text": text_body,
        }
        if html_body:
            payload["html"] = html_body
        if reply_to:
            payload["reply_to"] = reply_to

        headers: dict[str, str] = {}
        if in_reply_to_message_id:
            # Threading headers - Gmail / Outlook will visually group these
            headers["In-Reply-To"] = f"<{in_reply_to_message_id}>"
            headers["References"] = f"<{in_reply_to_message_id}>"
        if extra_headers:
            headers.update(extra_headers)
        if headers:
            payload["headers"] = headers

        try:
            resp = requests.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                data=json.dumps(payload),
                timeout=30,
            )
        except requests.RequestException as exc:
            log.error(f"Resend API request failed: {exc}")
            return {
                "success": False,
                "provider_message_id": None,
                "error": str(exc),
                "dry_run": False,
            }

        if resp.status_code >= 400:
            err = f"HTTP {resp.status_code}: {resp.text[:300]}"
            log.error(f"Resend API error: {err}")
            return {
                "success": False,
                "provider_message_id": None,
                "error": err,
                "dry_run": False,
            }

        try:
            data = resp.json()
        except ValueError:
            data = {}

        msg_id = data.get("id") or data.get("data", {}).get("id") or ""

        log.info(
            f"Resend accepted email: id={msg_id} from={from_addr} -> {to_addr} "
            f"subject={subject!r}"
        )

        return {
            "success": True,
            "provider_message_id": msg_id,
            "error": None,
            "dry_run": False,
        }

    # ──────────────────────────────────────────────────────────────
    # INBOUND - webhook signature verification
    # ──────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_svix_signature_header(header: str) -> tuple[int | None, list[str]]:
        """
        Parse Resend's Svix signature header.

        Real format (https://resend.com/docs/dashboard/webhooks/verify):
            svix-signature: t=1700000000,v1=<base64sig>,v1=<base64sig2>

        Returns (timestamp, [signatures]). Legacy format
        ("v1,<hex>" space-separated, used by dev/test fixtures) yields
        (None, []).
        """
        timestamp: int | None = None
        signatures: list[str] = []
        for part in header.split(","):
            part = part.strip()
            if part.startswith("t="):
                with contextlib.suppress(ValueError):
                    timestamp = int(part[2:])
            elif part.startswith("v1="):
                signatures.append(part[3:])
        return timestamp, signatures

    def verify_webhook_signature(
        self,
        raw_body: bytes | str,
        signature_header: str,
        svix_id: str | None = None,
        svix_timestamp: str | None = None,
        enforce_timestamp: bool = True,
    ) -> bool:
        """
        Verify the Resend webhook signature — the provider's REAL scheme.

        Resend signs with Svix: the signed content is
            "{svix-id}.{svix-timestamp}.{raw_body}"
        HMAC-SHA256 with the webhook signing secret ("whsec_..."; the key is
        base64-decoded after stripping the prefix), base64-encoded output,
        sent as `svix-signature: t=<ts>,v1=<sig>`.

        Also accepted (dev/test fixtures only): the legacy scheme this code
        used before Phase 2 — plain hex HMAC over the raw body with the raw
        secret, header "v1,<hex>" — so existing local tests keep passing.

        Replay protection: when the Svix timestamp is present and older than
        WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS, the request is rejected.

        Returns True if any v1 signature matches. When RESEND_WEBHOOK_SECRET
        is not set, requests are REJECTED unless the explicit dev override
        EMAIL_ALLOW_UNSIGNED_WEBHOOKS=1 is set (fail closed in production).
        """
        if not self.webhook_secret:
            if os.environ.get("EMAIL_ALLOW_UNSIGNED_WEBHOOKS", "").strip() == "1":
                log.warning(
                    "RESEND_WEBHOOK_SECRET not set and EMAIL_ALLOW_UNSIGNED_WEBHOOKS=1 "
                    "— accepting UNSIGNED webhook (development override, never "
                    "use in production)."
                )
                return True
            log.error(
                "RESEND_WEBHOOK_SECRET not set — rejecting webhook (fail closed). "
                "Set RESEND_WEBHOOK_SECRET (Resend dashboard → Webhooks) or, for "
                "local development only, EMAIL_ALLOW_UNSIGNED_WEBHOOKS=1."
            )
            return False

        if isinstance(raw_body, str):
            raw_body_bytes = raw_body.encode("utf-8")
        else:
            raw_body_bytes = raw_body

        if not signature_header:
            return False

        # ── Scheme 1: real Resend/Svix (t=...,v1=...) ──
        ts_from_header, svix_sigs = self._parse_svix_signature_header(signature_header)
        if svix_sigs:
            # Timestamp: explicit param wins, then the header's t= value
            ts_value = svix_timestamp or (str(ts_from_header) if ts_from_header else "")
            msg_id = svix_id or ""

            # Key: strip whsec_ prefix, base64-decode. If decoding fails
            # (secret configured as raw string), fall back to raw bytes.
            secret = self.webhook_secret
            if secret.startswith("whsec_"):
                secret = secret[len("whsec_"):]
            try:
                key = base64.b64decode(secret)
            except Exception:  # noqa: BLE001 - not base64; use raw bytes
                key = secret.encode("utf-8")

            signed_content = f"{msg_id}.{ts_value}.".encode("utf-8") + raw_body_bytes
            expected = base64.b64encode(
                hmac.new(key=key, msg=signed_content, digestmod=hashlib.sha256).digest()
            ).decode("ascii")

            for sig in svix_sigs:
                if hmac.compare_digest(sig, expected):
                    # Signature valid — now enforce the replay window.
                    ts = svix_timestamp or ts_from_header
                    if enforce_timestamp and ts is not None:
                        age = abs(int(time.time()) - int(ts))
                        if age > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS:
                            log.warning(
                                f"Webhook timestamp outside tolerance ({age}s old) "
                                "— possible replay, rejected."
                            )
                            return False
                    return True
            return False

        # ── Scheme 2: legacy dev/test scheme ("v1,<hex>" over raw body) ──
        tokens = [t.strip() for t in signature_header.split() if t.strip()]
        if not tokens:
            return False

        expected_hex = hmac.new(
            key=self.webhook_secret.encode("utf-8"),
            msg=raw_body_bytes,
            digestmod=hashlib.sha256,
        ).hexdigest()

        for token in tokens:
            parts = token.split(",", 1)
            if len(parts) != 2:
                continue
            version, signature = parts[0], parts[1]
            if version != "v1":
                continue
            if hmac.compare_digest(signature, expected_hex):
                return True

        return False

    # ──────────────────────────────────────────────────────────────
    # INBOUND - payload parsing
    # ──────────────────────────────────────────────────────────────

    def parse_inbound_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Normalize a Resend inbound webhook payload into our standard shape.

        Handles BOTH payload shapes:
          - Real Resend `email.inbound` event:
              {"type": "email.inbound", "data": {"email": {"from": ..., "to": [...],
                "subject": ..., "text": ..., "html": ..., "message_id": ...}}}
            where `from` may be an object {"email": ..., "name": ...} and `to`
            may be a list of such objects.
          - Legacy/dev shape: {"data": {"from": "...", "to": ["..."], ...}}

        Returns a dict with stable keys regardless of provider quirks:
            from_addr, to_addr, subject, body_text, body_html,
            reply_to, provider_message_id, in_reply_to, received_ts
        """
        data = payload.get("data", payload) if isinstance(payload, dict) else {}
        # Real Resend inbound nests the email under data.email
        email_obj = data.get("email") if isinstance(data, dict) else None
        if isinstance(email_obj, dict):
            data = email_obj

        def _addr(value: Any) -> str:
            """'x@y.com' | {'email': 'x@y.com', ...} | ['x@y.com'] | [{'email': ...}] -> 'x@y.com'"""
            if isinstance(value, list):
                value = value[0] if value else ""
            if isinstance(value, dict):
                value = value.get("email") or value.get("address") or ""
            return str(value or "")

        from_addr = _addr(data.get("from") or data.get("sender") or "")
        to_addr = _addr(data.get("to") or "")
        # Strip display name: "John <john@x.com>" -> "john@x.com"
        if "<" in from_addr and ">" in from_addr:
            from_addr = from_addr.split("<", 1)[1].split(">", 1)[0].strip()
        if "<" in to_addr and ">" in to_addr:
            to_addr = to_addr.split("<", 1)[1].split(">", 1)[0].strip()

        subject = data.get("subject") or "(no subject)"
        body_text = data.get("text") or data.get("body_plain") or ""
        body_html = data.get("html") or data.get("body_html") or ""
        reply_to = _addr(data.get("reply_to")) or None
        provider_message_id = (
            data.get("message_id") or data.get("id") or data.get("email_id") or ""
        )
        in_reply_to = data.get("in_reply_to") or None
        received_ts = data.get("received_at") or data.get("created_at") or None

        return {
            "from_addr": from_addr.lower().strip(),
            "to_addr": to_addr.lower().strip(),
            "subject": subject.strip(),
            "body_text": body_text.strip(),
            "body_html": body_html or None,
            "reply_to": reply_to,
            "provider_message_id": provider_message_id or None,
            "in_reply_to": in_reply_to or None,
            "received_ts": received_ts,
        }
