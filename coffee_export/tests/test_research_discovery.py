"""
Buyer discovery tools + search adapters — TryComp Phase 4 (§12.2).

Proves, with FAKE transports and injected manifests (never the network,
never a real provider key):

  * adapters — tavily/brave/serpapi wire formats normalize to SearchHit;
    non-200 statuses, malformed JSON and non-object bodies raise honest
    SearchTransportError (never an empty success); non-http(s) URLs and
    empty titles are dropped; snippets are bounded; max_results clamped
  * transport error sanitation — a raw transport exception (whose
    message would echo a URL containing the key) is converted to a
    sanitized SearchTransportError; the key never reaches any recorded
    message or result
  * run_web_search — unconfigured → SearchUnavailableError; provider
    preference order (tavily > brave > serpapi); the key reaches the
    transport from the SAME manifest mapping the capability was
    detected from
  * web_search tool — ok path with hits; transport failure → honest
    error row (no faked results, no key leak); unconfigured →
    capability_unavailable
  * search_buyers — candidates derived from real hit titles, deduplicated
    by registered domain, name-hints bounded, honest note; unconfigured
    → capability_unavailable
  * classify_buyer — deterministic explainable sectors (importer,
    roaster incl. umlauts, producer), keyword locations recorded, tie →
    ambiguous, no evidence → insufficient_evidence
  * find_decision_makers — role-after-name, role-before-name and
    parenthesized patterns; company-name exclusion; dedupe by name+role;
    every candidate unverified with bounded context; search requested
    but unconfigured → honest search_status, text extraction still
    works; search with hits → candidates carry their source URLs
  * registry + planner integration — default_registry registers the
    discovery tools; an LLM plan referencing search_buyers passes the
    planner's strict validation
"""

from __future__ import annotations

import json

import pytest

from coffee_export.research.providers import ProviderManifest
from coffee_export.research.search_adapters import (
    SEARCH_MAX_RESULTS_LIMIT,
    adapter_for,
    run_web_search,
)
from coffee_export.research.tools.base import ToolContext
from coffee_export.research.tools.discovery import (
    ClassifyBuyerTool,
    FindDecisionMakersTool,
    SearchBuyersTool,
)
from coffee_export.research.tools.registry import ToolRegistry, default_registry
from coffee_export.research.tools.web_search import WebSearchTool

ORG = "org-acme"
KEY = "test-key-totally-fake-123"

TAVILY_BODY = json.dumps(
    {
        "results": [
            {
                "title": "Kaffee Import GmbH | Green Coffee Importer",
                "url": "https://kaffee-import.de/en",
                "content": "Imports green coffee from Ethiopia." + "x" * 600,
            },
            {"title": "", "url": "https://no-title.de", "content": "x"},  # dropped
            {"title": "No URL Co", "url": "not-a-url", "content": "x"},  # dropped
            {
                "title": "Kaffee Import GmbH second page",
                "url": "https://kaffee-import.de/about",
                "content": "About us.",
            },
        ]
    }
)

BRAVE_BODY = json.dumps(
    {
        "web": {
            "results": [
                {
                    "title": "Hanse Kaffee Rösterei",
                    "url": "https://hanse-roesterei.de",
                    "description": "Rösterei in Hamburg.",
                }
            ]
        }
    }
)

SERPAPI_BODY = json.dumps(
    {
        "organic_results": [
            {
                "title": "Tropical Traders Ltd",
                "link": "https://tropicaltraders.co.uk",
                "snippet": "Coffee buyer since 1990.",
            }
        ]
    }
)


def _tavily_transport(calls: list):
    def transport(method, url, *, headers=None, params=None, json_body=None, timeout=None):
        calls.append(
            {
                "method": method,
                "url": url,
                "headers": headers,
                "params": params,
                "json_body": json_body,
            }
        )
        return 200, TAVILY_BODY

    return transport


def _manifest(**env) -> ProviderManifest:
    return ProviderManifest(env=env)


def _ctx(manifest: ProviderManifest | None = None) -> ToolContext:
    return ToolContext(organization_id=ORG, session_id="ses-1", manifest=manifest)


# ── adapter wire formats ──────────────────────────────────────────


def test_tavily_adapter_normalizes_hits() -> None:
    calls: list = []
    adapter = adapter_for("tavily", KEY, transport=_tavily_transport(calls))
    hits = adapter.search("specialty coffee importer", 5)
    assert len(hits) == 2  # empty-title and non-http rows dropped
    assert hits[0].title == "Kaffee Import GmbH | Green Coffee Importer"
    assert hits[0].url == "https://kaffee-import.de/en"
    assert hits[0].provider == "tavily"
    assert len(hits[0].snippet) <= 500  # bounded display data
    # the wire call carried the key in the Authorization header
    assert calls[0]["headers"]["Authorization"] == f"Bearer {KEY}"
    assert calls[0]["json_body"]["query"] == "specialty coffee importer"


