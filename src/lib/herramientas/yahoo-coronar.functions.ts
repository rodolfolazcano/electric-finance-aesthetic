// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { yahooHeaders } from "./yahoo-http";
import { yahooChartCloses } from "./yahoo-chart";

//  Helpers estadísticos 

function returns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) r.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return r;
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const va = variance(a);
  const vb = variance(b);
  if (va === 0 || vb === 0) return 0;
  return covariance(a, b) / Math.sqrt(va * vb);
}

//  computeBeta 

export function computeBeta(
  asset: number[],
  spy: number[],
  merv: number[],
): { beta: number | null; r2: number | null; benchmark: string | null } {
  const ra = returns(asset);
  if (ra.length < 20) return { beta: null, r2: null, benchmark: null };
  const rs = returns(spy);
  const rm = returns(merv);
  const corrSpy = rs.length >= 20 ? correlation(ra, rs) : 0;
  const corrMerv = rm.length >= 20 ? correlation(ra, rm) : 0;
  const r2Spy = corrSpy ** 2;
  const r2Merv = corrMerv ** 2;
  const useSpy = r2Spy >= r2Merv;
  const bench = useSpy ? rs : rm;
  if (bench.length < 20) return { beta: null, r2: null, benchmark: useSpy ? "SPY" : "MERVAL" };
  const v = variance(bench);
  if (v === 0) return { beta: null, r2: null, benchmark: useSpy ? "SPY" : "MERVAL" };
  const beta = covariance(ra, bench) / v;
  return {
    beta,
    r2: useSpy ? r2Spy : r2Merv,
    benchmark: useSpy ? "SPY" : "MERVAL",
  };
}

//  yahooResolve 

interface YSearchQuote {
  symbol?: string;
  quoteType?: string;
}

interface YSearchResult {
  quotes?: YSearchQuote[];
}

