"""
Research session planning (TryComp Phase 2 §3 A; LLM-assisted upgrade Phase 4 §12.1).

A session's plan is DATA — a canonical-JSON list of steps stored on
research_sessions.plan — never executable code and never followed
blindly: the durable execution path (tasks/research_tasks.py) reads the
plan and drives tools through the budget-enforced engine.

Two planners ship:

  * plan_objective(objective) — the DETERMINISTIC fallback: a fixed,
    honest template (resolve who we are researching → collect evidence
    → record evidence → dedupe → summarize). Its steps deliberately
    carry NO tool inputs: the template cannot invent research targets.
  * plan_objective_ai(objective, gateway) — LLM-ASSISTED planning
    through the existing AIGateway (Phase 4 §12.1): when a chat
    provider answers, the model proposes steps WITH tool inputs; the
    answer is validated STRICTLY (JSON list only, known tools only,
    every input checked against the tool's declared schema, bounded
    step count and description length) and ANY violation falls back to
    the deterministic template — an honest (fallback, parse_error)
    outcome, never a partially-trusted plan.

The model call itself is accounted by the CALLER through
engine.record_model_call (budget accounting — never a side channel);
the gateway additionally logs it to ai_call_logs as it does for every
agent call. A planner that cannot reach a provider (no keys) reports
the fallback source honestly — same contract as the provider manifest
(§10): never pretend a capability exists.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from coffee_export.research.common import canonical_json

#: The deterministic plan phases, in execution order.
PLAN_PHASES: tuple[str, ...] = (
    "resolve_identity",
    "collect_evidence",
    "record_evidence",
    "dedupe_check",
    "summarize",
)

#: Tool names an LLM-planned step may reference (the Phase 2 registry
#: tool set — validated again at parse time, so a hallucinated tool
#: name can never enter a stored plan).
PLAN_ALLOWED_TOOLS: tuple[str, ...] = (
    "web_fetch",
    "resolve_identity",
    "detect_duplicates",
    "record_evidence",
    "web_search",
)

#: phase derivation for LLM-planned steps (tool → plan phase).
_TOOL_PHASE: dict[str | None, str] = {
    "web_fetch": "collect_evidence",
    "web_search": "collect_evidence",
    "resolve_identity": "resolve_identity",
    "detect_duplicates": "dedupe_check",
    "record_evidence": "record_evidence",
    None: "summarize",
}

#: Hard bounds on an LLM-proposed plan (bounded work per session).
MAX_PLAN_STEPS: int = 12
MAX_DESCRIPTION_CHARS: int = 300

PLANNER_AGENT_ID = "research-planner"

_PLANNER_SYSTEM_PROMPT = (
    "You are a research planner for an Ethiopian coffee export brokerage. "
    "Given a research objective, produce a short execution plan as STRICT JSON: "
    'a list of step objects, each {"tool": <name or null>, "input": <object or '
    'omitted>, "description": <short string>}. Allowed tools and their input '
    "schemas follow. Use ONLY those tools; a final step with tool null summarizes. "
    "Output ONLY the JSON list — no prose, no code fences."
)


@dataclass(frozen=True)
class PlanOutcome:
    """The honest outcome of one planning attempt.

    source: 'llm' when a provider's answer passed strict validation,
    'fallback' when the deterministic template was used (no gateway,
    provider failure, or ANY validation violation — parse_error then
    carries the honest reason). cost_usd is the REPORTED cost of the
    model call (None when the provider reported none) — only set for
    source='llm'.
    """

    steps: list[dict]
    source: str
    provider: str | None = None
    model: str | None = None
    cost_usd: float | None = None
    parse_error: str | None = None

    def to_audit_dict(self) -> dict:
        """Serializable audit summary (stored in results/logs, never secrets)."""
        return {
            "source": self.source,
            "provider": self.provider,
            "model": self.model,
            "cost_usd": self.cost_usd,
            "parse_error": self.parse_error,
            "steps": len(self.steps),
        }


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


# ──────────────────────────────────────────────────────────────
# LLM-assisted planning (Phase 4 §12.1)
# ──────────────────────────────────────────────────────────────


def _tool_input_schemas() -> dict[str, dict]:
    """The declared input schemas of the allowed tools (lazy import —
    planning.py sits at the bottom of the research import graph)."""
    from coffee_export.research.tools.registry import default_registry

    registry = default_registry()
    return {
        tool.name: tool.input_schema for tool in (registry.get(name) for name in PLAN_ALLOWED_TOOLS)
    }


def _planner_prompt(objective: str) -> str:
    schemas = _tool_input_schemas()
    tool_docs = json.dumps(
        {name: schema for name, schema in schemas.items()},
        ensure_ascii=False,
        sort_keys=True,
    )
    return (
        f"Research objective: {objective!r}\n\n"
        f"Allowed tools (input schemas): {tool_docs}\n\n"
        f"Produce the plan as a JSON list of at most {MAX_PLAN_STEPS} steps. "
        "Steps run in order; each input must satisfy its tool's schema exactly. "
        "End with one step whose tool is null (summarize)."
    )


def _extract_json_list(text: str) -> list:
    """Pull the JSON list out of a model answer (tolerates code fences)."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # strip a single opening fence (``` or ```json) and its closer
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else ""
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
        cleaned = cleaned.strip()
    start, end = cleaned.find("["), cleaned.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("answer contains no JSON list")
    parsed = json.loads(cleaned[start : end + 1])
    if not isinstance(parsed, list):
        raise ValueError("parsed JSON is not a list")
    return parsed


