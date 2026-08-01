"""
Agent 6 — Logistics & Shipping Specialist.

Consumes CONTRACT_SIGNED events from Agent 5, books freight shipments,
manages customs documents, tracks delivery, and publishes SHIPMENT_DELIVERED
for Agent 7 (Sales & Relationship Management).

ARCHITECTURE COMPLIANCE
-----------------------
Agent 6 only interacts with:
  ✅ StateManager — all database mutations
  ✅ EventBus — consume CONTRACT_SIGNED, publish SHIPMENT_BOOKED / DEPARTED / DELIVERED / CUSTOMS_HOLD
  ✅ TaskQueue — schedule delivery tracking checks
  ❌ No direct SessionLocal or database model imports

RESPONSIBILITIES
----------------
  1. Consume CONTRACT_SIGNED → create shipment record
  2. Book freight (carrier, vessel, B/L, container, ports, ETD/ETA)
  3. Add shipment items (lots being shipped)
  4. Generate customs document checklist
  5. Track customs document clearance
  6. Track shipment status: draft → booked → loaded → departed → in_transit → arrived → delivered
  7. Handle customs holds (publish CUSTOMS_HOLD for operator attention)
  8. On delivery → publish SHIPMENT_DELIVERED + CONTRACT_COMPLETED

EVENT FLOW
----------
  Agent 5 publishes CONTRACT_SIGNED
      ↓
  Agent 6 creates shipment + adds lot items from contract line items
      ↓
  Agent 6 generates customs checklist (draft entries for required docs)
      ↓
  Agent 6 publishes SHIPMENT_BOOKED
      ↓
  Operator provides customs docs → Agent 6 checks clearance
      ↓
  When all customs cleared → shipment → departed → in_transit
      ↓
  Shipment arrives → customs clearance → delivered
      ↓
  Agent 6 publishes SHIPMENT_DELIVERED + CONTRACT_COMPLETED → Agent 7

USAGE
-----
    from coffee_export.agents.agent6_logistics import Agent6

    # Event-driven run (process CONTRACT_SIGNED events)
    result = run_agent(Agent6())

    # Book a shipment
    agent.book_shipment(shipment_id="SH-2026-0001",
                        carrier="Maersk", vessel="MSC Gulsun",
                        bl_number="MAEU1234567890",
                        departure_port="Djibouti", arrival_port="Hamburg",
                        etd="2026-07-15", eta="2026-08-10")

    # Submit customs document
    agent.submit_customs_doc(shipment_id, "bill_of_lading", file_path="/docs/bl.pdf")

    # Clear customs document
    agent.clear_customs_doc(doc_id=1)

    # Record departure
    agent.record_departure(shipment_id, atd="2026-07-15T08:00:00+03:00")

    # Record delivery
    agent.record_delivery(shipment_id, ata="2026-08-10T14:00:00+02:00")
"""

from __future__ import annotations

from typing import Any

