"""
Agent 2 — Lead Research & Enrichment Specialist.

Takes raw lead data (from CSV or API), enriches it with VP, segment,
tier, language, creates leads in the database via StateManager, and
publishes LEAD_CREATED + LEAD_ENRICHED events for Agent 3.

RESPONSIBILITIES
----------------
  1. Import raw leads from CSV (company_name, website, HQ, contacts)
  2. Classify each lead into a segment (Specialty Importer, Commercial, etc.)
  3. Recommend a VP (VP1-VP4) based on signals in the notes
  4. Assign a priority tier (S/A/B/C/Disqualify)
  5. Detect outreach language from HQ country
  6. Tag leads (fairtrade, organic, microlot, EUDR-aware)
  7. Create lead contacts (multiple decision makers per lead)
  8. Disqualify cafe chains and zero-contact leads
  9. Publish LEAD_CREATED + LEAD_ENRICHED events

VP SELECTION LOGIC
------------------
  1. Sustainability signals → VP2
  2. Microlot signals → VP4
  3. Commercial volume signals → VP3
  4. Default by segment → VP1 (origin access)

USAGE
-----
    from coffee_export.agents.agent2_enrichment import Agent2

    # Enrich from a CSV file
    agent = Agent2()
    result = agent.enrich_csv("data/raw_leads.csv")
    print(f"Enriched {result['enriched']} leads, {result['disqualified']} disqualified")

    # Or enrich a single lead dict
    result = agent.enrich_lead({
        "company_name": "Falcon Coffees",
        "headquarters": "Lewes, United Kingdom",
        "notes": "Major global green coffee importer...",
    })
"""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path
from typing import Any

from coffee_export.agents.base import BaseAgent
from coffee_export.agents.registry import register_agent
from coffee_export.events import LEAD_CREATED, LEAD_ENRICHED
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

# ── Language mapping (country → language code) ──
COUNTRY_LANGUAGE: dict[str, str] = {
    "USA": "EN",
    "United States": "EN",
    "US": "EN",
    "Canada": "EN",
    "United Kingdom": "EN",
    "UK": "EN",
    "England": "EN",
    "Australia": "EN",
    "New Zealand": "EN",
    "South Africa": "EN",
    "Ireland": "EN",
    "Germany": "DE",
    "Austria": "DE",
    "Belgium": "EN",
    "Netherlands": "EN",
    "Switzerland": "EN",
    "Spain": "EN",
    "Portugal": "EN",
    "Sweden": "EN",
    "Norway": "EN",
    "Denmark": "EN",
    "Finland": "EN",
    "Poland": "EN",
    "France": "FR",
    "Italy": "IT",
    "Japan": "JA",
    "South Korea": "KO",
    "Korea": "KO",
    "China": "ZH",
    "Hong Kong": "ZH",
    "Taiwan": "ZH",
    "Saudi Arabia": "AR",
    "UAE": "AR",
    "United Arab Emirates": "AR",
    "Kuwait": "AR",
    "Qatar": "AR",
    "Bahrain": "AR",
    "Oman": "AR",
    "Egypt": "AR",
    "Jordan": "AR",
    "Lebanon": "AR",
    "Turkey": "TR",
    "Türkiye": "TR",
    "Russia": "RU",
}

# ── VP trigger keywords ──
VP2_KEYWORDS: tuple[str, ...] = (
    "fairtrade",
    "fair trade",
    "rainforest alliance",
    "organic",
    "eudr",
    "deforestation",
    "sustainab",
    "transparen",
    "traceab",
)
VP4_KEYWORDS: tuple[str, ...] = (
    "microlot",
    "micro-lot",
    "competition",
    "world barista",
    "competition-grade",
    "reserved lot",
    "single-washing-station",
)
VP3_KEYWORDS: tuple[str, ...] = (
    "fcl",
    "icc",
    "fob djibouti",
    "fob addis",
    "commodity",
    "forward pricing",
    "substantial volumes",
    "large volume",
    "global green coffee importer",
    "industry giant",
)

