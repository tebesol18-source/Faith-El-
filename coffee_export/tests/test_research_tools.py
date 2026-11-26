"""
Research tool tests — TryComp Phase 2 (§12.3).

Proves, on disposable per-test databases and a LOCAL throwaway HTTP
server (127.0.0.1, never the network):

  * registry contracts — register/lookup/names, duplicate registration
    and unknown tools refused, input validation (unknown fields,
    missing/wrong-typed/empty required fields) and output-contract
    violations recorded as honest error results
  * web_fetch bounds (§4.6) — robots.txt honored for our user-agent
    (specific group overrides *, longest rule wins, Allow beats
    Disallow on equal length, empty Disallow = allow all), 4xx robots
    allows all, 5xx/unreachable robots disallows all (conservative —
    permission that cannot be verified is not granted), http(s) only,
    byte cap (refused, not truncated), content-type allowlist, HTTP
    error statuses, redirect cap, read timeout
  * resolve_identity / detect_duplicates — deterministic normalization
    (legal suffixes, punctuation, case, www/scheme stripping), domain
    matching, name+country, weak name-only matches, org scoping
    (another tenant's leads are invisible), exclude_lead_id
  * record_evidence — records through the Phase 1 EvidenceLedger with
    honesty enforced (website row without an http(s) URL refused, human
    row without an actor refused), fact state returned
  * web_search — capability-gated: unconfigured → honest
    capability_unavailable with env var NAMES; configured-but-no-adapter
    (Phase 4) → honest refusal. Never a faked result.
"""

from __future__ import annotations

import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from coffee_export.database.models.lead import Lead, LeadContact
from coffee_export.database.models.research import ResearchEvidence, ResearchFact
from coffee_export.research import EvidenceLedger, ToolContext, ToolRegistry
from coffee_export.research.providers import ProviderManifest
from coffee_export.research.tools.base import (
    ToolInputError,
    ToolNotFoundError,
    ToolResult,
    validate_input,
)
from coffee_export.research.tools.dedupe import DetectDuplicateTool
from coffee_export.research.tools.evidence_record import RecordEvidenceTool
from coffee_export.research.tools.fetch import BoundedFetchTool
from coffee_export.research.tools.identity import (
    ResolveIdentityTool,
    domain_of,
    normalize_company_name,
)
from coffee_export.research.tools.web_search import WebSearchTool

ROBOTS_ALLOW = "User-agent: *\nDisallow: /private\n"
ROBOTS_DISALLOW_ALL = "User-agent: *\nDisallow: /\n"
ROBOTS_SPECIFIC = (
    "User-agent: *\nDisallow: /private\n"
    "User-agent: faithel-research\nDisallow: /research-only\n"
    "Allow: /research-only/public\n"
)
ROBOTS_EMPTY_DISALLOW = "User-agent: *\nDisallow:\n"


class _Routes(BaseHTTPRequestHandler):
    """Throwaway local server: routes configured per test via class attr."""

    routes: dict[str, tuple[int, str, bytes]] = {}
    hits: list[str] = []

    def do_GET(self) -> None:  # noqa: N802 — http.server API
        type(self).hits.append(self.path)
        if self.path.startswith("/redirect"):
            hops = int(self.path.rsplit("/", 1)[-1])
            if hops > 0:
                self.send_response(302)
                self.send_header("Location", f"/redirect/{hops - 1}")
                self.end_headers()
                return
            self._serve(200, "text/plain", b"landed")
            return
        status, content_type, body = self.routes.get(
            self.path, self.routes.get("*", (404, "text/plain", b"not found"))
        )
        if self.path == "/slow":
            time.sleep(2.0)
        self._serve(status, content_type, body)

    def _serve(self, status: int, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:  # silence
        return


@pytest.fixture()
def server():
    _Routes.routes = {
        "/robots.txt": (200, "text/plain", ROBOTS_ALLOW.encode()),
        "/page": (200, "text/html; charset=utf-8", b"<html>buyer profile</html>"),
        "/json": (200, "application/json", b'{"ok": true}'),
        "/private/data": (200, "text/plain", b"secret"),
        "/big": (200, "text/plain", b"x" * 2048),
        "/image": (200, "image/png", b"\x89PNG not really"),
        "/missing": (404, "text/plain", b"gone"),
    }
    _Routes.hits = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Routes)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)