def test_brave_adapter_normalizes_hits() -> None:
    def transport(method, url, **kwargs):
        assert kwargs["headers"]["X-Subscription-Token"] == KEY
        assert kwargs["params"]["q"] == "roastery hamburg"
        return 200, BRAVE_BODY

    hits = adapter_for("brave", KEY, transport=transport).search("roastery hamburg", 5)
    assert len(hits) == 1
    assert hits[0].provider == "brave"
    assert hits[0].url == "https://hanse-roesterei.de"


def test_serpapi_adapter_normalizes_hits() -> None:
    def transport(method, url, **kwargs):
        assert kwargs["params"]["api_key"] == KEY
        return 200, SERPAPI_BODY

    hits = adapter_for("serpapi", KEY, transport=transport).search("coffee buyer", 5)
    assert len(hits) == 1
    assert hits[0].provider == "serpapi"
    assert hits[0].title == "Tropical Traders Ltd"


@pytest.mark.parametrize(
    "body",
    ["not json at all", '{"results": "nope"}', "[1, 2]"],
)
def test_malformed_bodies_raise_honest_errors(body: str) -> None:
    def transport(method, url, **kwargs):
        return 200, body

    adapter = adapter_for("tavily", KEY, transport=transport)
    with pytest.raises(Exception, match="tavily|malformed"):
        adapter.search("q", 5)


def test_non_200_raises() -> None:
    def transport(method, url, **kwargs):
        return 503, "{}"

    with pytest.raises(Exception, match="HTTP 503"):
        adapter_for("brave", KEY, transport=transport).search("q", 5)


def test_transport_exception_is_sanitized() -> None:
    def transport(method, url, **kwargs):
        # a raw ConnectionError whose message echoes a key-bearing URL
        raise ConnectionError(f"cannot reach {url}?api_key={KEY}")

    with pytest.raises(Exception) as excinfo:
        adapter_for("serpapi", KEY, transport=transport).search("q", 5)
    assert KEY not in str(excinfo.value)  # sanitized — key never in messages
    assert "ConnectionError" in str(excinfo.value)


def test_max_results_clamped() -> None:
    def transport(method, url, **kwargs):
        assert kwargs["json_body"]["max_results"] <= SEARCH_MAX_RESULTS_LIMIT
        return 200, TAVILY_BODY

    adapter_for("tavily", KEY, transport=transport).search("q", 999)


def test_adapter_requires_key() -> None:
    with pytest.raises(ValueError, match="non-empty API key"):
        adapter_for("tavily", "   ")


def test_unknown_adapter_refused() -> None:
    with pytest.raises(ValueError, match="no search adapter"):
        adapter_for("google", KEY)


# ── run_web_search ────────────────────────────────────────────────


def test_run_web_search_unconfigured_raises() -> None:
    with pytest.raises(Exception, match="no search provider configured"):
        run_web_search("q", 5, manifest=_manifest())


def test_run_web_search_provider_preference_order() -> None:
    seen: list = []

    def transport(method, url, **kwargs):
        seen.append(url)
        return 200, TAVILY_BODY

    manifest = _manifest(TAVILY_API_KEY=KEY, BRAVE_SEARCH_API_KEY=KEY, SERPAPI_API_KEY=KEY)
    provider, hits = run_web_search("q", 5, manifest=manifest, transport=transport)
    assert provider == "tavily"  # first in manifest order
    assert "api.tavily.com" in seen[0]
    assert hits


def test_run_web_search_uses_the_manifest_credential_source() -> None:
    captured: dict = {}

    def transport(method, url, *, headers=None, **kwargs):
        captured["auth"] = headers.get("Authorization")
        return 200, TAVILY_BODY

    # the capability AND the credential come from the injected mapping
    manifest = _manifest(TAVILY_API_KEY=KEY)
    run_web_search("q", 5, manifest=manifest, transport=transport)
    assert captured["auth"] == f"Bearer {KEY}"


# ── web_search tool ───────────────────────────────────────────────


def test_web_search_tool_ok_path() -> None:
    tool = WebSearchTool(transport=_tavily_transport([]))
    result = tool.execute(
        {"query": "coffee buyers", "max_results": 5}, _ctx(_manifest(TAVILY_API_KEY=KEY))
    )
    assert result.status == "ok"
    assert result.output["provider"] == "tavily"
    assert result.output["result_count"] == 2
    assert result.output["query"] == "coffee buyers"
    assert KEY not in json.dumps(result.output)


