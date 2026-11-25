"""
Provider manifest — runtime capability detection (TryComp Phase 2, §12.2 / §3 G).

Answers ONE question honestly at runtime: which capabilities are actually
configured right now?

  * ai_chat     — an LLM provider with credentials, detected via the SAME
                  env keys the existing AIGateway reads (ai/gateway.py
                  _init_providers): GLM_API_KEY (preferred), OPENAI_API_KEY,
                  ANTHROPIC_API_KEY, GOOGLE_API_KEY, DASHSCOPE_API_KEY,
                  OLLAMA_BASE_URL. The manifest NEVER instantiates the
                  gateway, NEVER calls any provider and NEVER probes
                  reachability — a set env key means "configured", which is
                  an honest, weaker statement than "reachable".
  * web_search  — a research/search provider. New OPTIONAL adapters
                  (Phase 4); none is configured by default, and no paid
                  API is introduced by default (§10). A GLM/Z.ai chat key
                  does NOT imply search access — the manifest detects
                  actual capability, never assumes it.

Honesty contract (§10):

  * A missing provider is reported as capability_unavailable — never
    faked, never silently skipped.
  * Values NEVER leave this module: the manifest records env var NAMES
    only. A capability snapshot contains no secrets, so it is safe to log
    and to store. This is test-pinned with a sentinel value.
  * The `mock` provider is excluded on purpose: it exists to keep tests
    deterministic (§5.3), and counting a test double as a production
    capability would be dishonest.
  * The manifest never mutates os.environ — it reads a mapping (injectable
    for tests, os.environ by default).

Capability detection ≠ capability execution: turning a configured key
into working calls is the adapter's job (ai_chat → AIGateway, already
wired; web_search → Phase 4 adapters). Until an adapter exists, tools
that need the capability report capability_unavailable with the honest
reason.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

#: User-agent token the research fetcher announces (fetch.py uses it for
#: robots.txt matching too).
RESEARCH_USER_AGENT = "faithel-research/1.0"

#: AI chat providers, in AIGateway preference order (GLM first — mirrors
#: ai/gateway.py _init_providers). OLLAMA_BASE_URL counts as configured
#: only when explicitly set: the localhost default is not a configured
#: capability, and no reachability is probed.
AI_PROVIDER_ENV_KEYS: tuple[tuple[str, str], ...] = (
    ("glm", "GLM_API_KEY"),
    ("openai", "OPENAI_API_KEY"),
    ("claude", "ANTHROPIC_API_KEY"),
    ("gemini", "GOOGLE_API_KEY"),
    ("qwen", "DASHSCOPE_API_KEY"),
    ("ollama", "OLLAMA_BASE_URL"),
)

#: Optional research/search providers (Phase 4 adapters; none configured
#: by default — no paid API dependency is introduced silently, §10).
WEB_SEARCH_PROVIDER_ENV_KEYS: tuple[tuple[str, str], ...] = (
    ("tavily", "TAVILY_API_KEY"),
    ("brave", "BRAVE_SEARCH_API_KEY"),
    ("serpapi", "SERPAPI_API_KEY"),
)

#: Every env var NAME the manifest may read. Values never appear anywhere.
MANIFEST_ENV_VAR_NAMES: tuple[str, ...] = tuple(
    {name for _, name in (*AI_PROVIDER_ENV_KEYS, *WEB_SEARCH_PROVIDER_ENV_KEYS)}
)


@dataclass(frozen=True)
class ProviderCapability:
    """One detected capability surface — names only, never values."""

    kind: str  # "ai_chat" | "web_search"
    name: str  # provider name, e.g. "glm"
    configured: bool
    env_var: str  # the env var NAME that gates this provider
    notes: str

    def to_dict(self) -> dict:
        """Log/storage-safe form (asserted to contain no secret values)."""
        return {
            "kind": self.kind,
            "name": self.name,
            "configured": self.configured,
            "env_var": self.env_var,
            "notes": self.notes,
        }


def capability_unavailable_payload(kind: str, reason: str) -> dict:
    """The standard honest 'cannot do this' result (§10 / §3 G).

    Used by tools and the engine whenever a capability is not actually
    configured — a structured refusal, never a faked result.
    """
    return {
        "status": "capability_unavailable",
        "capability": kind,
        "reason": reason,
        "user_agent": RESEARCH_USER_AGENT,
    }


class ProviderManifest:
    """Runtime capability snapshot over an env mapping (read-only)."""

    def __init__(self, env: dict[str, str] | None = None) -> None:
        # os.environ is read live on every lookup — no copy, no mutation.
        self._env = env if env is not None else os.environ

    def _configured(self, env_var: str) -> bool:
        value = self._env.get(env_var, "")
        return bool(value and str(value).strip())

    # ── ai_chat ─────────────────────────────────────────────────────

    def ai_chat_providers(self) -> list[ProviderCapability]:
        """All AI chat providers, AIGateway preference order (glm first)."""
        return [
            ProviderCapability(
                kind="ai_chat",
                name=name,
                configured=self._configured(env_var),
                env_var=env_var,
                notes=(
                    "env key set (not probed for reachability)"
                    if self._configured(env_var)
                    else "env key not set"
                ),
            )
            for name, env_var in AI_PROVIDER_ENV_KEYS
        ]

    def ai_chat_available(self) -> ProviderCapability | None:
        """The first CONFIGURED ai_chat provider (glm preferred), or None."""
        for capability in self.ai_chat_providers():
            if capability.configured:
                return capability
        return None

    # ── web_search ──────────────────────────────────────────────────

    def web_search_providers(self) -> list[ProviderCapability]:
        return [
            ProviderCapability(
                kind="web_search",
                name=name,
                configured=self._configured(env_var),
                env_var=env_var,
                notes=(
                    "env key set — adapter lands in Phase 4"
                    if self._configured(env_var)
                    else "env key not set"
                ),
            )
            for name, env_var in WEB_SEARCH_PROVIDER_ENV_KEYS
        ]

    def web_search_available(self) -> ProviderCapability | None:
        """The first CONFIGURED web_search provider, or None."""
        for capability in self.web_search_providers():
            if capability.configured:
                return capability
        return None

    # ── snapshot ────────────────────────────────────────────────────

    def snapshot(self) -> dict:
        """Full capability snapshot — env var NAMES only, safe to log.

        Structure: {"ai_chat": [...], "web_search": [...],
        "summary": {...}}. The summary counts what is configured so a
        caller can decide honestly without iterating.
        """
        ai = [c.to_dict() for c in self.ai_chat_providers()]
        search = [c.to_dict() for c in self.web_search_providers()]
        return {
            "ai_chat": ai,
            "web_search": search,
            "summary": {
                "ai_chat_configured": self.ai_chat_available() is not None,
                "web_search_configured": self.web_search_available() is not None,
                "env_var_names": sorted(MANIFEST_ENV_VAR_NAMES),
            },
        }
