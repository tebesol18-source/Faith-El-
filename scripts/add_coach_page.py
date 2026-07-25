#!/usr/bin/env python3
"""Insert CoachPage before PlaceholderPage and wire into router."""
from pathlib import Path

FILE = Path("/home/z/my-project/src/app/page.tsx")
content = FILE.read_text()

insert_marker = "}// ═══════════════════════════════════════════════════════════\nfunction PlaceholderPage"

COACH_PAGE = '''}

// ═══════════════════════════════════════════════════════════
// AI COACH PAGE — "What should I do next?"
// ═══════════════════════════════════════════════════════════
type Priority = {
  rank: number;
  category: "revenue" | "risk" | "relationship" | "operational";
  action: string;
  context: string;
  impact: string;
  eta: string;
  page: Page;
  urgency: "critical" | "high" | "medium";
};

type Insight = {
  type: "pattern" | "opportunity" | "warning";
  title: string;
  body: string;
  metric?: string;
};

type RiskItem = {
  title: string;
  severity: "critical" | "high" | "medium";
  probability: number;
  impact: string;
  mitigation: string;
  daysToImpact: number;
};

type Opportunity = {
  title: string;
  buyer: string;
  potentialValue: number;
  action: string;
  deadline: string;
};

type AIAction = {
  time: string;
  agent: string;
  action: string;
  status: "completed" | "pending_approval" | "in_progress";
  detail: string;
};

const priorities: Priority[] = [
  {
    rank: 1,
    category: "risk",
    action: "Renew phytosanitary certificate for CT-2026-001",
    context: "Container MSCU-7729340 is at sea heading to Hamburg. Cert expires Jul 30, vessel arrives Aug 09.",
    impact: "$420/day demurrage if cert not ready at port",
    eta: "Submit today — 5-7 day processing at EAA",
    page: "compliance",
    urgency: "critical",
  },
  {
    rank: 2,
    category: "revenue",
    action: "Sign contract CT-2026-0005 (Hashimoto Coffee)",
    context: "Buyer signed Jul 23. Counter-offer accepted at $6.10 (midpoint). Margin compressed to 14.8% but Limu G1 is scarce.",
    impact: "$67,800 contract value · retain Japanese relationship",
    eta: "Sign today — buyer waiting 2 days",
    page: "contracts",
    urgency: "high",
  },
  {
    rank: 3,
    category: "operational",
    action: "Resolve 5 missing documents for CT-2026-004 (Yokohama)",
    context: "Aurora Imports shipment. Phytosanitary, export permit, certificate of origin, fumigation, B/L all missing.",
    impact: "$41,200 shipment · vessel departs Aug 02 (8 days)",
    eta: "Start applications today — cutoff is Jul 31",
    page: "compliance",
    urgency: "high",
  },
  {
    rank: 4,
    category: "revenue",
    action: "Send follow-up on Quote QU-2026-0008 (Seoul Coffee Lab)",
    context: "Sent Jul 20, no response in 4 days. Buyer's typical response time is 3-5 days.",
    impact: "$27,600 potential · vessel CT-2026-005 already en route to Busan",
    eta: "Wait 1 more day, then follow up",
    page: "quotes",
    urgency: "medium",
  },
  {
    rank: 5,
    category: "relationship",
    action: "Send breakup email to Nordic Bean Co (QU-2026-0001)",
    context: "Quote expired 15 days ago with no response. Yirgacheffe LOT-25-0001 was later sold at $7.10.",
    impact: "Re-engage prospect · $28K potential if renewed",
    eta: "Send this week — 30-day re-engagement window",
    page: "quotes",
    urgency: "medium",
  },
];

const insights: Insight[] = [
  {
    type: "pattern",
    title: "Yirgacheffe is your best performer",
    body: "Yirgacheffe G1 lots have closed at $7.00-$7.20/kg this season — 8% above ECX auction average. Buyers consistently approve samples. Consider expanding Yirgacheffe supplier relationships for next harvest.",
    metric: "$7.10/kg avg · 4 deals closed",
  },
  {
    type: "opportunity",
    title: "Marcus Coffee wants more Guji",
    body: "Marcus Coffee accepted V2 quote at $6.85/kg Guji. Their buyer asked about long-term supply. They typically order 8-10t per quarter. A standing offer could lock in $70K+ annual revenue.",
    metric: "$70K+ potential annual",
  },
  {
    type: "warning",
    title: "Sidamo G2 margin compressing",
    body: "Sidamo G2 sold at $6.30/kg in CT-2026-0003 (margin 19.6%) but cost basis rose to $4.85/kg. If trend continues, Sidamo G2 margins will fall below 15% target. Consider sourcing Sidamo G1 or shifting to Limu.",
    metric: "Margin trend: 22% → 19.6% → 17.5% projected",
  },
  {
    type: "pattern",
    title: "CIF Hamburg is your strongest route",
    body: "3 of 5 active shipments go to Hamburg. MSC and Hapag-Lloyd both reliable. Avg transit 21 days. On-time rate 100%. Consider negotiating volume freight discount with MSC for next quarter.",
    metric: "$2,800-$3,200/shipment · 21-day transit",
  },
];

const risks: RiskItem[] = [
  {
    title: "Phytosanitary expiry blocks Hamburg arrival",
    severity: "critical",
    probability: 95,
    impact: "$8,400+ demurrage (20+ days at $420/day) + buyer relationship damage",
    mitigation: "Submit EAA renewal application today. Express processing available for +50% fee.",
    daysToImpact: 4,
  },
  {
    title: "Yokohama shipment may miss vessel cutoff",
    severity: "high",
    probability: 70,
    impact: "Container roll to next vessel (10-14 day delay) + $41K contract at risk",
    mitigation: "Prioritize ECX grading + export permit applications. Use broker for expedited processing.",
    daysToImpact: 7,
  },
  {
    title: "Hashimoto contract lapses if not signed",
    severity: "high",
    probability: 40,
    impact: "Lose $67.8K contract + Japanese market relationship",
    mitigation: "Sign today. Margin 14.8% is acceptable — Limu G1 scarcity justifies acceptance.",
    daysToImpact: 5,
  },
  {
    title: "Seoul Coffee Lab may source elsewhere",
    severity: "medium",
    probability: 35,
    impact: "Lose $27.6K quote + future Korean business",
    mitigation: "Wait 1 more day, then send value-focused follow-up referencing Busan shipment progress.",
    daysToImpact: 3,
  },
];

const opportunities: Opportunity[] = [
  {
    title: "Aurora Imports — New US market entry",
    buyer: "Aurora Imports",
    potentialValue: 22500,
    action: "Verify credit → send contract for QU-2026-0007",
    deadline: "This week",
  },
  {
    title: "Marcus Coffee — Standing supply offer",
    buyer: "Marcus Coffee GmbH",
    potentialValue: 70000,
    action: "Draft annual supply MOU for Guji G1",
    deadline: "Next 2 weeks",
  },
  {
    title: "Falcon Coffee UK — Pre-discount quote",
    buyer: "Falcon Coffee UK",
    potentialValue: 55600,
    action: "Send revised QU-2026-0005 at $6.75/kg (pre-discount)",
    deadline: "While sample SR-2026-0002 is in transit",
  },
];

const aiActions: AIAction[] = [
  { time: "2h ago", agent: "Outreach Agent", action: "Drafted Quote QU-2026-0007 for Aurora Imports", status: "completed", detail: "Pulled pricing from comparable US deals. Margin 21.3%." },
  { time: "5h ago", agent: "Compliance Agent", action: "Flagged phytosanitary expiry on CT-2026-001", status: "completed", detail: "Cross-referenced EAA renewal timeline vs vessel ETA." },
  { time: "Yesterday", agent: "Supplier Agent", action: "Identified LOT-25-0007 (Limu G1) for Hashimoto counter", status: "completed", detail: "Substituted higher-margin lot in V3 quote." },
  { time: "Yesterday", agent: "Logistics Agent", action: "Tracked MSC Hamburg through Suez Canal", status: "completed", detail: "On schedule. Updated milestone timeline." },
  { time: "2 days ago", agent: "Customer Agent", action: "Drafted breakup email for Nordic Bean Co", status: "pending_approval", detail: "Awaiting your review before sending." },
  { time: "3 days ago", agent: "Outreach Agent", action: "Researched 12 new German specialty roasters", status: "in_progress", detail: "Found 4 with annual imports >5t. Adding to Leads." },
];

const urgencyConfig: Record<Priority["urgency"], { color: string; bg: string; text: string; label: string }> = {
  critical: { color: "bg-red-500", bg: "bg-red-50", text: "text-red-700", label: "Critical" },
  high: { color: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", label: "High" },
  medium: { color: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", label: "Medium" },
};

const categoryConfig: Record<Priority["category"], { icon: any; label: string }> = {
  revenue: { icon: DollarSign, label: "Revenue" },
  risk: { icon: AlertTriangle, label: "Risk" },
  relationship: { icon: Users, label: "Relationship" },
  operational: { icon: Ship, label: "Operational" },
};

const insightTypeConfig: Record<Insight["type"], { icon: any; bg: string; text: string; label: string }> = {
  pattern: { icon: TrendingUp, bg: "bg-blue-50", text: "text-blue-700", label: "Pattern" },
  opportunity: { icon: Star, bg: "bg-green-50", text: "text-green-700", label: "Opportunity" },
  warning: { icon: AlertTriangle, bg: "bg-amber-50", text: "text-amber-700", label: "Warning" },
};

const severityConfig: Record<RiskItem["severity"], { bg: string; text: string; bar: string; label: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500", label: "Critical" },
  high: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500", label: "High" },
  medium: { bg: "bg-yellow-50", text: "text-yellow-700", bar: "bg-yellow-500", label: "Medium" },
};

const aiActionStatusConfig: Record<AIAction["status"], { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-green-50", text: "text-green-700", label: "Completed" },
  pending_approval: { bg: "bg-amber-50", text: "text-amber-700", label: "Needs Approval" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", label: "In Progress" },
};

function CoachPage() {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Good morning, Abi. I've reviewed all 11 active deals, 6 shipments, and your compliance tracker. You have 2 critical items needing action today — the phytosanitary renewal and the Hashimoto contract signature. Want me to walk you through them?" },
  ]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    // Simulated AI response
    setTimeout(() => {
      let response = "I'll look into that for you.";
      if (userMsg.toLowerCase().includes("margin")) {
        response = "Your average margin across active quotes is 21.9% — above the 20% target. Lowest is Hashimoto at 14.8% (counter-offer accepted). Highest is Rösterei Berlin at 25.4% (rejected on quality). I recommend accepting Hashimoto — Limu G1 scarcity justifies the compressed margin.";
      } else if (userMsg.toLowerCase().includes("hashimoto") || userMsg.toLowerCase().includes("sign")) {
        response = "Hashimoto Coffee (CT-2026-0005) is awaiting your signature. Buyer signed Jul 23. Contract value $67,800. Margin 14.8% (compressed from 19.8% after counter at $6.10). Recommend signing today — Limu G1 is scarce and retaining the Japanese relationship has long-term value.";
      } else if (userMsg.toLowerCase().includes("phyto") || userMsg.toLowerCase().includes("hamburg") || userMsg.toLowerCase().includes("demurrage")) {
        response = "Phytosanitary cert PHY-2026-0892 for CT-2026-001 expires Jul 30 (4 days). Vessel MSC Hamburg arrives Aug 09. Renewal takes 5-7 days at EAA. If you submit today, cert will be ready Aug 01 — 8 days before arrival. Risk cost: $420/day demurrage if not ready. Express processing (+50% fee) available if needed.";
      } else if (userMsg.toLowerCase().includes("priority") || userMsg.toLowerCase().includes("today")) {
        response = "Today's top 3 priorities: 1) Renew phytosanitary cert (critical — $420/day risk), 2) Sign Hashimoto contract (high — $67.8K value), 3) Start CT-2026-004 doc applications (high — vessel departs Aug 02). All 3 are listed in the priorities panel above with one-click navigation.";
      } else {
        response = "I can help with margins, contracts, shipments, compliance, or strategic decisions. Try asking 'Should I sign the Hashimoto contract?' or 'What's my risk exposure this week?'";
      }
      setChatMessages(prev => [...prev, { role: "ai", text: response }]);
    }, 800);
  };

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Coach</h1>
        <p className="text-sm text-gray-500 mt-1">What should I do next?</p>
      </div>

      {/* Morning Brief — the AI's daily summary */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
            <Bot className="h-6 w-6 text-indigo-600" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-gray-900">Morning Brief</h2>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              You have <span className="font-semibold text-red-700">1 critical risk</span> (phytosanitary expiry), <span className="font-semibold text-amber-700">2 high-priority actions</span> (sign Hashimoto contract, resolve CT-2026-004 docs), and <span className="font-semibold text-green-600">$84,600 in received revenue</span> this month. Pipeline is healthy at 21.9% avg margin. Net profit YTD is <span className="font-semibold text-green-600">$42,580</span> (19.4% margin). Two opportunities worth <span className="font-semibold text-gray-900">$92,500</span> are ripe for action this week.
            </p>

            {/* Quick stats row */}
            <div className="grid grid-cols-5 gap-3 pt-4 border-t border-indigo-100">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Active Deals</p>
                <p className="text-lg font-bold text-gray-900">11</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Pipeline</p>
                <p className="text-lg font-bold text-gray-900">$245K</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">At Risk</p>
                <p className="text-lg font-bold text-red-600">2</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Margin</p>
                <p className="text-lg font-bold text-green-600">21.9%</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Net Profit</p>
                <p className="text-lg font-bold text-green-600">$42.6K</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Priorities — the action center */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Today&apos;s Top 5 Priorities</h3>
          <span className="text-xs text-gray-400">ordered by impact</span>
        </div>
        <div className="space-y-3">
          {priorities.map((p) => {
            const uc = urgencyConfig[p.urgency];
            const cc = categoryConfig[p.category];
            return (
              <div key={p.rank} className={cn("rounded-lg border p-4 flex items-start gap-4", uc.bg, "border-gray-200")}>
                {/* Rank */}
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", uc.color)}>
                  {p.rank}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{p.action}</p>
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold", uc.bg, uc.text)}>
                      {uc.label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200">
                      <cc.icon className="h-2.5 w-2.5" /> {cc.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{p.context}</p>
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3 w-3 text-gray-400" />
                      <span className="text-gray-500">{p.impact}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span className="text-gray-500">{p.eta}</span>
                    </div>
                  </div>
                </div>
                {/* Action */}
                <button className="shrink-0 rounded-lg bg-[#4A3520] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6B4E33] transition-colors">
                  Go to {p.page.charAt(0).toUpperCase() + p.page.slice(1)} →
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk Radar + Opportunities — side by side */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Risk Radar */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-gray-900">Risk Radar</h3>
            <span className="text-xs text-gray-400 ml-auto">next 7 days</span>
          </div>
          <div className="space-y-3">
            {risks.map((r, i) => {
              const sc = severityConfig[r.severity];
              return (
                <div key={i} className={cn("rounded-lg p-3 border", sc.bg, "border-gray-200")}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-900 flex-1">{r.title}</p>
                    <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold", sc.bg, sc.text)}>
                      {sc.label} · {r.probability}%
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mb-2">{r.impact}</p>
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Fix:</span>
                    <p className="text-[11px] text-gray-700 flex-1">{r.mitigation}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{r.daysToImpact} days to impact</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Opportunities */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-4 w-4 text-green-500" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-gray-900">Opportunities</h3>
            <span className="text-xs text-gray-400 ml-auto">act this week</span>
          </div>
          <div className="space-y-3">
            {opportunities.map((o, i) => (
              <div key={i} className="rounded-lg border border-green-200 bg-green-50/30 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 flex-1">{o.title}</p>
                  <p className="text-sm font-bold text-green-600 shrink-0">${(o.potentialValue / 1000).toFixed(1)}K</p>
                </div>
                <p className="text-[11px] text-gray-500 mb-2">{o.buyer}</p>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <p className="text-[11px] text-gray-700">{o.action}</p>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{o.deadline}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategic Insights */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-gray-900">Strategic Insights</h3>
          <span className="text-xs text-gray-400 ml-auto">patterns I&apos;ve spotted</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {insights.map((ins, i) => {
            const ic = insightTypeConfig[ins.type];
            return (
              <div key={i} className={cn("rounded-lg border p-4", ic.bg, "border-gray-200")}>
                <div className="flex items-center gap-2 mb-2">
                  <ic.icon className={cn("h-4 w-4", ic.text)} strokeWidth={1.5} />
                  <span className={cn("text-[10px] font-semibold uppercase tracking-wider", ic.text)}>{ic.label}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">{ins.title}</p>
                <p className="text-xs text-gray-600 leading-relaxed mb-2">{ins.body}</p>
                {ins.metric && (
                  <p className={cn("text-xs font-semibold pt-2 border-t border-gray-100", ic.text)}>{ins.metric}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent AI Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-gray-900">Recent AI Agent Actions</h3>
          </div>
          <span className="text-xs text-gray-400">last 3 days</span>
        </div>
        <div className="space-y-2">
          {aiActions.map((a, i) => {
            const sc = aiActionStatusConfig[a.status];
            return (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex flex-col items-center pt-1">
                  <span className={cn("h-2 w-2 rounded-full", a.status === "completed" ? "bg-green-500" : a.status === "pending_approval" ? "bg-amber-500" : "bg-blue-500")} />
                  {i < aiActions.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" style={{ minHeight: "20px" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-gray-900">{a.action}</p>
                    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", sc.bg, sc.text)}>{sc.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{a.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400">{a.time}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{a.agent}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat — Ask AI Anything */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-gray-900">Ask AI Anything</h3>
        </div>

        {/* Chat messages */}
        <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
          {chatMessages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-lg px-4 py-2.5 text-sm",
                m.role === "user" ? "bg-[#4A3520] text-white" : "bg-white border border-gray-200 text-gray-700"
              )}>
                {m.role === "ai" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bot className="h-3 w-3 text-indigo-500" />
                    <span className="text-[10px] font-semibold text-indigo-600">COACH</span>
                  </div>
                )}
                <p className="leading-relaxed">{m.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick suggestions */}
        {chatMessages.length <= 2 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              "Should I sign the Hashimoto contract?",
              "What's my risk exposure this week?",
              "How are my margins trending?",
              "What should I prioritize today?",
            ].map((q) => (
              <button
                key={q}
                onClick={() => { setChatInput(q); }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about margins, contracts, shipments, risks..."
            className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={sendMessage}
            className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </main>
  );
}'''

content = content.replace(insert_marker, COACH_PAGE, 1)

# Wire into router
old_router = '{currentPage === "contracts" && <ContractsPage />}\n        {currentPage === "finance" && <FinancePage />}'
new_router = '{currentPage === "contracts" && <ContractsPage />}\n        {currentPage === "finance" && <FinancePage />}\n        {currentPage === "coach" && <CoachPage />}'

assert old_router in content, "Router pattern not found"
content = content.replace(old_router, new_router)

# Update the placeholder exclusion
old_exclude = 'currentPage !== "contracts" && currentPage !== "finance" && ('
new_exclude = 'currentPage !== "contracts" && currentPage !== "finance" && currentPage !== "coach" && ('
content = content.replace(old_exclude, new_exclude)

FILE.write_text(content)
print(f"Inserted CoachPage. New file size: {len(content)} chars")
