"""add supervisor runtime tables and finance tables

Revision ID: f7c8d9e0a1b2
Revises: a1b2c3d4e5f6
Create Date: 2026-07-28

Adds 10 tables that were previously created at runtime by the supervisor
or were missing from the migration chain:

Supervisor runtime (5 tables, created by scripts/supervisor.js):
  - agent_controls:       pause/resume state, error counts, auto-restart config
  - agent_feedback:       human-in-the-loop decisions (approve/reject) for learning
  - buyer_memory:         derived memory items per lead (5 sources: contracts, samples, feedback, inbox, leads)
  - pending_agent_actions: actions awaiting admin approval before execution
  - supervisor_log:       audit trail of supervisor decisions and faults

Finance (5 tables, modeled in ORM but never migrated):
  - invoices:    issued to buyer per contract (issued → partial → paid → overdue)
  - payments:    incoming money from buyer (N per invoice)
  - commissions: 2% platform cut per contract (accrued → earned → paid)
  - costs:       operational expenses (freight, insurance, docs, etc.)
  - profits:     calculated net margin per contract (revenue - costs - commission)

These tables already exist in the production DB (created by supervisor.js
and finance modules at first run). This migration makes the schema explicit
and reproducible from scratch. Uses `IF NOT EXISTS` semantics so it is
safe to run on databases where the tables already exist.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f7c8d9e0a1b2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the 10 new tables. Uses raw SQL with IF NOT EXISTS so the
    migration is safe to run on databases where the tables were already
    created at runtime by supervisor.js or the finance modules.
    """
    # ═══ Supervisor runtime tables ═══

    op.execute("""
        CREATE TABLE IF NOT EXISTS agent_controls (
            agent_id TEXT PRIMARY KEY,
            is_paused INTEGER NOT NULL DEFAULT 0,
            paused_by TEXT,
            paused_ts TEXT,
            last_run_ts TEXT,
            last_run_status TEXT DEFAULT 'never',
            last_error TEXT,
            last_error_ts TEXT,
            run_count INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            consecutive_errors INTEGER NOT NULL DEFAULT 0,
            auto_restart_enabled INTEGER NOT NULL DEFAULT 1,
            max_consecutive_errors INTEGER NOT NULL DEFAULT 3,
            created_ts TEXT NOT NULL,
            updated_ts TEXT NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS agent_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_id INTEGER NOT NULL,
            agent_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            target_entity_id TEXT,
            decision TEXT NOT NULL,
            feedback_reason TEXT,
            edited_fields TEXT,
            original_payload TEXT,
            seller_notes TEXT,
            created_ts TEXT NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_feedback_action ON agent_feedback(action_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_feedback_agent ON agent_feedback(agent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_feedback_target ON agent_feedback(target_entity_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS buyer_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id TEXT NOT NULL,
            memory_type TEXT NOT NULL,
            memory_key TEXT NOT NULL,
            memory_value TEXT NOT NULL,
            confidence REAL DEFAULT 0.5,
            source TEXT DEFAULT 'inferred',
            created_ts TEXT NOT NULL,
            updated_ts TEXT NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_buyer_memory_lead ON buyer_memory(lead_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS pending_agent_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            action_description TEXT NOT NULL,
            target_entity_type TEXT,
            target_entity_id TEXT,
            payload TEXT,
            risk_level TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'pending',
            submitted_ts TEXT NOT NULL,
            reviewed_by TEXT,
            reviewed_ts TEXT,
            review_notes TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_pending_actions_status ON pending_agent_actions(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_pending_actions_agent ON pending_agent_actions(agent_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS supervisor_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            agent_id TEXT,
            event_type TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL,
            action_taken TEXT,
            details TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supervisor_log_ts ON supervisor_log(timestamp)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supervisor_log_agent ON supervisor_log(agent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supervisor_log_severity ON supervisor_log(severity)")

    # ═══ Finance tables ═══

    op.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            invoice_id TEXT PRIMARY KEY,
            contract_id TEXT NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
            deal_id TEXT,
            lead_id TEXT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
            invoice_number TEXT NOT NULL,
            issue_date TEXT NOT NULL,
            due_date TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            subtotal_usd REAL NOT NULL,
            tax_usd REAL NOT NULL DEFAULT 0.0,
            total_usd REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'issued',
            paid_amount_usd REAL NOT NULL DEFAULT 0.0,
            outstanding_balance_usd REAL NOT NULL,
            payment_terms TEXT,
            created_ts TEXT NOT NULL,
            updated_ts TEXT NOT NULL,
            CHECK (status IN ('issued', 'partial', 'paid', 'overdue', 'cancelled'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_contract ON invoices(contract_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_lead ON invoices(lead_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_status ON invoices(status)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            payment_id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
            contract_id TEXT,
            lead_id TEXT,
            amount_usd REAL NOT NULL,
            payment_date TEXT NOT NULL,
            payment_method TEXT NOT NULL,
            reference_number TEXT,
            bank_name TEXT,
            status TEXT NOT NULL DEFAULT 'confirmed',
            notes TEXT,
            created_ts TEXT NOT NULL,
            CHECK (status IN ('pending', 'confirmed', 'disputed')),
            CHECK (payment_method IN ('wire', 'lc', 'paypal', 'crypto', 'other'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payments_invoice ON payments(invoice_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payments_date ON payments(payment_date)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS commissions (
            commission_id TEXT PRIMARY KEY,
            contract_id TEXT NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
            deal_id TEXT,
            rate_pct REAL NOT NULL DEFAULT 2.0,
            base_value_usd REAL NOT NULL,
            commission_usd REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'accrued',
            paid_ts TEXT,
            created_ts TEXT NOT NULL,
            updated_ts TEXT NOT NULL,
            CHECK (status IN ('accrued', 'earned', 'paid'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_commissions_contract ON commissions(contract_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_commissions_status ON commissions(status)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS costs (
            cost_id TEXT PRIMARY KEY,
            contract_id TEXT NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
            deal_id TEXT,
            cost_type TEXT NOT NULL,
            description TEXT,
            amount_usd REAL NOT NULL,
            vendor TEXT,
            incurred_date TEXT NOT NULL,
            created_ts TEXT NOT NULL,
            CHECK (cost_type IN ('freight', 'insurance', 'inspection', 'sampling', 'courier', 'bank', 'docs', 'other'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_costs_contract ON costs(contract_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS profits (
            profit_id TEXT PRIMARY KEY,
            contract_id TEXT NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
            deal_id TEXT,
            revenue_usd REAL NOT NULL,
            total_costs_usd REAL NOT NULL,
            commission_usd REAL NOT NULL,
            net_profit_usd REAL NOT NULL,
            margin_pct REAL NOT NULL,
            last_updated_ts TEXT NOT NULL,
            created_ts TEXT NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_profits_contract ON profits(contract_id)")


def downgrade() -> None:
    # Finance tables (drop in reverse FK order: profits → costs → commissions → payments → invoices)
    op.drop_index("ix_profits_contract", table_name="profits")
    op.drop_table("profits")

    op.drop_index("ix_costs_contract", table_name="costs")
    op.drop_table("costs")

    op.drop_index("ix_commissions_status", table_name="commissions")
    op.drop_index("ix_commissions_contract", table_name="commissions")
    op.drop_table("commissions")

    op.drop_index("ix_payments_date", table_name="payments")
    op.drop_index("ix_payments_invoice", table_name="payments")
    op.drop_table("payments")

    op.drop_index("ix_invoices_status", table_name="invoices")
    op.drop_index("ix_invoices_lead", table_name="invoices")
    op.drop_index("ix_invoices_contract", table_name="invoices")
    op.drop_table("invoices")

    # Supervisor runtime tables
    op.drop_index("ix_supervisor_log_severity", table_name="supervisor_log")
    op.drop_index("ix_supervisor_log_agent", table_name="supervisor_log")
    op.drop_index("ix_supervisor_log_ts", table_name="supervisor_log")
    op.drop_table("supervisor_log")

    op.drop_index("ix_pending_actions_agent", table_name="pending_agent_actions")
    op.drop_index("ix_pending_actions_status", table_name="pending_agent_actions")
    op.drop_table("pending_agent_actions")

    op.drop_index("ix_buyer_memory_lead", table_name="buyer_memory")
    op.drop_table("buyer_memory")

    op.drop_index("ix_agent_feedback_target", table_name="agent_feedback")
    op.drop_index("ix_agent_feedback_agent", table_name="agent_feedback")
    op.drop_index("ix_agent_feedback_action", table_name="agent_feedback")
    op.drop_table("agent_feedback")

    op.drop_table("agent_controls")
