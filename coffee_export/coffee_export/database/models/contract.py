"""
Contract & Compliance models — contracts, contract_line_items,
compliance_documents.

Owned by Agent 5. Contracts are created when a sample is approved;
they link a lead to one or more lots with agreed terms.
"""

from __future__ import annotations

from sqlalchemy import REAL, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class Contract(Base):
    """Contract records. Links a lead to lots with agreed terms."""

    __tablename__ = "contracts"

    contract_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lead_id: Mapped[str] = mapped_column(Text, ForeignKey("leads.lead_id"), nullable=False)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    sample_request_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("sample_requests.sample_request_id")
    )
    contract_number: Mapped[str | None] = mapped_column(Text, unique=True)
    contract_date: Mapped[str] = mapped_column(Text, nullable=False)
    contract_template: Mapped[str] = mapped_column(Text, default="ICC_ECE_7_21")
    incoterm: Mapped[str] = mapped_column(Text, default="FOB")
    currency: Mapped[str] = mapped_column(Text, default="USD")
    total_volume_bags: Mapped[int | None] = mapped_column(Integer)
    total_value: Mapped[float | None] = mapped_column(REAL)
    shipment_window_start: Mapped[str | None] = mapped_column(Text)
    shipment_window_end: Mapped[str | None] = mapped_column(Text)
    payment_terms: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="draft")
    signed_ts: Mapped[str | None] = mapped_column(Text)
    is_repeat: Mapped[int] = mapped_column(Integer, default=0)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    line_items: Mapped[list[ContractLineItem]] = relationship(
        back_populates="contract", cascade="all, delete-orphan"
    )
    compliance_documents: Mapped[list[ComplianceDocument]] = relationship(
        back_populates="contract", cascade="all, delete-orphan"
    )
    # Shipment relationship is defined from the Shipment side (logistics.py)
    # to avoid circular import. Access via contract.shipments after both
    # modules are loaded.

    __table_args__ = (
        CheckConstraint(
            "incoterm IN ('FOB', 'CIF', 'EXW', 'FCA', 'CFR')", name="ck_contracts_incoterm"
        ),
        CheckConstraint(
            "status IN ('draft', 'pending_signature', 'signed', 'active', "
            "'completed', 'cancelled', 'breached')",
            name="ck_contracts_status",
        ),
        Index("ix_contracts_lead", "lead_id"),
        Index("ix_contracts_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Contract {self.contract_id}: {self.contract_number} ({self.status})>"


class ContractLineItem(Base):
    """Junction table — a contract can include multiple lots."""

    __tablename__ = "contract_line_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contract_id: Mapped[str] = mapped_column(
        Text, ForeignKey("contracts.contract_id", ondelete="CASCADE"), nullable=False
    )
    lot_id: Mapped[str] = mapped_column(Text, ForeignKey("lots.lot_id"), nullable=False)
    quantity_bags: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(REAL, nullable=False)
    total_price: Mapped[float | None] = mapped_column(REAL)
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    contract: Mapped[Contract] = relationship(back_populates="line_items")

    __table_args__ = (
        Index("ix_contract_line_items_contract", "contract_id"),
        Index("ix_contract_line_items_lot", "lot_id"),
    )

    def __repr__(self) -> str:
        return f"<ContractLineItem contract={self.contract_id} lot={self.lot_id} qty={self.quantity_bags}>"


class ComplianceDocument(Base):
    """Legal and compliance documents per contract."""

    __tablename__ = "compliance_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contract_id: Mapped[str] = mapped_column(
        Text, ForeignKey("contracts.contract_id", ondelete="CASCADE"), nullable=False
    )
    document_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text)
    organization_id: Mapped[str] = mapped_column(Text, nullable=False, default="org-system")
    issued_date: Mapped[str | None] = mapped_column(Text)
    expiry_date: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="draft")
    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_ts: Mapped[str | None] = mapped_column(Text)

    contract: Mapped[Contract] = relationship(back_populates="compliance_documents")

    __table_args__ = (
        CheckConstraint(
            "document_type IN ('eudr_attestation', 'certificate_of_origin', "
            "'phytosanitary_cert', 'organic_cert', 'fairtrade_cert', 'ra_cert', "
            "'4c_cert', 'commercial_invoice', 'packing_list', 'bill_of_lading', "
            "'insurance_cert', 'other')",
            name="ck_compliance_docs_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'expired', 'rejected')",
            name="ck_compliance_docs_status",
        ),
        Index("ix_compliance_docs_contract", "contract_id"),
        Index("ix_compliance_docs_type", "document_type"),
    )

    def __repr__(self) -> str:
        return f"<ComplianceDocument {self.id}: {self.document_type} ({self.status})>"
