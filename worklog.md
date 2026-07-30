# Coffee Export ERP — Work Log

---
Task ID: refactor-1
Agent: main (super-z)
Task: Continue refactoring tasks from prior session:
  1. Split page.tsx into separate files (8K lines → one file per page)
  2. Add Alembic migrations for new tables
  3. Add rate limiting
  4. Add tests
  5. Replace remaining getDbPath() copies with @/lib/db imports (mechanical refactor across 22 files)
  6. Add auth to GET routes (currently only POST routes are protected)

Work Log:
- Refactored 22 API route files: removed local `getDbPath()` definitions, switched to `@/lib/db` imports (`getReadonlyDb`, `getWritableDb`), and added `requireAuth` to every GET handler. Only `/api` (health check) and `/api/auth/login` remain public. Admin-only routes use `requireAdmin`.
- Fixed pre-existing type bug: `as any[]` → `as any` for `.get()` calls in analytics route (was hiding real errors).
- Fixed auth bug: `verifyToken` now validates that `email`, `role`, and `ts` fields exist with correct types (was returning `{email: undefined, role: undefined}` for malformed tokens).
- Split `src/app/page.tsx` from 8,196 lines → 84 lines (App shell only). Extracted:
  - `src/lib/auth-client.ts` — `apiFetch`, `getAuthToken`, `setAuthToken`, `clearAuthToken`, `ADMIN_EMAIL`
  - `src/lib/types.ts` — 31 shared type declarations (Page, Contract, Quote, Shipment, Transaction, etc.)
  - `src/lib/nav.ts` — `navGroups` + `NavItem`/`NavGroup` types
  - `src/components/layout/Sidebar.tsx` (96 lines)
  - `src/components/layout/TopHeader.tsx` (520 lines)
  - `src/components/pages/{Dashboard,Inbox,Leads,Deals,Inventory,Samples,Quotes,Compliance,Shipments,Contracts,Finance,Coach,Admin,Login,Placeholder}Page.tsx` — 15 files, each containing the page component + its local helpers/types/consts.
- Wrote 4 Python scripts to mechanically extract the components (`scripts/identify-blocks.py`, `scripts/find-all-decls.py`, `scripts/split-page-tsx-v2.py`, `scripts/cleanup-splits.py`) — these are recoverable artifacts for future re-runs.
- Created Alembic migration `f7c8d9e0a1b2_add_supervisor_runtime_and_finance_tables.py` that adds 10 missing tables: 5 supervisor runtime tables (`agent_controls`, `agent_feedback`, `buyer_memory`, `pending_agent_actions`, `supervisor_log`) and 5 finance tables (`invoices`, `payments`, `commissions`, `costs`, `profits`). Uses `CREATE TABLE IF NOT EXISTS` for idempotency on databases where the tables already exist. Verified upgrade + downgrade + re-upgrade all work cleanly. DB version now `f7c8d9e0a1b2` (head).
- Created `src/lib/rate-limit.ts` — sliding-window in-memory rate limiter (10K bucket cap with FIFO eviction).
- Created `src/middleware.ts` — Next.js proxy that applies rate limits: 10/min for `/api/auth/login`, 5/min for `/api/agents/research-leads`, 30/min for `/api/approvals`, 120/min default for other `/api/*`. Returns 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers when exceeded.
- Installed `vitest` and `@vitest/ui`; created `vitest.config.ts` with `@/` alias and v8 coverage.
- Wrote 6 test files (105 tests total):
  - `tests/lib/db.test.ts` — 9 tests (getDbPath, getReadonlyDb, getWritableDb, table presence)
  - `tests/lib/auth.test.ts` — 22 tests (createToken, verifyToken edge cases, extractToken, checkAuth, requireAuth, requireAdmin)
  - `tests/lib/format.test.ts` — 23 tests (relativeTime, formatDate, formatTimestamp, messageTime, daysUntil, countryFlag)
  - `tests/lib/rate-limit.test.ts` — 14 tests (basic allow/deny, separate buckets per ID, sliding window expiry, limit boundaries, getClientId)
  - `tests/integration/api-auth.test.ts` — 33 tests (every GET route returns 401 without token + 200 with admin token; admin-only routes return 403 for seller; POST routes require auth; login is public)
  - `tests/integration/rate-limit.test.ts` — 4 tests (rate-limit headers present, 429 after 10 login attempts, Retry-After header)
