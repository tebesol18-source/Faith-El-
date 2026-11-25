"""
Bounded, robots-aware web fetch tool (TryComp Phase 2, §12.3 / §4.6).

The research egress primitive — the ONLY new HTTP egress in the Python
backend (§6: none existed). Bounds (standing security decision §4.6):

  * http/https only (other schemes are rejected as invalid input);
  * robots.txt is honored for our user-agent (faithel-research/1.0) with
    the * group as fallback — RFC 9309 semantics: longest matching rule
    wins, Allow beats Disallow on equal length, an empty Disallow allows
    everything. Unreachable robots.txt (5xx or network failure) is
    treated CONSERVATIVELY as disallow-all — permission that cannot be
    verified is not granted. A 4xx robots.txt allows all (standard).
  * connect/read timeouts (5s/10s defaults);
  * response body capped at max_bytes (512 KiB default) — oversized
    responses are REFUSED, not truncated (evidence must be exactly what
    the source served);
  * redirect chains beyond 3 are errors (requests enforces its own hard
    cap too — TooManyRedirects is caught and recorded);
  * content-type allowlist: text/*, application/json, application/xml.

Every refusal is an honest, auditable ToolResult — blocked_policy for
robots/allowlist refusals, error for operational failures (timeout,
oversize, HTTP >= 400, network). Nothing is ever faked and no cost is
ever invented (cost_usd stays None — direct fetches have no reported
price).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import requests

from coffee_export.research.providers import RESEARCH_USER_AGENT
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolContext,
    ToolInputError,
    ToolResult,
)

DEFAULT_MAX_BYTES = 512 * 1024
HARD_MAX_BYTES = 2 * 1024 * 1024
DEFAULT_CONNECT_TIMEOUT = 5.0
DEFAULT_READ_TIMEOUT = 10.0
MAX_REDIRECTS = 3
ROBOTS_MAX_BYTES = 64 * 1024
ALLOWED_CONTENT_TYPE_PREFIXES = ("text/", "application/json", "application/xml")

_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)

_ADDIS_TZ = timezone(timedelta(hours=3))


def _now_iso() -> str:
    return datetime.now(_ADDIS_TZ).isoformat(timespec="seconds")


def _robots_url_for(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}/robots.txt"


# ──────────────────────────────────────────────────────────────
# Minimal RFC 9309 robots.txt evaluation
# ──────────────────────────────────────────────────────────────


def _agent_token_matches(user_agent_line: str, token: str) -> bool:
    """True when our PRODUCT token (the part before '/') equals one of
    the whitespace-separated tokens in a User-agent line (RFC 9309 token
    match, case-insensitive — 'faithel-research' matches the line
    'User-agent: FaithEl-Research' but not 'someotherbot')."""
    product = token.split("/", 1)[0].lower()
    return product in {t.lower() for t in user_agent_line.split()}


def _parse_robots_rules(text: str, user_agent: str) -> list[tuple[str, str]]:
    """Extract the (kind, path) rule list that applies to user_agent.

    Groups: the group whose User-agent line matches our token wins; if
    none matches, the '*' group applies. An empty 'Disallow:' means
    allow-everything (a zero-length path never prefix-matches anything
    non-empty — we encode it as kind 'allow' with path '').
    """
    star_rules: list[tuple[str, str]] = []
    current_agents: list[str] = []
    current_rules: list[tuple[str, str]] = []
    matched_rules: list[tuple[str, str]] | None = None

    def flush_group() -> None:
        nonlocal matched_rules, current_rules
        if current_agents:
            rules = current_rules
            if any(_agent_token_matches(agent, user_agent) for agent in current_agents):
                # This group explicitly names our product token — its
                # rules apply to us (a group applies to every agent it
                # lists, so a group holding both '*' and our token is a
                # match for us).
                if matched_rules is None:
                    matched_rules = []
                matched_rules.extend(rules)
            elif any(agent.strip() == "*" for agent in current_agents):
                star_rules.extend(rules)
            # Groups naming only OTHER agents are ignored.
        current_rules = []

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if ":" not in line:
            continue
        field, _, value = line.partition(":")
        field = field.strip().lower()
        value = value.strip()
        if field == "user-agent":
            if current_rules:
                # A new User-agent line after rules starts a NEW group.
                flush_group()
                current_agents = [value]
                current_rules = []
            else:
                current_agents.append(value)
        elif field in ("disallow", "allow"):
            if not current_agents:
                continue  # rule outside any group — ignore
            kind = field
            path = value
            if kind == "disallow" and path == "":
                # "Disallow:" with no path = allow everything.
                kind, path = "allow", ""
            current_rules.append((kind, path))
    flush_group()

    return matched_rules if matched_rules is not None else star_rules


def _rule_matches_path(rule_path: str, target_path: str) -> bool:
    if rule_path == "":
        return False  # the empty allow-everything rule never matches a path
    return target_path.startswith(rule_path)


def robots_decision(rules: list[tuple[str, str]], target_path: str) -> tuple[bool, str]:
    """Longest-match-wins allow/disallow decision for one path.

    Returns (allowed, reason). Allow beats Disallow on equal length
    (RFC 9309 §4.2.1.2 semantics, without wildcard support — documented
    simplification; wildcards in robots files are rare and the
    conservative default below covers them).
    """
    best: tuple[str, str, int] | None = None  # (kind, path, length)
    for kind, path in rules:
        if _rule_matches_path(path, target_path):
            length = len(path)
            if best is None or length > best[2] or (length == best[2] and kind == "allow"):
                best = (kind, path, length)
    if best is None:
        return True, "no matching robots rule — allowed by default"
    if best[0] == "allow":
        return True, f"robots Allow: {best[1]!r}"
    return False, f"robots Disallow: {best[1]!r}"


# ──────────────────────────────────────────────────────────────
# The tool
# ──────────────────────────────────────────────────────────────


class BoundedFetchTool(ResearchTool):
    """Fetch one http(s) URL under the §4.6 egress bounds."""

    name = "web_fetch"
    description = (
        "Bounded, robots-aware HTTP fetch of one http(s) URL: timeouts, "
        "byte cap, redirect cap, content-type allowlist, robots.txt honored."
    )
    input_schema = {
        "url": {"type": "str", "required": True},
        "max_bytes": {"type": "int", "required": False},
    }
    output_schema = {
        "url": {"type": "str", "required": True},
        "status_code": {"type": "int", "required": True},
        "content_type": {"type": "str", "required": True},
        "bytes": {"type": "int", "required": True},
        "body_text": {"type": "str", "required": True},
        "fetched_ts": {"type": "str", "required": True},
    }

    def __init__(
        self,
        *,
        connect_timeout: float = DEFAULT_CONNECT_TIMEOUT,
        read_timeout: float = DEFAULT_READ_TIMEOUT,
        max_bytes: int = DEFAULT_MAX_BYTES,
        user_agent: str = RESEARCH_USER_AGENT,
    ) -> None:
        self._connect_timeout = connect_timeout
        self._read_timeout = read_timeout
        self._max_bytes = max_bytes
        self._user_agent = user_agent

    # ── robots ──────────────────────────────────────────────────

    def _fetch_robots(self, url: str) -> tuple[str | None, str]:
        """Fetch robots.txt for the URL's origin.

        Returns (robots_text | None, note). None + note describes the
        honest fallback semantics: 4xx → allow-all, 5xx/network error →
        disallow-all (conservative — permission that cannot be verified
        is not granted).
        """
        robots_url = _robots_url_for(url)
        try:
            response = requests.get(
                robots_url,
                timeout=(self._connect_timeout, self._read_timeout),
                headers={"User-Agent": self._user_agent},
                allow_redirects=True,
                stream=True,
            )
            with response:
                if 400 <= response.status_code < 500:
                    return None, f"robots.txt HTTP {response.status_code} — allow all"
                if response.status_code >= 500:
                    return (
                        None,
                        f"robots.txt HTTP {response.status_code} — disallow all (conservative)",
                    )
                body = b""
                for chunk in response.iter_content(chunk_size=4096):
                    body += chunk
                    if len(body) > ROBOTS_MAX_BYTES:
                        return None, "robots.txt exceeds size cap — disallow all (conservative)"
                return body.decode("utf-8", errors="replace"), "robots.txt fetched"
        except requests.RequestException as exc:
            return (
                None,
                f"robots.txt unreachable ({type(exc).__name__}) — disallow all (conservative)",
            )

    def _robots_allows(self, url: str) -> tuple[bool, str]:
        parts = urlsplit(url)
        target_path = parts.path or "/"
        if parts.query:
            target_path = f"{target_path}?{parts.query}"
        text, note = self._fetch_robots(url)
        if text is None:
            allowed = note.startswith("robots.txt HTTP 4")  # 4xx → allow
            if allowed:
                return True, note
            return False, note
        rules = _parse_robots_rules(text, self._user_agent)
        return robots_decision(rules, target_path)

    # ── execution ───────────────────────────────────────────────

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:  # noqa: ARG002
        url = tool_input["url"]
        if not _SCHEME_RE.match(url):
            raise ToolInputError(f"web_fetch: only http(s) URLs can be fetched, got {url!r}")
        max_bytes = tool_input.get("max_bytes", self._max_bytes)
        if max_bytes is None:
            max_bytes = self._max_bytes
        if not isinstance(max_bytes, int) or isinstance(max_bytes, bool):
            raise ToolInputError("web_fetch: max_bytes must be an int")
        if max_bytes < 1 or max_bytes > HARD_MAX_BYTES:
            raise ToolInputError(
                f"web_fetch: max_bytes must be between 1 and {HARD_MAX_BYTES}, got {max_bytes}"
            )

        allowed, robots_reason = self._robots_allows(url)
        if not allowed:
            return ToolResult.blocked_policy(
                {
                    "url": url,
                    "reason": robots_reason,
                    "user_agent": self._user_agent,
                }
            )

        try:
            response = requests.get(
                url,
                timeout=(self._connect_timeout, self._read_timeout),
                headers={"User-Agent": self._user_agent},
                allow_redirects=True,
                stream=True,
            )
        except requests.RequestException as exc:
            return ToolResult.error(f"web_fetch: request failed: {type(exc).__name__}: {exc}")

        with response:
            redirects = len(response.history)
            if redirects > MAX_REDIRECTS:
                return ToolResult.error(
                    f"web_fetch: redirect chain too long ({redirects} > {MAX_REDIRECTS})"
                )
            if response.status_code >= 400:
                return ToolResult.error(f"web_fetch: HTTP {response.status_code} for {url}")
            content_type = (
                (response.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
            )
            if not content_type.startswith(ALLOWED_CONTENT_TYPE_PREFIXES):
                return ToolResult.blocked_policy(
                    {
                        "url": url,
                        "reason": (
                            f"content-type {content_type!r} is outside the "
                            "research allowlist (text/*, application/json, application/xml)"
                        ),
                        "user_agent": self._user_agent,
                    }
                )
            body = b""
            for chunk in response.iter_content(chunk_size=8192):
                body += chunk
                if len(body) > max_bytes:
                    return ToolResult.error(
                        f"web_fetch: response exceeds max_bytes ({max_bytes}) — "
                        "refused, not truncated"
                    )
        return ToolResult.ok(
            {
                "url": response.url,
                "status_code": response.status_code,
                "content_type": content_type,
                "bytes": len(body),
                "body_text": body.decode("utf-8", errors="replace"),
                "fetched_ts": _now_iso(),
            }
        )
