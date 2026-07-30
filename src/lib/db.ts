/**
 * Shared database access module.
 * Eliminates the getDbPath() duplication across 22 API routes.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let dbPath: string | null = null;

/** Resolve the database path once and cache it */
export function getDbPath(): string {
  if (dbPath) return dbPath;
  const candidates = [
    path.resolve(process.cwd(), "..", "coffee_export", "data", "coffee_export.db"),
    path.resolve(process.cwd(), "coffee_export", "data", "coffee_export.db"),
    "/home/z/my-project/coffee_export/data/coffee_export.db",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { dbPath = p; return p; }
  }
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
  return db;
}
