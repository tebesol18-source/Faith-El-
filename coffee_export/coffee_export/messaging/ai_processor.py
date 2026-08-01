"""
MessageAIProcessor - GLM-powered inbound email triage for the messaging gateway.

Every inbound email from a buyer runs through ONE combined GLM call that:

    1. CLASSIFIES  - what kind of reply is this?
                     positive | negative | question | objection |
                     meeting_request | out_of_office | auto_reply

    2. SUMMARIZES  - 1-2 sentence English summary of the body.

    3. TRANSLATES  - if the buyer wrote in a non-English language, return
                     an English translation. (If already English, returns "".)

    4. EXTRACTS    - structured CRM fields from the buyer's reply:
                     intent, volume_bags, origin, grade, destination,
                     incoterm, urgency, next_action

The structured extraction is the killer feature: GLM doesn't just label
the email, it parses it into fields the exporter can act on directly
("Send Sample", "Quote 320 bags FOB Hamburg", etc.).

The processor uses the existing AIGateway (so it inherits provider fallback,
caching, rate-limiting, and cost tracking). Falls back gracefully to
"classification=question" + raw body as summary + empty extracted_data
if GLM is unavailable.

Architecture: depends on AIGateway + StateManager only. No direct DB access.
"""

from __future__ import annotations

import json
import re
from typing import Any

from coffee_export.ai.gateway import AIGateway
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


VALID_CLASSIFICATIONS = frozenset(
    {
        "positive",
        "negative",
        "question",
        "objection",
        "meeting_request",
        "out_of_office",
        "auto_reply",
    }
)


VALID_INTENTS = frozenset(
    {
        "sample_request",
        "pricing_question",
        "logistics_question",
        "meeting_request",
        "objection",
        "complaint",
        "confirmation",
        "out_of_office",
        "auto_reply",
        "other",
    }
)


VALID_URGENCIES = frozenset({"High", "Medium", "Low"})


SYSTEM_PROMPT = (
    "You are an assistant that triages inbound emails for an Ethiopian coffee "
    "export sales team. You always return STRICT JSON with the keys: "
    "classification, summary, translation, language_detected, intent, "
    "volume_bags, origin, grade, destination, incoterm, urgency, next_action. "
    "No markdown, no commentary."
)


USER_PROMPT_TEMPLATE = """Analyze this inbound buyer email and return strict JSON.

Subject: {subject}
From: {from_addr}
Body:
---
{body}
---

Return a JSON object with EXACTLY these keys:

{{
  "classification": one of "positive", "negative", "question", "objection",
                    "meeting_request", "out_of_office", "auto_reply",
  "summary": 1-2 sentence English summary of the buyer's intent (max 200 chars),
  "translation": English translation IF the body is not in English, else "",
  "language_detected": ISO 639-1 code (en, de, fr, it, ja, ko, zh, ar, tr, ru, etc.),
  "intent": one of "sample_request", "pricing_question", "logistics_question",
                    "meeting_request", "objection", "complaint", "confirmation",
                    "out_of_office", "auto_reply", "other",
  "volume_bags": integer number of bags the buyer mentioned, or null,
  "origin": Ethiopian region if mentioned (Yirgacheffe, Guji, Sidamo, Limu,
            Harrar, Jimma, Lekempti, etc.), or null,
  "grade": coffee grade if mentioned (Grade 1, Grade 2, Grade 3, Specialty,
           Commercial), or null,
  "destination": destination port or city if mentioned (Hamburg, Antwerp,
                 Trieste, New York, Tokyo, etc.), or null,
  "incoterm": Incoterm if mentioned (FOB, CIF, EXW, CFR, DAP), or null,
  "urgency": one of "High", "Medium", "Low" based on buyer's tone,
  "next_action": short free-text recommendation for the exporter
                 (e.g. "Send Sample", "Send Quote", "Schedule Call",
                  "Send Lot List", "Address Objection")
}}

Rules:
- classification must be one of the 7 listed values, never anything else.
- "positive" = buyer agreed / accepted / wants to proceed.
- "negative" = buyer declined / not interested.
- "question" = buyer is asking for information (samples, specs, price).
- "objection" = buyer raised a concern but is still engaged.
- "meeting_request" = buyer explicitly asked for a call / meeting.
- "out_of_office" = automated away message.
- "auto_reply" = any other automated response (bounce, confirm-receipt).
- If body is empty or too short to classify, use "auto_reply".

- intent must be one of the 10 listed values.
  - "sample_request" = buyer wants samples sent.
  - "pricing_question" = buyer asking about price / FOB cost.
  - "logistics_question" = buyer asking about shipment date, container, port.
  - "meeting_request" = buyer wants a call / video meeting.
  - "objection" = buyer raised a concern (price too high, quality, EUDR, etc.).
  - "complaint" = buyer unhappy with something already happened.
  - "confirmation" = buyer confirming receipt of samples / docs / contract.
  - "out_of_office" = automated away message.
  - "auto_reply" = any other automated response.
  - "other" = none of the above.

- volume_bags: parse "320 bags", "5 FCL", "10 containers" ->
  convert containers to bags (1 FCL ~= 320 bags of 60kg). null if not mentioned.

- urgency: "High" if buyer says "urgent", "ASAP", "this week", "immediately".
          "Medium" if "next week", "this month", "soon".
          "Low" if "no rush", "future", "when convenient", "next crop".
          Default "Medium" if unclear.

- next_action: a concrete next step for the exporter, max 60 chars.

- summary must be plain English, no quoted text, no signatures.
- If language_detected is "en", translation MUST be "".

Return ONLY the JSON object, no markdown fences, no commentary.
"""


