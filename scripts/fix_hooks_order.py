#!/usr/bin/env python3
"""Move useState declarations before loading check in 4 remaining pages."""
import re
from pathlib import Path

FILE = Path("/home/z/my-project/src/app/page.tsx")
content = FILE.read_text()

pages = [
    {
        "loading_var": "samplesData",
        "state_lines": '  const [filter, setFilter] = useState("All");\n',
        "after_loading": '  const filters = ["All", "Pending", "Dispatched", "Delivered", "Feedback Due", "Decided"];\n',
    },
    {
        "loading_var": "quotesData",
        "state_lines": '  const [filter, setFilter] = useState("All");\n  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);\n',
        "after_loading": '  const filters = ["All", "AI Drafts", "Needs Review", "Awaiting Approval", "Sent", "Accepted", "Rejected", "Expired"];\n',
    },
    {
        "loading_var": "complianceShipments",
        "state_lines": '  const [filter, setFilter] = useState("All");\n  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);\n',
        "after_loading": '  const filters = ["All", "Blocked", "Expiring", "Ready to Ship"];\n',
    },
    {
        "loading_var": "shipmentsData",
        "state_lines": '  const [filter, setFilter] = useState("All");\n  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);\n',
        "after_loading": '  const filters = ["All", "In Transit", "At Port", "Loading", "Delayed", "Delivered"];\n',
    },
]

for page in pages:
    loading_var = page["loading_var"]
    state_lines = page["state_lines"]
    after_loading = page["after_loading"]

    # Find the pattern: loading check → state declarations → next code
    # Pattern: "  // Loading state\n  if (!VAR) {\n    return (\n      ...\n    );\n  }\n\n  STATE_LINES  AFTER_LOADING"
    
    # Find the loading check start
    loading_marker = f"  // Loading state\n  if (!{loading_var}) {{"
    idx = content.find(loading_marker)
    if idx == -1:
        print(f"⚠️  Could not find loading check for {loading_var}")
        continue

    # Find the state lines after the loading check
    search_start = idx + len(loading_marker)
    state_idx = content.find(state_lines.strip(), search_start)
    if state_idx == -1:
        print(f"⚠️  Could not find state lines after loading check for {loading_var}")
        continue

    # Find the end of the loading check block (the "}" after the return)
    loading_end = content.find("\n  }\n", idx)
    if loading_end == -1:
        print(f"⚠️  Could not find end of loading check for {loading_var}")
        continue
    loading_end += 4  # include "\n  }\n"

    # Extract the state lines
    state_start = content.find(state_lines, loading_end)
    if state_start == -1 or state_start > search_start + 2000:
        print(f"⚠️  State lines not found after loading check for {loading_var}")
        continue

    state_end = state_start + len(state_lines)

    # Remove state lines from their current position
    content = content[:state_start] + content[state_end:]

    # Insert state lines before the loading check
    content = content[:idx] + state_lines + "\n" + content[idx:]

    print(f"✅ Fixed {loading_var}")

FILE.write_text(content)
print(f"\nDone. File size: {len(content)} chars")
