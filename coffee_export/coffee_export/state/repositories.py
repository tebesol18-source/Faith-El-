"""
Tenant-enforced repositories.
Guarantees that every business-data query is scoped to the active organization_id.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from sqlalchemy import select
from sqlalchemy.orm import Session

from coffee_export.database.models import (
    Lead,
    Lot,
    Contract,
    Shipment,
    SampleRequest,
    ComplianceDocument,
)

class BaseRepository:
    """Base class for all tenant-enforced repositories."""
    def __init__(self, session: Session, organization_id: str):
        if not organization_id:
            raise ValueError("organization_id is required for tenant-enforced repository")
        self.session = session
        self.organization_id = organization_id

class LeadRepository(BaseRepository):
    """Tenant-enforced repository for Lead-related operations."""
    def get_lead(self, lead_id: str) -> Lead | None:
        return self.session.execute(
            select(Lead).where(
                Lead.lead_id == lead_id,
                Lead.organization_id == self.organization_id,
                Lead.deleted_ts.is_(None)
            )
        ).scalar_one_or_none()

    def get_active_sequences(self) -> list[Lead]:
        return list(self.session.execute(
            select(Lead).where(
                Lead.current_state == "IN_SEQUENCE",
                Lead.organization_id == self.organization_id,
                Lead.deleted_ts.is_(None)
            )
        ).scalars().all())

    def get_uncontacted_leads(self) -> list[Lead]:
        return list(self.session.execute(
            select(Lead).where(
                Lead.current_state == "ENRICHED",
                Lead.current_agent == "Agent 3",
                Lead.organization_id == self.organization_id,
                Lead.deleted_ts.is_(None)
            )
        ).scalars().all())

class LotRepository(BaseRepository):
    """Tenant-enforced repository for Lot-related operations."""
    def get_lot(self, lot_id: str) -> Lot | None:
        return self.session.execute(
            select(Lot).where(
                Lot.lot_id == lot_id,
                Lot.organization_id == self.organization_id,
                Lot.deleted_ts.is_(None)
            )
        ).scalar_one_or_none()

    def get_all_lots(self) -> list[Lot]:
        return list(self.session.execute(
            select(Lot).where(
                Lot.organization_id == self.organization_id,
                Lot.deleted_ts.is_(None)
            )
        ).scalars().all())

    def get_depleted_lots(self) -> list[Lot]:
        return list(self.session.execute(
            select(Lot).where(
                Lot.stock_bags_remaining == 0,
                Lot.organization_id == self.organization_id,
                Lot.deleted_ts.is_(None)
            )
        ).scalars().all())

class ContractRepository(BaseRepository):
    """Tenant-enforced repository for Contract-related operations."""
    def get_contract(self, contract_id: str) -> Contract | None:
        return self.session.execute(
            select(Contract).where(
                Contract.contract_id == contract_id,
                Contract.organization_id == self.organization_id,
                Contract.deleted_ts.is_(None)
            )
        ).scalar_one_or_none()

class ShipmentRepository(BaseRepository):
    """Tenant-enforced repository for Shipment-related operations."""
    def get_shipment(self, shipment_id: str) -> Shipment | None:
        return self.session.execute(
            select(Shipment).where(
                Shipment.shipment_id == shipment_id,
                Shipment.organization_id == self.organization_id,
                Shipment.deleted_ts.is_(None)
            )
        ).scalar_one_or_none()

class SampleRepository(BaseRepository):
    """Tenant-enforced repository for SampleRequest-related operations."""
    def get_sample_request(self, sample_request_id: str) -> SampleRequest | None:
        return self.session.execute(
            select(SampleRequest).where(
                SampleRequest.sample_request_id == sample_request_id,
                SampleRequest.organization_id == self.organization_id,
                SampleRequest.deleted_ts.is_(None)
            )
        ).scalar_one_or_none()

    def get_pending_samples(self) -> list[SampleRequest]:
        return list(self.session.execute(
            select(SampleRequest).where(
                SampleRequest.status.in_(["draft", "approved"]),
                SampleRequest.organization_id == self.organization_id,
                SampleRequest.deleted_ts.is_(None)
            )
        ).scalars().all())

class ComplianceRepository(BaseRepository):
    """Tenant-enforced repository for Compliance-related operations."""
    def get_unsigned_contracts(self) -> list[Contract]:
        return list(self.session.execute(
            select(Contract).where(
                Contract.status == "pending_signature",
                Contract.organization_id == self.organization_id,
                Contract.deleted_ts.is_(None)
            )
        ).scalars().all())

class FinanceRepository(BaseRepository):
    """Tenant-enforced repository for Finance-related operations."""
    pass
