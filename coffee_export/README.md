# Coffee Export — Multi-Agent ERP System

A production-grade, AI-powered ERP system for managing Ethiopian green coffee export, from lead research through contract execution, logistics, and long-term buyer relationships.

## What This System Does

```
Agent 2 (Enrich) → Agent 3 (Outreach) → Agent 4 (Sample) → Agent 1 (Inventory)
         ↑                                          ↓
    Agent 7 (Relationship) ← Agent 6 (Logistics) ← Agent 5 (Contract)
         ↓ (repeat order)
    Agent 4 (skip outreach, straight to sample)
```

7 AI agents work together through an event bus, managed by a centralized StateManager, with a Streamlit dashboard for operators.

## Quick Start

```bash
# 1. Extract and enter the project
cd coffee_export

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env

# 5. Initialize database
alembic upgrade head

# 6. Verify setup
python scripts/verify_setup.py

# 7. Start the dashboard
python scripts/run_dashboard.py
```

Dashboard opens at **http://localhost:8501**

## Key Features

- **7 AI Agents** — Supplier, Lead Research, Outreach, Sample Management, Legal/Compliance, Logistics, Relationship Management
- **AI Gateway** — Multi-provider LLM support (GLM, OpenAI, Claude, Gemini, Qwen, Ollama) with automatic fallback, cost tracking, and caching
- **Streamlit Dashboard** — 11 pages including pipeline overview, global search, notifications, agent controls, AI memory viewer, and AI monitoring
- **Conversation Memory** — Agent 3 remembers past buyer interactions and personalizes future messages
- **Compliance Expert** — Agent 5 knows what documentation each destination country requires and blocks contract signing until all docs are approved
- **Invoice Generator** — Auto-generates commercial invoices and packing lists from contract data
- **Production Architecture** — StateManager (single write path), EventBus (37 event types), TaskQueue (10 scheduled jobs), SQLAlchemy 2.0 ORM, Alembic migrations

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Database | SQLite (upgradeable to PostgreSQL) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Dashboard | Streamlit |
| Task Queue | APScheduler |
| AI Gateway | Custom (7 LLM providers) |
| Code Quality | Black + Ruff + Pre-commit |
| Testing | Pytest |

## Documentation

- [Setup Guide](SETUP.md) — Complete installation instructions (Windows/macOS/Linux)
- [Architecture Overview](docs/architecture/overview.md) — System design + data flow
- [Agent Responsibilities](docs/agents/responsibilities.md) — All 7 agents
- [Database Schema](docs/schema/schema.md) — 36 tables, ER diagram, state machine
- [Design Reasoning](docs/schema/design_reasoning.md) — Why each table exists
- [Agent Interactions](docs/architecture/agent_interactions.md) — Allowed interactions per agent
- [StateManager API](docs/api/state_manager.md) — Full API reference

## Running Agents

```bash
python scripts/run_agent1.py run          # Supplier & Inventory
python scripts/run_agent2.py enrich leads.csv  # Lead Enrichment
python scripts/run_agent3.py run          # Outreach & Qualification
python scripts/run_agent4.py run          # Sample Management
python scripts/run_agent5.py run          # Legal & Compliance
python scripts/run_agent6.py run          # Logistics & Shipping
python scripts/run_agent7.py run          # Relationship Management
```

## Running Tests

```bash
pytest                           # All tests
python -m tests.test_agent4      # Individual agent test
python scripts/verify_setup.py   # Project setup verification
```

## AI Providers (Optional)

Set API keys in `.env` to enable real LLM capabilities:

```bash
GLM_API_KEY=your_zhipu_key         # GLM-4 (cost-effective)
OPENAI_API_KEY=your_openai_key     # GPT-4o
ANTHROPIC_API_KEY=your_claude_key  # Claude 3.5 Sonnet
GOOGLE_API_KEY=your_gemini_key     # Gemini 1.5 Pro
DASHSCOPE_API_KEY=your_qwen_key    # Qwen-Plus
```

The system works without any API keys — it uses a Mock provider for testing.

## License

Proprietary — Coffee Export Team
