// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { linregress } from "./math/stats";
import { computeHurst, computePVariance } from "./math/stats";
import { AUTO_BENCHMARKS } from "./capm.functions";
import { getHistory } from "./history-cache.server";
import { getRiskFreeRateSync } from "./risk-free-rate";
import {
  covMatrix,
  logReturns,
  macd as macdFn,
  mean,
  optimize,
  rsi as rsiFn,
  sma,
  std,
  type Strategy,
} from "./optimizer";
import { calcularScoreTecnico } from "./semaforo-tecnico";
import { analizarSoportesResistencias } from "./soportes-resistencias";
import { generarInterpretacionSignal, generarCierreScore } from "./interpretaciones";
import { getExtendedSemaforoData, type SemaforoExtendido } from "./yahoo-extended.functions";
import type { ScoreTecnicoResult } from "./semaforo-tecnico";
import { getCached, setCache } from "./cache";
import { detectarTipoActivo, type InfoActivo } from "./detector-activo";
import { calcularScoreUnificado, type ScoreUnificadoResult } from "./scoring-unificado";

const tickerRe = /^[A-Z0-9.\-^]{1,10}$/;
const TickerSchema = z.string().trim().toUpperCase().regex(tickerRe);

/** Infiere la moneda cuando la API no la trae: BCBA (.BA) cotiza en ARS, el resto USD. */
function inferMoneda(symbol: string, apiCurrency?: string | null): "ARS" | "USD" {
  if (apiCurrency === "ARS" || apiCurrency === "USD") return apiCurrency;
  const s = symbol.trim().toUpperCase();
  return s.endsWith(".BA") ? "ARS" : "USD";
}

type RangoHistorico = "1M" | "3M" | "6M" | "1A" | "2A" | "5A";

function rangoADias(rango?: string): number {
  const map: Record<string, number> = {
    "1M": 30,
    "3M": 90,
    "6M": 182,
    "1A": 365,
    "2A": 730,
    "5A": 1825,
  };
  return rango ? (map[rango] ?? 730) : 730;
}

function rawNum(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (
    typeof val === "object" &&
    val != null &&
    "raw" in val &&
    typeof (val as any).raw === "number"
  )
    return (val as any).raw;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _yf: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  // v3: constructor; v2: default singleton with methods
  try {
    _yf = typeof YF === "function" ? new YF() : YF;
  } catch {
    _yf = YF;
  }
  // suppress survey notice
  try {
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch {
    /* noop */
  }
  return _yf;
}

async function fetchHistory(
  ticker: string,
  days = 365 * 2,
): Promise<{ date: string; close: number }[]> {
  const data = await getHistory(ticker, days);
  if (data.length >= 10) return data;
  // Fallback: try with .BA suffix for local AR stocks
  if (!ticker.endsWith(".BA") && !ticker.includes(":")) {
    const baData = await getHistory(ticker + ".BA", days);
    if (baData.length >= 10) return baData;
  }
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchQuote(ticker: string): Promise<any | null> {
  const cacheKey = `quote:${ticker}`;
  const cached = getCached<any>(cacheKey, 10 * 60 * 1000); // 10 min TTL for quotes
  if (cached) return cached;
  try {
    const yf = await getYF();
    const qs = await yf.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"],
    });
    // Fetch financial statements via fundamentalsTimeSeries (replaces deprecated incomeStatementHistory)
    try {
      const fts = await yf.fundamentalsTimeSeries(ticker, {
        period: "annual",
        types: ["incomeStatementHistory"],
      });
      if (fts?.result?.length > 0) {
        const rows = fts.result;
        const incomeRows = rows
          .filter((r: any) => r?.type === "incomeStatementHistory")
          .map((r: any) => {
            const obj: Record<string, any> = {};
            for (const key of Object.keys(r)) {
              if (key === "type" || key === "symbol") continue;
              const val = r[key];
              if (val && typeof val === "object" && "raw" in val) obj[key] = val.raw;
              else if (val != null && typeof val !== "object") obj[key] = val;
            }
            return obj;
          });
        if (incomeRows.length > 0) {
          qs.incomeStatementHistory = { incomeStatementHistory: incomeRows };
        }
      }
    } catch {
      /* fallback: income data not available */
    }

    try {
      const ftsQ = await yf.fundamentalsTimeSeries(ticker, {
        period: "quarterly",
        types: ["incomeStatementHistory"],
      });
      if (ftsQ?.result?.length > 0) {
        const rows = ftsQ.result;
        const incomeRowsQ = rows
          .filter((r: any) => r?.type === "incomeStatementHistory")
          .map((r: any) => {
            const obj: Record<string, any> = {};
            for (const key of Object.keys(r)) {
              if (key === "type" || key === "symbol") continue;
              const val = r[key];
              if (val && typeof val === "object" && "raw" in val) obj[key] = val.raw;
              else if (val != null && typeof val !== "object") obj[key] = val;
            }
            return obj;
          });
        if (incomeRowsQ.length > 0) {
          qs.incomeStatementHistoryQuarterly = { incomeStatementHistory: incomeRowsQ };
        }
      }
    } catch {
      /* fallback: quarterly income data not available */
    }

    setCache(cacheKey, qs);
    return qs;
  } catch {
    return null;
  }
}

//  PE Percentile helper (uses income statement history) 

interface PeHistoryPoint {
  year: number;
  pe: number;
}

function computePePercentileFromQuote(
  currentPe: number | null,
  quote: any,
  closes: number[],
  timestamps?: number[],
): { value: number | null; muestraInsuficiente: boolean } {
  if (currentPe == null || currentPe <= 0) return { value: null, muestraInsuficiente: true };

  const sharesOutstanding = rawNum(quote?.defaultKeyStatistics?.sharesOutstanding);
  const ish = quote?.incomeStatementHistory?.incomeStatementHistory as
    Record<string, any>[] | undefined;
  if (!sharesOutstanding || sharesOutstanding <= 0 || !ish || ish.length === 0)
    return { value: null, muestraInsuficiente: true };

  // Build timestamps from closes if not provided
  const ts: number[] = timestamps ?? [];
  const closesArr = closes;

  const peHistory: PeHistoryPoint[] = [];

  for (const row of ish) {
    const endDateStr = row?.endDate?.fmt as string | undefined;
    if (!endDateStr) continue;
    const endDate = new Date(endDateStr);
    const netIncome = (row?.netIncome as number) ?? (row?.netIncome?.raw as number) ?? null;
    if (netIncome == null || netIncome <= 0) continue;
    const eps = netIncome / sharesOutstanding;
    if (eps <= 0) continue;

    const endYear = endDate.getFullYear();
    // Find price near Dec 15 of that fiscal year
    const targetTs = new Date(endYear, 11, 15).getTime() / 1000;

    if (ts.length > 0) {
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < ts.length; i++) {
        const diff = Math.abs(ts[i] - targetTs);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const price = closesArr[bestIdx];
        const pe = price / eps;
        if (pe > 0 && pe < 500 && !peHistory.find((p) => p.year === endYear)) {
          peHistory.push({ year: endYear, pe: Math.round(pe * 10) / 10 });
        }
      }
    }
  }

  // Also try quarterly data for more years
  const ishQ = quote?.incomeStatementHistoryQuarterly?.incomeStatementHistory as
    Record<string, any>[] | undefined;
  const quarterRows = ishQ?.length ?? 0;
  if (ishQ && ishQ.length > 0 && ts.length > 0) {
    // Group quarterly data by fiscal year
    const yearNetIncome = new Map<number, number>();
    for (const row of ishQ) {
      const endDateStr = row?.endDate?.fmt as string | undefined;
      if (!endDateStr) continue;
      const endDate = new Date(endDateStr);
      const netIncome = rawNum(row?.netIncome);
      if (netIncome == null) continue;
      const yr = endDate.getFullYear();
      // Use TTM: sum last 4 quarters for each year-end
      yearNetIncome.set(yr, (yearNetIncome.get(yr) ?? 0) + netIncome);
    }

    for (const [yr, totalNi] of yearNetIncome) {
      if (totalNi <= 0 || peHistory.find((p) => p.year === yr)) continue;
      const eps = totalNi / sharesOutstanding;
      if (eps <= 0) continue;
      const targetTs = new Date(yr, 11, 15).getTime() / 1000;
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < ts.length; i++) {
        const diff = Math.abs(ts[i] - targetTs);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const price = closesArr[bestIdx];
        const pe = price / eps;
        if (pe > 0 && pe < 500) {
          peHistory.push({ year: yr, pe: Math.round(pe * 10) / 10 });
        }
      }
    }
  }

  if (peHistory.length < 2) return { value: null, muestraInsuficiente: true };

  const values = peHistory.map((p) => p.pe).sort((a, b) => a - b);
  const below = values.filter((v) => v <= currentPe).length;
  return {
    value: Math.round((below / values.length) * 100),
    muestraInsuficiente: quarterRows < 12,
  };
}

function computePePercentileReason(currentPe: number | null, quote: any): string {
  if (currentPe == null || currentPe <= 0) return "P/E no disponible";
  const sharesOutstanding = rawNum(quote?.defaultKeyStatistics?.sharesOutstanding);
  if (!sharesOutstanding || sharesOutstanding <= 0)
    return "Faltan datos de acciones en circulación";
  const ish = quote?.incomeStatementHistory?.incomeStatementHistory;
  if (!ish || (ish as any[]).length === 0) return "Sin historial de ganancias (income statement)";
  return "Historial insuficiente para percentil (< 2 años)";
}

// 
// Semáforo (ticker analysis)
// 

export interface SemaforoSignal {
  label: string;
  tone: "good" | "neutral" | "bad";
  lectura?: string;
  implicancia?: string;
}

