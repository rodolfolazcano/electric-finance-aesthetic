// @ts-nocheck
// src/lib/estimaciones-earnings.server.ts
// Bootstrap no paramétrico para probabilidad de batir estimados de earnings

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const N_BOOTSTRAP = 100_000;

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
  } catch {}
  return _yf;
}

export interface EarningsHistoryPoint {
  fecha: string;
  periodo: string;
  epsEstimado: number;
  epsReal: number;
  sorpresa: number;
  sorpresaPct: number;
}

export interface EarningsEstimateResult {
  ticker: string;
  companyName: string;
  // Historial completo
  historial: EarningsHistoryPoint[];
  nTrimestres: number;
  hits: number;
  tasaHistorica: number;
  avgSorpresa: number;
  stdSorpresa: number;
  minSorpresa: number;
  maxSorpresa: number;
  // Bootstrap probabilities
  probSPositiva: number | null; // P(S > 0)
  probTendencia: number | null; // P(μ > 0)
  medianaSorpresa: number | null;
  icInf: number | null;
  icSup: number | null;
  cohenD: number;
  // Volatilidad post-earnings
  volPostEarnings: number | null;
  volClasificacion: string;
  sesgoPostEarnings: number | null;
  // Próximo reporte
  proximoReporte: string | null;
  proximoReporteEpoch: number | null; // epoch segundos (incluye hora del reporte)
  epsEstimadoProximo: number | null;
  diasHastaProximo: number | null;
}

export const getEarningsEstimates = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ tickers: z.array(z.string().min(1).max(20)).min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }): Promise<EarningsEstimateResult[]> => {
    const results: EarningsEstimateResult[] = [];
    for (const ticker of data.tickers) {
      results.push(await analizarEarningsTicker(ticker));
    }
    return results;
  });

/** Núcleo reusable del análisis por ticker (UI + cron de earnings).
 *  Bootstrap no paramétrico sobre sorpresas históricas de EPS + próximo reporte.
 */
