// @ts-nocheck
// ─── Murphy Validator — Server Function ──────────────────────────────
// Orquesta: fetch de datos → validación pura → reporte estructurado
// ─────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";
import {
  generateMurphyReport,
  type MurphyReport,
  type MurphyValidationData,
  type RatioData,
  type DollarData,
  type BondStockRelationData,
  type YieldCurveData,
  type DowTheoryData,
  type SectorRotationData,
  type InternationalData,
  type CreditMarketData,
  type CycleStageData,
  type LeadLagData,
  type FedMonetaryData,
} from "./murphy-validator";
import { detectCyclePhase } from "./cycle-phase-detector";
import { computePearsonCorrelation } from "./intermarket-complete";

// ─── Constantes ──────────────────────────────────────────────────────

const CACHE_TTL = 10 * 60 * 1000; // 10 min
const CACHE_KEY = "murphy-validator-v1";

// ─── Helpers (copiados de intermarket-murphy.functions.ts para mantener pureza) ──

async function fetchYahooHistory(ticker: string, period: string): Promise<{ date: string; close: number }[]> {
  try {
    const mod: any = await import("yahoo-finance2");
    const YF = mod.default ?? mod;
    const yf = typeof YF === "function" ? new YF() : YF;
    try { yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]); } catch { /* noop */ }
    const days = period === "max" ? 25 * 365
      : period === "5y" ? 5 * 365
      : period === "2y" ? 730
      : period === "1y" ? 365
      : period === "6mo" ? 180
      : period === "3mo" ? 90
      : 365;
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const period2 = new Date();
    const rows = await yf.chart(ticker, { period1, period2, interval: "1d" });
    return (rows?.quotes ?? [])
      .filter((q: any) => q.close != null && q.close > 0 && q.date != null)
      .map((q: any) => ({ date: new Date(q.date * 1000).toISOString().slice(0, 10), close: q.close }));
  } catch {
    const { yahooChartCloses } = await import("./yahoo-chart");
    const mapRange: Record<string, string> = { max: "max", "5y": "5y", "2y": "2y", "1y": "1y", "6mo": "6mo", "3mo": "3mo" };
    return await yahooChartCloses(ticker, mapRange[period] ?? "1y");
  }
}

function computeReturns(closes: { date: string; close: number }[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1].close > 0) rets.push((closes[i].close - closes[i - 1].close) / closes[i - 1].close);
  }
  return rets;
}

function computeReturn(closes: { date: string; close: number }[], days: number): number | null {
  if (closes.length < days + 1) return null;
  const start = closes[closes.length - 1 - days]?.close;
  const end = closes[closes.length - 1]?.close;
  if (!start || start <= 0 || !end) return null;
  return (end - start) / start;
}

function computeReturnPct(closes: { date: string; close: number }[], days: number): number | null {
  const r = computeReturn(closes, days);
  return r != null ? r * 100 : null;
}

// pearsonR unificado via computePearsonCorrelation (intermarket-complete)

function trendFromChange(pct: number | null): "rising" | "falling" | "flat" | null {
  if (pct == null) return null;
  if (pct > 2) return "rising";
  if (pct < -2) return "falling";
  return "flat";
}

/**
 * Trend multi-timeframe: combina 1m, 3m y 6m para mayor robustez.
 * Si todos apuntan en la misma dirección → esa dirección.
 * Si divergen → el timeframe más largo (6m > 3m > 1m) tiene prioridad.
 * Si el 6m es "flat", usa el 3m. Si ambos son flat, usa "flat".
 */
