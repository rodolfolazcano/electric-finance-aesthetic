/**
 * Motor de portafolios y optimización cuantitativa.
 *
 * Réplica en TypeScript de las clases `distribution`, `manager`, `output`,
 * `Hedger` y el análisis PCA del corpus de referencia (`optimizaciones
 * completo.txt`), usando series históricas reales de Yahoo Finance:
 *  - Sincronización de retornos por fecha común.
 *  - Estadísticas de distribución: mean_annual, vol_annual, sharpe, VaR95,
 *    skewness, kurtosis, Jarque-Bera (stat + p-valor + normalidad).
 *  - Matriz de covarianza anualizada (×252) y matriz de correlación.
 *  - Optimización de carteras: min-variance L1/L2, long-only, markowitz
 *    (target return), equi-weight y volatility-weighted.
 *  - Frontera eficiente (barrido de targets de retorno).
 *  - PCA sobre la matriz de covarianza (autovalores, varianza explicada,
 *    vector de mínima varianza y componentes principales).
 *  - Hedger con función de costo CAPM y solución exacta 2×2.
 */

import { returns, logReturns, mean, variance, covariance } from "./stats";
import { fetchYahooChart } from "./yahoo-http";
import { activoPorTicker } from "./catalogo-activos";
import { benchmarkPorTicker } from "./benchmarks-master";
import { linregress } from "./capm-engine";
import { computeDistribucion } from "./estadisticas";

// ---------------------------------------------------------------------------
// Series sincronizadas por fecha (equivalente a synchronise_timeseries).
// ---------------------------------------------------------------------------

export type PuntoSerie = { fecha: string; close: number };

/** Serie diaria con fecha, normalizada por timestamp de Yahoo. */
export async function serieDiariaConFechas(simbolo: string, rango = "2y"): Promise<PuntoSerie[]> {
  const chart = await fetchYahooChart(simbolo, rango, "1d");
  const result = chart?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const puntos: PuntoSerie[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && isFinite(c) && c > 0) {
      puntos.push({ fecha: new Date(timestamps[i]! * 1000).toISOString().slice(0, 10), close: c });
    }
  }
  const ultimo = result?.meta?.regularMarketPrice ?? null;
  if (puntos.length && typeof ultimo === "number" && isFinite(ultimo) && ultimo > 0) {
    const last = puntos[puntos.length - 1]!;
    if (Math.abs((ultimo - last.close) / last.close) > 0.02) {
      last.close = ultimo;
    }
  }
  return puntos;
}

/** Nombre legible de un símbolo (catálogo o benchmark, con fallback). */
export function nombreActivo(simbolo: string): string {
  return activoPorTicker(simbolo)?.nombre ?? benchmarkPorTicker(simbolo)?.name ?? simbolo;
}

export type RetornosSincronizados = {
  simbolos: string[];
  fechas: string[];
  retornos: Record<string, number[]>;
  errores: Record<string, string | null>;
};

/**
 * Sincroniza los retornos diarios de varios símbolos por fecha común
 * (intersección de calendarios). Devuelve un mapa símbolo → vector de
 * retornos ya alineado a `fechas`.
 */
export async function sincronizarRetornos(
  simbolos: string[],
  rango = "2y",
): Promise<RetornosSincronizados> {
  const unicos = [...new Set(simbolos.map((s) => s.trim()).filter(Boolean))];
  const errores: Record<string, string | null> = {};
  const series: Record<string, Map<string, number>> = {};
  for (const s of unicos) {
    try {
      const pts = await serieDiariaConFechas(s, rango);
      if (!pts.length) {
        errores[s] = "sin datos históricos";
        continue;
      }
      series[s] = new Map(pts.map((p) => [p.fecha, p.close]));
    } catch (e) {
      errores[s] = e instanceof Error ? e.message : "error";
    }
  }
  const validos = unicos.filter((s) => series[s]);
  let fechas = new Set<string>();
  validos.forEach((s, i) => {
    const fechasSerie = new Set(series[s]!.keys());
    if (i === 0) fechas = fechasSerie;
    else fechas = new Set([...fechas].filter((f) => fechasSerie.has(f)));
  });
  const fechasArr = [...fechas].sort();
  const retornos: Record<string, number[]> = {};
  for (const s of validos) {
    const closes: number[] = [];
    for (const f of fechasArr) closes.push(series[s]!.get(f)!);
    retornos[s] = logReturns(closes);
  }
  return { simbolos: validos, fechas: fechasArr, retornos, errores };
}

