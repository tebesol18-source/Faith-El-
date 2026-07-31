# Coffee Export ERP — Phase 4A Build

**Build date:** 2026-07-30
**Version:** 0.4.0-phase4a
**Git tag:** `v0.4-phase4a`
**Baseline:** `v0.3-phase3` (Phase 1-3 auth hardening)

## What's new in Phase 4A

This is the **Foundation + Safety** phase — the prerequisites for production deployment. No user-facing features; everything here is operational.

| Feature | Status |
|---|---|
| Structured JSON logger with request IDs | ✅ |
| Automatic redaction of sensitive fields (password, token, etc.) | ✅ |
| Rich `/api/health` endpoint (DB, supervisor, queue, uptime, version) | ✅ |
| Env-based secrets (`.env.example` + `DATABASE_PATH`, `BCRYPT_COST`, etc.) | ✅ |
| Online SQLite backup script with integrity check + retention | ✅ |
| Restore script with safety backup + interactive confirmation | ✅ |
| Backup/restore documentation + disaster recovery runbook | ✅ |
| Cleanup script (expired sessions, old audit log entries) | ✅ |
| Tests for logger + health endpoint | ✅ |

## Quick install

```bash
# 1. Unzip
unzip coffee-export-erp-phase4a.zip -d coffee-export-erp
cd coffee-export-erp

# 2. Install Node dependencies
bun install   # or: npm install

# 3. Set up Python backend
cd coffee_export
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install bcrypt   # for password hashing

# 4. Run migrations
alembic upgrade head

# 5. Seed demo operators
cd ..
coffee_export/venv/bin/python scripts/seed-demo-operators.py

# 6. Copy .env.example to .env.local and customize if needed
cp .env.example .env.local

# 7. Start the dev server
bun run dev   # or: npm run dev
```

The app will be at http://localhost:3000

## Default credentials

| Email | Password | Role |
|---|---|---|
| `admin@coelrodan.com` | `admin123` | admin |
| `abi@coelrodan.com` | `coffee123` | operator |
| `exporter-001@faithelexport.com` | `coffee123` | operator |

## Phase 4A features in detail

### 1. Structured logger (`src/lib/logger.ts`)

Every log entry is a single JSON line — easy to ship to ELK, Datadog, CloudWatch, or grep with `jq`.

```json
{"timestamp":"2026-07-30T08:21:03.878Z","level":"info","message":"health.checked","status":"healthy","database":"up","supervisor":"running","queueDepth":4,"dbLatencyMs":2,"degraded":[]}
```

**Features:**
- 5 levels: `debug`, `info`, `warn`, `error`, `fatal`
- Automatic redaction of sensitive fields (`password`, `token`, `password_hash`, etc.) — including nested objects + arrays
- Request ID propagation via `x-request-id` header + AsyncLocalStorage
- `LOG_LEVEL` env var controls minimum level (default: `debug` in dev, `info` in prod)

**Usage in route handlers:**
```typescript
import { getRequestLogger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const log = getRequestLogger(request);
  log.info("Fetching dashboard data", { userId: "abc" });
  // ...
}
```

### 2. Rich health endpoint (`GET /api/health`)

Public endpoint (no auth) — safe for external monitors.

```bash
$ curl http://localhost:3000/api/health | jq
{
  "ok": true,
  "status": "healthy",
  "database": "up",
  "supervisor": "running",
  "queueDepth": 4,
  "uptime": 86400,
  "version": "0.4.0-phase4a",
  "timestamp": "2026-07-30T08:21:03.876Z",
  "checks": {
    "dbLatencyMs": 2
  }
}
```

| Field | Description |
|---|---|
| `ok` | `true` for healthy/degraded, `false` for down |
| `status` | `healthy` / `degraded` / `down` |
| `database` | `up` / `down` (liveness probe) |
| `supervisor` | `running` (last run < 1 min ago) / `stopped` (< 5 min) / `unknown` |
| `queueDepth` | Pending events waiting for the supervisor |
| `uptime` | Process uptime in seconds |
| `version` | From `package.json` |
| `checks.dbLatencyMs` | How long the DB query took |
| `degraded` | Array of degraded components (only present if status ≠ healthy) |

Returns HTTP 200 for healthy/degraded, 503 for down.

### 3. Env-based secrets (`.env.example`)

All configurable settings are now env vars. Copy `.env.example` to `.env.local` and customize:

```bash
cp .env.example .env.local
```

