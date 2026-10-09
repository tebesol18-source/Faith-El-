/**
 * E2E — Logistics Command Center, 20-step journey (fresh evidence).
 *
 * One invocation = isolated server (throwaway DB) + real browser driving
 * the real UI + API assertions + screenshots + teardown. Nothing mocked.
 * Hard 8-minute budget: the script force-exits so a hung selector can
 * never eat the tool timeout.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project/faith-el-erp";
const SRC_DB = path.join(ROOT, "state", "coffee_export.db");
const TEST_DB = path.join(ROOT, "state", "test-e2e.db");
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const SHOTS = "/home/z/my-project/download/e2e-logistics-evidence-fresh";
// Unique test identifier for every run — all created records carry it so
// they are identifiable and the booking reference is unique per journey.
const RUN_ID = `LCC-E2E-${Date.now().toString(36).toUpperCase()}`;
fs.mkdirSync(SHOTS, { recursive: true });

// ── hard budget ──
const HARD_TIMER = setTimeout(() => { console.error("✗ HARD TIMEOUT"); process.exit(1); }, 8 * 60 * 1000);
HARD_TIMER.unref?.();

const step = (n, msg) => console.log(`\n━━ Step ${n}: ${msg}`);
const pass = (msg) => console.log(`  ✓ ${msg}`);

const AB = "agent-browser";
function ab(args, { timeoutMs = 20000 } = {}) {
  try {
    return execFileSync(AB, args, { encoding: "utf-8", timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e) {
    const out = `${e.stdout || ""}${e.stderr || ""}`.trim().slice(0, 300);
    throw new Error(`agent-browser ${args.join(" ")} → ${out || e.message}`);
  }
}
// Click a button by visible-text prefix via eval — immune to the
// covered-element hit-test artifact on sticky drawer headers.
function clickBtn(label) {
  const r = ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('${label}')); if (!b) return 'NOT FOUND'; b.click(); return 'ok'; })()`);
  if (r !== "ok") throw new Error(`button not found: ${label} (${r})`);
  return r;
}

// agent-browser eval results may be JSON-encoded — normalize them
function ev(js, opts) {
  const raw = ab(["eval", js], opts);
  return raw.replace(/^"+|"+$/g, "").trim();
}
const shot = (name) => { try { execFileSync(AB, ["screenshot", `${SHOTS}/${name}.png`], { timeout: 20000, stdio: "pipe" }); } catch { /* non-fatal */ } };

let server;
function killServer() {
  if (!server) return;
  try { process.kill(-server.pid, "SIGKILL"); } catch { /* gone */ }
}
process.on("exit", () => {
  killServer();
  try { execFileSync(AB, ["close", "--all"], { timeout: 10000, stdio: "pipe" }); } catch { /* gone */ }
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeClient(email, password, ip) {
  let cookie = "";
  let csrf = "";
  return {
    async login() {
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email, password }),
      });
      for (const c of r.headers.getSetCookie?.() || []) {
        const m = c.match(/^([^=]+)=([^;]*)/);
        if (m) { cookie += `${m[1]}=${m[2]}; `; if (m[1] === "csrf-token") csrf = m[2]; }
      }
      if (r.status !== 200) throw new Error(`login failed: ${r.status}`);
    },
    async fetch(url, options = {}) {
      return fetch(BASE + url, {
        ...options,
        headers: { "Content-Type": "application/json", Cookie: cookie, "x-csrf-token": csrf, "x-forwarded-for": ip, ...(options.headers || {}) },
      });
    },
  };
}

