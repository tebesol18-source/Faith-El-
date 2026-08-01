"""
Prompt Template Loader — loads .md files from the prompts/ directory.

Templates are Markdown files with:
  - A title (first # line)
  - Description text
  - {variable} placeholders
  - A ## Variables section documenting each placeholder

Usage:
    from coffee_export.ai.templates import load_prompt, list_templates

    # Load a template and render with variables
    prompt = load_prompt("enrich_lead", {
        "company_name": "Falcon Coffees",
        "country": "United Kingdom",
        "notes": "Major green coffee importer...",
    })

    # List available templates
    templates = list_templates()
"""

from __future__ import annotations

import re
from pathlib import Path

from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"


def load_prompt(template_name: str, variables: dict[str, str]) -> str:
    """
    Load a prompt template from prompts/{template_name}.md and render it
    with the provided variables.

    Variables in the template use {variable_name} syntax.
    Missing variables are left as-is (not replaced).
    Extra variables are ignored.
    """
    template_path = PROMPTS_DIR / f"{template_name}.md"

    if not template_path.exists():
        log.warning(f"Prompt template not found: {template_path}")
        return ""

    content = template_path.read_text(encoding="utf-8")

    # Render variables
    for key, value in variables.items():
        content = content.replace(f"{{{key}}}", str(value))

    # Remove the ## Variables section (documentation only, not part of the prompt)
    content = re.sub(r"\n## Variables\n.*$", "", content, flags=re.DOTALL)

    return content.strip()


def list_templates() -> list[dict[str, str]]:
    """List all available prompt templates with their titles."""
    templates: list[dict[str, str]] = []

    if not PROMPTS_DIR.exists():
        return templates

    for md_file in sorted(PROMPTS_DIR.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        # Extract title from first # line
        title_match = re.match(r"^#\s+(.+)$", content, re.MULTILINE)
        title = title_match.group(1) if title_match else md_file.stem

        # Extract variables
        variables: list[str] = []
        var_section = re.search(r"## Variables\n(.+)$", content, re.DOTALL)
        if var_section:
            for line in var_section.group(1).strip().split("\n"):
                var_match = re.match(r"-\s+`(\w+)`", line.strip())
                if var_match:
                    variables.append(var_match.group(1))

        templates.append(
            {
                "name": md_file.stem,
                "title": title,
                "file": str(md_file),
                "variables": variables,
            }
        )

    return templates


def get_template_info(template_name: str) -> dict[str, str] | None:
    """Get info about a specific template."""
    for t in list_templates():
        if t["name"] == template_name:
            return t
    return None
