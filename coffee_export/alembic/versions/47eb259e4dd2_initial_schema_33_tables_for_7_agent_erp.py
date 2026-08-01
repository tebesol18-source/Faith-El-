"""initial schema — 33 tables for 7-agent ERP

Revision ID: 47eb259e4dd2
Revises:
Create Date: 2026-07-01 13:48:57.025353

Tables created (33 total, 8 domains):
  Infrastructure: agents, operators, audit_log
  Lead:           leads, lead_contacts, lead_tags, lead_state_history
  Outreach:       sequence_templates, outreach_touches, qualification_answers
  Inventory:      coops, washing_stations, lots, stock_movements,
                  lot_reservations, lot_feedback, qa_flags
  Sample:         sample_requests, sample_request_lots, sample_shipments,
                  cupping_scores, sample_decisions, sample_budget, sample_waitlist
  Contract:       contracts, contract_line_items, compliance_documents
  Logistics:      shipments, shipment_items, customs_documents
  Relationship:   accounts, account_activities
  Event Bus:      events

See docs/schema/design_reasoning.md for full design rationale.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "47eb259e4dd2"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ──────────────────────────────────────────────────────────────
# Helper: define common audit columns
# ──────────────────────────────────────────────────────────────


def _audit_columns() -> list[sa.Column]:
    """Standard audit columns added to every business table."""
    return [
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.Column("deleted_ts", sa.TEXT, nullable=True),
    ]


def _created_by_columns() -> list[sa.Column]:
    """Columns tracking who created/updated a row (agent or operator)."""
    return [
        sa.Column("created_by_agent_id", sa.TEXT, nullable=True),
        sa.Column("created_by_operator_id", sa.TEXT, nullable=True),
        sa.Column("updated_by_agent_id", sa.TEXT, nullable=True),
        sa.Column("updated_by_operator_id", sa.TEXT, nullable=True),
    ]


# ──────────────────────────────────────────────────────────────
# UPGRADE
# ──────────────────────────────────────────────────────────────


def upgrade() -> None:
    """Create all 33 tables."""

    # ════════════════════════════════════════════════════════════
    # DOMAIN: INFRASTRUCTURE (3 tables)
    # ════════════════════════════════════════════════════════════

    # ── agents — registry of the 7 AI agents ──
    op.create_table(
        "agents",
        sa.Column("agent_id", sa.TEXT, primary_key=True),
        sa.Column("name", sa.TEXT, nullable=False),
        sa.Column("description", sa.TEXT),
        sa.Column("status", sa.TEXT, nullable=False, server_default="active"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.CheckConstraint("status IN ('active', 'paused', 'disabled')", name="ck_agents_status"),
    )
    op.create_index("ix_agents_status", "agents", ["status"])

    # ── operators — human users who can intervene ──
    op.create_table(
        "operators",
        sa.Column("operator_id", sa.TEXT, primary_key=True),
        sa.Column("name", sa.TEXT, nullable=False),
        sa.Column("email", sa.TEXT, nullable=False, unique=True),
        sa.Column("role", sa.TEXT, nullable=False),
        sa.Column("status", sa.TEXT, nullable=False, server_default="active"),
        sa.Column("created_ts", sa.TEXT, nullable=False),
        sa.Column("updated_ts", sa.TEXT, nullable=False),
        sa.CheckConstraint(
            "role IN ('admin', 'manager', 'operator', 'viewer')", name="ck_operators_role"
        ),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="ck_operators_status"),
    )

    # ── audit_log — generic audit trail for all entities ──
    op.create_table(
        "audit_log",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.TEXT, nullable=False),
        sa.Column("entity_id", sa.TEXT, nullable=False),
        sa.Column("action", sa.TEXT, nullable=False),
        sa.Column("old_values", sa.TEXT),  # JSON
        sa.Column("new_values", sa.TEXT),  # JSON
        sa.Column("agent_id", sa.TEXT, nullable=True),
        sa.Column("operator_id", sa.TEXT, nullable=True),
        sa.Column("ts", sa.TEXT, nullable=False),
        sa.CheckConstraint(
            "action IN ('insert', 'update', 'delete', 'state_transition')",
            name="ck_audit_log_action",
        ),
        sa.CheckConstraint(
            "agent_id IS NOT NULL OR operator_id IS NOT NULL",
            name="ck_audit_log_has_actor",
        ),
    )
    op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"])
    op.create_index("ix_audit_log_ts", "audit_log", ["ts"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: LEAD (4 tables)
    # ════════════════════════════════════════════════════════════

    # ── leads — the core entity: buyer companies ──
    op.create_table(
        "leads",
        sa.Column("lead_id", sa.TEXT, primary_key=True),
        sa.Column("company_name", sa.TEXT, nullable=False),
        sa.Column("headquarters_country", sa.TEXT),
        sa.Column("headquarters_city", sa.TEXT),
        sa.Column("website", sa.TEXT),
        sa.Column("source_row_hash", sa.TEXT),  # SHA1 for dedup
        sa.Column("current_state", sa.TEXT, nullable=False, server_default="NEW"),
        sa.Column("current_agent", sa.TEXT, nullable=False, server_default="none"),
        sa.Column("last_touch_ts", sa.TEXT),
        sa.Column("next_action_due_ts", sa.TEXT),
        sa.Column("next_action_agent", sa.TEXT, server_default="none"),
        sa.Column("priority_tier", sa.TEXT),
        sa.Column("recommended_vp", sa.TEXT),
        sa.Column("outreach_language", sa.TEXT, nullable=False, server_default="EN"),
        sa.Column("sequence_step", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("sample_lead_id", sa.TEXT),
        sa.Column("substitute_round", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("ghosted_count", sa.INTEGER, nullable=False, server_default="0"),
        *_audit_columns(),
        sa.CheckConstraint(
            "current_state IN ('NEW', 'ENRICHED', 'IN_SEQUENCE', 'QUALIFIED', "
            "'SAMPLE_DISPATCHED', 'SAMPLE_FEEDBACK_DUE', 'DECIDED_APPROVED', "
            "'DECIDED_REJECTED', 'DECIDED_NEEDS_ANOTHER', 'GHOSTED', "
            "'CONTRACTED', 'NURTURE', 'BLOCKED')",
            name="ck_leads_current_state",
        ),
        sa.CheckConstraint(
            "priority_tier IN ('S', 'A', 'B', 'C', 'Disqualify') OR priority_tier IS NULL",
            name="ck_leads_priority_tier",
        ),
        sa.CheckConstraint(
            "recommended_vp IN ('VP1', 'VP2', 'VP3', 'VP4') OR recommended_vp IS NULL",
            name="ck_leads_recommended_vp",
        ),
        sa.CheckConstraint(
            "outreach_language IN ('EN', 'DE', 'FR', 'IT', 'JA', 'KO', 'ZH', 'AR', 'TR', 'RU')",
            name="ck_leads_outreach_language",
        ),
        sa.UniqueConstraint(
            "company_name", "headquarters_country", name="uq_leads_company_country"
        ),
    )
    op.create_index("ix_leads_current_state", "leads", ["current_state"])
    op.create_index("ix_leads_current_agent", "leads", ["current_agent"])
    op.create_index("ix_leads_priority_tier", "leads", ["priority_tier"])
    op.create_index("ix_leads_next_action", "leads", ["next_action_due_ts"])
    op.create_index("ix_leads_source_hash", "leads", ["source_row_hash"])

    # ── lead_contacts — multiple decision makers per lead ──
    op.create_table(
        "lead_contacts",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("name", sa.TEXT, nullable=False),
        sa.Column("title", sa.TEXT),
        sa.Column("linkedin_url", sa.TEXT),
        sa.Column("email", sa.TEXT),
        sa.Column("phone", sa.TEXT),
        sa.Column("is_primary", sa.INTEGER, server_default="0"),
        sa.Column("is_buyer", sa.INTEGER, server_default="0"),  # has buyer/sourcing title
        *_audit_columns(),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_lead_contacts_lead_id", "lead_contacts", ["lead_id"])
    op.create_index("ix_lead_contacts_email", "lead_contacts", ["email"])

    # ── lead_tags — many-to-many tags ──
    op.create_table(
        "lead_tags",
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("tag", sa.TEXT, nullable=False),
        sa.Column("tagged_ts", sa.TEXT, nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("lead_id", "tag"),
    )
    op.create_index("ix_lead_tags_tag", "lead_tags", ["tag"])

    # ── lead_state_history — append-only state transition audit ──
    op.create_table(
        "lead_state_history",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("from_state", sa.TEXT),
        sa.Column("to_state", sa.TEXT, nullable=False),
        sa.Column("agent_id", sa.TEXT, nullable=False),
        sa.Column("ts", sa.TEXT, nullable=False),
        sa.Column("notes", sa.TEXT),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_lead_state_history_lead", "lead_state_history", ["lead_id"])
    op.create_index("ix_lead_state_history_ts", "lead_state_history", ["ts"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: OUTREACH & QUALIFICATION (3 tables)
    # ════════════════════════════════════════════════════════════

    # ── sequence_templates — outreach sequence definitions ──
    op.create_table(
        "sequence_templates",
        sa.Column("template_id", sa.TEXT, primary_key=True),
        sa.Column("name", sa.TEXT, nullable=False),
        sa.Column("description", sa.TEXT),
        sa.Column("channel", sa.TEXT, nullable=False),  # linkedin_first, email_first
        sa.Column("total_steps", sa.INTEGER, nullable=False, server_default="6"),
        sa.Column("is_active", sa.INTEGER, server_default="1"),
        *_audit_columns(),
        sa.CheckConstraint(
            "channel IN ('linkedin_first', 'email_first', 'whatsapp_first')",
            name="ck_sequence_templates_channel",
        ),
    )

    # ── outreach_touches — individual outreach events ──
    op.create_table(
        "outreach_touches",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("template_id", sa.TEXT, nullable=True),
        sa.Column("step_number", sa.INTEGER, nullable=False),
        sa.Column("channel", sa.TEXT, nullable=False),  # linkedin, email, phone
        sa.Column("direction", sa.TEXT, nullable=False, server_default="outbound"),
        sa.Column("contact_id", sa.TEXT, nullable=True),  # which lead_contact
        sa.Column("subject", sa.TEXT),
        sa.Column("content_summary", sa.TEXT),
        sa.Column("sent_ts", sa.TEXT),
        sa.Column("response_ts", sa.TEXT),
        sa.Column("response_content", sa.TEXT),
        sa.Column("response_type", sa.TEXT),  # positive, negative, neutral, no_response
        *_audit_columns(),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["sequence_templates.template_id"]),
        sa.CheckConstraint(
            "channel IN ('linkedin', 'email', 'phone', 'whatsapp', 'other')",
            name="ck_outreach_touches_channel",
        ),
        sa.CheckConstraint(
            "direction IN ('outbound', 'inbound')", name="ck_outreach_touches_direction"
        ),
    )
    op.create_index("ix_outreach_touches_lead", "outreach_touches", ["lead_id"])
    op.create_index("ix_outreach_touches_sent_ts", "outreach_touches", ["sent_ts"])

    # ── qualification_answers — Q1-Q5 QUAL gate answers ──
    op.create_table(
        "qualification_answers",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("question", sa.TEXT, nullable=False),  # Q1, Q2, Q3, Q4, Q5
        sa.Column("answer", sa.TEXT, nullable=False),
        sa.Column("answer_detail", sa.TEXT),  # verbatim buyer response
        sa.Column("answered_ts", sa.TEXT, nullable=False),
        sa.Column("answered_by", sa.TEXT, nullable=False),  # agent_id or operator_id
        sa.Column("is_positive", sa.INTEGER, server_default="0"),  # passes this question
        *_audit_columns(),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "question IN ('Q1', 'Q2', 'Q3', 'Q4', 'Q5')", name="ck_qual_answers_question"
        ),
    )
    op.create_index("ix_qual_answers_lead", "qualification_answers", ["lead_id"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: INVENTORY (7 tables)
    # ════════════════════════════════════════════════════════════

    # ── coops — cooperatives ──
    op.create_table(
        "coops",
        sa.Column("coop_id", sa.TEXT, primary_key=True),
        sa.Column("name", sa.TEXT, nullable=False),
        sa.Column("region", sa.TEXT),
        sa.Column("registration_number", sa.TEXT),
        sa.Column("contact_name", sa.TEXT),
        sa.Column("contact_phone", sa.TEXT),
        sa.Column("contact_email", sa.TEXT),
        *_audit_columns(),
        sa.CheckConstraint(
            "region IN ('Yirgacheffe', 'Sidamo', 'Guji', 'Limu', 'Jimma', 'Harrar', 'other') "
            "OR region IS NULL",
            name="ck_coops_region",
        ),
    )
    op.create_index("ix_coops_region", "coops", ["region"])

    # ── washing_stations — belong to coops ──
    op.create_table(
        "washing_stations",
        sa.Column("station_id", sa.TEXT, primary_key=True),
        sa.Column("coop_id", sa.TEXT, nullable=False),
        sa.Column("name", sa.TEXT, nullable=False),
        sa.Column("region", sa.TEXT),
        sa.Column("gps_lat", sa.REAL),
        sa.Column("gps_lon", sa.REAL),
        sa.Column("altitude_m", sa.INTEGER),
        sa.Column("capacity_bags_per_year", sa.INTEGER),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["coop_id"], ["coops.coop_id"]),
        sa.CheckConstraint(
            "region IN ('Yirgacheffe', 'Sidamo', 'Guji', 'Limu', 'Jimma', 'Harrar', 'other') "
            "OR region IS NULL",
            name="ck_washing_stations_region",
        ),
    )
    op.create_index("ix_washing_stations_coop", "washing_stations", ["coop_id"])
    op.create_index("ix_washing_stations_region", "washing_stations", ["region"])

    # ── lots — the core inventory entity ──
    op.create_table(
        "lots",
        sa.Column("lot_id", sa.TEXT, primary_key=True),
        sa.Column("station_id", sa.TEXT, nullable=False),
        sa.Column("coop_id", sa.TEXT, nullable=False),
        sa.Column("region", sa.TEXT, nullable=False),
        sa.Column("washing_station_name", sa.TEXT),  # denormalized for convenience
        sa.Column("coop_name", sa.TEXT),  # denormalized for convenience
        sa.Column("process", sa.TEXT, nullable=False),
        sa.Column("screen_size", sa.INTEGER),
        sa.Column("cupping_score", sa.REAL),
        sa.Column("q_grader_name", sa.TEXT),
        sa.Column("grading_date", sa.TEXT),
        sa.Column("defect_count_sca", sa.INTEGER),
        sa.Column("moisture_pct", sa.REAL),
        sa.Column("water_activity", sa.REAL),
        sa.Column("crop_year", sa.TEXT, nullable=False),
        sa.Column("harvest_date_range", sa.TEXT),
        sa.Column("milling_date", sa.TEXT),
        sa.Column("stock_bags_remaining", sa.INTEGER, nullable=False, server_default="0"),
        sa.Column("bag_size_kg", sa.INTEGER, server_default="60"),
        sa.Column("certifications", sa.TEXT),  # semicolon-separated
        sa.Column("certificate_of_origin", sa.TEXT),
        # EUDR fields (1:1 with lot, columns are appropriate)
        sa.Column("eudr_data_status", sa.TEXT, nullable=False, server_default="missing"),
        sa.Column("eudr_gps_lat", sa.REAL),
        sa.Column("eudr_gps_lon", sa.REAL),
        sa.Column("eudr_farmgate_price_etb_per_kg", sa.REAL),
        sa.Column("eudr_deforestation_attestation", sa.TEXT),  # path to signed PDF
        sa.Column("reserved_for_forward_program", sa.TEXT, server_default="No"),
        sa.Column("status", sa.TEXT, nullable=False, server_default="active"),
        sa.Column("last_updated_ts", sa.TEXT, nullable=False),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["station_id"], ["washing_stations.station_id"]),
        sa.ForeignKeyConstraint(["coop_id"], ["coops.coop_id"]),
        sa.CheckConstraint(
            "region IN ('Yirgacheffe', 'Sidamo', 'Guji', 'Limu', 'Jimma', 'Harrar', 'other')",
            name="ck_lots_region",
        ),
        sa.CheckConstraint(
            "process IN ('Washed', 'Natural', 'Honey', 'Anaerobic')", name="ck_lots_process"
        ),
        sa.CheckConstraint(
            "eudr_data_status IN ('complete', 'partial', 'missing')",
            name="ck_lots_eudr_status",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'committed', 'depleted', 'hold')", name="ck_lots_status"
        ),
        sa.CheckConstraint(
            "reserved_for_forward_program IN ('Yes', 'No')",
            name="ck_lots_reserved_forward",
        ),
    )
    op.create_index("ix_lots_region_process", "lots", ["region", "process"])
    op.create_index("ix_lots_status_eudr", "lots", ["status", "eudr_data_status"])
    op.create_index("ix_lots_crop_year", "lots", ["crop_year"])
    op.create_index("ix_lots_cupping_score", "lots", ["cupping_score"])
    op.create_index("ix_lots_station", "lots", ["station_id"])

    # ── stock_movements — stock change audit trail ──
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("delta_bags", sa.INTEGER, nullable=False),  # + or -
        sa.Column("reason", sa.TEXT, nullable=False),  # sample, contract, correction, depletion
        sa.Column("reference_id", sa.TEXT),  # sample_request_id, contract_id, etc.
        sa.Column("notes", sa.TEXT),
        sa.Column("ts", sa.TEXT, nullable=False),
        sa.Column("agent_id", sa.TEXT, nullable=True),
        sa.Column("operator_id", sa.TEXT, nullable=True),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "reason IN ('sample_dispatch', 'contract_commit', 'stock_correction', "
            "'depletion', 'qa_hold', 'qa_release', 'initial_stock')",
            name="ck_stock_movements_reason",
        ),
    )
    op.create_index("ix_stock_movements_lot", "stock_movements", ["lot_id"])
    op.create_index("ix_stock_movements_ts", "stock_movements", ["ts"])

    # ── lot_reservations — 7-day sample holds ──
    op.create_table(
        "lot_reservations",
        sa.Column("reservation_id", sa.TEXT, primary_key=True),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("sample_type", sa.TEXT, nullable=False),
        sa.Column("quantity_grams", sa.INTEGER, nullable=False),
        sa.Column("reserved_ts", sa.TEXT, nullable=False),
        sa.Column("reserved_until_ts", sa.TEXT, nullable=False),
        sa.Column("buyer_company", sa.TEXT),
        sa.Column("crop_year", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="active"),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"]),
        sa.CheckConstraint(
            "sample_type IN ('350g', '200g', '500g', '150g')",
            name="ck_lot_reservations_sample_type",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'expired', 'fulfilled', 'cancelled')",
            name="ck_lot_reservations_status",
        ),
    )
    op.create_index("ix_lot_reservations_lot", "lot_reservations", ["lot_id"])
    op.create_index("ix_lot_reservations_status", "lot_reservations", ["status"])

    # ── lot_feedback — rejection feedback ──
    op.create_table(
        "lot_feedback",
        sa.Column("feedback_id", sa.TEXT, primary_key=True),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("buyer_company", sa.TEXT),
        sa.Column("buyer_segment", sa.TEXT),
        sa.Column("rejection_reason", sa.TEXT, nullable=False),
        sa.Column("logged_ts", sa.TEXT, nullable=False),
        sa.Column("qa_auto_flagged", sa.INTEGER, server_default="0"),
        sa.Column("sample_request_id", sa.TEXT, nullable=True),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
    )
    op.create_index("ix_lot_feedback_lot", "lot_feedback", ["lot_id"])
    op.create_index("ix_lot_feedback_ts", "lot_feedback", ["logged_ts"])

    # ── qa_flags — QA hold audit trail ──
    op.create_table(
        "qa_flags",
        sa.Column("qa_flag_id", sa.TEXT, primary_key=True),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("auto", sa.INTEGER, server_default="0"),
        sa.Column("reason", sa.TEXT, nullable=False),
        sa.Column("flagged_ts", sa.TEXT, nullable=False),
        sa.Column("resolved_ts", sa.TEXT),
        sa.Column("resolved_by", sa.TEXT),
        sa.Column("resolution_notes", sa.TEXT),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
    )
    op.create_index("ix_qa_flags_lot", "qa_flags", ["lot_id"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: SAMPLE (7 tables)
    # ════════════════════════════════════════════════════════════

    # ── sample_requests — dispatch records ──
    op.create_table(
        "sample_requests",
        sa.Column("sample_request_id", sa.TEXT, primary_key=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("sample_type", sa.TEXT, nullable=False),
        sa.Column("crop_year", sa.TEXT, nullable=False),
        sa.Column("buyer_company", sa.TEXT, nullable=False),
        sa.Column("buyer_attention_name", sa.TEXT),
        sa.Column("buyer_shipping_address", sa.TEXT),
        sa.Column("buyer_destination_country", sa.TEXT),
        sa.Column("buyer_language", sa.TEXT, server_default="EN"),
        sa.Column("shipping_arrangement", sa.TEXT),  # paid, pre_paid, fallback_150g
        sa.Column("status", sa.TEXT, server_default="draft"),
        sa.Column("dispatched_ts", sa.TEXT),
        sa.Column("delivered_ts", sa.TEXT),
        sa.Column("feedback_due_ts", sa.TEXT),
        sa.Column("decided_ts", sa.TEXT),
        sa.Column("ghosted_ts", sa.TEXT),
        sa.Column("substitute_round", sa.INTEGER, server_default="0"),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"]),
        sa.CheckConstraint(
            "sample_type IN ('350g', '200g', '500g', '150g')",
            name="ck_sample_requests_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'approved', 'dispatched', 'delivered', "
            "'feedback_due', 'decided', 'ghosted', 'cancelled')",
            name="ck_sample_requests_status",
        ),
        sa.CheckConstraint(
            "shipping_arrangement IN ('paid', 'pre_paid', 'fallback_150g') "
            "OR shipping_arrangement IS NULL",
            name="ck_sample_requests_shipping",
        ),
    )
    op.create_index("ix_sample_requests_lead", "sample_requests", ["lead_id"])
    op.create_index("ix_sample_requests_status", "sample_requests", ["status"])

    # ── sample_request_lots — junction: samples ↔ lots ──
    op.create_table(
        "sample_request_lots",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("sample_request_id", sa.TEXT, nullable=False),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("quantity_grams", sa.INTEGER, nullable=False),
        sa.Column("confirmed", sa.INTEGER, server_default="0"),
        sa.Column("substitute_for_lot_id", sa.TEXT, nullable=True),
        sa.ForeignKeyConstraint(
            ["sample_request_id"], ["sample_requests.sample_request_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
    )
    op.create_index("ix_sample_request_lots_sample", "sample_request_lots", ["sample_request_id"])
    op.create_index("ix_sample_request_lots_lot", "sample_request_lots", ["lot_id"])

    # ── sample_shipments — tracking for dispatched samples ──
    op.create_table(
        "sample_shipments",
        sa.Column("shipment_id", sa.TEXT, primary_key=True),
        sa.Column("sample_request_id", sa.TEXT, nullable=False),
        sa.Column("carrier", sa.TEXT),  # DHL, FedEx, etc.
        sa.Column("tracking_number", sa.TEXT),
        sa.Column("carrier_account", sa.TEXT),  # buyer's or ours
        sa.Column("pickup_ts", sa.TEXT),
        sa.Column("estimated_arrival_ts", sa.TEXT),
        sa.Column("delivered_ts", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="pending"),
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(
            ["sample_request_id"], ["sample_requests.sample_request_id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'picked_up', 'in_transit', 'delivered', "
            "'delayed', 'lost', 'damaged', 'returned')",
            name="ck_sample_shipments_status",
        ),
    )
    op.create_index("ix_sample_shipments_request", "sample_shipments", ["sample_request_id"])

    # ── cupping_scores — buyer evaluations per lot per sample ──
    op.create_table(
        "cupping_scores",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("sample_request_id", sa.TEXT, nullable=False),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("buyer_company", sa.TEXT, nullable=False),
        sa.Column("cupper_name", sa.TEXT),
        # SCA 10 attributes (each scored /10 or /15 depending on attribute)
        sa.Column("fragrance_aroma", sa.REAL),  # /10
        sa.Column("flavor", sa.REAL),  # /10
        sa.Column("aftertaste", sa.REAL),  # /10
        sa.Column("acidity", sa.REAL),  # /10
        sa.Column("body", sa.REAL),  # /10
        sa.Column("balance", sa.REAL),  # /10
        sa.Column("uniformity", sa.REAL),  # /10
        sa.Column("clean_cup", sa.REAL),  # /10
        sa.Column("sweetness", sa.REAL),  # /10
        sa.Column("overall", sa.REAL),  # /10
        sa.Column("total_score", sa.REAL),  # sum of above + 36 (base)
        sa.Column("defect_count_buyer", sa.INTEGER),
        sa.Column("buyer_notes", sa.TEXT),
        sa.Column("our_score", sa.REAL),  # our pre-shipment score (for comparison)
        sa.Column("score_difference", sa.REAL),  # buyer_score - our_score
        sa.Column("cupped_ts", sa.TEXT),
        sa.Column("received_ts", sa.TEXT, nullable=False),
        *_audit_columns(),
        sa.ForeignKeyConstraint(
            ["sample_request_id"], ["sample_requests.sample_request_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
    )
    op.create_index("ix_cupping_scores_lot", "cupping_scores", ["lot_id"])
    op.create_index("ix_cupping_scores_sample", "cupping_scores", ["sample_request_id"])

    # ── sample_decisions — Approved/Rejected/Needs another ──
    op.create_table(
        "sample_decisions",
        sa.Column("decision_id", sa.TEXT, primary_key=True),
        sa.Column("sample_request_id", sa.TEXT, nullable=False),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("decision", sa.TEXT, nullable=False),
        sa.Column("buyer_target_fob", sa.REAL),
        sa.Column("buyer_target_volume_bags", sa.INTEGER),
        sa.Column("buyer_target_port", sa.TEXT),
        sa.Column("buyer_target_shipment_window", sa.TEXT),
        sa.Column("buyer_payment_terms", sa.TEXT),
        sa.Column("decision_ts", sa.TEXT, nullable=False),
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["sample_request_id"], ["sample_requests.sample_request_id"]),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
        sa.CheckConstraint(
            "decision IN ('approved', 'rejected', 'needs_another_sample', 'undecided')",
            name="ck_sample_decisions_decision",
        ),
    )
    op.create_index("ix_sample_decisions_sample", "sample_decisions", ["sample_request_id"])
    op.create_index("ix_sample_decisions_lot", "sample_decisions", ["lot_id"])
    op.create_index("ix_sample_decisions_decision", "sample_decisions", ["decision"])

    # ── sample_budget — weekly counter ──
    op.create_table(
        "sample_budget",
        sa.Column("week_start", sa.TEXT, primary_key=True),  # ISO Monday date
        sa.Column("week_end", sa.TEXT, nullable=False),
        sa.Column("full_sets_used", sa.INTEGER, server_default="0"),
        sa.Column("fallback_150g_used", sa.INTEGER, server_default="0"),
        sa.Column("type_b_used", sa.INTEGER, server_default="0"),
        sa.Column("type_c_used", sa.INTEGER, server_default="0"),
        sa.Column("last_updated_ts", sa.TEXT, nullable=False),
        sa.Column("last_updated_by", sa.TEXT),
    )

    # ── sample_waitlist — leads queued for next week's budget ──
    op.create_table(
        "sample_waitlist",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("tier", sa.TEXT),
        sa.Column("sample_type", sa.TEXT),
        sa.Column("queued_ts", sa.TEXT, nullable=False),
        sa.Column("fulfilled_ts", sa.TEXT),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"]),
        sa.CheckConstraint(
            "tier IN ('S', 'A', 'B', 'C') OR tier IS NULL", name="ck_sample_waitlist_tier"
        ),
    )
    op.create_index("ix_sample_waitlist_fulfilled", "sample_waitlist", ["fulfilled_ts"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: CONTRACT & COMPLIANCE (3 tables)
    # ════════════════════════════════════════════════════════════

    # ── contracts — contract records ──
    op.create_table(
        "contracts",
        sa.Column("contract_id", sa.TEXT, primary_key=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("sample_request_id", sa.TEXT, nullable=True),
        sa.Column("contract_number", sa.TEXT, unique=True),  # ICC contract number
        sa.Column("contract_date", sa.TEXT, nullable=False),
        sa.Column("contract_template", sa.TEXT, server_default="ICC_ECE_7_21"),
        sa.Column("incoterm", sa.TEXT, server_default="FOB"),
        sa.Column("currency", sa.TEXT, server_default="USD"),
        sa.Column("total_volume_bags", sa.INTEGER),
        sa.Column("total_value", sa.REAL),
        sa.Column("shipment_window_start", sa.TEXT),
        sa.Column("shipment_window_end", sa.TEXT),
        sa.Column("payment_terms", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="draft"),
        sa.Column("signed_ts", sa.TEXT),
        sa.Column("is_repeat", sa.INTEGER, server_default="0"),  # Agent 7 repeat orders
        *_audit_columns(),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"]),
        sa.ForeignKeyConstraint(["sample_request_id"], ["sample_requests.sample_request_id"]),
        sa.CheckConstraint(
            "incoterm IN ('FOB', 'CIF', 'EXW', 'FCA', 'CFR')", name="ck_contracts_incoterm"
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'pending_signature', 'signed', 'active', "
            "'completed', 'cancelled', 'breached')",
            name="ck_contracts_status",
        ),
    )
    op.create_index("ix_contracts_lead", "contracts", ["lead_id"])
    op.create_index("ix_contracts_status", "contracts", ["status"])

    # ── contract_line_items — lots in a contract ──
    op.create_table(
        "contract_line_items",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("contract_id", sa.TEXT, nullable=False),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("quantity_bags", sa.INTEGER, nullable=False),
        sa.Column("unit_price", sa.REAL, nullable=False),
        sa.Column("total_price", sa.REAL),
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.contract_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
    )
    op.create_index("ix_contract_line_items_contract", "contract_line_items", ["contract_id"])
    op.create_index("ix_contract_line_items_lot", "contract_line_items", ["lot_id"])

    # ── compliance_documents — legal docs per contract ──
    op.create_table(
        "compliance_documents",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("contract_id", sa.TEXT, nullable=False),
        sa.Column("document_type", sa.TEXT, nullable=False),
        sa.Column("file_path", sa.TEXT),
        sa.Column("issued_date", sa.TEXT),
        sa.Column("expiry_date", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="draft"),
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.contract_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "document_type IN ('eudr_attestation', 'certificate_of_origin', "
            "'phytosanitary_cert', 'organic_cert', 'fairtrade_cert', 'ra_cert', "
            "'4c_cert', 'commercial_invoice', 'packing_list', 'bill_of_lading', "
            "'insurance_cert', 'other')",
            name="ck_compliance_docs_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'expired', 'rejected')",
            name="ck_compliance_docs_status",
        ),
    )
    op.create_index("ix_compliance_docs_contract", "compliance_documents", ["contract_id"])
    op.create_index("ix_compliance_docs_type", "compliance_documents", ["document_type"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: LOGISTICS (3 tables)
    # ════════════════════════════════════════════════════════════

    # ── shipments — freight shipments ──
    op.create_table(
        "shipments",
        sa.Column("shipment_id", sa.TEXT, primary_key=True),
        sa.Column("contract_id", sa.TEXT, nullable=False),
        sa.Column("carrier", sa.TEXT),
        sa.Column("vessel_name", sa.TEXT),
        sa.Column("bill_of_lading_number", sa.TEXT),
        sa.Column("container_number", sa.TEXT),
        sa.Column("departure_port", sa.TEXT),
        sa.Column("arrival_port", sa.TEXT),
        sa.Column("etd", sa.TEXT),  # estimated time of departure
        sa.Column("eta", sa.TEXT),  # estimated time of arrival
        sa.Column("atd", sa.TEXT),  # actual time of departure
        sa.Column("ata", sa.TEXT),  # actual time of arrival
        sa.Column("status", sa.TEXT, server_default="draft"),
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.contract_id"]),
        sa.CheckConstraint(
            "status IN ('draft', 'booked', 'loaded', 'departed', 'in_transit', "
            "'arrived', 'customs_hold', 'delivered', 'delayed', 'cancelled')",
            name="ck_shipments_status",
        ),
    )
    op.create_index("ix_shipments_contract", "shipments", ["contract_id"])
    op.create_index("ix_shipments_status", "shipments", ["status"])

    # ── shipment_items — lots in a shipment ──
    op.create_table(
        "shipment_items",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("shipment_id", sa.TEXT, nullable=False),
        sa.Column("lot_id", sa.TEXT, nullable=False),
        sa.Column("contract_line_item_id", sa.TEXT, nullable=True),
        sa.Column("quantity_bags", sa.INTEGER, nullable=False),
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.shipment_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.lot_id"]),
    )
    op.create_index("ix_shipment_items_shipment", "shipment_items", ["shipment_id"])
    op.create_index("ix_shipment_items_lot", "shipment_items", ["lot_id"])

    # ── customs_documents — customs paperwork ──
    op.create_table(
        "customs_documents",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("shipment_id", sa.TEXT, nullable=False),
        sa.Column("document_type", sa.TEXT, nullable=False),
        sa.Column("file_path", sa.TEXT),
        sa.Column("submitted_ts", sa.TEXT),
        sa.Column("cleared_ts", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="draft"),
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.shipment_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "document_type IN ('commercial_invoice', 'packing_list', 'certificate_of_origin', "
            "'bill_of_lading', 'insurance_cert', 'phytosanitary_cert', 'eudr_declaration', 'other')",
            name="ck_customs_docs_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'cleared', 'rejected', 'amended')",
            name="ck_customs_docs_status",
        ),
    )
    op.create_index("ix_customs_docs_shipment", "customs_documents", ["shipment_id"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: RELATIONSHIP (2 tables)
    # ════════════════════════════════════════════════════════════

    # ── accounts — ongoing buyer relationships (post-contract) ──
    op.create_table(
        "accounts",
        sa.Column("account_id", sa.TEXT, primary_key=True),
        sa.Column("lead_id", sa.TEXT, nullable=False),
        sa.Column("account_manager", sa.TEXT),  # operator_id
        sa.Column("relationship_status", sa.TEXT, server_default="active"),
        sa.Column("total_volume_bags", sa.INTEGER, server_default="0"),
        sa.Column("total_revenue_usd", sa.REAL, server_default="0"),
        sa.Column("first_contract_date", sa.TEXT),
        sa.Column("last_activity_ts", sa.TEXT),
        sa.Column("nps_score", sa.INTEGER),  # latest NPS (-100 to +100)
        sa.Column("notes", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.lead_id"]),
        sa.CheckConstraint(
            "relationship_status IN ('active', 'dormant', 'churned', 'at_risk')",
            name="ck_accounts_status",
        ),
    )
    op.create_index("ix_accounts_lead", "accounts", ["lead_id"])
    op.create_index("ix_accounts_status", "accounts", ["relationship_status"])

    # ── account_activities — relationship touches ──
    op.create_table(
        "account_activities",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.TEXT, nullable=False),
        sa.Column("activity_type", sa.TEXT, nullable=False),
        sa.Column("activity_ts", sa.TEXT, nullable=False),
        sa.Column("participants", sa.TEXT),  # names of people involved
        sa.Column("summary", sa.TEXT),
        sa.Column("next_steps", sa.TEXT),
        sa.Column("next_action_due_ts", sa.TEXT),
        sa.Column("nps_score", sa.INTEGER),  # if collected during this activity
        sa.Column("nps_feedback", sa.TEXT),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.account_id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "activity_type IN ('call', 'meeting', 'email', 'site_visit', 'gift', "
            "'sample_request', 'contract_signed', 'delivery_followup', 'nps_survey', 'other')",
            name="ck_account_activities_type",
        ),
    )
    op.create_index("ix_account_activities_account", "account_activities", ["account_id"])
    op.create_index("ix_account_activities_ts", "account_activities", ["activity_ts"])

    # ════════════════════════════════════════════════════════════
    # DOMAIN: EVENT BUS (1 table)
    # ════════════════════════════════════════════════════════════

    # ── events — event bus log for inter-agent communication ──
    op.create_table(
        "events",
        sa.Column("id", sa.INTEGER, primary_key=True, autoincrement=True),
        sa.Column("event_type", sa.TEXT, nullable=False),
        sa.Column("entity_type", sa.TEXT),
        sa.Column("entity_id", sa.TEXT),
        sa.Column("payload", sa.TEXT),  # JSON
        sa.Column("published_by", sa.TEXT, nullable=False),  # agent_id or operator_id
        sa.Column("published_ts", sa.TEXT, nullable=False),
        sa.Column("consumed_by", sa.TEXT),  # agent_id
        sa.Column("consumed_ts", sa.TEXT),
        sa.Column("status", sa.TEXT, server_default="pending"),
        sa.Column("error_message", sa.TEXT),
        sa.CheckConstraint(
            "status IN ('pending', 'consumed', 'failed', 'dead_letter')",
            name="ck_events_status",
        ),
    )
    op.create_index("ix_events_type", "events", ["event_type"])
    op.create_index("ix_events_status", "events", ["status"])
    op.create_index("ix_events_published_ts", "events", ["published_ts"])
    op.create_index("ix_events_entity", "events", ["entity_type", "entity_id"])

    # ════════════════════════════════════════════════════════════
    # SEED: Register the 7 agents
    # ════════════════════════════════════════════════════════════
    op.execute("""
        INSERT INTO agents (agent_id, name, description, status, created_ts, updated_ts)
        VALUES
            ('Agent 1', 'Supplier & Inventory',
             'Owns lot inventory, EUDR data, stock levels, QA flags', 'active',
             strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'), strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now')),
            ('Agent 2', 'Lead Research & Enrichment',
             'Enriches raw leads with VP, segment, tier, language', 'active',
             strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'), strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now')),
            ('Agent 3', 'Outreach & Qualification',
             'Runs outreach sequences, enforces QUAL gate', 'active',
             strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'), strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now')),
            ('Agent 4', 'Sample Management',
             'Owns sample lifecycle from dispatch to decision', 'active',
             strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'), strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now')),
            ('Agent 5', 'Legal & Compliance',
             'Contract execution, ICC terms, compliance documentation', 'active',
             strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'), strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now')),
            ('Agent 6', 'Logistics & Shipping',
             'Freight booking, customs, delivery', 'active',
             strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'), strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now')),
            ('Agent 7', 'Sales & Relationship Management',
             'Long-term buyer relationships, repeat orders, NPS', 'active',
             strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'), strftime('%Y-%m-%dT%H:%M:%S+03:00', 'now'))
        """)


# ──────────────────────────────────────────────────────────────
# DOWNGRADE
# ──────────────────────────────────────────────────────────────


def downgrade() -> None:
    """Drop all 33 tables in reverse dependency order."""
    # Event Bus
    op.drop_table("events")

    # Relationship
    op.drop_table("account_activities")
    op.drop_table("accounts")

    # Logistics
    op.drop_table("customs_documents")
    op.drop_table("shipment_items")
    op.drop_table("shipments")

    # Contract & Compliance
    op.drop_table("compliance_documents")
    op.drop_table("contract_line_items")
    op.drop_table("contracts")

    # Sample
    op.drop_table("sample_waitlist")
    op.drop_table("sample_budget")
    op.drop_table("sample_decisions")
    op.drop_table("cupping_scores")
    op.drop_table("sample_shipments")
    op.drop_table("sample_request_lots")
    op.drop_table("sample_requests")

    # Inventory
    op.drop_table("qa_flags")
    op.drop_table("lot_feedback")
    op.drop_table("lot_reservations")
    op.drop_table("stock_movements")
    op.drop_table("lots")
    op.drop_table("washing_stations")
    op.drop_table("coops")

    # Outreach & Qualification
    op.drop_table("qualification_answers")
    op.drop_table("outreach_touches")
    op.drop_table("sequence_templates")

    # Lead
    op.drop_table("lead_state_history")
    op.drop_table("lead_tags")
    op.drop_table("lead_contacts")
    op.drop_table("leads")

    # Infrastructure
    op.drop_table("audit_log")
    op.drop_table("operators")
    op.drop_table("agents")
