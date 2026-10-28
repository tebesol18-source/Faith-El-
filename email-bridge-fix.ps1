Write-Host "Applying Faith-El Email Bridge Integration..." -ForegroundColor Cyan

# -------------------------------
# 1. Patch Python webhook.py
# -------------------------------

$webhookPath = "coffee_export\coffee_export\messaging\webhook.py"

if (!(Test-Path $webhookPath)) {
  Write-Host "ERROR: Cannot find $webhookPath" -ForegroundColor Red
  exit 1
}

$webhook = Get-Content $webhookPath -Raw

# Add imports if missing
if ($webhook -notmatch "from pydantic import BaseModel") {
  $webhook = $webhook -replace "from typing import Any", "from typing import Any`nimport hmac`nfrom pydantic import BaseModel"
}

# Add Bridge models before create_inbound_app
if ($webhook -notmatch "class BridgeSendRequest") {
  $models = @'

class BridgeSendRequest(BaseModel):
    """Request body for POST /api/bridge/send"""
    operator_id: str
    operator_name: str | None = None
    display_name: str
    lead_id: str
    buyer_email: str
    subject: str
    body_text: str
    body_html: str | None = None
    organization_id: str | None = None  # Audit only; never trusted for auth


class BridgeReplyRequest(BaseModel):
    """Request body for POST /api/bridge/reply"""
    message_id: int
    body_text: str
    body_html: str | None = None
    operator_id: str | None = None
    organization_id: str | None = None  # Audit only; never trusted for auth

'@

  $webhook = $webhook -replace "def create_inbound_app", "$models`ndef create_inbound_app"
}

# Add bridge auth helper after _get_gateway
if ($webhook -notmatch "def _verify_bridge_token") {
  $helper = @'

    def _verify_bridge_token(authorization: str | None) -> bool:
        """Verify Bearer token for Next.js → Python bridge endpoints."""
        bridge_secret = os.environ.get("EMAIL_BRIDGE_SECRET", "")
        if not bridge_secret:
            log.warning(
                "EMAIL_BRIDGE_SECRET not set - bridge authentication DISABLED. "
                "This is acceptable for local dev only, not production."
            )
            return True

        if not authorization or not authorization.startswith("Bearer "):
            return False

        token = authorization[7:]
        return hmac.compare_digest(token, bridge_secret)
'@

  $webhook = $webhook -replace "(    def _get_gateway\(\).*?        return _gateway)", "`$1$helper"
}

# Add bridge endpoints before @app.get("/webhooks/email/test")
if ($webhook -notmatch '@app.post\("/api/bridge/send"\)') {
  $bridgeEndpoints = @'

    @app.post("/api/bridge/send")
    async def bridge_send(
        req: BridgeSendRequest,
        authorization: str | None = Header(None),
    ) -> JSONResponse:
        """
        Authenticated bridge endpoint used by Next.js to send outbound email.

        This reuses the existing EmailGateway.send() flow:
        - masked sender address
        - get-or-create exporter inbox
        - get-or-create thread
        - Resend provider send
        - DB message logging
        - event publishing
        """
        if not _verify_bridge_token(authorization):
            raise HTTPException(status_code=401, detail="invalid or missing bearer token")

        gw = _get_gateway()

        try:
            result = gw.send(
                operator_id=req.operator_id,
                display_name=req.display_name,
                lead_id=req.lead_id,
                buyer_email=req.buyer_email,
                subject=req.subject,
                body_text=req.body_text,
                body_html=req.body_html,
                operator_name=req.operator_name,
            )
        except Exception as exc:
            log.exception(f"Bridge send failed: {exc}")
            return JSONResponse(
                status_code=500,
                content={
                    "ok": False,
                    "action": "send_failed",
                    "error": f"email gateway error: {str(exc)}",
                },
            )

        if result.get("action") == "sent":
            return JSONResponse(
                status_code=200,
                content={
                    "ok": True,
                    "action": "sent",
                    "message_id": result.get("message_id"),
                    "thread_id": result.get("thread_id"),
                    "masked_from": result.get("masked_from"),
                    "provider_message_id": result.get("provider_message_id"),
                    "dry_run": result.get("dry_run", False),
                },
            )

        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "action": result.get("action", "send_failed"),
                "error": result.get("error", "unknown email send failure"),
                "dry_run": result.get("dry_run", False),
            },
        )


    @app.post("/api/bridge/reply")
    async def bridge_reply(
        req: BridgeReplyRequest,
        authorization: str | None = Header(None),
    ) -> JSONResponse:
        """
        Authenticated bridge endpoint used by Next.js to reply through EmailGateway.reply().
        """
        if not _verify_bridge_token(authorization):
            raise HTTPException(status_code=401, detail="invalid or missing bearer token")

        gw = _get_gateway()

        try:
            result = gw.reply(
                message_id=req.message_id,
                body_text=req.body_text,
                body_html=req.body_html,
                operator_id=req.operator_id,
            )
        except Exception as exc:
            log.exception(f"Bridge reply failed: {exc}")
            return JSONResponse(
                status_code=500,
                content={
                    "ok": False,
                    "action": "reply_failed",
                    "error": f"email gateway error: {str(exc)}",
                },
            )

        if result.get("action") == "replied":
            return JSONResponse(
                status_code=200,
                content={
                    "ok": True,
                    "action": "replied",
                    "outbound_message_id": result.get("outbound_message_id"),
                    "in_reply_to_message_id": result.get("in_reply_to_message_id"),
                    "thread_id": result.get("thread_id"),
                    "dry_run": result.get("dry_run", False),
                },
            )

        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "action": result.get("action", "reply_failed"),
                "error": result.get("error") or result.get("reason", "unknown reply failure"),
                "dry_run": result.get("dry_run", False),
            },
        )

