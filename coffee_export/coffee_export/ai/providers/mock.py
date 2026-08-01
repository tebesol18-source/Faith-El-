"""
Mock provider — for testing without real API keys.

Returns deterministic responses based on the prompt. Useful for
development, CI/CD, and unit tests.
"""

from __future__ import annotations

import hashlib
import time

from coffee_export.ai.providers.base import AIResponse, BaseProvider


class MockProvider(BaseProvider):
    """Mock LLM provider for testing. No API key required."""

    provider_name = "mock"
    default_model = "mock-1.0"
    available = True

    pricing = {"mock-1.0": (0.0, 0.0)}  # free

    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        start = time.time()

        # Generate a deterministic but varied response
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()[:8]
        response_text = (
            f"[Mock Response {prompt_hash}] Based on the prompt: "
            f"{prompt[:100]}...\n\n"
            f"This is a simulated LLM response for testing. "
            f"In production, this would be replaced by a real provider."
        )

        latency = int((time.time() - start) * 1000)

        # Estimate tokens (rough: 1 token ≈ 4 chars)
        prompt_tokens = len(prompt) // 4
        completion_tokens = len(response_text) // 4

        return AIResponse(
            text=response_text,
            provider=self.provider_name,
            model=model or self.default_model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            cost_usd=0.0,
            latency_ms=latency,
            success=True,
        )