class MessageAIProcessor:
    """GLM-powered triage + structured extraction of inbound buyer emails."""

    def __init__(
        self,
        gateway: AIGateway | None = None,
        preferred_provider: str = "glm",
    ) -> None:
        self.gateway = gateway or AIGateway()
        self.preferred_provider = preferred_provider

    def process(self, subject: str, from_addr: str, body: str) -> dict[str, Any]:
        """
        Run classify + summarize + translate + extract on an inbound email.

        Returns dict with all 12 fields + extracted_data dict + llm_used flag.
        """
        body_clean = (body or "").strip()[:4000]
        subject_clean = (subject or "").strip()[:200]

        if not body_clean:
            log.info("Empty body - returning auto_reply classification")
            return self._fallback(subject_clean, from_addr, "empty body")

        prompt = USER_PROMPT_TEMPLATE.format(
            subject=subject_clean,
            from_addr=from_addr,
            body=body_clean,
        )

        try:
            response = self.gateway.chat(
                prompt=prompt,
                agent_id="MessagingGateway",
                task_type="classification",
                system_prompt=SYSTEM_PROMPT,
                preferred_provider=self.preferred_provider,
                max_tokens=600,
                temperature=0.1,
            )
        except Exception as exc:
            log.error(f"AIGateway error during message triage: {exc}")
            return self._fallback(subject_clean, from_addr, str(exc))

        if not response.success or not response.text:
            return self._fallback(subject_clean, from_addr, response.error or "no response")

        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            log.warning(f"GLM returned non-JSON response: {raw[:200]}")
            return self._fallback(subject_clean, from_addr, "non-JSON response")

        classification = str(parsed.get("classification", "")).strip().lower()
        if classification not in VALID_CLASSIFICATIONS:
            log.warning(f"GLM returned invalid classification: {classification!r}")
            classification = "question"

        intent = str(parsed.get("intent", "")).strip().lower()
        if intent not in VALID_INTENTS:
            log.warning(f"GLM returned invalid intent: {intent!r}")
            intent = "other"

        urgency = str(parsed.get("urgency", "")).strip()
        if urgency:
            urgency = urgency.capitalize()
            if urgency not in VALID_URGENCIES:
                urgency = "Medium"

        volume_bags_raw = parsed.get("volume_bags")
        volume_bags: int | None = None
        if volume_bags_raw is not None:
            try:
                volume_bags = int(str(volume_bags_raw).strip())
                if volume_bags <= 0 or volume_bags > 100_000:
                    volume_bags = None
            except (ValueError, TypeError):
                volume_bags = None

        origin = self._clean_str(parsed.get("origin"), max_len=60)
        grade = self._clean_str(parsed.get("grade"), max_len=40)
        destination = self._clean_str(parsed.get("destination"), max_len=80)
        incoterm = self._clean_str(parsed.get("incoterm"), max_len=10).upper()
        next_action = self._clean_str(parsed.get("next_action"), max_len=120)

        extracted_data = {
            "intent": intent,
            "volume_bags": volume_bags,
            "origin": origin,
            "grade": grade,
            "destination": destination,
            "incoterm": incoterm,
            "urgency": urgency,
            "next_action": next_action,
        }

        return {
            "classification": classification,
            "summary": str(parsed.get("summary", "")).strip()[:500],
            "translation": str(parsed.get("translation", "")).strip(),
            "language_detected": str(parsed.get("language_detected", "en")).strip()[:5].lower(),
            "intent": intent,
            "volume_bags": volume_bags,
            "origin": origin,
            "grade": grade,
            "destination": destination,
            "incoterm": incoterm,
            "urgency": urgency,
            "next_action": next_action,
            "extracted_data": extracted_data,
            "llm_used": True,
            "provider": response.provider,
            "cost_usd": response.cost_usd or 0.0,
            "error": None,
        }

    @staticmethod
    def _clean_str(value: Any, max_len: int = 80) -> str | None:
        if value is None:
            return None
        s = str(value).strip()
        if not s or s.lower() in {"null", "none", "n/a"}:
            return None
        return s[:max_len]

    def _fallback(
        self, subject: str, from_addr: str, reason: str
    ) -> dict[str, Any]:
        """Graceful fallback when GLM is unavailable or returns junk."""
        return {
            "classification": "question",
            "summary": f"(AI triage unavailable: {reason}) Subject: {subject}",
            "translation": "",
            "language_detected": "en",
            "intent": "other",
            "volume_bags": None,
            "origin": None,
            "grade": None,
            "destination": None,
            "incoterm": None,
            "urgency": None,
            "next_action": "Review manually",
            "extracted_data": {
                "intent": "other",
                "volume_bags": None,
                "origin": None,
                "grade": None,
                "destination": None,
                "incoterm": None,
                "urgency": None,
                "next_action": "Review manually",
            },
            "llm_used": False,
            "provider": "none",
            "cost_usd": 0.0,
            "error": reason,
        }
