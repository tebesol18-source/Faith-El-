"""
EmailGateway - the orchestrator that ties everything together.

    Agent 3 / Dashboard
         | send() / reply()
    EmailGateway
         |
    ResendEmailProvider  -->  Buyer inbox
         ^
    Buyer replies  -->  Resend inbound webhook
         |
    EmailGateway.process_inbound()
         |
    MessageAIProcessor (GLM classify + summarize + translate + structured extraction)
         |
    StateManager.log_inbound_message + update_message_ai_fields
         |
    Exporter Dashboard inbox (chat bubble + AI banner + structured panel)

Masked email pattern — EXPORTER side (since Phase 2/3):
    "Marcus Bell" -> marcus.bell@faithelexport.com
    The buyer sees only this address. The exporter's real email is NEVER
    exposed.

Masked email pattern — BUYER side (Phase 4):
    Every buyer gets a platform alias: buyer.<12hex>@faithelexport.com,
    held in the buyer_masks registry (real address AES-256-GCM encrypted,
    deterministic HMAC lookup). The alias is the ONLY buyer identity that
    appears on ANY exporter-facing surface: threads, messages, events,
    logs, AI prompts, API payloads. The real address is decrypted
    transiently at the provider boundary (SMTP To:) and nowhere else.

    Outbound:  caller passes a verified lead contact address OR an alias ->
               gateway resolves the mask -> provider gets the real address
               -> everything stored/emitted carries the alias.
    Inbound:   webhook From: (real) -> HMAC lookup -> alias ->
               stored, redacted (quoted/signature content), AI-processed
               and displayed under the alias only.

    Fail-closed: without BUYER_MASK_SECRET the gateway refuses sends that
    need masking and rejects inbound processing — it never degrades to
    plaintext storage. See docs/buyer-masking.md for the honest limitations
    (the SMTP transport layer necessarily sees real addresses).

Architecture compliance:
    - Uses StateManager for ALL DB mutations.
    - Uses EventBus for cross-agent notifications.
    - Uses AIGateway for LLM calls (via MessageAIProcessor).
    - Never touches SessionLocal or ORM models directly.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select

from coffee_export.events import (
    EventBus,
    MESSAGE_PROCESSED,
    MESSAGE_RECEIVED,
    MESSAGE_REPLIED,
    MESSAGE_SENT,
    THREAD_OPENED,
)
from coffee_export.messaging import masking as buyer_masking
from coffee_export.messaging.ai_processor import MessageAIProcessor
from coffee_export.messaging.providers.resend import ResendEmailProvider
from coffee_export.state import StateManager
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


class EmailGateway:
    """Single entry point for sending / receiving / replying to masked emails."""

    def __init__(
        self,
        state_manager: StateManager | None = None,
        event_bus: EventBus | None = None,
        provider: ResendEmailProvider | None = None,
        ai_processor: MessageAIProcessor | None = None,
        inbound_domain: str | None = None,
    ) -> None:
        self.sm = state_manager or StateManager()
        self.bus = event_bus or EventBus()
        self.provider = provider or ResendEmailProvider(inbound_domain=inbound_domain)
        self.ai = ai_processor or MessageAIProcessor()
        self.inbound_domain = (
            inbound_domain or self.provider.inbound_domain or "faithelexport.com"
        )

    # =============================================================
    # OUTBOUND - Agent 3 calls this to send an email to a buyer
    # =============================================================

    def send(
        self,
        operator_id: str,
        display_name: str,
        lead_id: str,
        buyer_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
        buyer_contact_id: int | None = None,
        in_reply_to_message_id: str | None = None,
        operator_name: str | None = None,
        organization_id: str = "org-system",
    ) -> dict[str, Any]:
        """
        Send an outbound email from a masked exporter address to a buyer.

        Steps:
          0. Verify the lead belongs to the caller's organization (fail
             closed — a cross-tenant lead id must never be writable).
          1. Get-or-create the exporter's masked inbox.
          2. Resolve the buyer mask (Phase 4):
               - buyer_email may be a platform ALIAS (subsequent sends) or a
                 real address that must be a registered contact of this lead
                 in this org (first contact — the Phase 1 verified-contact
                 outreach gate, now enforced gateway-side too).
               - unknown / revoked / cross-tenant aliases are refused;
                 BUYER_MASK_SECRET missing is a hard refusal (fail closed).
          3. Get-or-create the message thread (stores the ALIAS + mask link).
          4. Send via ResendEmailProvider — the ONLY place the real address
             exists (from = masked_email, reply_to = masked_email).
          5. Log via StateManager.log_outbound_message() with the ALIAS.
          6. Publish MESSAGE_SENT event (alias only).

        The buyer sees only the masked exporter address; the exporter sees
        only the buyer's platform alias. Real buyer addresses never enter
        threads, messages, events, or logs.
        """
        # 0. Tenant fail-closed: the lead must exist in the caller's org.
        if not self._lead_in_org(lead_id, organization_id):
            log.warning(
                f"EmailGateway.send() REFUSED: lead {lead_id} not in org "
                f"{organization_id} — cross-tenant write blocked"
            )
            return {
                "action": "send_refused",
                "lead_id": lead_id,
                "thread_id": None,
                "error": f"lead {lead_id} does not belong to organization {organization_id}",
            }

        # 1. Inbox (uses operator_name to derive a professional-looking local part)
        inbox = self.sm.get_or_create_exporter_inbox(
            operator_id=operator_id,
            display_name=display_name,
            inbound_domain=self.inbound_domain,
            operator_name=operator_name,
            organization_id=organization_id,
        )
        masked_from = inbox["masked_email"]

        # 2. Resolve the buyer mask (alias <-> real address).
        resolved = self._resolve_outbound_recipient(
            lead_id=lead_id,
            buyer_email=buyer_email,
            organization_id=organization_id,
            buyer_contact_id=buyer_contact_id,
        )
        if not resolved["ok"]:
            log.warning(
                f"EmailGateway.send() REFUSED: lead={lead_id} "
                f"reason={resolved['error']} (buyer address withheld from log)"
            )
            return {
                "action": "send_refused",
                "lead_id": lead_id,
                "thread_id": None,
                "error": resolved["error"],
            }

        buyer_alias = resolved["alias"]
        real_to = resolved["real_to"]  # exists ONLY until the provider call below
        buyer_contact_id = resolved.get("buyer_contact_id") or buyer_contact_id

        # SR-1 (review finding 3): redact REGISTERED real addresses from
        # operator-authored content BEFORE it is stored, logged, published in
        # events, or handed to the provider. The recipient's own address is
        # registered (resolved above), so the buyer sees their platform alias
        # even in quoted text — consistent with the Phase 4 invariant.
        resolver = self.sm._mask_resolver(organization_id)
        subject = buyer_masking.redact_text(subject, resolver)
        body_text = buyer_masking.redact_text(body_text, resolver)
        if body_html:
            body_html = buyer_masking.redact_text(body_html, resolver)

        # 3. Thread (buyer_email = ALIAS; links the mask for inbound routing)
        thread = self.sm.get_or_create_thread(
            lead_id=lead_id,
            inbox_id=inbox["id"],
            buyer_email=buyer_alias,
            subject=subject,
            buyer_contact_id=buyer_contact_id,
            organization_id=organization_id,
            buyer_mask_id=resolved["buyer_mask_id"],
        )
        thread_id = thread["thread_id"]
        is_new_thread = thread["message_count"] == 0

        # 4. Send via provider — the single point where the real address
        #    is used. The provider never logs the recipient (Phase 4).
        result = self.provider.send_email(
            from_addr=f"{display_name} <{masked_from}>",
            to_addr=real_to,
            subject=subject,
            text_body=body_text,
            html_body=body_html,
            reply_to=masked_from,
            in_reply_to_message_id=in_reply_to_message_id,
        )

        if not result.get("success"):
            log.error(
                f"EmailGateway.send() FAILED: lead={lead_id} buyer={buyer_alias} "
                f"error={result.get('error')}"
            )
            return {
                "action": "send_failed",
                "lead_id": lead_id,
                "thread_id": thread_id,
                "error": result.get("error"),
                "dry_run": result.get("dry_run", False),
            }

        # 5. Log — the stored to_addr is the ALIAS, never the real address.
        message_id = self.sm.log_outbound_message(
            thread_id=thread_id,
            from_addr=masked_from,
            to_addr=buyer_alias,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            reply_to=masked_from,
            provider=self.provider.name,
            provider_message_id=result.get("provider_message_id"),
            in_reply_to=in_reply_to_message_id,
            organization_id=organization_id,
        )

        # 6. Events — payload carries the alias only.
        self.bus.publish(
            event_type=MESSAGE_SENT,
            entity_type="inbox_message",
            entity_id=str(message_id),
            payload={
                "message_id": message_id,
                "thread_id": thread_id,
                "lead_id": lead_id,
                "masked_from": masked_from,
                "buyer_alias": buyer_alias,
                "subject": subject,
                "provider_message_id": result.get("provider_message_id"),
                "dry_run": result.get("dry_run", False),
            },
            published_by="EmailGateway",
        )
        if is_new_thread:
            self.bus.publish(
                event_type=THREAD_OPENED,
                entity_type="message_thread",
                entity_id=thread_id,
                payload={
                    "thread_id": thread_id,
                    "lead_id": lead_id,
                    "inbox_id": inbox["id"],
                    "subject": subject,
                },
                published_by="EmailGateway",
            )

        log.info(
            f"EmailGateway sent: thread={thread_id} msg_id={message_id} "
            f"from={masked_from} -> {buyer_alias} subject={subject!r}"
        )

        return {
            "action": "sent",
            "message_id": message_id,
            "thread_id": thread_id,
            "masked_from": masked_from,
            "buyer_alias": buyer_alias,
            "provider_message_id": result.get("provider_message_id"),
            "dry_run": result.get("dry_run", False),
        }

    # =============================================================
    # INBOUND - webhook handler calls this when a buyer replies
    # =============================================================

    def process_inbound(self, raw_payload: dict[str, Any]) -> dict[str, Any]:
        """
        Process an inbound email webhook from Resend.

        Steps:
          1. Parse the provider payload (extract from/to/subject/body).
          2. Idempotency check on the provider message id (Resend retries).
          3. Look up the inbox by masked `to_addr` (unchanged, Phase 2).
          4. Resolve the buyer (Phase 4): the real From: address is resolved
             through the deterministic HMAC lookup to its mask. Unknown
             senders fall back to the org-scoped lead-contact lookup and are
             registered on first contact. REVOKED masks are rejected.
          5. Redact the content: registered real addresses inside the
             subject / body / quoted text are replaced with their aliases;
             CC/BCC keys are stripped from the stored raw payload.
          6. Get-or-create thread (stores the alias + mask link; legacy
             plaintext threads are self-healed, audited).
          7. Log inbound message with from_addr = ALIAS.
          8. GLM triage on the REDACTED body with the ALIAS as sender —
             the real address never reaches the LLM prompt.
          9. Publish MESSAGE_RECEIVED + MESSAGE_PROCESSED (alias only).
        """
        # 1. Parse
        parsed = self.provider.parse_inbound_payload(raw_payload)
        from_addr = parsed["from_addr"]          # real buyer address (transient)
        to_addr = parsed["to_addr"]              # exporter masked address
        subject = parsed["subject"]
        body_text = parsed["body_text"]
        body_html = parsed["body_html"]
        provider_message_id = parsed["provider_message_id"]
        in_reply_to = parsed["in_reply_to"]
        received_ts = parsed["received_ts"]

        if not from_addr or not to_addr:
            log.warning(
                f"Inbound payload missing addresses: from={'<missing>' if not from_addr else '<present>'} "
                f"to={'<missing>' if not to_addr else '<present>'}"
            )
            return {"action": "rejected", "reason": "missing addresses"}

        # 2. Inbox lookup — FIRST, because the tenant context of an inbound
        #    email is the INBOX's organization (the masked address belongs
        #    to exactly one exporter inbox). Every subsequent check,
        #    including idempotency, is scoped to that org (SR-1 finding 7:
        #    a provider message id from one org must never suppress
        #    another org's copy of a colliding id).
        inbox = self.sm.get_inbox_by_masked_email(to_addr)
        if not inbox or not inbox["is_active"]:
            log.warning(f"Inbound email to unknown/disabled inbox: {to_addr}")
            return {
                "action": "rejected",
                "reason": f"unknown inbox: {to_addr}",
            }

        # The tenant context of an inbound email is the INBOX's organization
        # (the masked address belongs to exactly one exporter inbox).
        inbox_org = inbox.get("organization_id") or "org-system"

        # 1b. Idempotency (org-scoped): Resend retries webhook deliveries on
        # non-2xx and timeouts. If we already stored this provider message
        # in THIS org, return the existing row instead of double-storing
        # (no duplicate side effects).
        if provider_message_id:
            existing = self.sm.find_inbound_by_provider_message_id(
                provider_message_id, organization_id=inbox_org
            )
            if existing:
                log.info(
                    f"Inbound webhook duplicate ignored: provider_message_id="
                    f"{provider_message_id} already stored as msg {existing['id']}"
                )
                return {
                    "action": "duplicate",
                    "message_id": existing["id"],
                    "thread_id": existing["thread_id"],
                    "duplicate_of": existing["id"],
                }

        # 3. Resolve the buyer through the mask registry (Phase 4).
        #    Fail closed when masking cannot operate.
        if not buyer_masking.masking_enabled():
            log.error(
                "BUYER_MASK_SECRET not set — inbound email REJECTED (fail "
                "closed: buyer addresses must never be stored in plaintext)."
            )
            return {
                "action": "rejected",
                "reason": "buyer masking unavailable (BUYER_MASK_SECRET not set)",
                "inbox_id": inbox["id"],
            }

        mask = self.sm.find_buyer_mask_by_real_email(inbox_org, from_addr)
        if mask and mask["status"] != "active":
            # Revoked buyer — reject BOTH directions. Log the ALIAS, never
            # the real address.
            log.warning(
                f"Inbound email from REVOKED buyer mask {mask['alias_address']} "
                f"-> {to_addr}: rejected (provider_message_id={provider_message_id})"
            )
            return {
                "action": "rejected",
                "reason": f"buyer address revoked: {mask['alias_address']}",
                "inbox_id": inbox["id"],
            }

        lead_id: str | None = None
        buyer_contact_id: int | None = None

        if mask:
            buyer_alias = mask["alias_address"]
            lead_id, buyer_contact_id = self._resolve_lead_for_mask(
                inbox["id"], mask, inbox_org
            )
            if not lead_id:
                # Mask exists (e.g. created via another inbox in the same
                # org) but no thread/provenance lead matched — fall back to
                # the org-scoped contact lookup.
                lead_id, buyer_contact_id = self._resolve_buyer_contact(
                    from_addr, inbox_org
                )
            if not lead_id:
                log.warning(
                    f"Inbound email from masked buyer {buyer_alias} -> {to_addr}: "
                    f"no lead resolves in org {inbox_org} "
                    f"(provider_message_id={provider_message_id})"
                )
                return {
                    "action": "rejected",
                    "reason": "buyer not resolvable to a lead in this organization",
                    "inbox_id": inbox["id"],
                }
        else:
            # Unknown to the registry — fall back to the org-scoped contact
            # lookup (a buyer replying from an address we never registered,
            # e.g. a second mailbox at the same company).
            lead_id, buyer_contact_id = self._resolve_buyer_contact(
                from_addr, inbox_org
            )
            if not lead_id:
                # Unknown buyer — reject WITHOUT echoing the real address
                # into logs or the response (Phase 4: addresses are never
                # logged; the provider message id identifies the webhook).
                log.warning(
                    f"Inbound email from unknown buyer -> {to_addr}: no matching "
                    f"mask or lead_contact in org {inbox_org} "
                    f"(provider_message_id={provider_message_id})"
                )
                return {
                    "action": "rejected",
                    "reason": "unknown buyer (address withheld — not registered to this organization)",
                    "inbox_id": inbox["id"],
                }
            mask = self.sm.get_or_create_buyer_mask(
                organization_id=inbox_org,
                real_email=from_addr,
                inbound_domain=self.inbound_domain,
                lead_id=lead_id,
                buyer_contact_id=buyer_contact_id,
                created_by="inbound:contact-lookup",
            )
            buyer_alias = mask["alias_address"]

        # 4. Redact content BEFORE storage (Phase 4): replace every
        #    registered real address found in subject / bodies / raw payload
        #    with its alias, and strip CC/BCC keys from the stored payload.
        resolver = self.sm._mask_resolver(inbox_org)
        subject_r = buyer_masking.redact_text(subject, resolver)
        body_text_r = buyer_masking.redact_text(body_text, resolver)
        body_html_r = (
            buyer_masking.redact_text(body_html, resolver) if body_html else None
        )
        raw_stored = None
        if raw_payload:
            cleaned = buyer_masking.strip_cc_bcc(raw_payload)
            # SR-1 (review finding 5): redact the FULL payload first, THEN
            # truncate — cutting first can split an address so the regex no
            # longer matches it, storing a partial real address forever.
            raw_stored = buyer_masking.redact_text(
                json.dumps(cleaned), resolver
            )[:10000]

        # 5. Thread (reuse existing or open new) — org attributed from inbox.
        #    buyer_email = ALIAS; legacy plaintext threads self-heal here.
        thread = self.sm.get_or_create_thread(
            lead_id=lead_id,
            inbox_id=inbox["id"],
            buyer_email=buyer_alias,
            subject=subject_r,
            buyer_contact_id=buyer_contact_id,
            organization_id=inbox_org,
            buyer_mask_id=mask["id"],
        )
        thread_id = thread["thread_id"]

        # 6. Log inbound message — from_addr is the ALIAS; the redacted
        #    raw payload keeps the audit trail without plaintext addresses.
        message_id = self.sm.log_inbound_message(
            thread_id=thread_id,
            from_addr=buyer_alias,
            to_addr=to_addr,
            subject=subject_r,
            body_text=body_text_r,
            body_html=body_html_r,
            reply_to=buyer_masking.redact_text(parsed["reply_to"], resolver)
            if parsed["reply_to"]
            else None,
            provider=self.provider.name,
            provider_message_id=provider_message_id,
            in_reply_to=in_reply_to,
            raw_payload=raw_stored,
            received_ts=received_ts,
            organization_id=inbox_org,
        )

        # 7. GLM triage — the LLM sees the ALIAS and the REDACTED body,
        #    never the buyer's real address.
        ai_result = self.ai.process(
            subject=subject_r, from_addr=buyer_alias, body=body_text_r
        )
        self.sm.update_message_ai_fields(
            message_id=message_id,
            summary=ai_result["summary"],
            classification=ai_result["classification"],
            intent=ai_result["intent"],
            translation=ai_result["translation"],
            language_detected=ai_result["language_detected"],
            cost_usd=ai_result["cost_usd"],
            provider=ai_result["provider"],
            extracted_data=ai_result.get("extracted_data"),
            # The message belongs to the owning INBOX's org, which may not
            # be this gateway process's default org — pass it explicitly.
            organization_id=inbox_org,
        )

        # 8. Events — alias only.
        self.bus.publish(
            event_type=MESSAGE_RECEIVED,
            entity_type="inbox_message",
            entity_id=str(message_id),
            payload={
                "message_id": message_id,
                "thread_id": thread_id,
                "lead_id": lead_id,
                "inbox_id": inbox["id"],
                "from_alias": buyer_alias,
                "subject": subject_r,
                "provider_message_id": provider_message_id,
            },
            published_by="EmailGateway",
        )
        self.bus.publish(
            event_type=MESSAGE_PROCESSED,
            entity_type="inbox_message",
            entity_id=str(message_id),
            payload={
                "message_id": message_id,
                "thread_id": thread_id,
                "lead_id": lead_id,
                "classification": ai_result["classification"],
                "intent": ai_result["intent"],
                "language_detected": ai_result["language_detected"],
                "llm_used": ai_result["llm_used"],
                "provider": ai_result["provider"],
                # Structured extraction payload (for downstream agents / CRM)
                "extracted_intent": ai_result.get("intent"),
                "extracted_volume_bags": ai_result.get("volume_bags"),
                "extracted_origin": ai_result.get("origin"),
                "extracted_grade": ai_result.get("grade"),
                "extracted_destination": ai_result.get("destination"),
                "extracted_incoterm": ai_result.get("incoterm"),
                "extracted_urgency": ai_result.get("urgency"),
                "extracted_next_action": ai_result.get("next_action"),
            },
            published_by="EmailGateway",
        )

        log.info(
            f"EmailGateway inbound processed: msg_id={message_id} thread={thread_id} "
            f"classification={ai_result['classification']} "
            f"intent={ai_result.get('intent')} "
            f"next_action={ai_result.get('next_action')} "
            f"from={buyer_alias}"
        )

        return {
            "action": "received",
            "message_id": message_id,
            "thread_id": thread_id,
            "lead_id": lead_id,
            "inbox_id": inbox["id"],
            "buyer_alias": buyer_alias,
            "classification": ai_result["classification"],
            "summary": ai_result["summary"],
            "intent": ai_result["intent"],
            "language_detected": ai_result["language_detected"],
            "llm_used": ai_result["llm_used"],
            # Structured extraction result
            "extracted": {
                "intent": ai_result.get("intent"),
                "volume_bags": ai_result.get("volume_bags"),
                "origin": ai_result.get("origin"),
                "grade": ai_result.get("grade"),
                "destination": ai_result.get("destination"),
                "incoterm": ai_result.get("incoterm"),
                "urgency": ai_result.get("urgency"),
                "next_action": ai_result.get("next_action"),
            },
        }

    # =============================================================
    # REPLY - exporter replies from dashboard inbox
    # =============================================================

    def reply(
        self,
        message_id: int,
        body_text: str,
        body_html: str | None = None,
        operator_id: str | None = None,
        organization_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Exporter replies to an inbound message from the dashboard.

        The reply goes out from the same masked address, to the same buyer
        (resolved through the buyer mask at the provider boundary only), on
        the same thread. Stored rows carry the alias. Legacy plaintext
        threads are self-healed (audited) on first touch.

        When organization_id is given, the inbound message AND its thread
        must belong to that org — otherwise the reply is refused (fail
        closed on cross-tenant ids).
        """
        msg = self.sm.get_message(message_id)
        if not msg:
            return {"action": "skipped", "reason": "message not found"}
        if msg["direction"] != "inbound":
            return {"action": "skipped", "reason": "can only reply to inbound messages"}

        # Tenant fail-closed: the message (and its thread) must be in the
        # caller's org. msg.get("organization_id") covers rows written
        # before org attribution existed (NULL / missing -> refuse when an
        # org is enforced).
        if organization_id is not None:
            msg_org = msg.get("organization_id")
            if msg_org != organization_id:
                log.warning(
                    f"EmailGateway.reply() REFUSED: message {message_id} belongs "
                    f"to org {msg_org!r}, caller org {organization_id}"
                )
                return {
                    "action": "reply_refused",
                    "reason": "message does not belong to caller's organization",
                }

        thread = self.sm.get_thread(msg["thread_id"])
        if not thread:
            return {"action": "skipped", "reason": "thread not found"}

        # Send via provider - from = masked (look up inbox), to = buyer
        inbox = self.sm.get_inbox_by_masked_email(
            msg["to_addr"]
        )  # to_addr of inbound = masked exporter address
        if not inbox:
            return {"action": "skipped", "reason": "inbox lookup failed"}

        # ── Phase 4: resolve the recipient through the mask registry ──
        if not buyer_masking.masking_enabled():
            log.error(
                "BUYER_MASK_SECRET not set — reply REFUSED (fail closed: "
                "buyer addresses must never be stored or sent unmasked)."
            )
            return {
                "action": "reply_refused",
                "reason": "buyer masking unavailable (BUYER_MASK_SECRET not set)",
            }

        thread_org = (
            organization_id
            or thread.get("organization_id")
            or inbox.get("organization_id")
            or "org-system"
        )
        thread_buyer = (thread.get("buyer_email") or "").strip().lower()

        if buyer_masking.is_platform_alias(thread_buyer, self.inbound_domain):
            healed = False
            mask = self.sm.find_buyer_mask_by_alias(thread_buyer)
            if not mask or mask["organization_id"] != thread_org:
                # SR-1 finding 6: unified error — unknown vs cross-tenant alias
                # must be indistinguishable to the caller (no existence
                # oracle). Internal log keeps the distinction.
                if mask:
                    log.warning(
                        f"EmailGateway.reply() REFUSED: alias {thread_buyer} "
                        f"belongs to org {mask['organization_id']}, thread org "
                        f"{thread_org} — cross-tenant reply blocked"
                    )
                return {
                    "action": "reply_refused",
                    "reason": "unknown or unauthorized buyer alias",
                }
            if mask["status"] != "active":
                return {
                    "action": "reply_refused",
                    "reason": f"buyer alias is {mask['status']} — sending blocked",
                }
        else:
            # Legacy plaintext thread — audited self-heal, then resolve.
            mask = self.sm.heal_thread_buyer_mask(
                thread["thread_id"], self.inbound_domain, created_by="reply:selfheal"
            )
            healed = True
            if not mask:
                return {
                    "action": "skipped",
                    "reason": "legacy thread could not be masked (unknown alias state)",
                }
            if mask["status"] != "active":
                return {
                    "action": "reply_refused",
                    "reason": f"buyer alias is {mask['status']} — sending blocked",
                }
            if mask["organization_id"] != thread_org:
                log.warning(
                    f"EmailGateway.reply() REFUSED: healed mask "
                    f"{mask['alias_address']} belongs to org "
                    f"{mask['organization_id']}, thread org {thread_org}"
                )
                return {
                    "action": "reply_refused",
                    "reason": "unknown or unauthorized buyer alias",
                }

        buyer_alias = mask["alias_address"]
        real_to = self.sm.decrypt_buyer_email(mask)  # provider boundary only

        # SR-1 (review finding 2b): the heal above REWROTE the original
        # message rows (subject/body redacted) AFTER `msg` was fetched —
        # re-fetch so the reply subject comes from the healed row, never
        # the stale pre-heal copy carrying the plaintext address.
        if healed:
            msg = self.sm.get_message(message_id) or msg

        # SR-1 (review finding 3): redact registered real addresses from the
        # operator-authored reply body before storage/events/provider (the
        # subject already comes from the healed/redacted inbound row).
        resolver = self.sm._mask_resolver(thread_org)
        body_text = buyer_masking.redact_text(body_text, resolver)
        if body_html:
            body_html = buyer_masking.redact_text(body_html, resolver)

        # Use the inbound message's subject with "Re:" prefix if not already
        subject = msg["subject"]
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        result = self.provider.send_email(
            from_addr=f"{inbox['display_name']} <{inbox['masked_email']}>",
            to_addr=real_to,
            subject=subject,
            text_body=body_text,
            html_body=body_html,
            reply_to=inbox["masked_email"],
            in_reply_to_message_id=msg.get("provider_message_id"),
        )

        if not result.get("success"):
            return {
                "action": "send_failed",
                "error": result.get("error"),
                "dry_run": result.get("dry_run", False),
            }

        # Log outbound reply — org attributed to the thread's tenant,
        # stored to_addr = ALIAS.
        reply_org = (
            organization_id
            or thread.get("organization_id")
            or inbox.get("organization_id")
            or "org-system"
        )
        outbound_id = self.sm.log_outbound_message(
            thread_id=thread["thread_id"],
            from_addr=inbox["masked_email"],
            to_addr=buyer_alias,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            reply_to=inbox["masked_email"],
            provider=self.provider.name,
            provider_message_id=result.get("provider_message_id"),
            in_reply_to=msg.get("provider_message_id"),
            organization_id=reply_org,
        )

        # Mark the inbound as "replied" (the message belongs to the
        # owning inbox's org — pass it explicitly).
        self.sm.mark_message_status(message_id, "replied", organization_id=reply_org)

        # Publish event
        self.bus.publish(
            event_type=MESSAGE_REPLIED,
            entity_type="inbox_message",
            entity_id=str(outbound_id),
            payload={
                "outbound_message_id": outbound_id,
                "in_reply_to_message_id": message_id,
                "thread_id": thread["thread_id"],
                "lead_id": thread["lead_id"],
                "operator_id": operator_id,
            },
            published_by="EmailGateway",
        )

        log.info(
            f"EmailGateway reply: outbound={outbound_id} in_reply_to={message_id} "
            f"thread={thread['thread_id']} -> {buyer_alias}"
        )

        return {
            "action": "replied",
            "outbound_message_id": outbound_id,
            "in_reply_to_message_id": message_id,
            "thread_id": thread["thread_id"],
            "buyer_alias": buyer_alias,
            "dry_run": result.get("dry_run", False),
        }

    # =============================================================
    # INTERNAL HELPERS
    # =============================================================

    def _lead_in_org(self, lead_id: str, organization_id: str) -> bool:
        """Fail-closed tenant check: does this lead exist in this org?"""
        from coffee_export.database.models import Lead

        row = self.sm.session.execute(
            select(Lead.lead_id).where(
                Lead.lead_id == lead_id,
                Lead.organization_id == organization_id,
            )
        ).scalar_one_or_none()
        return row is not None

    def _resolve_outbound_recipient(
        self,
        lead_id: str,
        buyer_email: str,
        organization_id: str,
        buyer_contact_id: int | None = None,
    ) -> dict[str, Any]:
        """
        Resolve who we are sending to, through the mask registry.

        Accepts EITHER:
          - a platform alias (buyer.<hex>@<inbound domain>): must exist in
            the registry, be ACTIVE, and belong to the caller's org. The
            client is NEVER trusted to map an alias itself — the registry
            decides.
          - a real address: must be a registered contact of this lead in
            this org (Phase 1 verified-contact outreach gate, enforced at
            the gateway as defense in depth). A mask is created on first
            contact.

        Returns {ok: True, alias, real_to, buyer_mask_id, buyer_contact_id}
        or {ok: False, error}. The real address never leaves this function
        except as real_to for the provider call.
        """
        email_norm = buyer_masking.normalize_email(buyer_email)
        if not email_norm or "@" not in email_norm:
            return {"ok": False, "error": "invalid buyer email"}

        if not buyer_masking.masking_enabled():
            return {
                "ok": False,
                "error": "BUYER_MASK_SECRET not set — buyer masking cannot "
                "operate (fail closed)",
            }

        if buyer_masking.is_platform_alias(email_norm, self.inbound_domain):
            mask = self.sm.find_buyer_mask_by_alias(email_norm)
            if not mask or mask["organization_id"] != organization_id:
                # SR-1 (review finding 6): unknown alias and cross-tenant
                # alias return the SAME caller-facing error — distinguishing
                # them would hand an attacker a tenant-existence oracle
                # (alias exists elsewhere vs not at all). The internal log
                # keeps the distinction for operators.
                if mask:
                    log.warning(
                        f"_resolve_outbound_recipient: alias {email_norm} not in "
                        f"org {organization_id} — cross-tenant send blocked"
                    )
                return {
                    "ok": False,
                    "error": "unknown or unauthorized buyer alias",
                }
            if mask["status"] != "active":
                return {
                    "ok": False,
                    "error": f"buyer alias is {mask['status']} — sending blocked",
                }
            return {
                "ok": True,
                "alias": mask["alias_address"],
                "real_to": self.sm.decrypt_buyer_email(mask),
                "buyer_mask_id": mask["id"],
                "buyer_contact_id": mask.get("buyer_contact_id") or buyer_contact_id,
            }

        # Real address path — identity gate: the address must be a
        # registered contact of THIS lead in THIS org. Arbitrary addresses
        # (and other orgs' contacts) are refused.
        contact = self._lead_contact_for_email(lead_id, email_norm, organization_id)
        if not contact:
            return {
                "ok": False,
                "error": "buyer email is not a registered contact of this lead "
                "(outreach gate: verified lead contacts only)",
            }

        mask = self.sm.get_or_create_buyer_mask(
            organization_id=organization_id,
            real_email=email_norm,
            inbound_domain=self.inbound_domain,
            lead_id=lead_id,
            buyer_contact_id=contact["id"],
            created_by=f"first_contact:{lead_id}",
        )
        if mask["status"] != "active":
            return {
                "ok": False,
                "error": f"buyer mask is {mask['status']} — sending blocked",
            }
        return {
            "ok": True,
            "alias": mask["alias_address"],
            "real_to": self.sm.decrypt_buyer_email(mask),
            "buyer_mask_id": mask["id"],
            "buyer_contact_id": contact["id"],
        }

    def _lead_contact_for_email(
        self, lead_id: str, email: str, organization_id: str
    ) -> dict[str, Any] | None:
        """The lead's own contact row for this address (org-scoped, not deleted)."""
        from coffee_export.database.models import LeadContact

        row = self.sm.session.execute(
            select(LeadContact)
            .where(
                LeadContact.lead_id == lead_id,
                LeadContact.email == email,
                LeadContact.organization_id == organization_id,
                LeadContact.deleted_ts.is_(None),
            )
            .limit(1)
        ).scalar_one_or_none()
        if not row:
            return None
        return {"id": row.id, "lead_id": row.lead_id, "email": row.email}

    def _resolve_buyer_contact(
        self, buyer_email: str, organization_id: str | None = None
    ) -> tuple[str | None, int | None]:
        """
        Find (lead_id, contact_id) for a real buyer email, org-scoped.

        Org-A's inbox can never resolve to org-B's lead even when both orgs
        track the same real-world buyer. Returns (None, None) if not found.
        """
        from coffee_export.database.models import LeadContact

        email_norm = buyer_masking.normalize_email(buyer_email)
        stmt = select(LeadContact).where(LeadContact.email == email_norm)
        if organization_id is not None:
            stmt = stmt.where(LeadContact.organization_id == organization_id)
        stmt = stmt.where(LeadContact.deleted_ts.is_(None))
        row = self.sm.session.execute(
            stmt.order_by(LeadContact.id.desc()).limit(1)
        ).scalar_one_or_none()
        if row:
            # Defense in depth: the contact's lead must also be in the org.
            if organization_id is not None and not self._lead_in_org(
                row.lead_id, organization_id
            ):
                log.warning(
                    f"_resolve_buyer_contact: contact {row.id} points at lead "
                    f"{row.lead_id} outside org {organization_id} — refusing"
                )
                return None, None
            return row.lead_id, row.id

        return None, None

    def _resolve_lead_for_mask(
        self, inbox_id: int, mask: dict[str, Any], inbox_org: str
    ) -> tuple[str | None, int | None]:
        """
        Find (lead_id, buyer_contact_id) for a resolved mask on this inbox.

        Order: (1) an open thread on this inbox already linked to the mask;
        (2) the mask's own provenance lead (must be in the inbox's org);
        (3) org-scoped contact lookup by the buyer's real address (passed
        by the caller — never logged).
        """
        # 1. Existing thread on this inbox linked to this mask
        threads = self.sm.list_threads_for_inbox(inbox_id, include_closed=True)
        for t in threads:
            if t.get("buyer_mask_id") == mask["id"]:
                return t["lead_id"], t.get("buyer_contact_id")

        # 2. Mask provenance
        mask_lead = mask.get("lead_id")
        if mask_lead and self._lead_in_org(mask_lead, inbox_org):
            return mask_lead, mask.get("buyer_contact_id")

        return None, None
