"""
Agent 3 — Outreach & Qualification Specialist.

Consumes LEAD_ENRICHED events from Agent 2, runs outreach sequences
(LinkedIn-first or email-first), enforces the Q1-Q5 QUAL gate, and
publishes LEAD_QUALIFIED events for Agent 4.

RESPONSIBILITIES
----------------
  1. Consume LEAD_ENRICHED events → start outreach sequence
  2. Draft outreach messages per step (LinkedIn connection, DM, email, etc.)
  3. Advance sequence steps (max 6 touches over 18 business days)
  4. Log each touch to outreach_touches table
  5. Detect buyer replies (positive, negative, neutral)
  6. Enforce Q1-Q5 QUAL gate when buyer responds positively
  7. On QUAL pass → transition to QUALIFIED, publish LEAD_QUALIFIED
  8. On ghost (no response after 6 touches) → GHOSTED
  9. On negative response → NURTURE

QUAL GATE (all 5 must be confirmed in writing):
  Q1: Volume band (≥1 FCL/year of Ethiopian or comparable East African origin)
  Q2: Segment fit (importer, trader, or roaster buying ≥25 bags/lot)
  Q3: Authority (buyer, head of coffee, sourcing lead, or founder)
  Q4: Timing (sourcing in next 1-6 months)
  Q5: Sample policy (agrees to pay shipping or accept pre-paid against interest)

SEQUENCE TYPES:
  Sequence A (LinkedIn-first): default for specialty/mid-tier importers
    Step 1: LinkedIn connection request (250 chars, VP-matched, no pitch)
    Step 2: LinkedIn DM (4 lines, one insight + one question)
    Step 3: Email (reference LinkedIn thread, 6 lines, CTA: 20-min call)
    Step 4: LinkedIn comment on prospect's post (organic touch)
    Step 5: Email #2 (new angle, same VP, proof attached, CTA: call)
    Step 6: LinkedIn DM close (graceful exit, move to nurture)

  Sequence B (Email-first): for large commercial importers or no-LinkedIn leads
    Step 1: Email #1 (subject: Ethiopian FOB program, 8 lines, CTA: 15-min call)
    Step 2: Email #2 (forward of #1, add FOB sheet)
    Step 3: LinkedIn connection (to same contact + senior colleague)
    Step 4: Email #3 (breakup email)
    Step 5: Nurture

USAGE
-----
    from coffee_export.agents.agent3_outreach import Agent3

    # Event-driven run (process LEAD_ENRICHED events)
    result = run_agent(Agent3())

    # Draft a specific step for a lead
    agent = Agent3()
    message = agent.draft_outreach_message(lead_id="L-2026-00047", step=2)

    # Record a buyer reply and check QUAL gate
    result = agent.record_buyer_reply(
        lead_id="L-2026-00047",
        reply_type="positive",
        reply_content="Yes, we're sourcing 25/26. Send us your lot list.",
    )
"""

from __future__ import annotations

import re
from datetime import timedelta, timezone
from typing import Any

from coffee_export.agents.base import BaseAgent, run_agent
from coffee_export.agents.registry import register_agent
from coffee_export.events import (
    LEAD_ENRICHED,
    LEAD_GHOSTED,
    LEAD_NURTURED,
    LEAD_QUALIFIED,
)
from coffee_export.state.constants import MAX_SEQUENCE_STEP
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))


# ── Sequence definitions ──
SEQUENCE_A_LINKEDIN_FIRST: list[dict[str, Any]] = [
    {
        "step": 1,
        "channel": "linkedin",
        "day_offset": 0,
        "description": "LinkedIn connection request (250 chars, VP-matched, no pitch)",
    },
    {
        "step": 2,
        "channel": "linkedin",
        "day_offset": 3,
        "description": "LinkedIn DM (4 lines, one insight + one soft question)",
    },
    {
        "step": 3,
        "channel": "email",
        "day_offset": 7,
        "description": "Email referencing LinkedIn thread (6 lines, CTA: 20-min call)",
    },
    {
        "step": 4,
        "channel": "linkedin",
        "day_offset": 12,
        "description": "LinkedIn comment on prospect's recent post (organic touch)",
    },
    {
        "step": 5,
        "channel": "email",
        "day_offset": 15,
        "description": "Email #2 (new angle, same VP, proof attached, CTA: call)",
    },
    {
        "step": 6,
        "channel": "linkedin",
        "day_offset": 18,
        "description": "LinkedIn DM close (graceful exit, move to nurture)",
    },
]

