"""
AI Provider abstraction — base class for all LLM providers.

Each provider implements chat() which takes a prompt and returns
a response with token usage and cost information.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class AIResponse:
    """Standardized response from any LLM provider."""

    text: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    success: bool = True
    error: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


class BaseProvider(ABC):
    """Abstract base class for all LLM providers."""

    provider_name: str = "base"
    default_model: str = ""
    available: bool = False

    # Cost per 1K tokens (prompt, completion) in USD
    pricing: dict[str, tuple[float, float]] = {}

    def __init__(self, api_key: str = "", **kwargs) -> None:
        self.api_key = api_key
        self.kwargs = kwargs
        self.available = bool(api_key) or self.provider_name == "mock"

    @abstractmethod
    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        """Send a chat completion request. Returns AIResponse."""
        ...

    def calculate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculate cost in USD based on token usage."""
        rates = self.pricing.get(model, self.pricing.get(self.default_model, (0, 0)))
        prompt_cost = (prompt_tokens / 1000) * rates[0]
        completion_cost = (completion_tokens / 1000) * rates[1]
        return round(prompt_cost + completion_cost, 6)

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} available={self.available}>"