@pytest.fixture()
def db_env(tmp_path: Path):
    """Disposable DB with the tables the DB-backed tools touch."""
    engine = create_engine(f"sqlite:///{tmp_path}/tools.db", future=True)
    Lead.__table__.create(engine)
    LeadContact.__table__.create(engine)
    ResearchEvidence.__table__.create(engine)
    ResearchFact.__table__.create(engine)
    return engine


def _ctx(engine: Engine, org: str = "org-acme") -> ToolContext:
    return ToolContext(organization_id=org, session_id="rses-test", engine=engine)


def _fetch(server_url: str, **kwargs) -> ToolResult:
    tool = BoundedFetchTool(**kwargs)
    return tool.execute({"url": f"{server_url}/page"}, _ctx(None))


# ── registry contracts ──────────────────────────────────────────


def test_registry_register_get_names() -> None:
    registry = ToolRegistry()
    tool = ResolveIdentityTool()
    registry.register(tool)
    assert registry.get("resolve_identity") is tool
    assert registry.names() == ["resolve_identity"]
    with pytest.raises(ValueError, match="already registered"):
        registry.register(ResolveIdentityTool())
    with pytest.raises(ToolNotFoundError):
        registry.get("nope")


def test_input_validation_rules() -> None:
    schema = {"value": {"type": "str", "required": True}, "count": {"type": "int"}}
    assert validate_input(schema, {"value": "x"}, tool_name="t") == {"value": "x"}
    for bad in (
        "not-a-dict",
        {},
        {"value": "x", "extra": 1},
        {"value": 42},
        {"value": "  "},
        {"count": True},
        {"count": "many"},
    ):
        with pytest.raises(ToolInputError):
            validate_input(schema, bad, tool_name="t")
    with pytest.raises(ValueError, match="unknown type"):
        validate_input({"f": {"type": "weird"}}, {"f": 1}, tool_name="t")


def test_invoke_converts_validation_and_contract_violations() -> None:
    class BadOutput(ResolveIdentityTool):
        def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
            return ToolResult.ok({"unexpected": "shape"})

    registry = ToolRegistry()
    registry.register(BadOutput())
    result, duration = registry.invoke(
        "resolve_identity", {"kind": "company", "name": "Acme"}, _ctx(None)
    )
    assert result.status == "error"
    assert "output contract violation" in (result.error_message or "")
    assert isinstance(duration, int) and duration >= 0


# ── web_fetch bounds (§4.6) ──────────────────────────────────────


def test_fetch_allowed_by_robots(server) -> None:
    result = _fetch(server)
    assert result.status == "ok"
    assert result.output["url"].endswith("/page")
    assert result.output["status_code"] == 200
    assert result.output["content_type"] == "text/html"
    assert result.output["body_text"] == "<html>buyer profile</html>"
    assert result.output["bytes"] == len(b"<html>buyer profile</html>")
    assert result.output["fetched_ts"]
    assert result.cost_usd is None  # no cost ever invented


def test_fetch_robots_disallow_blocks_and_never_fetches(server) -> None:
    _Routes.routes["/robots.txt"] = (200, "text/plain", ROBOTS_DISALLOW_ALL.encode())
    _Routes.hits = []
    tool = BoundedFetchTool()
    result = tool.execute({"url": f"{server}/page"}, _ctx(None))
    assert result.status == "blocked_policy"
    assert "Disallow" in result.output["reason"]
    assert "/page" not in _Routes.hits  # the resource was never requested
    assert "/robots.txt" in _Routes.hits


def test_fetch_robots_specific_group_overrides_star(server) -> None:
    _Routes.routes["/robots.txt"] = (200, "text/plain", ROBOTS_SPECIFIC.encode())
    tool = BoundedFetchTool()
    blocked = tool.execute({"url": f"{server}/research-only"}, _ctx(None))
    assert blocked.status == "blocked_policy"  # our UA's group disallows
    allowed = tool.execute({"url": f"{server}/research-only/public"}, _ctx(None))
    assert allowed.status == "error"  # allowed by robots; 404 route — robots fine
    assert "HTTP 404" in (allowed.error_message or "")


