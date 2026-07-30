#!/usr/bin/env python3
"""
Split src/app/page.tsx (~8200 lines) into separate files.

Strategy:
1. Create shared lib files:
   - src/lib/auth-client.ts — auth helpers (apiFetch, getAuthToken, etc.)
   - src/lib/types.ts — all type declarations
   - src/lib/nav.ts — navGroups + nav types

2. Create layout components:
   - src/components/layout/Sidebar.tsx
   - src/components/layout/TopHeader.tsx

3. Create page components in src/components/pages/:
   - DashboardPage, InboxPage, LeadsPage, DealsPage, InventoryPage,
     SamplesPage, QuotesPage, CompliancePage, ShipmentsPage,
     ContractsPage, FinancePage, CoachPage, AdminPage, LoginPage,
     PlaceholderPage

4. Rewrite src/app/page.tsx as the App shell that just imports and renders.

Each extracted file gets:
- The appropriate react/lucide-react imports
- Imports from @/lib/auth-client, @/lib/types, @/lib/nav, @/lib/utils as needed
- The extracted code (function + any local helpers/types)

The script scans for tokens used in each block to determine which imports are needed.
"""
import re
import os
from pathlib import Path

BASE = Path("/home/z/my-project")
SRC = BASE / "src/app/page.tsx"
lines = SRC.read_text().splitlines(keepends=True)

# ─── Find each top-level declaration ───
# Patterns to match the START of a top-level block
patterns = [
    (re.compile(r'^const ADMIN_EMAIL'), 'const'),
    (re.compile(r'^let _authToken'), 'let'),
    (re.compile(r'^function getAuthToken'), 'function'),
    (re.compile(r'^function setAuthToken'), 'function'),
    (re.compile(r'^function clearAuthToken'), 'function'),
    (re.compile(r'^function apiFetch'), 'function'),
    (re.compile(r'^type Page '), 'type'),
    (re.compile(r'^const navGroups'), 'const'),
    (re.compile(r'^function Sidebar'), 'function'),
    (re.compile(r'^function TopHeader'), 'function'),
    (re.compile(r'^function DashboardPage'), 'function'),
    (re.compile(r'^function InboxPage'), 'function'),
    (re.compile(r'^function LeadsPage'), 'function'),
    (re.compile(r'^function DealsPage'), 'function'),
    (re.compile(r'^function InventoryPage'), 'function'),
    (re.compile(r'^function SamplesPage'), 'function'),
    (re.compile(r'^type QuoteLineItem'), 'type'),
    (re.compile(r'^type Quote '), 'type'),
    (re.compile(r'^function quoteTotals'), 'function'),
    (re.compile(r'^function marginTier'), 'function'),
    (re.compile(r'^function NegotiationSimulator'), 'function'),
    (re.compile(r'^function QuotesPage'), 'function'),
    (re.compile(r'^type DocStatus'), 'type'),
    (re.compile(r'^type DocType'), 'type'),
    (re.compile(r'^type ComplianceDoc'), 'type'),
    (re.compile(r'^type ComplianceShipment'), 'type'),
    (re.compile(r'^function shipmentReadiness'), 'function'),
    (re.compile(r'^function CompliancePage'), 'function'),
    (re.compile(r'^type ShipmentStage'), 'type'),
    (re.compile(r'^type ShipmentStatus'), 'type'),
    (re.compile(r'^type ShipmentMilestone'), 'type'),
    (re.compile(r'^type TempReading'), 'type'),
    (re.compile(r'^type Shipment '), 'type'),
    (re.compile(r'^function ShipmentsPage'), 'function'),
    (re.compile(r'^type ContractStatus'), 'type'),
    (re.compile(r'^type PaymentMilestone'), 'type'),
    (re.compile(r'^type Contract '), 'type'),
    (re.compile(r'^function ContractCard'), 'function'),
    (re.compile(r'^function ContractDetailDrawer'), 'function'),
    (re.compile(r'^function ContractsPage'), 'function'),
    (re.compile(r'^type TxnType'), 'type'),
    (re.compile(r'^type TxnStatus'), 'type'),
    (re.compile(r'^type Transaction'), 'type'),
    (re.compile(r'^function FinancePage'), 'function'),
    (re.compile(r'^type Priority'), 'type'),
    (re.compile(r'^type Insight'), 'type'),
    (re.compile(r'^type RiskItem'), 'type'),
    (re.compile(r'^type Opportunity'), 'type'),
    (re.compile(r'^type AIAction'), 'type'),
    (re.compile(r'^function CoachPage'), 'function'),
    (re.compile(r'^type SellerRisk'), 'type'),
    (re.compile(r'^type Seller '), 'type'),
    (re.compile(r'^type SellerDeal'), 'type'),
    (re.compile(r'^type OperatorRole'), 'type'),
    (re.compile(r'^type Operator'), 'type'),
    (re.compile(r'^type AIAgent'), 'type'),
    (re.compile(r'^type ApprovalItem'), 'type'),
    (re.compile(r'^type AuditEntry'), 'type'),
    (re.compile(r'^function AdminPage'), 'function'),
    (re.compile(r'^function LoginPage'), 'function'),
    (re.compile(r'^function PlaceholderPage'), 'function'),
    (re.compile(r'^export default function App'), 'function'),
]

# Find line number where each block starts
block_starts = []  # list of (line_no, kind, name)
for i, line in enumerate(lines, start=1):
    for pat, kind in patterns:
        if pat.match(line):
            # Extract name
            m = re.search(r'(?:function|type|const|let)\s+(\w+)', line)
            name = m.group(1) if m else 'App'
            if 'export default' in line:
                name = 'App'
            block_starts.append((i, kind, name))
            break

# Compute end of each block (start of next block - 1)
block_ranges = []
for idx, (start, kind, name) in enumerate(block_starts):
    if idx + 1 < len(block_starts):
        end = block_starts[idx + 1][0] - 1
    else:
        end = len(lines)
    block_ranges.append((start, end, kind, name))

print(f"Found {len(block_ranges)} top-level blocks")

# Print summary
for start, end, kind, name in block_ranges:
    print(f"  {kind:10s} {name:30s} lines {start:5d}–{end:5d} ({end - start + 1:5d} lines)")

# Save block info for the next step
import json
with open(BASE / "scripts/split-blocks.json", "w") as f:
    json.dump([
        {"start": s, "end": e, "kind": k, "name": n}
        for s, e, k, n in block_ranges
    ], f, indent=2)
print(f"\nBlock info saved to scripts/split-blocks.json")
