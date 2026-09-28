#!/usr/bin/env bash
# Start the Python email bridge (uvicorn) for local/phase-3 testing.
# Reads EMAIL_BRIDGE_SECRET + INBOUND_EMAIL_DOMAIN from the repo-root .env
# (untracked). RESEND_API_KEY intentionally left unset → provider runs in
# clearly-labeled DRY-RUN mode (messages stored, never delivered).
#
# Usage: bash scripts/start-bridge.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$HOME/.venv/bin/python3"

# Source .env (KEY=VALUE only)
if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "ERROR: $REPO_ROOT/.env not found — create it from .env.example" >&2
  exit 1
fi
set -a
source "$REPO_ROOT/.env"
set +a

export COFFEE_DATABASE_URL="sqlite:///$REPO_ROOT/state/coffee_export.db"

cd "$REPO_ROOT/coffee_export"
echo "Starting email bridge on :8000 (dry-run unless RESEND_API_KEY set)..."
exec "$PY" -m uvicorn coffee_export.messaging.webhook:app --host 127.0.0.1 --port 8000
