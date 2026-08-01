"""
AI Gateway — centralized LLM manager for all agents.

Routes LLM requests through a fallback chain of providers, with:
  ✅ Multi-provider support (OpenAI, Claude, Gemini, GLM, Qwen, Ollama, Mock)
  ✅ Automatic fallback if one provider is unavailable
  ✅ Token and cost tracking (logged to ai_call_logs table)
  ✅ Prompt template management
  ✅ Response caching (hash-based, TTL configurable)
  ✅ Retry with exponential backoff
  ✅ Rate limiting (per-provider)
  ✅ Model selection based on task type
  ✅ Centralized logging and monitoring

ARCHITECTURE
------------
    Agents (2, 3, 5, 7)
        ↓  gateway.chat(prompt, agent_id, task_type)
    AI Gateway
        ↓  tries providers in order: GLM → GPT → Claude → Mock
    Provider (GLM / OpenAI / Claude / Mock)
        ↓  returns AIResponse
    AI Gateway
        ↓  logs to ai_call_logs (cost, tokens, latency)
    Returns response to agent

USAGE
-----
    from coffee_export.ai import AIGateway

    gateway = AIGateway()

    # Simple chat
    response = gateway.chat(
        prompt="Classify this company: Falcon Coffees, UK importer",
        agent_id="Agent 2",
        task_type="segment_classification",
    )
    print(response.text)
    print(f"Cost: ${response.cost_usd}")

    # With system prompt + preferred provider
    response = gateway.chat(
        prompt="Draft a LinkedIn message for a Yirgacheffe buyer",
        system_prompt="You are a coffee export sales expert.",
        agent_id="Agent 3",
        task_type="message_drafting",
        preferred_provider="glm",
    )

    # Using a prompt template
    response = gateway.chat_with_template(
        template_name="agent3_linkedin_dm",
        variables={"company": "Falcon Coffees", "vp": "VP1"},
        agent_id="Agent 3",
    )
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from coffee_export.ai.providers import (
    AIResponse,
    BaseProvider,
    ClaudeProvider,
    GeminiProvider,
    GLMProvider,
    MockProvider,
    OllamaProvider,
    OpenAIProvider,
    QwenProvider,
)
from coffee_export.database.base import SessionLocal, now_addis_iso
from coffee_export.database.models import AICallLog, PromptTemplate
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))

# ── Task type → model preference mapping ──
TASK_MODEL_PREFERENCE: dict[str, list[str]] = {
    "simple": ["qwen-turbo", "glm-4-flash", "gpt-4o-mini", "mock-1.0"],
    "standard": ["glm-4", "gpt-4o", "claude-3-5-sonnet-20241022", "mock-1.0"],
    "complex": ["gpt-4o", "claude-3-5-sonnet-20241022", "glm-4", "mock-1.0"],
    "creative": ["claude-3-5-sonnet-20241022", "gpt-4o", "glm-4", "mock-1.0"],
}

# ── Default fallback order ──
DEFAULT_FALLBACK_ORDER: list[str] = [
    "glm",  # GLM-4 (cost-effective, good quality)
    "openai",  # GPT-4o (reliable, high quality)
    "claude",  # Claude 3.5 (excellent for creative/analysis)
    "gemini",  # Gemini 1.5 (good for large context)
    "qwen",  # Qwen (cost-effective alternative)
    "ollama",  # Ollama (free, self-hosted)
    "mock",  # Mock (always available, for testing)
]


class AIGateway:
    """
    Centralized LLM manager.

    All agents call gateway.chat() instead of calling LLM providers directly.
    The gateway handles provider selection, fallback, caching, retry,
    cost tracking, and rate limiting.
    """

    def __init__(self, enable_cache: bool = True, cache_ttl_seconds: int = 3600) -> None:
        self.providers: dict[str, BaseProvider] = {}
        self._init_providers()
        self.enable_cache = enable_cache
        self.cache_ttl = cache_ttl_seconds
        self._cache: dict[str, tuple[AIResponse, float]] = {}  # hash → (response, timestamp)
        self._rate_limits: dict[str, list[float]] = {}  # provider → [timestamps]
        self._max_calls_per_minute: dict[str, int] = {
            "openai": 60,
            "claude": 50,
            "gemini": 60,
            "glm": 30,
            "qwen": 30,
            "ollama": 100,
            "mock": 1000,
        }
        log.info(
            f"AIGateway initialized with {len(self.providers)} providers: "
            f"{list(self.providers.keys())}"
        )

    def _init_providers(self) -> None:
        """Initialize all providers from environment variables."""
        provider_configs = [
            ("glm", GLMProvider, os.environ.get("GLM_API_KEY", "")),
            ("openai", OpenAIProvider, os.environ.get("OPENAI_API_KEY", "")),
            ("claude", ClaudeProvider, os.environ.get("ANTHROPIC_API_KEY", "")),
            ("gemini", GeminiProvider, os.environ.get("GOOGLE_API_KEY", "")),
            ("qwen", QwenProvider, os.environ.get("DASHSCOPE_API_KEY", "")),
        ]

        for name, provider_cls, api_key in provider_configs:
            provider = provider_cls(api_key=api_key)
            self.providers[name] = provider
            status = "✅ available" if provider.available else "❌ no API key"
            log.debug(f"  Provider {name}: {status}")

        # Ollama (local, no API key needed)
        ollama = OllamaProvider(
            base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        )
        self.providers["ollama"] = ollama

        # Mock (always available)
        self.providers["mock"] = MockProvider()

    # =============================================================
    # MAIN CHAT METHOD
    # =============================================================

    def chat(
        self,
        prompt: str,
        agent_id: str = "system",
        task_type: str = "standard",
        system_prompt: str = "",
        preferred_provider: str = "",
        preferred_model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
        max_retries: int = 2,
    ) -> AIResponse:
        """
        Send a chat completion request through the gateway.

        The gateway:
          1. Checks cache (if enabled)
          2. Determines provider fallback order
          3. Tries each provider with retry + exponential backoff
          4. Logs every attempt to ai_call_logs
          5. Returns the first successful response

        Args:
            prompt: The user prompt
            agent_id: Which agent is calling (for logging)
            task_type: "simple" | "standard" | "complex" | "creative"
            system_prompt: Optional system prompt
            preferred_provider: Try this provider first (e.g. "glm")
            preferred_model: Specific model to use
            max_tokens: Max response tokens
            temperature: Sampling temperature (0=deterministic, 1=creative)
            max_retries: Retries per provider before moving to next

        Returns:
            AIResponse with text, cost, tokens, latency
        """
        # 1. Check cache
        cache_key = self._cache_key(prompt, system_prompt, preferred_model, max_tokens, temperature)
        if self.enable_cache:
            cached = self._get_cached(cache_key)
            if cached:
                log.debug(f"AIGateway cache hit for {agent_id}/{task_type}")
                self._log_call(
                    agent_id=agent_id,
                    provider=cached.provider,
                    model=cached.model,
                    task_type=task_type,
                    prompt_hash=cache_key,
                    prompt_tokens=cached.prompt_tokens,
                    completion_tokens=cached.completion_tokens,
                    total_tokens=cached.total_tokens,
                    cost_usd=0.0,  # cached = free
                    latency_ms=0,
                    success=True,
                    cached=True,
                    response_preview=cached.text[:200],
                )
                return cached

        # 2. Determine fallback order
        fallback_order = self._get_fallback_order(preferred_provider)

        # 3. Try each provider
        for provider_name in fallback_order:
            provider = self.providers.get(provider_name)
            if not provider or not provider.available:
                continue

            # Rate limiting
            if not self._check_rate_limit(provider_name):
                log.debug(f"AIGateway rate limit hit for {provider_name}, skipping")
                continue

            # Retry with exponential backoff
            for attempt in range(1, max_retries + 1):
                response = provider.chat(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    model=preferred_model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )

                if response.success:
                    # Log successful call
                    self._log_call(
                        agent_id=agent_id,
                        provider=response.provider,
                        model=response.model,
                        task_type=task_type,
                        prompt_hash=cache_key,
                        prompt_tokens=response.prompt_tokens,
                        completion_tokens=response.completion_tokens,
                        total_tokens=response.total_tokens,
                        cost_usd=response.cost_usd,
                        latency_ms=response.latency_ms,
                        success=True,
                        cached=False,
                        response_preview=response.text[:200],
                    )

                    # Cache the response
                    if self.enable_cache:
                        self._set_cached(cache_key, response)

                    log.info(
                        f"AIGateway {agent_id}/{task_type} → {response.provider}/"
                        f"{response.model} ({response.latency_ms}ms, "
                        f"${response.cost_usd:.6f}, {response.total_tokens} tokens)"
                    )
                    return response

                # Log failed attempt
                self._log_call(
                    agent_id=agent_id,
                    provider=response.provider,
                    model=response.model,
                    task_type=task_type,
                    prompt_hash=cache_key,
                    latency_ms=response.latency_ms,
                    success=False,
                    error_message=response.error,
                )

                log.warning(
                    f"AIGateway {provider_name} attempt {attempt}/{max_retries} failed: "
                    f"{response.error[:100]}"
                )

                if attempt < max_retries:
                    backoff = 2 ** (attempt - 1)  # 1s, 2s, 4s...
                    time.sleep(backoff)

        # All providers failed — return error response
        log.error(f"AIGateway all providers failed for {agent_id}/{task_type}")
        return AIResponse(
            text="",
            provider="none",
            model="none",
            success=False,
            error="All providers failed",
        )

    # =============================================================
    # PROMPT TEMPLATE SUPPORT
    # =============================================================

    def chat_with_template(
        self,
        template_name: str,
        variables: dict[str, str],
        agent_id: str = "system",
        task_type: str = "standard",
        max_retries: int = 2,
    ) -> AIResponse:
        """
        Chat using a stored prompt template.

        Templates are stored in the prompt_templates table and can be
        managed via the dashboard or CLI.
        """
        template = self._get_template(template_name)
        if not template:
            return AIResponse(
                text="",
                provider="none",
                model="none",
                success=False,
                error=f"Template '{template_name}' not found",
            )

        # Render the prompt with variables
        user_prompt = template["user_prompt_template"]
        for key, value in variables.items():
            user_prompt = user_prompt.replace(f"{{{key}}}", str(value))

        system_prompt = template.get("system_prompt", "") or ""

        return self.chat(
            prompt=user_prompt,
            agent_id=agent_id,
            task_type=task_type or template.get("task_type", "standard"),
            system_prompt=system_prompt,
            preferred_provider=template.get("preferred_provider", ""),
            preferred_model=template.get("preferred_model", ""),
            max_tokens=template.get("max_tokens", 1000),
            temperature=template.get("temperature", 0.7),
            max_retries=max_retries,
        )

    def save_template(
        self,
        template_name: str,
        agent_id: str,
        task_type: str,
        user_prompt_template: str,
        system_prompt: str = "",
        variables: list[str] | None = None,
        preferred_provider: str = "",
        preferred_model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> int:
        """Save or update a prompt template. Returns template ID."""
        now = now_addis_iso()
        with SessionLocal() as session:
            existing = session.execute(
                select(PromptTemplate).where(PromptTemplate.template_name == template_name)
            ).scalar_one_or_none()

            if existing:
                existing.agent_id = agent_id
                existing.task_type = task_type
                existing.system_prompt = system_prompt
                existing.user_prompt_template = user_prompt_template
                existing.variables = json.dumps(variables) if variables else None
                existing.preferred_provider = preferred_provider
                existing.preferred_model = preferred_model
                existing.max_tokens = max_tokens
                existing.temperature = temperature
                existing.updated_ts = now
                session.commit()
                return existing.id
            else:
                template = PromptTemplate(
                    template_name=template_name,
                    agent_id=agent_id,
                    task_type=task_type,
                    system_prompt=system_prompt,
                    user_prompt_template=user_prompt_template,
                    variables=json.dumps(variables) if variables else None,
                    preferred_provider=preferred_provider,
                    preferred_model=preferred_model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    is_active=1,
                    created_ts=now,
                    updated_ts=now,
                )
                session.add(template)
                session.flush()
                template_id = template.id
                session.commit()
                return template_id

    def _get_template(self, template_name: str) -> dict[str, Any] | None:
        """Get a prompt template by name."""
        with SessionLocal() as session:
            template = session.execute(
                select(PromptTemplate).where(
                    PromptTemplate.template_name == template_name,
                    PromptTemplate.is_active == 1,
                )
            ).scalar_one_or_none()
            if not template:
                return None
            return {
                "template_name": template.template_name,
                "agent_id": template.agent_id,
                "task_type": template.task_type,
                "system_prompt": template.system_prompt or "",
                "user_prompt_template": template.user_prompt_template,
                "variables": json.loads(template.variables) if template.variables else [],
                "preferred_provider": template.preferred_provider or "",
                "preferred_model": template.preferred_model or "",
                "max_tokens": template.max_tokens,
                "temperature": template.temperature,
            }

    # =============================================================
    # COST & USAGE TRACKING
    # =============================================================

    def get_usage_stats(self, hours: int = 24) -> dict[str, Any]:
        """Get AI usage statistics for the last N hours."""
        cutoff = (datetime.now(ADDIS_TZ) - timedelta(hours=hours)).isoformat()
        with SessionLocal() as session:
            from sqlalchemy import func

            rows = session.execute(
                select(
                    AICallLog.provider,
                    AICallLog.model,
                    func.count().label("calls"),
                    func.sum(AICallLog.total_tokens).label("tokens"),
                    func.sum(AICallLog.cost_usd).label("cost"),
                    func.avg(AICallLog.latency_ms).label("avg_latency"),
                )
                .where(AICallLog.called_ts >= cutoff, AICallLog.success == 1)
                .group_by(AICallLog.provider, AICallLog.model)
                .order_by(func.sum(AICallLog.cost_usd).desc())
            ).all()

            providers: list[dict[str, Any]] = []
            total_cost = 0.0
            total_tokens = 0
            total_calls = 0

            for row in rows:
                cost = float(row.cost or 0)
                tokens = int(row.tokens or 0)
                calls = int(row.calls or 0)
                total_cost += cost
                total_tokens += tokens
                total_calls += calls
                providers.append(
                    {
                        "provider": row.provider,
                        "model": row.model,
                        "calls": calls,
                        "tokens": tokens,
                        "cost": round(cost, 6),
                        "avg_latency_ms": int(row.avg_latency or 0),
                    }
                )

            # Cache stats
            cached_count = (
                session.execute(
                    select(func.count()).where(AICallLog.cached == 1, AICallLog.called_ts >= cutoff)
                ).scalar()
                or 0
            )

        return {
            "hours": hours,
            "total_calls": total_calls,
            "total_tokens": total_tokens,
            "total_cost": round(total_cost, 6),
            "cached_calls": cached_count,
            "by_provider": providers,
        }

    # =============================================================
    # INTERNAL HELPERS
    # =============================================================

    def _get_fallback_order(self, preferred: str = "") -> list[str]:
        """Determine the provider fallback order."""
        order = list(DEFAULT_FALLBACK_ORDER)
        if preferred and preferred in order:
            order.remove(preferred)
            order.insert(0, preferred)
        return order

    def _cache_key(
        self, prompt: str, system_prompt: str, model: str, max_tokens: int, temperature: float
    ) -> str:
        """Generate a hash key for caching."""
        raw = f"{prompt}|{system_prompt}|{model}|{max_tokens}|{temperature}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    def _get_cached(self, key: str) -> AIResponse | None:
        """Get a cached response if still valid."""
        if key not in self._cache:
            return None
        response, timestamp = self._cache[key]
        if time.time() - timestamp > self.cache_ttl:
            del self._cache[key]
            return None
        return response

    def _set_cached(self, key: str, response: AIResponse) -> None:
        """Cache a response."""
        self._cache[key] = (response, time.time())

    def _check_rate_limit(self, provider: str) -> bool:
        """Check if we're within the rate limit for a provider."""
        max_per_min = self._max_calls_per_minute.get(provider, 60)
        now = time.time()
        if provider not in self._rate_limits:
            self._rate_limits[provider] = []

        # Remove calls older than 60 seconds
        self._rate_limits[provider] = [ts for ts in self._rate_limits[provider] if now - ts < 60]

        if len(self._rate_limits[provider]) >= max_per_min:
            return False

        self._rate_limits[provider].append(now)
        return True

    def _log_call(
        self,
        agent_id: str,
        provider: str,
        model: str,
        task_type: str,
        prompt_hash: str = "",
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        cost_usd: float = 0.0,
        latency_ms: int = 0,
        success: bool = True,
        error_message: str = "",
        cached: bool = False,
        response_preview: str = "",
    ) -> None:
        """Log an AI call to the database."""
        now = now_addis_iso()
        try:
            with SessionLocal() as session:
                log_entry = AICallLog(
                    agent_id=agent_id,
                    provider=provider,
                    model=model,
                    task_type=task_type,
                    prompt_hash=prompt_hash,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    cost_usd=cost_usd,
                    latency_ms=latency_ms,
                    success=1 if success else 0,
                    error_message=error_message,
                    cached=1 if cached else 0,
                    response_preview=response_preview,
                    called_ts=now,
                )
                session.add(log_entry)
                session.commit()
        except Exception as e:
            log.warning(f"Failed to log AI call: {e}")

    # =============================================================
    # CONVENIENCE: generate(task=...) — task-based API
    # =============================================================

    # Task → (task_type, preferred_provider, preferred_model, max_tokens, temperature)
    TASK_CONFIG: dict[str, dict[str, Any]] = {
        "classification": {"task_type": "simple", "max_tokens": 200, "temperature": 0.2},
        "extraction": {"task_type": "simple", "max_tokens": 300, "temperature": 0.2},
        "email_writing": {"task_type": "creative", "max_tokens": 400, "temperature": 0.7},
        "message_drafting": {"task_type": "creative", "max_tokens": 300, "temperature": 0.7},
        "contract_review": {"task_type": "standard", "max_tokens": 500, "temperature": 0.3},
        "nps_analysis": {"task_type": "standard", "max_tokens": 200, "temperature": 0.3},
        "enrichment": {"task_type": "standard", "max_tokens": 300, "temperature": 0.3},
        "qualification": {"task_type": "simple", "max_tokens": 100, "temperature": 0.2},
        "recommendation": {"task_type": "standard", "max_tokens": 200, "temperature": 0.4},
    }

    # Task → preferred provider (auto model selection)
    TASK_PROVIDER_PREFERENCE: dict[str, str] = {
        "classification": "glm",  # GLM — cost-effective for classification
        "extraction": "qwen",  # Qwen — good for structured extraction
        "email_writing": "openai",  # GPT — best for creative writing
        "message_drafting": "openai",  # GPT — best for creative writing
        "contract_review": "claude",  # Claude — best for analysis/review
        "nps_analysis": "glm",  # GLM — cost-effective for analysis
        "enrichment": "glm",  # GLM — cost-effective for classification
        "qualification": "glm",  # GLM — cost-effective for simple evaluation
        "recommendation": "claude",  # Claude — best for nuanced recommendations
    }

    def generate(
        self,
        task: str,
        prompt: str,
        agent_id: str = "system",
        system_prompt: str = "",
        use_template: str = "",
        template_variables: dict[str, str] | None = None,
    ) -> AIResponse:
        """
        Task-based API — the gateway decides the provider, model, and parameters.

        Agents simply request a task type:
            response = gateway.generate(
                task="contract_review",
                prompt="Review this contract...",
                agent_id="Agent 5",
            )

        The gateway auto-selects:
          - Preferred provider (e.g. Claude for contract_review)
          - Task type (simple/standard/complex/creative)
          - Max tokens and temperature
          - Fallback chain if preferred provider is unavailable

        Args:
            task: One of: classification, extraction, email_writing,
                  message_drafting, contract_review, nps_analysis,
                  enrichment, qualification, recommendation
            prompt: The user prompt (or template name if use_template is set)
            agent_id: Which agent is calling
            system_prompt: Optional system prompt
            use_template: If set, loads prompt from prompts/{use_template}.md
            template_variables: Variables for the template

        Returns:
            AIResponse
        """
        config = self.TASK_CONFIG.get(
            task, {"task_type": "standard", "max_tokens": 500, "temperature": 0.5}
        )
        preferred_provider = self.TASK_PROVIDER_PREFERENCE.get(task, "")

        # Load from template if specified
        actual_prompt = prompt
        if use_template:
            from coffee_export.ai.templates import load_prompt

            actual_prompt = load_prompt(use_template, template_variables or {})
            if not actual_prompt:
                actual_prompt = prompt  # fallback to direct prompt

        return self.chat(
            prompt=actual_prompt,
            agent_id=agent_id,
            task_type=config["task_type"],
            system_prompt=system_prompt,
            preferred_provider=preferred_provider,
            max_tokens=config["max_tokens"],
            temperature=config["temperature"],
        )
