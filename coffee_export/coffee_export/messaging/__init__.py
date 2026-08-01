"""
Internal Messaging Gateway package.

Masks exporter identity from buyers:
    Buyer email <-> marcus.bell@faithelexport.com <-> Exporter Dashboard

Public API:
    EmailGateway            - main orchestrator (send / receive / reply)
    ResendEmailProvider     - outbound + inbound signature verification
    MessageAIProcessor      - GLM-powered classify / summarize / translate / extract
"""

from coffee_export.messaging.ai_processor import MessageAIProcessor
from coffee_export.messaging.gateway import EmailGateway
from coffee_export.messaging.providers.resend import ResendEmailProvider

__all__ = [
    "EmailGateway",
    "MessageAIProcessor",
    "ResendEmailProvider",
]
