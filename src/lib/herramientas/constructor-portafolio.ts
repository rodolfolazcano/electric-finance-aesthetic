// Constructor de portafolio recomendado — portado de clarity-dashboard
// (src/lib/constructor-portafolio.ts).
//
// Combina: scores por activo (FASE A) + política de asignación CNV (FASE B)
// + optimizer.ts (Markowitz / min-variance / max-sharpe).
//
// Adaptaciones a este proyecto:
// - AssetScoreDiario se reemplaza por la interfaz local ScoreActivo (mismos
//   campos usados); scoring/motor-unificado aún no existe acá.
// - Historial vía getYahooHistoricalServer local (rango "2A", cierre).
// - Persistencia Supabase no disponible → persistirPortafolio es no-op.

import { getPolitica, calcularPesosObjetivo, type PerfilInversor } from "./politica-asignacion";
import { optimize, logReturns, mean, std, covMatrix, type Strategy } from "./optimizer";
import { getYahooHistoricalServer } from "./market-data.functions";
import { getRiskFreeRate } from "./risk-free-rate";

const CAP_MAX_POR_ACTIVO_RF = 0.35;
const TOP_RV_PRESELECCION = 15;

/** Entrada mínima de scoring que consume el constructor. */
export interface ScoreActivo {
  ticker: string;
  categoriaMacro: "RentaFija" | "RentaVariable" | "Liquidez";
  scoreCompuesto: number;
  /** Duración en años (solo RF; filtra por durationMaxRF de la política). */
  duration?: number | null;
  scoringVersion?: string;
}

export interface PosicionRecomendada {
  ticker: string;
  tipo: "RF" | "RV" | "Liquidez";
  pesoObjetivo: number;
  scoreCompuesto: number;
  valorEstimado: number;
}

export interface PortafolioRecomendado {
  perfil: PerfilInversor;
  fecha: string;
  pesosMacro: { rentaFija: number; rentaVariable: number; liquidez: number };
  posiciones: PosicionRecomendada[];
  metricas: {
    ytmPonderada: number;
    retornoEsperadoAnual: number;
    volatilidadAnual: number;
    sharpe: number;
    beta: number;
  };
  scoringVersion: string;
}

/** Cierres diarios de Yahoo (2 años) para un ticker; null si no hay datos. */
async function cierres2A(ticker: string): Promise<number[] | null> {
  try {
    const bars = (await getYahooHistoricalServer({
      data: { symbol: ticker, rango: "2A" },
    })) as { cierre: number }[];
    const closes = bars.map((b) => b.cierre).filter((c) => c > 0);
    return closes.length >= 30 ? closes : null;
  } catch {
    return null;
  }
}

