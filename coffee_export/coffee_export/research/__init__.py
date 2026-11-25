"""
Research package — Evidence Ledger, Persistent Facts and the Research
Engine (TryComp Phase 1 + Phase 2).

Faith-El-native implementation of the approved TryComp capabilities,
per docs/trycomp-integration-progress.md §3:

  * Phase 1 — B (Evidence Ledger) and C (Persistent Facts):
    EvidenceLedger (append-only observations with honest source
    attribution), FactStore (current-state layer with human-verified
    locking), org-scoped on research_evidence/research_facts.
  * Phase 2 — F (tool registry + first tools), G (provider manifest),
    H (budgets & usage controls), I (research history & search):
    ResearchSessions (session lifecycle, duplicate-research reuse,
    history search), ResearchEngine (budget-enforced tool execution,
    honest tool-call log), BudgetSpec (per-session limits — never
    fabricated costs), ProviderManifest (runtime capability detection —
    never faked), ToolRegistry with web_fetch / resolve_identity /
    detect_duplicates / record_evidence / web_search.

Nothing in the application calls these services yet — Phase 3 wires
them into durable research execution (§12 next action).
"""

from coffee_export.research.budget import (
    BUDGET_FIELDS,
    BudgetExhaustedError,
    BudgetSpec,
    check_budget,
)
from coffee_export.research.common import (
    EVIDENCE_STATUSES,
    FACT_STATUSES,
    INDEPENDENT_SOURCE_TYPES,
    LIVE_SESSION_STATUSES,
    SESSION_STATUSES,
    SESSION_TRANSITIONS,
    SOURCE_TYPES,
    TOOL_CALL_STATUSES,
    URL_SOURCE_TYPES,
    ResearchNotFoundError,
    canonical_json,
    normalize_objective,
    validate_source,
)
from coffee_export.research.engine import ResearchEngine, ToolCallOutcome
from coffee_export.research.evidence import EvidenceLedger
from coffee_export.research.facts import FactStore, recompute_fact
from coffee_export.research.planning import plan_objective, plan_to_json
from coffee_export.research.providers import (
    MANIFEST_ENV_VAR_NAMES,
    ProviderCapability,
    ProviderManifest,
    capability_unavailable_payload,
)
from coffee_export.research.sessions import (
    DuplicateResearchError,
    ResearchSessions,
)
from coffee_export.research.tools import (
    BoundedFetchTool,
    DetectDuplicateTool,
    RecordEvidenceTool,
    ResolveIdentityTool,
    ToolContext,
    ToolRegistry,
    ToolResult,
    WebSearchTool,
    default_registry,
)

__all__ = [
    # vocabulary (Phase 1 + 2)
    "EVIDENCE_STATUSES",
    "FACT_STATUSES",
    "INDEPENDENT_SOURCE_TYPES",
    "LIVE_SESSION_STATUSES",
    "SESSION_STATUSES",
    "SESSION_TRANSITIONS",
    "SOURCE_TYPES",
    "TOOL_CALL_STATUSES",
    "URL_SOURCE_TYPES",
    "canonical_json",
    "normalize_objective",
    "validate_source",
    # Phase 1 services
    "EvidenceLedger",
    "FactStore",
    "ResearchNotFoundError",
    "recompute_fact",
    # Phase 2 — budgets (H)
    "BUDGET_FIELDS",
    "BudgetExhaustedError",
    "BudgetSpec",
    "check_budget",
    # Phase 2 — provider manifest (G)
    "MANIFEST_ENV_VAR_NAMES",
    "ProviderCapability",
    "ProviderManifest",
    "capability_unavailable_payload",
    # Phase 2 — sessions + engine (I)
    "DuplicateResearchError",
    "ResearchEngine",
    "ResearchSessions",
    "ToolCallOutcome",
    # Phase 2 — planning
    "plan_objective",
    "plan_to_json",
    # Phase 2 — tools (F)
    "BoundedFetchTool",
    "DetectDuplicateTool",
    "RecordEvidenceTool",
    "ResolveIdentityTool",
    "ToolContext",
    "ToolRegistry",
    "ToolResult",
    "WebSearchTool",
    "default_registry",
]
