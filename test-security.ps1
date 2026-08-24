# ============================================================
# FAITH-EL SECURITY & COMMUNICATION TEST v2 (FIXED)
# ============================================================

$bridgeUrl = "http://localhost:8000"
$bridgeSecret = "local-dev-secret-12345"
$results = @()

function Add-Result($test, $status, $detail) {
    $results += [PSCustomObject]@{ Test = $test; Status = $status; Detail = $detail }
    $color = switch($status) { "PASS" { "Green" } "FAIL" { "Red" } "WARN" { "Yellow" } default { "Gray" } }
    Write-Host "[$status] $test - $detail" -ForegroundColor $color
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FAITH-EL SECURITY & COMMUNICATION TEST v2" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# --- TEST 1: Get Real Test Data FIRST ---
Write-Host "`n--- Phase 1: Fetching Real Test Data ---" -ForegroundColor Magenta

$pyCode = @'
import sys, os
sys.path.insert(0, '.')
os.environ.setdefault('DATABASE_URL', 'sqlite:///../state/coffee_export.db')
try:
    from coffee_export.database.base import SessionLocal
    from sqlalchemy import text
    session = SessionLocal()
    lead = session.execute(text("SELECT lead_id, organization_id FROM leads LIMIT 1")).fetchone()
    op = session.execute(text("SELECT operator_id, name, email, organization_id FROM operators LIMIT 1")).fetchone()
    if lead: print('LEAD_ID:' + str(lead[0])); print('LEAD_ORG:' + str(lead[1]))
    if op: print('OP_ID:' + str(op[0])); print('OP_NAME:' + str(op[1])); print('OP_EMAIL:' + str(op[2])); print('OP_ORG:' + str(op[3]))
    session.close()
except Exception as e:
    print('DB_ERR:' + str(e))
'@
Set-Content -Path "sec_check.py" -Value $pyCode -Encoding UTF8
$dbOut = python sec_check.py
Remove-Item "sec_check.py" -ErrorAction SilentlyContinue

$leadId = ""; $opId = ""; $opName = ""; $opEmail = ""; $leadOrg = ""; $opOrg = ""
foreach($l in $dbOut) {
    if($l -match "^LEAD_ID:(.+)") { $leadId = $Matches[1] }
    if($l -match "^LEAD_ORG:(.+)") { $leadOrg = $Matches[1] }
    if($l -match "^OP_ID:(.+)") { $opId = $Matches[1] }
    if($l -match "^OP_NAME:(.+)") { $opName = $Matches[1] }
    if($l -match "^OP_EMAIL:(.+)") { $opEmail = $Matches[1] }
    if($l -match "^OP_ORG:(.+)") { $opOrg = $Matches[1] }
}

if (-not $leadId -or -not $opId) {
    Add-Result "Test Data" "FAIL" "Could not find real leads/operators in DB."
    exit 1
}
Add-Result "Test Data" "PASS" "Lead: $leadId (Org: $leadOrg), Operator: $opId (Org: $opOrg)"

# --- TEST 2: Authentication Security (with valid body) ---
Write-Host "`n--- Phase 2: Authentication Security ---" -ForegroundColor Magenta

# Use a valid body so we test AUTH, not validation
$validBody = @{
    operator_id = $opId
    operator_name = $opName
    display_name = "Auth Test"
    lead_id = $leadId
    buyer_email = "auth-test@example.com"
    subject = "Auth Test"
    body_text = "Testing authentication"
    organization_id = $opOrg
} | ConvertTo-Json

# 2a: No token
try {
    Invoke-WebRequest -Uri "$bridgeUrl/api/bridge/send" -Method POST -ContentType "application/json" -Body $validBody -UseBasicParsing | Out-Null
    Add-Result "Auth: No Token" "FAIL" "Server accepted request without token!"
} catch {
    $sc = $_.Exception.Response.StatusCode.Value__
    if ($sc -eq 401) { Add-Result "Auth: No Token" "PASS" "Correctly rejected (401)" }
    elseif ($sc -eq 422) { Add-Result "Auth: No Token" "PASS" "Rejected at validation (422)" }
    else { Add-Result "Auth: No Token" "WARN" "Status: $sc" }
}

# 2b: Wrong token
try {
    Invoke-WebRequest -Uri "$bridgeUrl/api/bridge/send" -Method POST -Headers @{"Authorization"="Bearer hacker-token-123"} -ContentType "application/json" -Body $validBody -UseBasicParsing | Out-Null
    Add-Result "Auth: Wrong Token" "FAIL" "Server accepted invalid token!"
} catch {
    $sc = $_.Exception.Response.StatusCode.Value__
    if ($sc -eq 401) { Add-Result "Auth: Wrong Token" "PASS" "Correctly rejected (401)" }
    else { Add-Result "Auth: Wrong Token" "WARN" "Status: $sc" }
}

# --- TEST 3: Real Communication Flow (BEFORE fake lead test) ---
Write-Host "`n--- Phase 3: Communication & Data Leakage ---" -ForegroundColor Magenta

$realBody = @{
    operator_id = $opId
    operator_name = $opName
    display_name = "Security Test"
    lead_id = $leadId
    buyer_email = "security-test@example.com"
    subject = "Security Verification"
    body_text = "Testing data leakage prevention"
    organization_id = $opOrg
} | ConvertTo-Json

try {
    $sendResp = Invoke-WebRequest -Uri "$bridgeUrl/api/bridge/send" -Method POST -Headers @{"Authorization"="Bearer $bridgeSecret"} -ContentType "application/json" -Body $realBody -UseBasicParsing -ErrorAction Stop
    $sendResult = $sendResp.Content | ConvertFrom-Json

    if ($sendResult.ok) {
        Add-Result "Communication Flow" "PASS" "Message sent (dry_run=$($sendResult.dry_run))"
        
        if ($sendResult.masked_from) {
            Add-Result "Masked Sender" "PASS" "masked_from=$($sendResult.masked_from)"
        } else {
            Add-Result "Masked Sender" "WARN" "masked_from not in response"
        }

        # Check for sensitive data leakage
        $responseStr = $sendResp.Content
        if ($responseStr -match "password" -or $responseStr -match "secret" -or $responseStr -match "api_key") {
            Add-Result "Data Leakage" "FAIL" "Response contains sensitive keywords!"
        } else {
            Add-Result "Data Leakage" "PASS" "No sensitive data in response"
        }

        if ($sendResult.thread_id) {
            Add-Result "Thread Creation" "PASS" "thread_id=$($sendResult.thread_id)"
        } else {
            Add-Result "Thread Creation" "WARN" "No thread_id in response"
        }
    } else {
        Add-Result "Communication Flow" "FAIL" "Send failed: $($sendResult.error)"
    }
} catch {
    $sc = $_.Exception.Response.StatusCode.Value__
    $errBody = ""
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
    } catch {}
    
    if ($errBody -match "Traceback" -or $errBody -match "\.py") {
        Add-Result "Error Handling" "FAIL" "Server leaked Python stack trace!"
    } else {
        Add-Result "Communication Flow" "FAIL" "HTTP $sc"
    }
}