export interface SemaforoResult {
  ticker: string;
  lastUpdated: string;
  dataSource: "yahoo" | "iol";
  esETF: boolean;
  name: string;
  sector: string | null;
  currency: string;
  price: number;
  change1d: number; // percent
  changePeriod: number | null; // percent change over entire history window
  sma50: number;
  sma200: number | null;
  low52: number;
  high52: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  pe: number | null;
  peg: number | null;
  pePercentile: number | null;
  pePercentileReason?: string;
  pePercentileMuestraInsuficiente?: boolean;
  pegPercentile: number | null;
  revGrowth: number | null;
  profitMargin: number | null;
  roe: number | null;
  marketCap: number | null;
  techScore: number;
  fundScore: number;
  totalScore: number;
  clasificacionJerarquica: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
  recommendation: "COMPRA" | "MANTENER" | "VENTA";
  light: "green" | "yellow" | "red";
  signals: SemaforoSignal[];
  history: { date: string; close: number }[];
  // Nuevos campos extendidos (opcionales, no rompen compatibilidad)
  scoreTecnicoDetalle?: ScoreTecnicoResult;
  interpretaciones?: SemaforoSignal[];
  cierreInterpretacion?: string;
  soportes?: { precio: number; fecha: string; vecesTocado: number; esEstimado?: boolean }[];
  resistencias?: { precio: number; fecha: string; vecesTocado: number; esEstimado?: boolean }[];
  distanciaSoporte?: number;
  distanciaResistencia?: number;
  extended?: SemaforoExtendido;
  /** Tipo de activo detectado */
  infoActivo?: InfoActivo;
  /** Score unificado técnico + fundamental */
  scoreUnificado?: ScoreUnificadoResult;
}

export const getSemaforo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ticker: TickerSchema, rango: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<SemaforoResult> => {
    const { ticker, rango } = data;
    const [hist, quote, extended] = await Promise.all([
      fetchHistory(ticker, rangoADias(rango)),
      fetchQuote(ticker),
      getExtendedSemaforoData({ data: { ticker } }).catch(() => undefined),
    ]);
    if (hist.length < 30) {
      throw new Error(`Datos insuficientes para ${ticker}`);
    }
    const closes = hist.map((h) => h.close);
    const current = closes[closes.length - 1];
    const prev = closes[closes.length - 2] ?? current;
    const change1d = ((current - prev) / prev) * 100;
    const sma50 = sma(closes, 50);
    const sma200 = closes.length >= 200 ? sma(closes, 200) : null;
    const rsiV = rsiFn(closes);
    const { macd: macdV, signal: macdS } = macdFn(closes);
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const win52 = hist.filter((h) => h.date >= cutoff).map((h) => h.close);
    const low52 = win52.length > 0 ? Math.min(...win52) : Math.min(...closes);
    const high52 = win52.length > 0 ? Math.max(...win52) : Math.max(...closes);

    const price = quote?.price;
    const sd = quote?.summaryDetail;
    const dks = quote?.defaultKeyStatistics;
    const fd = quote?.financialData;
    const ap = quote?.assetProfile;
    const quoteType = (price?.quoteType as string | undefined) ?? null;
    const esETF = quoteType === "ETF";

    const trailingPE = rawNum(sd?.trailingPE);
    const trailingEps = rawNum(dks?.trailingEps);
    const pe = trailingPE ?? (trailingEps && current ? current / trailingEps : null);
    const revGrowth = rawNum(fd?.revenueGrowth);
    const profitMargin = rawNum(fd?.profitMargins);
    const roe = rawNum(fd?.returnOnEquity);
    const marketCap = rawNum(price?.marketCap);
    const epsGrowth = rawNum(fd?.earningsGrowth);
    const peg = pe != null && epsGrowth != null && epsGrowth >= 0.01 ? pe / epsGrowth : null;
    const sharesOutstanding = rawNum(dks?.sharesOutstanding);
    const { value: pePercentile, muestraInsuficiente: pePercentileMuestraInsuficiente } =
      computePePercentileFromQuote(pe, quote, closes);
    const pePercentileReason =
      pePercentile != null ? undefined : computePePercentileReason(pe, quote);
    const changePeriod =
      hist.length >= 2 ? ((current - hist[0].close) / hist[0].close) * 100 : null;

    // --- Scoring técnico jerárquico (Parte 2) ---
    const sr = analizarSoportesResistencias(hist, 5, 0.02, high52, low52);
    const scoreTecnicoDetalle = calcularScoreTecnico({
      current,
      sma50,
      sma200,
      rsi: rsiV,
      macd: macdV,
      macdSignal: macdS,
      closes,
      sr,
    });

    // --- Signals con interpretaciones (Parte 3) ---
    const tendencia = scoreTecnicoDetalle.tendencia.direccion;
    const contexto = {
      tendencia,
      scoreTotal: scoreTecnicoDetalle.scoreFinal,
      sma50,
      sma200,
      current,
      pe,
      revGrowth,
      profitMargin,
      roe,
      closes,
      macdSignal: macdS,
    };

    const interpretaciones = [
      generarInterpretacionSignal("precio-sma50", current, contexto),
      generarInterpretacionSignal("cruce-medias", 0, contexto),
      generarInterpretacionSignal("rsi", rsiV, contexto),
      generarInterpretacionSignal("macd", macdV, contexto),
    ];
    if (pe) interpretaciones.push(generarInterpretacionSignal("pe", pe, contexto));
    if (revGrowth)
      interpretaciones.push(generarInterpretacionSignal("rev-growth", revGrowth, contexto));
    if (profitMargin)
      interpretaciones.push(generarInterpretacionSignal("profit-margin", profitMargin, contexto));
    if (roe) interpretaciones.push(generarInterpretacionSignal("roe", roe, contexto));

    // --- Score legado (mantenido para compatibilidad) ---
    const signals: SemaforoSignal[] = interpretaciones.map((s) => ({
      label: s.label,
      tone: s.tone,
      lectura: s.lectura,
      implicancia: s.implicancia,
    }));

    const tech = scoreTecnicoDetalle.scoreFinal;
    const fundScoreNum = (() => {
      let f = 0;
      if (typeof pe === "number" && pe > 0) {
        if (pe < 15) f += 2;
        else if (pe < 30) f += 1;
        else f -= 1;
      }
      if (revGrowth != null) {
        if (revGrowth > 0.15) f += 2;
        else if (revGrowth > 0) f += 1;
        else f -= 1;
      }
      if (profitMargin != null) {
        if (profitMargin > 0.2) f += 2;
        else if (profitMargin > 0.1) f += 1;
        else if (profitMargin <= 0) f -= 1;
      }
      if (roe != null) {
        if (roe > 0.15) f += 1;
        else if (roe <= 0) f -= 1;
      }
      return f;
    })();

    // Score técnico puro (sin componente fundamental)
    // totalScore = scoreTecnicoDetalle.scoreFinal (rango ~ -1.65 a +1.25)
    // clasificación desde semaforo-tecnico.ts:225 (5 niveles sobre scoreFinal)
    const scoreTecLegacy = Math.round(scoreTecnicoDetalle.scoreFinal);
    const total = +(scoreTecnicoDetalle.scoreFinal + ((fundScoreNum ?? 0) / 7) * 0.3).toFixed(3);
    const clasificacionJerarquica = scoreTecnicoDetalle.clasificacion;
    // 3-level (light) SE DERIVA de clasificacionJerarquica (no recalcula sobre totalScore):
    //   COMPRA / COMPRA CON CAUTELA -> green ; MANTENER -> yellow ; REDUCIR / VENTA -> red
    const light: "green" | "yellow" | "red" =
      clasificacionJerarquica === "COMPRA" || clasificacionJerarquica === "COMPRA CON CAUTELA"
        ? "green"
        : clasificacionJerarquica === "MANTENER"
          ? "yellow"
          : "red";
    const recommendation: "COMPRA" | "MANTENER" | "VENTA" =
      light === "green" ? "COMPRA" : light === "yellow" ? "MANTENER" : "VENTA";

    const cierreInterpretacion = generarCierreScore(total, scoreTecLegacy, 0);

    return {
      ticker,
      lastUpdated: new Date().toISOString(),
      dataSource: "yahoo" as const,
      esETF,
      name:
        (price?.longName as string | undefined) ||
        (price?.shortName as string | undefined) ||
        ticker,
      sector: (ap?.sector as string | undefined) ?? null,
      currency: inferMoneda(ticker, price?.currency as string | undefined),
      price: current,
      change1d,
      changePeriod,
      sma50,
      sma200,
      low52,
      high52,
      rsi: rsiV,
      macd: macdV,
      macdSignal: macdS,
      pe: typeof pe === "number" ? pe : null,
      peg,
      pePercentile,
      pePercentileReason,
      pePercentileMuestraInsuficiente,
      pegPercentile: null,
      revGrowth: typeof revGrowth === "number" ? revGrowth * 100 : null,
      profitMargin: typeof profitMargin === "number" ? profitMargin * 100 : null,
      roe: typeof roe === "number" ? roe * 100 : null,
      marketCap,
      techScore: scoreTecLegacy,
      fundScore: fundScoreNum,
      totalScore: total,
      clasificacionJerarquica,
      recommendation,
      light,
      signals,
      history: hist.map((h) => ({ date: h.date, close: h.close })),
      // Nuevos campos extendidos
      scoreTecnicoDetalle,
      interpretaciones,
      cierreInterpretacion,
      soportes: sr.soportes.map((s) => ({
        precio: s.precio,
        fecha: s.fecha,
        vecesTocado: s.vecesTocado,
        esEstimado: s.esEstimado,
      })),
      resistencias: sr.resistencias.map((r) => ({
        precio: r.precio,
        fecha: r.fecha,
        vecesTocado: r.vecesTocado,
        esEstimado: r.esEstimado,
      })),
      distanciaSoporte: sr.distanciaSoportePct,
      distanciaResistencia: sr.distanciaResistenciaPct,
      extended: extended ? { ...extended, fcfYield: rawNum(fd?.freeCashflowYield) } : extended,
      // Información de tipo de activo + scoring unificado
      infoActivo: detectarTipoActivo(
        ticker,
        price?.quoteType as string | undefined,
        ap?.sector as string | undefined,
      ),
      scoreUnificado: calcularScoreUnificado(
        scoreTecnicoDetalle,
        {
          pe: typeof pe === "number" ? pe : null,
          revenueGrowth: rawNum(fd?.revenueGrowth),
          profitMargin: rawNum(fd?.profitMargins),
          roe: rawNum(fd?.returnOnEquity),
          earningsGrowth: rawNum(fd?.earningsGrowth),
          peg,
          marketCap: rawNum(price?.marketCap),
          forwardPE: rawNum(sd?.forwardPE),
          fcfYield: rawNum(fd?.freeCashflowYield),
          debtToEquity: rawNum(fd?.debtToEquity),
          recommendationMean: extended?.consensoAnalistas
            ? (1 * extended.consensoAnalistas.strongBuy +
                2 * extended.consensoAnalistas.buy +
                3 * extended.consensoAnalistas.hold +
                4 * extended.consensoAnalistas.sell +
                5 * extended.consensoAnalistas.strongSell) /
              (extended.consensoAnalistas.strongBuy +
                extended.consensoAnalistas.buy +
                extended.consensoAnalistas.hold +
                extended.consensoAnalistas.sell +
                extended.consensoAnalistas.strongSell)
            : null,
        },
        detectarTipoActivo(
          ticker,
          price?.quoteType as string | undefined,
          ap?.sector as string | undefined,
        ),
      ),
    };
  });

