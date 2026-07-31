#!/usr/bin/env python3
"""
Reset ALL operator passwords to known defaults.

Sets:
  - exporter-001 (Marcus Bell)        → password "coffee123"
  - exporter-002 (Abi Solomon)        → password "coffee123"
  - admin-001    (admin@faithel.com) → password "admin123"

This is a one-time reset for development. After running, communicate the
password to each operator out-of-band. They should change it on first login
(Phase 2 will add the "must change password" flag + UI).

Usage:
    cd /home/z/my-project
    coffee_export/venv/bin/python scripts/reset-operator-passwords.py
"""
import sqlite3
import bcrypt
from datetime import datetime, timezone, timedelta
from pathlib import Path

DB_PATH = Path("/home/z/my-project/coffee_export/data/coffee_export.db")

# Map operator_id → default password
PASSWORD_MAP = {
    "exporter-001": "coffee123",
    "exporter-002": "coffee123",
    "admin-001": "admin123",
}


def main() -> None:
    if not DB_PATH.exists():
        print(f"❌ Database not found: {DB_PATH}")
        return

    db = sqlite3.connect(str(DB_PATH))
    addis_tz = timezone(timedelta(hours=3))
    now = datetime.now(addis_tz).isoformat()

    print("Resetting operator passwords:")
    for op_id, password in PASSWORD_MAP.items():
        row = db.execute(
            "SELECT email FROM operators WHERE operator_id = ?", (op_id,)
        ).fetchone()
        if not row:
            print(f"  ⚠️  {op_id} not found in operators table — skipping")
            continue

        # Generate a fresh bcrypt hash
        pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()
        db.execute(
            "UPDATE operators SET password_hash = ?, updated_ts = ? WHERE operator_id = ?",
            (pwd_hash, now, op_id),
        )
        print(f"  ✓ {op_id:15s} | {row[0]:35s} | password='{password}'")

    db.commit()
    db.close()
    print()
    print("✓ Done. Communicate these passwords to each operator out-of-band.")


if __name__ == "__main__":
    main()
