"""
Cross-tenant mutation guards — Phase F org-scoping audit regression tests.

The tenant-enforced repositories scope READS by organization_id, but many
StateManager methods used to fetch rows by primary key via session.get()
with NO org check — a StateManager scoped to org A could mutate org B's
row by id (update_contract_status, update_lead_state, create_account's
existing-check, ...). These tests prove every guarded method now treats a
foreign-org row EXACTLY like a missing one (NotFoundError / None / False
— no information leak), while same-org access keeps working.

Also covers the two org-stamping fixes:
  - create_account stamps the OWNING org (not the DB default)
  - Agent 5 contract drafting is idempotent under SAMPLE_APPROVED redelivery

Self-cleaning: sweeps every row belonging to the test orgs before and
after (same pattern as test_multi_tenant_event_bus.py).
"""

from __future__ import annotations

import pytest
from sqlalchemy import delete

from coffee_export.agents.agent5_compliance import Agent5
from coffee_export.database.base import SessionLocal
from coffee_export.database.models import (
    Account,
    AccountActivity,
    ComplianceDocument,
    Contract,
    ContractLineItem,
    CustomsDocument,
    InboxMessage,
    Lead,
    MessageThread,
    SampleRequest,
    SampleShipment,
    Shipment,
)
from coffee_export.events import SAMPLE_APPROVED, EventBus
from coffee_export.state.exceptions import NotFoundError
from coffee_export.state.state_manager import StateManager

ORG_A = "org-scope-test-a"
ORG_B = "org-scope-test-b"
TEST_ORGS = (ORG_A, ORG_B)


def _sweep() -> None:
    """Delete every row belonging to the test orgs (idempotency guard).

    Children before parents (FK order): activities → accounts, docs →
    contracts/shipments, shipments → contracts, history/tags/contacts →
    leads.
    """
    with SessionLocal() as session:
        for model in (
            # accounts cluster
            AccountActivity, Account,
            # contract cluster
            ComplianceDocument, ContractLineItem,
            # shipment cluster
            CustomsDocument, Shipment,
            Contract,
            # sample cluster
            SampleShipment, SampleRequest,
            # messaging cluster
            InboxMessage, MessageThread,
            # leads (tags/contacts/history cascade on delete)
            Lead,
        ):
            session.execute(
                delete(model).where(model.organization_id.in_(TEST_ORGS))
            )
        session.commit()
    # Events reference entities by id only — clean by org.
    from coffee_export.database.models.events import Event

    with SessionLocal() as session:
        session.execute(delete(Event).where(Event.organization_id.in_(TEST_ORGS)))
        session.commit()


@pytest.fixture()
def orgs():
    _sweep()
    yield
    _sweep()


def _lead_in(sm: StateManager, name: str) -> str:
    lead_id = sm.create_lead(
        company_name=name,
        headquarters_country="Germany",
        priority_tier="A",
        recommended_vp="VP1",
        outreach_language="EN",
    )
    return lead_id


def _decided_lead_in(sm: StateManager, name: str) -> str:
    """A lead walked to DECIDED_APPROVED (ready for Agent 5)."""
    lead_id = _lead_in(sm, name)
    for state, agent in [
        ("ENRICHED", "Agent 2"),
        ("IN_SEQUENCE", "Agent 3"),
        ("QUALIFIED", "Agent 3"),
        ("SAMPLE_DISPATCHED", "Agent 4"),
        ("SAMPLE_FEEDBACK_DUE", "Agent 4"),
        ("DECIDED_APPROVED", "Agent 4"),
    ]:
        sm.update_lead_state(lead_id, state, agent=agent, current_agent="Agent 5")
    return lead_id


# ──────────────────────────────────────────────────────────────
# 1. LEAD mutations
# ──────────────────────────────────────────────────────────────