export const getSemaforoBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ tickers: z.array(TickerSchema).min(1).max(20), rango: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SemaforoResult[]> => {
    const { tickers, rango } = data;
    const days = rangoADias(rango);
    const SEMAFORO_CACHE_TTL = 5 * 60 * 1000; // 5 min

    // Check cache for each ticker, fetch only uncached
    const uncached: string[] = [];
    const cachedResults: SemaforoResult[] = [];
    for (const t of tickers) {
      const cacheKey = `semaforo:${t}:${rango ?? "2A"}`;
      const cached = getCached<SemaforoResult>(cacheKey, SEMAFORO_CACHE_TTL);
      if (cached) cachedResults.push(cached);
      else uncached.push(t);
    }

    if (uncached.length === 0) return cachedResults;

    // Fetch uncached tickers in parallel batches
    const BATCH = 10;
    for (let i = 0; i < uncached.length; i += BATCH) {
      const slice = uncached.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(
        slice.map(async (ticker) => {
          try {
            const [hist, quote] = await Promise.all([
              fetchHistory(ticker, days),
              fetchQuote(ticker),
            ]);
            if (hist.length < 30) return null;
            const closes = hist.map((h) => h.close);
            const current = closes[closes.length - 1];
            const prev = closes[closes.length - 2] ?? current;
            const change1d = ((current - prev) / prev) * 100;
            const sma50 = sma(closes, 50);
            const sma200 = closes.length >= 200 ? sma(closes, 200) : null;
            const rsiV = rsiFn(closes);
            const { macd: macdV, signal: macdS } = macdFn(closes);
            const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10);
            const win52 = hist.filter((h) => h.date >= cutoff).map((h) => h.close);
            const low52 = win52.length > 0 ? Math.min(...win52) : Math.min(...closes);
            const high52 = win52.length > 0 ? Math.max(...win52) : Math.max(...closes);
            const price = quote?.price;
            const sd = quote?.summaryDetail;
            const dks = quote?.defaultKeyStatistics;
            const fd = quote?.financialData;
            const ap = quote?.assetProfile;
            const esETF = (price?.quoteType as string | undefined) === "ETF";
            const trailingPE = rawNum(sd?.trailingPE);
            const trailingEps = rawNum(dks?.trailingEps);
            const pe = trailingPE ?? (trailingEps && current ? current / trailingEps : null);
            const revGrowth = rawNum(fd?.revenueGrowth);
            const profitMargin = rawNum(fd?.profitMargins);
            const roe = rawNum(fd?.returnOnEquity);
            const marketCap = rawNum(price?.marketCap);
            const epsGrowth = rawNum(fd?.earningsGrowth);
            const peg =
              pe != null && epsGrowth != null && epsGrowth >= 0.01 ? pe / epsGrowth : null;
            const sharesOutstanding = rawNum(dks?.sharesOutstanding);
            const ish = quote?.incomeStatementHistory;
            const { value: pePercentile, muestraInsuficiente: pePercentileMuestraInsuficiente } =
              computePePercentileFromQuote(pe, quote, closes);
            const pePercentileReason =
              pePercentile != null
                ? undefined
                : pe == null || pe <= 0
                  ? "P/E no disponible"
                  : !sharesOutstanding || sharesOutstanding <= 0
                    ? "Faltan datos de acciones en circulación"
                    : "Sin historial de ganancias suficiente";
            const changePeriod =
              hist.length >= 2 ? ((current - hist[0].close) / hist[0].close) * 100 : null;
            const signals: SemaforoSignal[] = [];
            let tech = 0;
            if (current > sma50) {
              tech += 1;
              signals.push({ label: `Precio sobre SMA50`, tone: "good" });
            } else {
              tech -= 1;
              signals.push({ label: `Precio bajo SMA50`, tone: "bad" });
            }
            if (sma200 != null && sma50 > sma200) {
              tech += 1;
              signals.push({ label: `Cruce dorado (SMA50 > SMA200)`, tone: "good" });
            } else if (sma200 != null && sma50 < sma200) {
              tech -= 1;
              signals.push({ label: `Cruce de la muerte (SMA50 < SMA200)`, tone: "bad" });
            }
            if (rsiV < 30) {
              tech += 2;
              signals.push({ label: `RSI ${rsiV.toFixed(0)} — sobreventa`, tone: "good" });
            } else if (rsiV > 70) {
              tech -= 2;
              signals.push({ label: `RSI ${rsiV.toFixed(0)} — sobrecompra`, tone: "bad" });
            } else signals.push({ label: `RSI ${rsiV.toFixed(0)} — neutral`, tone: "neutral" });
            if (macdV > macdS) {
              tech += 1;
              signals.push({ label: `MACD alcista`, tone: "good" });
            } else {
              tech -= 1;
              signals.push({ label: `MACD bajista`, tone: "bad" });
            }
            let fund = 0;
            if (!esETF && typeof pe === "number" && pe > 0) {
              if (pe < 15) {
                fund += 2;
                signals.push({ label: `P/E ${pe.toFixed(1)} — valor atractivo`, tone: "good" });
              } else if (pe < 30) {
                fund += 1;
                signals.push({ label: `P/E ${pe.toFixed(1)} — razonable`, tone: "neutral" });
              } else {
                fund -= 1;
                signals.push({ label: `P/E ${pe.toFixed(1)} — caro`, tone: "bad" });
              }
            }
            if (!esETF && typeof revGrowth === "number") {
              const pct = revGrowth * 100;
              if (revGrowth > 0.15) {
                fund += 2;
                signals.push({ label: `Revenue +${pct.toFixed(0)}% — fuerte`, tone: "good" });
              } else if (revGrowth > 0) {
                fund += 1;
                signals.push({ label: `Revenue +${pct.toFixed(0)}%`, tone: "neutral" });
              } else {
                fund -= 1;
                signals.push({ label: `Revenue ${pct.toFixed(0)}% — negativo`, tone: "bad" });
              }
            }
            if (!esETF && typeof profitMargin === "number") {
              const pct = profitMargin * 100;
              if (profitMargin > 0.2) {
                fund += 2;
                signals.push({ label: `Margen ${pct.toFixed(0)}% — excelente`, tone: "good" });
              } else if (profitMargin > 0.1) {
                fund += 1;
                signals.push({ label: `Margen ${pct.toFixed(0)}%`, tone: "neutral" });
              } else if (profitMargin <= 0) {
                fund -= 1;
                signals.push({ label: `Margen ${pct.toFixed(0)}% — negativo`, tone: "bad" });
              }
            }
            if (!esETF && typeof roe === "number") {
              const pct = roe * 100;
              if (roe > 0.15) {
                fund += 1;
                signals.push({ label: `ROE ${pct.toFixed(0)}%`, tone: "good" });
              } else if (roe <= 0) {
                fund -= 1;
                signals.push({ label: `ROE ${pct.toFixed(0)}% — negativo`, tone: "bad" });
              }
            }
            const total = tech + fund;
            // Normalizar escala aditiva (~ -10 a +15) a escala canónica (~ -2.5 a +2.5)
            const norm = total / 6;
            const clasificacionJerarquica:
              "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA" =
              norm > 1.5
                ? "COMPRA"
                : norm > 0.3
                  ? "COMPRA CON CAUTELA"
                  : norm > -0.3
                    ? "MANTENER"
                    : norm > -1.5
                      ? "REDUCIR"
                      : "VENTA";
            // 3-level (light) SE DERIVA de clasificacionJerarquica (no recalcula sobre total):
            const light: "green" | "yellow" | "red" =
              clasificacionJerarquica === "COMPRA" ||
              clasificacionJerarquica === "COMPRA CON CAUTELA"
                ? "green"
                : clasificacionJerarquica === "MANTENER"
                  ? "yellow"
                  : "red";
            const recommendation: "COMPRA" | "MANTENER" | "VENTA" =
              light === "green" ? "COMPRA" : light === "yellow" ? "MANTENER" : "VENTA";
            return {
              ticker,
              lastUpdated: new Date().toISOString(),
              dataSource: "yahoo" as const,
              esETF,
              name:
                (price?.longName as string | undefined) ||
                (price?.shortName as string | undefined) ||
                ticker,
              sector: (ap?.sector as string | undefined) ?? null,
              currency: inferMoneda(ticker, price?.currency as string | undefined),
              price: current,
              change1d,
              changePeriod,
              sma50,
              sma200,
              low52,
              high52,
              rsi: rsiV,
              macd: macdV,
              macdSignal: macdS,
              pe: esETF ? null : pe,
              peg: esETF ? null : peg,
              pePercentile: esETF ? null : pePercentile,
              pePercentileMuestraInsuficiente: esETF ? undefined : pePercentileMuestraInsuficiente,
              pePercentileReason: esETF ? undefined : pePercentileReason,
              pegPercentile: null,
              revGrowth: esETF ? null : typeof revGrowth === "number" ? revGrowth * 100 : null,
              profitMargin: esETF
                ? null
                : typeof profitMargin === "number"
                  ? profitMargin * 100
                  : null,
              roe: esETF ? null : typeof roe === "number" ? roe * 100 : null,
              marketCap,
              techScore: tech,
              fundScore: fund,
              totalScore: total,
              clasificacionJerarquica,
              recommendation,
              light,
              signals,
              history: hist.map((h) => ({ date: h.date, close: h.close })),
              // Información de tipo de activo + scoring unificado (batch)
              infoActivo: detectarTipoActivo(
                ticker,
                price?.quoteType as string | undefined,
                ap?.sector as string | undefined,
              ),
              scoreUnificado: calcularScoreUnificado(
                calcularScoreTecnico({
                  current,
                  sma50,
                  sma200,
                  rsi: rsiV,
                  macd: macdV,
                  macdSignal: macdS,
                  closes,
                  sr: analizarSoportesResistencias(hist, 5, 0.02, high52, low52),
                }),
                {
                  pe: esETF ? null : typeof pe === "number" ? pe : null,
                  revenueGrowth: esETF ? null : rawNum(fd?.revenueGrowth),
                  profitMargin: esETF ? null : rawNum(fd?.profitMargins),
                  roe: esETF ? null : rawNum(fd?.returnOnEquity),
                  earningsGrowth: esETF ? null : rawNum(fd?.earningsGrowth),
                  peg: esETF ? null : peg,
                  marketCap: rawNum(price?.marketCap),
                  forwardPE: esETF ? null : rawNum(sd?.forwardPE),
                  fcfYield: null,
                  debtToEquity: null,
                  recommendationMean: null,
                },
                detectarTipoActivo(
                  ticker,
                  price?.quoteType as string | undefined,
                  ap?.sector as string | undefined,
                ),
              ),
            } as SemaforoResult;
          } catch {
            return null;
          }
        }),
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value != null) {
          const result = r.value;
          const cacheKey = `semaforo:${result.ticker}:${rango ?? "2A"}`;
          setCache(cacheKey, result);
          cachedResults.push(result);
        }
      }
    }
    return cachedResults;
  });