from coffee_export.agents.base import BaseAgent, run_agent
from coffee_export.agents.registry import register_agent
from coffee_export.events import (
    CONTRACT_COMPLETED,
    CONTRACT_SIGNED,
    CUSTOMS_HOLD,
    SHIPMENT_BOOKED,
    SHIPMENT_DELIVERED,
    SHIPMENT_DEPARTED,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

# ── Customs document descriptions ──
CUSTOMS_DOC_DESCRIPTIONS: dict[str, str] = {
    "commercial_invoice": (
        "Commercial Invoice — details the sale: seller, buyer, goods, quantity, "
        "unit price, total value, Incoterm. Required for customs valuation."
    ),
    "packing_list": (
        "Packing List — bag count, net weight, gross weight, marks and numbers. "
        "Required for physical inspection."
    ),
    "certificate_of_origin": (
        "Certificate of Origin — Ethiopian Coffee & Tea Authority certificate. "
        "Determines tariff rates and quota eligibility."
    ),
    "bill_of_lading": (
        "Bill of Lading — issued by carrier at port of loading. Serves as receipt, "
        "contract of carriage, and document of title. REQUIRED before departure."
    ),
    "phytosanitary_cert": (
        "Phytosanitary Certificate — plant health inspection. Required by "
        "destination country quarantine authorities."
    ),
    "insurance_cert": (
        "Insurance Certificate — marine cargo insurance. Required for CIF contracts."
    ),
    "eudr_declaration": (
        "EUDR Declaration — EU deforestation regulation declaration. "
        "Required for all EU-bound shipments."
    ),
    "other": "Other customs document — specify in notes.",
}


class Agent6(BaseAgent):
    """Agent 6 — Logistics & Shipping Specialist."""

    agent_id = "Agent 6"
    description = "Logistics & Shipping — freight booking, customs, delivery tracking"

    def get_leads_to_process(self) -> list[dict[str, Any]]:
        """Consume CONTRACT_SIGNED events from Agent 5."""
        events = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=CONTRACT_SIGNED,
            limit=20,
        )
        if events:
            log.info(f"{self.agent_id} consumed {len(events)} CONTRACT_SIGNED events")
        return events

    def process_lead(self, event: dict[str, Any]) -> dict[str, Any]:
        """Process a CONTRACT_SIGNED event: create shipment + customs checklist."""
        event_id = event.get("id")
        payload = event.get("payload", {})

        try:
            result = self.create_shipment_from_contract(
                contract_id=payload.get("contract_id", ""),
                lead_id=payload.get("lead_id", ""),
            )
            self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)
            return result
        except Exception as e:
            log.error(f"{self.agent_id} failed to process event {event_id}: {e}", exc_info=True)
            self.bus.mark_failed(event_id, self.agent_id, str(e))
            return {"action": "failed", "error": str(e)}

    # =============================================================
    # SHIPMENT CREATION
    # =============================================================

    def create_shipment_from_contract(
        self,
        contract_id: str,
        lead_id: str = "",
    ) -> dict[str, Any]:
        """Create a shipment from a signed contract."""
        contract = self.sm.get_contract(contract_id)
        if not contract:
            return {"action": "skipped", "reason": f"contract {contract_id} not found"}

        # Create the shipment
        shipment_id = self.sm.create_shipment(
            contract_id=contract_id,
            departure_port="Djibouti",  # default export port
        )

        # Add shipment items from contract line items
        for li in contract.get("line_items", []):
            self.sm.add_shipment_item(
                shipment_id=shipment_id,
                lot_id=li.get("lot_id", ""),
                quantity_bags=li.get("quantity_bags", 0),
            )

        # Generate customs document checklist
        checklist = self.generate_customs_checklist(shipment_id)

        # Publish SHIPMENT_BOOKED
        self.bus.publish(
            event_type=SHIPMENT_BOOKED,
            entity_type="shipment",
            entity_id=shipment_id,
            payload={
                "shipment_id": shipment_id,
                "contract_id": contract_id,
                "lead_id": contract.get("lead_id", lead_id),
                "total_volume_bags": contract.get("total_volume_bags", 0),
                "departure_port": "Djibouti",
                "required_customs_docs": checklist.get("required", []),
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} created shipment {shipment_id} for contract {contract_id}, "
            f"{len(contract.get('line_items', []))} lot(s), "
            f"{len(checklist.get('required', []))} customs docs required"
        )

        return {
            "action": "shipment_created",
            "shipment_id": shipment_id,
            "contract_id": contract_id,
            "customs_checklist": checklist,
        }

    # =============================================================
    # FREIGHT BOOKING
    # =============================================================

    def book_shipment(
        self,
        shipment_id: str,
        carrier: str = "",
        vessel_name: str = "",
        bl_number: str = "",
        container_number: str = "",
        departure_port: str = "",
        arrival_port: str = "",
        etd: str = "",
        eta: str = "",
    ) -> dict[str, Any]:
        """Book freight: update shipment with carrier and voyage details."""
        self.sm.update_shipment(
            shipment_id,
            carrier=carrier,
            vessel_name=vessel_name,
            bill_of_lading_number=bl_number,
            container_number=container_number,
            departure_port=departure_port or "Djibouti",
            arrival_port=arrival_port,
            etd=etd,
            eta=eta,
            status="booked",
        )

        log.info(
            f"{self.agent_id} booked shipment {shipment_id}: "
            f"{carrier} {vessel_name}, {departure_port} → {arrival_port}, "
            f"ETD={etd}, ETA={eta}"
        )

        return {
            "action": "shipment_booked",
            "shipment_id": shipment_id,
            "carrier": carrier,
            "vessel": vessel_name,
            "bl_number": bl_number,
            "departure_port": departure_port,
            "arrival_port": arrival_port,
            "etd": etd,
            "eta": eta,
        }

    # =============================================================
    # CUSTOMS DOCUMENT MANAGEMENT
    # =============================================================

    def generate_customs_checklist(self, shipment_id: str) -> dict[str, Any]:
        """Generate customs document checklist for a shipment."""
        status = self.sm.check_customs_status(shipment_id)
        if "error" in status:
            return status

        # Create draft entries for required docs that don't exist
        existing_docs = self.sm.get_customs_documents(shipment_id)
        existing_types = {d["document_type"] for d in existing_docs}

        for doc_type in status["required"]:
            if doc_type not in existing_types:
                description = CUSTOMS_DOC_DESCRIPTIONS.get(doc_type, "")
                self.sm.add_customs_document(
                    shipment_id=shipment_id,
                    document_type=doc_type,
                    status="draft",
                    notes=description,
                )

        updated_status = self.sm.check_customs_status(shipment_id)
        return updated_status

    def submit_customs_doc(
        self,
        shipment_id: str,
        document_type: str,
        file_path: str = "",
        notes: str = "",
    ) -> dict[str, Any]:
        """Submit a customs document for clearance."""
        docs = self.sm.get_customs_documents(shipment_id)
        existing = next((d for d in docs if d["document_type"] == document_type), None)

        if existing:
            self.sm.update_customs_document(
                doc_id=existing["id"],
                status="submitted",
                file_path=file_path,
                notes=notes or existing.get("notes", ""),
            )
            doc_id = existing["id"]
            action = "updated"
        else:
            doc_id = self.sm.add_customs_document(
                shipment_id=shipment_id,
                document_type=document_type,
                file_path=file_path,
                status="submitted",
                notes=notes,
            )
            action = "created"

        log.info(
            f"{self.agent_id} submitted customs doc '{document_type}' for "
            f"shipment {shipment_id} (doc_id={doc_id})"
        )

        return {
            "action": f"customs_doc_{action}",
            "shipment_id": shipment_id,
            "document_type": document_type,
            "doc_id": doc_id,
            "status": "submitted",
        }

    def clear_customs_doc(self, doc_id: int) -> dict[str, Any]:
        """Clear a customs document (mark as cleared)."""
        self.sm.update_customs_document(doc_id=doc_id, status="cleared")
        log.info(f"{self.agent_id} cleared customs document #{doc_id}")
        return {"action": "customs_doc_cleared", "doc_id": doc_id}

    def check_customs(self, shipment_id: str) -> dict[str, Any]:
        """Check customs clearance status for a shipment."""
        return self.sm.check_customs_status(shipment_id)

    # =============================================================
    # SHIPMENT TRACKING
    # =============================================================

    def record_departure(self, shipment_id: str, atd: str = "") -> dict[str, Any]:
        """
        Record vessel departure. Requires all customs docs cleared.

        Transitions: booked → departed
        """
        customs = self.sm.check_customs_status(shipment_id)
        if not customs.get("can_depart"):
            return {
                "action": "blocked",
                "reason": "Customs documents not cleared",
                "missing": customs.get("missing", []),
                "pending": customs.get("pending", []),
            }

        from coffee_export.database.base import now_addis_iso

        self.sm.update_shipment(
            shipment_id,
            status="departed",
            atd=atd or now_addis_iso(),
        )

        # Publish SHIPMENT_DEPARTED
        shipment = self.sm.get_shipment(shipment_id)
        self.bus.publish(
            event_type=SHIPMENT_DEPARTED,
            entity_type="shipment",
            entity_id=shipment_id,
            payload={
                "shipment_id": shipment_id,
                "contract_id": shipment.get("contract_id", "") if shipment else "",
                "carrier": shipment.get("carrier", "") if shipment else "",
                "vessel": shipment.get("vessel_name", "") if shipment else "",
                "atd": atd,
            },
            published_by=self.agent_id,
        )

        # Transition to in_transit
        self.sm.update_shipment(shipment_id, status="in_transit")

        log.info(f"{self.agent_id} shipment {shipment_id} departed (ATD={atd})")
        return {"action": "departed", "shipment_id": shipment_id, "atd": atd}

    def record_arrival(self, shipment_id: str, ata: str = "") -> dict[str, Any]:
        """Record vessel arrival at destination port."""
        from coffee_export.database.base import now_addis_iso

        self.sm.update_shipment(
            shipment_id,
            status="arrived",
            ata=ata or now_addis_iso(),
        )
        log.info(f"{self.agent_id} shipment {shipment_id} arrived (ATA={ata})")
        return {"action": "arrived", "shipment_id": shipment_id, "ata": ata}

    def record_customs_hold(self, shipment_id: str, reason: str = "") -> dict[str, Any]:
        """Record a customs hold at destination. Publishes CUSTOMS_HOLD."""
        self.sm.update_shipment(shipment_id, status="customs_hold", notes=reason)

        self.bus.publish(
            event_type=CUSTOMS_HOLD,
            entity_type="shipment",
            entity_id=shipment_id,
            payload={
                "shipment_id": shipment_id,
                "reason": reason,
            },
            published_by=self.agent_id,
        )

        log.warning(f"{self.agent_id} shipment {shipment_id} on CUSTOMS HOLD: {reason}")
        return {"action": "customs_hold", "shipment_id": shipment_id, "reason": reason}

    def record_delivery(self, shipment_id: str, ata: str = "") -> dict[str, Any]:
        """
        Record final delivery. Transitions shipment to 'delivered'.

        Publishes SHIPMENT_DELIVERED + CONTRACT_COMPLETED for Agent 7.
        """
        from coffee_export.database.base import now_addis_iso

        self.sm.update_shipment(
            shipment_id,
            status="delivered",
            ata=ata or now_addis_iso(),
        )

        shipment = self.sm.get_shipment(shipment_id)
        contract_id = shipment.get("contract_id", "") if shipment else ""

        # Update contract status to completed
        if contract_id:
            self.sm.update_contract_status(contract_id, "completed")

        # Publish SHIPMENT_DELIVERED
        self.bus.publish(
            event_type=SHIPMENT_DELIVERED,
            entity_type="shipment",
            entity_id=shipment_id,
            payload={
                "shipment_id": shipment_id,
                "contract_id": contract_id,
                "ata": ata,
            },
            published_by=self.agent_id,
        )

        # Publish CONTRACT_COMPLETED
        if contract_id:
            self.bus.publish(
                event_type=CONTRACT_COMPLETED,
                entity_type="contract",
                entity_id=contract_id,
                payload={
                    "contract_id": contract_id,
                    "shipment_id": shipment_id,
                    "delivered_ts": ata or now_addis_iso(),
                },
                published_by=self.agent_id,
            )

        log.info(
            f"{self.agent_id} shipment {shipment_id} DELIVERED — "
            f"contract {contract_id} completed"
        )

        return {
            "action": "delivered",
            "shipment_id": shipment_id,
            "contract_id": contract_id,
            "ata": ata,
        }

    # =============================================================
    # STATS
    # =============================================================

    def get_logistics_stats(self) -> dict[str, Any]:
        """Get logistics statistics."""
        shipments = self.sm.get_shipments(limit=10000)
        by_status: dict[str, int] = {}
        for s in shipments:
            status = s.get("status", "unknown")
            by_status[status] = by_status.get(status, 0) + 1

        return {
            "total_shipments": len(shipments),
            "by_status": by_status,
            "in_transit": by_status.get("in_transit", 0),
            "delivered": by_status.get("delivered", 0),
            "customs_hold": by_status.get("customs_hold", 0),
        }

    def on_batch_complete(self, result: Any) -> None:
        """Log summary after batch completes."""
        if result.total > 0:
            log.info(
                f"{self.agent_id} batch complete: {result.processed} shipments created, "
                f"{result.failed} failed, {result.duration_seconds:.1f}s"
            )


# ═══════════════════════════════════════════════════════════════
# REGISTER THE AGENT
# ═══════════════════════════════════════════════════════════════

register_agent("Agent 6", Agent6)


# ═══════════════════════════════════════════════════════════════
# CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════


def run_agent6() -> Any:
    """Run Agent 6 in event-driven mode (process CONTRACT_SIGNED)."""
    return run_agent(Agent6())


def run_agent6_stats() -> dict[str, Any]:
    """Get Agent 6 logistics statistics."""
    with Agent6() as agent:
        return agent.get_logistics_stats()
