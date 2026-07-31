"use client";

import {
  ChevronDown, Coffee, PanelLeft, PanelLeftClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/types";
import { navGroups, type NavGroup } from "@/lib/nav";

export function Sidebar({ currentPage, onNavigate, expanded, onToggle, navGroups: groups }: { currentPage: Page; onNavigate: (p: Page) => void; expanded: boolean; onToggle: () => void; navGroups?: typeof navGroups }) {
  const renderedGroups = groups ?? navGroups;
  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen border-r border-gray-200 bg-white flex flex-col transition-all duration-300",
      expanded ? "w-[240px]" : "w-[64px]"
    )}>
      {/* Logo / Toggle */}
      <div className="flex h-16 items-center border-b border-gray-100" style={{ justifyContent: expanded ? "space-between" : "center", padding: expanded ? "0 1.25rem" : "0" }}>
        <div className="flex items-center gap-2.5" style={{ display: expanded ? "flex" : "none" }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4A3520] shrink-0">
            <Coffee className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <span className="font-bold text-gray-900 text-sm tracking-tight">COFFEE</span>
            <span className="font-light text-gray-400 text-sm ml-1">EXPORT</span>
          </div>
        </div>
        <button onClick={onToggle} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0">
          {expanded ? <PanelLeftClose className="h-5 w-5 text-gray-500" strokeWidth={1.5} /> : <PanelLeft className="h-5 w-5 text-gray-500" strokeWidth={1.5} />}
        </button>
        {!expanded && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4A3520]">
            <Coffee className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3" style={{ padding: expanded ? "0.75rem 0.75rem" : "0.75rem 0.5rem" }}>
        {renderedGroups.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.label && expanded && <p className="px-3 mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>}
            {group.label && !expanded && gi > 0 && <div className="my-2 mx-2 border-t border-gray-100" />}
            <ul className="space-y-0.5">
              {group.items.map((item, i) => (
                <li key={i}>
                  <button
                    onClick={() => onNavigate(item.page)}
                    title={item.label}
                    className={cn(
                      "flex items-center rounded-lg transition-colors relative",
                      expanded ? "w-full gap-3 px-3 py-2 text-sm" : "w-full justify-center p-2.5",
                      currentPage === item.page
                        ? "bg-[#4A3520] text-white font-medium"
                        : item.highlight
                        ? "text-gray-900 font-medium hover:bg-gray-50"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <item.icon
                      className={cn("h-[18px] w-[18px] shrink-0", currentPage === item.page ? "text-white" : item.highlight ? "text-gray-700" : "text-gray-400")}
                      strokeWidth={1.5}
                    />
                    {expanded && <span className="flex-1 text-left">{item.label}</span>}
                    {item.badge && expanded && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{item.badge}</span>
                    )}
                    {item.badge && !expanded && (
                      <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{item.badge}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="border-t border-gray-100" style={{ padding: expanded ? "1rem" : "0.75rem 0.5rem" }}>
        <button className={cn("flex items-center rounded-lg transition-colors hover:bg-gray-50", expanded ? "w-full gap-3 p-1" : "w-full justify-center p-1")}>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] flex items-center justify-center text-white font-semibold text-sm shrink-0">AS</div>
          {expanded && (
            <div className="flex-1 text-left overflow-hidden">
              <p className="text-sm font-semibold text-gray-900 truncate">Abi Solomon</p>
              <p className="text-xs text-gray-400 truncate">Faith-El PLC</p>
            </div>
          )}
          {expanded && <ChevronDown className="h-4 w-4 text-gray-300 shrink-0" />}
        </button>
      </div>
    </aside>
  );
}

