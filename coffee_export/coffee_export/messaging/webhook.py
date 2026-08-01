"""
FastAPI webhook server for inbound Resend emails.

Run:
    python -m coffee_export.messaging.webhook
    # or
    uvicorn coffee_export.messaging.webhook:app --host 0.0.0.0 --port 8000

Resend should be configured to POST inbound emails to:
    https://your-domain.com/webhooks/email/inbound

The webhook:
  1. Reads the raw body + signature header.
  2. Verifies the signature with RESEND_WEBHOOK_SECRET.
  3. Parses the JSON payload.
  4. Calls EmailGateway.process_inbound() which:
       - looks up the masked inbox
       - finds the matching lead
       - stores the inbound message
       - runs GLM triage (classify / summarize / translate / extract)
       - publishes MESSAGE_RECEIVED + MESSAGE_PROCESSED events
  5. Returns 200 ACK to Resend.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from coffee_export.messaging.gateway import EmailGateway
from coffee_export.utils.logging import get_logger, setup_logging

log = get_logger(__name__)


def create_inbound_app(
    gateway: EmailGateway | None = None,
    async_processing: bool = False,
) -> FastAPI:
    """
    Build the FastAPI app. Allows tests to inject a mock gateway.
    """
    setup_logging()
    app = FastAPI(
        title="Coffee Export - Messaging Gateway Webhook",
        description="Receives inbound buyer emails from Resend and routes them "
        "to the exporter dashboard inbox via GLM-powered triage.",
        version="1.0.0",
    )

    _gateway: EmailGateway | None = gateway

    def _get_gateway() -> EmailGateway:
        nonlocal _gateway
        if _gateway is None:
            _gateway = EmailGateway()
        return _gateway

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "service": "messaging-webhook"}

    @app.post("/webhooks/email/inbound")
    async def email_inbound(
        request: Request,
        svix_signature: str | None = Header(None, alias="svix-signature"),
        resend_signature: str | None = Header(None, alias="resend-signature"),
        x_resend_signature: str | None = Header(None, alias="x-resend-signature"),
    ) -> JSONResponse:
        raw_body = await request.body()
        signature = (
            svix_signature
            or resend_signature
            or x_resend_signature
            or ""
        )

        gw = _get_gateway()

        # 1. Verify signature
        if not gw.provider.verify_webhook_signature(raw_body, signature):
            log.warning(
                f"Inbound webhook signature verification FAILED "
                f"(ip={request.client.host if request.client else '?'})"
            )
            raise HTTPException(status_code=401, detail="invalid signature")

        # 2. Parse JSON
        try:
            payload: dict[str, Any] = await request.json()
        except Exception as exc:
            log.error(f"Failed to parse inbound JSON: {exc}")
            raise HTTPException(status_code=400, detail="invalid JSON") from exc

        # 3. Process (sync or async)
        if async_processing:
            from fastapi import BackgroundTasks

            async def _process_in_bg(p: dict[str, Any]) -> None:
                try:
                    gw.process_inbound(p)
                except Exception as exc:  # noqa: BLE001
                    log.exception(f"Async inbound processing failed: {exc}")

            bg = BackgroundTasks()
            bg.add_task(_process_in_bg, payload)
            return JSONResponse(
                status_code=200,
                content={"status": "queued"},
                background=bg,
            )

        # Synchronous (dev / single-process)
        try:
            result = gw.process_inbound(payload)
        except Exception as exc:  # noqa: BLE001
            log.exception(f"Inbound processing failed: {exc}")
            raise HTTPException(status_code=500, detail="processing failed") from exc

        status_code = 200 if result.get("action") == "received" else 202
        return JSONResponse(status_code=status_code, content=result)

    @app.get("/webhooks/email/test")
    async def test_endpoint() -> dict[str, Any]:
        gw = _get_gateway()
        return {
            "provider": gw.provider.name,
            "inbound_domain": gw.inbound_domain,
            "dry_run": gw.provider.dry_run,
            "webhook_secret_configured": bool(
                os.environ.get("RESEND_WEBHOOK_SECRET")
            ),
        }

    return app


app = create_inbound_app()


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("WEBHOOK_PORT", "8000"))
    host = os.environ.get("WEBHOOK_HOST", "0.0.0.0")
    log.info(f"Starting messaging webhook on {host}:{port}")
    uvicorn.run(
        "coffee_export.messaging.webhook:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )
