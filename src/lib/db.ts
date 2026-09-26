/**
 * Shared database access module.
 * Eliminates the getDbPath() duplication across 22 API routes.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let dbPath: string | null = null;

/** Resolve the database path once and cache it.
 *
 *  Resolution order:
 *    1. DATABASE_PATH env var (explicit per-process override — wins over
 *       everything, including any COFFEE_DATABASE_URL that .env may carry.
 *       This is what the hermetic test runner relies on.)
 *    2. COFFEE_DATABASE_URL env var (canonical shared URL — same variable
 *       the Python stack and scripts/supervisor.js read; sqlite:/// format)
 *    3. ../coffee_export/data/coffee_export.db (dev: project root + ../coffee_export)
 *    4. ./coffee_export/data/coffee_export.db (alt dev layout)
 *    5. ./state/coffee_export.db
 *    6. /home/z/my-project/coffee_export/data/coffee_export.db (last-resort absolute)
 */
export function getDbPath(): string {
  if (dbPath) return dbPath;

  const candidates: string[] = [];

  // 1. Explicit per-process override — strictly authoritative: if set, it is
  //    used or we fail loudly. Silently falling back to another database here
  //    would let a typo'd override point production (or the hermetic test
  //    runner) at the wrong file.
  if (process.env.DATABASE_PATH) {
    const explicit = path.resolve(process.cwd(), process.env.DATABASE_PATH);
    if (!fs.existsSync(explicit) || fs.statSync(explicit).size === 0) {
      throw new Error(
        `DATABASE_PATH is set but its target is missing or empty: ${explicit} — ` +
        `refusing to silently fall back to a different database.`
      );
    }
    dbPath = explicit;
    return explicit;
  }

  // 2. Canonical shared URL (also honored by the Python side + supervisor.js)
  if (process.env.COFFEE_DATABASE_URL) {
    const rawUrl = process.env.COFFEE_DATABASE_URL;
    if (rawUrl.startsWith("sqlite:///")) {
      candidates.push(path.resolve(process.cwd(), rawUrl.replace("sqlite:///", "")));
    } else if (rawUrl.startsWith("sqlite://")) {
      candidates.push(path.resolve(process.cwd(), rawUrl.replace("sqlite://", "")));
    }
  }

  // 3-6. Default locations
  candidates.push(
    path.resolve(process.cwd(), "..", "coffee_export", "data", "coffee_export.db"),
    path.resolve(process.cwd(), "coffee_export", "data", "coffee_export.db"),
    path.resolve(process.cwd(), "state", "coffee_export.db"),
    "/home/z/my-project/coffee_export/data/coffee_export.db",
  );

  for (const p of candidates) {
    // Check exists AND is non-empty (0-byte DB files are corrupted/empty)
    if (fs.existsSync(p) && fs.statSync(p).size > 0) { dbPath = p; return p; }
  }
  // None exist — return the last candidate so the error message is useful
  dbPath = candidates[candidates.length - 1];
  return dbPath;
}

/** Open a read-only database connection */
export function getReadonlyDb(): Database.Database {
  return new Database(getDbPath(), { readonly: true, fileMustExist: true });
}

/** Open a read-write database connection */
export function getWritableDb(): Database.Database {
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  // Enforce the FK constraints declared in the schema (46 of them: cascades
  // for lead children, invoices→payments, exporter_inboxes→operators, etc.).
  // SQLite leaves FK enforcement OFF by default — without this pragma every
  // declared ON DELETE CASCADE / SET NULL was silently ignored and deletes
  // left orphaned child rows (verified: orphans existed for previously
  // deleted operators). PRAGMA foreign_key_check is clean on the committed
  // DB, so enabling enforcement changes no existing behavior for valid data.
  db.pragma("foreign_keys = ON");
  return db;
}
