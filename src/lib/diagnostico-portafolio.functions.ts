import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PositionEnriquecida, PortfolioSummary } from "./diagnostico/types";
import { mean, std, logReturns, covMatrix, portfolioVariance, optimize, type Strategy, type OptimizationResult } from "./optimizer";
import { getYahooHistoricalServer } from "./market-data.functions";
import { getRiskFreeRateSync } from "./risk-free-rate";
import { getMarketNews, type MarketNewsResult } from "./market-news.functions";
import { getSectorAnalysis } from "./sector-analysis.functions";
import { AUTO_BENCHMARKS } from "./capm.functions";
import { linregress } from "./math/stats";
import { getSemaforoBatch } from "./finance.functions";

const FACTOR = 252;

// ──────────────────────────────────────────────────────────────────
// 1. COMPOSICIÓN
// ──────────────────────────────────────────────────────────────────

export interface ComposicionReport {
  porCategoria: Array<{ categoria: string; pesoPct: number; valorizado: number }>;
  porSubtipo: Array<{ subtipo: string; pesoPct: number; valorizado: number }>;
}

export function calcularComposicion(posiciones: PositionEnriquecida[]): ComposicionReport {
  const total = posiciones.reduce((s, p) => s + p.valorizado, 0) || 1;

  const catMap = new Map<string, { valorizado: number }>();
  const subMap = new Map<string, { valorizado: number }>();

  for (const p of posiciones) {
    const c = catMap.get(p.categoriaMacro) ?? { valorizado: 0 };
    c.valorizado += p.valorizado;
    catMap.set(p.categoriaMacro, c);

    const s = subMap.get(p.subtipo) ?? { valorizado: 0 };
    s.valorizado += p.valorizado;
    subMap.set(p.subtipo, s);
  }

  const porCategoria = [...catMap.entries()].map(([categoria, v]) => ({
    categoria, pesoPct: (v.valorizado / total) * 100, valorizado: v.valorizado,
  }));

  const porSubtipo = [...subMap.entries()].map(([subtipo, v]) => ({
    subtipo, pesoPct: (v.valorizado / total) * 100, valorizado: v.valorizado,
  }));

  return { porCategoria, porSubtipo };
}

// ──────────────────────────────────────────────────────────────────
// 2. YTM PONDERADA (sleeve Renta Fija)
// ──────────────────────────────────────────────────────────────────

export interface YTMPonderadaResult {
  ytmPonderada: number;
  teaPonderada: number;
  durationPonderada: number;
  posiciones: Array<{ ticker: string; tir: number; pesoRelativoRF: number }>;
}

export function calcularYTMPonderada(posiciones: PositionEnriquecida[]): YTMPonderadaResult {
  const rf = posiciones.filter(
    (p) => p.categoriaMacro === "RentaFija" && p.rentaFija != null && p.valorizado > 0,
  );
  const totalRF = rf.reduce((s, p) => s + p.valorizado, 0);
  if (totalRF <= 0) {
    return { ytmPonderada: 0, teaPonderada: 0, durationPonderada: 0, posiciones: [] };
  }

  const items = rf.map((p) => ({
    ticker: p.ticker,
    tir: p.rentaFija!.tir,
    tea: p.rentaFija!.tea,
    duration: p.rentaFija!.durationMacaulay,
    pesoRelativoRF: p.valorizado / totalRF,
  }));

  const ytmPonderada = items.reduce((s, i) => s + i.tir * i.pesoRelativoRF, 0);
  const teaPonderada = items.reduce((s, i) => s + i.tea * i.pesoRelativoRF, 0);
  const durationPonderada = items.reduce((s, i) => s + i.duration * i.pesoRelativoRF, 0);

  return {
    ytmPonderada,
    teaPonderada,
    durationPonderada,
    posiciones: items.map((i) => ({
      ticker: i.ticker, tir: i.tir, pesoRelativoRF: i.pesoRelativoRF,
    })),
  };
}

// ──────────────────────────────────────────────────────────────────
// 3. RENDIMIENTO Y RIESGO del sleeve Renta Variable
// ──────────────────────────────────────────────────────────────────

export interface RiesgoRVResult {
  tickers: string[];
  pesosActuales: number[];
  retornoEsperadoAnual: number;
  volatilidadAnual: number;
  sharpe: number;
  covMatrix: number[][];
}

