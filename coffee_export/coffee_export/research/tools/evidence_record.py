"""
Evidence recording tool (TryComp Phase 2 §12.3; Phase 4 §12.4 adds the
revalidation followup wiring).

The bridge from research tools to the Phase 1 Evidence Ledger: records
one observation with honest source attribution, exactly through the
EvidenceLedger service (never a direct row write) — so every Phase 1
guarantee applies unchanged: append-only rows, DB-enforced source
honesty, conflict retention, human-verified locking, org scoping.

The tool CANNOT bypass the honesty rules: source_type and attribution
are validated by research.common.validate_source (service layer) AND
the DB CHECKs (ck_research_evidence_url_honesty / actor_honesty). An
llm_inference source is admissible as evidence but never corroborates
anything — the ledger enforces that, not this tool.

Phase 4 §12.4: when the observation carries an expires_ts, a
revalidation followup is scheduled at the expiry time (subject-scoped,
org-scoped) so the Phase 3 dispatcher enqueues a
research.revalidate_evidence sweep when the evidence goes stale —
automating the §11.5 wiring. The followup_id is returned honestly in
the output (absent when no expiry was given). A scheduling failure is
logged and DOES NOT fail the tool: the evidence row itself was recorded
honestly, and the sweep is also reachable manually/periodically.
"""

from __future__ import annotations

from coffee_export.research.common import validate_source
from coffee_export.research.evidence import EvidenceLedger
from coffee_export.research.facts import FactStore
from coffee_export.research.followups import ResearchFollowups
from coffee_export.research.tools.base import (
    ResearchTool,
    ToolContext,
    ToolInputError,
    ToolResult,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


class RecordEvidenceTool(ResearchTool):
    """Record one observation into the Evidence Ledger."""

    name = "record_evidence"
    description = (
        "Append one observation to the org-scoped Evidence Ledger with honest "
        "source attribution (http(s) URL for website/search/api, actor name "
        "for human); returns the evidence id, the resulting fact state and — "
        "when expires_ts is given — the scheduled revalidation followup id."
    )
    input_schema = {
        "subject_type": {"type": "str", "required": True},
        "subject_id": {"type": "str", "required": True},
        "fact_key": {"type": "str", "required": True},
        "value": {"type": "any", "required": True},
        "source_type": {"type": "str", "required": True},
        "source_url": {"type": "str", "required": False},
        "source_actor": {"type": "str", "required": False},
        "expires_ts": {"type": "str", "required": False},
    }
    output_schema = {
        "evidence_id": {"type": "str", "required": True},
        "fact_status": {"type": "any", "required": True},
        "fact_value": {"type": "any", "required": True},
        "fact_source_count": {"type": "any", "required": True},
        "followup_id": {"type": "str", "required": False},
    }

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:
        engine = ctx.require_engine()
        subject_type = tool_input["subject_type"]
        subject_id = tool_input["subject_id"]
        fact_key = tool_input["fact_key"]
        value = tool_input["value"]
        source_type = tool_input["source_type"]
        source_url = tool_input.get("source_url")
        source_actor = tool_input.get("source_actor")
        expires_ts = tool_input.get("expires_ts")

        # Service-layer honesty gate FIRST (clear error before any write).
        try:
            validate_source(source_type, source_url, source_actor)
        except ValueError as exc:
            raise ToolInputError(f"record_evidence: {exc}") from exc

        ledger = EvidenceLedger(ctx.organization_id, engine)
        facts = FactStore(ctx.organization_id, engine)
        row = ledger.record(
            subject_type,
            subject_id,
            fact_key,
            value,
            source_type,
            source_url=source_url,
            source_actor=source_actor,
            expires_ts=expires_ts,
        )

        # Phase 4 §12.4 — schedule the revalidation followup at the expiry
        # time (subject-scoped: the sweep re-checks exactly this subject).
        followup_id = None
        if expires_ts:
            try:
                followups = ResearchFollowups(ctx.organization_id, engine)
                fu = followups.schedule(
                    "revalidate_evidence",
                    due_ts=expires_ts,
                    payload={"subject_type": subject_type, "subject_id": subject_id},
                    subject_type=subject_type,
                    subject_id=subject_id,
                    created_by=(
                        f"research:{ctx.session_id}" if ctx.session_id else "research:in-process"
                    ),
                )
                followup_id = fu.followup_id
            except Exception as exc:  # noqa: BLE001 — evidence stays recorded
                log.warning(
                    "revalidation followup could not be scheduled for evidence " "%s (org %s): %s",
                    row.evidence_id,
                    ctx.organization_id,
                    exc,
                )

        fact = facts.get_fact(subject_type, subject_id, fact_key)
        output = {
            "evidence_id": row.evidence_id,
            "fact_status": fact.status if fact else None,
            "fact_value": fact.value if fact else None,
            "fact_source_count": fact.source_count if fact else None,
        }
        if followup_id is not None:
            output["followup_id"] = followup_id
        return ToolResult.ok(output)
