/**
 * GET /api/contracts
 *
 * Reads contracts directly from the backend SQLite database.
 * Joins contracts → leads (for buyer info) → lead_contacts (for primary contact).
 * Maps backend Contract fields to the frontend's expected Contract shape.
 *
 * Backend: /home/z/my-project/coffee_export/data/coffee_export.db
 * Tables:  contracts, leads, lead_contacts, contract_line_items
 *
 * Query params:
 *   - status: filter by contract status (e.g. "draft", "completed")
 *   - limit:  max results (default 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

/**
 * Map backend contract status → frontend contract status.
 * Backend:  draft, pending_signature, signed, active, completed, cancelled, breached
 * Frontend: draft, pending_buyer_sig, pending_seller_sig, executed, in_progress, completed, expired, cancelled
 */
function mapStatus(backendStatus: string): string {
  const map: Record<string, string> = {
    draft: "draft",
    pending_signature: "pending_buyer_sig",
    signed: "executed",
    active: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
    breached: "cancelled",
  };
  return map[backendStatus] || "draft";
}

/**
 * Format ISO timestamp to "Mon DD" (e.g. "Jul 03") for display.
 */
function formatDate(ts: string | null): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

// Frontend-expected contract shape
type FrontendContract = {
  id: string;
  quoteId: string;
  buyer: string;
  buyerCountry: string;
  buyerContact: string;
  buyerEmail: string;
  seller: string;
  sellerContact: string;
  agent: string;
  commissionPct: number;
  status: string;
  incoterm: string;
  destinationPort: string;
  destinationCity: string;
  flag: string;
  currency: string;
  totalValue: number;
  weightKg: number;
  lots: { lotId: string; origin: string; process: string; grade: string; pricePerKg: number; weightKg: number }[];
  paymentTerms: string;
  paymentSchedule: { label: string; pct: number; amount: number; dueDate: string | null; status: "pending" | "due" | "paid" | "late"; paidDate?: string | null }[];
  validFrom: string;
  validUntil: string;
  buyerSigned: boolean;
  buyerSignedDate: string | null;
  sellerSigned: boolean;
  sellerSignedDate: string | null;
  shipmentId: string | null;
  shipmentStatus: string | null;
  createdDate: string;
  executedDate: string | null;
  marginPct: number;
  notes?: string;
};

/**
 * Get a flag emoji for a country name.
 */
function countryFlag(country: string | null): string {
  if (!country) return "🌍";
  const flags: Record<string, string> = {
    Germany: "🇩🇪",
    "United Kingdom": "🇬🇧",
    USA: "🇺🇸",
    Japan: "🇯🇵",
    Italy: "🇮🇹",
    France: "🇫🇷",
    Belgium: "🇧🇪",
    Sweden: "🇸🇪",
    "South Korea": "🇰🇷",
    Netherlands: "🇳🇱",
    DE: "🇩🇪",
    GB: "🇬🇧",
    US: "🇺🇸",
  };
  return flags[country] || "🌍";
}

