"use client";

import { useState, useEffect } from "react";
import {
  ArrowRight, Plus, Sparkles, Upload, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-client";
import type { Insight } from "@/lib/types";

const mockLotsData = [];

const eudrConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  complete: { label: "Complete", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  partial: { label: "Partial", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  missing: { label: "Missing", bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: "Active", bg: "bg-green-50", text: "text-green-700" },
  depleted: { label: "Depleted", bg: "bg-gray-100", text: "text-gray-500" },
  hold: { label: "On Hold", bg: "bg-amber-50", text: "text-amber-700" },
};

const regionColors: Record<string, string> = {
  Yirgacheffe: "bg-purple-100 text-purple-700",
  Guji: "bg-blue-100 text-blue-700",
  Sidamo: "bg-green-100 text-green-700",
  Limu: "bg-teal-100 text-teal-700",
  Harrar: "bg-orange-100 text-orange-700",
};

export function InventoryPage() {
  // ─── Live data from backend ───
  const [lotsData, setLotsData] = useState<any[] | null>(null);
  const [filterRegion, setFilterRegion] = useState("All");
  const [filterEudr, setFilterEudr] = useState("All");
  // ─── Inventory upload state ───
  const [showUpload, setShowUpload] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // ─── Add Lot modal state ───
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formRegion, setFormRegion] = useState("");
  const [formStation, setFormStation] = useState("");
  const [formCoop, setFormCoop] = useState("");
  const [formProcess, setFormProcess] = useState("Washed");
  const [formScreen, setFormScreen] = useState("");
  const [formScore, setFormScore] = useState("");
  const [formStock, setFormStock] = useState("");
  const [formCropYear, setFormCropYear] = useState("25/26");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inventory")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.lots) && data.lots.length > 0) {
          setLotsData(data.lots);
        } else {
          setLotsData([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[InventoryPage] API fetch failed, using mock data:", err);
        setLotsData([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Loading state
  if (!lotsData) {
    return (
      <main className="p-8 max-w-[1200px] mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gray-100 mb-4">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-[#4A3520] rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-700">Loading from database…</p>
        </div>
      </main>
    );
  }

  const regions = ["All", "Yirgacheffe", "Guji", "Sidamo", "Limu", "Harrar"];
  const eudrFilters = ["All", "Complete", "Partial", "Missing"];

  const filteredLots = lotsData.filter(lot => {
    const regionMatch = filterRegion === "All" || lot.region === filterRegion;
    const eudrMatch = filterEudr === "All" || lot.eudr === filterEudr.toLowerCase();
    return regionMatch && eudrMatch;
  });

  const totalStock = lotsData.reduce((sum, l) => sum + l.stock, 0);
  const activeLots = lotsData.filter(l => l.status === "active").length;
  const eudrComplete = lotsData.filter(l => l.eudr === "complete").length;
  const lowStock = lotsData.filter(l => l.stock > 0 && l.stock < 20).length;

  // ─── Refetch inventory list ───
  const refetchInventory = () => {
    apiFetch("/api/inventory")
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok && Array.isArray(data.lots)) setLotsData(data.lots);
        else setLotsData([]);
      })
      .catch(() => setLotsData([]));
  };

  // ─── Add Lot handler ───
  const handleCreate = () => {
    setCreateError(null);
    if (!formRegion.trim() || !formStation.trim() || !formCoop.trim()) {
      setCreateError("Region, washing station, and coop name are required.");
      return;
    }
    if (formScreen === "" || formScore === "" || formStock === "") {
      setCreateError("Screen size, cupping score, and stock bags are required.");
      return;
    }
    setCreating(true);
    apiFetch("/api/inventory", {
      method: "POST",
      body: JSON.stringify({
        region: formRegion.trim(),
        washingStationName: formStation.trim(),
        coopName: formCoop.trim(),
        process: formProcess,
        screenSize: Number(formScreen),
        cuppingScore: Number(formScore),
        stockBags: Number(formStock),
        cropYear: formCropYear.trim() || "25/26",
      }),
    })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok) {
          setShowCreate(false);
          setFormRegion(""); setFormStation(""); setFormCoop("");
          setFormProcess("Washed"); setFormScreen(""); setFormScore("");
          setFormStock(""); setFormCropYear("25/26");
          refetchInventory();
        } else {
          setCreateError(data.error || "Failed to create lot.");
        }
      })
      .catch((err) => setCreateError(`Failed: ${err.message}`))
      .finally(() => setCreating(false));
  };

  // ─── Inventory upload handler ───
  const handleUpload = () => {
    setUploading(true);
    setUploadResult(null);
    fetch("/api/inventory/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
    })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (data.ok) {
          setUploadResult(`✓ Agent 1 created ${data.created} new lots in inventory`);
          setCsvText("");
        } else {
          setUploadResult(`✗ Error: ${data.error}`);
        }
      })
      .catch((err) => setUploadResult(`✗ Failed: ${err.message}`))
      .finally(() => setUploading(false));
  };

  const sampleCsv = `region,washing_station_name,coop_name,process,screen_size,cupping_score,crop_year,stock_bags_remaining,certifications,eudr_data_status,eudr_gps_lat,eudr_gps_lon,eudr_farmgate_price_etb_per_kg
Yirgacheffe,Konga Station,Yirgacheffe Union,Washed,14,87.5,25/26,45,organic,complete,6.1627,38.1964,28.5
Guji,Hambela Station,Hambela Co-op,Washed,15,86.8,25/26,60,organic;FT,complete,5.9847,38.2856,27.5`;

  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">What coffee can I sell?</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowUpload(true); setUploadResult(null); }} className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
            <Upload className="h-4 w-4" /> Upload Inventory
          </button>
          <button onClick={() => { setShowCreate(true); setCreateError(null); }} className="flex items-center gap-1.5 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors">
            <Plus className="h-4 w-4" /> Add Lot
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total Stock</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalStock} <span className="text-sm font-normal text-gray-400">bags</span></p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Active Lots</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{activeLots}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">EUDR Complete</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{eudrComplete}<span className="text-sm font-normal text-gray-400">/{lotsData.length}</span></p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Low Stock</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{lowStock}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 mr-1">Region:</span>
            {regions.map(r => (
              <button
                key={r}
                onClick={() => setFilterRegion(r)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", filterRegion === r ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100")}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 mr-1">EUDR:</span>
            {eudrFilters.map(e => (
              <button
                key={e}
                onClick={() => setFilterEudr(e)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", filterEudr === e ? "bg-[#4A3520] text-white" : "text-gray-500 hover:bg-gray-100")}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-gray-400">{filteredLots.length} lots</span>
      </div>

      {/* Lot Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredLots.map((lot) => {
          const ec = eudrConfig[lot.eudr];
          const sc = statusConfig[lot.status];
          const rc = regionColors[lot.region] || "bg-gray-100 text-gray-600";
          return (
            <div key={lot.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", rc)}>{lot.region}</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{lot.process}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">{lot.id} · {lot.station}</p>
                </div>
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>{sc.label}</span>
              </div>

              {/* Cupping Score */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
                  <span className="text-lg font-bold text-amber-600">{lot.score}</span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cupping Score</p>
                  <p className="text-xs text-gray-500 mt-0.5">Screen {lot.screen} · Crop {lot.cropYear}</p>
                </div>
              </div>

              {/* Stock bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-500">Stock</span>
                  <span className={cn("text-sm font-bold", lot.stock === 0 ? "text-gray-400" : lot.stock < 20 ? "text-amber-600" : "text-gray-900")}>
                    {lot.stock} bags
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className={cn("h-2 rounded-full transition-all", lot.stock === 0 ? "bg-gray-200" : lot.stock < 20 ? "bg-amber-500" : "bg-green-500")}
                    style={{ width: `${Math.min((lot.stock / 100) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* EUDR + Certifications */}
              <div className="flex items-center justify-between">
                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", ec.bg, ec.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", ec.dot)} />
                  EUDR {ec.label}
                </span>
                <div className="flex gap-1">
                  {lot.certifications.map((cert, ci) => (
                    <span key={ci} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{cert}</span>
                  ))}
                  {lot.certifications.length === 0 && <span className="text-[10px] text-gray-300">No certs</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Insight banner */}
      <div className="mt-6 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 shrink-0">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-600 mb-1">AI Inventory Insight</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              Guji Washed stock is running low (45 bags). You have 2 active deals requiring Guji lots totaling 620 bags.
              Consider restocking from Shakisso Coop before committing to new quotes.
              EUDR compliance is missing for 2 lots — required for all EU shipments.
            </p>
            <button className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
              View restocking recommendations <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Lot Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Lot</h2>
              <button onClick={() => !creating && setShowCreate(false)} className="text-white/60 hover:text-white p-1">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Region *</label>
                <input type="text" value={formRegion} onChange={(e) => setFormRegion(e.target.value)} disabled={creating} placeholder="e.g. Yirgacheffe" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Washing Station *</label>
                <input type="text" value={formStation} onChange={(e) => setFormStation(e.target.value)} disabled={creating} placeholder="e.g. Konga Station" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Coop Name *</label>
                <input type="text" value={formCoop} onChange={(e) => setFormCoop(e.target.value)} disabled={creating} placeholder="e.g. Yirgacheffe Union" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Process *</label>
                <select value={formProcess} onChange={(e) => setFormProcess(e.target.value)} disabled={creating} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10">
                  <option>Washed</option>
                  <option>Natural</option>
                  <option>Honey</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Screen Size *</label>
                  <input type="number" step="0.5" value={formScreen} onChange={(e) => setFormScreen(e.target.value)} disabled={creating} placeholder="14" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Cupping Score *</label>
                  <input type="number" step="0.1" value={formScore} onChange={(e) => setFormScore(e.target.value)} disabled={creating} placeholder="87.5" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Stock Bags *</label>
                  <input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} disabled={creating} placeholder="45" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Crop Year</label>
                  <input type="text" value={formCropYear} onChange={(e) => setFormCropYear(e.target.value)} disabled={creating} placeholder="25/26" className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10" />
                </div>
              </div>
              {createError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{createError}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => !creating && setShowCreate(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 rounded-lg bg-[#4A3520] px-4 py-2 text-sm text-white disabled:opacity-60">
                  {creating ? "Creating..." : "Create Lot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => !uploading && setShowUpload(false)}>
          <div className="w-[560px] rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                  <Upload className="h-5 w-5 text-indigo-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Agent 1 — Upload Inventory</h3>
                  <p className="text-xs text-gray-500">Paste CSV data to create coffee lots</p>
                </div>
              </div>
              {!uploading && <button onClick={() => setShowUpload(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><XIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} /></button>}
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">CSV Data</label>
                  <button onClick={() => setCsvText(sampleCsv)} className="text-[11px] font-medium text-indigo-600 hover:underline">Load Sample Data</button>
                </div>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  disabled={uploading}
                  placeholder="region,washing_station_name,coop_name,process,screen_size,cupping_score,..."
                  rows={8}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 resize-none"
                />
                <p className="text-[11px] text-gray-400 mt-1">Columns: region, washing_station_name, coop_name, process, screen_size, cupping_score, crop_year, stock_bags_remaining, certifications, eudr_data_status, eudr_gps_lat, eudr_gps_lon, eudr_farmgate_price_etb_per_kg</p>
              </div>
              {uploadResult && (
                <div className={cn("rounded-lg p-3 text-sm", uploadResult.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>{uploadResult}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowUpload(false)} disabled={uploading} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">Close</button>
                <button onClick={handleUpload} disabled={uploading || !csvText.trim()} className="flex items-center gap-2 rounded-lg bg-[#4A3520] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60">
                  {uploading ? (<><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</>) : (<><Upload className="h-4 w-4" /> Upload & Create Lots</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

