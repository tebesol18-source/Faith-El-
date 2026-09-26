#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Faith-El ERP — hermetic Python test runner
#
# Why this exists: the Python tests (pytest suite + the 8 script-style smoke
# tests) write to whatever database the engine points at. Run against the real
# DB they (a) pollute it with test rows and (b) fail on the second run
# (absolute-count asserts hit leftovers — exactly what happened to
# test_multi_tenant_event_bus before it was made self-cleaning). The agent
# smoke scripts additionally assume a pristine event queue: running them
# sequentially against ONE shared DB makes agents 4 and 6 fail on events
# left by agents 2 and 3.
#
# So this runner gives every suite a FRESH THROWAWAY COPY of the committed DB:
#   1. pytest suite          (bridge, gateway, event bus, config URL parsing)
#   2. agent smoke tests     (Agent 2..7 + StateManager — `python -m tests.X`)
#   3. supervisor single tick (scheduler + health monitor)
#
# The committed DB is never touched (sha-identical before/after a run).
#
# Usage:  npm run test:python     (from the repo root)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${PYTHON_VENV_DIR:-$REPO_ROOT/.venv}"
REAL_DB="$REPO_ROOT/state/coffee_export.db"
THROWAWAY="$REPO_ROOT/state/test-python-coffee_export.db"

if [[ ! -f "$REAL_DB" ]]; then
  echo "[run-python-tests] committed DB not found at $REAL_DB" >&2
  exit 1
fi

# ── 1. Virtualenv + dependencies ────────────────────────────────────────────
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "[run-python-tests] creating virtualenv at $VENV_DIR ..."
  python3 -m venv "$VENV_DIR"
fi

echo "[run-python-tests] installing/verifying dependencies ..."
"$VENV_DIR/bin/pip" install -q -r "$REPO_ROOT/coffee_export/requirements.txt"

DB_SHA_BEFORE="$(sha256sum "$REAL_DB" | cut -d' ' -f1)"
FAILURES=0

fresh_copy() {
  cp "$REAL_DB" "$THROWAWAY"
}

cleanup() {
  rm -f "$THROWAWAY" "$THROWAWAY-wal" "$THROWAWAY-shm" /tmp/coffee-export-supervisor.pid
}
trap cleanup EXIT

run_on_fresh_db() {
  # $1 = label, rest = command
  local label="$1"; shift
  fresh_copy
  echo ""
  echo "━━━ $label ━━━"
  if ( cd "$REPO_ROOT/coffee_export" && COFFEE_DATABASE_URL="sqlite:///$THROWAWAY" "$@" ); then
    echo "✓ $label — PASSED"
  else
    echo "✗ $label — FAILED"
    FAILURES=$((FAILURES + 1))
  fi
}

# ── 2. pytest suite ─────────────────────────────────────────────────────────
run_on_fresh_db "pytest suite (bridge / gateway / event bus / config)" \
  "$VENV_DIR/bin/python" -m pytest tests/ -q --no-header

# ── 3. Agent smoke tests — each on its own fresh DB copy ────────────────────
for agent in 2 3 4 5 6 7; do
  run_on_fresh_db "Agent $agent smoke test" \
    "$VENV_DIR/bin/python" -m "tests.test_agent$agent"
done
run_on_fresh_db "StateManager smoke test" \
  "$VENV_DIR/bin/python" -m tests.test_state_manager

# ── 4. Supervisor single tick (scheduler + health monitor) ──────────────────
run_on_fresh_db "Supervisor single tick" \
  node "$REPO_ROOT/scripts/supervisor.js" --once

# ── 5. Hermeticity proof ─────────────────────────────────────────────────────
DB_SHA_AFTER="$(sha256sum "$REAL_DB" | cut -d' ' -f1)"
echo ""
echo "━━━ Summary ━━━"
echo "Suites failed: $FAILURES"
if [[ "$DB_SHA_BEFORE" == "$DB_SHA_AFTER" ]]; then
  echo "Committed DB untouched: $DB_SHA_AFTER"
else
  echo "✗ COMMITTED DB CHANGED — hermeticity violated!" >&2
  exit 1
fi

exit "$FAILURES"
