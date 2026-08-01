"""
Agent 5 — Legal & Compliance Specialist.

A compliance expert that knows exactly what documentation each destination
country requires. Creates contracts, generates compliance checklists, tracks
document status, and blocks signing until all required documents are approved.

ARCHITECTURE COMPLIANCE
-----------------------
Agent 5 only interacts with:
  ✅ StateManager — all database mutations
  ✅ EventBus — consume SAMPLE_APPROVED, publish CONTRACT_DRAFTED / CONTRACT_SIGNED
  ❌ No direct SessionLocal or database model imports

RESPONSIBILITIES
----------------
  1. Consume SAMPLE_APPROVED events from Agent 4
  2. Create contract record with line items (lot, quantity, price)
  3. Determine required compliance documents (compliance expert knowledge base)
  4. Generate compliance checklist (one entry per required document)
  5. Track document status: draft → submitted → approved (or rejected/expired)
  6. Block contract signing until ALL required documents are approved
  7. Transition contract: draft → pending_signature → signed → active
  8. Publish CONTRACT_DRAFTED (when contract created)
  9. Publish CONTRACT_SIGNED (when all docs approved + contract signed)

COMPLIANCE KNOWLEDGE BASE
-------------------------
  Universal (all contracts):
    - certificate_of_origin (Ethiopian Coffee & Tea Authority)
    - phytosanitary_cert (plant health inspection)
    - commercial_invoice
    - packing_list

  EU destinations (mandatory as of 2026):
    - eudr_attestation (deforestation regulation, GPS + farmgate price)

  US destinations:
    - fda_prior_notice (FDA prior notice filing)

  CIF contracts:
    - insurance_cert (marine insurance)

  Certification-specific (based on lot certifications):
    - organic_cert (if lot has organic certification)
    - fairtrade_cert (if lot has FT certification)
    - ra_cert (if lot has Rainforest Alliance)
    - 4c_cert (if lot has 4C)

  Shipping stage (not required for signing, but tracked):
    - bill_of_lading (issued by carrier at loading)

EVENT FLOW
----------
  Agent 4 publishes SAMPLE_APPROVED (with buyer_target_fob, volume, port)
      ↓
  Agent 5 creates contract with line items
      ↓
  Agent 5 determines required documents → creates checklist
      ↓
  Agent 5 publishes CONTRACT_DRAFTED
      ↓
  Operator provides documents (upload, submit, approve)
      ↓
  Agent 5 checks compliance status on each update
      ↓
  When all docs approved → contract → pending_signature
      ↓
  When signed → contract → signed/active
      ↓
  Agent 5 publishes CONTRACT_SIGNED → Agent 6 (Logistics) starts

USAGE
-----
    from coffee_export.agents.agent5_compliance import Agent5

    # Event-driven run (process SAMPLE_APPROVED events)
    result = run_agent(Agent5())

    # Create a contract manually
    agent = Agent5()
    contract_id = agent.create_contract_from_approval(
        lead_id="L-2026-00047",
        sample_request_id="SR-2026-0001",
        lot_id="LOT-25-0001",
        buyer_target_fob=4.50,
        buyer_target_volume_bags=200,
    )

    # Check compliance status
    status = agent.check_compliance(contract_id)

    # Submit a document
    agent.submit_document(contract_id, "certificate_of_origin", file_path="/docs/co.pdf")

    # Approve a document
    agent.approve_document(doc_id=1)

    # Sign the contract (only if all docs approved)
    agent.sign_contract(contract_id)
"""

from __future__ import annotations

from typing import Any

