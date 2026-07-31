#!/usr/bin/env python3
"""
Final, correct page.tsx splitter.
Uses scripts/all-decls.json to know the exact boundaries of every top-level declaration.

Grouping rules:
- Auth helpers → src/lib/auth-client.ts
- Page type → src/lib/types.ts (added separately)
- All other types → src/lib/types.ts
- navGroups → src/lib/nav.ts
- Sidebar, TopHeader → src/components/layout/
- For each Page component:
    Include all declarations between the END of the previous Page function
    and the END of this Page function.
  This captures all helper types, consts, and sub-functions that belong to that page.
- App function → src/app/page.tsx (rewritten as the shell)
"""
import json
import re
from pathlib import Path

BASE = Path("/home/z/my-project")
ORIGINAL = Path("/tmp/original-page.tsx")

lines = ORIGINAL.read_text().splitlines(keepends=True)

with open(BASE / "scripts/all-decls.json") as f:
    decls = json.load(f)

# Helper to grab source lines for a declaration
def src_of(d):
    return "".join(lines[d["start"] - 1 : d["end"]])

# ─── 1. Group declarations ───
# Auth client declarations
auth_decl_names = {"ADMIN_EMAIL", "_authToken", "getAuthToken", "setAuthToken", "clearAuthToken", "apiFetch"}

# Identify the "page" functions in order
page_function_names = [
    "DashboardPage", "InboxPage", "LeadsPage", "DealsPage", "InventoryPage",
    "SamplesPage", "QuotesPage", "CompliancePage", "ShipmentsPage",
    "ContractsPage", "FinancePage", "CoachPage", "AdminPage",
    "LoginPage", "PlaceholderPage",
]

# Find each page function's index in decls
page_fn_indices = {}
for i, d in enumerate(decls):
    if d["kind"] == "function" and d["name"] in page_function_names:
        page_fn_indices[d["name"]] = i

# For each page function, find the boundary: previous page function's end → this page function's end
# The first page function's "boundary" starts after TopHeader (or after Sidebar/TopHeader).
# We'll use the previous page function's end + 1 as the start.
# For the first page function (DashboardPage), the start is after TopHeader's end.

# Find TopHeader's end
topheader_end = next(d["end"] for d in decls if d["name"] == "TopHeader")

# Build groups: each group is a list of declarations
groups = {}  # page_name -> list of decls

# Sort page function names by their decl index
ordered_page_fns = sorted(page_fn_indices.keys(), key=lambda n: page_fn_indices[n])

prev_end = topheader_end  # initial boundary
for page_name in ordered_page_fns:
    idx = page_fn_indices[page_name]
    page_fn = decls[idx]
    
    # Collect all decls between prev_end and page_fn.end (inclusive of page_fn)
    group = []
    for d in decls:
        if d["start"] > prev_end and d["end"] <= page_fn["end"]:
            group.append(d)
    groups[page_name] = group
    prev_end = page_fn["end"]

# Special groups: auth-client, types, nav, layout
auth_group = [d for d in decls if d["name"] in auth_decl_names]
# Types: all type declarations EXCEPT Page (Page goes in types.ts too actually)
types_group = [d for d in decls if d["kind"] == "type"]
# Layout: Sidebar, TopHeader
layout_group = [d for d in decls if d["name"] in ("Sidebar", "TopHeader")]
# Nav: navGroups
nav_group = [d for d in decls if d["name"] == "navGroups"]
# App
app_group = [d for d in decls if d["name"] == "App"]

# Print summary
print("Groups:")
print(f"  auth-client: {len(auth_group)} decls")
print(f"  types: {len(types_group)} decls")
print(f"  nav: {len(nav_group)} decls")
print(f"  layout: {len(layout_group)} decls")
for page_name in ordered_page_fns:
    print(f"  {page_name}: {len(groups[page_name])} decls")
print(f"  App: {len(app_group)} decls")

# ─── 2. Build shared lib files ───