// 
// Portfolio optimization
// 

const StrategySchema = z.enum([
  "min-variance",
  "max-sharpe",
  "equal-weight",
  "inverse-vol",
  "markowitz",
  "min-pvar",
  "max-psharpe",
]);

export interface EfficientFrontierPoint {
  ret: number;
  vol: number;
}

export interface OptimizeResponse {
  strategy: Strategy;
  tickers: string[];
  weights: Record<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpe: number;
  individual: {
    ticker: string;
    peso: number;
    meanAnnual: number;
    volAnnual: number;
    sharpe: number;
  }[];
  correlation: { tickers: string[]; matrix: number[][] };
  equityCurve: { date: string; value: number }[];
  frontier: EfficientFrontierPoint[];
  frontierPVar?: EfficientFrontierPoint[]; // Labadie §3.2: p-variance frontier
  //  Labadie §3.2: p-variance 
  pSharpe?: number;
  pVariance?: number;
}

export const optimizePortfolio = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        tickers: z.array(TickerSchema).min(2),
        strategy: StrategySchema,
        pValue: z.number().min(1.1).max(4).optional().default(2),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<OptimizeResponse> => {
    const { tickers, strategy, pValue } = data;
    const histories = await Promise.all(
      tickers.map((t) => fetchHistory(t, 365 * 2).catch(() => [])),
    );
    const valid: { ticker: string; rows: { date: string; close: number }[] }[] = [];
    for (let i = 0; i < tickers.length; i++) {
      if (histories[i].length >= 60) valid.push({ ticker: tickers[i], rows: histories[i] });
    }
    if (valid.length < 2) throw new Error("Se necesitan al menos 2 tickers con datos suficientes.");

    // Align by intersected dates
    const dateSets = valid.map((v) => new Set(v.rows.map((r) => r.date)));
    const commonDates = valid[0].rows
      .map((r) => r.date)
      .filter((d) => dateSets.every((s) => s.has(d)));
    if (commonDates.length < 40) throw new Error("Series con muy poca intersección histórica.");

    const closesByTicker: Record<string, number[]> = {};
    const dateIndex: Record<string, Record<string, number>> = {};
    for (const v of valid) {
      const map: Record<string, number> = {};
      for (const r of v.rows) map[r.date] = r.close;
      dateIndex[v.ticker] = map;
      closesByTicker[v.ticker] = commonDates.map((d) => map[d]);
    }

    const usedTickers = valid.map((v) => v.ticker);
    const retsByTicker = usedTickers.map((t) => logReturns(closesByTicker[t]));
    const T = retsByTicker[0].length;
    const returnsRows: number[][] = [];
    for (let t = 0; t < T; t++) {
      const row: number[] = [];
      for (let i = 0; i < usedTickers.length; i++) row.push(retsByTicker[i][t]);
      returnsRows.push(row);
    }
    const meanDaily = retsByTicker.map((r) => mean(r));
    const volDaily = retsByTicker.map((r) => std(r));
    const cov = covMatrix(returnsRows);

    const result = optimize(strategy, { meanDaily, volDaily, cov, returnsRows, pValue });

    const weights: Record<string, number> = {};
    usedTickers.forEach((t, i) => (weights[t] = result.weights[i]));

    // Correlation matrix
    const N = usedTickers.length;
    const correlation: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const denom = volDaily[i] * volDaily[j];
        correlation[i][j] = denom > 0 ? cov[i][j] / denom : 0;
      }
    }

    // Equity curve of the optimized weights (rebased to 100)
    const equityCurve: { date: string; value: number }[] = [];
    let val = 100;
    equityCurve.push({ date: commonDates[1] ?? commonDates[0], value: val });
    for (let t = 0; t < T; t++) {
      let r = 0;
      for (let i = 0; i < N; i++) r += result.weights[i] * returnsRows[t][i];
      val = val * Math.exp(r);
      equityCurve.push({ date: commonDates[t + 1] ?? commonDates[t], value: val });
    }

    const individual = usedTickers.map((t, i) => ({
      ticker: t,
      peso: weights[t],
      meanAnnual: meanDaily[i] * 252,
      volAnnual: volDaily[i] * Math.sqrt(252),
      sharpe:
        volDaily[i] > 0
          ? (meanDaily[i] * 252 - getRiskFreeRateSync("USD")) / (volDaily[i] * Math.sqrt(252))
          : 0,
    }));

    // Efficient frontier: vary target return and minimise variance
    const frontier: EfficientFrontierPoint[] = [];
    const dailyMean = meanDaily;
    const minR = Math.min(...dailyMean) * 252;
    const maxR = Math.max(...dailyMean) * 252;
    for (let step = 0; step <= 30; step++) {
      const targetRet = minR + (maxR - minR) * (step / 30);
      try {
        const fr = optimize("markowitz", {
          meanDaily,
          volDaily,
          cov,
          targetReturn: targetRet / 252,
        });
        if (fr.volatility > 0) frontier.push({ ret: fr.expectedReturn, vol: fr.volatility });
      } catch {
        /* skip */
      }
    }
    frontier.sort((a, b) => a.vol - b.vol);

    //  Labadie §3.2: p-variance frontier 
    const frontierPVar: EfficientFrontierPoint[] = [];
    for (let step = 0; step <= 30; step++) {
      const targetRet = minR + (maxR - minR) * (step / 30);
      try {
        const fr = optimize("min-pvar", {
          meanDaily,
          volDaily,
          cov,
          returnsRows,
          pValue,
          targetReturn: targetRet / 252,
        });
        // Calculate actual p-volatility for this strategy
        const pVol =
          fr.pVariance != null && fr.pVariance > 0
            ? Math.pow(fr.pVariance, 1 / pValue) * Math.pow(252, 1 / pValue)
            : fr.volatility;
        if (pVol > 0) frontierPVar.push({ ret: fr.expectedReturn, vol: pVol });
      } catch {
        /* skip */
      }
    }
    frontierPVar.sort((a, b) => a.vol - b.vol);

    return {
      strategy,
      tickers: usedTickers,
      weights,
      expectedReturn: result.expectedReturn,
      volatility: result.volatility,
      sharpe: result.sharpe,
      individual,
      correlation: { tickers: usedTickers, matrix: correlation },
      equityCurve,
      frontier,
      frontierPVar: frontierPVar.length > 0 ? frontierPVar : undefined,
      pSharpe: result.pSharpe,
      pVariance: result.pVariance,
    };
  });

