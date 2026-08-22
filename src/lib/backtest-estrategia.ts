// src/lib/backtest-estrategia.ts
// Walk-forward backtesting con la MISMA lógica de construcción de portafolio.
// Rule #1: llama a construirPortafolioRecomendado(), no una copia.

import { construirPortafolioRecomendado, type PortafolioRecomendado } from "./constructor-portafolio";
import { construirUniversoCompleto, type ActivoUniverse } from "./scoring/universo";
import { calcularScoreCuantitativo } from "./scoring/cuantitativo-scoring";
import type { AssetScoreDiario, CategoriaMacro, Subtipo } from "./scoring/types";
import { SCORING_VERSION } from "./scoring/types";
import { getYahooHistoricalServer } from "./market-data.functions";
import { logReturns, mean, std, rsi, macd, sma } from "./optimizer";
import type { PerfilInversor } from "./politica-asignacion";

import { getHistory } from "./history-cache.server";
import { getRiskFreeRateSync } from "./risk-free-rate";

async function fetchHistoryHasta(
  ticker: string,
  hasta: Date,
  days = 730,
): Promise<{ fecha: string; cierre: number }[]> {
  try {
    // Use the unified cache for the full range, then filter up to hasta
    const allData = await getHistory(ticker, days);
    const hastaStr = hasta.toISOString().slice(0, 10);
    return allData
      .filter((d) => d.date <= hastaStr && d.close > 0)
      .map((d) => ({ fecha: d.date, cierre: d.close }));
  } catch {
    return [];
  }
}

// Recalcular scores históricos: solo componentes reproducibles (técnico + cuantitativo)
// Fundamental y noticias se excluyen (no hay datos point-in-time confiables)
async function recalcularScoresAsOf(
  fecha: Date,
  universo: ActivoUniverse[],
  version: string,
): Promise<AssetScoreDiario[]> {
  const scores: AssetScoreDiario[] = [];
  const fechaStr = fecha.toISOString().slice(0, 10);

  // Procesar en batches de 5 para no saturar Yahoo
  for (let i = 0; i < universo.length; i += 5) {
    const batch = universo.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (activo) => {
        if (activo.categoriaMacro === "Liquidez") return null;

        const hist = await fetchHistoryHasta(activo.ticker, fecha);
        const closes = hist.map((h) => h.cierre);
        if (closes.length < 60) return null;

        const current = closes[closes.length - 1];
        const returns = logReturns(closes);
        const meanRet = mean(returns);
        const stdRet = std(returns);

        // Score técnico (from precios históricos)
        const rsiVal = rsi(closes);
        const { macd: macdV, signal: macdS } = macd(closes);

        let scoreTecnico = 50;
        if (closes.length >= 200) {
          const sma50 = calcSMA(closes, 50);
          const sma200 = calcSMA(closes, 200);
          let s = 0;
          if (current > sma50 && sma50 > sma200) s = 2;
          else if (current < sma50 && sma50 < sma200) s = -2;
          else if (sma50 > sma200) s = 0.5;
          else s = -0.5;
          if (rsiVal > 70) s -= 1;
          else if (rsiVal < 30) s -= 0.5;
          if (macdV > macdS && macdV > 0) s += 1;
          else if (macdV <= macdS && macdV > 0) s -= 0.5;
          else s -= 1;
          scoreTecnico = Math.max(0, Math.min(100, (s + 5) / 10 * 100));
        }

        // Score cuantitativo (since histórico)
        const sharpeRatio = stdRet > 0 ? meanRet / stdRet * Math.sqrt(252) : 0;
        const var95 = percentile(returns, 5);
        const scoreCuantitativo = calcularScoreCuantitativo({
          sharpeRatio,
          beta: null,
          rSquared: null,
          var95,
        });

        return {
          ticker: activo.ticker,
          fecha: fechaStr,
          scoringVersion: version,
          categoriaMacro: activo.categoriaMacro,
          subtipo: activo.subtipo,
          scoreFundamental: null,
          scoreTecnico,
          scoreCuantitativo,
          scoreNoticias: null,
          scoreContexto: 50,
          scoreCompuesto: 0, // se calcula abajo
          datosRaw: {
            precio: current,
            variacionPct: 0,
            rsi: rsiVal,
            sma50: closes.length >= 50 ? calcSMA(closes, 50) : null,
            sma200: closes.length >= 200 ? calcSMA(closes, 200) : null,
            macd: macdV,
            pe: null,
            beta: null,
            rSquared: null,
            sharpe: sharpeRatio,
            var95,
            tir: null, tea: null, duration: null,
            valorizado: 0,
          },
        } as AssetScoreDiario;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        const a = r.value;
        a.scoreCompuesto = calcularCompuestoBacktest(
          a.categoriaMacro, a.scoreTecnico, a.scoreCuantitativo, a.scoreContexto,
        );
        scores.push(a);
      }
    }
  }

  return scores;
}

