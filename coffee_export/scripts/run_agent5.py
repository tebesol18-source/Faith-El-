#!/usr/bin/env python3
"""
Agent 5 CLI — Legal & Compliance operations.

Usage:
    # Run Agent 5 (process SAMPLE_APPROVED events → create contracts)
    python scripts/run_agent5.py run

    # Create a contract manually
    python scripts/run_agent5.py create-contract \\
        --lead-id L-2026-00047 --lot-id LOT-25-0001 \\
        --fob 4.50 --volume 200 --incoterm FOB

    # Check compliance checklist
    python scripts/run_agent5.py checklist CT-2026-0001

    # Submit a document
    python scripts/run_agent5.py submit CT-2026-0001 --type certificate_of_origin \\
        --file /docs/co.pdf

    # Approve a document
    python scripts/run_agent5.py approve --doc-id 1

    # Sign a contract (blocked if docs incomplete)
    python scripts/run_agent5.py sign CT-2026-0001

    # Show contract stats
    python scripts/run_agent5.py stats
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coffee_export.agents.agent5_compliance import Agent5, run_agent5, run_agent5_stats
from coffee_export.utils.logging import setup_logging


def cmd_run(args):
    result = run_agent5()
    print(f"\n{result.summary()}")
    for lr in result.lead_results:
        status = "✓" if lr.success else "✗"
        print(f"  {status} {lr.lead_id}: {lr.action}")
    return 0 if result.failed == 0 else 1


def cmd_create_contract(args):
    with Agent5() as agent:
        result = agent.create_contract_from_approval(
            lead_id=args.lead_id,
            lot_id=args.lot_id,
            buyer_target_fob=args.fob,
            buyer_target_volume_bags=args.volume,
            buyer_payment_terms=args.payment or "LC at sight",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("action") == "contract_created" else 1


def cmd_checklist(args):
    with Agent5() as agent:
        checklist = agent.get_compliance_checklist(args.contract_id)

    print(f"\n{'='*60}")
    print(f"📋 Compliance Checklist — {args.contract_id}")
    print(f"{'='*60}")
    print(f"  Can sign: {checklist.get('can_sign', False)}")
    print(f"  Approved: {checklist.get('approved', 0)}/{checklist.get('total_docs', 0)}")
    print(f"  Pending:  {checklist.get('pending', 0)}")
    if checklist.get("missing"):
        print(f"  Missing:  {', '.join(checklist['missing'])}")

    print("\n  Documents:")
    for item in checklist.get("checklist", []):
        print(f"    {item['icon']} {item['document_type']:<25} [{item['status']}]")
        print(f"       {item['description'][:80]}")
        if item.get("signing_exempt"):
            print(f"       {item['signing_exempt']}")
    return 0


def cmd_submit(args):
    with Agent5() as agent:
        result = agent.submit_document(
            contract_id=args.contract_id,
            document_type=args.type,
            file_path=args.file or "",
            issued_date=args.issued or "",
            expiry_date=args.expiry or "",
            notes=args.notes or "",
        )
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_approve(args):
    with Agent5() as agent:
        result = agent.approve_document(args.doc_id)
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_reject(args):
    with Agent5() as agent:
        result = agent.reject_document(args.doc_id, args.reason)
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_sign(args):
    with Agent5() as agent:
        result = agent.sign_contract(args.contract_id)
    if result.get("action") == "blocked":
        print(f"\n❌ BLOCKED: {result['reason']}")
        if result.get("missing_documents"):
            print(f"   Missing: {', '.join(result['missing_documents'])}")
        print(f"   Pending: {result.get('pending_count', 0)}")
        print(f"   Approved: {result.get('approved', 0)}/{result.get('total_required', 0)}")
        return 1
    print(json.dumps(result, indent=2, default=str))
    return 0


def cmd_generate_invoice(args):
    with Agent5() as agent:
        result = agent.generate_invoice(args.contract_id, save_to_file=not args.no_save)
    if "error" in result:
        print(f"\n❌ {result['error']}")
        return 1
    print(f"\n{'='*80}")
    print(result.get("invoice_text", ""))
    print(f"\n{'='*80}")
    print(f"  Invoice Number:  {result.get('invoice_number', '')}")
    print(f"  Contract:        {result.get('contract_id', '')}")
    print(f"  Buyer:           {result.get('buyer', '')}")
    print(
        f"  Total Value:     ${result.get('total_value', 0):,.2f} {result.get('currency', 'USD')}"
    )
    print(f"  File:            {result.get('file_path', '(not saved)')}")
    print(f"  Compliance doc:  {result.get('action', '')}")
    return 0


def cmd_generate_packing_list(args):
    with Agent5() as agent:
        result = agent.generate_packing_list(args.contract_id, save_to_file=not args.no_save)
    if "error" in result:
        print(f"\n❌ {result['error']}")
        return 1
    print(f"\n{'='*90}")
    print(result.get("packing_list_text", ""))
    print(f"\n{'='*90}")
    print(f"  Packing List No: {result.get('packing_list_number', '')}")
    print(f"  Contract:        {result.get('contract_id', '')}")
    print(f"  Buyer:           {result.get('buyer', '')}")
    print(f"  Total Bags:      {result.get('total_bags', 0)}")
    print(f"  Total Net:       {result.get('total_net_kg', 0):,.1f} kg")
    print(f"  Total Gross:     {result.get('total_gross_kg', 0):,.1f} kg")
    print(f"  File:            {result.get('file_path', '(not saved)')}")
    return 0


def cmd_generate_all(args):
    with Agent5() as agent:
        result = agent.generate_all_documents(args.contract_id)
    print(f"\n{'='*60}")
    print(f"Auto-Generated Documents for {args.contract_id}")
    print(f"{'='*60}")
    for doc_type, doc_result in result.get("results", {}).items():
        if "error" in doc_result:
            print(f"  ✗ {doc_type}: {doc_result['error']}")
        else:
            number = doc_result.get("invoice_number") or doc_result.get("packing_list_number", "")
            print(f"  ✓ {doc_type}: {number} → {doc_result.get('file_path', '(not saved)')}")
    return 0


def cmd_stats(args):
    stats = run_agent5_stats()
    print(f"\n{'='*60}")
    print("Agent 5 — Contract Statistics")
    print(f"{'='*60}")
    print(f"  Total contracts: {stats['total_contracts']}")
    print(f"  Total value:     ${stats['total_value']}")
    print("\n  By status:")
    for status, count in sorted(stats["by_status"].items()):
        print(f"    {status}: {count}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 5 — Legal & Compliance CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Run Agent 5 (event-driven)").set_defaults(func=cmd_run)

    p = sub.add_parser("create-contract", help="Create a contract manually")
    p.add_argument("--lead-id", required=True)
    p.add_argument("--lot-id", required=True)
    p.add_argument("--fob", type=float, required=True, help="FOB price per bag (USD)")
    p.add_argument("--volume", type=int, required=True, help="Volume in bags")
    p.add_argument("--incoterm", default="FOB", choices=["FOB", "CIF", "EXW", "FCA", "CFR"])
    p.add_argument("--payment", help="Payment terms (default: LC at sight)")
    p.set_defaults(func=cmd_create_contract)

    p = sub.add_parser("checklist", help="Show compliance checklist")
    p.add_argument("contract_id")
    p.set_defaults(func=cmd_checklist)

    p = sub.add_parser("submit", help="Submit a compliance document")
    p.add_argument("contract_id")
    p.add_argument("--type", required=True, help="Document type (e.g. certificate_of_origin)")
    p.add_argument("--file", help="File path")
    p.add_argument("--issued", help="Issue date (YYYY-MM-DD)")
    p.add_argument("--expiry", help="Expiry date (YYYY-MM-DD)")
    p.add_argument("--notes", help="Notes")
    p.set_defaults(func=cmd_submit)

    p = sub.add_parser("approve", help="Approve a compliance document")
    p.add_argument("--doc-id", type=int, required=True)
    p.set_defaults(func=cmd_approve)

    p = sub.add_parser("reject", help="Reject a compliance document")
    p.add_argument("--doc-id", type=int, required=True)
    p.add_argument("--reason", required=True)
    p.set_defaults(func=cmd_reject)

    p = sub.add_parser("sign", help="Sign a contract (blocked if docs incomplete)")
    p.add_argument("contract_id")
    p.set_defaults(func=cmd_sign)

    p = sub.add_parser("generate-invoice", help="Generate a commercial invoice")
    p.add_argument("contract_id")
    p.add_argument("--no-save", action="store_true", help="Don't save to file")
    p.set_defaults(func=cmd_generate_invoice)

    p = sub.add_parser("generate-packing-list", help="Generate a packing list")
    p.add_argument("contract_id")
    p.add_argument("--no-save", action="store_true", help="Don't save to file")
    p.set_defaults(func=cmd_generate_packing_list)

    p = sub.add_parser("generate-all", help="Generate all auto-generatable documents")
    p.add_argument("contract_id")
    p.set_defaults(func=cmd_generate_all)

    sub.add_parser("stats", help="Show contract statistics").set_defaults(func=cmd_stats)

    args = parser.parse_args()
    setup_logging()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
