"""
SQLAlchemy ORM models for the coffee export system.

All 33 models across 8 domains. Importing this package registers every
model on Base.metadata, which Alembic uses for autogenerate.

Usage:
    from coffee_export.database.models import Lead, Lot, SampleRequest
    from coffee_export.database.base import get_session

    with get_session() as session:
        leads = session.query(Lead).filter_by(current_state="QUALIFIED").all()

Domain organization:
    infrastructure.py — Agent, Operator, AuditLog
    lead.py           — Lead, LeadContact, LeadTag, LeadStateHistory
    outreach.py       — SequenceTemplate, OutreachTouch, QualificationAnswer
    inventory.py      — Coop, WashingStation, Lot, StockMovement,
                        LotReservation, LotFeedback, QAFlag
    sample.py         — SampleRequest, SampleRequestLot, SampleShipment,
                        CuppingScore, SampleDecision, SampleBudget, SampleWaitlist
    contract.py       — Contract, ContractLineItem, ComplianceDocument
    logistics.py      — Shipment, ShipmentItem, CustomsDocument
    relationship.py   — Account, AccountActivity
    events.py         — Event
"""

# Import all modules so models are registered on Base.metadata
from coffee_export.database.models.contract import (  # noqa: F401
    ComplianceDocument,
    Contract,
    ContractLineItem,
)
from coffee_export.database.models.events import Event  # noqa: F401
from coffee_export.database.models.memory import ConversationMemory  # noqa: F401
from coffee_export.database.models.messaging import (  # noqa: F401
    ExporterInbox,
    InboxMessage,
    MessageThread,
)
from coffee_export.database.models.ai import AICallLog, PromptTemplate  # noqa: F401
from coffee_export.database.models.infrastructure import (  # noqa: F401
    Agent,
    AuditLog,
    Operator,
)
from coffee_export.database.models.inventory import (  # noqa: F401
    Coop,
    Lot,
    LotFeedback,
    LotReservation,
    QAFlag,
    StockMovement,
    WashingStation,
)
from coffee_export.database.models.lead import (  # noqa: F401
    Lead,
    LeadContact,
    LeadStateHistory,
    LeadTag,
)
from coffee_export.database.models.logistics import (  # noqa: F401
    CustomsDocument,
    Shipment,
    ShipmentItem,
)
from coffee_export.database.models.outreach import (  # noqa: F401
    OutreachTouch,
    QualificationAnswer,
    SequenceTemplate,
)
from coffee_export.database.models.relationship import (  # noqa: F401
    Account,
    AccountActivity,
)
from coffee_export.database.models.sample import (  # noqa: F401
    CuppingScore,
    SampleBudget,
    SampleDecision,
    SampleRequest,
    SampleRequestLot,
    SampleShipment,
    SampleWaitlist,
)

__all__ = [
    # Infrastructure
    "Agent",
    "Operator",
    "AuditLog",
    # Lead
    "Lead",
    "LeadContact",
    "LeadTag",
    "LeadStateHistory",
    # Outreach & Qualification
    "SequenceTemplate",
    "OutreachTouch",
    "QualificationAnswer",
    # Inventory
    "Coop",
    "WashingStation",
    "Lot",
    "StockMovement",
    "LotReservation",
    "LotFeedback",
    "QAFlag",
    # Sample
    "SampleRequest",
    "SampleRequestLot",
    "SampleShipment",
    "CuppingScore",
    "SampleDecision",
    "SampleBudget",
    "SampleWaitlist",
    # Contract & Compliance
    "Contract",
    "ContractLineItem",
    "ComplianceDocument",
    # Logistics
    "Shipment",
    "ShipmentItem",
    "CustomsDocument",
    # Relationship
    "Account",
    "AccountActivity",
    # Event Bus
    "Event",
    # Memory
    "ConversationMemory",
    # AI Gateway
    "AICallLog",
    "PromptTemplate",
    # Messaging Gateway
    "ExporterInbox",
    "MessageThread",
    "InboxMessage",
]
