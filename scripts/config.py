"""
Configuration — single source of truth for all paths.

All paths are env-var-driven with sensible defaults. Deploy on any OS,
any cloud, any container — no code changes needed.

Environment variables:
    COFFEE_EXPORT_BASE   Base directory (default: /home/z/my-project)
    COFFEE_EXPORT_DB     SQLite database path (default: $BASE/state/coffee_export.db)
    COFFEE_EXPORT_DOCS   Document attachments dir (default: $BASE/state/docs)

Usage in any script:
    from config import DB_PATH, DOCS_DIR, BASE_DIR
"""

import os
from pathlib import Path

BASE_DIR = Path(os.environ.get("COFFEE_EXPORT_BASE", "/home/z/my-project"))
DB_PATH = Path(os.environ.get("COFFEE_EXPORT_DB", BASE_DIR / "state" / "coffee_export.db"))
DOCS_DIR = Path(os.environ.get("COFFEE_EXPORT_DOCS", BASE_DIR / "state" / "docs"))

# Addis Ababa timezone (UTC+3, no DST)
ADDIS_TZ_OFFSET_HOURS = 3

# Document subdirectories (relative to DOCS_DIR)
DOC_SUBDIRS = ("eudr", "cupping", "green_analysis", "origin", "certs")


def ensure_dirs() -> None:
    """Create all required directories. Call once at startup."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    for sub in DOC_SUBDIRS:
        (DOCS_DIR / sub).mkdir(parents=True, exist_ok=True)


def doc_path(category: str, lot_id: str, ext: str = "pdf") -> Path:
    """Standard document path for a lot + category."""
    return DOCS_DIR / category / f"{lot_id}_{category}.{ext}"
