"""
Buyer discovery tools (TryComp Phase 4, §12.2).

The Buyer-Radar discovery chain, as honest, deterministic, org-scoped
research tools:

  * search_buyers — company DISCOVERY through the web_search adapter:
    candidates are name-hints derived from real search-result titles
    (bounded, source-attributed), deduplicated by registered domain.
    A name hint is NOT a verified identity — it is exactly what the
    search result title said, with its source URL.
  * classify_buyer — coffee-sector CLASSIFICATION by deterministic,
    explainable keyword rules over the provided name/domain/text.
    Every classification lists the matched keywords and where they
    matched; no keyword evidence → 'insufficient_evidence' — never a
    guessed sector.
  * find_decision_makers — DECISION-MAKER discovery: deterministic
    role-pattern extraction from provided text and/or web-search
    titles+snippets. Every candidate is verification_status
    'unverified' with its source URL and the exact matched context.
    NO email or phone numbers are ever invented (§12.3): contact
    channels must come from Phase 1 evidence rows before outreach.

No AI guessing anywhere in this module: every output is explainable by
a rule over its input. AI-assisted interpretation belongs to planning
(planning.py — validated strictly) and to evidence rows that are always
attributed to their real sources.
"""

from __future__ import annotations

import re

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
from coffee_export.research.tools.identity import domain_of

#: Candidate name hints are display data — bounded.
NAME_HINT_MAX_CHARS = 120
#: Decision-maker context fragments are bounded quotes of the source.
CONTEXT_MAX_CHARS = 200
#: Person names: 2–3 capitalized words (hyphens/apostrophes allowed; NO
#: dots — a period must not glue a name across a sentence boundary).
_NAME = r"[A-Z][A-Za-z\-']+(?:\s+[A-Z][A-Za-z\-']+){1,2}"

#: Roles that matter for coffee-export commercial decisions.
ROLE_PATTERNS: tuple[str, ...] = (
    r"Chief Executive Officer",
    r"CEO",
    r"CTO",
    r"CFO",
    r"COO",
    r"Co-[- ]?Founder",
    r"Founder",
    r"Owner",
    r"Managing Director",
    r"Commercial Director",
    r"Sales Director",
    r"Export Manager",
    r"Import Manager",
    r"Head of Coffee",
    r"Head of Purchasing",
    r"Head of Procurement",
    r"Head of Sourcing",
    r"Purchasing Manager",
    r"Procurement Manager",
    r"Buying Manager",
    r"Head Buyer",
    r"Green Coffee Buyer",
    r"Coffee Buyer",
    r"Buyer",
    r"Director",
)
_ROLE_ALTERNATION = "|".join(ROLE_PATTERNS)

# name BEFORE the role: "Jane Doe, Purchasing Manager at Kaldi"
_NAME_THEN_ROLE = re.compile(
    rf"(?P<name>{_NAME})\s*[,–—-]*\s*(?:is\s+|as\s+|the\s+)?(?P<role>{_ROLE_ALTERNATION})\b",
    re.UNICODE,
)
# role BEFORE the name: "Purchasing Manager: Jane Doe" / "Head of Coffee Jane Doe"
_ROLE_THEN_NAME = re.compile(
    rf"(?P<role>{_ROLE_ALTERNATION})\s*[:,]\s*(?P<name>{_NAME})\b",
    re.UNICODE,
)
# parenthesized role: "Jane Doe (Purchasing Manager)"
_PAREN_ROLE = re.compile(
    rf"(?P<name>{_NAME})\s*\((?:the\s+)?(?P<role>{_ROLE_ALTERNATION})\)",
    re.UNICODE,
)

#: Coffee-sector keyword rules (deterministic classification).
SECTOR_KEYWORDS: dict[str, tuple[str, ...]] = {
    "importer": (
        "importer",
        "imports",
        "import",
        "einfuhr",
        "importateur",
        "green coffee",
    ),
    "roaster": (
        "roaster",
        "roastery",
        "rösterei",
        "roesterei",
        "kaffeerösterei",
        "coffee roaster",
        "torrefacteur",
        "torrefazione",
    ),
    "broker_trader": (
        "broker",
        "trading",
        "handel",
        "merchant",
        "commodity",
    ),
    "retailer_cafe": (
        "café",
        "cafe",
        "coffee shop",
        "kaffeehaus",
        "espresso bar",
        "retail",
        "coffee bar",
    ),
    "producer_exporter": (
        "exporter",
        "exports",
        "farm",
        "estate",
        "washing station",
        "cooperative",
        "coop",
        "plantation",
        "mill",
        "grower",
    ),
}


