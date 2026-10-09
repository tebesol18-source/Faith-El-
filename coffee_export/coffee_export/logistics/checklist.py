"""The per-shipment export checklist template (Logistics Command Center).

Canonical source: ``data/logistics-checklist-template.json`` at the repo
root — shared with the Next.js runtime so the Python-seeded and JS-seeded
checklists are IDENTICAL by construction (no duplicated list to drift).

Every step is human-toggled: Faith-El never marks a step done on its own,
because completing a step (booking, pickup, customs…) happens with EXTERNAL
providers and can only be attested by an operator.
"""

from __future__ import annotations

import json
from pathlib import Path

# The template lives at the repo root's data/ dir. Candidate locations
# cover source-checkout runs (repo root via parents[3]) and CWD-launched
# services. If none exist we fail loudly — the checklist must never be
# invented at runtime.
_CANDIDATES = [
    Path(__file__).resolve().parents[3] / "data" / "logistics-checklist-template.json",
    Path.cwd() / "data" / "logistics-checklist-template.json",
    Path.cwd().parent / "data" / "logistics-checklist-template.json",
]
_TEMPLATE_PATH = next((p for p in _CANDIDATES if p.exists()), _CANDIDATES[0])


def _load_template() -> list[tuple[str, str]]:
    try:
        raw = json.loads(_TEMPLATE_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as e:  # pragma: no cover - packaging error
        raise RuntimeError(
            f"Checklist template missing: {_TEMPLATE_PATH}. The logistics "
            "checklist must never be invented — restore the data file."
        ) from e
    entries = raw.get("entries")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError(
            f"Checklist template at {_TEMPLATE_PATH} has no entries — "
            "refusing to seed an empty checklist."
        )
    out: list[tuple[str, str]] = []
    for e in entries:
        title = str(e.get("title", "")).strip()
        if not title:
            raise RuntimeError(f"Checklist template entry without title: {e!r}")
        out.append((title, str(e.get("detail", "")).strip()))
    return out


#: [(title, detail), ...] — 18 steps of the coffee export journey.
EXPORT_CHECKLIST_TEMPLATE: list[tuple[str, str]] = _load_template()