/**
 * Sincroniza y devuelve la matriz de retornos [T×N] (filas = fechas,
 * columnas = activos) y los vectores por activo, ya alineados.
 */
export async function matrizRetornosSincronizados(
  simbolos: string[],
  rango = "2y",
): Promise<{
  fechas: string[];
  simbolos: string[];
  retornosPorActivo: number[][];
  errores: Record<string, string | null>;
}> {
  const sync = await sincronizarRetornos(simbolos, rango);
  const retornosPorActivo = sync.simbolos.map((s) => sync.retornos[s]!);
  return {
    fechas: sync.fechas,
    simbolos: sync.simbolos,
    retornosPorActivo,
    errores: sync.errores,
  };
}

// ---------------------------------------------------------------------------
// Álgebra lineal: autovalores/autovectores (Jacobi) para PCA y min-variance.
// ---------------------------------------------------------------------------

/** Autovalores y autovectores de una matriz simétrica (método de Jacobi). */
export function autovaloresJacobi(mat: number[][]): {
  values: number[];
  vectors: number[][];
} {
  const n = mat.length;
  const a = mat.map((row) => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  const eps = 1e-15;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i]![j]! * a[i]![j]!;
    if (off < eps) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-14) continue;
        const app = a[p]![p]!;
        const aqq = a[q]![q]!;
        const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
        a[p]![q] = 0;
        a[q]![p] = 0;
      }
    }
  }
  const values = a.map((row, i) => row[i] ?? 0);
  const order = values.map((_, i) => i).sort((x, y) => values[x]! - values[y]!);
  const sortedVals = order.map((i) => values[i]!);
  const sortedVecs = order.map((i) => Array.from({ length: n }, (_, k) => v[k]![i]!));
  return { values: sortedVals, vectors: sortedVecs };
}

/** Producto A·v para matriz cuadrada. */
function mulMatVec(mat: number[][], v: number[]): number[] {
  return mat.map((row) => row.reduce((s, cell, j) => s + cell * v[j]!, 0));
}

/** Proyección al simplex positivo (w>=0, sum=1). Algoritmo de Duchi et al. */
export function proyectarSimplexPositivo(w: number[]): number[] {
  const n = w.length;
  const u = [...w].sort((a, b) => b - a);
  let css = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    css += u[i]!;
    if (u[i]! - (css - 1) / (i + 1) > 0) rho = (css - 1) / (i + 1);
  }
  return w.map((x) => Math.max(0, x - rho));
}

/** Proyección a la esfera L2 de radio `radio` (w'w = radio²). */
export function proyectarEsferaL2(w: number[], radio = 1): number[] {
  const norma = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
  return norma > 0 ? w.map((x) => (x / norma) * radio) : w.map(() => radio / Math.sqrt(w.length));
}

/** Normaliza por norma L1 (sum|w|=1), como en `min_variance_l1`. */
export function normalizarL1(w: number[]): number[] {
  const s = w.reduce((a, x) => a + Math.abs(x), 0);
  return s > 0 ? w.map((x) => x / s) : w.map(() => 1 / w.length);
}

/** Normaliza por norma L2 (sum w²=1), como en `min_variance_l2`. */
export function normalizarL2(w: number[]): number[] {
  const s = Math.sqrt(w.reduce((a, x) => a + x * x, 0));
  return s > 0 ? w.map((x) => x / s) : w.map(() => 1 / Math.sqrt(w.length));
}

