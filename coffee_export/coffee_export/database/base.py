"""
Database base — declarative base, engine, and session factory.

This module provides the foundation for all SQLAlchemy ORM models:
  - Base: declarative base class all models inherit from
  - engine: SQLAlchemy engine (created from settings.DATABASE_URL)
  - SessionLocal: session factory for database operations

Usage:
    from coffee_export.database.base import Base, engine, SessionLocal, get_session

    # In a script:
    with get_session() as session:
        lead = session.query(Lead).first()

    # In a long-running app (Streamlit, agent runner):
    session = SessionLocal()
    try:
        ...
        session.commit()
    finally:
        session.close()

All models are registered against Base.metadata, which Alembic uses
for autogenerate (see alembic/env.py).
"""

from __future__ import annotations

import contextlib
from collections.abc import Generator
from datetime import datetime, timedelta, timezone

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from coffee_export.config import settings
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)


# ──────────────────────────────────────────────────────────────
# Addis Ababa timezone (UTC+3, no DST)
# ──────────────────────────────────────────────────────────────

ADDIS_TZ = timezone(timedelta(hours=3))


def now_addis_iso() -> str:
    """Current timestamp as ISO 8601 string with +03:00 offset."""
    return datetime.now(ADDIS_TZ).isoformat(timespec="seconds")


# ──────────────────────────────────────────────────────────────
# Engine
# ──────────────────────────────────────────────────────────────


def _create_engine() -> Engine:
    """Create the SQLAlchemy engine with appropriate options."""
    connect_args: dict = {}
    engine_kwargs: dict = {
        "echo": False,  # set to True for SQL logging in debug
        "future": True,  # use SQLAlchemy 2.0 style
    }

    if settings.is_sqlite:
        # SQLite-specific: allow foreign keys, check_same_thread for Streamlit
        connect_args["check_same_thread"] = False
        engine_kwargs["connect_args"] = connect_args
    else:
        # PostgreSQL: connection pooling
        engine_kwargs["pool_pre_ping"] = True
        engine_kwargs["pool_size"] = 10
        engine_kwargs["max_overflow"] = 20

    engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

    # Enable foreign keys on SQLite (off by default)
    if settings.is_sqlite:

        @event.listens_for(engine, "connect")
        def _enable_fk(dbapi_connection, connection_record):  # noqa: ARG001
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    log.debug(f"Engine created: {settings.DATABASE_URL}")
    return engine


engine: Engine = _create_engine()

# Session factory — call SessionLocal() to get a new session
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    future=True,
)


# ──────────────────────────────────────────────────────────────
# Declarative Base
# ──────────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    """Declarative base for all ORM models.

    All models inherit from this class. Alembic reads Base.metadata
    for autogenerate.
    """

    pass


# ──────────────────────────────────────────────────────────────
# Session helper
# ──────────────────────────────────────────────────────────────


@contextlib.contextmanager
def get_session() -> Generator[Session, None, None]:
    """Context manager that yields a session and auto-closes.

    Commits on success, rolls back on exception.

    Usage:
        with get_session() as session:
            lead = session.query(Lead).first()
            lead.current_state = "ENRICHED"
            session.commit()  # explicit commit also works
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Create all tables (if they don't exist).

    NOTE: In production, use Alembic migrations instead:
        alembic upgrade head

    This function is for testing/dev convenience only.
    """
    # Import models so they're registered on Base.metadata
    from coffee_export.database import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    log.info("Database tables created (if not exists)")
