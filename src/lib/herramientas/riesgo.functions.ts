// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchHistoryIOL } from "./iol-history";
import { getHistory } from "./history-cache.server";
import { computeHurst, computePVariance, impliedPFromReturns } from "./math/stats";
import { getRiskFreeRateSync } from "./risk-free-rate";

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try {
    _yf = typeof YF === "function" ? new YF() : YF;
  } catch {
    _yf = YF;
  }
  try {
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch {
    /* noop */
  }
  return _yf;
}

export const INTERVAL_MAP: Record<
  string,
  { label: string; maxDays: number; annualFactor: number }
> = {
  "1m": { label: "1 min", maxDays: 7, annualFactor: 252 * 390 },
  "5m": { label: "5 min", maxDays: 60, annualFactor: 252 * 78 },
  "15m": { label: "15 min", maxDays: 60, annualFactor: 252 * 26 },
  "30m": { label: "30 min", maxDays: 60, annualFactor: 252 * 13 },
  "1h": { label: "1 hour", maxDays: 730, annualFactor: 252 * 6.5 },
  "1d": { label: "1 day", maxDays: 99999, annualFactor: 252 },
  "1wk": { label: "1 week", maxDays: 99999, annualFactor: 52 },
  "1mo": { label: "1 month", maxDays: 99999, annualFactor: 12 },
};

const PERIOD_OPTIONS = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"];

export function periodToDays(period: string): number {
  const m: Record<string, number> = {
    "1d": 1,
    "5d": 5,
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "2y": 730,
    "5y": 1825,
    "10y": 3650,
    max: 99999,
  };
  return m[period] ?? 730;
}