// ---------------------------------------------------------------------------
// Matriz de covarianza / correlación (equivalente a np.cov*252 y np.corrcoef).
// ---------------------------------------------------------------------------

/** Covarianza muestral entre dos vectores ya alineados. */
export function covMatriz(retornosPorActivo: number[][]): number[][] {
  const n = retornosPorActivo.length;
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = covariance(retornosPorActivo[i]!, retornosPorActivo[j]!) * 252;
      cov[i]![j] = c;
      cov[j]![i] = c;
    }
  }
  return cov;
}

/** Matriz de correlación. */
export function corrMatriz(retornosPorActivo: number[][]): number[][] {
  const n = retornosPorActivo.length;
  const corr: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const si = Math.sqrt(variance(retornosPorActivo[i]!));
      const sj = Math.sqrt(variance(retornosPorActivo[j]!));
      const c =
        si > 0 && sj > 0 ? covariance(retornosPorActivo[i]!, retornosPorActivo[j]!) / (si * sj) : 0;
      corr[i]![j] = c;
      corr[j]![i] = c;
    }
  }
  return corr;
}

/** Retornos anualizados medios por activo (mean*252). */
export function retornosAnuales(retornosPorActivo: number[][]): number[] {
  return retornosPorActivo.map((r) => mean(r) * 252);
}

/** Volatilidad anualizada por activo (std*sqrt(252)). */
export function volatilidadesAnuales(retornosPorActivo: number[][]): number[] {
  return retornosPorActivo.map((r) => Math.sqrt(variance(r)) * Math.sqrt(252));
}

// ---------------------------------------------------------------------------
// Optimización de carteras.
// ---------------------------------------------------------------------------

export type TipoPortafolio =
  | "min-variance-l1"
  | "min-variance-l2"
  | "long-only"
  | "markowitz"
  | "equi-weight"
  | "volatility-weighted";

export const TIPOS_PORTAFOLIO: TipoPortafolio[] = [
  "equi-weight",
  "volatility-weighted",
  "min-variance-l1",
  "min-variance-l2",
  "long-only",
  "markowitz",
];

export function tipoPortafolioValidos(t: string): boolean {
  return (TIPOS_PORTAFOLIO as string[]).includes(t);
}

const NOMBRES_TIPO: Record<string, string> = {
  "equi-weight": "Equi-weight (pesos iguales)",
  "volatility-weighted": "Riesgo inverso (volatility-weighted)",
  "min-variance-l1": "Mínima varianza L1 (permite cortos)",
  "min-variance-l2": "Mínima varianza L2 (normalizado por norma)",
  "long-only": "Long-only (solo posiciones largas)",
  markowitz: "Markowitz (target de retorno)",
};

export function tipoPortafolioEspanol(t: string): string | undefined {
  return NOMBRES_TIPO[t];
}

export type ResultadoOptimizacion = {
  tipo: TipoPortafolio;
  pesos: Record<string, number>;
  pesosArray: number[];
  retornoAnual: number;
  volatilidadAnual: number;
  sharpe: number;
  var95: number;
  skewness: number;
  kurtosis: number;
  jbStat: number;
  pValue: number;
  isNormal: boolean;
  detalle: string;
};

/**
 * Evalúa una cartera: retorno portafolio diario = Σ w_i·r_i, luego
 * estadísticas de distribución sobre ese vector (clase `distribution`).
 */
export function evaluarPortafolio(
  retornosPorActivo: number[][],
  pesos: number[],
): {
  retornosPortafolio: number[];
  dist: ReturnType<typeof computeDistribucion>;
} {
  const T = retornosPorActivo[0]?.length ?? 0;
  const rp: number[] = [];
  for (let t = 0; t < T; t++) {
    let acc = 0;
    for (let i = 0; i < retornosPorActivo.length; i++) {
      acc += pesos[i]! * retornosPorActivo[i]![t]!;
    }
    rp.push(acc);
  }
  return { retornosPortafolio: rp, dist: computeDistribucion(rp) };
}

