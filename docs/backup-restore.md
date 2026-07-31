# Backup & Restore

This document covers the backup and restore procedures for the Coffee Export ERP database.

## Overview

The ERP uses a single SQLite database file at `coffee_export/data/coffee_export.db`. SQLite's WAL (Write-Ahead Logging) mode allows safe backups while the app is serving requests — readers and writers are not blocked.

## Automated backups

### Schedule

Backups should run daily, ideally during low-traffic hours (e.g., 2 AM). The script is idempotent and safe to run multiple times per day.

### Setup (cron)

```bash
# Edit the crontab
crontab -e

# Add this line (daily at 2 AM):
0 2 * * * cd /home/z/my-project && ./scripts/backup-db.sh >> /var/log/coffee-export-backup.log 2>&1
```

### Setup (systemd timer)

For systemd-based systems, a timer is more robust than cron:

```ini
# /etc/systemd/system/coffee-export-backup.service
[Unit]
Description=Coffee Export ERP — daily database backup

[Service]
Type=oneshot
WorkingDirectory=/home/z/my-project
ExecStart=/home/z/my-project/scripts/backup-db.sh
User=z
```

```ini
# /etc/systemd/system/coffee-export-backup.timer
[Unit]
Description=Daily Coffee Export ERP backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now coffee-export-backup.timer
```

## Manual backup

```bash
cd /home/z/my-project
./scripts/backup-db.sh
```

### Configuration

All settings are optional — defaults work for the standard dev setup.

| Env var | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `coffee_export/data/coffee_export.db` | Path to the live DB |
| `BACKUP_DIR` | `coffee_export/data/backups/` | Where to store backups |
| `BACKUP_RETENTION_DAYS` | `30` | Backups older than this are deleted |

Example:

```bash
BACKUP_DIR=/var/backups/coffee-export \
BACKUP_RETENTION_DAYS=90 \
./scripts/backup-db.sh
```

## What the backup includes

- All ERP tables (operators, sessions, leads, contracts, etc.)
- The Alembic version (so restored DBs know which migrations are applied)
- All account_requests, audit_log entries, and pending_agent_actions

## What the backup does NOT include

- Node modules (reinstall with `bun install`)
- The Python virtualenv (recreate with `python -m venv venv && pip install -r requirements.txt`)
- Uploaded files (if you add file uploads in the future, back those up separately)

## Restore procedure

### Quick restore (interactive)

```bash
cd /home/z/my-project

# Stop the app first (recommended)
pkill -f "next dev"

# Restore from a backup file (gzipped or plain)
./scripts/restore-db.sh coffee_export_20260730T082341Z.db.gz
```

The script will:
1. Ask you to type `RESTORE` to confirm
2. Stop the running app (best-effort)
3. Create a safety backup of the current DB (`.pre-restore.bak`)
4. Restore from the specified backup file
5. Verify integrity (if sqlite3 CLI is available)

### Restore to a specific location

```bash
DATABASE_PATH=/var/lib/coffee-export/restored.db \
./scripts/restore-db.sh /backups/coffee_export_20260730T082341Z.db.gz
```

### Manual restore (no script)

```bash
# Stop the app
pkill -f "next dev"

# Back up the current DB
cp coffee_export/data/coffee_export.db coffee_export/data/coffee_export.db.pre-restore.bak

# Restore (gzipped)
gunzip -c coffee_export/data/backups/coffee_export_20260730T082341Z.db.gz \
  > coffee_export/data/coffee_export.db

# Or restore (plain)
cp coffee_export/data/backups/coffee_export_20260730T082341Z.db \
  coffee_export/data/coffee_export.db

# Remove WAL/SHM (will be recreated on next write)
rm -f coffee_export/data/coffee_export.db-wal
rm -f coffee_export/data/coffee_export.db-shm

# Verify integrity (if sqlite3 is available)
sqlite3 coffee_export/data/coffee_export.db "PRAGMA integrity_check;"
# Should print: ok

# Restart the app
npm run dev
```

## Testing your backups

**A backup you haven't tested restoring is not a backup.** Periodically verify your backups:

```bash
# Restore to a temp location and check the data
DATABASE_PATH=/tmp/test-restore.db \
./scripts/restore-db.sh coffee_export/data/backups/coffee_export_20260730T082341Z.db.gz

# Check the data (using sqlite3 CLI, or use the app's health endpoint)
sqlite3 /tmp/test-restore.db "SELECT COUNT(*) FROM operators;"
sqlite3 /tmp/test-restore.db "SELECT version_num FROM alembic_version;"

# Clean up
rm /tmp/test-restore.db
```

## Offsite backups

Local backups protect against accidental deletion and DB corruption, but not against disk failure or server loss. For production:

1. **Sync to S3 / cloud storage** — add this to the backup script:
   ```bash
   aws s3 cp "$BACKUP_FILE" "s3://your-bucket/coffee-export/$(basename "$BACKUP_FILE")"
   ```

2. **Or use rsync to another server**:
   ```bash
   rsync -avz "$BACKUP_DIR/" user@backup-server:/backups/coffee-export/
   ```

3. **Test restoring from offsite** — at least once, download a backup from S3 and verify it restores.

## Disaster recovery

If the production DB is lost:

1. Provision a new server with Node.js + Python
2. Clone the repo: `git clone <repo>` (or unzip the latest release)
3. Install dependencies: `bun install` + `cd coffee_export && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
4. Download the latest backup from offsite storage
5. Restore: `./scripts/restore-db.sh /path/to/latest-backup.db.gz`
6. Run migrations (in case the backup predates a migration): `cd coffee_export && alembic upgrade head`
7. Start the app: `npm run dev` (or your process manager)

Estimated recovery time: 15-30 minutes (assuming offsite backup is current).
