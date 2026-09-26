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
 *    1. DATABASE_PATH env var (explicit override — use in production)
 *    2. ../coffee_export/data/coffee_export.db (dev: project root + ../coffee_export)
 *    3. ./coffee_export/data/coffee_export.db (alt dev layout)
 *    4. /home/z/my-project/coffee_export/data/coffee_export.db (last-resort absolute)
 */
export function getDbPath(): string {
  if (dbPath) return dbPath;

  const candidates: string[] = [];

  // 1. Env var override
  if (process.env.COFFEE_DATABASE_URL) {
    const rawUrl = process.env.COFFEE_DATABASE_URL;
    if (rawUrl.startsWith("sqlite:///")) {
      candidates.push(path.resolve(process.cwd(), rawUrl.replace("sqlite:///", "")));
    } else if (rawUrl.startsWith("sqlite://")) {
      candidates.push(path.resolve(process.cwd(), rawUrl.replace("sqlite://", "")));
    }
  }

  if (process.env.DATABASE_PATH) {
    candidates.push(process.env.DATABASE_PATH);
  }

  // 2-4. Default locations
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
