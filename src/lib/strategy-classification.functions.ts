// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { linregress, computeHurst, computePVariance, mean, std } from "./math/stats";
import { BENCHMARKS_CLASIFICACION as _BENCHMARKS } from "./benchmarks-master";
// Re-export for backward compatibility — StrategyClassificationTab imports from here
export const BENCHMARKS_CLASIFICACION = _BENCHMARKS;

/*
 *  Score combinado técnico + fundamental 
 * Misma lógica de puntuación escalonada que calcularScoreFundamental
 * (sector-analysis.functions.ts) y scoreTecnico (oportunidades-dia.functions.ts).
 *
 * Técnico (máx 50 pts):
 *   - R² alto → beta estable, relación predecible con el benchmark
 *   - β Volatility bajo → beta consistente en el tiempo
 *   - Correlación alta → relación lineal fuerte
 *
 * Fundamental (máx 50 pts):
 *   - Alpha anualizado positivo y significativo → retorno real ajustado por riesgo
 *   - p-Value bajo → significancia estadística
 *   - Observaciones suficientes → datos robustos
 *
 * Score final 0-100.
 */
export function calcularScoreCombinado(asset: StrategyAsset): number {
  let earned = 0;
  let maxPts = 0;

  //  Técnico 
  // 1. R² (20 pts): qué tan bien explica el benchmark los movimientos
  const r2 = asset.rSquared;
  if (r2 >= 0) {
    earned += r2 >= 0.85 ? 20 : r2 >= 0.65 ? 15 : r2 >= 0.45 ? 10 : r2 >= 0.25 ? 5 : 0;
    maxPts += 20;
  }

  // 2. β Volatility (15 pts): estabilidad del beta en el tiempo
  const bv = asset.betaVolatility;
  if (bv != null) {
    earned += bv < 0.1 ? 15 : bv < 0.2 ? 10 : bv < 0.35 ? 5 : 0;
    maxPts += 15;
  }

  // 3. Correlación (15 pts): fuerza de la relación lineal
  const corr = Math.abs(asset.correlation);
  earned += corr >= 0.9 ? 15 : corr >= 0.7 ? 10 : corr >= 0.5 ? 5 : 0;
  maxPts += 15;

  //  Fundamental 
  // 4. Alpha anualizado (25 pts): retorno en exceso del benchmark
  const alpha = asset.annualizedAlpha;
  if (alpha >= 0) {
    earned += alpha >= 0.15 ? 25 : alpha >= 0.08 ? 18 : alpha >= 0.03 ? 10 : 5;
  } else {
    earned += alpha >= -0.05 ? 3 : alpha >= -0.15 ? 0 : -5;
  }
  maxPts += 25;

  // 5. Significancia estadística (15 pts): p-value bajo = señal real
  const pv = Math.abs(asset.pValue);
  if (pv >= 0) {
    earned += pv < 0.01 ? 15 : pv < 0.05 ? 10 : pv < 0.10 ? 5 : 0;
    maxPts += 15;
  }

  // 6. Observaciones (10 pts): cantidad de datos
  const obs = asset.observations;
  if (obs >= 0) {
    earned += obs >= 400 ? 10 : obs >= 250 ? 7 : obs >= 100 ? 4 : 1;
    maxPts += 10;
  }

  return maxPts > 0 ? Math.round(Math.max(0, (earned / maxPts) * 100)) : 50;
}

import { getHistory } from "./history-cache.server";

async function fetchHistoryYahoo(
  ticker: string, days = 365 * 2,
): Promise<{ date: string; close: number }[]> {
  try {
    return await getHistory(ticker, days);
  } catch {
    return [];
  }
}