// 
// Multi-strategy optimization (all strategies at once + histogram)
// 

export interface HistogramBin {
  binStart: number;
  count: number;
}

export interface StrategyResult {
  strategy: Strategy;
  label: string;
  weights: Record<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpe: number;
  histogram: HistogramBin[];
  //  Labadie §3.2: p-variance 
  pSharpe?: number;
  pVariance?: number;
}

export interface MonteCarloSim {
  ret: number;
  vol: number;
  sharpe: number;
  weights: number[];
}

export interface PortfolioCAPMEntry {
  strategy: string;
  label: string;
  alpha: number;
  annualizedAlpha: number;
  beta: number;
  correlation: number;
  rSquared: number;
  pValue: number;
  stdErr: number;
  observations: number;
  bestBenchmark?: string;
}

export interface ScenarioRow {
  ticker: string;
  maxLoss: number;
  expectedLoss: number;
  expectedGain: number;
  maxGain: number;
  mostLikely: number;
}

export interface AllPortfoliosResult {
  tickers: string[];
  notional: number;
  strategies: StrategyResult[];
  correlation: { tickers: string[]; matrix: number[][] };
  equityCurve: { date: string; value: number }[];
  frontier: EfficientFrontierPoint[];
  simulations: MonteCarloSim[];
  individual: { ticker: string; meanAnnual: number; volAnnual: number; sharpe: number }[];
  capmBenchmarks: Array<{ benchmark: string; entries: PortfolioCAPMEntry[] }>;
  scenarios: ScenarioRow[];
  //  Labadie §3.2: Hurst del portafolio 
  portfolioHurst?: number;
}

const STRATEGY_LABELS: Record<Strategy, string> = {
  "min-variance": "Mín. Varianza",
  "max-sharpe": "Máx. Sharpe",
  "equal-weight": "Equiponderado",
  "inverse-vol": "Inv. Volatilidad",
  markowitz: "Markowitz",
  "min-pvar": "Mín. p-Var",
  "max-psharpe": "Máx. p-Sharpe",
};

function computeHistogram(weights: number[], returnsRows: number[][], bins = 40): HistogramBin[] {
  const T = returnsRows.length;
  const portReturns: number[] = [];
  for (let t = 0; t < T; t++) {
    let r = 0;
    for (let i = 0; i < weights.length; i++) r += weights[i] * returnsRows[t][i];
    portReturns.push(r);
  }
  const minR = Math.min(...portReturns);
  const maxR = Math.max(...portReturns);
  const w = (maxR - minR) / bins || 0.001;
  const result: HistogramBin[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = minR + i * w;
    const hi = lo + w;
    const isLast = i === bins - 1;
    result.push({
      binStart: +(lo * 100).toFixed(2),
      count: portReturns.filter((v) => v >= lo && (isLast ? v <= hi : v < hi)).length,
    });
  }
  return result;
}

export const optimizeAllPortfolios = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        tickers: z.array(TickerSchema).min(2),
        notional: z.number().min(0).default(15),
        numSimulations: z.number().min(0).max(10000).default(2000),
        benchmarks: z.array(z.string().min(1).max(20)).default([]),
        autoDetectBenchmarks: z.boolean().optional().default(false),
        years: z.number().min(0.5).max(10).default(2),
        pValue: z.number().min(1.1).max(4).optional().default(2),
        hurst: z.number().min(0.1).max(0.9).optional().default(0.5),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AllPortfoliosResult> => {
    try {
      const { tickers, notional, numSimulations, benchmarks, autoDetectBenchmarks, years } = data;
      const days = Math.round(365 * years);
      const histories = await Promise.all(
        tickers.map((t) => fetchHistory(t, days).catch(() => [])),
      );
      const valid: { ticker: string; rows: { date: string; close: number }[] }[] = [];
      for (let i = 0; i < tickers.length; i++) {
        if (histories[i].length >= 60) valid.push({ ticker: tickers[i], rows: histories[i] });
      }
      if (valid.length < 2)
        throw new Error(
          `Se necesitan al menos 2 tickers con datos suficientes (${valid.length} válidos de ${tickers.length})`,
        );
      if (!valid[0].rows || valid[0].rows.length < 60)
        throw new Error(`Datos insuficientes para ${valid[0].ticker}`);

      const dateSets = valid.map((v) => new Set(v.rows.map((r) => r.date)));
      const commonDates = valid[0].rows
        .map((r) => r.date)
        .filter((d) => dateSets.every((s) => s.has(d)));
      if (commonDates.length < 40)
        throw new Error(
          `Series con muy poca intersección histórica (${commonDates.length} fechas comunes de ${valid[0].rows.length} disponibles)`,
        );

      const closesByTicker: Record<string, number[]> = {};
      for (const v of valid) {
        const map: Record<string, number> = {};
        for (const r of v.rows) map[r.date] = r.close;
        closesByTicker[v.ticker] = commonDates.map((d) => map[d]);
      }

      const usedTickers = valid.map((v) => v.ticker);
      const retsByTicker = usedTickers.map((t) => logReturns(closesByTicker[t]));
      const T = retsByTicker[0].length;
      const returnsRows: number[][] = [];
      for (let t = 0; t < T; t++) {
        const row: number[] = [];
        for (let i = 0; i < usedTickers.length; i++) row.push(retsByTicker[i][t]);
        returnsRows.push(row);
      }
      const meanDaily = retsByTicker.map((r) => mean(r));
      const volDaily = retsByTicker.map((r) => std(r));
      const cov = covMatrix(returnsRows);
      const allStrategies: Strategy[] = [
        "min-variance",
        "max-sharpe",
        "equal-weight",
        "inverse-vol",
        "markowitz",
        "min-pvar",
        "max-psharpe",
      ];

      const pVal = data.pValue ?? 2;
      const optInputs = { meanDaily, volDaily, cov, returnsRows, pValue: pVal };

      const strategies: StrategyResult[] = allStrategies.map((strategy) => {
        const result = optimize(strategy, optInputs);
        const weights: Record<string, number> = {};
        usedTickers.forEach((t, i) => (weights[t] = result.weights[i]));
        const histogram = computeHistogram(result.weights, returnsRows);
        return {
          strategy,
          label: STRATEGY_LABELS[strategy],
          weights,
          expectedReturn: result.expectedReturn,
          volatility: result.volatility,
          sharpe: result.sharpe,
          histogram,
          pSharpe: result.pSharpe,
          pVariance: result.pVariance,
        };
      });

      // Correlation matrix
      const N = usedTickers.length;
      const correlation: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const denom = volDaily[i] * volDaily[j];
          correlation[i][j] = denom > 0 ? cov[i][j] / denom : 0;
        }
      }

      // Equity curve (average of all strategies or use max-sharpe as reference)
      const refResult = optimize("max-sharpe", { meanDaily, volDaily, cov });
      const equityCurve: { date: string; value: number }[] = [];
      let val = 100;
      equityCurve.push({ date: commonDates[1] ?? commonDates[0], value: val });
      for (let t = 0; t < T; t++) {
        let r = 0;
        for (let i = 0; i < N; i++) r += refResult.weights[i] * returnsRows[t][i];
        val = val * Math.exp(r);
        equityCurve.push({ date: commonDates[t + 1] ?? commonDates[t], value: val });
      }

      // Efficient frontier
      const frontier: EfficientFrontierPoint[] = [];
      const minR = Math.min(...meanDaily) * 252;
      const maxR = Math.max(...meanDaily) * 252;
      for (let step = 0; step <= 30; step++) {
        const targetRet = minR + (maxR - minR) * (step / 30);
        try {
          const fr = optimize("markowitz", {
            meanDaily,
            volDaily,
            cov,
            targetReturn: targetRet / 252,
          });
          if (fr.volatility > 0) frontier.push({ ret: fr.expectedReturn, vol: fr.volatility });
        } catch {
          /* skip */
        }
      }
      frontier.sort((a, b) => a.vol - b.vol);

      // Monte Carlo simulations — Labadie §3.2: con scaling self-similar (fBm)
      const hurstVal = data.hurst ?? 0.5;
      const annFactor = 252;
      const mcVolScale = hurstVal !== 0.5 ? Math.pow(annFactor, hurstVal) : Math.sqrt(annFactor);
      const simulations: MonteCarloSim[] = [];
      for (let s = 0; s < numSimulations; s++) {
        let w = new Array(N).fill(0).map(() => Math.random());
        const sum = w.reduce((a, b) => a + b, 0);
        if (sum > 0) w = w.map((x) => x / sum);
        else w = new Array(N).fill(1 / N);
        const ret = meanDaily.reduce((s, mu, i) => s + mu * w[i], 0) * 252;
        let varP = 0;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) varP += w[i] * w[j] * cov[i][j];
        // Si H≠0.5, usar scaling self-similar: σ × 252^H en vez de σ × √252
        const vol = Math.sqrt(Math.max(varP, 0)) * mcVolScale;
        const sharpe = vol > 0 ? (ret - getRiskFreeRateSync("USD")) / vol : 0;
        simulations.push({ ret, vol, sharpe, weights: w });
      }
      // Keep best sharpe / worst / median for reference
      simulations.sort((a, b) => b.sharpe - a.sharpe);

      const individual = usedTickers.map((t, i) => ({
        ticker: t,
        meanAnnual: meanDaily[i] * 252,
        volAnnual: volDaily[i] * Math.sqrt(252),
        sharpe:
          volDaily[i] > 0
            ? (meanDaily[i] * 252 - getRiskFreeRateSync("USD")) / (volDaily[i] * Math.sqrt(252))
            : 0,
      }));

      // Scenario analysis per ticker (based on daily returns percentiles)
      const scenarios: ScenarioRow[] = usedTickers.map((t, i) => {
        const rets = retsByTicker[i].slice();
        rets.sort((a, b) => a - b);
        const p5 = rets[Math.floor(rets.length * 0.05)] * 252;
        const p25 = rets[Math.floor(rets.length * 0.25)] * 252;
        const p75 = rets[Math.floor(rets.length * 0.75)] * 252;
        const p95 = rets[Math.floor(rets.length * 0.95)] * 252;
        const median = rets[Math.floor(rets.length * 0.5)] * 252;
        return {
          ticker: t,
          maxLoss: Math.round(p5 * 100) / 100,
          expectedLoss: Math.round(p25 * 100) / 100,
          expectedGain: Math.round(p75 * 100) / 100,
          maxGain: Math.round(p95 * 100) / 100,
          mostLikely: Math.round(median * 100) / 100,
        };
      });

      // CAPM per strategy vs benchmarks
      // Auto-detect: find benchmarks with highest avg R² across all strategies
      const capmBenchmarks: Array<{ benchmark: string; entries: PortfolioCAPMEntry[] }> = [];
      const tickerClosesByDate: Record<string, Record<string, number>> = {};
      for (const v of valid) {
        for (const r of v.rows) {
          if (!tickerClosesByDate[r.date]) tickerClosesByDate[r.date] = {};
          tickerClosesByDate[r.date][v.ticker] = r.close;
        }
      }
      const benchList: string[] =
        autoDetectBenchmarks || benchmarks.length === 0 ? AUTO_BENCHMARKS : benchmarks;
      const benchHistories = await Promise.all(
        benchList.map((b) => fetchHistory(b, days).catch(() => [])),
      );
      interface BenchEntry {
        bm: string;
        entries: PortfolioCAPMEntry[];
        avgR2: number;
      }
      const benchResults: BenchEntry[] = [];
      for (let bi = 0; bi < benchList.length; bi++) {
        const bm = benchList[bi];
        const bmRows = benchHistories[bi];
        if (bmRows.length < 60) continue;
        const bmMap = new Map(bmRows.map((r) => [r.date, r.close]));
        const alignedDates = commonDates.filter((d) => bmMap.has(d) && tickerClosesByDate[d]);
        if (alignedDates.length < 40) continue;
        const bmPrices = alignedDates.map((d) => bmMap.get(d)!);
        const bmRets: number[] = [];
        for (let i = 1; i < bmPrices.length; i++)
          bmRets.push((bmPrices[i] - bmPrices[i - 1]) / bmPrices[i - 1]);
        const entries: PortfolioCAPMEntry[] = strategies.map((s) => {
          const wMap = s.weights;
          const portPrices = alignedDates.map((d) => {
            const closes = tickerClosesByDate[d];
            let p = 0;
            for (const t of usedTickers) p += (wMap[t] ?? 0) * (closes[t] ?? 0);
            return p;
          });
          const portRets: number[] = [];
          for (let i = 1; i < portPrices.length; i++)
            portRets.push((portPrices[i] - portPrices[i - 1]) / portPrices[i - 1]);
          if (portRets.length < 30) {
            return {
              strategy: s.strategy,
              label: s.label,
              alpha: 0,
              annualizedAlpha: 0,
              beta: 0,
              correlation: 0,
              rSquared: 0,
              pValue: 0,
              stdErr: 0,
              observations: 0,
            };
          }
          const reg = linregress(bmRets, portRets);
          const factor = 252;
          return {
            strategy: s.strategy,
            label: s.label,
            alpha: Math.round(reg.intercept * 10000) / 10000,
            annualizedAlpha: Math.round(reg.intercept * factor * 10000) / 10000,
            beta: Math.round(reg.slope * 10000) / 10000,
            correlation: Math.round(Math.sign(reg.slope) * Math.sqrt(reg.r2) * 10000) / 10000,
            rSquared: Math.round(reg.r2 * 10000) / 10000,
            pValue: Math.round(reg.pValue * 10000) / 10000,
            stdErr: Math.round(reg.stdErr * 10000) / 10000,
            observations: portRets.length,
          };
        });
        const avgR2 = entries.reduce((s, e) => s + e.rSquared, 0) / entries.length;
        benchResults.push({ bm, entries, avgR2 });
      }
      benchResults.sort((a, b) => b.avgR2 - a.avgR2);
      for (const br of benchResults) {
        capmBenchmarks.push({ benchmark: br.bm, entries: br.entries });
      }

      //  Labadie §3.2: Portfolio Hurst 
      const refWeights =
        strategies.length > 0
          ? strategies[0].weights
          : Object.fromEntries(usedTickers.map((t, i) => [t, 1 / usedTickers.length]));
      const portfolioPrices: number[] = commonDates.map((d, idx) => {
        let val = 0;
        for (let i = 0; i < usedTickers.length; i++) {
          const close = closesByTicker[usedTickers[i]][idx];
          val += (refWeights[usedTickers[i]] ?? 1 / usedTickers.length) * close;
        }
        return val;
      });
      const portfolioHurstVal =
        portfolioPrices.length >= 100 ? computeHurst(portfolioPrices) : undefined;

      return {
        tickers: usedTickers,
        notional,
        strategies,
        correlation: { tickers: usedTickers, matrix: correlation },
        equityCurve,
        frontier,
        simulations,
        individual,
        capmBenchmarks,
        scenarios,
        portfolioHurst: portfolioHurstVal,
      };
    } catch (e: any) {
      throw new Error(
        `Error en optimización: ${e?.message ?? e}. ${e?.stack ? `Stack: ${e.stack.split("\n").slice(0, 3).join(" → ")}` : ""}`,
      );
    }
  });