SEQUENCE_B_EMAIL_FIRST: list[dict[str, Any]] = [
    {
        "step": 1,
        "channel": "email",
        "day_offset": 0,
        "description": "Email #1 (subject: Ethiopian FOB program, 8 lines, CTA: 15-min call)",
    },
    {
        "step": 2,
        "channel": "email",
        "day_offset": 4,
        "description": "Email #2 (forward of #1, add FOB Djibouti sheet)",
    },
    {
        "step": 3,
        "channel": "linkedin",
        "day_offset": 9,
        "description": "LinkedIn connection to same contact + senior colleague",
    },
    {
        "step": 4,
        "channel": "email",
        "day_offset": 14,
        "description": "Email #3 (breakup email: 'closing the loop')",
    },
    {
        "step": 5,
        "channel": "email",
        "day_offset": 14,
        "description": "Nurture (move to NURTURE state)",
    },
]

# ── Large commercial importers (use Sequence B) ──
LARGE_COMMERCIAL_KEYWORDS: tuple[str, ...] = (
    "volcafe",
    "ecom",
    "olam",
    "sucafina",
    "neumann",
    "mercon",
    "starbucks",
    "nestle",
    "nespresso",
    "jacobs",
    "tchibo",
    "lavazza",
    "illy",
    "segafredo",
    "costa coffee",
)

# ── VP descriptions for message drafting ──
VP_DESCRIPTIONS: dict[str, str] = {
    "VP1": "Direct access to Yirgacheffe / Sidamo / Guji / Limu co-ops and washing stations — "
    "pre-shipment cupping, full traceability to station & lot, Q-grader verified 84–88+ scores",
    "VP2": "Farmgate pricing transparency, Rainforest Alliance / Fairtrade / organic options, "
    "EUDR-ready data pack with geo-coordinates per lot",
    "VP3": "Fixed-program FOB Djibouti or FOB Addis, 6–12 month forward pricing, ICC contract, "
    "full SCA documentation, 5–20 FCL/month with on-time shipment ≥95%",
    "VP4": "Reserved micro-lots 5–25 bags, single-washing-station, competition-grade 87–90+, "
    "pre-shipment samples with green grading + roast curves",
}

# ── QUAL gate questions ──
QUAL_QUESTIONS: dict[str, str] = {
    "Q1": "Volume band — do you buy or handle ≥1 FCL/year of Ethiopian or comparable East African origin?",
    "Q2": "Segment fit — are you an importer, trader, or roaster buying ≥25 bags/lot?",
    "Q3": "Authority — are you the buyer, head of coffee, sourcing lead, or founder?",
    "Q4": "Timing — are you sourcing for a current or next-crop cycle (next 1–6 months)?",
    "Q5": "Sample policy — do you agree to pay shipping on pre-shipment samples, "
    "or accept pre-paid against confirmed interest?",
}


