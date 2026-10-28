/**
 * Phase 3 — ONE GENUINE BUYER JOURNEY (run against the live local stack).
 *
 * Rules of engagement (from the task):
 *   - One real coffee lot + one real, verified prospect.
 *   - No pretending a test transaction is a completed sale.
 *   - Record delivery or failure honestly.
 *   - Quote/contract/samples/shipment/payment only as actually justified.
 *
 * This script drives the REAL API surface exactly as the UI would:
 *   1. Import Falcon Coffees from the curated real-company directory
 *   2. Reachability-check its evidence
 *   3. Add the real, evidence-backed contact (Matt Horsbrugh — public bio
 *      on falconcoffees.com/our-people; published group email on /contact)
 *   4. Verify company + contact (audited human actions)
 *   5. Advance NEW → ENRICHED
 *   6. (supervisor tick drafts the outreach — separate step)
 *   7. Approve the outreach (POST /api/approvals)
 *   8. (supervisor tick executes the send through the bridge — separate step)
 *
 * Usage: npx tsx scripts/phase3-journey.mts
 * Requires: dev server on :3000, bridge on :8000
 */

import { getAdminClient } from "../tests/integration/helpers.ts";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

function log(step: string, msg: string) {
  console.log(`[${step}] ${msg}`);
}

async function main() {
  const admin = await getAdminClient();

  // ── Step 1: Import Falcon Coffees from the directory ──────────────
  log("1/6", "Importing Falcon Coffees from the curated real-company directory…");
  const imp = await admin.fetch("/api/agents/research-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directoryKeys: ["falcon-uk"] }),
  });
  const impD = await imp.json();
  if (!imp.ok || !impD.ok) {
    console.error("Import failed:", JSON.stringify(impD).slice(0, 400));
    process.exit(1);
  }
  const lead = impD.leads?.[0];
  let leadId: string;
  if (!lead) {
    // Maybe already imported (duplicate skip) — find it
    const list = await admin.fetch("/api/leads?limit=200").then((r) => r.json());
    const existing = (list.leads || []).find(
      (l: any) => (l.company_name || l.company) === "Falcon Coffees"
    );
    if (!existing) {
      console.error("Import returned no Falcon lead and none exists:", JSON.stringify(impD).slice(0, 400));
      process.exit(1);
    }
    log("1/6", `Falcon Coffees already imported as ${existing.id} — continuing with it.`);
    leadId = existing.id;
  } else {
    leadId = lead.id || lead.leadId || lead.lead_id;
  }
  log("1/6", `Lead created: ${leadId} (unverified, evidence attached)`);

  // ── Step 2: Reachability check on the evidence ─────────────────────
  log("2/6", "Running advisory reachability check on the evidence URLs…");
  const chk = await admin.fetch(`/api/leads/${leadId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "check" }),
  });
  const chkD = await chk.json();
  if (!chk.ok || !chkD.ok) {
    console.error("Check failed:", JSON.stringify(chkD).slice(0, 400));
    process.exit(1);
  }
  log("2/6", `Reachability results: ${JSON.stringify(chkD.sources?.map((s: any) => `${s.sourceUrl} → ${s.status}`) || chkD)}`);

  // ── Step 3: Add the REAL contact with evidence ─────────────────────
  log("3/6", "Adding real contact: Matt Horsbrugh (Chief Trading Officer)…");
  const contact = await admin.fetch(`/api/leads/${leadId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Matt Horsbrugh",
      title: "Chief Trading Officer",
      email: "group@falconspecialty.com",
      sourceUrl: "https://falconcoffees.com/our-people/",
      sourceName: "Falcon Coffees — Our People (official team page)",
      note: "Matt Horsbrugh oversees global trading activities and origin-sourcing operations (bio on official team page). Published group email from the official contact page: https://falconcoffees.com/contact/",
    }),
  });
  const contactD = await contact.json();
  if (!contact.ok || !contactD.ok) {
    console.error("Contact add failed:", JSON.stringify(contactD).slice(0, 400));
    process.exit(1);
  }
  const contactId = contactD.contactId;
  log("3/6", `Contact added (id=${contactId}, unverified) with evidence from falconcoffees.com`);

  // ── Step 4: Verify company + contact (audited human actions) ───────
  log("4/6", "Verifying company (human confirmation, audited)…");
  const vc = await admin.fetch(`/api/leads/${leadId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm", level: "company" }),
  });
  const vcD = await vc.json();
  if (!vc.ok || !vcD.ok) {
    console.error("Company verify failed:", JSON.stringify(vcD).slice(0, 400));
    process.exit(1);
  }
  log("4/6", "Company VERIFIED.");

  log("4/6", "Verifying contact (human confirmation, audited)…");
  const vt = await admin.fetch(`/api/leads/${leadId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm", level: "contact", contactId }),
  });
  const vtD = await vt.json();
  if (!vt.ok || !vtD.ok) {
    console.error("Contact verify failed:", JSON.stringify(vtD).slice(0, 400));
    process.exit(1);
  }
  log("4/6", "Contact VERIFIED.");

  // ── Step 5: Advance NEW → ENRICHED (no gate on this transition) ────
  log("5/6", "Advancing lead NEW → ENRICHED…");
  const adv = await admin.fetch(`/api/leads/${leadId}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const advD = await adv.json();
  if (!adv.ok || !advD.ok) {
    console.error("Advance failed:", JSON.stringify(advD).slice(0, 400));
    process.exit(1);
  }
  log("5/6", `Lead state: ${advD.previousState} → ${advD.newState || advD.state}`);

  // ── Step 6: Summary ────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════");
  console.log("INTAKE COMPLETE — ready for supervisor tick + approval");
  console.log(`  leadId:    ${leadId}`);
  console.log(`  contactId: ${contactId}`);
  console.log("Next: node scripts/supervisor.js --once  (drafts outreach)");
  console.log("Then: approve via POST /api/approvals {id, action:'approve'}");
  console.log("Then: node scripts/supervisor.js --once  (executes the send)");
  console.log("════════════════════════════════════════════════");

  // Persist leadId/contactId for the follow-up steps
  const fs = await import("fs");
  fs.writeFileSync(
    "/tmp/phase3-journey-state.json",
    JSON.stringify({ leadId, contactId }, null, 2)
  );
}

main().catch((err) => {
  console.error("Journey crashed:", err);
  process.exit(2);
});