# ──────────────────────────────────────────────────────────────
# search_buyers
# ──────────────────────────────────────────────────────────────


class SearchBuyersTool(ResearchTool):
    """Discover buyer-company candidates through web search."""

    name = "search_buyers"
    description = (
        "Search the web for buyer-company candidates and derive name-hints "
        "from real result titles (deduplicated by registered domain, each "
        "with its source URL). Name-hints are NOT verified identities — "
        "resolve and verify them before any commercial use."
    )
    input_schema = {
        "query": {"type": "str", "required": True},
        "max_results": {"type": "int", "required": False},
    }
    output_schema = {
        "query": {"type": "str", "required": True},
        "provider": {"type": "str", "required": True},
        "candidates": {"type": "list", "required": True},
        "candidate_count": {"type": "int", "required": True},
        "note": {"type": "str", "required": True},
    }

    #: the honest disclaimer carried by every result
    NOTE = (
        "Candidates are name-hints derived from search-result titles — "
        "not verified identities. Resolve (resolve_identity) and verify "
        "with evidence (record_evidence) before commercial use."
    )

    def __init__(self, transport=None) -> None:
        self._transport = transport

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
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
            return ToolResult.error(f"search_buyers: {exc}")

        candidates: list[dict] = []
        seen_domains: set[str] = set()
        for rank, hit in enumerate(hits, start=1):
            domain = domain_of(hit.url)
            if not domain or domain in seen_domains:
                continue
            seen_domains.add(domain)
            candidates.append(
                {
                    "name_hint": _name_hint(hit.title),
                    "domain": domain,
                    "source_url": hit.url,
                    "snippet": hit.snippet[:300],
                    "rank": rank,
                }
            )
        return ToolResult.ok(
            {
                "query": query,
                "provider": provider,
                "candidates": candidates,
                "candidate_count": len(candidates),
                "note": self.NOTE,
            }
        )


def _name_hint(title: str) -> str:
    """The company-ish first segment of a search-result title.

    Titles like 'Kaffee Import GmbH | Home' or 'Kaldi Coffee - About'
    yield 'Kaffee Import GmbH' / 'Kaldi Coffee'. This is a HINT derived
    from real title text — never an invented name.
    """
    segment = re.split(r"\s*[|–—]\s*|\s+-\s+", title.strip(), maxsplit=1)[0]
    return segment.strip()[:NAME_HINT_MAX_CHARS]


# ──────────────────────────────────────────────────────────────
# classify_buyer
# ──────────────────────────────────────────────────────────────


