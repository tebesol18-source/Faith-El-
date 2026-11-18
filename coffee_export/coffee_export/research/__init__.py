"""
Research foundation — Evidence Ledger + Persistent Facts (TryComp Phase 1).

Faith-El-native implementation of the approved TryComp capabilities B
(Evidence Ledger) and C (Persistent Facts), per
docs/trycomp-integration-progress.md §3. Two org-scoped tables
(research_evidence, research_facts) and two services:

  * EvidenceLedger — append-only observations with honest source
    attribution, reversible suppression and explicit staleness;
  * FactStore — the current-state layer, deterministically recomputed
    from the live evidence set, with human-verified locking.

Phase 1 ships the foundation only: nothing in the application calls these
services yet (Phase 3 wires them into durable research execution).
"""

from coffee_export.research.common import (
    EVIDENCE_STATUSES,
    FACT_STATUSES,
    INDEPENDENT_SOURCE_TYPES,
    SOURCE_TYPES,
    URL_SOURCE_TYPES,
    ResearchNotFoundError,
    canonical_json,
    validate_source,
)
from coffee_export.research.evidence import EvidenceLedger
from coffee_export.research.facts import FactStore, recompute_fact

__all__ = [
    "EVIDENCE_STATUSES",
    "FACT_STATUSES",
    "INDEPENDENT_SOURCE_TYPES",
    "SOURCE_TYPES",
    "URL_SOURCE_TYPES",
    "EvidenceLedger",
    "FactStore",
    "ResearchNotFoundError",
    "canonical_json",
    "recompute_fact",
    "validate_source",
]
