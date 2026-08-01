"""
Infrastructure models — agents, operators, audit_log.

These tables support the entire system: agent registry, human operators,
and a generic audit trail.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from coffee_export.database.base import Base


class Agent(Base):
    """Registry of the 7 AI agents. Seeded by the initial migration."""

    __tablename__ = "agents"

    agent_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('active', 'paused', 'disabled')", name="ck_agents_status"),
        Index("ix_agents_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Agent {self.agent_id}: {self.name} ({self.status})>"


class Operator(Base):
    """Human users who can intervene — approve samples, unblock leads, etc."""

    __tablename__ = "operators"

    operator_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'manager', 'operator', 'viewer')", name="ck_operators_role"
        ),
        CheckConstraint("status IN ('active', 'disabled')", name="ck_operators_status"),
    )

    def __repr__(self) -> str:
        return f"<Operator {self.operator_id}: {self.name} ({self.role})>"


class AuditLog(Base):
    """Generic audit trail for ALL entities. Polymorphic by design."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    old_values: Mapped[str | None] = mapped_column(Text)  # JSON
    new_values: Mapped[str | None] = mapped_column(Text)  # JSON
    agent_id: Mapped[str | None] = mapped_column(Text)
    operator_id: Mapped[str | None] = mapped_column(Text)
    ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "action IN ('insert', 'update', 'delete', 'state_transition')",
            name="ck_audit_log_action",
        ),
        CheckConstraint(
            "agent_id IS NOT NULL OR operator_id IS NOT NULL",
            name="ck_audit_log_has_actor",
        ),
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_audit_log_ts", "ts"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.id}: {self.entity_type}:{self.entity_id} {self.action}>"
