"""
AdminStateManager — system-wide administrative repository layer.

Provides unscoped global access for platform administration, tenant management,
health checks, background infrastructure, and global market feeds.
"""

from __future__ import annotations

from typing import Any
from sqlalchemy import select

from coffee_export.state.state_manager import StateManager
from coffee_export.database.models import Lead, Lot, Contract, Shipment, SampleRequest

class AdminStateManager(StateManager):
    """
    Global system repository layer for legitimate cross-tenant actions.
    Should never be used by normal tenant-level operator sessions or standard AI agent flows.
    """
    def __init__(self) -> None:
        # Initialize with 'org-system' context
        super().__init__(organization_id="org-system")

    def get_global_lead(self, lead_id: str) -> dict[str, Any] | None:
        """Global un-scoped read for a Lead (admin use only)."""
        lead = self.session.get(Lead, lead_id)
        if not lead:
            return None
        result = {c.name: getattr(lead, c.name) for c in lead.__table__.columns}
        result["tags"] = [t.tag for t in lead.tags]
        return result

    def get_global_lot(self, lot_id: str) -> dict[str, Any] | None:
        """Global un-scoped read for a Lot (admin use only)."""
        lot = self.session.get(Lot, lot_id)
        if not lot:
            return None
        return {c.name: getattr(lot, c.name) for c in lot.__table__.columns}

    def get_global_contract(self, contract_id: str) -> dict[str, Any] | None:
        """Global un-scoped read for a Contract (admin use only)."""
        contract = self.session.get(Contract, contract_id)
        if not contract:
            return None
        return {c.name: getattr(contract, c.name) for c in contract.__table__.columns}
