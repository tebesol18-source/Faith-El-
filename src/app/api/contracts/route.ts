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
import Database from "better-sqlite3";
import path from "path";

function getDbPath(): string {
  const fs = require("fs");
  const candidates = [
    path.resolve(process.cwd(), "..", "coffee_export", "data", "coffee_export.db"),
    path.resolve(process.cwd(), "coffee_export", "data", "coffee_export.db"),
    "/home/z/my-project/coffee_export/data/coffee_export.db",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1];
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
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    const db = new Database(getDbPath(), { readonly: true, fileMustExist: true });

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
        WHERE c.deleted_ts IS NULL
      `;
      const params: (string | number)[] = [];
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
          seller: "Coelrodan PLC",
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