def test_fetch_robots_4xx_allows_everything(server) -> None:
    _Routes.routes["/robots.txt"] = (404, "text/plain", b"no robots here")
    result = _fetch(server)
    assert result.status == "ok"  # no robots.txt → allow all


def test_fetch_robots_5xx_disallows_all_conservatively(server) -> None:
    _Routes.routes["/robots.txt"] = (500, "text/plain", b"boom")
    result = _fetch(server)
    assert result.status == "blocked_policy"
    assert "disallow all" in result.output["reason"]


def test_fetch_robots_unreachable_disallows_all() -> None:
    # A port with nothing listening: robots.txt cannot be fetched →
    # permission cannot be verified → conservative disallow.
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    tool = BoundedFetchTool()
    result = tool.execute({"url": f"http://127.0.0.1:{port}/page"}, _ctx(None))
    assert result.status == "blocked_policy"
    assert "unreachable" in result.output["reason"]


def test_fetch_empty_disallow_means_allow_all(server) -> None:
    _Routes.routes["/robots.txt"] = (200, "text/plain", ROBOTS_EMPTY_DISALLOW.encode())
    result = _fetch(server)
    assert result.status == "ok"


def test_fetch_rejects_non_http_schemes(server) -> None:
    tool = BoundedFetchTool()
    with pytest.raises(ToolInputError, match="http"):
        tool.execute({"url": f"ftp://{server}/page"}, _ctx(None))
    with pytest.raises(ToolInputError, match="http"):
        tool.execute({"url": "file:///etc/passwd"}, _ctx(None))


def test_fetch_size_cap_refused_not_truncated(server) -> None:
    tool = BoundedFetchTool(max_bytes=64)
    result = tool.execute({"url": f"{server}/big"}, _ctx(None))
    assert result.status == "error"
    assert "exceeds max_bytes" in (result.error_message or "")
    # a caller-provided cap is bounded by the hard cap
    with pytest.raises(ToolInputError, match="max_bytes"):
        tool.execute({"url": f"{server}/page", "max_bytes": 10 * 1024 * 1024}, _ctx(None))


def test_fetch_content_type_allowlist(server) -> None:
    tool = BoundedFetchTool()
    result = tool.execute({"url": f"{server}/image"}, _ctx(None))
    assert result.status == "blocked_policy"
    assert "allowlist" in result.output["reason"]
    json_result = tool.execute({"url": f"{server}/json"}, _ctx(None))
    assert json_result.status == "ok"  # application/json allowed


def test_fetch_http_error_status(server) -> None:
    tool = BoundedFetchTool()
    result = tool.execute({"url": f"{server}/missing"}, _ctx(None))
    assert result.status == "error"
    assert "HTTP 404" in (result.error_message or "")


def test_fetch_redirect_cap(server) -> None:
    tool = BoundedFetchTool()
    result = tool.execute({"url": f"{server}/redirect/6"}, _ctx(None))
    assert result.status == "error"
    assert "redirect chain too long" in (result.error_message or "")


def test_fetch_read_timeout(server) -> None:
    tool = BoundedFetchTool(read_timeout=0.3)
    _Routes.routes["/robots.txt"] = (200, "text/plain", ROBOTS_ALLOW.encode())
    result = tool.execute({"url": f"{server}/slow"}, _ctx(None))
    assert result.status == "error"
    assert "request failed" in (result.error_message or "")


# ── resolve_identity / detect_duplicates ─────────────────────────


def _seed_leads(engine: Engine) -> None:
    """Seed org-scoped leads via the ORM (column defaults apply)."""
    from sqlalchemy.orm import sessionmaker

    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        session.add_all(
            [
                Lead(
                    lead_id="lead-1",
                    company_name="Kaldi Coffee GmbH",
                    headquarters_country="DE",
                    website="https://www.kaldicoffee.de",
                    organization_id="org-acme",
                    current_state="ENRICHED",
                    created_ts="2026-01-01T00:00:00+03:00",
                    updated_ts="2026-01-01T00:00:00+03:00",
                ),
                Lead(
                    lead_id="lead-2",
                    company_name="Hanse Trading Ltd",
                    headquarters_country="DE",
                    website="https://hanse-trading.example.com",
                    organization_id="org-acme",
                    current_state="NEW",
                    created_ts="2026-01-02T00:00:00+03:00",
                    updated_ts="2026-01-02T00:00:00+03:00",
                ),
                Lead(
                    lead_id="lead-99",
                    company_name="Kaldi Coffee GmbH",
                    headquarters_country="DE",
                    website="https://www.kaldicoffee.de",
                    organization_id="org-beta",  # another tenant — must be invisible
                    current_state="NEW",
                    created_ts="2026-01-03T00:00:00+03:00",
                    updated_ts="2026-01-03T00:00:00+03:00",
                ),
            ]
        )
        session.commit()


