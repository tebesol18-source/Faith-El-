"""
AI Gateway models — call logs and prompt templates.

Tracks every LLM call for cost monitoring, and stores reusable
prompt templates with per-agent configuration.
"""

from __future__ import annotations

from sqlalchemy import REAL, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from coffee_export.database.base import Base


class AICallLog(Base):
    """Log entry for every LLM call — cost tracking, latency, errors."""

    __tablename__ = "ai_call_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    task_type: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_hash: Mapped[str | None] = mapped_column(Text)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float | None] = mapped_column(REAL)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    success: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    cached: Mapped[int] = mapped_column(Integer, default=0)
    response_preview: Mapped[str | None] = mapped_column(Text)
    called_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_ai_call_logs_agent", "agent_id"),
        Index("ix_ai_call_logs_provider", "provider"),
        Index("ix_ai_call_logs_ts", "called_ts"),
        Index("ix_ai_call_logs_prompt_hash", "prompt_hash"),
    )

    def __repr__(self) -> str:
        return f"<AICallLog {self.id}: {self.provider}/{self.model} by {self.agent_id}>"


class PromptTemplate(Base):
    """Reusable prompt template with variables and per-agent config."""

    __tablename__ = "prompt_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    template_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    agent_id: Mapped[str] = mapped_column(Text, nullable=False)
    task_type: Mapped[str] = mapped_column(Text, nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[str | None] = mapped_column(Text)  # JSON list of variable names
    preferred_provider: Mapped[str | None] = mapped_column(Text)
    preferred_model: Mapped[str | None] = mapped_column(Text)
    max_tokens: Mapped[int] = mapped_column(Integer, default=1000)
    temperature: Mapped[float] = mapped_column(REAL, default=0.7)
    is_active: Mapped[int] = mapped_column(Integer, default=1)
    created_ts: Mapped[str] = mapped_column(Text, nullable=False)
    updated_ts: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_prompt_templates_agent", "agent_id"),
        Index("ix_prompt_templates_task", "task_type"),
    )

    def __repr__(self) -> str:
        return f"<PromptTemplate {self.template_name} ({self.agent_id}/{self.task_type})>"
