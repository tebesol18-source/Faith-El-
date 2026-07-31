/**
 * Sidebar navigation groups.
 * Used by both admin (System only) and seller (everything except System) roles.
 */
"use client";

import {
  LayoutDashboard, Inbox as InboxIcon, Users, Handshake, Package, FlaskConical,
  FileText, ScrollText, Truck, DollarSign, Sparkles, ShieldCheck,
} from "lucide-react";
import type { Page } from "@/lib/types";

export type NavItem = {
  icon: any;
  label: string;
  page: Page;
  badge?: number;
  highlight?: boolean;
};

export type NavGroup = {
  label: string | null;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  { label: null, items: [{ icon: LayoutDashboard, label: "Dashboard", page: "dashboard", highlight: true }] },
  { label: "Sales", items: [
    { icon: InboxIcon, label: "Inbox", page: "inbox", badge: 8, highlight: true },
    { icon: Users, label: "Leads", page: "leads" },
    { icon: Handshake, label: "Deals", page: "deals", highlight: true },
  ]},
  { label: "Coffee", items: [
    { icon: Package, label: "Inventory", page: "inventory" },
    { icon: FlaskConical, label: "Samples", page: "samples" },
  ]},
  { label: "Documents", items: [
    { icon: FileText, label: "Quotes", page: "quotes" },
    { icon: ScrollText, label: "Contracts", page: "contracts" },
  ]},
  { label: "Operations", items: [
    { icon: Truck, label: "Shipments", page: "shipments" },
    { icon: ShieldCheck, label: "Compliance", page: "compliance", badge: 3, highlight: true },
  ] },
  { label: null, items: [
    { icon: DollarSign, label: "Finance", page: "finance", highlight: true },
    { icon: Sparkles, label: "AI Coach", page: "coach" },
  ]},
  { label: "System", items: [
    { icon: ShieldCheck, label: "Portfolio", page: "admin", highlight: true },
  ]},
];