class Agent3(BaseAgent):
    """Agent 3 — Outreach & Qualification Specialist."""

    agent_id = "Agent 3"
    description = "Outreach & Qualification — sequences, QUAL gate, LEAD_QUALIFIED events"

    def get_leads_to_process(self) -> list[dict[str, Any]]:
        """
        Consume pending LEAD_ENRICHED events from Agent 2.
        Also pick up leads in IN_SEQUENCE that are due for their next touch.
        """
        events = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=LEAD_ENRICHED,
            limit=50,
        )

        leads_from_events: list[dict[str, Any]] = []
        for event in events:
            payload = event.get("payload", {})
            lead_id = payload.get("lead_id")
            if lead_id:
                leads_from_events.append(
                    {
                        "lead_id": lead_id,
                        "event_id": event.get("id"),
                        "source": "LEAD_ENRICHED",
                        "payload": payload,
                    }
                )

        # Also get leads already IN_SEQUENCE that need their next step
        in_sequence_leads = self.sm.list_leads(state="IN_SEQUENCE", agent="Agent 3", limit=50)
        for lead in in_sequence_leads:
            # Check if this lead is due for a touch (simplified: always process)
            leads_from_events.append(
                {
                    "lead_id": lead["lead_id"],
                    "event_id": None,
                    "source": "IN_SEQUENCE",
                    "payload": lead,
                }
            )

        if leads_from_events:
            log.info(
                f"{self.agent_id} picked up {len(leads_from_events)} leads "
                f"({len(events)} from LEAD_ENRICHED, {len(in_sequence_leads)} from IN_SEQUENCE)"
            )

        return leads_from_events

    def process_lead(self, lead_data: dict[str, Any]) -> dict[str, Any]:
        """
        Process a lead: either start outreach (if just enriched) or advance sequence.
        """
        lead_id = lead_data["lead_id"]
        source = lead_data.get("source", "LEAD_ENRICHED")
        event_id = lead_data.get("event_id")

        # Mark the event as consumed if from LEAD_ENRICHED
        if event_id and source == "LEAD_ENRICHED":
            self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)

        lead = self.sm.get_lead(lead_id)
        if not lead:
            return {"action": "skipped", "reason": "lead not found"}

        current_state = lead["current_state"]

        # If lead is ENRICHED → transition to IN_SEQUENCE, start step 1
        if current_state == "ENRICHED":
            return self._start_outreach(lead)

        # If lead is IN_SEQUENCE → advance to next step
        if current_state == "IN_SEQUENCE":
            return self._advance_sequence(lead)

        # If lead is in any other state, skip
        return {
            "action": "skipped",
            "reason": f"lead in state {current_state} (not ENRICHED or IN_SEQUENCE)",
        }

    # =============================================================
    # OUTREACH SEQUENCE LOGIC
    # =============================================================

    def _start_outreach(self, lead: dict[str, Any]) -> dict[str, Any]:
        """Start outreach: transition ENRICHED → IN_SEQUENCE, send step 1."""
        lead_id = lead["lead_id"]

        # Transition to IN_SEQUENCE
        self.sm.update_lead_state(
            lead_id=lead_id,
            new_state="IN_SEQUENCE",
            agent=self.agent_id,
            notes="Outreach sequence started",
            current_agent=self.agent_id,
            sequence_step=0,
        )

        # Send step 1
        return self._send_step(lead, step_number=1)

    def _advance_sequence(self, lead: dict[str, Any]) -> dict[str, Any]:
        """Advance to the next sequence step. If at max, mark as GHOSTED."""
        lead_id = lead["lead_id"]
        current_step = lead.get("sequence_step", 0)

        if current_step >= MAX_SEQUENCE_STEP:
            # Sequence exhausted → GHOSTED
            self.sm.update_lead_state(
                lead_id=lead_id,
                new_state="GHOSTED",
                agent=self.agent_id,
                notes=f"Ghosted after {MAX_SEQUENCE_STEP} touches with no response",
            )
            self.bus.publish(
                event_type=LEAD_GHOSTED,
                entity_type="lead",
                entity_id=lead_id,
                payload={"lead_id": lead_id, "ghosted_count": lead.get("ghosted_count", 0) + 1},
                published_by=self.agent_id,
            )
            log.info(f"{self.agent_id} lead {lead_id} GHOSTED after {MAX_SEQUENCE_STEP} touches")
            return {"action": "ghosted", "lead_id": lead_id}

        next_step = current_step + 1
        return self._send_step(lead, step_number=next_step)

    def _send_step(self, lead: dict[str, Any], step_number: int) -> dict[str, Any]:
        """Send a specific outreach step. Logs via StateManager + stores memory.

        For email-channel steps, routes through EmailGateway so the email is
        sent from a masked exporter address (marcus.bell@faithelexport.com)
        and the buyer never sees the exporter's real email. Replies flow back
        through the platform -> GLM triage + structured extraction -> exporter
        dashboard inbox.

        For LinkedIn-channel steps, no real delivery is possible (LinkedIn has
        no marketing API). The touch is logged with channel='linkedin' and
        the operator is expected to manually copy the drafted message into
        Sales Navigator.
        """
        lead_id = lead["lead_id"]

        # Determine sequence type
        sequence = self._get_sequence(lead)

        # Find the step definition
        step_def = next((s for s in sequence if s["step"] == step_number), None)
        if not step_def:
            return {"action": "skipped", "reason": f"step {step_number} not found in sequence"}

        # Draft the message (using memory-aware drafting for steps > 1)
        if step_number > 1:
            message = self.draft_message_with_memory(lead_id, step_number)
        else:
            message = self.draft_outreach_message(lead_id, step_number)

        # ── Email channel: send through the Messaging Gateway ──────────
        send_result: dict[str, Any] = {}
        if step_def["channel"] == "email":
            send_result = self._send_email_via_gateway(
                lead=lead,
                subject=message.get("subject", f"Ethiopian coffee — {lead.get('company_name', '')}"),
                body_text=message.get("full_message", message.get("content_summary", "")),
            )

        # Log the touch via StateManager (always, regardless of channel)
        self._log_touch(
            lead_id=lead_id,
            step_number=step_number,
            channel=step_def["channel"],
            subject=message.get("subject", ""),
            content_summary=message.get("content_summary", ""),
        )

        # Store conversation memory for this outbound touch
        self._store_touch_memory(
            lead_id=lead_id,
            step=step_number,
            channel=step_def["channel"],
            message=message,
        )

        # Advance sequence step
        self.sm.advance_sequence_step(lead_id)

        log.info(
            f"{self.agent_id} lead {lead_id}: sent step {step_number}/{MAX_SEQUENCE_STEP} "
            f"({step_def['channel']})"
        )

        return {
            "action": "outreach_sent",
            "lead_id": lead_id,
            "step": step_number,
            "channel": step_def["channel"],
            "subject": message.get("subject", ""),
            "gateway": send_result,
        }

    def _send_email_via_gateway(
        self,
        lead: dict[str, Any],
        subject: str,
        body_text: str,
    ) -> dict[str, Any]:
        """Send an email step through the EmailGateway (masked sender)."""
        lead_id = lead["lead_id"]

        buyer_email = self._get_buyer_email(lead_id)
        if not buyer_email:
            log.warning(
                f"{self.agent_id} lead {lead_id}: no buyer email on file — "
                f"email step logged but NOT sent via gateway."
            )
            return {"action": "skipped", "reason": "no buyer email on lead_contacts"}

        operator_id = self._get_operator_id_for_lead(lead)
        operator_name = self._get_operator_name_for_lead(lead)
        display_name = "Faith Export — Sales"

        try:
            from coffee_export.messaging import EmailGateway

            gateway = EmailGateway()
            result = gateway.send(
                operator_id=operator_id,
                display_name=display_name,
                lead_id=lead_id,
                buyer_email=buyer_email,
                subject=subject,
                body_text=body_text,
                operator_name=operator_name,
            )
            return result
        except Exception as exc:  # noqa: BLE001
            log.exception(
                f"{self.agent_id} EmailGateway send failed for lead {lead_id}: {exc}"
            )
            return {"action": "send_failed", "error": str(exc)}

    def _get_buyer_email(self, lead_id: str) -> str | None:
        """Return the primary buyer contact email for a lead, or None."""
        from coffee_export.database.models import LeadContact
        from sqlalchemy import select

        row = self.sm.session.execute(
            select(LeadContact)
            .where(
                LeadContact.lead_id == lead_id,
                LeadContact.email.isnot(None),
                LeadContact.email != "",
            )
            .order_by(LeadContact.is_buyer.desc(), LeadContact.is_primary.desc())
            .limit(1)
        ).scalar_one_or_none()
        if row and row.email:
            return row.email.strip().lower()
        return None

    def _get_operator_id_for_lead(self, lead: dict[str, Any]) -> str:
        """Resolve which operator (exporter) is assigned to this lead.

        For now, returns a single default exporter operator ID. In
        production, this would consult a lead-assignment table.
        """
        return "exporter-001"

    def _get_operator_name_for_lead(self, lead: dict[str, Any]) -> str:
        """Return the operator's display name (used to derive masked email local part)."""
        try:
            from coffee_export.database.models import Operator
            from sqlalchemy import select as _sel

            row = self.sm.session.execute(
                _sel(Operator).where(Operator.operator_id == "exporter-001")
            ).scalar_one_or_none()
            if row and row.name:
                return row.name
        except Exception:  # noqa: BLE001
            pass
        return "Marcus Bell"

    def _get_sequence(self, lead: dict[str, Any]) -> list[dict[str, Any]]:
        """Determine which sequence to use (A=LinkedIn-first, B=Email-first)."""
        company_name = (lead.get("company_name") or "").lower()

        # Large commercial importers → Sequence B
        if any(kw in company_name for kw in LARGE_COMMERCIAL_KEYWORDS):
            return SEQUENCE_B_EMAIL_FIRST

        # Default → Sequence A
        return SEQUENCE_A_LINKEDIN_FIRST

    # =============================================================
    # MESSAGE DRAFTING
    # =============================================================

    def draft_outreach_message(self, lead_id: str, step: int) -> dict[str, str]:
        """
        Draft an outreach message for a specific step.

        Returns dict with: subject, content_summary, full_message (optional)
        """
        lead = self.sm.get_lead(lead_id)
        if not lead:
            return {"subject": "", "content_summary": "lead not found"}

        company = lead.get("company_name", "")
        vp = lead.get("recommended_vp", "VP1")
        language = lead.get("outreach_language", "EN")
        sequence = self._get_sequence(lead)

        step_def = next((s for s in sequence if s["step"] == step), None)
        if not step_def:
            return {"subject": "", "content_summary": f"step {step} not found"}

        channel = step_def["channel"]
        vp_desc = VP_DESCRIPTIONS.get(vp, VP_DESCRIPTIONS["VP1"])

        if channel == "linkedin" and step == 1:
            # Connection request — 250 chars max, no pitch
            subject = ""
            content_summary = f"LinkedIn connection request to {company}"
            full_message = (
                f"Hi — we supply direct-traded Yirgacheffe & Guji lots from washing "
                f"stations we work with year-round. Saw {company} posts on Ethiopian "
                f"origin — would value connecting."
            )[:250]
        elif channel == "linkedin" and step == 2:
            subject = ""
            content_summary = "LinkedIn DM with 25/26 spot arrival question"
            full_message = (
                "Quick one — are you working spot contracts on fresh 25/26 arrivals, "
                "or looking at 26/27 forward program? We just finalized station-level "
                "pricing on Guji washed lots. Want to flag it before public list."
            )
        elif channel == "email" and step == 3:
            subject = f"Following up on LinkedIn — Ethiopian {vp} ({company})"
            content_summary = "Email referencing LinkedIn, CTA: 20-min call"
            full_message = (
                f"Hi,\n\nFollowing up on our LinkedIn exchange. {vp_desc}.\n\n"
                f"We have 25/26 lots available now. Would you have 20 minutes this week "
                f"or next for a quick call?\n\nBest"
            )
        elif channel == "email" and step == 5:
            subject = f"Ethiopian 25/26 lot list — {vp} for {company}"
            content_summary = "Email #2 with lot list attached, CTA: call"
            full_message = (
                f"Hi,\n\nAdding our latest 25/26 lot list with cupping scores and EUDR "
                f"data packs. {vp_desc}.\n\nHappy to walk through any lot. Available for "
                f"a call this week?\n\nBest"
            )
        elif channel == "linkedin" and step == 6:
            subject = ""
            content_summary = "LinkedIn DM close — graceful exit"
            full_message = (
                "No problem if timing's off — I'll check back next crop cycle. "
                "Reply STOP if you'd rather I didn't."
            )
        elif channel == "email" and step == 1:  # Sequence B step 1
            subject = f"Ethiopian FOB program — {vp} for {company}"
            content_summary = "Email #1, 8 lines, CTA: 15-min call"
            full_message = (
                f"Hi,\n\n{vp_desc}.\n\nWe move 5-20 FCL/month with on-time shipment ≥95%. "
                f"ICC contract, full SCA documentation.\n\n"
                f"Would you have 15 minutes to discuss your 25/26 sourcing needs?\n\nBest"
            )
        elif channel == "email" and step == 2:  # Sequence B step 2
            subject = "Re: Ethiopian FOB program — FOB Djibouti sheet attached"
            content_summary = "Email #2 with FOB sheet, forward of #1"
            full_message = (
                f"Hi,\n\nAdding our latest FOB Djibouti sheet for {vp}. "
                f"Happy to walk through it.\n\nBest"
            )
        elif channel == "email" and step == 4:  # Sequence B step 4 (breakup)
            subject = f"Closing the loop — Ethiopian {vp}"
            content_summary = "Breakup email"
            full_message = (
                "Hi,\n\nClosing the loop — if sourcing is not current, I'll back off. "
                "If it is, reply with a 15-min slot.\n\nBest"
            )
        else:
            subject = ""
            content_summary = f"Step {step} ({channel})"
            full_message = f"[Outreach step {step} for {company}]"

        return {
            "subject": subject,
            "content_summary": content_summary,
            "full_message": full_message,
            "channel": channel,
            "language": language,
        }

    # =============================================================
    # BUYER REPLY HANDLING + QUAL GATE
    # =============================================================

    def record_buyer_reply(
        self,
        lead_id: str,
        reply_type: str,
        reply_content: str,
        touch_step: int | None = None,
    ) -> dict[str, Any]:
        """
        Record a buyer's reply and take appropriate action.

        Args:
            lead_id: The lead ID
            reply_type: "positive" | "negative" | "neutral" | "qualification_answer"
            reply_content: The buyer's verbatim reply
            touch_step: Which step the reply is responding to (optional)

        Returns a dict with action taken.
        """
        lead = self.sm.get_lead(lead_id)
        if not lead:
            return {"action": "skipped", "reason": "lead not found"}

        # Log the inbound touch via StateManager
        self._log_touch(
            lead_id=lead_id,
            step_number=touch_step or lead.get("sequence_step", 0),
            channel="email",
            direction="inbound",
            response_type=reply_type,
            response_content=reply_content,
        )

        # Store conversation memory for this inbound reply
        self._store_touch_memory(
            lead_id=lead_id,
            step=touch_step or lead.get("sequence_step", 0),
            channel="email",
            message={},
            response_type=reply_type,
            response_content=reply_content,
        )

        if reply_type == "positive":
            # Start qualification
            return self._start_qualification(lead_id, reply_content)

        if reply_type == "negative":
            # Move to nurture
            self.sm.update_lead_state(
                lead_id=lead_id,
                new_state="NURTURE",
                agent=self.agent_id,
                notes=f"Negative reply: {reply_content[:100]}",
            )
            self.bus.publish(
                event_type=LEAD_NURTURED,
                entity_type="lead",
                entity_id=lead_id,
                payload={"lead_id": lead_id, "reason": "negative_reply"},
                published_by=self.agent_id,
            )
            return {"action": "nurtured", "lead_id": lead_id, "reason": "negative reply"}

        if reply_type == "qualification_answer":
            # This is a Q1-Q5 answer — parse and store
            return self._process_qualification_answer(lead_id, reply_content)

        # Neutral reply — continue sequence
        return {"action": "continue_sequence", "lead_id": lead_id}

    def _start_qualification(self, lead_id: str, buyer_reply: str) -> dict[str, Any]:
        """Start the QUAL gate — send the qualification questions."""
        log.info(f"{self.agent_id} lead {lead_id}: positive reply, starting QUAL gate")

        # Send the qualification questions to the buyer
        # (In production, this would be an email/LinkedIn message)
        questions_message = self._build_qual_questions_message()

        self._log_touch(
            lead_id=lead_id,
            step_number=0,
            channel="email",
            direction="outbound",
            subject="Quick qualification questions before we send samples",
            content_summary="Q1-Q5 qualification questions sent",
        )

        return {
            "action": "qualification_started",
            "lead_id": lead_id,
            "questions_sent": list(QUAL_QUESTIONS.keys()),
            "message": questions_message,
        }

    def _process_qualification_answer(self, lead_id: str, answer_text: str) -> dict[str, Any]:
        """
        Process a buyer's answer to a QUAL question.

        Expects answer_text to contain the question ID (Q1-Q5) and the answer.
        Format: "Q1: yes, we buy 5 FCL/year" or similar.
        """
        # Parse which question is being answered
        question_id = None
        for qid in QUAL_QUESTIONS:
            if qid.lower() in answer_text.lower():
                question_id = qid
                break

        if not question_id:
            return {"action": "skipped", "reason": "no question ID found in answer"}

        # Determine if the answer is positive
        is_positive = self._evaluate_qual_answer(question_id, answer_text)

        # Store the answer
        self._store_qual_answer(
            lead_id=lead_id,
            question=question_id,
            answer=answer_text,
            is_positive=is_positive,
        )

        # Check if all 5 questions are answered positively
        qual_status = self._check_qual_gate(lead_id)

        if qual_status["all_passed"]:
            # QUAL gate passed → transition to QUALIFIED
            self.sm.update_lead_state(
                lead_id=lead_id,
                new_state="QUALIFIED",
                agent=self.agent_id,
                notes=f"QUAL gate passed: {qual_status['summary']}",
                current_agent="Agent 4",
                next_action_agent="Agent 4",
            )
            self.bus.publish(
                event_type=LEAD_QUALIFIED,
                entity_type="lead",
                entity_id=lead_id,
                payload={
                    "lead_id": lead_id,
                    "q1": qual_status["answers"].get("Q1", ""),
                    "q2": qual_status["answers"].get("Q2", ""),
                    "q3": qual_status["answers"].get("Q3", ""),
                    "q4": qual_status["answers"].get("Q4", ""),
                    "q5": qual_status["answers"].get("Q5", ""),
                },
                published_by=self.agent_id,
            )
            log.info(f"{self.agent_id} lead {lead_id} QUALIFIED (all Q1-Q5 passed)")
            return {
                "action": "qualified",
                "lead_id": lead_id,
                "qual_status": qual_status,
            }

        return {
            "action": "qualification_in_progress",
            "lead_id": lead_id,
            "qual_status": qual_status,
        }

    def _evaluate_qual_answer(self, question_id: str, answer_text: str) -> bool:
        """Determine if a QUAL answer is positive (passes the gate)."""
        answer_lower = answer_text.lower()

        # Simple positive/negative keyword detection
        positive_keywords = (
            "yes",
            "we do",
            "we are",
            "we buy",
            "we handle",
            "agree",
            "confirmed",
            "correct",
            "true",
            "1 fcl",
            "fcl",
            "sourcing",
        )

        has_positive = any(kw in answer_lower for kw in positive_keywords)
        # Use word-boundary check for "no" to avoid matching "now", "notes", etc.
        has_negative = bool(
            re.search(r"\b(no|not|don't|cannot|can't|refuse|never)\b", answer_lower)
        )

        # Q5 (sample policy) — check for willingness to pay
        if question_id == "Q5":
            pay_keywords = ("pay", "pre-paid", "prepaid", "agree", "willing", "account")
            return any(kw in answer_lower for kw in pay_keywords) or has_positive

        return has_positive and not has_negative

    def _store_qual_answer(
        self, lead_id: str, question: str, answer: str, is_positive: bool
    ) -> None:
        """Store a QUAL answer via StateManager — no direct DB access."""
        self.sm.store_qual_answer(
            lead_id=lead_id,
            question=question,
            answer=answer,
            is_positive=is_positive,
            answered_by=self.agent_id,
        )

    def _check_qual_gate(self, lead_id: str) -> dict[str, Any]:
        """Check if all 5 QUAL questions are answered positively. Uses StateManager."""
        return self.sm.check_qual_gate(lead_id)

    def _build_qual_questions_message(self) -> str:
        """Build the message containing the 5 qualification questions."""
        lines = ["Great to hear you're interested! Before we send samples, a few quick questions:"]
        for qid, question in QUAL_QUESTIONS.items():
            lines.append(f"\n{qid}: {question}")
        lines.append("\nOnce confirmed, we'll ship samples within 48 hours.")
        return "\n".join(lines)

    # =============================================================
    # TOUCH LOGGING
    # =============================================================

    def _log_touch(
        self,
        lead_id: str,
        step_number: int,
        channel: str,
        direction: str = "outbound",
        subject: str = "",
        content_summary: str = "",
        response_type: str | None = None,
        response_content: str | None = None,
    ) -> None:
        """Log an outreach touch via StateManager — no direct DB access."""
        self.sm.log_outreach_touch(
            lead_id=lead_id,
            step_number=step_number,
            channel=channel,
            direction=direction,
            subject=subject,
            content_summary=content_summary,
            response_type=response_type,
            response_content=response_content,
        )

    # =============================================================
    # MAINTENANCE METHODS
    # =============================================================

    def get_outreach_stats(self) -> dict[str, Any]:
        """Get outreach statistics via StateManager — no direct DB access."""
        return self.sm.get_outreach_stats()

    # =============================================================
    # CONVERSATION MEMORY (AI memory — remembers across touches)
    # =============================================================

    def remember(
        self,
        lead_id: str,
        memory_type: str,
        content: str,
        importance: int = 5,
    ) -> int:
        """
        Store a conversation memory for a lead.

        Memory types:
          - "conversation_summary": summary of a touch exchange
          - "buyer_preference": what the buyer likes/dislikes
          - "objection": a concern or objection raised
          - "qualification_signal": a QUAL-relevant signal
          - "context": general context about the relationship
          - "next_step": what to do next with this lead

        Importance (1-10): higher = more salient.

        This is what lets Agent 3 remember conversations rather than
        responding to each message in isolation.

        Returns the memory ID.
        """
        return self.sm.store_memory(
            lead_id=lead_id,
            memory_type=memory_type,
            content=content,
            source=self.agent_id,
            importance=importance,
        )

    def recall(
        self,
        lead_id: str,
        memory_type: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Retrieve conversation memories for a lead.

        Memories are ordered by importance (descending), then recency.
        Can filter by memory_type if specified.

        Used before drafting a message to include conversation context.
        """
        return self.sm.get_memories(
            lead_id=lead_id,
            memory_type=memory_type,
            limit=limit,
        )

    def get_conversation_context(self, lead_id: str) -> dict[str, Any]:
        """
        Build a full conversation context for a lead.

        Combines:
          - Lead details (company, VP, tier, state, sequence_step)
          - Conversation memories (importance-ordered)
          - Recent outreach touches (chronological)
          - QUAL gate status

        This is what Agent 3 uses to draft messages that reference
        past conversations rather than treating each message in isolation.
        """
        return self.sm.get_conversation_context(lead_id)

    def draft_message_with_memory(
        self,
        lead_id: str,
        step: int,
    ) -> dict[str, str]:
        """
        Draft an outreach message using conversation memory.

        Unlike draft_outreach_message() which generates a static template,
        this method:
          1. Retrieves conversation context (memories + touches)
          2. Generates a message that references past conversations
          3. Avoids repeating questions already asked
          4. Acknowledges previous responses

        Returns dict with: subject, content_summary, full_message, context_used
        """
        context = self.get_conversation_context(lead_id)
        if "error" in context:
            return {"subject": "", "content_summary": "lead not found", "full_message": ""}

        memories = context["memories"]
        touches = context["touches"]

        # Get the base template message
        base_message = self.draft_outreach_message(lead_id, step)
        base_full = base_message.get("full_message", "")

        # Build memory-aware message
        memory_context_parts: list[str] = []
        if memories:
            # Reference the most important memory
            top_memory = memories[0]
            if top_memory["memory_type"] == "buyer_preference":
                memory_context_parts.append(
                    f"(Note: buyer mentioned — {top_memory['content'][:80]})"
                )
            elif top_memory["memory_type"] == "objection":
                memory_context_parts.append(
                    f"(Note: buyer raised concern — {top_memory['content'][:80]})"
                )
            elif top_memory["memory_type"] == "conversation_summary":
                memory_context_parts.append(f"(Last exchange: {top_memory['content'][:80]})")

        # Check if buyer already responded — reference it
        inbound_touches = [t for t in touches if t.get("direction") == "inbound"]
        if inbound_touches and step > 1:
            last_response = inbound_touches[-1]
            memory_context_parts.append(
                f"(Buyer's last reply: {last_response.get('response_content', '')[:80]})"
            )

        # Build the final message
        if memory_context_parts:
            context_str = " | ".join(memory_context_parts)
            full_message = f"{base_full}\n\n[Context: {context_str}]"
        else:
            full_message = base_full

        return {
            "subject": base_message.get("subject", ""),
            "content_summary": base_message.get("content_summary", ""),
            "full_message": full_message,
            "channel": base_message.get("channel", ""),
            "language": base_message.get("language", "EN"),
            "context_used": {
                "memory_count": len(memories),
                "touch_count": len(touches),
                "has_inbound_replies": len(inbound_touches) > 0,
            },
        }

    def _store_touch_memory(
        self,
        lead_id: str,
        step: int,
        channel: str,
        message: dict[str, str],
        response_type: str | None = None,
        response_content: str | None = None,
    ) -> None:
        """
        After sending a touch or receiving a reply, store a memory.

        This is what builds the conversation memory over time — each
        interaction generates a memory that future messages can reference.
        """
        if response_type and response_content:
            # Inbound response — store as conversation summary
            self.remember(
                lead_id=lead_id,
                memory_type="conversation_summary",
                content=f"Step {step} ({channel}): buyer replied '{response_type}' — {response_content[:200]}",
                importance=7 if response_type == "positive" else 5,
            )

            # Detect objections
            if response_type == "negative":
                self.remember(
                    lead_id=lead_id,
                    memory_type="objection",
                    content=response_content[:300],
                    importance=8,
                )

            # Detect qualification signals
            qual_keywords = {
                "Q1": ["volume", "fcl", "containers", "bags per year"],
                "Q2": ["importer", "trader", "roaster", "broker"],
                "Q3": ["i am the", "i'm the", "my role", "head of", "buyer"],
                "Q4": ["sourcing", "looking for", "need", "crop"],
                "Q5": ["pay", "shipping", "sample cost", "willing"],
            }
            response_lower = response_content.lower()
            for qid, keywords in qual_keywords.items():
                if any(kw in response_lower for kw in keywords):
                    self.remember(
                        lead_id=lead_id,
                        memory_type="qualification_signal",
                        content=f"{qid} signal detected: {response_content[:200]}",
                        importance=7,
                    )
                    break
        else:
            # Outbound touch — store as conversation summary
            self.remember(
                lead_id=lead_id,
                memory_type="conversation_summary",
                content=f"Step {step} ({channel}): sent — {message.get('content_summary', '')[:200]}",
                importance=4,
            )

    def on_batch_complete(self, result: Any) -> None:
        """Log summary after batch completes."""
        if result.total > 0:
            log.info(
                f"{self.agent_id} batch complete: {result.processed} leads processed, "
                f"{result.failed} failed, {result.duration_seconds:.1f}s"
            )

    # =============================================================
    # LLM-POWERED METHODS (AI Gateway integration)
    # =============================================================

    def draft_message_with_llm(self, lead_id: str, step: int) -> dict[str, str]:
        """
        Draft an outreach message using LLM + conversation memory.

        Falls back to template-based draft_message_with_memory() if LLM fails.
        """
        from coffee_export.ai import AIGateway, llm_draft_outreach_message

        context = self.get_conversation_context(lead_id)
        if "error" in context:
            return {"full_message": "", "llm_used": False}

        # Get fallback template message
        fallback = self.draft_outreach_message(lead_id, step)

        sequence = self._get_sequence(context["lead"])
        step_def = next((s for s in sequence if s["step"] == step), {})
        channel = step_def.get("channel", "email")

        gateway = AIGateway()
        result = llm_draft_outreach_message(
            gateway=gateway,
            lead=context["lead"],
            step=step,
            channel=channel,
            memories=context["memories"],
            touches=context["touches"],
            fallback_message=fallback.get("full_message", ""),
        )

        if result.get("llm_used"):
            log.info(
                f"{self.agent_id} LLM drafted {channel} message for "
                f"{lead_id} step {step} ({result.get('provider', '?')})"
            )
        return result

    def evaluate_qual_with_llm(
        self, question_id: str, answer_text: str, fallback_positive: bool = False
    ) -> dict[str, Any]:
        """
        Evaluate a QUAL gate answer using LLM.

        Falls back to keyword-based _evaluate_qual_answer() if LLM fails.
        """
        from coffee_export.ai import AIGateway, llm_evaluate_qual_answer

        qual_questions = {
            "Q1": "Volume band — do you buy or handle \u22651 FCL/year of Ethiopian or comparable East African origin?",
            "Q2": "Segment fit — are you an importer, trader, or roaster buying \u226525 bags/lot?",
            "Q3": "Authority — are you the buyer, head of coffee, sourcing lead, or founder?",
            "Q4": "Timing — are you sourcing for a current or next-crop cycle (next 1\u20136 months)?",
            "Q5": "Sample policy — do you agree to pay shipping on pre-shipment samples?",
        }
        question_text = qual_questions.get(question_id, question_id)

        gateway = AIGateway()
        result = llm_evaluate_qual_answer(
            gateway=gateway,
            question_id=question_id,
            question_text=question_text,
            answer_text=answer_text,
            fallback_positive=fallback_positive,
        )

        if result.get("llm_used"):
            log.info(
                f"{self.agent_id} LLM evaluated {question_id}: "
                f"positive={result['is_positive']} ({result.get('provider', '?')})"
            )
        return result


# ═══════════════════════════════════════════════════════════════
# REGISTER THE AGENT
# ═══════════════════════════════════════════════════════════════

register_agent("Agent 3", Agent3)


# ═══════════════════════════════════════════════════════════════
# CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════


def run_agent3() -> Any:
    """Run Agent 3 in event-driven mode."""
    return run_agent(Agent3())


def run_agent3_stats() -> dict[str, Any]:
    """Get Agent 3 outreach statistics."""
    with Agent3() as agent:
        return agent.get_outreach_stats()
