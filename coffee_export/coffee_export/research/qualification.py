"""
Buyer qualification & inventory matching (TryComp Phase 5).

The Buyer-Radar research-side pre-qualification and match layer —
explainable, deterministic, evidence-linked, org-scoped:

  * requirement EXTRACTION — reads a buyer's persistent facts (Phase 1
    FactStore) into structured requirements. Every extracted
    requirement carries its fact status and source count; a fact that
    does not exist is MISSING INFORMATION, never guessed.
  * qualification SCORING — weighted dimensions over evidence-backed
    facts (volume, sector fit, usable contact channel). An honest
    scorecard: satisfied dimensions score their weight, an evidenced
    negative is recorded as unsatisfied (0 points, honestly), a
    dimension without evidence is not_evidenced (0 points AND listed
    in missing_information — an unknown never scores and never passes).
  * inventory MATCHING — org-scoped active lots vs the extracted
    requirements, criterion by criterion: volume, certifications,
    cupping floor, process preference. Every criterion is
    pass/fail/missing_info with a one-line explanation; lots are
    ranked by matched criteria; unknown requirements are surfaced as
    missing information.

No AI guessing anywhere: the scoring weights and thresholds are
explicit constants (documented, injectable); every point traces to a
fact and its evidence level. The human Q1–Q5 conversation (Agent 3)
remains the commercial qualification gate — this layer prepares it
honestly, it does not replace it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.engine import Engine

from coffee_export.database.models.inventory import Lot
from coffee_export.research.contact_verification import (
    ContactVerificationService,
)
from coffee_export.research.evidence import EvidenceLedger
from coffee_export.research.facts import FactStore
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

#: Default minimum annual volume for the volume dimension — ≈1 FCL of
#: 60 kg bags (320 bags ≈ 19.2 MT), mirroring the Q1 gate's "≥1 FCL/year
#: of Ethiopian or comparable East African origin". Injectable.
DEFAULT_MIN_VOLUME_MT: float = 19.2

#: Sector facts that satisfy the segment-fit dimension (mirrors Q2:
#: "importer, trader, or roaster").
SEGMENT_FIT_SECTORS: frozenset[str] = frozenset({"importer", "broker_trader", "roaster"})

#: Qualification dimensions and their weights (explicit, explainable).
QUALIFICATION_WEIGHTS: dict[str, int] = {
    "volume": 40,
    "segment": 30,
    "contact_channel": 30,
}

#: Fact keys the requirement extractor reads. annual_volume_mt is the
#: buyer's SCALE (qualification dimension); purchase_volume_mt is the
#: per-lot purchase size a candidate lot must cover (matching criterion)
#: — two different questions, two different facts, never conflated.
REQUIREMENT_FACT_KEYS: tuple[str, ...] = (
    "annual_volume_mt",
    "purchase_volume_mt",
    "sector",
    "certifications",
    "min_cupping_score",
    "preferred_process",
)

#: Lot-side certification splitting (lots store a comma-separated text).
_CERT_SPLIT = ","


@dataclass(frozen=True)
class Dimension:
    """One qualification dimension's honest outcome."""

    key: str
    label: str
    weight: int
    outcome: str  # satisfied | unsatisfied | not_evidenced
    explanation: str
    fact_key: str | None = None
    fact_status: str | None = None
    source_count: int | None = None

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "weight": self.weight,
            "outcome": self.outcome,
            "explanation": self.explanation,
            "fact_key": self.fact_key,
            "fact_status": self.fact_status,
            "source_count": self.source_count,
        }


@dataclass(frozen=True)
class Requirement:
    """One extracted buyer requirement (or an honest missing one)."""

    key: str
    value: object
    fact_status: str | None
    source_count: int | None
    extracted: bool

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "value": self.value if self.extracted else None,
            "fact_status": self.fact_status,
            "source_count": self.source_count,
            "extracted": self.extracted,
        }


@dataclass(frozen=True)
class MatchCriterion:
    """One lot-vs-requirement check with its explanation."""

    criterion: str
    outcome: str  # pass | fail | missing_info
    detail: str

    def to_dict(self) -> dict:
        return {
            "criterion": self.criterion,
            "outcome": self.outcome,
            "detail": self.detail,
        }


