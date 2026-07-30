/**
 * Tests for src/lib/db.ts
 * Verifies the database path resolver and connection helpers work correctly.
 */
import { describe, it, expect } from "vitest";
import { getDbPath, getReadonlyDb, getWritableDb } from "@/lib/db";

describe("lib/db", () => {
  describe("getDbPath", () => {
    it("returns a string path", () => {
      const p = getDbPath();
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
    });

    it("caches the path (returns same value on subsequent calls)", () => {
      const p1 = getDbPath();
      const p2 = getDbPath();
      expect(p1).toBe(p2);
    });

    it("resolves to a path that contains 'coffee_export.db'", () => {
      const p = getDbPath();
      expect(p).toContain("coffee_export.db");
    });
  });

  describe("getReadonlyDb", () => {
    it("opens a readonly connection to the database", () => {
      const db = getReadonlyDb();
      try {
        const result = db.prepare("SELECT 1 as n").get() as any;
        expect(result.n).toBe(1);
      } finally {
        db.close();
      }
    });

    it("rejects write operations", () => {
      const db = getReadonlyDb();
      try {
        expect(() => {
          db.exec("CREATE TABLE _test_should_fail (id INTEGER)");
        }).toThrow();
      } finally {
        db.close();
      }
    });
  });

  describe("getWritableDb", () => {
    it("opens a writable connection to the database", () => {
      const db = getWritableDb();
      try {
        db.exec("CREATE TABLE IF NOT EXISTS _test_writable (id INTEGER)");
        db.exec("DROP TABLE IF EXISTS _test_writable");
        expect(true).toBe(true);
      } finally {
        db.close();
      }
    });

    it("sets WAL journal mode", () => {
      const db = getWritableDb();
      try {
        const result = db.prepare("PRAGMA journal_mode").get() as any;
        expect(result.journal_mode.toLowerCase()).toBe("wal");
      } finally {
        db.close();
      }
    });
  });

  describe("database content sanity", () => {
    it("has the core tables (leads, contracts, agents)", () => {
      const db = getReadonlyDb();
      try {
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('leads', 'contracts', 'agents')"
        ).all() as any[];
        expect(tables.length).toBe(3);
      } finally {
        db.close();
      }
    });

    it("has the new tables added by the latest migration", () => {
      const db = getReadonlyDb();
      try {
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('agent_controls', 'pending_agent_actions', 'invoices', 'profits')"
        ).all() as any[];
        expect(tables.length).toBe(4);
      } finally {
        db.close();
      }
    });
  });
});
