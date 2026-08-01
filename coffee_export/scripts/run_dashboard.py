#!/usr/bin/env python3
"""
Launch the Streamlit dashboard.

Usage:
    python scripts/run_dashboard.py

The dashboard runs at http://localhost:8501 by default.
Configure host/port in .env (DASHBOARD_HOST, DASHBOARD_PORT).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.config import settings
from coffee_export.utils.logging import setup_logging


def main() -> int:
    setup_logging()

    app_path = Path(__file__).resolve().parent.parent / "coffee_export" / "dashboard" / "app.py"

    print(f"{'='*60}")
    print(f"  {settings.APP_NAME} — Dashboard")
    print(f"{'='*60}")
    print(f"  URL: http://{settings.DASHBOARD_HOST}:{settings.DASHBOARD_PORT}")
    print(f"  Environment: {settings.APP_ENV}")
    print(f"  Database: {settings.DATABASE_URL}")
    print(f"{'='*60}")
    print()

    cmd = [
        sys.executable,
        "-m",
        "streamlit",
        "run",
        str(app_path),
        "--server.port",
        str(settings.DASHBOARD_PORT),
        "--server.address",
        settings.DASHBOARD_HOST,
    ]

    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"\nDashboard failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
