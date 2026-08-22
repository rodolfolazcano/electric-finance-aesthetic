/**
 * Factor Clustering Engine for Portafolio Manual.
 *
 * Para cada ticker del universo, calcula beta / correlation / R² / alpha
 * contra CADA UNO de los factores de FACTORS_MASTER_LIST (54+ factores),
 * usando inner join de fechas. Agrupa tickers por bestFactor.
 *
 * Cache: 24h por defecto (CLUSTER_CACHE_TTL_MS configurable).
 * Batch: procesa en chunks de 4 tickers para no saturar Yahoo.
 */

import { FACTORS_MASTER_LIST } from "./benchmarks-master";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { linregress, pearsonR, mean, std } from "./math/stats";
import { BYMA_HEDGE_TICKERS, CEDEARS_ARS_LIST, CEDEARS_USD_LIST, ETF_HEDGE_UNIVERSE } from "./capm-hedge.types";
import { getHistory } from "./history-cache.server";

/** Cuánto ms es válido un bestFactor antes de recalcular (24h) */
export const CLUSTER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Cache en memoria simple */
const clusterCache = new Map<string, { ts: number; data: any }>();

function getCached<T>(key: string): T | null {
  const entry = clusterCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CLUSTER_CACHE_TTL_MS) {
    clusterCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  clusterCache.set(key, { ts: Date.now(), data });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return out;
}

/**
 * Inner join de fechas entre dos series.
 * Retorna arrays de precios alineados (misma longitud, misma fecha).
 */
function alignPair(
  a: { date: string; close: number }[],
  b: { date: string; close: number }[],
): { a: number[]; b: number[] } {
  const datesA = new Map(a.map((r) => [r.date, r.close]));
  const datesB = new Map(b.map((r) => [r.date, r.close]));
  const common = [...datesA.keys()].filter((d) => datesB.has(d)).sort();
  return {
    a: common.map((d) => datesA.get(d)!),
    b: common.map((d) => datesB.get(d)!),
  };
}

// ─── Core: clusterEngine ──────────────────────────────────────────────

/**
 * Para un solo ticker: calcular fit contra todos los factores.
 * Retorna los fits ordenados por R² descendente (top = bestFactor).
 */
export function clusterEngine(
  ticker: string,
  tickerHist: { date: string; close: number }[],
  factorsHist: Record<string, { date: string; close: number }[]>,
  topN = 5,
): {
  bestFactor: string;
  bestFactorName: string;
  bestR2: number;
  bestBeta: number;
  bestAlpha: number;
  bestAlphaPValue: number;
  fits: Array<{
    factor: string;
    factorName: string;
    beta: number;
    correlation: number;
    r2: number;
    alpha: number;
    alphaPValue: number;
    observations: number;
  }>;
} {
  const factorKeys = Object.keys(FACTORS_MASTER_LIST);
  const fits: Array<{
    factor: string;
    factorName: string;
    beta: number;
    correlation: number;
    r2: number;
    alpha: number;
    alphaPValue: number;
    observations: number;
  }> = [];

  for (const fk of factorKeys) {
    const fh = factorsHist[fk];
    if (!fh || fh.length < 20) continue;

    const { a: tp, b: fp } = alignPair(tickerHist, fh);
    if (tp.length < 20) continue;

    const tr = dailyReturns(tp);
    const fr = dailyReturns(fp);
    if (tr.length < 20 || fr.length < 20) continue;

    const corr = pearsonR(tr, fr);
    const r2 = corr * corr; // R² = correlation² (univariado)
    const reg = linregress(fr, tr);
    const beta = reg.slope;
    const alpha = reg.intercept;
    const alphaPValue = reg.pValue;

    fits.push({
      factor: fk,
      factorName: FACTORS_MASTER_LIST[fk]?.name ?? fk,
      beta,
      correlation: corr,
      r2,
      alpha,
      alphaPValue,
      observations: tr.length,
    });
  }

  fits.sort((a, b) => b.r2 - a.r2);
  const best = fits[0];

  if (!best) {
    return {
      bestFactor: "",
      bestFactorName: "Sin factor",
      bestR2: 0,
      bestBeta: 0,
      bestAlpha: 0,
      bestAlphaPValue: 1,
      fits: [],
    };
  }

  return {
    bestFactor: best.factor,
    bestFactorName: FACTORS_MASTER_LIST[best.factor]?.name ?? best.factor,
    bestR2: best.r2,
    bestBeta: best.beta,
    bestAlpha: best.alpha,
    bestAlphaPValue: best.alphaPValue,
    fits: fits.slice(0, topN),
  };
}

// ─── Agrupar por bestFactor ──────────────────────────────────────────

export function groupClusters(
  results: Array<{ ticker: string; bestFactor: string; bestFactorName: string; bestR2: number }>,
): Array<{
  factor: string;
  factorName: string;
  tickers: string[];
  avgR2: number;
  size: number;
}> {
  const groups = new Map<string, { factorName: string; tickers: string[]; r2s: number[] }>();
  for (const r of results) {
    if (!r.bestFactor) continue;
    const g = groups.get(r.bestFactor) ?? { factorName: r.bestFactorName, tickers: [], r2s: [] };
    g.tickers.push(r.ticker);
    g.r2s.push(r.bestR2);
    groups.set(r.bestFactor, g);
  }
  return [...groups.entries()]
    .map(([factor, g]) => ({
      factor,
      factorName: g.factorName,
      tickers: g.tickers,
      avgR2: g.r2s.reduce((s, v) => s + v, 0) / (g.r2s.length || 1),
      size: g.tickers.length,
    }))
    .sort((a, b) => b.size - a.size);
}

