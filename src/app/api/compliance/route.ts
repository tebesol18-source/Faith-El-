/**
 * GET /api/compliance
 * Reads compliance documents from the SQLite database.
 * Groups by contract_id to create the compliance matrix the frontend expects.
 * Each contract becomes a "shipment" with its documents mapped to the 8 doc types.
 */
import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

function getDbPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", "coffee_export", "data", "coffee_export.db"),
    path.resolve(process.cwd(), "coffee_export", "data", "coffee_export.db"),
    "/home/z/my-project/coffee_export/data/coffee_export.db",
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return candidates[candidates.length - 1];
}

function formatDate(ts: string | null): string | null {
  if (!ts) return null;
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return null; }
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  } catch { return null; }
}

const DOC_TYPES = ["phytosanitary", "ecx_grade", "export_permit", "certificate_of_origin", "ico_certificate", "fumigation", "quality_inspection", "bill_of_lading"] as const;

const DOC_LABELS: Record<string, string> = {
  phytosanitary: "Phytosanitary Certificate",
  ecx_grade: "ECX Grading Certificate",
  export_permit: "Export Permit",
  certificate_of_origin: "Certificate of Origin",
  ico_certificate: "ICO Certificate",
  fumigation: "Fumigation Certificate",
  quality_inspection: "Quality Inspection",
  bill_of_lading: "Bill of Lading",
};

export async function GET() {
  try {
    const db = new Database(getDbPath(), { readonly: true });
    try {
      // Get all contracts with their compliance docs
      const contracts = db.prepare(`
        SELECT c.contract_id, c.total_value, c.status,
               l.company_name AS buyer_name, l.headquarters_country AS buyer_country,
               l.headquarters_city AS buyer_city
        FROM contracts c
        LEFT JOIN leads l ON c.lead_id = l.lead_id
        WHERE c.deleted_ts IS NULL
        ORDER BY c.created_ts DESC
      `).all() as any[];

      const docsStmt = db.prepare(`
        SELECT document_type, file_path, issued_date, expiry_date, status, notes
        FROM compliance_documents
        WHERE contract_id = ? AND deleted_ts IS NULL
      `);

      const complianceShipments = contracts.map((c) => {
        const docs = (docsStmt.all(c.contract_id) as any[]) || [];
        const docsByType: Record<string, any> = {};
        docs.forEach((d) => {
          docsByType[d.document_type] = {
            type: d.document_type,
            status: d.status || "missing",
            issuedDate: formatDate(d.issued_date),
            expiryDate: formatDate(d.expiry_date),
            daysToExpiry: daysUntil(d.expiry_date),
            fileName: d.file_path || null,
            notes: d.notes,
          };
        });

        // Build all 8 doc slots (fill missing with "missing" status)
        const allDocs = DOC_TYPES.map((type) => {
          if (docsByType[type]) return docsByType[type];
          return { type, status: "missing", issuedDate: null, expiryDate: null, daysToExpiry: null, fileName: null, notes: null };
        });

        const approved = allDocs.filter((d) => d.status === "approved").length;
        const blocked = allDocs.some((d) => d.status === "missing" || d.status === "expired");

        return {
          id: c.contract_id,
          destination: c.buyer_city || "—",
          flag: c.buyer_country === "Germany" ? "🇩🇪" : c.buyer_country === "Japan" ? "🇯🇵" : "🌍",
          eta: "—",
          lots: [],
          contractValue: c.total_value || 0,
          vessel: "—",
          docs: allDocs,
          docReadiness: Math.round((approved / DOC_TYPES.length) * 100),
          blocked,
        };
      });

      return NextResponse.json({ ok: true, count: complianceShipments.length, complianceShipments });
    } finally { db.close(); }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
