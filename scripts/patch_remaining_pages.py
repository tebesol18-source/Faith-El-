#!/usr/bin/env python3
"""Add fetch logic to 5 remaining pages (Inventory, Samples, Quotes, Compliance, Shipments)."""
import re
from pathlib import Path

FILE = Path("/home/z/my-project/src/app/page.tsx")
content = FILE.read_text()

# Pattern for each page:
# 1. Find "function XxxPage() {" 
# 2. Right after the opening line, insert state + useEffect + loading check
# 3. Find the first reference to the old mock const and replace with state var

patches = [
    {
        "func_name": "InventoryPage",
        "mock_const": "mockLotsData",
        "state_var": "lotsData",
        "api_path": "/api/inventory",
        "response_key": "lots",
        "existing_refs": ["lotsData"],
    },
    {
        "func_name": "SamplesPage",
        "mock_const": "mockSamplesData",
        "state_var": "samplesData",
        "api_path": "/api/samples",
        "response_key": "samples",
        "existing_refs": ["samplesData"],
    },
    {
        "func_name": "QuotesPage",
        "mock_const": "mockQuotesData",
        "state_var": "quotesData",
        "api_path": "/api/quotes",
        "response_key": "quotes",
        "existing_refs": ["quotesData"],
    },
    {
        "func_name": "CompliancePage",
        "mock_const": "mockComplianceShipments",
        "state_var": "complianceShipments",
        "api_path": "/api/compliance",
        "response_key": "complianceShipments",
        "existing_refs": ["complianceShipments"],
    },
    {
        "func_name": "ShipmentsPage",
        "mock_const": "mockShipmentsData",
        "state_var": "shipmentsData",
        "api_path": "/api/shipments",
        "response_key": "shipments",
        "existing_refs": ["shipmentsData"],
    },
]

for patch in patches:
    func_name = patch["func_name"]
    mock_const = patch["mock_const"]
    state_var = patch["state_var"]
    api_path = patch["api_path"]
    response_key = patch["response_key"]

    # Find the function
    func_pattern = f"function {func_name}() {{\n"
    idx = content.find(func_pattern)
    if idx == -1:
        print(f"⚠️  Could not find {func_name}")
        continue

    # Check if already patched (has "useState" after the function start)
    check_section = content[idx:idx+500]
    if "Live data from backend" in check_section:
        print(f"⏭️  {func_name} already patched, skipping")
        continue

    # Find the first line after the function opening
    func_start = idx + len(func_pattern)

    # Find where the first const/state declaration is
    # We need to insert our fetch logic right at the top of the function
    fetch_code = f"""  // ─── Live data from backend ───
  const [{state_var}, set{state_var[0].upper() + state_var[1:]}] = useState<typeof {mock_const} | null>(null);

  useEffect(() => {{
    let cancelled = false;
    fetch("{api_path}")
      .then((r) => {{ if (!r.ok) throw new Error(`API ${{r.status}}`); return r.json(); }})
      .then((data) => {{
        if (cancelled) return;
        if (data.ok && Array.isArray(data.{response_key}) && data.{response_key}.length > 0) {{
          set{state_var[0].upper() + state_var[1:]}(data.{response_key});
        }} else {{
          set{state_var[0].upper() + state_var[1:]}({mock_const});
        }}
      }})
      .catch((err) => {{
        if (cancelled) return;
        console.warn("[{func_name}] API fetch failed, using mock data:", err);
        set{state_var[0].upper() + state_var[1:]}({mock_const});
      }});
    return () => {{ cancelled = true; }};
  }}, []);

  // Loading state
  if (!{state_var}) {{
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading from database…</p>
        </div>
      </main>
    );
  }}

"""

    content = content[:func_start] + fetch_code + content[func_start:]
    print(f"✅ Patched {func_name}")

FILE.write_text(content)
print(f"\nDone. File size: {len(content)} chars")
