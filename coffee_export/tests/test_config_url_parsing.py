"""Regression tests for database URL resolution (config.py).

Root cause fixed here: the Python stack used to fall back to DATABASE_URL —
which belongs to the Prisma CLI in this repo and uses Prisma's ``file:``
format. Whenever a .env with ``DATABASE_URL=file:...`` was loaded, every
Python component (email bridge, agents, dashboard) crashed at import time
with ``sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL``.

Contract after the fix:
  * Only COFFEE_DATABASE_URL is read (the var shared with the JS side).
  * A Prisma-style ``file:...`` value handed to COFFEE_DATABASE_URL is
    normalized to a ``sqlite:///`` URL instead of crashing.
  * With neither var set, the Settings default resolves to a valid
    ``sqlite:///`` URL over the project's DB_PATH default.
  * A Prisma-style DATABASE_URL in the environment is ignored entirely.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import make_url

from coffee_export.config import Settings


def test_prisma_style_database_url_is_ignored() -> None:
    """DATABASE_URL (Prisma's variable) must never reach SQLAlchemy."""
    os.environ["DATABASE_URL"] = "file:../state/coffee_export.db"
    try:
        url = Settings().DATABASE_URL
        assert url.startswith("sqlite:///"), (
            f"DATABASE_URL leaked into SQLAlchemy: {url!r}"
        )
        make_url(url)  # must parse
    finally:
        os.environ.pop("DATABASE_URL", None)


def test_coffee_database_url_passthrough() -> None:
    os.environ["COFFEE_DATABASE_URL"] = "sqlite:////tmp/somewhere/test.db"
    try:
        url = Settings().DATABASE_URL
        assert url == "sqlite:////tmp/somewhere/test.db"
        make_url(url)
    finally:
        os.environ.pop("COFFEE_DATABASE_URL", None)


def test_prisma_style_coffee_database_url_is_normalized() -> None:
    """A file: URL in COFFEE_DATABASE_URL is converted, not crashed on."""
    os.environ["COFFEE_DATABASE_URL"] = "file:state/coffee_export.db"
    try:
        url = Settings().DATABASE_URL
        assert url.startswith("sqlite:///"), f"not normalized: {url!r}"
        make_url(url)
    finally:
        os.environ.pop("COFFEE_DATABASE_URL", None)


def test_default_url_is_parseable() -> None:
    os.environ.pop("COFFEE_DATABASE_URL", None)
    os.environ.pop("DATABASE_URL", None)
    url = Settings().DATABASE_URL
    assert url.startswith("sqlite:///")
    make_url(url)