# All lucide-react icons used in the original imports
ALL_LUCIDE_IMPORTS = [
    "LayoutDashboard", "Inbox as InboxIcon", "Users", "Handshake", "Package", "FlaskConical",
    "FileText", "ScrollText", "Truck", "DollarSign", "Sparkles",
    "ChevronDown", "Menu", "Plus", "ArrowRight", "ArrowUp",
    "Mail", "CheckCircle2", "Ship", "Clock",
    "TrendingUp", "ChevronRight", "Coffee", "Bot", "Star",
    "AlertTriangle", "Phone", "Send", "Search", "Filter",
    "Paperclip", "MoreHorizontal", "Archive", "Trash2",
    "Circle", "Tag", "Calendar", "MapPin", "FileSignature", "X as XIcon",
    "ArrowDown", "DollarSign as Dollar", "Package as PackageIcon",
    "PanelLeftClose", "PanelLeft",
    "ShieldCheck", "Leaf", "Award", "FileCheck", "Globe", "Wind", "CheckSquare", "AlertCircle", "Upload", "RefreshCw", "FileX", "FileClock",
    "LogOut", "Lock", "Eye", "EyeOff", "UserCog", "Activity", "Server",
]

available_icons = set()
for imp in ALL_LUCIDE_IMPORTS:
    if " as " in imp:
        available_icons.add(imp.split(" as ")[1].strip())
    else:
        available_icons.add(imp.strip())

def icons_used_in(text):
    used = set()
    for icon in available_icons:
        if re.search(r'\b' + re.escape(icon) + r'\b', text):
            used.add(icon)
    return used

def map_icon_to_import(icon_name):
    for imp in ALL_LUCIDE_IMPORTS:
        if " as " in imp:
            alias = imp.split(" as ")[1].strip()
            if alias == icon_name:
                return imp
        else:
            if imp.strip() == icon_name:
                return imp
    return None

def find_types_used(text, type_names):
    used = set()
    for t in type_names:
        if re.search(r'(?<![.\w])' + re.escape(t) + r'\b', text):
            used.add(t)
    return used

def find_auth_helpers_used(text):
    helpers = {"ADMIN_EMAIL", "getAuthToken", "setAuthToken", "clearAuthToken", "apiFetch"}
    used = set()
    for h in helpers:
        if re.search(r'\b' + re.escape(h) + r'\b', text):
            used.add(h)
    return used

# ─── Write src/lib/auth-client.ts ───
auth_client_text = '''"use client";

/**
 * Client-side authentication helpers.
 * Used by every page component to send authenticated API requests.
 */

'''
# Add `export` to each declaration
for d in auth_group:
    text = src_of(d).rstrip() + "\n\n"
    # Add export keyword
    text = re.sub(r'^(function|const|let) ', r'export \1 ', text, count=1, flags=re.MULTILINE)
    auth_client_text += text

(BASE / "src/lib/auth-client.ts").write_text(auth_client_text)
print("✓ src/lib/auth-client.ts")

# ─── Write src/lib/types.ts ───
# All type declarations
all_type_names = [d["name"] for d in types_group] + ["Page"]
types_text = '''/**
 * Shared TypeScript types used across all page components.
 * All types are exported so individual page files can import only what they need.
 */

'''
for d in types_group:
    text = src_of(d).rstrip() + "\n\n"
    # Add export keyword
    text = re.sub(r'^type ', r'export type ', text, count=1, flags=re.MULTILINE)
    types_text += text

# Add Page type
types_text += '''export type Page = "dashboard" | "inbox" | "leads" | "deals" | "inventory" | "samples" | "quotes" | "contracts" | "shipments" | "compliance" | "finance" | "coach" | "admin";
'''

(BASE / "src/lib/types.ts").write_text(types_text)
print(f"✓ src/lib/types.ts ({len(types_group)} types)")

# ─── Write src/lib/nav.ts ───
nav_text = '''/**
 * Sidebar navigation groups.
 * Used by both admin (System only) and seller (everything except System) roles.
 */
"use client";

import {
  LayoutDashboard, Inbox as InboxIcon, Users, Handshake, Package, FlaskConical,
  FileText, ScrollText, Truck, DollarSign, Sparkles, ShieldCheck,
} from "lucide-react";
import type { Page } from "@/lib/types";

export type NavItem = {
  icon: any;
  label: string;
  page: Page;
  badge?: number;
  highlight?: boolean;
};

export type NavGroup = {
  label: string | null;
  items: NavItem[];
};

'''
# Add navGroups with proper type annotation
nav_src = src_of(nav_group[0])
nav_src = nav_src.replace(
    'const navGroups: { label: string | null; items: { icon: any; label: string; page: Page; badge?: number; highlight?: boolean }[] }[] = [',
    'export const navGroups: NavGroup[] = ['
)
nav_text += nav_src.rstrip() + "\n"
(BASE / "src/lib/nav.ts").write_text(nav_text)
print("✓ src/lib/nav.ts")

