"""
Research foundation — shared vocabulary and helpers.

Everything the EvidenceLedger and FactStore services agree on lives here:
source types and their honesty rules, verification states, canonical JSON,
source identity for corroboration, ID generation and the org-scoped
not-found semantics.

This module has NO service-layer imports on purpose: facts.py and
evidence.py both build on it, and evidence.py additionally imports
recompute_fact from facts.py — keeping the dependency graph acyclic
(common ← facts ← evidence).
"""

from __future__ import annotations

import json
import uuid
from typing import Any

# ──────────────────────────────────────────────────────────────
# Source types & verification states
# ──────────────────────────────────────────────────────────────

#: Every admitted source_type. Fetched rows (website/search/api) must cite
#: an http(s) URL; human rows must name the actor; llm_inference rows are
#: model output — recorded as evidence but NEVER independent (an AI guess
#: cannot corroborate anything, standing security decision §4.4).
SOURCE_TYPES: tuple[str, ...] = (
    "website",
    "search",
    "api",
    "human",
    "llm_inference",
)

#: Source types that require an http(s) source_url (validate_source +
#: ck_research_evidence_url_honesty).
URL_SOURCE_TYPES: tuple[str, ...] = ("website", "search", "api")

#: Source types that can serve as one of the ≥2 INDEPENDENT sources
#: required for corroboration. llm_inference is excluded by rule; human is
#: excluded because a human attestation locks the fact immediately
#: (§13.5) — it never needs to merely corroborate.
INDEPENDENT_SOURCE_TYPES: tuple[str, ...] = ("website", "search", "api")

#: Sanctioned evidence-row verification states:
#:   observed     — initial state, single live observation
#:   corroborated — ≥2 independent sources agree on this value
#:   disputed     — retained party of a value conflict (or superseded human
#:                  attestation); NOT deleted, NOT silently resolved
#:   outdated     — explicitly marked stale; inert in recompute
EVIDENCE_STATUSES: tuple[str, ...] = ("observed", "corroborated", "disputed", "outdated")

#: Sanctioned fact states. status='human_verified' IS the lock: AI-driven
#: recompute can never touch such a fact (§4.3 human-correction protection).
FACT_STATUSES: tuple[str, ...] = ("observed", "corroborated", "human_verified")


class ResearchNotFoundError(Exception):
    """Raised when an evidence row or fact does not exist FOR THIS ORG.

    Deliberately identical for "missing" and "belongs to another tenant"
    (no existence oracle) — the same semantics as NotFoundError in
    state/repositories.py and _require_same_org in state_manager.py.
    """


# ──────────────────────────────────────────────────────────────
# Canonical JSON
# ──────────────────────────────────────────────────────────────


def canonical_json(value: Any) -> str:
    """Canonical storage/comparison form for evidence and fact values.

    Sorted keys + compact separators, so {"b": 2, "a": 1} and
    {"a": 1, "b": 2} are the SAME value (one canonical string), while
    25000 (int) and "25000" (str) remain DIFFERENT values — type-honest.
    Same convention as durable_queue._dump_json.
    """
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


# ──────────────────────────────────────────────────────────────
# Source honesty & identity
# ──────────────────────────────────────────────────────────────


def validate_source(source_type: str, source_url: str | None, source_actor: str | None) -> None:
    """Service-layer gate for source attribution honesty.

    Mirrors the DB CHECKs (ck_research_evidence_url_honesty /
    ck_research_evidence_actor_honesty — see models/research.py): rejects
    violations with a clear ValueError BEFORE any write instead of an
    opaque IntegrityError at flush time.
    """
    if source_type not in SOURCE_TYPES:
        raise ValueError(f"source_type must be one of {SOURCE_TYPES}, got {source_type!r}")
    if source_type in URL_SOURCE_TYPES and (
        not source_url
        or not (source_url.startswith("http://") or source_url.startswith("https://"))
    ):
        raise ValueError(f"{source_type} evidence requires an http(s) source_url")
    if source_type == "human" and (not source_actor or not source_actor.strip()):
        raise ValueError("human evidence requires the actor's name (source_actor)")


def source_identity(source_type: str, source_url: str | None) -> str:
    """Identity used to decide whether two rows come from INDEPENDENT
    sources. The cited URL IS the source document: the same URL observed
    twice (even via different source_types, e.g. website + search) is ONE
    source and never corroborates itself.
    """
    return source_url or ""


# ──────────────────────────────────────────────────────────────
# IDs
# ──────────────────────────────────────────────────────────────


def new_evidence_id() -> str:
    return f"rev-{uuid.uuid4().hex}"


def new_fact_id() -> str:
    return f"rfact-{uuid.uuid4().hex}"
