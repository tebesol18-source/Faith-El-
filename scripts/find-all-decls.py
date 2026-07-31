#!/usr/bin/env python3
"""
Better extraction: find the TRUE end of each function by brace-counting.
Then group all top-level declarations (functions, types, AND consts) into the right page file.

A "page file" gets:
  - All top-level declarations between the page's function start and the next page's function start
  - Including: the function itself, plus any local consts/types defined right before/after it
"""
import re
import json
from pathlib import Path

BASE = Path("/home/z/my-project")
ORIGINAL = Path("/tmp/original-page.tsx")
if not ORIGINAL.exists():
    import subprocess
    ORIGINAL.write_text(subprocess.check_output(["git", "show", "HEAD:src/app/page.tsx"], cwd=BASE).decode())

lines = ORIGINAL.read_text().splitlines(keepends=True)

def find_function_end(start_line: int) -> int:
    """Given the line number (1-indexed) where a function starts, return the line where its closing `}` is.
    
    The tricky part: function signatures may contain `{...}` for destructuring params or type annotations.
    Strategy: find the LAST `{` on the signature line(s) — that's the function body's opening brace.
    Then count braces from there.
    """
    # Scan the function declaration to find the body's opening `{`.
    # The body's opening `{` is the one that's NOT inside `(...)`.
    # We track paren depth: only count `{` outside parens.
    paren_depth = 0
    body_open_line = -1
    body_open_col = -1
    for i in range(start_line - 1, min(start_line + 30, len(lines))):
        line = lines[i]
        for col, ch in enumerate(line):
            if ch == '(':
                paren_depth += 1
            elif ch == ')':
                paren_depth -= 1
            elif ch == '{' and paren_depth == 0:
                # This is the function body's opening brace
                body_open_line = i
                body_open_col = col
                break
            elif ch == ';' and paren_depth == 0:
                # Single-line function declaration like `function x(): T;`
                return i + 1
        if body_open_line >= 0:
            break
    if body_open_line < 0:
        return start_line
    
    # Now count braces starting from body_open_line, body_open_col
    brace_count = 0
    for i in range(body_open_line, len(lines)):
        line = lines[i]
        start_col = body_open_col if i == body_open_line else 0
        for ch in line[start_col:]:
            if ch == '{':
                brace_count += 1
            elif ch == '}':
                brace_count -= 1
                if brace_count == 0:
                    return i + 1  # 1-indexed
    return len(lines)

def find_type_or_const_end(start_line: int, kind: str) -> int:
    """Find the end of a `type X = {...}` or `const X = [...]`/`const X = {...}` block."""
    # Find the first non-whitespace char after the `=` sign
    text_up_to_eq = ""
    for i in range(start_line - 1, min(start_line + 5, len(lines))):
        text_up_to_eq += lines[i]
        if '=' in text_up_to_eq:
            break
    
    # Find the first `=` and look at the char after it
    eq_idx = text_up_to_eq.find('=')
    if eq_idx == -1:
        return start_line
    
    # Skip past `=`
    after_eq = text_up_to_eq[eq_idx + 1:].lstrip()
    if not after_eq:
        # Multi-line, look at next line
        for i in range(start_line, len(lines)):
            stripped = lines[i].lstrip()
            if stripped:
                after_eq = stripped
                break
    
    if not after_eq:
        return start_line
    
    first_char = after_eq[0]
    
    if first_char == '{':
        # Brace-balanced
        brace_count = 0
        started = False
        for i in range(start_line - 1, len(lines)):
            line = lines[i]
            # Only count braces after the `=` sign on the start line
            if i == start_line - 1:
                eq_pos = line.find('=')
                if eq_pos >= 0:
                    line = line[eq_pos + 1:]
            for ch in line:
                if ch == '{':
                    brace_count += 1
                    started = True
                elif ch == '}':
                    brace_count -= 1
                    if started and brace_count == 0:
                        return i + 1
        return len(lines)
    elif first_char == '[':
        # Bracket-balanced
        bracket_count = 0
        started = False
        for i in range(start_line - 1, len(lines)):
            line = lines[i]
            if i == start_line - 1:
                eq_pos = line.find('=')
                if eq_pos >= 0:
                    line = line[eq_pos + 1:]
            for ch in line:
                if ch == '[':
                    bracket_count += 1
                    started = True
                elif ch == ']':
                    bracket_count -= 1
                    if started and bracket_count == 0:
                        return i + 1
        return len(lines)
    elif first_char == '"' or first_char == "'" or first_char == '`':
        # String literal — likely single line
        return start_line
    elif first_char.isdigit() or first_char == '-':
        # Number — single line
        return start_line
    else:
        # Probably a Record<X, Y> = { ... } — handle as brace-balanced
        # But also could be `const x = someValue;` — single line
        # Try brace-balanced first
        brace_count = 0
        started = False
        for i in range(start_line - 1, min(start_line + 200, len(lines))):
            line = lines[i]
            if i == start_line - 1:
                eq_pos = line.find('=')
                if eq_pos >= 0:
                    line = line[eq_pos + 1:]
            for ch in line:
                if ch == '{':
                    brace_count += 1
                    started = True
                elif ch == '}':
                    brace_count -= 1
                    if started and brace_count == 0:
                        return i + 1
            # If we see a `;` at end of line and braces are balanced, that's the end
            if started and brace_count == 0 and line.rstrip().endswith(';'):
                return i + 1
            # If no braces were started and we see `;` at end of line, single-line const
            if not started and line.rstrip().endswith(';'):
                return i + 1
        # Fallback
        return start_line

# Identify all top-level declarations
decls = []  # list of (kind, name, start_line, end_line)
decl_pattern = re.compile(r'^(export\s+)?(default\s+)?(function|type|const|let)\s+(\w+)')

i = 0
while i < len(lines):
    line = lines[i]
    m = decl_pattern.match(line)
    if m:
        kind = m.group(3)
        name = m.group(4)
        start = i + 1  # 1-indexed
        if kind == 'function':
            end = find_function_end(start)
        elif kind == 'type':
            end = find_type_or_const_end(start, 'type')
        else:  # const, let
            end = find_type_or_const_end(start, 'const')
        decls.append({'kind': kind, 'name': name, 'start': start, 'end': end})
        i = end  # jump to end
    else:
        i += 1

print(f"Found {len(decls)} top-level declarations:")
for d in decls:
    print(f"  {d['kind']:10s} {d['name']:30s} lines {d['start']:5d}–{d['end']:5d} ({d['end'] - d['start'] + 1:5d} lines)")

# Save to JSON for the next step
with open(BASE / "scripts/all-decls.json", "w") as f:
    json.dump(decls, f, indent=2)
print(f"\nSaved to scripts/all-decls.json")
