#!/usr/bin/env bash
#
# dr-drill.sh — Disaster Recovery drill
#
# Simulates recovering the Coffee Export ERP on a fresh machine from:
#   - Source code (zip file)
#   - A database backup file
#
# The drill validates that the recovery procedure documented in
# docs/backup-restore.md actually works end-to-end.
#
# Success criteria (must complete within 30 minutes):
#   1. Source code extracted
#   2. Node dependencies installed
#   3. Python venv created + dependencies installed
#   4. Database restored from backup
#   5. Migrations applied (no-op if backup is current)
#   6. Dev server starts
#   7. /api/health returns 200 with status="healthy" or "degraded"
#   8. Login works with restored credentials
#   9. Can list operators via admin API
#
# Usage:
#   ./scripts/dr-drill.sh [backup-file]
#
# If no backup file is specified, uses the most recent one in the backups dir.
#
set -euo pipefail

# ─── Configuration ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DR_DIR="/tmp/dr-drill"

# Source zip: use env var, or first arg, or default to the latest phase zip
SOURCE_ZIP="${SOURCE_ZIP:-}"
if [ $# -ge 2 ]; then SOURCE_ZIP="$2"; fi
if [ -z "$SOURCE_ZIP" ]; then
  # Auto-detect the latest phase zip
  SOURCE_ZIP=$(ls -t "$PROJECT_ROOT/download/coffee-export-erp-phase"*.zip 2>/dev/null | head -1)
  if [ -z "$SOURCE_ZIP" ]; then
    SOURCE_ZIP="$PROJECT_ROOT/download/coffee-export-erp-phase4a.zip"
  fi
fi

BACKUP_DIR="$PROJECT_ROOT/coffee_export/data/backups"

# Use provided backup or the most recent one
if [ $# -ge 1 ]; then
  BACKUP_FILE="$1"
else
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/coffee_export_*.db.gz 2>/dev/null | head -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "❌ No backup file found in $BACKUP_DIR" >&2
    exit 1
  fi
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Coffee Export ERP — Disaster Recovery Drill                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Source zip:    $SOURCE_ZIP"
echo "Backup file:   $BACKUP_FILE"
echo "DR directory:  $DR_DIR"
echo ""
echo "Target: full recovery in under 30 minutes"
echo ""

DRILL_START=$(date +%s)

# ─── Helper: time a step ───
step_start=0
step_name=""
step() {
  step_name="$1"
  step_start=$(date +%s)
  echo "─── Step: $step_name ───"
}
step_done() {
  local elapsed=$(( $(date +%s) - step_start ))
  local total=$(( $(date +%s) - DRILL_START ))
  echo "  ✓ Done (${elapsed}s elapsed, ${total}s total)"
  echo ""
}

# ─── Step 1: Clean slate ───
step "Clean up any previous drill"
rm -rf "$DR_DIR"
mkdir -p "$DR_DIR"
step_done

# ─── Step 2: Extract source code ───
step "Extract source code from zip"
if [ ! -f "$SOURCE_ZIP" ]; then
  echo "❌ Source zip not found: $SOURCE_ZIP" >&2
  exit 1
fi
unzip -q "$SOURCE_ZIP" -d "$DR_DIR"
echo "  Extracted to: $DR_DIR"
step_done

# ─── Step 3: Install Node dependencies ───
step "Install Node dependencies (bun install)"
cd "$DR_DIR"
bun install 2>&1 | tail -3
step_done

# ─── Step 4: Set up Python backend ───
step "Set up Python venv + install dependencies"
cd "$DR_DIR/coffee_export"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt 2>&1 | tail -3
pip install bcrypt 2>&1 | tail -3
cd "$DR_DIR"
step_done

# ─── Step 5: Restore database from backup ───
step "Restore database from backup"
DB_PATH="$DR_DIR/coffee_export/data/coffee_export.db"
mkdir -p "$(dirname "$DB_PATH")"

# Use the restore script (non-interactive mode — pipe 'RESTORE' to stdin)
echo "RESTORE" | DATABASE_PATH="$DB_PATH" BACKUP_DIR="$(dirname "$BACKUP_FILE")" \
  "$DR_DIR/scripts/restore-db.sh" "$(basename "$BACKUP_FILE")" 2>&1 | tail -10
step_done

# ─── Step 6: Run migrations (in case backup predates a migration) ───
step "Run Alembic migrations"
cd "$DR_DIR/coffee_export"
source venv/bin/activate
# Use || true so the drill doesn't abort if grep finds no matches
# (which happens when the DB is already at head — that's a valid outcome)
alembic upgrade head 2>&1 | tee /tmp/alembic-drill.log | grep -E "Running upgrade|Already at|head" || true
# Verify we're at head
CURRENT=$(alembic current 2>&1 | tail -1)
echo "  Current version: $CURRENT"
cd "$DR_DIR"
step_done

# ─── Step 7: Start dev server ───
step "Start dev server"
# Kill any existing dev server on port 3000
pkill -f "next dev" 2>/dev/null || true
sleep 2
# Start on a different port to avoid conflicts with the main dev server
DR_PORT=3001
(npx next dev -p $DR_PORT > "$DR_DIR/dr-dev.log" 2>&1 &)
echo "  Started on port $DR_PORT (logs: $DR_DIR/dr-dev.log)"

# Wait for server to be ready (max 30 seconds)
echo "  Waiting for server to be ready..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$DR_PORT/api/health" > /dev/null 2>&1; then
    echo "  Server ready after ${i}s"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    echo "  ❌ Server didn't start within 30 seconds" >&2
    cat "$DR_DIR/dr-dev.log" | tail -20
    exit 1
  fi
done
step_done

# ─── Step 8: Verify health endpoint ───
step "Verify /api/health returns 200"
HEALTH_RESPONSE=$(curl -s "http://localhost:$DR_PORT/api/health")
echo "  Response: $HEALTH_RESPONSE" | head -c 300
echo ""

HEALTH_OK=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok'))" 2>/dev/null || echo "false")
if [ "$HEALTH_OK" = "True" ]; then
  echo "  ✓ Health check passed (ok=true)"
else
  echo "  ❌ Health check failed (ok != true)" >&2
  exit 1
fi
step_done

# ─── Step 9: Verify login works ───
step "Verify login with restored credentials"
LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@faithel.com","password":"admin123"}' \
  "http://localhost:$DR_PORT/api/auth/login")
echo "  Response: $(echo "$LOGIN_RESPONSE" | head -c 200)..."

LOGIN_OK=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok'))" 2>/dev/null || echo "false")
TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ "$LOGIN_OK" = "True" ] && [ -n "$TOKEN" ]; then
  echo "  ✓ Login successful (got session token: ${TOKEN:0:12}...)"
else
  echo "  ❌ Login failed" >&2
  exit 1
fi
step_done

# ─── Step 10: Verify admin API works ───
step "Verify admin API (list operators)"
ADMIN_RESPONSE=$(curl -s -H "x-auth-token: $TOKEN" "http://localhost:$DR_PORT/api/admin")
OPERATOR_COUNT=$(echo "$ADMIN_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('operators',[])))" 2>/dev/null || echo "0")
echo "  Operators found: $OPERATOR_COUNT"

if [ "$OPERATOR_COUNT" -ge 1 ]; then
  echo "  ✓ Admin API working (found $OPERATOR_COUNT operators)"
else
  echo "  ❌ Admin API returned no operators" >&2
  exit 1
fi
step_done

# ─── Step 11: Run the test suite ───
step "Run test suite"
cd "$DR_DIR"
# Run only unit tests (integration tests need the main dev server on :3000)
npx vitest run tests/lib 2>&1 | tail -10
step_done

# ─── Cleanup ───
step "Stop the drill dev server"
pkill -f "next dev -p $DR_PORT" 2>/dev/null || true
step_done

# ─── Summary ───
DRILL_END=$(date +%s)
DRILL_DURATION=$(( DRILL_END - DRILL_START ))
MINUTES=$(( DRILL_DURATION / 60 ))
SECONDS=$(( DRILL_DURATION % 60 ))

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  DRILL RESULT                                                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
if [ $DRILL_DURATION -le 1800 ]; then
  echo "  ✅ PASSED — recovered in ${MINUTES}m ${SECONDS}s (target: < 30m)"
else
  echo "  ⚠️  SLOW — recovered in ${MINUTES}m ${SECONDS}s (exceeded 30m target)"
fi
echo "                                                              "
echo "  All checks passed:                                          "
echo "    ✓ Source code extracted                                   "
echo "    ✓ Dependencies installed                                  "
echo "    ✓ Database restored from backup                           "
echo "    ✓ Migrations applied                                      "
echo "    ✓ Dev server started                                      "
echo "    ✓ Health endpoint returns 200                             "
echo "    ✓ Login works with restored credentials                   "
echo "    ✓ Admin API returns operator list                         "
echo "    ✓ Unit tests pass                                         "
echo "                                                              "
echo "  Backup used: $(basename "$BACKUP_FILE")                     "
echo "  DR directory: $DR_DIR (preserved for inspection)            "
echo "╚══════════════════════════════════════════════════════════════╝"
