"""
Web search tool (TryComp Phase 2, §12.2/§12.3 — capability-gated).

The honest search slot: consults the ProviderManifest and reports
capability_unavailable unless a search provider is ACTUALLY configured
— never a faked or cached result (§10). Even with a provider key set,
Phase 2 has no search adapter: the tool refuses with the honest reason
("adapter lands in Phase 4") instead of pretending. Phase 4 replaces the
refusal with real adapter calls behind the SAME registry contract.

The env var names in the refusal messages are NAMES, never values.
"""

from __future__ import annotations

from coffee_export.research.providers import WEB_SEARCH_PROVIDER_ENV_KEYS
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolCapabilityUnavailableError,
    ToolContext,
    ToolResult,
)

_SEARCH_ENV_NAMES = ", ".join(name for _, name in WEB_SEARCH_PROVIDER_ENV_KEYS)


class WebSearchTool(ResearchTool):
    """Search the web via a configured provider (Phase 4) — or refuse
    honestly (Phase 2 default: nothing is configured, nothing is faked)."""

    name = "web_search"
    description = (
        "Web search through a configured search provider (tavily/brave/serpapi "
        "env keys). With no provider configured — the default — it returns "
        "capability_unavailable; results are never faked."
    )
    input_schema = {
        "query": {"type": "str", "required": True},
        "max_results": {"type": "int", "required": False},
    }
    output_schema = {
        "status": {"type": "str", "required": True},
        "capability": {"type": "str", "required": True},
        "reason": {"type": "str", "required": True},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:  # noqa: ARG002
        manifest = ctx.manifest_or_default()
        available = manifest.web_search_available()
        if available is None:
            raise ToolCapabilityUnavailableError(
                "web_search",
                f"no search provider configured (env vars: {_SEARCH_ENV_NAMES}) — " "never faked",
            )
        # A key is set but Phase 2 ships no adapter — refuse honestly
        # rather than pretend the capability exists.
        raise ToolCapabilityUnavailableError(
            "web_search",
            f"provider {available.name!r} is configured, but search adapters land "
            "in Phase 4 — no results are faked",
        )
