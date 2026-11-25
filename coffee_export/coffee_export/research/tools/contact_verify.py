"""
Contact-channel verification tool (TryComp Phase 4, §12.3).

The research-tool surface of research/contact_verification.py: checks
whether a contact-channel claim (email/phone) is backed by usable
Evidence-Ledger rows before anything downstream may use it. This is
the §12.3 rule as a composable, org-scoped tool — usable in-process
AND in LLM-planned sessions (a plan may verify a channel before
outreach preparation; the outreach dual gate of §4.5 stays unchanged
and downstream).

Never invents a channel: the tool only VERIFIES a claim the caller
already holds. An AI-proposed channel (recorded as llm_inference
evidence) is honestly refused — ai_inference_is_not_verification.
"""

from __future__ import annotations

from coffee_export.research.contact_verification import (
    ContactVerificationService,
)
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolContext,
    ToolInputError,
    ToolResult,
)


class VerifyContactTool(ResearchTool):
    """§12.3 gate: is this contact channel backed by real evidence?"""

    name = "verify_contact"
    description = (
        "Verify that a contact channel (email/phone) claim is backed by "
        "non-AI Evidence-Ledger rows (fact keys contact_email/contact_phone) "
        "for the subject. Usable means evidence-backed — the human approval "
        "queue is still required before any outreach (§4.5). Never invents "
        "or extracts channels; AI-only evidence is refused."
    )
    input_schema = {
        "subject_type": {"type": "str", "required": True},
        "subject_id": {"type": "str", "required": True},
        "channel_kind": {"type": "str", "required": True},
        "channel_value": {"type": "str", "required": True},
    }
    output_schema = {
        "channel_kind": {"type": "str", "required": True},
        "channel_value": {"type": "str", "required": True},
        "subject_type": {"type": "str", "required": True},
        "subject_id": {"type": "str", "required": True},
        "usable": {"type": "bool", "required": True},
        "reason": {"type": "str", "required": True},
        "evidence_ids": {"type": "list", "required": True},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        engine = ctx.require_engine()
        service = ContactVerificationService(ctx.organization_id, engine)
        try:
            check = service.check_channel(
                tool_input["subject_type"],
                tool_input["subject_id"],
                tool_input["channel_kind"],
                tool_input["channel_value"],
            )
        except ValueError as exc:
            raise ToolInputError(f"verify_contact: {exc}") from exc
        return ToolResult.ok(check.to_dict())