export const calcularRiesgoRV = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ posiciones: z.array(z.any()) }).parse(input),
  )
  .handler(async ({ data }): Promise<RiesgoRVResult> => {
    const posiciones = data.posiciones as PositionEnriquecida[];
    const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");

    if (rv.length < 2) {
      const single = rv.length === 1 ? rv[0] : null;
      if (!single) {
        return { tickers: [], pesosActuales: [], retornoEsperadoAnual: 0, volatilidadAnual: 0, sharpe: 0, covMatrix: [] };
      }
      const bars = await getYahooHistoricalServer({ data: { symbol: single.ticker, rango: "2A" } }).catch(() => null);
      if (bars && bars.length >= 30) {
        const closes = bars.map((b) => b.cierre);
        const rets = logReturns(closes);
        const meanR = mean(rets) * 252;
        const volD = std(rets) * Math.sqrt(252);
        const sharpe = volD > 0 ? (meanR - getRiskFreeRateSync("USD")) / volD : 0;
        return {
          tickers: [single.ticker], pesosActuales: [1],
          retornoEsperadoAnual: meanR, volatilidadAnual: volD, sharpe, covMatrix: [],
        };
      }
      return {
        tickers: [single.ticker], pesosActuales: [1],
        retornoEsperadoAnual: 0, volatilidadAnual: 0, sharpe: 0, covMatrix: [],
      };
    }

    const totalRV = rv.reduce((s, p) => s + p.valorizado, 0) || 1;
    const pesosActuales = rv.map((p) => p.valorizado / totalRV);
    const tickers = rv.map((p) => p.ticker);

    const histData = await Promise.all(
      tickers.map((t) =>
        getYahooHistoricalServer({ data: { symbol: t, rango: "2A" } })
          .then((bars) => bars.map((b) => b.cierre))
          .catch(() => null as number[] | null),
      ),
    );

    const validIdx = histData.map((h, i) => (h && h.length >= 30 ? i : -1)).filter((i) => i >= 0);
    if (validIdx.length < 2) {
      return { tickers, pesosActuales, retornoEsperadoAnual: 0, volatilidadAnual: 0, sharpe: 0, covMatrix: [] };
    }

    const validTickers = validIdx.map((i) => tickers[i]);
    const validPesos = validIdx.map((i) => pesosActuales[i]);
    const validHist = validIdx.map((i) => histData[i]!);

    const returnsMat = validHist.map((closes) => logReturns(closes));
    const minLen = Math.min(...returnsMat.map((r) => r.length));
    const aligned = returnsMat.map((r) => r.slice(r.length - minLen));
    const means = aligned.map((r) => mean(r));
    const vols = aligned.map((r) => std(r));
    const cov = covMatrix(aligned);

    const retEsp = dot(validPesos, means) * FACTOR;
    const vol = Math.sqrt(portfolioVariance(validPesos, cov) * FACTOR);
    const sharpe = vol > 0 ? (retEsp - getRiskFreeRateSync("USD")) / vol : 0;

    return {
      tickers: validTickers,
      pesosActuales: validPesos,
      retornoEsperadoAnual: retEsp,
      volatilidadAnual: vol,
      sharpe,
      covMatrix: cov.map((r) => r.map((v) => v * FACTOR)),
    };
  });

// ──────────────────────────────────────────────────────────────────
// 4. FLUJO DE FONDOS PROYECTADO
// ──────────────────────────────────────────────────────────────────

export interface FlujoProyectado {
  mensual: Array<{ mes: string; monto: number }>;
  detalle: Array<{ ticker: string; fecha: string; monto: number; subtipo: string }>;
  totalPorCobrar: number;
}