export async function construirPortafolioRecomendado(
  perfil: PerfilInversor,
  scores: ScoreActivo[],
  humorMercado: "risk-on" | "risk-off" | "mixto" | null,
): Promise<PortafolioRecomendado | null> {
  const POLITICA = getPolitica(perfil);
  const fecha = new Date().toISOString().slice(0, 10);

  const {
    rentaFija: pesoRF,
    rentaVariable: pesoRV,
    liquidez: pesoLiq,
  } = calcularPesosObjetivo(perfil, humorMercado);

  // 2. Renta Fija: rankear por scoreCompuesto con restricciones
  const candidatosRF = scores
    .filter((a) => {
      if (a.categoriaMacro !== "RentaFija") return false;
      return (a.duration ?? 0) <= POLITICA.durationMaxRF;
    })
    .sort((a, b) => b.scoreCompuesto - a.scoreCompuesto)
    .slice(0, POLITICA.maxActivosPorSleeve);

  const pesosRF = ponderarPorScoreConCap(candidatosRF, CAP_MAX_POR_ACTIVO_RF);

  // 3. Renta Variable: preselección top-N -> optimizer
  const candidatosRV = scores
    .filter((a) => a.categoriaMacro === "RentaVariable")
    .sort((a, b) => b.scoreCompuesto - a.scoreCompuesto)
    .slice(0, TOP_RV_PRESELECCION);

  let pesosRV: Array<{ ticker: string; peso: number }> = [];

  if (candidatosRV.length >= 2) {
    try {
      const tickers = candidatosRV.map((c) => c.ticker);
      const histData = await Promise.all(tickers.map((t) => cierres2A(t)));

      const valid = histData
        .map((h, i) => (h && h.length >= 30 ? { closes: h, ticker: tickers[i]! } : null))
        .filter((x): x is { closes: number[]; ticker: string } => x != null);

      if (valid.length >= 2) {
        const returnsMat = valid.map((v) => logReturns(v.closes));
        const minLen = Math.min(...returnsMat.map((r) => r.length));
        const aligned = returnsMat.map((r) => r.slice(r.length - minLen));

        const result = optimize(POLITICA.estrategiaOptimizador as Strategy, {
          meanDaily: aligned.map((r) => mean(r)),
          volDaily: aligned.map((r) => std(r)),
          cov: covMatrix(aligned),
        });
        pesosRV = valid.map((v, i) => ({
          ticker: v.ticker,
          peso: result.weights[i] ?? 0,
        }));
      }
    } catch {
      if (candidatosRV.length > 0) {
        const eq = 1 / candidatosRV.length;
        pesosRV = candidatosRV.map((c) => ({ ticker: c.ticker, peso: eq }));
      }
    }
  }

  // 4. Combinar todo
  const posiciones: PosicionRecomendada[] = [];

  for (const c of candidatosRF) {
    const p = pesosRF.get(c.ticker) ?? 0;
    posiciones.push({
      ticker: c.ticker,
      tipo: "RF",
      pesoObjetivo: p * (pesoRF / 100),
      scoreCompuesto: c.scoreCompuesto,
      valorEstimado: 0,
    });
  }

  for (const p of pesosRV) {
    const score = candidatosRV.find((c) => c.ticker === p.ticker)?.scoreCompuesto ?? 50;
    posiciones.push({
      ticker: p.ticker,
      tipo: "RV",
      pesoObjetivo: p.peso * (pesoRV / 100),
      scoreCompuesto: score,
      valorEstimado: 0,
    });
  }

  if (pesoLiq > 0) {
    posiciones.push({
      ticker: "LIQUIDEZ",
      tipo: "Liquidez",
      pesoObjetivo: pesoLiq / 100,
      scoreCompuesto: 50,
      valorEstimado: 0,
    });
  }

  const metricas = await calcularMetricasPortafolio(posiciones);

  return {
    perfil,
    fecha,
    pesosMacro: { rentaFija: pesoRF, rentaVariable: pesoRV, liquidez: pesoLiq },
    posiciones,
    metricas,
    scoringVersion: scores[0]?.scoringVersion ?? "v1",
  };
}

function ponderarPorScoreConCap(candidatos: ScoreActivo[], cap: number): Map<string, number> {
  const resultado = new Map<string, number>();
  if (candidatos.length === 0) return resultado;

  const totalScore = candidatos.reduce((s, a) => s + a.scoreCompuesto, 0) || 1;
  const pesos = new Map(
    candidatos.map((a) => [a.ticker, a.scoreCompuesto / totalScore] as [string, number]),
  );

  for (let iter = 0; iter < 20; iter++) {
    let excesoTotal = 0;
    for (const [t, p] of pesos) {
      if (p > cap) {
        excesoTotal += p - cap;
        pesos.set(t, cap);
      }
    }
    if (excesoTotal < 0.001) break;
    const bajoCap = [...pesos].filter(([, p]) => p < cap);
    const totalBajo = bajoCap.reduce((s, [, p]) => s + p, 0);
    if (totalBajo <= 0) break;
    for (const [t, p] of bajoCap) {
      pesos.set(t, p + excesoTotal * (p / totalBajo));
    }
  }

  return pesos;
}

// Tasa libre de riesgo anual para Sharpe (USD → ^TNX | ARS → BCRA), con cache.
let _tasaCache: number | null = null;
let _tasaTimestamp = 0;
const TASA_CACHE_TTL = 3600_000; // 1 hora

