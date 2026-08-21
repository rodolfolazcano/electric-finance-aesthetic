// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getYahooHistoricalServer } from "./market-data.functions";
import type { RangoHistorico } from "./market-data.types";
import { getCached, setCache } from "./cache";
import { detectarSenalesFundamentales, type TipoSenalFundamental } from "./senales-fundamentales";
import type { ReporteTrimestral, ScoreFundamentalSnapshot } from "./senales-fundamentales";

const CACHE_TTL = 24 * 60 * 60 * 1000;
const DEFAULT_COSTO = 0.0015;
const WALKFORWARD_SPLIT = 0.7;

type Confiabilidad = "baja" | "media" | "alta";

interface ResultadoSenalFundamental {
  fechaPublicacion: string;
  tipo: TipoSenalFundamental;
  valorIndicador: number;
  descripcion: string;
  precioEntrada: number;
  retorno5d: number | null;
  retorno20d: number | null;
  retorno60d: number | null;
  retorno120d: number | null;
}

interface ResumenFundamental {
  tipo: TipoSenalFundamental;
  ocurrencias: number;
  confiabilidad: Confiabilidad;
  winRate20d: number;
  retornoPromedio20d: number;
  retornoMediano20d: number;
  mejorCaso20d: number;
  peorCaso20d: number;
  equityCurve: { fecha: string; valor: number }[];
}

export interface BacktestFundamentalResult {
  ticker: string;
  periodo: string;
  totalSenales: number;
  porTipo: ResumenFundamental[];
  detalle: ResultadoSenalFundamental[];
  walkforward: { entrenamiento: ResumenFundamental[]; validacion: ResumenFundamental[] } | null;
  cacheKey: string;
  costoTransaccion: number;
  error?: string;
}

// Singleton de Yahoo Finance (mismo patrón que finance.functions.ts y capm.functions.ts)
let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  _yf = mod.default ?? mod;
  try {
    _yf = typeof _yf === "function" ? new _yf() : _yf;
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch { /* noop */ }
  return _yf;
}