/** Maximiza retorno / minimiza varianza con gradiente descendente + proyección. */
function proyectarSegunTipo(w: number[], tipo: TipoPortafolio): number[] {
  switch (tipo) {
    case "long-only":
      return proyectarSimplexPositivo(w);
    case "markowitz":
      return proyectarSimplexPositivo(w);
    case "min-variance-l1":
      return normalizarL1(w);
    case "min-variance-l2":
      return proyectarEsferaL2(w);
    case "equi-weight":
    case "volatility-weighted":
      return w;
  }
}

/**
 * Resuelve la cartera óptima por gradiente proyectado sobre la matriz de
 * covarianza anualizada (minimiza w'Σw, con target de retorno si markowitz).
 */
export function optimizarPesos(
  cov: number[][],
  retAnuales: number[],
  tipo: TipoPortafolio,
  targetReturn?: number,
  iters = 4000,
  lr = 5e-3,
): number[] {
  const n = cov.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  if (tipo === "equi-weight") return new Array(n).fill(1 / n);

  let w: number[];
  if (tipo === "volatility-weighted") {
    const vols = retAnuales.map((r, i) => Math.sqrt(cov[i]![i]!));
    const inv = vols.map((v) => (v > 0 ? 1 / v : 0));
    const s = inv.reduce((a, x) => a + x, 0);
    w = s > 0 ? inv.map((x) => x / s) : new Array(n).fill(1 / n);
    return w;
  }
  if (tipo === "min-variance-l2") {
    const { vectors } = autovaloresJacobi(cov);
    w = normalizarL2(vectors[0]!);
    return w;
  }
  if (tipo === "min-variance-l1") {
    const { vectors } = autovaloresJacobi(cov);
    w = normalizarL1(vectors[0]!);
    // refinamiento por gradiente proyectado con proyección L1.
    for (let i = 0; i < 2000; i++) {
      const g = mulMatVec(cov, w);
      w = w.map((x, j) => x - lr * g[j]!);
      w = normalizarL1(w);
    }
    return w;
  }

  // long-only / markowitz: gradiente proyectado sobre el simplex positivo.
  w = new Array(n).fill(1 / n);
  const target = targetReturn ?? mean(retAnuales);
  const minR = Math.min(...retAnuales);
  const maxR = Math.max(...retAnuales);
  const t = Math.max(minR + 1e-4, Math.min(maxR - 1e-4, target));
  for (let i = 0; i < iters; i++) {
    const g = mulMatVec(cov, w);
    let dw = w.map((x, j) => x - lr * g[j]!);
    if (tipo === "markowitz") {
      const retW = retAnuales.reduce((s, r, j) => s + r * dw[j]!, 0);
      const pen = 5e-3;
      dw = dw.map((x, j) => x - pen * 2 * (retW - t) * retAnuales[j]!);
    }
    w = proyectarSimplexPositivo(dw);
  }
  return w;
}

/** Calcula la frontera eficiente: barrido de targets y varianza mínima. */
export function fronteraEficiente(
  cov: number[][],
  retAnuales: number[],
  puntos = 40,
): Array<{ retorno: number; volatilidad: number; sharpe: number }> {
  const minR = Math.min(...retAnuales);
  const maxR = Math.max(...retAnuales);
  const out: Array<{ retorno: number; volatilidad: number; sharpe: number }> = [];
  for (let i = 0; i <= puntos; i++) {
    const target = minR + ((maxR - minR) * i) / puntos;
    const w = optimizarPesos(cov, retAnuales, "long-only", target);
    const ret = retAnuales.reduce((s, r, j) => s + r * w[j]!, 0);
    const vol = Math.sqrt(
      w.reduce((s, wj, j) => s + wj * cov[j]!.reduce((ss, c, k) => ss + c * w[k]!, 0), 0),
    );
    out.push({ retorno: ret, volatilidad: vol, sharpe: vol > 0 ? ret / vol : 0 });
  }
  return out;
}

