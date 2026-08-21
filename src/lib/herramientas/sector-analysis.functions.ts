// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FACTORS_MASTER_LIST } from "./benchmarks-master";
import rawSectores from "./sectores.json";
import { getHistory } from "./history-cache.server";
import { getOrFetch } from "./cache/api-cache.server";
import { TTL_POR_TIPO } from "./cache/types";

const SECTORES = rawSectores as Record<
  string,
  Record<string, { ticker: string; nombre: string }[]>
>;

const REQ_TIMEOUT = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms)),
  ]);
}

async function fetchHistory(
  ticker: string,
  days: number,
): Promise<{ date: string; close: number }[]> {
  try {
    const data = await withTimeout(getHistory(ticker, days), REQ_TIMEOUT);
    return data;
  } catch {
    return [];
  }
}

const SECTOR_ANALYSIS_TTL_SECONDS = 2 * 3600; // 2h: el histórico ya es incremental (solo faltantes), esto evita recomputar matriz/percentiles

// Helper: extrae número de raw value de Yahoo (admite number directo u objeto {raw, fmt})
function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v != null && typeof v === "object") {
    const raw = (v as Record<string, unknown>).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

// Helper para extraer cualquier campo de una respuesta de quoteSummary (http directo yahoo-finance2)
function extractNum(obj: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    const n = num(v);
    if (n != null) return n;
  }
  return null;
}

async function fetchQuote(ticker: string): Promise<{
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  marketCap: number | null;
  price: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  fcfYield: number | null;
  earningsGrowth: number | null;
  upsideAnalistas: number | null;
  description: string | null;
}> {
  return getOrFetch(`quote:${ticker}:v2`, "yahoo", TTL_POR_TIPO.fundamentals, async () => {
    try {
      // Usar el mismo método HTTP que fundamental-af.functions.ts (yahoo-http)
      const { fetchYahooQuoteSummaryJson } = await import("./yahoo-http");
      const modulos = [
        "summaryDetail",
        "defaultKeyStatistics",
        "price",
        "financialData",
        "assetProfile",
      ];
      const response = await fetchYahooQuoteSummaryJson<{
        quoteSummary?: {
          result?: Array<Record<string, unknown>>;
          error?: { description?: string };
        };
      }>(ticker, modulos);
      if (!response.json?.quoteSummary?.result?.[0]) {
        throw new Error(response.json?.quoteSummary?.error?.description ?? "sin datos");
      }
      const q = response.json.quoteSummary.result[0];
      const sd = (q.summaryDetail ?? {}) as Record<string, unknown>;
      const ks = (q.defaultKeyStatistics ?? {}) as Record<string, unknown>;
      const pr = (q.price ?? {}) as Record<string, unknown>;
      const fd = (q.financialData ?? {}) as Record<string, unknown>;
      const ap = (q.assetProfile ?? {}) as Record<string, unknown>;

      const trailingPE = extractNum(sd, "trailingPE") ?? extractNum(ks, "trailingPE");
      const forwardPE = extractNum(sd, "forwardPE") ?? extractNum(ks, "forwardPE");
      const pegRatio = extractNum(ks, "pegRatio");
      const marketCap = extractNum(pr, "marketCap");
      const price =
        extractNum(fd, "currentPrice") ??
        extractNum(pr, "regularMarketPrice") ??
        extractNum(sd, "regularMarketPrice") ??
        extractNum(pr, "regularMarketPreviousClose");
      const returnOnEquity = extractNum(fd, "returnOnEquity");
      const revenueGrowth = extractNum(fd, "revenueGrowth");
      const profitMargin = extractNum(fd, "profitMargins");
      const freeCashflow = extractNum(fd, "freeCashflow");
      const fcfYield =
        freeCashflow != null && marketCap != null && marketCap > 0
          ? freeCashflow / marketCap
          : null;
      const earningsGrowth = extractNum(fd, "earningsGrowth");
      const targetMeanPrice = extractNum(fd, "targetMeanPrice");
      const upsideAnalistas =
        targetMeanPrice != null && price != null && price > 0
          ? ((targetMeanPrice - price) / price) * 100
          : null;
      const description = (ap?.longBusinessSummary as string | undefined) ?? null;

      return {
        trailingPE,
        forwardPE,
        pegRatio,
        marketCap,
        price,
        returnOnEquity,
        revenueGrowth,
        profitMargin,
        fcfYield,
        earningsGrowth,
        upsideAnalistas,
        description,
      };
    } catch {
      return {
        trailingPE: null,
        forwardPE: null,
        pegRatio: null,
        marketCap: null,
        price: null,
        returnOnEquity: null,
        revenueGrowth: null,
        profitMargin: null,
        fcfYield: null,
        earningsGrowth: null,
        upsideAnalistas: null,
        description: null,
      };
    }
  });
}

