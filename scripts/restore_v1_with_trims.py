#!/usr/bin/env python3
"""Replace ShipmentsPage with v1 design + targeted decluttering trims."""
from pathlib import Path

FILE = Path("/home/z/my-project/src/app/page.tsx")
content = FILE.read_text()

# Find function boundaries
start_marker = "function ShipmentsPage() {"
end_marker_after = "\n}\n// ═══════════════════════════════════════════════════════════\n// PLACEHOLDER PAGE"

start_idx = content.index(start_marker)
end_idx = content.index(end_marker_after, start_idx) + 2  # include the closing }

before = content[:start_idx]
after = content[end_idx + 1:]

# v1 design with targeted trims:
# TRIM 1: Removed container# chip from card (was redundant with drawer)
# TRIM 2: Removed separate "Demurrage Xd" red badge and "+4 days" amber badge
#         (status pill color + label already conveys urgency)
# TRIM 3: Removed voyage number from card details (technical noise)
# TRIM 4: Removed Recent Events section from drawer (milestones already tell the story)
# TRIM 5: Reduced AI Coach banner — keep but more concise
# KEEP:   8-segment timeline, KPI tiles, 6 filter tabs, all drawer sections except events

NEW_FUNCTION = '''function ShipmentsPage() {
  const [filter, setFilter] = useState("All");
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
  const filters = ["All", "In Transit", "At Port", "Loading", "Delayed", "Delivered"];

  const filterMap: Record<string, (s: Shipment) => boolean> = {
    "All": () => true,
    "In Transit": (s) => s.stage === "in_transit" || s.stage === "loaded",
    "At Port": (s) => s.stage === "at_port" || s.stage === "arrived" || s.stage === "customs",
    "Loading": (s) => s.stage === "processing" || s.stage === "to_port",
    "Delayed": (s) => s.status === "delayed" || s.status === "demurrage_risk",
    "Delivered": (s) => s.status === "delivered",
  };

  const filtered = shipmentsData.filter(filterMap[filter]);

  const stats = {
    total: shipmentsData.length,
    inTransit: shipmentsData.filter(s => s.stage === "in_transit" || s.stage === "loaded").length,
    loading: shipmentsData.filter(s => s.stage === "processing" || s.stage === "to_port" || s.stage === "at_port").length,
    delivered: shipmentsData.filter(s => s.status === "delivered").length,
    atRisk: shipmentsData.filter(s => s.status === "delayed" || s.status === "demurrage_risk").length,
    onTimeRate: (() => {
      const completed = shipmentsData.filter(s => s.status === "delivered" || s.status === "on_schedule");
      const onTime = completed.filter(s => s.status !== "delayed").length;
      return completed.length > 0 ? (onTime / completed.length) * 100 : 100;
    })(),
    totalValue: shipmentsData.filter(s => s.status !== "delivered").reduce((sum, s) => sum + s.contractValue, 0),
    demurrageRisk: shipmentsData.filter(s => s.demurrageRisk !== null).length,
  };

  const selected = shipmentsData.find(s => s.id === selectedShipment);

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Shipments</h1>
          <p className="text-sm text-gray-500 mt-1">Where is every container?</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Search className="h-4 w-4" /> Track Container
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
            <Plus className="h-4 w-4" /> New Shipment
          </button>
        </div>
      </div>

      {/* AI Insight Banner — TRIMMED to be more concise */}
      {stats.atRisk > 0 && (
        <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-red-700">{stats.atRisk} shipments need attention</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {stats.demurrageRisk > 0 && <><span className="font-semibold text-red-700">CT-2026-001 (Hamburg)</span> — phytosanitary cert expires in 4 days, vessel arrives Aug 09. Renew at EAA today (~$420/day demurrage risk). </>}
                CT-2026-004 (Yokohama) departs in 8 days with only 25% doc readiness.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">In Transit</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.inTransit}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">containers at sea</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">At Risk</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.atRisk}</p>
          <p className="text-[11px] text-red-500 mt-0.5">delayed or demurrage</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${(stats.totalValue / 1000).toFixed(0)}K</p>
          <p className="text-[11px] text-gray-400 mt-0.5">across {stats.total - stats.delivered} shipments</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">On-time Rate</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.onTimeRate.toFixed(0)}%</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.delivered} delivered this season</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {filters.map((f) => {
          const count = shipmentsData.filter(filterMap[f]).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                filter === f ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {f}
              <span className={cn("rounded-full px-1.5 text-[10px]", filter === f ? "bg-white/20" : "bg-gray-100 text-gray-500")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Shipment cards — DECLUTTERED */}
      <div className="space-y-3">
        {filtered.map((s) => {
          const sc = shipmentStatusConfig[s.status];
          const currentStageIdx = stageOrder.indexOf(s.stage);
          return (
            <div
              key={s.id}
              onClick={() => setSelectedShipment(s.id)}
              className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300"
            >
              <div className="flex items-start gap-4">
                {/* Status indicator */}
                <div className="flex flex-col items-center gap-2 pt-1">
                  <span className={cn("h-3 w-3 rounded-full", sc.dot)} />
                  <div className="w-px flex-1 bg-gray-100" style={{ minHeight: "40px" }} />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  {/* Top row — TRIMMED: removed container# chip, removed redundant badges */}
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{s.id}</span>
                      <span className="text-sm text-gray-600">{s.flag} {s.destinationCity}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{s.buyer}</span>
                    </div>
                    {/* Status pill alone carries urgency (color + label) */}
                    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                      {sc.label}
                    </span>
                  </div>

                  {/* Stage timeline (8-segment) */}
                  <div className="flex items-center gap-1 mb-3">
                    {stageOrder.map((st, i) => {
                      const isComplete = i < currentStageIdx || s.stage === "delivered";
                      const isCurrent = i === currentStageIdx && s.stage !== "delivered";
                      return (
                        <div key={st} className="flex-1 flex items-center">
                          <div
                            className={cn(
                              "h-1.5 flex-1 rounded-full",
                              isComplete ? "bg-green-500" : isCurrent ? "bg-blue-500" : "bg-gray-100"
                            )}
                          />
                          {i < stageOrder.length - 1 && <div className="w-1" />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Lots */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {s.lots.map((lot, li) => (
                      <span key={li} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-xs text-gray-600">{lot}</span>
                    ))}
                  </div>

                  {/* Key details — TRIMMED: removed voyage number */}
                  <div className="flex items-center gap-6 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Ship className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                      <span className="text-gray-500">{s.vessel}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Route:</span>
                      <span className="font-medium text-gray-700">{s.originPort} → {s.destinationPort}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Value:</span>
                      <span className="font-bold text-gray-900">${(s.contractValue / 1000).toFixed(1)}K</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{(s.weightKg / 1000).toFixed(0)}t</span>
                    </div>
                    {s.status !== "delivered" && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.5} />
                        <span className={cn(s.daysRemaining <= 7 ? "text-amber-600 font-medium" : "text-gray-500")}>
                          ETA {s.etaDate} · {s.daysRemaining}d
                        </span>
                      </div>
                    )}
                    {s.status === "delivered" && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" strokeWidth={1.5} />
                        <span className="text-green-600 font-medium">Delivered {s.milestones.find(m => m.stage === "delivered")?.date}</span>
                      </div>
                    )}
                  </div>

                  {/* Temperature + doc readiness strip */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("flex h-2 w-2 rounded-full", s.tempOk ? "bg-green-500" : "bg-red-500")} />
                      <span className="text-gray-500">Temp</span>
                      <span className={cn("font-medium", s.tempOk ? "text-gray-700" : "text-red-600")}>{s.temperature.toFixed(1)}°C</span>
                      <span className="text-gray-400">/ {s.humidity}% RH</span>
                    </div>
                    <div className="text-gray-300">·</div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className={cn("h-3 w-3", s.docReadiness === 100 ? "text-green-500" : s.docReadiness < 50 ? "text-red-500" : "text-amber-500")} strokeWidth={1.5} />
                      <span className="text-gray-500">Docs</span>
                      <span className={cn("font-medium", s.docReadiness === 100 ? "text-green-600" : s.docReadiness < 50 ? "text-red-600" : "text-amber-600")}>{s.docReadiness}%</span>
                    </div>
                  </div>
                </div>

                {/* Action button — only show when there's a real action needed */}
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setSelectedShipment(s.id)} className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    s.demurrageRisk !== null ? "bg-red-600 text-white hover:bg-red-700"
                    : s.status === "delayed" ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : s.docReadiness < 50 ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}>
                    {s.demurrageRisk !== null ? "Resolve Risk"
                    : s.status === "delivered" ? "View History"
                    : s.docReadiness < 50 ? "View Docs"
                    : "Track"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Shipment Detail Drawer — DECLUTTERED (removed Recent Events section) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedShipment(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[520px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selected.id}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selected.flag} {selected.destinationCity}, {selected.destinationCountry}</p>
                </div>
                <button onClick={() => setSelectedShipment(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", shipmentStatusConfig[selected.status].bg, shipmentStatusConfig[selected.status].text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", shipmentStatusConfig[selected.status].dot)} />
                  {shipmentStatusConfig[selected.status].label}
                </span>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Voyage progress — the centerpiece */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Voyage Progress</p>
                <div className="space-y-3">
                  {selected.milestones.map((m, i) => {
                    const stg = shipmentStageConfig[m.stage];
                    const isComplete = m.completed;
                    const isCurrent = !m.completed && i > 0 && selected.milestones[i - 1].completed;
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full shrink-0",
                            isComplete ? "bg-green-100" : isCurrent ? "bg-blue-100 ring-2 ring-blue-200" : "bg-gray-100"
                          )}>
                            <stg.icon className={cn("h-3.5 w-3.5", isComplete ? "text-green-600" : isCurrent ? "text-blue-600" : "text-gray-400")} strokeWidth={1.5} />
                          </div>
                          {i < selected.milestones.length - 1 && (
                            <div className={cn("w-0.5 flex-1 mt-1 mb-1", isComplete ? "bg-green-200" : "bg-gray-100")} style={{ minHeight: "16px" }} />
                          )}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center justify-between">
                            <p className={cn("text-sm", isComplete ? "font-medium text-gray-900" : isCurrent ? "font-semibold text-blue-700" : "text-gray-500")}>
                              {m.label}
                            </p>
                            {m.date && <span className={cn("text-xs", isComplete ? "text-gray-700" : "text-gray-400")}>{m.date}</span>}
                          </div>
                          {m.note && (
                            <p className={cn("text-[11px] mt-0.5", isCurrent ? "text-blue-600" : "text-gray-500")}>{m.note}</p>
                          )}
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-blue-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" /> Current stage
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Container & Booking — DECLUTTERED: removed booking ref (redundant) */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Container & Booking</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Container No</p>
                    <p className="text-sm font-mono font-medium text-gray-900 mt-0.5">{selected.containerNo}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Seal No</p>
                    <p className="text-sm font-mono font-medium text-gray-900 mt-0.5">{selected.sealNo}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Vessel / Voyage</p>
                    <p className="text-sm font-medium text-gray-700 mt-0.5">{selected.vessel} <span className="text-gray-400">· {selected.voyage}</span></p>
                  </div>
                </div>
              </div>

              {/* Cargo + value + insurance */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cargo</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{(selected.weightKg / 1000).toFixed(1)}t</p>
                  <p className="text-[10px] text-gray-400">{selected.lots.length} lot{selected.lots.length > 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contract Value</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">${selected.contractValue.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">{selected.contractId}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Insurance</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">${selected.insuranceValue.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">110% of value</p>
                </div>
              </div>

              {/* Temperature log */}
              {selected.tempLog.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Temperature & Humidity Log</p>
                    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", selected.tempOk ? "text-green-600" : "text-red-600")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", selected.tempOk ? "bg-green-500" : "bg-red-500")} />
                      {selected.tempOk ? "Normal" : "Alert"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="relative h-16 flex items-end gap-1">
                      {selected.tempLog.map((t, i) => {
                        const max = Math.max(...selected.tempLog.map(x => x.temp));
                        const min = Math.min(...selected.tempLog.map(x => x.temp));
                        const range = max - min || 1;
                        const height = 20 + ((t.temp - min) / range) * 60;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${t.day}: ${t.temp}°C / ${t.humidity}% RH`}>
                            <div className={cn("w-full rounded-t", selected.tempOk ? "bg-green-300" : "bg-red-300")} style={{ height: `${height}px` }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                      <span>{selected.tempLog[0]?.day}</span>
                      <span>Latest: {selected.temperature.toFixed(1)}°C · {selected.humidity}% RH</span>
                      <span>{selected.tempLog[selected.tempLog.length - 1]?.day}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Document readiness (links to compliance) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Document Readiness</p>
                  <span className={cn("text-xs font-bold", selected.docReadiness === 100 ? "text-green-600" : selected.docReadiness < 50 ? "text-red-600" : "text-amber-600")}>
                    {selected.docReadiness}%
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                    <div className={cn("h-full", selected.docReadiness === 100 ? "bg-green-500" : selected.docReadiness < 50 ? "bg-red-500" : "bg-amber-500")} style={{ width: `${selected.docReadiness}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-gray-600">
                      {selected.docReadiness === 100 ? "All documents approved — shipment ready at destination port." : selected.docReadiness < 50 ? "Critical: multiple documents missing." : "Some documents still pending."}
                    </p>
                    <button className="text-[11px] font-medium text-[#4A3520] hover:underline shrink-0 ml-2">View in Compliance →</button>
                  </div>
                </div>
              </div>

              {/* REMOVED: Recent Events section (milestone timeline already shows this info) */}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selected.demurrageRisk !== null && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Renew Phytosanitary Cert</button>
                )}
                {selected.status === "delayed" && (
                  <button className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">Notify Buyer of Delay</button>
                )}
                {selected.docReadiness < 50 && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Resolve Missing Documents</button>
                )}
                <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Track on Vessel Website</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}'''

new_content = before + NEW_FUNCTION + after
FILE.write_text(new_content)
print(f"Replaced ShipmentsPage. New file size: {len(new_content)} chars")
