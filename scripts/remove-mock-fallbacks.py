#!/usr/bin/env python3
"""
Remove mock data fallbacks from all page components.

When the API returns empty data (which is correct for a new org),
the frontend should show empty states — NOT fake demo data.

This script:
1. Finds all mock data fallback patterns like:
   `d.priorities?.length > 0 ? d.priorities : mockPriorities`
   `mappedKpis.length > 0 ? mappedKpis : mockKpis`
2. Replaces them with just the API data (or empty arrays)
3. Removes the fallback to mock data in catch blocks
"""
import re
from pathlib import Path

BASE = Path("/home/z/my-project/src/components/pages")

# Pattern: `d.xxx?.length > 0 ? d.xxx : mockXxx`
# Replace with: `d.xxx || []`
# Pattern: `mappedXxx.length > 0 ? mappedXxx : mockXxx`
# Replace with: `mappedXxx`
# Pattern: in catch blocks: `setXxx(mockXxx)` → `setXxx(null)` or `setXxx([])`

files_fixed = []

for fpath in sorted(BASE.glob("*.tsx")):
    text = fpath.read_text()
    original = text
    
    # Pattern 1: `d.xxx?.length > 0 ? d.xxx : mockXxx`
    # Replace with: `d.xxx || []`
    text = re.sub(
        r'd\.(\w+)\?\.length\s*>\s*0\s*\?\s*d\.\1\s*:\s*mock\w+',
        r'd.\1 || []',
        text
    )
    
    # Pattern 2: `mappedXxx.length > 0 ? mappedXxx : mockXxx`
    # Replace with: `mappedXxx`
    text = re.sub(
        r'(mapped\w+)\.length\s*>\s*0\s*\?\s*\1\s*:\s*mock\w+',
        r'\1',
        text
    )
    
    # Pattern 3: `xxx.length > 0 ? xxx : mockXxx` (generic)
    text = re.sub(
        r'(\w+)\.length\s*>\s*0\s*\?\s*\1\s*:\s*mock\w+',
        r'\1',
        text
    )
    
    # Pattern 4: In catch blocks: `setXxx(mockXxx)` → `setXxx([])`
    text = re.sub(
        r'set(\w+)\(mock\w+\)',
        r'set\1([])',
        text
    )
    
    # Pattern 5: `Array.isArray(d.xxx) ? d.xxx : mockXxx` → `Array.isArray(d.xxx) ? d.xxx : []`
    text = re.sub(
        r'Array\.isArray\(d\.(\w+)\)\s*\?\s*d\.\1\s*:\s*mock\w+',
        r'Array.isArray(d.\1) ? d.\1 : []',
        text
    )
    
    # Pattern 6: `Array.isArray(data.xxx) ? data.xxx : mockXxx` → `Array.isArray(data.xxx) ? data.xxx : []`
    text = re.sub(
        r'Array\.isArray\(data\.(\w+)\)\s*\?\s*data\.\1\s*:\s*mock\w+',
        r'Array.isArray(data.\1) ? data.\1 : []',
        text
    )
    
    if text != original:
        fpath.write_text(text)
        changes = sum(1 for a, b in zip(original.split('\n'), text.split('\n')) if a != b)
        files_fixed.append((fpath.name, changes))
        
for name, changes in files_fixed:
    print(f"  ✓ {name}: {changes} line(s) fixed")

print(f"\nTotal: {len(files_fixed)} files fixed")