function buildReturns(
  tickerMap: Map<string, number>,
  benchmark: string,
  histMap: Map<string, Map<string, number>>,
): { x: number[]; y: number[]; n: number } | null {
  const benchMap = histMap.get(benchmark);
  if (!benchMap || benchMap.size < 30) return null;
  const commonDates: string[] = [];
  for (const d of benchMap.keys()) {
    if (tickerMap.has(d)) commonDates.push(d);
  }
  commonDates.sort();
  if (commonDates.length < 30) return null;
  const x: number[] = [];
  const y: number[] = [];
  let prevB = benchMap.get(commonDates[0])!;
  let prevT = tickerMap.get(commonDates[0])!;
  for (let i = 1; i < commonDates.length; i++) {
    x.push((benchMap.get(commonDates[i])! - prevB) / prevB);
    y.push((tickerMap.get(commonDates[i])! - prevT) / prevT);
    prevB = benchMap.get(commonDates[i])!;
    prevT = tickerMap.get(commonDates[i])!;
  }
  return { x, y, n: commonDates.length - 1 };
}

function round4(v: number): number { return Math.round(v * 10000) / 10000; }

function runLinregress(
  tickerMap: Map<string, number>,
  benchmark: string,
  histMap: Map<string, Map<string, number>>,
): {
  alpha: number; annualizedAlpha: number; beta: number; rSquared: number;
  correlation: number; observations: number; pValue: number; stdErr: number;
} | null {
  const bm = buildReturns(tickerMap, benchmark, histMap);
  if (!bm) return null;
  const reg = linregress(bm.x, bm.y);
  return {
    alpha: round4(reg.intercept),
    annualizedAlpha: round4(reg.intercept * 252),
    beta: round4(reg.slope),
    rSquared: round4(reg.r2),
    correlation: round4(reg.r2 > 0 ? Math.sqrt(reg.r2) * (reg.slope >= 0 ? 1 : -1) : 0),
    observations: bm.n,
    pValue: reg.pValue,
    stdErr: reg.stdErr,
  };
}

function computeRollingBetas(
  tickerMap: Map<string, number>,
  benchmark: string,
  histMap: Map<string, Map<string, number>>,
  windowSize = 60,
): number[] {
  const bm = buildReturns(tickerMap, benchmark, histMap);
  if (!bm || bm.n < windowSize + 20) return [];
  const { x, y, n } = bm;
  const betas: number[] = [];
  for (let i = 0; i <= n - windowSize; i++) {
    const xw = x.slice(i, i + windowSize);
    const yw = y.slice(i, i + windowSize);
    const sx = xw.reduce((a, b) => a + b, 0);
    const sy = yw.reduce((a, b) => a + b, 0);
    const sx2 = xw.reduce((a, b) => a + b * b, 0);
    const sxy = xw.reduce((a, b, j) => a + b * yw[j], 0);
    const b = (windowSize * sxy - sx * sy) / (windowSize * sx2 - sx * sx);
    betas.push(round4(b));
  }
  return betas;
}

export type StrategyType =
  | "index-tracker"
  | "long-only"
  | "smart-beta"
  | "hedge-fund"
  | "uncorrelated"
  | "unclassified"
  //  Labadie §3.2: basadas en Hurst exponent 
  | "momentum"        // H > 0.6 → trending, seguir tendencia
  | "mean-reversion"  // H < 0.4 → mean-reverting, contrarian
  | "market-neutral"; // beta ~ 0 + H ~ 0.5, sin exposición directional

export interface StrategyAsset {
  ticker: string;
  alpha: number;
  annualizedAlpha: number;
  beta: number;
  rSquared: number;
  correlation: number;
  observations: number;
  rollingBetas: number[];
  betaVolatility: number | null;
  strategy: StrategyType;
  strategyLabel: string;
  pValue: number;
  bestBenchmark?: string;
  classificationConfidence?: "alta" | "media" | "baja";
  //  Labadie §3.2: Hurst + p-variance 
  hurstExponent?: number;
  impliedP?: number;
  pVariance?: number;
}

export interface StrategyClassificationResult {
  assets: StrategyAsset[];
  benchmark: string;
  timestamp: string;
}

export type StrategyTarget = "index-tracker" | "long-only" | "smart-beta" | "hedge-fund";

