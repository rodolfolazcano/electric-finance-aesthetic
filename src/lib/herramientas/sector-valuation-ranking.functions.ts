// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { fetchYahooQuoteSummaryJson, fetchYahooChart } from "./yahoo-http";
import sectoresData from "./sectores.json";

const SECTOR_EXCLUDE = new Set(["No disponible"]);
const BATCH_SIZE = 5;
const PE_CAP = 200;

type SectorsDict = Record<string, Record<string, { ticker: string; nombre: string }[]>>;
const DICT = sectoresData as SectorsDict;

interface TickerFundamentals {
  ticker: string;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  marketCap: number | null;
  price: number | null;
  sector: string;
  industry: string;
}

interface TickerWithPercentile extends TickerFundamentals {
  pePercentile: number | null;
  peHistoryYears: number;
}

export interface SectorValuationRow {
  sector: string;
  avgTrailingPE: number | null;
  avgForwardPE: number | null;
  avgPEG: number | null;
  medianPEPercentile: number | null;
  tickerCount: number;
  validPECount: number;
  totalMarketCap: number | null;
}

async function fetchYahooQuote(symbol: string): Promise<{
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  marketCap: number | null;
  price: number | null;
}> {
  try {
    const res = await fetchYahooQuoteSummaryJson<any>(symbol, [
      "summaryDetail", "defaultKeyStatistics", "price", "financialData",
    ]);
    const r = res.json?.quoteSummary?.result?.[0];
    if (!r) return { trailingPE: null, forwardPE: null, pegRatio: null, marketCap: null, price: null };
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const pr = r.price ?? {};
    const fd = r.financialData ?? {};
    const trailingPE = sd.trailingPE?.raw ?? ks.trailingPE?.raw ?? null;
    const forwardPE = sd.forwardPE?.raw ?? ks.forwardPE?.raw ?? null;
    const pegRatio = ks.pegRatio?.raw ?? null;
    const marketCap = pr.marketCap?.raw ?? null;
    const price = fd.currentPrice?.raw ?? pr.regularMarketPrice?.raw ?? null;
    return { trailingPE, forwardPE, pegRatio, marketCap, price };
  } catch {
    return { trailingPE: null, forwardPE: null, pegRatio: null, marketCap: null, price: null };
  }
}

function computePEPercentile(
  closes: number[],
  currentPE: number,
): { percentile: number; years: number } {
  if (closes.length < 20 || !currentPE || currentPE <= 0) return { percentile: 50, years: 0 };
  const currentPrice = closes[closes.length - 1];
  if (!currentPrice || currentPrice <= 0) return { percentile: 50, years: 0 };
  const historicalPEs: number[] = [];
  for (const c of closes) {
    if (c && c > 0) {
      const histPE = currentPE * (currentPrice / c);
      if (histPE > 0 && histPE < PE_CAP) historicalPEs.push(histPE);
    }
  }
  if (historicalPEs.length < 10) return { percentile: 50, years: 0 };
  historicalPEs.sort((a, b) => a - b);
  let below = 0;
  for (const v of historicalPEs) { if (v <= currentPE) below++; else break; }
  const pct = (below / historicalPEs.length) * 100;
  return { percentile: Math.round(pct * 10) / 10, years: Math.round(closes.length / 252 * 10) / 10 };
}

