"""
Duplicate detection tool (TryComp Phase 2, §12.3).

Deterministic, org-scoped detection of duplicate subjects BEFORE any
downstream write: is this company/contact already in our pipeline?

Shares the identity normalization (tools/identity.py) — no second
matching engine, one code path. A duplicate is only asserted on a strong
signal (same registered domain, or company name + country); a name-only
match is surfaced as weak and NEVER alone constitutes a duplicate
(a "Kaldi Coffee GmbH" in Hamburg and a "Kaldi Coffee Ltd" in Tokyo are
not the same buyer until a domain or country confirms it).

The complementary research-SESSION duplicate detection (same live
objective → reuse the session) lives in research/sessions.py — different
layer, same deterministic principle.
"""

from __future__ import annotations

from coffee_export.research.tools.base import (
    ResearchTool,
    ToolContext,
    ToolInputError,
    ToolResult,
)
from coffee_export.research.tools.identity import (
    ResolveIdentityTool,
    domain_of,
    match_companies,
    normalize_company_name,
    normalize_contact_name,
)

#: Match strengths that alone assert a duplicate.
STRONG_STRENGTHS: frozenset[str] = frozenset({"domain", "name+country", "contact_name"})


class DetectDuplicateTool(ResearchTool):
    """Detect org-scoped duplicate subjects (companies/contacts)."""

    name = "detect_duplicates"
    description = (
        "Deterministic duplicate detection against this org's leads and "
        "contacts: strong signals (registered domain, name+country, contact "
        "name) assert a duplicate; name-only matches are surfaced as weak."
    )
    input_schema = {
        "kind": {"type": "str", "required": True},
        "name": {"type": "str", "required": True},
        "website": {"type": "str", "required": False},
        "country": {"type": "str", "required": False},
        "exclude_lead_id": {"type": "str", "required": False},
    }
    output_schema = {
        "kind": {"type": "str", "required": True},
        "is_duplicate": {"type": "bool", "required": True},
        "matches": {"type": "list", "required": True},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        kind = tool_input["kind"].strip().lower()
        if kind not in ("company", "contact"):
            raise ToolInputError(
                f"detect_duplicates: kind must be 'company' or 'contact', got {tool_input['kind']!r}"
            )
        website = tool_input.get("website")
        country = tool_input.get("country")
        exclude_lead_id = tool_input.get("exclude_lead_id")

        if kind == "company":
            normalized = normalize_company_name(tool_input["name"])
            if not normalized:
                raise ToolInputError("detect_duplicates: name does not normalize to anything")
            matches = match_companies(
                ctx,
                normalized,
                domain_of(website),
                country,
                exclude_lead_id=exclude_lead_id,
            )
        else:
            normalized = normalize_contact_name(tool_input["name"])
            if not normalized:
                raise ToolInputError("detect_duplicates: name does not normalize to anything")
            matches = ResolveIdentityTool._match_contacts(ctx, normalized)

        is_duplicate = any(m["strength"] in STRONG_STRENGTHS for m in matches)
        return ToolResult.ok(
            {
                "kind": kind,
                "is_duplicate": is_duplicate,
                "matches": matches,
            }
        )
