// @ts-nocheck
// src/lib/constructor-portafolio.ts
// Corre una vez por día para los 7 perfiles CNV.
// Usa scores (FASE A) + política (FASE B) + optimizer.ts

import type { AssetScoreDiario } from "./scoring/types";
import { getPolitica, calcularPesosObjetivo, type PerfilInversor } from "./politica-asignacion";
import { optimize, type Strategy } from "./optimizer";
import { logReturns, mean, std, covMatrix } from "./optimizer";
import { getYahooHistoricalServer } from "./market-data.functions";
import { getRiskFreeRate } from "./risk-free-rate";

const CAP_MAX_POR_ACTIVO_RF = 0.35;
const TOP_RV_PRESELECCION = 15;

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

export async function construirPortafolioRecomendado(
  perfil: PerfilInversor,
  scores: AssetScoreDiario[],
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
      return (a.datosRaw.duration ?? 0) <= POLITICA.durationMaxRF;
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
      const histData = await Promise.all(
        tickers.map((t) =>
          getYahooHistoricalServer({ data: { symbol: t, rango: "2A" } })
            .then((bars) => bars.map((b) => b.cierre))
            .catch(() => null as number[] | null),
        ),
      );

      const valid = histData
        .map((h, i) => (h && h.length >= 30 ? { closes: h, ticker: tickers[i] } : null))
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

function ponderarPorScoreConCap(candidatos: AssetScoreDiario[], cap: number): Map<string, number> {
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

// Tasa libre de riesgo anual para Sharpe.
// Se actualiza dinámicamente desde APIs reales (risk-free-rate.ts).
// USD → Yahoo Finance ^TNX (Treasury 10Y) | ARS → BCRA BADLAR
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

// Versión sincrónica para uso en optimizadores donde async no es práctico.
// Retorna el caché o el default (4.5%). Llama a refreshTasaLibre() periódicamente.
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
    const histData = await Promise.all(
      tickers.map((t) =>
        getYahooHistoricalServer({ data: { symbol: t, rango: "2A" } })
          .then((bars) => bars.map((b) => b.cierre))
          .catch(() => null as number[] | null),
      ),
    );

    const valid = histData
      .map((h, i) => (h && h.length >= 30 ? { closes: h, peso: rv[i].pesoObjetivo / total } : null))
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
          pv += w[i] * w[j] * cov[i][j];
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
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

//  Ejecución diaria para los 7 perfiles 
export async function construirPortafoliosDiarios(
  scores: AssetScoreDiario[],
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

async function persistirPortafolio(port: PortafolioRecomendado): Promise<void> {
  try {
    const { supabase } = await import("./supabase");
    await supabase.from("portafolio_recomendado_diario").insert({
      perfil: port.perfil,
      fecha: port.fecha,
      pesos_macro: JSON.stringify(port.pesosMacro),
      posiciones: JSON.stringify(port.posiciones),
      metricas: JSON.stringify(port.metricas),
      scoring_version: port.scoringVersion,
    });
  } catch {
    // Si falla persistencia, no tumba
  }
}