export function proyectarFlujoDeFondos(posiciones: PositionEnriquecida[]): FlujoProyectado {
  const rf = posiciones.filter(
    (p) => p.categoriaMacro === "RentaFija" && p.rentaFija?.flujos?.length,
  );

  const detalle: FlujoProyectado["detalle"] = [];
  for (const p of rf) {
    for (const f of p.rentaFija!.flujos) {
      detalle.push({
        ticker: p.ticker,
        fecha: f.fecha,
        monto: f.monto * p.cantidad,
        subtipo: p.subtipo,
      });
    }
  }
  detalle.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const mesMap = new Map<string, number>();
  for (const d of detalle) {
    const mes = d.fecha.slice(0, 7);
    mesMap.set(mes, (mesMap.get(mes) ?? 0) + d.monto);
  }
  const mensual = [...mesMap.entries()]
    .map(([mes, monto]) => ({ mes, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const totalPorCobrar = detalle.reduce((s, d) => s + d.monto, 0);

  return { mensual, detalle, totalPorCobrar };
}

// ──────────────────────────────────────────────────────────────────
// 5. NOTICIAS DEL PORTAFOLIO
// ──────────────────────────────────────────────────────────────────

export const getNoticiasPortafolio = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ tickers: z.array(z.string()).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const base = await getMarketNews();
    if (!data.tickers?.length) return base;

    const lower = data.tickers.map((t) => t.toLowerCase());
    const filtrados = base.items.filter((item) => {
      const text = (item.title + " " + (item.summary ?? "")).toLowerCase();
      return lower.some((t) => text.includes(t));
    });

    return { ...base, items: filtrados };
  });

// ──────────────────────────────────────────────────────────────────
// 6. MÉTRICAS SECTORIALES (RV)
// ──────────────────────────────────────────────────────────────────

export const getSectoresPortafolio = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ posiciones: z.array(z.any()) }).parse(input),
  )
  .handler(async ({ data }) => {
    const posiciones = data.posiciones as PositionEnriquecida[];
    const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");
    const tickers = rv.map((p) => ({ ticker: p.ticker, nombre: p.ticker }));

    if (tickers.length === 0) return { tickers: [], sectores: [], errores: [] };

    return getSectorAnalysis({
      data: { sector: "Portafolio", industry: "Multi", tickers },
    }).catch(() => ({ tickers: [], sectores: [], errores: ["Error en análisis sectorial"] }));
  });

// ──────────────────────────────────────────────────────────────────
// 7. CAPM DEL PORTAFOLIO (serie compuesta via linregress)
// ──────────────────────────────────────────────────────────────────

export interface CAPMPortafolioEntry {
  benchmark: string;
  beta: number;
  alpha: number;
  alphaAnual: number;
  rSquared: number;
  correlacion: number;
  pValue: number;
  observaciones: number;
}

export const getCAPMPortafolio = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ posiciones: z.array(z.any()) }).parse(input),
  )
  .handler(async ({ data }): Promise<CAPMPortafolioEntry[]> => {
    const posiciones = data.posiciones as PositionEnriquecida[];
    const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");
    if (rv.length === 0) return [];

    const totalRV = rv.reduce((s, p) => s + p.valorizado, 0) || 1;
    const pesos = rv.map((p) => p.valorizado / totalRV);

    const histData = await Promise.all(
      rv.map((p) =>
        getYahooHistoricalServer({ data: { symbol: p.ticker, rango: "2A" } })
          .then((bars) => bars.map((b) => ({ fecha: b.fecha, cierre: b.cierre })))
          .catch(() => null),
      ),
    );

    const valid = histData
      .map((h, i) => (h && h.length >= 30 ? { bars: h, peso: pesos[i] } : null))
      .filter((x): x is { bars: { fecha: string; cierre: number }[]; peso: number } => x != null);

    if (valid.length === 0) return [];

    const fechasComunes = new Set<string>();
    for (const v of valid) for (const b of v.bars) fechasComunes.add(b.fecha);

    const fechasRV = [...fechasComunes].sort();
    const fechaMin = fechasRV[0];
    for (const v of valid) {
      const fechasSet = new Set(v.bars.map((b) => b.fecha));
      const validas = fechasRV.filter((f) => fechasSet.has(f));
      if (validas.length < fechasRV.length) {
        // rebuild common dates
        for (const f of fechasRV) if (!fechasSet.has(f)) fechasComunes.delete(f);
      }
    }

    const fechas = [...fechasComunes].sort();
    if (fechas.length < 30) return [];

    const priceMaps = valid.map((v) => new Map(v.bars.map((b) => [b.fecha, b.cierre])));

    const portPrices: number[] = [];
    for (const f of fechas) {
      let p = 0;
      for (let i = 0; i < valid.length; i++) {
        p += (priceMaps[i].get(f) ?? 0) * valid[i].peso;
      }
      portPrices.push(p);
    }

    const portReturns = logReturns(portPrices);

    // Benchmarks a probar
    const benchTickers = ["SPY", "^MERV", "QQQ", "XLK", "EEM", "TLT", "GLD", "IWM"];
    const results: CAPMPortafolioEntry[] = [];

    await Promise.all(
      benchTickers.map(async (bm) => {
        try {
          const bmBars = await getYahooHistoricalServer({ data: { symbol: bm, rango: "2A" } });
          const bmMap = new Map(bmBars.map((b) => [b.fecha, b.cierre]));
          const bmPrices = fechas.map((f) => bmMap.get(f) ?? 0).filter((p) => p > 0);
          const bmReturns = logReturns(bmPrices);

          const minN = Math.min(portReturns.length, bmReturns.length);
          const py = portReturns.slice(portReturns.length - minN);
          const px = bmReturns.slice(bmReturns.length - minN);

          if (px.length < 30) return;

          const reg = linregress(px, py);
          const annualAlpha = reg.intercept * 252;
          const correlacion = Math.sign(reg.slope) * Math.sqrt(reg.r2);

          results.push({
            benchmark: bm,
            beta: reg.slope,
            alpha: reg.intercept,
            alphaAnual: annualAlpha,
            rSquared: reg.r2,
            correlacion,
            pValue: reg.pValue,
            observaciones: px.length,
          });
        } catch { /* skip */ }
      }),
    );

    return results.sort((a, b) => b.rSquared - a.rSquared);
  });