- All 105 tests pass. `npx tsc --noEmit` returns 0 errors. Dev server runs cleanly.

Stage Summary:
- **Files refactored**: 22 API routes + 1 page.tsx → 21 files
- **Files added**: 6 test files, 3 lib files (auth-client, types, nav), 17 component files (2 layout + 15 pages), 1 middleware, 1 rate-limit lib, 1 Alembic migration, 1 vitest config
- **Lines of code**: page.tsx 8196 → 84 (98% reduction)
- **Tests**: 0 → 105 (all passing)
- **TypeScript errors**: 0 (clean build)
- **Auth coverage**: 14/14 GET routes now require authentication (was 0/14); 4/4 POST routes also require auth
- **DB migrations**: Now covers 51 tables (was 41) — all runtime tables explicit
- **Rate limiting**: Active on all `/api/*` routes with tiered limits

---
Task ID: auth-phase-1
Agent: main (super-z)
Task: Phase 1 of authentication hardening — add real bcrypt passwords for operators + Request Access form

Work Log:
- Installed `bcryptjs` (pure-JS) + `@types/bcryptjs` for password hashing
- Created `src/lib/password.ts` with `hashPassword`, `verifyPassword`, `generateTempPassword`, `validatePasswordStrength`, `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH` constants. Cost factor 10 (~50ms per hash). Includes cross-language compatibility test (verifies Python-generated bcrypt hashes work in Node).
- Confirmed Alembic migration `c4d5e6f7a8b9_add_password_hash_and_account_requests.py` (from prior session) adds `password_hash TEXT` column to `operators` table + creates `account_requests` table. Migration already applied; DB at head `c4d5e6f7a8b9`.
- Created `scripts/reset-operator-passwords.py` — one-off script that resets all 3 operators to known defaults:
  - exporter-001 (Marcus Bell, exporter-001@faithelexport.com) → "coffee123"
  - exporter-002 (Abi Solomon, abi@coelrodan.com) → "coffee123"
  - admin-001 (System Administrator, admin@coelrodan.com) → "admin123"
  Each password gets a fresh bcrypt hash (random salt).
- Verified `src/app/api/auth/login/route.ts` is properly hardened:
  - Looks up operator by email (case-insensitive)
  - Verifies password against bcrypt hash via `verifyPassword()`
  - Returns same "Invalid email or password" error for not-found and wrong-password (no email enumeration)
  - Returns 403 for disabled accounts (status != 'active')
  - Returns 403 for accounts with NULL password_hash (legacy accounts not yet set up)
  - Rejects passwords > 200 chars up-front (DoS protection)
  - Role determined by `operator.role === 'admin'` (no more hardcoded admin email)
- Updated LoginPage demo button: was "abi@coelrodan.com · exporter002" (wrong password), now "abi@coelrodan.com · coffee123" (matches DB)
- Updated demo hint text: was "Role is detected automatically from the email you use" (no longer true — now from operator.role column), now "Role is detected from the operator's role column in the DB. Passwords are bcrypt-hashed."
- Updated `/api/admin` route to also return `accessRequests[]` — pending requests from the login "Request Access" form, plus `stats.pendingAccessRequests` count. Uses try/catch so it doesn't 500 on older DBs without the `account_requests` table.
- Added "Pending Access Requests" section to AdminPage System tab — amber-bordered table showing name, email, company/title, message, submission timestamp. Includes a note explaining how to approve (create operator in DB + update request status). Read-only for now; Phase 2 will add one-click approve button.
- Wrote `tests/lib/password.test.ts` — 26 unit tests covering hashPassword, verifyPassword (including cross-language compat with Python bcrypt), generateTempPassword, validatePasswordStrength.
- Extended `tests/integration/api-auth.test.ts` with 10 new tests:
  - Wrong password rejected (was the old "any password works" demo behavior)
  - Correct seller password "coffee123" works, returns role=seller, name="Abi Solomon"
  - Non-existent email returns same error as wrong password (no enumeration)
  - Password > 200 chars rejected
  - Request Access endpoint: 400 for missing name/email, 400 for invalid email, 409 for existing operator email, 201 for valid new request, 409 for duplicate pending request
