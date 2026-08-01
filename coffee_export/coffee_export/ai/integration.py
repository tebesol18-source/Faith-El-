"""
AI Gateway integration for agents.

Provides LLM-powered methods that enhance the deterministic logic
in agents 2, 3, 5, and 7. Each method falls back to the existing
rule-based approach if the LLM is unavailable.

Usage in agents:
    from coffee_export.ai.integration import llm_enrich_lead, llm_draft_message, ...

    # In Agent 2:
    result = llm_enrich_lead(gateway, company_name, notes, fallback_segment, fallback_vp)
"""

from __future__ import annotations

import json
from typing import Any

from coffee_export.ai import AIGateway
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


# =============================================================
# AGENT 2: LLM-POWERED LEAD ENRICHMENT
# =============================================================


def llm_enrich_lead(
    gateway: AIGateway,
    company_name: str,
    notes: str,
    country: str = "",
    fallback_segment: str = "Specialty Importer",
    fallback_vp: str = "VP1",
    fallback_tier: str = "B",
    fallback_tags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Use LLM to intelligently classify a lead's segment, VP, tier, and tags.

    Falls back to the provided deterministic values if LLM fails.
    """
    prompt = f"""Analyze this coffee buyer and classify them:

Company: {company_name}
Country: {country}
Description: {notes}

Return a JSON object with exactly these fields:
{{
  "segment": one of "Specialty Importer", "Commercial Importer", "Roaster-Direct", "Microlot Buyer", "Broker", "Cafe-Chain", "Subscription",
  "vp": one of "VP1" (origin access), "VP2" (sustainability), "VP3" (commercial FOB), "VP4" (microlot),
  "tier": one of "S", "A", "B", "C",
  "tags": list of relevant tags from: fairtrade, organic, microlot, eudr-aware, rainforest-alliance, direct-trade,
  "reasoning": one sentence explaining the classification
}}

Only return the JSON, no other text."""

    response = gateway.chat(
        prompt=prompt,
        agent_id="Agent 2",
        task_type="standard",
        system_prompt="You are a coffee industry expert. Classify buyers accurately based on their business model.",
        max_tokens=300,
        temperature=0.3,
    )

    if not response.success:
        log.debug("LLM enrichment failed, using fallback")
        return {
            "segment": fallback_segment,
            "vp": fallback_vp,
            "tier": fallback_tier,
            "tags": fallback_tags or [],
            "reasoning": "Fallback (LLM unavailable)",
            "llm_used": False,
        }

    try:
        # Extract JSON from response
        text = response.text.strip()
        # Find JSON in the response
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
        else:
            raise ValueError("No JSON found in response")

        result = {
            "segment": data.get("segment", fallback_segment),
            "vp": data.get("vp", fallback_vp),
            "tier": data.get("tier", fallback_tier),
            "tags": data.get("tags", fallback_tags or []),
            "reasoning": data.get("reasoning", ""),
            "llm_used": True,
            "provider": response.provider,
            "model": response.model,
            "cost": response.cost_usd,
        }

        log.info(
            f"LLM enrichment for '{company_name}': segment={result['segment']}, "
            f"vp={result['vp']}, tier={result['tier']} ({response.provider})"
        )
        return result

    except (json.JSONDecodeError, ValueError) as e:
        log.warning(f"LLM enrichment parse failed: {e}, using fallback")
        return {
            "segment": fallback_segment,
            "vp": fallback_vp,
            "tier": fallback_tier,
            "tags": fallback_tags or [],
            "reasoning": "Fallback (LLM parse error)",
            "llm_used": False,
        }


# =============================================================
# AGENT 3: LLM-POWERED MESSAGE DRAFTING + QUAL EVALUATION
# =============================================================


def llm_draft_outreach_message(
    gateway: AIGateway,
    lead: dict[str, Any],
    step: int,
    channel: str,
    memories: list[dict[str, Any]],
    touches: list[dict[str, Any]],
    fallback_message: str = "",
) -> dict[str, str]:
    """
    Use LLM + conversation memory to draft a personalized outreach message.

    Falls back to the provided template message if LLM fails.
    """
    # Build conversation context
    memory_context = ""
    if memories:
        memory_lines = [
            f"  - [{m.get('memory_type', '')}] {m.get('content', '')[:100]}" for m in memories[:5]
        ]
        memory_context = "Previous conversation context:\n" + "\n".join(memory_lines)

    touch_context = ""
    if touches:
        last_touch = touches[-1] if touches else None
        if last_touch and last_touch.get("direction") == "inbound":
            touch_context = f"Buyer's last reply: {last_touch.get('response_content', '')[:200]}"

    vp = lead.get("recommended_vp", "VP1")
    company = lead.get("company_name", "")
    language = lead.get("outreach_language", "EN")
    step_desc = {
        1: "LinkedIn connection request (max 250 chars, no pitch)",
        2: "LinkedIn DM (4 lines, one insight + one question)",
        3: "Email (reference LinkedIn, CTA: 20-min call)",
        4: "LinkedIn comment on their post (organic touch)",
        5: "Email #2 (new angle, lot list, CTA: call)",
        6: "LinkedIn DM close (graceful exit, move to nurture)",
    }.get(step, f"Step {step}")

    prompt = f"""Draft a coffee export outreach message for:

Step: {step} ({step_desc})
Channel: {channel}
Company: {company}
Value Proposition: {vp}
Language: {language}

{memory_context}
{touch_context}

Requirements:
- Personalized (reference past interactions if any)
- Professional but warm tone
- Coffee-industry literate (use SCA terms correctly)
- Under 200 words
- No price quotes
- One clear call-to-action

Return only the message text, no explanations."""

    response = gateway.chat(
        prompt=prompt,
        agent_id="Agent 3",
        task_type="creative",
        system_prompt="You are a coffee export sales expert. Write concise, personalized outreach messages.",
        max_tokens=300,
        temperature=0.7,
    )

    if not response.success:
        log.debug("LLM message drafting failed, using fallback template")
        return {
            "full_message": fallback_message,
            "llm_used": False,
        }

    message = response.text.strip()
    log.info(
        f"LLM drafted {channel} message for {company} step {step} "
        f"({response.provider}, {response.total_tokens} tokens)"
    )

    return {
        "full_message": message,
        "subject": f"Ethiopian coffee — {company}" if channel == "email" else "",
        "llm_used": True,
        "provider": response.provider,
        "cost": response.cost_usd,
    }


def llm_evaluate_qual_answer(
    gateway: AIGateway,
    question_id: str,
    question_text: str,
    answer_text: str,
    fallback_positive: bool = False,
) -> dict[str, Any]:
    """
    Use LLM to evaluate a nuanced QUAL gate answer.

    Falls back to keyword-based evaluation if LLM fails.
    """
    prompt = f"""Evaluate this qualification answer for a coffee buyer:

Question {question_id}: {question_text}
Buyer's answer: "{answer_text}"

Is this a positive answer (passes the qualification gate)?
Return JSON: {{"is_positive": true/false, "reasoning": "one sentence"}}"""

    response = gateway.chat(
        prompt=prompt,
        agent_id="Agent 3",
        task_type="simple",
        system_prompt="You evaluate sales qualification answers. Be strict but fair.",
        max_tokens=100,
        temperature=0.2,
    )

    if not response.success:
        return {
            "is_positive": fallback_positive,
            "reasoning": "Fallback (LLM unavailable)",
            "llm_used": False,
        }

    try:
        text = response.text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            return {
                "is_positive": bool(data.get("is_positive", fallback_positive)),
                "reasoning": data.get("reasoning", ""),
                "llm_used": True,
                "provider": response.provider,
            }
    except (json.JSONDecodeError, ValueError):
        pass

    return {
        "is_positive": fallback_positive,
        "reasoning": "Fallback (LLM parse error)",
        "llm_used": False,
    }


# =============================================================
# AGENT 5: LLM-POWERED CONTRACT REVIEW
# =============================================================


def llm_review_contract(
    gateway: AIGateway,
    contract: dict[str, Any],
    lead: dict[str, Any],
    compliance_status: dict[str, Any],
) -> dict[str, Any]:
    """
    Use LLM to review a contract for risks and missing items.

    Returns a dict with risk_level, findings, and recommendations.
    """
    prompt = f"""Review this coffee export contract for risks and compliance:

Contract: {contract.get('contract_id', '')}
Buyer: {lead.get('company_name', '')} ({lead.get('headquarters_country', '')})
Incoterm: {contract.get('incoterm', 'FOB')}
Volume: {contract.get('total_volume_bags', 0)} bags
Value: ${contract.get('total_value', 0)}
Payment: {contract.get('payment_terms', '')}
Compliance status: {compliance_status.get('approved', 0)}/{compliance_status.get('total_docs', 0)} docs approved
Missing docs: {compliance_status.get('missing', [])}

Return JSON:
{{
  "risk_level": "low" | "medium" | "high",
  "findings": ["finding 1", "finding 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...],
  "can_proceed": true/false
}}"""

    response = gateway.chat(
        prompt=prompt,
        agent_id="Agent 5",
        task_type="standard",
        system_prompt="You are a legal compliance expert for international coffee trade. Be thorough but practical.",
        max_tokens=400,
        temperature=0.3,
    )

    if not response.success:
        return {
            "risk_level": "unknown",
            "findings": ["LLM review unavailable — manual review required"],
            "recommendations": [],
            "can_proceed": compliance_status.get("can_sign", False),
            "llm_used": False,
        }

    try:
        text = response.text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            return {
                "risk_level": data.get("risk_level", "unknown"),
                "findings": data.get("findings", []),
                "recommendations": data.get("recommendations", []),
                "can_proceed": data.get("can_proceed", compliance_status.get("can_sign", False)),
                "llm_used": True,
                "provider": response.provider,
                "cost": response.cost_usd,
            }
    except (json.JSONDecodeError, ValueError):
        pass

    return {
        "risk_level": "unknown",
        "findings": ["LLM review parse error — manual review required"],
        "recommendations": [],
        "can_proceed": compliance_status.get("can_sign", False),
        "llm_used": False,
    }


# =============================================================
# AGENT 7: LLM-POWERED NPS ANALYSIS + NEXT-ACTION SUGGESTIONS
# =============================================================


def llm_analyze_nps_feedback(
    gateway: AIGateway,
    account_id: str,
    nps_score: int,
    feedback: str,
    company_name: str = "",
) -> dict[str, Any]:
    """
    Use LLM to analyze NPS feedback for actionable insights.
    """
    prompt = f"""Analyze this NPS feedback from a coffee buyer:

Company: {company_name}
NPS Score: {nps_score}/10
Feedback: "{feedback}"

Return JSON:
{{
  "sentiment": "positive" | "neutral" | "negative",
  "key_themes": ["theme 1", "theme 2", ...],
  "action_items": ["action 1", "action 2", ...],
  "follow_up_priority": "high" | "medium" | "low",
  "summary": "one sentence summary"
}}"""

    response = gateway.chat(
        prompt=prompt,
        agent_id="Agent 7",
        task_type="standard",
        system_prompt="You are a customer success expert for the coffee industry. Extract actionable insights from feedback.",
        max_tokens=200,
        temperature=0.3,
    )

    if not response.success:
        return {
            "sentiment": (
                "positive" if nps_score >= 9 else ("neutral" if nps_score >= 7 else "negative")
            ),
            "key_themes": [],
            "action_items": [],
            "follow_up_priority": "high" if nps_score <= 6 else "medium",
            "summary": feedback[:100] if feedback else "No feedback provided",
            "llm_used": False,
        }

    try:
        text = response.text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            return {
                **data,
                "llm_used": True,
                "provider": response.provider,
                "cost": response.cost_usd,
            }
    except (json.JSONDecodeError, ValueError):
        pass

    return {
        "sentiment": "neutral",
        "key_themes": [],
        "action_items": [],
        "follow_up_priority": "medium",
        "summary": feedback[:100] if feedback else "",
        "llm_used": False,
    }


def llm_suggest_next_action(
    gateway: AIGateway,
    account: dict[str, Any],
    activities: list[dict[str, Any]],
    nps_score: int | None = None,
) -> dict[str, Any]:
    """
    Use LLM to suggest the next best action for an account relationship.
    """
    recent_activities = "; ".join(
        f"{a.get('activity_type', '')}: {a.get('summary', '')[:50]}" for a in activities[:5]
    )

    prompt = f"""Suggest the next best action for this coffee buyer account:

Account: {account.get('account_id', '')}
Company: (via lead)
Status: {account.get('relationship_status', 'active')}
Total volume: {account.get('total_volume_bags', 0)} bags
Total revenue: ${account.get('total_revenue_usd', 0)}
NPS: {nps_score if nps_score is not None else 'N/A'}
Recent activities: {recent_activities or 'None'}

Return JSON:
{{
  "suggested_action": "call" | "email" | "meeting" | "site_visit" | "sample_request" | "nps_survey" | "wait",
  "reasoning": "one sentence why",
  "suggested_timing": "immediate" | "this_week" | "this_month" | "next_quarter",
  "talking_points": ["point 1", "point 2", ...]
}}"""

    response = gateway.chat(
        prompt=prompt,
        agent_id="Agent 7",
        task_type="standard",
        system_prompt="You are a sales relationship manager for the coffee industry. Suggest practical next actions.",
        max_tokens=200,
        temperature=0.4,
    )

    if not response.success:
        return {
            "suggested_action": "wait",
            "reasoning": "LLM unavailable",
            "suggested_timing": "this_month",
            "talking_points": [],
            "llm_used": False,
        }

    try:
        text = response.text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            return {
                **data,
                "llm_used": True,
                "provider": response.provider,
                "cost": response.cost_usd,
            }
    except (json.JSONDecodeError, ValueError):
        pass

    return {
        "suggested_action": "wait",
        "reasoning": "LLM parse error",
        "suggested_timing": "this_month",
        "talking_points": [],
        "llm_used": False,
    }
