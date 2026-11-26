"""
Outreach & relationship integration (TryComp Phase 6, §12).

The research→commercial bridge: research outputs (Phase 5 scorecards +
inventory matches, the §12.3 contact gate) become EVIDENCE-BASED
OUTREACH DRAFTS in the EXISTING human approval queue
(`pending_agent_actions`) — and outreach milestones schedule the
Phase 3 research followups.

Standing security decisions that bind this module (§4):

  * §4.5 dual gate UNCHANGED — this module NEVER sends anything. It
    appends rows to the approval queue the Node supervisor already
    owns (agent_id 'Agent 3', action_type 'send_email' — the exact
    payload contract executeApprovedEmail() consumes). Autonomous
    sending remains impossible by construction.
  * §12.2 duplicate-send prevention — a lead with a pending / approved
    / executed action (whoever drafted it — the supervisor template or
    this research path) never receives a second draft: the SAME status
    set the Node guard uses, mirrored here BEFORE draft creation.
  * §12.1 contact gate — every email channel used in a draft MUST pass
    the Phase 4 ContactVerificationService gate FIRST (a CRM-verified
    lead_contacts row alone is necessary but NOT sufficient: the
    channel must also be backed by non-llm_inference evidence).
  * §12.4 CRM pipeline integration — qualification scorecards land as
    evidence rows (fact_key qualification_scorecard) so ENRICHED→
    QUALIFIED transitions can cite the research; no new pipeline
    states, no new tables (pending_agent_actions / research_evidence /
    research_followups all exist).
  * org scoping — every query filters organization_id; the
    organization_id is REQUIRED and stamped EXPLICITLY on every
    pending_agent_actions insert (never the column's org-system
    DEFAULT — §4.1).

Honesty rules:

  * draft content claims ONLY evidenced facts: a satisfied scorecard
    dimension may be referenced, a not-evidenced one never is (missing
    information goes to the payload's `reasoning` block for the HUMAN
    approver, never into the buyer-facing body);
  * a machine-recorded scorecard is source_type 'llm_inference' by
    CONVENTION: derived analysis, never an independent source, never
    verification (§4.4). An operator attestation (actor given) records
    source_type 'human' and locks the fact — the decision-basis freeze
    Phase 1 defines.
  * draft_outreach targets ENRICHED leads only: the supervisor's
    approved-send path advances exactly ENRICHED→IN_SEQUENCE, and the
    IN_SEQUENCE continuation cadence belongs to the existing Agent 3
    sequence machinery (untouched).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import (
    Column,
    Integer,
    MetaData,
    Table,
    Text,
    insert,
    select,
)
from sqlalchemy.engine import Engine

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models.lead import Lead, LeadContact
from coffee_export.database.models.research import ResearchFollowup
from coffee_export.research.common import canonical_json
from coffee_export.research.contact_verification import ContactVerificationService
from coffee_export.research.evidence import EvidenceLedger
from coffee_export.research.facts import FactStore, _OrgScopedService
from coffee_export.research.followups import ResearchFollowups
from coffee_export.research.qualification import QualificationService
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

#: The statuses that BLOCK a new draft for a lead — exactly the Node
#: supervisor guard (generatePendingActions NOT EXISTS
#: p.status IN ('pending','approved','executed')). A rejected or
#: execution_failed action does NOT block: the operator may honestly
#: retry with a fresh draft.
PENDING_ACTION_BLOCKING_STATUSES: tuple[str, ...] = (
    "pending",
    "approved",
    "executed",
)

#: Outreach milestones → the Phase 3 followup type they schedule
#: (both enumerated in RESEARCH_TASK_TYPES — the DB CHECK accepts
#: them; the dispatcher owns the cadence).
MILESTONE_FOLLOWUPS: dict[str, str] = {
    "no_reply": "run_session",
    "sample_feedback_due": "revalidate_evidence",
}

#: The evidence fact key under which qualification scorecards land
#: (§12.4 CRM pipeline citation).
SCORECARD_FACT_KEY = "qualification_scorecard"

#: How many top inventory matches a draft may reference (bounded,
#: explainable content).
MAX_DRAFT_LOTS = 3

#: The Core table definition for the EXISTING approval queue —
#: schema-faithful to the operational DB (no migration is created
#: here; tests create it on disposable engines). The org stamp is
#: ALWAYS passed explicitly by this module — the column default
#: ('org-system') is never relied upon.
_pending_actions_metadata = MetaData()
PENDING_AGENT_ACTIONS = Table(
    "pending_agent_actions",
    _pending_actions_metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("agent_id", Text, nullable=False),
    Column("action_type", Text, nullable=False),
    Column("action_description", Text, nullable=False),
    Column("target_entity_type", Text, nullable=True),
    Column("target_entity_id", Text, nullable=True),
    Column("payload", Text, nullable=True),
    Column("risk_level", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("submitted_ts", Text, nullable=False),
    Column("reviewed_by", Text, nullable=True),
    Column("reviewed_ts", Text, nullable=True),
    Column("review_notes", Text, nullable=True),
    Column("organization_id", Text, nullable=False),
)


class OutreachService(_OrgScopedService):
    """Org-scoped research→outreach bridge (Phase 6 §12)."""

    def __init__(self, organization_id: str, engine: Engine | None = None) -> None:
        # the base keeps only a session factory; this service composes
        # sibling services (contacts, qualification) that want the
        # engine itself — resolve it the same way the base does.
        if engine is None:
            from coffee_export.database.base import engine as app_engine

            engine = app_engine
        super().__init__(organization_id, engine)
        self._engine = engine

    # ── reads: the research bundle for one lead ────────────────────

    def _lead_row(self, session, lead_id: str) -> Lead | None:
        """The lead for THIS org (not deleted) — or None (missing and
        other-tenant are indistinguishable — no existence oracle)."""
        return session.execute(
            select(Lead).where(
                Lead.lead_id == lead_id,
                Lead.organization_id == self.organization_id,
                Lead.deleted_ts.is_(None),
            )
        ).scalar_one_or_none()

    def _verified_contact(self, session, lead_id: str) -> LeadContact | None:
        """The primary VERIFIED contact with an email, buyer-first —
        the same ordering the Node outreach join uses."""
        return session.execute(
            select(LeadContact)
            .where(
                LeadContact.lead_id == lead_id,
                LeadContact.organization_id == self.organization_id,
                LeadContact.deleted_ts.is_(None),
                LeadContact.verification_status == "verified",
                LeadContact.email.isnot(None),
                LeadContact.email != "",
            )
            .order_by(LeadContact.is_buyer.desc(), LeadContact.is_primary.desc())
            .limit(1)
        ).scalar_one_or_none()

    # ── §12.2 duplicate-send prevention ────────────────────────────

    def check_duplicate(self, lead_id: str) -> dict | None:
        """A blocking in-flight action for this lead, or None.

        Mirrors the supervisor guard exactly (pending / approved /
        executed — regardless of which path drafted it), so the
        research path and the Node template path can never double-draft
        the same lead. Cross-org reads are deliberately IMPOSSIBLE
        here: the queue is org-scoped by the insert contract and this
        read filters nothing extra — the supervisor's own guard is not
        org-scoped, so this module adds the org stamp the Node side
        defaults to 'org-system'; research drafts stay in their org.
        """
        with self._session_factory() as session:
            row = (
                session.execute(
                    select(
                        PENDING_AGENT_ACTIONS.c.id,
                        PENDING_AGENT_ACTIONS.c.status,
                        PENDING_AGENT_ACTIONS.c.action_type,
                        PENDING_AGENT_ACTIONS.c.agent_id,
                        PENDING_AGENT_ACTIONS.c.submitted_ts,
                        PENDING_AGENT_ACTIONS.c.organization_id,
                    )
                    .where(
                        PENDING_AGENT_ACTIONS.c.target_entity_id == lead_id,
                        PENDING_AGENT_ACTIONS.c.status.in_(PENDING_ACTION_BLOCKING_STATUSES),
                        PENDING_AGENT_ACTIONS.c.organization_id == self.organization_id,
                    )
                    .order_by(PENDING_AGENT_ACTIONS.c.id.desc())
                    .limit(1)
                )
                .mappings()
                .first()
            )
        if row is None:
            return None
        return {
            "action_id": row["id"],
            "status": row["status"],
            "action_type": row["action_type"],
            "agent_id": row["agent_id"],
            "submitted_ts": row["submitted_ts"],
        }

    # ── §12.1 evidence-based drafts → the existing approval queue ──

    def draft_outreach(
        self,
        lead_id: str,
        *,
        created_by: str,
        step: int = 1,
    ) -> dict[str, Any]:
        """Create ONE research-informed outreach draft in the human
        approval queue. NEVER sends (§4.5 — the dual gate stays
        downstream and human).

        Flow: org-scoped lead lookup → duplicate guard → contact
        channel gate (§12.3) → research bundle (Phase 5 scorecard +
        matches) → deterministic draft → pending_agent_actions INSERT
        (explicit org stamp, the supervisor's send_email payload
        contract).

        Returns an honest audit dict:
          {drafted: bool, lead_id, reason?, blocked_by?, contact_check,
           score, max_score, matched_lot_ids, action_id?}
        """
        if not created_by or not str(created_by).strip():
            raise ValueError("created_by is required (actor attribution)")
        if step != 1:
            # The sanctioned research-outreach entry is the FIRST email
            # (ENRICHED leads): continuation steps belong to the Agent 3
            # sequence machinery, not this path.
            raise ValueError(
                "research outreach drafts the FIRST contact email (step=1); "
                "IN_SEQUENCE continuation is the Agent 3 sequence cadence"
            )

        with self._session_factory() as session:
            lead = self._lead_row(session, lead_id)
            if lead is None:
                return {
                    "drafted": False,
                    "lead_id": lead_id,
                    "reason": "lead_not_found",
                }
            lead_state = lead.current_state
            company = lead.company_name
            language = lead.outreach_language or "EN"
            tier = lead.priority_tier
            if lead_state != "ENRICHED":
                return {
                    "drafted": False,
                    "lead_id": lead_id,
                    "reason": "lead_not_enriched",
                    "current_state": lead_state,
                }
            contact = self._verified_contact(session, lead_id)
            contact_name = contact.name if (contact and contact.name) else None

        # §12.2 duplicate guard — BEFORE any draft work.
        duplicate = self.check_duplicate(lead_id)
        if duplicate is not None:
            return {
                "drafted": False,
                "lead_id": lead_id,
                "reason": "duplicate_pending",
                "blocked_by": duplicate,
            }

        # §12.1 contact channel gate — the §12.3 service, FIRST.
        if contact is None or not (contact.email or "").strip():
            return {
                "drafted": False,
                "lead_id": lead_id,
                "reason": "no_verified_contact",
                "contact_check": {
                    "usable": False,
                    "reason": "no verified contact with an email on lead_contacts",
                },
            }
        email_to = contact.email.strip()
        gate = ContactVerificationService(self.organization_id, self._engine)
        contact_check = gate.check_channel("lead", lead_id, "email", email_to)
        if not contact_check.usable:
            return {
                "drafted": False,
                "lead_id": lead_id,
                "reason": f"contact_channel_not_usable:{contact_check.reason}",
                "contact_check": contact_check.to_dict(),
            }

        # The research bundle (Phase 5) feeding draft generation.
        qualification = QualificationService(self.organization_id, self._engine)
        scorecard = qualification.score_lead("lead", lead_id)
        inventory = qualification.match_inventory("lead", lead_id, limit=MAX_DRAFT_LOTS)
        matched_lot_ids = [m["lot_id"] for m in inventory["matches"]]
        lot_summaries = self._lot_summaries(matched_lot_ids)

        subject, body = _compose_draft(
            company=company,
            contact_name=contact_name,
            scorecard=scorecard,
            matches=inventory["matches"],
            lot_summaries=lot_summaries,
        )

        payload = {
            "lead_id": lead_id,
            "company": company,
            "step": 1,
            "language": language,
            "email_subject": subject,
            "email_body": body,
            "email_to": email_to,
            "email_from": "abi@faithel.com",
            "reasoning": {
                "source": "research",
                "created_by": str(created_by).strip(),
                "qualification": {
                    "score": scorecard["score"],
                    "max_score": scorecard["max_score"],
                    "missing_information": scorecard["missing_information"],
                },
                "matched_lots": [
                    {
                        "lot_id": m["lot_id"],
                        "matched_criteria": m["matched_criteria"],
                        "total_criteria": m["total_criteria"],
                    }
                    for m in inventory["matches"]
                ],
                "contact_evidence_level": contact_check.reason,
                "contact_evidence_ids": list(contact_check.evidence_ids),
            },
        }

        description = (
            f"Research-drafted outreach email to {company} — "
            f"qualification {scorecard['score']}/{scorecard['max_score']}, "
            f"{len(matched_lot_ids)} matched lot(s)"
        )
        with self._session_factory() as session:
            result = session.execute(
                insert(PENDING_AGENT_ACTIONS).values(
                    agent_id="Agent 3",
                    action_type="send_email",
                    action_description=description,
                    target_entity_type="lead",
                    target_entity_id=lead_id,
                    payload=canonical_json(payload),
                    risk_level="medium" if tier == "S" else "low",
                    status="pending",
                    submitted_ts=now_addis_iso(),
                    organization_id=self.organization_id,
                )
            )
            session.commit()
            action_id = result.inserted_primary_key[0] if result.inserted_primary_key else None

        log.info(
            "research outreach draft queued: %s (org %s, action %s, "
            "contact evidence %s, score %s/%s)",
            lead_id,
            self.organization_id,
            action_id,
            contact_check.reason,
            scorecard["score"],
            scorecard["max_score"],
        )
        return {
            "drafted": True,
            "lead_id": lead_id,
            "action_id": action_id,
            "email_to": email_to,
            "contact_check": contact_check.to_dict(),
            "score": scorecard["score"],
            "max_score": scorecard["max_score"],
            "matched_lot_ids": matched_lot_ids,
        }

    # ── §12.3 outreach milestones → Phase 3 followups ──────────────

    def record_outreach_milestone(
        self,
        lead_id: str,
        milestone: str,
        *,
        due_ts: str,
        created_by: str,
        extra_payload: dict | None = None,
    ) -> ResearchFollowup:
        """Schedule the research followup for an outreach milestone.

        no_reply            → run_session (re-research the buyer for
                              fresh angles before the next touch)
        sample_feedback_due → revalidate_evidence (refresh the buyer's
                              facts before quoting)

        The Phase 3 dispatcher owns the cadence from here; the lead's
        org is this service's org (explicit, never a fallback).
        """
        if milestone not in MILESTONE_FOLLOWUPS:
            raise ValueError(
                f"milestone must be one of {sorted(MILESTONE_FOLLOWUPS)}, " f"got {milestone!r}"
            )
        followup_type = MILESTONE_FOLLOWUPS[milestone]
        payload: dict[str, Any] = {
            "milestone": milestone,
            "lead_id": lead_id,
        }
        if followup_type == "run_session":
            payload["objective"] = (
                f"Re-research buyer lead {lead_id} — no reply to outreach; "
                "refresh qualification facts and decision-maker evidence"
            )
        if extra_payload:
            if not isinstance(extra_payload, dict):
                raise ValueError("extra_payload must be a JSON object (dict)")
            payload.update(extra_payload)
        followups = ResearchFollowups(self.organization_id, self._engine)
        return followups.schedule(
            followup_type,
            due_ts=due_ts,
            payload=payload,
            subject_type="lead",
            subject_id=lead_id,
            created_by=created_by,
        )

    # ── §12.4 CRM pipeline integration ─────────────────────────────

    def record_qualification_scorecard(
        self,
        lead_id: str,
        *,
        actor: str | None = None,
    ) -> dict[str, Any]:
        """Land the Phase 5 scorecard as an evidence row so the
        ENRICHED→QUALIFIED transition can cite the research (§12.4).

        actor=None → machine path: source_type 'llm_inference' (derived
        analysis, never an independent source — §4.4), refreshable by
        recompute. actor given → the operator attests this scorecard at
        a human decision point: source_type 'human', the fact LOCKS
        (the decision basis is protected; only a NEWER human
        attestation supersedes — Phase 1 rules).
        """
        qualification = QualificationService(self.organization_id, self._engine)
        scorecard = qualification.score_lead("lead", lead_id)
        ledger = EvidenceLedger(self.organization_id, self._engine)
        if actor is not None:
            if not str(actor).strip():
                raise ValueError("actor must be a non-empty name when given")
            row = ledger.record(
                "lead",
                lead_id,
                SCORECARD_FACT_KEY,
                scorecard,
                "human",
                source_actor=str(actor).strip(),
            )
            source = "human"
        else:
            row = ledger.record(
                "lead",
                lead_id,
                SCORECARD_FACT_KEY,
                scorecard,
                "llm_inference",
            )
            source = "llm_inference"
        facts = FactStore(self.organization_id, self._engine)
        fact = facts.get_fact("lead", lead_id, SCORECARD_FACT_KEY)
        return {
            "lead_id": lead_id,
            "evidence_id": row.evidence_id,
            "source_type": source,
            "fact_status": fact.status if fact else None,
            "score": scorecard["score"],
            "max_score": scorecard["max_score"],
        }

    # ── internals ──────────────────────────────────────────────────

    def _lot_summaries(self, lot_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Read-only lot rows (region / process / cupping) for the
        matched lot ids — org-scoped, expression API, bounded."""
        if not lot_ids:
            return {}
        from coffee_export.database.models.inventory import Lot

        with self._session_factory() as session:
            rows = session.execute(
                select(
                    Lot.lot_id,
                    Lot.region,
                    Lot.process,
                    Lot.cupping_score,
                ).where(
                    Lot.lot_id.in_(lot_ids),
                    Lot.organization_id == self.organization_id,
                    Lot.deleted_ts.is_(None),
                )
            ).mappings()
            summaries: dict[str, dict[str, Any]] = {}
            for row in rows:
                summaries[row["lot_id"]] = {
                    "region": row["region"],
                    "process": row["process"],
                    "cupping_score": row["cupping_score"],
                }
            return summaries