/** PCA: autovalores, varianza explicada, vector de mínima varianza y PC1/PC2. */
export function analizarPCA(cov: number[][]): {
  valores: number[];
  varianzaExplicada: number[];
  vectorMinVarianza: number[];
  pc1: number[];
  pc2: number[];
} {
  const { values, vectors } = autovaloresJacobi(cov);
  const total = values.reduce((s, x) => s + x, 0) || 1;
  const varianzaExplicada = values.map((v) => v / total);
  return {
    valores: values.reverse(),
    varianzaExplicada: [...varianzaExplicada].reverse(),
    vectorMinVarianza: vectors[0]!,
    pc1: vectors[vectors.length - 1]!,
    pc2: vectors[vectors.length - 2]!,
  };
}

// ---------------------------------------------------------------------------
// Hedger: función de costo CAPM y solución exacta 2×2.
// ---------------------------------------------------------------------------

export type ResultadoHedger = {
  posicion: { ticker: string; beta: number; delta: number; beta_usd: number };
  hedges: Array<{
    ticker: string;
    name: string;
    beta: number;
    peso: number;
    nocional: number;
  }>;
  cost: number;
  metodo: "exacto-2d" | "gradiente";
  detalle: string;
};

/**
 * Función de costo CAPM del corpus de referencia:
 *  cost(x) = (Σx + delta)² + (β·x + beta_usd)² + reg·Σx²
 * Minimizada con gradiente descendente.
 */
export function costFunctionCAPM(
  x: number[],
  betas: number[],
  delta: number,
  betaUsd: number,
  reg = 0.001,
): number {
  const sumX = x.reduce((s, v) => s + v, 0);
  const betaX = betas.reduce((s, b, i) => s + b * x[i]!, 0);
  return (
    Math.pow(sumX + delta, 2) +
    Math.pow(betaX + betaUsd, 2) +
    reg * x.reduce((s, v) => s + v * v, 0)
  );
}

/** Gradiente numérico de la función de costo CAPM. */
function gradCostFunctionCAPM(
  x: number[],
  betas: number[],
  delta: number,
  betaUsd: number,
  reg: number,
): number[] {
  const sumX = x.reduce((s, v) => s + v, 0);
  const betaX = betas.reduce((s, b, i) => s + b * x[i]!, 0);
  return betas.map((b, i) => 2 * (sumX + delta) + 2 * (betaX + betaUsd) * b + 2 * reg * x[i]!);
}

/** Resuelve el hedge óptimo por gradiente descendente (n candidatos). */
export function resolverHedgeGradiente(
  betas: number[],
  delta: number,
  betaUsd: number,
  reg = 0.001,
  iters = 8000,
  lr = 1e-3,
): number[] {
  let x = new Array(betas.length).fill(-delta / Math.max(1, betas.length));
  for (let i = 0; i < iters; i++) {
    const g = gradCostFunctionCAPM(x, betas, delta, betaUsd, reg);
    x = x.map((v, j) => v - lr * g[j]!);
  }
  return x;
}

/** Solución exacta 2×2: resuelve [Σx = -delta ; β·x = -beta_usd]. */
export function resolverHedgeExacto2D(
  betas: [number, number],
  delta: number,
  betaUsd: number,
): number[] {
  const [b1, b2] = betas;
  const det = b1 - b2;
  if (Math.abs(det) < 1e-12) {
    return [-delta / 2, -delta / 2];
  }
  // sistema: x1 + x2 = -delta ; b1·x1 + b2·x2 = -betaUsd
  const x1 = (-betaUsd + b2 * delta) / det;
  const x2 = -delta - x1;
  return [x1, x2];
}