// Paso 8 — Umbrales de clasificación documentados y ajustables
// Basado en PDF Labadie "Geometry of an investment portfolio" slide 23
const INDEX_TRACKER_R2_MIN = 0.9;
const INDEX_TRACKER_BETA_RANGE = { min: 0.95, max: 1.05 };
const INDEX_TRACKER_ALPHA_MAX = 0.001;
const LONG_ONLY_R2_MIN = 0.5;
const LONG_ONLY_BETA_RANGE = { min: 0.85, max: 1.15 };
const LONG_ONLY_ALPHA_MIN = 0.001;
const HEDGE_FUND_BETA_MAX = 0.3;
const HEDGE_FUND_ALPHA_MIN = 0.001;
const SMART_BETA_R2_MIN = 0.3;
const SMART_BETA_BETAVOL_MIN = 0.15;
const SMART_BETA_BETA_ABS_MIN = 0.5;

function classify(
  beta: number,
  alpha: number,
  betaVol: number | null,
  rSquared: number,
  pValueAlpha: number,
  pValueBeta: number,
  //  Labadie §3.2: Hurst como factor de clasificación 
  hurst?: number,
): StrategyType {
  // Paso 4 — Filtro de significancia estadística
  const effectiveAlpha = pValueAlpha > 0.10 ? 0 : alpha;
  const effectiveBeta = pValueBeta > 0.10 ? 1 : beta;

  const absBeta = Math.abs(effectiveBeta);
  const absAlpha = Math.abs(effectiveAlpha);
  const H = hurst ?? 0.5;

  //  Labadie §3.2: Clasificación por Hurst (memoria del proceso) 
  // H > 0.6 → trending (momentum); H < 0.4 → mean-reverting
  const isTrending = H > 0.6;
  const isMeanReverting = H < 0.4;

  // Market-neutral: beta ~ 0 + sin tendencia fuerte
  if (absBeta < HEDGE_FUND_BETA_MAX && effectiveAlpha > HEDGE_FUND_ALPHA_MIN && H >= 0.4 && H <= 0.6) {
    return "market-neutral";
  }

  // Momentum: trending + beta significativo
  if (isTrending && absBeta > 0.5 && rSquared > 0.3) {
    return "momentum";
  }

  // Mean reversion: mean-reverting + beta bajo
  if (isMeanReverting && absBeta < 0.8) {
    return "mean-reversion";
  }

  if (rSquared > INDEX_TRACKER_R2_MIN &&
      absBeta >= INDEX_TRACKER_BETA_RANGE.min && absBeta <= INDEX_TRACKER_BETA_RANGE.max &&
      absAlpha < INDEX_TRACKER_ALPHA_MAX) return "index-tracker";

  if (rSquared > LONG_ONLY_R2_MIN &&
      absBeta >= LONG_ONLY_BETA_RANGE.min && absBeta <= LONG_ONLY_BETA_RANGE.max &&
      effectiveAlpha > LONG_ONLY_ALPHA_MIN) return "long-only";

  if (absBeta < HEDGE_FUND_BETA_MAX && effectiveAlpha > HEDGE_FUND_ALPHA_MIN) return "hedge-fund";

  if (absBeta < HEDGE_FUND_BETA_MAX) return "uncorrelated";

  if (rSquared > SMART_BETA_R2_MIN ||
      (betaVol != null && betaVol > SMART_BETA_BETAVOL_MIN) ||
      absBeta > SMART_BETA_BETA_ABS_MIN) return "smart-beta";

  return "unclassified";
}

function computeConfidence(obs: number, pValAlpha: number, pValBeta: number): "alta" | "media" | "baja" {
  if (obs < 60) return "baja";
  if (pValAlpha > 0.10 && pValBeta > 0.10) return "baja";
  if (pValAlpha < 0.05 && pValBeta < 0.05 && obs > 200) return "alta";
  return "media";
}

