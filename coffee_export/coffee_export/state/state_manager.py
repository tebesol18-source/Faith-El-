"""
StateManager — single entry point for ALL state mutations.

Agents never touch the database directly. They call semantic methods on
StateManager, which:
  1. Validates inputs (enums, required fields, business rules)
  2. Executes inside a transaction
  3. Logs to the audit trail (lead_state_history, audit_log)
  4. Returns the result (or raises on failure)

ARCHITECTURE
------------
    LLM Agent (reasons about business actions)
        ↓  calls semantic function
    StateManager (validates, enforces rules, logs audit)
        ↓  executes transaction
    SQLAlchemy ORM → SQLite / PostgreSQL (single source of truth)

USAGE
-----
    from coffee_export.state import StateManager

    with StateManager() as sm:
        lead_id = sm.create_lead(company_name="Falcon Coffees",
                                 headquarters_country="United Kingdom")
        sm.update_lead_state(lead_id, "ENRICHED", agent="Agent 2",
                             priority_tier="S", recommended_vp="VP1")
        sm.transfer_ownership(lead_id, from_agent="Agent 2", to_agent="Agent 3")

        # Lot inventory
        lot_id = sm.add_lot({...})
        result = sm.confirm_lot_for_sample(
            lot_id="LOT-25-0001", lead_id=lead_id,
            sample_type="350g", buyer_company="Falcon Coffees",
            destination_country="United Kingdom", crop_year="25/26"
        )

        # Sample budget (atomic, auto-resetting)
        if sm.consume_sample_budget("350g", lead_id):
            # dispatch the sample
            pass
        else:
            sm.add_to_waitlist(lead_id, tier="S")

        # KPIs
        snapshot = sm.get_kpi_snapshot()
"""

from __future__ import annotations

import contextlib
import hashlib
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from coffee_export.database.base import SessionLocal
from coffee_export.database.models import (
    Lead,
    LeadContact,
    LeadStateHistory,
    LeadTag,
    Lot,
    LotFeedback,
    LotReservation,
    QAFlag,
    SampleBudget,
    SampleWaitlist,
    StockMovement,
)
from coffee_export.state.constants import (
    ALLOWED_AGENTS,
    ALLOWED_EUDR_STATUS,
    ALLOWED_LANGS,
    ALLOWED_LOT_STATUS,
    ALLOWED_PROCESSES,
    ALLOWED_REGIONS,
    ALLOWED_STATES,
    ALLOWED_TIERS,
    ALLOWED_VPS,
    CRITICAL_KEYWORDS,
    DEFAULT_BAG_SIZE_KG,
    EU_COUNTRIES,
    MAX_SEQUENCE_STEP,
    RESERVATION_DAYS,
    SAMPLE_QUANTITIES_GRAMS,
    STATE_TRANSITIONS,
    _get_budget_caps,
)
from coffee_export.state.exceptions import (
    ConcurrencyError,
    InvalidTransitionError,
    NotFoundError,
    StateManagerError,
    ValidationFailedError,
)
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


# ──────────────────────────────────────────────────────────────
# Timezone helpers
# ──────────────────────────────────────────────────────────────

ADDIS_TZ = timezone = __import__("datetime").timezone(__import__("datetime").timedelta(hours=3))


def now_addis() -> datetime:
    return datetime.now(ADDIS_TZ)


def now_addis_iso_str() -> str:
    return now_addis().isoformat(timespec="seconds")


def _week_start(date: datetime | None = None) -> str:
    """ISO date of the Monday of the given date's week (Addis tz)."""
    if date is None:
        date = now_addis()
    monday = date - timedelta(days=date.weekday())
    return monday.strftime("%Y-%m-%d")


def _week_end(week_start_str: str) -> str:
    """ISO date of the Sunday given a Monday ISO date string."""
    start = datetime.fromisoformat(week_start_str)
    return (start + timedelta(days=6)).strftime("%Y-%m-%d")


