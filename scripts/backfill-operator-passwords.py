#!/usr/bin/env python3
"""
Backfill default password hashes for existing operators.

Sets password_hash for every operator that currently has NULL. Uses the
default password "coffee123" (bcrypt-hashed, cost factor 10).

Run this once after applying migration c4d5e6f7a8b9. After running, each
operator can log in with their email + "coffee123" and should be prompted
to change their password on first login (TODO: Phase 2 will add the
"must change password" flag + UI).

Usage:
    cd /home/z/my-project
    coffee_export/venv/bin/python scripts/backfill-operator-passwords.py
"""
import sqlite3
import bcrypt
from pathlib import Path

DB_PATH = Path("/home/z/my-project/coffee_export/data/coffee_export.db")
DEFAULT_PASSWORD = "coffee123"


def main() -> None:
    if not DB_PATH.exists():
        print(f"❌ Database not found: {DB_PATH}")
        return

    db = sqlite3.connect(str(DB_PATH))

    # Find operators without a password_hash
    rows = db.execute(
        "SELECT operator_id, name, email FROM operators WHERE password_hash IS NULL"
    ).fetchall()

    if not rows:
        print("✓ All operators already have a password_hash. Nothing to do.")
        return

    print(f"Backfilling {len(rows)} operator(s) with default password '{DEFAULT_PASSWORD}':")
    for op_id, name, email in rows:
        # Generate a fresh hash (bcrypt salts automatically, so each is unique)
        pwd_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode(), bcrypt.gensalt(10)).decode()
        db.execute(
            "UPDATE operators SET password_hash = ?, updated_ts = ? WHERE operator_id = ?",
            (pwd_hash, __import__("datetime").datetime.utcnow().isoformat() + "Z", op_id),
        )
        print(f"  ✓ {op_id:15s} | {name:25s} | {email}")

    db.commit()
    db.close()
    print()
    print(f"✓ Done. Each operator can now log in with their email + '{DEFAULT_PASSWORD}'.")
    print(f"  Communicate this password to each operator out-of-band.")
    print(f"  They should change it on first login (Phase 2 will enforce this).")


if __name__ == "__main__":
    main()
