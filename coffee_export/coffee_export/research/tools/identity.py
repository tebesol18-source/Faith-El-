"""
Identity resolution tool (TryComp Phase 2, §12.3).

Deterministic, org-scoped resolution of a company/contact identity:
normalize the name (legal-suffix stripping, punctuation, case), extract
the registered domain from a website, derive a stable canonical key and
find existing org-scoped matches among leads/contacts.

NO AI and NO network: every match is explainable by a deterministic rule
(company key equality, domain equality, name+country, contact name) —
identity resolution output never claims verification, only structural
similarity. Another tenant's records are invisible by construction
(queries filter organization_id).
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from sqlalchemy import select

from coffee_export.database.models.lead import Lead, LeadContact
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolContext,
    ToolInputError,
    ToolResult,
)

#: Legal suffix tokens stripped (repeatedly, from the END) when
#: normalizing company names. Deliberately conservative — no attempt to
#: handle every jurisdiction, only the common ones.
LEGAL_SUFFIXES: frozenset[str] = frozenset(
    {
        "ag",
        "as",
        "ab",
        "bv",
        "co",
        "corp",
        "corporation",
        "company",
        "gmbh",
        "inc",
        "incorporated",
        "kg",
        "limited",
        "ltd",
        "ltda",
        "llc",
        "mbh",
        "nv",
        "oy",
        "plc",
        "pty",
        "sa",
        "sas",
        "sarl",
        "srl",
        "spa",
        "ug",
    }
)

_PUNCT_RE = re.compile(r"[&/,\.\-\(\)\"'’]+")
_WS_RE = re.compile(r"\s+")


def normalize_company_name(name: str) -> str:
    """Lowercase, punctuation-split, whitespace-collapsed company name
    with legal suffixes stripped from the end (repeatedly, so
    'Acme Coffee Ltd.' and 'ACME COFFEE' normalize identically)."""
    tokens = _WS_RE.sub(" ", _PUNCT_RE.sub(" ", name.strip().lower())).split()
    while len(tokens) > 1 and tokens[-1] in LEGAL_SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


def normalize_contact_name(name: str) -> str:
    """Lowercase, punctuation-split, whitespace-collapsed contact name."""
    return " ".join(_WS_RE.sub(" ", _PUNCT_RE.sub(" ", name.strip().lower())).split())


def domain_of(website: str | None) -> str | None:
    """The registered host of a website string: strips the scheme, path,
    query and a leading 'www.' — 'https://www.KaldiCoffee.de/pricing'
    → 'kaldicoffee.de'. None for empty/invalid input or hosts without
    a dot (not a plausible domain)."""
    if not website or not website.strip():
        return None
    candidate = website.strip()
    if "://" not in candidate:
        candidate = f"http://{candidate}"
    try:
        host = urlsplit(candidate).netloc.split("@")[-1].split(":")[0]
    except ValueError:
        return None
    host = host.strip().lower()
    if host.startswith("www."):
        host = host[4:]
    if not host or "." not in host:
        return None
    return host


def company_identity_key(normalized_name: str, domain: str | None, country: str | None) -> str:
    """Stable canonical key: name + the strongest available locator
    (domain preferred, else country). Used for match comparison only —
    never stored as a claim about the subject."""
    locator = f"@{domain}" if domain else (f"#{(country or '').strip().lower()}" if country else "")
    return f"company:{normalized_name}{locator}"


def _match_company(
    lead_id: str,
    company_name: str | None,
    lead_country: str | None,
    lead_website: str | None,
    normalized_name: str,
    domain: str | None,
    country: str | None,
) -> dict | None:
    """Deterministic match of one lead against a normalized identity.

    Strength ranking: 'domain' (same registered domain) > 'name+country'
    > 'name' (weak, surfaced but never alone a duplicate).
    """
    lead_name = normalize_company_name(company_name or "")
    lead_domain = domain_of(lead_website)
    lead_country = (lead_country or "").strip().lower()
    if domain is not None and lead_domain is not None and domain == lead_domain:
        return {
            "source": "leads",
            "lead_id": lead_id,
            "company_name": company_name,
            "matched_on": "registered domain",
            "strength": "domain",
        }
    if (
        normalized_name
        and lead_name == normalized_name
        and country is not None
        and lead_country == country.strip().lower()
    ):
        return {
            "source": "leads",
            "lead_id": lead_id,
            "company_name": company_name,
            "matched_on": "company name + country",
            "strength": "name+country",
        }
    if normalized_name and lead_name == normalized_name:
        return {
            "source": "leads",
            "lead_id": lead_id,
            "company_name": company_name,
            "matched_on": "company name (weak — no domain/country confirmation)",
            "strength": "name",
        }
    return None


def match_companies(
    ctx: ToolContext,
    normalized_name: str,
    domain: str | None,
    country: str | None,
    *,
    exclude_lead_id: str | None = None,
) -> list[dict]:
    """All deterministic matches for a normalized company identity in
    THIS org (domain > name+country > name).

    Uses an explicit COLUMN select on the connection (no ORM session,
    no entity loading — a read-only matcher).
    """
    engine = ctx.require_engine()
    matches: list[dict] = []
    with engine.connect() as conn:
        rows = conn.execute(
            select(
                Lead.lead_id,
                Lead.company_name,
                Lead.headquarters_country,
                Lead.website,
            ).where(Lead.organization_id == ctx.organization_id)
        ).all()
    for lead_id, company_name, lead_country, lead_website in rows:
        if exclude_lead_id is not None and lead_id == exclude_lead_id:
            continue
        match = _match_company(
            lead_id,
            company_name,
            lead_country,
            lead_website,
            normalized_name,
            domain,
            country,
        )
        if match is not None:
            matches.append(match)
    return matches


class ResolveIdentityTool(ResearchTool):
    """Resolve one company/contact identity deterministically."""

    name = "resolve_identity"
    description = (
        "Deterministic identity resolution: normalize company/contact names, "
        "extract the registered domain, derive a canonical key and find "
        "org-scoped matches among existing leads/contacts. No AI, no network."
    )
    input_schema = {
        "kind": {"type": "str", "required": True},
        "name": {"type": "str", "required": True},
        "website": {"type": "str", "required": False},
        "country": {"type": "str", "required": False},
    }
    output_schema = {
        "kind": {"type": "str", "required": True},
        "normalized_name": {"type": "str", "required": True},
        "canonical_key": {"type": "str", "required": True},
        "website_domain": {"type": "any", "required": True},
        "matches": {"type": "list", "required": True},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        kind = tool_input["kind"].strip().lower()
        if kind not in ("company", "contact"):
            raise ToolInputError(
                f"resolve_identity: kind must be 'company' or 'contact', got {tool_input['kind']!r}"
            )
        website = tool_input.get("website")
        country = tool_input.get("country")
        domain = domain_of(website)

        if kind == "company":
            normalized = normalize_company_name(tool_input["name"])
            if not normalized:
                raise ToolInputError("resolve_identity: name does not normalize to anything")
            canonical = company_identity_key(normalized, domain, country)
            matches = match_companies(ctx, normalized, domain, country)
        else:
            normalized = normalize_contact_name(tool_input["name"])
            if not normalized:
                raise ToolInputError("resolve_identity: name does not normalize to anything")
            canonical = f"contact:{normalized}"
            matches = self._match_contacts(ctx, normalized)

        return ToolResult.ok(
            {
                "kind": kind,
                "normalized_name": normalized,
                "canonical_key": canonical,
                "website_domain": domain,
                "matches": matches,
            }
        )

    @staticmethod
    def _match_contacts(ctx: ToolContext, normalized_name: str) -> list[dict]:
        """Contacts of THIS org whose normalized name is identical —
        deterministic equality, org-scoped via the parent lead.

        Explicit column select with join_from (no ORM session, read-only).
        """
        engine = ctx.require_engine()
        matches: list[dict] = []
        with engine.connect() as conn:
            rows = conn.execute(
                select(
                    LeadContact.id,
                    LeadContact.lead_id,
                    LeadContact.name,
                    Lead.company_name,
                )
                .join_from(LeadContact, Lead, LeadContact.lead_id == Lead.lead_id)
                .where(Lead.organization_id == ctx.organization_id)
            ).all()
        for contact_id, lead_id, name, company_name in rows:
            if normalize_contact_name(name or "") == normalized_name:
                matches.append(
                    {
                        "source": "lead_contacts",
                        "contact_id": contact_id,
                        "lead_id": lead_id,
                        "company_name": company_name,
                        "matched_on": "contact name (normalized equality)",
                        "strength": "contact_name",
                    }
                )
        return matches
