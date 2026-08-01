"""
Configuration — single source of truth for all settings.

Loads from environment variables (via .env file) with sensible defaults.
Every module in the project imports from here — no hardcoded paths
or settings anywhere else.

Usage:
    from coffee_export.config import settings, BASE_DIR, DB_PATH

    engine = create_engine(settings.DATABASE_URL)
    log.info(f"Starting {settings.APP_NAME} in {settings.APP_ENV} mode")

Environment variables are loaded from .env (via python-dotenv).
See .env.example for all available options.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load .env file — must happen before any settings are read.
# override=True so our .env takes precedence over any pre-existing
# system env vars (e.g. a global DATABASE_URL from the host).
load_dotenv(override=True)


# ──────────────────────────────────────────────────────────────
# Project paths (resolved relative to project root = parent of this file's package)
# ──────────────────────────────────────────────────────────────

# This file is at:  <project_root>/coffee_export/config.py
# Project root is:  <project_root>/
PACKAGE_DIR = Path(__file__).resolve().parent
BASE_DIR = PACKAGE_DIR.parent


def _resolve_path(env_key: str, default: str) -> Path:
    """Resolve a path from env var, relative to project root."""
    value = os.environ.get(env_key, default)
    p = Path(value)
    if not p.is_absolute():
        p = BASE_DIR / p
    return p


DATA_DIR = _resolve_path("DATA_DIR", "data")
DOCS_DIR = _resolve_path("DOCS_DIR", "data/docs")
LOGS_DIR = _resolve_path("LOGS_DIR", "data/logs")

DB_PATH = DATA_DIR / "coffee_export.db"
LOG_FILE = LOGS_DIR / "coffee_export.log"

# Document subdirectories (for lot attachments)
DOCS_EUDR_DIR = DOCS_DIR / "eudr"
DOCS_CUPPING_DIR = DOCS_DIR / "cupping"
DOCS_GREEN_ANALYSIS_DIR = DOCS_DIR / "green_analysis"
DOCS_ORIGIN_DIR = DOCS_DIR / "origin"
DOCS_CERTS_DIR = DOCS_DIR / "certs"

ALL_DOC_DIRS = (
    DOCS_EUDR_DIR,
    DOCS_CUPPING_DIR,
    DOCS_GREEN_ANALYSIS_DIR,
    DOCS_ORIGIN_DIR,
    DOCS_CERTS_DIR,
)


# ──────────────────────────────────────────────────────────────
# Typed settings dataclass
# ──────────────────────────────────────────────────────────────


def _get_int(key: str, default: int) -> int:
    """Read an integer env var with fallback."""
    try:
        return int(os.environ.get(key, str(default)))
    except (ValueError, TypeError):
        return default


def _get_list(key: str, default: str) -> list[str]:
    """Read a comma-separated list env var."""
    value = os.environ.get(key, default)
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """All application settings, loaded from environment variables."""

    # ── App ──
    APP_NAME: str = field(default_factory=lambda: os.getenv("APP_NAME", "Coffee Export"))
    APP_ENV: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    APP_TIMEZONE: str = field(
        default_factory=lambda: os.getenv("APP_TIMEZONE", "Africa/Addis_Ababa")
    )
    APP_LOG_LEVEL: str = field(default_factory=lambda: os.getenv("APP_LOG_LEVEL", "INFO"))

    # ── Database ──
    DATABASE_URL: str = field(
        default_factory=lambda: os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
    )

    # ── Sample Budget (weekly caps) ──
    SAMPLE_BUDGET_FULL_SETS: int = field(
        default_factory=lambda: _get_int("SAMPLE_BUDGET_FULL_SETS", 3)
    )
    SAMPLE_BUDGET_FALLBACK_150G: int = field(
        default_factory=lambda: _get_int("SAMPLE_BUDGET_FALLBACK_150G", 2)
    )
    SAMPLE_BUDGET_TYPE_B: int = field(default_factory=lambda: _get_int("SAMPLE_BUDGET_TYPE_B", 2))

    # ── Task Queue ──
    TASK_QUEUE_TIMEZONE: str = field(
        default_factory=lambda: os.getenv("TASK_QUEUE_TIMEZONE", "Africa/Addis_Ababa")
    )
    DAILY_SYNC_HOUR: int = field(default_factory=lambda: _get_int("DAILY_SYNC_HOUR", 8))
    DAILY_SYNC_MINUTE: int = field(default_factory=lambda: _get_int("DAILY_SYNC_MINUTE", 0))

    # ── Dashboard ──
    DASHBOARD_PORT: int = field(default_factory=lambda: _get_int("DASHBOARD_PORT", 8501))
    DASHBOARD_HOST: str = field(default_factory=lambda: os.getenv("DASHBOARD_HOST", "localhost"))

    # ── Agents ──
    AGENT_BATCH_SIZE: int = field(default_factory=lambda: _get_int("AGENT_BATCH_SIZE", 50))
    AGENT1_CONFIRMATION_SLA_HOURS: int = field(
        default_factory=lambda: _get_int("AGENT1_CONFIRMATION_SLA_HOURS", 24)
    )

    # ── Computed properties ──
    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def log_level(self) -> int:
        """Numeric log level for logging.basicConfig."""
        import logging

        levels = {
            "DEBUG": logging.DEBUG,
            "INFO": logging.INFO,
            "WARNING": logging.WARNING,
            "ERROR": logging.ERROR,
            "CRITICAL": logging.CRITICAL,
        }
        return levels.get(self.APP_LOG_LEVEL.upper(), logging.INFO)


# Singleton — import this everywhere
settings = Settings()


# ──────────────────────────────────────────────────────────────
# Directory initialization
# ──────────────────────────────────────────────────────────────


def ensure_dirs() -> None:
    """Create all required directories. Call once at application startup."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    for d in ALL_DOC_DIRS:
        d.mkdir(parents=True, exist_ok=True)


def doc_path(category: str, lot_id: str, ext: str = "pdf") -> Path:
    """Standard document path for a lot + category.

    Args:
        category: One of 'eudr', 'cupping', 'green_analysis', 'origin', 'certs'
        lot_id:   The lot identifier (e.g. 'LOT-25-0001')
        ext:      File extension without dot (default 'pdf')

    Returns:
        Path to the document file
    """
    category_map = {
        "eudr": DOCS_EUDR_DIR,
        "cupping": DOCS_CUPPING_DIR,
        "green_analysis": DOCS_GREEN_ANALYSIS_DIR,
        "origin": DOCS_ORIGIN_DIR,
        "certs": DOCS_CERTS_DIR,
    }
    base = category_map.get(category, DOCS_DIR / category)
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{lot_id}_{category}.{ext}"