export const getBacktestSenalesFundamentales = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      ticker: z.string().min(1).max(20),
      rango: z.enum(["1Y", "3Y", "5Y", "MAX"]).default("3Y"),
      costoTransaccion: z.number().min(0).max(0.05).default(DEFAULT_COSTO),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<BacktestFundamentalResult> => {
    const { ticker, rango, costoTransaccion } = data;
    const cacheKey = `btf_${ticker}_${rango}_c${(costoTransaccion * 10000).toFixed(0)}`;

    const cached = getCached<BacktestFundamentalResult>(cacheKey, CACHE_TTL);
    if (cached) return cached;

    const rangoMap: Record<string, RangoHistorico> = { "1Y": "1A", "3Y": "2A", "5Y": "5A", "MAX": "5A" };
    const rangoYahoo = rangoMap[rango] ?? "2A";

    const bars = await getYahooHistoricalServer({ data: { symbol: ticker, rango: rangoYahoo } }).catch(() => null);
    if (!bars || bars.length < 250) {
      return { ticker, periodo: rango, totalSenales: 0, porTipo: [], detalle: [], walkforward: null, cacheKey, costoTransaccion, error: `Histórico insuficiente para ${ticker}` };
    }

    const priceMap = new Map(bars.map((b) => [b.fecha, b.cierre]));
    const fechas = bars.map((b) => b.fecha);

    const reportes = await fetchEarningsHistory(ticker);
    const scores = await buildScoreSnapshots(ticker, fechas, priceMap);

    const senales = detectarSenalesFundamentales(reportes, scores);
    const detalle: ResultadoSenalFundamental[] = [];

    for (const s of senales) {
      const entryPrice = priceMap.get(s.fechaPublicacion) ?? 0;
      if (entryPrice <= 0) continue;

      const idx = fechas.indexOf(s.fechaPublicacion);
      if (idx === -1) continue;

      const getRet = (offset: number): number | null => {
        const targetIdx = idx + offset;
        if (targetIdx < 0 || targetIdx >= fechas.length) return null;
        const p = priceMap.get(fechas[targetIdx]) ?? 0;
        const retBruto = p > 0 ? p / entryPrice - 1 : null;
        return retBruto != null ? retBruto - costoTransaccion * 2 : null;
      };

      detalle.push({
        fechaPublicacion: s.fechaPublicacion,
        tipo: s.tipo,
        valorIndicador: s.valorIndicador,
        descripcion: s.descripcion,
        precioEntrada: entryPrice,
        retorno5d: getRet(5), retorno20d: getRet(20),
        retorno60d: getRet(60), retorno120d: getRet(120),
      });
    }

    const grouped = new Map<TipoSenalFundamental, ResultadoSenalFundamental[]>();
    for (const d of detalle) {
      if (!grouped.has(d.tipo)) grouped.set(d.tipo, []);
      grouped.get(d.tipo)!.push(d);
    }

    const confiabilidadFn = (n: number): Confiabilidad => n >= 30 ? "alta" : n >= 10 ? "media" : "baja";

    const porTipo: ResumenFundamental[] = [];
    for (const [tipo, items] of grouped) {
      const ret20s = items.map((i) => i.retorno20d).filter((r): r is number => r != null);
      if (ret20s.length === 0) continue;
      const wins = ret20s.filter((r) => r > 0).length;
      const sorted = [...ret20s].sort((a, b) => a - b);
      const n = ret20s.length;
      const mid = Math.floor(n / 2);
      const mediana = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      let valor = 1;
      const equityCurve: { fecha: string; valor: number }[] = [];
      for (const item of items.sort((a, b) => a.fechaPublicacion.localeCompare(b.fechaPublicacion))) {
        if (item.retorno20d != null) {
          valor *= (1 + item.retorno20d);
          equityCurve.push({ fecha: item.fechaPublicacion, valor });
        }
      }
      porTipo.push({
        tipo, ocurrencias: n, confiabilidad: confiabilidadFn(n),
        winRate20d: (wins / n) * 100,
        retornoPromedio20d: ret20s.reduce((s, r) => s + r, 0) / n,
        retornoMediano20d: mediana,
        mejorCaso20d: sorted[n - 1], peorCaso20d: sorted[0], equityCurve,
      });
    }

    // Walkforward
    const sortedDet = [...detalle].sort((a, b) => a.fechaPublicacion.localeCompare(b.fechaPublicacion));
    const splitIdx = Math.floor(sortedDet.length * WALKFORWARD_SPLIT);
    const walkforward = sortedDet.length >= 10 ? {
      entrenamiento: construirResumenFund(sortedDet.slice(0, splitIdx)),
      validacion: construirResumenFund(sortedDet.slice(splitIdx)),
    } : null;

    const result: BacktestFundamentalResult = {
      ticker, periodo: rango, totalSenales: detalle.length,
      porTipo, detalle, walkforward, cacheKey, costoTransaccion,
    };
    setCache(cacheKey, result);
    return result;
  });

async function fetchEarningsHistory(ticker: string): Promise<ReporteTrimestral[]> {
  try {
    const yf = await getYF();
    const qs = await yf.quoteSummary(ticker, { modules: ["earnings", "calendarEvents", "incomeStatementHistory"] });

    const reportes: ReporteTrimestral[] = [];
    const quarterly = qs?.earnings?.earningsChart?.quarterly ?? [];

    for (const q of quarterly) {
      const fechaPub = q.date ? String(q.date).slice(0, 10) : "";
      if (!fechaPub) continue;
      reportes.push({
        fechaPublicacion: fechaPub,
        periodoFiscal: `${q.quarter ?? "?"} ${q.year ?? ""}`,
        epsActual: q.actual ?? 0,
        epsEstimado: q.estimate ?? null,
        ingresoActual: q.revenue ?? 0,
        ingresoEstimado: null,
      });
    }

    const history = qs?.earnings?.earningsHistory?.history ?? [];
    for (const h of history) {
      let fechaPub = "";
      if (h.earningsDate?.raw != null) {
        fechaPub = new Date(h.earningsDate.raw * 1000).toISOString().slice(0, 10);
      } else if (h.earningsDate?.fmt) {
        fechaPub = String(h.earningsDate.fmt).slice(0, 10);
      } else if (h.quarter?.fmt) {
        fechaPub = h.quarter.fmt;
      } else if (h.period) {
        fechaPub = h.period;
      }
      if (!fechaPub || reportes.some((r) => r.fechaPublicacion === fechaPub)) continue;
      reportes.push({
        fechaPublicacion: fechaPub,
        periodoFiscal: h.quarter?.fmt ?? h.period ?? "",
        epsActual: h.epsActual?.raw ?? h.epsActual ?? 0,
        epsEstimado: h.epsEstimate?.raw ?? h.epsEstimate ?? null,
        ingresoActual: 0,
        ingresoEstimado: null,
      });
    }

    return reportes.sort((a, b) => a.fechaPublicacion.localeCompare(b.fechaPublicacion));
  } catch {
    return [];
  }
}