export async function GET(request: NextRequest) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    const db = getReadonlyDb();

    try {
      let query = `
        SELECT
          c.contract_id,
          c.lead_id,
          c.contract_number,
          c.contract_date,
          c.contract_template,
          c.incoterm,
          c.currency,
          c.total_volume_bags,
          c.total_value,
          c.shipment_window_start,
          c.shipment_window_end,
          c.payment_terms,
          c.status,
          c.signed_ts,
          c.is_repeat,
          c.created_ts,
          c.updated_ts,
          l.company_name AS buyer_name,
          l.headquarters_country AS buyer_country,
          l.headquarters_city AS buyer_city,
          lc.name AS contact_name,
          lc.email AS contact_email
        FROM contracts c
        LEFT JOIN leads l ON c.lead_id = l.lead_id
        LEFT JOIN lead_contacts lc ON c.lead_id = lc.lead_id AND lc.is_primary = 1 AND lc.deleted_ts IS NULL
        WHERE c.deleted_ts IS NULL AND c.organization_id = ?
      `;
      const params: (string | number)[] = [auth.user.organizationId];
      if (statusFilter) {
        query += " AND c.status = ?";
        params.push(statusFilter);
      }
      query += " ORDER BY c.created_ts DESC LIMIT ?";
      params.push(limit);

      const rows = db.prepare(query).all(...params) as any[];

      // For each contract, also fetch its line items (if any)
      const lineItemStmt = db.prepare(
        `SELECT cli.lot_id, cli.quantity_bags, cli.unit_price, cli.total_price, cli.notes
         FROM contract_line_items cli
         WHERE cli.contract_id = ? AND cli.deleted_ts IS NULL`
      );

      const contracts: FrontendContract[] = rows.map((row) => {
        const frontendStatus = mapStatus(row.status || "draft");
        const isSigned = !!row.signed_ts;
        const weightKg = (row.total_volume_bags || 0) * 60; // 60kg per bag standard for Ethiopian coffee
        const lineItems = (lineItemStmt.all(row.contract_id) as any[]) || [];

        return {
          id: row.contract_id,
          quoteId: `QU-${row.contract_id.split("-").pop()}`, // synthetic quote ID since no quotes table
          buyer: row.buyer_name || "Unknown Buyer",
          buyerCountry: row.buyer_country || "Unknown",
          buyerContact: row.contact_name || "—",
          buyerEmail: row.contact_email || "—",
          seller: "Faith-El PLC",
          sellerContact: "Abi Solomon",
          agent: "Coffee Trade Desk",
          commissionPct: 2,
          status: frontendStatus,
          incoterm: row.incoterm || "FOB",
          destinationPort: row.buyer_city || "—",
          destinationCity: row.buyer_city || "—",
          flag: countryFlag(row.buyer_country),
          currency: row.currency || "USD",
          totalValue: row.total_value || 0,
          weightKg,
          lots: lineItems.map((li) => ({
            lotId: li.lot_id,
            origin: "—",
            process: "—",
            grade: "—",
            pricePerKg: li.unit_price || 0,
            weightKg: (li.quantity_bags || 0) * 60,
          })),
          paymentTerms: row.payment_terms || "—",
          paymentSchedule: isSigned
            ? [{ label: "Contract Value", pct: 100, amount: row.total_value || 0, dueDate: null, status: "paid" as const, paidDate: formatDate(row.signed_ts) }]
            : [],
          validFrom: formatDate(row.contract_date) || formatDate(row.created_ts) || "—",
          validUntil: formatDate(row.shipment_window_end) || "—",
          buyerSigned: isSigned,
          buyerSignedDate: isSigned ? formatDate(row.signed_ts) : null,
          sellerSigned: isSigned,
          sellerSignedDate: isSigned ? formatDate(row.signed_ts) : null,
          shipmentId: null,
          shipmentStatus: null,
          createdDate: formatDate(row.created_ts) || "—",
          executedDate: isSigned ? formatDate(row.signed_ts) : null,
          marginPct: 20, // default since backend doesn't track cost basis yet
          notes: row.is_repeat ? "Repeat contract from existing customer." : undefined,
        };
      });

      return NextResponse.json({
        ok: true,
        count: contracts.length,
        source: "sqlite",
        contracts,
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/contracts] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contracts
 *
 * Creates a new contract.
 *
 * Body:
 *   leadId: string               (required)
 *   totalVolumeBags: number      (required)
 *   totalValue: number           (required)
 *   incoterm: string             (required — FOB|CIF|EXW|FCA|CFR)
 *   currency: string             (required, e.g. "USD")
 *   shipmentWindowStart: string  (required, ISO date)
 *   shipmentWindowEnd: string    (required, ISO date)
 *   paymentTerms: string         (required)
 *   contractNumber?: string      (optional, defaults to contract_id)
 *   notes?: string               (optional)
 *
 * Response: 201 { ok: true, contract: {...} } | 400 | 500
 */
const VALID_CONTRACT_INCOTERMS = ["FOB", "CIF", "EXW", "FCA", "CFR"];

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    leadId, totalVolumeBags, totalValue, incoterm, currency,
    shipmentWindowStart, shipmentWindowEnd, paymentTerms,
    contractNumber, notes,
  } = body || {};

  // ─── Validate required fields ───
  const missing: string[] = [];
  if (!leadId) missing.push("leadId");
  if (totalVolumeBags == null) missing.push("totalVolumeBags");
  if (totalValue == null) missing.push("totalValue");
  if (!incoterm) missing.push("incoterm");
  if (!currency) missing.push("currency");
  if (!shipmentWindowStart) missing.push("shipmentWindowStart");
  if (!shipmentWindowEnd) missing.push("shipmentWindowEnd");
  if (!paymentTerms) missing.push("paymentTerms");
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  if (!VALID_CONTRACT_INCOTERMS.includes(incoterm)) {
    return NextResponse.json(
      { ok: false, error: `incoterm must be one of: ${VALID_CONTRACT_INCOTERMS.join(", ")}` },
      { status: 400 }
    );
  }

  const volumeBagsNum = Number(totalVolumeBags);
  const totalValueNum = Number(totalValue);
  if (isNaN(volumeBagsNum) || volumeBagsNum <= 0) {
    return NextResponse.json(
      { ok: false, error: "totalVolumeBags must be a positive number" },
      { status: 400 }
    );
  }
  if (isNaN(totalValueNum) || totalValueNum < 0) {
    return NextResponse.json(
      { ok: false, error: "totalValue must be a non-negative number" },
      { status: 400 }
    );
  }

  // Validate shipment window dates
  const windowStart = new Date(shipmentWindowStart);
  const windowEnd = new Date(shipmentWindowEnd);
  if (isNaN(windowStart.getTime())) {
    return NextResponse.json(
      { ok: false, error: "shipmentWindowStart must be a valid ISO date string" },
      { status: 400 }
    );
  }
  if (isNaN(windowEnd.getTime())) {
    return NextResponse.json(
      { ok: false, error: "shipmentWindowEnd must be a valid ISO date string" },
      { status: 400 }
    );
  }
  if (windowEnd < windowStart) {
    return NextResponse.json(
      { ok: false, error: "shipmentWindowEnd must be on or after shipmentWindowStart" },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      // Verify lead exists (FK enforcement)
      const lead = db.prepare(`
        SELECT lead_id FROM leads WHERE lead_id = ? AND organization_id = ? AND deleted_ts IS NULL
      `).get(leadId, orgId) as { lead_id: string } | undefined;
      if (!lead) {
        return NextResponse.json(
          { ok: false, error: `Lead not found: ${leadId}` },
          { status: 404 }
        );
      }

      const now = nowISO();
      const yyyy = String(new Date().getFullYear());
      const prefix = `CT-${yyyy}-`;

      // ─── Generate contract_id: CT-YYYY-NNNN ───
      const last = db.prepare(`
        SELECT contract_id FROM contracts
        WHERE contract_id LIKE ?
        ORDER BY contract_id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { contract_id: string } | undefined;

      let nextNum = 1;
      if (last?.contract_id) {
        const m = last.contract_id.match(/(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }
      const contractId = `${prefix}${String(nextNum).padStart(4, "0")}`;

      // ─── Insert the contract ───
      db.prepare(`
        INSERT INTO contracts (
          contract_id, lead_id, organization_id,
          contract_number, contract_date, contract_template,
          incoterm, currency,
          total_volume_bags, total_value,
          shipment_window_start, shipment_window_end,
          payment_terms, status, is_repeat,
          created_ts, updated_ts
        ) VALUES (?, ?, ?, ?, ?, 'ICC_ECE_7_21', ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?)
      `).run(
        contractId, leadId, orgId,
        contractNumber || contractId,   // contract_number (human-readable)
        now,                            // contract_date
        incoterm, currency,
        volumeBagsNum, totalValueNum,
        shipmentWindowStart, shipmentWindowEnd,
        paymentTerms,
        now, now
      );

      return NextResponse.json({
        ok: true,
        contract: {
          id: contractId,
          contractNumber: contractNumber || contractId,
          leadId,
          totalVolumeBags: volumeBagsNum,
          totalValue: totalValueNum,
          incoterm,
          currency,
          shipmentWindowStart,
          shipmentWindowEnd,
          paymentTerms,
          status: "draft",
          notes: notes || null,
          organization_id: orgId,
          created_ts: now,
        },
      }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/contracts POST] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create contract" },
      { status: 500 }
    );
  }
}