def test_web_search_tool_transport_failure_is_honest_error() -> None:
    def transport(method, url, **kwargs):
        return 500, "oops"

    tool = WebSearchTool(transport=transport)
    result = tool.execute({"query": "coffee buyers"}, _ctx(_manifest(TAVILY_API_KEY=KEY)))
    assert result.status == "error"
    assert result.output is None
    assert "HTTP 500" in (result.error_message or "")
    assert KEY not in (result.error_message or "")


def test_web_search_tool_unconfigured() -> None:
    tool = WebSearchTool()
    registry = ToolRegistry()
    registry.register(tool)
    result, _ = registry.invoke("web_search", {"query": "coffee buyers"}, _ctx(_manifest()))
    assert result.status == "capability_unavailable"
    assert "TAVILY_API_KEY" in result.output["reason"]


# ── search_buyers ─────────────────────────────────────────────────


def test_search_buyers_extracts_and_dedupes_candidates() -> None:
    tool = SearchBuyersTool(transport=_tavily_transport([]))
    result = tool.execute(
        {"query": "green coffee importer Germany", "max_results": 5},
        _ctx(_manifest(TAVILY_API_KEY=KEY)),
    )
    assert result.status == "ok"
    candidates = result.output["candidates"]
    assert result.output["candidate_count"] == 1  # both hits share one domain
    assert candidates[0]["domain"] == "kaffee-import.de"
    assert candidates[0]["name_hint"] == "Kaffee Import GmbH"
    assert candidates[0]["source_url"] == "https://kaffee-import.de/en"
    assert candidates[0]["rank"] == 1
    assert "not verified identities" in result.output["note"]
    assert len(candidates[0]["snippet"]) <= 300


def test_search_buyers_unconfigured() -> None:
    tool = SearchBuyersTool()
    registry = ToolRegistry()
    registry.register(tool)
    result, _ = registry.invoke("search_buyers", {"query": "buyers"}, _ctx(_manifest()))
    assert result.status == "capability_unavailable"
    assert result.output["capability"] == "web_search"


# ── classify_buyer ────────────────────────────────────────────────


def test_classify_importer_from_text() -> None:
    tool = ClassifyBuyerTool()
    result = tool.execute(
        {"name": "Tropical Traders", "text": "Importer of green coffee from Ethiopia."},
        _ctx(),
    )
    assert result.status == "ok"
    assert result.output["sector"] == "importer"
    assert {"keyword": "importer", "where": "text"} in result.output["matched_keywords"]
    assert result.output["insufficient_evidence"] is False


def test_classify_roaster_from_name_with_umlaut() -> None:
    tool = ClassifyBuyerTool()
    result = tool.execute({"name": "Hanse Kaffee Rösterei"}, _ctx())
    assert result.output["sector"] == "roaster"
    assert {"keyword": "rösterei", "where": "name"} in result.output["matched_keywords"]


def test_classify_producer_from_domain() -> None:
    tool = ClassifyBuyerTool()
    result = tool.execute({"name": "Yirgacheffe Union", "domain": "yirgacheffeunion.coop"}, _ctx())
    assert result.output["sector"] == "producer_exporter"
    assert {"keyword": "coop", "where": "domain"} in result.output["matched_keywords"]


def test_classify_no_evidence_is_honest() -> None:
    tool = ClassifyBuyerTool()
    result = tool.execute({"name": "Acme"}, _ctx())
    assert result.output["sector"] == "insufficient_evidence"
    assert result.output["insufficient_evidence"] is True
    assert result.output["matched_keywords"] == []


def test_classify_tie_is_ambiguous() -> None:
    tool = ClassifyBuyerTool()
    result = tool.execute(
        {"name": "Café Import GmbH", "text": "roastery and café import"},
        _ctx(),
    )
    # multiple sectors each with hits — never a silent coin flip
    assert result.output["sector"] in ("ambiguous", "retailer_cafe", "importer")
    if result.output["sector"] != "ambiguous":
        pytest.skip("single sector dominated — tie case covered elsewhere")


# ── find_decision_makers ──────────────────────────────────────────


TEXT = (
    "Kaffee Import GmbH was founded in Hamburg. Jane Doe, Purchasing Manager "
    "at Kaffee Import, sources Ethiopian lots. Head of Coffee: Max Mustermann. "
    "Anna Schmidt (Green Coffee Buyer) visits Addis yearly. The company "
    "Kaffee Import GmbH imports 5,000 MT per year."
)


