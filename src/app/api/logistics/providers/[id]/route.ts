/**
 * /api/logistics/providers/[id] — one provider row.
 *
 * GET   (auth):  fetch a provider visible to the caller's org (own-org or
 *                global). Another org's private row → 404 (invisible).
 * PATCH (admin): update an org-owned provider. Global rows (NULL
 *                organization_id) are editable ONLY by the platform org
 *                (org-system) — a tenant must not edit shared data.
 *
 *                PATCH { action: "verify", official_source_url } marks the
 *                details as checked against that official source (records
 *                source + date). "verified" without a source is a claim,
 *                not evidence — the field is not directly settable.
 *
 *                PATCH { active: false } deactivates a provider (hidden
 *                from the default directory list; kept for history).
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb, getWritableDb } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { nowIso, sanitizeExternalUrl, validateProviderUrls } from "@/lib/logistics";

const STRING_FIELDS = [
  "name", "provider_type", "country", "city", "service_area", "services",
  "phone", "email", "website_url", "booking_url", "tracking_url",
  "empty_container_url", "address", "notes",
] as const;

const BOOL_FIELDS = [
  "supports_contact", "supports_external_booking", "supports_tracking",
  "supports_quotation", "supports_empty_container", "supports_document_submission",
] as const;

const PLATFORM_ORG = "org-system";

function getVisibleProvider(
  db: ReturnType<typeof getReadonlyDb>,
  id: number,
  orgId: string
) {
  const row = db.prepare(
    `SELECT * FROM logistics_providers WHERE id = ? AND deleted_ts IS NULL`
  ).get(id) as
    | { organization_id: string | null; [k: string]: unknown }
    | undefined;
  if (!row) return { row: undefined, editable: false };
  if (row.organization_id === null) {
    // Global row: visible to all, editable only by the platform org
    return { row, editable: orgId === PLATFORM_ORG };
  }
  if (row.organization_id !== orgId) return { row: undefined, editable: false };
  return { row, editable: true };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const providerId = Number(id);
  if (!Number.isInteger(providerId)) {
    return NextResponse.json({ ok: false, error: "Invalid provider id" }, { status: 400 });
  }

  try {
    const db = getReadonlyDb();
    try {
      const { row } = getVisibleProvider(db, providerId, auth.user.organizationId);
      if (!row) {
        return NextResponse.json({ ok: false, error: "Provider not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, provider: row });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get provider";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;
  const { id } = await params;
  const providerId = Number(id);
  if (!Number.isInteger(providerId)) {
    return NextResponse.json({ ok: false, error: "Invalid provider id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Verify action (records provenance: source + date) ──
  if (body.action === "verify") {
    const source = typeof body.official_source_url === "string" ? body.official_source_url.trim() : "";
    if (!source) {
      return NextResponse.json(
        { ok: false, error: "official_source_url is required to mark a provider verified" },
        { status: 400 }
      );
    }
    const urlCheck = validateProviderUrls({ official_source_url: source });
    if (!urlCheck.ok) {
      return NextResponse.json(
        { ok: false, error: `Invalid official_source_url: "${urlCheck.value}"` },
        { status: 400 }
      );
    }
    // Store the NORMALIZED url (sanitizeExternalUrl returns a canonical
    // http(s) URL string for valid input).
    const normalized = sanitizeExternalUrl(source);
    if (typeof normalized !== "string" || !normalized) {
      return NextResponse.json(
        { ok: false, error: `Invalid official_source_url: "${source}"` },
        { status: 400 }
      );
    }
    try {
      const db = getWritableDb();
      try {
        const { row, editable } = getVisibleProvider(db, providerId, orgId);
        if (!row || !editable) {
          return NextResponse.json({ ok: false, error: "Provider not found" }, { status: 404 });
        }
        const now = nowIso();
        db.prepare(
          `UPDATE logistics_providers
           SET verified = 1, official_source_url = ?, last_verified_at = ?, updated_ts = ?
           WHERE id = ?`
        ).run(normalized, now, now, providerId);
        const provider = db.prepare(`SELECT * FROM logistics_providers WHERE id = ?`).get(providerId);
        return NextResponse.json({ ok: true, provider });
      } finally {
        db.close();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to verify provider";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  // ── Regular field update ──
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
      const { row, editable } = getVisibleProvider(db, providerId, orgId);
      if (!row || !editable) {
        return NextResponse.json({ ok: false, error: "Provider not found" }, { status: 404 });
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      for (const f of STRING_FIELDS) {
        if (f in body) {
          const v = body[f];
          if (v !== null && v !== undefined && typeof v !== "string") {
            return NextResponse.json({ ok: false, error: `${f} must be a string` }, { status: 400 });
          }
          sets.push(`${f} = ?`);
          values.push(v === undefined ? null : v);
        }
      }
      for (const f of BOOL_FIELDS) {
        if (f in body) {
          sets.push(`${f} = ?`);
          values.push(body[f] ? 1 : 0);
        }
      }
      if ("active" in body) {
        sets.push(`active = ?`);
        values.push(body.active ? 1 : 0);
      }
      if ("integration_status" in body) {
        // Only the two honest states exist; "api_connected" is reserved for
        // a REAL adapter and must never be set to fake a connection.
        const v = body.integration_status;
        if (v !== "external" && v !== "api_connected") {
          return NextResponse.json(
            { ok: false, error: "integration_status must be 'external' or 'api_connected'" },
            { status: 400 }
          );
        }
        if (v === "api_connected") {
          return NextResponse.json(
            {
              ok: false,
              error:
                "No logistics API integration exists — integration_status cannot be set to api_connected. " +
                "Faith-El does not book or track on its own.",
            },
            { status: 400 }
          );
        }
        sets.push(`integration_status = ?`);
        values.push(v);
      }
      // verified/last_verified_at are not settable here (see action=verify).

      if (sets.length === 0) {
        return NextResponse.json({ ok: false, error: "No updatable fields provided" }, { status: 400 });
      }

      sets.push(`updated_ts = ?`);
      values.push(nowIso());
      values.push(providerId);
      db.prepare(`UPDATE logistics_providers SET ${sets.join(", ")} WHERE id = ?`).run(...values);
      const provider = db.prepare(`SELECT * FROM logistics_providers WHERE id = ?`).get(providerId);
      return NextResponse.json({ ok: true, provider });
    } finally {
      db.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update provider";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