# ─── Write layout components ───
def write_component_file(filepath, decl_list, main_name, *, uses_nav=False):
    """Write a component file with proper imports. `main_name` is the function to export."""
    # Build the source text — all decls concatenated
    body_text = ""
    for d in decl_list:
        body_text += src_of(d).rstrip() + "\n\n"
    
    # Add `export` to the main function only (other decls are local helpers)
    pattern = re.compile(rf'^function {re.escape(main_name)}\(', re.MULTILINE)
    body_text = pattern.sub(rf'export function {main_name}(', body_text, count=1)
    
    # Build imports
    imports = []
    
    # React hooks
    react_hooks = []
    for hook in ["useState", "useEffect", "useRef", "useMemo", "useCallback"]:
        if re.search(r'\b' + hook + r'\b', body_text):
            react_hooks.append(hook)
    if react_hooks:
        imports.append(f"import {{ {', '.join(react_hooks)} }} from \"react\";")
    
    # Lucide icons
    icons = icons_used_in(body_text)
    if icons:
        icon_imports = sorted({map_icon_to_import(i) for i in icons if map_icon_to_import(i)})
        imports.append("import {\n  " + ", ".join(icon_imports) + ",\n} from \"lucide-react\";")
    
    # cn utility
    if re.search(r'\bcn\b', body_text):
        imports.append('import { cn } from "@/lib/utils";')
    
    # Types
    types_used = find_types_used(body_text, all_type_names)
    if types_used:
        sorted_types = sorted(types_used)
        imports.append(f"import type {{ {', '.join(sorted_types)} }} from \"@/lib/types\";")
    
    # Auth helpers
    auth = find_auth_helpers_used(body_text)
    if auth:
        imports.append(f"import {{ {', '.join(sorted(auth))} }} from \"@/lib/auth-client\";")
    
    if uses_nav:
        imports.append('import { navGroups, type NavGroup } from "@/lib/nav";')
    
    header = '"use client";\n\n'
    imports_text = "\n".join(imports) + "\n\n"
    
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(header + imports_text + body_text)
    return filepath

# Sidebar
sidebar_decls = [d for d in layout_group if d["name"] == "Sidebar"]
write_component_file(BASE / "src/components/layout/Sidebar.tsx", sidebar_decls, "Sidebar", uses_nav=True)
print("✓ src/components/layout/Sidebar.tsx")

# TopHeader
topheader_decls = [d for d in layout_group if d["name"] == "TopHeader"]
write_component_file(BASE / "src/components/layout/TopHeader.tsx", topheader_decls, "TopHeader")
print("✓ src/components/layout/TopHeader.tsx")

# ─── Write page components ───
for page_name in ordered_page_fns:
    decl_list = groups[page_name]
    write_component_file(BASE / f"src/components/pages/{page_name}.tsx", decl_list, page_name)
    print(f"✓ src/components/pages/{page_name}.tsx")

# ─── Write new src/app/page.tsx ───
app_text = '''"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/types";
import { navGroups } from "@/lib/nav";
import { clearAuthToken } from "@/lib/auth-client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
'''
for page_name in ordered_page_fns:
    if page_name == "PlaceholderPage":
        continue  # No longer used — every Page value is handled
    app_text += f'import {{ {page_name} }} from "@/components/pages/{page_name}";\n'

# Append the App function from the original, but remove the PlaceholderPage branch
app_src = src_of(app_group[0])
# Remove the PlaceholderPage branch (lines that reference PlaceholderPage and pageTitles)
# Replace the conditional that uses PlaceholderPage
app_src = re.sub(
    r'\{currentPage !== "dashboard" && currentPage !== "inbox" && currentPage !== "leads" && currentPage !== "deals" && currentPage !== "inventory" && currentPage !== "samples" && currentPage !== "quotes" && currentPage !== "compliance" && currentPage !== "shipments" && currentPage !== "contracts" && currentPage !== "finance" && currentPage !== "coach" && currentPage !== "admin" && \(\s*\n\s*<PlaceholderPage title=\{pageTitles\[currentPage\]\.title\} question=\{pageTitles\[currentPage\]\.question\} />\s*\n\s*\)\s*\n\s*\}',
    '',
    app_src,
)

# Also remove the pageTitles declaration (no longer needed)
app_src = re.sub(
    r'const pageTitles: Record<Page, \{ title: string; question: string \}> = \{[\s\S]*?\};\s*\n\s*\n',
    '',
    app_src,
)

app_text += "\n" + app_src.rstrip() + "\n"
(BASE / "src/app/page.tsx").write_text(app_text)
print("✓ src/app/page.tsx (rewritten as App shell)")

print("\n✅ Split complete.")