function calcularCompuestoBacktest(
  categoriaMacro: string,
  scoreTecnico: number | null,
  scoreCuantitativo: number,
  scoreContexto: number,
): number {
  // Sin fundamental ni noticias: redistribuir pesos
  // Original RV: 30% tecnico + 25% cuant + 5% contexto = 60% => normalizar a 100%
  // Original RF:  45% cuant + 25% contexto + 10% tecnico = 80% => normalizar a 100%
  if (categoriaMacro === "RentaVariable") {
    let s = 0;
    let p = 0;
    if (scoreTecnico != null) { s += 0.30 * scoreTecnico; p += 0.30; }
    s += 0.25 * scoreCuantitativo; p += 0.25;
    s += 0.05 * scoreContexto; p += 0.05;
    return p > 0 ? Math.round(s / p) : 50;
  }
  // Renta Fija
  let s = 0;
  let p = 0;
  s += 0.45 * scoreCuantitativo; p += 0.45;
  s += 0.25 * scoreContexto; p += 0.25;
  if (scoreTecnico != null) { s += 0.10 * scoreTecnico; p += 0.10; }
  return p > 0 ? Math.round(s / p) : 50;
}

// ── Backtest principal ─────────────────────────────────

export interface BacktestResultado {
  perfil: PerfilInversor;
  scoringVersion: string;
  fechaCorrida: string;
  fechaInicio: string;
  fechaFin: string;
  frecuenciaRebalanceo: string;
  equityCurve: Array<{ fecha: string; valor: number; composicion: { ticker: string; peso: number }[] }>;
  equityCurveBenchmark?: Array<{ fecha: string; valor: number }>;
  metricas: {
    cagr: number;
    volatilidadAnualizada: number;
    sharpe: number;
    sortino: number;
    cvar: number;
    var95: number;
    maxDrawdown: number;
    hitRateRebalanceos: number;
    vsMerval: { correlacion: number; beta: number; alpha: number } | null;
    vsSPY: { correlacion: number; beta: number; alpha: number } | null;
    vsEqualWeight: { correlacion: number; beta: number; alpha: number } | null;
  };
  notas: string[];
}

