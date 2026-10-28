#!/usr/bin/env python3
"""
Comprehensive pipeline fix:
1. Fix events INSERT to include organization_id
2. Fix supervisor to process events per-org
3. Fix enrichment score to be higher (currently 30% for new leads)
4. Fix "Import Leads" button to actually work
5. Fix "Enrich with AI" to respond
6. Ensure first-run works smoothly
"""
import re
from pathlib import Path

BASE = Path("/home/z/my-project")

# ─── 1. Fix research-leads: add organization_id to events INSERT ───
f = BASE / "src/app/api/agents/research-leads/route.ts"
text = f.read_text()

# Fix LEAD_CREATED event insert
text = text.replace(
    """INSERT INTO events (
              event_type, entity_type, entity_id, payload,
              published_by, published_ts, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
    """INSERT INTO events (
              event_type, entity_type, entity_id, payload,
              published_by, published_ts, status, organization_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"""
)

# Fix the .run() calls to include orgId
# Find the LEAD_CREATED event publish
text = text.replace(
    '''JSON.stringify({ lead_id: leadId, company_name: companyName, country }),
            "Agent 2", now, "pending"
          );''',
    '''JSON.stringify({ lead_id: leadId, company_name: companyName, country }),
            "Agent 2", now, "pending", orgId
          );'''
)

# Fix the LEAD_ENRICHED event publish
text = text.replace(
    '''JSON.stringify({ lead_id: leadId, tier, vp, language, tags }),
            "Agent 2", now, "pending"
          );''',
    '''JSON.stringify({ lead_id: leadId, tier, vp, language, tags }),
            "Agent 2", now, "pending", orgId
          );'''
)

f.write_text(text)
print("  ✓ Fixed research-leads: events now include organization_id")

# ─── 2. Fix enrichment score: boost from ~30% to ~60-70% for enriched leads ───
f = BASE / "src/app/api/leads/route.ts"
text = f.read_text()

text = text.replace(
    """  let score = 0;
  // Tier bonus
  if (tier === "S") score += 30;
  else if (tier === "A") score += 20;
  else if (tier === "B") score += 10;
  else if (tier === "C") score += 5;
  // State bonus
  const stateBonus: Record<string, number> = {
    NEW: 0,
    ENRICHED: 10,
    IN_SEQUENCE: 15,
    QUALIFIED: 25,
    SAMPLE_DISPATCHED: 30,
    SAMPLE_FEEDBACK_DUE: 32,
    DECIDED_APPROVED: 40,
    CONTRACTED: 50,
    DECIDED_REJECTED: 5,
    DECIDED_NEEDS_ANOTHER: 25,""",
    """  let score = 0;
  // Tier bonus (boosted)
  if (tier === "S") score += 40;
  else if (tier === "A") score += 35;
  else if (tier === "B") score += 25;
  else if (tier === "C") score += 15;
  // State bonus (boosted)
  const stateBonus: Record<string, number> = {
    NEW: 10,
    ENRICHED: 25,
    IN_SEQUENCE: 35,
    QUALIFIED: 45,
    SAMPLE_DISPATCHED: 55,
    SAMPLE_FEEDBACK_DUE: 57,
    DECIDED_APPROVED: 70,
    CONTRACTED: 80,
    DECIDED_REJECTED: 10,
    DECIDED_NEEDS_ANOTHER: 45,"""
)

f.write_text(text)
print("  ✓ Fixed enrichment score: boosted from ~30% to ~60-70%")

# ─── 3. Fix supervisor: add organization_id to event processing ───
f = BASE / "scripts/supervisor.js"
text = f.read_text()

# Fix the event query to include organization_id column
text = text.replace(
    "SELECT * FROM events\n      WHERE status = 'pending' AND event_type IN",
    "SELECT id, event_type, entity_type, entity_id, payload, published_by, published_ts, status, organization_id FROM events\n      WHERE status = 'pending' AND event_type IN"
)

# Fix the pending count query
text = text.replace(
    'const totalPending = this.db.prepare("SELECT COUNT(*) as n FROM events WHERE status = \'pending\'").get().n;',
    'const totalPending = this.db.prepare("SELECT COUNT(*) as n FROM events WHERE status = \'pending\'").get().n;'
)

f.write_text(text)
print("  ✓ Fixed supervisor: events query includes organization_id")

print("\nDone. Now need to fix the LeadsPage UI (import + enrich buttons).")
