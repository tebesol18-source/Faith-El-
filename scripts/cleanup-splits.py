#!/usr/bin/env python3
"""
Post-split cleanup:
1. Remove duplicate local type declarations from page files (they're now in @/lib/types)
2. Remove duplicate `Page` type from @/lib/types.ts (added manually at end)
3. Fix the AdminPage "analytics" tab type bug
4. Fix the App page.tsx — remove PlaceholderPage branch
"""
import re
from pathlib import Path

BASE = Path("/home/z/my-project")

# ─── 1. Remove duplicate Page type from types.ts ───
types_file = BASE / "src/lib/types.ts"
text = types_file.read_text()
# The first occurrence is from the original decls (we want to remove that one)
# Find the FIRST `export type Page = ...` and remove it
text = re.sub(r'^export type Page = "[^"]+";\n\n', '', text, count=1, flags=re.MULTILINE)
types_file.write_text(text)
print(f"✓ Removed duplicate Page type from types.ts")

# ─── 2. Remove local type declarations from page files ───
# Each page file has types like `type DocStatus = ...` AND `import type { DocStatus } from "@/lib/types"`.
# The local declarations conflict. Remove the local ones.
type_names = re.findall(r'export type (\w+)', types_file.read_text())
print(f"  Type names that may conflict: {len(type_names)}")

page_files = sorted((BASE / "src/components/pages").glob("*.tsx"))
for pf in page_files:
    text = pf.read_text()
    orig = text
    for tn in type_names:
        # Remove `type TypeName = ...` declarations (could span multiple lines)
        # Match `type Name = ...` followed by `{ ... }` block (balanced braces)
        # OR `type Name = "literal" | "literal";` (single line)
        
        # Pattern 1: `type Name = "..." | "..." | ...;` (single-line literal type)
        pattern1 = re.compile(rf'^type {tn} = "[^"]+"(?:\s*\|\s*"[^"]+")*;\n', re.MULTILINE)
        text, n1 = pattern1.subn('', text)
        
        # Pattern 2: `type Name = {\n  ...\n};\n` (multi-line object type)
        # Match the type declaration and capture the body up to the closing `};`
        # Use a non-greedy match — works if the type body doesn't contain `};` at column 0
        pattern2 = re.compile(rf'^type {tn} = \{{[\s\S]*?^\}};\n', re.MULTILINE)
        text, n2 = pattern2.subn('', text)
        
        # Pattern 3: `type Name = OtherType;` (single-line alias)
        pattern3 = re.compile(rf'^type {tn} = [^;\n]+;\n', re.MULTILINE)
        text, n3 = pattern3.subn('', text)
    
    if text != orig:
        pf.write_text(text)
        print(f"✓ Removed local types from {pf.name}")

# ─── 3. Fix AdminPage "analytics" tab type ───
admin_file = BASE / "src/components/pages/AdminPage.tsx"
text = admin_file.read_text()
# Update useState to include "analytics"
text = re.sub(
    r'setAdminTab\)\] = useState<("system" \| "risk" \| "portfolio" \| "sellers" \| "commission")>',
    r'setAdminTab)] = useState<\1 | "analytics">',
    text,
)
admin_file.write_text(text)
print(f"✓ Fixed analytics tab in AdminPage")

# ─── 4. Fix App page.tsx — remove PlaceholderPage branch ───
page_file = BASE / "src/app/page.tsx"
text = page_file.read_text()

# Remove the PlaceholderPage branch — it's a long `&&` chain ending with `&& (...)
# Match the entire conditional expression
pattern = re.compile(
    r'\{currentPage !== "dashboard" && currentPage !== "inbox" && currentPage !== "leads" && currentPage !== "deals" && currentPage !== "inventory" && currentPage !== "samples" && currentPage !== "quotes" && currentPage !== "compliance" && currentPage !== "shipments" && currentPage !== "contracts" && currentPage !== "finance" && currentPage !== "coach" && currentPage !== "admin" && \(\s*\n\s*<PlaceholderPage title=\{pageTitles\[currentPage\]\.title\} question=\{pageTitles\[currentPage\]\.question\} />\s*\n\s*\)\s*\n\s*\}',
    re.MULTILINE,
)
text, n = pattern.subn('', text)
print(f"  Removed PlaceholderPage branch: {n} replacement(s)")

# Remove the pageTitles declaration
pattern2 = re.compile(
    r'const pageTitles: Record<Page, \{ title: string; question: string \}> = \{[\s\S]*?\};\s*\n\s*\n',
    re.MULTILINE,
)
text, n2 = pattern2.subn('', text)
print(f"  Removed pageTitles declaration: {n2} replacement(s)")

page_file.write_text(text)
print(f"✓ Fixed App page.tsx")

print("\nDone. Re-typecheck to verify.")
