/**
 * src/lib/backtesting/motor-backtest.functions.ts
 *
 * Motor de backtesting point-in-time para el score sectorial ponderado.
 *
 * Objetivo: evaluar si los scores generados por `getScorePonderado` en fechas
 * pasadas anticiparon retornos forward reales, usando únicamente información
 * disponible hasta cada fecha de observación.
 *
 * Diseño:
 *   - Universo fijo: 4 tickers NYSE/NASDAQ por cada uno de los 11 sectores.
 *   - Ventana: 2020-01-01 a hoy (configurable).
 *   - Frecuencia: primer día hábil (lunes-viernes) de cada mes.
 *   - Horizontes forward: 1M, 3M, 6M, 12M.
 *   - Retornos: total (precio + dividendos implícitos vía adjusted close).
 *   - Benchmarks: ETF sectorial correspondiente y SPY (proxy S&P 500).
 *   - subScores: fundamentales de `getFundamentalSnapshot` + técnicos derivados
 *     de la serie de precios cortada en la fecha de observación.
 *
 * TODO Etapa 4: agregar métricas agregadas (Sharpe, drawdown, Information
 * Coefficient, hit-rate, quintiles de score, etc.) en un archivo separado que
 * consuma las filas generadas aquí. Este archivo solo produce el panel crudo.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchYahooChart } from "../yahoo-http";
import { getFundamentalSnapshot, type SnapshotFundamental } from "./snapshot-fundamentales.functions";
import { getScorePonderado } from "../daily-opportunities.functions";
import { buscarSectorPorTicker } from "../sectores/perfiles-sector";
import type { Recomendacion } from "../crm/recomendaciones.types";

//  Constantes del experimento 

export const SPY_BENCHMARK = "SPY";

export const UNIVERSO_BACKTEST_INICIAL: Record<string, string[]> = {
  "Tecnología": ["AAPL", "MSFT", "NVDA", "AMD"],
  "Servicios de Comunicación": ["GOOGL", "META", "NFLX", "VZ"],
  "Consumo Cíclico": ["AMZN", "TSLA", "HD", "MCD"],
  "Energía": ["XOM", "CVX", "COP", "SLB"],
  "Servicios Financieros": ["JPM", "BAC", "WFC", "GS"],
  "Acciones Industriales": ["GE", "CAT", "UPS", "RTX"],
  "Defensiva del Consumidor": ["WMT", "PG", "KO", "PEP"],
  "Cuidado de la Salud": ["JNJ", "PFE", "UNH", "ABBV"],
  "Utilidades": ["NEE", "DUK", "SO", "D"],
  "Materiales Básicos": ["LIN", "SHW", "FCX", "NEM"],
  "Bienes Raíces": ["AMT", "PLD", "EQIX", "O"],
};

export const SECTOR_ETF: Record<string, string> = {
  "Tecnología": "XLK",
  "Servicios de Comunicación": "XLC",
  "Consumo Cíclico": "XLY",
  "Energía": "XLE",
  "Servicios Financieros": "XLF",
  "Acciones Industriales": "XLI",
  "Defensiva del Consumidor": "XLP",
  "Cuidado de la Salud": "XLV",
  "Utilidades": "XLU",
  "Materiales Básicos": "XLB",
  "Bienes Raíces": "XLRE",
};

//  Tipos 

export interface PriceBar {
  date: string; // ISO YYYY-MM-DD
  close: number;
  adjClose: number;
}

export interface BacktestRow {
  fecha: string;
  ticker: string;
  sector: string;
  score: number | null;
  retorno1M: number | null;
  retorno3M: number | null;
  retorno6M: number | null;
  retorno12M: number | null;
  excesoVsETF1M: number | null;
  excesoVsETF3M: number | null;
  excesoVsETF6M: number | null;
  excesoVsETF12M: number | null;
  excesoVsSP5001M: number | null;
  excesoVsSP5003M: number | null;
  excesoVsSP5006M: number | null;
  excesoVsSP50012M: number | null;
}

export interface BacktestMeta {
  fechaInicio: string;
  fechaFin: string;
  totalObservaciones: number;
  totalFilas: number;
  tickers: number;
  fechas: string[];
}

export interface BacktestResult {
  rows: BacktestRow[];
  limitaciones: string[];
  meta: BacktestMeta;
}

//  Helpers de fechas 

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISOUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addMonthsUTC(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

/**
 * Primer día hábil (lunes-viernes) del mes. No considera feriados de mercado;
 * el lookup de precios se encarga de encontrar la primera barra disponible.
 */
