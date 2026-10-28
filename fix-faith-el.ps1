# Faith-El Fix Script - Applies all verified fixes
# Run from inside the Faith-El repository folder

$repoPath = Get-Location

Write-Host "Applying fixes to Faith-El repository..." -ForegroundColor Cyan

# Fix 1: Research leads case-sensitivity
$file1 = Join-Path $repoPath "src\app\api\agents\research-leads\route.ts"
$content1 = Get-Content $file1 -Raw
$oldPattern1 = 'if (!segment || !["Specialty Importer", "Commercial Importer", "Roaster", "Distributor"].includes(segment)) {'
$newPattern1 = @'
// Normalize segment to title case for case-insensitive matching
    const segmentNormalized = segment 
      ? segment.split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
      : null;
    
    if (!segmentNormalized || !["Specialty Importer", "Commercial Importer", "Roaster", "Distributor"].includes(segmentNormalized)) {
'@
$content1 = $content1.Replace($oldPattern1, $newPattern1)
# Also replace the segment usage after validation
$content1 = $content1.Replace('const leadCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);', 'const segment = segmentNormalized;

    const leadCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);')
Set-Content $file1 $content1 -NoNewline
Write-Host "[1/5] Fixed research-leads case-sensitivity" -ForegroundColor Green

# Fix 2: Create inventory upload endpoint
$uploadDir = Join-Path $repoPath "src\app\api\inventory\upload"
New-Item -ItemType Directory -Path $uploadDir -Force | Out-Null
$file2 = Join-Path $uploadDir "route.ts"
$content2 = @'
import { NextRequest, NextResponse } from "next/server";
import { getWritableDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import crypto from "crypto";

function nowISO(): string {
  return new Date().toISOString().replace("Z", "+03:00");
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ok: false, error: "Invalid JSON"}, {status: 400}); }
  const { csv } = body || {};
  if (!csv || typeof csv !== "string") return NextResponse.json({ok: false, error: "csv is required"}, {status: 400});

  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return NextResponse.json({ok: false, error: "CSV must have header and data rows"}, {status: 400});

  const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase().replace(/ /g, '_'));
  const db = getWritableDb();
  let created = 0;

  try {
    const yy = String(new Date().getFullYear()).slice(-2);
    const prefix = `LOT-${yy}-`;
    const last = db.prepare(`SELECT lot_id FROM lots WHERE lot_id LIKE ? ORDER BY lot_id DESC LIMIT 1`).get(`${prefix}%`) as any;
    let nextNum = last?.lot_id ? parseInt(last.lot_id.match(/(\d+)$/)[1], 10) + 1 : 1;
    const now = nowISO();

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map((v: string) => v.trim());
      const row: any = {};
      headers.forEach((h: string, idx: number) => { row[h] = vals[idx]; });

      const lotId = `${prefix}${String(nextNum++).padStart(4, "0")}`;
      const coopId = `COOP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const stationId = `STATION-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      db.prepare(`INSERT OR IGNORE INTO coops (coop_id, name, region, created_ts, updated_ts) VALUES (?, ?, ?, ?, ?)`).run(coopId, row.coop_name || "Unknown", row.region || "Unknown", now, now);
      db.prepare(`INSERT OR IGNORE INTO washing_stations (station_id, coop_id, name, region, created_ts, updated_ts) VALUES (?, ?, ?, ?, ?, ?)`).run(stationId, coopId, row.washing_station_name || "Unknown", row.region || "Unknown", now, now);

      db.prepare(`
        INSERT INTO lots (lot_id, station_id, coop_id, organization_id, region, washing_station_name, coop_name, process, screen_size, cupping_score, stock_bags_remaining, crop_year, certifications, bag_size_kg, eudr_data_status, reserved_for_forward_program, status, last_updated_ts, created_ts, updated_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'No', 'active', ?, ?, ?)
      `).run(lotId, stationId, coopId, orgId, row.region || "Unknown", row.washing_station_name || "Unknown", row.coop_name || "Unknown", row.process || "Washed", Number(row.screen_size) || 14, Number(row.cupping_score) || 85, Number(row.stock_bags_remaining) || 0, row.crop_year || "25/26", row.certifications || null, 60, row.eudr_data_status || "missing", now, now, now);
      created++;
    }
    return NextResponse.json({ok: true, created});
  } finally { db.close(); }
}
'@
Set-Content $file2 $content2 -NoNewline
Write-Host "[2/5] Created inventory upload endpoint" -ForegroundColor Green

# Fix 3: Update InventoryPage to use apiFetch
$file3 = Join-Path $repoPath "src\components\pages\InventoryPage.tsx"
$content3 = Get-Content $file3 -Raw
$oldPattern3 = @'
  const handleUpload = () => {
    setUploading(true);
    setUploadResult(null);
    fetch("/api/inventory/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
    })
