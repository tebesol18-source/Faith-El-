/**
 * Unit tests — Phase 1 fiction guard + evidence helpers (src/lib/leads-evidence).
 *
 * Pure-function checks for the fiction guard, plus an in-memory SQLite
 * database for the outreach gate and lead-id generator.
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import {
  isFictionalEmail,
  isEmailFormatValid,
  looksFictionalCompany,
  contactEmailError,
  sourceUrlError,
  checkOutreachGate,
  nextLeadId,
  insertLeadSource,
  getLeadSources,
} from "@/lib/leads-evidence";

// ─── Fiction guard: emails ────────────────────────────────────────────────

describe("isFictionalEmail", () => {
  it("rejects reserved documentation domains", () => {
    expect(isFictionalEmail("lena@example.com")).toBe(true);
    expect(isFictionalEmail("marcus.schmidt@example.org")).toBe(true);
    expect(isFictionalEmail("x@example.net")).toBe(true);
  });

  it("rejects test/invalid/fake domains and TLDs", () => {
    expect(isFictionalEmail("a@test.com")).toBe(true);
    expect(isFictionalEmail("a@foo.test")).toBe(true);
    expect(isFictionalEmail("a@bar.invalid")).toBe(true);
    expect(isFictionalEmail("a@shop.example")).toBe(true);
  });

  it("rejects the platform's own masked domain — a buyer is never @faithelexport.com", () => {
    expect(isFictionalEmail("abi@faithelexport.com")).toBe(true);
  });

  it("accepts real buyer domains", () => {
    expect(isFictionalEmail("buyer@sucafina.com")).toBe(false);
    expect(isFictionalEmail("buyer@royalcoffee.com")).toBe(false);
    expect(isFictionalEmail("buyer@timwendelboe.no")).toBe(false);
  });

  it("handles null/empty/malformed input", () => {
    expect(isFictionalEmail(null)).toBe(false);
    expect(isFictionalEmail(undefined)).toBe(false);
    expect(isFictionalEmail("")).toBe(false);
    expect(isFictionalEmail("not-an-email")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isFictionalEmail("Lena@EXAMPLE.COM")).toBe(true);
  });
});

describe("isEmailFormatValid + contactEmailError", () => {
  it("validates format", () => {
    expect(isEmailFormatValid("a@b.co")).toBe(true);
    expect(isEmailFormatValid("bad@@example.com")).toBe(false);
    expect(isEmailFormatValid("no-tld@domain")).toBe(false);
  });

  it("contactEmailError distinguishes format vs fiction", () => {
    expect(contactEmailError("not an email")).toContain("not a valid email");
    expect(contactEmailError("x@example.com")).toContain("reserved/test domain");
    expect(contactEmailError("buyer@sucafina.com")).toBeNull();
    expect(contactEmailError(null)).toBeNull();
    expect(contactEmailError("")).toBeNull();
  });
});

// ─── Fiction guard: company names ─────────────────────────────────────────

describe("looksFictionalCompany", () => {
  it("catches the old generator's trailing-5-digit signature", () => {
    expect(looksFictionalCompany("Heritage Bean Co 24238")).toContain("5-digit");
    expect(looksFictionalCompany("Urban Roasting Co 52583")).toBeTruthy();
  });

  it("catches placeholder words", () => {
    expect(looksFictionalCompany("Test Buyer Co")).toBeTruthy();
    expect(looksFictionalCompany("Sample Roasters")).toBeTruthy();
    expect(looksFictionalCompany("Demo Import GmbH")).toBeTruthy();
  });

  it("accepts real company names", () => {
    expect(looksFictionalCompany("Neumann Kaffee Gruppe")).toBeNull();
    expect(looksFictionalCompany("49th Parallel Coffee Roasters")).toBeNull();
    expect(looksFictionalCompany("Sucafina")).toBeNull();
    expect(looksFictionalCompany("The Barn Coffee Roasters")).toBeNull();
  });

  it("does not false-positive on words merely containing 'test'", () => {
    expect(looksFictionalCompany("Latest Coffee Ventures")).toBeNull();
    expect(looksFictionalCompany("Protest Coffee")).toBeNull();
  });

  it("handles null/empty", () => {
    expect(looksFictionalCompany(null)).toBeNull();
    expect(looksFictionalCompany("")).toBeNull();
  });
});

// ─── Source URL validation ────────────────────────────────────────────────

describe("sourceUrlError", () => {
  it("accepts http(s) URLs", () => {
    expect(sourceUrlError("https://www.sucafina.com")).toBeNull();
    expect(sourceUrlError("http://example.org/listing")).toBeNull();
  });

  it("rejects non-http schemes and garbage", () => {
    expect(sourceUrlError("javascript:alert(1)")).toContain("http(s)");
    expect(sourceUrlError("ftp://files.example.com")).toContain("http(s)");
    expect(sourceUrlError("not a url")).toContain("not a valid URL");
  });

  it("treats empty as caller's business", () => {
    expect(sourceUrlError("")).toBeNull();
    expect(sourceUrlError(null)).toBeNull();
  });
});

// ─── Outreach gate + evidence helpers (in-memory DB) ───────────────────────

function makeTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE leads (
      lead_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      organization_id TEXT NOT NULL DEFAULT 'org-x',
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      deleted_ts TEXT
    );
    CREATE TABLE lead_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL DEFAULT 'org-x',
      name TEXT NOT NULL DEFAULT '',
      email TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      deleted_ts TEXT
    );
    CREATE TABLE lead_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL,
      evidence_for TEXT NOT NULL DEFAULT 'company',
      contact_id INTEGER,
      source_type TEXT NOT NULL,
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
      deleted_ts TEXT
    );
    CREATE TABLE lead_verification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL,
      level TEXT NOT NULL,
      contact_id INTEGER,
      action TEXT NOT NULL,
      result TEXT,
      detail TEXT,
      actor TEXT NOT NULL,
      created_ts TEXT NOT NULL
    );
  `);
  return db;
}

const NOW = "2026-09-26T10:00:00+03:00";

describe("checkOutreachGate", () => {
  it("returns 404 for a lead outside the caller's org", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id) VALUES ('L1', 'X Corp', 'org-x')").run();
    const gate = checkOutreachGate(db, "L1", "org-OTHER");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe(404);
  });

  it("blocks unverified leads (422)", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id) VALUES ('L1', 'X Corp', 'org-x')").run();
    const gate = checkOutreachGate(db, "L1", "org-x");
    expect(gate.ok).toBe(false);
    if (!gate.ok) { expect(gate.code).toBe(422); expect(gate.error).toContain("not verified"); }
  });

  it("blocks rejected leads even with verified contacts (422)", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id, verification_status) VALUES ('L1', 'X Corp', 'org-x', 'rejected')").run();
    db.prepare("INSERT INTO lead_contacts (lead_id, email, verification_status, organization_id) VALUES ('L1', 'b@real.com', 'verified', 'org-x')").run();
    const gate = checkOutreachGate(db, "L1", "org-x");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.error).toContain("rejected");
  });

  it("blocks a verified company with zero verified contacts (422)", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id, verification_status) VALUES ('L1', 'X Corp', 'org-x', 'verified')").run();
    db.prepare("INSERT INTO lead_contacts (lead_id, email, verification_status, organization_id) VALUES ('L1', 'b@real.com', 'unverified', 'org-x')").run();
    const gate = checkOutreachGate(db, "L1", "org-x");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.error).toContain("no verified contact");
  });

  it("blocks a verified contact whose email is fictional (defense in depth)", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id, verification_status) VALUES ('L1', 'X Corp', 'org-x', 'verified')").run();
    db.prepare("INSERT INTO lead_contacts (lead_id, email, verification_status, organization_id) VALUES ('L1', 'ghost@example.com', 'verified', 'org-x')").run();
    const gate = checkOutreachGate(db, "L1", "org-x");
    expect(gate.ok).toBe(false);
  });

  it("allows a verified company with a verified real contact", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id, verification_status) VALUES ('L1', 'X Corp', 'org-x', 'verified')").run();
    db.prepare("INSERT INTO lead_contacts (lead_id, email, verification_status, organization_id) VALUES ('L1', 'buyer@realcoffeeco.com', 'verified', 'org-x')").run();
    const gate = checkOutreachGate(db, "L1", "org-x");
    expect(gate.ok).toBe(true);
  });

  it("ignores soft-deleted contacts", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id, verification_status) VALUES ('L1', 'X Corp', 'org-x', 'verified')").run();
    db.prepare("INSERT INTO lead_contacts (lead_id, email, verification_status, organization_id, deleted_ts) VALUES ('L1', 'buyer@realcoffeeco.com', 'verified', 'org-x', '2026-09-01T00:00:00+03:00')").run();
    const gate = checkOutreachGate(db, "L1", "org-x");
    expect(gate.ok).toBe(false);
  });
});

describe("nextLeadId + evidence helpers", () => {
  it("generates sequential ids per year and survives collisions", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id) VALUES ('L-2026-00041', 'A', 'org-x')").run();
    const id = nextLeadId(db, "2026-09-26T10:00:00+03:00");
    expect(id).toBe("L-2026-00042");
  });

  it("insertLeadSource + getLeadSources round-trip", () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO leads (lead_id, company_name, organization_id) VALUES ('L1', 'X Corp', 'org-x')").run();
    const id = insertLeadSource(db, {
      lead_id: "L1", organization_id: "org-x", evidence_for: "company",
      source_type: "website", source_url: "https://example.org/x",
      product_interest: "Specialty arabica", now: NOW,
    });
    expect(id).toBeGreaterThan(0);
    const rows = getLeadSources(db, "L1", "org-x");
    expect(rows).toHaveLength(1);
    expect(rows[0].source_url).toBe("https://example.org/x");
    expect(rows[0].product_interest).toBe("Specialty arabica");
    // org-scoped read
    expect(getLeadSources(db, "L1", "org-OTHER")).toHaveLength(0);
  });
});
