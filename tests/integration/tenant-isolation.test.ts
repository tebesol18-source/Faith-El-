/**
 * Multi-tenant isolation tests — verifies that operators in different
 * organizations cannot see each other's data.
 *
 * These tests prove that the cross-tenant data leakage vulnerability
 * is fixed:
 *   1. New operators get their own organization (not org-system)
 *   2. Dashboard data is scoped to the operator's org
 *   3. Leads, contracts, inventory, etc. are all org-scoped
 *   4. IDOR — accessing another org's records by ID returns 404
 */

import { describe, it, expect } from "vitest";
import { createTestClient } from "./helpers";

const BASE_URL = "http://localhost:3000";

const serverAvailable = await (async () => {
  try {
    const r = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 503;
  } catch {
    return false;
  }
})();

const itOrSkip = serverAvailable ? it : it.skip;

describe("Multi-tenant data isolation", () => {
  itOrSkip("new operators created via admin API get their own organization (not org-system)", async () => {
    const adminClient = await createTestClient("admin@faithel.com", "admin123", "180.0.0.1");

    // Create a new operator
    const uniqueEmail = `iso-test-${Date.now()}@test.com`;
    const createR = await adminClient.fetch("/api/admin/operators", {
      method: "POST",
      body: JSON.stringify({
        name: "Isolation Test",
        email: uniqueEmail,
        password: "TestPass123",
        role: "operator",
      }),
    });

    expect(createR.status).toBe(201);
    const createD = await createR.json();
    expect(createD.ok).toBe(true);
    expect(createD.operator.organization_id).toBeTruthy();
    expect(createD.operator.organization_id).not.toBe("org-system"); // ← KEY: must NOT be org-system

    // Cleanup
    await adminClient.fetch(`/api/admin/operators/${createD.operator.operator_id}`, {
      method: "DELETE",
    });
  });

  itOrSkip("new operator sees empty dashboard (no demo data)", async () => {
    const adminClient = await createTestClient("admin@faithel.com", "admin123", "180.0.0.2");

    // Create a new operator with their own org
    const uniqueEmail = `empty-dash-${Date.now()}@test.com`;
    const createR = await adminClient.fetch("/api/admin/operators", {
      method: "POST",
      body: JSON.stringify({
        name: "Empty Dashboard Test",
        email: uniqueEmail,
        password: "TestPass123",
        role: "operator",
      }),
    });
    const createD = await createR.json();
    const opId = createD.operator.operator_id;

    // Change password (required — must_change_password=1)
    const opClient = await createTestClient(uniqueEmail, "TestPass123", "180.0.0.3");
    await opClient.fetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "TestPass123", newPassword: "NewPass456" }),
    });

    // Now fetch the dashboard as the new operator
    const dashR = await opClient.fetch("/api/dashboard");
    expect(dashR.status).toBe(200);
    const dashD = await dashR.json();

    // The new operator should see ZERO data (their org has no leads, contracts, etc.)
    const stats = dashD.data.stats;
    expect(stats.totalLeads).toBe(0);
    expect(stats.totalContracts).toBe(0);
    expect(stats.activeDeals).toBe(0);
    expect(stats.shipmentCount).toBe(0);

    // Cleanup
    await adminClient.fetch(`/api/admin/operators/${opId}`, { method: "DELETE" });
  });

  itOrSkip("leads created by one operator are not visible to another", async () => {
    const adminClient = await createTestClient("admin@faithel.com", "admin123", "180.0.0.4");

    // Create operator A
    const emailA = `leada-${Date.now()}@test.com`;
    const createA = await adminClient.fetch("/api/admin/operators", {
      method: "POST",
      body: JSON.stringify({ name: "Lead Owner A", email: emailA, password: "TestPass123" }),
    });
    const opA = (await createA.json()).operator;

    // Create operator B
    const emailB = `leadb-${Date.now()}@test.com`;
    const createB = await adminClient.fetch("/api/admin/operators", {
      method: "POST",
      body: JSON.stringify({ name: "Lead Viewer B", email: emailB, password: "TestPass123" }),
    });
    const opB = (await createB.json()).operator;

    // Change passwords + re-login for both (the old session has mustChangePassword=true)
    const tempClientA = await createTestClient(emailA, "TestPass123", "180.0.0.5");
    await tempClientA.fetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "TestPass123", newPassword: "NewPass456" }),
    });
    const clientA = await createTestClient(emailA, "NewPass456", "180.0.0.5b"); // re-login

    const tempClientB = await createTestClient(emailB, "TestPass123", "180.0.0.6");
    await tempClientB.fetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "TestPass123", newPassword: "NewPass456" }),
    });
    const clientB = await createTestClient(emailB, "NewPass456", "180.0.0.6b"); // re-login

    // Operator A creates leads
    const researchR = await clientA.fetch("/api/agents/research-leads", {
      method: "POST",
      body: JSON.stringify({ country: "Germany", segment: "roaster", count: 3 }),
    });
    expect(researchR.status).toBe(200);

    // Operator A should see their leads
    const leadsA = await clientA.fetch("/api/leads");
    const leadsAData = await leadsA.json();
    expect(leadsAData.ok).toBe(true);
    expect(leadsAData.count).toBeGreaterThan(0);

    // Operator B should see ZERO leads (different org)
    const leadsB = await clientB.fetch("/api/leads");
    const leadsBData = await leadsB.json();
    expect(leadsBData.ok).toBe(true);
    expect(leadsBData.count).toBe(0); // ← KEY: B sees none of A's leads

    // Cleanup
    await adminClient.fetch(`/api/admin/operators/${opA.operator_id}`, { method: "DELETE" });
    await adminClient.fetch(`/api/admin/operators/${opB.operator_id}`, { method: "DELETE" });
  });

  itOrSkip("operator cannot access another org's lead history by ID (IDOR)", async () => {
    const adminClient = await createTestClient("admin@faithel.com", "admin123", "180.0.0.7");

    // Create operator A + B
    const emailA = `idora-${Date.now()}@test.com`;
    const createA = await adminClient.fetch("/api/admin/operators", {
      method: "POST",
      body: JSON.stringify({ name: "IDOR Owner A", email: emailA, password: "TestPass123" }),
    });
    const opA = (await createA.json()).operator;

    const emailB = `idorb-${Date.now()}@test.com`;
    const createB = await adminClient.fetch("/api/admin/operators", {
      method: "POST",
      body: JSON.stringify({ name: "IDOR Attacker B", email: emailB, password: "TestPass123" }),
    });
    const opB = (await createB.json()).operator;

    // Change passwords + re-login
    const tempClientA = await createTestClient(emailA, "TestPass123", "180.0.0.8");
    await tempClientA.fetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "TestPass123", newPassword: "NewPass456" }),
    });
    const clientA = await createTestClient(emailA, "NewPass456", "180.0.0.8b");

    const tempClientB = await createTestClient(emailB, "TestPass123", "180.0.0.9");
    await tempClientB.fetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "TestPass123", newPassword: "NewPass456" }),
    });
    const clientB = await createTestClient(emailB, "NewPass456", "180.0.0.9b");

    // A creates leads
    const researchR = await clientA.fetch("/api/agents/research-leads", {
      method: "POST",
      body: JSON.stringify({ country: "Japan", segment: "roaster", count: 3 }),
    });
    expect(researchR.status).toBe(200);

    // Get A's leads
    const leadsA = await clientA.fetch("/api/leads");
    const leadsAData = await leadsA.json();
    expect(leadsAData.count).toBeGreaterThan(0);

    // Pick a lead ID to test IDOR
    const leadId = leadsAData.leads?.[0]?.id;
    if (leadId) {
      // B tries to access A's lead history by ID (IDOR attack)
      const idorR = await clientB.fetch(`/api/leads/${leadId}/history`);
      // Should return 404 (not found) — not 200 with A's data
      expect(idorR.status).toBe(404);
    }

    // Cleanup
    await adminClient.fetch(`/api/admin/operators/${opA.operator_id}`, { method: "DELETE" });
    await adminClient.fetch(`/api/admin/operators/${opB.operator_id}`, { method: "DELETE" });
  });

  itOrSkip("approved access request creates new org (not org-system)", async () => {
    const adminClient = await createTestClient("admin@faithel.com", "admin123", "180.0.0.10");

    // Submit access request
    const uniqueEmail = `approve-iso-${Date.now()}@test.com`;
    const submitR = await fetch(`${BASE_URL}/api/auth/request-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "180.0.0.11" },
      body: JSON.stringify({ name: "Approve ISO Test", email: uniqueEmail }),
    });
    const submitD = await submitR.json();
    const requestId = submitD.requestId;

    // Approve it
    const approveR = await adminClient.fetch(`/api/admin/access-requests/${requestId}/approve`, {
      method: "POST",
      body: JSON.stringify({ role: "operator" }),
    });
    const approveD = await approveR.json();
    expect(approveD.ok).toBe(true);

    // Verify the operator's org is NOT org-system
    // (We can't directly check the org_id from the approve response,
    // but we can verify the operator was created with a unique org
    // by checking that their dashboard is empty)
    const opClient = await createTestClient(uniqueEmail, approveD.generatedPassword, "180.0.0.12");

    // Change password
    await opClient.fetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: approveD.generatedPassword, newPassword: "ChangedPass1" }),
    });

    // Dashboard should show zero data (new org, no existing data)
    const dashR = await opClient.fetch("/api/dashboard");
    const dashD = await dashR.json();
    expect(dashD.data.stats.totalLeads).toBe(0);
    expect(dashD.data.stats.totalContracts).toBe(0);

    // Cleanup
    await adminClient.fetch(`/api/admin/operators/${approveD.operator.operator_id}`, {
      method: "DELETE",
    });
  });
});
