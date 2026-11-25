"""
Research tools — typed, org-scoped, registry-registered (TryComp Phase 2;
discovery tools Phase 4).

The Phase 2 tool set (§12.3): bounded robots-aware fetch (web_fetch),
identity resolution (resolve_identity), duplicate detection
(detect_duplicates), evidence recording (record_evidence) and the
capability-gated search slot (web_search). Phase 4 §12.2 adds the
buyer-discovery chain — search_buyers, classify_buyer,
find_decision_makers (tools/discovery.py) — and the real search
adapters behind web_search (search_adapters.py). See each module
docstring; registry.py holds the contracts.
"""

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
from coffee_export.research.tools.dedupe import DetectDuplicateTool
from coffee_export.research.tools.discovery import (
    ClassifyBuyerTool,
    FindDecisionMakersTool,
    SearchBuyersTool,
)
from coffee_export.research.tools.evidence_record import RecordEvidenceTool
from coffee_export.research.tools.fetch import BoundedFetchTool
from coffee_export.research.tools.identity import (
    ResolveIdentityTool,
    company_identity_key,
    domain_of,
    normalize_company_name,
    normalize_contact_name,
)
from coffee_export.research.tools.registry import ToolRegistry, default_registry
from coffee_export.research.tools.web_search import WebSearchTool

__all__ = [
    "BoundedFetchTool",
    "ClassifyBuyerTool",
    "DetectDuplicateTool",
    "FindDecisionMakersTool",
    "RecordEvidenceTool",
    "ResearchTool",
    "ResolveIdentityTool",
    "SearchBuyersTool",
    "ToolCapabilityUnavailableError",
    "ToolContext",
    "ToolInputError",
    "ToolNotFoundError",
    "ToolRegistry",
    "ToolResult",
    "WebSearchTool",
    "company_identity_key",
    "default_registry",
    "domain_of",
    "normalize_company_name",
    "normalize_contact_name",
    "validate_input",
    "validate_output",
]