async function getTasaLibreActual(): Promise<number> {
  if (_tasaCache && Date.now() - _tasaTimestamp < TASA_CACHE_TTL) return _tasaCache;
  const tasa = await getRiskFreeRate("USD");
  _tasaCache = tasa;
  _tasaTimestamp = Date.now();
  return tasa;
}

// Versión sincrónica para optimizadores donde async no es práctico.
export function getTasaLibreSync(): number {
  if (_tasaCache && Date.now() - _tasaTimestamp < TASA_CACHE_TTL) return _tasaCache;
  return 0.045;
}

// Forzar actualización desde afuera (ej. al iniciar la app o desde un cron)
export async function refreshTasaLibre(): Promise<number> {
  const tasa = await getRiskFreeRate("USD");
  _tasaCache = tasa;
  _tasaTimestamp = Date.now();
  return tasa;
}

async function calcularMetricasPortafolio(
  posiciones: PosicionRecomendada[],
  tasaLibreAnual?: number,
): Promise<PortafolioRecomendado["metricas"]> {
  const rf = tasaLibreAnual ?? (await getTasaLibreActual());
  const rv = posiciones.filter((p) => p.tipo === "RV");
  if (rv.length < 2) {
    return { ytmPonderada: 0, retornoEsperadoAnual: 0, volatilidadAnual: 0, sharpe: 0, beta: 0 };
  }

  const total = rv.reduce((s, p) => s + p.pesoObjetivo, 0) || 1;

  try {
    const tickers = rv.map((p) => p.ticker);
    const histData = await Promise.all(tickers.map((t) => cierres2A(t)));

    const valid = histData
      .map((h, i) =>
        h && h.length >= 30 ? { closes: h, peso: rv[i]!.pesoObjetivo / total } : null,
      )
      .filter((x): x is { closes: number[]; peso: number } => x != null);

    if (valid.length >= 2) {
      const returnsMat = valid.map((v) => logReturns(v.closes));
      const minLen = Math.min(...returnsMat.map((r) => r.length));
      const aligned = returnsMat.map((r) => r.slice(r.length - minLen));
      const w = valid.map((v) => v.peso);
      const means = aligned.map((r) => mean(r));
      const cov = covMatrix(aligned);

      let pv = 0;
      for (let i = 0; i < w.length; i++) {
        for (let j = 0; j < w.length; j++) {
          pv += w[i]! * w[j]! * cov[i]![j]!;
        }
      }

      const ret = dot(w, means) * 252;
      const vol = Math.sqrt(Math.max(pv, 0)) * Math.sqrt(252);
      const rfCont = Math.log(1 + rf);
      const retExceso = ret - rfCont;
      const sharpe = vol > 0 ? retExceso / vol : 0;

      return { ytmPonderada: 0, retornoEsperadoAnual: ret, volatilidadAnual: vol, sharpe, beta: 0 };
    }
  } catch {
    /* defaults */
  }

  return { ytmPonderada: 0, retornoEsperadoAnual: 0, volatilidadAnual: 0, sharpe: 0, beta: 0 };
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

//  Ejecución diaria para los 7 perfiles 
export async function construirPortafoliosDiarios(
  scores: ScoreActivo[],
  humorMercado: "risk-on" | "risk-off" | "mixto" | null,
): Promise<PortafolioRecomendado[]> {
  const perfiles: PerfilInversor[] = [
    "Conservador",
    "Moderado-Conservador",
    "Moderado",
    "Moderado-Agresivo",
    "Agresivo",
    "Muy Agresivo",
    "Especulativo",
  ];

  const resultados: PortafolioRecomendado[] = [];

  for (const perfil of perfiles) {
    try {
      const port = await construirPortafolioRecomendado(perfil, scores, humorMercado);
      if (port) {
        await persistirPortafolio(port);
        resultados.push(port);
      }
    } catch {
      // Si un perfil falla, seguir con los demás
    }
  }

  return resultados;
}

// Persistencia no disponible en este proyecto (sin Supabase): no-op documentado.
async function persistirPortafolio(_port: PortafolioRecomendado): Promise<void> {
  /* no-op */
}