- All 141 tests pass (was 105). TypeScript clean. Dev server runs cleanly.

Stage Summary:
- **Security gap closed**: Every operator now has a real bcrypt-hashed password. The "any password works" demo behavior is GONE — verified by integration test.
- **Email enumeration prevented**: Same error message for "user not found" and "wrong password".
- **DoS hardened**: Password length capped at 200 chars before bcrypt runs.
- **Accounts**: 3 operators in DB (exporter-001, exporter-002, admin-001). Default passwords: "coffee123" for exporters, "admin123" for admin.
- **Request Access flow**: Login page modal → POST /api/auth/request-access → account_requests table → /api/admin returns pending requests → AdminPage System tab displays them.
- **Tests**: 141 passing (added 36 new tests for password + auth + request-access).
- **Phase 2 todo**: Build admin UI for one-click approve + create operator + reset password + disable/enable accounts. The `account_requests` table has `reviewed_by`, `reviewed_ts`, `review_notes`, `created_operator_id` columns ready for this.

---
Task ID: auth-phase-2
Agent: main (super-z)
Task: Phase 2 of authentication — admin user management UI + Request Access form phone field

Work Log:
- Alembic migration `d5e6f7a8b9c0_add_phone_to_account_requests.py` — adds `phone TEXT` column to `account_requests`. Idempotent (checks PRAGMA first). DB now at head `d5e6f7a8b9c0`.
- Updated `/api/auth/request-access` to accept + store `phone` field (optional, max 50 chars).
- Updated LoginPage's RequestAccessModal to include a Phone input field (type=tel, placeholder="+251 911 234 567 (optional)").
- Updated `/api/admin` to return `phone` in pending access requests.
- Updated AdminPage access requests table to show a Phone column.
- Built 6 new admin API endpoints (all require admin role):
  - `POST /api/admin/operators` — create new operator (validates name, email, password strength; auto-generates operator_id like "exporter-NNN"; bcrypt-hashes password)
  - `GET /api/admin/operators` — list all operators (without password hashes)
  - `PATCH /api/admin/operators/[id]` — update name, role, and/or status. Refuses to demote/disable the last active admin.
  - `DELETE /api/admin/operators/[id]` — delete operator. Refuses to delete the last active admin.
  - `POST /api/admin/operators/[id]/reset-password` — admin-initiated password reset. Can either accept a custom password (validated) or auto-generate a 16-char random password (returned in response, shown once).
  - `POST /api/admin/access-requests/[id]/approve` — approves a pending request, creates the operator account, links the request to the new operator via `created_operator_id`, returns the auto-generated password.
  - `POST /api/admin/access-requests/[id]/reject` — marks request as rejected, captures reviewer notes.
- Built 3 admin modals in AdminPage:
  - `CreateOperatorModal` — form for name, email, password, role, status. Strength-checks password client-side before submitting.
  - `EditOperatorModal` — change name/role/status (only sends changed fields).
  - `ResetPasswordModal` — choose between auto-generate or custom password. Shows generated password once after success, with a copyable display + warning to communicate it out-of-band.
- Added action buttons to every operator row: Edit (pencil), Reset Password (key), Disable/Enable (power), Delete (trash). Each shows confirm() dialog before executing. Calls `refreshAdminData()` after every mutation so the table updates instantly.
- Added Approve (green check) + Reject (X) buttons to every access request row. Approve shows the generated password in an alert() so the admin can copy it. Reject prompts for an optional reason.
- Wrote `tests/integration/admin-users.test.ts` — 18 integration tests covering all 6 new endpoints:
  - Auth checks (401 without token, 403 for seller)
  - Validation (missing fields, weak password, duplicate email, invalid role)
  - Full create → login → reset → disable → delete lifecycle
  - Approve flow creates operator + auto-gen password works for login + can't approve twice (409)
  - Reject flow flips status + can't reject twice (409)
- All 159 tests pass (was 141, added 18). TypeScript clean. End-to-end smoke test passes for all 6 endpoints.