from coffee_export.agents.base import BaseAgent, run_agent
from coffee_export.agents.registry import register_agent
from coffee_export.events import (
    CONTRACT_DRAFTED,
    CONTRACT_SIGNED,
    SAMPLE_APPROVED,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

# ── Document type descriptions (for the compliance checklist) ──
DOCUMENT_DESCRIPTIONS: dict[str, str] = {
    "eudr_attestation": (
        "EUDR Deforestation Attestation — EU regulation requires GPS coordinates "
        "of the washing station, farmgate price paid, and a signed deforestation-free "
        "attestation. MANDATORY for all EU-bound shipments."
    ),
    "certificate_of_origin": (
        "Certificate of Origin — issued by the Ethiopian Coffee & Tea Authority (ECTA). "
        "Required for all export contracts to prove Ethiopian origin."
    ),
    "phytosanitary_cert": (
        "Phytosanitary Certificate — plant health inspection certificate issued by "
        "Ethiopian Ministry of Agriculture. Required by most destination countries."
    ),
    "commercial_invoice": (
        "Commercial Invoice — details the sale: seller, buyer, goods, quantity, "
        "unit price, total value, payment terms, Incoterm."
    ),
    "packing_list": (
        "Packing List — details each package: bag count, net weight, gross weight, "
        "marks and numbers. Required for customs clearance."
    ),
    "bill_of_lading": (
        "Bill of Lading — issued by the carrier (Maersk, MSC, etc.) at port of loading. "
        "Serves as receipt, contract of carriage, and document of title. "
        "Required for shipping (not for contract signing)."
    ),
    "insurance_cert": (
        "Insurance Certificate — marine cargo insurance. REQUIRED for CIF contracts "
        "(seller arranges insurance). Not required for FOB contracts (buyer arranges)."
    ),
    "organic_cert": (
        "Organic Certification — EU Organic / USDA NOP / JAS Organic certificate. "
        "Required ONLY if the lot is sold as organic-certified."
    ),
    "fairtrade_cert": (
        "Fairtrade Certification — FLO Cert certificate. Required ONLY if the lot "
        "is sold as Fairtrade-certified."
    ),
    "ra_cert": (
        "Rainforest Alliance Certification — required ONLY if the lot is sold as " "RA-certified."
    ),
    "4c_cert": ("4C Certification — required ONLY if the lot is sold as 4C-certified."),
    "fda_prior_notice": (
        "FDA Prior Notice — filed with US FDA before shipment arrives. "
        "Required for all US-bound food shipments."
    ),
    "other": "Other document — specify in notes.",
}

# ── Documents not required for signing (but tracked for shipping) ──
SIGNING_EXEMPT_DOCS: frozenset[str] = frozenset({"bill_of_lading"})


class Agent5(BaseAgent):
    """Agent 5 — Legal & Compliance Specialist."""

    agent_id = "Agent 5"
    description = "Legal & Compliance — contracts, ICC terms, compliance documentation"

    def get_leads_to_process(self) -> list[dict[str, Any]]:
        """Consume SAMPLE_APPROVED events from Agent 4."""
        events = self.bus.consume(
            subscriber_id=self.agent_id,
            event_type=SAMPLE_APPROVED,
            limit=20,
        )
        if events:
            log.info(f"{self.agent_id} consumed {len(events)} SAMPLE_APPROVED events")
        return events

    def process_lead(self, event: dict[str, Any]) -> dict[str, Any]:
        """Process a SAMPLE_APPROVED event: create contract + compliance checklist."""
        event_id = event.get("id")
        payload = event.get("payload", {})

        try:
            result = self.create_contract_from_approval(
                lead_id=payload.get("lead_id", ""),
                sample_request_id=payload.get("sample_request_id", ""),
                lot_id=payload.get("lot_id", ""),
                buyer_target_fob=payload.get("buyer_target_fob"),
                buyer_target_volume_bags=payload.get("buyer_target_volume_bags"),
                buyer_target_port=payload.get("buyer_target_port", ""),
                buyer_target_shipment_window=payload.get("buyer_target_shipment_window", ""),
                buyer_payment_terms=payload.get("buyer_payment_terms", ""),
            )
            self.bus.mark_consumed(event_id, subscriber_id=self.agent_id)
            return result
        except Exception as e:
            log.error(f"{self.agent_id} failed to process event {event_id}: {e}", exc_info=True)
            self.bus.mark_failed(event_id, self.agent_id, str(e))
            return {"action": "failed", "error": str(e)}

    # =============================================================
    # CONTRACT CREATION
    # =============================================================

    def create_contract_from_approval(
        self,
        lead_id: str,
        sample_request_id: str = "",
        lot_id: str = "",
        buyer_target_fob: float | None = None,
        buyer_target_volume_bags: int | None = None,
        buyer_target_port: str = "",
        buyer_target_shipment_window: str = "",
        buyer_payment_terms: str = "",
    ) -> dict[str, Any]:
        """
        Create a contract from a sample approval.

        This is the main entry point — called when Agent 4 publishes
        SAMPLE_APPROVED with the buyer's target terms.
        """
        lead = self.sm.get_lead(lead_id)
        if not lead:
            return {"action": "skipped", "reason": f"lead {lead_id} not found"}

        # Verify sample_request_id exists (FK constraint), or null it out
        sr_id = sample_request_id or None
        if sr_id:
            sr = self.sm.get_sample_request(sr_id)
            if not sr:
                sr_id = None  # sample request doesn't exist, don't reference it

        # Get lot details for the contract line item
        lot = self.sm.get_lot(lot_id) if lot_id else None

        # Determine incoterm (default FOB)
        incoterm = "FOB"
        if buyer_target_port and "cif" in buyer_target_port.lower():
            incoterm = "CIF"

        # Calculate total value
        unit_price = buyer_target_fob or 0.0
        volume = buyer_target_volume_bags or 0
        total_value = unit_price * volume

        # Create the contract
        contract_id = self.sm.create_contract(
            lead_id=lead_id,
            sample_request_id=sr_id,
            incoterm=incoterm,
            currency="USD",
            total_volume_bags=volume,
            total_value=total_value,
            shipment_window_start=buyer_target_shipment_window or "",
            payment_terms=buyer_payment_terms or "LC at sight",
        )

        # Add line item (lot → contract)
        if lot_id and lot:
            self.sm.add_contract_line_item(
                contract_id=contract_id,
                lot_id=lot_id,
                quantity_bags=volume,
                unit_price=unit_price,
            )

        # Generate compliance checklist
        checklist = self.generate_compliance_checklist(contract_id)

        # Publish CONTRACT_DRAFTED
        self.bus.publish(
            event_type=CONTRACT_DRAFTED,
            entity_type="contract",
            entity_id=contract_id,
            payload={
                "contract_id": contract_id,
                "lead_id": lead_id,
                "lot_id": lot_id,
                "total_volume_bags": volume,
                "total_value": total_value,
                "incoterm": incoterm,
                "buyer_company": lead.get("company_name", ""),
                "buyer_target_port": buyer_target_port,
                "required_documents": checklist["required"],
                "missing_documents": checklist["missing"],
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} created contract {contract_id} for lead {lead_id} "
            f"(lot={lot_id}, {volume} bags @ ${unit_price}/bag = ${total_value}), "
            f"incoterm={incoterm}, {len(checklist['required'])} required documents"
        )

        return {
            "action": "contract_created",
            "contract_id": contract_id,
            "lead_id": lead_id,
            "lot_id": lot_id,
            "total_volume_bags": volume,
            "total_value": total_value,
            "incoterm": incoterm,
            "compliance_checklist": checklist,
        }

    # =============================================================
    # COMPLIANCE CHECKLIST
    # =============================================================

    def generate_compliance_checklist(self, contract_id: str) -> dict[str, Any]:
        """
        Generate the compliance document checklist for a contract.

        Creates a compliance_document entry (status='draft') for each
        required document type that doesn't already exist.

        Returns the compliance status dict.
        """
        status = self.sm.check_compliance_status(contract_id)

        if "error" in status:
            return status

        # Create draft entries for missing documents
        existing_docs = self.sm.get_compliance_documents(contract_id)
        existing_types = {d["document_type"] for d in existing_docs}

        created_docs: list[str] = []
        for doc_type in status["required"]:
            if doc_type not in existing_types:
                description = DOCUMENT_DESCRIPTIONS.get(doc_type, "")
                self.sm.add_compliance_document(
                    contract_id=contract_id,
                    document_type=doc_type,
                    status="draft",
                    notes=description,
                )
                created_docs.append(doc_type)

        if created_docs:
            log.info(
                f"{self.agent_id} created {len(created_docs)} compliance document "
                f"entries for contract {contract_id}: {', '.join(created_docs)}"
            )

        # Re-check status after creating documents
        updated_status = self.sm.check_compliance_status(contract_id)
        updated_status["created_now"] = created_docs
        return updated_status

    def get_compliance_checklist(self, contract_id: str) -> dict[str, Any]:
        """Get the compliance checklist (human-readable format)."""
        status = self.sm.check_compliance_status(contract_id)
        if "error" in status:
            return status

        checklist_items: list[dict[str, str]] = []
        for doc in status.get("documents", []):
            doc_type = doc.get("document_type", "")
            doc_status = doc.get("status", "draft")
            description = DOCUMENT_DESCRIPTIONS.get(doc_type, "")

            status_icon = {
                "approved": "✅",
                "submitted": "📤",
                "draft": "📝",
                "expired": "⏰",
                "rejected": "❌",
            }.get(doc_status, "❓")

            required_label = "REQUIRED" if doc_type in status.get("required", []) else "optional"
            signing_label = " (exempt from signing)" if doc_type in SIGNING_EXEMPT_DOCS else ""

            checklist_items.append(
                {
                    "icon": status_icon,
                    "document_type": doc_type,
                    "status": doc_status,
                    "required": required_label,
                    "description": description,
                    "signing_exempt": signing_label,
                    "doc_id": doc.get("id"),
                    "file_path": doc.get("file_path") or "",
                    "notes": doc.get("notes") or "",
                }
            )

        return {
            "contract_id": contract_id,
            "can_sign": status.get("can_sign", False),
            "total_docs": status.get("total_docs", 0),
            "approved": status.get("approved", 0),
            "pending": status.get("pending", 0),
            "missing": status.get("missing", []),
            "checklist": checklist_items,
        }

    # =============================================================
    # DOCUMENT MANAGEMENT
    # =============================================================

    def submit_document(
        self,
        contract_id: str,
        document_type: str,
        file_path: str = "",
        issued_date: str = "",
        expiry_date: str = "",
        notes: str = "",
    ) -> dict[str, Any]:
        """
        Submit a compliance document.

        If the document entry already exists (from checklist generation),
        update it. Otherwise, create a new entry.
        """
        docs = self.sm.get_compliance_documents(contract_id)
        existing = next((d for d in docs if d["document_type"] == document_type), None)

        if existing:
            self.sm.update_compliance_document(
                doc_id=existing["id"],
                status="submitted",
                file_path=file_path,
                issued_date=issued_date,
                expiry_date=expiry_date,
                notes=notes or existing.get("notes", ""),
            )
            doc_id = existing["id"]
            action = "updated"
        else:
            doc_id = self.sm.add_compliance_document(
                contract_id=contract_id,
                document_type=document_type,
                file_path=file_path,
                issued_date=issued_date,
                expiry_date=expiry_date,
                status="submitted",
                notes=notes,
            )
            action = "created"

        log.info(
            f"{self.agent_id} submitted document '{document_type}' for "
            f"contract {contract_id} (doc_id={doc_id})"
        )

        return {
            "action": f"document_{action}",
            "contract_id": contract_id,
            "document_type": document_type,
            "doc_id": doc_id,
            "status": "submitted",
        }

    def approve_document(self, doc_id: int) -> dict[str, Any]:
        """Approve a submitted compliance document."""
        self.sm.update_compliance_document(
            doc_id=doc_id,
            status="approved",
        )

        log.info(f"{self.agent_id} approved compliance document #{doc_id}")

        # Find the contract_id via StateManager (no direct model import)
        doc = self.sm.get_compliance_document(doc_id)
        if doc:
            contract_id = doc.get("contract_id", "")
            status = self.sm.check_compliance_status(contract_id)
            if status.get("can_sign"):
                # All docs approved → transition to pending_signature
                self.sm.update_contract_status(
                    contract_id,
                    "pending_signature",
                    notes="All compliance documents approved — ready for signature",
                )
                log.info(
                    f"{self.agent_id} contract {contract_id} → pending_signature "
                    f"(all compliance docs approved)"
                )
                return {
                    "action": "document_approved",
                    "doc_id": doc_id,
                    "contract_id": contract_id,
                    "contract_status": "pending_signature",
                    "all_docs_approved": True,
                }

        return {
            "action": "document_approved",
            "doc_id": doc_id,
            "all_docs_approved": False,
        }

    def reject_document(self, doc_id: int, reason: str = "") -> dict[str, Any]:
        """Reject a submitted compliance document."""
        self.sm.update_compliance_document(
            doc_id=doc_id,
            status="rejected",
            notes=reason,
        )

        log.warning(f"{self.agent_id} rejected compliance document #{doc_id}: {reason}")

        return {
            "action": "document_rejected",
            "doc_id": doc_id,
            "reason": reason,
        }

    # =============================================================
    # CONTRACT SIGNING
    # =============================================================

    def sign_contract(self, contract_id: str) -> dict[str, Any]:
        """
        Sign a contract.

        BLOCKED if compliance documents are not all approved.
        Only works when check_compliance_status().can_sign == True.
        """
        status = self.sm.check_compliance_status(contract_id)
        if "error" in status:
            return {"action": "skipped", "reason": status["error"]}

        if not status.get("can_sign"):
            missing = status.get("missing", [])
            pending = status.get("pending", 0)
            return {
                "action": "blocked",
                "reason": "Compliance documents not complete",
                "missing_documents": missing,
                "pending_count": pending,
                "approved": status.get("approved", 0),
                "total_required": len(status.get("required", [])),
            }

        # All docs approved → sign the contract
        contract = self.sm.get_contract(contract_id)
        if not contract:
            return {"action": "skipped", "reason": "contract not found"}

        self.sm.update_contract_status(contract_id, "signed")

        # Transition lead to CONTRACTED
        lead_id = contract.get("lead_id", "")
        self.sm.update_lead_state(
            lead_id=lead_id,
            new_state="CONTRACTED",
            agent=self.agent_id,
            notes=f"Contract {contract_id} signed",
            current_agent="Agent 6",
            next_action_agent="Agent 6",
        )

        # Publish CONTRACT_SIGNED
        self.bus.publish(
            event_type=CONTRACT_SIGNED,
            entity_type="contract",
            entity_id=contract_id,
            payload={
                "contract_id": contract_id,
                "lead_id": lead_id,
                "total_value": contract.get("total_value"),
                "total_volume_bags": contract.get("total_volume_bags"),
                "incoterm": contract.get("incoterm"),
                "buyer_company": "",
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} contract {contract_id} SIGNED — "
            f"lead {lead_id} → CONTRACTED, handed to Agent 6"
        )

        return {
            "action": "contract_signed",
            "contract_id": contract_id,
            "lead_id": lead_id,
            "lead_state": "CONTRACTED",
            "next_agent": "Agent 6",
        }

    # =============================================================
    # COMPLIANCE STATUS (convenience)
    # =============================================================

    def check_compliance(self, contract_id: str) -> dict[str, Any]:
        """Check compliance status. Returns the full checklist."""
        return self.get_compliance_checklist(contract_id)

    def get_contract_stats(self) -> dict[str, Any]:
        """Get contract statistics."""
        contracts = self.sm.get_contracts(limit=10000)
        by_status: dict[str, int] = {}
        total_value = 0.0
        for c in contracts:
            status = c.get("status", "unknown")
            by_status[status] = by_status.get(status, 0) + 1
            total_value += c.get("total_value") or 0

        return {
            "total_contracts": len(contracts),
            "by_status": by_status,
            "total_value": round(total_value, 2),
        }

    def on_batch_complete(self, result: Any) -> None:
        """Log summary after batch completes."""
        if result.total > 0:
            log.info(
                f"{self.agent_id} batch complete: {result.processed} contracts created, "
                f"{result.failed} failed, {result.duration_seconds:.1f}s"
            )

    # =============================================================
    # INVOICE GENERATOR
    # =============================================================

    def generate_invoice(self, contract_id: str, save_to_file: bool = True) -> dict[str, Any]:
        """
        Generate a commercial invoice from a contract.

        The commercial invoice is one of the required compliance documents
        for every contract. It contains:
          - Seller (exporter) details
          - Buyer (importer) details
          - Invoice number, date, contract reference
          - Line items: lot ID, description, quantity, unit price, total
          - Subtotal, total value
          - Incoterm, payment terms, currency
          - Country of origin

        If save_to_file is True, the invoice is saved as a text file to
        data/docs/ and registered as a compliance document (status='submitted').

        Returns a dict with invoice_number, file_path, and invoice_text.
        """
        contract = self.sm.get_contract(contract_id)
        if not contract:
            return {"error": f"contract {contract_id} not found"}

        lead = self.sm.get_lead(contract.get("lead_id", ""))
        if not lead:
            return {"error": f"lead not found for contract {contract_id}"}

        # Generate invoice number
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone(timedelta(hours=3)))

        # now is already set above
        invoice_number = f"INV-{now.strftime('%Y%m%d')}-{contract_id[-4:]}"

        # Build line items
        line_items_text: list[str] = []
        subtotal = 0.0
        for i, li in enumerate(contract.get("line_items", []), 1):
            lot = self.sm.get_lot(li.get("lot_id", ""))
            lot_desc = ""
            if lot:
                lot_desc = (
                    f"{lot.get('region', '')} {lot.get('process', '')} "
                    f"Screen {lot.get('screen_size', '')} "
                    f"Score {lot.get('cupping_score', '')} "
                    f"Crop {lot.get('crop_year', '')}"
                )

            qty = li.get("quantity_bags", 0)
            unit_price = li.get("unit_price", 0)
            line_total = li.get("total_price") or (qty * unit_price)
            subtotal += line_total

            line_items_text.append(
                f"  {i}. {li.get('lot_id', ''):<20} | {lot_desc:<55} | "
                f"{qty:>5} bags | ${unit_price:>7.2f}/bag | ${line_total:>10,.2f}"
            )

        total_value = contract.get("total_value") or subtotal
        currency = contract.get("currency", "USD")
        incoterm = contract.get("incoterm", "FOB")
        payment_terms = contract.get("payment_terms", "LC at sight")
        contract_number = contract.get("contract_number", contract_id)

        # Build the invoice text
        invoice_lines = [
            "=" * 80,
            "                    COMMERCIAL INVOICE",
            "=" * 80,
            "",
            f"  Invoice Number:    {invoice_number}",
            f"  Invoice Date:      {now.strftime('%Y-%m-%d')}",
            f"  Contract Number:   {contract_number}",
            f"  Contract Date:     {contract.get('contract_date', '')}",
            "",
            "  ── SELLER (Exporter) ──",
            "  Ethiopian Coffee Export PLC",
            "  Bole Road, Addis Ababa, Ethiopia",
            "  Phone: +251 11 555 0100",
            "  Email: exports@coffeeexport.et",
            "  VAT: ET0001234567",
            "",
            "  ── BUYER (Importer) ──",
            f"  {lead.get('company_name', '')}",
            f"  {lead.get('headquarters_country', '')}",
            f"  Lead ID: {lead.get('lead_id', '')}",
            "",
            "  ── SHIPMENT TERMS ──",
            f"  Incoterm:          {incoterm} (Djibouti)",
            f"  Payment Terms:     {payment_terms}",
            f"  Currency:          {currency}",
            "  Country of Origin: Ethiopia",
            "  Commodity:         Green Coffee (Arabica)",
            "",
            "  ── LINE ITEMS ──",
            f"  {'#':<3} {'Lot ID':<20} | {'Description':<55} | {'Qty':>5} | {'Unit Price':>10} | {'Total':>12}",
            "  " + "-" * 76,
        ]

        invoice_lines.extend(line_items_text)

        invoice_lines.extend(
            [
                "  " + "-" * 76,
                f"  {'SUBTOTAL:':<83} {currency} {subtotal:>12,.2f}",
                f"  {'FREIGHT & INSURANCE:':<83} {currency} {'(per Incoterm)':>12}",
                f"  {'TOTAL INVOICE VALUE:':<83} {currency} {total_value:>12,.2f}",
                "",
                "  ── BANKING DETAILS ──",
                "  Bank: Commercial Bank of Ethiopia",
                "  SWIFT: CBETETAA",
                "  Account: 0100-0123-4567-8901",
                "  Beneficiary: Ethiopian Coffee Export PLC",
                "",
                "  ── DECLARATION ──",
                "  We hereby certify that the above mentioned goods are of",
                "  Ethiopian origin, and that the particulars stated are correct.",
                "",
                "  Authorized Signature: _______________________________",
                f"  Date: {now.strftime('%Y-%m-%d')}",
                "",
                "=" * 80,
            ]
        )

        invoice_text = "\n".join(invoice_lines)

        # Save to file
        file_path = ""
        if save_to_file:
            from coffee_export.config import DOCS_DIR

            invoices_dir = DOCS_DIR / "invoices"
            invoices_dir.mkdir(parents=True, exist_ok=True)
            file_path = invoices_dir / f"{invoice_number}.txt"
            file_path.write_text(invoice_text, encoding="utf-8")
            log.info(f"{self.agent_id} generated invoice {invoice_number} → {file_path}")

            # Register as compliance document
            self.submit_document(
                contract_id=contract_id,
                document_type="commercial_invoice",
                file_path=str(file_path),
                issued_date=now.strftime("%Y-%m-%d"),
                notes=f"Auto-generated commercial invoice {invoice_number}",
            )

        return {
            "action": "invoice_generated",
            "invoice_number": invoice_number,
            "contract_id": contract_id,
            "buyer": lead.get("company_name", ""),
            "total_value": total_value,
            "currency": currency,
            "line_item_count": len(contract.get("line_items", [])),
            "file_path": str(file_path) if file_path else "",
            "invoice_text": invoice_text,
        }

    # =============================================================
    # PACKING LIST GENERATOR
    # =============================================================

    def generate_packing_list(self, contract_id: str, save_to_file: bool = True) -> dict[str, Any]:
        """
        Generate a packing list from a contract.

        The packing list details each package: bag count, net weight,
        gross weight, marks and numbers. Required for customs clearance.

        If save_to_file is True, the packing list is saved as a text file
        and registered as a compliance document (status='submitted').

        Returns a dict with packing_list_number, file_path, and text.
        """
        contract = self.sm.get_contract(contract_id)
        if not contract:
            return {"error": f"contract {contract_id} not found"}

        lead = self.sm.get_lead(contract.get("lead_id", ""))
        if not lead:
            return {"error": f"lead not found for contract {contract_id}"}

        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone(timedelta(hours=3)))

        # now is already set above
        pl_number = f"PL-{now.strftime('%Y%m%d')}-{contract_id[-4:]}"

        # Build packing items
        items_text: list[str] = []
        total_bags = 0
        total_net_kg = 0.0
        total_gross_kg = 0.0

        for i, li in enumerate(contract.get("line_items", []), 1):
            lot = self.sm.get_lot(li.get("lot_id", ""))
            lot_id = li.get("lot_id", "")
            qty_bags = li.get("quantity_bags", 0)

            bag_size = lot.get("bag_size_kg", 60) if lot else 60
            net_kg = qty_bags * bag_size
            # Gross weight = net + 0.15kg per bag (jute bag weight)
            gross_kg = net_kg + (qty_bags * 0.15)

            total_bags += qty_bags
            total_net_kg += net_kg
            total_gross_kg += gross_kg

            region = lot.get("region", "") if lot else ""
            process = lot.get("process", "") if lot else ""
            crop_year = lot.get("crop_year", "") if lot else ""

            marks = f"ET-{region[:3].upper()}-{lot_id[-4:]}"

            items_text.append(
                f"  {i}. {lot_id:<20} | {region} {process} {crop_year:<30} | "
                f"{qty_bags:>5} bags | {net_kg:>8.1f} kg | {gross_kg:>8.1f} kg | {marks}"
            )

        contract_number = contract.get("contract_number", contract_id)

        pl_lines = [
            "=" * 90,
            "                    PACKING LIST",
            "=" * 90,
            "",
            f"  Packing List No:  {pl_number}",
            f"  Date:             {now.strftime('%Y-%m-%d')}",
            f"  Contract Number:  {contract_number}",
            "",
            "  ── SELLER ──",
            "  Ethiopian Coffee Export PLC",
            "  Bole Road, Addis Ababa, Ethiopia",
            "",
            "  ── BUYER ──",
            f"  {lead.get('company_name', '')}",
            f"  {lead.get('headquarters_country', '')}",
            "",
            "  ── SHIPMENT ──",
            "  Commodity:        Green Coffee (Arabica)",
            "  Country of Origin: Ethiopia",
            "  Port of Loading:  Djibouti",
            f"  Incoterm:         {contract.get('incoterm', 'FOB')}",
            "",
            "  ── PACKAGE DETAILS ──",
            f"  {'#':<3} {'Lot ID':<20} | {'Description':<37} | {'Bags':>5} | "
            f"{'Net kg':>8} | {'Gross kg':>8} | {'Marks':<12}",
            "  " + "-" * 86,
        ]

        pl_lines.extend(items_text)

        pl_lines.extend(
            [
                "  " + "-" * 86,
                f"  {'TOTALS:':<64} {total_bags:>5} bags | {total_net_kg:>8.1f} kg | {total_gross_kg:>8.1f} kg",
                "",
                "  ── PACKAGING ──",
                "  Bag Type:          Jute bags (60 kg standard)",
                "  Pallet:            No pallets (loose stow)",
                "  Container:         20' FCL (standard)",
                "",
                "  ── DECLARATION ──",
                "  We hereby certify that the above packing details are correct",
                "  and that the goods have been properly packed for export.",
                "",
                "  Authorized Signature: _______________________________",
                f"  Date: {now.strftime('%Y-%m-%d')}",
                "",
                "=" * 90,
            ]
        )

        pl_text = "\n".join(pl_lines)

        # Save to file
        file_path = ""
        if save_to_file:
            from coffee_export.config import DOCS_DIR

            pl_dir = DOCS_DIR / "packing_lists"
            pl_dir.mkdir(parents=True, exist_ok=True)
            file_path = pl_dir / f"{pl_number}.txt"
            file_path.write_text(pl_text, encoding="utf-8")
            log.info(f"{self.agent_id} generated packing list {pl_number} → {file_path}")

            # Register as compliance document
            self.submit_document(
                contract_id=contract_id,
                document_type="packing_list",
                file_path=str(file_path),
                issued_date=now.strftime("%Y-%m-%d"),
                notes=f"Auto-generated packing list {pl_number}",
            )

        return {
            "action": "packing_list_generated",
            "packing_list_number": pl_number,
            "contract_id": contract_id,
            "buyer": lead.get("company_name", ""),
            "total_bags": total_bags,
            "total_net_kg": round(total_net_kg, 1),
            "total_gross_kg": round(total_gross_kg, 1),
            "file_path": str(file_path) if file_path else "",
            "packing_list_text": pl_text,
        }

    # =============================================================
    # BULK GENERATION
    # =============================================================

    def generate_all_documents(self, contract_id: str) -> dict[str, Any]:
        """
        Auto-generate all documents that can be derived from contract data.

        Currently generates:
          - Commercial invoice (from line items + totals)
          - Packing list (from line items + bag weights)

        Other documents (certificate of origin, phytosanitary, EUDR, etc.)
        require external authorities and cannot be auto-generated.
        """
        results: dict[str, Any] = {}

        invoice_result = self.generate_invoice(contract_id)
        results["invoice"] = invoice_result

        pl_result = self.generate_packing_list(contract_id)
        results["packing_list"] = pl_result

        log.info(
            f"{self.agent_id} auto-generated {len(results)} document(s) for "
            f"contract {contract_id}: invoice + packing list"
        )

        return {
            "action": "documents_generated",
            "contract_id": contract_id,
            "generated": list(results.keys()),
            "results": results,
        }

    # =============================================================
    # LLM-POWERED METHODS (AI Gateway integration)
    # =============================================================

    def review_contract_with_llm(self, contract_id: str) -> dict[str, Any]:
        """
        Use LLM to review a contract for risks and compliance gaps.

        Falls back to deterministic check_compliance() if LLM fails.
        """
        from coffee_export.ai import AIGateway, llm_review_contract

        contract = self.sm.get_contract(contract_id)
        if not contract:
            return {"error": "contract not found"}

        lead = self.sm.get_lead(contract.get("lead_id", ""))
        compliance = self.sm.check_compliance_status(contract_id)

        gateway = AIGateway()
        result = llm_review_contract(
            gateway=gateway,
            contract=contract,
            lead=lead or {},
            compliance_status=compliance,
        )

        if result.get("llm_used"):
            log.info(
                f"{self.agent_id} LLM reviewed contract {contract_id}: "
                f"risk={result.get('risk_level', '?')} ({result.get('provider', '?')})"
            )
        return result


# ═══════════════════════════════════════════════════════════════
# REGISTER THE AGENT
# ═══════════════════════════════════════════════════════════════

register_agent("Agent 5", Agent5)


# ═══════════════════════════════════════════════════════════════
# CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════


def run_agent5() -> Any:
    """Run Agent 5 in event-driven mode (process SAMPLE_APPROVED)."""
    return run_agent(Agent5())


def run_agent5_stats() -> dict[str, Any]:
    """Get Agent 5 contract statistics."""
    with Agent5() as agent:
        return agent.get_contract_stats()