def test_lead_mutations_are_org_scoped(orgs):
    with StateManager(organization_id=ORG_A) as a, StateManager(organization_id=ORG_B) as b:
        lead_id = _lead_in(a, "Scope Test Lead A")

        # Same org works.
        assert a.update_lead_state(lead_id, "ENRICHED", agent="Agent 2") is True
        assert a.set_lead_field(lead_id, priority_tier="S") is True
        assert a.add_tag(lead_id, "organic") is True

        # Cross-org: indistinguishable from a missing lead.
        with pytest.raises(NotFoundError):
            b.update_lead_state(lead_id, "QUALIFIED", agent="Agent 3")
        with pytest.raises(NotFoundError):
            b.set_lead_field(lead_id, priority_tier="C")
        with pytest.raises(NotFoundError):
            b.add_tag(lead_id, "cross-org-tag")

        # Nothing leaked: the lead still belongs to A with A's values.
        lead = a.get_lead(lead_id)
        assert lead["current_state"] == "ENRICHED"
        assert lead["priority_tier"] == "S"
        assert "organic" in lead["tags"]
        assert "cross-org-tag" not in lead["tags"]
        assert b.get_lead(lead_id) is None


# ──────────────────────────────────────────────────────────────
# 2. CONTRACT + COMPLIANCE mutations
# ──────────────────────────────────────────────────────────────

def test_contract_mutations_are_org_scoped(orgs):
    with StateManager(organization_id=ORG_A) as a, StateManager(organization_id=ORG_B) as b:
        lead_id = _decided_lead_in(a, "Contract Scope Lead A")
        contract_id = a.create_contract(
            lead_id=lead_id, incoterm="FOB", total_value=1000, total_volume_bags=10
        )

        # Same org works.
        assert a.update_contract_status(contract_id, "pending_signature") is True
        doc_id = a.add_compliance_document(contract_id, "certificate_of_origin")
        assert a.update_compliance_document(doc_id, status="submitted") is True

        # Cross-org contract status: blocked.
        with pytest.raises(NotFoundError):
            b.update_contract_status(contract_id, "cancelled")
        # Cross-org child rows on a foreign contract: blocked.
        with pytest.raises(NotFoundError):
            b.add_compliance_document(contract_id, "phytosanitary_cert")
        with pytest.raises(NotFoundError):
            b.add_contract_line_item(
                contract_id=contract_id, lot_id="LOT-X", quantity_bags=1, unit_price=1.0
            )
        # Cross-org compliance doc update: blocked (treated as missing).
        with pytest.raises(NotFoundError):
            b.update_compliance_document(doc_id, status="approved")
        assert b.get_compliance_document(doc_id) is None

        # Contract untouched by every blocked attempt.
        contract = a.get_contract(contract_id)
        assert contract["status"] == "pending_signature"
        assert contract["line_items"] == []


# ──────────────────────────────────────────────────────────────
# 3. SHIPMENT + CUSTOMS mutations
# ──────────────────────────────────────────────────────────────

def test_shipment_mutations_are_org_scoped(orgs):
    with StateManager(organization_id=ORG_A) as a, StateManager(organization_id=ORG_B) as b:
        lead_id = _decided_lead_in(a, "Shipment Scope Lead A")
        contract_id = a.create_contract(
            lead_id=lead_id, incoterm="FOB", total_value=1000, total_volume_bags=10
        )
        shipment_id = a.create_shipment(contract_id=contract_id)
        assert a.get_shipment(shipment_id)["organization_id"] == ORG_A

        # Same org works.
        assert a.update_shipment(shipment_id, carrier="Maersk") is True
        cdoc_id = a.add_customs_document(shipment_id, "bill_of_lading")
        assert a.update_customs_document(cdoc_id, status="cleared") is True

        # Cross-org: blocked everywhere.
        with pytest.raises(NotFoundError):
            b.update_shipment(shipment_id, carrier="Hapag-Lloyd")
        with pytest.raises(NotFoundError):
            b.add_customs_document(shipment_id, "insurance_cert")
        with pytest.raises(NotFoundError):
            b.add_shipment_item(shipment_id, lot_id="LOT-X", quantity_bags=1)
        with pytest.raises(NotFoundError):
            b.update_customs_document(cdoc_id, status="draft")

        assert a.get_shipment(shipment_id)["carrier"] == "Maersk"
        assert b.get_shipment(shipment_id) is None  # org-scoped read


