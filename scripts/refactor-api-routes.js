#!/usr/bin/env node
/**
 * Mechanical refactor: for each API route, replace local getDbPath() with @/lib/db imports.
 * This script also adds requireAuth to GET handlers.
 *
 * Strategy: Read each file, find the getDbPath block + Database import, remove them,
 * insert @/lib/db imports, and update `new Database(getDbPath(), ...)` to
 * getReadonlyDb()/getWritableDb().
 */
const fs = require("fs");
const path = require("path");

const ROUTES = [
  "src/app/api/contracts/route.ts",
  "src/app/api/deals/route.ts",
  "src/app/api/finance/route.ts",
  "src/app/api/inbox/route.ts",
  "src/app/api/leads/route.ts",
  "src/app/api/quotes/route.ts",
  "src/app/api/samples/route.ts",
  "src/app/api/shipments/route.ts",
  "src/app/api/supervisor/route.ts",
  "src/app/api/vessel-tracking/route.ts",
  "src/app/api/market-prices/route.ts",
  "src/app/api/agents/research-leads/route.ts",
  "src/app/api/leads/[id]/history/route.ts",
];

const BASE = "/home/z/my-project";

// Match the getDbPath function definition (handles most variants in this codebase)
// Variants:
//   function getDbPath(): string { ... return ...; }
// Some files have it after `import fs from "fs"`; some use `require("fs")`.
const GET_DB_PATH_BLOCK = /function getDbPath\(\): string \{[\s\S]*?\n\}\n*/m;

// Match the local DB_PATH constants some files use
const DB_PATH_CONST_BLOCK = /\/\/ Path to the backend SQLite database[\s\S]*?const DB_PATH_FALLBACK = [^\n]+\n*/m;

// Match `new Database(getDbPath(), { readonly: true })` and friends
const NEW_DB_READONLY = /new Database\(getDbPath\(\),\s*\{\s*readonly:\s*true(?:,\s*fileMustExist:\s*(?:true|false))?\s*\}\)/g;
const NEW_DB_READONLY_SIMPLE = /new Database\(getDbPath\(\),\s*\{\s*readonly:\s*true\s*\}\)/g;
const NEW_DB_WRITABLE = /new Database\(getDbPath\(\)\)/g;

const IMPORT_DB = 'import Database from "better-sqlite3";';
const IMPORT_PATH = 'import path from "path";';
const IMPORT_FS_REQ = 'import fs from "fs";';

let successCount = 0;
let skipCount = 0;

for (const relPath of ROUTES) {
  const abs = path.join(BASE, relPath);
  let src = fs.readFileSync(abs, "utf8");
  const orig = src;

  // Track what we removed to know if we need to add the lib imports
  let removedDbPath = false;

  // Remove local getDbPath() function definition
  src = src.replace(GET_DB_PATH_BLOCK, () => { removedDbPath = true; return ""; });

  // Remove DB_PATH constants if present (leads/route.ts has these)
  src = src.replace(DB_PATH_CONST_BLOCK, "");

  // Remove `import Database from "better-sqlite3";` line IF we removed getDbPath
  // (because we're now using @/lib/db instead). But keep it if Database is still used directly.
  // We'll determine this by checking after replacements.
  let needDbImport = true;

  // Replace `new Database(getDbPath(), { readonly: true })` with `getReadonlyDb()`
  src = src.replace(NEW_DB_READONLY, "getReadonlyDb()");
  src = src.replace(NEW_DB_READONLY_SIMPLE, "getReadonlyDb()");
  // Replace `new Database(getDbPath())` with `getWritableDb()`
  src = src.replace(NEW_DB_WRITABLE, "getWritableDb()");

  // If no more `Database` references remain, remove the import
  if (!/new Database\(/.test(src) && !/Database\./.test(src)) {
    src = src.replace(new RegExp("^" + IMPORT_DB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\n", "m"), "");
    src = src.replace(new RegExp("^" + IMPORT_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\n", "m"), "");
    src = src.replace(new RegExp("^" + IMPORT_FS_REQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\n", "m"), "");
  }

  // If we have `const fs = require("fs");` inside the getDbPath function, it's already removed.
  // But if there's a top-level `const fs = require("fs");`, remove it (not needed since getDbPath is gone)
  // Already handled above.

  // Determine what to import from @/lib
  const needsReadonly = src.includes("getReadonlyDb(");
  const needsWritable = src.includes("getWritableDb(");

  // Now add imports at the top after existing next/server import
  const importLines = [];
  if (needsReadonly || needsWritable) {
    const dbFns = [];
    if (needsReadonly) dbFns.push("getReadonlyDb");
    if (needsWritable) dbFns.push("getWritableDb");
    importLines.push(`import { ${dbFns.join(", ")} } from "@/lib/db";`);
  }

  // Determine if we already import from @/lib/auth — if not, we need to add requireAuth
  // (only for GET routes — POST routes already have it)
  const hasAuthImport = /from ["']@\/lib\/auth["']/.test(src);
  if (!hasAuthImport) {
    // Check if this is a route with a GET handler
    if (/export async function GET/.test(src)) {
      importLines.push('import { requireAuth } from "@/lib/auth";');
    }
  }

  // Also check if @/lib/format imports would help (we won't auto-refactor those — manual touch needed)
  // For now just leave local format helpers in place.

  // Find the first import line and insert after the last import line
  if (importLines.length > 0) {
    // Insert after the last existing import
    const importBlockEnd = src.match(/^import [^\n]+;\n/m);
    if (importBlockEnd) {
      // Find all consecutive imports
      const allImports = [];
      const lines = src.split("\n");
      let lastImportIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^import /.test(lines[i])) {
          lastImportIdx = i;
        } else if (lastImportIdx >= 0 && lines[i].trim() === "") {
          // continue past blank lines after imports
        } else if (lastImportIdx >= 0 && lines[i].trim() !== "") {
          break;
        }
      }
      // Insert after the last import line
      lines.splice(lastImportIdx + 1, 0, ...importLines);
      src = lines.join("\n");
    }
  }

  // If GET handler exists, add requireAuth check at the top of GET
  if (/export async function GET\(\)/.test(src)) {
    src = src.replace(
      /export async function GET\(\) \{/g,
      'export async function GET(request: any) {\n  // Auth — every GET route requires a valid session\n  const auth = requireAuth(request);\n  if ("error" in auth) return auth.error;\n'
    );
  } else if (/export async function GET\(request: NextRequest\)/.test(src)) {
    // Already takes request param, just add auth check inside
    src = src.replace(
      /export async function GET\(request: NextRequest\) \{\n  try \{/g,
      'export async function GET(request: NextRequest) {\n  // Auth — every GET route requires a valid session\n  const auth = requireAuth(request);\n  if ("error" in auth) return auth.error;\n\n  try {'
    );
  }

  if (src !== orig) {
    fs.writeFileSync(abs, src);
    successCount++;
    console.log(`✓ ${relPath}`);
  } else {
    skipCount++;
    console.log(`· ${relPath} (no changes)`);
  }
}

console.log(`\nDone: ${successCount} refactored, ${skipCount} skipped.`);