# ── S-tier buyer keywords ──
S_TIER_KEYWORDS: tuple[str, ...] = (
    "falcon coffee",
    "royal coffee",
    "cafe imports",
    "trabocca",
    "nordic approach",
    "ally coffee",
    "atlas coffee",
    "sucafina",
    "volcafe",
    "ecom",
    "olam",
    "neumann",
    "drwakefield",
    "list + beisler",
    "mercon",
    "export trading group",
    "etg",
    "cardassilaris",
    "ogawa",
)

# ── Large commercial importers (Sequence B) ──
LARGE_COMMERCIAL_KEYWORDS: tuple[str, ...] = (
    "volcafe",
    "ecom",
    "olam",
    "sucafina",
    "neumann",
    "mercon",
    "starbucks",
    "nestle",
    "nespresso",
    "jacobs",
    "tchibo",
    "lavazza",
    "illy",
    "segafredo",
    "costa coffee",
)

# ── Critical keywords for QA auto-flag ──


class Agent2(BaseAgent):
    """Agent 2 — Lead Research & Enrichment Specialist."""

    agent_id = "Agent 2"
    description = "Lead Research & Enrichment — VP, segment, tier, language, tags"

    def get_leads_to_process(self) -> list[dict[str, Any]]:
        """
        Agent 2 is not event-driven in the traditional sense.
        It processes raw lead data from CSV files or API calls.

        For the AgentRunner, we return an empty list (Agent 2 is
        triggered manually via enrich_csv() or enrich_lead()).
        """
        return []

    def process_lead(self, lead: dict[str, Any]) -> dict[str, Any]:
        """Process a single raw lead dict. Used by AgentRunner if needed."""
        return self.enrich_lead(lead)

    # =============================================================
    # ENRICHMENT METHODS
    # =============================================================

    def enrich_csv(self, csv_path: str | Path) -> dict[str, Any]:
        """
        Enrich leads from a CSV file.

        Expected CSV columns (minimum):
          - company_name
          - headquarters (e.g., "Lewes, United Kingdom")
          - notes (company description — used for VP/segment detection)

        Optional columns:
          - website, general_email, phone
          - decision_maker_1_name, decision_maker_1_title, decision_maker_1_email
          - decision_maker_1_linkedin
          - decision_maker_2_name, decision_maker_2_title, decision_maker_2_email
          - decision_maker_2_linkedin

        Returns a summary dict with counts.
        """
        csv_path = Path(csv_path)
        if not csv_path.exists():
            raise FileNotFoundError(f"CSV file not found: {csv_path}")

        log.info(f"{self.agent_id} enriching leads from {csv_path}")

        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        enriched_count = 0
        skipped_count = 0
        disqualified_count = 0
        errors: list[str] = []

        for i, row in enumerate(rows, 1):
            try:
                result = self.enrich_lead(row)
                if result.get("action") == "created":
                    enriched_count += 1
                elif result.get("action") == "disqualified":
                    disqualified_count += 1
                else:
                    skipped_count += 1
            except Exception as e:
                error_msg = f"Row {i} ({row.get('company_name', '?')}): {e}"
                errors.append(error_msg)
                log.warning(f"{self.agent_id} {error_msg}")
                skipped_count += 1

        summary = {
            "total_rows": len(rows),
            "enriched": enriched_count,
            "skipped": skipped_count,
            "disqualified": disqualified_count,
            "errors": errors,
        }

        log.info(
            f"{self.agent_id} CSV enrichment complete: "
            f"{enriched_count} enriched, {disqualified_count} disqualified, "
            f"{skipped_count} skipped, {len(errors)} errors"
        )

        return summary

    def enrich_lead(self, raw: dict[str, Any]) -> dict[str, Any]:
        """
        Enrich a single raw lead dict.

        1. Extract company name, HQ country, notes
        2. Detect segment
        3. Recommend VP
        4. Assign priority tier
        5. Detect outreach language
        6. Build tags
        7. Check for disqualification (cafe chain, zero contact)
        8. Create lead via StateManager
        9. Add contacts
        10. Publish LEAD_CREATED + LEAD_ENRICHED events

        Returns a result dict with action and lead_id.
        """
        company_name = (raw.get("company_name") or "").strip()
        if not company_name:
            return {"action": "skipped", "reason": "no company_name"}

        headquarters = (raw.get("headquarters") or "").strip()
        notes = (raw.get("notes") or "").strip()
        website = (raw.get("website") or "").strip()

        # Extract country from headquarters (last comma-separated part)
        country = self._extract_country(headquarters)

        # Detect segment
        segment = self._detect_segment(company_name, notes)

        # Check for disqualification
        disqualify, disqualify_reason = self._check_disqualify(raw, segment)
        if disqualify:
            log.info(f"{self.agent_id} disqualified '{company_name}': {disqualify_reason}")
            return {
                "action": "disqualified",
                "company_name": company_name,
                "reason": disqualify_reason,
            }

        # Recommend VP
        vp = self._recommend_vp(segment, notes)

        # Assign priority tier
        data_confidence = (raw.get("data_confidence") or "").strip()
        tier = self._assign_tier(company_name, notes, segment, data_confidence)

        # Detect language
        language = self._detect_language(country)

        # Build tags
        tags = self._build_tags(notes)

        # Build source hash
        source_hash = hashlib.sha1(
            f"{company_name.lower()}|{headquarters.lower()}".encode()
        ).hexdigest()

        # Create the lead
        lead_id = self.sm.create_lead(
            company_name=company_name,
            headquarters_country=country,
            headquarters_city=self._extract_city(headquarters),
            website=website,
            source_row_hash=source_hash,
            priority_tier=tier,
            recommended_vp=vp,
            outreach_language=language,
            tags=tags,
            created_by=self.agent_id,
        )

        # Add contacts
        self._add_contacts(lead_id, raw)

        # Transition to ENRICHED and hand off to Agent 3
        self.sm.update_lead_state(
            lead_id=lead_id,
            new_state="ENRICHED",
            agent=self.agent_id,
            notes=f"Enriched: segment={segment}, VP={vp}, tier={tier}, lang={language}",
            current_agent="Agent 3",
            next_action_agent="Agent 3",
        )

        # Publish events
        self.bus.publish(
            event_type=LEAD_CREATED,
            entity_type="lead",
            entity_id=lead_id,
            payload={
                "lead_id": lead_id,
                "company_name": company_name,
                "country": country,
            },
            published_by=self.agent_id,
        )
        self.bus.publish(
            event_type=LEAD_ENRICHED,
            entity_type="lead",
            entity_id=lead_id,
            payload={
                "lead_id": lead_id,
                "company_name": company_name,
                "segment": segment,
                "vp": vp,
                "tier": tier,
                "language": language,
                "tags": tags,
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} enriched '{company_name}' → {lead_id} "
            f"(segment={segment}, VP={vp}, tier={tier}, lang={language})"
        )

        return {
            "action": "created",
            "lead_id": lead_id,
            "company_name": company_name,
            "segment": segment,
            "vp": vp,
            "tier": tier,
            "language": language,
            "tags": tags,
        }

    # =============================================================
    # CLASSIFICATION HELPERS
    # =============================================================

    def _extract_country(self, headquarters: str) -> str:
        """Extract the country from a headquarters field like 'Lewes, United Kingdom'."""
        if not headquarters:
            return ""
        parts = [p.strip() for p in headquarters.split(",")]
        return parts[-1] if parts else ""

    def _extract_city(self, headquarters: str) -> str:
        """Extract the city from a headquarters field."""
        if not headquarters:
            return ""
        parts = [p.strip() for p in headquarters.split(",")]
        return parts[0] if parts else ""

    def _detect_segment(self, company_name: str, notes: str) -> str:
        """Classify company into one of the 7 segments."""
        text = (company_name + " " + notes).lower()
        name = company_name.lower()

        # Cafe chain
        if any(k in text for k in ("cafe chain", "household cafe", "coffee chain")):
            return "Cafe-Chain"
        if any(k in name for k in ("starbucks", "komeda", "dunkin", "tim hortons")):
            return "Cafe-Chain"

        # Broker
        if any(k in text for k in ("broker", "brokerage")):
            return "Broker"

        # Subscription / D2C
        if any(k in text for k in ("subscription", "office coffee service", "d2c")):
            return "Subscription"

        # Microlot buyer
        if any(k in text for k in VP4_KEYWORDS):
            return "Microlot Buyer"

        # Commercial importer
        if any(k in text for k in VP3_KEYWORDS):
            if any(k in text for k in ("specialty", "microlot", "single-origin")):
                return "Specialty Importer"
            return "Commercial Importer"

        # Roaster-direct
        if any(k in name for k in ("roaster", "roastery", "roasting")):
            return "Roaster-Direct"
        if any(k in text for k in ("roaster", "roastery")) and not any(
            k in text for k in ("importer", "importing", "trading", "green coffee importer")
        ):
            return "Roaster-Direct"

        # Importer (specialty or commercial)
        if any(k in text for k in ("importer", "importing", "trading")):
            if any(k in text for k in ("specialty", "microlot", "single-origin", "direct trade")):
                return "Specialty Importer"
            return "Commercial Importer"

        return "Specialty Importer"

    def _recommend_vp(self, segment: str, notes: str) -> str:
        """Pick the VP that best matches segment + notes."""
        text = notes.lower()

        # Rule 1: sustainability signals → VP2
        if any(k in text for k in VP2_KEYWORDS) and segment in (
            "Specialty Importer",
            "Commercial Importer",
            "Roaster-Direct",
            "Microlot Buyer",
        ):
            return "VP2"

        # Rule 2: microlot signals → VP4
        if any(k in text for k in VP4_KEYWORDS):
            return "VP4"

        # Rule 3: commercial volume signals → VP3
        if any(k in text for k in VP3_KEYWORDS):
            return "VP3"

        # Rule 4: default by segment
        if segment == "Microlot Buyer":
            return "VP4"
        if segment == "Commercial Importer":
            return "VP3"
        if segment == "Cafe-Chain":
            return "VP3"
        if segment == "Broker":
            return "VP1"
        if segment == "Subscription":
            return "VP2"
        return "VP1"

    def _assign_tier(
        self, company_name: str, notes: str, segment: str, data_confidence: str
    ) -> str:
        """Assign priority tier (S/A/B/C)."""
        text = (company_name + " " + notes).lower()

        # S-tier: known large buyers
        if any(k in text for k in S_TIER_KEYWORDS):
            return "S"

        # A-tier: established importers with high confidence
        if (
            segment in ("Specialty Importer", "Commercial Importer")
            and data_confidence.lower() == "high"
        ):
            return "A"

        # B-tier: roaster-direct, microlot, subscription
        if segment in ("Roaster-Direct", "Microlot Buyer", "Subscription"):
            return "B"

        # C-tier: brokers, low confidence
        if segment == "Broker":
            return "C"
        if data_confidence.lower() in ("low", "medium"):
            return "C"

        return "B"

    def _detect_language(self, country: str) -> str:
        """Map country → outreach language."""
        if not country:
            return "EN"
        if country in COUNTRY_LANGUAGE:
            return COUNTRY_LANGUAGE[country]
        for k, v in COUNTRY_LANGUAGE.items():
            if k.lower() in country.lower():
                return v
        return "EN"

    def _build_tags(self, notes: str) -> list[str]:
        """Build tags from notes signals."""
        tags: list[str] = []
        text = notes.lower()
        if "fairtrade" in text or "fair trade" in text:
            tags.append("fairtrade")
        if "organic" in text:
            tags.append("organic")
        if "microlot" in text or "micro-lot" in text:
            tags.append("microlot")
        if "eudr" in text:
            tags.append("eudr-aware")
        if "rainforest" in text:
            tags.append("rainforest-alliance")
        if "direct trade" in text:
            tags.append("direct-trade")
        return tags

    def _check_disqualify(self, raw: dict[str, Any], segment: str) -> tuple[bool, str]:
        """Check if a lead should be disqualified."""
        # Cafe chains → disqualify
        if segment == "Cafe-Chain":
            return True, "Cafe chain — typically procures via corporate HQ"

        # Zero contact info → disqualify
        has_contact = any(
            (raw.get(f) or "").strip().lower() not in ("", "not found", "n/a")
            for f in (
                "decision_maker_1_linkedin",
                "decision_maker_2_linkedin",
                "decision_maker_1_email",
                "decision_maker_2_email",
                "general_email",
                "other_emails",
                "phone",
            )
        )
        if not has_contact:
            return True, "No verified contact info"

        return False, ""

    def _add_contacts(self, lead_id: str, raw: dict[str, Any]) -> None:
        """Add decision maker contacts from raw data."""
        for prefix in ("decision_maker_1", "decision_maker_2"):
            name = (raw.get(f"{prefix}_name") or "").strip()
            if not name or name.lower() in ("not found", "n/a"):
                continue

            title = (raw.get(f"{prefix}_title") or "").strip()
            linkedin = (raw.get(f"{prefix}_linkedin") or "").strip()
            email = (raw.get(f"{prefix}_email") or "").strip()

            if linkedin.lower() in ("not found", "n/a"):
                linkedin = ""
            if email.lower() in ("not found", "n/a"):
                email = ""

            # Check if this is a buyer/sourcing title
            title_lower = title.lower()
            is_buyer = any(
                k in title_lower
                for k in (
                    "buyer",
                    "sourcing",
                    "procurement",
                    "head of coffee",
                    "green coffee",
                    "head buyer",
                )
            )

            self.sm.add_contact(
                lead_id=lead_id,
                name=name,
                title=title,
                linkedin_url=linkedin,
                email=email,
                is_primary=(prefix == "decision_maker_1"),
                is_buyer=is_buyer,
            )

    # =============================================================
    # BATCH RUN (for AgentRunner compatibility)
    # =============================================================

    def run_enrichment_batch(self, csv_path: str | Path) -> dict[str, Any]:
        """
        Run a full enrichment batch from a CSV file.

        This is the main entry point for Agent 2 operations.
        """
        return self.enrich_csv(csv_path)

    def enrich_lead_with_llm(self, raw: dict[str, Any]) -> dict[str, Any]:
        """
        Enrich a lead using LLM for intelligent classification.

        Uses the AI Gateway to classify segment, VP, tier, and tags.
        Falls back to deterministic keyword-based methods if LLM fails.
        """
        from coffee_export.ai import AIGateway, llm_enrich_lead

        company_name = (raw.get("company_name") or "").strip()
        notes = (raw.get("notes") or "").strip()
        country = self._extract_country((raw.get("headquarters") or "").strip())

        # Get deterministic fallbacks first
        fallback_segment = self._detect_segment(company_name, notes)
        fallback_vp = self._recommend_vp(fallback_segment, notes)
        fallback_tier = self._assign_tier(
            company_name,
            notes,
            fallback_segment,
            (raw.get("data_confidence") or "").strip(),
        )
        fallback_tags = self._build_tags(notes)

        # Try LLM enrichment
        gateway = AIGateway()
        llm_result = llm_enrich_lead(
            gateway=gateway,
            company_name=company_name,
            notes=notes,
            country=country,
            fallback_segment=fallback_segment,
            fallback_vp=fallback_vp,
            fallback_tier=fallback_tier,
            fallback_tags=fallback_tags,
        )

        # Use LLM results if available, otherwise fallbacks
        segment = llm_result.get("segment", fallback_segment)
        vp = llm_result.get("vp", fallback_vp)
        tier = llm_result.get("tier", fallback_tier)
        tags = llm_result.get("tags", fallback_tags)
        reasoning = llm_result.get("reasoning", "")
        llm_used = llm_result.get("llm_used", False)

        # Disqualify check still uses deterministic rules (safety)
        disqualify, disqualify_reason = self._check_disqualify(raw, segment)
        if disqualify:
            return {
                "action": "disqualified",
                "company_name": company_name,
                "reason": disqualify_reason,
            }

        # Detect language (deterministic — no LLM needed)
        language = self._detect_language(country)

        # Build source hash
        source_hash = hashlib.sha1(
            f"{company_name.lower()}|{(raw.get('headquarters') or '').lower()}".encode()
        ).hexdigest()

        # Create the lead
        lead_id = self.sm.create_lead(
            company_name=company_name,
            headquarters_country=country,
            headquarters_city=self._extract_city((raw.get("headquarters") or "").strip()),
            website=(raw.get("website") or "").strip(),
            source_row_hash=source_hash,
            priority_tier=tier,
            recommended_vp=vp,
            outreach_language=language,
            tags=tags,
            created_by=self.agent_id,
        )

        self._add_contacts(lead_id, raw)

        self.sm.update_lead_state(
            lead_id=lead_id,
            new_state="ENRICHED",
            agent=self.agent_id,
            notes=(
                f"LLM enriched: {reasoning}"
                if llm_used
                else f"Rule-based: segment={segment}, VP={vp}"
            ),
            current_agent="Agent 3",
            next_action_agent="Agent 3",
        )

        self.bus.publish(
            event_type=LEAD_CREATED,
            entity_type="lead",
            entity_id=lead_id,
            payload={"lead_id": lead_id, "company_name": company_name, "country": country},
            published_by=self.agent_id,
        )
        self.bus.publish(
            event_type=LEAD_ENRICHED,
            entity_type="lead",
            entity_id=lead_id,
            payload={
                "lead_id": lead_id,
                "company_name": company_name,
                "segment": segment,
                "vp": vp,
                "tier": tier,
                "language": language,
                "tags": tags,
                "llm_used": llm_used,
                "llm_reasoning": reasoning,
            },
            published_by=self.agent_id,
        )

        log.info(
            f"{self.agent_id} LLM-enriched '{company_name}' → {lead_id} "
            f"(segment={segment}, VP={vp}, tier={tier}, llm={'✓' if llm_used else '✗'})"
        )

        return {
            "action": "created",
            "lead_id": lead_id,
            "company_name": company_name,
            "segment": segment,
            "vp": vp,
            "tier": tier,
            "language": language,
            "tags": tags,
            "llm_used": llm_used,
            "llm_reasoning": reasoning,
        }


# ═══════════════════════════════════════════════════════════════
# REGISTER THE AGENT
# ═══════════════════════════════════════════════════════════════

register_agent("Agent 2", Agent2)


# ═══════════════════════════════════════════════════════════════
# CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════


def run_agent2_csv(csv_path: str | Path) -> dict[str, Any]:
    """Run Agent 2 enrichment on a CSV file."""
    with Agent2() as agent:
        return agent.enrich_csv(csv_path)


def run_agent2_single(raw_lead: dict[str, Any]) -> dict[str, Any]:
    """Run Agent 2 enrichment on a single lead dict."""
    with Agent2() as agent:
        return agent.enrich_lead(raw_lead)
