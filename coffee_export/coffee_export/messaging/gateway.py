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

Masked email pattern (professional, non-revealing):
    "Marcus Bell" -> marcus.bell@faithelexport.com
    The buyer sees only this address - looks like a real sales rep at
    Faith Export. The exporter's real email is NEVER exposed.

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
          1. Get-or-create the exporter's masked inbox (local part derived
             from operator_name -> e.g. "Marcus Bell" -> marcus.bell@faithelexport.com).
          2. Get-or-create the message thread for this (lead x inbox).
          3. Send via ResendEmailProvider (from = masked_email, reply_to = masked_email).
          4. Log via StateManager.log_outbound_message().
          5. Publish MESSAGE_SENT event.

        The buyer sees only the masked address. The exporter's real email
        is NEVER exposed.
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

        # 2. Thread
        thread = self.sm.get_or_create_thread(
            lead_id=lead_id,
            inbox_id=inbox["id"],
            buyer_email=buyer_email,
            subject=subject,
            buyer_contact_id=buyer_contact_id,
            organization_id=organization_id,
        )
        thread_id = thread["thread_id"]
        is_new_thread = thread["message_count"] == 0

        # 3. Send via provider
        result = self.provider.send_email(
            from_addr=f"{display_name} <{masked_from}>",
            to_addr=buyer_email,
            subject=subject,
            text_body=body_text,
            html_body=body_html,
            reply_to=masked_from,
            in_reply_to_message_id=in_reply_to_message_id,
        )

        if not result.get("success"):
            log.error(
                f"EmailGateway.send() FAILED: lead={lead_id} buyer={buyer_email} "
                f"error={result.get('error')}"
            )
            return {
                "action": "send_failed",
                "lead_id": lead_id,
                "thread_id": thread_id,
                "error": result.get("error"),
                "dry_run": result.get("dry_run", False),
            }

        # 4. Log
        message_id = self.sm.log_outbound_message(
            thread_id=thread_id,
            from_addr=masked_from,
            to_addr=buyer_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            reply_to=masked_from,
            provider=self.provider.name,
            provider_message_id=result.get("provider_message_id"),
            in_reply_to=in_reply_to_message_id,
            organization_id=organization_id,
        )

        # 5. Events
        self.bus.publish(
            event_type=MESSAGE_SENT,
            entity_type="inbox_message",
            entity_id=str(message_id),
            payload={
                "message_id": message_id,
                "thread_id": thread_id,
                "lead_id": lead_id,
                "masked_from": masked_from,
                "buyer_email": buyer_email,
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
            f"from={masked_from} -> {buyer_email} subject={subject!r}"
        )

        return {
            "action": "sent",
            "message_id": message_id,
            "thread_id": thread_id,
            "masked_from": masked_from,
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
          2. Look up the inbox by masked `to_addr`.
          3. Find the lead for this buyer email:
             - first, find a thread with this buyer_email on this inbox
             - if none, find a lead_contact with this email
             - if none, reject (unknown buyer)
          4. Get-or-create thread.
          5. Log inbound message (status='new', ai_processed=0).
          6. Run GLM triage + structured extraction -> update_message_ai_fields.
          7. Publish MESSAGE_RECEIVED + MESSAGE_PROCESSED.
        """
        # 1. Parse
        parsed = self.provider.parse_inbound_payload(raw_payload)
        from_addr = parsed["from_addr"]
        to_addr = parsed["to_addr"]
        subject = parsed["subject"]
        body_text = parsed["body_text"]
        body_html = parsed["body_html"]
        provider_message_id = parsed["provider_message_id"]
        in_reply_to = parsed["in_reply_to"]
        received_ts = parsed["received_ts"]

        if not from_addr or not to_addr:
            log.warning(f"Inbound payload missing addresses: from={from_addr} to={to_addr}")
            return {"action": "rejected", "reason": "missing addresses"}

        # 1b. Idempotency: Resend retries webhook deliveries on non-2xx and
        # timeouts. If we already stored this provider message, return the
        # existing row instead of double-storing (no duplicate side effects).
        if provider_message_id:
            existing = self.sm.find_inbound_by_provider_message_id(provider_message_id)
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

        # 2. Inbox lookup
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

        # 3. Find the lead for this buyer email — SCOPED to the inbox's org
        lead_id, buyer_contact_id = self._resolve_buyer(
            inbox["id"], from_addr, inbox_org
        )
        if not lead_id:
            log.warning(
                f"Inbound email from unknown buyer: {from_addr} -> {to_addr}. "
                f"No matching thread or lead_contact in org {inbox_org}."
            )
            return {
                "action": "rejected",
                "reason": f"unknown buyer: {from_addr}",
                "inbox_id": inbox["id"],
            }

        # 4. Thread (reuse existing or open new) — org attributed from inbox
        thread = self.sm.get_or_create_thread(
            lead_id=lead_id,
            inbox_id=inbox["id"],
            buyer_email=from_addr,
            subject=subject,
            buyer_contact_id=buyer_contact_id,
            organization_id=inbox_org,
        )
        thread_id = thread["thread_id"]

        # 5. Log inbound message (raw_payload stored as JSON for audit)
        message_id = self.sm.log_inbound_message(
            thread_id=thread_id,
            from_addr=from_addr,
            to_addr=to_addr,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            reply_to=parsed["reply_to"],
            provider=self.provider.name,
            provider_message_id=provider_message_id,
            in_reply_to=in_reply_to,
            raw_payload=json.dumps(raw_payload)[:10000] if raw_payload else None,
            received_ts=received_ts,
            organization_id=inbox_org,
        )

        # 6. GLM triage (classify + summarize + translate + structured extraction)
        ai_result = self.ai.process(subject=subject, from_addr=from_addr, body=body_text)
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
        )

        # 7. Events
        self.bus.publish(
            event_type=MESSAGE_RECEIVED,
            entity_type="inbox_message",
            entity_id=str(message_id),
            payload={
                "message_id": message_id,
                "thread_id": thread_id,
                "lead_id": lead_id,
                "inbox_id": inbox["id"],
                "from_addr": from_addr,
                "subject": subject,
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
            f"from={from_addr}"
        )

        return {
            "action": "received",
            "message_id": message_id,
            "thread_id": thread_id,
            "lead_id": lead_id,
            "inbox_id": inbox["id"],
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

        The reply goes out from the same masked address, to the same buyer,
        on the same thread. The buyer never sees the exporter's real email.

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

        # Use the inbound message's subject with "Re:" prefix if not already
        subject = msg["subject"]
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        result = self.provider.send_email(
            from_addr=f"{inbox['display_name']} <{inbox['masked_email']}>",
            to_addr=thread["buyer_email"],
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

        # Log outbound reply — org attributed to the thread's tenant
        reply_org = (
            organization_id
            or thread.get("organization_id")
            or inbox.get("organization_id")
            or "org-system"
        )
        outbound_id = self.sm.log_outbound_message(
            thread_id=thread["thread_id"],
            from_addr=inbox["masked_email"],
            to_addr=thread["buyer_email"],
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            reply_to=inbox["masked_email"],
            provider=self.provider.name,
            provider_message_id=result.get("provider_message_id"),
            in_reply_to=msg.get("provider_message_id"),
            organization_id=reply_org,
        )

        # Mark the inbound as "replied"
        self.sm.mark_message_status(message_id, "replied")

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
            f"thread={thread['thread_id']}"
        )

        return {
            "action": "replied",
            "outbound_message_id": outbound_id,
            "in_reply_to_message_id": message_id,
            "thread_id": thread["thread_id"],
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

    def _resolve_buyer(
        self, inbox_id: int, buyer_email: str, organization_id: str | None = None
    ) -> tuple[str | None, int | None]:
        """
        Find the (lead_id, buyer_contact_id) for a buyer email on this inbox.

        Tries in order:
          1. Existing open thread with this buyer_email on this inbox.
          2. LeadContact with this email — scoped to organization_id when
             given, so org-A's inbox can never resolve to org-B's lead even
             when both orgs track the same real-world buyer.
        Returns (None, None) if not found.
        """
        # 1. Existing thread
        threads = self.sm.list_threads_for_inbox(inbox_id, include_closed=False)
        for t in threads:
            if (t.get("buyer_email") or "").lower() == buyer_email.lower():
                return t["lead_id"], t.get("buyer_contact_id")

        # 2. LeadContact lookup (tenant-scoped)
        from coffee_export.database.models import LeadContact

        stmt = select(LeadContact).where(LeadContact.email == buyer_email)
        if organization_id is not None:
            stmt = stmt.where(LeadContact.organization_id == organization_id)
        row = self.sm.session.execute(
            stmt.order_by(LeadContact.id.desc()).limit(1)
        ).scalar_one_or_none()
        if row:
            # Defense in depth: the contact's lead must also be in the org.
            if organization_id is not None and not self._lead_in_org(
                row.lead_id, organization_id
            ):
                log.warning(
                    f"_resolve_buyer: contact {row.id} points at lead "
                    f"{row.lead_id} outside org {organization_id} — refusing"
                )
                return None, None
            return row.lead_id, row.id

        return None, None
