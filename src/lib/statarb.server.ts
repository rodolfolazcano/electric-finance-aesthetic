// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { analyzePair, runBacktest } from "./statarb.math";
import type {
  PairAnalysisResult,
  BacktestGridResult,
  PairConfig,
  BacktestConfig,
  DataInterval,
} from "./statarb.types";
import { getHistory } from "./history-cache.server";

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try { _yf = typeof YF === "function" ? new YF() : YF; } catch { _yf = YF; }
  try { _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]); } catch { }
  return _yf;
}

const MAX_INTRADAY_DAYS: Record<string, number> = {
  "1m": 7, "5m": 60, "15m": 60, "30m": 60, "1h": 730, "1d": 9999,
};

async function fetchHistoryYahoo(
  ticker: string,
  days: number,
  interval: DataInterval = "1d",
): Promise<{ date: string; close: number }[]> {
  // Use unified cache for daily data
  if (interval === "1d") {
    try {
      const data = await getHistory(ticker, days);
      if (data.length > 0) return data;
      // Fallback to .BA suffix
      if (!ticker.endsWith(".BA") && !ticker.includes(":")) {
        const baData = await getHistory(ticker + ".BA", days);
        if (baData.length > 0) return baData;
      }
    } catch { /* fall through to direct fetch */ }
  }
  // Direct yahoo-finance2 for intraday intervals
  const yf = await getYF();
  const maxDays = MAX_INTRADAY_DAYS[interval] ?? 9999;
  const actualDays = Math.min(days, maxDays);
  const period2 = new Date();
  const period1 = new Date(Date.now() - actualDays * 24 * 60 * 60 * 1000);
  const tryFetch = async (t: string): Promise<{ date: string; close: number }[]> => {
    try {
      const rows = await yf.chart(t, { period1, period2, interval });
      const quotes: Array<{ date?: Date | null; close?: number | null }> = rows?.quotes ?? [];
      return quotes
        .filter((q) => q.date != null && q.close != null)
        .map((q) => {
          const d = (q.date as Date).toISOString();
          const dateStr = interval === "1d" ? d.slice(0, 10) : d;
          return { date: dateStr, close: q.close as number };
        });
    } catch { return []; }
  };
  const result = await tryFetch(ticker);
  if (result.length === 0 && !ticker.endsWith(".BA") && !ticker.includes(":")) {
    const baTicker = ticker + ".BA";
    const baResult = await tryFetch(baTicker);
    if (baResult.length > 0) return baResult;
  }
  return result;
}