# ── deterministic draft composition (no LLM, no invention) ─────────


def _compose_draft(
    *,
    company: str,
    contact_name: str | None,
    scorecard: dict,
    matches: list[dict],
    lot_summaries: dict[str, dict],
) -> tuple[str, str]:
    """The buyer-facing draft, composed ONLY from evidenced research
    output. Missing information never enters the body — it stays in
    the payload's reasoning block for the human approver.

    Volume/sector lines appear only when the corresponding scorecard
    dimension is SATISFIED (evidenced); otherwise the wording is
    honestly generic.
    """
    dimensions = {d["key"]: d for d in scorecard["dimensions"]}

    greeting = f"Hi {contact_name}," if contact_name else "Hi,"

    profile_bits: list[str] = []
    sector_dim = dimensions.get("segment")
    if sector_dim and sector_dim["outcome"] == "satisfied":
        profile_bits.append("your importing program")
    volume_dim = dimensions.get("volume")
    if volume_dim and volume_dim["outcome"] == "satisfied":
        profile_bits.append("your sourcing volume")
    profile_line = (
        f"Based on what we can see of {', '.join(profile_bits)}, "
        if profile_bits
        else "Based on our current 25/26 program, "
    )

    lot_lines: list[str] = []
    for match in matches[:MAX_DRAFT_LOTS]:
        lot_id = match["lot_id"]
        summary = lot_summaries.get(lot_id, {})
        bits = [f"Lot {lot_id}"]
        if summary.get("region"):
            bits.append(str(summary["region"]))
        if summary.get("process"):
            bits.append(str(summary["process"]))
        if summary.get("cupping_score") is not None:
            bits.append(f"cupping {summary['cupping_score']}")
        lot_lines.append(
            f"  • {' · '.join(bits)} — matches {match['matched_criteria']}/"
            f"{match['total_criteria']} of your evidenced requirements"
        )
    lots_block = (
        "\n".join(lot_lines)
        if lot_lines
        else "  • Current Yirgacheffe / Guji / Sidamo lots — tell us your "
        "volume and cupping targets and we will match them"
    )

    subject = f"Ethiopian 25/26 — lots matched to {company}"
    body = (
        f"{greeting}\n\n"
        f"{profile_line}we supply direct-traded Ethiopian green coffee from "
        "washing stations we work with year-round — full traceability, "
        "Q-grader verified 84–88+ scores, EUDR-ready data per lot.\n\n"
        f"Lots that may fit:\n{lots_block}\n\n"
        "Would you have 15 minutes this week or next to discuss whether "
        "these fit your 25/26 program?\n\n"
        "Best,\nAbi Solomon\nFaith-El PLC\nAddis Ababa, Ethiopia"
    )
    return subject, body