def _normalize_llm_steps(raw: Any) -> list[dict]:
    """Validate and normalize a proposed plan STRICTLY.

    Raises ValueError with the honest reason on any violation — the
    caller falls back to the deterministic template; a partially-trusted
    plan must never be stored.
    """
    if not isinstance(raw, list) or not raw:
        raise ValueError("plan must be a non-empty JSON list")
    if len(raw) > MAX_PLAN_STEPS:
        raise ValueError(f"plan exceeds the {MAX_PLAN_STEPS}-step bound")
    schemas = _tool_input_schemas()
    from coffee_export.research.tools.base import ToolInputError, validate_input

    steps: list[dict] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"step {i + 1} is not an object")
        tool = item.get("tool", None)
        if tool is None:
            steps.append(
                {
                    "step": i + 1,
                    "phase": "summarize",
                    "tool": None,
                    "description": _bounded_description(item.get("description"), i + 1),
                }
            )
            continue
        if not isinstance(tool, str) or tool not in PLAN_ALLOWED_TOOLS:
            raise ValueError(f"step {i + 1} references unknown/disallowed tool {tool!r}")
        tool_input = item.get("input")
        if tool_input is not None:
            if not isinstance(tool_input, dict):
                raise ValueError(f"step {i + 1} input is not an object")
            try:
                validate_input(schemas[tool], tool_input, tool_name=tool)
            except ToolInputError as exc:
                raise ValueError(f"step {i + 1} input rejected: {exc}") from exc
        steps.append(
            {
                "step": i + 1,
                "phase": _TOOL_PHASE.get(tool, "collect_evidence"),
                "tool": tool,
                **({"input": tool_input} if isinstance(tool_input, dict) and tool_input else {}),
                "description": _bounded_description(item.get("description"), i + 1),
            }
        )
    if not any(s["tool"] is None for s in steps):
        # not fatal — the durable executor completes the session anyway;
        # but a missing summarize step is normalized in by the planner.
        steps.append(
            {
                "step": len(steps) + 1,
                "phase": "summarize",
                "tool": None,
                "description": "Summarize the session outcome referencing recorded evidence.",
            }
        )
    return steps


def _bounded_description(description: Any, step_no: int) -> str:
    if not isinstance(description, str) or not description.strip():
        return f"Step {step_no} of the research plan."
    return description.strip()[:MAX_DESCRIPTION_CHARS]


def plan_objective_ai(objective: str, gateway: Any) -> PlanOutcome:
    """LLM-assisted planning with STRICT validation and honest fallback.

    gateway: the existing AIGateway (or any object with the same
    .chat(prompt, ...) -> AIResponse contract). None → deterministic
    fallback immediately. Any failure (exception, unsuccessful response,
    non-JSON text, unknown tool, schema-violating input, bound breach)
    returns the deterministic template with the honest parse_error —
    never a partially-trusted plan.
    """
    fallback_steps = plan_objective(objective)
    if gateway is None:
        return PlanOutcome(steps=fallback_steps, source="fallback")
    try:
        response = gateway.chat(
            _planner_prompt(objective),
            agent_id=PLANNER_AGENT_ID,
            task_type="standard",
            system_prompt=_PLANNER_SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=1500,
        )
    except Exception as exc:  # noqa: BLE001 — honest fallback, never fatal
        return PlanOutcome(
            steps=fallback_steps,
            source="fallback",
            parse_error=f"gateway error: {type(exc).__name__}: {exc}",
        )
    if not getattr(response, "success", False):
        return PlanOutcome(
            steps=fallback_steps,
            source="fallback",
            provider=getattr(response, "provider", None),
            parse_error=f"provider failed: {getattr(response, 'error', '')}"[:300],
        )
    try:
        steps = _normalize_llm_steps(_extract_json_list(response.text))
    except (ValueError, json.JSONDecodeError) as exc:
        return PlanOutcome(
            steps=fallback_steps,
            source="fallback",
            provider=response.provider,
            model=response.model,
            parse_error=f"invalid plan: {exc}",
        )
    return PlanOutcome(
        steps=steps,
        source="llm",
        provider=response.provider,
        model=response.model,
        cost_usd=(response.cost_usd if getattr(response, "cost_usd", None) else None),
    )
