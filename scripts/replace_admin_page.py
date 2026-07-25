#!/usr/bin/env python3
"""Replace AdminPage with portfolio-focused admin (5 tabs: Portfolio/Sellers/Commission/Risk/System)."""
from pathlib import Path

FILE = Path("/home/z/my-project/src/app/page.tsx")
content = FILE.read_text()

# Find the exact boundaries
start_marker = "// ═══════════════════════════════════════════════════════════\n// ADMIN PAGE"
end_marker = "\n// ═══════════════════════════════════════════════════════════\n// LOGIN PAGE"

start_idx = content.index(start_marker)
end_idx = content.index(end_marker)

before = content[:start_idx]
after = content[end_idx:]

NEW_ADMIN = '''// ═══════════════════════════════════════════════════════════
// ADMIN PAGE — Portfolio view for overseeing sellers, commission, and risk
// ═══════════════════════════════════════════════════════════

// ─── Seller Data Model ─────────────────────────────────────
type SellerRisk = "healthy" | "warning" | "critical";

type Seller = {
  id: string;
  name: string;
  contact: string;
  email: string;
  region: string;
  dealsClosed: number;
  dealsActive: number;
  pipelineValue: number;
  revenueYTD: number;
  commissionEarned: number;   // 2% of revenueYTD — already received
  commissionPending: number;  // 2% of pipeline — will be received when deals close
  riskLevel: SellerRisk;
  atRiskDeals: number;
  overduePayments: number;
  missingDocs: number;
  avgMargin: number;
  lastActive: string;
  joinedDate: string;
  status: "active" | "warning" | "suspended";
  topBuyer: string;
  topOrigin: string;
};

type SellerDeal = {
  id: string;
  buyer: string;
  value: number;
  margin: number;
  status: "completed" | "in_progress" | "at_risk" | "rejected";
  commission: number;
};

const sellersData: Seller[] = [
  {
    id: "SEL-001", name: "Coelrodan PLC", contact: "Abi Solomon", email: "abi@coelrodan.com", region: "Yirgacheffe",
    dealsClosed: 18, dealsActive: 11, pipelineValue: 245000, revenueYTD: 84600,
    commissionEarned: 1692, commissionPending: 4900,
    riskLevel: "healthy", atRiskDeals: 1, overduePayments: 0, missingDocs: 0,
    avgMargin: 21.9, lastActive: "2 min ago", joinedDate: "Jan 2026", status: "active",
    topBuyer: "Blue Mountain Traders", topOrigin: "Yirgacheffe G1",
  },
  {
    id: "SEL-002", name: "Sidamo Trading Co", contact: "Sara Bekele", email: "sara@sidamotrade.com", region: "Sidamo",
    dealsClosed: 12, dealsActive: 8, pipelineValue: 180000, revenueYTD: 64000,
    commissionEarned: 1280, commissionPending: 3600,
    riskLevel: "healthy", atRiskDeals: 0, overduePayments: 1, missingDocs: 2,
    avgMargin: 19.8, lastActive: "1h ago", joinedDate: "Feb 2026", status: "active",
    topBuyer: "Falcon Coffee UK", topOrigin: "Sidamo G2",
  },
  {
    id: "SEL-003", name: "Yirgacheffe Exports Ltd", contact: "Dawit Tadesse", email: "dawit@yirgexports.com", region: "Yirgacheffe",
    dealsClosed: 8, dealsActive: 5, pipelineValue: 120000, revenueYTD: 42000,
    commissionEarned: 840, commissionPending: 2400,
    riskLevel: "warning", atRiskDeals: 2, overduePayments: 0, missingDocs: 3,
    avgMargin: 18.2, lastActive: "3h ago", joinedDate: "Mar 2026", status: "active",
    topBuyer: "Marcus Coffee GmbH", topOrigin: "Yirgacheffe G1",
  },
  {
    id: "SEL-004", name: "Guji Highland Coffee", contact: "Helen Girma", email: "helen@gujihighland.com", region: "Guji",
    dealsClosed: 5, dealsActive: 3, pipelineValue: 75000, revenueYTD: 28000,
    commissionEarned: 560, commissionPending: 1500,
    riskLevel: "warning", atRiskDeals: 1, overduePayments: 0, missingDocs: 5,
    avgMargin: 17.5, lastActive: "Yesterday", joinedDate: "Apr 2026", status: "active",
    topBuyer: "Hashimoto Coffee", topOrigin: "Guji G1",
  },
  {
    id: "SEL-005", name: "Limu Valley Trading", contact: "Marcus Asfaw", email: "marcus@limuvalley.com", region: "Limu",
    dealsClosed: 3, dealsActive: 2, pipelineValue: 45000, revenueYTD: 15000,
    commissionEarned: 300, commissionPending: 900,
    riskLevel: "critical", atRiskDeals: 2, overduePayments: 1, missingDocs: 4,
    avgMargin: 14.2, lastActive: "2 days ago", joinedDate: "May 2026", status: "warning",
    topBuyer: "Rösterei Berlin", topOrigin: "Limu G1",
  },
  {
    id: "SEL-006", name: "Harar Coffee Exports", contact: "Yusuf Omar", email: "yusuf@hararcoffee.com", region: "Harar",
    dealsClosed: 2, dealsActive: 1, pipelineValue: 30000, revenueYTD: 8000,
    commissionEarned: 160, commissionPending: 600,
    riskLevel: "critical", atRiskDeals: 1, overduePayments: 2, missingDocs: 6,
    avgMargin: 12.8, lastActive: "1 week ago", joinedDate: "Jun 2026", status: "warning",
    topBuyer: "Aurora Imports", topOrigin: "Harar G4",
  },
];

const sellerRiskConfig: Record<SellerRisk, { label: string; bg: string; text: string; dot: string; border: string }> = {
  healthy: { label: "Healthy", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", border: "border-green-200" },
  warning: { label: "Warning", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", border: "border-amber-200" },
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", border: "border-red-200" },
};

// Per-seller deal breakdowns (for drawer)
const sellerDealsData: Record<string, SellerDeal[]> = {
  "SEL-001": [
    { id: "CT-2026-0003", buyer: "Blue Mountain Traders", value: 84600, margin: 19.6, status: "in_progress", commission: 1692 },
    { id: "CT-2026-0004", buyer: "Marcus Coffee GmbH", value: 70500, margin: 22.4, status: "in_progress", commission: 1410 },
    { id: "CT-2025-0195", buyer: "Marcus Coffee GmbH", value: 58900, margin: 23.1, status: "completed", commission: 1178 },
    { id: "CT-2026-0008", buyer: "Seoul Coffee Lab", value: 27600, margin: 20.8, status: "in_progress", commission: 552 },
    { id: "CT-2026-0002", buyer: "Rösterei Berlin", value: 39000, margin: 25.4, status: "rejected", commission: 0 },
  ],
  "SEL-002": [
    { id: "CT-2026-0020", buyer: "Falcon Coffee UK", value: 52400, margin: 19.2, status: "in_progress", commission: 1048 },
    { id: "CT-2026-0018", buyer: "Nordic Bean Co", value: 42000, margin: 21.5, status: "completed", commission: 840 },
    { id: "CT-2026-0015", buyer: "Antwerp Roasters", value: 38000, margin: 18.7, status: "completed", commission: 760 },
    { id: "CT-2026-0022", buyer: "Trieste Coffee", value: 28000, margin: 16.2, status: "at_risk", commission: 560 },
  ],
  "SEL-003": [
    { id: "CT-2026-0030", buyer: "Marcus Coffee GmbH", value: 32000, margin: 20.1, status: "in_progress", commission: 640 },
    { id: "CT-2026-0028", buyer: "Berlin Specialty", value: 28000, margin: 17.8, status: "at_risk", commission: 560 },
    { id: "CT-2026-0025", buyer: "Hamburg Beans", value: 22000, margin: 16.5, status: "completed", commission: 440 },
  ],
  "SEL-004": [
    { id: "CT-2026-0040", buyer: "Hashimoto Coffee", value: 30200, margin: 18.9, status: "in_progress", commission: 604 },
    { id: "CT-2026-0038", buyer: "Yokohama Trading", value: 24800, margin: 16.2, status: "at_risk", commission: 496 },
    { id: "CT-2026-0035", buyer: "Osaka Coffee", value: 20000, margin: 17.5, status: "completed", commission: 400 },
  ],
  "SEL-005": [
    { id: "CT-2026-0050", buyer: "Rösterei Berlin", value: 19500, margin: 14.8, status: "at_risk", commission: 390 },
    { id: "CT-2026-0048", buyer: "Munich Roasters", value: 16800, margin: 13.5, status: "at_risk", commission: 336 },
    { id: "CT-2026-0045", buyer: "Frankfurt Coffee", value: 15000, margin: 15.2, status: "completed", commission: 300 },
  ],
  "SEL-006": [
    { id: "CT-2026-0060", buyer: "Aurora Imports", value: 18000, margin: 12.8, status: "at_risk", commission: 360 },
    { id: "CT-2026-0058", buyer: "NYC Coffee Co", value: 12000, margin: 11.5, status: "completed", commission: 240 },
  ],
};

// ─── Operator/Agent/Audit data (moved from old AdminPage for System tab) ───
type OperatorRole = "admin" | "manager" | "operator" | "viewer";

type Operator = {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  status: "active" | "disabled";
  lastActive: string;
  actionsToday: number;
};

type AIAgent = {
  id: string;
  name: string;
  model: string;
  status: "active" | "idle" | "error" | "paused";
  lastAction: string;
  lastActionTime: string;
  actionsToday: number;
  approvalsWaiting: number;
};

type ApprovalItem = {
  id: string;
  agent: string;
  action: string;
  target: string;
  submittedAt: string;
  riskLevel: "low" | "medium" | "high";
  detail: string;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actorType: "operator" | "agent";
  action: string;
  entityType: string;
  entityId: string;
};

const operatorsData: Operator[] = [
  { id: "OP-001", name: "Abi Solomon", email: "abi@coelrodan.com", role: "admin", status: "active", lastActive: "2 min ago", actionsToday: 47 },
  { id: "OP-002", name: "Sara Bekele", email: "sara@coelrodan.com", role: "manager", status: "active", lastActive: "1h ago", actionsToday: 23 },
  { id: "OP-003", name: "Dawit Tadesse", email: "dawit@coelrodan.com", role: "operator", status: "active", lastActive: "3h ago", actionsToday: 12 },
  { id: "OP-004", name: "Helen Girma", email: "helen@coelrodan.com", role: "operator", status: "active", lastActive: "Yesterday", actionsToday: 0 },
  { id: "OP-005", name: "Marcus Bauer", email: "marcus@external.com", role: "viewer", status: "active", lastActive: "2 days ago", actionsToday: 0 },
  { id: "OP-006", name: "Yuki Hashimoto", email: "yuki@external.com", role: "viewer", status: "disabled", lastActive: "2 weeks ago", actionsToday: 0 },
];

const aiAgentsData: AIAgent[] = [
  { id: "AGT-SUP", name: "Supplier Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Identified LOT-25-0007 for Hashimoto counter", lastActionTime: "Yesterday", actionsToday: 8, approvalsWaiting: 0 },
  { id: "AGT-OUT", name: "Outreach Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Drafted Quote QU-2026-0007 for Aurora", lastActionTime: "2h ago", actionsToday: 12, approvalsWaiting: 1 },
  { id: "AGT-CUS", name: "Customer Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Drafted breakup email for Nordic Bean", lastActionTime: "2 days ago", actionsToday: 4, approvalsWaiting: 1 },
  { id: "AGT-SMP", name: "Sample Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Tracked SR-2026-0003 dispatch", lastActionTime: "Yesterday", actionsToday: 3, approvalsWaiting: 0 },
  { id: "AGT-CMP", name: "Compliance Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Flagged phytosanitary expiry CT-2026-001", lastActionTime: "5h ago", actionsToday: 6, approvalsWaiting: 0 },
  { id: "AGT-LOG", name: "Logistics Agent", model: "Llama 3.3 70B", status: "active", lastAction: "Tracked MSC Hamburg through Suez", lastActionTime: "Yesterday", actionsToday: 9, approvalsWaiting: 0 },
  { id: "AGT-CRM", name: "Customer Insights Agent", model: "Llama 3.3 70B", status: "idle", lastAction: "Generated weekly buyer insights report", lastActionTime: "3 days ago", actionsToday: 1, approvalsWaiting: 0 },
];

const approvalsData: ApprovalItem[] = [
  { id: "APR-0042", agent: "Outreach Agent", action: "Send quote to Aurora Imports", target: "QU-2026-0007", submittedAt: "1h ago", riskLevel: "medium", detail: "First-time buyer, no transaction history. Quote value $22,500. Margin 21.3%." },
  { id: "APR-0041", agent: "Customer Agent", action: "Send breakup email to Nordic Bean Co", target: "QU-2026-0001", submittedAt: "2 days ago", riskLevel: "low", detail: "Quote expired 15 days ago. Standard re-engagement email." },
  { id: "APR-0040", agent: "Outreach Agent", action: "Add 4 new leads from research batch", target: "L-2026-00510 to L-2026-00513", submittedAt: "3 days ago", riskLevel: "low", detail: "4 German specialty roasters identified with annual imports >5t." },
];

const auditData: AuditEntry[] = [
  { id: "AUD-9821", timestamp: "10:42 AM", actor: "Abi Solomon", actorType: "operator", action: "Approved quote V2", entityType: "Quote", entityId: "QU-2026-0004" },
  { id: "AUD-9820", timestamp: "10:15 AM", actor: "Compliance Agent", actorType: "agent", action: "Created alert", entityType: "Shipment", entityId: "CT-2026-001" },
  { id: "AUD-9819", timestamp: "09:48 AM", actor: "Outreach Agent", actorType: "agent", action: "Drafted quote", entityType: "Quote", entityId: "QU-2026-0007" },
  { id: "AUD-9818", timestamp: "09:22 AM", actor: "Sara Bekele", actorType: "operator", action: "Updated lot", entityType: "Inventory", entityId: "LOT-25-0007" },
  { id: "AUD-9817", timestamp: "Yesterday 18:34", actor: "Logistics Agent", actorType: "agent", action: "Updated milestone", entityType: "Shipment", entityId: "CT-2026-001" },
  { id: "AUD-9816", timestamp: "Yesterday 16:12", actor: "Abi Solomon", actorType: "operator", action: "Signed contract", entityType: "Contract", entityId: "CT-2026-0003" },
];

const operatorRoleConfig: Record<OperatorRole, { label: string; bg: string; text: string }> = {
  admin: { label: "Admin", bg: "bg-[#4A3520]", text: "text-white" },
  manager: { label: "Manager", bg: "bg-indigo-50", text: "text-indigo-700" },
  operator: { label: "Operator", bg: "bg-blue-50", text: "text-blue-700" },
  viewer: { label: "Viewer", bg: "bg-gray-100", text: "text-gray-600" },
};

// ─── Admin Page (5 tabs: Portfolio / Sellers / Commission / Risk / System) ───
function AdminPage({ onLogout }: { onLogout: () => void; onNavigate: (p: Page) => void }) {
  const [activeTab, setActiveTab] = useState<"portfolio" | "sellers" | "commission" | "risk" | "system">("portfolio");
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);

  // Portfolio totals
  const totals = {
    sellers: sellersData.length,
    dealsClosed: sellersData.reduce((s, x) => s + x.dealsClosed, 0),
    dealsActive: sellersData.reduce((s, x) => s + x.dealsActive, 0),
    pipelineValue: sellersData.reduce((s, x) => s + x.pipelineValue, 0),
    revenueYTD: sellersData.reduce((s, x) => s + x.revenueYTD, 0),
    commissionEarned: sellersData.reduce((s, x) => s + x.commissionEarned, 0),
    commissionPending: sellersData.reduce((s, x) => s + x.commissionPending, 0),
    atRiskSellers: sellersData.filter(s => s.riskLevel === "critical").length,
    warningSellers: sellersData.filter(s => s.riskLevel === "warning").length,
    healthySellers: sellersData.filter(s => s.riskLevel === "healthy").length,
  };

  const selected = sellersData.find(s => s.id === selectedSeller);
  const selectedDeals = selectedSeller ? (sellerDealsData[selectedSeller] || []) : [];

  const tabs = [
    { id: "portfolio" as const, label: "Portfolio", icon: LayoutDashboard },
    { id: "sellers" as const, label: "Sellers", icon: Users, count: totals.sellers },
    { id: "commission" as const, label: "Commission", icon: DollarSign },
    { id: "risk" as const, label: "Risk", icon: AlertTriangle, count: totals.atRiskSellers + totals.warningSellers },
    { id: "system" as const, label: "System", icon: Server },
  ];

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#4A3520] px-2 py-0.5 text-[10px] font-semibold text-white">
              <ShieldCheck className="h-2.5 w-2.5" /> Admin
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Portfolio overview — sellers, commission, and risk</p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px", activeTab === tab.id ? "border-[#4A3520] text-[#4A3520]" : "border-transparent text-gray-500 hover:text-gray-900")}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {"count" in tab && tab.count !== undefined && tab.count > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", activeTab === tab.id ? "bg-[#4A3520] text-white" : "bg-gray-100 text-gray-500")}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ PORTFOLIO TAB ═══ */}
      {activeTab === "portfolio" && (
        <div className="space-y-6">
          {/* Commission hero — the admin's main number */}
          <div className="rounded-xl border border-[#4A3520] bg-gradient-to-br from-[#4A3520] to-[#6B4E33] p-6 text-white">
            <div className="grid grid-cols-4 gap-6">
              <div>
                <p className="text-xs font-medium text-white/60">Commission Earned (YTD)</p>
                <p className="text-3xl font-bold mt-1">${totals.commissionEarned.toLocaleString()}</p>
                <p className="text-[11px] text-white/50 mt-0.5">2% of ${totals.revenueYTD.toLocaleString()} revenue</p>
              </div>
              <div className="border-l border-white/10 pl-6">
                <p className="text-xs font-medium text-white/60">Pending Commission</p>
                <p className="text-3xl font-bold mt-1 text-amber-300">${totals.commissionPending.toLocaleString()}</p>
                <p className="text-[11px] text-white/50 mt-0.5">from {totals.dealsActive} active deals</p>
              </div>
              <div className="border-l border-white/10 pl-6">
                <p className="text-xs font-medium text-white/60">Total Pipeline</p>
                <p className="text-3xl font-bold mt-1">${(totals.pipelineValue / 1000).toFixed(0)}K</p>
                <p className="text-[11px] text-white/50 mt-0.5">{totals.dealsClosed + totals.dealsActive} deals total</p>
              </div>
              <div className="border-l border-white/10 pl-6">
                <p className="text-xs font-medium text-white/60">At-Risk Sellers</p>
                <p className="text-3xl font-bold mt-1 text-red-300">{totals.atRiskSellers}<span className="text-lg font-normal text-white/50"> / {totals.sellers}</span></p>
                <p className="text-[11px] text-white/50 mt-0.5">{totals.warningSellers} warnings</p>
              </div>
            </div>
          </div>

          {/* Seller performance cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Seller Performance</h3>
              <button onClick={() => setActiveTab("sellers")} className="text-xs font-medium text-[#4A3520] hover:underline">View all →</button>
            </div>
            <div className="space-y-2">
              {sellersData.map((s) => {
                const rc = sellerRiskConfig[s.riskLevel];
                return (
                  <div key={s.id} onClick={() => { setSelectedSeller(s.id); }} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300">
                    <div className="flex items-center gap-4">
                      {/* Risk indicator */}
                      <span className={cn("h-10 w-1 rounded-full shrink-0", rc.dot)} />
                      {/* Seller info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", rc.bg, rc.text)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", rc.dot)} /> {rc.label}
                          </span>
                          <span className="text-[11px] text-gray-400">· {s.region}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">{s.contact} · {s.lastActive}</p>
                      </div>
                      {/* Metrics */}
                      <div className="flex items-center gap-6 text-xs">
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Closed</p>
                          <p className="text-base font-bold text-gray-900">{s.dealsClosed}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Active</p>
                          <p className="text-base font-bold text-blue-600">{s.dealsActive}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Revenue</p>
                          <p className="text-base font-bold text-gray-900">${(s.revenueYTD / 1000).toFixed(0)}K</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Commission</p>
                          <p className="text-base font-bold text-[#4A3520]">${s.commissionEarned.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">Margin</p>
                          <p className={cn("text-base font-bold", s.avgMargin >= 20 ? "text-green-600" : s.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{s.avgMargin.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SELLERS TAB ═══ */}
      {activeTab === "sellers" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{sellersData.length} sellers · {totals.dealsClosed} deals closed · ${totals.commissionEarned.toLocaleString()} commission earned</p>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Seller</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Risk</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Closed</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Active</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Revenue</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Commission</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Margin</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {sellersData.map((s) => {
                  const rc = sellerRiskConfig[s.riskLevel];
                  return (
                    <tr key={s.id} onClick={() => setSelectedSeller(s.id)} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] text-white font-semibold text-sm shrink-0">
                            {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{s.name}</p>
                            <p className="text-[11px] text-gray-400">{s.contact} · {s.region}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", rc.bg, rc.text)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", rc.dot)} /> {rc.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-gray-900">{s.dealsClosed}</td>
                      <td className="px-3 py-3 text-right font-medium text-blue-600">{s.dealsActive}</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">${(s.revenueYTD / 1000).toFixed(0)}K</td>
                      <td className="px-3 py-3 text-right font-bold text-[#4A3520]">${s.commissionEarned.toLocaleString()}</td>
                      <td className={cn("px-3 py-3 text-right font-bold", s.avgMargin >= 20 ? "text-green-600" : s.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{s.avgMargin.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setSelectedSeller(s.id)} className="text-xs font-medium text-[#4A3520] hover:underline">View →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ COMMISSION TAB ═══ */}
      {activeTab === "commission" && (
        <div className="space-y-6">
          {/* Commission summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-green-200 bg-green-50/30 p-5">
              <p className="text-xs font-medium text-green-700">Commission Received</p>
              <p className="text-3xl font-bold text-green-700 mt-1">${totals.commissionEarned.toLocaleString()}</p>
              <p className="text-[11px] text-green-500 mt-0.5">2% of ${totals.revenueYTD.toLocaleString()} revenue</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
              <p className="text-xs font-medium text-amber-700">Commission Pending</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">${totals.commissionPending.toLocaleString()}</p>
              <p className="text-[11px] text-amber-500 mt-0.5">from {totals.dealsActive} active deals</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-medium text-gray-500">Total Commission (YTD)</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">${(totals.commissionEarned + totals.commissionPending).toLocaleString()}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">received + pending</p>
            </div>
          </div>

          {/* Per-seller commission breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Commission by Seller</h3>
            <div className="space-y-3">
              {sellersData.map((s) => {
                const totalComm = s.commissionEarned + s.commissionPending;
                const maxComm = Math.max(...sellersData.map(x => x.commissionEarned + x.commissionPending));
                const pct = (totalComm / maxComm) * 100;
                return (
                  <div key={s.id} onClick={() => setSelectedSeller(s.id)} className="cursor-pointer hover:bg-gray-50 rounded-lg p-3 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4A3520] to-[#6B4E33] text-white font-semibold text-xs shrink-0">
                          {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.name}</p>
                          <p className="text-[11px] text-gray-400">{s.dealsClosed} deals closed · {s.dealsActive} active</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#4A3520]">${totalComm.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-400">${s.commissionEarned.toLocaleString()} received · ${s.commissionPending.toLocaleString()} pending</p>
                      </div>
                    </div>
                    <div className="flex h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="bg-green-500" style={{ width: `${(s.commissionEarned / maxComm) * 100}%` }} title="Received" />
                      <div className="bg-amber-400" style={{ width: `${(s.commissionPending / maxComm) * 100}%` }} title="Pending" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ RISK TAB ═══ */}
      {activeTab === "risk" && (
        <div className="space-y-6">
          {/* Risk summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-green-200 bg-green-50/30 p-5">
              <p className="text-xs font-medium text-green-700">Healthy</p>
              <p className="text-3xl font-bold text-green-700 mt-1">{totals.healthySellers}</p>
              <p className="text-[11px] text-green-500 mt-0.5">no significant risk</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
              <p className="text-xs font-medium text-amber-700">Warning</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">{totals.warningSellers}</p>
              <p className="text-[11px] text-amber-500 mt-0.5">needs attention</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
              <p className="text-xs font-medium text-red-700">Critical</p>
              <p className="text-3xl font-bold text-red-700 mt-1">{totals.atRiskSellers}</p>
              <p className="text-[11px] text-red-500 mt-0.5">immediate action needed</p>
            </div>
          </div>

          {/* At-risk sellers detail */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Sellers Needing Attention</h3>
            <div className="space-y-3">
              {sellersData.filter(s => s.riskLevel !== "healthy").sort((a, b) => {
                const order = { critical: 0, warning: 1, healthy: 2 };
                return order[a.riskLevel] - order[b.riskLevel];
              }).map((s) => {
                const rc = sellerRiskConfig[s.riskLevel];
                return (
                  <div key={s.id} onClick={() => setSelectedSeller(s.id)} className={cn("rounded-lg border p-4 cursor-pointer hover:shadow-sm transition-all", rc.border, rc.bg)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", rc.bg, rc.text)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", rc.dot)} /> {rc.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">At-Risk Deals</p>
                            <p className="font-bold text-red-600">{s.atRiskDeals}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Overdue Payments</p>
                            <p className={cn("font-bold", s.overduePayments > 0 ? "text-red-600" : "text-gray-700")}>{s.overduePayments}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Missing Docs</p>
                            <p className={cn("font-bold", s.missingDocs > 0 ? "text-amber-600" : "text-gray-700")}>{s.missingDocs}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Avg Margin</p>
                            <p className={cn("font-bold", s.avgMargin >= 20 ? "text-green-600" : s.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{s.avgMargin.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                      <button className="shrink-0 rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors">Review →</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SYSTEM TAB ═══ */}
      {activeTab === "system" && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">Operators</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{operatorsData.filter(o => o.status === "active").length}<span className="text-sm font-normal text-gray-400">/{operatorsData.length}</span></p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">AI Agents Online</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{aiAgentsData.filter(a => a.status === "active").length}<span className="text-sm font-normal text-gray-400">/{aiAgentsData.length}</span></p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
              <p className="text-xs font-medium text-amber-700">Pending Approvals</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{approvalsData.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">System Health</p>
              <p className="text-2xl font-bold text-green-600 mt-1">Healthy</p>
            </div>
          </div>

          {/* Pending approvals */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending AI Approvals</h3>
            <div className="space-y-2">
              {approvalsData.map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                    <Bot className="h-3.5 w-3.5 text-indigo-600" strokeWidth={1.5} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{a.action}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{a.agent} · {a.submittedAt}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-700 transition-colors">Approve</button>
                    <button className="rounded-md border border-red-200 text-red-600 px-2.5 py-1 text-[11px] font-medium hover:bg-red-50 transition-colors">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI agents grid */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">AI Agents</h3>
            <div className="grid grid-cols-3 gap-3">
              {aiAgentsData.map((agent) => {
                const isActive = agent.status === "active";
                return (
                  <div key={agent.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("h-2 w-2 rounded-full", isActive ? "bg-green-500" : "bg-gray-400")} />
                      <span className="text-[10px] text-gray-400">{agent.actionsToday} today</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900">{agent.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{agent.id} · {agent.model}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Operators table */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">System Operators</h3></div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Operator</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions Today</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {operatorsData.map((op) => {
                  const rc = operatorRoleConfig[op.role];
                  return (
                    <tr key={op.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-900">{op.name}</p>
                        <p className="text-[11px] text-gray-400">{op.email}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", rc.bg, rc.text)}>{rc.label}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{op.actionsToday}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{op.lastActive}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ SELLER DETAIL DRAWER ═══ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedSeller(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative w-[520px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selected.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selected.contact} · {selected.region}</p>
                </div>
                <button onClick={() => setSelectedSeller(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", sellerRiskConfig[selected.riskLevel].bg, sellerRiskConfig[selected.riskLevel].text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", sellerRiskConfig[selected.riskLevel].dot)} /> {sellerRiskConfig[selected.riskLevel].label}
                </span>
                <span className="text-xs text-gray-400">· Joined {selected.joinedDate}</span>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Financial summary */}
              <div className="rounded-xl border border-[#4A3520] bg-gradient-to-br from-[#4A3520] to-[#6B4E33] p-4 text-white">
                <p className="text-xs font-medium text-white/60 mb-3">Your Commission from This Seller</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold">${selected.commissionEarned.toLocaleString()}</p>
                    <p className="text-[11px] text-white/50">Received (2% of ${selected.revenueYTD.toLocaleString()})</p>
                  </div>
                  <div className="border-l border-white/10 pl-4">
                    <p className="text-2xl font-bold text-amber-300">${selected.commissionPending.toLocaleString()}</p>
                    <p className="text-[11px] text-white/50">Pending ({selected.dealsActive} active deals)</p>
                  </div>
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Deals Closed</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{selected.dealsClosed}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active Deals</p>
                  <p className="text-lg font-bold text-blue-600 mt-0.5">{selected.dealsActive}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Avg Margin</p>
                  <p className={cn("text-lg font-bold mt-0.5", selected.avgMargin >= 20 ? "text-green-600" : selected.avgMargin >= 12 ? "text-amber-600" : "text-red-600")}>{selected.avgMargin.toFixed(1)}%</p>
                </div>
              </div>

              {/* Risk factors */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Risk Factors</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">At-Risk Deals</span>
                    <span className={cn("text-sm font-bold", selected.atRiskDeals > 0 ? "text-red-600" : "text-green-600")}>{selected.atRiskDeals}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">Overdue Payments</span>
                    <span className={cn("text-sm font-bold", selected.overduePayments > 0 ? "text-red-600" : "text-green-600")}>{selected.overduePayments}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">Missing Compliance Docs</span>
                    <span className={cn("text-sm font-bold", selected.missingDocs > 0 ? "text-amber-600" : "text-green-600")}>{selected.missingDocs}</span>
                  </div>
                </div>
              </div>

              {/* Recent deals */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Recent Deals</p>
                <div className="space-y-2">
                  {selectedDeals.map((d) => {
                    const statusConfig: Record<SellerDeal["status"], { label: string; bg: string; text: string }> = {
                      completed: { label: "Completed", bg: "bg-green-50", text: "text-green-700" },
                      in_progress: { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700" },
                      at_risk: { label: "At Risk", bg: "bg-red-50", text: "text-red-700" },
                      rejected: { label: "Rejected", bg: "bg-gray-100", text: "text-gray-500" },
                    };
                    const sc = statusConfig[d.status];
                    return (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.buyer}</p>
                          <p className="text-[11px] text-gray-400">{d.id} · {d.margin.toFixed(1)}% margin</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">${d.value.toLocaleString()}</p>
                          <div className="flex items-center gap-2 justify-end mt-0.5">
                            <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", sc.bg, sc.text)}>{sc.label}</span>
                            <span className="text-[10px] text-[#4A3520] font-semibold">+${d.commission.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.riskLevel === "critical" && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Contact Seller Urgently</button>
                )}
                {selected.riskLevel === "warning" && (
                  <button className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">Schedule Review Call</button>
                )}
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">View Full Deal History</button>
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Commission Report</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}'''

new_content = before + NEW_ADMIN + after
FILE.write_text(new_content)
print(f"Replaced AdminPage. New file size: {len(new_content)} chars")
