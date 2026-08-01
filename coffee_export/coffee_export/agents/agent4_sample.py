"""
Agent 4 — Sample Management Specialist.

Owns the sample lifecycle: from receiving a QUALIFIED lead through
lot recommendation, sample dispatch, cupping score collection, and
the Approved/Rejected/Needs-another-sample decision.

ARCHITECTURE COMPLIANCE
-----------------------
Agent 4 only interacts with:
  ✅ StateManager — all database mutations
  ✅ EventBus — consume LEAD_QUALIFIED + LOT_CONFIRMED/FAILED,
     publish SAMPLE_REQUESTED, SAMPLE_DISPATCHED, SAMPLE_APPROVED, etc.
  ✅ TaskQueue — schedule sample reminders (Day +7/+10/+14/+18)
  ✅ Agent 1 (indirect) — via EventBus (SAMPLE_REQUESTED → LOT_CONFIRMED)

Agent 4 does NOT:
  ❌ Import SessionLocal or database.base directly
  ❌ Import SQLAlchemy models directly
  ❌ Execute raw SQL queries

RESPONSIBILITIES (9 total)
--------------------------
  1. Receive qualified buyer (consume LEAD_QUALIFIED)
  2. Recommend which coffee lot fits (9-step filter via StateManager)
  3. Request approval (publish SAMPLE_REQUESTED → Agent 1 confirms)
  4. Generate sample request (create record via StateManager)
  5. Print labels (generate label content)
  6. Track shipments (record carrier tracking via StateManager)
  7. Remind buyers (schedule via TaskQueue)
  8. Collect cupping scores (record via StateManager)
  9. Decide: Approved / Rejected / Needs another sample

EVENT FLOW
----------
  Agent 3 publishes LEAD_QUALIFIED
      ↓
  Agent 4 consumes → recommends lots → creates sample request
      ↓
  Agent 4 publishes SAMPLE_REQUESTED (with lot_ids)
      ↓
  Agent 1 consumes → confirms lots → publishes LOT_CONFIRMED/FAILED per lot
      ↓
  Agent 4 consumes LOT_CONFIRMED → dispatches sample
  Agent 4 consumes LOT_CONFIRMATION_FAILED → finds substitute or cancels
      ↓
  Agent 4 records shipment → publishes SAMPLE_DISPATCHED
      ↓
  (buyer cuppings samples)
      ↓
  Agent 4 records cupping score → publishes CUPPING_SCORE_RECEIVED
      ↓
  Agent 4 makes decision → publishes SAMPLE_APPROVED/REJECTED/NEEDS_ANOTHER
      ↓
  Agent 5 (Step 12) consumes SAMPLE_APPROVED → starts contract

USAGE
-----
    from coffee_export.agents.agent4_sample import Agent4

    # Event-driven run (process LEAD_QUALIFIED + LOT_CONFIRMED events)
    result = run_agent(Agent4())

    # Recommend lots for a lead
    agent = Agent4()
    lots = agent.recommend_lots(lead_id="L-2026-00047")

    # Dispatch a sample
    agent.dispatch_sample(sample_request_id="SR-2026-0001",
                         carrier="DHL", tracking="1234567890")

    # Record a cupping score
    agent.record_cupping(sample_request_id="SR-2026-0001", lot_id="LOT-25-0001",
                        total_score=86.5, ...)

    # Make a decision
    agent.make_decision(sample_request_id="SR-2026-0001", lot_id="LOT-25-0001",
                       decision="approved", buyer_target_fob=4.50, ...)
"""

from __future__ import annotations

from datetime import timedelta, timezone
from typing import Any

from coffee_export.agents.base import BaseAgent, run_agent
from coffee_export.agents.registry import register_agent
from coffee_export.events import (
    CUPPING_SCORE_RECEIVED,
    LEAD_QUALIFIED,
    LOT_CONFIRMATION_FAILED,
    LOT_CONFIRMED,
    SAMPLE_APPROVED,
    SAMPLE_DISPATCHED,
    SAMPLE_NEEDS_ANOTHER,
    SAMPLE_REJECTED,
    SAMPLE_REQUESTED,
)
from coffee_export.state.constants import EU_COUNTRIES, SAMPLE_QUANTITIES_GRAMS
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))

