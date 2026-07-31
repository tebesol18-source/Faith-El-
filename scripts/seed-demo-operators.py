#!/usr/bin/env python3
"""
Seed the demo operator accounts needed for the ERP.

Creates (if they don't already exist):
  - admin-001    (admin@faithel.com)       — admin role
  - exporter-002 (abi@faithel.com)         — operator role

Each gets a bcrypt-hashed password (cost factor 10).

Usage:
    coffee_export/venv/bin/python scripts/seed-demo-operators.py
"""
import sqlite3
import bcrypt
from datetime import datetime, timezone, timedelta
from pathlib import Path

DB_PATH = Path("/home/z/my-project/coffee_export/data/coffee_export.db")

OPERATORS = [
    {
        "operator_id": "admin-001",
        "name": "System Administrator",
        "email": "admin@faithel.com",
        "role": "admin",
        "password": "admin123",
    },
    {
        "operator_id": "exporter-002",
        "name": "Abi Solomon",
        "email": "abi@faithel.com",
        "role": "operator",
        "password": "coffee123",
    },
]


def main() -> None:
    if not DB_PATH.exists():
        print(f"❌ Database not found: {DB_PATH}")
        return

    db = sqlite3.connect(str(DB_PATH))
    addis_tz = timezone(timedelta(hours=3))
    now = datetime.now(addis_tz).isoformat()

    print("Seeding demo operators:")
    for op in OPERATORS:
        # Check if already exists
        existing = db.execute(
            "SELECT operator_id FROM operators WHERE operator_id = ? OR LOWER(email) = ?",
            (op["operator_id"], op["email"].lower()),
        ).fetchone()
        if existing:
            # Update password hash + role if needed
            pwd_hash = bcrypt.hashpw(op["password"].encode(), bcrypt.gensalt(10)).decode()
            db.execute(
                "UPDATE operators SET name = ?, email = ?, role = ?, password_hash = ?, updated_ts = ? WHERE operator_id = ?",
                (op["name"], op["email"].lower(), op["role"], pwd_hash, now, op["operator_id"]),
            )
            print(f"  ✓ Updated {op['operator_id']:15s} | {op['email']:35s} | password='{op['password']}'")
        else:
            pwd_hash = bcrypt.hashpw(op["password"].encode(), bcrypt.gensalt(10)).decode()
            db.execute(
                """
                INSERT INTO operators (operator_id, name, email, role, status, password_hash, must_change_password, created_ts, updated_ts)
                VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?)
                """,
                (op["operator_id"], op["name"], op["email"].lower(), op["role"], pwd_hash, now, now),
            )
            print(f"  ✓ Created {op['operator_id']:15s} | {op['email']:35s} | password='{op['password']}'")

    db.commit()
    db.close()
    print()
    print("✓ Done. Demo accounts ready.")


if __name__ == "__main__":
    main()