# ──────────────────────────────────────────────────────────────
# 4. ACCOUNTS — org stamping + cross-org invisibility
# ──────────────────────────────────────────────────────────────

def test_accounts_are_org_stamped_and_isolated(orgs):
    with StateManager(organization_id=ORG_A) as a, StateManager(organization_id=ORG_B) as b:
        lead_id = _decided_lead_in(a, "Account Scope Lead A")

        account_id = a.create_account(lead_id=lead_id)
        account = a.get_account(account_id)
        assert account["organization_id"] == ORG_A  # stamped, not DB-default

        # Org B cannot see or touch A's account.
        assert b.get_account(account_id) is None
        assert b.get_account_by_lead(lead_id) is None
        with pytest.raises(NotFoundError):
            b.update_account(account_id, relationship_status="churned")
        with pytest.raises(NotFoundError):
            b.add_account_activity(account_id, "call", summary="cold call")

        # Org B creating "an account for the same lead" makes its OWN row —
        # it never receives A's account by accident.
        b_account_id = b.create_account(lead_id=lead_id)
        assert b_account_id != account_id
        assert b.get_account(b_account_id)["organization_id"] == ORG_B
        assert a.get_account(b_account_id) is None

        # Same-org activity flow works and stamps the org.
        act_id = a.add_account_activity(account_id, "delivery_followup", summary="ok")
        acts = a.get_account_activities(account_id)
        assert any(x["id"] == act_id for x in acts)
        assert all(x["organization_id"] == ORG_A for x in acts)


# ──────────────────────────────────────────────────────────────
# 5. SAMPLE REQUEST mutations
# ──────────────────────────────────────────────────────────────

def test_sample_request_mutations_are_org_scoped(orgs):
    with StateManager(organization_id=ORG_A) as a, StateManager(organization_id=ORG_B) as b:
        lead_id = _lead_in(a, "Sample Scope Lead A")
        sr_id = a.create_sample_request(
            lead_id=lead_id, sample_type="350g", crop_year="25/26",
            buyer_company="Sample Scope Buyer",
        )
        assert a.get_sample_request(sr_id)["organization_id"] == ORG_A

        assert a.update_sample_request_status(sr_id, "dispatched") is True
        with pytest.raises(NotFoundError):
            b.update_sample_request_status(sr_id, "cancelled")
        with pytest.raises(NotFoundError):
            b.add_lot_to_sample_request(sr_id, lot_id="LOT-X", quantity_grams=100)
        assert a.get_sample_request(sr_id)["status"] == "dispatched"


# ──────────────────────────────────────────────────────────────
# 6. MESSAGING — explicit-org parameter behavior
# ──────────────────────────────────────────────────────────────

def test_message_mutations_honor_explicit_org(orgs):
    with StateManager(organization_id=ORG_A) as a:
        lead_id = _lead_in(a, "Messaging Scope Lead A")
        thread_id = f"TH-SCOPE-{lead_id[-6:]}"
        now = "2026-10-09T10:00:00"
        with SessionLocal() as s:
            s.add(MessageThread(
                thread_id=thread_id, lead_id=lead_id, inbox_id=1,
                buyer_email="alias@scope.test", subject="Scope test",
                status="awaiting_exporter",
                last_message_ts=now, created_ts=now, updated_ts=now,
                organization_id=ORG_A,
            ))
            s.commit()
        msg_id = a.log_inbound_message(
            thread_id=thread_id, from_addr="alias@x", to_addr="inbox@x",
            subject="hi", body_text="hello", organization_id=ORG_A,
        )

        # Wrong org: treated as not found (False, no exception leak).
        assert a.mark_message_read(msg_id, organization_id=ORG_B) is False
        assert a.mark_message_status(msg_id, "replied", organization_id=ORG_B) is False
        assert a.update_message_ai_fields(
            msg_id, summary="s", classification="question", organization_id=ORG_B
        ) is False

        # Correct org: works — including via the explicit param the email
        # bridge uses (a bridge process may be scoped to org-system while
        # serving every org's inboxes).
        assert a.mark_message_status(msg_id, "replied", organization_id=ORG_A) is True
        assert a.mark_message_read(msg_id, organization_id=ORG_A) is True
        assert a.update_message_ai_fields(
            msg_id, summary="s", classification="question", organization_id=ORG_A
        ) is True

        # Cross-org thread close: blocked.
        with StateManager(organization_id=ORG_B) as b:
            assert b.close_thread(thread_id) is False
        assert a.close_thread(thread_id, reason="done") is True


