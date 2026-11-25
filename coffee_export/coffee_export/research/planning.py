"""
Research session planning (TryComp Phase 2, §3 A).

A session's plan is DATA — a canonical-JSON list of steps stored on
research_sessions.plan — never executable code and never followed
blindly: the durable execution path (Phase 3) reads the plan and drives
tools through the budget-enforced engine.

Phase 2 ships the DETERMINISTIC fallback planner: a fixed, honest
template derived from the objective (resolve who we are researching →
collect evidence → record evidence → dedupe → summarize). LLM-assisted
planning through the existing AIGateway is the §3 A upgrade path: when a
provider is configured, Phase 3 may generate richer plans, but they land
through exactly the same stored-JSON contract, with this fallback when
the gateway is unavailable (§3 A: "LLM-assisted planning through existing
AIGateway with deterministic fallback"). No plan step ever bypasses the
budget gate or the tool registry.
"""

from __future__ import annotations

from coffee_export.research.common import canonical_json

#: The deterministic plan phases, in execution order.
PLAN_PHASES: tuple[str, ...] = (
    "resolve_identity",
    "collect_evidence",
    "record_evidence",
    "dedupe_check",
    "summarize",
)


def plan_objective(objective: str) -> list[dict]:
    """Deterministic fallback plan for one research objective.

    The objective is embedded in each description so the stored plan is
    self-describing; steps map onto the Phase 2 tool registry names
    (resolve_identity, web_fetch, record_evidence, detect_duplicates).
    """
    return [
        {
            "step": 1,
            "phase": "resolve_identity",
            "tool": "resolve_identity",
            "description": (
                "Resolve the identity of the subject of the research "
                f"objective: {objective!r} — normalize names/domains, find "
                "existing org-scoped matches."
            ),
        },
        {
            "step": 2,
            "phase": "collect_evidence",
            "tool": "web_fetch",
            "description": (
                "Collect source evidence for the objective "
                f"{objective!r} via bounded, robots-aware fetches of "
                "http(s) sources (search providers only when configured — "
                "capability_unavailable is an honest result)."
            ),
        },
        {
            "step": 3,
            "phase": "record_evidence",
            "tool": "record_evidence",
            "description": (
                "Record collected observations into the Evidence Ledger "
                "with honest source attribution (url/actor)."
            ),
        },
        {
            "step": 4,
            "phase": "dedupe_check",
            "tool": "detect_duplicates",
            "description": (
                "Check for duplicate subjects before anything downstream "
                "(org-scoped, deterministic matching)."
            ),
        },
        {
            "step": 5,
            "phase": "summarize",
            "tool": None,
            "description": (
                "Summarize the session outcome as a structured result "
                "referencing recorded evidence — no assertion without a "
                "source."
            ),
        },
    ]


def plan_to_json(steps: list[dict]) -> str:
    """Canonical storage form for research_sessions.plan."""
    return canonical_json(steps)