/** Ejecuta el Hedger completo contra un benchmark. */
export async function calcHedger(
  posiciones: Array<{ ticker: string; valorUSD: number }>,
  benchmark = "SPY",
  rango = "2y",
  maxHedges = 3,
): Promise<ResultadoHedger | { error: string }> {
  const serBench = await serieDiariaConFechas(benchmark, rango);
  if (!serBench.length) return { error: `sin datos del benchmark ${benchmark}` };
  const rb = logReturns(serBench.map((p) => p.close));

  const betasPos: Array<{ ticker: string; beta: number; delta: number; beta_usd: number }> = [];
  for (const p of posiciones) {
    const ser = await serieDiariaConFechas(p.ticker, rango);
    if (!ser.length) continue;
    const ra = logReturns(ser.map((x) => x.close));
    const reg = linregress(rb, ra);
    betasPos.push({
      ticker: p.ticker,
      beta: reg.beta,
      delta: p.valorUSD,
      beta_usd: reg.beta * p.valorUSD,
    });
  }
  if (!betasPos.length) return { error: "sin posiciones válidas" };
  const totalDelta = betasPos.reduce((s, p) => s + p.delta, 0);
  const totalBetaUsd = betasPos.reduce((s, p) => s + p.beta_usd, 0);
  const deltaProm = totalDelta / betasPos.length;
  const betaUsdProm = totalBetaUsd / betasPos.length;

  const candidatos = [
    { ticker: benchmark, name: nombreActivo(benchmark) },
    { ticker: "SPY", name: nombreActivo("SPY") },
    { ticker: "^GSPC", name: nombreActivo("^GSPC") },
    { ticker: "QQQ", name: nombreActivo("QQQ") },
  ].slice(0, maxHedges);

  const betasHedge: number[] = [];
  const hedges: ResultadoHedger["hedges"] = [];
  for (const c of candidatos) {
    const ser = await serieDiariaConFechas(c.ticker, rango);
    if (!ser.length) continue;
    const rh = logReturns(ser.map((x) => x.close));
    const reg = linregress(rb, rh);
    betasHedge.push(reg.beta);
    hedges.push({ ticker: c.ticker, name: c.name, beta: reg.beta, peso: 0, nocional: 0 });
  }
  if (!hedges.length) return { error: "sin candidatos de cobertura" };

  const pesos = resolverHedgeGradiente(betasHedge, deltaProm, betaUsdProm, 0.001);
  const finalHedges = hedges.map((h, i) => ({
    ...h,
    peso: pesos[i]!,
    nocional: pesos[i]! * Math.abs(totalDelta),
  }));
  const cost = costFunctionCAPM(pesos, betasHedge, deltaProm, betaUsdProm, 0.001);
  const exacto = resolverHedgeExacto2D([betasHedge[0]!, betasHedge[1]!], deltaProm, betaUsdProm);

  return {
    posicion: {
      ticker: posiciones[0]!.ticker,
      beta: totalBetaUsd / totalDelta,
      delta: totalDelta,
      beta_usd: totalBetaUsd,
    },
    hedges: finalHedges,
    cost,
    metodo: "gradiente",
    detalle: `Hedger CAPM sobre ${posiciones.length} posición(es) contra ${benchmark}. Solución exacta 2D (${hedges[0]?.ticker} vs ${hedges[1]?.ticker}): ${exacto.map((e) => e.toFixed(4)).join(", ")} (fracción del delta)`,
  };
}

// ---------------------------------------------------------------------------
// Orquestación high-level: análisis completo de un portafolio.
// ---------------------------------------------------------------------------

export type InputActivo = { ticker: string; montoUSD?: number };

