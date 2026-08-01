#!/usr/bin/env python3
"""
Agent 3 CLI — Outreach & Qualification operations.

Usage:
    # Run Agent 3 (process LEAD_ENRICHED events + advance IN_SEQUENCE leads)
    python scripts/run_agent3.py run

    # Draft an outreach message for a specific step
    python scripts/run_agent3.py draft L-2026-00047 --step 2

    # Record a buyer reply
    python scripts/run_agent3.py reply L-2026-00047 --type positive --content "Yes, we're sourcing 25/26"

    # Record a QUAL answer
    python scripts/run_agent3.py qual-answer L-2026-00047 --question Q1 --answer "Yes, we buy 5 FCL/year"

    # Check QUAL gate status
    python scripts/run_agent3.py qual-status L-2026-00047

    # Show outreach stats
    python scripts/run_agent3.py stats
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent3_outreach import Agent3, run_agent3, run_agent3_stats
from coffee_export.utils.logging import setup_logging


def cmd_run(args: argparse.Namespace) -> int:
    """Run Agent 3 in event-driven mode."""
    result = run_agent3()
    print(f"\n{result.summary()}")
    print("\nLead results:")
    for lr in result.lead_results:
        status = "✓" if lr.success else "✗"
        print(f"  {status} {lr.lead_id}: {lr.action}")
    return 0 if result.failed == 0 else 1


def cmd_draft(args: argparse.Namespace) -> int:
    """Draft an outreach message."""
    with Agent3() as agent:
        message = agent.draft_outreach_message(args.lead_id, args.step)
    print(f"\n{'='*60}")
    print(f"Outreach Message — Lead {args.lead_id}, Step {args.step}")
    print(f"{'='*60}")
    print(f"Channel:  {message.get('channel', 'N/A')}")
    print(f"Language: {message.get('language', 'N/A')}")
    if message.get("subject"):
        print(f"Subject:  {message['subject']}")
    print("\nMessage:")
    print(message.get("full_message", ""))
    return 0


def cmd_reply(args: argparse.Namespace) -> int:
    """Record a buyer reply."""
    with Agent3() as agent:
        result = agent.record_buyer_reply(
            lead_id=args.lead_id,
            reply_type=args.type,
            reply_content=args.content,
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_qual_answer(args: argparse.Namespace) -> int:
    """Record a QUAL gate answer."""
    answer_text = f"{args.question}: {args.answer}"
    with Agent3() as agent:
        result = agent.record_buyer_reply(
            lead_id=args.lead_id,
            reply_type="qualification_answer",
            reply_content=answer_text,
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_qual_status(args: argparse.Namespace) -> int:
    """Check QUAL gate status."""
    with Agent3() as agent:
        status = agent._check_qual_gate(args.lead_id)
    print(f"\n{'='*60}")
    print(f"QUAL Gate Status — Lead {args.lead_id}")
    print(f"{'='*60}")
    print(f"  All passed:       {status['all_passed']}")
    print(f"  Questions answered: {status['questions_answered']}/{status['total_questions']}")
    print(f"  Summary:          {status['summary']}")
    print("\n  Answers:")
    for qid, ans in status["answers"].items():
        positive = status["positive"].get(qid, False)
        status_icon = "✓" if positive else "✗" if ans else "○"
        print(f"    {qid} {status_icon}: {ans[:80] if ans else '(not answered)'}")
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    """Show outreach statistics."""
    stats = run_agent3_stats()
    print(f"\n{'='*60}")
    print("Agent 3 — Outreach Statistics")
    print(f"{'='*60}")
    print(f"  Total touches:       {stats['total_touches']}")
    print(f"  Total outbound:      {stats['total_outbound']}")
    print(f"  Total responses:     {stats['total_responses']}")
    print(f"  Response rate:       {stats['response_rate']}%")
    print("\n  By channel:")
    for channel, count in stats["by_channel"].items():
        print(f"    {channel}: {count}")
    print("\n  Leads in pipeline:")
    print(f"    In sequence:  {stats['leads_in_sequence']}")
    print(f"    Qualified:    {stats['leads_qualified']}")
    print(f"    Ghosted:      {stats['leads_ghosted']}")
    print(f"    Nurtured:     {stats['leads_nurtured']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 3 — Outreach & Qualification CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Run Agent 3 (event-driven)").set_defaults(func=cmd_run)

    p = sub.add_parser("draft", help="Draft an outreach message")
    p.add_argument("lead_id")
    p.add_argument("--step", type=int, required=True, help="Step number (1-6)")
    p.set_defaults(func=cmd_draft)

    p = sub.add_parser("reply", help="Record a buyer reply")
    p.add_argument("lead_id")
    p.add_argument(
        "--type", required=True, choices=["positive", "negative", "neutral", "qualification_answer"]
    )
    p.add_argument("--content", required=True, help="Buyer's verbatim reply")
    p.set_defaults(func=cmd_reply)

    p = sub.add_parser("qual-answer", help="Record a QUAL gate answer")
    p.add_argument("lead_id")
    p.add_argument("--question", required=True, choices=["Q1", "Q2", "Q3", "Q4", "Q5"])
    p.add_argument("--answer", required=True, help="Buyer's answer")
    p.set_defaults(func=cmd_qual_answer)

    p = sub.add_parser("qual-status", help="Check QUAL gate status")
    p.add_argument("lead_id")
    p.set_defaults(func=cmd_qual_status)

    sub.add_parser("stats", help="Show outreach statistics").set_defaults(func=cmd_stats)

    args = parser.parse_args()
    setup_logging()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
