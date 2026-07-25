#!/usr/bin/env python3
"""Replace the ShipmentsPage function in page.tsx with a simplified version."""
from pathlib import Path

FILE = Path("/home/z/my-project/src/app/page.tsx")
content = FILE.read_text()

# Find function boundaries
start_marker = "function ShipmentsPage() {"
end_marker_after = "\n}\n\n// ═══════════════════════════════════════════════════════════\n// PLACEHOLDER PAGE"

start_idx = content.index(start_marker)
end_idx = content.index(end_marker_after, start_idx) + 2  # include the closing }

# Preserve everything before and after
before = content[:start_idx]
after = content[end_idx + 1:]  # skip the "}" but keep newline + rest

NEW_FUNCTION = '''function ShipmentsPage() {
  const [filter, setFilter] = useState("Active");
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
  const filters = ["Active", "Issues", "Delivered"];

  // 3 simple filter groups (was 6)
  const filterFn: Record<string, (s: Shipment) => boolean> = {
    "Active": (s) => s.status !== "delivered",
    "Issues": (s) => s.status === "delayed" || s.status === "demurrage_risk" || s.docReadiness < 50,
    "Delivered": (s) => s.status === "delivered",
  };

  const filtered = shipmentsData.filter(filterFn[filter]);

  // Simple plain-English status helper
  function plainStatus(s: Shipment): { headline: string; sub: string; color: string } {
    if (s.status === "delivered") {
      const delDate = s.milestones.find(m => m.stage === "delivered")?.date;
      return { headline: "Delivered", sub: `Arrived ${delDate}`, color: "green" };
    }
    if (s.demurrageRisk !== null) {
      return { headline: "Action needed", sub: `Port fees start in ${s.demurrageRisk} days`, color: "red" };
    }
    if (s.status === "delayed") {
      return { headline: "Delayed", sub: `New ETA ${s.etaDate} (+4 days)`, color: "amber" };
    }
    if (s.docReadiness < 50) {
      return { headline: "Docs missing", sub: `${s.docReadiness}% ready — vessel departs soon`, color: "red" };
    }
    if (s.stage === "at_port") return { headline: "At Djibouti port", sub: "Waiting for vessel", color: "blue" };
    if (s.stage === "to_port") return { headline: "On the truck", sub: "Heading to Djibouti", color: "blue" };
    if (s.stage === "processing") return { headline: "Being processed", sub: "Preparing for shipment", color: "gray" };
    if (s.stage === "in_transit" || s.stage === "loaded") return { headline: "On the water", sub: `Arrives ${s.etaDate}`, color: "blue" };
    if (s.stage === "arrived" || s.stage === "customs") return { headline: "In customs", sub: `${s.destinationPort} port`, color: "blue" };
    return { headline: shipmentStatusConfig[s.status].label, sub: "", color: "gray" };
  }

  // 4-stage simplified journey (was 8)
  function journeyStage(s: Shipment): 0 | 1 | 2 | 3 {
    if (s.stage === "processing" || s.stage === "to_port" || s.stage === "at_port") return 0; // Ethiopia
    if (s.stage === "loaded" || s.stage === "in_transit") return 1; // At sea
    if (s.stage === "arrived" || s.stage === "customs") return 2; // At destination port
    return 3; // Delivered
  }

  const journeyLabels = ["Ethiopia", "At Sea", "Arrived", "Delivered"];

  const stats = {
    active: shipmentsData.filter(s => s.status !== "delivered").length,
    issues: shipmentsData.filter(s => s.status === "delayed" || s.status === "demurrage_risk" || s.docReadiness < 50).length,
    delivered: shipmentsData.filter(s => s.status === "delivered").length,
    activeValue: shipmentsData.filter(s => s.status !== "delivered").reduce((sum, s) => sum + s.contractValue, 0),
  };

  const selected = shipmentsData.find(s => s.id === selectedShipment);

  return (
    <main className="p-8 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Shipments</h1>
          <p className="text-sm text-gray-500 mt-1">Where is every container?</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
          <Plus className="h-4 w-4" /> New Shipment
        </button>
      </div>

      {/* Simple filter tabs (was 6, now 3) */}
      <div className="flex gap-1 mb-6">
        {filters.map((f) => {
          const count = shipmentsData.filter(filterFn[f]).length;
          const isActive = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-[#4A3520] text-white" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {f}
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                isActive ? "bg-white/20" : "bg-gray-100 text-gray-500"
              )}>{count}</span>
              {f === "Issues" && count > 0 && !isActive && <span className="h-2 w-2 rounded-full bg-red-500" />}
            </button>
          );
        })}
      </div>

      {/* Shipment cards — simplified, scannable */}
      <div className="space-y-4">
        {filtered.map((s) => {
          const ps = plainStatus(s);
          const stage = journeyStage(s);
          const colorClasses: Record<string, { dot: string; text: string; bg: string; bar: string }> = {
            green: { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50", bar: "bg-green-500" },
            red: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", bar: "bg-red-500" },
            amber: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", bar: "bg-amber-500" },
            blue: { dot: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50", bar: "bg-blue-500" },
            gray: { dot: "bg-gray-400", text: "text-gray-700", bg: "bg-gray-50", bar: "bg-gray-400" },
          };
          const cc = colorClasses[ps.color];
          return (
            <div
              key={s.id}
              onClick={() => setSelectedShipment(s.id)}
              className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-all cursor-pointer hover:border-gray-300"
            >
              {/* Top row: who + status pill */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-gray-900">{s.flag} {s.destinationCity}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-sm text-gray-500">{s.buyer}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{s.id} · {s.vessel}</p>
                </div>
                <div className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", cc.bg)}>
                  <span className={cn("h-2 w-2 rounded-full", cc.dot)} />
                  <div className="text-right">
                    <p className={cn("text-xs font-semibold leading-tight", cc.text)}>{ps.headline}</p>
                    {ps.sub && <p className={cn("text-[10px] leading-tight mt-0.5", cc.text, "opacity-80")}>{ps.sub}</p>}
                  </div>
                </div>
              </div>

              {/* HERO: 4-stage journey bar */}
              <div className="mb-4">
                <div className="relative flex items-center justify-between mb-2">
                  {journeyLabels.map((label, i) => {
                    const isComplete = i < stage;
                    const isCurrent = i === stage;
                    return (
                      <div key={label} className="flex-1 flex flex-col items-center relative">
                        {/* Dot */}
                        <div className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold border-2 z-10 bg-white",
                          isComplete ? cn(cc.bar, "text-white border-transparent")
                          : isCurrent ? cn("border-2", cc.text, cc.bg.replace("bg-", "border-").replace("50", "200"))
                          : "border-gray-200 text-gray-400"
                        )}>
                          {isComplete ? "✓" : i + 1}
                        </div>
                        <span className={cn(
                          "text-[10px] mt-1.5 font-medium",
                          isComplete ? "text-gray-700" : isCurrent ? cn(cc.text) : "text-gray-400"
                        )}>{label}</span>
                      </div>
                    );
                  })}
                  {/* Progress line behind dots */}
                  <div className="absolute top-3.5 left-[12.5%] right-[12.5%] h-0.5 bg-gray-200 -z-0">
                    <div
                      className={cn("h-full transition-all", cc.bar)}
                      style={{ width: `${(stage / 3) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom row: ETA (hero) + key facts */}
              <div className="flex items-end justify-between pt-4 border-t border-gray-50">
                <div className="flex items-center gap-6">
                  {s.status !== "delivered" ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Arrives</p>
                      <p className="text-lg font-bold text-gray-900">{s.etaDate}</p>
                      <p className="text-[11px] text-gray-500">{s.daysRemaining} days from now</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Completed</p>
                      <p className="text-lg font-bold text-green-600">On time</p>
                      <p className="text-[11px] text-gray-500">{s.daysTotal} day voyage</p>
                    </div>
                  )}
                  <div className="h-10 w-px bg-gray-100" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Cargo</p>
                    <p className="text-sm font-bold text-gray-900">{(s.weightKg / 1000).toFixed(1)}t</p>
                    <p className="text-[11px] text-gray-500">${(s.contractValue / 1000).toFixed(0)}K</p>
                  </div>
                  <div className="h-10 w-px bg-gray-100" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Temperature</p>
                    <p className={cn("text-sm font-bold", s.tempOk ? "text-gray-900" : "text-red-600")}>{s.temperature.toFixed(1)}°C</p>
                    <p className="text-[11px] text-gray-500">{s.humidity}% humidity</p>
                  </div>
                </div>

                {/* Right side: action hint */}
                {ps.color === "red" && (
                  <span className="text-xs font-medium text-red-600">Tap to resolve →</span>
                )}
                {ps.color === "amber" && (
                  <span className="text-xs font-medium text-amber-700">Tap for details →</span>
                )}
                {ps.color === "blue" && (
                  <span className="text-xs font-medium text-gray-400">Tap to track →</span>
                )}
                {ps.color === "green" && (
                  <span className="text-xs font-medium text-gray-400">Tap for history →</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* SIMPLIFIED Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedShipment(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-[480px] h-full bg-white border-l border-gray-200 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 px-6 py-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selected.flag} {selected.destinationCity}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selected.buyer} · {selected.id}</p>
                </div>
                <button onClick={() => setSelectedShipment(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* HERO: What's happening now */}
              {(() => {
                const ps = plainStatus(selected);
                const stage = journeyStage(selected);
                const cc = ({"green": {dot:"bg-green-500",text:"text-green-700",bg:"bg-green-50",bar:"bg-green-500"},"red":{dot:"bg-red-500",text:"text-red-700",bg:"bg-red-50",bar:"bg-red-500"},"amber":{dot:"bg-amber-500",text:"text-amber-700",bg:"bg-amber-50",bar:"bg-amber-500"},"blue":{dot:"bg-blue-500",text:"text-blue-700",bg:"bg-blue-50",bar:"bg-blue-500"},"gray":{dot:"bg-gray-400",text:"text-gray-700",bg:"bg-gray-50",bar:"bg-gray-400"}} as any)[ps.color];

                return (
                  <>
                    {/* Plain English status card */}
                    <div className={cn("rounded-xl p-4 border", cc.bg, cc.bg.replace("bg-", "border-").replace("50", "200"))}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("h-2.5 w-2.5 rounded-full", cc.dot)} />
                        <span className={cn("text-sm font-bold", cc.text)}>{ps.headline}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {selected.status === "delivered" && `This container was delivered successfully. The full voyage took ${selected.daysTotal} days from Ethiopia to ${selected.destinationCity}.`}
                        {selected.demurrageRisk !== null && `Container is at sea heading to ${selected.destinationCity}, but the phytosanitary certificate expires in ${selected.demurrageRisk} days. If not renewed before arrival, the port will charge demurrage fees of ~$420/day.`}
                        {selected.status === "delayed" && `Vessel was delayed at a transshipment port. New ETA is ${selected.etaDate}. Buyer has been notified. No additional cost to you.`}
                        {selected.docReadiness < 50 && `Only ${selected.docReadiness}% of required documents are ready. Vessel departs ${selected.departureDate} — application cutoff is 48 hours before that.`}
                        {(selected.stage === "at_port" || selected.stage === "to_port" || selected.stage === "processing") && `Container is currently in Ethiopia, ${ps.headline.toLowerCase()}. Next step: load onto ${selected.vessel}.`}
                        {(selected.stage === "in_transit" || selected.stage === "loaded") && `Container is on the water aboard ${selected.vessel}. Currently in stage ${stage + 1} of 4. Arrives ${selected.etaDate} in ${selected.daysRemaining} days.`}
                      </p>
                    </div>

                    {/* Big journey visualization */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Journey</p>
                      <div className="relative flex items-center justify-between mb-2 px-2">
                        {journeyLabels.map((label, i) => {
                          const isComplete = i < stage;
                          const isCurrent = i === stage;
                          return (
                            <div key={label} className="flex-1 flex flex-col items-center relative">
                              <div className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold border-2 z-10 bg-white",
                                isComplete ? cn(cc.bar, "text-white border-transparent")
                                : isCurrent ? cn("border-2", cc.text, cc.bg.replace("bg-", "border-").replace("50", "200"))
                                : "border-gray-200 text-gray-400"
                              )}>
                                {isComplete ? "✓" : i + 1}
                              </div>
                              <span className={cn(
                                "text-xs mt-2 font-medium",
                                isComplete ? "text-gray-700" : isCurrent ? cn(cc.text) : "text-gray-400"
                              )}>{label}</span>
                              {isCurrent && <span className="text-[10px] text-gray-400 mt-0.5">Current</span>}
                            </div>
                          );
                        })}
                        <div className="absolute top-5 left-[12.5%] right-[12.5%] h-0.5 bg-gray-200 -z-0">
                          <div className={cn("h-full transition-all", cc.bar)} style={{ width: `${(stage / 3) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* What needs attention (only if there are issues) */}
              {(selected.demurrageRisk !== null || selected.docReadiness < 50 || selected.status === "delayed") && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={1.5} />
                    <span className="text-sm font-semibold text-amber-700">What needs attention</span>
                  </div>
                  <ul className="space-y-1.5">
                    {selected.demurrageRisk !== null && (
                      <li className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Renew phytosanitary certificate at EAA — takes 5-7 days, vessel arrives in {selected.demurrageRisk + 5} days</span>
                      </li>
                    )}
                    {selected.docReadiness < 50 && (
                      <li className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>{selected.docReadiness}% of documents ready — resolve missing items before vessel cutoff</span>
                      </li>
                    )}
                    {selected.status === "delayed" && (
                      <li className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-amber-500 mt-1">•</span>
                        <span>Buyer notified of delay. No action needed unless they request compensation.</span>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Key facts — clean grid */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Key Facts</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Vessel</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{selected.vessel}</p>
                    <p className="text-[10px] text-gray-400">{selected.voyage}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Departure → Arrival</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{selected.departureDate} → {selected.etaDate}</p>
                    <p className="text-[10px] text-gray-400">{selected.daysTotal} day voyage</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Container</p>
                    <p className="text-sm font-mono font-medium text-gray-900 mt-0.5">{selected.containerNo}</p>
                    <p className="text-[10px] text-gray-400">Seal: {selected.sealNo}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Value</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">${selected.contractValue.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">Insured: ${selected.insuranceValue.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Cargo (lots) */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Cargo ({(selected.weightKg / 1000).toFixed(1)}t total)</p>
                <div className="flex flex-wrap gap-2">
                  {selected.lots.map((lot, li) => (
                    <span key={li} className="rounded-md bg-gray-50 border border-gray-100 px-3 py-1.5 text-xs text-gray-700">{lot}</span>
                  ))}
                </div>
              </div>

              {/* Temperature history (simple, not a chart) */}
              {selected.tempLog.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Temperature</p>
                    <span className={cn("text-xs font-medium", selected.tempOk ? "text-green-600" : "text-red-600")}>
                      {selected.tempOk ? "Normal range" : "Alert"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-sm font-bold text-gray-900">{selected.temperature.toFixed(1)}°C <span className="text-xs font-normal text-gray-400">/ {selected.humidity}% humidity</span></p>
                    <p className="text-[11px] text-gray-500 mt-1">Target: 15-25°C · 50-70% RH for green coffee</p>
                    <p className="text-[11px] text-gray-400 mt-1">{selected.tempLog.length} readings since {selected.tempLog[0]?.day}</p>
                  </div>
                </div>
              )}

              {/* Documents (link to compliance, simple) */}
              <div className="rounded-lg border border-gray-200 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Documents</p>
                  <p className={cn("text-sm font-bold", selected.docReadiness === 100 ? "text-green-600" : selected.docReadiness < 50 ? "text-red-600" : "text-amber-600")}>
                    {selected.docReadiness === 100 ? "All approved" : `${selected.docReadiness}% ready`}
                  </p>
                </div>
                <button className="text-xs font-medium text-[#4A3520] hover:underline">View in Compliance →</button>
              </div>

              {/* Action buttons — only show what's actually needed */}
              <div className="space-y-2 pt-2">
                {selected.demurrageRisk !== null && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Renew Phytosanitary Certificate</button>
                )}
                {selected.docReadiness < 50 && (
                  <button className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Resolve Missing Documents</button>
                )}
                {selected.status !== "delivered" && selected.demurrageRisk === null && selected.docReadiness >= 50 && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Track on Vessel Website</button>
                )}
                {selected.status === "delivered" && (
                  <button className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Download Delivery Receipt</button>
                )}
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