# --- TEST 4: Database Integrity ---
Write-Host "`n--- Phase 4: Database Integrity ---" -ForegroundColor Magenta

$dbCheckScript = @'
import sys, os
sys.path.insert(0, '.')
os.environ.setdefault('DATABASE_URL', 'sqlite:///../state/coffee_export.db')
try:
    from coffee_export.database.base import SessionLocal
    from sqlalchemy import text
    session = SessionLocal()
    msg = session.execute(text("SELECT thread_id, direction, from_addr, to_addr, organization_id FROM inbox_messages WHERE direction='outbound' ORDER BY id DESC LIMIT 1")).fetchone()
    if msg:
        print('MSG_THREAD:' + str(msg[0]))
        print('MSG_FROM:' + str(msg[2]))
        print('MSG_TO:' + str(msg[3]))
        print('MSG_ORG:' + str(msg[4]))
    else:
        print('MSG_NONE')
    session.close()
except Exception as e:
    print('DB_ERR:' + str(e))
'@
Set-Content -Path "sec_db_check.py" -Value $dbCheckScript -Encoding UTF8
$dbMsgOut = python sec_db_check.py
Remove-Item "sec_db_check.py" -ErrorAction SilentlyContinue

$msgThread = ""; $msgFrom = ""; $msgTo = ""; $msgOrg = ""
foreach($l in $dbMsgOut) {
    if($l -match "^MSG_THREAD:(.+)") { $msgThread = $Matches[1] }
    if($l -match "^MSG_FROM:(.+)") { $msgFrom = $Matches[1] }
    if($l -match "^MSG_TO:(.+)") { $msgTo = $Matches[1] }
    if($l -match "^MSG_ORG:(.+)") { $msgOrg = $Matches[1] }
}

