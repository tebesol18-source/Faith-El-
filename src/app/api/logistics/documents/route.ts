/**
 * /api/logistics/documents — booking-confirmation uploads.
 *
 * POST (auth, multipart/form-data, field "file"): stores the operator's
 * REAL booking confirmation from a provider. Files are content-hashed
 * (sha256 → upload/logistics/<hash>.<ext>), size-capped at 10 MB, and
 * restricted to PDF / PNG / JPG. Returns { path, fileName, size } which
 * the UI stores on the booking record (confirmation_document, as JSON).
 *
 * GET (auth, ?path=): streams a stored document back — but ONLY if the
 * path belongs to a booking of the caller's org (tenant check), and only
 * inside upload/logistics/ (path-traversal safe).
 */
import { NextRequest, NextResponse } from "next/server";
import { getReadonlyDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};
const STORE_DIR = path.join(process.cwd(), "upload", "logistics");

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  const ext = ALLOWED_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Only PDF, PNG or JPG files are accepted" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "File exceeds the 10 MB limit" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const storedName = `${hash}.${ext}`;
    fs.mkdirSync(STORE_DIR, { recursive: true });
    const target = path.join(STORE_DIR, storedName);
    // Same content → same name: writing is idempotent, no unbounded growth
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, bytes);
    }
    const fileName = typeof file.name === "string" && file.name.trim() ? file.name.trim() : storedName;
    return NextResponse.json(
      { ok: true, document: { path: `upload/logistics/${storedName}`, fileName, size: file.size } },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to store document";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  const url = new URL(request.url);
  const docPath = url.searchParams.get("path");
  if (!docPath) {
    return NextResponse.json({ ok: false, error: "path is required" }, { status: 400 });
  }

  // Path safety: only exact upload/logistics/<hash>.<ext> shapes
  if (!/^upload\/logistics\/[a-f0-9]{64}\.(pdf|png|jpg)$/.test(docPath)) {
    return NextResponse.json({ ok: false, error: "Invalid document path" }, { status: 400 });
  }

  try {
    // Tenant check: the document must be attached to one of the org's bookings
    const db = getReadonlyDb();
    try {
      const booking = db.prepare(
        `SELECT id FROM logistics_bookings
         WHERE organization_id = ? AND deleted_ts IS NULL AND confirmation_document LIKE ?
         LIMIT 1`
      ).get(orgId, `%"${docPath}"%`);
      if (!booking) {
        return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
      }
    } finally {
      db.close();
    }

    const abs = path.join(process.cwd(), docPath);
    if (!fs.existsSync(abs)) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
    const data = fs.readFileSync(abs);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: { "Content-Type": mime, "Content-Disposition": "inline", "Cache-Control": "private" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read document";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
