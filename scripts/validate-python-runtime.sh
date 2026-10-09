#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Faith-El ERP — Python runtime deployment validation (Phase F hardening).
#
# WHY THIS EXISTS: the Node supervisor spawns the Python agents through the
# interpreter resolved by resolvePythonBin() (scripts/supervisor.js):
#   1. $SUPERVISOR_PYTHON_BIN (explicit override)
#   2. coffee_export/venv/bin/python  (production layout — deploy-oracle.sh)
#   3. .venv/bin/python               (dev/test layout — run-python-tests.sh)
#   4. python3                        (PATH fallback — failures observable)
# A missing venv or incomplete dependencies do not crash the supervisor —
# they surface as AGENT_ERROR rows while events stay pending. That honesty
# is good, but it means a BROKEN Python layout can ship unnoticed. This
# script validates the layout BEFORE relying on it in production.
#
# Run it ON THE DEPLOYMENT HOST after deploy-oracle.sh:
#   bash scripts/validate-python-runtime.sh            # read-only checks
#   bash scripts/validate-python-runtime.sh --tick     # + one live supervisor tick
#   bash scripts/validate-python-runtime.sh --venv /path/to/venv
#
# Exit code 0 = every check passed. Non-zero = do not rely on the runtime.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_ARG=""
DO_TICK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --venv)  VENV_ARG="$2"; shift 2 ;;
    --tick)  DO_TICK=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1 (see --help)"; exit 2 ;;
  esac
done

FAILURES=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILURES=$((FAILURES + 1)); }

# ── 1. Interpreter resolution (mirrors resolvePythonBin) ───────────────────
if [[ -n "$VENV_ARG" ]]; then
  PYTHON_BIN="$VENV_ARG/bin/python"
elif [[ -n "${SUPERVISOR_PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$SUPERVISOR_PYTHON_BIN"
elif [[ -x "$REPO_ROOT/coffee_export/venv/bin/python" ]]; then
  PYTHON_BIN="$REPO_ROOT/coffee_export/venv/bin/python"
elif [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
  PYTHON_BIN="$REPO_ROOT/.venv/bin/python"
else
  PYTHON_BIN="python3"
fi
if [[ "$PYTHON_BIN" == "python3" ]]; then
  echo "  ⚠ no venv found (coffee_export/venv or .venv) — falling back to PATH python3."
  echo "    On a production host this is almost certainly wrong (deploy-oracle.sh"
  echo "    creates coffee_export/venv). Continuing with the fallback..."
fi
echo "Interpreter: $PYTHON_BIN"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1 && [[ ! -x "$PYTHON_BIN" ]]; then
  fail "interpreter not found/executable: $PYTHON_BIN"
  echo "━━━ validate-python-runtime: FAILED (no interpreter) ━━━"
  exit 1
fi
pass "interpreter resolves: $PYTHON_BIN"

# ── 2. Python version (project requires >=3.11) ────────────────────────────
if "$PYTHON_BIN" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
  pass "python version: $("$PYTHON_BIN" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))') (>=3.11)"
else
  fail "python too old: $("$PYTHON_BIN" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))') — project requires >=3.11"
fi

# ── 3. Runtime imports (the exact modules the supervisor spawns) ───────────
cd "$REPO_ROOT/coffee_export" || { echo "✗ coffee_export/ not found"; exit 1; }
IMPORTS=(
  "coffee_export.agents.agent5_compliance"   # Agent 5 — contract drafting (SAMPLE_APPROVED)
  "coffee_export.agents.agent6_logistics"    # Agent 6 — shipment creation (CONTRACT_SIGNED)
  "coffee_export.agents.agent7_relationship" # Agent 7 — accounts + follow-ups (SHIPMENT_DELIVERED)
  "coffee_export.state.state_manager"        # org-scoped mutations
  "coffee_export.events.event_bus"           # org-scoped bus (claim/consume/retry)
  "coffee_export.messaging.gateway"          # email bridge
  "sqlalchemy" "alembic" "bcrypt" "cryptography" "dotenv"
)
for mod in "${IMPORTS[@]}"; do
  if "$PYTHON_BIN" -c "import $mod" 2>/dev/null; then
    pass "import $mod"
  else
    fail "import $mod — run: $PYTHON_BIN -m pip install -r requirements.txt bcrypt"
  fi
done

# ── 4. Agent CLI launch smoke (the exact entry points the supervisor runs) ─
for agent in 5 6 7; do
  script="scripts/run_agent$agent.py"
  if "$PYTHON_BIN" "$script" --help >/dev/null 2>&1; then
    pass "$script launches (--help exit 0)"
  else
    fail "$script does not launch — check the traceback above"
  fi
done

# ── 5. Database + migrations (read-only) ───────────────────────────────────
DB_URL="${COFFEE_DATABASE_URL:-sqlite:///$REPO_ROOT/state/coffee_export.db}"
DB_FILE="${DB_URL#sqlite:///}"
if [[ -f "$DB_FILE" ]]; then
  pass "database file present: $DB_FILE"
else
  fail "database file missing: $DB_FILE (set COFFEE_DATABASE_URL on non-default hosts)"
fi
if [[ -f "$DB_FILE" ]]; then
  CURRENT="$(COFFEE_DATABASE_URL="$DB_URL" "$PYTHON_BIN" -m alembic current 2>/dev/null | tail -1 | awk '{print $1}')"
  HEAD="$(COFFEE_DATABASE_URL="$DB_URL" "$PYTHON_BIN" -m alembic heads 2>/dev/null | tail -1 | awk '{print $1}')"
  if [[ -n "$CURRENT" && -n "$HEAD" && "$CURRENT" == "$HEAD" ]]; then
    pass "schema at head: $CURRENT"
  else
    fail "schema NOT at head (current='$CURRENT' head='$HEAD') — run: $PYTHON_BIN -m alembic upgrade head"
  fi
fi

# ── 6. Optional live tick (writes supervisor_log rows — opt in) ────────────
if [[ "$DO_TICK" == "1" ]]; then
  echo "  … running ONE supervisor tick (node scripts/supervisor.js --once)"
  if ( cd "$REPO_ROOT" && COFFEE_DATABASE_URL="$DB_URL" \
       ${SUPERVISOR_PYTHON_BIN:+SUPERVISOR_PYTHON_BIN="$SUPERVISOR_PYTHON_BIN"} \
       node scripts/supervisor.js --once ) >/tmp/validate-python-tick.log 2>&1; then
    pass "supervisor single tick exited 0 (log: /tmp/validate-python-tick.log)"
  else
    fail "supervisor single tick FAILED — see /tmp/validate-python-tick.log"
  fi
else
  echo "  (skip live tick — pass --tick to run one)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "━━━ validate-python-runtime: $FAILURES failure(s) ━━━"
exit "$FAILURES"
