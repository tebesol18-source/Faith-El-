"use client";

import { useState } from "react";
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "seller">("admin");
  const [userEmail, setUserEmail] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const handleLogin = (data: {
    role: "admin" | "seller";
    email: string;
    mustChangePassword?: boolean;
  }) => {
    setUserRole(data.role);
    setUserEmail(data.email);
    setMustChangePassword(!!data.mustChangePassword);
    setIsLoggedIn(true);
    setCurrentPage(data.role === "admin" ? "admin" : "dashboard");
  };

  const handleLogout = () => {
    // Best-effort: tell the server to revoke the session
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "x-csrf-token": getCsrfToken() || "" },
    }).catch(() => {});
    clearAuthToken();
    setIsLoggedIn(false);
    setUserRole("admin");
    setUserEmail("");
    setMustChangePassword(false);
    setCurrentPage("dashboard");
  };

  // Show login page if not authenticated
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // If the user must change their password, force them to the change-password page
  // before they can access anything else.
  if (mustChangePassword) {
    return (
      <ChangePasswordPage
        userEmail={userEmail}
        onDone={() => {
          setMustChangePassword(false);
          // Token is invalidated by the password change — clear it + go back to login
          clearAuthToken();
          setIsLoggedIn(false);
        }}
      />
    );
  }

  // Filter nav based on role:
  // Admin sees ONLY the System group (portfolio/commission/risk view)
  // Seller sees everything EXCEPT System (operational tools)
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