function primerDiaHabilDelMes(year: number, month: number): Date {
  let d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = addDaysUTC(d, 1);
  }
  return d;
}

export function generarFechasObservacion(fechaInicio: string, fechaFin: string): string[] {
  const inicio = parseISOUTC(fechaInicio);
  const fin = parseISOUTC(fechaFin);
  const fechas: string[] = [];

  let cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  while (cursor <= fin) {
    const candidata = primerDiaHabilDelMes(cursor.getUTCFullYear(), cursor.getUTCMonth());
    if (candidata >= inicio && candidata <= fin) {
      const s = iso(candidata);
      if (fechas.length === 0 || fechas[fechas.length - 1] !== s) {
        fechas.push(s);
      }
    }
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return fechas;
}

//  Helpers de precios 

export async function fetchAdjustedHistory(symbol: string): Promise<PriceBar[]> {
  const json = await fetchYahooChart(symbol, "max", "1d");
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const ts: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjcloseArr: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const closes: (number | null)[] = quote.close ?? [];

  const out: PriceBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null || !isFinite(close)) continue;
    const adj = adjcloseArr[i] != null && isFinite(adjcloseArr[i] as number) ? (adjcloseArr[i] as number) : close;
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out.push({ date, close, adjClose: adj });
  }
  return out;
}

export function buildDateIndex(bars: PriceBar[]): Map<string, PriceBar> {
  const idx = new Map<string, PriceBar>();
  for (const b of bars) idx.set(b.date, b);
  return idx;
}

/** Última barra disponible en o antes de targetDate. */
export function findBarFloor(bars: PriceBar[], targetDate: string): PriceBar | null {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (bars[mid].date <= targetDate) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 ? bars[ans] : null;
}

//  Helpers matemáticos 

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function covariance(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - ma) * (b[i] - mb);
  return sum / a.length;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Mapea value linealmente de [min, max] a [0, 1] con clamp. */
