"""
Agent 7 — Sales & Relationship Management.

The final agent in the 7-agent chain. Consumes SHIPMENT_DELIVERED +
CONTRACT_COMPLETED events from Agent 6, creates accounts for delivered
buyers, tracks buyer relationships (calls, meetings, NPS), and manages
repeat orders.

ARCHITECTURE COMPLIANCE
-----------------------
Agent 7 only interacts with:
  ✅ StateManager — all database mutations
  ✅ EventBus — consume SHIPMENT_DELIVERED + CONTRACT_COMPLETED,
     publish ACCOUNT_CREATED, NPS_COLLECTED, REPEAT_ORDER_REQUESTED
  ✅ TaskQueue — schedule NPS surveys + relationship check-ins
  ❌ No direct SessionLocal or database model imports

RESPONSIBILITIES
----------------
  1. Consume SHIPMENT_DELIVERED → create account
  2. Log delivery follow-up activity
  3. Schedule NPS survey (7 days post-delivery)
  4. Collect and record NPS scores
  5. Track relationship activities (calls, meetings, emails, site visits)
  6. Identify repeat order opportunities
  7. Detect at-risk accounts (no activity >90 days)
  8. Publish ACCOUNT_CREATED, NPS_COLLECTED, REPEAT_ORDER_REQUESTED

EVENT FLOW
----------
  Agent 6 publishes SHIPMENT_DELIVERED + CONTRACT_COMPLETED
      ↓
  Agent 7 creates account (ACC-YYYY-NNNN)
      ↓
  Agent 7 logs delivery_followup activity
      ↓
  Agent 7 publishes ACCOUNT_CREATED
      ↓
  (7 days later) Agent 7 sends NPS survey
      ↓
  Buyer responds → Agent 7 records NPS score
      ↓
  Agent 7 publishes NPS_COLLECTED
      ↓
  Agent 7 monitors account health (active/dormant/at_risk/churned)
      ↓
  If buyer requests repeat → Agent 7 publishes REPEAT_ORDER_REQUESTED
  → Agent 4 picks up (skips outreach, goes straight to sample/contract)

USAGE
-----
    from coffee_export.agents.agent7_relationship import Agent7

    # Event-driven run (process SHIPMENT_DELIVERED events)
    result = run_agent(Agent7())

    # Record a call with a buyer
    agent.log_activity(account_id="ACC-2026-0001", activity_type="call",
                       summary="Discussed 26/27 forward program, buyer interested in Guji washed")

    # Record NPS
    agent.record_nps(account_id="ACC-2026-0001", score=9,
                     feedback="Great quality, on-time delivery")

    # Check account health
    agent.check_account_health("ACC-2026-0001")

    # Request a repeat order
    agent.request_repeat_order("ACC-2026-0001", lot_ids=["LOT-25-0001"])
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from coffee_export.agents.base import BaseAgent, run_agent
from coffee_export.agents.registry import register_agent
from coffee_export.events import (
    ACCOUNT_CREATED,
    CONTRACT_COMPLETED,
    NPS_COLLECTED,
    REPEAT_ORDER_REQUESTED,
    SHIPMENT_DELIVERED,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))

# Account health thresholds
DORMANT_THRESHOLD_DAYS = 90  # no activity → dormant
AT_RISK_THRESHOLD_DAYS = 180  # no activity → at_risk
CHURNED_THRESHOLD_DAYS = 365  # no activity → churned
NPS_SURVEY_DELAY_DAYS = 7  # NPS survey sent 7 days post-delivery
RELATIONSHIP_CHECKIN_DAYS = 42  # check-in every 6 weeks for active accounts


class Agent7(BaseAgent):
    """Agent 7 — Sales & Relationship Management."""

    agent_id = "Agent 7"
    description = "Sales & Relationship — accounts, NPS, repeat orders, retention"

    def get_leads_to_process(self) -> list[dict[str, Any]]:
        """Consume SHIPMENT_DELIVERED + CONTRACT_COMPLETED events."""
        events: list[dict[str, Any]] = []

        delivered = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=SHIPMENT_DELIVERED,
            limit=20,
        )
        for e in delivered:
            events.append({**e, "_event_category": "delivered"})

        completed = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=CONTRACT_COMPLETED,
            limit=20,
        )
        for e in completed:
            events.append({**e, "_event_category": "completed"})

        if events:
            log.info(
                f"{self.agent_id} consumed {len(events)} events "
                f"({len(delivered)} SHIPMENT_DELIVERED, {len(completed)} CONTRACT_COMPLETED)"
            )
        return events

    def process_lead(self, event: dict[str, Any]) -> dict[str, Any]:
        """Process a delivery/completion event."""
        category = event.get("_event_category", "")
        event_id = event.get("id")
        payload = event.get("payload", {})

        try:
            if category == "delivered":
                result = self._handle_delivery(event_id, payload)
            elif category == "completed":
                result = self._handle_contract_completed(event_id, payload)
            else:
                self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)
                return {"action": "skipped", "reason": f"unknown category: {category}"}

            # Mark both events as consumed (they may be paired)
            self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)
            return result
        except Exception as e:
            log.error(f"{self.agent_id} failed to process event {event_id}: {e}", exc_info=True)
            self.bus.mark_failed(event_id, self.agent_id, str(e))
            return {"action": "failed", "error": str(e)}

    def _handle_delivery(self, event_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle SHIPMENT_DELIVERED: create account + log activity."""
        shipment_id = payload.get("shipment_id", "")
        contract_id = payload.get("contract_id", "")

        # Get contract to find lead_id
        contract = self.sm.get_contract(contract_id) if contract_id else None
        if not contract:
            return {"action": "skipped", "reason": f"contract {contract_id} not found"}

        lead_id = contract.get("lead_id", "")
        if not lead_id:
            return {"action": "skipped", "reason": "no lead_id in contract"}

        # Create account (idempotent — returns existing if already created)
        account_id = self.sm.create_account(
            lead_id=lead_id,
            account_manager="operator",
        )

        # Log delivery follow-up activity
        self.sm.add_account_activity(
            account_id=account_id,
            activity_type="delivery_followup",
            summary=f"Shipment {shipment_id} delivered. Contract {contract_id} completed. "
            f"Volume: {contract.get('total_volume_bags', 0)} bags, "
            f"Value: ${contract.get('total_value', 0):,.2f}",
            next_steps=f"Send NPS survey in {NPS_SURVEY_DELAY_DAYS} days. "
            f"Schedule relationship check-in.",
        )

        # Publish ACCOUNT_CREATED
        self.bus.publish(
            event_type=ACCOUNT_CREATED,
            entity_type="account",
            entity_id=account_id,
            payload={
                "account_id": account_id,
                "lead_id": lead_id,
                "contract_id": contract_id,
                "shipment_id": shipment_id,
                "total_volume_bags": contract.get("total_volume_bags", 0),
                "total_revenue": contract.get("total_value", 0),
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} created account {account_id} for lead {lead_id} "
            f"(delivery: {shipment_id}, contract: {contract_id})"
        )

        return {
            "action": "account_created",
            "account_id": account_id,
            "lead_id": lead_id,
            "contract_id": contract_id,
            "shipment_id": shipment_id,
        }

    def _handle_contract_completed(self, event_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle CONTRACT_COMPLETED: update account totals."""
        contract_id = payload.get("contract_id", "")
        contract = self.sm.get_contract(contract_id) if contract_id else None
        if not contract:
            return {"action": "skipped", "reason": "contract not found"}

        lead_id = contract.get("lead_id", "")
        account = self.sm.get_account_by_lead(lead_id)

        if account:
            # Update account totals
            all_contracts = self.sm.get_contracts(lead_id=lead_id, limit=10000)
            total_volume = sum(c.get("total_volume_bags", 0) or 0 for c in all_contracts)
            total_revenue = sum(c.get("total_value", 0) or 0 for c in all_contracts)

            self.sm.update_account(
                account["account_id"],
                total_volume_bags=total_volume,
                total_revenue_usd=total_revenue,
            )

            log.info(
                f"{self.agent_id} updated account {account['account_id']} totals: "
                f"{total_volume} bags, ${total_revenue:,.2f}"
            )

            return {
                "action": "account_updated",
                "account_id": account["account_id"],
                "total_volume_bags": total_volume,
                "total_revenue": total_revenue,
            }

        return {"action": "skipped", "reason": "no account for this lead"}

    # =============================================================
    # RELATIONSHIP ACTIVITIES
    # =============================================================

    def log_activity(
        self,
        account_id: str,
        activity_type: str,
        summary: str = "",
        participants: str = "",
        next_steps: str = "",
        next_action_due_ts: str = "",
    ) -> dict[str, Any]:
        """Log a relationship activity (call, meeting, email, site visit, etc.)."""
        activity_id = self.sm.add_account_activity(
            account_id=account_id,
            activity_type=activity_type,
            participants=participants,
            summary=summary,
            next_steps=next_steps,
            next_action_due_ts=next_action_due_ts,
        )

        log.info(
            f"{self.agent_id} logged {activity_type} for account {account_id} "
            f"(activity_id={activity_id})"
        )

        return {
            "action": "activity_logged",
            "activity_id": activity_id,
            "account_id": account_id,
            "activity_type": activity_type,
        }

    def get_account_timeline(self, account_id: str) -> list[dict[str, Any]]:
        """Get the full activity timeline for an account (newest first)."""
        return self.sm.get_account_activities(account_id, limit=50)

    # =============================================================
    # NPS (Net Promoter Score)
    # =============================================================

    def record_nps(
        self,
        account_id: str,
        score: int,
        feedback: str = "",
    ) -> dict[str, Any]:
        """
        Record an NPS score for an account.

        NPS scale: 0-10
          Promoters (9-10): loyal enthusiasts
          Passives (7-8): satisfied but unenthusiastic
          Detractors (0-6): unhappy customers

        NPS = % Promoters - % Detractors (range: -100 to +100)
        """
        if not 0 <= score <= 10:
            return {"action": "skipped", "reason": f"NPS score must be 0-10, got {score}"}

        category = "promoter" if score >= 9 else ("passive" if score >= 7 else "detractor")

        self.sm.add_account_activity(
            account_id=account_id,
            activity_type="nps_survey",
            summary=f"NPS score: {score}/10 ({category})",
            nps_score=score,
            nps_feedback=feedback,
        )

        # Publish NPS_COLLECTED
        self.bus.publish(
            event_type=NPS_COLLECTED,
            entity_type="account",
            entity_id=account_id,
            payload={
                "account_id": account_id,
                "nps_score": score,
                "nps_category": category,
                "feedback": feedback,
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} recorded NPS {score}/10 ({category}) for " f"account {account_id}"
        )

        return {
            "action": "nps_recorded",
            "account_id": account_id,
            "nps_score": score,
            "nps_category": category,
            "feedback": feedback,
        }

    # =============================================================
    # ACCOUNT HEALTH
    # =============================================================

    def check_account_health(self, account_id: str) -> dict[str, Any]:
        """
        Check account health based on activity recency.

        Status transitions:
          active → dormant (no activity >90 days)
          dormant → at_risk (no activity >180 days)
          at_risk → churned (no activity >365 days)
        """
        account = self.sm.get_account(account_id)
        if not account:
            return {"error": f"account {account_id} not found"}

        current_status = account.get("relationship_status", "active")
        last_activity = account.get("last_activity_ts", "")

        if not last_activity:
            return {
                "account_id": account_id,
                "current_status": current_status,
                "days_since_activity": None,
                "health": "unknown",
            }

        try:
            last_dt = datetime.fromisoformat(last_activity)
        except (ValueError, TypeError):
            return {
                "account_id": account_id,
                "current_status": current_status,
                "days_since_activity": None,
                "health": "unknown",
            }

        now = datetime.now(ADDIS_TZ)
        days_since = (now - last_dt).days

        # Determine new status
        new_status = current_status
        if days_since >= CHURNED_THRESHOLD_DAYS:
            new_status = "churned"
        elif days_since >= AT_RISK_THRESHOLD_DAYS:
            new_status = "at_risk"
        elif days_since >= DORMANT_THRESHOLD_DAYS:
            new_status = "dormant"
        else:
            new_status = "active"

        # Update if changed
        if new_status != current_status:
            self.sm.update_account(account_id, relationship_status=new_status)
            log.warning(
                f"{self.agent_id} account {account_id} status: "
                f"{current_status} → {new_status} (no activity for {days_since} days)"
            )

        # Health indicator
        health = "🟢" if days_since < 30 else ("🟡" if days_since < 90 else "🔴")

        return {
            "account_id": account_id,
            "current_status": new_status,
            "previous_status": current_status,
            "days_since_activity": days_since,
            "health": health,
            "last_activity_ts": last_activity,
        }

    def check_all_accounts_health(self) -> list[dict[str, Any]]:
        """Check health for all accounts. Returns list of health dicts."""
        accounts = self.sm.get_accounts(limit=10000)
        results = []
        for acc in accounts:
            health = self.check_account_health(acc["account_id"])
            results.append(health)
        return results

    # =============================================================
    # REPEAT ORDERS
    # =============================================================

    def request_repeat_order(
        self,
        account_id: str,
        lot_ids: list[str] | None = None,
        notes: str = "",
    ) -> dict[str, Any]:
        """
        Request a repeat order for an account.

        Publishes REPEAT_ORDER_REQUESTED → Agent 4 picks up
        (skips outreach, goes straight to sample/contract).
        """
        account = self.sm.get_account(account_id)
        if not account:
            return {"action": "skipped", "reason": f"account {account_id} not found"}

        lead_id = account.get("lead_id", "")

        # Log the activity
        self.sm.add_account_activity(
            account_id=account_id,
            activity_type="sample_request",
            summary=f"Repeat order requested. Lots: {', '.join(lot_ids or [])}. {notes}",
            next_steps="Agent 4 to process repeat sample request",
        )

        # Publish REPEAT_ORDER_REQUESTED
        self.bus.publish(
            event_type=REPEAT_ORDER_REQUESTED,
            entity_type="account",
            entity_id=account_id,
            payload={
                "account_id": account_id,
                "lead_id": lead_id,
                "lot_ids": lot_ids or [],
                "notes": notes,
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} repeat order requested for account {account_id} "
            f"(lead: {lead_id}, lots: {lot_ids})"
        )

        return {
            "action": "repeat_order_requested",
            "account_id": account_id,
            "lead_id": lead_id,
            "lot_ids": lot_ids or [],
        }

    # =============================================================
    # STATS
    # =============================================================

    def get_stats(self) -> dict[str, Any]:
        """Get relationship management statistics."""
        return self.sm.get_relationship_stats()

    def on_batch_complete(self, result: Any) -> None:
        """Log summary after batch completes."""
        if result.total > 0:
            log.info(
                f"{self.agent_id} batch complete: {result.processed} accounts created, "
                f"{result.failed} failed, {result.duration_seconds:.1f}s"
            )

    # =============================================================
    # LLM-POWERED METHODS (AI Gateway integration)
    # =============================================================

    def analyze_nps_with_llm(
        self, account_id: str, nps_score: int, feedback: str = ""
    ) -> dict[str, Any]:
        """
        Use LLM to analyze NPS feedback for actionable insights.

        Falls back to simple sentiment classification if LLM fails.
        """
        from coffee_export.ai import AIGateway, llm_analyze_nps_feedback

        account = self.sm.get_account(account_id) or {}
        company_name = ""
        lead = self.sm.get_lead(account.get("lead_id", ""))
        if lead:
            company_name = lead.get("company_name", "")

        gateway = AIGateway()
        result = llm_analyze_nps_feedback(
            gateway=gateway,
            account_id=account_id,
            nps_score=nps_score,
            feedback=feedback,
            company_name=company_name,
        )

        if result.get("llm_used"):
            log.info(
                f"{self.agent_id} LLM analyzed NPS for {account_id}: "
                f"sentiment={result.get('sentiment', '?')} ({result.get('provider', '?')})"
            )
        return result

    def suggest_next_action_with_llm(self, account_id: str) -> dict[str, Any]:
        """
        Use LLM to suggest the next best action for an account.

        Considers account status, recent activities, NPS, and relationship history.
        """
        from coffee_export.ai import AIGateway, llm_suggest_next_action

        account = self.sm.get_account(account_id)
        if not account:
            return {"error": "account not found"}

        activities = self.sm.get_account_activities(account_id, limit=10)
        nps_score = account.get("nps_score")

        gateway = AIGateway()
        result = llm_suggest_next_action(
            gateway=gateway,
            account=account,
            activities=activities,
            nps_score=nps_score,
        )

        if result.get("llm_used"):
            log.info(
                f"{self.agent_id} LLM suggested next action for {account_id}: "
                f"{result.get('suggested_action', '?')} ({result.get('provider', '?')})"
            )
        return result


# ═══════════════════════════════════════════════════════════════
# REGISTER THE AGENT
# ═══════════════════════════════════════════════════════════════

register_agent("Agent 7", Agent7)


# ═══════════════════════════════════════════════════════════════
# CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════


def run_agent7() -> Any:
    """Run Agent 7 in event-driven mode (process SHIPMENT_DELIVERED)."""
    return run_agent(Agent7())


def run_agent7_stats() -> dict[str, Any]:
    """Get Agent 7 relationship statistics."""
    with Agent7() as agent:
        return agent.get_stats()