# Critical keywords that indicate rejection
REJECTION_KEYWORDS: tuple[str, ...] = (
    "musty",
    "fermented",
    "sour",
    "phenolic",
    "rio",
    "potato defect",
    "defective",
    "off",
    "not suitable",
)

# Critical score thresholds
SCORE_APPROVAL_THRESHOLD: float = 85.0
SCORE_REJECTION_THRESHOLD: float = 82.0
DEFECT_REJECTION_THRESHOLD: int = 15


class Agent4(BaseAgent):
    """Agent 4 — Sample Management Specialist."""

    agent_id = "Agent 4"
    description = "Sample Management — lot recommendation, dispatch, cupping, decision"

    def get_leads_to_process(self) -> list[dict[str, Any]]:
        """
        Consume events relevant to Agent 4:
          - LEAD_QUALIFIED (from Agent 3 → start sample process)
          - LOT_CONFIRMED (from Agent 1 → proceed with dispatch)
          - LOT_CONFIRMATION_FAILED (from Agent 1 → find substitute)
        """
        events: list[dict[str, Any]] = []

        # Consume LEAD_QUALIFIED events
        lead_events = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=LEAD_QUALIFIED,
            limit=20,
        )
        for e in lead_events:
            events.append({**e, "_event_category": "lead_qualified"})

        # Consume LOT_CONFIRMED events
        confirmed_events = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=LOT_CONFIRMED,
            limit=20,
        )
        for e in confirmed_events:
            events.append({**e, "_event_category": "lot_confirmed"})

        # Consume LOT_CONFIRMATION_FAILED events
        failed_events = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=LOT_CONFIRMATION_FAILED,
            limit=20,
        )
        for e in failed_events:
            events.append({**e, "_event_category": "lot_confirmation_failed"})

        if events:
            log.info(
                f"{self.agent_id} consumed {len(events)} events "
                f"({len(lead_events)} LEAD_QUALIFIED, "
                f"{len(confirmed_events)} LOT_CONFIRMED, "
                f"{len(failed_events)} LOT_CONFIRMATION_FAILED)"
            )

        return events

    def process_lead(self, event: dict[str, Any]) -> dict[str, Any]:
        """Process one event based on its category."""
        category = event.get("_event_category", "")
        event_id = event.get("id")
        payload = event.get("payload", {})

        try:
            if category == "lead_qualified":
                return self._handle_lead_qualified(event_id, payload)
            elif category == "lot_confirmed":
                return self._handle_lot_confirmed(event_id, payload)
            elif category == "lot_confirmation_failed":
                return self._handle_lot_confirmation_failed(event_id, payload)
            else:
                self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)
                return {"action": "skipped", "reason": f"unknown category: {category}"}
        except Exception as e:
            log.error(f"{self.agent_id} failed to process event {event_id}: {e}", exc_info=True)
            self.bus.mark_failed(event_id, self.agent_id, str(e))
            return {"action": "failed", "error": str(e)}

    # =============================================================
    # 1. RECEIVE QUALIFIED BUYER
    # =============================================================

    def _handle_lead_qualified(self, event_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle a LEAD_QUALIFIED event: recommend lots + create sample request."""
        lead_id = payload.get("lead_id", "")
        if not lead_id:
            self.bus.mark_consumed(event_id, self.agent_id)
            return {"action": "skipped", "reason": "no lead_id in payload"}

        lead = self.sm.get_lead(lead_id)
        if not lead:
            self.bus.mark_consumed(event_id, self.agent_id)
            return {"action": "skipped", "reason": f"lead {lead_id} not found"}

        # Transition lead to SAMPLE_DISPATCHED state (sample process started)
        self.sm.update_lead_state(
            lead_id=lead_id,
            new_state="SAMPLE_DISPATCHED",
            agent=self.agent_id,
            notes="Sample process started",
            current_agent=self.agent_id,
        )

        # Recommend lots
        destination_country = lead.get("headquarters_country", "")
        eudr_required = destination_country in EU_COUNTRIES
        lots = self.sm.recommend_lots_for_lead(
            lead_id=lead_id,
            crop_year="25/26",
            eudr_required=eudr_required,
            max_results=3,
        )

        if not lots:
            log.warning(f"{self.agent_id} no lots available for lead {lead_id}")
            self.bus.mark_consumed(event_id, self.agent_id)
            return {
                "action": "no_lots_available",
                "lead_id": lead_id,
                "reason": "No matching lots in current inventory",
            }

        # Create sample request
        sample_request_id = self.sm.create_sample_request(
            lead_id=lead_id,
            sample_type="350g",
            crop_year="25/26",
            buyer_company=lead.get("company_name", ""),
            buyer_destination_country=destination_country,
            buyer_language=lead.get("outreach_language", "EN"),
            shipping_arrangement="pre_paid",
        )

        # Add lots to the sample request
        lot_ids: list[str] = []
        for lot in lots:
            self.sm.add_lot_to_sample_request(
                sample_request_id=sample_request_id,
                lot_id=lot["lot_id"],
                quantity_grams=SAMPLE_QUANTITIES_GRAMS["350g"],
                confirmed=False,  # will be confirmed by Agent 1
            )
            lot_ids.append(lot["lot_id"])

        # Publish SAMPLE_REQUESTED (Agent 1 will confirm lots)
        self.bus.publish(
            event_type=SAMPLE_REQUESTED,
            entity_type="sample_request",
            entity_id=sample_request_id,
            payload={
                "sample_request_id": sample_request_id,
                "lead_id": lead_id,
                "buyer_company": lead.get("company_name", ""),
                "destination_country": destination_country,
                "sample_type": "350g",
                "crop_year": "25/26",
                "lot_ids": lot_ids,
            },
            published_by=self.agent_id,
        )

        # Mark event consumed
        self.bus.mark_consumed(event_id, self.agent_id)

        log.info(
            f"{self.agent_id} lead {lead_id}: created sample request "
            f"{sample_request_id} with {len(lot_ids)} lots, published SAMPLE_REQUESTED"
        )

        return {
            "action": "sample_requested",
            "lead_id": lead_id,
            "sample_request_id": sample_request_id,
            "lot_ids": lot_ids,
        }

    # =============================================================
    # 3. HANDLE LOT CONFIRMATION (from Agent 1)
    # =============================================================

    def _handle_lot_confirmed(self, event_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle LOT_CONFIRMED: Agent 1 confirmed a lot is available."""
        lot_id = payload.get("lot_id", "")
        lead_id = payload.get("lead_id", "")
        reservation_id = payload.get("reservation_id", "")

        self.bus.mark_consumed(event_id, self.agent_id)

        log.info(
            f"{self.agent_id} lot {lot_id} confirmed for lead {lead_id} "
            f"(reservation: {reservation_id})"
        )

        # Check if all lots for this lead's sample request are confirmed
        # If so, proceed with dispatch
        # (In production, this would check the sample_request_lots table)
        return {
            "action": "lot_confirmed",
            "lot_id": lot_id,
            "lead_id": lead_id,
            "reservation_id": reservation_id,
        }

    def _handle_lot_confirmation_failed(
        self, event_id: int, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Handle LOT_CONFIRMATION_FAILED: Agent 1 couldn't confirm a lot."""
        lot_id = payload.get("lot_id", "")
        lead_id = payload.get("lead_id", "")
        reason = payload.get("reason", "")
        substitute = payload.get("substitute_suggestion")

        self.bus.mark_consumed(event_id, self.agent_id)

        log.warning(
            f"{self.agent_id} lot {lot_id} confirmation failed for lead {lead_id}: {reason}"
        )

        if substitute:
            log.info(f"{self.agent_id} substitute suggested: {substitute.get('lot_id', 'N/A')}")
            return {
                "action": "substitute_suggested",
                "original_lot_id": lot_id,
                "lead_id": lead_id,
                "reason": reason,
                "substitute": substitute,
            }

        return {
            "action": "lot_unavailable",
            "lot_id": lot_id,
            "lead_id": lead_id,
            "reason": reason,
        }

    # =============================================================
    # 6. DISPATCH SAMPLE + TRACK SHIPMENT
    # =============================================================

    def dispatch_sample(
        self,
        sample_request_id: str,
        carrier: str = "DHL",
        tracking_number: str = "",
        carrier_account: str = "",
        estimated_arrival_days: int = 5,
    ) -> dict[str, Any]:
        """
        Dispatch a sample: record shipment, update status, publish event.

        This is called after all lots are confirmed by Agent 1.
        """
        from datetime import datetime

        sr = self.sm.get_sample_request(sample_request_id)
        if not sr:
            return {"action": "skipped", "reason": "sample request not found"}

        # Calculate estimated arrival
        eta = (datetime.now(ADDIS_TZ) + timedelta(days=estimated_arrival_days)).isoformat(
            timespec="seconds"
        )

        # Record shipment via StateManager
        shipment_id = self.sm.record_sample_shipment(
            sample_request_id=sample_request_id,
            carrier=carrier,
            tracking_number=tracking_number,
            carrier_account=carrier_account,
            estimated_arrival_ts=eta,
        )

        # Update sample request status
        self.sm.update_sample_request_status(sample_request_id, "dispatched")

        # Publish SAMPLE_DISPATCHED
        self.bus.publish(
            event_type=SAMPLE_DISPATCHED,
            entity_type="sample_request",
            entity_id=sample_request_id,
            payload={
                "sample_request_id": sample_request_id,
                "lead_id": sr.get("lead_id", ""),
                "carrier": carrier,
                "tracking_number": tracking_number,
                "shipment_id": shipment_id,
                "estimated_arrival": eta,
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} dispatched sample {sample_request_id} via {carrier} "
            f"(tracking: {tracking_number}, ETA: {eta[:10]})"
        )

        return {
            "action": "dispatched",
            "sample_request_id": sample_request_id,
            "shipment_id": shipment_id,
            "carrier": carrier,
            "tracking_number": tracking_number,
            "estimated_arrival": eta,
        }

    def record_delivery(
        self,
        sample_request_id: str,
        shipment_id: str = "",
    ) -> dict[str, Any]:
        """Record that a sample was delivered. Transitions to feedback_due."""
        sr = self.sm.get_sample_request(sample_request_id)
        if not sr:
            return {"action": "skipped", "reason": "sample request not found"}

        # Update shipment status if shipment_id provided
        if shipment_id:
            self.sm.update_shipment_status(shipment_id, "delivered")

        # Update sample request status
        self.sm.update_sample_request_status(sample_request_id, "delivered")
        self.sm.update_sample_request_status(sample_request_id, "feedback_due")

        log.info(f"{self.agent_id} sample {sample_request_id} delivered → feedback_due")

        return {
            "action": "delivered",
            "sample_request_id": sample_request_id,
            "status": "feedback_due",
        }

    # =============================================================
    # 7. SCHEDULE REMINDERS (via TaskQueue)
    # =============================================================

    def schedule_reminders(self, sample_request_id: str) -> dict[str, Any]:
        """
        Schedule Day +7, +10, +14, +18 reminder jobs via TaskQueue.

        Called after sample delivery. The TaskQueue fires these on schedule;
        Agent 4's reminder check job (in tasks/jobs.py) detects due reminders.
        """
        from coffee_export.tasks import TaskQueue

        scheduled: list[str] = []
        with TaskQueue() as queue:
            for day in (7, 10, 14, 18):
                job_id = queue.schedule_sample_reminder(
                    sample_request_id=sample_request_id,
                    reminder_day=day,
                )
                scheduled.append(job_id)

        log.info(
            f"{self.agent_id} scheduled {len(scheduled)} reminders for "
            f"sample {sample_request_id} (Day +7, +10, +14, +18)"
        )

        return {
            "action": "reminders_scheduled",
            "sample_request_id": sample_request_id,
            "reminder_days": [7, 10, 14, 18],
            "job_ids": scheduled,
        }

    # =============================================================
    # 8. COLLECT CUPPING SCORES
    # =============================================================

    def record_cupping(
        self,
        sample_request_id: str,
        lot_id: str,
        total_score: float,
        buyer_company: str = "",
        fragrance_aroma: float | None = None,
        flavor: float | None = None,
        aftertaste: float | None = None,
        acidity: float | None = None,
        body: float | None = None,
        balance: float | None = None,
        uniformity: float | None = None,
        clean_cup: float | None = None,
        sweetness: float | None = None,
        overall: float | None = None,
        defect_count_buyer: int | None = None,
        buyer_notes: str = "",
        our_score: float | None = None,
        cupper_name: str = "",
    ) -> dict[str, Any]:
        """Record a buyer's cupping score and publish CUPPING_SCORE_RECEIVED."""
        sr = self.sm.get_sample_request(sample_request_id)
        if not sr:
            return {"action": "skipped", "reason": "sample request not found"}

        if not buyer_company:
            buyer_company = sr.get("buyer_company", "")

        # Record via StateManager
        score_id = self.sm.record_cupping_score(
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            buyer_company=buyer_company,
            total_score=total_score,
            fragrance_aroma=fragrance_aroma,
            flavor=flavor,
            aftertaste=aftertaste,
            acidity=acidity,
            body=body,
            balance=balance,
            uniformity=uniformity,
            clean_cup=clean_cup,
            sweetness=sweetness,
            overall=overall,
            defect_count_buyer=defect_count_buyer,
            buyer_notes=buyer_notes,
            our_score=our_score,
            cupper_name=cupper_name,
        )

        # Publish CUPPING_SCORE_RECEIVED
        self.bus.publish(
            event_type=CUPPING_SCORE_RECEIVED,
            entity_type="sample_request",
            entity_id=sample_request_id,
            payload={
                "sample_request_id": sample_request_id,
                "lot_id": lot_id,
                "lead_id": sr.get("lead_id", ""),
                "total_score": total_score,
                "defect_count_buyer": defect_count_buyer,
                "our_score": our_score,
                "score_difference": (total_score - our_score) if our_score else None,
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} recorded cupping score {total_score} for "
            f"lot {lot_id} (sample {sample_request_id})"
        )

        return {
            "action": "cupping_recorded",
            "score_id": score_id,
            "sample_request_id": sample_request_id,
            "lot_id": lot_id,
            "total_score": total_score,
        }

    # =============================================================
    # 9. DECIDE: APPROVED / REJECTED / NEEDS ANOTHER SAMPLE
    # =============================================================

    def make_decision(
        self,
        sample_request_id: str,
        lot_id: str,
        decision: str,
        buyer_target_fob: float | None = None,
        buyer_target_volume_bags: int | None = None,
        buyer_target_port: str = "",
        buyer_target_shipment_window: str = "",
        buyer_payment_terms: str = "",
        notes: str = "",
    ) -> dict[str, Any]:
        """
        Make a sample decision and publish the appropriate event.

        decision must be one of:
          - "approved" → publish SAMPLE_APPROVED (Agent 5 starts contract)
          - "rejected" → publish SAMPLE_REJECTED (Agent 1 logs feedback)
          - "needs_another_sample" → publish SAMPLE_NEEDS_ANOTHER (loop back)
        """
        sr = self.sm.get_sample_request(sample_request_id)
        if not sr:
            return {"action": "skipped", "reason": "sample request not found"}

        lead_id = sr.get("lead_id", "")

        # Record the decision via StateManager
        decision_id = self.sm.record_sample_decision(
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            decision=decision,
            buyer_target_fob=buyer_target_fob,
            buyer_target_volume_bags=buyer_target_volume_bags,
            buyer_target_port=buyer_target_port,
            buyer_target_shipment_window=buyer_target_shipment_window,
            buyer_payment_terms=buyer_payment_terms,
            notes=notes,
        )

        # Update sample request status
        self.sm.update_sample_request_status(sample_request_id, "decided")

        # Determine event type + lead state transition
        event_type_map = {
            "approved": SAMPLE_APPROVED,
            "rejected": SAMPLE_REJECTED,
            "needs_another_sample": SAMPLE_NEEDS_ANOTHER,
        }
        event_type = event_type_map.get(decision, SAMPLE_REJECTED)

        lead_state_map = {
            "approved": "DECIDED_APPROVED",
            "rejected": "DECIDED_REJECTED",
            "needs_another_sample": "DECIDED_NEEDS_ANOTHER",
        }
        lead_state = lead_state_map.get(decision, "DECIDED_REJECTED")

        # Determine next agent
        next_agent_map = {
            "approved": "Agent 5",
            "rejected": "Agent 3",  # back to nurture
            "needs_another_sample": "Agent 4",  # loop back
        }
        next_agent = next_agent_map.get(decision, "Agent 3")

        # Transition lead state (may need to go through intermediate states first)
        lead = self.sm.get_lead(lead_id)
        current_state = lead["current_state"] if lead else "SAMPLE_DISPATCHED"

        # Navigate through the state machine to reach the decision state
        # QUALIFIED → SAMPLE_DISPATCHED → SAMPLE_FEEDBACK_DUE → DECIDED_*
        if current_state == "QUALIFIED":
            self.sm.update_lead_state(
                lead_id=lead_id,
                new_state="SAMPLE_DISPATCHED",
                agent=self.agent_id,
                notes=f"Sample {sample_request_id} dispatched",
                current_agent=self.agent_id,
            )
            current_state = "SAMPLE_DISPATCHED"

        if current_state == "SAMPLE_DISPATCHED":
            self.sm.update_lead_state(
                lead_id=lead_id,
                new_state="SAMPLE_FEEDBACK_DUE",
                agent=self.agent_id,
                notes=f"Sample {sample_request_id} feedback received",
                current_agent=self.agent_id,
            )

        # Now transition to the decision state
        self.sm.update_lead_state(
            lead_id=lead_id,
            new_state=lead_state,
            agent=self.agent_id,
            notes=f"Sample {sample_request_id} lot {lot_id}: {decision}",
            current_agent=next_agent,
            next_action_agent=next_agent,
        )

        # Publish the decision event
        self.bus.publish(
            event_type=event_type,
            entity_type="sample_request",
            entity_id=sample_request_id,
            payload={
                "sample_request_id": sample_request_id,
                "lot_id": lot_id,
                "lead_id": lead_id,
                "decision": decision,
                "decision_id": decision_id,
                "buyer_target_fob": buyer_target_fob,
                "buyer_target_volume_bags": buyer_target_volume_bags,
                "buyer_target_port": buyer_target_port,
                "buyer_target_shipment_window": buyer_target_shipment_window,
                "buyer_payment_terms": buyer_payment_terms,
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} decision for sample {sample_request_id} lot {lot_id}: "
            f"{decision} (lead → {lead_state}, next agent: {next_agent})"
        )

        return {
            "action": "decided",
            "decision_id": decision_id,
            "sample_request_id": sample_request_id,
            "lot_id": lot_id,
            "decision": decision,
            "lead_state": lead_state,
            "next_agent": next_agent,
        }

    def auto_decide(
        self,
        sample_request_id: str,
        lot_id: str,
    ) -> dict[str, Any]:
        """
        Auto-decide based on cupping score thresholds.

        Rules:
          - Score ≥ 85.0 AND defect_count ≤ 8 AND no rejection keywords → approved
          - Score < 82.0 OR defect_count > 15 OR critical keywords → rejected
          - Otherwise → needs_another_sample

        Returns the decision result.
        """
        scores = self.sm.get_cupping_scores(sample_request_id)
        lot_score = next((s for s in scores if s.get("lot_id") == lot_id), None)

        if not lot_score:
            return {"action": "skipped", "reason": "no cupping score found for lot"}

        total_score = lot_score.get("total_score", 0) or 0
        defect_count = lot_score.get("defect_count_buyer", 0) or 0
        buyer_notes = (lot_score.get("buyer_notes") or "").lower()

        # Check for rejection keywords
        has_rejection_keyword = any(kw in buyer_notes for kw in REJECTION_KEYWORDS)

        # Determine decision
        if (
            total_score >= SCORE_APPROVAL_THRESHOLD
            and defect_count <= 8
            and not has_rejection_keyword
        ):
            decision = "approved"
        elif (
            total_score < SCORE_REJECTION_THRESHOLD
            or defect_count > DEFECT_REJECTION_THRESHOLD
            or has_rejection_keyword
        ):
            decision = "rejected"
        else:
            decision = "needs_another_sample"

        log.info(
            f"{self.agent_id} auto-decide for lot {lot_id}: "
            f"score={total_score}, defects={defect_count}, "
            f"keywords={has_rejection_keyword} → {decision}"
        )

        return self.make_decision(
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            decision=decision,
            notes=f"Auto-decided: score={total_score}, defects={defect_count}",
        )

    # =============================================================
    # 2. RECOMMEND LOTS (convenience method)
    # =============================================================

    def recommend_lots(
        self,
        lead_id: str,
        region: str | None = None,
        process: str | None = None,
        crop_year: str = "25/26",
    ) -> list[dict[str, Any]]:
        """Recommend lots for a lead. Uses StateManager's 9-step filter."""
        lead = self.sm.get_lead(lead_id)
        if not lead:
            return []

        destination = lead.get("headquarters_country", "")
        eudr_required = destination in EU_COUNTRIES

        lots = self.sm.recommend_lots_for_lead(
            lead_id=lead_id,
            region=region,
            process=process,
            crop_year=crop_year,
            eudr_required=eudr_required,
            max_results=3,
        )

        log.info(
            f"{self.agent_id} recommended {len(lots)} lots for lead {lead_id} "
            f"(EUDR required: {eudr_required})"
        )

        return lots

    # =============================================================
    # 5. PRINT LABELS (generate label content)
    # =============================================================

    def generate_label(self, sample_request_id: str, lot_id: str) -> dict[str, str]:
        """
        Generate label content for a sample bag.

        Returns a dict with label text for printing.
        """
        sr = self.sm.get_sample_request(sample_request_id)
        if not sr:
            return {"error": "sample request not found"}

        lot = self.sm.get_lot(lot_id)
        if not lot:
            return {"error": f"lot {lot_id} not found"}

        label_lines = [
            f"PRE-SHIPMENT SAMPLE — Ethiopian {lot.get('crop_year', '25/26')}",
            "",
            f"Lot ID:        {lot_id}",
            f"Region:        {lot.get('region', '')}",
            f"Washing Stn:   {lot.get('washing_station_name', '')}",
            f"Process:       {lot.get('process', '')}",
            f"Screen:        {lot.get('screen_size', '')}",
            f"Cupping Score: {lot.get('cupping_score', '')}",
            f"Crop Year:     {lot.get('crop_year', '')}",
            "",
            f"Sample For:    {sr.get('buyer_company', '')}",
            f"Sample Req ID: {sample_request_id}",
            "",
            "⚠ Vacuum-sealed — do not open until cupping.",
            "  Rest 7 days post-receipt before evaluation.",
        ]

        return {
            "lot_id": lot_id,
            "sample_request_id": sample_request_id,
            "label_text": "\n".join(label_lines),
        }

    # =============================================================
    # MAINTENANCE / STATS
    # =============================================================

    def get_sample_stats(self) -> dict[str, Any]:
        """Get sample management statistics via StateManager."""
        snapshot = self.sm.get_kpi_snapshot()
        return {
            "active_reservations": snapshot["samples"]["active_reservations"],
            "budget": snapshot["samples"]["budget"],
            "waitlist_depth": snapshot["samples"]["waitlist_depth"],
            "feedback_logged": snapshot["feedback"]["total_logged"],
        }

    def on_batch_complete(self, result: Any) -> None:
        """Log summary after batch completes."""
        if result.total > 0:
            log.info(
                f"{self.agent_id} batch complete: {result.processed} events processed, "
                f"{result.failed} failed, {result.duration_seconds:.1f}s"
            )


# ═══════════════════════════════════════════════════════════════
# REGISTER THE AGENT
# ═══════════════════════════════════════════════════════════════

register_agent("Agent 4", Agent4)


# ═══════════════════════════════════════════════════════════════
# CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════


def run_agent4() -> Any:
    """Run Agent 4 in event-driven mode (process LEAD_QUALIFIED + LOT_CONFIRMED)."""
    return run_agent(Agent4())


def run_agent4_stats() -> dict[str, Any]:
    """Get Agent 4 sample management statistics."""
    with Agent4() as agent:
        return agent.get_sample_stats()