def test_normalization_helpers() -> None:
    assert normalize_company_name("Acme Coffee Ltd.") == "acme coffee"
    assert normalize_company_name("  KALDI   coffee GmbH  ") == "kaldi coffee"
    assert normalize_company_name("Acme Coffee Ltd. Co. KG") == "acme coffee"
    # 's.c.' is not a legal-suffix token — it stays, honestly (documented
    # conservative suffix list)
    assert normalize_company_name("Ethiopian Yirgacheffe Union S.C.") == (
        "ethiopian yirgacheffe union s c"
    )
    assert domain_of("https://www.KaldiCoffee.de/pricing") == "kaldicoffee.de"
    assert domain_of("http://hanse-trading.example.com") == "hanse-trading.example.com"
    assert domain_of("www.example.org") == "example.org"
    assert domain_of("not a domain") is None
    assert domain_of("") is None
    assert domain_of("localhost") is None


def test_resolve_identity_company_match(db_env: Engine) -> None:
    _seed_leads(db_env)
    tool = ResolveIdentityTool()
    result = tool.execute(
        {
            "kind": "company",
            "name": "Kaldi Coffee GmbH",
            "website": "https://www.kaldicoffee.de/en",
            "country": "DE",
        },
        _ctx(db_env),
    )
    assert result.status == "ok"
    assert result.output["normalized_name"] == "kaldi coffee"
    assert result.output["website_domain"] == "kaldicoffee.de"
    assert result.output["canonical_key"] == "company:kaldi coffee@kaldicoffee.de"
    assert len(result.output["matches"]) == 1  # org-beta's lead-99 invisible
    assert result.output["matches"][0]["lead_id"] == "lead-1"
    assert result.output["matches"][0]["strength"] == "domain"


def test_resolve_identity_name_country_match(db_env: Engine) -> None:
    _seed_leads(db_env)
    tool = ResolveIdentityTool()
    result = tool.execute(
        {"kind": "company", "name": "Hanse Trading Limited", "country": "de"},
        _ctx(db_env),
    )
    assert result.status == "ok"
    assert result.output["matches"][0]["lead_id"] == "lead-2"
    assert result.output["matches"][0]["strength"] == "name+country"


def test_resolve_identity_contact_match(db_env: Engine) -> None:
    _seed_leads(db_env)
    from sqlalchemy.orm import sessionmaker

    with sessionmaker(bind=db_env, expire_on_commit=False)() as session:
        session.add(
            LeadContact(
                lead_id="lead-1",
                name="Anna  Müller",
                title="Head of Purchasing",
                organization_id="org-acme",
                created_ts="2026-01-01T00:00:00+03:00",
                updated_ts="2026-01-01T00:00:00+03:00",
            )
        )
        session.commit()
    tool = ResolveIdentityTool()
    result = tool.execute({"kind": "contact", "name": "Anna   Müller"}, _ctx(db_env))
    assert result.status == "ok"
    assert result.output["canonical_key"] == "contact:anna müller"
    assert result.output["matches"][0]["contact_id"] == 1
    assert result.output["matches"][0]["lead_id"] == "lead-1"


def test_detect_duplicates_strong_and_weak(db_env: Engine) -> None:
    _seed_leads(db_env)
    tool = DetectDuplicateTool()
    strong = tool.execute(
        {"kind": "company", "name": "Kaldi Kaffee", "website": "kaldicoffee.de"},
        _ctx(db_env),
    )
    assert strong.status == "ok"
    assert strong.output["is_duplicate"] is True  # domain match
    assert strong.output["matches"][0]["strength"] == "domain"

    weak = tool.execute({"kind": "company", "name": "Kaldi Coffee GmbH"}, _ctx(db_env))
    assert weak.status == "ok"
    assert weak.output["is_duplicate"] is False  # name-only — weak, not a duplicate
    assert weak.output["matches"][0]["strength"] == "name"

    distinct = tool.execute({"kind": "company", "name": "Totally New Buyers"}, _ctx(db_env))
    assert distinct.output["is_duplicate"] is False
    assert distinct.output["matches"] == []


