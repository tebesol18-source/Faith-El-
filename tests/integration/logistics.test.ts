/**
 * Logistics Command Center — integration tests.
 *
 * Verifies the honest external-action contract end-to-end against the
 * isolated test server (throwaway DB copy):
 *
 *   1. Provider directory: ESL global row (verified, external), org rows,
 *      admin create (unverified), non-admin refused, URL validation
 *      (javascript: rejected), verification requires an official source,
 *      global rows not editable by tenant orgs, deactivation hides rows.
 *   2. Shipment creation seeds the 18-step export checklist + a real
 *      shipment_created event (no fake "booked" claims).
 *   3. Recording an EXTERNAL booking: reference mandatory, shipment →
 *      booked, honest timeline event, container numbers → BOOKED container
 *      rows, cross-org shipment refused, deactivated provider refused.
 *   4. Container lifecycle updates write timeline events; invalid status
 *      refused.
 *   5. Detail bundle returns checklist/bookings/containers/transport/
 *      events/tasks; checklist auto-seeds on first read.
 *   6. Dashboard stats are REAL counts (fresh org → all zeros).
 *   7. Manual timeline event (external update) + transport segment.
 *   8. Tenant isolation: a second org sees none of org A's providers
 *      (private), bookings, containers, checklist, transport or shipment
 *      detail — and cannot toggle org A's checklist.
 *   9. Rate-limit regression: a burst of API calls must NOT lock out login
 *      (separate buckets per route class).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { createTestClient } from "./helpers";

interface TestClient {
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

const serverAvailable = await (async () => {
  try {
    const r = await fetch(`${BASE_URL}/api`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 401 || r.status === 404;
  } catch {
    return false;
  }
})();
const itOrSkip = serverAvailable ? it : it.skip;

interface Provider {
  id: number;
  name: string;
  organization_id: string | null;
  verified: number;
  integration_status: string;
  active: number;
  [k: string]: unknown;
}

let admin: TestClient;
let secondOrg: TestClient;
let secondOrgEmail = "";
let contractId = "";
let shipmentId = "";

async function json(r: Response): Promise<any> {
  return r.json();
}

beforeAll(async () => {
  if (!serverAvailable) return;
  admin = await createTestClient("admin@faithel.com", "admin123", "10.77.0.1");

  // A second-org operator for tenant isolation
  const uniqueEmail = `lcc-iso-${Date.now()}@test.com`;
  const createR = await admin.fetch("/api/admin/operators", {
    method: "POST",
    body: JSON.stringify({
      name: "LCC Isolation",
      email: uniqueEmail,
      password: "TestPass123",
      role: "operator",
    }),
  });
  expect(createR.status).toBe(201);
  secondOrgEmail = uniqueEmail;
  secondOrg = await createTestClient(uniqueEmail, "TestPass123", "10.77.0.2");
  // Admin-created operators must change their password on first login —
  // clear the flag so this client can call normal APIs.
  await secondOrg.fetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword: "TestPass123", newPassword: "NewPass456" }),
  });
  // Re-login: the flag lives on the session; a fresh one reflects the change.
  secondOrg = await createTestClient(uniqueEmail, "NewPass456", "10.77.0.2");
  // NOTE: in this deployment model every admin belongs to the platform org
  // (org-system) — tenant orgs hold operators only. So directory editing
  // is: operators → 403 (admin gate), platform admins → manage the shared
  // directory. Tested below.

  // A contract + shipment in the admin org (real chain, no mocks)
  const leadList = await json(await admin.fetch("/api/leads?limit=100"));
  const lead = (leadList.leads || [])[0];
  expect(lead).toBeTruthy();
  const contractR = await admin.fetch("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      leadId: lead.id,
      totalVolumeBags: 320,
      totalValue: 50000,
      incoterm: "FOB",
      currency: "USD",
      shipmentWindowStart: "2026-10-01",
      shipmentWindowEnd: "2026-12-01",
      paymentTerms: "30% advance",
    }),
  });
  expect(contractR.status).toBe(201);
  contractId = (await json(contractR)).contract.id;

  const shipR = await admin.fetch("/api/shipments", {
    method: "POST",
    body: JSON.stringify({
      contractId,
      carrier: "",
      departurePort: "Djibouti",
      arrivalPort: "Hamburg",
      etd: "2026-11-05",
      eta: "2026-11-28",
    }),
  });
  expect(shipR.status).toBe(201);
  shipmentId = (await json(shipR)).shipment.id;
}, 120_000);

afterAll(async () => {
  if (!serverAvailable || !secondOrgEmail) return;
  // Remove the second-org operator (their org data has no FK ties to keep)
  const list = await json(await admin.fetch("/api/admin/operators?limit=200"));
  const op = (list.operators || []).find((o: any) => o.email === secondOrgEmail);
  if (op) {
    await admin.fetch(`/api/admin/operators/${op.operator_id}`, { method: "DELETE" });
  }
});

describe("Logistics Command Center — provider directory", () => {
  itOrSkip("lists the verified global ESL row with external integration status", async () => {
    const r = await admin.fetch("/api/logistics/providers");
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.ok).toBe(true);
    const esl: Provider | undefined = (d.providers || []).find(
      (p: Provider) => p.name.startsWith("Ethiopian Shipping")
    );
    expect(esl).toBeTruthy();
    expect(esl!.verified).toBe(1);
    expect(esl!.integration_status).toBe("external");
    expect(esl!.organization_id).toBeNull(); // global row
    expect(String(esl!.phone)).toContain("251");
  });

  itOrSkip("second org sees the global ESL row but not other orgs' private rows", async () => {
    // Create a private provider in the admin org
    const createR = await admin.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({
        name: `Private Trucking ${Date.now()}`,
        provider_type: "trucking",
        country: "Ethiopia",
        city: "Addis Ababa",
        phone: "+251911000001",
      }),
    });
    expect(createR.status).toBe(201);
    const created: Provider = (await json(createR)).provider;
    expect(created.verified).toBe(0); // new rows start UNVERIFIED
    expect(created.organization_id).toBe("org-system");

    // Second org: sees ESL, does NOT see the admin org's private row
    const r = await secondOrg.fetch("/api/logistics/providers");
    const d = await json(r);
    const names = (d.providers || []).map((p: Provider) => p.name);
    expect(names.some((n: string) => n.startsWith("Ethiopian Shipping"))).toBe(true);
    expect(names.some((n: string) => n.startsWith("Private Trucking"))).toBe(false);
  });

  itOrSkip("rejects non-admin provider creation", async () => {
    const r = await secondOrg.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({ name: "Evil Corp", provider_type: "other" }),
    });
    expect(r.status).toBe(403);
  });

  itOrSkip("rejects javascript: and non-http URLs on create and update", async () => {
    const badR = await admin.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({
        name: "Bad URLs Co",
        provider_type: "other",
        booking_url: "javascript:alert(1)",
      }),
    });
    expect(badR.status).toBe(400);
    const badD = await json(badR);
    expect(badD.error).toContain("http");

    // Create a good one, then poison it via PATCH
    const goodR = await admin.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({ name: "Good URLs Co", provider_type: "other" }),
    });
    const good: Provider = (await json(goodR)).provider;
    const poisonR = await admin.fetch(`/api/logistics/providers/${good.id}`, {
      method: "PATCH",
      body: JSON.stringify({ tracking_url: "javascript:alert(1)" }),
    });
    expect(poisonR.status).toBe(400);
  });

  itOrSkip("verification requires an official source URL", async () => {
    const createR = await admin.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({ name: "Verify Me Co", provider_type: "freight_forwarder" }),
    });
    const p: Provider = (await json(createR)).provider;

    const noSourceR = await admin.fetch(`/api/logistics/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "verify" }),
    });
    expect(noSourceR.status).toBe(400);

    const verifyR = await admin.fetch(`/api/logistics/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "verify", official_source_url: "https://verify-me.example" }),
    });
    expect(verifyR.status).toBe(200);
    const verified: Provider = (await json(verifyR)).provider;
    expect(verified.verified).toBe(1);
    expect(verified.official_source_url).toBe("https://verify-me.example/");
    expect(verified.last_verified_at).toBeTruthy();
  });

  itOrSkip("directory editing is admin-only; platform admins manage the shared (global) rows", async () => {
    const list = await json(await admin.fetch("/api/logistics/providers"));
    const esl: Provider = (list.providers || []).find(
      (p: Provider) => p.name.startsWith("Ethiopian Shipping")
    );
    // Tenant operators are refused by the admin gate (403)
    const r = await secondOrg.fetch(`/api/logistics/providers/${esl.id}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: "hijack" }),
    });
    expect(r.status).toBe(403);
    // Platform admin (org-system) manages the shared directory row
    const r2 = await admin.fetch(`/api/logistics/providers/${esl.id}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: "Platform-managed global directory entry" }),
    });
    expect(r2.status).toBe(200);
  });

  itOrSkip("refuses to fake an API integration (integration_status=api_connected rejected)", async () => {
    const createR = await admin.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({ name: "Fake API Co", provider_type: "other" }),
    });
    const p: Provider = (await json(createR)).provider;
    const r = await admin.fetch(`/api/logistics/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ integration_status: "api_connected" }),
    });
    expect(r.status).toBe(400);
    expect((await json(r)).error).toContain("No logistics API integration");
  });

  itOrSkip("deactivated providers are hidden from the default list", async () => {
    const createR = await admin.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({ name: "Deactivate Me Co", provider_type: "warehouse" }),
    });
    const p: Provider = (await json(createR)).provider;
    const offR = await admin.fetch(`/api/logistics/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    expect(offR.status).toBe(200);

    const list = await json(await admin.fetch("/api/logistics/providers"));
    expect((list.providers || []).some((x: Provider) => x.id === p.id)).toBe(false);
    const withInactive = await json(await admin.fetch("/api/logistics/providers?include_inactive=1"));
    expect((withInactive.providers || []).some((x: Provider) => x.id === p.id)).toBe(true);
  });
});

describe("Logistics Command Center — shipment + checklist", () => {
  itOrSkip("shipment creation seeds the 18-step checklist + an honest created event", async () => {
    const detail = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    expect(detail.ok).toBe(true);
    expect(detail.shipment.shipment_id).toBe(shipmentId);
    expect(detail.checklist.length).toBe(18);
    expect(detail.checklist[0].title).toBe("Container requirement confirmed");
    expect(detail.checklist.every((c: any) => c.status === "pending")).toBe(true);
    const created = detail.events.filter((e: any) => e.event_type === "shipment_created");
    expect(created.length).toBe(1);
    // NOTHING was booked by creating the record
    expect(detail.bookings.length).toBe(0);
    expect(detail.shipment.status).toBe("draft");
  });

  itOrSkip("checklist toggle records who attested the step + a timeline event", async () => {
    const detail = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    const first = detail.checklist[0];
    const r = await admin.fetch(`/api/logistics/shipments/${shipmentId}/checklist`, {
      method: "PATCH",
      body: JSON.stringify({ item_id: first.id, status: "done" }),
    });
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.items[0].status).toBe("done");
    expect(d.items[0].completed_by).toBe("admin@faithel.com");

    const detail2 = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    expect(detail2.events.some((e: any) => e.event_type === "checklist_updated")).toBe(true);
  });

  itOrSkip("second org cannot read or toggle the admin org's shipment", async () => {
    const r = await secondOrg.fetch(`/api/logistics/shipments/${shipmentId}`);
    expect(r.status).toBe(404);
    const detail = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    const first = detail.checklist[0];
    const r2 = await secondOrg.fetch(`/api/logistics/shipments/${shipmentId}/checklist`, {
      method: "PATCH",
      body: JSON.stringify({ item_id: first.id, status: "done" }),
    });
    expect(r2.status).toBe(404);
  });
});

describe("Logistics Command Center — external booking records", () => {
  itOrSkip("booking_reference is mandatory (no reference = no record)", async () => {
    const r = await admin.fetch("/api/logistics/bookings", {
      method: "POST",
      body: JSON.stringify({ provider_name: "ESL", shipment_id: shipmentId }),
    });
    expect(r.status).toBe(400);
  });

  itOrSkip("recording a booking books nothing itself — it stores the attestation", async () => {
    const providers = await json(await admin.fetch("/api/logistics/providers"));
    const esl: Provider = (providers.providers || []).find(
      (p: Provider) => p.name.startsWith("Ethiopian Shipping")
    );

    const r = await admin.fetch("/api/logistics/bookings", {
      method: "POST",
      body: JSON.stringify({
        shipment_id: shipmentId,
        provider_id: esl.id,
        booking_reference: "ESL-TEST-88431",
        container_type: "20GP",
        quantity: 2,
        container_numbers: "ESLU2051001,ESLU2051002",
        depot: "Addis Ababa dry port",
        vessel: "MV Bahri Dar",
        voyage: "V-118",
        etd: "2026-11-05",
        eta: "2026-11-28",
      }),
    });
    expect(r.status).toBe(201);
    const d = await json(r);
    expect(d.booking.booking_reference).toBe("ESL-TEST-88431");
    expect(d.booking.provider_name).toContain("Ethiopian Shipping");

    // Shipment moved to booked + carrier merged — because a HUMAN booked it
    const detail = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    expect(detail.shipment.status).toBe("booked");
    expect(detail.shipment.carrier).toContain("Ethiopian Shipping");
    expect(detail.bookings.length).toBe(1);

    // Container numbers became container records in BOOKED state
    expect(detail.containers.length).toBe(2);
    const nums = detail.containers.map((c: any) => c.container_number).sort();
    expect(nums).toEqual(["ESLU2051001", "ESLU2051002"]);
    expect(detail.containers.every((c: any) => c.status === "BOOKED")).toBe(true);

    // Honest timeline events
    expect(detail.events.some((e: any) => e.event_type === "booking_recorded")).toBe(true);
    const ev = detail.events.find((e: any) => e.event_type === "booking_recorded");
    expect(ev.detail).toContain("provider's official channel");
  });

  itOrSkip("cross-org booking on another org's shipment is refused", async () => {
    const r = await secondOrg.fetch("/api/logistics/bookings", {
      method: "POST",
      body: JSON.stringify({
        provider_name: "Someone",
        booking_reference: "X-1",
        shipment_id: shipmentId,
      }),
    });
    expect(r.status).toBe(404);
  });

  itOrSkip("a deactivated provider cannot be used for a booking record", async () => {
    const createR = await admin.fetch("/api/logistics/providers", {
      method: "POST",
      body: JSON.stringify({ name: "Deactivated Co", provider_type: "trucking" }),
    });
    const p: Provider = (await json(createR)).provider;
    await admin.fetch(`/api/logistics/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    const r = await admin.fetch("/api/logistics/bookings", {
      method: "POST",
      body: JSON.stringify({
        provider_id: p.id,
        provider_name: "Deactivated Co",
        booking_reference: "X-2",
      }),
    });
    expect(r.status).toBe(400);
  });
});

describe("Logistics Command Center — containers, transport, events", () => {
  itOrSkip("container status transitions write honest timeline events; invalid statuses refused", async () => {
    const detail = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    const c = detail.containers[0];
    const r = await admin.fetch(`/api/logistics/containers/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "PICKED_UP", pickup_date: "2026-10-08" }),
    });
    expect(r.status).toBe(200);
    expect((await json(r)).container.status).toBe("PICKED_UP");

    const detail2 = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    const ev = detail2.events.find((e: any) => e.event_type === "container_updated");
    expect(ev).toBeTruthy();
    expect(ev.title).toContain("PICKED_UP");

    const badR = await admin.fetch(`/api/logistics/containers/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "TELEPORTED" }),
    });
    expect(badR.status).toBe(400);

    // Cross-org update refused
    const crossR = await secondOrg.fetch(`/api/logistics/containers/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    expect(crossR.status).toBe(404);
  });

  itOrSkip("transport segment can be recorded with a real reference", async () => {
    const r = await admin.fetch(`/api/logistics/shipments/${shipmentId}/transport`, {
      method: "POST",
      body: JSON.stringify({
        segment_type: "trucking",
        provider_name: "Inland Trucking Co",
        origin: "Addis Ababa",
        destination: "Djibouti",
        planned_date: "2026-10-10",
        reference: "TRK-2026-77",
        status: "confirmed",
      }),
    });
    expect(r.status).toBe(201);
    const d = await json(r);
    expect(d.segment.reference).toBe("TRK-2026-77");

    const detail = await json(await admin.fetch(`/api/logistics/shipments/${shipmentId}`));
    expect(detail.transport.length).toBe(1);
    expect(detail.events.some((e: any) => e.event_type === "transport_added")).toBe(true);

    // Second org sees no transport for this shipment (404 on their read)
    const crossR = await secondOrg.fetch(`/api/logistics/shipments/${shipmentId}/transport`);
    expect(crossR.status).toBe(404);
  });

  itOrSkip("manual external update lands on the timeline with operator attribution", async () => {
    const r = await admin.fetch(`/api/logistics/shipments/${shipmentId}/events`, {
      method: "POST",
      body: JSON.stringify({
        title: "Depot called: containers released",
        detail: "Depot confirmed by phone that both 20GP boxes are released for pickup.",
        event_type: "external_update",
      }),
    });
    expect(r.status).toBe(201);
    const d = await json(r);
    expect(d.event.created_by).toBe("admin@faithel.com");
    expect(d.event.source).toBe("operator");
  });
});

describe("Logistics Command Center — dashboard stats are real", () => {
  itOrSkip("second org's dashboard is all zeros (no demo data)", async () => {
    const r = await secondOrg.fetch("/api/logistics/dashboard");
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.stats).toEqual({
      activeShipments: 0,
      containersBooked: 0,
      containersAwaitingBooking: 0,
      inTransit: 0,
      upcomingDepartures: 0,
      delayedOrHolds: 0,
      missingBookingDocs: 0,
      completed: 0,
    });
    expect(d.attention).toEqual([]);
  });

  itOrSkip("admin org's dashboard reflects the data created above", async () => {
    const r = await admin.fetch("/api/logistics/dashboard");
    const d = await json(r);
    expect(d.stats.activeShipments).toBeGreaterThanOrEqual(1);
    expect(d.stats.containersBooked).toBeGreaterThanOrEqual(2);
    expect(d.stats.upcomingDepartures).toBeGreaterThanOrEqual(1);
    expect(d.stats.missingBookingDocs).toBeGreaterThanOrEqual(1); // no confirmation uploaded
  });
});

describe("Logistics Command Center — rate-limit regression (login not locked out by API bursts)", () => {
  itOrSkip("a burst of API calls does not consume the login route's budget", async () => {
    const ip = `10.77.99.${Math.floor(Math.random() * 250) + 1}`;
    // Fill the GENERAL api bucket with ~30 unauthenticated calls (all 401,
    // but the middleware counts them before the route runs)
    for (let i = 0; i < 30; i++) {
      await fetch(`${BASE_URL}/api/dashboard`, {
        headers: { "x-forwarded-for": ip },
      });
    }
    // Login from the same IP must still be allowed (its own bucket)
    const loginR = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "admin@faithel.com", password: "wrong-password" }),
    });
    expect(loginR.status).toBe(401); // wrong password — but NOT 429
    expect(loginR.headers.get("x-ratelimit-limit")).toBe("10");
  });
});

describe("Logistics Command Center — shipment-level arrival & final delivery", () => {
  // Direct-DB status seeding is only safe on the HERMETIC runner's throwaway
  // DB (run-tests.mjs sets DATABASE_PATH). A bare dev-server run skips these
  // cases instead of mutating a developer's database.
  const hermetic = !!process.env.DATABASE_PATH;
  const itHermetic = serverAvailable && hermetic ? it : it.skip;
  const TEST_DB_PATH = path.resolve(process.cwd(), process.env.DATABASE_PATH || "state/coffee_export.db");

  let plainShipId = ""; // no containers on this one
  let containerShipId = ""; // gets a booking + 2 containers

  beforeAll(async () => {
    if (!serverAvailable) return;
    // Two fresh shipments for isolated state control (the module-level
    // shipmentId is mutated by the booking tests above).
    for (const [i, set] of [
      [0, "Arrival Plain"],
      [1, "Arrival Containers"],
    ] as const) {
      const r = await admin.fetch("/api/shipments", {
        method: "POST",
        body: JSON.stringify({
          contractId,
          carrier: set,
          departurePort: "Djibouti",
          arrivalPort: "Hamburg",
          etd: "2026-11-05",
          eta: "2026-11-28",
        }),
      });
      expect(r.status).toBe(201);
      const id = (await json(r)).shipment.id;
      if (i === 0) plainShipId = id;
      else containerShipId = id;
    }

    // A booking with two container numbers on the second shipment
    const bR = await admin.fetch("/api/logistics/bookings", {
      method: "POST",
      body: JSON.stringify({
        shipment_id: containerShipId,
        provider_name: "ESL",
        booking_reference: `ESL-ARRIVAL-${Date.now()}`,
        container_type: "20GP",
        quantity: 2,
        container_numbers: "ARRV0000001,ARRV0000002",
        etd: "2026-11-05",
        eta: "2026-11-28",
      }),
    });
    expect(bR.status).toBe(201);
  }, 120_000);

  /** Seed a shipment status the Node API cannot set directly (in production
   *  the Python runtime records departures; the state machine is shared). */
  async function seedStatus(shipId: string, status: string) {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(TEST_DB_PATH);
    try {
      db.prepare(`UPDATE shipments SET status = ? WHERE shipment_id = ?`).run(status, shipId);
    } finally {
      db.close();
    }
  }

  itHermetic("invalid action / invalid ata refused; unauthenticated 401; cross-org 404; CSRF enforced", async () => {
    const badAction = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "teleport" }),
    });
    expect(badAction.status).toBe(400);

    const badAta = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "arrive", ata: "not-a-date" }),
    });
    expect(badAta.status).toBe(400);

    // Unauthenticated (no session cookie — the matched CSRF pair passes the
    // middleware, so the 401 comes from the route's auth check itself)
    const unauth = await fetch(`${BASE_URL}/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "csrf-token=test-csrf-value",
        "x-csrf-token": "test-csrf-value",
        "x-forwarded-for": "10.77.3.1",
      },
      body: JSON.stringify({ action: "arrive" }),
    });
    expect(unauth.status).toBe(401);

    // Cross-org: the second org cannot even see the shipment
    const cross = await secondOrg.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "arrive" }),
    });
    expect(cross.status).toBe(404);

    // CSRF double-submit: a mutation without the token pair → 403
    // (rejected by the middleware before the route runs)
    const csrf = await fetch(`${BASE_URL}/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.77.3.2" },
      body: JSON.stringify({ action: "arrive" }),
    });
    expect(csrf.status).toBe(403);
  });

  itHermetic("arrive/deliver refused from draft (nothing has shipped) — no invalid forward jump", async () => {
    const arrive = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "arrive" }),
    });
    expect(arrive.status).toBe(400);
    expect((await json(arrive)).error).toContain("departed first");

    const deliver = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "deliver" }),
    });
    expect(deliver.status).toBe(400);
    expect((await json(deliver)).error).toContain("past departure");
  });

  itHermetic("arrive from in_transit: status + ATA persisted, honest timeline event, duplicate refused", async () => {
    await seedStatus(plainShipId, "in_transit");

    const r = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "arrive", ata: "2026-12-01T14:30:00+03:00" }),
    });
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.action).toBe("arrived");
    expect(d.shipment.status).toBe("arrived");
    expect(String(d.shipment.ata)).toContain("2026-12-01T14:30");

    // Persists across a fresh read; timeline records the attestation
    const detail = await json(await admin.fetch(`/api/logistics/shipments/${plainShipId}`));
    expect(detail.shipment.status).toBe("arrived");
    const ev = detail.events.find((e: any) => e.event_type === "status_change");
    expect(ev).toBeTruthy();
    expect(ev.title).toContain("arrived at destination port");
    expect(ev.source).toBe("operator");
    expect(ev.created_by).toBe("admin@faithel.com");

    // Duplicate arrival → 409, not a silent re-apply
    const dup = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "arrive" }),
    });
    expect(dup.status).toBe(409);
  });

  itHermetic("deliver (no containers recorded): terminal transition, contract completed, Agent 7 events published", async () => {
    const r = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "deliver" }),
    });
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.action).toBe("delivered");
    expect(d.shipment.status).toBe("delivered");
    expect(d.published).toEqual(["SHIPMENT_DELIVERED", "CONTRACT_COMPLETED"]);

    // Contract completed (same rule as Python Agent 6 record_delivery)
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(TEST_DB_PATH);
    try {
      const c = db
        .prepare(`SELECT status FROM contracts WHERE contract_id = ?`)
        .get(contractId) as { status: string };
      expect(c.status).toBe("completed");

      // The two events sit on the bus, org-scoped, with the payloads the
      // Python side consumes — the supervisor's Agent 7 trigger.
      const evs = db
        .prepare(
          `SELECT event_type, organization_id, payload FROM events
           WHERE event_type IN ('SHIPMENT_DELIVERED','CONTRACT_COMPLETED') AND entity_id IN (?, ?)
           ORDER BY id DESC LIMIT 2`
        )
        .all(plainShipId, contractId) as { event_type: string; organization_id: string; payload: string }[];
      const types = evs.map((e) => e.event_type).sort();
      expect(types).toEqual(["CONTRACT_COMPLETED", "SHIPMENT_DELIVERED"]);
      for (const e of evs) {
        expect(e.organization_id).toBe("org-system");
      }
      const deliveredPayload = JSON.parse(evs.find((e) => e.event_type === "SHIPMENT_DELIVERED")!.payload);
      expect(deliveredPayload.shipment_id).toBe(plainShipId);
      expect(deliveredPayload.contract_id).toBe(contractId);
    } finally {
      db.close();
    }

    // Timeline carries the terminal event
    const detail = await json(await admin.fetch(`/api/logistics/shipments/${plainShipId}`));
    expect(detail.shipment.status).toBe("delivered");
    expect(detail.events.some((e: any) => e.title.includes("final delivery recorded"))).toBe(true);

    // Duplicate delivery → 409; backward arrival after delivery → 409
    const dup = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "deliver" }),
    });
    expect(dup.status).toBe(409);
    const back = await admin.fetch(`/api/logistics/shipments/${plainShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "arrive" }),
    });
    expect(back.status).toBe(409);
  });

  itHermetic("partial shipment: deliver blocked while containers undelivered; unlocks when all delivered", async () => {
    await seedStatus(containerShipId, "in_transit");
    const arriveR = await admin.fetch(`/api/logistics/shipments/${containerShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "arrive" }),
    });
    expect(arriveR.status).toBe(200);

    // Both containers still BOOKED → delivery refused with the blockers listed
    const blocked = await admin.fetch(`/api/logistics/shipments/${containerShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "deliver" }),
    });
    expect(blocked.status).toBe(400);
    const blockedD = await json(blocked);
    expect(blockedD.error).toContain("2 container(s)");
    expect(blockedD.error).toContain("ARRV0000001");
    expect(blockedD.error).toContain("ARRV0000002");

    // No delivery events were published while blocked
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(TEST_DB_PATH);
    try {
      const n = db
        .prepare(`SELECT COUNT(*) n FROM events WHERE event_type = 'SHIPMENT_DELIVERED' AND entity_id = ?`)
        .get(containerShipId) as { n: number };
      expect(n.n).toBe(0);
    } finally {
      db.close();
    }

    // Delivery-ready hint appears in the derived tasks ONLY after all
    // containers are DELIVERED
    let detail = await json(await admin.fetch(`/api/logistics/shipments/${containerShipId}`));
    expect(detail.tasks.some((t: any) => t.title.includes("record the final delivery"))).toBe(false);

    for (const c of detail.containers) {
      const pr = await admin.fetch(`/api/logistics/containers/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "DELIVERED" }),
      });
      expect(pr.status).toBe(200);
    }

    detail = await json(await admin.fetch(`/api/logistics/shipments/${containerShipId}`));
    expect(detail.tasks.some((t: any) => t.title.includes("record the final delivery"))).toBe(true);

    // Now the shipment-level delivery succeeds
    const deliverR = await admin.fetch(`/api/logistics/shipments/${containerShipId}/arrival`, {
      method: "POST",
      body: JSON.stringify({ action: "deliver" }),
    });
    expect(deliverR.status).toBe(200);
    const deliverD = await json(deliverR);
    expect(deliverD.shipment.status).toBe("delivered");
    expect(deliverD.published).toEqual(["SHIPMENT_DELIVERED", "CONTRACT_COMPLETED"]);
  });
});
