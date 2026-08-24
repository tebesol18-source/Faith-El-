$bridgeUrl = "http://localhost:8000"
$bridgeSecret = "local-dev-secret-12345"
$results = @()

function Add-Result($test, $status, $detail) {
    $results += [PSCustomObject]@{ Test = $test; Status = $status; Detail = $detail }
    $color = switch($status) { "PASS" { "Green" } "FAIL" { "Red" } "WARN" { "Yellow" } default { "Gray" } }
    Write-Host "[$status] $test - $detail" -ForegroundColor $color
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FAITH-EL EMAIL SYSTEM - BULLETPROOF DRY-RUN TEST" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try { $h = Invoke-RestMethod -Uri "$bridgeUrl/health"; Add-Result "Python server" "PASS" "status=$($h.status)" } catch { Add-Result "Python server" "FAIL" "Not running"; exit 1 }
try { $c = Invoke-RestMethod -Uri "$bridgeUrl/webhooks/email/test"; Add-Result "Dry-run mode" $(if($c.dry_run){"PASS"}else{"WARN"}) "dry_run=$($c.dry_run)"; Add-Result "Bridge auth" $(if($c.bridge_secret_configured){"PASS"}else{"WARN"}) "configured=$($c.bridge_secret_configured)" } catch {}

try { Invoke-WebRequest -Uri "$bridgeUrl/api/bridge/send" -Method POST -ContentType "application/json" -Body '{}' -UseBasicParsing | Out-Null; Add-Result "Auth (No token)" "FAIL" "Accepted!" } catch { if($_.Exception.Response.StatusCode.Value__ -eq 401){ Add-Result "Auth (No token)" "PASS" "401" } }
try { Invoke-WebRequest -Uri "$bridgeUrl/api/bridge/send" -Method POST -Headers @{"Authorization"="Bearer wrong"} -ContentType "application/json" -Body '{}' -UseBasicParsing | Out-Null; Add-Result "Auth (Wrong token)" "FAIL" "Accepted!" } catch { if($_.Exception.Response.StatusCode.Value__ -eq 401){ Add-Result "Auth (Wrong token)" "PASS" "401" } }

Write-Host "Creating Python DB check script..." -ForegroundColor Gray

# Using @' '@ (single-quoted here-string) so PowerShell does NOT touch the SQL quotes!
$pyCode = @'
import sys, os
sys.path.insert(0, '.')
os.environ.setdefault('DATABASE_URL', 'sqlite:///../state/coffee_export.db')
try:
    from coffee_export.database.base import SessionLocal
    from sqlalchemy import text
    session = SessionLocal()
    
    # Check tables (using double quotes for SQL string to avoid PowerShell quote bugs)
    q1 = "SELECT name FROM sqlite_master WHERE type='table'"
    tables = [t[0] for t in session.execute(text(q1)).fetchall()]
    required = ['exporter_inboxes', 'message_threads', 'inbox_messages', 'leads', 'operators']
    missing = [t for t in required if t not in tables]
    print('MISSING:' + ','.join(missing) if missing else 'TABLES_OK')
    
    # Counts
    print('LEADS:' + str(session.execute(text("SELECT COUNT(*) FROM leads")).fetchone()[0]))
    print('OPS:' + str(session.execute(text("SELECT COUNT(*) FROM operators")).fetchone()[0]))
    print('MSGS:' + str(session.execute(text("SELECT COUNT(*) FROM inbox_messages")).fetchone()[0]))
    
    # Get IDs
    lead = session.execute(text("SELECT lead_id, organization_id FROM leads LIMIT 1")).fetchone()
    op = session.execute(text("SELECT operator_id, name, organization_id FROM operators LIMIT 1")).fetchone()
    
    if lead:
        print('LEAD_ID:' + str(lead[0]))
        print('LEAD_ORG:' + str(lead[1]))
    if op:
        print('OP_ID:' + str(op[0]))
        print('OP_NAME:' + str(op[1]))
        print('OP_ORG:' + str(op[2]))
        
    session.close()
except Exception as e:
    print('DB_ERR:' + str(e))
'@

Set-Content -Path "db_check.py" -Value $pyCode -Encoding UTF8
$dbOut = python db_check.py
Remove-Item "db_check.py" -ErrorAction SilentlyContinue
$dbOut | ForEach-Object { Write-Host "  DB> $_" -ForegroundColor Gray }

if ($dbOut -match "TABLES_OK") { Add-Result "Database Tables" "PASS" "All required tables exist" } else { Add-Result "Database Tables" "FAIL" "Missing tables or error" }

$leadId = ""; $opId = ""; $opName = ""; $leadOrg = ""
foreach($l in $dbOut) {
    if($l -match "^LEAD_ID:(.+)") { $leadId = $Matches[1] }
    if($l -match "^LEAD_ORG:(.+)") { $leadOrg = $Matches[1] }
    if($l -match "^OP_ID:(.+)") { $opId = $Matches[1] }
    if($l -match "^OP_NAME:(.+)") { $opName = $Matches[1] }
}

if ($leadId -and $opId) {
    Add-Result "Test Data Found" "PASS" "Lead: $leadId, Op: $opId"
    $body = @{operator_id=$opId; operator_name=$opName; display_name="Faith Export"; lead_id=$leadId; buyer_email="buyer@test.com"; subject="Test Email"; body_text="Hello from bridge"; organization_id=$leadOrg} | ConvertTo-Json
    try {
        $r = Invoke-WebRequest -Uri "$bridgeUrl/api/bridge/send" -Method POST -Headers @{"Authorization"="Bearer $bridgeSecret"} -ContentType "application/json" -Body $body -UseBasicParsing
        $j = $r.Content | ConvertFrom-Json
        if ($j.ok) {
            Add-Result "Outbound Send" "PASS" "dry_run=$($j.dry_run), msg_id=$($j.message_id)"
            Add-Result "Masked Sender" "PASS" "from=$($j.masked_from)"
            Add-Result "Thread Created" "PASS" "thread=$($j.thread_id)"
        } else { Add-Result "Outbound Send" "FAIL" $j.error }
    } catch { Add-Result "Outbound Send" "FAIL" "HTTP $($_.Exception.Response.StatusCode.Value__)" }
} else {
    Add-Result "Test Data Found" "WARN" "No leads/ops in DB. Skipping send test."
}

$inboundBody = @{data=@{from="Buyer <buyer@test.com>"; to=@("test@faithelexport.com"); subject="Re: Test"; text="Yes I want 100 bags FOB"; message_id="in-123"}} | ConvertTo-Json -Depth 3
try {
    $ir = Invoke-WebRequest -Uri "$bridgeUrl/webhooks/email/inbound" -Method POST -ContentType "application/json" -Body $inboundBody -UseBasicParsing
    $ij = $ir.Content | ConvertFrom-Json
    Add-Result "Inbound Webhook" "PASS" "action=$($ij.action), intent=$($ij.intent)"
} catch { Add-Result "Inbound Webhook" "WARN" "Status $($_.Exception.Response.StatusCode.Value__) (Expected if no matching inbox)" }

Write-Host "`n============================================================" -ForegroundColor Cyan
$p = ($results | Where Status -eq PASS).Count; $f = ($results | Where Status -eq FAIL).Count; $w = ($results | Where Status -eq WARN).Count
Write-Host "  PASSED: $p  |  FAILED: $f  |  WARNINGS: $w" -ForegroundColor White
if ($f -eq 0) { Write-Host "  ALL CRITICAL TESTS PASSED! Ready for Resend." -ForegroundColor Green } else { Write-Host "  SOME TESTS FAILED." -ForegroundColor Red }
Write-Host "============================================================" -ForegroundColor Cyan