async function fetchHistory(
  ticker: string,
  period: string,
  interval: string,
): Promise<{ date: string; close: number }[]> {
  // Use cached incremental fetch for daily/weekly/monthly data
  if (interval === "1d" || interval === "1wk" || interval === "1mo") {
    const days = periodToDays(period);
    const data = await getHistory(ticker, days);
    if (data.length >= 5) return data;
    // Fallback: try with .BA suffix for local AR stocks
    if (!ticker.endsWith(".BA") && !ticker.includes(":")) {
      const baData = await getHistory(ticker + ".BA", days);
      if (baData.length >= 5) return baData;
    }
    return data;
  }

  // Intraday: use direct API call (not cached)
  const yf = await getYF();
  const maxDays = INTERVAL_MAP[interval]?.maxDays ?? 99999;
  const days = Math.min(periodToDays(period), maxDays);
  const tries: string[] = ticker.endsWith(".BA") ? [ticker] : [ticker];
  for (const sym of tries) {
    try {
      const period2 = new Date();
      const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await yf.chart(sym, { period1, period2, interval });
      const quotes: Array<{ date?: Date | null; close?: number | null }> = rows?.quotes ?? [];
      if (quotes.length >= 5) {
        return quotes
          .filter((q) => q.date != null && q.close != null)
          .map((q) => ({
            date: (q.date as Date).toISOString(),
            close: q.close as number,
          }));
      }
    } catch {
      /* try next */
    }
  }
  // Fallback .BA
  if (!ticker.endsWith(".BA") && !ticker.includes(":")) {
    try {
      const period2 = new Date();
      const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await yf.chart(ticker + ".BA", { period1, period2, interval });
      const quotes: Array<{ date?: Date | null; close?: number | null }> = rows?.quotes ?? [];
      if (quotes.length >= 5) {
        return quotes
          .filter((q) => q.date != null && q.close != null)
          .map((q) => ({
            date: (q.date as Date).toISOString(),
            close: q.close as number,
          }));
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

function computeReturns(prices: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    rets.push(prices[i] / prices[i - 1] - 1);
  }
  return rets;
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[], mu: number): number {
  return Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / (arr.length - 1));
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return lo === hi ? sorted[lo] : sorted[lo] + (index - lo) * (sorted[hi] - sorted[lo]);
}

function skewness(arr: number[], mu: number, sigma: number): number {
  if (sigma === 0) return 0;
  const n = arr.length;
  return (arr.reduce((s, v) => s + ((v - mu) / sigma) ** 3, 0) * n) / ((n - 1) * (n - 2));
}

function excessKurtosis(arr: number[], mu: number, sigma: number): number {
  if (sigma === 0) return 0;
  const n = arr.length;
  const m4 = arr.reduce((s, v) => s + ((v - mu) / sigma) ** 4, 0) / n;
  return m4 - 3;
}

function mode(arr: number[], bins = 50): number {
  if (arr.length === 0) return 0;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const width = range / bins;
  const counts = new Array(bins).fill(0);
  for (const v of arr) {
    const idx = Math.min(Math.floor((v - min) / width), bins - 1);
    counts[idx]++;
  }
  const maxIdx = counts.indexOf(Math.max(...counts));
  return +(min + maxIdx * width + width / 2).toFixed(6);
}

function buildHistogram(
  arr: number[],
  bins = 50,
): { binStart: number; binEnd: number; count: number }[] {
  if (arr.length === 0) return [];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const width = range / bins;
  const counts = new Array(bins).fill(0);
  for (const v of arr) {
    const idx = Math.min(Math.floor((v - min) / width), bins - 1);
    counts[idx]++;
  }
  return counts.map((count, i) => ({
    binStart: +(min + i * width).toFixed(6),
    binEnd: +(min + (i + 1) * width).toFixed(6),
    count,
  }));
}

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
}

export interface PricePoint {
  date: string;
  close: number;
}

export const VALID_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"] as const;
export const VALID_PERIODS = [
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "max",
] as const;

export interface DistribStats {
  ticker: string;
  currentPrice: number;
  meanAnnual: number;
  volatilityAnnual: number;
  sharpeRatio: number;
  var95: number;
  skewness: number;
  kurtosis: number;
  jbStat: number;
  pValue: number;
  isNormal: boolean;
  maxLoss: number;
  expectedLoss: number;
  expectedGain: number;
  maxGain: number;
  mostProbable: number;
  count: number;
  histogram: HistogramBin[];
  priceSeries: PricePoint[];
  median: number;
  mode: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  priceHistogram: HistogramBin[];
  priceMode: number;
  priceMedian: number;
  priceMean: number;
  priceStd: number;
  pricePercentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  interval: string;
  period: string;
  annualFactor: number;
  // ─── Labadie §3.2: p-variance, Hurst, medidas de riesgo avanzadas ───
  hurstExponent?: number; // H: 0.5=random, <0.5=mean-rev, >0.5=trending
  pVariance?: number; // E[|r-μ|^p]^(1/p)
  pSharpe?: number; // Sharpe con p-variance
  pValueUsed?: number; // p usado (default 2)
  volatilityAnnualH?: number; // σ × 252^H (scaling self-similar)
  impliedP?: number; // p = 1/H (identidad §3.2)
  impliedPRegression?: number; // p ≈ 2.35 + 0.14×MI − 1.79×σ (eq.21)
  impliedPFromReturns?: number; // p estimado por regresión multi-escala §4.3
  cvar95?: number; // Conditional VaR (Expected Shortfall)
  maxDrawdown?: number; // Máxima caída desde pico histórico
}

export type RiesgoResult = DistribStats[];

export const getRiesgoAnalysis = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      tickers: string[];
      interval?: string;
      period?: string;
      source?: string;
      token?: string | null;
      refreshToken?: string | null;
      mercado?: string;
      pValue?: number;
    }) =>
      z
        .object({
          tickers: z.array(z.string().min(1).max(20)).min(1).max(20),
          interval: z.enum(VALID_INTERVALS).default("1d"),
          period: z.enum(VALID_PERIODS).default("2y"),
          source: z.string().optional().default("yahoo"),
          token: z.string().nullable().optional().default(null),
          refreshToken: z.string().nullable().optional().default(null),
          mercado: z.string().optional().default("BCBA"),
          pValue: z.number().min(1.1).max(4).optional().default(2),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<RiesgoResult> => {
    const {
      tickers,
      interval = "1d",
      period = "2y",
      source = "yahoo",
      token,
      refreshToken,
      mercado = "BCBA",
      pValue = 2,
    } = data;
    const intCfg = INTERVAL_MAP[interval] ?? INTERVAL_MAP["1d"];
    const factor = intCfg.annualFactor;
    const results: DistribStats[] = [];
    const isIOL = source === "iol" && token;
    const actualFactor = isIOL ? 252 : factor;

    for (const ticker of tickers) {
      let hist: { date: string; close: number }[];
      if (isIOL) {
        const iolDays = Math.min(periodToDays(period), 1825);
        hist = await fetchHistoryIOL(ticker, mercado, token!, refreshToken, iolDays).catch(
          () => [],
        );
      } else {
        hist = await fetchHistory(ticker, period, interval);
      }
      if (hist.length < 5) continue;

      const prices = hist.map((h) => h.close);
      const currentPrice = prices[prices.length - 1];
      const returns = computeReturns(prices);
      const n = returns.length;
      if (n < 3) continue;

      const mu = mean(returns);
      const sigma = stdDev(returns, mu);
      const meanAnnual = mu * actualFactor;
      const volatilityAnnual = sigma * Math.sqrt(actualFactor);
      const sharpeRatio = volatilityAnnual > 0 ? meanAnnual / volatilityAnnual : 0;
      const var95 = percentile(returns, 5);
      const sk = skewness(returns, mu, sigma);
      const kurt = excessKurtosis(returns, mu, sigma);
      const jbStat = (n / 6) * (sk ** 2 + kurt ** 2 / 4);
      const pValue = 1 - chi2Cdf(jbStat, 2);
      const isNormal = pValue > 0.05;

      const negReturns = returns.filter((r) => r < 0);
      const posReturns = returns.filter((r) => r > 0);

      const med = percentile(returns, 50);
      const mod = mode(returns);

      // Price-mode stats
      const priceMean = mean(prices);
      const priceStd = stdDev(prices, priceMean);
      const priceMed = percentile(prices, 50);
      const priceMod = mode(prices);

      // ─── Labadie §3.2: Hurst exponent ───
      const hurst = n >= 100 ? computeHurst(prices) : 0.5;
      const volatilityAnnualH = sigma * Math.pow(actualFactor, hurst); // scaling self-similar

      // ─── Labadie §3.2: p-variance ───
      const pVar = computePVariance(returns, pValue);
      const pStd = pVar > 0 ? Math.pow(pVar, 1 / pValue) : 0;
      const volatilityAnnual_p = pStd * Math.pow(actualFactor, 1 / pValue);
      const pSharpeRatio =
        volatilityAnnual_p > 0 ? (meanAnnual - getRiskFreeRateSync("USD")) / volatilityAnnual_p : 0;

      // ─── Labadie §3.2: implied p = 1/H ───
      const impliedPCalc = hurst > 0 ? Math.min(10, Math.max(1.1, 1 / hurst)) : 2;
      const impliedPFromReturnsVal =
        returns.length >= 100 ? impliedPFromReturns(returns) : undefined;

      // ─── Labadie §4 (eq.21): implied p regression ───
      const avgPrice = priceMean;
      const avgMI =
        prices.length > 0
          ? prices.reduce((s, v) => s + Math.abs(v - avgPrice), 0) / prices.length / avgPrice
          : 0.05;
      const impliedPReg = Math.min(
        10,
        Math.max(1.1, 2.35 + 0.14 * avgMI * 100 - 1.79 * sigma * Math.sqrt(actualFactor)),
      );

      // ─── CVaR (Expected Shortfall) al 95% — tail mean, not all negative returns ───
      const sortedRets = [...returns].sort((a, b) => a - b);
      const tailIdx = Math.max(1, Math.floor(sortedRets.length * 0.05));
      const tailReturns = sortedRets.slice(0, tailIdx);
      const cvar95Val =
        tailReturns.length > 0
          ? tailReturns.reduce((s, v) => s + v, 0) / tailReturns.length
          : var95;

      // ─── Max Drawdown ───
      let maxDrawdown = 0;
      let peak = prices[0];
      for (const p of prices) {
        if (p > peak) peak = p;
        const dd = (peak - p) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      results.push({
        ticker,
        currentPrice,
        meanAnnual,
        volatilityAnnual,
        sharpeRatio,
        var95,
        skewness: sk,
        kurtosis: kurt,
        jbStat,
        pValue,
        isNormal,
        maxLoss: currentPrice * var95,
        expectedLoss: negReturns.length > 0 ? currentPrice * mean(negReturns) : 0,
        expectedGain: posReturns.length > 0 ? currentPrice * mean(posReturns) : 0,
        maxGain: currentPrice * Math.max(...returns),
        mostProbable: currentPrice * med,
        count: n,
        histogram: buildHistogram(returns, Math.min(50, n)),
        priceSeries: hist,
        median: med,
        mode: mod,
        percentiles: {
          p5: percentile(returns, 5),
          p25: percentile(returns, 25),
          p50: med,
          p75: percentile(returns, 75),
          p95: percentile(returns, 95),
        },
        priceHistogram: buildHistogram(prices, Math.min(50, prices.length)),
        priceMode: priceMod,
        priceMedian: priceMed,
        priceMean,
        priceStd,
        pricePercentiles: {
          p5: percentile(prices, 5),
          p25: percentile(prices, 25),
          p50: priceMed,
          p75: percentile(prices, 75),
          p95: percentile(prices, 95),
        },
        interval,
        period,
        annualFactor: actualFactor,
        // ─── Labadie ───
        hurstExponent: hurst !== 0.5 ? hurst : undefined,
        pVariance: pVar > 0 ? pVar : undefined,
        pSharpe: pSharpeRatio,
        pValueUsed: pValue !== 2 ? pValue : undefined,
        volatilityAnnualH: volatilityAnnualH !== volatilityAnnual ? volatilityAnnualH : undefined,
        impliedP: impliedPCalc !== 2 ? impliedPCalc : undefined,
        impliedPRegression: impliedPReg !== 2 ? impliedPReg : undefined,
        impliedPFromReturns:
          impliedPFromReturnsVal !== undefined && impliedPFromReturnsVal !== 2
            ? impliedPFromReturnsVal
            : undefined,
        cvar95: cvar95Val,
        maxDrawdown,
      });
    }

    return results;
  });

function chi2Cdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return regGamma(k / 2, x / 2);
}

function regGamma(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  const g = gamma(a);
  return lowerIncGamma(a, x) / g;
}

function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const g = [
    1, 0.5772156649015329, -0.04200263503409524, 0.1665386113822915, -0.04219773455554433,
    -0.009621971527876973, 0.0072189432466631, -0.001165167591859065, -0.00021524167411495097,
    0.0001280502823881162, -0.00002013485478078824, -0.000001250493682137, 0.0000011330272319817,
    -0.0000002056338416976, 0.0000000061160951045, 0.0000000050020076445, -0.0000000011812745705,
    0.0000000001043426717, 0.0000000000077822634, -0.0000000000036968056,
  ];
  const xv = z + g.length - 1.5;
  let result = g[g.length - 1];
  for (let i = g.length - 2; i >= 0; i--) result = result * (z + i + 0.5) + g[i];
  return Math.sqrt(2 * Math.PI) * Math.pow(xv, z + 0.5) * Math.exp(-xv) * result;
}

function lowerIncGamma(a: number, x: number): number {
  if (x === 0) return 0;
  const serie = (a: number, x: number, n = 200): number => {
    let s = 1 / a;
    let t = 1 / a;
    for (let k = 1; k <= n; k++) {
      t *= x / (a + k);
      s += t;
      if (Math.abs(t) < 1e-12) break;
    }
    return s;
  };
  return Math.exp(-x + a * Math.log(x) - Math.log(gamma(a))) * serie(a, x);
}