const strategyName: Record<StrategyType, string> = {
  "index-tracker": "Index Tracker",
  "long-only": "Long Only",
  "smart-beta": "Smart Beta",
  "hedge-fund": "Hedge Fund",
  uncorrelated: "No Correlacionado",
  unclassified: "Sin Clasificar",
  momentum: "Momentum (Trending)",
  "mean-reversion": "Mean Reversion",
  "market-neutral": "Market Neutral",
};

// Priorized subset for per-asset benchmark auto-detection (Paso 3)
// Market indices + sectors + Argentina-focused first
const AUTO_DETECT_PRIORITY = [
  "^SPX", "^IXIC", "^MERV", "^GDAXI", "^FTSE", "^N225", "^HSI", "^MXX", "^STOXX",
  "^RUT", "^DJI",
  "XLK", "XLF", "XLE", "XLC", "XLY", "XLP", "XLI", "XLB", "XLRE", "XLU", "XLV", "XAR",
  "ARGT", "EWZ", "EWW", "ECH", "EEM", "EFA",
  "SPY", "QQQ", "IWM", "MTUM", "QUAL", "USMV", "IVE", "IVW",
  "GLD", "SLV", "USO", "TLT", "IEF", "HYG", "LQD",
];
const AUTO_PRIORITY_SET = new Set(AUTO_DETECT_PRIORITY);

export const UNIVERSO_CLASIFICACION = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "NFLX",
  "TSLA",
  "JPM",
  "V",
  "MA",
  "DIS",
  "KO",
  "PEP",
  "WMT",
  "COST",
  "NKE",
  "MCD",
  "SBUX",
  "BA",
  "CAT",
  "GE",
  "JNJ",
  "PFE",
  "MRK",
  "ABBV",
  "UNH",
  "PG",
  "XOM",
  "CVX",
  "SPY",
  "QQQ",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "XLI",
  "XLB",
  "XLC",
  "XLY",
  "XLP",
  "XLRE",
  "XLU",
  "MTUM",
  "QUAL",
  "SIZE",
  "USMV",
  "IVE",
  "IVW",
  "IWM",
  "ARGT",
  "EWZ",
  "EWW",
  "EEM",
  "FXI",
  "EFA",
  "GLD",
  "SLV",
  "TLT",
  "IEF",
  "SHY",
  "LQD",
  "HYG",
  "TIP",
  "USO",
  "UNG",
  "DBA",
  "LIT",
  "VWO",
  "ECH",
  "INDA",
  "EWG",
  "EWJ",
  "BNDX",
];

// BENCHMARKS_CLASIFICACION now imported from benchmarks-master.ts (consolidated source of truth)
// Paso 2 — Consolidar las 3 listas de benchmarks en una sola fuente de verdad

function findBestBenchmark(
  tickerMap: Map<string, number>,
  histMap: Map<string, Map<string, number>>,
  isBaTicker: boolean,
  ticker: string,
): string | null {
  // Prioritize: for .BA tickers try ^MERV and ARGT first; for US tickers try ^SPX first
  // IMPORTANTE: excluir el propio ticker de los candidatos — si un ETF (ej. XLK) está
  // tanto en el universo como en la lista de benchmarks, compararlo contra sí mismo
  // produce β=1.00, α=0.00%, R²=1.000 artificialmente, rompiendo la clasificación.
  const candidates = (isBaTicker
    ? ["^MERV", "ARGT", ...AUTO_DETECT_PRIORITY.filter((t) => t !== "^MERV" && t !== "ARGT")]
    : AUTO_DETECT_PRIORITY
  ).filter((c) => c !== ticker);

  let bestR2 = -1;
  let best = null;
  for (const bm of candidates) {
    const benchMap = histMap.get(bm);
    if (!benchMap) continue;
    const commonDates: string[] = [];
    for (const d of benchMap.keys()) { if (tickerMap.has(d)) commonDates.push(d); }
    if (commonDates.length < 30) continue;
    const mockMap = new Map(tickerMap);
    const res = runLinregress(mockMap, bm, histMap);
    if (res && res.rSquared > bestR2) {
      bestR2 = res.rSquared;
      best = bm;
    }
  }
  return best;
}

