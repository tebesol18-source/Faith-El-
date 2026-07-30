#!/usr/bin/env python3
"""
Mechanical refactor: replace localStorage x-auth-token headers with CSRF tokens.

For each .tsx file:
  1. Replace `"x-auth-token": localStorage.getItem("coffee_erp_token") || ""`
     with `"x-csrf-token": getCsrfToken() || ""`
  2. Add `import { getCsrfToken } from "@/lib/auth-client"` if not already present
"""
import re
from pathlib import Path

FILES = [
    "src/app/page.tsx",
    "src/components/pages/ChangePasswordPage.tsx",
    "src/components/pages/AdminPage.tsx",
]

BASE = Path("/home/z/my-project")

OLD_PATTERN = '"x-auth-token": localStorage.getItem("coffee_erp_token") || ""'
NEW_PATTERN = '"x-csrf-token": getCsrfToken() || ""'

for rel in FILES:
    fpath = BASE / rel
    text = fpath.read_text()
    count = text.count(OLD_PATTERN)
    if count == 0:
        print(f"  · {rel}: no matches (already updated?)")
        continue

    text = text.replace(OLD_PATTERN, NEW_PATTERN)

    # Add import if not already present
    if "getCsrfToken" not in text.split("export")[0]:  # check only in import section
        # Find the last import line and add after it
        lines = text.split("\n")
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_import_idx = i
        if last_import_idx >= 0:
            lines.insert(last_import_idx + 1, 'import { getCsrfToken } from "@/lib/auth-client";')
            text = "\n".join(lines)

    fpath.write_text(text)
    print(f"  ✓ {rel}: replaced {count} reference(s)")
