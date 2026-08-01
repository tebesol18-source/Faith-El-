# Setup Guide — Coffee Export ERP

Complete setup instructions for Windows, macOS, and Linux.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Python Installation](#2-python-installation)
3. [Project Download & Extraction](#3-project-download--extraction)
4. [Virtual Environment Creation](#4-virtual-environment-creation)
5. [Dependency Installation](#5-dependency-installation)
6. [Environment Variables](#6-environment-variables)
7. [Database Setup & Alembic Migrations](#7-database-setup--alembic-migrations)
8. [Starting the Dashboard](#8-starting-the-dashboard)
9. [Running the Agents](#9-running-the-agents)
10. [Running Tests](#10-running-tests)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum Version | Check Command |
|-------------|----------------|---------------|
| Python | 3.11+ (3.12 recommended) | `python --version` |
| Git | 2.30+ | `git --version` |
| pip | 23+ | `pip --version` |

### Optional (for AI providers)
- OpenAI API key (for GPT-4o)
- Anthropic API key (for Claude 3.5)
- Google API key (for Gemini)
- Zhipu API key (for GLM-4)
- DashScope API key (for Qwen)
- [Ollama](https://ollama.ai/) installed locally (for free self-hosted LLM)

> **Note:** The system works without any API keys — it uses a Mock provider for testing. Set API keys in `.env` to enable real LLM capabilities.

---

## 2. Python Installation

### Windows

1. Download Python 3.12 from [python.org](https://www.python.org/downloads/)
2. Run the installer
3. **Important:** Check "Add Python to PATH" during installation
4. Verify:
   ```cmd
   python --version
   pip --version
   ```

### macOS

```bash
# Using Homebrew (recommended)
brew install python@3.12

# Verify
python3 --version
pip3 --version
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install python3.12 python3.12-venv python3-pip

# Verify
python3 --version
pip3 --version
```

### Linux (CentOS/RHEL/Fedora)

```bash
sudo dnf install python3.12 python3-pip

# Verify
python3 --version
pip3 --version
```

---

## 3. Project Download & Extraction

### From ZIP archive

1. Download `coffee_export.zip`
2. Extract to your preferred location:
   - **Windows:** Right-click → "Extract All..." → Choose destination
   - **macOS:** Double-click the ZIP file
   - **Linux:** `unzip coffee_export.zip`

3. Navigate to the project directory:
   ```bash
   cd coffee_export
   ```

### From Git (if using a repository)

```bash
git clone <repository-url> coffee_export
cd coffee_export
```

---

## 4. Virtual Environment Creation

### Windows

```cmd
python -m venv venv
venv\Scripts\activate
```

### macOS & Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` in your terminal prompt. All subsequent commands should be run with the virtual environment active.

---

## 5. Dependency Installation

```bash
# Upgrade pip
pip install --upgrade pip

# Install all dependencies
pip install -r requirements.txt
```

This installs:
- SQLAlchemy 2.0 (ORM)
- Streamlit (Dashboard)
- APScheduler (Task Queue)
- python-dotenv (Configuration)
- Alembic (Migrations)
- pandas, openpyxl (Data handling)
- pydantic (Validation)
- rich (Logging)
- psutil (System health monitoring)
- black, ruff, pre-commit (Code quality)
- pytest, pytest-cov (Testing)

---

## 6. Environment Variables

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# ── App ──
APP_NAME=Coffee Export
APP_ENV=development
APP_TIMEZONE=Africa/Addis_Ababa
APP_LOG_LEVEL=INFO

# ── Database ──
DATABASE_URL=sqlite:///data/coffee_export.db

# ── Sample Budget ──
SAMPLE_BUDGET_FULL_SETS=3
SAMPLE_BUDGET_FALLBACK_150G=2
SAMPLE_BUDGET_TYPE_B=2

# ── Dashboard ──
DASHBOARD_PORT=8501
DASHBOARD_HOST=localhost

# ── AI Providers (optional — leave blank to use Mock provider) ──
# GLM_API_KEY=your_zhipu_key
# OPENAI_API_KEY=your_openai_key
# ANTHROPIC_API_KEY=your_claude_key
# GOOGLE_API_KEY=your_gemini_key
# DASHSCOPE_API_KEY=your_qwen_key
# OLLAMA_BASE_URL=http://localhost:11434
```

---

## 7. Database Setup & Alembic Migrations

### Initialize the database

```bash
# Apply all migrations (creates all 36 tables)
alembic upgrade head
```

### Verify the database

```bash
# Check current migration
alembic current

# Show migration history
alembic history
```

### Seed test data (optional)

```bash
# Seed inventory with 11 test lots
python -c "
from coffee_export.database.base import init_db, ensure_dirs
ensure_dirs()
init_db()
print('Database initialized')
"
```

### Reset the database (if needed)

```bash
# Delete the database file
rm data/coffee_export.db        # macOS/Linux
del data\coffee_export.db       # Windows

# Re-apply migrations
alembic upgrade head
```

---

## 8. Starting the Dashboard

```bash
# Method 1: Using the launcher script
python scripts/run_dashboard.py

# Method 2: Using Streamlit directly
streamlit run coffee_export/dashboard/app.py --server.port 8501
```

The dashboard opens at **http://localhost:8501** with 11 pages:

| Page | Description |
|------|-------------|
| 📊 Overview | Pipeline snapshot with KPI cards |
| 🔔 Notifications | Action items / daily to-do list |
| 🔍 Search | Global search across all entities |
| 👥 Leads | Lead management with filters |
| 🧠 AI Memory | Conversation memory + buyer profiles |
| 📦 Inventory | Lot inventory with EUDR status |
| 🧪 Samples | Sample tracking + budget |
| 🤖 Agent Controls | Start/pause/run agents |
| 📡 Events | Event bus monitor |
| 🤖 AI Monitor | LLM usage, costs, provider status |
| 💻 System Health | CPU, memory, disk, DB size |

---

## 9. Running the Agents

Each agent has a CLI script in `scripts/`:

### Agent 1 — Supplier & Inventory
```bash
# Run event-driven (process SAMPLE_REQUESTED events)
python scripts/run_agent1.py run

# Run maintenance (EUDR audit, QA review, stock freshness)
python scripts/run_agent1.py maintenance

# Find a substitute lot
python scripts/run_agent1.py substitute LOT-25-0001
```

### Agent 2 — Lead Research & Enrichment
```bash
# Enrich leads from a CSV file
python scripts/run_agent2.py enrich data/raw_leads.csv

# Enrich a single lead from JSON
python scripts/run_agent2.py enrich-single leads/falcon.json

# Show enrichment stats
python scripts/run_agent2.py stats
```

### Agent 3 — Outreach & Qualification
```bash
# Run event-driven (process LEAD_ENRICHED events)
python scripts/run_agent3.py run

# Draft an outreach message
python scripts/run_agent3.py draft L-2026-00047 --step 2

# Record a buyer reply
python scripts/run_agent3.py reply L-2026-00047 --type positive --content "Yes, interested"

# Record a QUAL answer
python scripts/run_agent3.py qual-answer L-2026-00047 --question Q1 --answer "Yes, 5 FCL/year"

# Check QUAL gate status
python scripts/run_agent3.py qual-status L-2026-00047

# Show outreach stats
python scripts/run_agent3.py stats
```

### Agent 4 — Sample Management
```bash
# Run event-driven (process LEAD_QUALIFIED events)
python scripts/run_agent4.py run

# Recommend lots for a lead
python scripts/run_agent4.py recommend L-2026-00047

# Dispatch a sample
python scripts/run_agent4.py dispatch SR-2026-0001 --carrier DHL --tracking 12345

# Record cupping score
python scripts/run_agent4.py cupping SR-2026-0001 LOT-25-0001 --score 86.5 --defects 5

# Make a decision
python scripts/run_agent4.py decide SR-2026-0001 LOT-25-0001 --decision approved --fob 4.50
```

### Agent 5 — Legal & Compliance
```bash
# Run event-driven (process SAMPLE_APPROVED events)
python scripts/run_agent5.py run

# Check compliance checklist
python scripts/run_agent5.py checklist CT-2026-0001

# Submit a compliance document
python scripts/run_agent5.py submit CT-2026-0001 --type certificate_of_origin --file /docs/co.pdf

# Approve a document
python scripts/run_agent5.py approve --doc-id 1

# Sign a contract (blocked if docs incomplete)
python scripts/run_agent5.py sign CT-2026-0001

# Generate invoice + packing list
python scripts/run_agent5.py generate-invoice CT-2026-0001
python scripts/run_agent5.py generate-packing-list CT-2026-0001
python scripts/run_agent5.py generate-all CT-2026-0001
```

### Agent 6 — Logistics & Shipping
```bash
# Run event-driven (process CONTRACT_SIGNED events)
python scripts/run_agent6.py run

# Book freight
python scripts/run_agent6.py book SH-2026-0001 --carrier Maersk --vessel "MSC Gulsun" \
    --bl MAEU1234567890 --from Djibouti --to Hamburg --etd 2026-07-15 --eta 2026-08-10

# Submit customs document
python scripts/run_agent6.py submit-doc SH-2026-0001 --type bill_of_lading --file /docs/bl.pdf

# Record departure
python scripts/run_agent6.py depart SH-2026-0001

# Record delivery
python scripts/run_agent6.py deliver SH-2026-0001
```

### Agent 7 — Sales & Relationship Management
```bash
# Run event-driven (process SHIPMENT_DELIVERED events)
python scripts/run_agent7.py run

# Log a relationship activity
python scripts/run_agent7.py log ACC-2026-0001 --type call --summary "Discussed 26/27 forward"

# Record NPS
python scripts/run_agent7.py nps ACC-2026-0001 --score 9 --feedback "Great quality"

# Check account health
python scripts/run_agent7.py health ACC-2026-0001

# Show activity timeline
python scripts/run_agent7.py timeline ACC-2026-0001

# Request repeat order
python scripts/run_agent7.py repeat-order ACC-2026-0001 --lots LOT-25-0001
```

---

## 10. Running Tests

### Run all tests

```bash
pytest
```

### Run specific tests

```bash
# StateManager tests
python -m tests.test_state_manager

# Agent tests (each agent)
python -m tests.test_agent2    # Lead enrichment
python -m tests.test_agent3    # Outreach & qualification
python -m tests.test_agent4    # Sample management
python -m tests.test_agent5    # Legal & compliance
python -m tests.test_agent6    # Logistics & shipping
python -m tests.test_agent7    # Relationship management
```

### Run with coverage

```bash
pytest --cov=coffee_export --cov-report=html
# Open htmlcov/index.html in browser
```

### Verify project setup

```bash
python scripts/verify_setup.py
```

---

## 11. Troubleshooting

### "ModuleNotFoundError: No module named 'coffee_export'"

**Cause:** Virtual environment not activated, or project root not on path.

**Fix:**
```bash
# Activate venv
source venv/bin/activate        # macOS/Linux
venv\Scripts\activate           # Windows

# Or set PYTHONPATH
export PYTHONPATH=/path/to/coffee_export:$PYTHONPATH   # macOS/Linux
set PYTHONPATH=C:\path\to\coffee_export                # Windows
```

---

### "alembic: command not found"

**Cause:** Alembic not installed in active venv.

**Fix:**
```bash
pip install alembic
```

---

### "Database is locked"

**Cause:** Another process is using the SQLite database.

**Fix:**
```bash
# Find and kill the process (macOS/Linux)
lsof data/coffee_export.db
kill <PID>

# Or restart your terminal / IDE
```

WAL mode is enabled by default, allowing concurrent reads. Only writes block each other.

---

### "streamlit: command not found"

**Cause:** Streamlit not installed in active venv.

**Fix:**
```bash
pip install streamlit
```

---

### "No such table: leads" (or any table)

**Cause:** Database not initialized — migrations not applied.

**Fix:**
```bash
alembic upgrade head
```

---

### Dashboard shows "Database not available"

**Cause:** Database file missing or migrations not applied.

**Fix:**
```bash
# Check if database exists
ls data/coffee_export.db          # macOS/Linux
dir data\coffee_export.db         # Windows

# If missing, create it
alembic upgrade head
```

---

### AI calls always fall back to Mock provider

**Cause:** No API keys set in `.env`.

**Fix:** Edit `.env` and add at least one provider key:
```bash
GLM_API_KEY=your_key_here
# or
OPENAI_API_KEY=your_key_here
```

The system works fine with Mock — it's designed for graceful fallback.

---

### Pre-commit hooks failing

**Cause:** Code formatting or linting issues.

**Fix:**
```bash
# Run black to format
black .

# Run ruff to lint + autofix
ruff check . --fix

# Re-commit
git add -A
git commit -m "your message"
```

---

### "CHECK constraint failed" when inserting data

**Cause:** Trying to insert a value not in the allowed enum.

**Fix:** Check the model's CHECK constraint. For example, `current_state` must be one of the 13 allowed states. See `coffee_export/state/constants.py` for all allowed values.

---

### Port 8501 already in use

**Cause:** Another Streamlit app or process is using port 8501.

**Fix:**
```bash
# Use a different port
streamlit run coffee_export/dashboard/app.py --server.port 8502
```

Or change `DASHBOARD_PORT=8502` in `.env`.

---

### How to reset everything and start fresh

```bash
# 1. Delete the database
rm data/coffee_export.db          # macOS/Linux
del data\coffee_export.db         # Windows

# 2. Delete all __pycache__ directories
find . -type d -name __pycache__ -exec rm -rf {} +    # macOS/Linux
# Windows: manually delete __pycache__ folders

# 3. Recreate the database
alembic upgrade head

# 4. Verify
python scripts/verify_setup.py

# 5. Start the dashboard
python scripts/run_dashboard.py
```

---

## Quick Start (5 minutes)

```bash
# 1. Extract and enter the project
cd coffee_export

# 2. Create venv
python3 -m venv venv
source venv/bin/activate

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

---

## Project Structure

```
coffee_export/
├── .env.example              # Environment template
├── .gitignore
├── .pre-commit-config.yaml   # Code quality hooks
├── README.md
├── SETUP.md                  # This file
├── requirements.txt
├── pyproject.toml            # black + ruff + pytest config
├── alembic.ini               # Migration config
│
├── alembic/                  # Database migrations
│   ├── env.py
│   ├── script.py.mako
│   └── versions/            # 4 migration files
│
├── coffee_export/            # Main package
│   ├── __init__.py
│   ├── config.py             # Settings (env-var driven)
│   │
│   ├── ai/                   # AI Gateway
│   │   ├── __init__.py
│   │   ├── gateway.py        # AIGateway class
│   │   ├── integration.py    # LLM functions for agents
│   │   ├── templates.py      # Prompt template loader
│   │   └── providers/        # 7 LLM providers
│   │       ├── base.py
│   │       ├── mock.py
│   │       └── providers.py  # OpenAI, Claude, Gemini, GLM, Qwen, Ollama
│   │
│   ├── agents/               # 7 agents
│   │   ├── base.py           # BaseAgent + AgentRunner
│   │   ├── registry.py       # Agent discovery
│   │   ├── agent1_supplier.py
│   │   ├── agent2_enrichment.py
│   │   ├── agent3_outreach.py
│   │   ├── agent4_sample.py
│   │   ├── agent5_compliance.py
│   │   ├── agent6_logistics.py
│   │   └── agent7_relationship.py
│   │
│   ├── database/             # SQLAlchemy ORM
│   │   ├── base.py           # Engine + session factory
│   │   └── models/           # 36 models across 10 files
│   │       ├── infrastructure.py
│   │       ├── lead.py
│   │       ├── outreach.py
│   │       ├── inventory.py
│   │       ├── sample.py
│   │       ├── contract.py
│   │       ├── logistics.py
│   │       ├── relationship.py
│   │       ├── events.py
│   │       ├── memory.py
│   │       └── ai.py
│   │
│   ├── dashboard/            # Streamlit UI (11 pages)
│   │   ├── app.py
│   │   ├── utils.py
│   │   └── pages/
│   │       ├── overview.py
│   │       ├── notifications.py
│   │       ├── search.py
│   │       ├── leads.py
│   │       ├── memory_viewer.py
│   │       ├── inventory.py
│   │       ├── samples.py
│   │       ├── agent_controls.py
│   │       ├── events.py
│   │       ├── ai_monitoring.py
│   │       └── system_health.py
│   │
│   ├── events/               # Event Bus
│   │   ├── event_bus.py
│   │   └── event_types.py    # 37 event types
│   │
│   ├── state/                # StateManager
│   │   ├── state_manager.py  # 60+ methods
│   │   ├── constants.py      # State machine + enums
│   │   └── exceptions.py
│   │
│   ├── tasks/                # Task Queue (APScheduler)
│   │   ├── task_queue.py
│   │   └── jobs.py           # 8 recurring + 2 one-off jobs
│   │
│   └── utils/
│       └── logging.py        # Rich + rotating file logging
│
├── prompts/                  # External prompt templates
│   ├── enrich_lead.md
│   ├── outreach_email.md
│   ├── qualification.md
│   ├── contract_review.md
│   └── nps_analysis.md
│
├── scripts/                  # CLI scripts
│   ├── verify_setup.py
│   ├── run_dashboard.py
│   ├── run_agent1.py
│   ├── run_agent2.py
│   ├── run_agent3.py
│   ├── run_agent4.py
│   ├── run_agent5.py
│   ├── run_agent6.py
│   └── run_agent7.py
│
├── tests/                    # Test suite
│   ├── test_state_manager.py
│   ├── test_agent2.py
│   ├── test_agent3.py
│   ├── test_agent4.py
│   ├── test_agent5.py
│   ├── test_agent6.py
│   └── test_agent7.py
│
├── data/                     # Runtime data (gitignored)
│   ├── coffee_export.db      # SQLite database
│   ├── docs/                 # Lot attachments
│   └── logs/                 # Application logs
│
└── docs/                     # Documentation
    ├── architecture/
    │   ├── overview.md
    │   └── agent_interactions.md
    ├── agents/
    │   └── responsibilities.md
    ├── schema/
    │   ├── schema.md
    │   └── design_reasoning.md
    ├── api/
    │   └── state_manager.md
    └── development/
        └── setup.md
```