@dataclass(frozen=True)
class LotMatch:
    """One candidate lot with its explainable compatibility."""

    lot_id: str
    matched_criteria: int
    total_criteria: int
    criteria: list[MatchCriterion] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "lot_id": self.lot_id,
            "matched_criteria": self.matched_criteria,
            "total_criteria": self.total_criteria,
            "criteria": [c.to_dict() for c in self.criteria],
        }


def _fact_value(fact) -> object | None:
    """The fact's value as a plain Python object (canonical JSON
    stored → parsed); None when unparseable (honest miss)."""
    try:
        return json.loads(fact.value)
    except (json.JSONDecodeError, TypeError):
        return None


def _admissible(fact) -> bool:
    """A fact is usable when it is live (observed/corroborated/
    human_verified); disputed/outdated facts are honest misses."""
    return fact.status in ("observed", "corroborated", "human_verified")


def _live_evidence_count(
    ledger: EvidenceLedger, subject_type: str, subject_id: str, fact_key: str
) -> int:
    """How many live (non-suppressed, admissible-status) evidence rows
    back the fact key. A fact whose rows are ALL outdated/disputed is a
    stale fact — an honest miss even if its own status lingers."""
    return sum(
        1
        for row in ledger.list_evidence(
            subject_type, subject_id, fact_key, include_suppressed=False
        )
        if row.status in ("observed", "corroborated", "human_verified")
    )


