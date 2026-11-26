"""
Outreach draft tool (TryComp Phase 6 §12.1 — the research-tool surface
of research/outreach.py).

draft_outreach — compose ONE research-informed outreach draft into the
EXISTING human approval queue (pending_agent_actions, the supervisor's
send_email payload contract). NEVER sends: the §4.5 dual gate (evidence
gate + human approval) stays downstream and unchanged.

Org-scoped via ToolContext; engine required (the queue, the lead, the
evidence and the lots all live in the DB). The tool-call row on the
session is the audit trail; the queue row is the human workflow.

Composable in research sessions: a session may draft outreach as its
final commercial step after qualifying/matching — the created_by
attribution is research:<session_id>.
"""

from __future__ import annotations

from coffee_export.research.outreach import OutreachService
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolContext,
    ToolInputError,
    ToolResult,
)


class DraftOutreachTool(ResearchTool):
    """Queue one evidence-based outreach draft for HUMAN approval."""

    name = "draft_outreach"
    description = (
        "Compose a research-informed outreach email draft (Phase 5 "
        "qualification scorecard + inventory matches + §12.3 contact-gated "
        "email) and queue it in the human approval queue "
        "(pending_agent_actions). NEVER sends — a human must approve first. "
        "Only ENRICHED leads with a verified, evidence-backed contact email "
        "can be drafted; a lead with a pending/approved/executed action is "
        "an honest duplicate skip."
    )
    input_schema = {
        "lead_id": {"type": "str", "required": True},
        "created_by": {"type": "str", "required": False},
    }
    output_schema = {
        "drafted": {"type": "bool", "required": True},
        "lead_id": {"type": "str", "required": True},
        "reason": {"type": "str", "required": False},
        "action_id": {"type": "any", "required": False},
        "email_to": {"type": "str", "required": False},
        "contact_reason": {"type": "str", "required": False},
        "score": {"type": "any", "required": False},
        "max_score": {"type": "any", "required": False},
        "matched_lot_ids": {"type": "list", "required": False},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        engine = ctx.require_engine()
        lead_id = tool_input["lead_id"]
        created_by = tool_input.get("created_by") or (
            f"research:{ctx.session_id}" if ctx.session_id else "research:in-process"
        )
        service = OutreachService(ctx.organization_id, engine)
        try:
            result = service.draft_outreach(
                lead_id,
                created_by=created_by,
            )
        except ValueError as exc:
            raise ToolInputError(f"draft_outreach: {exc}") from exc
        output = {
            "drafted": result["drafted"],
            "lead_id": result["lead_id"],
        }
        for key in (
            "reason",
            "action_id",
            "email_to",
            "score",
            "max_score",
            "matched_lot_ids",
        ):
            if key in result:
                output[key] = result[key]
        contact_check = result.get("contact_check")
        if isinstance(contact_check, dict) and "reason" in contact_check:
            output["contact_reason"] = contact_check["reason"]
        return ToolResult.ok(output)