def _parse_iso(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def _source_row_hash(company_name: str, headquarters: str) -> str:
    """SHA1 hash for dedup."""
    raw = f"{company_name.strip().lower()}|{headquarters.strip().lower()}"
    return hashlib.sha1(raw.encode()).hexdigest()


# ──────────────────────────────────────────────────────────────
# StateManager
# ──────────────────────────────────────────────────────────────


class StateManager:
    """
    Single entry point for ALL state mutations.

    Every method:
      1. Validates inputs
      2. Executes inside a session (auto-commit/rollback)
      3. Logs to audit trail where applicable
      4. Returns result or raises
    """

    def __init__(self, organization_id: str = "org-system") -> None:
        self.session: Session = SessionLocal()
        self.organization_id = organization_id
        log.debug(f"StateManager initialized with organization_id: {organization_id}")

        # Initialize tenant-enforced repositories
        from coffee_export.state.repositories import (
            LeadRepository, LotRepository, ContractRepository,
            ShipmentRepository, SampleRepository, ComplianceRepository, FinanceRepository
        )
        self.leads_repo = LeadRepository(self.session, self.organization_id)
        self.lots_repo = LotRepository(self.session, self.organization_id)
        self.contracts_repo = ContractRepository(self.session, self.organization_id)
        self.shipments_repo = ShipmentRepository(self.session, self.organization_id)
        self.samples_repo = SampleRepository(self.session, self.organization_id)
        self.compliance_repo = ComplianceRepository(self.session, self.organization_id)
        self.finance_repo = FinanceRepository(self.session, self.organization_id)

    def __enter__(self) -> StateManager:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def close(self) -> None:
        """Close the underlying session."""
        with contextlib.suppress(Exception):
            self.session.close()

    def _commit(self) -> None:
        """Commit the current session."""
        self.session.commit()

    def _rollback(self) -> None:
        """Rollback the current session."""
        self.session.rollback()

    # =============================================================
    # LEAD LIFECYCLE
    # =============================================================

    def create_lead(
        self,
        company_name: str,
        headquarters_country: str = "",
        headquarters_city: str = "",
        website: str = "",
        source_row_hash: str = "",
        priority_tier: str | None = None,
        recommended_vp: str | None = None,
        outreach_language: str = "EN",
        tags: list[str] | None = None,
        created_by: str = "Agent 2",
    ) -> str:
        """
        Create a new lead. Returns lead_id.
        Fails if company+country already exists.
        """
        if not company_name.strip():
            raise ValidationFailedError("company_name is required")

        if priority_tier and priority_tier not in ALLOWED_TIERS:
            raise ValidationFailedError(
                f"priority_tier '{priority_tier}' not in {sorted(ALLOWED_TIERS)}"
            )
        if recommended_vp and recommended_vp not in ALLOWED_VPS:
            raise ValidationFailedError(
                f"recommended_vp '{recommended_vp}' not in {sorted(ALLOWED_VPS)}"
            )
        if outreach_language not in ALLOWED_LANGS:
            raise ValidationFailedError(
                f"outreach_language '{outreach_language}' not in {sorted(ALLOWED_LANGS)}"
            )

        # Generate source_row_hash if not provided
        if not source_row_hash:
            source_row_hash = _source_row_hash(company_name, headquarters_country)

        # Check for duplicate
        existing = self.session.execute(
            select(Lead).where(
                Lead.company_name == company_name.strip(),
                Lead.headquarters_country == headquarters_country.strip(),
            )
        ).scalar_one_or_none()
        if existing:
            raise ValidationFailedError(
                f"Lead already exists: company='{company_name}', "
                f"country='{headquarters_country}' → lead_id={existing.lead_id}"
            )

        # Generate lead_id: L-YYYY-NNNNN
        year = now_addis().year
        prefix = f"L-{year}-"
        last = self.session.execute(
            select(Lead)
            .where(Lead.lead_id.like(f"{prefix}%"))
            .order_by(Lead.lead_id.desc())
            .limit(1)
        ).scalar_one_or_none()
        next_num = 1
        if last and last.lead_id:
            with contextlib.suppress(ValueError):
                next_num = int(last.lead_id[len(prefix) :]) + 1
        lead_id = f"{prefix}{next_num:05d}"

        now = now_addis_iso_str()

        try:
            lead = Lead(
                lead_id=lead_id,
                company_name=company_name.strip(),
                headquarters_country=headquarters_country.strip(),
                headquarters_city=headquarters_city.strip(),
                website=website.strip(),
                source_row_hash=source_row_hash,
                organization_id=self.organization_id,
                current_state="NEW",
                current_agent="none",
                last_touch_ts=now,
                next_action_due_ts=now,
                next_action_agent="none",
                priority_tier=priority_tier,
                recommended_vp=recommended_vp,
                outreach_language=outreach_language,
                sequence_step=0,
                substitute_round=0,
                ghosted_count=0,
                created_ts=now,
                updated_ts=now,
            )
            self.session.add(lead)
            self.session.flush()

            # Initial state history
            self.session.add(
                LeadStateHistory(
                    lead_id=lead_id,
                    from_state=None,
                    to_state="NEW",
                    agent_id=created_by,
                    ts=now,
                    notes="Lead created",
                )
            )

            # Tags
            if tags:
                for tag in tags:
                    self.session.add(LeadTag(lead_id=lead_id, tag=tag, tagged_ts=now))

            self._commit()
            log.info(f"Created lead {lead_id}: {company_name} ({headquarters_country})")
            return lead_id

        except Exception as e:
            self._rollback()
            raise StateManagerError(f"Failed to create lead: {e}") from e

    def get_lead(self, lead_id: str) -> dict[str, Any] | None:
        """Return lead as dict with tags, or None if not found."""
        lead = self.leads_repo.get_lead(lead_id)
        if not lead:
            return None
        result = {c.name: getattr(lead, c.name) for c in lead.__table__.columns}
        result["tags"] = [t.tag for t in lead.tags]
        return result

    def get_lead_by_company(
        self, company_name: str, headquarters_country: str = ""
    ) -> dict[str, Any] | None:
        """Find a lead by company name (and optionally country)."""
        stmt = select(Lead).where(Lead.company_name == company_name)
        if headquarters_country:
            stmt = stmt.where(Lead.headquarters_country == headquarters_country)
        lead = self.session.execute(stmt).scalar_one_or_none()
        if not lead:
            return None
        result = {c.name: getattr(lead, c.name) for c in lead.__table__.columns}
        result["tags"] = [t.tag for t in lead.tags]
        return result

    def update_lead_state(
        self,
        lead_id: str,
        new_state: str,
        agent: str = "none",
        notes: str = "",
        next_action_due_ts: str | None = None,
        next_action_agent: str = "none",
        **extra_fields,
    ) -> bool:
        """
        Transition a lead to a new state. Validates against the allowed map.
        Logs to lead_state_history. Returns True on success.
        """
        if new_state not in ALLOWED_STATES:
            raise ValidationFailedError(f"new_state '{new_state}' not in {sorted(ALLOWED_STATES)}")

        lead = self.session.get(Lead, lead_id)
        if not lead:
            raise NotFoundError(f"lead_id '{lead_id}' not found")

        from_state = lead.current_state

        # BLOCKED is a meta-state — allowed from/to any state
        if from_state != "BLOCKED" and new_state != "BLOCKED":
            allowed = STATE_TRANSITIONS.get(from_state, frozenset())
            if new_state not in allowed:
                raise InvalidTransitionError(
                    f"Transition {from_state} → {new_state} not allowed. "
                    f"Allowed from {from_state}: {sorted(allowed)}"
                )

        now = now_addis_iso_str()

        # Update lead fields
        lead.current_state = new_state
        lead.last_touch_ts = now
        lead.next_action_due_ts = next_action_due_ts
        lead.next_action_agent = next_action_agent
        lead.updated_ts = now

        # Apply extra fields (priority_tier, recommended_vp, current_agent, etc.)
        for field, value in extra_fields.items():
            if hasattr(lead, field):
                setattr(lead, field, value)

        # Log to state history
        self.session.add(
            LeadStateHistory(
                lead_id=lead_id,
                from_state=from_state,
                to_state=new_state,
                agent_id=agent,
                ts=now,
                notes=notes,
            )
        )

        self._commit()
        log.info(f"Lead {lead_id}: {from_state} → {new_state} by {agent}")
        return True

    def transfer_ownership(
        self,
        lead_id: str,
        from_agent: str,
        to_agent: str,
    ) -> bool:
        """Atomically transfer lead ownership. Fails if current_agent != from_agent."""
        if to_agent not in ALLOWED_AGENTS:
            raise ValidationFailedError(f"to_agent '{to_agent}' not in {sorted(ALLOWED_AGENTS)}")

        lead = self.session.get(Lead, lead_id)
        if not lead:
            raise NotFoundError(f"lead_id '{lead_id}' not found")

        if lead.current_agent != from_agent:
            raise ConcurrencyError(
                f"Ownership transfer failed: lead '{lead_id}' is owned by "
                f"'{lead.current_agent}', not '{from_agent}'"
            )

        now = now_addis_iso_str()
        lead.current_agent = to_agent
        lead.last_touch_ts = now
        lead.updated_ts = now
        self._commit()

        log.info(f"Lead {lead_id}: ownership {from_agent} → {to_agent}")
        return True

    def advance_sequence_step(self, lead_id: str) -> int:
        """Increment sequence_step. Fails if already at max (6)."""
        lead = self.session.get(Lead, lead_id)
        if not lead:
            raise NotFoundError(f"lead_id '{lead_id}' not found")

        current = lead.sequence_step or 0
        if current >= MAX_SEQUENCE_STEP:
            raise ValidationFailedError(
                f"Lead '{lead_id}' at sequence_step {current} (max={MAX_SEQUENCE_STEP})"
            )

        new_step = current + 1
        now = now_addis_iso_str()
        lead.sequence_step = new_step
        lead.last_touch_ts = now
        lead.updated_ts = now
        self._commit()
        return new_step

    def set_lead_field(self, lead_id: str, **fields) -> bool:
        """Set one or more fields on a lead (priority_tier, recommended_vp, etc.)."""
        lead = self.session.get(Lead, lead_id)
        if not lead:
            raise NotFoundError(f"lead_id '{lead_id}' not found")

        if "priority_tier" in fields and fields["priority_tier"] not in ALLOWED_TIERS:
            raise ValidationFailedError(
                f"priority_tier '{fields['priority_tier']}' not in {sorted(ALLOWED_TIERS)}"
            )
        if "recommended_vp" in fields and fields["recommended_vp"] not in ALLOWED_VPS:
            raise ValidationFailedError(
                f"recommended_vp '{fields['recommended_vp']}' not in {sorted(ALLOWED_VPS)}"
            )
        if "outreach_language" in fields and fields["outreach_language"] not in ALLOWED_LANGS:
            raise ValidationFailedError(
                f"outreach_language '{fields['outreach_language']}' not in {sorted(ALLOWED_LANGS)}"
            )

        allowed = {
            "priority_tier",
            "recommended_vp",
            "outreach_language",
            "sequence_step",
            "sample_lead_id",
            "substitute_round",
            "ghosted_count",
            "next_action_due_ts",
            "next_action_agent",
        }
        now = now_addis_iso_str()
        for field, value in fields.items():
            if field in allowed and hasattr(lead, field):
                setattr(lead, field, value)
        lead.last_touch_ts = now
        lead.updated_ts = now
        self._commit()
        return True

    def add_tag(self, lead_id: str, tag: str) -> bool:
        """Add a tag to a lead (idempotent)."""
        existing = self.session.execute(
            select(LeadTag).where(LeadTag.lead_id == lead_id, LeadTag.tag == tag)
        ).scalar_one_or_none()
        if existing:
            return True
        self.session.add(LeadTag(lead_id=lead_id, tag=tag, tagged_ts=now_addis_iso_str()))
        self._commit()
        return True

    def add_contact(
        self,
        lead_id: str,
        name: str,
        title: str = "",
        linkedin_url: str = "",
        email: str = "",
        phone: str = "",
        is_primary: bool = False,
        is_buyer: bool = False,
    ) -> int:
        """Add a contact to a lead. Returns the contact ID."""
        lead = self.session.get(Lead, lead_id)
        if not lead:
            raise NotFoundError(f"lead_id '{lead_id}' not found")

        now = now_addis_iso_str()
        contact = LeadContact(
            lead_id=lead_id,
            name=name,
            title=title,
            linkedin_url=linkedin_url,
            email=email,
            phone=phone,
            is_primary=1 if is_primary else 0,
            is_buyer=1 if is_buyer else 0,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(contact)
        self._commit()
        return contact.id

    def list_leads(
        self,
        state: str | None = None,
        agent: str | None = None,
        tier: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List leads with optional filters."""
        stmt = select(Lead).where(Lead.organization_id == self.organization_id)
        if state:
            stmt = stmt.where(Lead.current_state == state)
        if agent:
            stmt = stmt.where(Lead.current_agent == agent)
        if tier:
            stmt = stmt.where(Lead.priority_tier == tier)
        stmt = stmt.order_by(Lead.created_ts.desc()).limit(limit).offset(offset)
        leads = self.session.execute(stmt).scalars().all()
        return [{c.name: getattr(lead, c.name) for c in lead.__table__.columns} for lead in leads]

    def get_lead_history(self, lead_id: str) -> list[dict[str, Any]]:
        """Return full state transition history for a lead."""
        rows = (
            self.session.execute(
                select(LeadStateHistory)
                .where(LeadStateHistory.lead_id == lead_id)
                .order_by(LeadStateHistory.ts.asc())
            )
            .scalars()
            .all()
        )
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def get_blocked_leads(self) -> list[dict[str, Any]]:
        """Return all leads in BLOCKED state."""
        return self.list_leads(state="BLOCKED", limit=10000)

    # =============================================================
    # LOT INVENTORY
    # =============================================================

    def _validate_lot(self, lot: dict[str, Any]) -> list[str]:
        """Validate a lot dict. Returns list of errors (empty if valid)."""
        errors: list[str] = []
        region = (lot.get("region") or "").strip()
        if region not in ALLOWED_REGIONS:
            errors.append(f"region '{region}' not in {sorted(ALLOWED_REGIONS)}")
        process = (lot.get("process") or "").strip()
        if process not in ALLOWED_PROCESSES:
            errors.append(f"process '{process}' not in {sorted(ALLOWED_PROCESSES)}")
        eudr = (lot.get("eudr_data_status") or "").strip()
        if eudr not in ALLOWED_EUDR_STATUS:
            errors.append(f"eudr_data_status '{eudr}' not in {sorted(ALLOWED_EUDR_STATUS)}")
        status = (lot.get("status") or "").strip()
        if status not in ALLOWED_LOT_STATUS:
            errors.append(f"status '{status}' not in {sorted(ALLOWED_LOT_STATUS)}")
        crop_year = (lot.get("crop_year") or "").strip()
        if crop_year and "/" not in crop_year:
            errors.append(f"crop_year '{crop_year}' must be YY/YY format")
        return errors

    def add_lot(self, lot_data: dict[str, Any]) -> str:
        """Add a lot to inventory. Returns lot_id."""
        errors = self._validate_lot(lot_data)
        if errors:
            raise ValidationFailedError("Lot validation failed: " + "; ".join(errors))

        lot_id = (lot_data.get("lot_id") or "").strip()
        if not lot_id:
            # Generate: LOT-YY-NNNN
            crop_year = (lot_data.get("crop_year") or "25/26").split("/")[0]
            prefix = f"LOT-{crop_year}-"
            last = self.session.execute(
                select(Lot)
                .where(Lot.lot_id.like(f"{prefix}%"))
                .order_by(Lot.lot_id.desc())
                .limit(1)
            ).scalar_one_or_none()
            next_num = 1
            if last and last.lot_id:
                with contextlib.suppress(ValueError):
                    next_num = int(last.lot_id[len(prefix) :]) + 1
            lot_id = f"{prefix}{next_num:04d}"

        # Check duplicate
        if self.session.get(Lot, lot_id):
            raise ValidationFailedError(f"lot_id '{lot_id}' already exists")

        now = now_addis_iso_str()
        lot = Lot(
            lot_id=lot_id,
            station_id=lot_data.get("station_id", ""),
            coop_id=lot_data.get("coop_id", ""),
            region=lot_data.get("region", ""),
            organization_id=self.organization_id,
            washing_station_name=lot_data.get("washing_station_name", ""),
            coop_name=lot_data.get("coop_name", ""),
            process=lot_data.get("process", ""),
            screen_size=lot_data.get("screen_size"),
            cupping_score=lot_data.get("cupping_score"),
            q_grader_name=lot_data.get("q_grader_name", ""),
            grading_date=lot_data.get("grading_date", ""),
            defect_count_sca=lot_data.get("defect_count_sca"),
            moisture_pct=lot_data.get("moisture_pct"),
            water_activity=lot_data.get("water_activity"),
            crop_year=lot_data.get("crop_year", ""),
            harvest_date_range=lot_data.get("harvest_date_range", ""),
            milling_date=lot_data.get("milling_date", ""),
            stock_bags_remaining=lot_data.get("stock_bags_remaining", 0),
            bag_size_kg=lot_data.get("bag_size_kg", DEFAULT_BAG_SIZE_KG),
            certifications=lot_data.get("certifications", ""),
            certificate_of_origin=lot_data.get("certificate_of_origin", ""),
            eudr_data_status=lot_data.get("eudr_data_status", "missing"),
            eudr_gps_lat=lot_data.get("eudr_gps_lat"),
            eudr_gps_lon=lot_data.get("eudr_gps_lon"),
            eudr_farmgate_price_etb_per_kg=lot_data.get("eudr_farmgate_price_etb_per_kg"),
            eudr_deforestation_attestation=lot_data.get("eudr_deforestation_attestation", ""),
            reserved_for_forward_program=lot_data.get("reserved_for_forward_program", "No"),
            status=lot_data.get("status", "active"),
            last_updated_ts=now,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(lot)

        # Log initial stock movement
        if lot_data.get("stock_bags_remaining", 0) > 0:
            self.session.add(
                StockMovement(
                    lot_id=lot_id,
                    delta_bags=lot_data["stock_bags_remaining"],
                    reason="initial_stock",
                    reference_id=None,
                    notes="Initial stock on lot creation",
                    ts=now,
                    agent_id="Agent 1",
                )
            )

        self._commit()
        log.info(f"Added lot {lot_id}: {lot_data.get('region')} {lot_data.get('process')}")
        return lot_id

    def get_lot(self, lot_id: str) -> dict[str, Any] | None:
        """Return lot as dict, or None."""
        lot = self.lots_repo.get_lot(lot_id)
        if not lot:
            return None
        return {c.name: getattr(lot, c.name) for c in lot.__table__.columns}

    def update_lot(self, lot_id: str, **fields) -> bool:
        """Update one or more fields on a lot."""
        lot = self.session.get(Lot, lot_id)
        if not lot:
            raise NotFoundError(f"lot_id '{lot_id}' not found")

        if "status" in fields and fields["status"] not in ALLOWED_LOT_STATUS:
            raise ValidationFailedError(
                f"status '{fields['status']}' not in {sorted(ALLOWED_LOT_STATUS)}"
            )
        if "eudr_data_status" in fields and fields["eudr_data_status"] not in ALLOWED_EUDR_STATUS:
            raise ValidationFailedError(f"eudr_data_status not in {sorted(ALLOWED_EUDR_STATUS)}")

        allowed = {
            "region",
            "washing_station_name",
            "coop_name",
            "process",
            "screen_size",
            "cupping_score",
            "q_grader_name",
            "grading_date",
            "defect_count_sca",
            "moisture_pct",
            "water_activity",
            "crop_year",
            "harvest_date_range",
            "milling_date",
            "stock_bags_remaining",
            "bag_size_kg",
            "certifications",
            "certificate_of_origin",
            "eudr_data_status",
            "eudr_gps_lat",
            "eudr_gps_lon",
            "eudr_farmgate_price_etb_per_kg",
            "eudr_deforestation_attestation",
            "reserved_for_forward_program",
            "status",
        }
        now = now_addis_iso_str()
        for field, value in fields.items():
            if field in allowed and hasattr(lot, field):
                setattr(lot, field, value)
        lot.last_updated_ts = now
        lot.updated_ts = now
        self._commit()
        return True

    def list_lots(
        self,
        region: str | None = None,
        process: str | None = None,
        status: str | None = None,
        eudr: str | None = None,
        crop_year: str | None = None,
        min_score: float | None = None,
    ) -> list[dict[str, Any]]:
        """List lots with optional filters."""
        stmt = select(Lot).where(Lot.organization_id == self.organization_id)
        if region:
            stmt = stmt.where(Lot.region == region)
        if process:
            stmt = stmt.where(Lot.process == process)
        if status:
            stmt = stmt.where(Lot.status == status)
        if eudr:
            stmt = stmt.where(Lot.eudr_data_status == eudr)
        if crop_year:
            stmt = stmt.where(Lot.crop_year == crop_year)
        if min_score is not None:
            stmt = stmt.where(Lot.cupping_score >= min_score)
        stmt = stmt.order_by(Lot.lot_id)
        lots = self.session.execute(stmt).scalars().all()
        return [{c.name: getattr(lot, c.name) for c in lot.__table__.columns} for lot in lots]

    def reserve_lot(
        self,
        lot_id: str,
        lead_id: str,
        sample_type: str,
        buyer_company: str,
        crop_year: str,
    ) -> str:
        """Create a 7-day reservation on a lot. Returns reservation_id."""
        if sample_type not in SAMPLE_QUANTITIES_GRAMS:
            raise ValidationFailedError(
                f"sample_type '{sample_type}' not in {sorted(SAMPLE_QUANTITIES_GRAMS)}"
            )
        now = now_addis()
        until = now + timedelta(days=RESERVATION_DAYS)
        reservation_id = f"RES-{now.strftime('%Y%m%d%H%M%S')}-{lot_id}"

        self.session.add(
            LotReservation(
                reservation_id=reservation_id,
                lot_id=lot_id,
                lead_id=lead_id,
                sample_type=sample_type,
                quantity_grams=SAMPLE_QUANTITIES_GRAMS[sample_type],
                reserved_ts=now.isoformat(timespec="seconds"),
                reserved_until_ts=until.isoformat(timespec="seconds"),
                buyer_company=buyer_company,
                crop_year=crop_year,
                status="active",
            )
        )
        self._commit()
        return reservation_id

    def get_active_reservations(self, lot_id: str | None = None) -> list[dict[str, Any]]:
        """Return active (non-expired) reservations."""
        now = now_addis_iso_str()
        stmt = select(LotReservation).where(
            LotReservation.status == "active",
            LotReservation.reserved_until_ts > now,
        )
        if lot_id:
            stmt = stmt.where(LotReservation.lot_id == lot_id)
        stmt = stmt.order_by(LotReservation.reserved_until_ts.asc())
        rows = self.session.execute(stmt).scalars().all()
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def confirm_lot_for_sample(
        self,
        lot_id: str,
        lead_id: str,
        sample_type: str,
        buyer_company: str,
        destination_country: str,
        crop_year: str,
    ) -> dict[str, Any]:
        """
        Full confirmation logic. Validates status, stock, crop year, EUDR.
        On success, creates a reservation and returns docs payload.
        """
        if sample_type not in SAMPLE_QUANTITIES_GRAMS:
            raise ValidationFailedError(
                f"sample_type '{sample_type}' not in {sorted(SAMPLE_QUANTITIES_GRAMS)}"
            )

        lot = self.session.get(Lot, lot_id)
        eudr_required = destination_country.strip() in EU_COUNTRIES
        crop_year_match = crop_year.replace(" representative", "")

        if not lot:
            return {
                "lot_id": lot_id,
                "confirmed": False,
                "reason_if_not": f"Lot {lot_id} not found.",
                "stock_after_sample_bags": 0,
                "substitute_suggestion": self.find_substitute(
                    excluded_lot_id=lot_id,
                    region=None,
                    process=None,
                    target_score=None,
                    crop_year=crop_year_match,
                ),
            }

        if lot.status != "active":
            return self._rejection_dict(
                lot,
                lot_id,
                f"Lot status is '{lot.status}' (must be 'active').",
                crop_year_match,
                eudr_required,
            )

        if (lot.stock_bags_remaining or 0) <= 0:
            return self._rejection_dict(
                lot, lot_id, "Stock depleted.", crop_year_match, eudr_required
            )

        if (lot.crop_year or "") != crop_year_match:
            return self._rejection_dict(
                lot,
                lot_id,
                f"Crop year mismatch: lot={lot.crop_year}, request={crop_year_match}",
                crop_year_match,
                eudr_required,
            )

        if eudr_required and (lot.eudr_data_status or "") != "complete":
            return self._rejection_dict(
                lot,
                lot_id,
                f"EUDR data is '{lot.eudr_data_status}' — required for EU destination ({buyer_company})",
                crop_year_match,
                eudr_required,
            )

        # All checks passed — confirm and reserve
        sample_grams = SAMPLE_QUANTITIES_GRAMS[sample_type]
        bag_size_kg = lot.bag_size_kg or DEFAULT_BAG_SIZE_KG
        sample_bags = sample_grams / (bag_size_kg * 1000)
        stock_after = max(0, (lot.stock_bags_remaining or 0) - sample_bags)

        reservation_id = self.reserve_lot(
            lot_id=lot_id,
            lead_id=lead_id,
            sample_type=sample_type,
            buyer_company=buyer_company,
            crop_year=crop_year,
        )
        res = self.session.get(LotReservation, reservation_id)

        log.info(f"Confirmed lot {lot_id} for lead {lead_id} ({sample_type})")
        return {
            "lot_id": lot_id,
            "confirmed": True,
            "reason_if_not": "",
            "stock_after_sample_bags": round(stock_after, 4),
            "reservation_id": reservation_id,
            "reserved_until": res.reserved_until_ts if res else None,
        }

    def _rejection_dict(
        self, lot: Lot, lot_id: str, reason: str, crop_year: str, eudr_required: bool
    ) -> dict[str, Any]:
        """Build a rejection dict with substitute suggestion."""
        return {
            "lot_id": lot_id,
            "confirmed": False,
            "reason_if_not": reason,
            "stock_after_sample_bags": lot.stock_bags_remaining or 0,
            "substitute_suggestion": self.find_substitute(
                excluded_lot_id=lot_id,
                region=lot.region,
                process=lot.process,
                target_score=lot.cupping_score,
                crop_year=crop_year,
                eudr_required=eudr_required,
            ),
        }

    def find_substitute(
        self,
        excluded_lot_id: str,
        region: str | None,
        process: str | None,
        target_score: float | None,
        crop_year: str,
        eudr_required: bool = False,
    ) -> dict[str, Any] | None:
        """Find the next-best substitute lot (same region + process + score ±1.0)."""
        crop_year_match = crop_year.replace(" representative", "")
        stmt = select(Lot).where(
            Lot.lot_id != excluded_lot_id,
            Lot.status == "active",
            Lot.crop_year == crop_year_match,
            Lot.stock_bags_remaining > 0,
        )
        if region:
            stmt = stmt.where(Lot.region == region)
        if process:
            stmt = stmt.where(Lot.process == process)
        if eudr_required:
            stmt = stmt.where(Lot.eudr_data_status == "complete")

        lots = self.session.execute(stmt).scalars().all()
        candidates: list[tuple[Lot, float, int]] = []
        for lot in lots:
            score = lot.cupping_score or 0
            if target_score is not None and abs(score - target_score) > 1.0:
                continue
            candidates.append((lot, score, lot.stock_bags_remaining or 0))

        if not candidates:
            return None

        candidates.sort(key=lambda x: (abs(x[1] - (target_score or 0)), -x[2]))
        best = candidates[0][0]
        return {
            "lot_id": best.lot_id,
            "region": best.region,
            "washing_station_name": best.washing_station_name,
            "process": best.process,
            "screen_size": best.screen_size,
            "cupping_score": best.cupping_score,
            "stock_bags_remaining": best.stock_bags_remaining,
            "eudr_data_status": best.eudr_data_status,
            "reason": (
                f"Substitute for {excluded_lot_id}: same region ({region}), "
                f"same process ({process}), score {best.cupping_score} "
                f"(target was {target_score})"
            ),
        }

    def flag_lot_for_qa(self, lot_id: str, reason: str, auto: bool = False) -> bool:
        """Flag a lot for QA review (status → hold)."""
        lot = self.session.get(Lot, lot_id)
        if not lot:
            raise NotFoundError(f"lot_id '{lot_id}' not found")

        now = now_addis_iso_str()
        lot.status = "hold"
        lot.last_updated_ts = now
        lot.updated_ts = now

        qa_id = f"QA-{now_addis().strftime('%Y%m%d%H%M%S')}-{lot_id}"
        self.session.add(
            QAFlag(
                qa_flag_id=qa_id,
                lot_id=lot_id,
                auto=1 if auto else 0,
                reason=reason,
                flagged_ts=now,
            )
        )
        self._commit()
        log.info(f"Lot {lot_id} flagged for QA ({'auto' if auto else 'manual'}): {reason}")
        return True

    def release_lot_from_qa(self, lot_id: str) -> bool:
        """Release a lot from hold → active."""
        lot = self.session.get(Lot, lot_id)
        if not lot:
            raise NotFoundError(f"lot_id '{lot_id}' not found")
        if lot.status != "hold":
            return False
        now = now_addis_iso_str()
        lot.status = "active"
        lot.last_updated_ts = now
        lot.updated_ts = now

        # Resolve open QA flags
        open_flags = (
            self.session.execute(
                select(QAFlag).where(QAFlag.lot_id == lot_id, QAFlag.resolved_ts.is_(None))
            )
            .scalars()
            .all()
        )
        for flag in open_flags:
            flag.resolved_ts = now
            flag.resolved_by = "operator"

        self._commit()
        log.info(f"Lot {lot_id} released from QA hold")
        return True

    def log_feedback(
        self,
        lot_id: str,
        buyer_company: str,
        buyer_segment: str,
        rejection_reason: str,
        sample_request_id: str | None = None,
    ) -> dict[str, Any]:
        """Log rejection feedback. Auto-flags QA on ≥2 critical keywords."""
        now = now_addis()
        feedback_id = f"FB-{now.strftime('%Y%m%d%H%M%S')}-{now.microsecond:06d}-{lot_id}"
        now_iso = now.isoformat(timespec="seconds")

        self.session.add(
            LotFeedback(
                feedback_id=feedback_id,
                lot_id=lot_id,
                buyer_company=buyer_company,
                buyer_segment=buyer_segment,
                rejection_reason=rejection_reason,
                logged_ts=now_iso,
                qa_auto_flagged=0,
                sample_request_id=sample_request_id,
            )
        )
        self._commit()

        # Check for ≥2 rejections with same critical keyword
        all_feedback = (
            self.session.execute(
                select(LotFeedback)
                .where(LotFeedback.lot_id == lot_id)
                .order_by(LotFeedback.logged_ts.asc())
            )
            .scalars()
            .all()
        )

        reason_lower = rejection_reason.lower()
        matched_kw: str | None = None
        for fb in all_feedback[:-1]:
            old_reason = (fb.rejection_reason or "").lower()
            for kw in CRITICAL_KEYWORDS:
                if kw in reason_lower and kw in old_reason:
                    matched_kw = kw
                    break
            if matched_kw:
                break

        qa_flagged = False
        if matched_kw and len(all_feedback) >= 2:
            self.flag_lot_for_qa(
                lot_id,
                reason=f"≥2 rejections with critical keyword '{matched_kw}'",
                auto=True,
            )
            # Update the feedback row
            fb_row = self.session.get(LotFeedback, feedback_id)
            if fb_row:
                fb_row.qa_auto_flagged = 1
            self._commit()
            qa_flagged = True

        return {
            "feedback_id": feedback_id,
            "lot_id": lot_id,
            "qa_auto_flagged": qa_flagged,
            "logged_ts": now_iso,
        }

    # =============================================================
    # SAMPLE BUDGET (atomic, auto-resetting)
    # =============================================================

    def get_sample_budget(self, week_start: str | None = None) -> dict[str, Any]:
        """Return the sample budget for the given week (default: current)."""
        if week_start is None:
            week_start = _week_start()
        budget = self.session.get(SampleBudget, week_start)
        if not budget:
            week_end = _week_end(week_start)
            now = now_addis_iso_str()
            budget = SampleBudget(
                week_start=week_start,
                week_end=week_end,
                full_sets_used=0,
                fallback_150g_used=0,
                type_b_used=0,
                type_c_used=0,
                last_updated_ts=now,
                last_updated_by="system",
            )
            self.session.add(budget)
            self._commit()
            log.info(f"Created sample budget for week {week_start}")

        return {c.name: getattr(budget, c.name) for c in budget.__table__.columns}

    def consume_sample_budget(self, sample_type: str, lead_id: str) -> bool:
        """
        Atomically consume one unit of sample budget.
        Auto-resets on Monday 00:01 Addis time.
        Returns True if budget available, False if exhausted.
        """
        if sample_type not in SAMPLE_QUANTITIES_GRAMS:
            raise ValidationFailedError(
                f"sample_type '{sample_type}' not in {sorted(SAMPLE_QUANTITIES_GRAMS)}"
            )

        caps = _get_budget_caps()
        cap = caps.get(sample_type, -1)
        if cap == -1:
            return True  # no cap (Type C)

        budget = self.get_sample_budget()
        week_start = budget["week_start"]

        column_map = {"350g": "full_sets_used", "150g": "fallback_150g_used", "200g": "type_b_used"}
        column = column_map.get(sample_type)
        if not column:
            return False

        current = budget.get(column, 0)
        if current >= cap:
            return False

        # Atomic increment with cap check (race-condition safe)
        now = now_addis_iso_str()
        result = self.session.execute(
            update(SampleBudget)
            .where(
                SampleBudget.week_start == week_start,
                getattr(SampleBudget, column) < cap,
            )
            .values(
                **{
                    column: getattr(SampleBudget, column) + 1,
                    "last_updated_ts": now,
                    "last_updated_by": f"lead:{lead_id}",
                }
            )
        )
        self._commit()
        return result.rowcount > 0

    def add_to_waitlist(self, lead_id: str, tier: str, sample_type: str = "350g") -> bool:
        """Add a lead to the sample waitlist."""
        self.session.add(
            SampleWaitlist(
                lead_id=lead_id,
                tier=tier,
                sample_type=sample_type,
                queued_ts=now_addis_iso_str(),
            )
        )
        self._commit()
        return True

    def get_waitlist(self, fulfilled: bool = False) -> list[dict[str, Any]]:
        """Return waitlist entries (default: unfulfilled only)."""
        stmt = select(SampleWaitlist).order_by(SampleWaitlist.queued_ts.asc())
        if not fulfilled:
            stmt = stmt.where(SampleWaitlist.fulfilled_ts.is_(None))
        rows = self.session.execute(stmt).scalars().all()
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def process_waitlist(self) -> list[str]:
        """Process waitlist in tier order (S → A → B → C). Returns fulfilled lead_ids."""
        tier_order = {"S": 0, "A": 1, "B": 2, "C": 3}
        waitlist = self.get_waitlist(fulfilled=False)
        waitlist.sort(key=lambda x: (tier_order.get(x.get("tier", ""), 99), x["queued_ts"]))

        fulfilled: list[str] = []
        for entry in waitlist:
            if self.consume_sample_budget(entry["sample_type"], entry["lead_id"]):
                waitlist_entry = self.session.get(SampleWaitlist, entry["id"])
                if waitlist_entry:
                    waitlist_entry.fulfilled_ts = now_addis_iso_str()
                    self._commit()
                fulfilled.append(entry["lead_id"])
        return fulfilled

    # =============================================================
    # KPI / DASHBOARD
    # =============================================================

    def get_kpi_snapshot(self) -> dict[str, Any]:
        """Return a full KPI snapshot for the daily dashboard."""
        from sqlalchemy import func

        # Lead states
        state_rows = self.session.execute(
            select(Lead.current_state, func.count()).group_by(Lead.current_state)
        ).all()
        states = {r[0]: r[1] for r in state_rows}
        total_leads = sum(states.values())

        # Lot stats
        lot_status_rows = self.session.execute(
            select(Lot.status, func.count()).group_by(Lot.status)
        ).all()
        lot_status = {r[0]: r[1] for r in lot_status_rows}

        eudr_rows = self.session.execute(
            select(Lot.eudr_data_status, func.count())
            .where(Lot.status == "active")
            .group_by(Lot.eudr_data_status)
        ).all()
        eudr_counts = {r[0]: r[1] for r in eudr_rows}

        region_rows = self.session.execute(
            select(Lot.region, func.count())
            .where(Lot.status == "active")
            .group_by(Lot.region)
            .order_by(func.count().desc())
        ).all()
        regions = {r[0]: r[1] for r in region_rows}

        total_stock = (
            self.session.execute(
                select(func.sum(Lot.stock_bags_remaining)).where(Lot.status.in_(["active", "hold"]))
            ).scalar()
            or 0
        )

        # Reservations
        active_reservations = len(self.get_active_reservations())

        # Feedback
        feedback_count = (
            self.session.execute(select(func.count(LotFeedback.feedback_id))).scalar() or 0
        )
        multi_rej_rows = self.session.execute(
            select(LotFeedback.lot_id, func.count())
            .group_by(LotFeedback.lot_id)
            .having(func.count() >= 2)
            .order_by(func.count().desc())
        ).all()
        multi_rej = [{"lot_id": r[0], "n": r[1]} for r in multi_rej_rows]

        # Budget + waitlist
        budget = self.get_sample_budget()
        waitlist_count = (
            self.session.execute(
                select(func.count(SampleWaitlist.id)).where(SampleWaitlist.fulfilled_ts.is_(None))
            ).scalar()
            or 0
        )

        return {
            "generated_ts": now_addis_iso_str(),
            "leads": {
                "total": total_leads,
                "by_state": states,
                "blocked_count": states.get("BLOCKED", 0),
            },
            "lots": {
                "total": sum(lot_status.values()),
                "by_status": lot_status,
                "eudr_completeness": eudr_counts,
                "regional_distribution": regions,
                "total_stock_bags": total_stock,
            },
            "samples": {
                "active_reservations": active_reservations,
                "budget": budget,
                "waitlist_depth": waitlist_count,
            },
            "feedback": {
                "total_logged": feedback_count,
                "multi_rejection_lots": multi_rej,
            },
        }

    # =============================================================
    # OUTREACH TOUCH LOGGING (for Agent 3)
    # =============================================================

    def log_outreach_touch(
        self,
        lead_id: str,
        step_number: int,
        channel: str,
        direction: str = "outbound",
        subject: str = "",
        content_summary: str = "",
        response_type: str | None = None,
        response_content: str | None = None,
        template_id: str | None = None,
        contact_id: str | None = None,
    ) -> int:
        """
        Log an outreach touch to the outreach_touches table.

        Used by Agent 3 to record every LinkedIn message, email, or
        phone call — both outbound (sent by Agent 3) and inbound
        (buyer replies).

        Returns the touch ID.
        """
        from coffee_export.database.models import OutreachTouch

        now = now_addis_iso_str()
        touch = OutreachTouch(
            lead_id=lead_id,
            template_id=template_id,
            step_number=step_number,
            channel=channel,
            direction=direction,
            contact_id=contact_id,
            subject=subject,
            content_summary=content_summary,
            sent_ts=now if direction == "outbound" else None,
            response_ts=now if direction == "inbound" else None,
            response_content=response_content,
            response_type=response_type,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(touch)
        self.session.flush()
        touch_id = touch.id
        self._commit()
        return touch_id

    def get_outreach_touches(
        self,
        lead_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Retrieve outreach touches for a lead (newest first).

        Used by Agent 3 to build conversation context for message drafting.
        """
        from coffee_export.database.models import OutreachTouch

        rows = (
            self.session.execute(
                select(OutreachTouch)
                .where(OutreachTouch.lead_id == lead_id)
                .order_by(OutreachTouch.id.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )
        return [
            {
                "id": r.id,
                "step_number": r.step_number,
                "channel": r.channel,
                "direction": r.direction,
                "subject": r.subject,
                "content_summary": r.content_summary,
                "sent_ts": r.sent_ts,
                "response_ts": r.response_ts,
                "response_content": r.response_content,
                "response_type": r.response_type,
            }
            for r in reversed(rows)  # oldest first for conversation reading
        ]

    def get_outreach_stats(self) -> dict[str, Any]:
        """
        Get outreach statistics for the dashboard.

        Returns total touches, response rate, leads by state.
        """
        from sqlalchemy import func

        from coffee_export.database.models import OutreachTouch

        total_touches = self.session.execute(select(func.count(OutreachTouch.id))).scalar() or 0

        channel_rows = self.session.execute(
            select(OutreachTouch.channel, func.count()).group_by(OutreachTouch.channel)
        ).all()
        by_channel = {r[0]: r[1] for r in channel_rows}

        total_outbound = (
            self.session.execute(
                select(func.count(OutreachTouch.id)).where(OutreachTouch.direction == "outbound")
            ).scalar()
            or 0
        )
        total_responses = (
            self.session.execute(
                select(func.count(OutreachTouch.id)).where(OutreachTouch.direction == "inbound")
            ).scalar()
            or 0
        )
        response_rate = (total_responses / total_outbound * 100) if total_outbound > 0 else 0

        leads_in_sequence = self.list_leads(state="IN_SEQUENCE", agent="Agent 3")
        leads_qualified = self.list_leads(state="QUALIFIED")
        leads_ghosted = self.list_leads(state="GHOSTED")
        leads_nurtured = self.list_leads(state="NURTURE")

        return {
            "total_touches": total_touches,
            "by_channel": by_channel,
            "total_outbound": total_outbound,
            "total_responses": total_responses,
            "response_rate": round(response_rate, 1),
            "leads_in_sequence": len(leads_in_sequence),
            "leads_qualified": len(leads_qualified),
            "leads_ghosted": len(leads_ghosted),
            "leads_nurtured": len(leads_nurtured),
        }

    # =============================================================
    # QUALIFICATION ANSWERS (for Agent 3)
    # =============================================================

    def store_qual_answer(
        self,
        lead_id: str,
        question: str,
        answer: str,
        is_positive: bool,
        answered_by: str = "Agent 3",
    ) -> int:
        """
        Store a QUAL gate answer (Q1-Q5) in the qualification_answers table.

        Returns the answer ID.
        """
        from coffee_export.database.models import QualificationAnswer

        now = now_addis_iso_str()
        qa = QualificationAnswer(
            lead_id=lead_id,
            question=question,
            answer=answer[:500],
            answer_detail=answer,
            answered_ts=now,
            answered_by=answered_by,
            is_positive=1 if is_positive else 0,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(qa)
        self.session.flush()
        answer_id = qa.id
        self._commit()
        return answer_id

    def get_qual_answers(self, lead_id: str) -> dict[str, dict[str, Any]]:
        """
        Get the latest QUAL answer for each question (Q1-Q5).

        Returns dict: {"Q1": {"answer": "...", "is_positive": True}, ...}
        """
        from coffee_export.database.models import QualificationAnswer

        rows = (
            self.session.execute(
                select(QualificationAnswer)
                .where(QualificationAnswer.lead_id == lead_id)
                .order_by(QualificationAnswer.answered_ts.desc())
            )
            .scalars()
            .all()
        )

        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            if row.question not in latest:
                latest[row.question] = {
                    "answer": row.answer,
                    "is_positive": bool(row.is_positive),
                    "answered_ts": row.answered_ts,
                }
        return latest

    def check_qual_gate(self, lead_id: str) -> dict[str, Any]:
        """
        Check if all 5 QUAL questions are answered positively.

        Returns:
            {
                "all_passed": bool,
                "questions_answered": int,
                "total_questions": 5,
                "answers": {"Q1": "...", ...},
                "positive": {"Q1": True, ...},
                "summary": "5/5 answered, 5 positive",
            }
        """
        qual_questions = ("Q1", "Q2", "Q3", "Q4", "Q5")
        latest = self.get_qual_answers(lead_id)

        answered_positive: dict[str, bool] = {}
        answer_texts: dict[str, str] = {}

        for qid in qual_questions:
            ans = latest.get(qid)
            if ans:
                answered_positive[qid] = ans["is_positive"]
                answer_texts[qid] = ans["answer"]
            else:
                answered_positive[qid] = False
                answer_texts[qid] = ""

        all_passed = all(answered_positive.values())
        questions_answered = sum(1 for v in answer_texts.values() if v)

        return {
            "all_passed": all_passed,
            "questions_answered": questions_answered,
            "total_questions": len(qual_questions),
            "answers": answer_texts,
            "positive": answered_positive,
            "summary": f"{questions_answered}/{len(qual_questions)} answered, "
            f"{sum(answered_positive.values())} positive",
        }

    # =============================================================
    # STOCK FRESHNESS (for Agent 1)
    # =============================================================

    def get_stock_freshness(self, max_age_hours: int = 24) -> dict[str, Any]:
        """
        Check for lots with stale last_updated_ts.

        Used by Agent 1 for maintenance — finds lots not updated in >N hours.
        """
        now = now_addis()
        cutoff = (now - timedelta(hours=max_age_hours)).isoformat()

        rows = (
            self.session.execute(
                select(Lot)
                .where(Lot.status == "active", Lot.last_updated_ts < cutoff)
                .order_by(Lot.last_updated_ts.asc())
            )
            .scalars()
            .all()
        )

        return {
            "max_age_hours": max_age_hours,
            "stale_count": len(rows),
            "stale_lots": [
                {
                    "lot_id": lot.lot_id,
                    "region": lot.region,
                    "last_updated_ts": lot.last_updated_ts,
                }
                for lot in rows
            ],
        }

    # =============================================================
    # CONVERSATION MEMORY (for Agent 3 — AI memory)
    # =============================================================

    def store_memory(
        self,
        lead_id: str,
        memory_type: str,
        content: str,
        source: str = "Agent 3",
        importance: int = 5,
    ) -> int:
        """
        Store a conversation memory for a lead.

        Memory types:
          - "conversation_summary": summary of a touch exchange
          - "buyer_preference": what the buyer likes/dislikes
          - "objection": a concern or objection raised
          - "qualification_signal": a QUAL-relevant signal
          - "context": general context about the relationship
          - "next_step": what to do next with this lead

        The memory system lets Agent 3 remember conversations across
        touches rather than responding to each message in isolation.

        Returns the memory ID.
        """
        from coffee_export.database.models import ConversationMemory

        now = now_addis_iso_str()
        memory = ConversationMemory(
            lead_id=lead_id,
            memory_type=memory_type,
            content=content,
            source=source,
            importance=importance,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(memory)
        self.session.flush()
        memory_id = memory.id
        self._commit()
        return memory_id

    def get_memories(
        self,
        lead_id: str,
        memory_type: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Retrieve conversation memories for a lead.

        Memories are ordered by importance (descending), then by recency.
        Can filter by memory_type if specified.

        Used by Agent 3 to build context before drafting a message.
        """
        from coffee_export.database.models import ConversationMemory

        stmt = (
            select(ConversationMemory)
            .where(ConversationMemory.lead_id == lead_id)
            .order_by(
                ConversationMemory.importance.desc(),
                ConversationMemory.created_ts.desc(),
            )
            .limit(limit)
        )
        if memory_type:
            stmt = stmt.where(ConversationMemory.memory_type == memory_type)

        rows = self.session.execute(stmt).scalars().all()
        return [
            {
                "id": r.id,
                "memory_type": r.memory_type,
                "content": r.content,
                "source": r.source,
                "importance": r.importance,
                "created_ts": r.created_ts,
            }
            for r in rows
        ]

    def get_conversation_context(
        self,
        lead_id: str,
        max_memories: int = 10,
        max_touches: int = 10,
    ) -> dict[str, Any]:
        """
        Build a full conversation context for a lead.

        Combines:
          - Lead details (company, VP, tier, state, sequence_step)
          - Conversation memories (importance-ordered)
          - Recent outreach touches (chronological)
          - QUAL gate status

        This is what Agent 3 uses to draft messages that reference
        past conversations rather than treating each message in isolation.

        Returns a dict ready for message drafting.
        """
        lead = self.get_lead(lead_id)
        if not lead:
            return {"error": "lead not found"}

        memories = self.get_memories(lead_id, limit=max_memories)
        touches = self.get_outreach_touches(lead_id, limit=max_touches)
        qual_status = self.check_qual_gate(lead_id)

        return {
            "lead": lead,
            "memories": memories,
            "touches": touches,
            "qual_status": qual_status,
            "memory_count": len(memories),
            "touch_count": len(touches),
        }

    def update_memory(self, memory_id: int, content: str, importance: int | None = None) -> bool:
        """Update an existing memory's content and/or importance."""
        from coffee_export.database.models import ConversationMemory

        memory = self.session.get(ConversationMemory, memory_id)
        if not memory:
            return False
        memory.content = content
        if importance is not None:
            memory.importance = importance
        memory.updated_ts = now_addis_iso_str()
        self._commit()
        return True

    def forget_memory(self, memory_id: int) -> bool:
        """Delete a memory (soft delete by setting importance to 0)."""
        from coffee_export.database.models import ConversationMemory

        memory = self.session.get(ConversationMemory, memory_id)
        if not memory:
            return False
        memory.importance = 0
        memory.updated_ts = now_addis_iso_str()
        self._commit()
        return True

    # =============================================================
    # STRUCTURED BUYER PROFILE (AI Memory — preferences, budget, avoidance)
    # =============================================================

    def set_buyer_preference(
        self,
        lead_id: str,
        preference_key: str,
        preference_value: str,
        source: str = "Agent 3",
    ) -> int:
        """
        Store a structured buyer preference as a memory.

        Preference keys:
          - "preferred_origin"     — e.g. "Yirgacheffe", "Guji"
          - "preferred_process"    — e.g. "Washed", "Natural"
          - "interested_in"        — e.g. "Natural Process, microlots"
          - "budget_fob"           — e.g. "$6.40 FOB"
          - "avoid"                — e.g. "High-acidity coffees"
          - "volume_band"          — e.g. "5 FCL/year"
          - "shipment_preference"  — e.g. "FOB Djibouti"
          - "contact_preference"   — e.g. "email only", "LinkedIn"
          - "crop_cycle"           — e.g. "Q4 delivery", "October shipment"

        Returns the memory ID.
        """
        return self.store_memory(
            lead_id=lead_id,
            memory_type="buyer_preference",
            content=f"{preference_key}: {preference_value}",
            source=source,
            importance=8,  # preferences are high-importance
        )

    def get_buyer_preferences(self, lead_id: str) -> dict[str, str]:
        """
        Get all structured buyer preferences for a lead.

        Returns dict: {"preferred_origin": "Yirgacheffe", "budget_fob": "$6.40 FOB", ...}
        """
        memories = self.get_memories(lead_id, memory_type="buyer_preference", limit=50)
        preferences: dict[str, str] = {}
        for mem in memories:
            content = mem.get("content", "")
            if ": " in content:
                key, value = content.split(": ", 1)
                preferences[key] = value
        return preferences

    def get_buyer_profile(self, lead_id: str) -> dict[str, Any]:
        """
        Get a complete buyer profile combining lead data + preferences + memories.

        Returns:
        {
            "lead": {company_name, country, vp, tier, ...},
            "preferences": {"preferred_origin": "Yirgacheffe", "budget_fob": "$6.40", ...},
            "objections": ["Price too high", ...],
            "qualification_signals": ["Q1 signal detected: ...", ...],
            "conversation_summaries": ["Step 1: ...", ...],
            "next_steps": ["Follow up in 2 weeks", ...],
        }
        """
        lead = self.get_lead(lead_id)
        if not lead:
            return {"error": "lead not found"}

        preferences = self.get_buyer_preferences(lead_id)
        objections = [
            m["content"] for m in self.get_memories(lead_id, memory_type="objection", limit=10)
        ]
        qual_signals = [
            m["content"]
            for m in self.get_memories(lead_id, memory_type="qualification_signal", limit=10)
        ]
        summaries = [
            m["content"]
            for m in self.get_memories(lead_id, memory_type="conversation_summary", limit=10)
        ]
        next_steps = [
            m["content"] for m in self.get_memories(lead_id, memory_type="next_step", limit=5)
        ]

        return {
            "lead": {
                "lead_id": lead.get("lead_id"),
                "company_name": lead.get("company_name"),
                "country": lead.get("headquarters_country"),
                "vp": lead.get("recommended_vp"),
                "tier": lead.get("priority_tier"),
                "state": lead.get("current_state"),
                "language": lead.get("outreach_language"),
            },
            "preferences": preferences,
            "objections": objections,
            "qualification_signals": qual_signals,
            "conversation_summaries": summaries,
            "next_steps": next_steps,
        }

    # =============================================================
    # SAMPLE MANAGEMENT (for Agent 4)
    # =============================================================

    def create_sample_request(
        self,
        lead_id: str,
        sample_type: str,
        crop_year: str,
        buyer_company: str,
        buyer_attention_name: str = "",
        buyer_shipping_address: str = "",
        buyer_destination_country: str = "",
        buyer_language: str = "EN",
        shipping_arrangement: str = "pre_paid",
    ) -> str:
        """
        Create a sample request record. Returns sample_request_id.

        The sample request is the dispatch record that tracks the full
        sample lifecycle: draft → approved → dispatched → delivered →
        feedback_due → decided.
        """
        from coffee_export.database.models import SampleRequest

        # Generate ID: SR-YYYY-NNNN
        year = now_addis().year
        prefix = f"SR-{year}-"
        last = self.session.execute(
            select(SampleRequest)
            .where(SampleRequest.sample_request_id.like(f"{prefix}%"))
            .order_by(SampleRequest.sample_request_id.desc())
            .limit(1)
        ).scalar_one_or_none()
        next_num = 1
        if last and last.sample_request_id:
            with contextlib.suppress(ValueError):
                next_num = int(last.sample_request_id[len(prefix) :]) + 1
        sample_request_id = f"{prefix}{next_num:04d}"

        now = now_addis_iso_str()
        sr = SampleRequest(
            sample_request_id=sample_request_id,
            lead_id=lead_id,
            sample_type=sample_type,
            crop_year=crop_year,
            buyer_company=buyer_company,
            buyer_attention_name=buyer_attention_name,
            buyer_shipping_address=buyer_shipping_address,
            buyer_destination_country=buyer_destination_country,
            buyer_language=buyer_language,
            shipping_arrangement=shipping_arrangement,
            status="draft",
            substitute_round=0,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(sr)
        self._commit()
        log.info(f"Created sample request {sample_request_id} for lead {lead_id}")
        return sample_request_id

    def add_lot_to_sample_request(
        self,
        sample_request_id: str,
        lot_id: str,
        quantity_grams: int,
        confirmed: bool = False,
        substitute_for_lot_id: str | None = None,
    ) -> int:
        """Add a lot to a sample request. Returns the junction table ID."""
        from coffee_export.database.models import SampleRequestLot

        srl = SampleRequestLot(
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            quantity_grams=quantity_grams,
            confirmed=1 if confirmed else 0,
            substitute_for_lot_id=substitute_for_lot_id,
        )
        self.session.add(srl)
        self.session.flush()
        srl_id = srl.id
        self._commit()
        return srl_id

    def get_sample_request(self, sample_request_id: str) -> dict[str, Any] | None:
        """Return a sample request as dict, or None."""
        sr = self.samples_repo.get_sample_request(sample_request_id)
        if not sr:
            return None
        result = {c.name: getattr(sr, c.name) for c in sr.__table__.columns}
        # Include lots
        result["lots"] = [
            {
                "lot_id": srl.lot_id,
                "quantity_grams": srl.quantity_grams,
                "confirmed": bool(srl.confirmed),
            }
            for srl in sr.lots
        ]
        return result

    def update_sample_request_status(
        self,
        sample_request_id: str,
        status: str,
        **extra_fields,
    ) -> bool:
        """
        Update a sample request's status.

        Status flow: draft → approved → dispatched → delivered →
        feedback_due → decided (or ghosted/cancelled)
        """
        from coffee_export.database.models import SampleRequest

        sr = self.session.get(SampleRequest, sample_request_id)
        if not sr:
            raise NotFoundError(f"sample_request_id '{sample_request_id}' not found")

        sr.status = status
        now = now_addis_iso_str()

        # Set timestamp fields based on status
        if status == "dispatched" and not sr.dispatched_ts:
            sr.dispatched_ts = now
        elif status == "delivered" and not sr.delivered_ts:
            sr.delivered_ts = now
        elif status == "feedback_due" and not sr.feedback_due_ts:
            sr.feedback_due_ts = now
        elif status == "decided" and not sr.decided_ts:
            sr.decided_ts = now
        elif status == "ghosted" and not sr.ghosted_ts:
            sr.ghosted_ts = now

        # Apply extra fields
        for field, value in extra_fields.items():
            if hasattr(sr, field):
                setattr(sr, field, value)

        sr.updated_ts = now
        self._commit()
        return True

    def record_sample_shipment(
        self,
        sample_request_id: str,
        carrier: str,
        tracking_number: str,
        carrier_account: str = "",
        estimated_arrival_ts: str = "",
    ) -> str:
        """
        Record a sample shipment (carrier tracking info).
        Returns shipment_id.
        """
        from coffee_export.database.models import SampleShipment

        now = now_addis()
        year = now.year
        prefix = f"SSH-{year}-"
        last = self.session.execute(
            select(SampleShipment)
            .where(SampleShipment.shipment_id.like(f"{prefix}%"))
            .order_by(SampleShipment.shipment_id.desc())
            .limit(1)
        ).scalar_one_or_none()
        next_num = 1
        if last and last.shipment_id:
            with contextlib.suppress(ValueError):
                next_num = int(last.shipment_id[len(prefix) :]) + 1
        shipment_id = f"{prefix}{next_num:04d}"

        now_iso = now.isoformat(timespec="seconds")
        sh = SampleShipment(
            shipment_id=shipment_id,
            sample_request_id=sample_request_id,
            carrier=carrier,
            tracking_number=tracking_number,
            carrier_account=carrier_account,
            pickup_ts=now_iso,
            estimated_arrival_ts=estimated_arrival_ts,
            status="picked_up",
            created_ts=now_iso,
            updated_ts=now_iso,
        )
        self.session.add(sh)
        self._commit()
        return shipment_id

    def update_shipment_status(
        self,
        shipment_id: str,
        status: str,
        delivered_ts: str = "",
    ) -> bool:
        """Update a sample shipment's status (picked_up → in_transit → delivered)."""
        from coffee_export.database.models import SampleShipment

        sh = self.session.get(SampleShipment, shipment_id)
        if not sh:
            raise NotFoundError(f"shipment_id '{shipment_id}' not found")
        sh.status = status
        now = now_addis_iso_str()
        if status == "delivered" and delivered_ts:
            sh.delivered_ts = delivered_ts
        elif status == "delivered":
            sh.delivered_ts = now
        sh.updated_ts = now
        self._commit()
        return True

    def record_cupping_score(
        self,
        sample_request_id: str,
        lot_id: str,
        buyer_company: str,
        total_score: float,
        fragrance_aroma: float | None = None,
        flavor: float | None = None,
        aftertaste: float | None = None,
        acidity: float | None = None,
        body: float | None = None,
        balance: float | None = None,
        uniformity: float | None = None,
        clean_cup: float | None = None,
        sweetness: float | None = None,
        overall: float | None = None,
        defect_count_buyer: int | None = None,
        buyer_notes: str = "",
        our_score: float | None = None,
        cupper_name: str = "",
    ) -> int:
        """
        Record a buyer's cupping score for a lot in a sample request.

        Returns the cupping_score ID.
        """
        from coffee_export.database.models import CuppingScore

        now = now_addis_iso_str()
        score_diff = None
        if our_score is not None:
            score_diff = total_score - our_score

        cs = CuppingScore(
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            buyer_company=buyer_company,
            cupper_name=cupper_name,
            fragrance_aroma=fragrance_aroma,
            flavor=flavor,
            aftertaste=aftertaste,
            acidity=acidity,
            body=body,
            balance=balance,
            uniformity=uniformity,
            clean_cup=clean_cup,
            sweetness=sweetness,
            overall=overall,
            total_score=total_score,
            defect_count_buyer=defect_count_buyer,
            buyer_notes=buyer_notes,
            our_score=our_score,
            score_difference=score_diff,
            cupped_ts=now,
            received_ts=now,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(cs)
        self.session.flush()
        cs_id = cs.id
        self._commit()
        return cs_id

    def get_cupping_scores(self, sample_request_id: str) -> list[dict[str, Any]]:
        """Get all cupping scores for a sample request."""
        from coffee_export.database.models import CuppingScore

        rows = (
            self.session.execute(
                select(CuppingScore)
                .where(CuppingScore.sample_request_id == sample_request_id)
                .order_by(CuppingScore.id.asc())
            )
            .scalars()
            .all()
        )
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def record_sample_decision(
        self,
        sample_request_id: str,
        lot_id: str,
        decision: str,
        buyer_target_fob: float | None = None,
        buyer_target_volume_bags: int | None = None,
        buyer_target_port: str = "",
        buyer_target_shipment_window: str = "",
        buyer_payment_terms: str = "",
        notes: str = "",
    ) -> str:
        """
        Record a sample decision (approved / rejected / needs_another_sample).

        Returns the decision_id.
        """
        from coffee_export.database.models import SampleDecision

        now = now_addis()
        prefix = f"DEC-{now.strftime('%Y%m%d%H%M%S')}-{lot_id}"
        decision_id = prefix

        now_iso = now.isoformat(timespec="seconds")
        sd = SampleDecision(
            decision_id=decision_id,
            sample_request_id=sample_request_id,
            lot_id=lot_id,
            decision=decision,
            buyer_target_fob=buyer_target_fob,
            buyer_target_volume_bags=buyer_target_volume_bags,
            buyer_target_port=buyer_target_port,
            buyer_target_shipment_window=buyer_target_shipment_window,
            buyer_payment_terms=buyer_payment_terms,
            decision_ts=now_iso,
            notes=notes,
            created_ts=now_iso,
            updated_ts=now_iso,
        )
        self.session.add(sd)
        self._commit()
        return decision_id

    def get_sample_decisions(self, sample_request_id: str) -> list[dict[str, Any]]:
        """Get all decisions for a sample request."""
        from coffee_export.database.models import SampleDecision

        rows = (
            self.session.execute(
                select(SampleDecision)
                .where(SampleDecision.sample_request_id == sample_request_id)
                .order_by(SampleDecision.id.asc())
            )
            .scalars()
            .all()
        )
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def recommend_lots_for_lead(
        self,
        lead_id: str,
        region: str | None = None,
        process: str | None = None,
        min_score: float = 80.0,
        crop_year: str = "25/26",
        eudr_required: bool = False,
        max_results: int = 3,
    ) -> list[dict[str, Any]]:
        """
        Recommend lots that fit a lead's target profile.

        9-step filter algorithm:
          1. Crop year filter (hard)
          2. Region match (hard if specified)
          3. Process match (hard if specified)
          4. Screen size (soft, ±2)
          5. Cupping score band (soft, by VP)
          6. Certification match (soft)
          7. Stock availability (hard, ≥10 bags)
          8. EUDR data status (hard for EU buyers)
          9. Rank by score, harvest date, stock

        Returns top N lots as dicts.
        """
        from coffee_export.database.models import Lot

        stmt = select(Lot).where(
            Lot.status == "active",
            Lot.crop_year == crop_year,
            Lot.stock_bags_remaining > 0,
            Lot.cupping_score >= min_score,
        )
        if region:
            stmt = stmt.where(Lot.region == region)
        if process:
            stmt = stmt.where(Lot.process == process)
        if eudr_required:
            stmt = stmt.where(Lot.eudr_data_status == "complete")

        lots = self.session.execute(stmt).scalars().all()

        # Rank by cupping score (desc), then stock (desc)
        lots_sorted = sorted(
            lots,
            key=lambda lot: (-(lot.cupping_score or 0), -(lot.stock_bags_remaining or 0)),
        )

        return [
            {
                "lot_id": lot.lot_id,
                "region": lot.region,
                "washing_station_name": lot.washing_station_name,
                "process": lot.process,
                "screen_size": lot.screen_size,
                "cupping_score": lot.cupping_score,
                "stock_bags_remaining": lot.stock_bags_remaining,
                "eudr_data_status": lot.eudr_data_status,
                "crop_year": lot.crop_year,
            }
            for lot in lots_sorted[:max_results]
        ]

    # =============================================================
    # GLOBAL SEARCH (for dashboard search box)
    # =============================================================

    def global_search(self, query: str, limit: int = 20) -> dict[str, list[dict[str, Any]]]:
        """
        Search across all entity types: leads, lots, sample requests,
        contracts, shipments.

        Returns dict with keys: "leads", "lots", "sample_requests",
        "contracts", "shipments". Each value is a list of matching dicts.
        """
        q = f"%{query.lower()}%"
        results: dict[str, list[dict[str, Any]]] = {
            "leads": [],
            "lots": [],
            "sample_requests": [],
            "contracts": [],
            "shipments": [],
        }

        # Search leads (company name, lead_id, country)
        lead_rows = (
            self.session.execute(
                select(Lead)
                .where(
                    (Lead.company_name.ilike(q))
                    | (Lead.lead_id.ilike(q))
                    | (Lead.headquarters_country.ilike(q))
                )
                .limit(limit)
            )
            .scalars()
            .all()
        )
        results["leads"] = [
            {
                "id": lead.lead_id,
                "label": lead.company_name,
                "subtitle": lead.headquarters_country or "",
                "state": lead.current_state,
                "type": "lead",
            }
            for lead in lead_rows
        ]

        # Search lots (lot_id, region, washing station, coop)
        lot_rows = (
            self.session.execute(
                select(Lot)
                .where(
                    (Lot.lot_id.ilike(q))
                    | (Lot.region.ilike(q))
                    | (Lot.washing_station_name.ilike(q))
                    | (Lot.coop_name.ilike(q))
                )
                .limit(limit)
            )
            .scalars()
            .all()
        )
        results["lots"] = [
            {
                "id": lot.lot_id,
                "label": f"{lot.region} {lot.process} — {lot.washing_station_name}",
                "subtitle": f"Score: {lot.cupping_score} | Stock: {lot.stock_bags_remaining} bags",
                "state": lot.status,
                "type": "lot",
            }
            for lot in lot_rows
        ]

        # Search sample requests
        from coffee_export.database.models import Contract, SampleRequest, Shipment

        sr_rows = (
            self.session.execute(
                select(SampleRequest)
                .where(
                    (SampleRequest.sample_request_id.ilike(q))
                    | (SampleRequest.buyer_company.ilike(q))
                )
                .limit(limit)
            )
            .scalars()
            .all()
        )
        results["sample_requests"] = [
            {
                "id": sr.sample_request_id,
                "label": sr.buyer_company,
                "subtitle": f"Type: {sr.sample_type} | Status: {sr.status}",
                "state": sr.status,
                "type": "sample_request",
            }
            for sr in sr_rows
        ]

        # Search contracts
        contract_rows = (
            self.session.execute(
                select(Contract)
                .where((Contract.contract_id.ilike(q)) | (Contract.contract_number.ilike(q)))
                .limit(limit)
            )
            .scalars()
            .all()
        )
        results["contracts"] = [
            {
                "id": c.contract_id,
                "label": c.contract_number or c.contract_id,
                "subtitle": f"Status: {c.status} | Value: ${c.total_value or 0}",
                "state": c.status,
                "type": "contract",
            }
            for c in contract_rows
        ]

        # Search shipments
        ship_rows = (
            self.session.execute(
                select(Shipment)
                .where(
                    (Shipment.shipment_id.ilike(q))
                    | (Shipment.bill_of_lading_number.ilike(q))
                    | (Shipment.carrier.ilike(q))
                )
                .limit(limit)
            )
            .scalars()
            .all()
        )
        results["shipments"] = [
            {
                "id": s.shipment_id,
                "label": f"{s.carrier or 'Unknown'} — {s.departure_port or '?'} → {s.arrival_port or '?'}",
                "subtitle": f"Status: {s.status} | B/L: {s.bill_of_lading_number or '—'}",
                "state": s.status,
                "type": "shipment",
            }
            for s in ship_rows
        ]

        return results

    # =============================================================
    # NOTIFICATIONS (action items for dashboard)
    # =============================================================

    def get_notifications(self) -> list[dict[str, Any]]:
        """
        Get action items that need operator attention.

        Returns a list of notification dicts, each with:
          - severity: "critical" (red), "warning" (orange), "info" (green/yellow)
          - icon: emoji
          - title: short description
          - detail: longer description
          - entity_type: "lead", "lot", "sample", "contract", "shipment", "budget"
          - entity_id: the ID of the related entity
          - action: suggested action ("review", "release", "approve", etc.)
        """
        notifications: list[dict[str, Any]] = []

        # 1. Blocked leads (critical)
        blocked = self.list_leads(state="BLOCKED", limit=50)
        for lead in blocked:
            notifications.append(
                {
                    "severity": "critical",
                    "icon": "🚫",
                    "title": f"Lead blocked: {lead.get('company_name', '?')}",
                    "detail": f"Lead {lead.get('lead_id')} is in BLOCKED state — needs operator intervention",
                    "entity_type": "lead",
                    "entity_id": lead.get("lead_id"),
                    "action": "unblock",
                }
            )

        # 2. Sample budget exhausted (critical)
        budget = self.get_sample_budget()
        if budget.get("full_sets_used", 0) >= 3:
            notifications.append(
                {
                    "severity": "critical",
                    "icon": "🔴",
                    "title": "Sample budget exhausted (full sets)",
                    "detail": f"Week {budget.get('week_start')}: 3/3 full sample sets used. New samples will be waitlisted.",
                    "entity_type": "budget",
                    "entity_id": budget.get("week_start"),
                    "action": "waitlist_review",
                }
            )

        # 3. Lots on QA hold (warning)
        held_lots = self.list_lots(status="hold")
        for lot in held_lots:
            notifications.append(
                {
                    "severity": "warning",
                    "icon": "⚠️",
                    "title": f"Lot on QA hold: {lot.get('lot_id')}",
                    "detail": f"Lot {lot.get('lot_id')} ({lot.get('region', '?')} {lot.get('process', '?')}) is on QA hold — review and release or reject",
                    "entity_type": "lot",
                    "entity_id": lot.get("lot_id"),
                    "action": "qa_review",
                }
            )

        # 4. Lots with ≥2 rejections (warning)
        snapshot = self.get_kpi_snapshot()
        for lot in snapshot["feedback"]["multi_rejection_lots"]:
            notifications.append(
                {
                    "severity": "warning",
                    "icon": "⚠️",
                    "title": f"Multiple rejections: {lot['lot_id']}",
                    "detail": f"Lot {lot['lot_id']} has {lot['n']} rejection(s) — investigate quality issues",
                    "entity_type": "lot",
                    "entity_id": lot.get("lot_id"),
                    "action": "qa_review",
                }
            )

        # 5. EUDR incomplete for active lots (warning)
        incomplete_eudr = [
            lot
            for lot in self.list_lots(status="active")
            if (lot.get("eudr_data_status") or "") != "complete"
        ]
        for lot in incomplete_eudr[:5]:  # top 5
            notifications.append(
                {
                    "severity": "warning",
                    "icon": "📋",
                    "title": f"EUDR incomplete: {lot.get('lot_id')}",
                    "detail": f"Lot {lot.get('lot_id')} has EUDR status '{lot.get('eudr_data_status')}' — required for EU shipments",
                    "entity_type": "lot",
                    "entity_id": lot.get("lot_id"),
                    "action": "complete_eudr",
                }
            )

        # 6. New qualified leads (info — positive!)
        qualified = self.list_leads(state="QUALIFIED", limit=5)
        for lead in qualified:
            notifications.append(
                {
                    "severity": "info",
                    "icon": "🟢",
                    "title": f"New qualified buyer: {lead.get('company_name', '?')}",
                    "detail": f"Lead {lead.get('lead_id')} passed the QUAL gate — ready for sample dispatch",
                    "entity_type": "lead",
                    "entity_id": lead.get("lead_id"),
                    "action": "dispatch_sample",
                }
            )

        # 7. Leads in SAMPLE_FEEDBACK_DUE (info — reminder)
        feedback_due = self.list_leads(state="SAMPLE_FEEDBACK_DUE", limit=10)
        for lead in feedback_due:
            notifications.append(
                {
                    "severity": "info",
                    "icon": "🟡",
                    "title": f"Sample feedback due: {lead.get('company_name', '?')}",
                    "detail": f"Lead {lead.get('lead_id')} — samples delivered, awaiting buyer cupping feedback",
                    "entity_type": "lead",
                    "entity_id": lead.get("lead_id"),
                    "action": "follow_up",
                }
            )

        # 8. Dead-letter events (critical)
        from coffee_export.events import EventBus

        with EventBus() as bus:
            dead_letters = bus.get_dead_letter_events(limit=5)
        for dl in dead_letters:
            notifications.append(
                {
                    "severity": "critical",
                    "icon": "💀",
                    "title": f"Dead-letter event: {dl.get('event_type', '?')}",
                    "detail": f"Event #{dl.get('id')} failed after 3 retries: {dl.get('error_message', '')[:100]}",
                    "entity_type": "event",
                    "entity_id": str(dl.get("id")),
                    "action": "requeue_or_investigate",
                }
            )

        # Sort by severity: critical → warning → info
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        notifications.sort(key=lambda n: severity_order.get(n["severity"], 99))

        return notifications

    # =============================================================
    # AGENT CONTROL (for dashboard agent controls)
    # =============================================================

    def get_agent_status(self, agent_id: str) -> dict[str, Any]:
        """Get an agent's status from the agents table."""
        from coffee_export.database.models import Agent

        agent = self.session.get(Agent, agent_id)
        if not agent:
            return {"agent_id": agent_id, "status": "not_found", "name": agent_id}
        return {
            "agent_id": agent.agent_id,
            "name": agent.name,
            "description": agent.description,
            "status": agent.status,
            "created_ts": agent.created_ts,
            "updated_ts": agent.updated_ts,
        }

    def get_all_agent_statuses(self) -> list[dict[str, Any]]:
        """Get all agents' statuses from the agents table."""
        from coffee_export.database.models import Agent

        rows = self.session.execute(select(Agent).order_by(Agent.agent_id.asc())).scalars().all()
        return [
            {
                "agent_id": a.agent_id,
                "name": a.name,
                "description": a.description,
                "status": a.status,
                "updated_ts": a.updated_ts,
            }
            for a in rows
        ]

    def set_agent_status(self, agent_id: str, status: str) -> bool:
        """
        Set an agent's status: 'active', 'paused', or 'disabled'.

        The AgentRunner checks this status before running an agent.
        """
        from coffee_export.database.models import Agent

        if status not in ("active", "paused", "disabled"):
            raise ValidationFailedError("status must be 'active', 'paused', or 'disabled'")

        agent = self.session.get(Agent, agent_id)
        if not agent:
            raise NotFoundError(f"agent '{agent_id}' not found")

        agent.status = status
        agent.updated_ts = now_addis_iso_str()
        self._commit()
        log.info(f"Agent {agent_id} status set to '{status}'")
        return True

    # =============================================================
    # SYSTEM HEALTH (for dashboard system health page)
    # =============================================================

    def get_system_health(self) -> dict[str, Any]:
        """
        Get system health metrics for the dashboard.

        Returns CPU, memory, disk, DB size, event stats, queue depth.
        """

        import psutil

        # CPU & memory
        cpu_percent = psutil.cpu_percent(interval=0.5)
        memory = psutil.virtual_memory()
        from coffee_export.config import BASE_DIR, DB_PATH

        disk = psutil.disk_usage(str(BASE_DIR))

        # Database size
        db_size_bytes = DB_PATH.stat().st_size if DB_PATH.exists() else 0

        # Event stats (events per minute)
        from sqlalchemy import func

        from coffee_export.database.models import Event

        one_min_ago = (datetime.now(ADDIS_TZ) - timedelta(minutes=1)).isoformat()
        events_last_min = (
            self.session.execute(
                select(func.count(Event.id)).where(Event.published_ts >= one_min_ago)
            ).scalar()
            or 0
        )

        # Pending events (queue depth)
        pending_events = (
            self.session.execute(
                select(func.count(Event.id)).where(Event.status == "pending")
            ).scalar()
            or 0
        )

        # Dead-letter events
        dead_letter_events = (
            self.session.execute(
                select(func.count(Event.id)).where(Event.status == "dead_letter")
            ).scalar()
            or 0
        )

        # Total events
        total_events = self.session.execute(select(func.count(Event.id))).scalar() or 0

        # Active reservations
        active_reservations = len(self.get_active_reservations())

        # Waitlist depth
        waitlist_count = (
            self.session.execute(
                select(func.count(SampleWaitlist.id)).where(SampleWaitlist.fulfilled_ts.is_(None))
            ).scalar()
            or 0
        )

        # Process info
        process = psutil.Process()
        process_memory_mb = process.memory_info().rss / 1024 / 1024

        return {
            "timestamp": now_addis_iso_str(),
            "system": {
                "cpu_percent": cpu_percent,
                "memory_total_gb": round(memory.total / 1024**3, 1),
                "memory_used_gb": round(memory.used / 1024**3, 1),
                "memory_percent": memory.percent,
                "disk_total_gb": round(disk.total / 1024**3, 1),
                "disk_used_gb": round(disk.used / 1024**3, 1),
                "disk_percent": disk.percent,
            },
            "database": {
                "size_mb": round(db_size_bytes / 1024 / 1024, 2),
                "path": str(DB_PATH),
            },
            "events": {
                "total": total_events,
                "events_last_minute": events_last_min,
                "pending": pending_events,
                "dead_letter": dead_letter_events,
            },
            "queue": {
                "active_reservations": active_reservations,
                "waitlist_depth": waitlist_count,
            },
            "process": {
                "pid": process.pid,
                "memory_mb": round(process_memory_mb, 1),
                "cpu_percent": process.cpu_percent(interval=0.1),
            },
        }

    # =============================================================
    # CONTRACT & COMPLIANCE (for Agent 5)
    # =============================================================

    def create_contract(
        self,
        lead_id: str,
        sample_request_id: str | None = None,
        contract_number: str = "",
        contract_template: str = "ICC_ECE_7_21",
        incoterm: str = "FOB",
        currency: str = "USD",
        total_volume_bags: int = 0,
        total_value: float = 0.0,
        shipment_window_start: str = "",
        shipment_window_end: str = "",
        payment_terms: str = "",
        is_repeat: bool = False,
    ) -> str:
        """
        Create a contract record. Returns contract_id.

        Contracts are created when a sample is approved (Agent 4
        publishes SAMPLE_APPROVED → Agent 5 creates the contract).
        """
        from coffee_export.database.models import Contract

        # Generate ID: CT-YYYY-NNNN
        year = now_addis().year
        prefix = f"CT-{year}-"
        last = self.session.execute(
            select(Contract)
            .where(Contract.contract_id.like(f"{prefix}%"))
            .order_by(Contract.contract_id.desc())
            .limit(1)
        ).scalar_one_or_none()
        next_num = 1
        if last and last.contract_id:
            with contextlib.suppress(ValueError):
                next_num = int(last.contract_id[len(prefix) :]) + 1
        contract_id = f"{prefix}{next_num:04d}"

        now = now_addis_iso_str()
        contract = Contract(
            contract_id=contract_id,
            lead_id=lead_id,
            sample_request_id=sample_request_id,
            contract_number=contract_number or contract_id,
            contract_date=now[:10],
            contract_template=contract_template,
            incoterm=incoterm,
            currency=currency,
            total_volume_bags=total_volume_bags,
            total_value=total_value,
            shipment_window_start=shipment_window_start,
            shipment_window_end=shipment_window_end,
            payment_terms=payment_terms,
            status="draft",
            is_repeat=1 if is_repeat else 0,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(contract)
        self._commit()
        log.info(f"Created contract {contract_id} for lead {lead_id}")
        return contract_id

    def add_contract_line_item(
        self,
        contract_id: str,
        lot_id: str,
        quantity_bags: int,
        unit_price: float,
        notes: str = "",
    ) -> int:
        """Add a lot to a contract as a line item. Returns line item ID."""
        from coffee_export.database.models import ContractLineItem

        total_price = quantity_bags * unit_price
        now = now_addis_iso_str()
        item = ContractLineItem(
            contract_id=contract_id,
            lot_id=lot_id,
            quantity_bags=quantity_bags,
            unit_price=unit_price,
            total_price=total_price,
            notes=notes,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(item)
        self.session.flush()
        item_id = item.id
        self._commit()
        return item_id

    def get_contract(self, contract_id: str) -> dict[str, Any] | None:
        """Return a contract as dict with line items, or None."""
        contract = self.contracts_repo.get_contract(contract_id)
        if not contract:
            return None
        result = {c.name: getattr(contract, c.name) for c in contract.__table__.columns}
        result["line_items"] = [
            {
                "id": li.id,
                "lot_id": li.lot_id,
                "quantity_bags": li.quantity_bags,
                "unit_price": li.unit_price,
                "total_price": li.total_price,
            }
            for li in contract.line_items
        ]
        return result

    def update_contract_status(
        self,
        contract_id: str,
        status: str,
        **extra_fields,
    ) -> bool:
        """
        Update a contract's status.

        Status flow: draft → pending_signature → signed → active → completed
        Also: cancelled, breached
        """
        from coffee_export.database.models import Contract

        contract = self.session.get(Contract, contract_id)
        if not contract:
            raise NotFoundError(f"contract '{contract_id}' not found")

        contract.status = status
        now = now_addis_iso_str()
        if status == "signed" and not contract.signed_ts:
            contract.signed_ts = now
        for field, value in extra_fields.items():
            if hasattr(contract, field):
                setattr(contract, field, value)
        contract.updated_ts = now
        self._commit()
        return True

    def get_contracts(
        self,
        lead_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List contracts with optional filters."""
        from coffee_export.database.models import Contract

        stmt = (
            select(Contract)
            .where(Contract.organization_id == self.organization_id)
            .order_by(Contract.created_ts.desc())
            .limit(limit)
        )
        if lead_id:
            stmt = stmt.where(Contract.lead_id == lead_id)
        if status:
            stmt = stmt.where(Contract.status == status)
        rows = self.session.execute(stmt).scalars().all()
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    # ── Compliance Documents ──

    def add_compliance_document(
        self,
        contract_id: str,
        document_type: str,
        file_path: str = "",
        issued_date: str = "",
        expiry_date: str = "",
        status: str = "draft",
        notes: str = "",
    ) -> int:
        """
        Add a compliance document to a contract.

        Document types:
          - eudr_attestation       (EU mandatory)
          - certificate_of_origin  (all destinations)
          - phytosanitary_cert     (most destinations)
          - organic_cert           (if lot is organic-certified)
          - fairtrade_cert         (if lot is FT-certified)
          - ra_cert                (if lot is RA-certified)
          - 4c_cert                (if lot is 4C-certified)
          - commercial_invoice     (all contracts)
          - packing_list           (all contracts)
          - bill_of_lading         (shipping stage)
          - insurance_cert         (CIF contracts)
          - other

        Returns the document ID.
        """
        from coffee_export.database.models import ComplianceDocument

        now = now_addis_iso_str()
        doc = ComplianceDocument(
            contract_id=contract_id,
            document_type=document_type,
            file_path=file_path,
            issued_date=issued_date,
            expiry_date=expiry_date,
            status=status,
            notes=notes,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(doc)
        self.session.flush()
        doc_id = doc.id
        self._commit()
        return doc_id

    def update_compliance_document(
        self,
        doc_id: int,
        status: str | None = None,
        file_path: str | None = None,
        issued_date: str | None = None,
        expiry_date: str | None = None,
        notes: str | None = None,
    ) -> bool:
        """Update a compliance document's status or fields."""
        from coffee_export.database.models import ComplianceDocument

        doc = self.session.get(ComplianceDocument, doc_id)
        if not doc:
            raise NotFoundError(f"compliance document '{doc_id}' not found")
        if status:
            doc.status = status
        if file_path:
            doc.file_path = file_path
        if issued_date:
            doc.issued_date = issued_date
        if expiry_date:
            doc.expiry_date = expiry_date
        if notes:
            doc.notes = notes
        doc.updated_ts = now_addis_iso_str()
        self._commit()
        return True

    def get_compliance_documents(self, contract_id: str) -> list[dict[str, Any]]:
        """Get all compliance documents for a contract."""
        from coffee_export.database.models import ComplianceDocument

        rows = (
            self.session.execute(
                select(ComplianceDocument)
                .where(
                    ComplianceDocument.contract_id == contract_id,
                    ComplianceDocument.organization_id == self.organization_id
                )
                .order_by(ComplianceDocument.id.asc())
            )
            .scalars()
            .all()
        )
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def get_compliance_document(self, doc_id: int) -> dict[str, Any] | None:
        """Get a single compliance document by ID (includes contract_id)."""
        from coffee_export.database.models import ComplianceDocument

        doc = self.session.get(ComplianceDocument, doc_id)
        if not doc:
            return None
        return {c.name: getattr(doc, c.name) for c in doc.__table__.columns}

    def check_compliance_status(self, contract_id: str) -> dict[str, Any]:
        """
        Check if all required compliance documents are approved.

        Returns dict with:
          - all_complete: bool
          - total_docs: int
          - approved: int
          - pending: int
          - missing: list of required doc types not yet added
          - documents: list of doc dicts
        """
        docs = self.get_compliance_documents(contract_id)
        doc_types_present = {d["document_type"] for d in docs}

        # Determine required documents based on contract details
        contract = self.get_contract(contract_id)
        if not contract:
            return {"error": "contract not found"}

        required = self._get_required_documents(contract)

        approved_docs = [d for d in docs if d.get("status") == "approved"]
        pending_docs = [d for d in docs if d.get("status") in ("draft", "submitted")]
        missing_docs = [dt for dt in required if dt not in doc_types_present]

        return {
            "all_complete": len(missing_docs) == 0 and len(pending_docs) == 0,
            "required": required,
            "total_docs": len(docs),
            "approved": len(approved_docs),
            "pending": len(pending_docs),
            "missing": missing_docs,
            "documents": docs,
            "can_sign": len(missing_docs) == 0 and len(pending_docs) == 0,
        }

    def _get_required_documents(self, contract: dict[str, Any]) -> list[str]:
        """
        Determine which compliance documents are required based on
        destination country, incoterm, and lot certifications.

        This is the compliance expert's knowledge base.
        """
        required: list[str] = []

        # Get the lead's destination country
        lead = self.get_lead(contract.get("lead_id", ""))
        destination = (lead or {}).get("headquarters_country", "") if lead else ""

        # ── Universal documents (all contracts) ──
        required.extend(
            [
                "certificate_of_origin",
                "phytosanitary_cert",
                "commercial_invoice",
                "packing_list",
            ]
        )

        # ── EU-specific (EUDR mandatory as of 2026) ──
        eu_countries = {
            "Germany",
            "Austria",
            "Belgium",
            "Bulgaria",
            "Croatia",
            "Cyprus",
            "Czech Republic",
            "Denmark",
            "Estonia",
            "Finland",
            "France",
            "Greece",
            "Hungary",
            "Ireland",
            "Italy",
            "Latvia",
            "Lithuania",
            "Luxembourg",
            "Malta",
            "Netherlands",
            "Poland",
            "Portugal",
            "Romania",
            "Slovakia",
            "Slovenia",
            "Spain",
            "Sweden",
            "United Kingdom",
            "Norway",
            "Switzerland",
            "Iceland",
            "Liechtenstein",
        }
        if destination in eu_countries:
            required.append("eudr_attestation")

        # ── US-specific (FDA prior notice) ──
        if destination in ("USA", "United States", "United States of America"):
            required.append("fda_prior_notice")

        # ── CIF contracts need insurance ──
        if contract.get("incoterm") == "CIF":
            required.append("insurance_cert")

        # ── Bill of lading (needed for shipping, not contract signing) ──
        # Not required for signing, but tracked

        # ── Certification-specific (based on lot certs) ──
        # Check line items for certified lots
        for li in contract.get("line_items", []):
            lot = self.get_lot(li.get("lot_id", ""))
            if lot:
                certs = (lot.get("certifications") or "").lower()
                if "organic" in certs and "organic_cert" not in required:
                    required.append("organic_cert")
                if "ft" in certs or "fairtrade" in certs:
                    if "fairtrade_cert" not in required:
                        required.append("fairtrade_cert")
                if "ra" in certs or "rainforest" in certs:
                    if "ra_cert" not in required:
                        required.append("ra_cert")
                if "4c" in certs and "4c_cert" not in required:
                    required.append("4c_cert")

        return required

    # =============================================================
    # LOGISTICS & SHIPPING (for Agent 6)
    # =============================================================

    def create_shipment(
        self,
        contract_id: str,
        carrier: str = "",
        vessel_name: str = "",
        bill_of_lading_number: str = "",
        container_number: str = "",
        departure_port: str = "",
        arrival_port: str = "",
        etd: str = "",
        eta: str = "",
    ) -> str:
        """
        Create a shipment record linked to a contract. Returns shipment_id.

        Shipments are created when Agent 5 publishes CONTRACT_SIGNED.
        Status flow: draft → booked → loaded → departed → in_transit
        → arrived → customs_hold → delivered (or delayed/cancelled)
        """
        from coffee_export.database.models import Shipment

        year = now_addis().year
        prefix = f"SH-{year}-"
        last = self.session.execute(
            select(Shipment)
            .where(Shipment.shipment_id.like(f"{prefix}%"))
            .order_by(Shipment.shipment_id.desc())
            .limit(1)
        ).scalar_one_or_none()
        next_num = 1
        if last and last.shipment_id:
            with contextlib.suppress(ValueError):
                next_num = int(last.shipment_id[len(prefix) :]) + 1
        shipment_id = f"{prefix}{next_num:04d}"

        now = now_addis_iso_str()
        sh = Shipment(
            shipment_id=shipment_id,
            contract_id=contract_id,
            carrier=carrier,
            vessel_name=vessel_name,
            bill_of_lading_number=bill_of_lading_number,
            container_number=container_number,
            departure_port=departure_port,
            arrival_port=arrival_port,
            etd=etd,
            eta=eta,
            status="draft",
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(sh)
        self._commit()
        log.info(f"Created shipment {shipment_id} for contract {contract_id}")
        return shipment_id

    def get_shipment(self, shipment_id: str) -> dict[str, Any] | None:
        """Return a shipment as dict, or None."""
        from coffee_export.database.models import Shipment

        sh = self.session.get(Shipment, shipment_id)
        if not sh:
            return None
        result = {c.name: getattr(sh, c.name) for c in sh.__table__.columns}
        result["items"] = [
            {
                "lot_id": si.lot_id,
                "quantity_bags": si.quantity_bags,
            }
            for si in sh.items
        ]
        return result

    def update_shipment(
        self,
        shipment_id: str,
        **fields,
    ) -> bool:
        """Update shipment fields (carrier, B/L, ports, dates, status)."""
        from coffee_export.database.models import Shipment

        sh = self.session.get(Shipment, shipment_id)
        if not sh:
            raise NotFoundError(f"shipment '{shipment_id}' not found")

        allowed = {
            "carrier",
            "vessel_name",
            "bill_of_lading_number",
            "container_number",
            "departure_port",
            "arrival_port",
            "etd",
            "eta",
            "atd",
            "ata",
            "status",
            "notes",
        }
        now = now_addis_iso_str()
        for field, value in fields.items():
            if field in allowed and hasattr(sh, field):
                setattr(sh, field, value)
        sh.updated_ts = now
        self._commit()
        return True

    def get_shipments(
        self,
        contract_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List shipments with optional filters."""
        from coffee_export.database.models import Shipment

        stmt = select(Shipment).order_by(Shipment.created_ts.desc()).limit(limit)
        if contract_id:
            stmt = stmt.where(Shipment.contract_id == contract_id)
        if status:
            stmt = stmt.where(Shipment.status == status)
        rows = self.session.execute(stmt).scalars().all()
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def add_shipment_item(
        self,
        shipment_id: str,
        lot_id: str,
        quantity_bags: int,
        notes: str = "",
    ) -> int:
        """Add a lot to a shipment. Returns the item ID."""
        from coffee_export.database.models import ShipmentItem

        now = now_addis_iso_str()
        item = ShipmentItem(
            shipment_id=shipment_id,
            lot_id=lot_id,
            quantity_bags=quantity_bags,
            notes=notes,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(item)
        self.session.flush()
        item_id = item.id
        self._commit()
        return item_id

    # ── Customs Documents ──

    def add_customs_document(
        self,
        shipment_id: str,
        document_type: str,
        file_path: str = "",
        status: str = "draft",
        notes: str = "",
    ) -> int:
        """
        Add a customs document to a shipment.

        Types: commercial_invoice, packing_list, certificate_of_origin,
        bill_of_lading, insurance_cert, phytosanitary_cert,
        eudr_declaration, other
        """
        from coffee_export.database.models import CustomsDocument

        now = now_addis_iso_str()
        doc = CustomsDocument(
            shipment_id=shipment_id,
            document_type=document_type,
            file_path=file_path,
            status=status,
            notes=notes,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(doc)
        self.session.flush()
        doc_id = doc.id
        self._commit()
        return doc_id

    def update_customs_document(
        self,
        doc_id: int,
        status: str | None = None,
        file_path: str | None = None,
        notes: str | None = None,
    ) -> bool:
        """Update a customs document."""
        from coffee_export.database.models import CustomsDocument

        doc = self.session.get(CustomsDocument, doc_id)
        if not doc:
            raise NotFoundError(f"customs document '{doc_id}' not found")
        if status:
            doc.status = status
        if file_path:
            doc.file_path = file_path
        if notes:
            doc.notes = notes
        doc.updated_ts = now_addis_iso_str()
        self._commit()
        return True

    def get_customs_documents(self, shipment_id: str) -> list[dict[str, Any]]:
        """Get all customs documents for a shipment."""
        from coffee_export.database.models import CustomsDocument

        rows = (
            self.session.execute(
                select(CustomsDocument)
                .where(CustomsDocument.shipment_id == shipment_id)
                .order_by(CustomsDocument.id.asc())
            )
            .scalars()
            .all()
        )
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def check_customs_status(self, shipment_id: str) -> dict[str, Any]:
        """
        Check if all required customs documents are cleared.

        Required docs: commercial_invoice, packing_list,
        certificate_of_origin, bill_of_lading, phytosanitary_cert.
        EU destinations also require eudr_declaration.
        CIF contracts also require insurance_cert.
        """
        docs = self.get_customs_documents(shipment_id)
        doc_map = {d["document_type"]: d for d in docs}

        required = [
            "commercial_invoice",
            "packing_list",
            "certificate_of_origin",
            "bill_of_lading",
            "phytosanitary_cert",
        ]

        # Check if EU destination (via contract → lead)
        shipment = self.get_shipment(shipment_id)
        if shipment:
            contract = self.get_contract(shipment.get("contract_id", ""))
            if contract:
                lead = self.get_lead(contract.get("lead_id", ""))
                eu_countries = {
                    "Germany",
                    "France",
                    "Italy",
                    "Netherlands",
                    "Belgium",
                    "Spain",
                    "Sweden",
                    "Denmark",
                    "Finland",
                    "Austria",
                    "United Kingdom",
                    "Norway",
                    "Switzerland",
                }
                if lead and lead.get("headquarters_country") in eu_countries:
                    required.append("eudr_declaration")

                if contract.get("incoterm") == "CIF":
                    required.append("insurance_cert")

        cleared = sum(1 for dt in required if doc_map.get(dt, {}).get("status") == "cleared")
        missing = [dt for dt in required if dt not in doc_map]
        pending = [
            dt for dt in required if dt in doc_map and doc_map[dt].get("status") != "cleared"
        ]

        return {
            "all_cleared": len(missing) == 0 and len(pending) == 0,
            "required": required,
            "cleared": cleared,
            "total_required": len(required),
            "missing": missing,
            "pending": pending,
            "can_depart": len(missing) == 0 and len(pending) == 0,
            "documents": docs,
        }

    # =============================================================
    # ACCOUNTS & RELATIONSHIP (for Agent 7)
    # =============================================================

    def create_account(
        self,
        lead_id: str,
        account_manager: str = "",
    ) -> str:
        """
        Create an account for a delivered buyer. Returns account_id.

        Accounts are created when Agent 6 publishes SHIPMENT_DELIVERED.
        The lead must be in CONTRACTED state.
        """
        from coffee_export.database.models import Account

        # Check if account already exists for this lead
        existing = self.session.execute(
            select(Account).where(Account.lead_id == lead_id).limit(1)
        ).scalar_one_or_none()
        if existing:
            log.debug(f"Account already exists for lead {lead_id}: {existing.account_id}")
            return existing.account_id

        # Generate account_id: ACC-YYYY-NNNN
        year = now_addis().year
        prefix = f"ACC-{year}-"
        last = self.session.execute(
            select(Account)
            .where(Account.account_id.like(f"{prefix}%"))
            .order_by(Account.account_id.desc())
            .limit(1)
        ).scalar_one_or_none()
        next_num = 1
        if last and last.account_id:
            with contextlib.suppress(ValueError):
                next_num = int(last.account_id[len(prefix) :]) + 1
        account_id = f"{prefix}{next_num:04d}"

        # Get first contract date
        contracts = self.get_contracts(lead_id=lead_id, limit=1)
        first_contract_date = contracts[0].get("contract_date", "") if contracts else ""

        # Calculate totals
        total_volume = sum(
            c.get("total_volume_bags", 0) or 0
            for c in self.get_contracts(lead_id=lead_id, limit=10000)
        )
        total_revenue = sum(
            c.get("total_value", 0) or 0 for c in self.get_contracts(lead_id=lead_id, limit=10000)
        )

        now = now_addis_iso_str()
        account = Account(
            account_id=account_id,
            lead_id=lead_id,
            account_manager=account_manager,
            relationship_status="active",
            total_volume_bags=total_volume,
            total_revenue_usd=total_revenue,
            first_contract_date=first_contract_date,
            last_activity_ts=now,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(account)
        self._commit()
        log.info(f"Created account {account_id} for lead {lead_id}")
        return account_id

    def get_account(self, account_id: str) -> dict[str, Any] | None:
        """Return an account as dict, or None."""
        from coffee_export.database.models import Account

        account = self.session.get(Account, account_id)
        if not account:
            return None
        return {c.name: getattr(account, c.name) for c in account.__table__.columns}

    def get_account_by_lead(self, lead_id: str) -> dict[str, Any] | None:
        """Find an account by lead_id."""
        from coffee_export.database.models import Account

        account = self.session.execute(
            select(Account).where(Account.lead_id == lead_id).limit(1)
        ).scalar_one_or_none()
        if not account:
            return None
        return {c.name: getattr(account, c.name) for c in account.__table__.columns}

    def get_accounts(
        self,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List accounts with optional filter."""
        from coffee_export.database.models import Account

        stmt = select(Account).order_by(Account.created_ts.desc()).limit(limit)
        if status:
            stmt = stmt.where(Account.relationship_status == status)
        rows = self.session.execute(stmt).scalars().all()
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def update_account(self, account_id: str, **fields) -> bool:
        """Update account fields."""
        from coffee_export.database.models import Account

        account = self.session.get(Account, account_id)
        if not account:
            raise NotFoundError(f"account '{account_id}' not found")

        allowed = {
            "account_manager",
            "relationship_status",
            "total_volume_bags",
            "total_revenue_usd",
            "last_activity_ts",
            "nps_score",
            "notes",
        }
        now = now_addis_iso_str()
        for field, value in fields.items():
            if field in allowed and hasattr(account, field):
                setattr(account, field, value)
        account.updated_ts = now
        self._commit()
        return True

    def add_account_activity(
        self,
        account_id: str,
        activity_type: str,
        activity_ts: str = "",
        participants: str = "",
        summary: str = "",
        next_steps: str = "",
        next_action_due_ts: str = "",
        nps_score: int | None = None,
        nps_feedback: str = "",
    ) -> int:
        """
        Add an account activity (call, meeting, email, NPS survey, etc.).

        Activity types: call, meeting, email, site_visit, gift,
        sample_request, contract_signed, delivery_followup, nps_survey, other

        Returns the activity ID.
        """
        from coffee_export.database.models import AccountActivity

        now = now_addis_iso_str()
        activity = AccountActivity(
            account_id=account_id,
            activity_type=activity_type,
            activity_ts=activity_ts or now,
            participants=participants,
            summary=summary,
            next_steps=next_steps,
            next_action_due_ts=next_action_due_ts,
            nps_score=nps_score,
            nps_feedback=nps_feedback,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(activity)
        self.session.flush()
        activity_id = activity.id
        self._commit()

        # Update account's last_activity_ts
        self.update_account(account_id, last_activity_ts=activity_ts or now)
        if nps_score is not None:
            self.update_account(account_id, nps_score=nps_score)

        return activity_id

    def get_account_activities(
        self,
        account_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get all activities for an account (newest first)."""
        from coffee_export.database.models import AccountActivity

        rows = (
            self.session.execute(
                select(AccountActivity)
                .where(AccountActivity.account_id == account_id)
                .order_by(AccountActivity.activity_ts.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )
        return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

    def get_relationship_stats(self) -> dict[str, Any]:
        """Get relationship management statistics."""
        from coffee_export.database.models import Account
        from sqlalchemy import func

        accounts = (
            self.session.execute(select(Account).order_by(Account.created_ts.desc()))
            .scalars()
            .all()
        )

        by_status: dict[str, int] = {}
        total_revenue = 0.0
        total_volume = 0
        nps_scores: list[int] = []

        for acc in accounts:
            status = acc.relationship_status or "active"
            by_status[status] = by_status.get(status, 0) + 1
            total_revenue += acc.total_revenue_usd or 0
            total_volume += acc.total_volume_bags or 0
            if acc.nps_score is not None:
                nps_scores.append(acc.nps_score)

        # Calculate NPS
        nps = 0
        if nps_scores:
            promoters = sum(1 for s in nps_scores if s >= 9)
            detractors = sum(1 for s in nps_scores if s <= 6)
            nps = int((promoters - detractors) / len(nps_scores) * 100)

        return {
            "total_accounts": len(accounts),
            "by_status": by_status,
            "total_revenue": round(total_revenue, 2),
            "total_volume_bags": total_volume,
            "nps_score": nps,
            "nps_responses": len(nps_scores),
        }

    # =============================================================
    # MESSAGING GATEWAY
    # ─────────────────────────────────────────────────────────────
    # Internal Messaging Gateway - masks exporter identity from buyers.
    #
    # Buyer email <-> marcus.bell@faithelexport.com <-> exporter dashboard
    #
    # All methods here are the ONLY sanctioned way to mutate
    # exporter_inboxes / message_threads / inbox_messages.
    # =============================================================

    def get_or_create_exporter_inbox(
        self,
        operator_id: str,
        display_name: str,
        inbound_domain: str,
        real_email: str | None = None,
        operator_name: str | None = None,
    ) -> dict[str, Any]:
        """
        Get the masked mailbox for an operator, creating it if missing.

        Masked email pattern (professional + non-revealing):
            - Local part derived from the operator's actual NAME (slugified):
                "Marcus Bell"      -> marcus.bell@faithelexport.com
                "Aurea Coffee PLC" -> aurea.coffee@faithelexport.com
            - Collisions: append numeric suffix (marcus.bell2@, marcus.bell3@)
            - Empty name: fall back to desk-{inbox_id}@faithelexport.com

        The buyer sees only this address - it looks like a real sales rep
        at the export company.
        """
        import re as _re

        from coffee_export.database.models.messaging import ExporterInbox

        existing = self.session.execute(
            select(ExporterInbox).where(ExporterInbox.operator_id == operator_id)
        ).scalar_one_or_none()
        if existing:
            return {
                "id": existing.id,
                "operator_id": existing.operator_id,
                "masked_email": existing.masked_email,
                "display_name": existing.display_name,
                "real_email": existing.real_email,
                "is_active": bool(existing.is_active),
            }

        # Derive local part from operator_name (preferred) or display_name
        source_name = (operator_name or display_name or "").strip()
        source_name = _re.split(r"[\-—|]\s*(Sales|Trading|Export|Coffee|Team)", source_name)[0]
        slug = _re.sub(r"[^a-z0-9]+", ".", source_name.lower()).strip(".").lower()
        slug = slug[:30].strip(".") if slug else ""

        if slug:
            local_part = slug
        else:
            local_part = "desk"

        masked_email = f"{local_part}@{inbound_domain}"

        # Defensive: avoid collision - keep incrementing suffix until unique
        collision = self.session.execute(
            select(ExporterInbox).where(ExporterInbox.masked_email == masked_email)
        ).scalar_one_or_none()
        if collision:
            suffix = 2
            while collision:
                masked_email = f"{local_part}{suffix}@{inbound_domain}"
                collision = self.session.execute(
                    select(ExporterInbox).where(
                        ExporterInbox.masked_email == masked_email
                    )
                ).scalar_one_or_none()
                suffix += 1
                if suffix > 9999:
                    import secrets as _secrets
                    masked_email = f"{local_part}-{_secrets.token_hex(2)}@{inbound_domain}"
                    break

        now = now_addis_iso_str()
        inbox = ExporterInbox(
            operator_id=operator_id,
            masked_email=masked_email,
            display_name=display_name,
            real_email=real_email,
            is_active=1,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(inbox)
        self.session.flush()
        self._commit()

        # If we used the desk- fallback (no name), rewrite with the inbox id
        if local_part == "desk" and not slug:
            new_email = f"desk-{inbox.id:04d}@{inbound_domain}"
            existing_check = self.session.execute(
                select(ExporterInbox).where(ExporterInbox.masked_email == new_email)
            ).scalar_one_or_none()
            if not existing_check:
                inbox.masked_email = new_email
                self._commit()

        log.info(
            f"Created exporter inbox: operator={operator_id} -> {inbox.masked_email}"
        )

        return {
            "id": inbox.id,
            "operator_id": inbox.operator_id,
            "masked_email": inbox.masked_email,
            "display_name": inbox.display_name,
            "real_email": inbox.real_email,
            "is_active": bool(inbox.is_active),
        }

    def get_inbox_by_masked_email(self, masked_email: str) -> dict[str, Any] | None:
        from coffee_export.database.models.messaging import ExporterInbox

        row = self.session.execute(
            select(ExporterInbox).where(ExporterInbox.masked_email == masked_email)
        ).scalar_one_or_none()
        if not row:
            return None
        return {
            "id": row.id,
            "operator_id": row.operator_id,
            "masked_email": row.masked_email,
            "display_name": row.display_name,
            "real_email": row.real_email,
            "is_active": bool(row.is_active),
        }

    def get_inbox_by_operator(self, operator_id: str) -> dict[str, Any] | None:
        from coffee_export.database.models.messaging import ExporterInbox

        row = self.session.execute(
            select(ExporterInbox).where(ExporterInbox.operator_id == operator_id)
        ).scalar_one_or_none()
        if not row:
            return None
        return {
            "id": row.id,
            "operator_id": row.operator_id,
            "masked_email": row.masked_email,
            "display_name": row.display_name,
            "real_email": row.real_email,
            "is_active": bool(row.is_active),
        }

    def get_or_create_thread(
        self,
        lead_id: str,
        inbox_id: int,
        buyer_email: str,
        subject: str,
        buyer_contact_id: int | None = None,
    ) -> dict[str, Any]:
        from coffee_export.database.models.messaging import MessageThread

        existing = self.session.execute(
            select(MessageThread).where(
                MessageThread.lead_id == lead_id,
                MessageThread.inbox_id == inbox_id,
                MessageThread.status != "closed",
            )
        ).scalar_one_or_none()
        if existing:
            return {
                "thread_id": existing.thread_id,
                "lead_id": existing.lead_id,
                "inbox_id": existing.inbox_id,
                "buyer_email": existing.buyer_email,
                "subject": existing.subject,
                "status": existing.status,
                "message_count": existing.message_count,
                "unread_count": existing.unread_count,
            }

        year = now_addis().year
        prefix = f"T-{year}-"
        last = self.session.execute(
            select(MessageThread)
            .where(MessageThread.thread_id.like(f"{prefix}%"))
            .order_by(MessageThread.thread_id.desc())
            .limit(1)
        ).scalar_one_or_none()
        next_num = 1
        if last and last.thread_id:
            with contextlib.suppress(ValueError):
                next_num = int(last.thread_id[len(prefix):]) + 1
        thread_id = f"{prefix}{next_num:05d}"

        now = now_addis_iso_str()
        thread = MessageThread(
            thread_id=thread_id,
            lead_id=lead_id,
            inbox_id=inbox_id,
            buyer_contact_id=buyer_contact_id,
            buyer_email=buyer_email,
            subject=subject,
            status="active",
            last_message_ts=None,
            last_message_direction=None,
            message_count=0,
            unread_count=0,
            created_ts=now,
            updated_ts=now,
            closed_ts=None,
        )
        self.session.add(thread)
        self.session.flush()
        self._commit()

        log.info(
            f"Created message thread {thread_id} for lead {lead_id}, inbox {inbox_id}"
        )

        return {
            "thread_id": thread_id,
            "lead_id": lead_id,
            "inbox_id": inbox_id,
            "buyer_email": buyer_email,
            "subject": subject,
            "status": "active",
            "message_count": 0,
            "unread_count": 0,
        }

    def log_outbound_message(
        self,
        thread_id: str,
        from_addr: str,
        to_addr: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
        reply_to: str | None = None,
        provider: str = "resend",
        provider_message_id: str | None = None,
        in_reply_to: str | None = None,
    ) -> int:
        from coffee_export.database.models.messaging import InboxMessage, MessageThread

        now = now_addis_iso_str()
        msg = InboxMessage(
            thread_id=thread_id,
            direction="outbound",
            from_addr=from_addr,
            to_addr=to_addr,
            reply_to=reply_to,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            provider=provider,
            provider_message_id=provider_message_id,
            in_reply_to=in_reply_to,
            ai_processed=0,
            is_read=1,
            status="read",
            sent_ts=now,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(msg)
        self.session.flush()

        thread = self.session.get(MessageThread, thread_id)
        if thread:
            thread.last_message_ts = now
            thread.last_message_direction = "outbound"
            thread.message_count = (thread.message_count or 0) + 1
            thread.status = "awaiting_buyer"
            thread.updated_ts = now

        self._commit()
        log.info(
            f"Logged outbound message id={msg.id} thread={thread_id} -> {to_addr}"
        )
        return msg.id

    def log_inbound_message(
        self,
        thread_id: str,
        from_addr: str,
        to_addr: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
        reply_to: str | None = None,
        provider: str = "resend",
        provider_message_id: str | None = None,
        in_reply_to: str | None = None,
        raw_payload: str | None = None,
        received_ts: str | None = None,
    ) -> int:
        from coffee_export.database.models.messaging import InboxMessage, MessageThread

        now = received_ts or now_addis_iso_str()
        msg = InboxMessage(
            thread_id=thread_id,
            direction="inbound",
            from_addr=from_addr,
            to_addr=to_addr,
            reply_to=reply_to,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            provider=provider,
            provider_message_id=provider_message_id,
            in_reply_to=in_reply_to,
            ai_processed=0,
            is_read=0,
            status="new",
            raw_payload=raw_payload,
            received_ts=now,
            created_ts=now,
            updated_ts=now,
        )
        self.session.add(msg)
        self.session.flush()

        thread = self.session.get(MessageThread, thread_id)
        if thread:
            thread.last_message_ts = now
            thread.last_message_direction = "inbound"
            thread.message_count = (thread.message_count or 0) + 1
            thread.unread_count = (thread.unread_count or 0) + 1
            thread.status = "awaiting_exporter"
            thread.updated_ts = now

        self._commit()
        log.info(
            f"Logged inbound message id={msg.id} thread={thread_id} <- {from_addr}"
        )
        return msg.id

    def update_message_ai_fields(
        self,
        message_id: int,
        summary: str,
        classification: str,
        intent: str = "",
        translation: str = "",
        language_detected: str = "",
        cost_usd: float = 0.0,
        provider: str = "",
        extracted_data: dict[str, Any] | None = None,
    ) -> bool:
        import json as _json

        from coffee_export.database.models.messaging import InboxMessage

        msg = self.session.get(InboxMessage, message_id)
        if not msg:
            return False

        msg.glm_summary = summary
        msg.glm_classification = classification
        msg.glm_intent = intent
        msg.glm_translation = translation
        msg.glm_language_detected = language_detected
        msg.glm_cost_usd = cost_usd
        msg.glm_provider = provider

        if extracted_data:
            msg.extracted_intent = extracted_data.get("intent")
            vb = extracted_data.get("volume_bags")
            if vb is not None:
                try:
                    msg.extracted_volume_bags = int(vb)
                except (ValueError, TypeError):
                    msg.extracted_volume_bags = None
            else:
                msg.extracted_volume_bags = None
            msg.extracted_origin = extracted_data.get("origin")
            msg.extracted_grade = extracted_data.get("grade")
            msg.extracted_destination = extracted_data.get("destination")
            msg.extracted_incoterm = extracted_data.get("incoterm")
            msg.extracted_urgency = extracted_data.get("urgency")
            msg.extracted_next_action = extracted_data.get("next_action")
            msg.extracted_data = _json.dumps(extracted_data, ensure_ascii=False)

        msg.ai_processed = 1
        msg.updated_ts = now_addis_iso_str()

        self._commit()
        return True

    def mark_message_read(self, message_id: int) -> bool:
        from coffee_export.database.models.messaging import InboxMessage, MessageThread

        msg = self.session.get(InboxMessage, message_id)
        if not msg:
            return False

        if msg.is_read:
            return True

        msg.is_read = 1
        msg.read_ts = now_addis_iso_str()
        if msg.status == "new":
            msg.status = "read"
        msg.updated_ts = now_addis_iso_str()

        thread = self.session.get(MessageThread, msg.thread_id)
        if thread and thread.unread_count and thread.unread_count > 0:
            thread.unread_count -= 1
            thread.updated_ts = now_addis_iso_str()

        self._commit()
        return True

    def mark_message_status(self, message_id: int, status: str) -> bool:
        from coffee_export.database.models.messaging import InboxMessage

        if status not in ("new", "read", "replied", "archived", "ignored"):
            raise ValueError(f"invalid status: {status}")

        msg = self.session.get(InboxMessage, message_id)
        if not msg:
            return False

        msg.status = status
        msg.updated_ts = now_addis_iso_str()
        self._commit()
        return True

    def get_thread(self, thread_id: str) -> dict[str, Any] | None:
        from coffee_export.database.models.messaging import MessageThread

        row = self.session.get(MessageThread, thread_id)
        if not row:
            return None
        return {
            "thread_id": row.thread_id,
            "lead_id": row.lead_id,
            "inbox_id": row.inbox_id,
            "buyer_contact_id": row.buyer_contact_id,
            "buyer_email": row.buyer_email,
            "subject": row.subject,
            "status": row.status,
            "last_message_ts": row.last_message_ts,
            "last_message_direction": row.last_message_direction,
            "message_count": row.message_count,
            "unread_count": row.unread_count,
            "created_ts": row.created_ts,
            "closed_ts": row.closed_ts,
        }

    def get_thread_by_lead(self, lead_id: str, inbox_id: int) -> dict[str, Any] | None:
        from coffee_export.database.models.messaging import MessageThread

        row = self.session.execute(
            select(MessageThread).where(
                MessageThread.lead_id == lead_id,
                MessageThread.inbox_id == inbox_id,
                MessageThread.status != "closed",
            )
        ).scalar_one_or_none()
        if not row:
            return None
        return self.get_thread(row.thread_id)

    def list_threads_for_inbox(
        self, inbox_id: int, include_closed: bool = False
    ) -> list[dict[str, Any]]:
        from coffee_export.database.models.messaging import MessageThread

        stmt = select(MessageThread).where(MessageThread.inbox_id == inbox_id)
        if not include_closed:
            stmt = stmt.where(MessageThread.status != "closed")
        stmt = stmt.order_by(MessageThread.last_message_ts.desc().nullslast())

        rows = self.session.execute(stmt).scalars().all()
        return [
            {
                "thread_id": r.thread_id,
                "lead_id": r.lead_id,
                "inbox_id": r.inbox_id,
                "buyer_email": r.buyer_email,
                "subject": r.subject,
                "status": r.status,
                "last_message_ts": r.last_message_ts,
                "last_message_direction": r.last_message_direction,
                "message_count": r.message_count,
                "unread_count": r.unread_count,
            }
            for r in rows
        ]

    def get_messages_for_thread(
        self, thread_id: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        from coffee_export.database.models.messaging import InboxMessage

        rows = (
            self.session.execute(
                select(InboxMessage)
                .where(InboxMessage.thread_id == thread_id)
                .order_by(InboxMessage.id.asc())
                .limit(limit)
            )
            .scalars()
            .all()
        )
        return [
            {
                "id": r.id,
                "direction": r.direction,
                "from_addr": r.from_addr,
                "to_addr": r.to_addr,
                "subject": r.subject,
                "body_text": r.body_text,
                "body_html": r.body_html,
                "ai_processed": bool(r.ai_processed),
                "glm_summary": r.glm_summary,
                "glm_classification": r.glm_classification,
                "glm_intent": r.glm_intent,
                "glm_translation": r.glm_translation,
                "glm_language_detected": r.glm_language_detected,
                "extracted_intent": r.extracted_intent,
                "extracted_volume_bags": r.extracted_volume_bags,
                "extracted_origin": r.extracted_origin,
                "extracted_grade": r.extracted_grade,
                "extracted_destination": r.extracted_destination,
                "extracted_incoterm": r.extracted_incoterm,
                "extracted_urgency": r.extracted_urgency,
                "extracted_next_action": r.extracted_next_action,
                "extracted_data": r.extracted_data,
                "is_read": bool(r.is_read),
                "status": r.status,
                "provider_message_id": r.provider_message_id,
                "sent_ts": r.sent_ts,
                "received_ts": r.received_ts,
                "created_ts": r.created_ts,
            }
            for r in rows
        ]

    def get_message(self, message_id: int) -> dict[str, Any] | None:
        from coffee_export.database.models.messaging import InboxMessage

        r = self.session.get(InboxMessage, message_id)
        if not r:
            return None
        return {
            "id": r.id,
            "thread_id": r.thread_id,
            "direction": r.direction,
            "from_addr": r.from_addr,
            "to_addr": r.to_addr,
            "reply_to": r.reply_to,
            "subject": r.subject,
            "body_text": r.body_text,
            "body_html": r.body_html,
            "provider": r.provider,
            "provider_message_id": r.provider_message_id,
            "in_reply_to": r.in_reply_to,
            "ai_processed": bool(r.ai_processed),
            "glm_summary": r.glm_summary,
            "glm_classification": r.glm_classification,
            "glm_intent": r.glm_intent,
            "glm_translation": r.glm_translation,
            "glm_language_detected": r.glm_language_detected,
            "glm_cost_usd": r.glm_cost_usd,
            "glm_provider": r.glm_provider,
            "extracted_intent": r.extracted_intent,
            "extracted_volume_bags": r.extracted_volume_bags,
            "extracted_origin": r.extracted_origin,
            "extracted_grade": r.extracted_grade,
            "extracted_destination": r.extracted_destination,
            "extracted_incoterm": r.extracted_incoterm,
            "extracted_urgency": r.extracted_urgency,
            "extracted_next_action": r.extracted_next_action,
            "extracted_data": r.extracted_data,
            "is_read": bool(r.is_read),
            "status": r.status,
            "sent_ts": r.sent_ts,
            "received_ts": r.received_ts,
        }

    def close_thread(self, thread_id: str, reason: str = "") -> bool:
        from coffee_export.database.models.messaging import MessageThread

        thread = self.session.get(MessageThread, thread_id)
        if not thread:
            return False

        thread.status = "closed"
        thread.closed_ts = now_addis_iso_str()
        thread.updated_ts = now_addis_iso_str()
        self._commit()
        log.info(f"Closed thread {thread_id} ({reason})")
        return True

    def get_inbox_stats(self, inbox_id: int) -> dict[str, Any]:
        from coffee_export.database.models.messaging import (
            InboxMessage,
            MessageThread,
        )

        threads = self.session.execute(
            select(MessageThread).where(
                MessageThread.inbox_id == inbox_id,
                MessageThread.status != "closed",
            )
        ).scalars().all()

        total_unread = sum(t.unread_count or 0 for t in threads)
        active_threads = len(threads)
        awaiting_exporter = sum(
            1 for t in threads if t.status == "awaiting_exporter"
        )
        awaiting_buyer = sum(1 for t in threads if t.status == "awaiting_buyer")

        return {
            "inbox_id": inbox_id,
            "active_threads": active_threads,
            "total_unread": total_unread,
            "awaiting_exporter": awaiting_exporter,
            "awaiting_buyer": awaiting_buyer,
        }