// 
// Backtest de optimización (Markowitz walk-forward)
// 

async function fetchHistoryUpTo(
  ticker: string,
  cutoffDate: Date,
  days = 730,
): Promise<{ date: string; close: number }[]> {
  const yf = await getYF();
  const attempts = ticker.endsWith(".BA") ? [ticker] : [ticker, ticker + ".BA"];
  for (const sym of attempts) {
    try {
      const period2 = cutoffDate;
      const period1 = new Date(cutoffDate.getTime() - days * 24 * 60 * 60 * 1000);
      const rows = await yf.chart(sym, { period1, period2, interval: "1d" });
      const quotes: Array<{ date?: Date | null; close?: number | null }> = rows?.quotes ?? [];
      if (quotes.length >= 10) {
        return quotes
          .filter((q) => q.date != null && q.close != null)
          .map((q) => ({
            date: (q.date as Date).toISOString().slice(0, 10),
            close: q.close as number,
          }));
      }
    } catch {
      /* try next */
    }
  }
  return [];
}

export interface BacktestOptimizationResult {
  tickers: string[];
  training: {
    strategies: StrategyResult[];
    equityCurve: { date: string; value: number }[];
    frontier: EfficientFrontierPoint[];
    simulations: MonteCarloSim[];
    correlation: { tickers: string[]; matrix: number[][] };
    individual: { ticker: string; meanAnnual: number; volAnnual: number; sharpe: number }[];
  };
  forward: {
    equityCurve: { date: string; value: number }[];
    actualReturn: number;
    volatility: number;
    sharpe: number;
    maxDrawdown: number;
    cagr: number;
    individualReturns: { ticker: string; actualReturn: number }[];
  };
  comparison: {
    maxSharpeExpectedReturn: number;
    maxSharpeActualReturn: number;
    diff: number;
    expectedVol: number;
    actualVol: number;
  };
}

