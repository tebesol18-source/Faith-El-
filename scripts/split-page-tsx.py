#!/usr/bin/env python3
"""
Split src/app/page.tsx into multiple files based on identified blocks.

Layout:
  src/lib/auth-client.ts  — auth helpers
  src/lib/types.ts        — all type declarations
  src/lib/nav.ts          — navGroups + nav types
  src/components/layout/Sidebar.tsx
  src/components/layout/TopHeader.tsx
  src/components/pages/<Page>.tsx  (one per page)
  src/app/page.tsx        — App shell that imports everything
"""
import json
import re
from pathlib import Path

BASE = Path("/home/z/my-project")
SRC = BASE / "src/app/page.tsx"

src_text = SRC.read_text()
lines = src_text.splitlines(keepends=True)

with open(BASE / "scripts/split-blocks.json") as f:
    blocks = json.load(f)

# Build a lookup: name → (start, end, kind)
block_by_name = {b["name"]: b for b in blocks}

def get_block(name):
    """Return the source code lines for a named block."""
    b = block_by_name[name]
    return "".join(lines[b["start"] - 1 : b["end"]])

# ─── 1. Create src/lib/auth-client.ts ───
auth_client = '''"use client";

/**
 * Client-side authentication helpers.
 * Used by every page component to send authenticated API requests.
 */

export const ADMIN_EMAIL = "admin@faithel.com";

let _authToken: string | null = null;

export function getAuthToken(): string | null {
  if (_authToken) return _authToken;
  if (typeof window !== "undefined") {
    _authToken = localStorage.getItem("coffee_erp_token");
  }
  return _authToken;
}

export function setAuthToken(token: string) {
  _authToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("coffee_erp_token", token);
  }
}

export function clearAuthToken() {
  _authToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("coffee_erp_token");
  }
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("x-auth-token", token);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...options, headers });
}
'''

(BASE / "src/lib/auth-client.ts").write_text(auth_client)
print("✓ src/lib/auth-client.ts")

# ─── 2. Create src/lib/types.ts ───
# Collect all type declarations into one file
type_blocks = [b for b in blocks if b["kind"] == "type"]
type_names = [b["name"] for b in type_blocks]

# Also include the Page type
type_decls = []
for b in type_blocks:
    block_text = "".join(lines[b["start"] - 1 : b["end"]])
    # Strip trailing blank lines
    block_text = block_text.rstrip() + "\n\n"
    type_decls.append(block_text)

types_file = '''/**
 * Shared TypeScript types used across all page components.
 * All types are exported so individual page files can import only what they need.
 */

'''
types_file += "".join(type_decls)

# Add Page type
types_file += '''export type Page = "dashboard" | "inbox" | "leads" | "deals" | "inventory" | "samples" | "quotes" | "contracts" | "shipments" | "compliance" | "finance" | "coach" | "admin";
'''

(BASE / "src/lib/types.ts").write_text(types_file)
print(f"✓ src/lib/types.ts ({len(type_blocks)} types)")

# ─── 3. Create src/lib/nav.ts ───
# The navGroups block uses icons from lucide-react, so it needs those imports.
# Scan the navGroups block for icon names
nav_block = get_block("navGroups")
# Find all icon references — they're identifiers used as `icon: IconName` or `icon={IconName}`
icon_names_in_nav = set()
# The pattern in navGroups: { icon: LayoutDashboard, label: ...
for m in re.finditer(r'icon:\s+(\w+),', nav_block):
    icon_names_in_nav.add(m.group(1))