class ClassifyBuyerTool(ResearchTool):
    """Deterministic, explainable coffee-sector classification."""

    name = "classify_buyer"
    description = (
        "Classify a company into a coffee sector (importer/roaster/broker/"
        "retailer/producer) by deterministic keyword rules over the given "
        "name, domain and text. Every match is listed with where it "
        "matched; no evidence → 'insufficient_evidence', never a guess."
    )
    input_schema = {
        "name": {"type": "str", "required": True},
        "domain": {"type": "str", "required": False},
        "text": {"type": "str", "required": False},
    }
    output_schema = {
        "sector": {"type": "str", "required": True},
        "matched_keywords": {"type": "list", "required": True},
        "insufficient_evidence": {"type": "bool", "required": True},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:  # noqa: ARG002
        name = tool_input["name"]
        domain = tool_input.get("domain") or ""
        text = tool_input.get("text") or ""
        where = {
            "name": name,
            "domain": domain,
            "text": text,
        }
        scores: dict[str, int] = {}
        matched: list[dict] = []
        for sector, keywords in SECTOR_KEYWORDS.items():
            for keyword in keywords:
                for location, haystack in where.items():
                    if keyword.lower() in haystack.lower():
                        scores[sector] = scores.get(sector, 0) + 1
                        matched.append({"keyword": keyword, "where": location})
        if not matched:
            return ToolResult.ok(
                {
                    "sector": "insufficient_evidence",
                    "matched_keywords": [],
                    "insufficient_evidence": True,
                }
            )
        best = max(scores.values())
        winners = [sector for sector, score in scores.items() if score == best]
        sector = "ambiguous" if len(winners) > 1 else winners[0]
        return ToolResult.ok(
            {
                "sector": sector,
                "matched_keywords": matched,
                "insufficient_evidence": False,
            }
        )


# ──────────────────────────────────────────────────────────────
# find_decision_makers
# ──────────────────────────────────────────────────────────────


class FindDecisionMakersTool(ResearchTool):
    """Deterministic decision-maker discovery from text and/or search."""

    name = "find_decision_makers"
    description = (
        "Extract decision-maker candidates (name + role) from provided text "
        "and/or web-search results, using deterministic role patterns. "
        "Candidates are always 'unverified' with their source URL and the "
        "matched context. No emails or phones are ever invented — contact "
        "channels must come from evidence rows (Phase 1 ledger)."
    )
    input_schema = {
        "company_name": {"type": "str", "required": True},
        "query": {"type": "str", "required": False},
        "text": {"type": "str", "required": False},
        "max_results": {"type": "int", "required": False},
    }
    output_schema = {
        "company_name": {"type": "str", "required": True},
        "candidates": {"type": "list", "required": True},
        "candidate_count": {"type": "int", "required": True},
        "search_status": {"type": "str", "required": True},
        "note": {"type": "str", "required": True},
    }

    NOTE = (
        "Candidates are unverified text-extracted mentions. Verify with "
        "evidence (record_evidence) before use; contact channels (email/"
        "phone) must come from evidence rows — never invented."
    )

    def __init__(self, transport=None) -> None:
        self._transport = transport

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        company_name = tool_input["company_name"]
        query = tool_input.get("query")
        text = tool_input.get("text") or ""
        max_results = tool_input.get("max_results", SEARCH_DEFAULT_MAX_RESULTS)

        search_status = "not_requested"
        sources: list[tuple[str, str | None]] = []  # (text, source_url)
        if query:
            manifest = ctx.manifest_or_default()
            try:
                _, hits = run_web_search(
                    query, max_results, manifest=manifest, transport=self._transport
                )
                search_status = "ok"
                # URL-attributed extractions rank FIRST — a candidate that
                # can cite a source URL wins the dedupe over plain text.
                for hit in hits:
                    sources.append((f"{hit.title}. {hit.snippet}", hit.url))
            except SearchUnavailableError:
                search_status = (
                    "capability_unavailable: web_search is not configured — "
                    "candidates come from the provided text only"
                )
                # fall through honestly: text extraction still works
            except SearchTransportError as exc:
                return ToolResult.error(f"find_decision_makers: {exc}")
        if text:
            sources.append((text, None))

        candidates = _extract_people(sources, exclude=company_name)
        return ToolResult.ok(
            {
                "company_name": company_name,
                "candidates": candidates,
                "candidate_count": len(candidates),
                "search_status": search_status,
                "note": self.NOTE,
            }
        )


def _extract_people(sources: list[tuple[str, str | None]], *, exclude: str) -> list[dict]:
    """Extract (name, role, context, source_url) candidates from texts.

    Deterministic pattern matching only. The company name itself is
    excluded (it is not a person). Deduplicated by name+role.
    """
    exclude_tokens = {token.lower() for token in re.split(r"\s+", exclude.strip()) if token}
    seen: set[tuple[str, str]] = set()
    candidates: list[dict] = []
    for text, source_url in sources:
        for pattern in (_NAME_THEN_ROLE, _ROLE_THEN_NAME, _PAREN_ROLE):
            for match in pattern.finditer(text):
                name = match.group("name").strip()
                role = match.group("role").strip()
                name_tokens = {token.lower() for token in re.split(r"\s+", name) if token}
                if name_tokens and name_tokens <= exclude_tokens:
                    continue  # the company name, not a person
                key = (name.lower(), role.lower())
                if key in seen:
                    continue
                seen.add(key)
                start = max(0, match.start() - 60)
                end = min(len(text), match.end() + 60)
                context = text[start:end].strip()[:CONTEXT_MAX_CHARS]
                candidates.append(
                    {
                        "name": name,
                        "role": role,
                        "verification_status": "unverified",
                        "source_url": source_url,
                        "context": context,
                    }
                )
    return candidates
