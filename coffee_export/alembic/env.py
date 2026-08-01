"""
Alembic environment configuration.

Wires Alembic to:
  - Read DATABASE_URL from coffee_export.config.settings (loaded from .env)
  - Use SQLAlchemy models' metadata for autogenerate (target_metadata)
  - Support both online (real DB) and offline (SQL script) migration modes

When we add SQLAlchemy models in step 2, they'll be imported here so
Alembic can detect schema changes automatically.
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# ── Ensure project root is on sys.path so we can import the package ──
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# ── Import our config (loads .env via python-dotenv) ──
from coffee_export.config import settings  # noqa: E402
from coffee_export.utils.logging import get_logger, setup_logging  # noqa: E402

# ── Initialize logging ──
setup_logging()
log = get_logger("alembic.env")

# ── Alembic config object (from alembic.ini) ──
config = context.config

# Override sqlalchemy.url with our settings (single source of truth)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Interpret config file for Python logging (if present)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Target metadata for autogenerate ──
# Import Base from our models so Alembic can detect schema changes.
# This is the key wiring: when models change, `alembic revision --autogenerate`
# compares the models' metadata to the database and generates a migration.
from coffee_export.database import models  # noqa: E402, F401 — registers all models
from coffee_export.database.base import Base  # noqa: E402

target_metadata = Base.metadata
log.debug(f"Loaded {len(target_metadata.tables)} SQLAlchemy models")


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    Generates SQL scripts without connecting to the database.
    Useful for review:  alembic upgrade head --sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.

    Connects to the database and applies migrations directly.
    Default mode:  alembic upgrade head
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    log.info("Running migrations in OFFLINE mode (generating SQL)")
    run_migrations_offline()
else:
    log.info(f"Running migrations in ONLINE mode — DB: {settings.DATABASE_URL}")
    run_migrations_online()