nav_file = '''/**
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
# Replace the navGroups block, but with the proper type annotation
# Original: const navGroups: { label: string | null; items: { icon: any; label: string; page: Page; badge?: number; highlight?: boolean }[] }[] = [
nav_text = nav_block.replace(
    'const navGroups: { label: string | null; items: { icon: any; label: string; page: Page; badge?: number; highlight?: boolean }[] }[] = [',
    'export const navGroups: NavGroup[] = ['
)
nav_file += nav_text

(BASE / "src/lib/nav.ts").write_text(nav_file)
print("✓ src/lib/nav.ts")

# ─── 4. Helper: figure out which lucide icons a block uses ───
# All icons imported in the original page.tsx:
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

# Build a list of all "available" icon names (post-alias)
available_icons = set()
for imp in ALL_LUCIDE_IMPORTS:
    # Handle "X as Y" — Y is the name in scope
    if " as " in imp:
        available_icons.add(imp.split(" as ")[1].strip())
    else:
        available_icons.add(imp.strip())

def icons_used_in(text):
    """Find which lucide icons are referenced in the text."""
    used = set()
    # Find identifiers that match available icons
    # Use word-boundary matching
    for icon in available_icons:
        if re.search(r'\b' + re.escape(icon) + r'\b', text):
            used.add(icon)
    return used

def map_icon_to_import(icon_name):
    """Map an in-scope icon name back to its import statement."""
    for imp in ALL_LUCIDE_IMPORTS:
        if " as " in imp:
            alias = imp.split(" as ")[1].strip()
            if alias == icon_name:
                return imp
        else:
            if imp.strip() == icon_name:
                return imp
    return None

def find_types_used(text):
    """Find which @/lib/types types are referenced."""
    # All types defined in types.ts
    all_types = set(type_names + ["Page"])
    used = set()
    for t in all_types:
        # Match as a word boundary (not preceded by . or alphanumeric)
        if re.search(r'(?<![.\w])' + re.escape(t) + r'\b', text):
            used.add(t)
    return used

def find_auth_helpers_used(text):
    """Find which auth-client helpers are referenced."""
    helpers = {"ADMIN_EMAIL", "getAuthToken", "setAuthToken", "clearAuthToken", "apiFetch"}
    used = set()
    for h in helpers:
        if re.search(r'\b' + re.escape(h) + r'\b', text):
            used.add(h)
    return used

# ─── 5. Create layout components ───
def write_component_file(filepath, components, *, uses_nav=False, uses_types=True, uses_auth=True, uses_react=True):
    """
    Write a component file with proper imports.
    
    `components` is a list of (name, block_text) tuples — multiple components may go in one file
    (e.g. ContractsPage + ContractCard + ContractDetailDrawer).
    """
    full_text = "".join(c[1] for c in components)
    
    # Build imports
    imports = []
    if uses_react:
        # Detect which react hooks are used
        react_hooks = []
        for hook in ["useState", "useEffect", "useRef", "useMemo", "useCallback"]:
            if re.search(r'\b' + hook + r'\b', full_text):
                react_hooks.append(hook)
        if react_hooks:
            imports.append(f"import {{ {', '.join(react_hooks)} }} from \"react\";")
    
    # Lucide icons
    icons = icons_used_in(full_text)
    if icons:
        icon_imports = sorted({map_icon_to_import(i) for i in icons if map_icon_to_import(i)})
        imports.append("import {\n  " + ", ".join(icon_imports) + ",\n} from \"lucide-react\";")
    
    # cn utility
    if re.search(r'\bcn\b', full_text):
        imports.append('import { cn } from "@/lib/utils";')
    
    # Types
    if uses_types:
        types = find_types_used(full_text)
        if types:
            sorted_types = sorted(types)
            imports.append(f"import type {{ {', '.join(sorted_types)} }} from \"@/lib/types\";")
    
    # Auth helpers
    if uses_auth:
        auth = find_auth_helpers_used(full_text)
        if auth:
            imports.append(f"import {{ {', '.join(sorted(auth))} }} from \"@/lib/auth-client\";")
    
    # Nav
    if uses_nav:
        imports.append('import { navGroups, type NavGroup } from "@/lib/nav";')
    
    # Build file
    header = '"use client";\n\n'
    imports_text = "\n".join(imports) + "\n\n"
    body = "\n".join(c[1].rstrip() for c in components) + "\n"
    
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(header + imports_text + body)
    return filepath

# Sidebar
write_component_file(
    BASE / "src/components/layout/Sidebar.tsx",
    [("Sidebar", get_block("Sidebar"))],
    uses_nav=True,
)
print("✓ src/components/layout/Sidebar.tsx")

# TopHeader
write_component_file(
    BASE / "src/components/layout/TopHeader.tsx",
    [("TopHeader", get_block("TopHeader"))],
    uses_nav=False,  # TopHeader doesn't use navGroups
)
print("✓ src/components/layout/TopHeader.tsx")

# ─── 6. Create page components ───
# Each entry: (output_file, [list of (name, block_text) to include])
page_components = [
    ("DashboardPage.tsx", [
        ("DashboardPage", get_block("DashboardPage")),
    ]),
    ("InboxPage.tsx", [
        ("InboxPage", get_block("InboxPage")),
    ]),
    ("LeadsPage.tsx", [
        ("LeadsPage", get_block("LeadsPage")),
    ]),
    ("DealsPage.tsx", [
        ("DealsPage", get_block("DealsPage")),
    ]),
    ("InventoryPage.tsx", [
        ("InventoryPage", get_block("InventoryPage")),
    ]),
    ("SamplesPage.tsx", [
        ("SamplesPage", get_block("SamplesPage")),
    ]),
    ("QuotesPage.tsx", [
        ("QuoteLineItem", get_block("QuoteLineItem")),
        ("Quote", get_block("Quote")),
        ("quoteTotals", get_block("quoteTotals")),
        ("marginTier", get_block("marginTier")),
        ("NegotiationSimulator", get_block("NegotiationSimulator")),
        ("QuotesPage", get_block("QuotesPage")),
    ]),
    ("CompliancePage.tsx", [
        ("DocStatus", get_block("DocStatus")),
        ("DocType", get_block("DocType")),
        ("ComplianceDoc", get_block("ComplianceDoc")),
        ("ComplianceShipment", get_block("ComplianceShipment")),
        ("shipmentReadiness", get_block("shipmentReadiness")),
        ("CompliancePage", get_block("CompliancePage")),
    ]),
    ("ShipmentsPage.tsx", [
        ("ShipmentStage", get_block("ShipmentStage")),
        ("ShipmentStatus", get_block("ShipmentStatus")),
        ("ShipmentMilestone", get_block("ShipmentMilestone")),
        ("TempReading", get_block("TempReading")),
        ("Shipment", get_block("Shipment")),
        ("ShipmentsPage", get_block("ShipmentsPage")),
    ]),
    ("ContractsPage.tsx", [
        ("ContractStatus", get_block("ContractStatus")),
        ("PaymentMilestone", get_block("PaymentMilestone")),
        ("Contract", get_block("Contract")),
        ("ContractCard", get_block("ContractCard")),
        ("ContractDetailDrawer", get_block("ContractDetailDrawer")),
        ("ContractsPage", get_block("ContractsPage")),
    ]),
    ("FinancePage.tsx", [
        ("TxnType", get_block("TxnType")),
        ("TxnStatus", get_block("TxnStatus")),
        ("Transaction", get_block("Transaction")),
        ("FinancePage", get_block("FinancePage")),
    ]),
    ("CoachPage.tsx", [
        ("Priority", get_block("Priority")),
        ("Insight", get_block("Insight")),
        ("RiskItem", get_block("RiskItem")),
        ("Opportunity", get_block("Opportunity")),
        ("AIAction", get_block("AIAction")),
        ("CoachPage", get_block("CoachPage")),
    ]),
    ("AdminPage.tsx", [
        ("SellerRisk", get_block("SellerRisk")),
        ("Seller", get_block("Seller")),
        ("SellerDeal", get_block("SellerDeal")),
        ("OperatorRole", get_block("OperatorRole")),
        ("Operator", get_block("Operator")),
        ("AIAgent", get_block("AIAgent")),
        ("ApprovalItem", get_block("ApprovalItem")),
        ("AuditEntry", get_block("AuditEntry")),
        ("AdminPage", get_block("AdminPage")),
    ]),
    ("LoginPage.tsx", [
        ("LoginPage", get_block("LoginPage")),
    ]),
    ("PlaceholderPage.tsx", [
        ("PlaceholderPage", get_block("PlaceholderPage")),
    ]),
]

for filename, components in page_components:
    write_component_file(
        BASE / f"src/components/pages/{filename}",
        components,
        uses_nav=False,
    )
    print(f"✓ src/components/pages/{filename}")

# ─── 7. Rewrite src/app/page.tsx as the App shell ───
app_block = get_block("App")

# Build new page.tsx
new_page = '''"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/types";
import { navGroups } from "@/lib/nav";
import { clearAuthToken } from "@/lib/auth-client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { InboxPage } from "@/components/pages/InboxPage";
import { LeadsPage } from "@/components/pages/LeadsPage";
import { DealsPage } from "@/components/pages/DealsPage";
import { InventoryPage } from "@/components/pages/InventoryPage";
import { SamplesPage } from "@/components/pages/SamplesPage";
import { QuotesPage } from "@/components/pages/QuotesPage";
import { CompliancePage } from "@/components/pages/CompliancePage";
import { ShipmentsPage } from "@/components/pages/ShipmentsPage";
import { ContractsPage } from "@/components/pages/ContractsPage";
import { FinancePage } from "@/components/pages/FinancePage";
import { CoachPage } from "@/components/pages/CoachPage";
import { AdminPage } from "@/components/pages/AdminPage";
import { LoginPage } from "@/components/pages/LoginPage";

'''

# Append the App function
new_page += app_block

SRC.write_text(new_page)
print(f"✓ src/app/page.tsx (rewritten as App shell)")
print("\nDone. Splitting complete.")
