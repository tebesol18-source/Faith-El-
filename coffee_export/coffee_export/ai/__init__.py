"""
AI Gateway package — centralized LLM manager + agent integration.

Usage:
    from coffee_export.ai import AIGateway

    gateway = AIGateway()
    response = gateway.chat(
        prompt="Classify this company",
        agent_id="Agent 2",
        task_type="segment_classification",
    )
    print(response.text)

Agent integration functions:
    from coffee_export.ai import llm_enrich_lead, llm_draft_outreach_message
"""

from coffee_export.ai.gateway import AIGateway
from coffee_export.ai.integration import (
    llm_analyze_nps_feedback,
    llm_draft_outreach_message,
    llm_enrich_lead,
    llm_evaluate_qual_answer,
    llm_review_contract,
    llm_suggest_next_action,
)
from coffee_export.ai.providers import (
    AIResponse,
    BaseProvider,
    ClaudeProvider,
    GeminiProvider,
    GLMProvider,
    MockProvider,
    OllamaProvider,
    OpenAIProvider,
    QwenProvider,
)
from coffee_export.ai.templates import get_template_info, list_templates, load_prompt

__all__ = [
    "AIGateway",
    "AIResponse",
    "BaseProvider",
    "MockProvider",
    "OpenAIProvider",
    "ClaudeProvider",
    "GeminiProvider",
    "GLMProvider",
    "QwenProvider",
    "OllamaProvider",
    "llm_enrich_lead",
    "llm_draft_outreach_message",
    "llm_evaluate_qual_answer",
    "llm_review_contract",
    "llm_analyze_nps_feedback",
    "llm_suggest_next_action",
    "load_prompt",
    "list_templates",
    "get_template_info",
]
