"""
Search provider adapters (TryComp Phase 4, §12.2).

The execution side of the web_search capability the manifest detects
(§3 G / §10): one bounded, honest HTTP adapter per supported provider
(tavily, brave, serpapi). Design rules:

  * NEVER faked: without a configured key the caller reports
    capability_unavailable (SearchUnavailableError → the tool converts);
    with a key, an adapter call that fails raises SearchTransportError —
    which becomes an honest error tool-call row, never an empty "success".
  * NEVER a paid API by default: adapters only run when the operator
    sets a provider env var (TAVILY_API_KEY / BRAVE_SEARCH_API_KEY /
    SERPAPI_API_KEY). Nothing here reads keys at import time.
  * Bounded egress (§4.6): http/https only, 10s read timeout, response
    bodies capped at SEARCH_RESPONSE_MAX_BYTES and REFUSED (not
    truncated) beyond the cap. Snippets are display data, not evidence
    bodies, so a snippet may be bounded (500 chars) — the full evidence
    body must come from web_fetch, whose cap-and-refuse rules stand.
  * No cost invention: search hits carry no price; cost_usd stays None.
  * Secrets: the API key is passed to the transport only. It is never
    logged, never stored, never echoed in errors or results.

Adapter wire formats are implemented from the public API docs of each
provider and verified against canned fixtures in tests (the offline
sandbox has no provider key — no live call is ever made by the test
suite). Honest limitation, recorded here: live provider compatibility
is untested in this environment.

The transport is injectable (tests pass fakes; production uses
requests with the bounds above) — (method, url, *, headers, params,
json_body, timeout) -> (status_code, body_text).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import requests

from coffee_export.research.providers import WEB_SEARCH_PROVIDER_ENV_KEYS

#: Hard bound on a search response body (refused, not truncated).
SEARCH_RESPONSE_MAX_BYTES = 256 * 1024
#: Read timeout for search calls (seconds).
SEARCH_TIMEOUT_SECONDS = 10.0
#: Upper bound for max_results accepted by any adapter (bounded work).
SEARCH_MAX_RESULTS_LIMIT = 20
#: Default result count.
SEARCH_DEFAULT_MAX_RESULTS = 8
#: Snippets are display data — bounded to keep rows compact.
SNIPPET_MAX_CHARS = 500

TransportResponse = tuple[int, str]
Transport = Callable[..., TransportResponse]


class SearchUnavailableError(RuntimeError):
    """No search provider is configured (honest §10 refusal)."""


class SearchTransportError(RuntimeError):
    """A configured provider call failed operationally (never faked
    into an empty success)."""


@dataclass(frozen=True)
class SearchHit:
    """One normalized search result — display data, never evidence."""

    title: str
    url: str
    snippet: str
    provider: str

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "provider": self.provider,
        }


def default_transport(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = SEARCH_TIMEOUT_SECONDS,
) -> TransportResponse:
    """The bounded production transport (requests, streamed, size-capped)."""
    response = requests.request(
        method,
        url,
        headers=headers,
        params=params,
        json=json_body,
        timeout=timeout,
        stream=True,
        allow_redirects=True,
    )
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=16 * 1024):
        total += len(chunk)
        if total > SEARCH_RESPONSE_MAX_BYTES:
            raise SearchTransportError(
                f"search response exceeds {SEARCH_RESPONSE_MAX_BYTES} bytes — "
                "refused, not truncated"
            )
        chunks.append(chunk)
    return response.status_code, b"".join(chunks).decode("utf-8", errors="replace")


class _BaseAdapter:
    """Shared normalization: bounded snippets, http(s) URLs only,
    non-200 statuses raised, malformed bodies raised (never faked)."""

    provider_name: str = "base"

    def __init__(self, api_key: str, transport: Transport | None = None) -> None:
        if not api_key or not api_key.strip():
            raise ValueError(f"{self.provider_name} adapter requires a non-empty API key")
        self._api_key = api_key.strip()
        self._transport: Transport = transport or default_transport

    def _call(
        self, hits_from: Callable[[dict], list[SearchHit]], *args: Any, **kwargs: Any
    ) -> list[SearchHit]:
        try:
            status, body = self._transport(*args, **kwargs)
        except SearchTransportError:
            raise
        except Exception as exc:
            # SANITIZED on purpose: raw transport errors (e.g. requests
            # ConnectionError) can echo the full request URL — and the
            # serpapi wire format carries the key in the URL. The
            # exception TYPE is recorded; the original stays on the
            # chain (__cause__) for debugging tracebacks only.
            raise SearchTransportError(
                f"{self.provider_name} transport failed: {type(exc).__name__}"
            ) from exc
        if status != 200:
            raise SearchTransportError(f"{self.provider_name} returned HTTP {status}")
        try:
            data = json.loads(body)
        except json.JSONDecodeError as exc:
            raise SearchTransportError(
                f"{self.provider_name} returned a non-JSON body: {exc}"
            ) from exc
        if not isinstance(data, dict):
            raise SearchTransportError(f"{self.provider_name} returned a non-object body")
        hits = hits_from(data)
        if not isinstance(hits, list):
            raise SearchTransportError(f"{self.provider_name} returned a malformed results field")
        return hits

    @staticmethod
    def _results_list(data: dict, *keys: str) -> list | None:
        """Walk nested keys (e.g. 'web', 'results') and REQUIRE a list.

        A results field that exists but is not a list is a malformed
        body — raised honestly, never coerced to empty (an empty list
        from a broken body would read as 'no results found')."""
        node: object = data
        for key in keys:
            if not isinstance(node, dict):
                raise SearchTransportError(f"malformed response shape at {key!r} — not an object")
            node = node.get(key)
        if node is None:
            return None  # field absent → treat as zero hits
        if not isinstance(node, list):
            raise SearchTransportError(f"malformed results field {keys[-1]!r} — not a list")
        return node

    @staticmethod
    def _hit(provider: str, title: object, url: object, snippet: object) -> SearchHit | None:
        title_s = str(title or "").strip()
        url_s = str(url or "").strip()
        if not title_s or not url_s.startswith(("http://", "https://")):
            return None  # a hit without a usable URL is not a company candidate
        snippet_s = str(snippet or "").strip()[:SNIPPET_MAX_CHARS]
        return SearchHit(title=title_s, url=url_s, snippet=snippet_s, provider=provider)


class TavilyAdapter(_BaseAdapter):
    """POST https://api.tavily.com/search (Bearer auth)."""

    provider_name = "tavily"

    def search(
        self, query: str, max_results: int, *, transport: Transport | None = None
    ) -> list[SearchHit]:
        n = max(1, min(int(max_results), SEARCH_MAX_RESULTS_LIMIT))

        def hits_from(data: dict) -> list[SearchHit]:
            results = self._results_list(data, "results") or []
            hits = [
                self._hit("tavily", r.get("title"), r.get("url"), r.get("content"))
                for r in results
                if isinstance(r, dict)
            ]
            return [h for h in hits if h is not None][:n]

        return self._call(
            hits_from,
            "POST",
            "https://api.tavily.com/search",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            params=None,
            json_body={"query": query, "max_results": n},
        )


