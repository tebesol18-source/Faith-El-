/**
 * GET /api/market-prices
 *
 * Returns ICE Coffee C futures prices + Ethiopian coffee premiums.
 *
 * In production, this would call:
 *   - ICE/Intercontinental Exchange API for futures prices
 *   - ICO (International Coffee Organization) for composite prices
 *   - ECX (Ethiopia Commodity Exchange) for local auction prices
 *
 * For now, we simulate realistic market data based on the current date.
 * The prices are deterministic (seeded by date) so they're stable within a day
 * but change between days — simulating real market movement.
 *
 * Response: {
 *   ok, source,
 *   futures: { current, change, change_pct, high, low, volume, contract_month },
 *   history: [{ date, price }],
 *   ethiopian_premiums: { yirgacheffe, guji, sidamo, limu, harrar },
 *   exchange_rate: { usd_to_etb, date },
 *   farmgate_prices: { avg_etb_per_kg, range },
 *   recommendations: { fair_fob_range, margin_warning_level }
 * }
 */

import { NextResponse } from "next/server";

// Deterministic pseudo-random based on date string
function dateSeed(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export async function GET() {
  try {
    const today = new Date().toISOString().substring(0, 10);
    const seed = dateSeed(today);
    const rand = seededRandom(seed);

    // ICE Coffee C futures — typically 180-320 cents/lb
    // Base around 250 with daily variation
    const basePrice = 250 + (rand() - 0.5) * 30; // 235-265 range
    const current = Math.round(basePrice * 100) / 100;
    const change = Math.round((rand() - 0.45) * 600) / 100; // -3.30 to +3.30
    const changePct = Math.round((change / current) * 10000) / 100;
    const high = Math.round((current + Math.abs(change) + rand() * 2) * 100) / 100;
    const low = Math.round((current - Math.abs(change) - rand() * 2) * 100) / 100;

    // Generate 30-day history (deterministic)
    const history: { date: string; price: number }[] = [];
    let histPrice = current - change * 5; // start 5 days back
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().substring(0, 10);
      const daySeed = dateSeed(dateStr);
      const dayRand = seededRandom(daySeed);
      histPrice = histPrice + (dayRand() - 0.48) * 4;
      histPrice = Math.max(200, Math.min(320, histPrice));
      history.push({ date: dateStr, price: Math.round(histPrice * 100) / 100 });
    }
    // Override today's price
    history[history.length - 1].price = current;

    // Ethiopian coffee premiums (in cents/lb above ICE C futures)
    // These are real-world approximate premiums for Ethiopian specialty coffee
    const ethiopianPremiums = {
      yirgacheffe: Math.round((180 + rand() * 30) * 100) / 100, // ~180-210 cents/lb premium
      guji: Math.round((150 + rand() * 25) * 100) / 100,        // ~150-175
      sidamo: Math.round((100 + rand() * 20) * 100) / 100,      // ~100-120
      limu: Math.round((80 + rand() * 15) * 100) / 100,         // ~80-95
      harrar: Math.round((70 + rand() * 15) * 100) / 100,       // ~70-85
    };

    // Convert to USD/kg (1 lb = 0.453592 kg, 100 cents = $1)
    const premiumsUsdPerKg: Record<string, number> = {};
    for (const [region, premiumCentsPerLb] of Object.entries(ethiopianPremiums)) {
      const totalCentsPerLb = current + premiumCentsPerLb;
      const usdPerLb = totalCentsPerLb / 100;
      const usdPerKg = usdPerLb / 0.453592;
      premiumsUsdPerKg[region] = Math.round(usdPerKg * 100) / 100;
    }

    // USD to ETB exchange rate (typically ~55-60 ETB per USD)
    const usdToEtb = Math.round((56 + rand() * 4) * 100) / 100;

    // Farmgate prices in ETB/kg (what cooperatives pay farmers)
    const farmgateAvg = Math.round((27 + rand() * 4) * 10) / 10; // ~27-31 ETB/kg
    const farmgateRange = { min: Math.round((farmgateAvg - 3) * 10) / 10, max: Math.round((farmgateAvg + 3) * 10) / 10 };

    // FOB Djibouti fair price range (USD/kg) — based on ICE + premium - export costs
    const fairFobMin = Math.round((current / 100 / 0.453592) * 0.85 * 100) / 100; // 85% of ICE (commercial grade)
    const fairFobMax = Math.round(((current + 200) / 100 / 0.453592) * 100) / 100; // ICE + 200 cents premium (specialty)

    // Margin warning level — if current ICE price drops below 220, margins compress
    let marginWarning: "normal" | "caution" | "critical";
    if (current < 210) marginWarning = "critical";
    else if (current < 235) marginWarning = "caution";
    else marginWarning = "normal";

    return NextResponse.json({
      ok: true,
      source: "simulated (ICE Coffee C + Ethiopian premiums)",
      timestamp: new Date().toISOString(),
      futures: {
        current, // cents/lb
        change,
        change_pct: changePct,
        high,
        low,
        volume: Math.round(8000 + rand() * 4000), // contracts
        contract_month: "Sep 2026",
        unit: "cents/lb",
        exchange: "ICE Futures U.S.",
      },
      history,
      ethiopian_premiums: {
        cents_per_lb: ethiopianPremiums,
        usd_per_kg: premiumsUsdPerKg,
      },
      exchange_rate: {
        usd_to_etb: usdToEtb,
        date: today,
      },
      farmgate_prices: {
        avg_etb_per_kg: farmgateAvg,
        range: farmgateRange,
        avg_usd_per_kg: Math.round((farmgateAvg / usdToEtb) * 100) / 100,
      },
      fob_pricing: {
        fair_range_usd_per_kg: { min: fairFobMin, max: fairFobMax },
        current_ice_usd_per_kg: Math.round((current / 100 / 0.453592) * 100) / 100,
      },
      recommendations: {
        margin_warning_level: marginWarning,
        recommendation: marginWarning === "critical"
          ? "ICE prices critically low — avoid new FOB contracts below $4.50/kg. Focus on CIF contracts where you control shipping costs."
          : marginWarning === "caution"
          ? "ICE prices below average — tighten margins on commercial grades. Specialty premiums remain stable."
          : "Market conditions favorable — standard pricing applies. Specialty lots can command premium pricing.",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
