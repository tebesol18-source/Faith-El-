#!/usr/bin/env node
/**
 * Migration: lead evidence & verification (Phase 1 — real-lead intake).
 *
 * Steps (each idempotent — safe to re-run):
 *   1. Rebuild leads' UNIQUE constraint from (company, country) to
 *      (company, country, organization_id) — the old global constraint
 *      prevented two exporter orgs from each tracking the same real-world
 *      company. Uses the standard SQLite 12-step table-rebuild recipe.
 *      CHECK constraints are preserved via triggers (SQLite cannot keep
 *      them through a column-copy rebuild).
 *   2. leads.verification_status / verified_ts / verified_by
 *      ('unverified' | 'verified' | 'rejected')
 *   3. lead_contacts.verification_status / verified_ts / verified_by
 *   4. lead_sources — one row per piece of evidence: where the company or
 *      contact was found (source URL), what it documents, product interest,
 *      date checked, latest automated reachability-check result.
 *   5. lead_verification_log — append-only audit of every check / confirm /
 *      reject action with the actor.
 *
 * Usage:  node scripts/migrations/2026-09-26-lead-evidence.mjs [db-path]
 *   db-path defaults to the canonical DB (COFFEE_DATABASE_URL / state/coffee_export.db).
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(explicit) {
  if (explicit) return path.resolve(explicit);
  const env = process.env.COFFEE_DATABASE_URL || "";
  const candidates = [];
  if (env.startsWith("sqlite:///")) {
    candidates.push(path.resolve(process.cwd(), env.replace("sqlite:///", "")));
  }
  candidates.push(
    path.resolve(__dirname, "..", "..", "state", "coffee_export.db"),
    path.resolve(process.cwd(), "state", "coffee_export.db")
  );
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).size > 0) return c;
  }
  console.error("Could not locate coffee_export.db — pass the path explicitly.");
  process.exit(1);
}

const dbPath = resolveDbPath(process.argv[2]);
console.log(`Migrating: ${dbPath}`);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const actions = [];

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

/** Full column DDL (type + NOT NULL + default) from PRAGMA table_info. */
function columnDdl(cols) {
  return cols.map((c) => {
    let s = `"${c.name}" ${c.type}`;
    if (c.notnull) s += " NOT NULL";
    if (c.dflt_value !== null && c.dflt_value !== undefined) s += ` DEFAULT ${c.dflt_value}`;
    return s;
  });
}

const LEAD_INDEXES = [
  "CREATE INDEX IF NOT EXISTS ix_leads_current_state ON leads (current_state)",
  "CREATE INDEX IF NOT EXISTS ix_leads_current_agent ON leads (current_agent)",
  "CREATE INDEX IF NOT EXISTS ix_leads_priority_tier ON leads (priority_tier)",
  "CREATE INDEX IF NOT EXISTS ix_leads_next_action ON leads (next_action_due_ts)",
  "CREATE INDEX IF NOT EXISTS ix_leads_source_hash ON leads (source_row_hash)",
  "CREATE INDEX IF NOT EXISTS ix_leads_verification_status ON leads (verification_status)",
];

