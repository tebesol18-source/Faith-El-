#!/usr/bin/env python3
"""Print the full KPI snapshot from the StateManager."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from state_manager import StateManager

with StateManager() as sm:
    snap = sm.get_kpi_snapshot()
    print()
    print("=" * 60)
    print("Coffee Export — KPI Snapshot")
    print("=" * 60)
    print(f"Generated: {snap['generated_ts']}")
    print()
    print("LEADS")
    print(f"  Total:           {snap['leads']['total']}")
    print(f"  Blocked:         {snap['leads']['blocked_count']}")
    print("  By state:")
    for state, n in sorted(snap['leads']['by_state'].items()):
        print(f"    {state:<25} {n}")
    print()
    print("LOTS")
    print(f"  Total:           {snap['lots']['total']}")
    print(f"  Total stock:     {snap['lots']['total_stock_bags']} bags")
    print("  By status:")
    for status, n in sorted(snap['lots']['by_status'].items()):
        print(f"    {status:<25} {n}")
    print("  EUDR completeness (active lots):")
    for status, n in sorted(snap['lots']['eudr_completeness'].items()):
        print(f"    {status:<25} {n}")
    print("  Regional distribution:")
    for region, n in snap['lots']['regional_distribution'].items():
        print(f"    {region:<25} {n}")
    print()
    print("SAMPLES")
    print(f"  Active reservations: {snap['samples']['active_reservations']}")
    print(f"  Waitlist depth:      {snap['samples']['waitlist_depth']}")
    b = snap['samples']['budget']
    if b:
        print(f"  Budget (week {b.get('week_start','?')} → {b.get('week_end','?')}):")
        print(f"    Full sets (350g):    {b.get('full_sets_used',0)}/3")
        print(f"    Fallback (150g):     {b.get('fallback_150g_used',0)}/2")
        print(f"    Type B (200g):       {b.get('type_b_used',0)}/2")
        print(f"    Type C (500g):       {b.get('type_c_used',0)} (no cap)")
    print()
    print("FEEDBACK")
    print(f"  Total logged:    {snap['feedback']['total_logged']}")
    if snap['feedback']['multi_rejection_lots']:
        print("  Lots with ≥2 rejections (QA review needed):")
        for lot in snap['feedback']['multi_rejection_lots']:
            print(f"    - {lot['lot_id']}: {lot['n']} rejections")
    print("=" * 60)
