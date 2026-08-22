import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import cedearsData from "@/data/cedears-universe.json";

const CEDEARS_MAP = cedearsData as { ARS: string[]; USD: string[] };

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v !== null && v !== undefined && typeof v === "object") {
    const raw = (v as Record<string, unknown>).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

export interface PortfolioFundOptResult {
  ticker: string;
  usdTicker: string | null;
  fundScore: number | null;
  semaforoRec: string | null;
  sector: string | null;
  price: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  beta: number | null;
  roe: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  fcfYield: number | null;
  upside: number | null;
}

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try { _yf = typeof YF === "function" ? new YF() : YF; } catch { _yf = YF; }
  try { _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]); } catch { /* noop */ }
  return _yf;
}

function findUsdCedear(ticker: string): string | null {
  const upper = ticker.toUpperCase();
  // Check if it's already a US ticker by seeing if there's a -D variant
  const dSuffix = upper + "D";
  if (CEDEARS_MAP.USD.includes(dSuffix)) return dSuffix;
  // If it's a .BA ticker, check the base
  const base = upper.replace(/\.BA$/, "");
  const dBase = base + "D";
  if (CEDEARS_MAP.USD.includes(dBase)) return dBase;
  // Direct check against ARS list
  if (CEDEARS_MAP.ARS.includes(upper)) return null;
  return null;
}

export async function fetchFundamentals(ticker: string): Promise<{
  price: number | null; trailingPE: number | null; forwardPE: number | null;
  pegRatio: number | null; beta: number | null; roe: number | null;
  revenueGrowth: number | null; profitMargin: number | null;
  fcfYield: number | null; upside: number | null;
  sector: string | null;
}> {
  try {
    const yf = await getYF();
    const q = await yf.quoteSummary(ticker, {
      modules: ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "price"],
    });
    const sd = q.summaryDetail ?? {};
    const ks = q.defaultKeyStatistics ?? {};
    const fd = q.financialData ?? {};
    const ap = q.assetProfile ?? {};
    const pr = q.price ?? {};
    const priceN = num(fd.currentPrice) ?? num(sd.regularMarketPrice) ?? num(pr.regularMarketPrice);
    const marketCapN = num(ks.marketCap) ?? num(sd.marketCap) ?? num(pr.marketCap);
    const fcfN = num(fd.freeCashflow);
    const targetMeanN = num(fd.targetMeanPrice);
    const trailingPEN = num(sd.trailingPE) ?? num(ks.trailingPE);
    const forwardPEN = num(sd.forwardPE) ?? num(ks.forwardPE);
    const pegN = num(ks.pegRatio);
    const betaN = num(ks.beta) ?? num(sd.beta);
    const roeN = num(fd.returnOnEquity);
    const revGN = num(fd.revenueGrowth);
    const marginN = num(fd.profitMargins);
    return {
      price: priceN,
      trailingPE: trailingPEN,
      forwardPE: forwardPEN,
      pegRatio: pegN,
      beta: betaN,
      roe: roeN,
      revenueGrowth: revGN,
      profitMargin: marginN,
      fcfYield: fcfN != null && marketCapN != null && marketCapN > 0 ? fcfN / marketCapN : null,
      upside: targetMeanN != null && priceN != null && priceN > 0 ? ((targetMeanN - priceN) / priceN) * 100 : null,
      sector: ap.sector ?? null,
    };
  } catch { return { price: null, trailingPE: null, forwardPE: null, pegRatio: null, beta: null, roe: null, revenueGrowth: null, profitMargin: null, fcfYield: null, upside: null, sector: null }; }
}

function computeFundScore(metrics: {
  roe: number | null; revenueGrowth: number | null;
  profitMargin: number | null; fcfYield: number | null;
  upside: number | null; trailingPE: number | null;
}): number | null {
  let pts = 0, maxPts = 0;
  if (metrics.roe != null) { const v = metrics.roe * 100; pts += v >= 20 ? 20 : v >= 12 ? 14 : v >= 5 ? 8 : 3; maxPts += 20; }
  if (metrics.revenueGrowth != null) { const v = metrics.revenueGrowth * 100; pts += v >= 20 ? 20 : v >= 10 ? 14 : v >= 5 ? 8 : 3; maxPts += 20; }
  if (metrics.profitMargin != null) { const v = metrics.profitMargin * 100; pts += v >= 20 ? 20 : v >= 10 ? 14 : v >= 5 ? 8 : 3; maxPts += 20; }
  if (metrics.fcfYield != null) { const v = metrics.fcfYield * 100; pts += v >= 6 ? 15 : v >= 3 ? 10 : v >= 0 ? 5 : 0; maxPts += 15; }
  if (metrics.upside != null) { pts += metrics.upside >= 25 ? 15 : metrics.upside >= 10 ? 10 : metrics.upside >= 0 ? 5 : 0; maxPts += 15; }
  if (metrics.trailingPE != null && metrics.trailingPE > 0) { pts += metrics.trailingPE < 15 ? 10 : metrics.trailingPE < 25 ? 6 : metrics.trailingPE < 40 ? 3 : 0; maxPts += 10; }
  return maxPts > 0 ? Math.round((pts / maxPts) * 100) : null;
}

export const getPortfolioFundamentalResults = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ tickers: z.array(z.string().min(1)).min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ results: PortfolioFundOptResult[] }> => {
    const results: PortfolioFundOptResult[] = [];
    for (const ticker of data.tickers) {
      const f = await fetchFundamentals(ticker);
      const usdTicker = findUsdCedear(ticker);
      const score = computeFundScore(f);
      let rec: string | null = null;
      if (score != null) { rec = score >= 80 ? "BUY" : score >= 40 ? "HOLD" : "SELL"; }
      results.push({ ticker, usdTicker, fundScore: score, semaforoRec: rec, ...f });
    }
    return { results };
  });
