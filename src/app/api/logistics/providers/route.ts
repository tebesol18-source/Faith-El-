/**
 * /api/logistics/providers — the DB-driven provider directory.
 *
 * GET  (auth): list providers visible to the caller's org — its own rows
 *              PLUS global rows (organization_id IS NULL, verified public
 *              reference data). Supports ?provider_type= &include_inactive=1.
 * POST (admin): create an org-scoped provider entry. URL fields are
 *              validated (http/https only). New rows start UNVERIFIED —
 *              "verified" is a data-provenance mark that requires an
 *              official source (see PATCH /:id with action=verify).
 *
 * The frontend must NEVER hardcode a provider list — this endpoint (backed
 * by the logistics_providers table) is the only source.
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { nowIso, validateProviderUrls } from "@/lib/logistics";

const PROVIDER_TYPES = new Set([
  "national_carrier", "shipping_line", "freight_forwarder", "trucking",
  "railway", "port_terminal", "customs_clearing", "warehouse", "other",
]);

const STRING_FIELDS = [
  "name", "provider_type", "country", "city", "service_area", "services",
  "phone", "email", "website_url", "booking_url", "tracking_url",
  "empty_container_url", "address", "official_source_url", "notes",
] as const;

const BOOL_FIELDS = [
  "supports_contact", "supports_external_booking", "supports_tracking",
  "supports_quotation", "supports_empty_container", "supports_document_submission",
] as const;

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  const url = new URL(request.url);
  const providerType = url.searchParams.get("provider_type");
  const includeInactive = url.searchParams.get("include_inactive") === "1";

  try {
    const db = getReadonlyDb();
    try {
      let sql = `
        SELECT * FROM logistics_providers
        WHERE deleted_ts IS NULL
          AND (organization_id IS NULL OR organization_id = ?)
      `;
      const params: unknown[] = [orgId];
      if (!includeInactive) sql += ` AND active = 1`;
      if (providerType) {
        sql += ` AND provider_type = ?`;
        params.push(providerType);
      }
      sql += ` ORDER BY name ASC`;

      const providers = db.prepare(sql).all(...params);
      return NextResponse.json({
        ok: true,
        count: providers.length,
        providers,
      });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list providers";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "Provider name is required" }, { status: 400 });
  }
  const providerType = typeof body.provider_type === "string" ? body.provider_type : "other";
  if (!PROVIDER_TYPES.has(providerType)) {
    return NextResponse.json(
      { ok: false, error: `Invalid provider_type: ${providerType}` },
      { status: 400 }
    );
  }

  // URL fields: http(s) only — a stored URL becomes a clickable external
  // action, so javascript:/data:/garbage must be rejected at write time.
  const urlCheck = validateProviderUrls(body);
  if (!urlCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid URL for ${urlCheck.field}: "${urlCheck.value}" — only http(s) URLs are accepted`,
      },
      { status: 400 }
    );
  }

  try {
    const db = getWritableDb();
    try {
      const now = nowIso();
      const fields: string[] = ["organization_id", "name", "provider_type", "created_ts", "updated_ts"];
      const values: unknown[] = [orgId, name, providerType, now, now];

      for (const f of STRING_FIELDS) {
        if (f === "name" || f === "provider_type") continue;
        if (f in body) {
          const v = body[f];
          if (v !== null && v !== undefined && typeof v !== "string") {
            return NextResponse.json({ ok: false, error: `${f} must be a string` }, { status: 400 });
          }
          fields.push(f);
          values.push(v === undefined ? null : v);
        }
      }
      for (const f of BOOL_FIELDS) {
        if (f in body) {
          fields.push(f);
          values.push(body[f] ? 1 : 0);
        }
      }
      if ("active" in body) {
        fields.push("active");
        values.push(body.active ? 1 : 0);
      }
      // verified/last_verified_at are NEVER set on create — verification is
      // a separate, provenance-recorded action.

      const placeholders = fields.map(() => "?").join(", ");
      const result = db.prepare(
        `INSERT INTO logistics_providers (${fields.join(", ")}) VALUES (${placeholders})`
      ).run(...values);
      const provider = db.prepare(`SELECT * FROM logistics_providers WHERE id = ?`).get(result.lastInsertRowid);
      return NextResponse.json({ ok: true, provider }, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create provider";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
