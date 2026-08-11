/**
 * GET /api/compliance
 * Reads compliance documents from the SQLite database.
 * Groups by contract_id to create the compliance matrix the frontend expects.
 * Each contract becomes a "shipment" with its documents mapped to the 8 doc types.
 */
import { NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { formatDate, daysUntil } from "@/lib/format";

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

export async function GET(request: any) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();
    try {
      // Get all contracts with their compliance docs
      const contracts = db.prepare(`
        SELECT c.contract_id, c.total_value, c.status,
               l.company_name AS buyer_name, l.headquarters_country AS buyer_country,
               l.headquarters_city AS buyer_city
        FROM contracts c
        LEFT JOIN leads l ON c.lead_id = l.lead_id
        WHERE c.deleted_ts IS NULL AND c.organization_id = ?
        ORDER BY c.created_ts DESC
      `).all(orgId) as any[];

      const docsStmt = db.prepare(`
        SELECT document_type, file_path, issued_date, expiry_date, status, notes
        FROM compliance_documents
        WHERE organization_id = ? AND contract_id = ? AND deleted_ts IS NULL
      `);

      const complianceShipments = contracts.map((c) => {
        const docs = (docsStmt.all(orgId, c.contract_id) as any[]) || [];
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