async function buildScoreSnapshots(
  ticker: string,
  fechas: string[],
  priceMap: Map<string, number>,
): Promise<ScoreFundamentalSnapshot[]> {
  try {
    const yf = await getYF();
    const qs = await yf.quoteSummary(ticker, {
      modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "incomeStatementHistory"],
    });

    const sd = qs?.summaryDetail;
    const fd = qs?.financialData;
    const ish = qs?.incomeStatementHistory?.incomeStatementHistory as Array<Record<string, any>> | undefined;

    const currentPE = rawNum(sd?.trailingPE);
    const roe = rawNum(fd?.returnOnEquity);
    const revGrowth = rawNum(fd?.revenueGrowth);
    const profitMargin = rawNum(fd?.profitMargins);
    const forwardPE = rawNum(sd?.forwardPE);
    const recMean = rawNum(fd?.recommendationMean);
    const fcf = rawNum(fd?.freeCashflow);

    // PE histórico desde income statements (point-in-time aproximado)
    const peHistoricos = new Map<string, number | null>();
    if (ish && currentPE && currentPE > 0) {
      for (const row of ish) {
        const endDate = row?.endDate?.fmt ? String(row.endDate.fmt).slice(0, 10) : null;
        const netIncome = row?.netIncome ? rawNum(row.netIncome) : null;
        if (endDate && netIncome && netIncome > 0) {
          const price = priceMap.get(endDate);
          if (price && price > 0) {
            peHistoricos.set(endDate, null);
          }
        }
      }
    }

    const snaps: ScoreFundamentalSnapshot[] = [];
    for (const f of fechas) {
      const price = priceMap.get(f) ?? 0;
      if (price <= 0) continue;
      const peEstimado = currentPE && currentPE > 0 ? price / (price / currentPE) : currentPE;
      snaps.push({
        fecha: f,
        scoreCompuesto: 50,
        roe, revenueGrowth: revGrowth, fcfYield: fcf != null && currentPE != null ? fcf / (currentPE * 1e6) : null,
        profitMargin, trailingPE: peEstimado, forwardPE, pePercentil: null, recomendacion: recMean,
      });
    }

    return snaps;
  } catch {
    return [];
  }
}

function rawNum(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val != null && "raw" in val && typeof (val as any).raw === "number") return (val as any).raw;
  return null;
}

function construirResumenFund(detalle: ResultadoSenalFundamental[]): ResumenFundamental[] {
  const grouped = new Map<TipoSenalFundamental, ResultadoSenalFundamental[]>();
  for (const d of detalle) {
    if (!grouped.has(d.tipo)) grouped.set(d.tipo, []);
    grouped.get(d.tipo)!.push(d);
  }
  const r: ResumenFundamental[] = [];
  const confFn = (n: number): Confiabilidad => n >= 30 ? "alta" : n >= 10 ? "media" : "baja";
  for (const [tipo, items] of grouped) {
    const ret20s = items.map((i) => i.retorno20d).filter((r): r is number => r != null);
    if (ret20s.length === 0) continue;
    const wins = ret20s.filter((r) => r > 0).length;
    const sorted = [...ret20s].sort((a, b) => a - b);
    const n = ret20s.length;
    const mid = Math.floor(n / 2);
    const mediana = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    let valor = 1;
    const equityCurve: { fecha: string; valor: number }[] = [];
    for (const item of items.sort((a, b) => a.fechaPublicacion.localeCompare(b.fechaPublicacion))) {
      if (item.retorno20d != null) { valor *= (1 + item.retorno20d); equityCurve.push({ fecha: item.fechaPublicacion, valor }); }
    }
    r.push({ tipo, ocurrencias: n, confiabilidad: confFn(n), winRate20d: (wins / n) * 100, retornoPromedio20d: ret20s.reduce((s, r) => s + r, 0) / n, retornoMediano20d: mediana, mejorCaso20d: sorted[n - 1], peorCaso20d: sorted[0], equityCurve });
  }
  return r;
}