function norm01(value: number, min: number, max: number): number | null {
  if (!isFinite(value)) return null;
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

//  Cálculo de subScores técnicos 

export function calcularBeta(
  stockBars: PriceBar[],
  spyBars: PriceBar[],
  idx: number,
  windowDays = 126,
): number | null {
  const spyIdx = buildDateIndex(spyBars);
  const stockCloses: number[] = [];
  const spyCloses: number[] = [];

  const start = Math.max(0, idx - windowDays + 1);
  for (let i = start; i <= idx; i++) {
    const sb = stockBars[i];
    const mb = spyIdx.get(sb.date);
    if (!mb) continue;
    stockCloses.push(sb.adjClose);
    spyCloses.push(mb.adjClose);
  }

  if (stockCloses.length < 30) return null;

  const stockReturns: number[] = [];
  const spyReturns: number[] = [];
  for (let i = 1; i < stockCloses.length; i++) {
    stockReturns.push(stockCloses[i] / stockCloses[i - 1] - 1);
    spyReturns.push(spyCloses[i] / spyCloses[i - 1] - 1);
  }

  const varM = covariance(spyReturns, spyReturns);
  if (varM === 0) return null;
  return covariance(stockReturns, spyReturns) / varM;
}

export function computeTechnicalSubScores(
  bars: PriceBar[],
  idx: number,
  spyBars: PriceBar[],
): Record<string, number | null> {
  const window = bars.slice(0, idx + 1);
  const price = window[window.length - 1].adjClose;

  // 52-week range (~252 días hábiles)
  const range52 = window.slice(-252);
  const posicion52w = (() => {
    if (range52.length < 60) return null;
    const values = range52.map((b) => b.adjClose);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return max > min ? (price - min) / (max - min) : null;
  })();

  // SMAs
  const closes = window.map((b) => b.adjClose);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const cruceMedias: number | null =
    sma50 != null && sma200 != null
      ? price > sma50 && sma50 > sma200
        ? 1
        : price > sma50
          ? 0.5
          : 0
      : null;

  // Momentum 6M (~126 días hábiles)
  const momentum: number | null = (() => {
    const lookback = 126;
    const i = idx - lookback;
    if (i < 0) return null;
    const ret = price / bars[i].adjClose - 1;
    return norm01(ret, -0.5, 0.5);
  })();

  // Beta vs SPY (menor beta = mayor puntaje defensivo)
  const beta = calcularBeta(bars, spyBars, idx, 126);
  const betaBaja: number | null =
    beta != null
      ? beta <= 0.5
        ? 1
        : beta <= 1
          ? 0.7
          : beta <= 1.5
            ? 0.4
            : 0.2
      : null;

  return {
    momentum,
    posicion52w,
    cruceMedias,
    betaBaja,
    // Los siguientes requieren series históricas de commodities/curva/ACWI que no
    // tenemos disponibles point-in-time en esta etapa.
    correlacionUSO: null,
    correlacionCommodityCanasta: null,
    correlacionYieldCurve: null,
    correlacionActividadGlobal: null,
  };
}

//  Cálculo de subScores fundamentales 

async function fetchSnapshotsPointInTime(
  ticker: string,
  fecha: Date,
): Promise<{ actual: SnapshotFundamental | null; haceUnAnio: SnapshotFundamental | null }> {
  const [actual, haceUnAnio] = await Promise.all([
    getFundamentalSnapshot(ticker, fecha),
    getFundamentalSnapshot(ticker, addMonthsUTC(fecha, -12)),
  ]);
  return { actual, haceUnAnio };
}

export function buildFundamentalSubScores(
  actual: SnapshotFundamental | null,
  haceUnAnio: SnapshotFundamental | null,
): Record<string, number | null> {
  if (!actual) {
    return {
      crecimientoIngresos: null,
      margenOperativo: null,
      reinversionRD: null,
      capexEficiencia: null,
      calidadBalance: null,
      calidadActivos: null,
      deuda: null,
      apalancamiento: null,
      roe: null,
      estabilidadMargen: null,
      dividendos: null,
    };
  }

  const crecimientoIngresos =
    actual.ingresoTotal != null && haceUnAnio?.ingresoTotal != null && haceUnAnio.ingresoTotal !== 0
      ? norm01(actual.ingresoTotal / haceUnAnio.ingresoTotal - 1, -0.2, 0.5)
      : null;

  const margenOperativo = actual.margenOperativo != null ? norm01(actual.margenOperativo, 0, 0.4) : null;

  const estabilidadMargen =
    actual.margenOperativo != null && haceUnAnio?.margenOperativo != null
      ? norm01(actual.margenOperativo - haceUnAnio.margenOperativo, -0.1, 0.1)
      : margenOperativo;

  const reinversionRD =
    actual.capex != null && actual.ingresoTotal != null && actual.ingresoTotal !== 0
      ? norm01(Math.abs(actual.capex) / actual.ingresoTotal, 0, 0.25)
      : null;

  const capexEficiencia =
    actual.fcf != null && actual.capex != null && actual.capex !== 0
      ? norm01(actual.fcf / Math.abs(actual.capex), 0, 5)
      : reinversionRD;

  const calidadBalance =
    actual.patrimonio != null && actual.totalActivos != null && actual.totalActivos !== 0
      ? norm01(actual.patrimonio / actual.totalActivos, 0.2, 0.8)
      : null;

  const calidadActivos =
    actual.totalActivos != null && actual.totalPasivos != null && actual.totalPasivos !== 0
      ? norm01(actual.totalActivos / actual.totalPasivos, 0.5, 2)
      : null;

  const deuda =
    actual.deudaTotal != null && actual.patrimonio != null && actual.patrimonio !== 0
      ? 1 - (norm01(actual.deudaTotal / actual.patrimonio, 0, 2) ?? 0)
      : null;

  const apalancamiento = calidadActivos != null ? 1 - calidadActivos : deuda;

  const roe = actual.roe != null ? norm01(actual.roe, 0, 0.4) : null;

  // Yahoo quoteSummary no expone dividendos históricos point-in-time.
  const dividendos: number | null = null;

  return {
    crecimientoIngresos,
    margenOperativo,
    reinversionRD,
    capexEficiencia,
    calidadBalance,
    calidadActivos,
    deuda,
    apalancamiento,
    roe,
    estabilidadMargen,
    dividendos,
  };
}

//  Función principal 

export const runBacktest = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BacktestResult> => {
    const hoy = iso(new Date());
    const fechaInicio = data.fechaInicio ?? "2020-01-01";
    const fechaFin = data.fechaFin ?? hoy;
    const fechasObs = generarFechasObservacion(fechaInicio, fechaFin);

    const limitaciones: string[] = [
      "Survivorship bias: el universo de 44 tickers es fijo y no incluye empresas que dejaron de cotizar o fueron adquiridas.",
      "Las fechas de publicación de resultados son estimadas con lag de 60 días corridos (sin fechas reales de SEC EDGAR).",
      "Yahoo chart no expone siempre adjusted close; se usa adjclose si está presente, de lo contrario close (retornos sin dividendos).",
      "No se modelan costos de transacción, slippage, ni impacto de mercado.",
      "Los subScores de commodity, yield curve y actividad global se dejan null por falta de datos históricos point-in-time.",
      "reinversionRD se aproxima con capex/ingresos; capexEficiencia con FCF/|capex|.",
      "El primer día hábil de cada mes no considera feriados de mercado (solo lunes-viernes).",
    ];

    //  Precargar todas las series de precios 
    const allSymbols = new Set<string>([SPY_BENCHMARK]);
    for (const [sector, tickers] of Object.entries(UNIVERSO_BACKTEST_INICIAL)) {
      for (const t of tickers) allSymbols.add(t);
      allSymbols.add(SECTOR_ETF[sector]);
    }

    const historyMap = new Map<string, PriceBar[]>();
    await Promise.all(
      Array.from(allSymbols).map(async (sym) => {
        try {
          const bars = await fetchAdjustedHistory(sym);
          historyMap.set(sym, bars);
        } catch {
          historyMap.set(sym, []);
        }
      }),
    );

    const spyBars = historyMap.get(SPY_BENCHMARK) ?? [];
    if (spyBars.length === 0) {
      return {
        rows: [],
        limitaciones: [...limitaciones, "No se pudo obtener precios de SPY."],
        meta: { fechaInicio, fechaFin, totalObservaciones: 0, totalFilas: 0, tickers: 0, fechas: [] },
      };
    }

    //  Loop principal 
    const rows: BacktestRow[] = [];

    for (const fechaStr of fechasObs) {
      const fecha = parseISOUTC(fechaStr);
      const spyObs = findBarFloor(spyBars, fechaStr);
      if (!spyObs) continue;

      const spyForwards = {
        1: findBarFloor(spyBars, iso(addMonthsUTC(fecha, 1))),
        3: findBarFloor(spyBars, iso(addMonthsUTC(fecha, 3))),
        6: findBarFloor(spyBars, iso(addMonthsUTC(fecha, 6))),
        12: findBarFloor(spyBars, iso(addMonthsUTC(fecha, 12))),
      };

      for (const [sector, tickers] of Object.entries(UNIVERSO_BACKTEST_INICIAL)) {
        const etf = SECTOR_ETF[sector];
        const etfBars = historyMap.get(etf) ?? [];
        const etfObs = findBarFloor(etfBars, fechaStr);
        const etfForwards = {
          1: findBarFloor(etfBars, iso(addMonthsUTC(fecha, 1))),
          3: findBarFloor(etfBars, iso(addMonthsUTC(fecha, 3))),
          6: findBarFloor(etfBars, iso(addMonthsUTC(fecha, 6))),
          12: findBarFloor(etfBars, iso(addMonthsUTC(fecha, 12))),
        };

        for (const ticker of tickers) {
          const bars = historyMap.get(ticker) ?? [];
          if (bars.length < 252) continue; // mínimo 1 año para métricas técnicas

          const obs = findBarFloor(bars, fechaStr);
          if (!obs) continue;
          const idx = bars.findIndex((b) => b.date === obs.date);
          if (idx === -1) continue;

          // Técnico (point-in-time: solo datos hasta idx)
          const technicalScores = computeTechnicalSubScores(bars, idx, spyBars);

          // Fundamental (point-in-time: trimestre publicado antes de fecha)
          const { actual, haceUnAnio } = await fetchSnapshotsPointInTime(ticker, fecha);
          const fundamentalScores = buildFundamentalSubScores(actual, haceUnAnio);

          // Score sectorial ponderado
          const subScores: Record<string, number | null> = { ...fundamentalScores, ...technicalScores };
          const scoreResult = getScorePonderado(ticker, subScores);

          // Validación defensiva: si Yahoo no matchea sector, usamos el del universo
          const sectorNormalizado = scoreResult.esDefault ? buscarSectorPorTicker(ticker) ?? sector : sector;

          // Forward prices
          const forwards = {
            1: findBarFloor(bars, iso(addMonthsUTC(fecha, 1))),
            3: findBarFloor(bars, iso(addMonthsUTC(fecha, 3))),
            6: findBarFloor(bars, iso(addMonthsUTC(fecha, 6))),
            12: findBarFloor(bars, iso(addMonthsUTC(fecha, 12))),
          };

          const totalReturn = (horizon: 1 | 3 | 6 | 12): number | null => {
            const f = forwards[horizon];
            if (!f || !obs) return null;
            return f.adjClose / obs.adjClose - 1;
          };

          const excesoETF = (horizon: 1 | 3 | 6 | 12): number | null => {
            const r = totalReturn(horizon);
            const f = etfForwards[horizon];
            if (r == null || !etfObs || !f) return null;
            const e = f.adjClose / etfObs.adjClose - 1;
            return r - e;
          };

          const excesoSPY = (horizon: 1 | 3 | 6 | 12): number | null => {
            const r = totalReturn(horizon);
            const f = spyForwards[horizon];
            if (r == null || !spyObs || !f) return null;
            const s = f.adjClose / spyObs.adjClose - 1;
            return r - s;
          };

          rows.push({
            fecha: fechaStr,
            ticker,
            sector: sectorNormalizado,
            score: scoreResult.score,
            retorno1M: totalReturn(1),
            retorno3M: totalReturn(3),
            retorno6M: totalReturn(6),
            retorno12M: totalReturn(12),
            excesoVsETF1M: excesoETF(1),
            excesoVsETF3M: excesoETF(3),
            excesoVsETF6M: excesoETF(6),
            excesoVsETF12M: excesoETF(12),
            excesoVsSP5001M: excesoSPY(1),
            excesoVsSP5003M: excesoSPY(3),
            excesoVsSP5006M: excesoSPY(6),
            excesoVsSP50012M: excesoSPY(12),
          });
        }
      }
    }

    return {
      rows,
      limitaciones,
      meta: {
        fechaInicio,
        fechaFin,
        totalObservaciones: fechasObs.length,
        totalFilas: rows.length,
        tickers: Object.values(UNIVERSO_BACKTEST_INICIAL).flat().length,
        fechas: fechasObs,
      },
    };
  });

