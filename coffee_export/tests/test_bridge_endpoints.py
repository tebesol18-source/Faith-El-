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