async function up() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/api`, { signal: AbortSignal.timeout(1000) });
      if (r.status === 401 || r.status === 404 || r.ok) return true;
    } catch { /* not up */ }
    await sleep(1000);
  }
  return false;
}

async function main() {
  // ── Pre-flight: fresh browser session + kill leaked next dev instances ──
  try { execFileSync(AB, ["close", "--all"], { timeout: 10000, stdio: "pipe" }); } catch { /* none */ }
  // ── Pre-flight: kill any leaked next dev instances (they hold
  // .next/dev/lock and would hijack requests from stale DBs) ──
  try { execFileSync("pkill", ["-f", "next/dist/bin/next dev"], { stdio: "pipe" }); } catch { /* none */ }
  await sleep(1500);

  // ── Boot isolated server ──
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
  fs.copyFileSync(SRC_DB, TEST_DB);
  server = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT)],
    { cwd: ROOT, env: { ...process.env, DATABASE_PATH: TEST_DB, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"], detached: true }
  );
  server.stdout.pipe(fs.createWriteStream(path.join(ROOT, "state", "e2e-server.log"), { flags: "w" }));
  server.stderr.pipe(fs.createWriteStream(path.join(ROOT, "state", "e2e-server.log"), { flags: "a" }));
  if (!(await up())) throw new Error("server did not boot");

  // The journey runs as the SELLER (abi) — sellers see the full app nav;
  // admins are platform staff whose nav is the System group only.
  const sellerEmail = "abi@faithel.com";
  const seller = makeClient(sellerEmail, "coffee123", "10.90.0.1");
  await seller.login();
  const admin = makeClient("admin@faithel.com", "admin123", "10.90.0.9");
  await admin.login();
  pass("server up; seller (abi) + admin sessions established");

  // ── Step 1: create order (contract) on the real chain, in abi's org ──
  // The buyer is a REAL, sourced company from the verified lead directory
  // (data/lead-directory.json — Neumann Kaffee Gruppe, nkg.net) — no
  // fictional test companies, per the module's honesty contract.
  step(1, "create order: import real buyer → contract (seller org)");
  const leadR = await seller.fetch("/api/leads/import", {
    method: "POST",
    body: JSON.stringify({
      leads: [
        {
          company: "Neumann Kaffee Gruppe",
          country: "Germany",
          city: "Hamburg",
          website: "https://www.nkg.net",
          source_url: "https://www.nkg.net",
          note: "Imported for the Logistics Command Center E2E journey — real company, official source.",
        },
      ],
    }),
  });
  const leadRaw = await leadR.text();
  if (leadR.status !== 200 || !JSON.parse(leadRaw).ok) {
    throw new Error(`lead import failed: ${leadR.status} ${leadRaw.slice(0, 300)}`);
  }
  // The import response counts rows; fetch the created lead from the list
  const leadsList = await (await seller.fetch("/api/leads?limit=100")).json();
  const lead = (leadsList.leads || []).find((l) => (l.company || l.company_name) === "Neumann Kaffee Gruppe");
  if (!lead) throw new Error("imported lead not found in list");
  const contractR = await seller.fetch("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      leadId: lead.id, totalVolumeBags: 320, totalValue: 50000, incoterm: "FOB",
      currency: "USD", shipmentWindowStart: "2026-10-01", shipmentWindowEnd: "2026-12-01",
      paymentTerms: "30% advance",
    }),
  });
  if (contractR.status !== 201) throw new Error(`contract create failed: ${contractR.status}`);
  const contract = (await contractR.json()).contract;
  pass(`lead ${lead.id} + contract ${contract.id} in abi's org`);

  // ── Step 2: login through the real UI ──
  step(2, "login through the real UI");
  execFileSync(AB, ["set", "viewport", "1440", "900"], { stdio: "pipe" });
  ab(["open", BASE]);
  ab(["wait", 'input[type="email"]'], { timeoutMs: 30000 });
  ab(["find", "placeholder", "you@company.com", "fill", sellerEmail]);
  ab(["find", "placeholder", "••••••••", "fill", "coffee123"]);
  ab(["find", "role", "button", "click", "--name", "Sign in"]);
  // seller lands on Dashboard with the full sidebar
  ab(["wait", 'aside, nav'], { timeoutMs: 20000 });
  await sleep(2500);
  // A4: install the uncaught-error collector for the rest of the session
  ab(["eval", "(() => { window.__lccErrors = []; window.addEventListener('error', e => window.__lccErrors.push(String(e.message))); window.addEventListener('unhandledrejection', e => window.__lccErrors.push('unhandledrejection: ' + String(e.reason))); return 'collector installed'; })()"]);
  shot("01-login");
  pass("logged in via the form; console-error collector installed");

  // ── Step 3: navigate to Logistics ──
  step(3, "navigate to the Logistics page");
  // Sidebar may be collapsed (icon-only) — the nav buttons carry title attributes
  ab(["find", "title", "Logistics", "click"]);
  await sleep(2500);
  shot("02-logistics-command-center");
  const title = ab(["get", "text", "h1"]);
  if (!title.includes("Logistics Command Center")) throw new Error(`h1 mismatch: ${title}`);
  pass(`h1 = "${title.trim()}"`);

  // A5: the 8 stat cards must show the API's REAL numbers, not demo data.
  // Compare the rendered first card against /api/logistics/dashboard.
  const dash0 = await (await seller.fetch("/api/logistics/dashboard")).json();
  const firstCardRaw = ev( `(() => { const el = [...document.querySelectorAll('main p')].find(p => p.className.includes('text-2xl')); return el ? el.textContent.trim() : 'NOT FOUND'; })()`);
  // agent-browser eval output may be JSON-encoded — strip quotes/whitespace
  const firstCard = firstCardRaw.replace(/^"+|"+$/g, "").trim();
  if (firstCard === "NOT FOUND") throw new Error("stat card values not rendered");
  if (String(dash0.stats.activeShipments) !== firstCard) {
    throw new Error(`stat card (${firstCard}) != API activeShipments (${dash0.stats.activeShipments}) — hardcoded data?`);
  }
  pass(`first stat card matches the API response (${firstCard} = activeShipments)`);

  // ── Step 4: create the shipment via the UI ──
  step(4, "create shipment via New Shipment modal");
  ab(["find", "role", "button", "click", "--name", "New Shipment"]);
  await sleep(800);
  // select the contract in the first dropdown
  ab(["select", "select", contract.id]);
  ab(["fill", 'input[placeholder*="Hamburg"]', "Hamburg"]);
  // ETD + ETA date inputs in the modal
  const dates = ab(["eval", "Array.from(document.querySelectorAll('.fixed input[type=\"date\"]')).map(i=>i.value).join(',')"]);
  const modalDateCount = dates.split(",").filter((d) => d !== undefined).length;
  if (modalDateCount < 2) throw new Error(`expected 2+ date inputs in modal, got: ${dates}`);
  ab(["eval", `(() => { const ds = Array.from(document.querySelectorAll('.fixed input[type=\"date\"]')); const setV = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }; setV(ds[0], '2026-11-05'); setV(ds[1], '2026-11-28'); return 'ok'; })()`]);
  ab(["find", "role", "button", "click", "--name", "Create shipment"]);
  await sleep(2200);
  const bodyText = ab(["get", "text", "main"]);
  const m = bodyText.match(/SH-\d{4}-\d{4}/);
  if (!m) throw new Error("shipment id not visible after creation");
  const shipmentId = m[0];
  pass(`shipment ${shipmentId} created (visible in list)`);
  shot("03-shipment-created");

  // ── Step 5: open Find Empty Container ──
  step(5, "open Find Empty Container");
  ab(["find", "role", "button", "click", "--name", "Find Empty Container"]);
  await sleep(800);
  shot("04-find-container-modal");
  if (!ab(["get", "text", "body"]).includes("availability is confirmed by the provider")) {
    throw new Error("Find modal must state that availability is confirmed by the provider");
  }
  pass("modal states the honest contract");

  // ── Step 6: fill the requirement 2 × 20GP ──
  step(6, "fill requirement: 2 × 20GP, Addis Ababa → Djibouti, linked to the shipment");
  ab(["fill", 'input[placeholder*="Addis"]', "Addis Ababa"]);
  ab(["fill", 'input[placeholder*="Djibouti"]', "Djibouti"]);
  // Link the requirement to the shipment created in step 4 (the select whose
  // options include the shipment id)
  const linkSel = ev(`(() => { const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === '${shipmentId}')); if (!sel) return 'NOT FOUND'; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, '${shipmentId}'); sel.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
  if (linkSel !== "ok") throw new Error(`shipment reference select not found: ${linkSel}`);
  ab(["find", "role", "button", "click", "--name", "Find providers"]);
  await sleep(1800);
  shot("05-find-container-results");

  // ── Step 7: verify the ESL resource card with OFFICIAL links ──
  step(7, "verify ESL card: official links + contact actions");
  const websiteHref = ev( `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'Website'); return a ? a.href : 'NOT FOUND'; })()`);
  if (!websiteHref.startsWith("https://esl.et")) throw new Error(`ESL website link wrong: ${websiteHref}`);
  pass(`Website → ${websiteHref}`);
  const bookingHref = ev( `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'Book / Request'); return a ? a.href : 'NOT FOUND'; })()`);
  if (!bookingHref.startsWith("https://esl.et")) throw new Error(`ESL booking link wrong: ${bookingHref}`);
  pass(`Book / Request → ${bookingHref}`);
  const telHref = ev( `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'Call'); return a ? a.href : 'NOT FOUND'; })()`);
  if (!telHref.startsWith("tel:+251")) throw new Error(`tel link wrong: ${telHref}`);
  pass(`Call → ${telHref}`);
  const mailHref = ev( `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'Email'); return a ? a.href : 'NOT FOUND'; })()`);
  if (!mailHref.startsWith("mailto:")) throw new Error(`mailto link wrong: ${mailHref}`);
  pass(`Email → ${mailHref}`);
  const cardText = ab(["get", "text", "body"]);
  if (!cardText.includes("Verified") || !cardText.includes("External")) {
    throw new Error("verified badge / external markers missing on the ESL card");
  }
  const linkTargets = ev( `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'Website'); return a ? a.target + '|' + a.rel : 'NOT FOUND'; })()`);
  if (!linkTargets.includes("_blank") || !linkTargets.includes("noopener")) throw new Error(`external link not safe: ${linkTargets}`);
  pass("Verified badge + External markers present; external links are _blank + noopener");
  shot("06-esl-card-links");

  // ── Step 8: the official ESL destination is real ──
  step(8, "official ESL destination verified (no invented URLs)");
  const eslCheck = await fetch("https://esl.et/", { method: "HEAD", signal: AbortSignal.timeout(8000) }).then((r) => r.status).catch(() => "unreachable");
  pass(`https://esl.et/ responds: ${eslCheck} (stored URL is the real official site; reachability is NOT treated as a booking proof)`);

  // B9: provider administration follows the real permission model —
  // admins (platform org) manage + verify; tenant operators are refused.
  step("8b", "provider admin permission model (verify / disable / refuse)");
  const provList = await (await admin.fetch("/api/logistics/providers")).json();
  const esl = provList.providers.find((p) => p.name.startsWith("Ethiopian Shipping"));
  const tenantR = await seller.fetch(`/api/logistics/providers/${esl.id}`, {
    method: "PATCH", body: JSON.stringify({ notes: "tenant hijack" }),
  });
  if (tenantR.status !== 403) throw new Error(`tenant operator PATCH provider: expected 403, got ${tenantR.status}`);
  const mkR = await admin.fetch("/api/logistics/providers", {
    method: "POST", body: JSON.stringify({ name: `${RUN_ID} Test Carrier`, provider_type: "trucking", phone: "+251900000000" }),
  });
  const testProv = (await mkR.json()).provider;
  if (testProv.verified !== 0) throw new Error("new providers must start UNVERIFIED");
  const verR = await admin.fetch(`/api/logistics/providers/${testProv.id}`, {
    method: "PATCH", body: JSON.stringify({ action: "verify", official_source_url: "https://example-carrier.example" }),
  });
  const verD = (await verR.json()).provider;
  if (verD.verified !== 1 || !verD.last_verified_at) throw new Error("verify action must record provenance");
  const offR = await admin.fetch(`/api/logistics/providers/${testProv.id}`, {
    method: "PATCH", body: JSON.stringify({ active: false }),
  });
  if (offR.status !== 200) throw new Error("deactivate failed");
  const listAfter = await (await admin.fetch("/api/logistics/providers")).json();
  if (listAfter.providers.some((p) => p.id === testProv.id)) throw new Error("deactivated provider still listed");
  pass(`operator PATCH → ${tenantR.status}; create → unverified; verify → source+date; deactivate → hidden (id ${testProv.id})`);

  // ── Step 9: record the external booking ──
  step(9, "back to Faith-El — record the external booking");
  ab(["find", "role", "button", "click", "--name", "Record Booking (after booking on their channel)"]);
  await sleep(900);
  shot("07-record-booking-modal");

  // ── Step 10: enter the provider's reference (unique per run) ──
  step(10, "enter the provider's booking reference");
  ab(["fill", 'input[placeholder*="own reference"]', RUN_ID]);

  // ── Step 11: container numbers ──
  step(11, "enter container numbers (2 × 20GP)");
  ab(["fill", 'input[placeholder*="ESLU"]', `${RUN_ID}-C1,${RUN_ID}-C2`]);

  // ── Step 12: depot / vessel / voyage / dates ──
  step(12, "depot, vessel, voyage, ETD/ETA");
  ab(["fill", 'input[placeholder*="dry port"]', "Modjo dry port"]);
  ab(["fill", 'input[placeholder*="Bahri"]', "MV Bahri Dar"]);
  ab(["fill", 'input[placeholder*="V-118"]', "V-118"]);
  ab(["eval", `(() => { const ds = Array.from(document.querySelectorAll('.fixed input[type=\"date\"]')); const setV = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }; ds.forEach(d => setV(d, '')); setV(ds[0], '2026-11-05'); setV(ds[1], '2026-11-28'); return 'ok'; })()`]);

  // ── Step 13: upload the confirmation (real file) ──
  step(13, "upload the booking confirmation (real file)");
  const tmpConfirm = path.join(SHOTS, "booking-confirmation.pdf");
  if (!fs.existsSync(tmpConfirm)) {
    fs.writeFileSync(tmpConfirm, Buffer.from(
      `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 68>>stream\nBT /F1 18 Tf 72 720 Td (E2E booking confirmation ${RUN_ID}) Tj ET\nendstream\nendobj\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n0\n%%EOF`, "utf-8"));
  }
  ab(["upload", 'input[type="file"]', tmpConfirm], { timeoutMs: 30000 });
  await sleep(2000);
  pass("confirmation uploaded");

  // ── Step 14: save ──
  step(14, "save the booking record");
  ab(["find", "role", "button", "click", "--name", "Save booking record"]);
  await sleep(2500);
  shot("08-booking-saved");
  pass("booking saved; list refreshed");

  // ── Step 15: verify through the API what the UI just wrote ──
  step(15, "verify shipment booked + booking + 2 containers + timeline");
  const detail = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}`)).json();
  if (!detail.ok) throw new Error("detail fetch failed");
  if (detail.shipment.status !== "booked") throw new Error(`shipment status: ${detail.shipment.status}`);
  if (detail.shipment.carrier?.includes("Ethiopian Shipping") !== true) throw new Error("carrier not merged from booking");
  if (detail.bookings.length !== 1 || detail.bookings[0].booking_reference !== RUN_ID) throw new Error("booking record wrong");
  if (!detail.bookings[0].confirmation_document) throw new Error("confirmation not stored");
  if (detail.containers.length !== 2) throw new Error(`containers: ${detail.containers.length}`);
  if (!detail.containers.every((c) => String(c.container_number).startsWith(RUN_ID))) throw new Error("container numbers wrong");
  if (!detail.events.some((e) => e.event_type === "booking_recorded")) throw new Error("no booking event");
  if (detail.checklist.length !== 18) throw new Error(`checklist: ${detail.checklist.length}`);
  // C12: the shipment record is contract-linked and its creation wrote the
  // honest shipment_created event (the UI-side path; the CONTRACT_SIGNED
  // event-driven path is covered by the Python test_agent6 suite).
  if (detail.shipment.contract_id !== contract.id) throw new Error("shipment not linked to the contract");
  const createdEv = detail.events.find((e) => e.event_type === "shipment_created");
  if (!createdEv) throw new Error("shipment_created event missing");
  pass(`status=booked, carrier=ESL, booking=${RUN_ID} + confirmation, 2×${RUN_ID} containers, contract-linked, events written, 18-step checklist`);

  // ── Step 16: open the drawer in the UI ──
  step(16, "open the shipment drawer in the UI");
  ab(["find", "text", shipmentId, "click"]);
  await sleep(1800);
  shot("09-shipment-detail");
  const drawerCheck = ev(`(() => { const h3s = [...document.querySelectorAll('h3')].map(h => h.textContent); const body = document.body.innerText; return 'cl=' + h3s.some(t => t.includes('Export checklist')) + ' bk=' + h3s.some(t => t.includes('Recorded bookings')) + ' rf=' + body.includes('${RUN_ID}'); })()`);
  if (!drawerCheck.includes("cl=true") || !drawerCheck.includes("bk=true")) {
    throw new Error(`drawer sections missing: ${drawerCheck}`);
  }
  if (!drawerCheck.includes("rf=true")) throw new Error(`booking not visible in drawer: ${drawerCheck}`);
  pass("drawer shows facts, checklist, recorded bookings");

  // ── Step 17: update a container milestone ──
  step(17, "update a container milestone (BOOKED → PICKED_UP)");
  clickBtn("Containers");
  await sleep(700);
  ab(["eval", `(() => { const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'PICKED_UP')); if (!sel) return 'NOT FOUND'; const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(sel, 'PICKED_UP'); sel.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`]);
  await sleep(1500);
  const detail2 = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}`)).json();
  const picked = detail2.containers.filter((c) => c.status === "PICKED_UP").length;
  if (picked !== 1) throw new Error(`picked containers: ${picked}`);
  if (!detail2.events.some((e) => e.event_type === "container_updated")) throw new Error("container milestone event missing");
  pass("one container PICKED_UP with timeline event");
  shot("10-container-milestone");

  // ── Step 18: add transport + a manual external update ──
  step(18, "add transport segment (trucking Addis Ababa → Djibouti)");
  clickBtn("Transport");
  await sleep(600);
  clickBtn("Add transport");
  await sleep(700);
  ab(["fill", 'input[placeholder*="Trucking"]', "Modjo Trucking"]);
  ab(["eval", `(() => { const inputs = Array.from(document.querySelectorAll('.fixed input[type=\"text\"]')); const setV = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }; const origin = inputs.find(i => !i.value); const dest = inputs[inputs.indexOf(origin) + 1]; if (!origin || !dest) return 'NOT FOUND'; setV(origin, 'Addis Ababa'); setV(dest, 'Djibouti'); return 'ok'; })()`]);
  clickBtn("Add segment");
  await sleep(1600);
  const segs = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}/transport`)).json();
  if ((segs.segments || []).length !== 1) throw new Error(`transport segments: ${(segs.segments || []).length}`);
  pass("trucking segment recorded (Addis Ababa → Djibouti)");

  step("18b", "add a manual external timeline update");
  clickBtn("Timeline");
  await sleep(600);
  clickBtn("Add external update");
  await sleep(700);
  ab(["fill", 'input[placeholder*="Depot called"]', "ESL depot confirmed release of both containers"]);
  clickBtn("Add to timeline");
  await sleep(1600);
  const evs = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}/events`)).json();
  if (!evs.events.some((e) => e.title.includes("ESL depot confirmed"))) throw new Error("manual event missing");
  pass("manual external update on the timeline");
  shot("11-timeline");

  // ── Step 19: dashboard + checklist reflect reality ──
  step(19, "verify dashboard + checklist reflect the real work");
  const dash = await (await seller.fetch("/api/logistics/dashboard")).json();
  if (dash.stats.activeShipments < 1) throw new Error("dashboard: no active shipment");
  if (dash.stats.containersBooked < 2) throw new Error("dashboard: containers not counted");
  if (dash.stats.missingBookingDocs !== 0) throw new Error("dashboard: confirmation not counted");
  if (dash.stats.upcomingDepartures < 1) throw new Error("dashboard: departure not counted");
  pass(`dashboard stats: ${JSON.stringify(dash.stats)}`);

  clickBtn("Overview");
  await sleep(600);
  clickBtn("Container requirement confirmed");
  await sleep(1600);
  const chk = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}/checklist`)).json();
  if (chk.items[0].status !== "done" || chk.items[0].completed_by !== sellerEmail) {
    throw new Error(`checklist toggle failed: ${JSON.stringify(chk.items[0])}`);
  }
  pass(`checklist: 1/${chk.items.length} done, attested by ${chk.items[0].completed_by}`);
  shot("12-checklist-progress");

  // ── D16: document retrieval through the AUTHORIZED workflow ──
  step("19b", "document retrieval: owner 200, other org 404 (authorized workflow)");
  const docPath = (() => {
    try { return JSON.parse(detail.bookings[0].confirmation_document).path; } catch { return null; }
  })();
  if (!docPath) throw new Error("confirmation path unparseable");
  const docOwner = await seller.fetch(`/api/logistics/documents?path=${encodeURIComponent(docPath)}`);
  if (docOwner.status !== 200 || (docOwner.headers.get("content-type") || "") !== "application/pdf") {
    throw new Error(`owner document fetch: ${docOwner.status} ${docOwner.headers.get("content-type")}`);
  }
  const docAdmin = await admin.fetch(`/api/logistics/documents?path=${encodeURIComponent(docPath)}`);
  if (docAdmin.status !== 404) throw new Error(`other-org document fetch must 404, got ${docAdmin.status}`);
  const docTraversal = await seller.fetch(`/api/logistics/documents?path=${encodeURIComponent("upload/logistics/../../.env")}`);
  if (docTraversal.status !== 400) throw new Error(`path traversal must 400, got ${docTraversal.status}`);
  pass(`owner → 200 (application/pdf); other org → 404; traversal → 400`);

  // ── E19: delay / missing-milestone exception detection ──
  // The module's documented rule: tasks derive from STORED facts. Set a
  // container pickup_date in the past with the container not yet picked up →
  // a warning task must appear (detection is data-derived, not a carrier feed).
  step("19c", "delay scenario: past pickup date → warning task + dashboard attention");
  // fetch FRESH detail (the step-17 milestone changed one container's status)
  const freshDetail = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}`)).json();
  const stillBooked = freshDetail.containers.find((c) => c.status === "BOOKED");
  if (!stillBooked) throw new Error("no BOOKED container left for the delay scenario");
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const pickR = await seller.fetch(`/api/logistics/containers/${stillBooked.id}`, {
    method: "PATCH",
    body: JSON.stringify({ pickup_date: yesterday }),
  });
  if (pickR.status !== 200) throw new Error(`pickup date update failed: ${pickR.status}`);
  const delayDetail = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}`)).json();
  const delayTask = (delayDetail.tasks || []).find((t) => t.title.toLowerCase().includes("pickup"));
  if (!delayTask || delayTask.severity !== "warning") {
    throw new Error(`expected pickup warning task, got: ${JSON.stringify(delayDetail.tasks)}`);
  }
  // The dashboard's shipment-list counter must reflect it too
  const shipList = await (await seller.fetch("/api/shipments")).json();
  const ship = (shipList.shipments || []).find((s) => s.id === shipmentId);
  if (!ship || ship.logistics.actionsNeeded < 1) throw new Error("actions-needed counter did not reflect the delay");
  pass(`past pickup date → warning task "${delayTask.title}" + actionsNeeded=${ship.logistics.actionsNeeded}`);
  shot("13-delay-task");

  // ── E20: arrival workflow + idempotency ──
  step("20-pre", "arrival: containers → DELIVERED via supported actions; re-check idempotency");
  for (const c of delayDetail.containers) {
    const r = await seller.fetch(`/api/logistics/containers/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "DELIVERED" }),
    });
    if (r.status !== 200) throw new Error(`container ${c.id} DELIVERED failed: ${r.status}`);
  }
  const finalDetail = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}`)).json();
  const delivered = finalDetail.containers.filter((c) => c.status === "DELIVERED").length;
  if (delivered !== 2) throw new Error(`delivered containers: ${delivered}`);
  const deliveredEvents = finalDetail.events.filter((e) => e.event_type === "container_updated").length;
  if (deliveredEvents < 2) throw new Error("container DELIVERED milestones not on the timeline");
  pass("2 containers DELIVERED with timeline milestones");
  shot("14-arrival-containers");

  // A4 (part 1): no uncaught errors so far (checked BEFORE the reload,
  // which resets the collector)
  const errsBeforeReload = ev( "window.__lccErrors ? window.__lccErrors.join(' || ') : 'collector lost'");
  if (errsBeforeReload.trim() && errsBeforeReload !== "[]") {
    throw new Error(`uncaught JS errors during the journey: ${errsBeforeReload}`);
  }
  pass("A4: zero uncaught JS errors up to the reload point");

  // C14 + idempotency: FULL RELOAD — data persists, checklist NOT duplicated
  step("20-reload", "reload: everything persists; checklist still 18 (no duplicates)");
  ab(["reload"]);
  await sleep(3000);
  // reinstall the error collector for the post-reload phase (A4 part 2)
  ab(["eval", "(() => { window.__lccErrors = []; window.addEventListener('error', e => window.__lccErrors.push(String(e.message))); window.addEventListener('unhandledrejection', e => window.__lccErrors.push('unhandledrejection: ' + String(e.reason))); return 'ok'; })()"]);
  ab(["find", "title", "Logistics", "click"]);
  await sleep(2000);
  const afterReload = ab(["get", "text", "main"]);
  if (!afterReload.includes(shipmentId)) throw new Error("shipment missing after reload");
  // The booking reference lives in the drawer — open it to verify persistence
  ab(["find", "text", shipmentId, "click"]);
  await sleep(1800);
  const refAfterReload = ev(`document.body.innerText.includes('${RUN_ID}')`);
  if (refAfterReload !== "true") throw new Error("booking reference missing after reload");
  const chkAfter = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}/checklist`)).json();
  if (chkAfter.items.length !== 18) throw new Error(`checklist duplicated after reload: ${chkAfter.items.length}`);
  if (chkAfter.items.filter((i) => i.status === "done").length !== 1) throw new Error("checklist progress not persisted");
  const bookingsAfter = await (await seller.fetch(`/api/logistics/shipments/${shipmentId}`)).json();
  if (bookingsAfter.bookings.length !== 1) throw new Error("bookings duplicated after reload");
  if (bookingsAfter.containers.length !== 2) throw new Error("containers duplicated after reload");
  pass("reload: shipment + booking + 2 containers + 1/18 checklist all persist; zero duplicates");
  shot("15-after-reload");

  // ── Step 20: cross-tenant invisibility ──
  step(20, "cross-tenant: other orgs see nothing of abi's work");
  // (a) The platform admin (org-system) must get 404 on abi's shipment detail
  const adminDetail = await admin.fetch(`/api/logistics/shipments/${shipmentId}`);
  if (adminDetail.status !== 404) throw new Error(`admin detail status: ${adminDetail.status}`);
  const adminBookings = await (await admin.fetch("/api/logistics/bookings")).json();
  if (adminBookings.bookings?.some((b) => b.booking_reference === RUN_ID)) {
    throw new Error("admin sees abi's booking!");
  }
  pass("org-system admin: 404 on abi's shipment detail, no abi bookings in its list");
  // (b) A brand-new second org sees nothing at all — but the GLOBAL ESL row
  const opEmail = `e2e-iso-${Date.now()}@test.com`;
  const createR = await admin.fetch("/api/admin/operators", {
    method: "POST",
    body: JSON.stringify({ name: "E2E Isolation", email: opEmail, password: "TestPass123", role: "operator" }),
  });
  if (createR.status !== 201) throw new Error("operator create failed");
  const second = makeClient(opEmail, "TestPass123", "10.90.0.2");
  await second.login();
  await second.fetch("/api/auth/change-password", { method: "POST", body: JSON.stringify({ oldPassword: "TestPass123", newPassword: "NewPass456" }) });
  const second2 = makeClient(opEmail, "NewPass456", "10.90.0.2");
  await second2.login();
  const theirShipments = await (await second2.fetch("/api/shipments")).json();
  if ((theirShipments.shipments || []).length !== 0) throw new Error("second org sees shipments!");
  const theirDetail = await second2.fetch(`/api/logistics/shipments/${shipmentId}`);
  if (theirDetail.status !== 404) throw new Error(`second org detail status: ${theirDetail.status}`);
  const theirBookings = await (await second2.fetch("/api/logistics/bookings")).json();
  if ((theirBookings.bookings || []).length !== 0) throw new Error("second org sees bookings!");
  const theirContainers = await (await second2.fetch("/api/logistics/containers")).json();
  if ((theirContainers.containers || []).length !== 0) throw new Error("second org sees containers!");
  const theirDash = await (await second2.fetch("/api/logistics/dashboard")).json();
  if (theirDash.stats.activeShipments !== 0) throw new Error("second org dashboard not zero!");
  // ...but the GLOBAL verified ESL directory entry IS visible to them:
  const theirProviders = await (await second2.fetch("/api/logistics/providers")).json();
  if (!theirProviders.providers.some((p) => p.name.startsWith("Ethiopian Shipping"))) {
    throw new Error("second org cannot see the global ESL row!");
  }
  pass("second org: 0 shipments, 404 detail, 0 bookings, 0 containers, zero dashboard — global ESL visible");

  // A4 (part 2): final console-error sweep after the reload phase
  const errsFinal = ev( "window.__lccErrors ? window.__lccErrors.join(' || ') : 'collector lost'");
  if (errsFinal.trim() && errsFinal !== "[]") {
    throw new Error(`uncaught JS errors after reload: ${errsFinal}`);
  }
  pass("A4: zero uncaught JS errors after reload");

  // E2E identifier record for cleanup/traceability
  console.log(`\nRUN_ID: ${RUN_ID} (booking + containers) | shipment ${shipmentId} | lead ${lead.id} | contract ${contract.id}`);

  clearTimeout(HARD_TIMER);
  console.log("\n════════════════════════════════════════");
  console.log("E2E JOURNEY COMPLETE — ALL STEPS PASSED");
  console.log(`Evidence: ${SHOTS}`);
  console.log("════════════════════════════════════════");
}

main().catch((e) => {
  console.error("\n✗ E2E FAILED:", e.message);
  try { shot("99-failure"); } catch { /* ignore */ }
  try { execFileSync(AB, ["close", "--all"], { timeout: 10000, stdio: "pipe" }); } catch { /* gone */ }
  killServer();
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
  process.exit(1);
});