Key variables:
- `LOG_LEVEL` — debug/info/warn/error/fatal
- `DATABASE_PATH` — override the default DB location
- `BCRYPT_COST` — 4-31 (default 10)
- `SESSION_LIFETIME_HOURS` — default 168 (7 days)
- `BACKUP_DIR` + `BACKUP_RETENTION_DAYS` — backup configuration
- `AUDIT_LOG_RETENTION_DAYS` + `SESSION_CLEANUP_RETENTION_DAYS` — cleanup config

### 4. Backup script (`scripts/backup-db.sh`)

```bash
./scripts/backup-db.sh
```

- Online backup (uses SQLite's backup API — safe under load)
- Integrity check on the backup file
- Gzip compression (saves ~60%)
- Retention policy (deletes backups older than 30 days by default)

**Cron setup** (daily at 2 AM):
```cron
0 2 * * * cd /home/z/my-project && ./scripts/backup-db.sh >> /var/log/coffee-export-backup.log 2>&1
```

### 5. Restore script (`scripts/restore-db.sh`)

```bash
./scripts/restore-db.sh coffee_export_20260730T082341Z.db.gz
```

- Interactive confirmation (type `RESTORE` to proceed)
- Creates safety backup of current DB (`.pre-restore.bak`)
- Stops the running app first
- Handles both `.gz` and plain `.db` files
- Integrity check after restore

### 6. Cleanup script (`scripts/cleanup.ts`)

```bash
npx tsx scripts/cleanup.ts
```

- Deletes expired sessions (`expires_ts` in the past)
- Deletes revoked sessions older than 7 days
- Archives audit log entries older than 90 days to JSONL file
- Runs `VACUUM` to reclaim free space

**Cron setup** (daily at 3 AM — after backups):
```cron
0 3 * * * cd /home/z/my-project && npx tsx scripts/cleanup.ts >> /var/log/coffee-export-cleanup.log 2>&1
```

### 7. Backup/restore docs (`docs/backup-restore.md`)

Full documentation including:
- Cron + systemd timer setup
- Manual backup + restore procedures
- Testing your backups (critical!)
- Offsite backup recommendations (S3, rsync)
- Disaster recovery runbook (15-30 min RTO)

## Tests

```bash
bun run test           # all 207 tests
bun run test:unit      # 111 unit tests
bun run test:integration  # 96 integration tests (requires dev server)
```

Test breakdown:
- 175 tests from Phase 3 (auth, sessions, audit log, admin endpoints)
- 17 new tests for the logger (`tests/lib/logger.test.ts`)
- 15 new tests for the health endpoint (`tests/integration/health.test.ts`)

## File structure (Phase 4A additions)

```
.
├── .env.example                    # NEW — documents all env vars
├── docs/
│   └── backup-restore.md           # NEW — backup/restore/DR docs
├── scripts/
│   ├── backup-db.sh                # NEW — online SQLite backup
│   ├── restore-db.sh               # NEW — interactive restore
│   ├── cleanup.ts                  # NEW — periodic cleanup job
│   └── seed-demo-operators.py      # NEW — seeds admin + seller accounts
├── src/
│   ├── app/api/health/
│   │   └── route.ts                # NEW — rich health endpoint
│   ├── lib/
│   │   ├── logger.ts               # NEW — structured JSON logger
│   │   ├── db.ts                   # MODIFIED — honors DATABASE_PATH env var
│   │   ├── password.ts             # MODIFIED — honors BCRYPT_COST env var
│   │   └── sessions.ts             # MODIFIED — honors SESSION_LIFETIME_HOURS env var
│   └── middleware.ts               # MODIFIED — attaches request ID + logs requests
├── tests/
│   ├── lib/logger.test.ts          # NEW — 17 logger tests
│   └── integration/health.test.ts  # NEW — 15 health endpoint tests
└── package.json                    # MODIFIED — version bumped to 0.4.0-phase4a
```

## What's next (Phase 4B — Security hardening)

Not included in this phase. Recommended for before public deployment:
- httpOnly cookies (replace localStorage tokens)
- CSRF protection (double-submit token pattern)
- Password history (prevent reusing last 5 passwords)
- HTTPS enforcement (HSTS header + Secure cookie flag)

## Git history

```
a5c6600 Phase 4A: structured logging + health endpoint + env secrets + backups + cleanup  (v0.4-phase4a)
fd31b47 Restore Phase 1-3 baseline (v0.3-phase3)
```