/** All CHECK-domain triggers for the leads table (applied after any rebuild). */
function createLeadTriggers() {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_verification_status_ins
    BEFORE INSERT ON leads
    WHEN NEW.verification_status NOT IN ('unverified', 'verified', 'rejected')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.verification_status'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_verification_status_upd
    BEFORE UPDATE OF verification_status ON leads
    WHEN NEW.verification_status NOT IN ('unverified', 'verified', 'rejected')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.verification_status'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_verified_requires_actor
    BEFORE UPDATE OF verification_status ON leads
    WHEN NEW.verification_status IN ('verified', 'rejected')
      AND (IFNULL(NEW.verified_by, '') = '' OR IFNULL(NEW.verified_ts, '') = '')
    BEGIN SELECT RAISE(ABORT, 'verified/rejected requires verified_by and verified_ts'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_current_state_chk
    BEFORE INSERT ON leads
    WHEN NEW.current_state NOT IN ('NEW','ENRICHED','IN_SEQUENCE','QUALIFIED','SAMPLE_DISPATCHED','SAMPLE_FEEDBACK_DUE','DECIDED_APPROVED','DECIDED_REJECTED','DECIDED_NEEDS_ANOTHER','GHOSTED','CONTRACTED','NURTURE','BLOCKED')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.current_state'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_current_state_upd
    BEFORE UPDATE OF current_state ON leads
    WHEN NEW.current_state NOT IN ('NEW','ENRICHED','IN_SEQUENCE','QUALIFIED','SAMPLE_DISPATCHED','SAMPLE_FEEDBACK_DUE','DECIDED_APPROVED','DECIDED_REJECTED','DECIDED_NEEDS_ANOTHER','GHOSTED','CONTRACTED','NURTURE','BLOCKED')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.current_state'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_tier_chk_ins
    BEFORE INSERT ON leads
    WHEN NEW.priority_tier IS NOT NULL AND NEW.priority_tier NOT IN ('S','A','B','C','Disqualify')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.priority_tier'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_tier_chk_upd
    BEFORE UPDATE OF priority_tier ON leads
    WHEN NEW.priority_tier IS NOT NULL AND NEW.priority_tier NOT IN ('S','A','B','C','Disqualify')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.priority_tier'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_vp_chk_ins
    BEFORE INSERT ON leads
    WHEN NEW.recommended_vp IS NOT NULL AND NEW.recommended_vp NOT IN ('VP1','VP2','VP3','VP4')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.recommended_vp'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_vp_chk_upd
    BEFORE UPDATE OF recommended_vp ON leads
    WHEN NEW.recommended_vp IS NOT NULL AND NEW.recommended_vp NOT IN ('VP1','VP2','VP3','VP4')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.recommended_vp'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_language_chk_ins
    BEFORE INSERT ON leads
    WHEN NEW.outreach_language NOT IN ('EN','DE','FR','IT','JA','KO','ZH','AR','TR','RU')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.outreach_language'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_leads_language_chk_upd
    BEFORE UPDATE OF outreach_language ON leads
    WHEN NEW.outreach_language NOT IN ('EN','DE','FR','IT','JA','KO','ZH','AR','TR','RU')
    BEGIN SELECT RAISE(ABORT, 'invalid leads.outreach_language'); END
  `);
}

try {
  // ── 1. Org-scoped UNIQUE on leads (12-step rebuild) ─────────────
  const leadDdl = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='leads'`).get();
  const hasGlobalUnique = /UNIQUE\s*\(\s*company_name\s*,\s*headquarters_country\s*\)/i.test(leadDdl.sql || "");
  if (hasGlobalUnique) {
    const cols = tableColumns("leads");
    const ddl = columnDdl(cols);
    const colList = cols.map((c) => `"${c.name}"`).join(", ");
    // Triggers on OTHER tables that reference `leads` (e.g. lead_sources org
    // guard) must be dropped before the rename — ALTER TABLE RENAME re-parses
    // the whole schema and would abort on the missing `leads` table.
    const dependentTriggers = db.prepare(
      `SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name <> 'leads' AND sql LIKE '%leads%'`
    ).all().filter((t) => /\bleads\b/.test(t.sql));
    db.pragma("foreign_keys = OFF");
    try {
      db.exec("BEGIN");
      for (const t of dependentTriggers) db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
      db.exec(`DROP TABLE IF EXISTS leads_rebuild`);
      db.exec(`
        CREATE TABLE leads_rebuild (
          ${ddl.join(",\n          ")},
          PRIMARY KEY (lead_id),
          CONSTRAINT uq_leads_company_country UNIQUE (company_name, headquarters_country, organization_id)
        )
      `);
      db.exec(`INSERT INTO leads_rebuild (${colList}) SELECT ${colList} FROM leads`);
      db.exec(`DROP TABLE leads`);
      db.exec(`ALTER TABLE leads_rebuild RENAME TO leads`);
      // Re-create the dependent triggers verbatim after the rename.
      for (const t of dependentTriggers) db.exec(t.sql);
      for (const idx of LEAD_INDEXES) db.exec(idx);
      createLeadTriggers();
      const fk = db.pragma("foreign_key_check");
      if (fk.length > 0) throw new Error("foreign_key_check failed after rebuild: " + JSON.stringify(fk.slice(0, 5)));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    } finally {
      db.pragma("foreign_keys = ON");
    }
    actions.push("leads: UNIQUE(company,country) → UNIQUE(company,country,organization_id) (multi-tenant lead pool) + CHECK/preservation triggers + indexes");
  }

  db.exec("BEGIN");

  // ── 2. leads.verification columns ───────────────────────────────
  const leadColNames = tableColumns("leads").map((c) => c.name);
  if (!leadColNames.includes("verification_status")) {
    db.exec(`ALTER TABLE leads ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'`);
    db.exec(`ALTER TABLE leads ADD COLUMN verified_ts TEXT`);
    db.exec(`ALTER TABLE leads ADD COLUMN verified_by TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS ix_leads_verification_status ON leads (verification_status)`);
    actions.push("leads: +verification_status/verified_ts/verified_by");
  }
  createLeadTriggers();

  // ── 3. lead_contacts.verification columns ───────────────────────
  const contactCols = tableColumns("lead_contacts").map((c) => c.name);
  if (!contactCols.includes("verification_status")) {
    db.exec(`ALTER TABLE lead_contacts ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'`);
    db.exec(`ALTER TABLE lead_contacts ADD COLUMN verified_ts TEXT`);
    db.exec(`ALTER TABLE lead_contacts ADD COLUMN verified_by TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS ix_lead_contacts_verification ON lead_contacts (verification_status)`);
    actions.push("lead_contacts: +verification_status/verified_ts/verified_by");
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_lead_contacts_verification_status_ins
    BEFORE INSERT ON lead_contacts
    WHEN NEW.verification_status NOT IN ('unverified', 'verified', 'rejected')
    BEGIN SELECT RAISE(ABORT, 'invalid lead_contacts.verification_status'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_lead_contacts_verification_status_upd
    BEFORE UPDATE OF verification_status ON lead_contacts
    WHEN NEW.verification_status NOT IN ('unverified', 'verified', 'rejected')
    BEGIN SELECT RAISE(ABORT, 'invalid lead_contacts.verification_status'); END
  `);

  // ── 4. lead_sources ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_sources (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      evidence_for TEXT NOT NULL DEFAULT 'company'
        CHECK (evidence_for IN ('company', 'contact', 'both')),
      contact_id INTEGER,
      source_type TEXT NOT NULL
        CHECK (source_type IN ('directory', 'website', 'registry', 'marketplace', 'event', 'publication', 'manual', 'other')),
      source_url TEXT,
      source_name TEXT,
      company_as_listed TEXT,
      country TEXT,
      product_interest TEXT,
      checked_ts TEXT,
      checked_by TEXT,
      note TEXT,
      last_check_status TEXT,
      last_check_detail TEXT,
      last_check_ts TEXT,
      created_ts TEXT NOT NULL,
      updated_ts TEXT NOT NULL,
      deleted_ts TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads (lead_id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES lead_contacts (id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_lead_sources_lead ON lead_sources (lead_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_lead_sources_org ON lead_sources (organization_id)`);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_lead_sources_org_match
    BEFORE INSERT ON lead_sources
    WHEN NEW.organization_id <> (SELECT organization_id FROM leads WHERE lead_id = NEW.lead_id)
    BEGIN SELECT RAISE(ABORT, 'lead_sources.organization_id must match leads.organization_id'); END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_lead_sources_cite_something
    BEFORE INSERT ON lead_sources
    WHEN (IFNULL(NEW.source_url, '') = '' AND IFNULL(NEW.note, '') = '')
    BEGIN SELECT RAISE(ABORT, 'lead_sources row needs a source_url or a note'); END
  `);
  actions.push("lead_sources: table + indexes + org/citation triggers");

  // ── 5. lead_verification_log ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_verification_log (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('company', 'contact')),
      contact_id INTEGER,
      action TEXT NOT NULL CHECK (action IN ('check', 'confirm', 'reject', 'reset')),
      result TEXT,
      detail TEXT,
      actor TEXT NOT NULL,
      created_ts TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads (lead_id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_lead_verification_log_lead ON lead_verification_log (lead_id)`);
  actions.push("lead_verification_log: table + index");

  db.exec("COMMIT");

  // ── Post-checks ─────────────────────────────────────────────────
  const fk = db.pragma("foreign_key_check");
  if (fk.length > 0) {
    console.error("foreign_key_check FAILED:", fk.slice(0, 10));
    process.exit(1);
  }
  const integrity = db.pragma("integrity_check")[0];
  if (integrity.integrity_check !== "ok") {
    console.error("integrity_check FAILED:", integrity);
    process.exit(1);
  }
  console.log("foreign_key_check: ok");
  console.log("integrity_check: ok");
  console.log(actions.length ? `Applied:\n  - ${actions.join("\n  - ")}` : "Already migrated — no changes.");
} catch (e) {
  try { db.exec("ROLLBACK"); } catch {}
  console.error("MIGRATION FAILED (rolled back):", e.message);
  process.exit(1);
} finally {
  db.close();
}
