"""
Web search tool (TryComp Phase 2 §12.2/§12.3 capability-gated; Phase 4
§12.2 ships the real adapters).

The honest search slot: consults the ProviderManifest and reports
capability_unavailable unless a search provider is ACTUALLY configured
— never a faked or cached result (§10). Phase 4 wires the adapter
behind the SAME registry contract: with a provider key configured
(tavily/brave/serpapi env keys), the tool calls the adapter
(search_adapters.py — bounded egress, honest transport errors) and
returns the normalized hits. Transport failures become honest error
results, never empty "successes".

The env var names in refusal messages are NAMES, never values. The key
value reaches the adapter through manifest.credential (the execution
site) and never appears in results or logs.
"""

from __future__ import annotations

from coffee_export.research.search_adapters import (
    SEARCH_DEFAULT_MAX_RESULTS,
    SearchTransportError,
    SearchUnavailableError,
    run_web_search,
)
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolCapabilityUnavailableError,
    ToolContext,
    ToolResult,
)


class WebSearchTool(ResearchTool):
    """Search the web through a configured provider adapter — or refuse
    honestly when nothing is configured (the default)."""

    name = "web_search"
    description = (
        "Web search through a configured search provider (tavily/brave/serpapi "
        "env keys). With no provider configured — the default — it returns "
        "capability_unavailable; results are never faked. Hits are display "
        "data (title/url/snippet), not evidence rows."
    )
    input_schema = {
        "query": {"type": "str", "required": True},
        "max_results": {"type": "int", "required": False},
    }
    output_schema = {
        "query": {"type": "str", "required": True},
        "provider": {"type": "str", "required": True},
        "results": {"type": "list", "required": True},
        "result_count": {"type": "int", "required": True},
    }

    def __init__(self, transport=None) -> None:
        """transport: injectable HTTP transport (tests pass fakes; the
        default is the bounded requests transport in search_adapters)."""
        self._transport = transport

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:  # noqa: ARG002
        query = tool_input["query"]
        max_results = tool_input.get("max_results", SEARCH_DEFAULT_MAX_RESULTS)
        manifest = ctx.manifest_or_default()
        try:
            provider, hits = run_web_search(
                query, max_results, manifest=manifest, transport=self._transport
            )
        except SearchUnavailableError as exc:
            raise ToolCapabilityUnavailableError("web_search", f"{exc} — never faked") from exc
        except SearchTransportError as exc:
            return ToolResult.error(f"web_search: {exc}")
        return ToolResult.ok(
            {
                "query": query,
                "provider": provider,
                "results": [hit.to_dict() for hit in hits],
                "result_count": len(hits),
            }
        )
