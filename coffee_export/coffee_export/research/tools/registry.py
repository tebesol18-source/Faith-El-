"""
Tool registry (TryComp Phase 2, §12.3 / §3 F).

Typed, org-scoped tool registry: fixed classes with declared schemas,
registered explicitly — no dynamic loading, no arbitrary code execution
(rejected-list §3). The registry:

  * validates inputs BEFORE execution (unknown fields rejected — tight
    contracts) and outputs AFTER execution (contract violations become
    honest error rows, never contract-breaking results);
  * converts ToolCapabilityUnavailableError raises into honest
    capability_unavailable results;
  * measures execution duration (wall clock around execute());
  * never swallows a failure silently: every non-ok outcome carries its
    reason into the recorded tool-call row.

default_registry() registers the Phase 2 tool set: web_fetch,
resolve_identity, detect_duplicates, record_evidence, web_search.
"""

from __future__ import annotations

import time

from coffee_export.research.tools.base import (
    ResearchTool,
    ToolCapabilityUnavailableError,
    ToolContext,
    ToolInputError,
    ToolNotFoundError,
    ToolResult,
    validate_input,
    validate_output,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


class ToolRegistry:
    """The org-agnostic tool registry (org scope arrives via ToolContext)."""

    def __init__(self) -> None:
        self._tools: dict[str, ResearchTool] = {}

    def register(self, tool: ResearchTool) -> None:
        if not tool.name or not tool.name.strip():
            raise ValueError("a research tool must declare a non-empty name")
        if tool.name in self._tools:
            raise ValueError(f"tool already registered: {tool.name!r}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> ResearchTool:
        tool = self._tools.get(name)
        if tool is None:
            raise ToolNotFoundError(name)
        return tool

    def names(self) -> list[str]:
        return sorted(self._tools)

    def invoke(self, name: str, tool_input: object, ctx: ToolContext) -> tuple[ToolResult, int]:
        """Validate → execute → validate. Returns (result, duration_ms).

        ToolNotFoundError propagates (the caller asked for a tool that
        does not exist — a programming error the engine records and
        re-raises). Everything else becomes an honest ToolResult.
        """
        tool = self.get(name)
        try:
            validate_input(tool.input_schema, tool_input, tool_name=tool.name)
        except ToolInputError as exc:
            return ToolResult.error(str(exc)), 0

        started = time.perf_counter()
        try:
            result = tool.execute(tool_input, ctx)  # type: ignore[arg-type]
        except ToolInputError as exc:
            result = ToolResult.error(str(exc))
        except ToolCapabilityUnavailableError as exc:
            result = ToolResult(
                status="capability_unavailable",
                output=exc.payload,
            )
        except Exception as exc:  # noqa: BLE001 — honest error row, never silent
            log.warning("research tool %s raised: %s: %s", tool.name, type(exc).__name__, exc)
            result = ToolResult.error(f"{tool.name}: {type(exc).__name__}: {exc}")
        duration_ms = int((time.perf_counter() - started) * 1000)

        if result.status == "ok":
            try:
                validate_output(tool.output_schema, result.output, tool_name=tool.name)
            except ToolInputError as exc:
                result = ToolResult.error(f"output contract violation: {exc}")
        return result, duration_ms


def default_registry() -> ToolRegistry:
    """The Phase 2 tool set + the Phase 4 discovery tools (contact
    verification included — §12.3), freshly instantiated (tools are
    stateless; search transport is the bounded production default)."""
    from coffee_export.research.tools.contact_verify import VerifyContactTool
    from coffee_export.research.tools.dedupe import DetectDuplicateTool
    from coffee_export.research.tools.discovery import (
        ClassifyBuyerTool,
        FindDecisionMakersTool,
        SearchBuyersTool,
    )
    from coffee_export.research.tools.evidence_record import RecordEvidenceTool
    from coffee_export.research.tools.fetch import BoundedFetchTool
    from coffee_export.research.tools.identity import ResolveIdentityTool
    from coffee_export.research.tools.web_search import WebSearchTool

    registry = ToolRegistry()
    registry.register(BoundedFetchTool())
    registry.register(ResolveIdentityTool())
    registry.register(DetectDuplicateTool())
    registry.register(RecordEvidenceTool())
    registry.register(WebSearchTool())
    registry.register(SearchBuyersTool())
    registry.register(ClassifyBuyerTool())
    registry.register(FindDecisionMakersTool())
    registry.register(VerifyContactTool())
    return registry
