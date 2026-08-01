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

import hashlib
import hmac
import json
import os
import uuid
from typing import Any

import requests

from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


RESEND_API_URL = "https://api.resend.com/emails"


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

    def verify_webhook_signature(
        self, raw_body: bytes | str, signature_header: str
    ) -> bool:
        """
        Verify the Resend webhook signature.

        Resend sends header `svix-signature` (or sometimes `resend-signature`)
        containing one or more space-separated `v1,xxxx` tokens. Each token is
        `v1,{hmac_sha256_hex}` computed over the raw request body using
        RESEND_WEBHOOK_SECRET as the key.

        Returns True if any token matches.
        """
        if not self.webhook_secret:
            log.warning(
                "RESEND_WEBHOOK_SECRET not set - webhook signature verification "
                "is DISABLED. This is insecure for production."
            )
            return True  # Permissive in dev. Fail loud in prod by setting the secret.

        if isinstance(raw_body, str):
            raw_body_bytes = raw_body.encode("utf-8")
        else:
            raw_body_bytes = raw_body

        # Parse the signature header. Format: "v1,abc123 v1,def456"
        tokens = [t.strip() for t in signature_header.split() if t.strip()]
        if not tokens:
            return False

        expected = hmac.new(
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
            if hmac.compare_digest(signature, expected):
                return True

        return False

    # ──────────────────────────────────────────────────────────────
    # INBOUND - payload parsing
    # ──────────────────────────────────────────────────────────────

    def parse_inbound_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Normalize a Resend inbound webhook payload into our standard shape.

        Returns a dict with stable keys regardless of provider quirks:
            from_addr, to_addr, subject, body_text, body_html,
            reply_to, provider_message_id, in_reply_to, received_ts
        """
        data = payload.get("data", payload) if isinstance(payload, dict) else {}

        from_addr = data.get("from") or data.get("sender") or ""
        to_addr = data.get("to") or ""
        if isinstance(to_addr, list):
            to_addr = to_addr[0] if to_addr else ""
        # Strip display name: "John <john@x.com>" -> "john@x.com"
        if "<" in from_addr and ">" in from_addr:
            from_addr = from_addr.split("<", 1)[1].split(">", 1)[0].strip()
        if "<" in to_addr and ">" in to_addr:
            to_addr = to_addr.split("<", 1)[1].split(">", 1)[0].strip()

        subject = data.get("subject") or "(no subject)"
        body_text = data.get("text") or data.get("body_plain") or ""
        body_html = data.get("html") or data.get("body_html") or ""
        reply_to = data.get("reply_to") or None
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
