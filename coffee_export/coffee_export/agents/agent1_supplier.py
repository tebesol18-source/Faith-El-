"""
Agent 1 — Supplier & Inventory Specialist.

Owns lot inventory, EUDR data packs, stock levels, and QA flags.
Event-driven: consumes SAMPLE_REQUESTED events from Agent 4 and
confirms lots (validates stock, crop year, EUDR for EU buyers).
"""

from __future__ import annotations

from typing import Any

from coffee_export.agents.base import BaseAgent, BatchResult, run_agent
from coffee_export.agents.registry import register_agent
from coffee_export.events import (
    LOT_CONFIRMATION_FAILED,
    LOT_CONFIRMED,
    SAMPLE_REQUESTED,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


class Agent1(BaseAgent):
    """Agent 1 — Supplier & Inventory Specialist."""

    agent_id = "Agent 1"
    description = "Supplier & Inventory — lot confirmation, EUDR, QA, stock"

    def get_leads_to_process(self) -> list[dict[str, Any]]:
        """Consume pending SAMPLE_REQUESTED events from the bus."""
        events = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=SAMPLE_REQUESTED,
            limit=50,
        )
        if not events:
            log.debug(f"{self.agent_id} no SAMPLE_REQUESTED events pending")
            return []
        log.info(f"{self.agent_id} consumed {len(events)} SAMPLE_REQUESTED events")
        return events

    def process_lead(self, event: dict[str, Any]) -> dict[str, Any]:
        """Process one SAMPLE_REQUESTED event."""
        event_id = event.get("id")
        payload = event.get("payload", {})

        lead_id = payload.get("lead_id", "")
        buyer_company = payload.get("buyer_company", "")
        destination_country = payload.get("destination_country", "")
        sample_type = payload.get("sample_type", "350g")
        crop_year = payload.get("crop_year", "25/26")
        lot_ids = payload.get("lot_ids", [])

        if not lot_ids:
            log.warning(f"{self.agent_id} event {event_id} has no lot_ids")
            self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)
            return {"action": "skipped", "reason": "no lot_ids"}

        log.info(
            f"{self.agent_id} confirming {len(lot_ids)} lots for "
            f"lead={lead_id} buyer={buyer_company}"
        )

        confirmed_count = 0
        failed_count = 0
        results: list[dict[str, Any]] = []

        for lot_id in lot_ids:
            result = self.sm.confirm_lot_for_sample(
                lot_id=lot_id,
                lead_id=lead_id,
                sample_type=sample_type,
                buyer_company=buyer_company,
                destination_country=destination_country,
                crop_year=crop_year,
            )
            results.append(result)

            if result["confirmed"]:
                confirmed_count += 1
                self._publish_lot_confirmed(result, lead_id, lot_id)
            else:
                failed_count += 1
                self._publish_lot_confirmation_failed(result, lead_id, lot_id)

        self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)

        log.info(
            f"{self.agent_id} event {event_id}: {confirmed_count} confirmed, "
            f"{failed_count} failed"
        )
        return {
            "action": "confirmed_lots",
            "event_id": event_id,
            "lead_id": lead_id,
            "confirmed": confirmed_count,
            "failed": failed_count,
            "results": results,
        }

    def _publish_lot_confirmed(self, result: dict[str, Any], lead_id: str, lot_id: str) -> None:
        self.bus.publish(
            event_type=LOT_CONFIRMED,
            entity_type="lot",
            entity_id=lot_id,
            payload={
                "lot_id": lot_id,
                "lead_id": lead_id,
                "stock_after_sample_bags": result.get("stock_after_sample_bags"),
                "reservation_id": result.get("reservation_id"),
                "reserved_until": result.get("reserved_until"),
            },
            published_by=self.agent_id,
        )

    def _publish_lot_confirmation_failed(
        self, result: dict[str, Any], lead_id: str, lot_id: str
    ) -> None:
        self.bus.publish(
            event_type=LOT_CONFIRMATION_FAILED,
            entity_type="lot",
            entity_id=lot_id,
            payload={
                "lot_id": lot_id,
                "lead_id": lead_id,
                "reason": result.get("reason_if_not", ""),
                "substitute_suggestion": result.get("substitute_suggestion"),
            },
            published_by=self.agent_id,
        )

    def run_eudr_audit(self) -> dict[str, Any]:
        """Audit EUDR data completeness."""
        log.info(f"{self.agent_id} running EUDR audit")
        lots = self.sm.list_lots(status="active")
        incomplete: list[dict[str, Any]] = []

        for lot in lots:
            eudr_status = lot.get("eudr_data_status", "missing")
            if eudr_status == "complete":
                continue
            missing_fields: list[str] = []
            if not lot.get("eudr_gps_lat"):
                missing_fields.append("gps_lat")
            if not lot.get("eudr_gps_lon"):
                missing_fields.append("gps_lon")
            if not lot.get("eudr_farmgate_price_etb_per_kg"):
                missing_fields.append("farmgate_price")
            if not lot.get("eudr_deforestation_attestation"):
                missing_fields.append("deforestation_attestation")
            incomplete.append(
                {
                    "lot_id": lot["lot_id"],
                    "region": lot.get("region"),
                    "eudr_status": eudr_status,
                    "missing_fields": missing_fields,
                }
            )

        result = {
            "total_active_lots": len(lots),
            "complete": len(lots) - len(incomplete),
            "incomplete": len(incomplete),
            "incomplete_lots": incomplete,
        }
        log.info(
            f"{self.agent_id} EUDR audit: {result['complete']}/{result['total_active_lots']} complete"
        )
        return result

    def run_qa_review(self) -> dict[str, Any]:
        """Review lots with QA flags or multiple rejections."""
        log.info(f"{self.agent_id} running QA review")
        held_lots = self.sm.list_lots(status="hold")
        snapshot = self.sm.get_kpi_snapshot()
        multi_rej = snapshot["feedback"]["multi_rejection_lots"]
        result = {
            "held_lots": [
                {"lot_id": lot["lot_id"], "region": lot.get("region"), "status": lot.get("status")}
                for lot in held_lots
            ],
            "multi_rejection_lots": multi_rej,
            "total_needing_review": len(held_lots) + len(multi_rej),
        }
        log.info(
            f"{self.agent_id} QA review: {len(held_lots)} on hold, "
            f"{len(multi_rej)} with ≥2 rejections"
        )
        return result

    def run_stock_freshness_check(self, max_age_hours: int = 24) -> dict[str, Any]:
        """Check for lots with stale last_updated_ts. Uses StateManager — no direct DB access."""
        log.info(f"{self.agent_id} running stock freshness check (>{max_age_hours}h)")
        return self.sm.get_stock_freshness(max_age_hours=max_age_hours)

    def log_rejection_feedback(
        self,
        lot_id: str,
        buyer_company: str,
        buyer_segment: str,
        rejection_reason: str,
        sample_request_id: str | None = None,
    ) -> dict[str, Any]:
        """Log rejection feedback from a buyer."""
        result = self.sm.log_feedback(
            lot_id=lot_id,
            buyer_company=buyer_company,
            buyer_segment=buyer_segment,
            rejection_reason=rejection_reason,
            sample_request_id=sample_request_id,
        )
        if result.get("qa_auto_flagged"):
            log.warning(
                f"{self.agent_id} lot {lot_id} auto-flagged for QA "
                f"(≥2 rejections with critical keyword)"
            )
        return result

    def find_substitute_lot(
        self, lot_id: str, eudr_required: bool = False
    ) -> dict[str, Any] | None:
        """Find a substitute lot."""
        lot = self.sm.get_lot(lot_id)
        if not lot:
            return None
        sub = self.sm.find_substitute(
            excluded_lot_id=lot_id,
            region=lot.get("region"),
            process=lot.get("process"),
            target_score=lot.get("cupping_score"),
            crop_year=lot.get("crop_year", "25/26"),
            eudr_required=eudr_required,
        )
        if sub:
            log.info(
                f"{self.agent_id} substitute for {lot_id}: {sub['lot_id']} "
                f"({sub['region']} {sub['process']} score={sub['cupping_score']})"
            )
        else:
            log.info(f"{self.agent_id} no substitute found for {lot_id}")
        return sub

    def release_lot_from_qa(self, lot_id: str) -> bool:
        result = self.sm.release_lot_from_qa(lot_id)
        if result:
            log.info(f"{self.agent_id} lot {lot_id} released from QA hold")
        return result

    def flag_lot_for_qa(self, lot_id: str, reason: str) -> bool:
        self.sm.flag_lot_for_qa(lot_id, reason, auto=False)
        log.info(f"{self.agent_id} lot {lot_id} manually flagged for QA: {reason}")
        return True

    def on_batch_complete(self, result: BatchResult) -> None:  # type: ignore[override]
        if result.total > 0:
            log.info(
                f"{self.agent_id} batch complete: {result.processed} events processed, "
                f"{result.failed} failed, {result.duration_seconds:.1f}s"
            )


register_agent("Agent 1", Agent1)


def run_agent1() -> Any:
    """Run Agent 1 in event-driven mode."""
    return run_agent(Agent1())


def run_agent1_maintenance() -> dict[str, Any]:
    """Run Agent 1 maintenance tasks."""
    with Agent1() as agent:
        return {
            "eudr_audit": agent.run_eudr_audit(),
            "qa_review": agent.run_qa_review(),
            "stock_freshness": agent.run_stock_freshness_check(),
        }