function calcularScoreFundamental(metrics: {
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  fcfYield: number | null;
  profitMargin: number | null;
  upsideAnalistas: number | null;
  earningsGrowth: number | null;
}): { score: number; maxPosible: number } {
  let earned = 0,
    maxPts = 0;
  if (metrics.returnOnEquity != null) {
    const roe = metrics.returnOnEquity * 100;
    earned += roe >= 20 ? 15 : roe >= 12 ? 10 : roe >= 5 ? 5 : 0;
    maxPts += 15;
  }
  if (metrics.revenueGrowth != null) {
    const g = metrics.revenueGrowth * 100;
    earned += g >= 15 ? 15 : g >= 8 ? 10 : g >= 0 ? 5 : 0;
    maxPts += 15;
  }
  if (metrics.fcfYield != null) {
    const fy = metrics.fcfYield * 100;
    earned += fy >= 6 ? 15 : fy >= 3 ? 10 : fy >= 0 ? 5 : 0;
    maxPts += 15;
  }
  if (metrics.profitMargin != null) {
    const pm = metrics.profitMargin * 100;
    earned += pm >= 20 ? 15 : pm >= 10 ? 10 : pm >= 0 ? 5 : 0;
    maxPts += 15;
  }
  if (metrics.upsideAnalistas != null) {
    earned +=
      metrics.upsideAnalistas >= 25
        ? 15
        : metrics.upsideAnalistas >= 15
          ? 10
          : metrics.upsideAnalistas >= 5
            ? 5
            : 0;
    maxPts += 15;
  }
  if (metrics.earningsGrowth != null) {
    const eg = metrics.earningsGrowth * 100;
    earned += eg >= 20 ? 10 : eg >= 10 ? 7 : eg >= 0 ? 3 : 0;
    maxPts += 10;
  }
  const score = maxPts > 0 ? Math.round((earned / maxPts) * 100) : 0;
  return { score, maxPosible: maxPts };
}

function buildReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