export async function yahooResolve(query: string): Promise<string | null> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=3&newsCount=0`;
  try {
    const res = await fetch(url, { headers: yahooHeaders() });
    if (!res.ok) return null;
    const json = (await res.json()) as YSearchResult;
    const eq = json.quotes?.find(
      (q) => q.quoteType === "EQUITY" && q.symbol && !q.symbol.includes("."),
    );
    return eq?.symbol ?? json.quotes?.[0]?.symbol ?? null;
  } catch {
    return null;
  }
}

//  Sector ETF mapping 

const ETF_SECTOR: Record<string, string> = {
  Technology: "XLK",
  "Financial Services": "XLF",
  "Consumer Cyclical": "XLY",
  "Consumer Defensive": "XLP",
  Healthcare: "XLV",
  Energy: "XLE",
  Industrials: "XLI",
  "Basic Materials": "XLB",
  Utilities: "XLU",
  "Real Estate": "XLRE",
  "Communication Services": "XLC",
};

//  Yahoo quoteSummary helper 

export interface YFSnapshot {
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  freeCashflow: number | null;
  fcfYield: number | null;
  marketCap: number | null;
  enterpriseToEbitda: number | null;
  sector: string | null;
  industry: string | null;
  sectorKey: string | null;
  longName: string | null;
  shortName: string | null;
  recommendationMean: number | null;
  numberOfAnalystEstimates: number | null;
  targetMeanPrice: number | null;
  currentPrice: number | null;
  bookValue: number | null;
  sharesOutstanding: number | null;
  totalRevenue: number | null;
  ebitda: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  insiderPercentHeld: number | null;
  institutionPercentHeld: number | null;
  // Para outlook
  earningsGrowth0: number | null;
  revenueGrowth0: number | null;
  operatingCashflow: number | null;
  capitalExpenditures: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
}

export async function yahooQuoteSummary(symbol: string): Promise<YFSnapshot> {
  const modules = [
    "assetProfile",
    "summaryDetail",
    "financialData",
    "defaultKeyStatistics",
    "earnings",
    "earningsTrend",
    "recommendationTrend",
    "majorHoldersBreakdown",
    "institutionOwnership",
    "insiderTransactions",
    "price",
  ];
  const qs = await fetchYahooQuoteSummaryJsonSafe(symbol, modules);
  const ap = qs?.assetProfile ?? {};
  const sd = qs?.summaryDetail ?? {};
  const fd = qs?.financialData ?? {};
  const dks = qs?.defaultKeyStatistics ?? {};
  const mh = qs?.majorHoldersBreakdown ?? {};
  const io = qs?.institutionOwnership?.ownershipList ?? [];
  const pr = qs?.price ?? {};

  const sectorKey: string | null = ap?.sectorKey ?? fd?.sectorKey ?? null;
  return {
    trailingPE: sd?.trailingPE ?? fd?.trailingPE ?? null,
    forwardPE: sd?.forwardPE ?? fd?.forwardPE ?? null,
    priceToBook: sd?.priceToBook ?? fd?.priceToBook ?? null,
    debtToEquity: fd?.debtToEquity ?? null,
    returnOnEquity: fd?.returnOnEquity ?? null,
    revenueGrowth: fd?.revenueGrowth ?? null,
    earningsGrowth: fd?.earningsGrowth ?? null,
    freeCashflow: fd?.freeCashflow ?? dks?.freeCashflow ?? null,
    fcfYield: dks?.freeCashflowYield ?? null,
    marketCap: sd?.marketCap ?? fd?.marketCap ?? pr?.marketCap ?? null,
    enterpriseToEbitda: fd?.enterpriseToEbitda ?? sd?.enterpriseToEbitda ?? null,
    sector: ap?.sector ?? fd?.sector ?? null,
    industry: ap?.industry ?? fd?.industry ?? null,
    sectorKey,
    longName: pr?.longName ?? ap?.longName ?? fd?.longName ?? null,
    shortName: pr?.shortName ?? ap?.shortName ?? null,
    recommendationMean: fd?.recommendationMean ?? null,
    numberOfAnalystEstimates: fd?.numberOfAnalystEstimates ?? null,
    targetMeanPrice: fd?.targetMeanPrice ?? null,
    currentPrice: pr?.regularMarketPrice ?? fd?.currentPrice ?? null,
    bookValue: sd?.bookValue ?? null,
    sharesOutstanding: sd?.sharesOutstanding ?? dks?.sharesOutstanding ?? null,
    totalRevenue: fd?.totalRevenue ?? null,
    ebitda: fd?.ebitda ?? null,
    totalDebt: fd?.totalDebt ?? null,
    totalCash: fd?.totalCash ?? null,
    insiderPercentHeld: mh?.insiderPercentHeld ?? (mh as any)?.insidersPercentHeld ?? null,
    institutionPercentHeld:
      mh?.institutionPercentHeld ?? (mh as any)?.institutionsPercentHeld ?? null,
    earningsGrowth0: fd?.earningsGrowth ?? null,
    revenueGrowth0: fd?.revenueGrowth ?? null,
    operatingCashflow: fd?.operatingCashflows ?? fd?.operatingCashflow ?? null,
    capitalExpenditures: fd?.capitalExpenditures ?? null,
    grossMargins: fd?.grossMargins ?? null,
    operatingMargins: fd?.operatingMargins ?? null,
    profitMargins: fd?.profitMargins ?? null,
  };
}

async function fetchYahooQuoteSummaryJsonSafe(
  symbol: string,
  modules: string[],
): Promise<any | null> {
  try {
    const { getYahooSession } = await import("./yahoo-http");
    const session = await getYahooSession(false);
    if (!session) return null;
    const params = new URLSearchParams({
      modules: modules.join(","),
      corsDomain: "finance.yahoo.com",
      formatted: "false",
      crumb: session.crumb,
    });
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.quoteSummary?.error) return null;
    return json?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

//  yahooFundamentalsBatch 

export const yahooFundamentalsBatch = createServerFn({ method: "POST" })
  .validator(
    z.object({
      items: z
        .array(
          z.object({
            iolSymbol: z.string().min(1).max(24),
            tipo: z.string().max(48),
            pais: z.string().max(8),
            descripcion: z.string().max(256).optional(),
          }),
        )
        .max(50),
    }),
  )
  .handler(async ({ data }) => {
    const resolveYf = async (
      sym: string,
      tipo: string,
      pais: string,
      desc?: string,
    ): Promise<string | null> => {
      const t = tipo.toLowerCase();
      if (
        t.includes("bono") ||
        t.includes("titulopublico") ||
        t.includes("titulospublicos") ||
        t.includes("obligacion") ||
        t.includes("caucion") ||
        t.includes("letra")
      ) {
        return null;
      }
      if (pais === "US") return sym;
      if (t.includes("cedear")) {
        if (desc) {
          const r = await yahooResolve(desc);
          if (r) return r;
        }
        return null;
      }
      return `${sym}.BA`;
    };

    const [spyCloses, mervCloses] = await Promise.all([
      yahooChartCloses("SPY", "3mo"),
      yahooChartCloses("^MERV", "3mo"),
    ]);

    const sectorEtfCache = new Map<string, number | null>();
    const sectorEtfPE = async (sectorKey: string | null): Promise<number | null> => {
      if (!sectorKey) return null;
      const etf = ETF_SECTOR[sectorKey];
      if (!etf) return null;
      if (sectorEtfCache.has(etf)) return sectorEtfCache.get(etf) ?? null;
      const f = await yahooQuoteSummary(etf);
      const pe = f.forwardPE ?? null;
      sectorEtfCache.set(etf, pe);
      return pe;
    };

    const out: Array<{
      iolSymbol: string;
      yfSymbol: string | null;
      fundamentals: YFSnapshot | null;
      sectorPerForward: number | null;
      beta: number | null;
      r2: number | null;
      benchmarkUsado: string | null;
    }> = [];

    const batch = 4;
    for (let i = 0; i < data.items.length; i += batch) {
      const slice = data.items.slice(i, i + batch);
      const r = await Promise.all(
        slice.map(async (it) => {
          const yfSymbol = await resolveYf(it.iolSymbol, it.tipo, it.pais, it.descripcion);
          if (!yfSymbol) {
            return {
              iolSymbol: it.iolSymbol,
              yfSymbol: null,
              fundamentals: null,
              sectorPerForward: null,
              beta: null,
              r2: null,
              benchmarkUsado: null,
            };
          }
          const [fund, closes3mo] = await Promise.all([
            yahooQuoteSummary(yfSymbol),
            yahooChartCloses(yfSymbol, "3mo"),
          ]);
          const sectorPE = await sectorEtfPE(fund.sectorKey);
          const { beta, r2, benchmark } = computeBeta(
            closes3mo.map((c) => c.close),
            spyCloses.map((c) => c.close),
            mervCloses.map((c) => c.close),
          );
          return {
            iolSymbol: it.iolSymbol,
            yfSymbol,
            fundamentals: fund,
            sectorPerForward: sectorPE,
            beta,
            r2,
            benchmarkUsado: benchmark,
          };
        }),
      );
      out.push(...r);
    }
    return { results: out };
  });
