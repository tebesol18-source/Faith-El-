"""Agent registry — maps agent IDs to their classes.

Auto-imports all agent modules on first access so they self-register.
"""

from __future__ import annotations

import importlib

from coffee_export.agents.base import BaseAgent
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

REGISTRY: dict[str, type[BaseAgent]] = {}
_AGENTS_IMPORTED = False


def _ensure_all_agents_imported() -> None:
    """Import all agent modules so they self-register via register_agent().

    This is called automatically by get_agent_class() and
    list_registered_agents() so callers never need to worry about
    whether the modules have been imported.
    """
    global _AGENTS_IMPORTED
    if _AGENTS_IMPORTED:
        return
    _AGENTS_IMPORTED = True

    agent_modules = [
        "coffee_export.agents.agent1_supplier",
        "coffee_export.agents.agent2_enrichment",
        "coffee_export.agents.agent3_outreach",
        "coffee_export.agents.agent4_sample",
        "coffee_export.agents.agent5_compliance",
        "coffee_export.agents.agent6_logistics",
        "coffee_export.agents.agent7_relationship",
    ]

    for module_name in agent_modules:
        try:
            importlib.import_module(module_name)
            log.debug(f"Imported agent module: {module_name}")
        except Exception as e:
            log.warning(f"Failed to import agent module {module_name}: {e}")

    log.info(f"Agent registry populated: {sorted(REGISTRY.keys())}")


def register_agent(agent_id: str, agent_class: type[BaseAgent]) -> None:
    REGISTRY[agent_id] = agent_class


def get_agent_class(agent_id: str) -> type[BaseAgent] | None:
    _ensure_all_agents_imported()
    return REGISTRY.get(agent_id)


def list_registered_agents() -> list[str]:
    _ensure_all_agents_imported()
    return sorted(REGISTRY.keys())


def create_agent(agent_id: str) -> BaseAgent | None:
    _ensure_all_agents_imported()
    agent_class = REGISTRY.get(agent_id)
    if agent_class is None:
        return None
    return agent_class()