// Exportar también como función plana para tests/scripts locales.
export async function runBacktestLocal(input?: { fechaInicio?: string; fechaFin?: string }): Promise<BacktestResult> {
  return runBacktest({ data: input ?? {} });
}

// TODO Etapa 4 (próximo archivo):
// export function calcularMetricasAgregadas(rows: BacktestRow[]): BacktestMetrics { ... }

// 
// Evaluación individual de recomendación (CRM backtesting)
// 

export interface EvalRecomendacionResult {
  retornoBruto: number | null;
  retornoBenchmark: number | null;
  alpha: number | null;
  confiabilidadFundamentoActual: "alta" | "media" | "baja";
  precioActual: number | null;
  fechaCorte: string;
}

type BenchmarkKey = "SPY" | "^MERV";

const BENCHMARK_POR_TIPO: Record<string, BenchmarkKey> = {
  cedear: "SPY",
  accion: "^MERV",
  adr: "SPY",
  bono: "^MERV",
  on: "^MERV",
};

async function fetchCCLEnFecha(fecha: string): Promise<number | null> {
  try {
    const r = await fetch(
      "https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui",
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) return null;
    const arr: { moneda: string; casa: string; fecha: string; compra: number; venta: number }[] = await r.json();
    const sorted = arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
    let best: number | null = null;
    for (const item of sorted) {
      if (item.fecha <= fecha) best = item.venta;
      else break;
    }
    return best;
  } catch {
    return null;
  }
}