'@

  $webhook = $webhook -replace '    @app.get\("/webhooks/email/test"\)', "$bridgeEndpoints`n    @app.get(`"/webhooks/email/test`")"
}

# Add bridge secret status to test endpoint if missing
if ($webhook -notmatch "bridge_secret_configured") {
  $webhook = $webhook -replace '"webhook_secret_configured": bool\(\s*os\.environ\.get\("RESEND_WEBHOOK_SECRET"\)\s*\),', '"webhook_secret_configured": bool(os.environ.get("RESEND_WEBHOOK_SECRET")),`n            "bridge_secret_configured": bool(os.environ.get("EMAIL_BRIDGE_SECRET")),'
}

Set-Content $webhookPath $webhook -NoNewline
Write-Host "Patched Python webhook bridge endpoints." -ForegroundColor Green


# -------------------------------
# 2. Patch Next.js /api/inbox POST
# -------------------------------

$inboxPath = "src\app\api\inbox\route.ts"

if (!(Test-Path $inboxPath)) {
  Write-Host "ERROR: Cannot find $inboxPath" -ForegroundColor Red
  exit 1
}

$inbox = Get-Content $inboxPath -Raw

$oldPostStart = $inbox.IndexOf("export async function POST")
if ($oldPostStart -lt 0) {
  Write-Host "ERROR: Could not find POST handler in $inboxPath" -ForegroundColor Red
  exit 1
}

# Keep everything before POST and replace POST handler
$beforePost = $inbox.Substring(0, $oldPostStart)