Stage Summary:
- **Admin can now fully manage user accounts** from the UI (no SQL needed):
  - Create operator → bcrypt-hashed password, role, status
  - Edit name/role/status (with safety check on last admin)
  - Reset password (auto-generate 16-char or custom)
  - Disable / enable accounts
  - Delete accounts
- **Request Access flow is now end-to-end**: form (with phone) → admin review → one-click approve creates the account + returns the password → admin communicates it out-of-band.
- **Safety rails**: cannot demote/disable/delete the last active admin (returns 400 with explanation).
- **All mutations trigger a refresh** so the admin sees the change instantly.
- **Tests**: 159 passing (added 18 for admin endpoints).
- **Files added**: 5 new API routes, 3 new modal components in AdminPage, 1 Alembic migration, 1 test file.

---
Task ID: auth-phase-3
Agent: main (super-z)
Task: Phase 3 of authentication — forced password change + audit log + session management

Work Log:
- Alembic migration `e6f7a8b9c0d1_add_must_change_password_audit_log_sessions.py`:
  - Added `must_change_password INTEGER NOT NULL DEFAULT 0` to operators
  - Created `admin_audit_log` table (id, timestamp, actor_email, actor_ip, action, target_type, target_id, target_email, details JSON, success)
  - Created `sessions` table (id PK, operator_id, operator_email, operator_role, issued_ts, expires_ts, revoked_ts, revoked_by, ip_address, user_agent)
  - DB now at head `e6f7a8b9c0d1`
- Created `src/lib/audit.ts` — `writeAuditLog()` best-effort writer + `readAuditLog()` reader
- Created `src/lib/sessions.ts` — `createSession()`, `validateSession()`, `revokeSession()`, `revokeAllSessionsForOperator()`, `listActiveSessions()`. Sessions are 32-char hex IDs, 7-day expiry.
- Rewrote `src/lib/auth.ts` to use DB-backed sessions instead of stateless base64 tokens. `requireAuth` now:
  - Validates the session ID against the DB (exists, not revoked, not expired)
  - Validates the associated operator still exists + is active + has a password_hash
  - Returns `mustChangePassword` flag from the operator row
  - If `mustChangePassword=true`, restricts the user to ONLY `/api/auth/change-password` and `/api/auth/logout` — all other endpoints return 403 with `{ mustChangePassword: true }`