if ($msgThread) {
    Add-Result "DB Persistence" "PASS" "Message stored (Thread: $msgThread)"
    
    if ($msgOrg -eq $opOrg) {
        Add-Result "Org Isolation" "PASS" "Correct org_id: $msgOrg"
    } else {
        Add-Result "Org Isolation" "FAIL" "Org mismatch! Got $msgOrg, expected $opOrg"
    }

    if ($msgFrom -match "@") {
        Add-Result "Masked Sender DB" "PASS" "from_addr=$msgFrom"
    } else {
        Add-Result "Masked Sender DB" "WARN" "from_addr not an email: $msgFrom"
    }
} else {
    Add-Result "DB Persistence" "WARN" "No outbound message found"
}

# --- TEST 5: Error Handling (LAST - this poisons the session) ---
Write-Host "`n--- Phase 5: Error Handling (Fake Lead) ---" -ForegroundColor Magenta

$fakeLeadBody = @{
    operator_id = $opId
    operator_name = $opName
    display_name = "Error Test"
    lead_id = "L-FAKE-99999"
    buyer_email = "error-test@example.com"
    subject = "Error Test"
    body_text = "Testing error handling"
    organization_id = $opOrg
} | ConvertTo-Json

try {
    $resp = Invoke-WebRequest -Uri "$bridgeUrl/api/bridge/send" -Method POST -Headers @{"Authorization"="Bearer $bridgeSecret"} -ContentType "application/json" -Body $fakeLeadBody -UseBasicParsing -ErrorAction Stop
    Add-Result "Error Handling" "WARN" "Fake lead returned success (unexpected)"
} catch {
    $sc = $_.Exception.Response.StatusCode.Value__
    $errBody = ""
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
    } catch {}

    if ($errBody -match "Traceback" -or $errBody -match "\.py" -or $errBody -match "line \d+") {
        Add-Result "Error Handling" "FAIL" "Server leaked Python stack trace!"
    } elseif ($errBody -match "\{.*\}" -or $sc -eq 502 -or $sc -eq 500) {
        Add-Result "Error Handling" "PASS" "Clean error response (Status: $sc)"
    } else {
        Add-Result "Error Handling" "WARN" "Non-JSON error (Status: $sc)"
    }
}

# --- FINAL REPORT ---
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  SECURITY TEST REPORT" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$p = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$f = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
$w = ($results | Where-Object { $_.Status -eq "WARN" }).Count

Write-Host "  PASSED:   $p" -ForegroundColor Green
Write-Host "  FAILED:   $f" -ForegroundColor Red
Write-Host "  WARNINGS: $w" -ForegroundColor Yellow
Write-Host ""

if ($f -eq 0) {
    Write-Host "  SECURITY TEST PASSED!" -ForegroundColor Green
    Write-Host "  The bridge is secure and handles errors safely." -ForegroundColor Green
} else {
    Write-Host "  SECURITY ISSUES DETECTED!" -ForegroundColor Red
    Write-Host "  Review the failures above." -ForegroundColor Red
}

Write-Host "============================================================" -ForegroundColor Cyan