function computePairwise(
  x: number[],
  y: number[],
): { alpha: number; beta: number; correlation: number; rSquared: number; observations: number } {
  const n = Math.min(x.length, y.length);
  if (n < 10) return { alpha: 0, beta: 0, correlation: 0, rSquared: 0, observations: 0 };
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const beta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const alpha = (sumY - beta * sumX) / n;
  const yMean = sumY / n;
  const ssRes = y.reduce((a, yi, i) => a + (yi - (alpha + beta * x[i])) ** 2, 0);
  const ssTot = y.reduce((a, yi) => a + (yi - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const correlation = rSquared > 0 ? Math.sqrt(rSquared) * (beta >= 0 ? 1 : -1) : 0;
  return {
    alpha: Math.round(alpha * 10000) / 10000,
    beta: Math.round(beta * 10000) / 10000,
    correlation: Math.round(correlation * 10000) / 10000,
    rSquared: Math.round(rSquared * 10000) / 10000,
    observations: n,
  };
}

function calculatePercentiles(values: number[]): {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
} {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 };
  const idx = (p: number) => Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return {
    p5: sorted[idx(5)],
    p25: sorted[idx(25)],
    p50: sorted[idx(50)],
    p75: sorted[idx(75)],
    p95: sorted[idx(95)],
  };
}

export interface SectorTickerResult {
  ticker: string;
  nombre: string;
  price: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  marketCap: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  fcfYield: number | null;
  earningsGrowth: number | null;
  upsideAnalistas: number | null;
  fundScore: number | null;
  description: string | null;
  returns1Y: number[];
  returns2Y: number[];
  returns5Y: number[];
  returns10Y: number[];
  normPath1Y: { date: string; value: number }[];
  normPath2Y: { date: string; value: number }[];
  normPath5Y: { date: string; value: number }[];
  normPath10Y: { date: string; value: number }[];
  percentiles2Y: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
}

export interface SectorMatrixRow {
  ticker: string;
  values: { ticker: string; alpha: number; beta: number; correlation: number; rSquared: number }[];
}

export interface BenchmarkComparison {
  benchmark: string;
  benchmarkName: string;
  benchmarkPrice: number | null;
  correlation: number;
  beta: number;
  alpha: number;
  rSquared: number;
  observations: number;
  equalWeightReturn: number;
  benchmarkReturn: number;
}

export interface IndustryBestBenchmark {
  industry: string;
  tickers: string[];
  bestBenchmark: string;
  bestBenchmarkName: string;
  correlation: number;
  beta: number;
  alpha: number;
  rSquared: number;
  observations: number;
}

export interface TickerBestBenchmark {
  ticker: string;
  bestBenchmark: string;
  bestBenchmarkName: string;
  correlation: number;
  beta: number;
  alpha: number;
  rSquared: number;
  observations: number;
}

export interface SectorAnalysisResult {
  sector: string;
  industry: string;
  tickers: SectorTickerResult[];
  matrix: SectorMatrixRow[];
  avgPE: number | null;
  avgForwardPE: number | null;
  avgPEG: number | null;
  avgScore: number | null;
  benchmark: BenchmarkComparison | null;
  tickerBenchmarks: {
    ticker: string;
    correlation: number;
    beta: number;
    alpha: number;
    rSquared: number;
  }[];
  factorsTested: number;
  industryBestBenchmarks: IndustryBestBenchmark[];
  tickerBestBenchmarks: TickerBestBenchmark[];
  etfData: {
    ticker: string;
    name: string;
    price: number | null;
    trailingPE: number | null;
    forwardPE: number | null;
    pegRatio: number | null;
    marketCap: number | null;
  } | null;
  errors: string[];
}

export type SectorAnalysisMode = "tickers" | "etf" | "both";

// Sector → benchmark ETF mapping
const SECTOR_BENCHMARK_MAP: Record<string, { benchmark: string; name: string }> = {
  // USA — ETFs sectoriales
  Technology: { benchmark: "XLK", name: "Sector Tecnología" },
  "Communication Services": { benchmark: "XLC", name: "Sector Comunicación" },
  "Consumer Cyclical": { benchmark: "XLY", name: "Sector Consumo Discrecional" },
  "Consumer Defensive": { benchmark: "XLP", name: "Sector Consumo Básico" },
  Energy: { benchmark: "XLE", name: "Sector Energía" },
  "Financial Services": { benchmark: "XLF", name: "Sector Finanzas" },
  Healthcare: { benchmark: "XLV", name: "Sector Salud" },
  Industrials: { benchmark: "XLI", name: "Sector Industrial" },
  "Basic Materials": { benchmark: "XLB", name: "Sector Materiales" },
  Utilities: { benchmark: "XLU", name: "Sector Utilities" },
  "Real Estate": { benchmark: "XLRE", name: "Sector Inmobiliario" },
  // BCBA — contra MERVAL (mejor R² para activos argentinos)
  "Servicios financieros": { benchmark: "^MERV", name: "MERVAL" },
  "Servicios Financieros": { benchmark: "^MERV", name: "MERVAL" },
  "Acciones industriales": { benchmark: "^MERV", name: "MERVAL" },
  "Acciones Industriales": { benchmark: "^MERV", name: "MERVAL" },
  "Materiales Básicos": { benchmark: "^MERV", name: "MERVAL" },
  Tecnología: { benchmark: "^MERV", name: "MERVAL" },
  "Fondos y ETFs": { benchmark: "SPY", name: "S&P 500" },
  Energía: { benchmark: "^MERV", name: "MERVAL" },
  Utilidades: { benchmark: "^MERV", name: "MERVAL" },
  "Bienes raíces": { benchmark: "^MERV", name: "MERVAL" },
  "Bienes Raíces": { benchmark: "^MERV", name: "MERVAL" },
  "Servicios de comunicación": { benchmark: "^MERV", name: "MERVAL" },
  "Servicios de Comunicación": { benchmark: "^MERV", name: "MERVAL" },
  "Consumo cíclico": { benchmark: "^MERV", name: "MERVAL" },
  "Consumo Cíclico": { benchmark: "^MERV", name: "MERVAL" },
  "Defensiva del Consumidor": { benchmark: "^MERV", name: "MERVAL" },
  "Cuidado de la salud": { benchmark: "^MERV", name: "MERVAL" },
  "Cuidado de la Salud": { benchmark: "^MERV", name: "MERVAL" },
  "No disponible": { benchmark: "SPY", name: "S&P 500" },
  "Sin Clasificar": { benchmark: "SPY", name: "S&P 500" },
};

export const getSectorAnalysis = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      sector: string;
      industry: string;
      tickers: { ticker: string; nombre: string }[];
      mode?: string;
    }) =>
      z
        .object({
          sector: z.string().min(1),
          industry: z.string().min(1),
          tickers: z.array(z.object({ ticker: z.string(), nombre: z.string() })).min(1),
          mode: z.enum(["tickers", "etf", "both"]).optional().default("tickers"),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<SectorAnalysisResult> => {
    const cacheKey = `sector-analysis:${data.sector}:${data.industry}:${data.mode ?? "tickers"}`;
    return getOrFetch<SectorAnalysisResult>(
      cacheKey,
      "yahoo",
      SECTOR_ANALYSIS_TTL_SECONDS,
      async () => {
        const startTime = Date.now();
        const errors: string[] = [];
        const DAYS_1Y = 370;
        const DAYS_2Y = 730;
        const DAYS_5Y = 365 * 5 + 10;
        const DAYS_10Y = 365 * 10 + 20;
        const TIMEOUT_MS = 60_000; // 60s global máximo — retorna parcial, no lanza error
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
        }, TIMEOUT_MS);
        const isTimedOut = () => timedOut;

        const bmEntry = SECTOR_BENCHMARK_MAP[data.sector];
        const etfTicker = bmEntry?.benchmark ?? null;

        // Fetch ETF data if mode requires it
        let etfQuote: {
          trailingPE: number | null;
          forwardPE: number | null;
          pegRatio: number | null;
          marketCap: number | null;
          price: number | null;
        } | null = null;
        if ((data.mode === "etf" || data.mode === "both") && etfTicker) {
          try {
            etfQuote = await fetchQuote(etfTicker);
          } catch {
            errors.push(`No se pudo obtener datos del ETF ${etfTicker}`);
          }
        }

        // In ETF-only mode, return immediately with just ETF data
        if (data.mode === "etf") {
          return {
            sector: data.sector,
            industry: data.industry,
            tickers: [],
            matrix: [],
            avgPE: etfQuote?.trailingPE ?? null,
            avgForwardPE: etfQuote?.forwardPE ?? null,
            avgPEG: etfQuote?.pegRatio ?? null,
            avgScore: null,
            benchmark: null,
            tickerBenchmarks: [],
            factorsTested: 0,
            industryBestBenchmarks: [],
            tickerBestBenchmarks: [],
            etfData: etfTicker
              ? {
                  ticker: etfTicker,
                  name: bmEntry?.name ?? etfTicker,
                  price: etfQuote?.price ?? null,
                  trailingPE: etfQuote?.trailingPE ?? null,
                  forwardPE: etfQuote?.forwardPE ?? null,
                  pegRatio: etfQuote?.pegRatio ?? null,
                  marketCap: etfQuote?.marketCap ?? null,
                }
              : null,
            errors,
          };
        }

        const tickerResults: SectorTickerResult[] = [];
        const validTickers: string[] = [];
        const TICKER_BATCH = 25; // increased from 15 for faster processing
        for (let ti = 0; ti < data.tickers.length; ti += TICKER_BATCH) {
          if (isTimedOut()) break; // retorna parcial en vez de lanzar error
          const slice = data.tickers.slice(ti, ti + TICKER_BATCH);
          const batchResults = await Promise.allSettled(
            slice.map(async (t) => {
              // Usar 2Y para histórico — es suficiente para 1Y y 2Y de returns
              const fullHist = await fetchHistory(t.ticker, DAYS_2Y);
              if (fullHist.length < 20) return null;
              const cutoff1Y = Date.now() - DAYS_1Y * 24 * 60 * 60 * 1000;
              const cutoff2Y = Date.now() - DAYS_2Y * 24 * 60 * 60 * 1000;
              const cutoff5Y = Date.now() - DAYS_5Y * 24 * 60 * 60 * 1000;
              const hist1Y = fullHist.filter((h) => new Date(h.date).getTime() >= cutoff1Y);
              const hist2Y = fullHist.filter((h) => new Date(h.date).getTime() >= cutoff2Y);
              const hist5Y = fullHist.filter((h) => new Date(h.date).getTime() >= cutoff5Y);
              const [quote] = await Promise.all([
                withTimeout(fetchQuote(t.ticker), REQ_TIMEOUT).catch(() => ({
                  trailingPE: null,
                  forwardPE: null,
                  pegRatio: null,
                  marketCap: null,
                  price: null,
                  returnOnEquity: null,
                  revenueGrowth: null,
                  profitMargin: null,
                  fcfYield: null,
                  earningsGrowth: null,
                  upsideAnalistas: null,
                  description: null,
                })),
              ]);
              const returns2Y = buildReturns(hist2Y.map((h) => h.close));
              const percentiles2Y = calculatePercentiles(returns2Y);
              const normPath = (hist: { date: string; close: number }[]) => {
                if (hist.length < 2) return [];
                const closes = hist.map((h) => h.close);
                const min = Math.min(...closes);
                const max = Math.max(...closes);
                const range = max - min || 1;
                return hist.map((h) => ({
                  date: h.date,
                  value: Math.round(((h.close - min) / range) * 10000) / 100,
                }));
              };
              const fundScore = calcularScoreFundamental({
                returnOnEquity: quote.returnOnEquity,
                revenueGrowth: quote.revenueGrowth,
                fcfYield: quote.fcfYield,
                profitMargin: quote.profitMargin,
                upsideAnalistas: quote.upsideAnalistas,
                earningsGrowth: quote.earningsGrowth,
              });
              return {
                ticker: t.ticker,
                nombre: t.nombre,
                price: quote.price,
                trailingPE: quote.trailingPE,
                forwardPE: quote.forwardPE,
                pegRatio: quote.pegRatio,
                marketCap: quote.marketCap,
                returnOnEquity: quote.returnOnEquity,
                revenueGrowth: quote.revenueGrowth,
                profitMargin: quote.profitMargin,
                fcfYield: quote.fcfYield,
                earningsGrowth: quote.earningsGrowth,
                upsideAnalistas: quote.upsideAnalistas,
                fundScore: fundScore.maxPosible > 0 ? fundScore.score : null,
                description: quote.description,
                returns1Y: hist1Y.length > 1 ? buildReturns(hist1Y.map((h) => h.close)) : [],
                returns2Y,
                returns5Y: hist5Y.length > 1 ? buildReturns(hist5Y.map((h) => h.close)) : [],
                normPath1Y: normPath(hist1Y),
                normPath2Y: normPath(hist2Y),
                normPath5Y: normPath(hist5Y),
                percentiles2Y,
              } as SectorTickerResult;
            }),
          );
          for (const r of batchResults) {
            if (r.status === "fulfilled" && r.value) {
              tickerResults.push(r.value);
              validTickers.push(r.value.ticker);
            } else if (r.status === "rejected") {
              errors.push(r.reason?.message ?? "Error en ticker");
            }
          }
        }

        // Build pairwise matrix
        const matrix: SectorMatrixRow[] = [];
        for (let i = 0; i < validTickers.length; i++) {
          const a = tickerResults.find((r) => r.ticker === validTickers[i])!;
          const row: SectorMatrixRow = {
            ticker: validTickers[i],
            values: [],
          };
          for (let j = 0; j < validTickers.length; j++) {
            const b = tickerResults.find((r) => r.ticker === validTickers[j])!;
            if (i === j) {
              row.values.push({
                ticker: validTickers[j],
                alpha: 0,
                beta: 1,
                correlation: 1,
                rSquared: 1,
              });
            } else {
              const pares = buildPairwiseReturns(a.returns2Y, b.returns2Y);
              const pw = computePairwise(pares.x, pares.y);
              row.values.push({
                ticker: validTickers[j],
                ...pw,
              });
            }
          }
          matrix.push(row);
        }

        // ─── Best-fit benchmark per industry & per ticker ─────────────
        // (calculado primero para usar los mejores benchmarks en vez del default del sector)
        const elapsedMs = Date.now() - startTime;
        const BENCH_TIME_BUDGET = 20_000; // 20s max for benchmarks
        const industryBestBenchmarks: IndustryBestBenchmark[] = [];
        const tickerBestBenchmarks: TickerBestBenchmark[] = [];
        let factorsTestedCount = 0;
        let factorData: { ticker: string; name: string; returns: number[] }[] = [];

        if (validTickers.length >= 2 && elapsedMs < BENCH_TIME_BUDGET) {
          const secData = SECTORES[data.sector];
          const tickerToIndustry = new Map<string, string>();
          if (secData) {
            for (const [ind, tickers] of Object.entries(secData)) {
              for (const t of tickers) tickerToIndustry.set(t.ticker, ind);
            }
          }
          const factorEntries = Object.entries(FACTORS_MASTER_LIST);
          const BENCH_BATCH = 20;
          for (let b = 0; b < factorEntries.length; b += BENCH_BATCH) {
            if (Date.now() - startTime > BENCH_TIME_BUDGET || isTimedOut()) break;
            const batch = factorEntries.slice(b, b + BENCH_BATCH);
            const batchResults = await Promise.allSettled(
              batch.map(async ([ticker]) => {
                const hist = await fetchHistory(ticker, DAYS_2Y);
                if (hist.length < 20) return null;
                const prices = hist.map((h) => h.close);
                const returns = buildReturns(prices);
                if (returns.length < 10) return null;
                return { ticker, name: FACTORS_MASTER_LIST[ticker].name, returns };
              }),
            );
            for (const r of batchResults) {
              if (r.status === "fulfilled" && r.value) factorData.push(r.value);
            }
          }
          factorsTestedCount = factorData.length;

          const industryTickers = new Map<string, { ticker: string; returns: number[] }[]>();
          for (const tr of tickerResults) {
            const ind = tickerToIndustry.get(tr.ticker) ?? "Otras";
            if (!industryTickers.has(ind)) industryTickers.set(ind, []);
            industryTickers.get(ind)!.push({ ticker: tr.ticker, returns: tr.returns2Y });
          }
          for (const [ind, tickers] of industryTickers) {
            if (tickers.length < 2) continue;
            const minLen = Math.min(...tickers.map((t) => t.returns.length));
            if (minLen < 10) continue;
            const indAvg: number[] = [];
            for (let i = 0; i < minLen; i++) {
              let sum = 0;
              for (const t of tickers) sum += t.returns[t.returns.length - minLen + i];
              indAvg.push(sum / tickers.length);
            }
            let best: IndustryBestBenchmark | null = null;
            for (const f of factorData) {
              const n = Math.min(indAvg.length, f.returns.length);
              const pw = computePairwise(
                f.returns.slice(f.returns.length - n),
                indAvg.slice(indAvg.length - n),
              );
              if (!best || pw.rSquared > best.rSquared) {
                best = {
                  industry: ind,
                  tickers: tickers.map((t) => t.ticker),
                  bestBenchmark: f.ticker,
                  bestBenchmarkName: f.name,
                  ...pw,
                };
              }
            }
            if (best) industryBestBenchmarks.push(best);
          }
          for (const tr of tickerResults) {
            const rets = tr.returns2Y;
            if (rets.length < 10) continue;
            let best: TickerBestBenchmark | null = null;
            for (const f of factorData) {
              const n = Math.min(rets.length, f.returns.length);
              const pw = computePairwise(
                f.returns.slice(f.returns.length - n),
                rets.slice(rets.length - n),
              );
              if (!best || pw.rSquared > best.rSquared) {
                best = {
                  ticker: tr.ticker,
                  bestBenchmark: f.ticker,
                  bestBenchmarkName: f.name,
                  ...pw,
                };
              }
            }
            if (best) tickerBestBenchmarks.push(best);
          }
        }

        // Averages
        const pes = tickerResults
          .map((r) => r.trailingPE)
          .filter((v): v is number => v != null && v > 0 && v < 500);
        const fpes = tickerResults
          .map((r) => r.forwardPE)
          .filter((v): v is number => v != null && v > 0 && v < 500);
        const pegs = tickerResults
          .map((r) => r.pegRatio)
          .filter((v): v is number => v != null && v > 0 && v < 100);
        const scores = tickerResults.map((r) => r.fundScore).filter((v): v is number => v != null);

        clearTimeout(timer);
        return {
          sector: data.sector,
          industry: data.industry,
          tickers: tickerResults,
          matrix,
          avgPE:
            pes.length > 0
              ? Math.round((pes.reduce((s, v) => s + v, 0) / pes.length) * 100) / 100
              : null,
          avgForwardPE:
            fpes.length > 0
              ? Math.round((fpes.reduce((s, v) => s + v, 0) / fpes.length) * 100) / 100
              : null,
          avgPEG:
            pegs.length > 0
              ? Math.round((pegs.reduce((s, v) => s + v, 0) / pegs.length) * 100) / 100
              : null,
          avgScore:
            scores.length > 0
              ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
              : null,
          benchmark:
            industryBestBenchmarks.length > 0
              ? {
                  benchmark: industryBestBenchmarks[0].bestBenchmark,
                  benchmarkName: industryBestBenchmarks[0].bestBenchmarkName,
                  benchmarkPrice: null,
                  correlation: industryBestBenchmarks[0].correlation,
                  beta: industryBestBenchmarks[0].beta,
                  alpha: industryBestBenchmarks[0].alpha,
                  rSquared: industryBestBenchmarks[0].rSquared,
                  observations: industryBestBenchmarks[0].observations,
                  equalWeightReturn: 0,
                  benchmarkReturn: 0,
                }
              : null,
          tickerBenchmarks: tickerBestBenchmarks.map((t) => ({
            ticker: t.ticker,
            correlation: t.correlation,
            beta: t.beta,
            alpha: t.alpha,
            rSquared: t.rSquared,
          })),
          factorsTested: factorsTestedCount,
          industryBestBenchmarks,
          tickerBestBenchmarks,
          etfData:
            data.mode === "both" && etfTicker
              ? {
                  ticker: etfTicker,
                  name: bmEntry?.name ?? etfTicker,
                  price: etfQuote?.price ?? null,
                  trailingPE: etfQuote?.trailingPE ?? null,
                  forwardPE: etfQuote?.forwardPE ?? null,
                  pegRatio: etfQuote?.pegRatio ?? null,
                  marketCap: etfQuote?.marketCap ?? null,
                }
              : null,
          errors,
        };
      },
    );
  });