export const getSectorValuationRanking = createServerFn({ method: "GET" }).handler(async (): Promise<{
  rows: SectorValuationRow[];
  totalTickers: number;
  generatedAt: string;
}> => {
  const tickerSet = new Map<string, { sector: string; industry: string }>();
  for (const [sector, industries] of Object.entries(DICT)) {
    if (SECTOR_EXCLUDE.has(sector)) continue;
    for (const [_industry, tickers] of Object.entries(industries)) {
      for (const t of tickers) {
        const key = t.ticker.toUpperCase();
        if (!tickerSet.has(key)) tickerSet.set(key, { sector, industry: _industry });
      }
    }
  }
  const allTickers = [...tickerSet.entries()];
  const fundamentals: TickerFundamentals[] = [];
  for (let i = 0; i < allTickers.length; i += BATCH_SIZE) {
    const batch = allTickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ([ticker, meta]) => {
        const f = await fetchYahooQuote(ticker);
        return { ticker, ...f, sector: meta.sector, industry: meta.industry };
      }),
    );
    fundamentals.push(...results);
  }
  const tickersWithPrices: TickerWithPercentile[] = [];
  for (let i = 0; i < fundamentals.length; i += BATCH_SIZE) {
    const batch = fundamentals.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (f) => {
        if (!f.trailingPE || f.trailingPE <= 0 || f.trailingPE > PE_CAP) {
          return { ...f, pePercentile: null, peHistoryYears: 0 };
        }
        try {
          const chart = await fetchYahooChart(f.ticker, "2y", "1wk");
          const quotes = chart?.quotes ?? [];
          const closes: number[] = quotes
            .map((q: any) => q.close as number)
            .filter((c: number | null): c is number => c != null && c > 0);
          if (closes.length < 10) {
            return { ...f, pePercentile: null, peHistoryYears: 0 };
          }
          const { percentile, years } = computePEPercentile(closes, f.trailingPE);
          return { ...f, pePercentile: percentile, peHistoryYears: years };
        } catch {
          return { ...f, pePercentile: null, peHistoryYears: 0 };
        }
      }),
    );
    tickersWithPrices.push(...results);
  }
  const sectorMap = new Map<string, TickerWithPercentile[]>();
  for (const t of tickersWithPrices) {
    if (!sectorMap.has(t.sector)) sectorMap.set(t.sector, []);
    sectorMap.get(t.sector)!.push(t);
  }
  const rows: SectorValuationRow[] = [];
  for (const [sector, tickers] of sectorMap) {
    const validPEs = tickers
      .map((t) => t.trailingPE)
      .filter((v): v is number => v != null && v > 0 && v < PE_CAP);
    const validForwardPEs = tickers
      .map((t) => t.forwardPE)
      .filter((v): v is number => v != null && v > 0 && v < PE_CAP);
    const validPEGs = tickers
      .map((t) => t.pegRatio)
      .filter((v): v is number => v != null && v > 0 && v < 50);
    const validPercentiles = tickers
      .map((t) => t.pePercentile)
      .filter((v): v is number => v != null);
    const mcaps = tickers
      .map((t) => t.marketCap)
      .filter((v): v is number => v != null && v > 0);
    const totalMcap = mcaps.length > 0 ? mcaps.reduce((s, v) => s + v, 0) : null;
    const avgPE = validPEs.length > 0
      ? Math.round((validPEs.reduce((s, v) => s + v, 0) / validPEs.length) * 100) / 100
      : null;
    const avgFPE = validForwardPEs.length > 0
      ? Math.round((validForwardPEs.reduce((s, v) => s + v, 0) / validForwardPEs.length) * 100) / 100
      : null;
    const avgPEG = validPEGs.length > 0
      ? Math.round((validPEGs.reduce((s, v) => s + v, 0) / validPEGs.length) * 100) / 100
      : null;
    const sortedPcts = [...validPercentiles].sort((a, b) => a - b);
    const medianPct = sortedPcts.length > 0
      ? sortedPcts[Math.floor(sortedPcts.length / 2)]
      : null;
    rows.push({
      sector,
      avgTrailingPE: avgPE,
      avgForwardPE: avgFPE,
      avgPEG,
      medianPEPercentile: medianPct,
      tickerCount: tickers.length,
      validPECount: validPEs.length,
      totalMarketCap: totalMcap,
    });
  }
  rows.sort((a, b) => {
    const pa = a.medianPEPercentile ?? 50;
    const pb = b.medianPEPercentile ?? 50;
    return pa - pb;
  });
  return { rows, totalTickers: tickersWithPrices.length, generatedAt: new Date().toISOString() };
});