class BraveAdapter(_BaseAdapter):
    """GET https://api.search.brave.com/res/v1/web/search
    (X-Subscription-Token auth)."""

    provider_name = "brave"

    def search(
        self, query: str, max_results: int, *, transport: Transport | None = None
    ) -> list[SearchHit]:
        n = max(1, min(int(max_results), SEARCH_MAX_RESULTS_LIMIT))

        def hits_from(data: dict) -> list[SearchHit]:
            results = self._results_list(data, "web", "results") or []
            hits = [
                self._hit("brave", r.get("title"), r.get("url"), r.get("description"))
                for r in results
                if isinstance(r, dict)
            ]
            return [h for h in hits if h is not None][:n]

        return self._call(
            hits_from,
            "GET",
            "https://api.search.brave.com/res/v1/web/search",
            headers={
                "X-Subscription-Token": self._api_key,
                "Accept": "application/json",
            },
            params={"q": query, "count": n},
            json_body=None,
        )


class SerpApiAdapter(_BaseAdapter):
    """GET https://serpapi.com/search (api_key query param)."""

    provider_name = "serpapi"

    def search(
        self, query: str, max_results: int, *, transport: Transport | None = None
    ) -> list[SearchHit]:
        n = max(1, min(int(max_results), SEARCH_MAX_RESULTS_LIMIT))

        def hits_from(data: dict) -> list[SearchHit]:
            results = self._results_list(data, "organic_results") or []
            hits = [
                self._hit("serpapi", r.get("title"), r.get("link"), r.get("snippet"))
                for r in results
                if isinstance(r, dict)
            ]
            return [h for h in hits if h is not None][:n]

        return self._call(
            hits_from,
            "GET",
            "https://serpapi.com/search",
            headers={"Accept": "application/json"},
            params={"q": query, "num": n, "api_key": self._api_key},
            json_body=None,
        )


_ADAPTERS: dict[str, type[_BaseAdapter]] = {
    "tavily": TavilyAdapter,
    "brave": BraveAdapter,
    "serpapi": SerpApiAdapter,
}


def adapter_for(
    provider_name: str, api_key: str, transport: Transport | None = None
) -> _BaseAdapter:
    """Build the adapter for a manifest-detected provider name."""
    adapter_cls = _ADAPTERS.get(provider_name)
    if adapter_cls is None:
        raise ValueError(
            f"no search adapter for provider {provider_name!r} " f"(known: {sorted(_ADAPTERS)})"
        )
    return adapter_cls(api_key, transport)


def run_web_search(
    query: str,
    max_results: int = SEARCH_DEFAULT_MAX_RESULTS,
    *,
    manifest: Any,
    transport: Transport | None = None,
) -> tuple[str, list[SearchHit]]:
    """Search through the FIRST configured provider (manifest order).

    Raises SearchUnavailableError when nothing is configured (the
    caller converts to the honest §10 refusal) and
    SearchTransportError when the call fails (the caller converts to an
    honest error row — never an empty success).
    """
    if not query or not query.strip():
        raise ValueError("query is required (non-empty)")
    capability = manifest.web_search_available()
    if capability is None:
        names = ", ".join(name for _, name in WEB_SEARCH_PROVIDER_ENV_KEYS)
        raise SearchUnavailableError(f"no search provider configured (env vars: {names})")
    api_key = manifest.credential(capability.env_var)
    adapter = adapter_for(capability.name, api_key, transport)
    hits = adapter.search(query.strip(), max_results, transport=transport)
    return capability.name, hits
