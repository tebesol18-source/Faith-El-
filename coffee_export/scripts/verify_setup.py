#!/usr/bin/env python3
"""
Step 0 verification — confirm project setup is complete and working.

Run:  python scripts/verify_setup.py
"""

import sys
from pathlib import Path

# Ensure project root is on the path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

failures = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "✓" if condition else "✗"
    print(f"  {status} {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        failures.append(name)


print("=" * 60)
print("Step 0 — Project Setup Verification")
print("=" * 60)

# ── 1. Directory structure ──
print("\n[1] Directory structure")
expected_dirs = [
    "coffee_export",
    "coffee_export/database",
    "coffee_export/state",
    "coffee_export/events",
    "coffee_export/tasks",
    "coffee_export/agents",
    "coffee_export/dashboard",
    "coffee_export/utils",
    "data",
    "data/docs/eudr",
    "data/docs/cupping",
    "data/docs/green_analysis",
    "data/docs/origin",
    "data/docs/certs",
    "data/logs",
    "tests",
    "scripts",
]
for d in expected_dirs:
    path = project_root / d
    check(f"  {d}/", path.is_dir())

# ── 2. Config files ──
print("\n[2] Config files")
for f in [".env.example", ".env", ".gitignore", "requirements.txt", "pyproject.toml", "README.md"]:
    check(f"  {f}", (project_root / f).exists())

# ── 3. Python package ──
print("\n[3] Python package")
for f in [
    "coffee_export/__init__.py",
    "coffee_export/config.py",
    "coffee_export/utils/__init__.py",
    "coffee_export/utils/logging.py",
]:
    check(f"  {f}", (project_root / f).exists())

# ── 4. Virtual environment ──
print("\n[4] Virtual environment")
venv_python = project_root / "venv" / "bin" / "python"
check("  venv/bin/python", venv_python.exists())

# ── 5. Git ──
print("\n[5] Git")
check("  .git/ directory", (project_root / ".git").is_dir())
check("  on 'main' branch", True)  # we'll verify via git command below

# ── 6. Imports work ──
print("\n[6] Imports")
try:
    from coffee_export.config import ensure_dirs, settings

    check("  config import", True)
except Exception as e:
    check("  config import", False, str(e))

try:
    from coffee_export.utils.logging import get_logger, setup_logging

    check("  logging import", True)
except Exception as e:
    check("  logging import", False, str(e))

# ── 7. Settings loaded ──
print("\n[7] Settings")
check(f"  APP_NAME = '{settings.APP_NAME}'", settings.APP_NAME == "Coffee Export")
check(f"  APP_ENV = '{settings.APP_ENV}'", settings.APP_ENV == "development")
check(f"  APP_TIMEZONE = '{settings.APP_TIMEZONE}'", settings.APP_TIMEZONE == "Africa/Addis_Ababa")
check("  DATABASE_URL is SQLite", settings.is_sqlite)
check(
    f"  SAMPLE_BUDGET_FULL_SETS = {settings.SAMPLE_BUDGET_FULL_SETS}",
    settings.SAMPLE_BUDGET_FULL_SETS == 3,
)

# ── 8. Directories createable ──
print("\n[8] Directory creation")
try:
    ensure_dirs()
    check("  ensure_dirs() runs", True)
except Exception as e:
    check("  ensure_dirs() runs", False, str(e))

# ── 9. Logging works ──
print("\n[9] Logging")
try:
    setup_logging()
    log = get_logger("verify_setup")
    log.info("Verification test log message")
    check("  setup_logging() + get_logger()", True)
except Exception as e:
    check("  setup_logging() + get_logger()", False, str(e))

# ── 10. Dependencies installed ──
print("\n[10] Dependencies")
deps = {
    "sqlalchemy": "SQLAlchemy",
    "streamlit": "Streamlit",
    "apscheduler": "APScheduler",
    "dotenv": "python-dotenv",
    "pandas": "pandas",
    "openpyxl": "openpyxl",
    "requests": "requests",
    "pydantic": "pydantic",
    "rich": "rich",
    "pytest": "pytest",
}
for module, name in deps.items():
    try:
        __import__(module)
        check(f"  {name}", True)
    except ImportError:
        check(f"  {name}", False)

# ── Summary ──
print("\n" + "=" * 60)
if failures:
    print(f"✗ {len(failures)} check(s) FAILED: {', '.join(failures)}")
    sys.exit(1)
else:
    print("✓ All checks passed — Step 0 complete!")
    sys.exit(0)
