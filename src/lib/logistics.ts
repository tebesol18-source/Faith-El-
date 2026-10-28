/**
 * Logistics Command Center — shared server-side helpers.
 *
 * Used by the /api/logistics/* routes. Everything here is deliberately
 * paranoid: provider URLs are external entry points for operators, so a
 * bad value (javascript:, data:, a typo'd scheme) must never reach the UI
 * as a clickable link.
 */
import fs from "node:fs";
import path from "node:path";

/** Provider/link URL fields we validate before storing. */
export const PROVIDER_URL_FIELDS = [
  "website_url",
  "booking_url",
  "tracking_url",
  "empty_container_url",
  "official_source_url",
] as const;

/**
 * Validate an external URL for storing on a provider.
 * Accepts ONLY http(s) URLs with a hostname. Rejects everything else
 * (javascript:, data:, file:, ftp:, relative paths, bare domains).
 * Returns a normalized string or null when invalid.
 */
export function sanitizeExternalUrl(raw: unknown): string | null | { invalid: string } {
  if (raw === undefined || raw === null || raw === "") return null; // clear the field
  if (typeof raw !== "string") return { invalid: String(raw) };
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { invalid: trimmed };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { invalid: trimmed };
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { invalid: trimmed };
  }
  return parsed.toString();
}

export interface UrlValidationResult {
  ok: boolean;
  field?: string;
  value?: string;
}

/**
 * Validate every URL field in a provider payload.
 * Returns { ok: false, field, value } for the first invalid entry.
 */
export function validateProviderUrls(payload: Record<string, unknown>): UrlValidationResult {
  for (const field of PROVIDER_URL_FIELDS) {
    if (!(field in payload)) continue;
    const result = sanitizeExternalUrl(payload[field]);
    if (result && typeof result === "object" && "invalid" in result) {
      return { ok: false, field, value: result.invalid };
    }
  }
  return { ok: true };
}

interface ChecklistTemplateEntry {
  title: string;
  detail?: string;
}

let cachedTemplate: { title: string; detail: string }[] | null = null;

/**
 * Load the 18-step export checklist template from
 * data/logistics-checklist-template.json — the SAME file the Python
 * runtime reads (single source of truth, no duplicated list to drift).
 * Fails loudly: the checklist must never be invented at runtime.
 */
export function loadChecklistTemplate(): { title: string; detail: string }[] {
  if (cachedTemplate) return cachedTemplate;
  const candidates = [
    path.join(process.cwd(), "data", "logistics-checklist-template.json"),
    path.join(process.cwd(), "..", "data", "logistics-checklist-template.json"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `Checklist template missing (looked in ${candidates.join(", ")}). ` +
        "The logistics checklist must never be invented — restore data/logistics-checklist-template.json."
    );
  }
  const raw = JSON.parse(fs.readFileSync(found, "utf-8"));
  const entries: ChecklistTemplateEntry[] = raw?.entries;
  if (!Array.isArray(entries) || entries.length === 0 || !entries[0]?.title) {
    throw new Error("Checklist template has no entries — refusing to seed an empty checklist.");
  }
  cachedTemplate = entries.map((e) => ({
    title: String(e.title).trim(),
    detail: String(e.detail ?? "").trim(),
  }));
  return cachedTemplate;
}

/** Ethiopian time (UTC+3) ISO string — matches the Python side's now_addis_iso_str(). */
export function nowIso(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

/** True when the caller's org owns the platform (global provider rows). */
export function isPlatformOrg(orgId: string): boolean {
  return orgId === "org-system";
}
