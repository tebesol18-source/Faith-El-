#!/usr/bin/env bash
#
# restore-db.sh — restore the ERP database from a backup file
#
# Stops the running app (if any), backs up the current DB (just in case),
# then restores the specified backup file.
#
# Usage:
#   ./scripts/restore-db.sh <backup-file>
#   ./scripts/restore-db.sh coffee_export_20260730T082341Z.db.gz
#
# The backup file can be gzipped (.gz) or plain (.db). If gzipped, it will
# be decompressed automatically.
#
# ⚠️  WARNING: This overwrites the current database. Make sure you have
#     a recent backup before running. The script makes a safety backup
#     of the current DB first (named .pre-restore.bak).
#
set -euo pipefail

# ─── Validate args ───
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>"
  echo ""
  echo "Examples:"
  echo "  $0 coffee_export_20260730T082341Z.db.gz"
  echo "  $0 /var/backups/coffee_export_20260730T082341Z.db"
  exit 1
fi

BACKUP_FILE="$1"

# ─── Configuration ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${DATABASE_PATH:-$PROJECT_ROOT/coffee_export/data/coffee_export.db}"

# ─── Resolve backup file path ───
# If the path doesn't exist as-is, try relative to the backup dir
if [ ! -f "$BACKUP_FILE" ]; then
  BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/coffee_export/data/backups}"
  CANDIDATE="$BACKUP_DIR/$(basename "$BACKUP_FILE")"
  if [ -f "$CANDIDATE" ]; then
    BACKUP_FILE="$CANDIDATE"
  else
    echo "❌ Backup file not found: $1" >&2
    echo "   Looked in:" >&2
    echo "     - $1" >&2
    echo "     - $CANDIDATE" >&2
    exit 1
  fi
fi

echo "⚠️   WARNING: This will OVERWRITE the current database."
echo ""
echo "  Target DB:     $DB_PATH"
echo "  Restore from:  $BACKUP_FILE"
echo ""
echo "A safety backup of the current DB will be created at:"
echo "  ${DB_PATH}.pre-restore.bak"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 0
fi

# ─── Stop the app (best-effort) ───
echo ""
echo "[$(date -u +%FT%TZ)] Stopping the app (best-effort)..."
pkill -f "next dev" 2>/dev/null && echo "  ✓ Stopped next dev" || echo "  · next dev not running"
pkill -f "next-server" 2>/dev/null && echo "  ✓ Stopped next-server" || echo "  · next-server not running"
pkill -f "node.*supervisor" 2>/dev/null && echo "  ✓ Stopped supervisor" || echo "  · supervisor not running"
sleep 2

# ─── Safety backup of the current DB (if it exists) ───
SAFETY_BAK=""
if [ -f "$DB_PATH" ]; then
  SAFETY_BAK="${DB_PATH}.pre-restore.bak"
  echo "[$(date -u +%FT%TZ)] Creating safety backup: $SAFETY_BAK"
  cp "$DB_PATH" "$SAFETY_BAK"
  echo "  ✓ Safety backup created"
else
  echo "[$(date -u +%FT%TZ)] No existing DB to back up (fresh install)"
fi

# ─── Restore ───
echo "[$(date -u +%FT%TZ)] Restoring from: $BACKUP_FILE"

if [[ "$BACKUP_FILE" == *.gz ]]; then
  # Gzipped backup — decompress to the target
  gunzip -c "$BACKUP_FILE" > "$DB_PATH"
  echo "  ✓ Decompressed gzipped backup"
else
  # Plain .db file — copy directly
  cp "$BACKUP_FILE" "$DB_PATH"
  echo "  ✓ Copied plain backup"
fi

# Remove WAL/SHM files from the previous DB (they'll be recreated on next write)
rm -f "$DB_PATH-wal" "$DB_PATH-shm" 2>/dev/null || true

# ─── Verify ───
if command -v sqlite3 >/dev/null 2>&1; then
  INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1)
  if [ "$INTEGRITY" = "ok" ]; then
    echo "  ✓ Integrity check passed"
  else
    echo "  ❌ Integrity check FAILED: $INTEGRITY" >&2
    if [ -n "$SAFETY_BAK" ]; then
      echo "  The safety backup is still available at: $SAFETY_BAK" >&2
    fi
    exit 1
  fi
fi

# ─── Report ───
SIZE=$(du -h "$DB_PATH" | cut -f1)
echo ""
echo "[$(date -u +%FT%TZ)] Restore complete."
echo "  Database: $DB_PATH ($SIZE)"
if [ -n "$SAFETY_BAK" ]; then
  echo "  Safety backup: $SAFETY_BAK"
fi
echo ""
echo "You can now restart the app: npm run dev"