export const backtestOptimization = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        tickers: z.array(TickerSchema).min(2),
        cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        years: z.number().min(0.5).max(10).default(2),
        numSimulations: z.number().min(0).max(10000).default(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BacktestOptimizationResult> => {
    const { tickers, cutoffDate: cutoffStr, years, numSimulations } = data;
    const cutoff = new Date(cutoffStr + "T12:00:00Z");
    const days = Math.round(365 * years);

    //  1. Fetch training data (up to cutoff) 
    const histories = await Promise.all(
      tickers.map((t) => fetchHistoryUpTo(t, cutoff, days).catch(() => [])),
    );
    const valid: { ticker: string; rows: { date: string; close: number }[] }[] = [];
    for (let i = 0; i < tickers.length; i++) {
      if (histories[i].length >= 60) valid.push({ ticker: tickers[i], rows: histories[i] });
    }
    if (valid.length < 2)
      throw new Error(
        "Se necesitan al menos 2 tickers con datos históricos suficientes antes de la fecha de corte.",
      );

    const dateSets = valid.map((v) => new Set(v.rows.map((r) => r.date)));
    const commonDates = valid[0].rows
      .map((r) => r.date)
      .filter((d) => dateSets.every((s) => s.has(d)));
    if (commonDates.length < 40)
      throw new Error("Series con muy poca intersección histórica en el período de entrenamiento.");

    const closesByTicker: Record<string, number[]> = {};
    for (const v of valid) {
      const map: Record<string, number> = {};
      for (const r of v.rows) map[r.date] = r.close;
      closesByTicker[v.ticker] = commonDates.map((d) => map[d]);
    }

    const usedTickers = valid.map((v) => v.ticker);
    const retsByTicker = usedTickers.map((t) => logReturns(closesByTicker[t]));
    const T = retsByTicker[0].length;
    const returnsRows: number[][] = [];
    for (let t = 0; t < T; t++) {
      const row: number[] = [];
      for (let i = 0; i < usedTickers.length; i++) row.push(retsByTicker[i][t]);
      returnsRows.push(row);
    }
    const meanDaily = retsByTicker.map((r) => mean(r));
    const volDaily = retsByTicker.map((r) => std(r));
    const cov = covMatrix(returnsRows);

    //  2. Run optimization on training data 
    const allStrategies: Strategy[] = [
      "min-variance",
      "max-sharpe",
      "equal-weight",
      "inverse-vol",
      "markowitz",
    ];
    const strategies: StrategyResult[] = allStrategies.map((strategy) => {
      const result = optimize(strategy, { meanDaily, volDaily, cov });
      const weights: Record<string, number> = {};
      usedTickers.forEach((t, i) => (weights[t] = result.weights[i]));
      const histogram = computeHistogram(result.weights, returnsRows);
      return {
        strategy,
        label: STRATEGY_LABELS[strategy],
        weights,
        expectedReturn: result.expectedReturn,
        volatility: result.volatility,
        sharpe: result.sharpe,
        histogram,
      };
    });

    // Correlation
    const N = usedTickers.length;
    const correlation: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const denom = volDaily[i] * volDaily[j];
        correlation[i][j] = denom > 0 ? cov[i][j] / denom : 0;
      }
    }

    // Training equity curve (max-sharpe reference)
    const refResult = optimize("max-sharpe", { meanDaily, volDaily, cov });
    const trainingEquity: { date: string; value: number }[] = [];
    let val = 100;
    trainingEquity.push({ date: commonDates[1] ?? commonDates[0], value: val });
    for (let t = 0; t < T; t++) {
      let r = 0;
      for (let i = 0; i < N; i++) r += refResult.weights[i] * returnsRows[t][i];
      val = val * Math.exp(r);
      trainingEquity.push({ date: commonDates[t + 1] ?? commonDates[t], value: val });
    }

    // Frontier
    const frontier: EfficientFrontierPoint[] = [];
    const minR = Math.min(...meanDaily) * 252;
    const maxR = Math.max(...meanDaily) * 252;
    for (let step = 0; step <= 30; step++) {
      const targetRet = minR + (maxR - minR) * (step / 30);
      try {
        const fr = optimize("markowitz", {
          meanDaily,
          volDaily,
          cov,
          targetReturn: targetRet / 252,
        });
        if (fr.volatility > 0) frontier.push({ ret: fr.expectedReturn, vol: fr.volatility });
      } catch {
        /* skip */
      }
    }
    frontier.sort((a, b) => a.vol - b.vol);

    // Monte Carlo
    const simulations: MonteCarloSim[] = [];
    for (let s = 0; s < numSimulations; s++) {
      let w = new Array(N).fill(0).map(() => Math.random());
      const sum = w.reduce((a, b) => a + b, 0);
      if (sum > 0) w = w.map((x) => x / sum);
      else w = new Array(N).fill(1 / N);
      const ret = meanDaily.reduce((s, mu, i) => s + mu * w[i], 0) * 252;
      let varP = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) varP += w[i] * w[j] * cov[i][j];
      const vol = Math.sqrt(Math.max(varP, 0)) * Math.sqrt(252);
      const sharpe = vol > 0 ? (ret - getRiskFreeRateSync("USD")) / vol : 0;
      simulations.push({ ret, vol, sharpe, weights: w });
    }
    simulations.sort((a, b) => b.sharpe - a.sharpe);

    const individual = usedTickers.map((t, i) => ({
      ticker: t,
      meanAnnual: meanDaily[i] * 252,
      volAnnual: volDaily[i] * Math.sqrt(252),
      sharpe:
        volDaily[i] > 0
          ? (meanDaily[i] * 252 - getRiskFreeRateSync("USD")) / (volDaily[i] * Math.sqrt(252))
          : 0,
    }));

    //  3. Fetch forward data (cutoff → now) 
    const now = new Date();
    const forwardDays = Math.round((now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000)) + 30;
    const forwardHistories = await Promise.all(
      usedTickers.map((t) => fetchHistoryUpTo(t, now, forwardDays).catch(() => [])),
    );

    // Build forward closes aligned by date
    const fwdSets = forwardHistories.map((h) => new Set(h.map((r) => r.date)));
    const fwdCutoffStr = cutoffStr;
    const fwdCommonDates =
      forwardHistories[0]
        ?.map((r) => r.date)
        .filter((d) => d >= fwdCutoffStr && fwdSets.every((s) => s.has(d))) ?? [];
    if (fwdCommonDates.length < 5) {
      throw new Error(
        "No hay suficientes datos históricos después de la fecha de corte para evaluar el rendimiento.",
      );
    }

    const fwdClosesByTicker: Record<string, number[]> = {};
    for (let i = 0; i < usedTickers.length; i++) {
      const map: Record<string, number> = {};
      for (const r of forwardHistories[i]) map[r.date] = r.close;
      fwdClosesByTicker[usedTickers[i]] = fwdCommonDates.map((d) => map[d]);
    }

    // Forward equity curve using max-sharpe weights
    const maxSharpeWeights = refResult.weights;
    const fwdEquity: { date: string; value: number }[] = [];
    let fwdVal = 100;
    fwdEquity.push({ date: fwdCommonDates[0], value: fwdVal });
    for (let t = 1; t < fwdCommonDates.length; t++) {
      let r = 0;
      for (let i = 0; i < usedTickers.length; i++) {
        const prev = fwdClosesByTicker[usedTickers[i]][t - 1];
        const curr = fwdClosesByTicker[usedTickers[i]][t];
        if (prev > 0) r += (maxSharpeWeights[i] * (curr - prev)) / prev;
      }
      fwdVal = fwdVal * (1 + r);
      fwdEquity.push({ date: fwdCommonDates[t], value: fwdVal });
    }

    // Forward metrics
    const fwdRets: number[] = [];
    for (let t = 1; t < fwdCommonDates.length; t++) {
      let r = 0;
      for (let i = 0; i < usedTickers.length; i++) {
        const prev = fwdClosesByTicker[usedTickers[i]][t - 1];
        const curr = fwdClosesByTicker[usedTickers[i]][t];
        if (prev > 0) r += (maxSharpeWeights[i] * (curr - prev)) / prev;
      }
      fwdRets.push(r);
    }

    const actualReturn = fwdRets.length > 0 ? fwdEquity[fwdEquity.length - 1].value / 100 - 1 : 0;
    const fwdMean = fwdRets.length > 0 ? mean(fwdRets) : 0;
    const fwdStd = fwdRets.length > 0 ? std(fwdRets) : 0;
    const annFactor = Math.sqrt(252);
    const fwdVol = fwdStd * annFactor;
    const fwdSharpe =
      fwdStd > 0 ? (fwdMean * 252 - getRiskFreeRateSync("USD")) / (fwdStd * annFactor) : 0;
    const fwdCagr =
      fwdRets.length > 0
        ? Math.pow(fwdEquity[fwdEquity.length - 1].value / 100, 252 / fwdRets.length) - 1
        : 0;

    let maxVal = 100;
    let maxDrawdown = 0;
    for (const pt of fwdEquity) {
      if (pt.value > maxVal) maxVal = pt.value;
      const dd = (maxVal - pt.value) / maxVal;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Individual forward returns
    const individualReturns = usedTickers.map((t, i) => {
      const prices = fwdClosesByTicker[t];
      const ret = prices.length >= 2 ? (prices[prices.length - 1] - prices[0]) / prices[0] : 0;
      return { ticker: t, actualReturn: ret };
    });

    const maxSharpeStrategy = strategies.find((s) => s.strategy === "max-sharpe")!;

    return {
      tickers: usedTickers,
      training: {
        strategies,
        equityCurve: trainingEquity,
        frontier,
        simulations,
        correlation: { tickers: usedTickers, matrix: correlation },
        individual,
      },
      forward: {
        equityCurve: fwdEquity,
        actualReturn,
        volatility: fwdVol,
        sharpe: fwdSharpe,
        maxDrawdown,
        cagr: fwdCagr,
        individualReturns,
      },
      comparison: {
        maxSharpeExpectedReturn: maxSharpeStrategy.expectedReturn,
        maxSharpeActualReturn: actualReturn,
        diff: actualReturn - maxSharpeStrategy.expectedReturn,
        expectedVol: maxSharpeStrategy.volatility,
        actualVol: fwdVol,
      },
    };
  });

// 
// Multi-date Markowitz backtest
// 

export interface BacktestDateEntry {
  cutoffDate: string;
  markowitzExpectedReturn: number;
  markowitzExpectedVol: number;
  markowitzExpectedSharpe: number;
  maxSharpeWeights: Record<string, number>;
  actualReturn: number;
  actualVol: number;
  actualSharpe: number;
  cagr: number;
  maxDrawdown: number;
  diff: number;
  success: boolean;
  trainingStart: string;
  trainingEnd: string;
  forwardStart: string;
  forwardEnd: string;
}

export interface BacktestMarkowitzMultidateResult {
  tickers: string[];
  trainingYears: number;
  entries: BacktestDateEntry[];
  aggregate: {
    winRate: number;
    beatRate: number;
    avgExpectedReturn: number;
    avgActualReturn: number;
    avgDiff: number;
    avgCagr: number;
    avgMaxDrawdown: number;
    avgSharpe: number;
    totalDates: number;
    positiveCount: number;
    beatCount: number;
  };
}

