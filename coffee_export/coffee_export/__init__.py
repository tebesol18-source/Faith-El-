"""
Coffee Export — Multi-Agent System for Ethiopian Green Coffee Export
====================================================================

A production-grade system for managing the full export lifecycle:
  - Lead research & enrichment (Agent 2)
  - Outreach & qualification (Agent 3)
  - Sample management (Agent 4)
  - Supplier & inventory (Agent 1)
  - Legal & compliance (Agent 5)
  - Logistics & shipping (Agent 6)
  - Sales & relationship management (Agent 7)

Architecture:
  - SQLite database (upgradeable to PostgreSQL) — single source of truth
  - SQLAlchemy ORM models
  - StateManager — single entry point for all state mutations
  - EventBus — decoupled inter-agent communication
  - TaskQueue (APScheduler) — scheduled + background tasks
  - AgentRunner — executes agents with proper lifecycle
  - Streamlit dashboard — operator interface
"""

__version__ = "0.1.0"
__author__ = "Coffee Export Team"