// ─── Server function: batch clustering ────────────────────────────────

const clusterItemSchema = z.object({
  ticker: z.string().min(1).max(50),
});

export const computeClustersBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      tickers: z.array(clusterItemSchema).min(1).max(400),
      period: z.number().default(365),
      forceRefresh: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const cacheKey = `clusters:${data.tickers.map((t) => t.ticker).sort().join(",")}:${data.period}`;
    if (!data.forceRefresh) {
      const cached = getCached<any[]>(cacheKey);
      if (cached) return cached;
    }

    // 1. Fetch históricos de todos los factores
    const factorKeys = Object.keys(FACTORS_MASTER_LIST);
    const factorsHist: Record<string, { date: string; close: number }[]> = {};
    const bufferDays = data.period + 60;

    // Fetch factores en batches de 4
    const FACTOR_BATCH = 4;
    for (let i = 0; i < factorKeys.length; i += FACTOR_BATCH) {
      const slice = factorKeys.slice(i, i + FACTOR_BATCH);
      await Promise.all(
        slice.map(async (fk) => {
          try {
            const hist = await getHistory(fk, bufferDays);
            if (hist.length >= 20) factorsHist[fk] = hist;
          } catch { /* skip factor sin datos */ }
        }),
      );
    }

    // 2. Fetch históricos de los tickers en batches de 4
    const tickerHist: Record<string, { date: string; close: number }[]> = {};
    const TICKER_BATCH = 4;
    for (let i = 0; i < data.tickers.length; i += TICKER_BATCH) {
      const slice = data.tickers.slice(i, i + TICKER_BATCH);
      await Promise.all(
        slice.map(async (item) => {
          const t = item.ticker;
          try {
            const hist = await getHistory(t, bufferDays);
            if (hist.length >= 20) tickerHist[t] = hist;
          } catch { /* skip ticker sin datos */ }
        }),
      );
    }

    // 3. Para cada ticker, clusterEngine contra cada factor
    const results: Array<{
      ticker: string;
      bestFactor: string;
      bestFactorName: string;
      bestR2: number;
      bestBeta: number;
      bestAlpha: number;
      bestAlphaPValue: number;
      fits: Array<{
        factor: string;
        factorName: string;
        beta: number;
        correlation: number;
        r2: number;
        alpha: number;
        alphaPValue: number;
        observations: number;
      }>;
    }> = [];

    for (const item of data.tickers) {
      const t = item.ticker;
      const hist = tickerHist[t];
      if (!hist || hist.length < 20) {
        results.push({
          ticker: t,
          bestFactor: "",
          bestFactorName: "Sin datos",
          bestR2: 0,
          bestBeta: 0,
          bestAlpha: 0,
          bestAlphaPValue: 1,
          fits: [],
        });
        continue;
      }
      const cluster = clusterEngine(t, hist, factorsHist);
      results.push({ ticker: t, ...cluster });
    }

    setCache(cacheKey, results);
    return results;
  });

// ─── Full universe clustering ────────────────────────────────────────

const FULL_UNIVERSE_CACHE_KEY = "full_universe_clusters_v1";

/**
 * Retorna el listado completo de tickers del universo de cobertura
 * (BYMA + CEDEARs ARS/USD + ETFs) para correr el clustering una sola vez.
 */
function getFullUniverseTickers(): string[] {
  const all = new Set<string>();
  for (const t of BYMA_HEDGE_TICKERS) all.add(t);
  for (const t of CEDEARS_ARS_LIST) all.add(t);
  for (const t of CEDEARS_USD_LIST) all.add(t);
  for (const t of ETF_HEDGE_UNIVERSE) all.add(t);
  return [...all];
}

/**
 * Server function: clustering completo de TODO el universo (~400 tickers × 54 factores).
 * Cacheado 24h. Se ejecuta una sola vez y se reusa para cualquier portafolio.
 */
export const getFullUniverseClusters = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      forceRefresh: z.boolean().default(false),
      period: z.number().default(365),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!data.forceRefresh) {
      const cached = getCached<any[]>(FULL_UNIVERSE_CACHE_KEY);
      if (cached) return cached;
    }

    const tickers = getFullUniverseTickers();
    const batchSize = 30; // enviar en lotes para no saturar payload
    const allResults: any[] = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
      const slice = tickers.slice(i, i + batchSize).map((t) => ({ ticker: t }));
      const res = await computeClustersBatch({
        data: { tickers: slice, period: data.period, forceRefresh: data.forceRefresh },
      });
      allResults.push(...res);
    }

    setCache(FULL_UNIVERSE_CACHE_KEY, allResults);
    return allResults;
  });

/**
 * Busca en los clusters cacheados el bestFactor de un ticker.
 * Si no está en el caché, lo calcula individualmente.
 */
export async function getTickerCluster(
  ticker: string,
  period = 365,
): Promise<{
  bestFactor: string;
  bestFactorName: string;
  bestR2: number;
  bestBeta: number;
  bestAlpha: number;
  bestAlphaPValue: number;
} | null> {
  const cached = getCached<any[]>(FULL_UNIVERSE_CACHE_KEY);
  if (cached) {
    const found = cached.find((r: any) => r.ticker === ticker);
    if (found) return found;
  }

  // Calcular individualmente
  const res = await computeClustersBatch({ data: { tickers: [{ ticker }], period, forceRefresh: false } });
  return res[0] ?? null;
}