$newPost = @'
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;
  const orgId = auth.user.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { threadId, bodyText, subject } = body || {};
  if (!threadId || !bodyText) {
    return NextResponse.json(
      { ok: false, error: "threadId and bodyText required" },
      { status: 400 }
    );
  }

  const db = getWritableDb();

  try {
    // Strict IDOR protection:
    // The thread must belong to the authenticated user's organization.
    // The client is never allowed to supply or override organization_id.
    const thread = db.prepare(`
      SELECT
        t.thread_id,
        t.lead_id,
        t.buyer_email,
        t.subject,
        t.inbox_id,
        ei.masked_email,
        ei.display_name,
        ei.operator_id AS inbox_operator_id
      FROM message_threads t
      LEFT JOIN exporter_inboxes ei ON t.inbox_id = ei.id
      WHERE t.thread_id = ? AND t.organization_id = ?
    `).get(threadId, orgId) as any;

    if (!thread) {
      return NextResponse.json({ ok: false, error: "Thread not found" }, { status: 404 });
    }

    const finalSubject = subject || thread.subject || "(no subject)";
    const bridgeUrl = process.env.EMAIL_BRIDGE_URL || "http://localhost:8000";
    const bridgeSecret = process.env.EMAIL_BRIDGE_SECRET || "";
    const operatorId = thread.inbox_operator_id || auth.user.operatorId;

    // Call Python EmailGateway bridge.
    // Do NOT expose bridge secret or Resend credentials to the browser.
    let bridgeResult: any;
    let response: Response;

    try {
      response = await fetch(`${bridgeUrl}/api/bridge/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bridgeSecret ? { Authorization: `Bearer ${bridgeSecret}` } : {}),
        },
        body: JSON.stringify({
          operator_id: operatorId,
          operator_name: null,
          display_name: thread.display_name || "Faith Export",
          lead_id: thread.lead_id,
          buyer_email: thread.buyer_email,
          subject: finalSubject,
          body_text: bodyText,
          organization_id: orgId, // Audit only; Python must not trust this for auth.
        }),
      });

      bridgeResult = await response.json();
    } catch (error: any) {
      console.error("[/api/inbox POST] Python email bridge unreachable:", error);
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: "Email service unavailable. Message was not sent.",
        },
        { status: 503 }
      );
    }

    if (!response.ok || !bridgeResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: bridgeResult?.error || "Email gateway failed to send message",
          action: bridgeResult?.action || "send_failed",
          dry_run: bridgeResult?.dry_run || false,
        },
        { status: 502 }
      );
    }

    // Important:
    // We do NOT write a fake message here.
    // Python EmailGateway.send() is responsible for:
    // - Resend delivery or dry-run
    // - masked sender address
    // - thread handling
    // - inbox_messages insert
    // - event publishing
    return NextResponse.json({
      ok: true,
      sent: true,
      action: bridgeResult.action,
      message_id: bridgeResult.message_id,
      thread_id: bridgeResult.thread_id,
      provider_message_id: bridgeResult.provider_message_id,
      dry_run: bridgeResult.dry_run || false,
      masked_from: bridgeResult.masked_from,
    });
  } finally {
    db.close();
  }
}
'@

Set-Content $inboxPath ($beforePost + $newPost) -NoNewline
Write-Host "Patched Next.js /api/inbox POST to call Python EmailGateway bridge." -ForegroundColor Green


# -------------------------------
# 3. Add/update env example
# -------------------------------

$envExamplePath = ".env.example"

if (!(Test-Path $envExamplePath)) {
  New-Item -ItemType File -Path $envExamplePath | Out-Null
}

$envExample = Get-Content $envExamplePath -Raw

if ($envExample -notmatch "EMAIL_BRIDGE_URL") {
  Add-Content $envExample @'

# Python EmailGateway bridge URL.
# Local dev default:
EMAIL_BRIDGE_URL=http://localhost:8000

# Shared secret between Next.js and Python messaging service.
# Generate with: openssl rand -hex 32
EMAIL_BRIDGE_SECRET=

# Resend settings.
# If RESEND_API_KEY is empty, Python EmailGateway stays in dry-run mode.
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
INBOUND_EMAIL_DOMAIN=
'@
}

Write-Host "Updated .env.example." -ForegroundColor Green


# -------------------------------
# 4. Add Python bridge endpoint tests
# -------------------------------

$testPath = "coffee_export\tests\test_bridge_endpoints.py"

$testContent = @'
import os
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from coffee_export.messaging.webhook import create_inbound_app


def test_bridge_send_requires_authentication():
    with patch.dict(os.environ, {"EMAIL_BRIDGE_SECRET": "secret"}):
        client = TestClient(create_inbound_app())

        response = client.post(
            "/api/bridge/send",
            json={
                "operator_id": "op-1",
                "display_name": "Faith Export",
                "lead_id": "L-1",
                "buyer_email": "buyer@example.com",
                "subject": "Hello",
                "body_text": "Body",
            },
        )

        assert response.status_code == 401


def test_bridge_send_calls_email_gateway_with_masked_flow():
    with patch.dict(os.environ, {"EMAIL_BRIDGE_SECRET": "secret"}):
        mock_gateway = MagicMock()
        mock_gateway.send.return_value = {
            "action": "sent",
            "message_id": 123,
            "thread_id": "thread-1",
            "masked_from": "marcus.bell@example.com",
            "provider_message_id": "dry-run-123",
            "dry_run": True,
        }

        client = TestClient(create_inbound_app(gateway=mock_gateway))

        response = client.post(
            "/api/bridge/send",
            headers={"Authorization": "Bearer secret"},
            json={
                "operator_id": "op-1",
                "operator_name": "Marcus Bell",
                "display_name": "Faith Export",
                "lead_id": "L-1",
                "buyer_email": "buyer@example.com",
                "subject": "Hello",
                "body_text": "Body",
                "organization_id": "org-1",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["masked_from"] == "marcus.bell@example.com"
        assert data["dry_run"] is True

        mock_gateway.send.assert_called_once_with(
            operator_id="op-1",
            display_name="Faith Export",
            lead_id="L-1",
            buyer_email="buyer@example.com",
            subject="Hello",
            body_text="Body",
            body_html=None,
            operator_name="Marcus Bell",
        )


def test_bridge_send_failure_is_not_reported_as_sent():
    with patch.dict(os.environ, {"EMAIL_BRIDGE_SECRET": "secret"}):
        mock_gateway = MagicMock()
        mock_gateway.send.return_value = {
            "action": "send_failed",
            "error": "Resend API error",
            "dry_run": False,
        }

        client = TestClient(create_inbound_app(gateway=mock_gateway))

        response = client.post(
            "/api/bridge/send",
            headers={"Authorization": "Bearer secret"},
            json={
                "operator_id": "op-1",
                "display_name": "Faith Export",
                "lead_id": "L-1",
                "buyer_email": "buyer@example.com",
                "subject": "Hello",
                "body_text": "Body",
            },
        )

        assert response.status_code == 502
        data = response.json()
        assert data["ok"] is False
        assert data["action"] == "send_failed"
        assert "Resend API error" in data["error"]


def test_bridge_rejects_bad_token():
    with patch.dict(os.environ, {"EMAIL_BRIDGE_SECRET": "secret"}):
        client = TestClient(create_inbound_app())

        response = client.post(
            "/api/bridge/send",
            headers={"Authorization": "Bearer wrong"},
            json={
                "operator_id": "op-1",
                "display_name": "Faith Export",
                "lead_id": "L-1",
                "buyer_email": "buyer@example.com",
                "subject": "Hello",
                "body_text": "Body",
            },
        )

        assert response.status_code == 401
'@

Set-Content $testPath $testContent -NoNewline
Write-Host "Added Python bridge tests." -ForegroundColor Green


Write-Host ""
Write-Host "Email bridge integration applied." -ForegroundColor Green
Write-Host "Next: run tests, then commit and push." -ForegroundColor Yellow