'@
$newPattern3 = @'
  const handleUpload = () => {
    setUploading(true);
    setUploadResult(null);
    apiFetch("/api/inventory/upload", {
      method: "POST",
      body: JSON.stringify({ csv: csvText }),
    })
'@
$content3 = $content3.Replace($oldPattern3, $newPattern3)
Set-Content $file3 $content3 -NoNewline
Write-Host "[3/5] Fixed InventoryPage to use apiFetch" -ForegroundColor Green

Write-Host ""
Write-Host "Basic fixes applied! Now applying complex fixes..." -ForegroundColor Yellow
Write-Host ""

# Fix 4: Update Inbox API route
$file4 = Join-Path $repoPath "src\app\api\inbox\route.ts"
$content4 = Get-Content $file4 -Raw

# Add threadId to conversations
$oldConv = @'
        conversations.push({
          id: i + 1, // 1-based ID for frontend compatibility
          buyer: buyerPart,
'@
$newConv = @'
        conversations.push({
          id: i + 1, // 1-based ID for frontend compatibility
          threadId: t.thread_id, // ADD THIS for frontend to fetch specific thread
          buyer: buyerPart,
'@
$content4 = $content4.Replace($oldConv, $newConv)

# Add threadId query param parsing
$oldGetStart = @'
export async function GET(request: NextRequest) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  try {
    const db = getReadonlyDb();

    try {
'@
$newGetStart = @'
export async function GET(request: NextRequest) {
  // Auth — every GET route requires a valid session
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  const { searchParams } = new URL(request.url);
  const threadIdFilter = searchParams.get("threadId");

  try {
    const db = getReadonlyDb();

    try {
'@
$content4 = $content4.Replace($oldGetStart, $newGetStart)

# Update return to support threadId filter
$oldReturn = @'
      return NextResponse.json({
        ok: true,
        count: conversations.length,
        conversations,
        // Return messages of the FIRST thread (the frontend shows messages[] statically,
        // matching the original mock-data behavior)
        messages: messagesByThread[threads[0].thread_id] || [],
      });
'@
$newReturn = @'
      // If a specific threadId is requested, return only that thread's messages
      if (threadIdFilter && messagesByThread[threadIdFilter]) {
        return NextResponse.json({
          ok: true,
          count: conversations.length,
          conversations,
          messages: messagesByThread[threadIdFilter],
        });
      }

      return NextResponse.json({
        ok: true,
        count: conversations.length,
        conversations,
        // Default: return messages of the FIRST thread (backward compat)
        messages: threads.length > 0 ? (messagesByThread[threads[0].thread_id] || []) : [],
      });
'@
$content4 = $content4.Replace($oldReturn, $newReturn)

# Add POST handler at end of file
$postHandler = @'

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ok: false, error: "Invalid JSON"}, {status: 400}); }
  const { threadId, bodyText, subject } = body || {};
  if (!threadId || !bodyText) return NextResponse.json({ok: false, error: "threadId and bodyText required"}, {status: 400});

  const db = getWritableDb();
  try {
    // Strict IDOR check - verify thread belongs to this organization
    const thread = db.prepare(`
      SELECT t.thread_id, t.buyer_email, t.subject, t.inbox_id, ei.masked_email
      FROM message_threads t LEFT JOIN exporter_inboxes ei ON t.inbox_id = ei.id
      WHERE t.thread_id = ? AND t.organization_id = ?
    `).get(threadId, orgId) as any;

    if (!thread) return NextResponse.json({ok: false, error: "Thread not found"}, {status: 404});

    const now = new Date().toISOString().replace("Z", "+03:00");
    db.prepare(`
      INSERT INTO inbox_messages (thread_id, direction, from_addr, to_addr, subject, body_text, sent_ts, created_ts, updated_ts, organization_id, ai_processed, status)
      VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'sent')
    `).run(threadId, thread.masked_email || "exporter@faithelexport.com", thread.buyer_email, subject || thread.subject, bodyText, now, now, now, orgId);

    db.prepare(`
      UPDATE message_threads SET last_message_ts = ?, last_message_direction = 'outbound', message_count = message_count + 1, unread_count = 0, updated_ts = ? WHERE thread_id = ?
    `).run(now, now, threadId);

    return NextResponse.json({ok: true, sent: true});
  } finally { db.close(); }
}
'@
if ($content4 -notmatch "export async function POST") {
    $content4 = $content4.TrimEnd() + "`n" + $postHandler
}

Set-Content $file4 $content4 -NoNewline
Write-Host "[4/5] Fixed Inbox API route (added POST + threadId support)" -ForegroundColor Green

# Fix 5: Update InboxPage
$file5 = Join-Path $repoPath "src\components\pages\InboxPage.tsx"
$content5 = Get-Content $file5 -Raw

# Fix Send button
$oldSend = @'
                    <button
                      onClick={() => setReplyText("")}
                      className="rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" /> Send
                    </button>
'@
$newSend = @'
                    <button
                      onClick={() => {
                        if (!replyText.trim() || !conversations) return;
                        const conv = conversations.find(c => c.id === selectedConv);
                        if (!conv || !conv.threadId) return;

                        apiFetch("/api/inbox", {
                          method: "POST",
                          body: JSON.stringify({ threadId: conv.threadId, bodyText: replyText.trim() }),
                        }).then((r) => r.json()).then((data) => {
                          if (data.ok) {
                            setReplyText("");
                            apiFetch(`/api/inbox?threadId=${conv.threadId}`).then(r => r.json()).then(d => { if (d.ok) setMessages(d.messages); });
                          }
                        });
                      }}
                      className="rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors flex items-center gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" /> Send
                    </button>
'@
$content5 = $content5.Replace($oldSend, $newSend)

# Add useEffect for dynamic message fetching
$loadingStatePattern = '  // Loading state'
$useEffectToAdd = @'

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!conversations || selectedConv === null) return;
    const conv = conversations.find(c => c.id === selectedConv);
    if (!conv || !conv.threadId) return;

    let cancelled = false;
    apiFetch(`/api/inbox?threadId=${conv.threadId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.ok) setMessages(data.messages); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedConv, conversations]);

  // Loading state
'@
if ($content5 -notmatch "Fetch messages for selected conversation") {
    $content5 = $content5.Replace($loadingStatePattern, $useEffectToAdd)
}

Set-Content $file5 $content5 -NoNewline
Write-Host "[5/5] Fixed InboxPage (Send button + dynamic message fetching)" -ForegroundColor Green

Write-Host ""
Write-Host "All fixes applied successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run: git add ."
Write-Host "2. Run: git commit -m `"Fix API robustness + two-way email + CSV upload`""
Write-Host "3. Run: git push origin main"
Write-Host ""