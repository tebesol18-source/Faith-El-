#!/usr/bin/env python3
"""
Replace ALL remaining mock data arrays with empty arrays across all page components.
This ensures no demo data leaks to new tenants.
"""
import re
from pathlib import Path

BASE = Path("/home/z/my-project/src/components/pages")

# Pattern: `const mockXxx: Type = [` or `const mockXxx = [` or `const coachXxx: Type = [`
# Replace with: `const mockXxx: Type = [];` or `const mockXxx = [];`
# We need to find the array body and replace it with empty.

for fpath in sorted(BASE.glob("*.tsx")):
    text = fpath.read_text()
    original = text
    
    # Pattern: const mockXxx = [ ...multi-line... ];
    # or: const mockXxx: Type = [ ...multi-line... ];
    # or: const coachXxx: Type = [ ...multi-line... ];
    # Replace the entire array with []
    
    # Match: const (mock|coach)\w+(: [\w<>\[\] |]+)? = [\s]*\[
    # Then find the matching closing ];
    
    def replace_mock_array(match):
        prefix = match.group(0)  # e.g. "const mockKpis: Kpi[] = ["
        # Find the position after the opening [
        start = match.end()
        # Find the matching ]; (accounting for nested brackets)
        depth = 1
        i = start
        while i < len(text) and depth > 0:
            if text[i] == '[':
                depth += 1
            elif text[i] == ']':
                depth -= 1
            i += 1
        # i now points just past the ]
        # Check for trailing ; 
        if i < len(text) and text[i] == ';':
            i += 1
        # Return the const declaration with empty array
        return prefix.rstrip('[').rstrip() + " = [];" + text[i:]
    
    # Actually, this regex approach is fragile. Let's use a simpler approach:
    # Replace `= [` with `= [];` and remove everything up to the next `];`
    # But only for lines starting with `const mock` or `const coach`
    
    lines = text.split('\n')
    new_lines = []
    skip_until_closing = False
    closing_pattern = re.compile(r'^\];?\s*$')
    
    for line in lines:
        if skip_until_closing:
            if closing_pattern.match(line.strip()):
                skip_until_closing = False
            continue
        
        # Check if this line starts a mock/coach array declaration
        if re.match(r'^const (mock|coach)\w+\s*(:\s*[\w<>\[\]|, ]+)?\s*=\s*\[', line):
            # Check if it's already empty (const mockXxx = [];)
            if '= [];' in line or '= []' in line.rstrip():
                new_lines.append(line)
                continue
            # Replace with empty array
            # Extract the const name and type
            m = re.match(r'^(const (mock|coach)\w+\s*(:\s*[\w<>\[\]|, ]+)?)\s*=\s*\[', line)
            if m:
                prefix = m.group(1).rstrip()
                new_lines.append(f"{prefix} = [];")
                # Check if the array continues on next lines (look for closing ];)
                if not line.rstrip().endswith('];') and not line.rstrip().endswith(']'):
                    skip_until_closing = True
                continue
        
        new_lines.append(line)
    
    text = '\n'.join(new_lines)
    
    if text != original:
        fpath.write_text(text)
        # Count changes
        changes = sum(1 for a, b in zip(original.split('\n'), text.split('\n')) if a != b)
        print(f"  ✓ {fpath.name}: {changes} line(s) changed")

print("\nDone.")