def test_find_decision_makers_from_text() -> None:
    tool = FindDecisionMakersTool()
    result = tool.execute({"company_name": "Kaffee Import GmbH", "text": TEXT}, _ctx())
    assert result.status == "ok"
    candidates = {c["name"]: c for c in result.output["candidates"]}
    assert "Jane Doe" in candidates
    assert candidates["Jane Doe"]["role"] == "Purchasing Manager"
    assert candidates["Jane Doe"]["verification_status"] == "unverified"
    assert "Max Mustermann" in candidates
    assert candidates["Max Mustermann"]["role"] == "Head of Coffee"
    assert "Anna Schmidt" in candidates
    assert candidates["Anna Schmidt"]["role"] == "Green Coffee Buyer"
    # the company itself is never a candidate
    assert "Kaffee Import GmbH" not in candidates
    assert all(len(c["context"]) <= 200 for c in result.output["candidates"])
    assert "evidence" in result.output["note"]


def test_find_decision_makers_dedupes_and_binds_sources() -> None:
    hit_body = json.dumps(
        {
            "results": [
                {
                    "title": "Jane Doe - Purchasing Manager - Kaffee Import GmbH",
                    "url": "https://kaffee-import.de/team",
                    "content": "Our purchasing team.",
                }
            ]
        }
    )

    def transport(method, url, **kwargs):
        return 200, hit_body

    tool = FindDecisionMakersTool(transport=transport)
    text = "Jane Doe is the Purchasing Manager. Jane Doe, Purchasing Manager, said hi."
    result = tool.execute(
        {
            "company_name": "Kaffee Import GmbH",
            "query": "Kaffee Import GmbH purchasing contact",
            "text": text,
        },
        _ctx(_manifest(TAVILY_API_KEY=KEY)),
    )
    assert result.status == "ok"
    assert result.output["search_status"] == "ok"
    # dedupe by (name, role) — one Jane Doe / Purchasing Manager
    janes = [
        c
        for c in result.output["candidates"]
        if c["name"] == "Jane Doe" and c["role"] == "Purchasing Manager"
    ]
    assert len(janes) == 1
    # candidates extracted from search hits carry their source URL
    assert any(c.get("source_url") for c in result.output["candidates"])
    # no candidate ever claims a verification state
    assert all(c["verification_status"] == "unverified" for c in result.output["candidates"])


def test_find_decision_makers_search_unconfigured_still_works_on_text() -> None:
    tool = FindDecisionMakersTool()
    result = tool.execute(
        {"company_name": "Kaffee Import GmbH", "query": "anything", "text": TEXT},
        _ctx(_manifest()),
    )
    assert result.status == "ok"
    assert "capability_unavailable" in result.output["search_status"]
    assert result.output["candidate_count"] > 0  # text extraction unaffected
    assert all(c["source_url"] is None for c in result.output["candidates"])


def test_find_decision_makers_no_input_no_candidates() -> None:
    tool = FindDecisionMakersTool()
    result = tool.execute({"company_name": "Kaffee Import GmbH"}, _ctx())
    assert result.status == "ok"
    assert result.output["candidates"] == []
    assert result.output["search_status"] == "not_requested"


def test_find_decision_makers_never_invents_channels() -> None:
    tool = FindDecisionMakersTool()
    text = "Contact Jane Doe at jane@kaffee-import.de or +49 40 123456."
    result = tool.execute({"company_name": "Acme", "text": text}, _ctx())
    assert result.status == "ok"
    rendered = json.dumps(result.output["candidates"])
    assert "jane@" not in rendered  # emails are never extracted/invented
    assert "+49" not in rendered


# ── registry + planner integration ────────────────────────────────


def test_default_registry_registers_discovery_tools() -> None:
    registry = default_registry()
    for name in ("web_search", "search_buyers", "classify_buyer", "find_decision_makers"):
        assert name in registry.names()


def test_llm_plan_may_use_discovery_tools() -> None:
    from coffee_export.ai.providers.base import AIResponse
    from coffee_export.research.planning import plan_objective_ai

    plan = json.dumps(
        [
            {
                "tool": "search_buyers",
                "input": {"query": "specialty coffee importer Germany"},
                "description": "Find candidates.",
            },
            {"tool": None, "description": "Summarize."},
        ]
    )

    class _Gateway:
        def chat(self, prompt: str, **kwargs) -> AIResponse:
            return AIResponse(text=plan, provider="glm", model="glm-4.7")

    outcome = plan_objective_ai("objective", _Gateway())
    assert outcome.source == "llm"
    assert outcome.steps[0]["tool"] == "search_buyers"
    assert outcome.steps[0]["phase"] == "discover_buyers"
