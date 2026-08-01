"""
Logging configuration — structured, multi-handler logging.

Provides:
  - setup_logging()  — configure console (rich) + file (rotating) handlers
  - get_logger(name) — get a configured logger

Usage:
    from coffee_export.utils.logging import setup_logging, get_logger

    setup_logging()  # call once at app startup
    log = get_logger(__name__)
    log.info("Server started", extra={"port": 8501})
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from rich.logging import RichHandler

from coffee_export.config import LOG_FILE, ensure_dirs, settings

# Track whether logging has been configured (avoid double-setup)
_CONFIGURED = False


def setup_logging(
    level: int | None = None,
    log_file: Path | None = None,
    enable_file: bool = True,
) -> None:
    """
    Configure application-wide logging.

    Call this ONCE at application startup. Subsequent calls are no-ops.

    Args:
        level:       Logging level (default: from settings.APP_LOG_LEVEL)
        log_file:    Path to log file (default: from config LOG_FILE)
        enable_file: Whether to enable file logging (default: True)
    """
    global _CONFIGURED
    if _CONFIGURED:
        return

    if level is None:
        level = settings.log_level

    # Ensure log directory exists
    if enable_file:
        ensure_dirs()
        if log_file is None:
            log_file = LOG_FILE

    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove any pre-existing handlers (e.g. from libraries)
    root_logger.handlers.clear()

    # ── Console handler (Rich — pretty, colored output) ──
    console_handler = RichHandler(
        rich_tracebacks=True,
        show_path=settings.is_development,
        markup=True,
        log_time_format="[%X]",
    )
    console_handler.setLevel(level)
    console_handler.setFormatter(logging.Formatter("%(message)s"))
    root_logger.addHandler(console_handler)

    # ── File handler (rotating, plain text for grep/log analysis) ──
    if enable_file and log_file:
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10 MB per file
            backupCount=5,  # keep 5 rotated files
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        root_logger.addHandler(file_handler)

    # Reduce noise from third-party libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.is_development else logging.WARNING
    )
    logging.getLogger("apscheduler").setLevel(logging.INFO)

    _CONFIGURED = True

    root_logger.info(
        f"Logging initialized — env={settings.APP_ENV}, "
        f"level={logging.getLevelName(level)}, "
        f"file={log_file if enable_file else 'disabled'}"
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a configured logger.

    Always call setup_logging() once at app startup before using this.

    Args:
        name: Logger name (typically __name__ of the calling module)

    Returns:
        logging.Logger instance
    """
    return logging.getLogger(name)


# ──────────────────────────────────────────────────────────────
# Convenience: self-test when run directly
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    setup_logging()
    log = get_logger("coffee_export.utils.logging")

    log.debug("This is a debug message")
    log.info("This is an info message")
    log.warning("This is a warning message")
    log.error("This is an error message")

    try:
        raise ValueError("Sample exception for traceback demo")
    except ValueError:
        log.exception("Caught an exception — full traceback below:")