function trendFromMultiTimeframe(
  pct1m: number | null,
  pct3m: number | null,
  pct6m: number | null,
): "rising" | "falling" | "flat" | null {
  const t1 = trendFromChange(pct1m);
  const t3 = trendFromChange(pct3m);
  const t6 = trendFromChange(pct6m);

  // consensus: todos apuntan igual
  if (t1 !== null && t1 !== "flat" && t1 === t3 && t3 === t6) return t1;
  if (t1 !== null && t6 !== null && t1 === t6 && t6 !== "flat") return t6; // 1m y 6m alineados
  if (t3 !== null && t6 !== null && t3 === t6 && t6 !== "flat") return t6; // 3m y 6m alineados

  // Priorizar el timeframe más largo disponible
  if (t6 !== null && t6 !== "flat") return t6;
  if (t3 !== null && t3 !== "flat") return t3;
  if (t1 !== null && t1 !== "flat") return t1;

  // Todos son flat o null
  return t3 ?? t6 ?? t1 ?? null;
}

function trendFromChangeStrict(pct: number | null): "up" | "down" | "flat" | null {
  if (pct == null) return null;
  if (pct > 1.5) return "up";
  if (pct < -1.5) return "down";
  return "flat";
}

function crossCorrelationLagged(
  rets1: number[], rets2: number[], maxLag = 60, step = 5,
): { bestLag: number; bestCorr: number | null } {
  const n = Math.min(rets1.length, rets2.length);
  if (n < 30) return { bestLag: 0, bestCorr: null };
  let bestCorr = 0, bestLag = 0;
  for (let lag = -maxLag; lag <= maxLag; lag += step) {
    let x: number[], y: number[];
    if (lag >= 0) { x = rets1.slice(0, n - lag); y = rets2.slice(lag); }
    else { x = rets1.slice(-lag); y = rets2.slice(0, n + lag); }
    if (x.length < 10 || y.length < 10) continue;
    const corr = computePearsonCorrelation(x, y) ?? 0;
    if (Math.abs(corr) > Math.abs(bestCorr)) { bestCorr = corr; bestLag = lag; }
  }
  return { bestLag, bestCorr };
}

function buildRatioData(
  num: { date: string; close: number }[],
  den: { date: string; close: number }[],
): RatioData {
  if (num.length === 0 || den.length === 0) {
    return { value: null, changePct1m: null, changePct3m: null, changePct6m: null, trend: null };
  }
  const ratio = num[num.length - 1].close / den[den.length - 1].close;
  const ratioSeries: number[] = [];
  const maxLen = Math.min(num.length, den.length);
  for (let i = 0; i < maxLen; i++) {
    if (den[den.length - maxLen + i].close > 0) {
      ratioSeries.push(num[num.length - maxLen + i].close / den[den.length - maxLen + i].close);
    }
  }
  const pct1m = ratioSeries.length > 21
    ? ((ratioSeries[ratioSeries.length - 1] - ratioSeries[ratioSeries.length - 1 - 21]) / ratioSeries[ratioSeries.length - 1 - 21]) * 100
    : null;
  const pct3m = ratioSeries.length > 63
    ? ((ratioSeries[ratioSeries.length - 1] - ratioSeries[ratioSeries.length - 1 - 63]) / ratioSeries[ratioSeries.length - 1 - 63]) * 100
    : null;
  const pct6m = ratioSeries.length > 126
    ? ((ratioSeries[ratioSeries.length - 1] - ratioSeries[ratioSeries.length - 1 - 126]) / ratioSeries[ratioSeries.length - 1 - 126]) * 100
    : null;
  return {
    value: Math.round(ratio * 10000) / 10000,
    changePct1m: pct1m != null ? Math.round(pct1m * 100) / 100 : null,
    changePct3m: pct3m != null ? Math.round(pct3m * 100) / 100 : null,
    changePct6m: pct6m != null ? Math.round(pct6m * 100) / 100 : null,
    trend: trendFromMultiTimeframe(pct1m, pct3m, pct6m),
  };
}

// ─── Server Function Principal ───────────────────────────────────────