function buildPairwiseReturns(x: number[], y: number[]): { x: number[]; y: number[] } {
  const n = Math.min(x.length, y.length);
  return {
    x: x.slice(x.length - n),
    y: y.slice(y.length - n),
  };
}

// ─── ETF Fit Analysis ──────────────────────────────────────────────
// Compare the equal‑weight average of all tickers in a sector/industry
// against a comprehensive list of ETFs and rank by R².

export interface EtfFitResult {
  etf: string;
  name: string;
  correlation: number;
  beta: number;
  alpha: number;
  rSquared: number;
  observations: number;
}

const ALL_ETFS: Record<string, string> = {
  XLK: "Tecnología",
  XLF: "Finanzas",
  XLV: "Salud",
  XLE: "Energía",
  XLC: "Comunicación",
  XLY: "Consumo Discrecional",
  XLP: "Consumo Básico",
  XLI: "Industrial",
  XLB: "Materiales",
  XLRE: "Inmobiliario",
  XLU: "Utilities",
  XAR: "Aeroespacial y Defensa",
  SPY: "S&P 500",
  IVW: "Growth",
  IVE: "Value",
  IWM: "Small Caps",
  QUAL: "Calidad",
  MTUM: "Momentum",
  USMV: "Min. Volatilidad",
  SIZE: "Tamaño",
  QQQ: "NASDAQ 100",
  DIA: "Dow Jones",
  IEF: "Bonos 7-10Y",
  TLT: "Bonos 20+Y",
  HYG: "High Yield",
  LQD: "Inv. Grade",
  GLD: "Oro",
  SLV: "Plata",
  USO: "Petróleo",
  UNG: "Gas Natural",
  EEM: "Emergentes",
  EFA: "Desarrollados",
  EWW: "México",
  EWZ: "Brasil",
  FXI: "China",
  INDA: "India",
};