// ──────────────────────────────────────────────────────────────────
// 8. OPTIMIZACIÓN solo del sleeve Renta Variable
// ──────────────────────────────────────────────────────────────────

export const optimizarSleeveRV = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      posiciones: z.array(z.any()),
      estrategia: z.enum(["min-variance", "max-sharpe", "equal-weight", "inverse-vol", "markowitz"] as const),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const posiciones = data.posiciones as PositionEnriquecida[];
    const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");

    if (rv.length < 2) return null;

    const tickers = rv.map((p) => p.ticker);

    const histData = await Promise.all(
      tickers.map((t) =>
        getYahooHistoricalServer({ data: { symbol: t, rango: "2A" } })
          .then((bars) => bars.map((b) => b.cierre))
          .catch(() => null as number[] | null),
      ),
    );

    const validIdx = histData.map((h, i) => (h && h.length >= 30 ? i : -1)).filter((i) => i >= 0);
    if (validIdx.length < 2) return null;

    const validTickers = validIdx.map((i) => tickers[i]);
    const validHist = validIdx.map((i) => histData[i]!);

    const returnsMat = validHist.map((closes) => logReturns(closes));
    const minLen = Math.min(...returnsMat.map((r) => r.length));
    const aligned = returnsMat.map((r) => r.slice(r.length - minLen));

    const means = aligned.map((r) => mean(r));
    const vols = aligned.map((r) => std(r));
    const cov = covMatrix(aligned);

    const result = optimize(data.estrategia, {
      meanDaily: means,
      volDaily: vols,
      cov,
    });

    const pesoRVsobreTotal = rv.reduce((s, p) => s + p.valorizado, 0) /
      (posiciones.reduce((s, p) => s + p.valorizado, 0) || 1);

    const weights = validIdx.map((i, idx) => ({
      ticker: tickers[i],
      pesoSleeveRV: result.weights[idx],
      pesoPortafolioTotal: result.weights[idx] * pesoRVsobreTotal,
    }));

    return {
      weights,
      expectedReturnAnual: result.expectedReturn,
      volatilityAnual: result.volatility,
      sharpe: result.sharpe,
      strategy: data.estrategia,
    };
  });

// ──────────────────────────────────────────────────────────────────
// 9. ANÁLISIS TÉCNICO-FUNDAMENTAL por activo RV
// ──────────────────────────────────────────────────────────────────

export const getAnalisisRV = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ posiciones: z.array(z.any()) }).parse(input),
  )
  .handler(async ({ data }) => {
    const posiciones = data.posiciones as PositionEnriquecida[];
    const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");
    const tickers = rv.map((p) => p.ticker);

    if (tickers.length === 0) return [];

    return getSemaforoBatch({ data: { tickers, rango: "1A" } }).catch(() => []);
  });

