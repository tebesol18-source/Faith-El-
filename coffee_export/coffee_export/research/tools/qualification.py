"""
Buyer qualification & matching tools (TryComp Phase 5).

The research-tool surface of research/qualification.py:

  * qualify_buyer — the explainable, evidence-linked qualification
    scorecard for one buyer subject
  * match_inventory — the buyer's extracted requirements vs THIS
    org's active lots, criterion by criterion with explanations and
    missing-information detection

Both org-scoped via ToolContext, engine-required, deterministic — the
same semantics in-process and in durable research sessions.
"""

from __future__ import annotations

from coffee_export.research.qualification import QualificationService
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolContext,
    ToolInputError,
    ToolResult,
)


class QualifyBuyerTool(ResearchTool):
    """Evidence-linked qualification scorecard for one buyer."""

    name = "qualify_buyer"
    description = (
        "Compute the explainable qualification scorecard for a buyer from "
        "its persistent facts (volume, sector, usable contact channel). "
        "Every dimension traces to evidence; unknowns score zero and are "
        "listed as missing information — never guessed. The human Q1–Q5 "
        "conversation remains the commercial gate."
    )
    input_schema = {
        "subject_type": {"type": "str", "required": True},
        "subject_id": {"type": "str", "required": True},
        "min_volume_mt": {"type": "float", "required": False},
    }
    output_schema = {
        "subject_type": {"type": "str", "required": True},
        "subject_id": {"type": "str", "required": True},
        "score": {"type": "int", "required": True},
        "max_score": {"type": "int", "required": True},
        "dimensions": {"type": "list", "required": True},
        "missing_information": {"type": "list", "required": True},
        "evidence_note": {"type": "str", "required": True},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        engine = ctx.require_engine()
        service = QualificationService(ctx.organization_id, engine)
        kwargs = {}
        if tool_input.get("min_volume_mt") is not None:
            kwargs["min_volume_mt"] = tool_input["min_volume_mt"]
        try:
            scorecard = service.score_lead(
                tool_input["subject_type"], tool_input["subject_id"], **kwargs
            )
        except ValueError as exc:
            raise ToolInputError(f"qualify_buyer: {exc}") from exc
        return ToolResult.ok(scorecard)


class MatchInventoryTool(ResearchTool):
    """Buyer requirements vs this org's active lots — explainable."""

    name = "match_inventory"
    description = (
        "Match a buyer's extracted requirements (volume, certifications, "
        "cupping floor, process preference) against this org's active "
        "in-stock lots. Criterion-by-criterion pass/fail/missing_info with "
        "explanations; lots ranked by matched criteria; unknown requirements "
        "are surfaced as missing information, never counted as compatible."
    )
    input_schema = {
        "subject_type": {"type": "str", "required": True},
        "subject_id": {"type": "str", "required": True},
        "limit": {"type": "int", "required": False},
    }
    output_schema = {
        "subject_type": {"type": "str", "required": True},
        "subject_id": {"type": "str", "required": True},
        "requirements": {"type": "list", "required": True},
        "matches": {"type": "list", "required": True},
        "match_count": {"type": "int", "required": True},
        "missing_information": {"type": "list", "required": True},
        "note": {"type": "str", "required": True},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        engine = ctx.require_engine()
        service = QualificationService(ctx.organization_id, engine)
        kwargs = {}
        if tool_input.get("limit") is not None:
            kwargs["limit"] = tool_input["limit"]
        try:
            result = service.match_inventory(
                tool_input["subject_type"], tool_input["subject_id"], **kwargs
            )
        except ValueError as exc:
            raise ToolInputError(f"match_inventory: {exc}") from exc
        return ToolResult.ok(result)