export const getSectorEtfFit = createServerFn({ method: "POST" })
  .inputValidator((input: { sector: string; tickers: { ticker: string; nombre: string }[] }) =>
    z
      .object({
        sector: z.string().min(1),
        tickers: z
          .array(z.object({ ticker: z.string(), nombre: z.string() }))
          .min(1)
          .max(50),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ etfResults: EtfFitResult[]; avgReturns: number[]; errors: string[] }> => {
      const cacheKey = `sector-etf-fit:${data.sector}:${data.tickers.length}`;
      return getOrFetch<{ etfResults: EtfFitResult[]; avgReturns: number[]; errors: string[] }>(
        cacheKey,
        "yahoo",
        SECTOR_ANALYSIS_TTL_SECONDS,
        async () => {
          const errors: string[] = [];
          const DAYS = 730; // 2 years

          // 1. Fetch historical data for all tickers (batch + Promise.all)
          const allHist: { ticker: string; closes: number[] }[] = [];
          const ETF_BATCH = 4;
          for (let i = 0; i < data.tickers.length; i += ETF_BATCH) {
            const slice = data.tickers.slice(i, i + ETF_BATCH);
            const batchResults = await Promise.allSettled(
              slice.map(async (t) => {
                const hist = await fetchHistory(t.ticker, DAYS);
                if (hist.length >= 20)
                  return { ticker: t.ticker, closes: hist.map((h) => h.close) };
                return null;
              }),
            );
            for (const r of batchResults) {
              if (r.status === "fulfilled" && r.value) allHist.push(r.value);
              else if (r.status === "rejected") errors.push(r.reason?.message ?? "Error");
            }
          }
          if (allHist.length < 2)
            return {
              etfResults: [],
              avgReturns: [],
              errors: ["No hay suficientes tickers con datos"],
            };

          // 2. Compute equal‑weight average returns (aligned by date index)
          const minLen = Math.min(...allHist.map((h) => h.closes.length));
          const avgReturns: number[] = [];
          for (let i = 1; i < minLen; i++) {
            let sum = 0,
              count = 0;
            for (const h of allHist) {
              const prev = h.closes[h.closes.length - minLen + i - 1];
              const cur = h.closes[h.closes.length - minLen + i];
              if (prev > 0) {
                sum += (cur - prev) / prev;
                count++;
              }
            }
            if (count > 0) avgReturns.push(sum / count);
          }
          if (avgReturns.length < 10)
            return { etfResults: [], avgReturns: [], errors: ["Período de retornos insuficiente"] };

          // 3. Fetch ETF data and compare (batch + Promise.all)
          const etfResults: EtfFitResult[] = [];
          const etfEntries = Object.entries(ALL_ETFS);
          const ETF_FETCH_BATCH = 8;
          for (let i = 0; i < etfEntries.length; i += ETF_FETCH_BATCH) {
            const slice = etfEntries.slice(i, i + ETF_FETCH_BATCH);
            const batchResults = await Promise.allSettled(
              slice.map(async ([etf, name]) => {
                const hist = await fetchHistory(etf, DAYS);
                if (hist.length < 20) return null;
                const closes = hist.map((h) => h.close);
                const etfReturns: number[] = [];
                for (let j = 1; j < closes.length; j++) {
                  if (closes[j - 1] > 0)
                    etfReturns.push((closes[j] - closes[j - 1]) / closes[j - 1]);
                }
                if (etfReturns.length < 10) return null;
                const n = Math.min(avgReturns.length, etfReturns.length);
                const x = etfReturns.slice(etfReturns.length - n);
                const y = avgReturns.slice(avgReturns.length - n);
                const pw = computePairwise(x, y);
                return { etf, name, ...pw } as EtfFitResult;
              }),
            );
            for (const r of batchResults) {
              if (r.status === "fulfilled" && r.value) etfResults.push(r.value);
            }
          }

          etfResults.sort((a, b) => b.rSquared - a.rSquared);
          return { etfResults, avgReturns, errors };
        },
      );
    },
  );