class QualificationService:
    """Org-scoped, evidence-linked buyer qualification & matching."""

    def __init__(self, organization_id: str, engine: Engine) -> None:
        if not organization_id or not organization_id.strip():
            raise ValueError("organization_id is required (no silent fallback)")
        self.organization_id = organization_id
        self._engine = engine
        self._facts = FactStore(organization_id, engine)
        self._ledger = EvidenceLedger(organization_id, engine)
        self._contacts = ContactVerificationService(organization_id, engine)

    # ── requirement extraction ─────────────────────────────────────

    def extract_requirements(self, subject_type: str, subject_id: str) -> list[Requirement]:
        """Structured requirements from the buyer's persistent facts.

        Every key in REQUIREMENT_FACT_KEYS is reported: extracted (with
        its fact status and source count) or honestly missing.
        """
        requirements: list[Requirement] = []
        for key in REQUIREMENT_FACT_KEYS:
            fact = self._facts.get_fact(subject_type, subject_id, key)
            live_rows = _live_evidence_count(self._ledger, subject_type, subject_id, key)
            if fact is not None and _admissible(fact) and live_rows > 0:
                requirements.append(
                    Requirement(
                        key=key,
                        value=_fact_value(fact),
                        fact_status=fact.status,
                        source_count=fact.source_count,
                        extracted=True,
                    )
                )
            else:
                requirements.append(
                    Requirement(
                        key=key,
                        value=None,
                        fact_status=fact.status if fact is not None else None,
                        source_count=fact.source_count if fact is not None else None,
                        extracted=False,
                    )
                )
        return requirements

    # ── qualification scoring ──────────────────────────────────────

    def score_lead(
        self,
        subject_type: str,
        subject_id: str,
        *,
        min_volume_mt: float = DEFAULT_MIN_VOLUME_MT,
    ) -> dict:
        """The explainable qualification scorecard for one buyer.

        Structure: {score, max_score, dimensions[], missing_information[],
        evidence_note}. An honest score NEVER counts unknowns as pass.
        """
        dimensions: list[Dimension] = []
        missing: list[str] = []

        # volume
        volume_fact = self._facts.get_fact(subject_type, subject_id, "annual_volume_mt")
        volume_live = _live_evidence_count(
            self._ledger, subject_type, subject_id, "annual_volume_mt"
        )
        volume_value = _fact_value(volume_fact) if volume_fact is not None else None
        if (
            volume_fact is None
            or not _admissible(volume_fact)
            or volume_live == 0
            or not isinstance(volume_value, (int, float))
        ):
            dimensions.append(
                Dimension(
                    key="volume",
                    label="Annual volume ≥ min (≈1 FCL)",
                    weight=QUALIFICATION_WEIGHTS["volume"],
                    outcome="not_evidenced",
                    explanation="no admissible annual_volume_mt fact — never guessed",
                    fact_key="annual_volume_mt",
                    fact_status=volume_fact.status if volume_fact is not None else None,
                    source_count=volume_fact.source_count if volume_fact is not None else None,
                )
            )
            missing.append("annual_volume_mt")
        elif float(volume_value) >= float(min_volume_mt):
            dimensions.append(
                Dimension(
                    key="volume",
                    label="Annual volume ≥ min (≈1 FCL)",
                    weight=QUALIFICATION_WEIGHTS["volume"],
                    outcome="satisfied",
                    explanation=f"annual_volume_mt={volume_value} ≥ {min_volume_mt}",
                    fact_key="annual_volume_mt",
                    fact_status=volume_fact.status,
                    source_count=volume_fact.source_count,
                )
            )
        else:
            dimensions.append(
                Dimension(
                    key="volume",
                    label="Annual volume ≥ min (≈1 FCL)",
                    weight=QUALIFICATION_WEIGHTS["volume"],
                    outcome="unsatisfied",
                    explanation=f"annual_volume_mt={volume_value} < {min_volume_mt}",
                    fact_key="annual_volume_mt",
                    fact_status=volume_fact.status,
                    source_count=volume_fact.source_count,
                )
            )

        # segment
        sector_fact = self._facts.get_fact(subject_type, subject_id, "sector")
        sector_live = _live_evidence_count(self._ledger, subject_type, subject_id, "sector")
        sector_value = _fact_value(sector_fact) if sector_fact is not None else None
        if (
            sector_fact is None
            or not _admissible(sector_fact)
            or sector_live == 0
            or not isinstance(sector_value, str)
        ):
            dimensions.append(
                Dimension(
                    key="segment",
                    label="Sector fit (importer/trader/roaster)",
                    weight=QUALIFICATION_WEIGHTS["segment"],
                    outcome="not_evidenced",
                    explanation="no admissible sector fact — never guessed",
                    fact_key="sector",
                    fact_status=sector_fact.status if sector_fact is not None else None,
                    source_count=sector_fact.source_count if sector_fact is not None else None,
                )
            )
            missing.append("sector")
        elif sector_value.strip().lower() in SEGMENT_FIT_SECTORS:
            dimensions.append(
                Dimension(
                    key="segment",
                    label="Sector fit (importer/trader/roaster)",
                    weight=QUALIFICATION_WEIGHTS["segment"],
                    outcome="satisfied",
                    explanation=f"sector={sector_value!r} is a buying sector",
                    fact_key="sector",
                    fact_status=sector_fact.status,
                    source_count=sector_fact.source_count,
                )
            )
        else:
            dimensions.append(
                Dimension(
                    key="segment",
                    label="Sector fit (importer/trader/roaster)",
                    weight=QUALIFICATION_WEIGHTS["segment"],
                    outcome="unsatisfied",
                    explanation=f"sector={sector_value!r} is not a buying sector",
                    fact_key="sector",
                    fact_status=sector_fact.status,
                    source_count=sector_fact.source_count,
                )
            )

        # contact channel (the Q3-authority proxy: a usable, evidence-
        # backed contact channel — explicitly NOT a claim of authority)
        contact_check = self._contacts.check_channel(
            subject_type, subject_id, "email", _first_usable_email(subject_type, subject_id, self)
        )
        if contact_check.usable:
            dimensions.append(
                Dimension(
                    key="contact_channel",
                    label="Usable contact channel (evidence-backed)",
                    weight=QUALIFICATION_WEIGHTS["contact_channel"],
                    outcome="satisfied",
                    explanation=f"contact email backed by {contact_check.reason} evidence",
                    fact_key="contact_email",
                    fact_status=contact_check.reason,
                    source_count=len(contact_check.evidence_ids),
                )
            )
        else:
            dimensions.append(
                Dimension(
                    key="contact_channel",
                    label="Usable contact channel (evidence-backed)",
                    weight=QUALIFICATION_WEIGHTS["contact_channel"],
                    outcome="not_evidenced",
                    explanation=f"contact email gate: {contact_check.reason}",
                    fact_key="contact_email",
                )
            )
            missing.append("contact_email")

        score = sum(d.weight for d in dimensions if d.outcome == "satisfied")
        max_score = sum(d.weight for d in dimensions)
        return {
            "subject_type": subject_type,
            "subject_id": subject_id,
            "score": score,
            "max_score": max_score,
            "dimensions": [d.to_dict() for d in dimensions],
            "missing_information": missing,
            "evidence_note": (
                "Every scored dimension traces to a persistent fact; "
                "not-evidenced dimensions score zero AND are listed as "
                "missing information — an unknown never passes. The human "
                "Q1–Q5 conversation remains the commercial gate."
            ),
        }

    # ── inventory matching ─────────────────────────────────────────

    def match_inventory(
        self,
        subject_type: str,
        subject_id: str,
        *,
        limit: int = 20,
    ) -> dict:
        """Match the buyer's extracted requirements against THIS org's
        active, in-stock lots — criterion by criterion, explainable.

        Returns {requirements, matches, missing_information, note};
        lots ranked by matched criteria (desc). Unknown requirements
        produce missing_info criteria on EVERY lot (never a pass), and
        are surfaced in missing_information.
        """
        requirements = {r.key: r for r in self.extract_requirements(subject_type, subject_id)}
        lots = self._active_lots(limit)
        matches: list[LotMatch] = []
        for lot in lots:
            criteria = self._lot_criteria(lot, requirements)
            matched = sum(1 for c in criteria if c.outcome == "pass")
            matches.append(
                LotMatch(
                    lot_id=lot.lot_id,
                    matched_criteria=matched,
                    total_criteria=len(criteria),
                    criteria=criteria,
                )
            )
        matches.sort(key=lambda m: (-m.matched_criteria, m.lot_id))
        missing = [key for key, req in requirements.items() if not req.extracted]
        return {
            "subject_type": subject_type,
            "subject_id": subject_id,
            "requirements": [r.to_dict() for r in requirements.values()],
            "matches": [m.to_dict() for m in matches],
            "match_count": len(matches),
            "missing_information": missing,
            "note": (
                "Compatibility is criterion-by-criterion with explanations; "
                "unknown requirements are missing_info on every lot — never "
                "counted as compatible."
            ),
        }

    def _active_lots(self, limit: int) -> list[Any]:
        """Active, in-stock, not-deleted lots of THIS org (column Rows —
        read-only match data; no ORM session, no mutation)."""
        table = Lot.__table__
        stmt = (
            select(table)
            .where(
                table.c.organization_id == self.organization_id,
                table.c.status == "active",
                table.c.stock_bags_remaining > 0,
                table.c.deleted_ts.is_(None),
            )
            .order_by(table.c.lot_id)
            .limit(limit)
        )
        with self._engine.connect() as conn:
            return list(conn.execute(stmt).all())

    @staticmethod
    def _lot_criteria(lot: Any, requirements: dict[str, Requirement]) -> list[MatchCriterion]:
        criteria: list[MatchCriterion] = []

        volume_req = requirements.get("purchase_volume_mt")
        stock_mt = (lot.stock_bags_remaining * (lot.bag_size_kg or 60)) / 1000.0
        if (
            volume_req is None
            or not volume_req.extracted
            or not isinstance(volume_req.value, (int, float))
        ):
            criteria.append(
                MatchCriterion(
                    "volume",
                    "missing_info",
                    "buyer per-lot purchase volume unknown — cannot judge sufficiency",
                )
            )
        elif stock_mt + 1e-9 >= float(volume_req.value):
            criteria.append(
                MatchCriterion(
                    "volume",
                    "pass",
                    f"stock {stock_mt:.1f} MT ≥ required {volume_req.value} MT",
                )
            )
        else:
            criteria.append(
                MatchCriterion(
                    "volume",
                    "fail",
                    f"stock {stock_mt:.1f} MT < required {volume_req.value} MT",
                )
            )

        cert_req = requirements.get("certifications")
        lot_certs = {
            token.strip().lower()
            for token in (lot.certifications or "").split(_CERT_SPLIT)
            if token.strip()
        }
        if cert_req is None or not cert_req.extracted or not cert_req.value:
            criteria.append(
                MatchCriterion(
                    "certifications",
                    "missing_info",
                    "buyer certification requirement unknown",
                )
            )
        else:
            wanted = _requirement_tokens(cert_req.value)
            unmet = wanted - lot_certs
            if not wanted:
                criteria.append(
                    MatchCriterion(
                        "certifications",
                        "missing_info",
                        "buyer certification requirement unreadable",
                    )
                )
            elif unmet:
                criteria.append(
                    MatchCriterion(
                        "certifications",
                        "fail",
                        f"lot lacks {sorted(unmet)} (has {sorted(lot_certs) or 'none'})",
                    )
                )
            else:
                criteria.append(
                    MatchCriterion(
                        "certifications",
                        "pass",
                        f"lot carries all required {sorted(wanted)}",
                    )
                )

        cup_req = requirements.get("min_cupping_score")
        if cup_req is None or not cup_req.extracted or not isinstance(cup_req.value, (int, float)):
            criteria.append(
                MatchCriterion(
                    "cupping",
                    "missing_info",
                    "buyer cupping floor unknown",
                )
            )
        elif lot.cupping_score is None:
            criteria.append(
                MatchCriterion(
                    "cupping",
                    "missing_info",
                    "lot cupping score not graded yet",
                )
            )
        elif float(lot.cupping_score) + 1e-9 >= float(cup_req.value):
            criteria.append(
                MatchCriterion(
                    "cupping",
                    "pass",
                    f"lot cupping {lot.cupping_score} ≥ floor {cup_req.value}",
                )
            )
        else:
            criteria.append(
                MatchCriterion(
                    "cupping",
                    "fail",
                    f"lot cupping {lot.cupping_score} < floor {cup_req.value}",
                )
            )

        process_req = requirements.get("preferred_process")
        if process_req is None or not process_req.extracted or not process_req.value:
            criteria.append(
                MatchCriterion(
                    "process",
                    "missing_info",
                    "buyer process preference unknown",
                )
            )
        else:
            wanted = _requirement_tokens(process_req.value)
            lot_process = (lot.process or "").strip().lower()
            if not wanted:
                criteria.append(
                    MatchCriterion(
                        "process",
                        "missing_info",
                        "buyer process preference unreadable",
                    )
                )
            elif lot_process in wanted:
                criteria.append(
                    MatchCriterion(
                        "process",
                        "pass",
                        f"lot process {lot.process!r} matches preference",
                    )
                )
            else:
                criteria.append(
                    MatchCriterion(
                        "process",
                        "fail",
                        f"lot process {lot.process!r} not in {sorted(wanted)}",
                    )
                )

        return criteria


def _requirement_tokens(value: object) -> set[str]:
    """Requirement values may be a list of strings or a comma-separated
    string — normalize to lowercase tokens (empty on unreadable)."""
    if isinstance(value, str):
        return {token.strip().lower() for token in value.split(_CERT_SPLIT) if token.strip()}
    if isinstance(value, (list, tuple)):
        return {str(item).strip().lower() for item in value if str(item).strip()}
    return set()


def _first_usable_email(subject_type: str, subject_id: str, service: QualificationService) -> str:
    """The first evidence-backed contact email found for the subject —
    honest placeholder when none exists (the gate then refuses it and
    the dimension is honestly not_evidenced)."""
    ledger = EvidenceLedger(service.organization_id, service._engine)
    rows = ledger.list_evidence(subject_type, subject_id, "contact_email", include_suppressed=False)
    for row in rows:
        try:
            value = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            continue
        if (
            isinstance(value, str)
            and value.strip()
            and "@" in value
            and row.source_type != "llm_inference"
            and row.status in ("observed", "corroborated", "human_verified")
        ):
            return value
    return "unknown@missing.invalid"  # the gate refuses this honestly