def test_detect_duplicates_org_scoped_and_exclusion(db_env: Engine) -> None:
    _seed_leads(db_env)
    tool = DetectDuplicateTool()
    beta = tool.execute(
        {"kind": "company", "name": "Kaldi Coffee GmbH", "country": "DE"},
        _ctx(db_env, org="org-beta"),
    )
    assert beta.output["is_duplicate"] is True  # sees ONLY its own lead-99
    assert beta.output["matches"][0]["lead_id"] == "lead-99"

    excluded = tool.execute(
        {
            "kind": "company",
            "name": "Kaldi Coffee GmbH",
            "website": "kaldicoffee.de",
            "exclude_lead_id": "lead-1",
        },
        _ctx(db_env),
    )
    assert excluded.output["matches"] == []  # lead-1 excluded from the match set


# ── record_evidence (Phase 1 ledger through the tool) ────────────


def test_record_evidence_through_ledger(db_env: Engine) -> None:
    tool = RecordEvidenceTool()
    result = tool.execute(
        {
            "subject_type": "lead",
            "subject_id": "lead-1",
            "fact_key": "annual_volume_mt",
            "value": 1200,
            "source_type": "website",
            "source_url": "https://example.com/buyer",
        },
        _ctx(db_env),
    )
    assert result.status == "ok"
    evidence_id = result.output["evidence_id"]
    assert result.output["fact_status"] == "observed"
    assert result.output["fact_source_count"] == 1

    ledger = EvidenceLedger("org-acme", db_env)
    row = ledger.get_evidence(evidence_id)  # really in the Phase 1 ledger
    assert row.fact_key == "annual_volume_mt"
    assert row.source_type == "website"
    assert row.organization_id == "org-acme"


def test_record_evidence_enforces_source_honesty(db_env: Engine) -> None:
    tool = RecordEvidenceTool()
    registry = ToolRegistry()
    registry.register(tool)
    result, _ = registry.invoke(
        "record_evidence",
        {
            "subject_type": "lead",
            "subject_id": "lead-1",
            "fact_key": "volume",
            "value": 1,
            "source_type": "website",
            # no source_url — the Phase 1 honesty gate must refuse
        },
        _ctx(db_env),
    )
    assert result.status == "error"
    assert "http(s) source_url" in (result.error_message or "")
    ledger = EvidenceLedger("org-acme", db_env)
    assert ledger.list_evidence("lead", "lead-1") == []  # nothing was written


# ── web_search capability gating (§10) ───────────────────────────


def test_web_search_unconfigured_never_fakes() -> None:
    tool = WebSearchTool()
    registry = ToolRegistry()
    registry.register(tool)
    ctx = ToolContext(organization_id="org-acme", session_id="s", manifest=ProviderManifest(env={}))
    result, _ = registry.invoke("web_search", {"query": "coffee buyers"}, ctx)
    assert result.status == "capability_unavailable"
    assert result.output["capability"] == "web_search"
    assert "TAVILY_API_KEY" in result.output["reason"]
    assert "never faked" in result.output["reason"]


def test_web_search_configured_without_transport_is_honest_error() -> None:
    # Phase 4 ships the adapters: a configured provider now attempts a
    # REAL bounded call. In the offline sandbox that call fails and the
    # tool must return an honest error row — never a faked empty success
    # and never a crash past the registry.
    tool = WebSearchTool()
    registry = ToolRegistry()
    registry.register(tool)
    ctx = ToolContext(
        organization_id="org-acme",
        session_id="s",
        manifest=ProviderManifest(env={"TAVILY_API_KEY": "some-key"}),
    )
    result, _ = registry.invoke("web_search", {"query": "coffee buyers"}, ctx)
    assert result.status == "error"  # offline sandbox: transport failure
    assert result.output is None  # no faked results ever
    assert "some-key" not in (result.error_message or "")  # key never leaks