export type ResultadoPortafolio = {
  simbolos: string[];
  labels: string[];
  fechas: string[];
  errores: Record<string, string | null>;
  cov: number[][];
  corr: number[][];
  retAnuales: number[];
  volAnuales: number[];
  distribucionPorActivo: ReturnType<typeof computeDistribucion>[];
  pca: ReturnType<typeof analizarPCA>;
  frontera: Array<{ retorno: number; volatilidad: number; sharpe: number }>;
  optimizaciones: Record<TipoPortafolio, ResultadoOptimizacion | null>;
  hedger: ResultadoHedger | { error: string } | null;
};

export type OpcionesAnalisisPortafolio = {
  activos: InputActivo[];
  rango?: string;
  tipos?: TipoPortafolio[];
  targetReturn?: number;
  benchmark?: string;
  puntosFrontera?: number;
};

/** Análisis completo: covarianza, distribución, optimizaciones, PCA, hedge. */
export async function analizarPortafolio(
  opts: OpcionesAnalisisPortafolio,
): Promise<ResultadoPortafolio> {
  const rango = opts.rango ?? "2y";
  const tipos = opts.tipos ?? [
    "equi-weight",
    "volatility-weighted",
    "min-variance-l1",
    "min-variance-l2",
    "long-only",
    "markowitz",
  ];
  const activosLimpios = opts.activos.filter((a) => a.ticker?.trim());
  const tickers = activosLimpios.map((a) => a.ticker.trim());

  const { fechas, simbolos, retornosPorActivo, errores } = await matrizRetornosSincronizados(
    tickers,
    rango,
  );
  const cov = covMatriz(retornosPorActivo);
  const corr = corrMatriz(retornosPorActivo);
  const retAnuales = retornosAnuales(retornosPorActivo);
  const volAnuales = volatilidadesAnuales(retornosPorActivo);
  const dist = retornosPorActivo.map((r) => computeDistribucion(r));
  const pca = analizarPCA(cov);
  const frontera = fronteraEficiente(cov, retAnuales, opts.puntosFrontera ?? 40);

  const optimizaciones = {} as Record<TipoPortafolio, ResultadoOptimizacion | null>;
  for (const tipo of tipos) {
    try {
      const pesos = optimizarPesos(cov, retAnuales, tipo, opts.targetReturn);
      const { dist: d } = evaluarPortafolio(retornosPorActivo, pesos);
      const pesosRecord: Record<string, number> = {};
      simbolos.forEach((s, i) => (pesosRecord[s] = pesos[i]!));
      optimizaciones[tipo] = {
        tipo,
        pesos: pesosRecord,
        pesosArray: pesos,
        retornoAnual: d.meanAnnual ?? 0,
        volatilidadAnual: d.volatilityAnnual ?? 0,
        sharpe: d.sharpeRatio ?? 0,
        var95: d.var95 ?? 0,
        skewness: d.skewness ?? 0,
        kurtosis: d.kurtosis ?? 0,
        jbStat: d.jbStat ?? 0,
        pValue: d.pValue ?? 0,
        isNormal: d.isNormal ?? false,
        detalle: "",
      };
    } catch {
      optimizaciones[tipo] = null;
    }
  }

  let hedger: ResultadoHedger | { error: string } | null = null;
  const montos = activosLimpios
    .map((a) => ({ ticker: a.ticker.trim(), valorUSD: a.montoUSD ?? 10000 }))
    .filter((a) => tickers.includes(a.ticker));
  if (montos.length) {
    hedger = await calcHedger(montos, opts.benchmark ?? "SPY", rango).catch(() => null);
  }

  return {
    simbolos,
    labels: simbolos.map((s) => nombreActivo(s)),
    fechas,
    errores,
    cov,
    corr,
    retAnuales,
    volAnuales,
    distribucionPorActivo: dist,
    pca,
    frontera,
    optimizaciones,
    hedger,
  };
}

/** Formatea un porcentaje legible. */
export function fmtPct(x: number, dec = 2): string {
  return `${(x * 100).toFixed(dec)}%`;
}

export { computeDistribucion };
