"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/types";
import { navGroups } from "@/lib/nav";
import { clearAuthToken } from "@/lib/auth-client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { InboxPage } from "@/components/pages/InboxPage";
import { LeadsPage } from "@/components/pages/LeadsPage";
import { DealsPage } from "@/components/pages/DealsPage";
import { InventoryPage } from "@/components/pages/InventoryPage";
import { SamplesPage } from "@/components/pages/SamplesPage";
import { QuotesPage } from "@/components/pages/QuotesPage";
import { CompliancePage } from "@/components/pages/CompliancePage";
import { ShipmentsPage } from "@/components/pages/ShipmentsPage";
import { ContractsPage } from "@/components/pages/ContractsPage";
import { FinancePage } from "@/components/pages/FinancePage";
import { CoachPage } from "@/components/pages/CoachPage";
import { AdminPage } from "@/components/pages/AdminPage";
import { LoginPage } from "@/components/pages/LoginPage";
import { ChangePasswordPage } from "@/components/pages/ChangePasswordPage";
import { getCsrfToken } from "@/lib/auth-client";

export default function App() {
  // Start with a "checking" state so we don't flash the login page
  // before the session check completes
  const [authState, setAuthState] = useState<"checking" | "loggedOut" | "loggedIn">("checking");
  const [userRole, setUserRole] = useState<"admin" | "seller">("admin");
  const [userEmail, setUserEmail] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // ─── On mount: check if there's a valid session (cookie-based) ───
  // This prevents the "refresh kicks you back to login" problem.
  // The session cookie is httpOnly so JS can't read it directly,
  // but we can call /api/health (or any authenticated endpoint) to
  // check if the session is still valid.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard", { credentials: "same-origin" })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          // Session is valid — extract user info from the response
          r.json().then((data) => {
            if (cancelled) return;
            if (data.ok) {
              // We don't have the email/role from dashboard response,
              // but we know the session is valid. Use a dedicated endpoint
              // or just set defaults based on what we can infer.
              setAuthState("loggedIn");
              // Try to get user info from a lightweight endpoint
              fetch("/api/auth/me", { credentials: "same-origin" })
                .then((r2) => r2.json())
                .then((me) => {
                  if (cancelled) return;
                  if (me.ok) {
                    setUserRole(me.role === "admin" ? "admin" : "seller");
                    setUserEmail(me.email || "");
                    setMustChangePassword(!!me.mustChangePassword);
                    setCurrentPage(me.role === "admin" ? "admin" : "dashboard");
                  }
                })
                .catch(() => {});
            } else {
              setAuthState("loggedOut");
            }
          });
        } else if (r.status === 401) {
          // Not authenticated — show login
          setAuthState("loggedOut");
        } else if (r.status === 403) {
          // Authenticated but mustChangePassword — show change password page
          r.json().then((data) => {
            if (cancelled) return;
            setMustChangePassword(true);
            setAuthState("loggedIn");
            // We need the email — try /api/auth/me
            fetch("/api/auth/me", { credentials: "same-origin" })
              .then((r2) => r2.json())
              .then((me) => {
                if (cancelled) return;
                if (me.ok) {
                  setUserRole(me.role === "admin" ? "admin" : "seller");
                  setUserEmail(me.email || "");
                }
              })
              .catch(() => {});
          });
        } else {
          setAuthState("loggedOut");
        }
      })
      .catch(() => {
        if (!cancelled) setAuthState("loggedOut");
      });
    return () => { cancelled = true; };
  }, []);

  const handleLogin = (data: {
    role: "admin" | "seller";
    email: string;
    mustChangePassword?: boolean;
  }) => {
    setUserRole(data.role);
    setUserEmail(data.email);
    setMustChangePassword(!!data.mustChangePassword);
    setAuthState("loggedIn");
    setCurrentPage(data.role === "admin" ? "admin" : "dashboard");
  };

  const handleLogout = () => {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "x-csrf-token": getCsrfToken() || "" },
      credentials: "same-origin",
    }).catch(() => {});
    clearAuthToken();
    setAuthState("loggedOut");
    setUserRole("admin");
    setUserEmail("");
    setMustChangePassword(false);
    setCurrentPage("dashboard");
  };

  // While checking session — show a loading spinner (no login flash)
  if (authState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (authState === "loggedOut") {
    return <LoginPage onLogin={handleLogin} />;
  }

  // If the user must change their password, force them to the change-password page
  if (mustChangePassword) {
    return (
      <ChangePasswordPage
        userEmail={userEmail}
        onDone={() => {
          setMustChangePassword(false);
          clearAuthToken();
          setAuthState("loggedOut");
        }}
      />
    );
  }

  // Filter nav based on role
  const visibleNavGroups = userRole === "admin"
    ? navGroups.filter(g => g.label === "System")
    : navGroups.filter(g => g.label !== "System");

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        navGroups={visibleNavGroups}
      />
      <div className={cn("transition-all duration-300", sidebarExpanded ? "ml-[240px]" : "ml-[64px]")}>
        <TopHeader userRole={userRole} onLogout={handleLogout} />
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "inbox" && <InboxPage />}
        {currentPage === "leads" && <LeadsPage />}
        {currentPage === "deals" && <DealsPage />}
        {currentPage === "inventory" && <InventoryPage />}
        {currentPage === "samples" && <SamplesPage />}
        {currentPage === "quotes" && <QuotesPage />}
        {currentPage === "compliance" && <CompliancePage />}
        {currentPage === "shipments" && <ShipmentsPage />}
        {currentPage === "contracts" && <ContractsPage />}
        {currentPage === "finance" && <FinancePage />}
        {currentPage === "coach" && <CoachPage onNavigate={setCurrentPage} />}
        {currentPage === "admin" && userRole === "admin" && <AdminPage onLogout={handleLogout} onNavigate={setCurrentPage} />}
      </div>
    </div>
  );
}