function benchmarkPorInstrumento(tipo: string): BenchmarkKey {
  return BENCHMARK_POR_TIPO[tipo] ?? "SPY";
}

/**
 * Evalúa una recomendación contra el mercado hasta una fecha de corte.
 *
 * - Para CEDEAR en ARS: reconstruye precio ARS usando ratioCedearAlMomento × CCL
 * - Calcula retorno bruto en la moneda original de la recomendación
 * - Benchmarks: SPY para CEDEARs/US/ADR, ^MERV para BCBA/bonos/ON
 * - alpha = retornoActivo − retornoBenchmark
 * - confiabilidad del fundamento:
 *   • ≤ 15 meses → getFundamentalSnapshot trimestral → 'alta'
 *   • > 15 meses → no se puede reconstruir trimestral → 'media'
 *   • sin datos → 'baja'
 */
export async function evaluarRecomendacion(
  rec: Recomendacion,
  fechaCorte: string,
): Promise<EvalRecomendacionResult> {
  const benchmark = benchmarkPorInstrumento(rec.tipoInstrumento);

  // 1. Precios del activo
  const assetBars = await fetchAdjustedHistory(rec.tickerYf ?? rec.tickerIol);
  const corteBar = findBarFloor(assetBars, fechaCorte);
  const recBar = findBarFloor(assetBars, rec.fechaRecomendacion);
  if (!corteBar || !recBar) {
    return { retornoBruto: null, retornoBenchmark: null, alpha: null, confiabilidadFundamentoActual: "baja", precioActual: null, fechaCorte };
  }

  // 2. Si es CEDEAR en ARS, convertir precios usando ratio CCL
  let precioRec = recBar.adjClose;
  let precioCorte = corteBar.adjClose;

  if (rec.monedaRecomendada === "ARS" && rec.tipoInstrumento === "cedear" && rec.ratioCedearAlMomento != null) {
    const cclRec = await fetchCCLEnFecha(rec.fechaRecomendacion);
    const cclCorte = await fetchCCLEnFecha(fechaCorte);
    if (cclRec != null && cclRec > 0 && cclCorte != null && cclCorte > 0) {
      precioRec = recBar.adjClose * rec.ratioCedearAlMomento * cclRec;
      precioCorte = corteBar.adjClose * rec.ratioCedearAlMomento * cclCorte;
    }
  }

  const retornoBruto = precioRec > 0 ? (precioCorte - precioRec) / precioRec : null;

  // 3. Precios del benchmark
  const benchBars = await fetchAdjustedHistory(benchmark);
  const benchCorte = findBarFloor(benchBars, fechaCorte);
  const benchRec = findBarFloor(benchBars, rec.fechaRecomendacion);
  let retornoBenchmark: number | null = null;
  if (benchCorte && benchRec && benchRec.adjClose > 0) {
    retornoBenchmark = (benchCorte.adjClose - benchRec.adjClose) / benchRec.adjClose;
  }

  // 4. Alpha
  const alpha = retornoBruto != null && retornoBenchmark != null ? retornoBruto - retornoBenchmark : null;

  // 5. Confiabilidad del fundamento actual
  let confiabilidad: EvalRecomendacionResult["confiabilidadFundamentoActual"] = "baja";
  try {
    const recDate = new Date(rec.fechaRecomendacion);
    const corteDate = new Date(fechaCorte);
    const diffMs = corteDate.getTime() - recDate.getTime();
    const diffMeses = diffMs / (1000 * 60 * 60 * 24 * 30.44);

    if (diffMeses <= 15) {
      const snap = await getFundamentalSnapshot(rec.tickerYf ?? rec.tickerIol, corteDate);
      confiabilidad = snap ? "alta" : "baja";
    } else {
      confiabilidad = "media";
    }
  } catch {
    confiabilidad = "baja";
  }

  return {
    retornoBruto,
    retornoBenchmark,
    alpha,
    confiabilidadFundamentoActual: confiabilidad,
    precioActual: corteBar.adjClose,
    fechaCorte,
  };
}

export type Confiabilidad = EvalRecomendacionResult["confiabilidadFundamentoActual"];