export async function backtestearEstrategia(
  perfil: PerfilInversor,
  fechaInicio: string,
  fechaFin: string,
  frecuenciaRebalanceo: "mensual" | "trimestral" | "semestral",
  scoringVersion: string = SCORING_VERSION,
): Promise<BacktestResultado> {
  const notas: string[] = [
    "Backtest walk-forward con la misma lógica de construcción de portafolio.",
    "Fundamental y noticias excluidos (no hay datos point-in-time confiables históricamente).",
    "Rendimiento histórico condicional — no garantiza resultados futuros.",
  ];

  const universo = construirUniversoCompleto().filter((a) => a.categoriaMacro !== "Liquidez");
  const fechasRebalanceo = generarFechasRebalanceo(fechaInicio, fechaFin, frecuenciaRebalanceo);

  const equityCurve: BacktestResultado["equityCurve"] = [];
  let valorActual = 100;
  let maxValor = 100;
  let maxDrawdown = 0;
  let retornosPeriodo: number[] = [];
  let hits = 0;

  for (let i = 0; i < fechasRebalanceo.length; i++) {
    const fecha = fechasRebalanceo[i];
    const fechaObj = new Date(fecha + "T12:00:00Z");

    const scores = await recalcularScoresAsOf(fechaObj, universo, scoringVersion);
    if (scores.length < 10) continue;

    try {
      const portafolio = await construirPortafolioRecomendado(perfil, scores, null);
      if (!portafolio || portafolio.posiciones.length === 0) continue;

      const proxFecha = fechasRebalanceo[i + 1];
      if (!proxFecha) break;

      const retorno = await calcularRetornoRealizado(
        portafolio.posiciones,
        fecha,
        proxFecha,
      );

      valorActual *= (1 + retorno);
      retornosPeriodo.push(retorno);
      if (retorno > 0) hits++;

      if (valorActual > maxValor) maxValor = valorActual;
      const dd = (maxValor - valorActual) / maxValor;
      if (dd > maxDrawdown) maxDrawdown = dd;

      equityCurve.push({
        fecha,
        valor: Math.round(valorActual * 100) / 100,
        composicion: portafolio.posiciones.map((p) => ({
          ticker: p.ticker,
          peso: p.pesoObjetivo,
        })),
      });
    } catch {
      continue;
    }
  }

  const n = retornosPeriodo.length;
  const cagr = n > 0 ? Math.pow(valorActual / 100, 252 / (n * 21)) - 1 : 0;
  const vol = n > 0 ? std(retornosPeriodo) * Math.sqrt(12 / (252 / (n * 21))) : 0;
  const rfDiario = Math.pow(1 + getRiskFreeRateSync("USD"), 1 / 252) - 1;
  const meanRet = n > 0 ? mean(retornosPeriodo) : 0;
  const sharpe = vol > 0 ? ((meanRet - rfDiario) / vol) * Math.sqrt(252) : 0;
  const hitRate = n > 0 ? (hits / n) * 100 : 0;

  // Sortino ratio (downside deviation)
  const downsideRets = retornosPeriodo.filter(r => r < 0);
  const downsideDev = downsideRets.length > 0
    ? Math.sqrt(downsideRets.reduce((s, r) => s + r * r, 0) / downsideRets.length)
    : 0;
  const sortino = downsideDev > 0 ? ((meanRet - rfDiario) / downsideDev) * Math.sqrt(252) : 0;

  // CVaR (Conditional Value at Risk) al 95%
  const sorted = [...retornosPeriodo].sort((a, b) => a - b);
  const idx5 = Math.floor(sorted.length * 0.05);
  const cvar = sorted.length > 0 ? mean(sorted.slice(0, Math.max(1, idx5))) : 0;
  const var95 = sorted.length > 0 ? sorted[Math.max(0, idx5)] : 0;

  return {
    perfil,
    scoringVersion,
    fechaCorrida: new Date().toISOString().slice(0, 10),
    fechaInicio,
    fechaFin,
    frecuenciaRebalanceo,
    equityCurve,
    metricas: {
      cagr: Math.round(cagr * 10000) / 10000,
      volatilidadAnualizada: Math.round(vol * 10000) / 10000,
      sharpe: Math.round(sharpe * 100) / 100,
      sortino: Math.round(sortino * 100) / 100,
      cvar: Math.round(cvar * 10000) / 10000,
      var95: Math.round(var95 * 10000) / 10000,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      hitRateRebalanceos: Math.round(hitRate * 100) / 100,
      vsMerval: null,
      vsSPY: null,
      vsEqualWeight: null,
    },
    notas,
  };
}

async function calcularRetornoRealizado(
  posiciones: { ticker: string; pesoObjetivo: number; tipo?: string }[],
  desde: string,
  hasta: string,
): Promise<number> {
  const hastaObj = new Date(hasta + "T12:00:00Z");
  const rv = posiciones.filter((p) => p.tipo === "RV");

  if (rv.length === 0) return 0;

  const prices = await Promise.all(
    rv.map((p) => fetchHistoryHasta(p.ticker, hastaObj, 90)),
  );

  const totalPeso = rv.reduce((s, p) => s + p.pesoObjetivo, 0) || 1;
  let retornoTotal = 0;

  for (let i = 0; i < rv.length; i++) {
    const hist = prices[i];
    if (hist.length < 2) continue;
    const precioInicio = hist.find((h) => h.fecha >= desde)?.cierre;
    const precioFin = hist[hist.length - 1].cierre;
    if (precioInicio && precioInicio > 0) {
      const ret = (precioFin - precioInicio) / precioInicio;
      retornoTotal += ret * (rv[i].pesoObjetivo / totalPeso);
    }
  }

  return retornoTotal;
}

function generarFechasRebalanceo(
  inicio: string,
  fin: string,
  frecuencia: "mensual" | "trimestral" | "semestral",
): string[] {
  const fechas: string[] = [];
  const current = new Date(inicio + "T12:00:00Z");
  const finDate = new Date(fin + "T12:00:00Z");
  const stepMap = { mensual: 1, trimestral: 3, semestral: 6 };
  const step = stepMap[frecuencia];

  while (current <= finDate) {
    fechas.push(current.toISOString().slice(0, 10));
    current.setMonth(current.getMonth() + step);
  }

  return fechas;
}

function calcSMA(arr: number[], period: number): number {
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}