- Updated `/api/auth/login` to create a session row + return the session ID as the token. Also returns `mustChangePassword` flag + captures IP + user-agent.
- Created `/api/auth/change-password` — validates old password, strength-checks new password, hashes + updates, clears `must_change_password=0`, revokes all OTHER sessions for the operator (keeps current alive so user doesn't get logged out).
- Created `/api/auth/logout` — revokes the current session.
- Updated all admin endpoints to:
  - Set `must_change_password=1` on: operator create, password reset (when auto-generated), access request approve
  - Write audit log entries on every mutation (create/update/disable/enable/delete/reset_password/approve/reject)
  - Revoke all sessions when: operator disabled, operator deleted, password reset
- Created `/api/admin/audit-log` GET endpoint — returns last N audit entries.
- Created `/api/admin/sessions` GET endpoint — returns all active (non-expired, non-revoked) sessions.
- Created `/api/admin/sessions/[id]/revoke` POST endpoint — admin can force-logout any session.
- Updated AdminPage with two new sections in the System tab:
  - **Active Sessions** (blue-bordered table) — shows operator email, role, IP, issued/expires timestamps, with a "Revoke" button per row
  - **Admin Audit Log** (gray-bordered, scrollable) — shows timestamp, admin email + IP, action (color-coded badge), target email + ID, JSON details. Color codes: green for create/enable/approve, red for delete/reject, amber for disable/session-revoke, purple for password reset.
- Built `ChangePasswordPage` component — full-screen form with old password, new password (with live strength indicator), confirm password. On success, shows confirmation + clears token + returns to login.
- Updated App shell to:
  - Pass `mustChangePassword` flag from login through to the app state
  - Render `ChangePasswordPage` instead of the main app when `mustChangePassword=true` (user cannot navigate anywhere else)
  - Call `/api/auth/logout` on logout (revokes the session server-side)
- Updated LoginPage to pass `email` + `mustChangePassword` to the onLogin callback.
- Wrote `tests/integration/phase3.test.ts` — 17 integration tests covering:
  - Audit log endpoint (401 without auth, returns entries, includes operator.create after creating)
  - Sessions endpoint (401 without auth, returns admin's own session)
  - Session revocation (admin can revoke seller session, 404 for non-existent)
  - Change password (401 without auth, 400 missing fields, 401 wrong old password, 400 new==old, 400 weak, full lifecycle)
  - Logout (revokes session, idempotent without token)
  - must_change_password flag (set on create, set on auto-gen reset, cleared on change)
- Updated `tests/integration/api-auth.test.ts` to use real session tokens (synthetic base64 tokens no longer work). Added 5 new tests for session validation + must_change_password gate.
- Updated `tests/integration/admin-users.test.ts` to use real seller token for the 403 check.
- Rewrote `tests/lib/auth.test.ts` for the new session-based auth model (was 22 tests, now 16 — removed createToken/verifyToken tests, added session validation tests).
- All 175 tests pass. TypeScript clean. End-to-end smoke test verified:
  - Create operator → must_change_password=true
  - Login as new operator → mustChangePassword=true returned
  - Try to access /api/dashboard → 403 with mustChangePassword=true
  - Change password → success, flag cleared
  - Try again → 200
  - Admin can list sessions, revoke any session, see audit log of all actions

Stage Summary:
- **Forced password change**: New operators + reset passwords + approved access requests all get `must_change_password=1`. The user is locked out of everything except `/api/auth/change-password` and `/api/auth/logout` until they change it.
- **Audit log**: Every admin mutation is recorded with actor, IP, action, target, and JSON details. Visible in Admin → System tab.
- **Session management**: Replaced stateless base64 tokens with DB-backed sessions. Admin can see who's logged in (with IP + user-agent) and force-logout anyone. Sessions auto-expire after 7 days. Password changes revoke all other sessions for the operator.
- **Security improvements**:
  - Stolen tokens can now be revoked (was impossible with stateless tokens)
  - Disabled/deleted operators' sessions are immediately invalidated
  - Password change invalidates all other sessions (so a stolen old password can't be used to maintain access)
  - Admin has full visibility into who's logged in and what actions have been taken
- **Tests**: 175 passing (added 22 new tests for Phase 3 features).
- **Files added**: 1 Alembic migration, 2 lib files (audit, sessions), 4 new API routes (change-password, logout, audit-log, sessions + revoke), 1 page component (ChangePasswordPage), 1 test file.

---
Task ID: phase-4a
Agent: main (super-z)
Task: Phase 4A — Foundation + Safety (structured logging, health endpoint, env secrets, backups, cleanup)

Work Log:
- **Recovery**: Working directory was reset to pre-Phase-1 state. Recovered from `/tmp/my-project/download/coffee-export-erp-phase3.zip` — restored all src/, tests/, scripts/, migration files. Ran `alembic upgrade head` to bring DB from `a1b2c3d4e5f6` → `e6f7a8b9c0d1` (4 migrations). Created `scripts/seed-demo-operators.py` to add the missing admin-001 + exporter-002 operator accounts. Verified all 175 Phase 3 tests pass.
- **Git baseline**: Committed restored state as `fd31b47` + tagged `v0.3-phase3`.
- **Structured logger** (`src/lib/logger.ts`):
  - 5 levels: debug, info, warn, error, fatal
  - JSON output via `console.*` (works in both Node + Edge runtimes)
  - Automatic redaction of sensitive fields (password, token, password_hash, etc.) — including nested + array elements
  - Request ID propagation via `x-request-id` header + AsyncLocalStorage (with global fallback for Edge)
  - `getRequestLogger(request)` helper for route handlers
  - `LOG_LEVEL` env var controls minimum level (debug in dev, info in prod)
- **Middleware update** (`src/middleware.ts`):
  - Generates or accepts `x-request-id` header on every /api/* request
  - Logs `request.start` with method, path, IP, user-agent
  - Logs `request.rate_limited` when 429 is returned
  - Echoes `x-request-id` back in the response
- **Health endpoint** (`GET /api/health`):
  - Rich JSON shape: `{ ok, status, database, supervisor, queueDepth, uptime, version, timestamp, checks, degraded? }`
  - DB check: liveness probe + queue depth (pending events) + supervisor last-run timestamp
  - Status logic: `healthy` (DB up + supervisor running + queue < 50), `degraded` (supervisor stopped or queue backed up), `down` (DB unreachable)
  - Returns 200 for healthy/degraded, 503 for down
  - Public (no auth) — safe for external monitors
  - Best-effort disk space check via `fs.statfsSync`
- **Env-based secrets** (`.env.example`):
  - Documented all configurable env vars: `LOG_LEVEL`, `DATABASE_PATH`, `BCRYPT_COST`, `SESSION_LIFETIME_HOURS`, rate limit values, backup config, cleanup retention, demo credentials
  - Updated `src/lib/db.ts` to honor `DATABASE_PATH` env var (first priority in resolution order)
  - Updated `src/lib/password.ts` to honor `BCRYPT_COST` env var (default 10, validated 4-31)
  - Updated `src/lib/sessions.ts` to honor `SESSION_LIFETIME_HOURS` env var (default 168 = 7 days)
- **Backup script** (`scripts/backup-db.sh`):
  - Online SQLite backup via `sqlite3 .backup` (safe under load), falls back to `cp` if sqlite3 CLI missing
  - Integrity check on the backup file
  - Gzip compression (saves ~60%)
  - Retention policy (default 30 days, configurable via `BACKUP_RETENTION_DAYS`)
  - Tested: created `coffee_export_20260730T082341Z.db.gz` (80K)
- **Restore script** (`scripts/restore-db.sh`):
  - Interactive confirmation (type 'RESTORE' to proceed)
  - Creates safety backup of current DB before overwriting (`.pre-restore.bak`)
  - Stops the running app first (best-effort)
  - Handles both .gz and plain .db files
  - Integrity check after restore
- **Backup/restore docs** (`docs/backup-restore.md`):
  - Cron + systemd timer setup instructions
  - Manual backup + restore procedures
  - What's included/excluded in backups
  - Testing your backups (critical!)
  - Offsite backup recommendations (S3, rsync)
  - Disaster recovery runbook (15-30 min RTO)
- **Cleanup script** (`scripts/cleanup.ts`):
  - Deletes expired sessions (expires_ts in the past)
  - Deletes revoked sessions older than `SESSION_CLEANUP_RETENTION_DAYS` (default 7)
  - Archives old audit log entries to JSONL file before deleting (default 90 days)
  - Runs VACUUM to reclaim free space
  - Configurable via `AUDIT_LOG_RETENTION_DAYS` + `SESSION_CLEANUP_RETENTION_DAYS` env vars
  - Tested: archived + deleted 1 old audit entry, deleted 1 old revoked session
- **Tests**:
  - `tests/lib/logger.test.ts` — 17 unit tests (levels, redaction, request context, generateRequestId)
  - `tests/integration/health.test.ts` — 15 integration tests (JSON shape, status values, rate-limit headers, request ID propagation)
- All 207 tests pass (175 from Phase 3 + 32 new). TypeScript clean.

Stage Summary:
- **Structured logging**: Every /api/* request now has a request ID + JSON log entries with redacted sensitive fields. Ready for ELK/Datadog/CloudWatch.
- **Health endpoint**: `/api/health` returns rich JSON — usable by load balancers, uptime monitors, and the Admin UI.
- **Env-based secrets**: No more hardcoded DB path or bcrypt cost. `.env.example` documents every option.
- **Backups**: `scripts/backup-db.sh` creates online backups with integrity check + retention. `scripts/restore-db.sh` restores safely with confirmation + safety backup. `docs/backup-restore.md` covers setup + DR.
- **Cleanup**: `scripts/cleanup.ts` keeps the sessions + audit_log tables from growing forever. Archives audit entries to JSONL before deleting.
- **Tests**: 207 passing (added 32 for logger + health).
- **Files added**: 1 lib file (logger), 1 API route (health), 1 .env.example, 2 shell scripts (backup + restore), 1 TypeScript script (cleanup), 1 docs file, 2 test files.
