"""
Research foundation — shared vocabulary and helpers.

Everything the EvidenceLedger, FactStore, ResearchSessions and
ResearchEngine services agree on lives here: source types and their
honesty rules, verification states, session/tool-call lifecycle states,
canonical JSON, source identity for corroboration, ID generation, the
normalized objective fingerprint and the org-scoped not-found semantics.

This module has NO service-layer imports on purpose: facts.py and
evidence.py both build on it, evidence.py additionally imports
recompute_fact from facts.py, and the Phase 2 modules (budget, sessions,
engine, tools) build on it directly — keeping the dependency graph
acyclic (common ← facts ← evidence; common ← budget/sessions/tools ←
engine).
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

#: Sanctioned research-session states (Phase 2, §12.1):
#:   pending          — created, not yet started (auto-started by the first
#:                       engine.run_tool, or explicitly)
#:   running          — executing tools/model calls under its budgets
#:   completed        — finished with a structured result
#:   failed           — finished with an error
#:   cancelled        — finished by an operator decision
#:   budget_exhausted — STOPPED by budget enforcement; resumable ONLY via
#:                       the human intervention path (resume_session with
#:                       new budgets) — never silently continues
SESSION_STATUSES: tuple[str, ...] = (
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
    "budget_exhausted",
)

#: Sessions that count as LIVE for duplicate-research detection (§12.5):
#: a new session with the same objective_key reuses a live one instead of
#: duplicating work. Completed/failed/cancelled/exhausted sessions are
#: history — searchable, but they do not block new research.
LIVE_SESSION_STATUSES: tuple[str, ...] = ("pending", "running")

#: The sanctioned session transition map. Note budget_exhausted → running
#: (resume with new budgets — the human intervention path) and the absent
#: pending → completed shortcut: a result can only be recorded for a
#: session that actually ran.
SESSION_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending": frozenset({"running", "cancelled"}),
    "running": frozenset({"completed", "failed", "cancelled", "budget_exhausted"}),
    "budget_exhausted": frozenset({"running", "cancelled"}),
    "completed": frozenset(),
    "failed": frozenset(),
    "cancelled": frozenset(),
}

#: Sanctioned tool-call statuses (Phase 2, §12.1):
#:   ok                     — executed, structured output recorded
#:   error                  — operational failure (network, validation, bug)
#:   capability_unavailable — the required provider is not configured;
#:                           NEVER faked (§3 G / §10)
#:   budget_exhausted       — refused BEFORE execution; audit row, not usage
#:   blocked_policy         — refused by policy (robots.txt, allowlists)
TOOL_CALL_STATUSES: tuple[str, ...] = (
    "ok",
    "error",
    "capability_unavailable",
    "budget_exhausted",
    "blocked_policy",
)


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


def new_session_id() -> str:
    return f"rses-{uuid.uuid4().hex}"


def new_tool_call_id() -> str:
    return f"rtcl-{uuid.uuid4().hex}"


def normalize_objective(objective: str) -> str:
    """The duplicate-research fingerprint of an objective (§12.5).

    Lowercase + collapsed whitespace, so "Coffee importers in Hamburg" and
    "coffee   importers  in hamburg" are the SAME research request while
    genuinely different objectives stay distinct. Deliberately shallow:
    semantic similarity is NOT attempted (that would be an AI judgement,
    not a deterministic key).
    """
    return " ".join(objective.strip().lower().split())