async function fetchHistoryIOLStatArb(
  ticker: string,
  days: number,
  token: string,
  mercado = "BCBA",
): Promise<{ date: string; close: number }[]> {
  try {
    const cleanTicker = ticker.replace(/\.BA$/i, "");
    const hoy = new Date();
    const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const fd = desde.toISOString().split("T")[0];
    const fh = hoy.toISOString().split("T")[0];
    const url = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${cleanTicker}/Cotizacion/seriehistorica/${fd}/${fh}/SinAjustar`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`IOL fetch error for ${cleanTicker}: ${res.status} ${body}`);
      return [];
    }
    const data: Array<{ fecha: string; cierre: number }> = await res.json();
    return data
      .filter((r) => r.fecha && r.cierre > 0)
      .map((r) => ({ date: r.fecha, close: r.cierre }));
  } catch (e) {
    console.warn("IOL fetch exception:", e);
    return [];
  }
}

const SourceSchema = z.enum(["yahoo", "iol"]).optional().default("yahoo");

export const computePairAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        asset1: z.string().min(1),
        asset2: z.string().min(1),
        period: z.number().default(365),
        interval: z.enum(["1m", "5m", "15m", "30m", "1h", "1d"]).default("1d"),
        window: z.number().default(20),
        entryThresh: z.number().default(1.5),
        stopThresh: z.number().default(2.5),
        capitalPerPair: z.number().default(1),
        txCost: z.number().default(0.1),
        source: SourceSchema,
        token: z.string().nullable().optional().default(null),
        mercado: z.string().optional().default("BCBA"),
        //  Labadie params 
        executionAlgo: z.enum(["pairs", "tc", "is"]).optional().default("pairs"),
        pValue: z.number().min(1.1).max(4).optional().default(2),
        marketImpactGamma: z.number().min(0).max(1).optional().default(0.5),
        participationRate: z.number().min(0).max(0.5).optional().default(0.1),
        volatility: z.number().min(0).max(1).optional().default(0.2),
        usarVolumenReal: z.boolean().optional().default(false),
        volumeProfile: z.array(z.number()).optional(),
        targetStartPct: z.number().min(0).max(0.95).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<PairAnalysisResult> => {
    const fetchFn =
      data.source === "iol" && data.token
        ? (t: string) => fetchHistoryIOLStatArb(t, data.period + 60, data.token!, data.mercado)
        : (t: string) => fetchHistoryYahoo(t, data.period + 60, data.interval);
    const [hist1, hist2] = await Promise.all([fetchFn(data.asset1), fetchFn(data.asset2)]);
    // Gap 2: perfil real si se pide
    let volumeProfile: number[] | undefined = (data as any).volumeProfile;
    if (!volumeProfile && (data as any).usarVolumenReal && data.source !== "iol") {
      try {
        const { fetchVolumeProfile } = await import("./yahoo-http");
        volumeProfile = await fetchVolumeProfile(data.asset1, Math.min(hist1.length, 100));
      } catch { /* fallback uniforme lo maneja el motor */ }
    }

    if (hist1.length < 30 || hist2.length < 30) {
      throw new Error(
        `Datos insuficientes para ${data.asset1} (${hist1.length} pts) o ${data.asset2} (${hist2.length} pts) — intervalo ${data.interval} no disponible para este período`,
      );
    }

    const config: PairConfig = {
      asset1: data.asset1,
      asset2: data.asset2,
      period: data.period,
      interval: data.interval,
      window: data.window,
      entryThresh: data.entryThresh,
      stopThresh: data.stopThresh,
      capitalPerPair: data.capitalPerPair,
      txCost: data.txCost,
      executionAlgo: data.executionAlgo,
      pValue: data.pValue,
      marketImpactGamma: data.marketImpactGamma,
      participationRate: data.participationRate,
      volatility: data.volatility,
      volumeProfile,
      usarVolumenReal: (data as any).usarVolumenReal,
      targetStartPct: (data as any).targetStartPct,
    } as PairConfig;

    return analyzePair(hist1, hist2, config);
  });

export const computeBacktestGrid = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        asset1: z.string().min(1),
        asset2: z.string().min(1),
        period: z.number().default(365),
        interval: z.enum(["1m", "5m", "15m", "30m", "1h", "1d"]).default("1d"),
        window: z.number().default(20),
        capitalPerPair: z.number().default(1),
        txCost: z.number().default(0.1),
        insamplePct: z.number().default(70),
        aMin: z.number().default(0.5),
        aMax: z.number().default(3.0),
        aStep: z.number().default(0.25),
        bMin: z.number().default(1.0),
        bMax: z.number().default(4.0),
        bStep: z.number().default(0.25),
        metric: z.enum(["sharpe", "pnl", "winrate", "maxdd", "psharpe"]).default("sharpe"),
        source: SourceSchema,
        token: z.string().nullable().optional().default(null),
        mercado: z.string().optional().default("BCBA"),
        //  Labadie params 
        pValue: z.number().min(1.1).max(4).optional().default(2),
        marketImpactGamma: z.number().min(0).max(1).optional().default(0.5),
        participationRate: z.number().min(0).max(0.5).optional().default(0.1),
        executionAlgo: z.enum(["pairs", "tc", "is"]).optional().default("pairs"),
        usarVolumenReal: z.boolean().optional().default(false),
        volumeProfile: z.array(z.number()).optional(),
        targetStartPct: z.number().min(0).max(0.95).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BacktestGridResult> => {
    const fetchFn =
      data.source === "iol" && data.token
        ? (t: string) => fetchHistoryIOLStatArb(t, data.period + 60, data.token!, data.mercado)
        : (t: string) => fetchHistoryYahoo(t, data.period + 60, data.interval);
    const [hist1, hist2] = await Promise.all([fetchFn(data.asset1), fetchFn(data.asset2)]);
    if (!volumeProfile && (data as any).usarVolumenReal && data.source !== "iol") {
      try {
        const { fetchVolumeProfile } = await import("./yahoo-http");
        volumeProfile = await fetchVolumeProfile(data.asset1, Math.min(hist1.length, 100));
      } catch {}
    }

    if (hist1.length < 30 || hist2.length < 30) {
      throw new Error(
        `Datos insuficientes para ${data.asset1} (${hist1.length} pts) o ${data.asset2} (${hist2.length} pts) — intervalo ${data.interval} no disponible para este período`,
      );
    }

    const config: BacktestConfig = {
      asset1: data.asset1,
      asset2: data.asset2,
      period: data.period,
      interval: data.interval,
      window: data.window,
      capitalPerPair: data.capitalPerPair,
      txCost: data.txCost,
      insamplePct: data.insamplePct,
      aMin: data.aMin,
      aMax: data.aMax,
      aStep: data.aStep,
      bMin: data.bMin,
      bMax: data.bMax,
      bStep: data.bStep,
      metric: data.metric,
      pValue: data.pValue,
      marketImpactGamma: data.marketImpactGamma,
      participationRate: data.participationRate,
      executionAlgo: data.executionAlgo,
      volumeProfile,
      usarVolumenReal: (data as any).usarVolumenReal,
      targetStartPct: (data as any).targetStartPct,
    } as BacktestConfig;

    return runBacktest(hist1, hist2, config);
  });
