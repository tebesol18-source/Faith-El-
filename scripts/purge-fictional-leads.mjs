#!/usr/bin/env node
/**
 * Purge fictional/sample leads from the production database.
 *
 * Phase 1 requirement: "Keep fictional/sample records out of production."
 *
 * A lead is FICTIONAL if any of:
 *   - company_name ends with a 5-digit number (the old synthetic generator's
 *     signature, e.g. "Heritage Bean Co 24238")
 *   - company_name contains an obviously-placeholder word
 *     (test / sample / demo / placeholder / fictional / dummy)
 *   - every non-deleted contact email is on a fictional/reserved domain
 *     (example.com, *.test, *.invalid, …) or the platform's own masked domain
 *
 * Cascades (FK ON DELETE CASCADE): lead_contacts, lead_tags,
 * lead_state_history, outreach_touches, lead_sources,
 * lead_verification_log. Also removes bus events that reference the
 * deleted fictional lead ids (they describe entities that never existed).
 *
 * Safety: --dry-run (default) prints what would be deleted and exits.
 * A timestamped backup of the DB is written OUTSIDE the repo before applying.
 *
 * Usage:
 *   node scripts/purge-fictional-leads.mjs            # dry run
 *   node scripts/purge-fictional-leads.mjs --apply
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const dbPath = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd(), "state", "coffee_export.db");

const apply = process.argv.includes("--apply");

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

const FICTIONAL_DOMAINS = new Set([
  "example.com", "example.org", "example.net",
  "test.com", "test.org", "invalid.com", "invalid",
  "fake.com", "dummy.com", "localhost",
  "faithelexport.com", // platform masked domain — never a real buyer address
]);
const FICTIONAL_TLDS = [".test", ".example", ".invalid", ".localhost"];

function isFictionalEmail(email) {
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@").pop().toLowerCase().trim();
  if (FICTIONAL_DOMAINS.has(domain)) return true;
  return FICTIONAL_TLDS.some((tld) => domain.endsWith(tld));
}

function looksFictionalCompany(name) {
  if (!name) return false;
  if (/\s\d{5}$/.test(name.trim())) return true; // old generator signature "Co 24238"
  if (/\b(test|sample|demo|placeholder|fictional|dummy)\b/i.test(name)) return true;
  return false;
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const leads = db.prepare(`
  SELECT lead_id, company_name, headquarters_country, organization_id
  FROM leads WHERE deleted_ts IS NULL
`).all();

const fictionalIds = [];
for (const lead of leads) {
  if (looksFictionalCompany(lead.company_name)) {
    fictionalIds.push({ ...lead, reason: "company-name pattern" });
    continue;
  }
  const contacts = db.prepare(
    `SELECT email FROM lead_contacts WHERE lead_id = ? AND deleted_ts IS NULL`
  ).all(lead.lead_id);
  if (contacts.length > 0 && contacts.every((c) => isFictionalEmail(c.email))) {
    fictionalIds.push({ ...lead, reason: "all contacts on fictional domains" });
  }
}

if (fictionalIds.length === 0) {
  console.log("No fictional leads found. Production DB is clean.");
  db.close();
  process.exit(0);
}

// ── Dry-run report ───────────────────────────────────────────────
console.log(`Fictional leads detected: ${fictionalIds.length}`);
for (const f of fictionalIds) {
  console.log(`  - ${f.lead_id} | ${f.company_name} | ${f.headquarters_country} | ${f.organization_id} | reason: ${f.reason}`);
}
const ids = fictionalIds.map((f) => f.lead_id);
const qmarks = ids.map(() => "?").join(",");

// Full fictional chain: sample/quote/contract/invoice/payment records
// that reference the fictional buyers are sample records too (drafts and a
// pretend 'paid' invoice for companies that never existed).
const fictionContracts = db.prepare(
  `SELECT contract_id, status, organization_id FROM contracts WHERE lead_id IN (${qmarks})`
).all(...ids);
const fictionInvoices = db.prepare(
  `SELECT invoice_id, status FROM invoices WHERE lead_id IN (${qmarks})`
).all(...ids);
const fictionPayments = db.prepare(
  `SELECT payment_id FROM payments WHERE invoice_id IN (SELECT invoice_id FROM invoices WHERE lead_id IN (${qmarks}))`
).all(...ids);
const fictionSamples = db.prepare(
  `SELECT sample_request_id, buyer_company, status FROM sample_requests WHERE lead_id IN (${qmarks})`
).all(...ids);

const counts = {};
counts["leads"] = db.prepare(`SELECT COUNT(*) n FROM leads WHERE lead_id IN (${qmarks})`).get(...ids).n;
for (const t of ["lead_contacts", "lead_tags", "lead_state_history", "outreach_touches"]) {
  counts[t] = db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE lead_id IN (${qmarks})`).get(...ids).n;
}
counts["events (bus, entity=lead)"] = db.prepare(
  `SELECT COUNT(*) n FROM events WHERE entity_type = 'lead' AND entity_id IN (${qmarks})`
).get(...ids).n;
counts["contracts/quotes"] = fictionContracts.length;
counts["invoices"] = fictionInvoices.length;
counts["payments"] = fictionPayments.length;
counts["sample_requests"] = fictionSamples.length;
console.log("Delete plan:", JSON.stringify(counts));
for (const c of fictionContracts) console.log(`  - contract ${c.contract_id} (${c.status}, ${c.organization_id})`);
for (const i of fictionInvoices) console.log(`  - invoice ${i.invoice_id} (${i.status})`);
for (const s of fictionSamples) console.log(`  - sample_request ${s.sample_request_id} ("${s.buyer_company}", ${s.status})`);

// Policy (same as the P3 purge): admin_audit_log / audit_log rows are kept —
// they are real records of what operators actually did, even when the
// entities they acted on later turn out to be fictional.

// What survives — prove we are not touching real data
const survivors = db.prepare(`
  SELECT lead_id, company_name, headquarters_country, organization_id
  FROM leads WHERE deleted_ts IS NULL AND lead_id NOT IN (${qmarks})
`).all(...ids);
console.log(`Leads that would REMAIN: ${survivors.length}`);
for (const s of survivors) console.log(`  + ${s.lead_id} | ${s.company_name} | ${s.headquarters_country} | ${s.organization_id}`);
const survivingContracts = db.prepare(
  `SELECT contract_id, status, organization_id FROM contracts WHERE lead_id NOT IN (${qmarks})`
).all(...ids);
console.log(`Contracts that would REMAIN: ${survivingContracts.length}`);
for (const s of survivingContracts) console.log(`  + ${s.contract_id} | ${s.status} | ${s.organization_id}`);

if (!apply) {
  console.log("\nDRY RUN — no changes made. Re-run with --apply to delete.");
  db.close();
  process.exit(0);
}

// ── Backup (outside the repo) ────────────────────────────────────
const backupDir = "/home/z/my-project/backups";
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupPath = path.join(backupDir, `pre-fictional-purge-${stamp}.db`);
fs.copyFileSync(dbPath, backupPath);
console.log(`\nBackup written: ${backupPath}`);
console.log(`  sha256: ${crypto.createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex")}`);

// ── Apply ────────────────────────────────────────────────────────
try {
  const tx = db.transaction(() => {
    // 1. Bus events describing entities that never existed
    db.prepare(`DELETE FROM events WHERE entity_type = 'lead' AND entity_id IN (${qmarks})`).run(...ids);
    // 2. Shipment items + shipments for fictional contracts (FK NO ACTION — first)
    db.prepare(`
      DELETE FROM shipment_items WHERE shipment_id IN
        (SELECT shipment_id FROM shipments WHERE contract_id IN
          (SELECT contract_id FROM contracts WHERE lead_id IN (${qmarks})))
    `).run(...ids);
    db.prepare(`
      DELETE FROM shipments WHERE contract_id IN
        (SELECT contract_id FROM contracts WHERE lead_id IN (${qmarks}))
    `).run(...ids);
    // 3. Contracts/quotes for fictional buyers (cascades invoices → payments,
    //    and commissions / profits / costs)
    const deletedContracts = db.prepare(`DELETE FROM contracts WHERE lead_id IN (${qmarks})`).run(...ids).changes;
    // 4. Sample requests for fictional buyers (cascades sample_shipments)
    const deletedSamples = db.prepare(`DELETE FROM sample_requests WHERE lead_id IN (${qmarks})`).run(...ids).changes;
    // 5. The fictional leads themselves (cascades contacts/tags/history/touches/sources/log)
    const deletedLeads = db.prepare(`DELETE FROM leads WHERE lead_id IN (${qmarks})`).run(...ids).changes;
    return { deletedContracts, deletedSamples, deletedLeads };
  });
  const { deletedContracts, deletedSamples, deletedLeads } = tx();
  console.log(`Deleted ${deletedLeads} fictional leads, ${deletedContracts} contracts/quotes, ${deletedSamples} sample requests (+ invoices/payments/contacts/tags/events cascades above).`);

  const remaining = db.prepare(`
    SELECT COUNT(*) n FROM leads WHERE deleted_ts IS NULL
  `).get().n;
  const leftoverContacts = db.prepare(
    `SELECT COUNT(*) n FROM lead_contacts WHERE deleted_ts IS NULL AND email IS NOT NULL`
  ).all();
  console.log(`Remaining active leads: ${remaining}`);

  const fk = db.pragma("foreign_key_check");
  if (fk.length > 0) { console.error("foreign_key_check FAILED:", fk); process.exit(1); }
  const integrity = db.pragma("integrity_check")[0];
  if (integrity.integrity_check !== "ok") { console.error("integrity_check FAILED:", integrity); process.exit(1); }
  console.log("foreign_key_check: ok");
  console.log("integrity_check: ok");
  console.log("Purge complete.");
} catch (e) {
  console.error("PURGE FAILED:", e.message);
  process.exit(1);
} finally {
  db.close();
}
