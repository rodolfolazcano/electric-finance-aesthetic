/** Batch para el panel de cliente + resolución CEDEAR + beta/R² contra
 *  SPY/MERVAL. Reutiliza `yahoo-http` y las estadísticas de `stats.ts`. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchYahooChart, fetchYahooQuoteSummaryJson, fetchYahooSearch } from "./yahoo-http";
import { computeBeta } from "./stats";

export interface YahooFundamentals {
  symbol: string;
  sector: string | null;
  sectorKey: string | null;
  industry: string | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  enterpriseToEbitda: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  freeCashflow: number | null;
  marketCap: number | null;
  fcfYield: number | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;
  targetMeanPrice: number | null;
  currentPrice: number | null;
  upsideAnalistasPct: number | null;
  error: string | null;
}

interface YQuoteSummary {
  quoteSummary?: {
    result?: Array<{
      assetProfile?: { sector?: string; sectorKey?: string; industry?: string };
      summaryDetail?: { trailingPE?: number; forwardPE?: number; priceToBook?: number };
      financialData?: {
        currentPrice?: number;
        targetMeanPrice?: number;
        recommendationMean?: number;
        numberOfAnalystOpinions?: number;
        debtToEquity?: number;
        returnOnEquity?: number;
        revenueGrowth?: number;
        earningsGrowth?: number;
        freeCashflow?: number;
      };
      defaultKeyStatistics?: {
        forwardPE?: number;
        trailingPE?: number;
        priceToBook?: number;
        enterpriseToEbitda?: number;
      };
      price?: { marketCap?: number };
    }>;
    error?: { description?: string } | null;
  };
}

const ETF_SECTOR: Record<string, string> = {
  technology: "XLK",
  "financial-services": "XLF",
  healthcare: "XLV",
  energy: "XLE",
  "communication-services": "XLC",
  "consumer-cyclical": "XLY",
  "consumer-defensive": "XLP",
  industrials: "XLI",
  "basic-materials": "XLB",
  "real-estate": "XLRE",
  utilities: "XLU",
};

async function yahooQuoteSummary(symbol: string): Promise<YahooFundamentals> {
  const out: YahooFundamentals = {
    symbol,
    sector: null,
    sectorKey: null,
    industry: null,
    trailingPE: null,
    forwardPE: null,
    priceToBook: null,
    enterpriseToEbitda: null,
    debtToEquity: null,
    returnOnEquity: null,
    revenueGrowth: null,
    earningsGrowth: null,
    freeCashflow: null,
    marketCap: null,
    fcfYield: null,
    recommendationMean: null,
    numberOfAnalystOpinions: null,
    targetMeanPrice: null,
    currentPrice: null,
    upsideAnalistasPct: null,
    error: null,
  };
  const modules = ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "price"];
  try {
    const response = await fetchYahooQuoteSummaryJson<YQuoteSummary>(symbol, modules);
    if (!response.json) {
      out.error = `qs ${response.status}`;
      return out;
    }
    const r = response.json.quoteSummary?.result?.[0];
    if (!r) {
      out.error = response.json.quoteSummary?.error?.description ?? "no result";
      return out;
    }
    out.sector = r.assetProfile?.sector ?? null;
    out.sectorKey = r.assetProfile?.sectorKey ?? null;
    out.industry = r.assetProfile?.industry ?? null;
    out.trailingPE = r.summaryDetail?.trailingPE ?? r.defaultKeyStatistics?.trailingPE ?? null;
    out.forwardPE = r.summaryDetail?.forwardPE ?? r.defaultKeyStatistics?.forwardPE ?? null;
    out.priceToBook = r.summaryDetail?.priceToBook ?? r.defaultKeyStatistics?.priceToBook ?? null;
    out.enterpriseToEbitda = r.defaultKeyStatistics?.enterpriseToEbitda ?? null;
    out.debtToEquity = r.financialData?.debtToEquity ?? null;
    out.returnOnEquity = r.financialData?.returnOnEquity ?? null;
    out.revenueGrowth = r.financialData?.revenueGrowth ?? null;
    out.earningsGrowth = r.financialData?.earningsGrowth ?? null;
    out.freeCashflow = r.financialData?.freeCashflow ?? null;
    out.marketCap = r.price?.marketCap ?? null;
    if (out.freeCashflow != null && out.marketCap && out.marketCap > 0) {
      out.fcfYield = out.freeCashflow / out.marketCap;
    }
    out.recommendationMean = r.financialData?.recommendationMean ?? null;
    out.numberOfAnalystOpinions = r.financialData?.numberOfAnalystOpinions ?? null;
    out.targetMeanPrice = r.financialData?.targetMeanPrice ?? null;
    out.currentPrice = r.financialData?.currentPrice ?? null;
    if (out.targetMeanPrice && out.currentPrice && out.currentPrice > 0) {
      out.upsideAnalistasPct = ((out.targetMeanPrice - out.currentPrice) / out.currentPrice) * 100;
    }
    return out;
  } catch (e) {
    out.error = e instanceof Error ? e.message : "err";
    return out;
  }
}

async function yahooChartCloses(symbol: string, range = "1y"): Promise<number[]> {
  const chart = await fetchYahooChart(symbol, range, "1d");
  const closes = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  return closes.filter((v): v is number => typeof v === "number");
}

async function yahooResolve(query: string): Promise<string | null> {
  const res = await fetchYahooSearch(query);
  const quotes = res?.quotes ?? [];
  const eq = quotes.find(
    (q) => q.quoteType === "EQUITY" && q.symbol && !q.symbol?.includes("."),
  );
  return eq?.symbol ?? quotes[0]?.symbol ?? null;
}

export interface ItemCliente {
  iolSymbol: string;
  tipo: string;
  pais: string;
  descripcion?: string;
}

export const yahooFundamentalsBatch = createServerFn({ method: "POST" })
  .inputValidator((d: { items: ItemCliente[] }) =>
    z
      .object({
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
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      results: Array<{
        iolSymbol: string;
        yfSymbol: string | null;
        fundamentals: YahooFundamentals | null;
        sectorPerForward: number | null;
        beta: number | null;
        r2: number | null;
        benchmarkUsado: string | null;
      }>;
    }> => {
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
        fundamentals: YahooFundamentals | null;
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
            const nb = computeBeta(closes3mo, spyCloses, mervCloses);
            return {
              iolSymbol: it.iolSymbol,
              yfSymbol,
              fundamentals: fund,
              sectorPerForward: sectorPE,
              beta: nb.beta,
              r2: nb.r2,
              benchmarkUsado: nb.benchmark,
            };
          }),
        );
        out.push(...r);
      }
      return { results: out };
    },
  );
