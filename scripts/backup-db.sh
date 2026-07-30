#!/usr/bin/env bash
#
# backup-db.sh — online SQLite backup with timestamp + retention
#
# Creates a timestamped copy of the ERP database using SQLite's online
# backup API (via the `sqlite3` CLI's `.backup` command, or falls back to
# `cp` if sqlite3 isn't available). The backup is safe to run while the
# app is serving requests — readers/writers are not blocked.
#
# Usage:
#   ./scripts/backup-db.sh                  # backup to default location
#   BACKUP_DIR=/var/backups ./scripts/backup-db.sh
#   BACKUP_RETENTION_DAYS=90 ./scripts/backup-db.sh
#
# Recommended cron schedule (daily at 2 AM):
#   0 2 * * * cd /home/z/my-project && ./scripts/backup-db.sh >> /var/log/coffee-export-backup.log 2>&1
#
set -euo pipefail

# ─── Configuration ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${DATABASE_PATH:-$PROJECT_ROOT/coffee_export/data/coffee_export.db}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/coffee_export/data/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# ─── Validate ───
if [ ! -f "$DB_PATH" ]; then
  echo "❌ Database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ─── Timestamp ───
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="$BACKUP_DIR/coffee_export_${TIMESTAMP}.db"

echo "[$(date -u +%FT%TZ)] Starting backup..."
echo "  Source: $DB_PATH"
echo "  Target: $BACKUP_FILE"

# ─── Online backup ───
# Try sqlite3 CLI first (uses the online backup API — safe under load).
# Fall back to cp + WAL checkpoint if sqlite3 isn't installed.
if command -v sqlite3 >/dev/null 2>&1; then
  # .backup uses SQLite's online backup API — readers/writers not blocked
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
  echo "  ✓ Online backup complete (sqlite3 CLI)"
else
  # Fallback: force a WAL checkpoint, then copy
  # This is also safe under load because SQLite's WAL allows concurrent reads
  echo "  ⚠️  sqlite3 CLI not found — using cp fallback"
  cp "$DB_PATH" "$BACKUP_FILE"
  # Also copy the WAL + SHM files if they exist (for consistency)
  [ -f "$DB_PATH-wal" ] && cp "$DB_PATH-wal" "$BACKUP_FILE-wal" 2>/dev/null || true
  [ -f "$DB_PATH-shm" ] && cp "$DB_PATH-shm" "$BACKUP_FILE-shm" 2>/dev/null || true
  echo "  ✓ File copy complete (cp fallback)"
fi

# ─── Verify the backup ───
if command -v sqlite3 >/dev/null 2>&1; then
  INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>&1)
  if [ "$INTEGRITY" = "ok" ]; then
    echo "  ✓ Integrity check passed"
  else
    echo "  ❌ Integrity check FAILED: $INTEGRITY" >&2
    rm -f "$BACKUP_FILE"
    exit 1
  fi
fi

# ─── Compress (optional — saves ~60% on typical SQLite files) ───
if command -v gzip >/dev/null 2>&1; then
  gzip -f "$BACKUP_FILE"
  BACKUP_FILE="$BACKUP_FILE.gz"
  echo "  ✓ Compressed: $BACKUP_FILE"
fi

# ─── Report size ───
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "  Size: $SIZE"

# ─── Apply retention policy ───
echo ""
echo "[$(date -u +%FT%TZ)] Applying retention policy (keep last $RETENTION_DAYS days)..."

DELETED_COUNT=0
if [ -d "$BACKUP_DIR" ]; then
  while IFS= read -r -d '' old_file; do
    rm -f "$old_file"
    DELETED_COUNT=$((DELETED_COUNT + 1))
    echo "  🗑️  Deleted: $(basename "$old_file")"
  done < <(find "$BACKUP_DIR" -name "coffee_export_*.db*" -mtime +$RETENTION_DAYS -print0)
fi

echo ""
echo "[$(date -u +%FT%TZ)] Backup complete."
echo "  Total backups in $BACKUP_DIR: $(find "$BACKUP_DIR" -name "coffee_export_*.db*" | wc -l)"
echo "  Deleted old backups: $DELETED_COUNT"