export const getStrategyClassification = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        tickers: z.array(z.string().min(1)).min(1).max(100),
        benchmark: z.string().min(1),
        rollingBetaWindow: z.number().min(30).max(252).default(60),
        autoDetectBenchmark: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<StrategyClassificationResult> => {
    const allTickers = [
      ...new Set([...data.tickers, ...BENCHMARKS_CLASIFICACION.map((b) => b.ticker)]),
    ];
    const histMap = new Map<string, Map<string, number>>();

    const fetched = await Promise.all(allTickers.map((t) => fetchHistoryYahoo(t).catch(() => [])));
    for (let i = 0; i < allTickers.length; i++) {
      const rows = fetched[i];
      if (rows.length < 30) continue;
      const dateMap = new Map<string, number>();
      for (const r of rows) dateMap.set(r.date, r.close);
      histMap.set(allTickers[i], dateMap);
    }

    // Paso 3: Per-asset benchmark auto-detection
    const autoDetect = data.autoDetectBenchmark || data.benchmark === "AUTO";
    let globalBenchmark = data.benchmark;
    if (autoDetect && data.tickers.length > 0) {
      // Use the first ticker to determine a reasonable global default
      const firstTicker = data.tickers[0];
      const firstMap = histMap.get(firstTicker);
      if (firstMap) {
        const isBa = firstTicker.endsWith(".BA");
        const found = findBestBenchmark(firstMap, histMap, isBa, firstTicker);
        if (found) globalBenchmark = found;
      }
    }

    const assets: StrategyAsset[] = [];
    for (const ticker of data.tickers) {
      const tickerMap = histMap.get(ticker);
      if (!tickerMap || tickerMap.size < 30) continue;

      // Per-asset benchmark selection (Paso 3)
      const isBaTicker = ticker.endsWith(".BA");
      const effectiveBenchmark = autoDetect
        ? (findBestBenchmark(tickerMap, histMap, isBaTicker, ticker) ?? globalBenchmark)
        : globalBenchmark;

      const ols = runLinregress(tickerMap, effectiveBenchmark, histMap);
      if (!ols) continue;

      const rollingBetas = computeRollingBetas(tickerMap, effectiveBenchmark, histMap, data.rollingBetaWindow);
      const betaVol = rollingBetas.length > 0
        ? round4(Math.sqrt(
            rollingBetas.reduce((s, b) => s + (b - rollingBetas.reduce((a, b2) => a + b2, 0) / rollingBetas.length) ** 2, 0) /
            rollingBetas.length,
          ))
        : null;

      //  Labadie §3.2: Calcular Hurst exponent y p-variance 
      const prices = Array.from(tickerMap.values()).sort();
      const returns = prices.length > 1 ? prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]) : [];
      const hurstExponent = prices.length >= 100 ? computeHurst(prices) : undefined;
      const impliedP = hurstExponent != null && hurstExponent > 0
        ? Math.min(10, Math.max(1.1, 1 / hurstExponent)) : undefined;
      const pVariance = returns.length >= 20 ? computePVariance(returns, 2) : undefined;

      const strategyType = classify(ols.beta, ols.alpha, betaVol, ols.rSquared, ols.pValue, ols.pValue, hurstExponent);
      const conf = computeConfidence(ols.observations, ols.pValue, ols.pValue);

      assets.push({
        ticker,
        ...ols,
        rollingBetas,
        betaVolatility: betaVol,
        strategy: strategyType,
        strategyLabel: strategyName[strategyType],
        pValue: ols.pValue,
        bestBenchmark: effectiveBenchmark,
        classificationConfidence: conf,
        //  Labadie §3.2 
        hurstExponent,
        impliedP,
        pVariance,
      });
    }

    return { assets, benchmark: globalBenchmark, timestamp: new Date().toISOString() };
  });
