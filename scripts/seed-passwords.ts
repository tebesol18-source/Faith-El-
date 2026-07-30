#!/usr/bin/env node
/**
 * Seed script: set real bcrypt password hashes for existing operators.
 *
 * This is a one-time script you run after applying the c4d5e6f7a8b9 migration.
 * It populates the `password_hash` column for:
 *
 *   - admin@faithel.com      → password: admin123       (role: admin)
 *   - exporter-001@...com      → password: exporter001    (role: operator)
 *   - abi@faithel.com        → password: demo           (role: operator)
 *
 * After running this, the login route verifies the bcrypt hash —
 * "any password works" behavior is gone.
 *
 * Run:  node /home/z/my-project/scripts/seed-passwords.js
 */

import Database from "better-sqlite3";
import { hashPassword } from "../src/lib/password";
import path from "path";
import fs from "fs";

function getDbPath(): string {
  const candidates = [
    path.resolve(__dirname, "..", "coffee_export", "data", "coffee_export.db"),
    "/home/z/my-project/coffee_export/data/coffee_export.db",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("Could not find coffee_export.db");
}

const nowISO = () => new Date().toISOString().replace("Z", "+03:00");

const SEED_ACCOUNTS = [
  {
    operator_id: "admin-001",
    name: "System Administrator",
    email: "admin@faithel.com",
    role: "admin",
    password: "admin123",
  },
  {
    operator_id: "exporter-001",
    name: "Marcus Bell",
    email: "exporter-001@faithelexport.com",
    role: "operator",
    password: "exporter001",
  },
  {
    operator_id: "exporter-002",
    name: "Abi Solomon",
    email: "abi@faithel.com",
    role: "operator",
    password: "exporter002",
  },
];

const db = new Database(getDbPath());
try {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  const now = nowISO();
  let inserted = 0;
  let updated = 0;

  for (const account of SEED_ACCOUNTS) {
    const hash = hashPassword(account.password);
    const normalizedEmail = account.email.trim().toLowerCase();

    // Check if operator exists (by email — case-insensitive)
    const existing = db.prepare(
      "SELECT operator_id, password_hash FROM operators WHERE LOWER(email) = ?"
    ).get(normalizedEmail) as any;

    if (existing) {
      // Update the existing row with the new password hash
      db.prepare(`
        UPDATE operators
        SET password_hash = ?, role = ?, updated_ts = ?
        WHERE operator_id = ?
      `).run(hash, account.role, now, existing.operator_id);
      console.log(`  ✓ Updated password for ${account.email} (${account.role})`);
      updated++;
    } else {
      // Insert new row (for admin-001 if it doesn't exist yet)
      db.prepare(`
        INSERT INTO operators (operator_id, name, email, role, status, password_hash, created_ts, updated_ts)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(account.operator_id, account.name, account.email, account.role, hash, now, now);
      console.log(`  ✓ Created account ${account.email} (${account.role})`);
      inserted++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${updated} updated.`);
  console.log("\nLogin credentials (you can change these after logging in):");
  for (const account of SEED_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(10)} ${account.email.padEnd(40)} ${account.password}`);
  }

  // Verify all operators now have a password_hash
  const missing = db.prepare(
    "SELECT operator_id, email FROM operators WHERE password_hash IS NULL"
  ).all() as any[];
  if (missing.length > 0) {
    console.log(`\n⚠️  ${missing.length} operators still have no password_hash:`);
    for (const op of missing) {
      console.log(`    ${op.operator_id} — ${op.email}`);
    }
  } else {
    console.log("\n✓ All operators have a password hash.");
  }
} finally {
  db.close();
}