// ──────────────────────────────────────────────────────────────────
// 10. BACKTESTING: "buena salud" condicional a señal técnica
// ──────────────────────────────────────────────────────────────────

export interface FechaSalud {
  fecha: string;
  scoreCompuesto: number;
  retorno30d: number | null;
  retorno60d: number | null;
  retorno90d: number | null;
}

export interface BacktestSaludResult {
  fechasSalud: FechaSalud[];
  ventanaEvaluacion: number;
  umbral: number;
  resumen: {
    totalFechas: number;
    promedioRetorno30d: number | null;
    medianaRetorno30d: number | null;
    hitRate30d: number;
    peorCaso30d: number | null;
    mejorCaso30d: number | null;
  };
  nota: string;
}

export const backtestSaludPortafolio = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      posiciones: z.array(z.any()),
      umbral: z.number().default(0.3),
      ventanaForward: z.number().default(30),
      paso: z.number().default(5),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<BacktestSaludResult> => {
    const posiciones = data.posiciones as PositionEnriquecida[];
    const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");
    const umbral = data.umbral;
    const ventanaForward = data.ventanaForward;
    const paso = data.paso;

    if (rv.length === 0) {
      return {
        fechasSalud: [], ventanaEvaluacion: ventanaForward, umbral,
        resumen: { totalFechas: 0, promedioRetorno30d: null, medianaRetorno30d: null, hitRate30d: 0, peorCaso30d: null, mejorCaso30d: null },
        nota: "No hay activos de Renta Variable para backtestear.",
      };
    }

    const totalRV = rv.reduce((s, p) => s + p.valorizado, 0) || 1;
    const pesos = rv.map((p) => p.valorizado / totalRV);

    // 1. Obtener históricos de 2 años para cada ticker RV
    const rawHist = await Promise.all(
      rv.map((p) =>
        getYahooHistoricalServer({ data: { symbol: p.ticker, rango: "2A" } })
          .then((bars) => bars.map((b) => ({ fecha: b.fecha, cierre: b.cierre })))
          .catch(() => null),
      ),
    );

    const valid = rawHist
      .map((h, i) => (h && h.length >= 250 ? { bars: h, peso: pesos[i] } : null))
      .filter((x): x is { bars: { fecha: string; cierre: number }[]; peso: number } => x != null);

    if (valid.length < 2) {
      return {
        fechasSalud: [], ventanaEvaluacion: ventanaForward, umbral,
        resumen: { totalFechas: 0, promedioRetorno30d: null, medianaRetorno30d: null, hitRate30d: 0, peorCaso30d: null, mejorCaso30d: null },
        nota: "Datos históricos insuficientes para al menos 2 activos RV (mín. 250 sesiones).",
      };
    }

    // 2. Alinear fechas comunes
    const fechasSet = new Set<string>();
    for (const v of valid) for (const b of v.bars) fechasSet.add(b.fecha);
    // Intersect: mantener solo fechas que todos tengan
    for (const v of valid) {
      const set = new Set(v.bars.map((b) => b.fecha));
      for (const f of fechasSet) if (!set.has(f)) fechasSet.delete(f);
    }
    const fechas = [...fechasSet].sort();
    if (fechas.length < 250) {
      return {
        fechasSalud: [], ventanaEvaluacion: ventanaForward, umbral,
        resumen: { totalFechas: 0, promedioRetorno30d: null, medianaRetorno30d: null, hitRate30d: 0, peorCaso30d: null, mejorCaso30d: null },
        nota: `Solo ${fechas.length} fechas comunes — se necesitan al menos 250.`,
      };
    }

    // 3. Matriz de precios alineada: filas = tickers, columnas = fechas
    const priceMaps = valid.map((v) => new Map(v.bars.map((b) => [b.fecha, b.cierre])));
    const closesByTicker = valid.map(() => {
      const arr: number[] = new Array(fechas.length);
      return arr;
    });
    const portPriceSeries: number[] = new Array(fechas.length);
    for (let t = 0; t < fechas.length; t++) {
      let portP = 0;
      for (let i = 0; i < valid.length; i++) {
        const p = priceMaps[i].get(fechas[t]) ?? 0;
        closesByTicker[i][t] = p;
        portP += p * valid[i].peso;
      }
      portPriceSeries[t] = portP;
    }

    // 4. Función de helpers técnicos puros (sin deps externas)
    function calcSMA(arr: number[], period: number, hasta: number): number | null {
      if (hasta < period - 1) return null;
      let s = 0;
      for (let i = hasta - period + 1; i <= hasta; i++) s += arr[i];
      return s / period;
    }

    function calcRSI(arr: number[], period: number, hasta: number): number {
      if (hasta < period) return 50;
      let gain = 0, loss = 0;
      for (let i = hasta - period + 1; i <= hasta; i++) {
        const d = arr[i] - arr[i - 1];
        if (d > 0) gain += d; else loss -= d;
      }
      const avgG = gain / period, avgL = loss / period;
      if (avgL === 0) return 100;
      const rs = avgG / avgL;
      return 100 - 100 / (1 + rs);
    }

    function calcMACD(arr: number[], hasta: number): { macd: number; signal: number } {
      const fast = 12, slow = 26, signal = 9;
      const emaFast = calcEMA(arr, fast, hasta);
      const emaSlow = calcEMA(arr, slow, hasta);
      const macdV = emaFast !== null && emaSlow !== null ? emaFast - emaSlow : 0;
      const macdArr: number[] = [];
      for (let t = slow; t <= hasta; t++) {
        const ef = calcEMA(arr, fast, t);
        const es = calcEMA(arr, slow, t);
        if (ef !== null && es !== null) macdArr.push(ef - es);
      }
      const sig = macdArr.length >= signal ? calcEMASimple(macdArr, signal, macdArr.length - 1) : 0;
      return { macd: macdV, signal: sig };
    }

    function calcEMA(arr: number[], period: number, hasta: number): number | null {
      if (hasta < period - 1) return null;
      const k = 2 / (period + 1);
      let ema = arr.slice(0, period).reduce((s, v) => s + v, 0) / period;
      for (let i = period; i <= hasta; i++) ema = arr[i] * k + ema * (1 - k);
      return ema;
    }

    function calcEMASimple(arr: number[], period: number, hasta: number): number {
      if (hasta < period - 1) return arr[hasta] ?? 0;
      const k = 2 / (period + 1);
      let ema = arr.slice(0, period).reduce((s, v) => s + v, 0) / period;
      for (let i = period; i <= hasta; i++) ema = arr[i] * k + ema * (1 - k);
      return ema;
    }

    function findLocalExtremaSimple(
      prices: number[],
      hasta: number,
    ): { soportes: number[]; resistencias: number[] } {
      const window = 5;
      const sop: number[] = [];
      const res: number[] = [];
      for (let i = window; i <= hasta - window; i++) {
        const seg = prices.slice(i - window, i + window + 1);
        const mid = prices[i];
        let esMin = true, esMax = true;
        for (const v of seg) {
          if (v < mid) esMin = false;
          if (v > mid) esMax = false;
        }
        if (esMin) sop.push(mid);
        if (esMax) res.push(mid);
      }
      return { soportes: sop, resistencias: res };
    }

    function calcSoportesResistencias(
      prices: number[], hasta: number, current: number,
    ): { soportes: { precio: number }[]; resistencias: { precio: number }[]; soporteMasCercano: { precio: number } | null; resistenciaMasCercana: { precio: number } | null; distanciaSoportePct: number; distanciaResistenciaPct: number } {
      const { soportes, resistencias } = findLocalExtremaSimple(prices, hasta);
      const sp = soportes.filter((p) => p < current);
      const rs = resistencias.filter((p) => p > current);
      const sopCercano = sp.length > 0 ? Math.max(...sp) : null;
      const resCercano = rs.length > 0 ? Math.min(...rs) : null;
      return {
        soportes: sp.map((p) => ({ precio: p })),
        resistencias: rs.map((p) => ({ precio: p })),
        soporteMasCercano: sopCercano != null ? { precio: sopCercano } : null,
        resistenciaMasCercana: resCercano != null ? { precio: resCercano } : null,
        distanciaSoportePct: sopCercano != null ? ((current - sopCercano) / sopCercano) * 100 : 0,
        distanciaResistenciaPct: resCercano != null ? ((resCercano - current) / current) * 100 : 0,
      };
    }

    function scoreTecnicoSimple(closes: number[], hasta: number): number {
      if (hasta < 60) return 0;
      const current = closes[hasta];
      const sma50 = calcSMA(closes, 50, hasta);
      const sma200 = calcSMA(closes, 200, hasta);
      const rsiVal = calcRSI(closes, 14, hasta);
      const { macd: macdV, signal: macdS } = calcMACD(closes, hasta);
      const sr = calcSoportesResistencias(closes, hasta, current);

      // Score de tendencia (peso 0.4)
      let tendenciaScore = 0;
      if (sma50 != null && sma200 != null) {
        if (current > sma50 && sma50 > sma200) tendenciaScore = 2;
        else if (current < sma50 && sma50 < sma200) tendenciaScore = -2;
        else if (sma50 > sma200) tendenciaScore = 0.5;
        else tendenciaScore = -0.5;
      }

      // Score de momentum (peso 0.3)
      let momentumScore = 0;
      if (rsiVal > 70) momentumScore = -1;
      else if (rsiVal < 30) momentumScore = -0.5;
      if (macdV > macdS && macdV > 0) momentumScore += 1;
      else if (macdV > macdS) momentumScore += 0.5;
      else if (macdV <= macdS && macdV > 0) momentumScore -= 0.5;
      else momentumScore -= 1;

      // Score de soporte/resistencia (peso 0.2)
      const srScore = sr.soporteMasCercano != null ? 0.5 : 0;

      const scoreFinal = tendenciaScore * 0.4 + momentumScore * 0.3 + srScore * 0.2;
      return scoreFinal;
    }

    // 5. Recorrer ventana móvil
    const fechasSalud: FechaSalud[] = [];
    const startIdx = 250;

    for (let t = startIdx; t < fechas.length - ventanaForward - 1; t += paso) {
      // Score compuesto ponderado del portafolio
      let scoreCompuesto = 0;
      for (let i = 0; i < valid.length; i++) {
        const tickerCloses = closesByTicker[i];
        const score = scoreTecnicoSimple(tickerCloses, t);
        scoreCompuesto += score * valid[i].peso;
      }

      if (scoreCompuesto >= umbral) {
        // Retornos forward
        const ret30 = ventanaForward >= 30 ? retornoPct(portPriceSeries, t, 30) : null;
        const ret60 = ventanaForward >= 60 ? retornoPct(portPriceSeries, t, 60) : null;
        const ret90 = ventanaForward >= 90 ? retornoPct(portPriceSeries, t, 90) : null;

        fechasSalud.push({
          fecha: fechas[t],
          scoreCompuesto: Math.round(scoreCompuesto * 100) / 100,
          retorno30d: ret30,
          retorno60d: ret60,
          retorno90d: ret90,
        });
      }
    }

    // 6. Agregar resultados
    const rets30 = fechasSalud.map((f) => f.retorno30d).filter((r): r is number => r != null);
    const n = rets30.length;
    const sorted = [...rets30].sort((a, b) => a - b);
    const promedio = n > 0 ? rets30.reduce((s, r) => s + r, 0) / n : null;
    const mediana = n > 0 ? (n % 2 === 1 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null;
    const hitRate = n > 0 ? (rets30.filter((r) => r > 0).length / n) * 100 : 0;
    const peor = n > 0 ? sorted[0] : null;
    const mejor = n > 0 ? sorted[n - 1] : null;

    return {
      fechasSalud,
      ventanaEvaluacion: ventanaForward,
      umbral,
      resumen: {
        totalFechas: fechasSalud.length,
        promedioRetorno30d: promedio != null ? Math.round(promedio * 100) / 100 : null,
        medianaRetorno30d: mediana != null ? Math.round(mediana * 100) / 100 : null,
        hitRate30d: Math.round(hitRate * 100) / 100,
        peorCaso30d: peor != null ? Math.round(peor * 100) / 100 : null,
        mejorCaso30d: mejor != null ? Math.round(mejor * 100) / 100 : null,
      },
      nota: "Rendimiento histórico condicional a una señal técnica pasada — no es una proyección ni garantía de resultados futuros.",
    };
  });

function retornoPct(series: number[], desde: number, ventana: number): number | null {
  const hasta = desde + ventana;
  if (hasta >= series.length || series[desde] <= 0) return null;
  return ((series[hasta] - series[desde]) / series[desde]) * 100;
}

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