export async function analizarEarningsTicker(
  ticker: string,
): Promise<EarningsEstimateResult> {
  try {
    const yf = await getYF();
    const qs = await yf.quoteSummary(ticker, {
      modules: ["price", "earnings", "calendarEvents", "earningsHistory"],
    });
    if (!qs) {
      return errorResult(ticker, "Sin datos");
    }

    const price = qs.price;
    const companyName = price?.longName || price?.shortName || ticker;
    const calendarEvents = qs.calendarEvents as any;
    const earningsData = qs.earnings as any;
    const earningsHistory = qs.earningsHistory as any;

    // Earnings chart data (quarterly actual vs estimate)
    const quarterly: any[] = earningsData?.earningsChart?.quarterly ?? [];
    const historial: EarningsHistoryPoint[] = quarterly
      .filter((q: any) => q.date && q.actual != null)
      .map((q: any) => {
        const epsEst = q.estimate ?? 0;
        const epsReal = q.actual ?? 0;
        const sorpresa = epsReal - epsEst;
        const sorpresaPct = epsEst !== 0 ? (sorpresa / Math.abs(epsEst)) * 100 : 0;
        return {
          fecha: String(q.date).slice(0, 10),
          periodo: `${q.quarter ?? "?"} ${q.year ?? ""}`,
          epsEstimado: epsEst,
          epsReal,
          sorpresa,
          sorpresaPct,
        };
      });

    // Also get earnings history for more data points
    const history: any[] = earningsHistory?.history ?? [];
    for (const h of history) {
      let eDate = "";
      if (h.earningsDate?.raw != null) {
        eDate = new Date(h.earningsDate.raw * 1000).toISOString().slice(0, 10);
      } else if (h.earningsDate?.fmt) {
        eDate = String(h.earningsDate.fmt).slice(0, 10);
      } else if (h.quarter?.fmt) {
        eDate = h.quarter.fmt;
      } else if (h.period) {
        eDate = h.period;
      }
      if (!eDate || historial.some((r) => r.fecha === eDate)) continue;
      const epsEst = h.epsEstimate?.raw ?? h.epsEstimate ?? 0;
      const epsReal = h.epsActual?.raw ?? h.epsActual ?? 0;
      const sorpresa = epsReal - epsEst;
      const sorpresaPct = epsEst !== 0 ? (sorpresa / Math.abs(epsEst)) * 100 : 0;
      historial.push({
        fecha: eDate,
        periodo: h.quarter?.fmt ?? h.period ?? "",
        epsEstimado: epsEst,
        epsReal,
        sorpresa,
        sorpresaPct,
      });
    }
    historial.sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (historial.length < 2) {
      return errorResult(ticker, "Historial insuficiente");
    }

    // Calculate metrics
    const sorpresasPct = historial.map((h) => h.sorpresaPct);
    const n = sorpresasPct.length;
    const hits = sorpresasPct.filter((s) => s > 0).length;
    const tasaHistorica = hits / n;
    const avgSorpresa = sorpresasPct.reduce((a, b) => a + b, 0) / n;
    const stdSorpresa =
      n > 1
        ? Math.sqrt(sorpresasPct.reduce((s, v) => s + (v - avgSorpresa) ** 2, 0) / (n - 1))
        : 0;
    const minSorpresa = Math.min(...sorpresasPct);
    const maxSorpresa = Math.max(...sorpresasPct);
    const cohenD = stdSorpresa > 0 ? avgSorpresa / stdSorpresa : 0;

    // Bootstrap: P(S > 0) — próxima sorpresa positiva
    const arr = sorpresasPct;
    let probSPositiva: number | null = null;
    let probTendencia: number | null = null;
    let medianaSorpresa: number | null = null;
    let icInf: number | null = null;
    let icSup: number | null = null;

    if (arr.length >= 2) {
      // P(S > 0): bootstrap de 1 observación
      let countPos = 0;
      for (let i = 0; i < N_BOOTSTRAP; i++) {
        const idx = Math.floor(Math.random() * arr.length);
        if (arr[idx] > 0) countPos++;
      }
      probSPositiva = countPos / N_BOOTSTRAP;

      // P(μ > 0): bootstrap de n observaciones
      const medias: number[] = [];
      for (let i = 0; i < N_BOOTSTRAP; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          const idx = Math.floor(Math.random() * arr.length);
          sum += arr[idx];
        }
        medias.push(sum / n);
      }
      medias.sort((a, b) => a - b);
      probTendencia = medias.filter((m) => m > 0).length / N_BOOTSTRAP;
      medianaSorpresa = medias[Math.floor(medias.length * 0.5)];
      icInf = medias[Math.floor(medias.length * 0.05)];
      icSup = medias[Math.floor(medias.length * 0.95)];
    }

    // Próximo reporte
    let proximoReporte: string | null = null;
    let proximoReporteEpoch: number | null = null;
    let epsEstimadoProximo: number | null = null;
    let diasHastaProximo: number | null = null;
    try {
      const earnings = calendarEvents?.earnings ?? {};
      const ed = earnings.earningsDate;
      if (ed) {
        const rawEpoch =
          typeof ed?.raw === "number"
            ? ed.raw > 1e12
              ? Math.round(ed.raw / 1000)
              : ed.raw
            : null;
        const d = new Date(ed);
        if (!isNaN(d.getTime())) {
          proximoReporteEpoch = rawEpoch ?? Math.round(d.getTime() / 1000);
          proximoReporte = d.toISOString().slice(0, 10);
          epsEstimadoProximo = earnings.epsEstimate ?? null;
          diasHastaProximo = Math.round((d.getTime() - Date.now()) / 86400000);
        }
      }
    } catch {}

    return {
      ticker,
      companyName,
      historial,
      nTrimestres: n,
      hits,
      tasaHistorica,
      avgSorpresa,
      stdSorpresa,
      minSorpresa,
      maxSorpresa,
      probSPositiva,
      probTendencia,
      medianaSorpresa,
      icInf,
      icSup,
      cohenD,
      volPostEarnings: null,
      volClasificacion: "S/D",
      sesgoPostEarnings: null,
      proximoReporte,
      proximoReporteEpoch,
      epsEstimadoProximo,
      diasHastaProximo,
    };
  } catch (e: any) {
    return errorResult(ticker, e?.message ?? "Error");
  }
}

function errorResult(ticker: string, error: string): EarningsEstimateResult {
  return {
    ticker,
    companyName: error,
    historial: [],
    nTrimestres: 0,
    hits: 0,
    tasaHistorica: 0,
    avgSorpresa: 0,
    stdSorpresa: 0,
    minSorpresa: 0,
    maxSorpresa: 0,
    probSPositiva: null,
    probTendencia: null,
    medianaSorpresa: null,
    icInf: null,
    icSup: null,
    cohenD: 0,
    volPostEarnings: null,
    volClasificacion: "S/D",
    sesgoPostEarnings: null,
    proximoReporte: null,
    proximoReporteEpoch: null,
    epsEstimadoProximo: null,
    diasHastaProximo: null,
  };
}