export const getMurphyValidatorReport = createServerFn({ method: "GET" }).handler(
  async (): Promise<MurphyReport> => {
    const cached = getCached<MurphyReport>(CACHE_KEY, CACHE_TTL);
    if (cached) return cached;

    // ── 1. FETCH todos los tickers en paralelo ──
    const [
      crbData, tltData, spyData, dxyData,
      gldData, slvData, usoData,
      xlyData, xlpData, iwmData,
      ndxData, efaData, eemData,
      ivwData, iveData, hygData, lqdData,
      tipData, tnxData,
      djiData, djtData,
      fvxData, irxData,
      xlbData, xleData, xluData, xlkData,
      xlfData, xlvData, xlreData,
      gdxData, ewjData,
    ] = await Promise.all([
      fetchYahooHistory("DBC", "1y"),          // Commodities
      fetchYahooHistory("TLT", "1y"),          // Long bonds
      fetchYahooHistory("SPY", "1y"),          // S&P 500
      fetchYahooHistory("DX-Y.NYB", "1y"),     // Dollar
      fetchYahooHistory("GLD", "1y"),          // Gold
      fetchYahooHistory("SLV", "1y"),          // Silver
      fetchYahooHistory("USO", "1y"),          // Oil
      fetchYahooHistory("XLY", "1y"),          // Consumer Disc.
      fetchYahooHistory("XLP", "1y"),          // Consumer Staples
      fetchYahooHistory("IWM", "1y"),          // Small Caps
      fetchYahooHistory("^NDX", "1y"),         // Nasdaq 100
      fetchYahooHistory("EFA", "1y"),          // Developed ex-US
      fetchYahooHistory("EEM", "1y"),          // Emerging Markets
      fetchYahooHistory("IVW", "1y"),          // S&P 500 Growth
      fetchYahooHistory("IVE", "1y"),          // S&P 500 Value
      fetchYahooHistory("HYG", "1y"),          // High Yield
      fetchYahooHistory("LQD", "1y"),          // Investment Grade
      fetchYahooHistory("TIP", "1y"),          // TIPS
      fetchYahooHistory("^TNX", "1y"),         // 10Y yield
      fetchYahooHistory("^DJI", "1y"),         // Dow Industrials
      fetchYahooHistory("^DJT", "1y"),         // Dow Transports
      fetchYahooHistory("^FVX", "1y"),         // 5Y yield
      fetchYahooHistory("^IRX", "1y"),         // 13-week (3M) yield
      fetchYahooHistory("XLB", "1y"),          // Materials
      fetchYahooHistory("XLE", "1y"),          // Energy
      fetchYahooHistory("XLU", "1y"),          // Utilities
      fetchYahooHistory("XLK", "1y"),          // Technology
      fetchYahooHistory("XLF", "1y"),          // Financials
      fetchYahooHistory("XLV", "1y"),          // Healthcare
      fetchYahooHistory("XLRE", "1y"),         // Real Estate
      fetchYahooHistory("GDX", "1y"),          // Gold Miners
      fetchYahooHistory("EWJ", "1y"),          // Japan
    ]);

    // ── 2. COMPUTE returns ──
    const crbRets = computeReturns(crbData);
    const tltRets = computeReturns(tltData);
    const spyRets = computeReturns(spyData);
    const dxyRets = computeReturns(dxyData);
    const crbRetsFull = crbRets; // used for lead-lag

    // ── 3. BUILD data structures for the validator ──

    // CRB/Bonds ratio
    const crbBonds: RatioData = buildRatioData(crbData, tltData);

    // Commodities/Stocks ratio
    const commoditiesStocks: RatioData = buildRatioData(crbData, spyData);

    // Bonds/Stocks relation
    const bondsStocks: BondStockRelationData = {
      tltReturn1m: computeReturnPct(tltData, 21),
      tltReturn3m: computeReturnPct(tltData, 63),
      spyReturn1m: computeReturnPct(spyData, 21),
      spyReturn3m: computeReturnPct(spyData, 63),
      correlacion60d: tltRets.length > 60 && spyRets.length > 60
        ? Math.round((computePearsonCorrelation(tltRets.slice(-60), spyRets.slice(-60)) ?? 0) * 10000) / 10000 : null,
      correlacion250d: tltRets.length > 250 && spyRets.length > 250
        ? Math.round((computePearsonCorrelation(tltRets.slice(-250), spyRets.slice(-250)) ?? 0) * 10000) / 10000 : null,
    };

    // Yield curve
    let yieldCurve: YieldCurveData;
    if (tnxData.length > 0 && fvxData.length > 0 && irxData.length > 0) {
      const tnxYield = tnxData[tnxData.length - 1].close;
      const fvxYield = fvxData[fvxData.length - 1].close;
      const irxYield = irxData[irxData.length - 1].close;
      const spread10y2y = tnxYield - fvxYield;
      const spread10y3m = tnxYield - irxYield;
      const inverted = spread10y2y < 0 || spread10y3m < 0;
      let steepness: YieldCurveData["steepness"] = "normal";
      if (spread10y2y < 0) steepness = "inverted";
      else if (tnxData.length > 60 && fvxData.length > 60) {
        const spread60dAgo = tnxData[tnxData.length - 61].close - fvxData[fvxData.length - 61].close;
        if (spread10y2y > spread60dAgo) steepness = "steepening";
        else if (spread10y2y < spread60dAgo) steepness = "flattening";
      }
      yieldCurve = {
        spread10y2y: Math.round(spread10y2y * 100) / 100,
        spread10y3m: Math.round(spread10y3m * 100) / 100,
        inverted,
        steepness,
        longTermAvg10y2y: 1.5, // promedio histórico aproximado
      };
    } else {
      yieldCurve = { spread10y2y: null, spread10y3m: null, inverted: null, steepness: null, longTermAvg10y2y: 1.5 };
    }

    // Dow Theory
    const djiTrendVal = computeReturnPct(djiData, 42);
    const djtTrendVal = computeReturnPct(djtData, 42);
    const djiTrend = trendFromChangeStrict(djiTrendVal);
    const djtTrend = trendFromChangeStrict(djtTrendVal);
    const confirmed = djiTrend === djtTrend && djiTrend !== null;
    let divergence: "bullish" | "bearish" | null = null;
    if (djiTrend === "up" && djtTrend !== "up") divergence = "bearish";
    else if (djiTrend === "down" && djtTrend !== "down") divergence = "bullish";
    const dowTheory: DowTheoryData = {
      industrialsReturn: djiTrendVal,
      transportsReturn: djtTrendVal,
      industrialsTrend: djiTrend,
      transportsTrend: djtTrend,
      confirmed,
      divergence,
    };

    // Dollar
    const dollar: DollarData = {
      dxyReturn1m: computeReturnPct(dxyData, 21),
      dxyReturn3m: computeReturnPct(dxyData, 63),
      dxyTrend: trendFromChange(computeReturnPct(dxyData, 63)),
    };

    // Gold/Oil and Copper/Gold
    const goldOil: RatioData = buildRatioData(gldData, usoData);
    let copperGold: RatioData;
    try {
      const hgData = await fetchYahooHistory("HG=F", "1y");
      copperGold = buildRatioData(hgData, gldData);
    } catch {
      copperGold = { value: null, changePct1m: null, changePct3m: null, changePct6m: null, trend: null };
    }

    // XLY/XLP
    const xlyXlp: RatioData = buildRatioData(xlyData, xlpData);

    // IWM/SPY
    const iwmSpy: RatioData = buildRatioData(iwmData, spyData);

    // NDX/SPX
    const ndxSpx: RatioData = buildRatioData(ndxData, spyData);

    // International
    const international: InternationalData = {
      efaReturn1m: computeReturnPct(efaData, 21),
      eemReturn1m: computeReturnPct(eemData, 21),
      efaReturn3m: computeReturnPct(efaData, 63),
      eemReturn3m: computeReturnPct(eemData, 63),
      efaEemRatio: efaData.length > 0 && eemData.length > 0
        ? (efaData[efaData.length - 1].close / eemData[eemData.length - 1].close) : null,
    };

    // Sector rotation
    const sectorRotation: SectorRotationData = {
      technologyReturn3m: computeReturnPct(xlkData, 63),
      financialsReturn3m: computeReturnPct(xlfData, 63),
      energyReturn3m: computeReturnPct(xleData, 63),
      materialsReturn3m: computeReturnPct(xlbData, 63),
      utilitiesReturn3m: computeReturnPct(xluData, 63),
      consumerCyclical3m: computeReturnPct(xlyData, 63),
      consumerDefensive3m: computeReturnPct(xlpData, 63),
      healthcareReturn3m: computeReturnPct(xlvData, 63),
      realEstateReturn3m: computeReturnPct(xlreData, 63),
    };

    // Growth/Value
    const growthValue: RatioData = buildRatioData(ivwData, iveData);

    // Credit market — usa HYG/LQD RATIO, no HYG solo (corrige bug: Cap.12 mostraba 0/2)
    const hygLqdRatioSeries: number[] = [];
    const minCL = Math.min(hygData.length, lqdData.length);
    for (let i = 0; i < minCL; i++) {
      const l = lqdData[lqdData.length - minCL + i].close;
      if (l > 0) hygLqdRatioSeries.push(hygData[hygData.length - minCL + i].close / l);
    }
    const hygLqdPct1m = hygLqdRatioSeries.length > 21
      ? ((hygLqdRatioSeries[hygLqdRatioSeries.length - 1] - hygLqdRatioSeries[hygLqdRatioSeries.length - 1 - 21]) / hygLqdRatioSeries[hygLqdRatioSeries.length - 1 - 21]) * 100 : null;
    const hygLqdPct3m = hygLqdRatioSeries.length > 63
      ? ((hygLqdRatioSeries[hygLqdRatioSeries.length - 1] - hygLqdRatioSeries[hygLqdRatioSeries.length - 1 - 63]) / hygLqdRatioSeries[hygLqdRatioSeries.length - 1 - 63]) * 100 : null;
    const creditMarket: CreditMarketData = {
      hygReturn1m: computeReturnPct(hygData, 21),
      lqdReturn1m: computeReturnPct(lqdData, 21),
      hygLqdRatio: hygLqdRatioSeries.length > 0 ? Math.round(hygLqdRatioSeries[hygLqdRatioSeries.length - 1] * 10000) / 10000 : null,
      hygLqdTrend: trendFromMultiTimeframe(hygLqdPct1m, hygLqdPct3m, null),
    };

    // Cycle stage — usa detectCyclePhase (único detector, stages 0-5)
    const tltTrend42Val = computeReturnPct(tltData, 42);
    const spyTrend42Val = computeReturnPct(spyData, 42);
    const crbTrend42Val = computeReturnPct(crbData, 42);
    const bArrow = trendFromChangeStrict(tltTrend42Val);
    const sArrow = trendFromChangeStrict(spyTrend42Val);
    const cArrow = trendFromChangeStrict(crbTrend42Val);
    const detectedStage05 = detectCyclePhase({
      bondsTrend: bArrow === "up" ? "up" : bArrow === "down" ? "down" : "flat",
      stocksTrend: sArrow === "up" ? "up" : sArrow === "down" ? "down" : "flat",
      commoditiesTrend: cArrow === "up" ? "up" : cArrow === "down" ? "down" : "flat",
    });
    const detectedStage = (detectedStage05 + 1) as 1 | 2 | 3 | 4 | 5 | 6;

    const cycleStage: CycleStageData = {
      bondsReturn42d: tltTrend42Val,
      stocksReturn42d: spyTrend42Val,
      commoditiesReturn42d: crbTrend42Val,
      bondsTrend42d: bArrow,
      stocksTrend42d: sArrow,
      commoditiesTrend42d: cArrow,
      detectedStage,
      stageConfidence: "alta",
    };

    // Lead-lag
    let bondsLead: string = "Sincrónico";
    let commLead: string = "Sincrónico";
    if (tltRets.length > 60 && spyRets.length > 60) {
      const ll = crossCorrelationLagged(tltRets.slice(-180), spyRets.slice(-180));
      bondsLead = ll.bestLag > 5 ? "TLT" : ll.bestLag < -5 ? "SPY" : "Sincrónico";
    }
    if (crbRets.length > 60 && spyRets.length > 60) {
      const ll = crossCorrelationLagged(crbRets.slice(-250), spyRets.slice(-250));
      commLead = ll.bestLag > 5 ? "DBC" : ll.bestLag < -5 ? "SPY" : "Sincrónico";
    }
    let dxyLeads: string = "Sincrónico";
    if (dxyRets.length > 60 && crbRetsFull.length > 60) {
      const ll = crossCorrelationLagged(dxyRets.slice(-180), crbRetsFull.slice(-180));
      dxyLeads = ll.bestLag > 5 ? "DXY" : ll.bestLag < -5 ? "DBC" : "Sincrónico";
    }
    const leadLag: LeadLagData = {
      dollarLeadsCommodities: dxyLeads,
      bondsLeadStocks: bondsLead,
      commoditiesLeadStocks: commLead,
      copperLeadIndustrials: null, // se podría extender
    };

    // CRB data for Cap 4
    const crbRaw = { value: crbData[crbData.length - 1]?.close ?? null, return1m: computeReturnPct(crbData, 21), return3m: computeReturnPct(crbData, 63) };

    // S&P 500 1Y return
    const sp500OneYearReturn = computeReturnPct(spyData, 252);

    // VIX
    let vixLevel: number | null = null;
    try {
      const vixData = await fetchYahooHistory("^VIX", "3mo");
      vixLevel = vixData.length > 0 ? vixData[vixData.length - 1].close : null;
    } catch { /* ignorar */ }

    // Fed monetary (simplificado — se podría extender con datos reales)
    const fedMonetary: FedMonetaryData = {
      currentRate: null, // idealmente de una API externa
      cyclePhase: null,
      fedVsSpread10y3m: null,
      fedAbove10y3m: null,
    };

    // Oil vs Oil Shares divergence (Murphy p.29, 71-72)
    const oilReturn1m = computeReturnPct(usoData, 21);
    const oilSharesReturn1m = computeReturnPct(xleData, 21);
    let oilDivergence: "bullish" | "bearish" | null = null;
    if (oilReturn1m != null && oilSharesReturn1m != null) {
      if (oilReturn1m > 3 && oilSharesReturn1m < 1) oilDivergence = "bearish";
      else if (oilReturn1m > 0 && oilSharesReturn1m > oilReturn1m * 0.7) oilDivergence = "bullish";
    }
    const oilVsOilShares = { oilReturn1m, oilSharesReturn1m, divergence: oilDivergence };

    // GDX/GLD ratio — gold stocks confirmation (Murphy p.125-127)
    const gdxGld: RatioData = buildRatioData(gdxData, gldData);

    // EWJ/SPY ratio — Japan leading indicator (Murphy p.84-87)
    const ewjSpy: RatioData = buildRatioData(ewjData, spyData);

    // ── 4. ENSAMBLAR MurphyValidationData ──
    const validationData: MurphyValidationData = {
      crbBonds,
      commoditiesStocks,
      bondsStocks,
      goldOil,
      copperGold,
      dollar,
      crbData: crbRaw,
      oilVsOilShares,
      gdxGld,
      ewjSpy,
      dowTheory,
      xlyXlp,
      yieldCurve,
      international,
      sectorRotation,
      growthValue,
      iwmSpy,
      ndxSpx,
      creditMarket,
      fedMonetary,
      yieldCurveInversion: yieldCurve,
      cycleStage,
      leadLag,
      sp500OneYearReturn,
      vixLevel,
    };

    // ── 5. GENERAR REPORTE ──
    const report = generateMurphyReport(validationData);

    // ── 6. CACHEAR Y RETORNAR ──
    setCache(CACHE_KEY, report);
    return report;
  },
);
