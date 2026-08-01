"""
Financial models - invoices, payments, commissions, costs, profits.

Implements the financial layer of the ERP:
  - Invoice:    generated from a signed contract (1 per contract).
  - Payment:    incoming money from buyer (N per invoice).
  - Commission: the platform's 2% cut (1 per contract).
  - Cost:       operational expenses (freight, insurance, docs).
  - Profit:     calculated net margin per contract.

Architecture: Auto-generated on CONTRACT_SIGNED. Payments and Costs
are logged as they occur. Profit is recalculated on every change.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffee_export.database.base import Base


class Invoice(Base):
    """A commercial invoice issued to a buyer for a contract.

    Generated automatically when a contract is signed.
    Status workflow:
      issued -> partial -> paid -> overdue (or cancelled)
    """

    __tablename__ = "invoices"

    invoice_id: Mapped[str] = mapped_column(Text, primary_key=True)  # INV-2026-0001
    contract_id: Mapped[str] = mapped_column(
        Text, ForeignKey("contracts.contract_id", ondelete="CASCADE"), nullable=False
    )
    deal_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("deals.deal_id", ondelete="SET NULL")
    )
    lead_id: Mapped[str] = mapped_column(
        Text, ForeignKey("leads.lead_id", ondelete="CASCADE"), nullable=False
    )

    invoice_number: Mapped[str] = mapped_column(Text, nullable=False)  # human-readable
    issue_date: Mapped[str] = mapped_column(Text, nullable=False)
    due_date: Mapped[str] = mapped_column(Text, nullable=False)

    currency: Mapped[str] = mapped_column(Text, nullable=False, default="USD")
    subtotal_usd: Mapped[float] = mapped_column(Float, nullable=False)
    tax_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_usd: Mapped[float] = mapped_column(Float, nullable=False)

    status: Mapped[str] = mapped_column(Text, nullable=False, default="issued")
    # issued | partial | paid | overdue | cancelled

    paid_amount_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    outstanding_balance_usd: Mapped[float] = mapped_column(Float, nullable=False)

    payment_terms: Mapped[str | None] = mapped_column(Text)  # e.g., "30 days net", "LC at sight"

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    payments: Mapped[list[Payment]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('issued', 'partial', 'paid', 'overdue', 'cancelled')",
            name="ck_invoices_status",
        ),
        Index("ix_invoices_contract", "contract_id"),
        Index("ix_invoices_lead", "lead_id"),
        Index("ix_invoices_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_id}: {self.total_usd} ({self.status})>"


class Payment(Base):
    """An incoming payment from a buyer against an invoice.

    One invoice can have multiple payments (e.g., 30% deposit, 70% balance).
    """

    __tablename__ = "payments"

    payment_id: Mapped[str] = mapped_column(Text, primary_key=True)  # PAY-2026-0001
    invoice_id: Mapped[str] = mapped_column(
        Text, ForeignKey("invoices.invoice_id", ondelete="CASCADE"), nullable=False
    )
    contract_id: Mapped[str | None] = mapped_column(Text)  # denormalized for easy querying
    lead_id: Mapped[str | None] = mapped_column(Text)      # denormalized

    amount_usd: Mapped[float] = mapped_column(Float, nullable=False)
    payment_date: Mapped[str] = mapped_column(Text, nullable=False)

    payment_method: Mapped[str] = mapped_column(Text, nullable=False)
    # wire | lc | paypal | crypto | other

    reference_number: Mapped[str | None] = mapped_column(Text)  # bank ref
    bank_name: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(Text, nullable=False, default="confirmed")
    # pending | confirmed | disputed

    notes: Mapped[str | None] = mapped_column(Text)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)

    invoice: Mapped[Invoice] = relationship(back_populates="payments")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'disputed')",
            name="ck_payments_status",
        ),
        CheckConstraint(
            "payment_method IN ('wire', 'lc', 'paypal', 'crypto', 'other')",
            name="ck_payments_method",
        ),
        Index("ix_payments_invoice", "invoice_id"),
        Index("ix_payments_date", "payment_date"),
    )

    def __repr__(self) -> str:
        return f"<Payment {self.payment_id}: {self.amount_usd} ({self.payment_method})>"


class Commission(Base):
    """The platform's commission (2% of contract value).

    One commission per contract.
    Status: accrued (contract signed) -> earned (invoice paid) -> paid (seller paid out)
    """

    __tablename__ = "commissions"

    commission_id: Mapped[str] = mapped_column(Text, primary_key=True)  # COMM-2026-0001
    contract_id: Mapped[str] = mapped_column(
        Text, ForeignKey("contracts.contract_id", ondelete="CASCADE"), nullable=False
    )
    deal_id: Mapped[str | None] = mapped_column(Text)

    rate_pct: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    base_value_usd: Mapped[float] = mapped_column(Float, nullable=False)
    commission_usd: Mapped[float] = mapped_column(Float, nullable=False)

    status: Mapped[str] = mapped_column(Text, nullable=False, default="accrued")
    # accrued | earned | paid

    paid_ts: Mapped[str | None] = mapped_column(Text)
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('accrued', 'earned', 'paid')",
            name="ck_commissions_status",
        ),
        Index("ix_commissions_contract", "contract_id"),
        Index("ix_commissions_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Commission {self.commission_id}: {self.commission_usd} ({self.status})>"


class Cost(Base):
    """Operational costs associated with fulfilling a contract.

    Freight, insurance, inspection, courier, bank charges, etc.
    Used to calculate actual profit.
    """

    __tablename__ = "costs"

    cost_id: Mapped[str] = mapped_column(Text, primary_key=True)  # COST-2026-0001
    contract_id: Mapped[str] = mapped_column(
        Text, ForeignKey("contracts.contract_id", ondelete="CASCADE"), nullable=False
    )
    deal_id: Mapped[str | None] = mapped_column(Text)

    cost_type: Mapped[str] = mapped_column(Text, nullable=False)
    # freight | insurance | inspection | sampling | courier | bank | docs | other

    description: Mapped[str | None] = mapped_column(Text)
    amount_usd: Mapped[float] = mapped_column(Float, nullable=False)
    vendor: Mapped[str | None] = mapped_column(Text)  # who we paid
    incurred_date: Mapped[str] = mapped_column(Text, nullable=False)

    created_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "cost_type IN ('freight', 'insurance', 'inspection', 'sampling', "
            "'courier', 'bank', 'docs', 'other')",
            name="ck_costs_type",
        ),
        Index("ix_costs_contract", "contract_id"),
    )

    def __repr__(self) -> str:
        return f"<Cost {self.cost_id}: {self.cost_type} ${self.amount_usd}>"


class Profit(Base):
    """Calculated profit for a contract.

    Updated whenever a payment is received or a cost is logged.
    profit = invoice_total - total_costs - commission
    """

    __tablename__ = "profits"

    profit_id: Mapped[str] = mapped_column(Text, primary_key=True)  # PROF-2026-0001
    contract_id: Mapped[str] = mapped_column(
        Text, ForeignKey("contracts.contract_id", ondelete="CASCADE"), nullable=False
    )
    deal_id: Mapped[str | None] = mapped_column(Text)

    revenue_usd: Mapped[float] = mapped_column(Float, nullable=False)      # invoice total
    total_costs_usd: Mapped[float] = mapped_column(Float, nullable=False) # sum of costs
    commission_usd: Mapped[float] = mapped_column(Float, nullable=False)  # platform cut
    net_profit_usd: Mapped[float] = mapped_column(Float, nullable=False)  # revenue - costs - commission
    margin_pct: Mapped[float] = mapped_column(Float, nullable=False)      # net_profit / revenue * 100

    last_updated_ts: Mapped[str] = mapped_column(Text, nullable=False)
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_profits_contract", "contract_id"),
    )

    def __repr__(self) -> str:
        return f"<Profit {self.profit_id}: {self.net_profit_usd} ({self.margin_pct:.1f}%)>"
