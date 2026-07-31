#!/usr/bin/env python3
"""
Post-process the split files to add `export` keywords:
1. Add `export` to all `type X = ...` declarations in src/lib/types.ts
2. Add `export` to the main page component function in each src/components/pages/*.tsx
3. Add `export` to layout components in src/components/layout/*.tsx
"""
import re
from pathlib import Path

BASE = Path("/home/z/my-project")

# ─── 1. Export all types in src/lib/types.ts ───
types_file = BASE / "src/lib/types.ts"
text = types_file.read_text()
# Add `export` to every `type X =` declaration (but not to ones already exported)
text = re.sub(r'^type (\w+) =', r'export type \1 =', text, flags=re.MULTILINE)
types_file.write_text(text)
print(f"✓ Exported all types in {types_file.relative_to(BASE)}")

# ─── 2. Export the main function in each page file ───
# The "main" function in each page file is the one whose name matches the filename.
page_files = sorted((BASE / "src/components/pages").glob("*.tsx"))
for pf in page_files:
    main_name = pf.stem  # e.g., "DashboardPage" from "DashboardPage.tsx"
    text = pf.read_text()
    # Add `export` to `function main_name(` — but only the first occurrence
    pattern = re.compile(rf'^function {re.escape(main_name)}\(', re.MULTILINE)
    new_text, n = pattern.subn(rf'export function {main_name}(', text)
    if n > 0:
        pf.write_text(new_text)
        print(f"✓ Exported {main_name} from {pf.relative_to(BASE)}")
    else:
        print(f"⚠️  Could not find `function {main_name}(` in {pf.relative_to(BASE)}")

# ─── 3. Export layout components ───
layout_files = sorted((BASE / "src/components/layout").glob("*.tsx"))
for lf in layout_files:
    main_name = lf.stem  # "Sidebar" or "TopHeader"
    text = lf.read_text()
    pattern = re.compile(rf'^function {re.escape(main_name)}\(', re.MULTILINE)
    new_text, n = pattern.subn(rf'export function {main_name}(', text)
    if n > 0:
        lf.write_text(new_text)
        print(f"✓ Exported {main_name} from {lf.relative_to(BASE)}")
    else:
        print(f"⚠️  Could not find `function {main_name}(` in {lf.relative_to(BASE)}")

# ─── 4. Fix the "analytics" tab issue in AdminPage.tsx (pre-existing bug) ───
# The state was declared without "analytics" but later code tries to set it to "analytics".
admin_file = BASE / "src/components/pages/AdminPage.tsx"
text = admin_file.read_text()
# Update useState declaration to include "analytics"
text = re.sub(
    r'setAdminTab\)\] = useState<"system" \| "risk" \| "portfolio" \| "sellers" \| "commission">',
    'setAdminTab)] = useState<"system" | "risk" | "portfolio" | "sellers" | "commission" | "analytics">',
    text,
    count=1,
)
admin_file.write_text(text)
print(f"✓ Fixed analytics tab type in AdminPage")

print("\nDone. Re-running type check...")