export const backtestMarkowitzMultidate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        tickers: z.array(TickerSchema).min(2),
        cutoffDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
        years: z.number().min(0.5).max(10).default(2),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BacktestMarkowitzMultidateResult> => {
    const { tickers, cutoffDates, years } = data;
    const days = Math.round(365 * years);

    const entries: BacktestDateEntry[] = [];

    for (const cutoffStr of cutoffDates) {
      try {
        const cutoff = new Date(cutoffStr + "T12:00:00Z");

        //  1. Fetch training data (up to cutoff) 
        const histories = await Promise.all(
          tickers.map((t) => fetchHistoryUpTo(t, cutoff, days).catch(() => [])),
        );
        const valid: { ticker: string; rows: { date: string; close: number }[] }[] = [];
        for (let i = 0; i < tickers.length; i++) {
          if (histories[i].length >= 60) valid.push({ ticker: tickers[i], rows: histories[i] });
        }
        if (valid.length < 2) continue;

        const dateSets = valid.map((v) => new Set(v.rows.map((r) => r.date)));
        const commonDates = valid[0].rows
          .map((r) => r.date)
          .filter((d) => dateSets.every((s) => s.has(d)));
        if (commonDates.length < 40) continue;

        const closesByTicker: Record<string, number[]> = {};
        for (const v of valid) {
          const map: Record<string, number> = {};
          for (const r of v.rows) map[r.date] = r.close;
          closesByTicker[v.ticker] = commonDates.map((d) => map[d]);
        }

        const usedTickers = valid.map((v) => v.ticker);
        const retsByTicker = usedTickers.map((t) => logReturns(closesByTicker[t]));
        const T = retsByTicker[0].length;
        const returnsRows: number[][] = [];
        for (let t = 0; t < T; t++) {
          const row: number[] = [];
          for (let i = 0; i < usedTickers.length; i++) row.push(retsByTicker[i][t]);
          returnsRows.push(row);
        }
        const meanDaily = retsByTicker.map((r) => mean(r));
        const volDaily = retsByTicker.map((r) => std(r));
        const cov = covMatrix(returnsRows);

        const markowitzResult = optimize("markowitz", { meanDaily, volDaily, cov });
        const msResult = optimize("max-sharpe", { meanDaily, volDaily, cov });

        const trainingStart = commonDates[0];
        const trainingEnd = commonDates[commonDates.length - 1];

        //  2. Fetch forward data (cutoff → now) 
        const now = new Date();
        const forwardDays =
          Math.round((now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000)) + 30;
        const forwardHistories = await Promise.all(
          usedTickers.map((t) => fetchHistoryUpTo(t, now, forwardDays).catch(() => [])),
        );

        const fwdSets = forwardHistories.map((h) => new Set(h.map((r) => r.date)));
        const fwdCommonDates =
          forwardHistories[0]
            ?.map((r) => r.date)
            .filter((d) => d >= cutoffStr && fwdSets.every((s) => s.has(d))) ?? [];
        if (fwdCommonDates.length < 5) continue;

        const fwdClosesByTicker: Record<string, number[]> = {};
        for (let i = 0; i < usedTickers.length; i++) {
          const map: Record<string, number> = {};
          for (const r of forwardHistories[i]) map[r.date] = r.close;
          fwdClosesByTicker[usedTickers[i]] = fwdCommonDates.map((d) => map[d]);
        }

        // Forward equity curve using max-sharpe weights
        const msWeights = msResult.weights;
        const fwdEquity: { date: string; value: number }[] = [];
        let fwdVal = 100;
        fwdEquity.push({ date: fwdCommonDates[0], value: fwdVal });
        for (let t = 1; t < fwdCommonDates.length; t++) {
          let r = 0;
          for (let i = 0; i < usedTickers.length; i++) {
            const prev = fwdClosesByTicker[usedTickers[i]][t - 1];
            const curr = fwdClosesByTicker[usedTickers[i]][t];
            if (prev > 0) r += (msWeights[i] * (curr - prev)) / prev;
          }
          fwdVal = fwdVal * (1 + r);
          fwdEquity.push({ date: fwdCommonDates[t], value: fwdVal });
        }

        // Forward returns
        const fwdRets: number[] = [];
        for (let t = 1; t < fwdCommonDates.length; t++) {
          let r = 0;
          for (let i = 0; i < usedTickers.length; i++) {
            const prev = fwdClosesByTicker[usedTickers[i]][t - 1];
            const curr = fwdClosesByTicker[usedTickers[i]][t];
            if (prev > 0) r += (msWeights[i] * (curr - prev)) / prev;
          }
          fwdRets.push(r);
        }

        const actualReturn =
          fwdRets.length > 0 ? fwdEquity[fwdEquity.length - 1].value / 100 - 1 : 0;
        const fwdMean = fwdRets.length > 0 ? mean(fwdRets) : 0;
        const fwdStd = fwdRets.length > 0 ? std(fwdRets) : 0;
        const annFactor = Math.sqrt(252);
        const fwdVol = fwdStd * annFactor;
        const fwdSharpe = fwdStd > 0 ? (fwdMean * 252 - getRiskFreeRateSync("USD")) / fwdVol : 0;
        const fwdCagr =
          fwdRets.length > 0
            ? Math.pow(fwdEquity[fwdEquity.length - 1].value / 100, 252 / fwdRets.length) - 1
            : 0;

        let maxVal = 100;
        let maxDrawdown = 0;
        for (const pt of fwdEquity) {
          if (pt.value > maxVal) maxVal = pt.value;
          const dd = (maxVal - pt.value) / maxVal;
          if (dd > maxDrawdown) maxDrawdown = dd;
        }

        const msWeightsRecord: Record<string, number> = {};
        usedTickers.forEach((t, i) => (msWeightsRecord[t] = msWeights[i]));

        entries.push({
          cutoffDate: cutoffStr,
          markowitzExpectedReturn: markowitzResult.expectedReturn,
          markowitzExpectedVol: markowitzResult.volatility,
          markowitzExpectedSharpe: markowitzResult.sharpe,
          maxSharpeWeights: msWeightsRecord,
          actualReturn,
          actualVol: fwdVol,
          actualSharpe: fwdSharpe,
          cagr: fwdCagr,
          maxDrawdown,
          diff: actualReturn - markowitzResult.expectedReturn,
          success: actualReturn > 0,
          trainingStart,
          trainingEnd,
          forwardStart: fwdCommonDates[0],
          forwardEnd: fwdCommonDates[fwdCommonDates.length - 1],
        });
      } catch {
        continue;
      }
    }

    //  Aggregate statistics 
    const totalDates = entries.length;
    const positiveCount = entries.filter((e) => e.success).length;
    const beatCount = entries.filter((e) => e.diff >= 0).length;
    const avgExpectedReturn =
      entries.reduce((s, e) => s + e.markowitzExpectedReturn, 0) / totalDates;
    const avgActualReturn = entries.reduce((s, e) => s + e.actualReturn, 0) / totalDates;
    const avgDiff = entries.reduce((s, e) => s + e.diff, 0) / totalDates;
    const avgCagr = entries.reduce((s, e) => s + e.cagr, 0) / totalDates;
    const avgMaxDrawdown = entries.reduce((s, e) => s + e.maxDrawdown, 0) / totalDates;
    const avgSharpe = entries.reduce((s, e) => s + e.actualSharpe, 0) / totalDates;

    return {
      tickers,
      trainingYears: years,
      entries,
      aggregate: {
        winRate: totalDates > 0 ? positiveCount / totalDates : 0,
        beatRate: totalDates > 0 ? beatCount / totalDates : 0,
        avgExpectedReturn,
        avgActualReturn,
        avgDiff,
        avgCagr,
        avgMaxDrawdown,
        avgSharpe,
        totalDates,
        positiveCount,
        beatCount,
      },
    };
  });

// 
// Ticker metadata (sector, industry) from Yahoo Finance
// 

export interface TickerInfo {
  ticker: string;
  nombre: string;
  sector: string;
  industria: string;
}

export const getTickerInfo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ticker: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data }): Promise<TickerInfo> => {
    try {
      const yf = await getYF();
      const q = await yf.quoteSummary(data.ticker.toUpperCase(), {
        modules: ["assetProfile", "price"],
      });
      const ap = q?.assetProfile ?? {};
      const price = q?.price ?? {};
      return {
        ticker: data.ticker.toUpperCase(),
        nombre: (price?.longName as string) || (price?.shortName as string) || data.ticker,
        sector: (ap?.sector as string) || "No disponible",
        industria: (ap?.industry as string) || "No disponible",
      };
    } catch {
      return {
        ticker: data.ticker.toUpperCase(),
        nombre: data.ticker,
        sector: "No disponible",
        industria: "No disponible",
      };
    }
  });

// Benchmark symbols mapping
const BENCHMARK_SYMBOLS: Record<string, string> = {
  SPY: "SPY",
  QQQ: "QQQ",
  MERVAL: "^MERV",
  EEM: "EEM",
  CCL: "GGAL.BA", // proxy: CCL implícito vía GGAL (ADR ratio)
};

// Health
export const getHealth = createServerFn({ method: "GET" }).handler(async () => ({
  ok: true,
  ts: new Date().toISOString(),
}));

export const getBenchmarkHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ benchmark: z.string(), rango: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ date: string; close: number }[]> => {
    const yfSymbol = BENCHMARK_SYMBOLS[data.benchmark];
    if (!yfSymbol) return [];
    const days = rangoADias(data.rango);
    const period2 = new Date();
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const yf = await getYF();
      const rows = await yf.chart(yfSymbol, { period1, period2, interval: "1d" });
      const quotes: Array<{ date?: Date | null; close?: number | null }> = rows?.quotes ?? [];
      return quotes
        .filter((q) => q.date != null && q.close != null)
        .map((q) => ({
          date: (q.date as Date).toISOString().slice(0, 10),
          close: q.close as number,
        }));
    } catch {
      return [];
    }
  });