# ──────────────────────────────────────────────────────────────
# 7. AGENT 5 — idempotent contract drafting on event redelivery
# ──────────────────────────────────────────────────────────────

def test_agent5_contract_drafting_is_idempotent(orgs):
    with StateManager(organization_id=ORG_A) as sm:
        lead_id = _decided_lead_in(sm, "Agent5 Idempotency Lead")
        sr_id = sm.create_sample_request(
            lead_id=lead_id, sample_type="350g", crop_year="25/26",
            buyer_company="Idempotency Buyer GmbH",
        )

    with EventBus(organization_id=ORG_A) as bus:
        for _ in range(3):  # at-least-once redelivery: 3 copies
            bus.publish(
                event_type=SAMPLE_APPROVED,
                entity_type="sample_request",
                entity_id=sr_id,
                payload={
                    "sample_request_id": sr_id,
                    "lead_id": lead_id,
                    "lot_id": "",
                    "decision": "approved",
                    "buyer_target_fob": 4.5,
                    "buyer_target_volume_bags": 100,
                    "buyer_target_port": "Hamburg",
                    "buyer_payment_terms": "LC at sight",
                },
                published_by="Agent 4",
            )

    with Agent5(organization_id=ORG_A) as agent:
        events = agent.get_leads_to_process()
        assert len(events) == 3
        first = agent.process_lead(events[0])
        assert first["action"] == "contract_created", first
        contract_id = first["contract_id"]

        # Redeliveries of the SAME approval: no second contract, no second
        # checklist, no second CONTRACT_DRAFTED.
        for replay in events[1:]:
            result = agent.process_lead(replay)
            assert result["action"] == "contract_exists", result
            assert result["contract_id"] == contract_id

    with StateManager(organization_id=ORG_A) as sm:
        contracts = sm.get_contracts(lead_id=lead_id)
        assert len(contracts) == 1, "redelivery must not duplicate contracts"
        docs = sm.get_compliance_documents(contract_id)
        assert docs, "checklist generated once"

    with EventBus(organization_id=ORG_A) as bus:
        drafted = bus.replay(event_type="CONTRACT_DRAFTED", limit=10)
        drafted = [e for e in drafted if e.get("payload", {}).get("lead_id") == lead_id]
        assert len(drafted) == 1, "redelivery must not duplicate CONTRACT_DRAFTED"

    # Cross-org: an org-B Agent 5 run cannot draft from A's approval.
    with EventBus(organization_id=ORG_A) as bus:
        bus.publish(
            event_type=SAMPLE_APPROVED,
            entity_type="sample_request",
            entity_id=sr_id,
            payload={
                "sample_request_id": sr_id,
                "lead_id": lead_id,
                "decision": "approved",
                "buyer_target_fob": 4.5,
                "buyer_target_volume_bags": 100,
                "buyer_target_port": "Hamburg",
            },
            published_by="Agent 4",
        )
    with Agent5(organization_id=ORG_B) as agent:
        events = agent.get_leads_to_process()
        # The org-B bus never delivered A's event (bus-level isolation), and
        # even a forged payload cannot reach A's lead.
        for e in events:
            result = agent.process_lead(e)
            if result.get("action") == "skipped":
                assert "not found" in result["reason"]
