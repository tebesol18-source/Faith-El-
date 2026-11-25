"""
Contact-channel verification gate (TryComp Phase 4, §12.3).

THE rule: no invented emails (or phones). A contact channel claim can
be used by outreach ONLY when it is backed by Evidence-Ledger rows
(Phase 1) whose source is NOT llm_inference — AI inference is never
converted into verification (§4.4), and the outreach dual gate (§4.5:
evidence gate + human approval queue) stays downstream and unchanged.

Semantics (test-pinned):

  * Admissible rows: non-suppressed, non-outdated, non-disputed
    evidence with fact_key contact_email / contact_phone whose value
    matches the claim (emails compare lowercase; phones compare
    digits-only — formatting never decides a gate).
  * source_type 'llm_inference' NEVER admits a channel — a channel
    supported only by AI rows is refused with
    'ai_inference_is_not_verification' (honest: the model may propose,
    the ledger must corroborate).
  * A channel with ZERO matching rows is refused with 'no_evidence'.
  * Usable ≠ verified: single observed evidence makes a channel usable
    through THIS gate (the human approval queue is still required
    before any send — §4.5). The check's reason states the honest
    evidence level: human_verified / corroborated / observed_evidence.
  * Org-scoped like every research service: another tenant's evidence
    is invisible (indistinguishable from no evidence — no existence
    oracle).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.engine import Engine

from coffee_export.research.evidence import EvidenceLedger
from coffee_export.research.facts import FactStore
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

#: Evidence fact keys carrying contact channels (the Phase 1 contract
#: for a contact claim — everything else is not a channel claim).
CONTACT_EMAIL_FACT_KEY = "contact_email"
CONTACT_PHONE_FACT_KEY = "contact_phone"

#: channel_kind → fact_key.
CHANNEL_KINDS: dict[str, str] = {
    "email": CONTACT_EMAIL_FACT_KEY,
    "phone": CONTACT_PHONE_FACT_KEY,
}

#: Evidence row statuses that can support a usable channel.
ADMISSIBLE_EVIDENCE_STATUSES: frozenset[str] = frozenset(
    {"observed", "corroborated", "human_verified"}
)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_PHONE_DIGITS_RE = re.compile(r"\D")


def normalize_email(value: str) -> str:
    """Emails compare case-insensitively, whitespace-stripped."""
    return value.strip().lower()


def normalize_phone(value: str) -> str:
    """Phones compare by digits only (+, spaces, dashes, dots, parens
    are formatting, not identity)."""
    return _PHONE_DIGITS_RE.sub("", value)


def _looks_like_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(value.strip()))


@dataclass(frozen=True)
class ContactChannelCheck:
    """The honest outcome of one contact-channel gate check."""

    channel_kind: str
    channel_value: str
    subject_type: str
    subject_id: str
    usable: bool
    reason: str
    evidence_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Structured form for tool outputs and audit rows (no secrets —
        a contact channel is business data, not a credential)."""
        return {
            "channel_kind": self.channel_kind,
            "channel_value": self.channel_value,
            "subject_type": self.subject_type,
            "subject_id": self.subject_id,
            "usable": self.usable,
            "reason": self.reason,
            "evidence_ids": list(self.evidence_ids),
        }


class ContactVerificationService:
    """Org-scoped §12.3 gate over the Phase 1 Evidence Ledger."""

    def __init__(self, organization_id: str, engine: Engine) -> None:
        if not organization_id or not organization_id.strip():
            raise ValueError("organization_id is required (no silent fallback)")
        self.organization_id = organization_id
        self._ledger = EvidenceLedger(organization_id, engine)
        self._facts = FactStore(organization_id, engine)

    def check_channel(
        self,
        subject_type: str,
        subject_id: str,
        channel_kind: str,
        channel_value: str,
    ) -> ContactChannelCheck:
        """Is this contact-channel claim backed by usable evidence?

        Raises ValueError on structurally invalid input (unknown
        channel kind, empty value, malformed email) — a programming
        error, not a gate outcome.
        """
        if channel_kind not in CHANNEL_KINDS:
            raise ValueError(f"channel_kind must be one of {sorted(CHANNEL_KINDS)}")
        if not channel_value or not str(channel_value).strip():
            raise ValueError("channel_value is required (non-empty)")
        channel_value = str(channel_value).strip()
        if channel_kind == "email":
            if not _looks_like_email(channel_value):
                raise ValueError("channel_value is not a well-formed email address")
            wanted = normalize_email(channel_value)
        else:
            wanted = normalize_phone(channel_value)
            if not wanted:
                raise ValueError("channel_value contains no digits for a phone number")

        fact_key = CHANNEL_KINDS[channel_kind]
        rows = self._ledger.list_evidence(
            subject_type, subject_id, fact_key, include_suppressed=False
        )
        matching: list[Any] = []
        for row in rows:
            try:
                stored = json.loads(row.value)
            except (json.JSONDecodeError, TypeError):
                continue  # not a JSON string value — cannot match a channel
            if not isinstance(stored, str):
                continue
            if channel_kind == "email":
                if normalize_email(stored) == wanted:
                    matching.append(row)
            elif normalize_phone(stored) == wanted:
                matching.append(row)

        admissible = [
            row
            for row in matching
            if row.status in ADMISSIBLE_EVIDENCE_STATUSES and row.source_type != "llm_inference"
        ]
        ai_only = [row for row in matching if row.source_type == "llm_inference"]

        if admissible:
            fact = self._facts.get_fact(subject_type, subject_id, fact_key)
            level = fact.status if fact else "observed_evidence"
            reason = {
                "human_verified": "human_verified",
                "corroborated": "corroborated",
            }.get(level, "observed_evidence")
            return ContactChannelCheck(
                channel_kind=channel_kind,
                channel_value=channel_value,
                subject_type=subject_type,
                subject_id=subject_id,
                usable=True,
                reason=reason,
                evidence_ids=[row.evidence_id for row in admissible],
            )
        if matching:
            # rows exist but none admissible: AI-only and/or disputed
            reason = "ai_inference_is_not_verification" if ai_only else "evidence_disputed"
            return ContactChannelCheck(
                channel_kind=channel_kind,
                channel_value=channel_value,
                subject_type=subject_type,
                subject_id=subject_id,
                usable=False,
                reason=reason,
                evidence_ids=[],
            )
        return ContactChannelCheck(
            channel_kind=channel_kind,
            channel_value=channel_value,
            subject_type=subject_type,
            subject_id=subject_id,
            usable=False,
            reason="no_evidence",
            evidence_ids=[],
        )
