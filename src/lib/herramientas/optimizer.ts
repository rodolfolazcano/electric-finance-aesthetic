// @ts-nocheck
// Portfolio math + simplex-constrained optimizer (pure TS, no deps).
// Long-only (w_i >= 0, sum w = 1) using projected gradient descent.
//
// ─── BLOQUE 6 — Riesgo y teoría de portafolios (confirmación conceptual, sin código nuevo) ───
// Fuente: Pascale, Cap. 9 (varianza/σ como subrogante del riesgo; riesgo sistemático vs
// no sistemático) y Cap. 10 (frontera de eficiencia de Markowitz).
//
// Este archivo ya implementa la parte formal de ese marco: covMatrix(), portfolioVariance()
// y las estrategias Min-Variance/Markowitz/Max-Sharpe. No se agrega código acá.
//
// CRITERIO DE COHERENCIA (para el Paso 15 del índice general — síntesis final):
// El CAPM (src/lib/valuacion.functions.ts, Bloque 1) asume explícitamente que el inversor ya
// diversificó de forma eficiente (supuesto c) del modelo, Pascale Cap. 13). Por lo tanto el beta
// usado en el CAPM y la composición óptima que produce este optimizador NO son herramientas
// independientes: son dos capas del mismo marco teórico. Si en algún momento se conecta el
// resultado de optimizer.ts (portafolio óptimo del usuario) con el score individual de cada
// activo (src/lib/scoring/motor-unificado.ts), deben ser consistentes con ese supuesto:
//   - un activo con beta alto en el CAPM (riesgo sistemático alto) debe aparecer con peso
//     contenido en la estrategia Min-Variance del optimizador;
//   - el score individual (motor-unificado) no debe contradecir la herramienta de riesgo
//     sistemático del portafolio (si un activo es "el mayor riesgo del portafolio" por varianza
//     marginal y el motor lo puntúa compra por momentum, es una contradicción que el Paso 15
//     debe señalar, no promediar).
// Este archivo es la capa "riesgo de portafolio"; valuacion.functions.ts la capa "riesgo del
// activo"; motor-unificado.ts la capa "score del activo". El Paso 15 las reconcilia.

import { computePVariance, impliedPFromReturns, mean, std } from "./math/stats";
import { detectCalculationAnomalies, type AnomalyReport } from "./social/anomaly-detector";
import { getRiskFreeRateSync } from "./risk-free-rate";

export type Matrix = number[][];

export { mean, std };

// log returns
export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1],
      b = prices[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

// Sample covariance matrix of column-aligned returns: returns[t][i]
export function covMatrix(returns: number[][]): Matrix {
  const T = returns.length;
  const N = returns[0]?.length ?? 0;
  const means = new Array(N).fill(0);
  for (let t = 0; t < T; t++) for (let i = 0; i < N; i++) means[i] += returns[t][i];
  for (let i = 0; i < N; i++) means[i] /= T;
  const cov: Matrix = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += (returns[t][i] - means[i]) * (returns[t][j] - means[j]);
      const v = s / Math.max(1, T - 1);
      cov[i][j] = v;
      cov[j][i] = v;
    }
  }
  return cov;
}

function matVec(M: Matrix, v: number[]): number[] {
  const N = v.length;
  const out = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < N; j++) s += M[i][j] * v[j];
    out[i] = s;
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function portfolioVariance(w: number[], cov: Matrix): number {
  return dot(w, matVec(cov, w));
}

// ─── Labadie §3.2: p-variance del portafolio ───
export function portfolioPVariance(w: number[], returns: number[][], p: number = 2): number {
  // Calcula la p-variance del portafolio: E[|w·r - μ_port|^p]^(1/p)
  const T = returns.length;
  const n = w.length;
  if (T < 2 || n === 0) return 0;
  const portReturns: number[] = [];
  for (let t = 0; t < T; t++) {
    let r = 0;
    for (let i = 0; i < n; i++) r += w[i] * returns[t][i];
    portReturns.push(r);
  }
  return computePVariance(portReturns, p);
}

// Eigendecomposition of a symmetric matrix using Jacobi iteration.
// Returns eigenvalues sorted ascending and corresponding eigenvectors.
export function eigenDecomposition(matrix: Matrix): {
  eigenvalues: number[];
  eigenvectors: Matrix;
} {
  const n = matrix.length;
  let A = matrix.map((row) => [...row]);
  let V = Array.from({ length: n }, (_, i) => {
    const v = new Array(n).fill(0);
    v[i] = 1;
    return v;
  });
  const maxIter = 100;
  const tol = 1e-10;
  for (let iter = 0; iter < maxIter; iter++) {
    let maxOff = 0;
    let p = 0,
      q = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const abs = Math.abs(A[i][j]);
        if (abs > maxOff) {
          maxOff = abs;
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < tol) break;
    const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
    const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    for (let i = 0; i < n; i++) {
      const ap = A[i][p];
      const aq = A[i][q];
      A[i][p] = ap * c - aq * s;
      A[i][q] = ap * s + aq * c;
      const vp = V[i][p];
      const vq = V[i][q];
      V[i][p] = vp * c - vq * s;
      V[i][q] = vp * s + vq * c;
    }
    for (let j = 0; j < n; j++) {
      const ap = A[p][j];
      const aq = A[q][j];
      A[p][j] = ap * c - aq * s;
      A[q][j] = ap * s + aq * c;
    }
    A[p][q] = 0;
    A[q][p] = 0;
  }
  const eigenvalues = A.map((row, i) => row[i]);
  // Normalize eigenvectors
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let i = 0; i < n; i++) norm += V[i][j] * V[i][j];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < n; i++) V[i][j] /= norm;
  }
  return { eigenvalues, eigenvectors: V };
}

// Project a vector onto the probability simplex {w | w_i >= 0, sum w = 1}.
// Wang & Carreira-Perpiñán (2013), O(n log n).
export function projectSimplex(v: number[]): number[] {
  const n = v.length;
  const u = [...v].sort((a, b) => b - a);
  let cssv = 0;
  let rho = -1;
  for (let i = 0; i < n; i++) {
    cssv += u[i];
    const t = (cssv - 1) / (i + 1);
    if (u[i] - t > 0) rho = i;
  }
  let cssvRho = 0;
  for (let i = 0; i <= rho; i++) cssvRho += u[i];
  const theta = (cssvRho - 1) / (rho + 1);
  return v.map((x) => Math.max(0, x - theta));
}

interface OptimizeOpts {
  iters?: number;
  lr?: number;
}

// Generic projected gradient descent on the simplex.
function pgd(grad: (w: number[]) => number[], n: number, opts: OptimizeOpts = {}): number[] {
  const iters = opts.iters ?? 800;
  const lr0 = opts.lr ?? 0.05;
  let w = new Array(n).fill(1 / n);
  for (let k = 0; k < iters; k++) {
    const g = grad(w);
    const lr = lr0 / (1 + k * 0.005);
    const step = w.map((wi, i) => wi - lr * g[i]);
    w = projectSimplex(step);
  }
  return w;
}

export interface OptimizationResult {
  strategy: Strategy;
  weights: number[];
  expectedReturn: number; // annualized
  volatility: number; // annualized
  sharpe: number;
  // ─── Labadie §3.2: p-variance ───
  pSharpe?: number;
  pVariance?: number;
  // ─── TAO-*: Anomaly detection ───
  anomalyReport?: AnomalyReport;
  correctedP?: number;
}

export type Strategy =
  | "min-variance"
  | "max-sharpe"
  | "equal-weight"
  | "inverse-vol"
  | "markowitz"
  | "min-pvar"
  | "max-psharpe";

// Factor de anualización y tasa libre de riesgo
const FACTOR = 252;

export interface Inputs {
  meanDaily: number[]; // daily mean log returns
  volDaily: number[]; // daily stdev
  cov: Matrix; // daily covariance
  targetReturn?: number; // daily target for markowitz
  // ─── Labadie §3.2: p-variance ───
  pValue?: number; // p para p-variance (default 2=std)
  returnsRows?: number[][]; // daily returns row-wise [T][N] para p-variance directa
}

export function optimize(strategy: Strategy, inp: Inputs): OptimizationResult {
  const n = inp.meanDaily.length;
  let w: number[];

  if (strategy === "equal-weight") {
    w = new Array(n).fill(1 / n);
  } else if (strategy === "inverse-vol") {
    const inv = inp.volDaily.map((v) => (v > 0 ? 1 / v : 0));
    const s = inv.reduce((a, b) => a + b, 0);
    w = s > 0 ? inv.map((x) => x / s) : new Array(n).fill(1 / n);
  } else if (strategy === "min-variance") {
    // PGD resolves min w'Σw s.t. w ≥ 0, Σw = 1 directly (constrained QP).
    // Eigendecomposition + projection does not yield the constrained optimum.
    w = pgd((x) => matVec(inp.cov, x).map((g) => 2 * g), n, { iters: 1000, lr: 0.1 });
  } else if (strategy === "max-sharpe") {
    // maximize (mu·w - rf) / sqrt(wΣw)  ->  minimize negative
    const rfDaily = getRiskFreeRateSync("USD") / 252;
    w = pgd(
      (x) => {
        const r = dot(inp.meanDaily, x) - rfDaily;
        const v = portfolioVariance(x, inp.cov);
        const sv = Math.sqrt(Math.max(v, 1e-12));
        // gradient of -(r)/sv  w.r.t w_i: -mu_i/sv + r*(Σw)_i / sv^3
        const Sw = matVec(inp.cov, x);
        return inp.meanDaily.map((mu, i) => -mu / sv + (r * Sw[i]) / (sv * sv * sv));
      },
      n,
      { iters: 1200, lr: 0.05 },
    );
  } else if (strategy === "min-pvar") {
    // ─── Labadie §3.2: Mínima p-variance ───
    // Minimizar p-variance(w·r) en vez de w^T·Σ·w
    const p = inp.pValue ?? 2;
    const rets = inp.returnsRows;
    if (!rets || rets.length < 20) {
      // Fallback a mínima varianza si no hay rets
      w = pgd((x) => matVec(inp.cov, x).map((g) => 2 * g), n, { iters: 1000, lr: 0.1 });
    } else {
      const T = rets.length;
      // Per-asset means for correct gradient: (r_t,i - μ_i)
      const assetMeans = new Array(n).fill(0);
      for (let t = 0; t < T; t++) for (let i = 0; i < n; i++) assetMeans[i] += rets[t][i];
      for (let i = 0; i < n; i++) assetMeans[i] /= T;
      w = pgd(
        (x) => {
          const portRets: number[] = [];
          for (let t = 0; t < T; t++) {
            let r = 0;
            for (let i = 0; i < n; i++) r += x[i] * rets[t][i];
            portRets.push(r);
          }
          const muP = portRets.reduce((s, v) => s + v, 0) / T;
          const grad: number[] = new Array(n).fill(0);
          for (let t = 0; t < T; t++) {
            const dev = portRets[t] - muP;
            const absDevP1 = Math.pow(Math.abs(dev), p - 1);
            const sign = dev >= 0 ? 1 : -1;
            const factor = (p * absDevP1 * sign) / T;
            for (let i = 0; i < n; i++) grad[i] += factor * (rets[t][i] - assetMeans[i]);
          }
          return grad;
        },
        n,
        { iters: 1000, lr: 0.5 },
      );
    }
  } else if (strategy === "max-psharpe") {
    // ─── Labadie §3.2: Máximo p-Sharpe ───
    // Maximizar (mu·w) / p-variance(w·r)^(1/p)
    const p = inp.pValue ?? 2;
    const rets = inp.returnsRows;
    if (!rets || rets.length < 20) {
      // Fallback a máximo Sharpe
      w = pgd(
        (x) => {
          const r = dot(inp.meanDaily, x);
          const v = portfolioVariance(x, inp.cov);
          const sv = Math.sqrt(Math.max(v, 1e-12));
          const Sw = matVec(inp.cov, x);
          return inp.meanDaily.map((mu, i) => -mu / sv + (r * Sw[i]) / (sv * sv * sv));
        },
        n,
        { iters: 1200, lr: 0.05 },
      );
    } else {
      const T = rets.length;
      // Per-asset means for correct gradient
      const assetMeans = new Array(n).fill(0);
      for (let t = 0; t < T; t++) for (let i = 0; i < n; i++) assetMeans[i] += rets[t][i];
      for (let i = 0; i < n; i++) assetMeans[i] /= T;
      w = pgd(
        (x) => {
          const r = dot(inp.meanDaily, x);
          const portRets: number[] = [];
          for (let t = 0; t < T; t++) {
            let rv = 0;
            for (let i = 0; i < n; i++) rv += x[i] * rets[t][i];
            portRets.push(rv);
          }
          const muP = portRets.reduce((s, v) => s + v, 0) / T;
          const pVar = portRets.reduce((s, v) => s + Math.pow(Math.abs(v - muP), p), 0) / T;
          const pStd = Math.max(Math.pow(pVar, 1 / p), 1e-12);
          // gradient of -S_p = -(m/σ_p):  d(-S_p)/dw_i = -μ_i/σ_p + m * σ_p^(-1-p) * (1/T) * Σ |dev|^(p-1) * sign(dev) * (r_t,i - μ_i)
          const grad: number[] = new Array(n).fill(0);
          const factorBase = (r * Math.pow(pStd, -1 - p)) / T;
          for (let t = 0; t < T; t++) {
            const dev = portRets[t] - muP;
            const sign = dev >= 0 ? 1 : -1;
            const wgt = factorBase * Math.pow(Math.abs(dev), p - 1) * sign;
            for (let i = 0; i < n; i++) grad[i] += wgt * (rets[t][i] - assetMeans[i]);
          }
          return inp.meanDaily.map((mu, i) => -mu / pStd + grad[i]);
        },
        n,
        { iters: 1000, lr: 0.5 },
      );
    }
  } else {
    // markowitz: target return = mean of mu (or provided), minimize variance with sum=1 + non-neg.
    // Penalty method on the equality.
    const target = inp.targetReturn ?? mean(inp.meanDaily);
    const lambda = 2000;
    w = pgd(
      (x) => {
        const Sw = matVec(inp.cov, x);
        const gap = dot(inp.meanDaily, x) - target;
        return Sw.map((s, i) => 2 * s + 2 * lambda * gap * inp.meanDaily[i]);
      },
      n,
      { iters: 2000, lr: 0.05 },
    );
  }

  const dailyRet = dot(inp.meanDaily, w);
  const dailyVar = portfolioVariance(w, inp.cov);
  const dailyVol = Math.sqrt(Math.max(dailyVar, 0));
  const annRet = dailyRet * FACTOR;
  const annVol = dailyVol * Math.sqrt(FACTOR);
  const rfAnual = getRiskFreeRateSync("USD");
  const rfCont = Math.log(1 + rfAnual);
  const sharpe = annVol > 0 ? (annRet - rfCont) / annVol : 0;

  // ─── Labadie §3.2: p-variance del portafolio ───
  let pSharpe: number | undefined;
  let pVariance: number | undefined;
  let anomalyReport: AnomalyReport | undefined;
  let correctedP: number | undefined;
  const pUsed = inp.pValue ?? 2;
  if (inp.returnsRows && inp.returnsRows.length >= 20) {
    pVariance = portfolioPVariance(w, inp.returnsRows, pUsed);
    const pStd = pVariance > 0 ? Math.pow(pVariance, 1 / pUsed) : 0;
    pSharpe = pStd > 0 ? (dailyRet * FACTOR - rfCont) / (pStd * Math.pow(FACTOR, 1 / pUsed)) : 0;
    // ─── TAO-*: Anomaly detection en el motor de cálculo ───
    const portfolioReturns = inp.returnsRows.map((r) => dot(w, r));
    anomalyReport = detectCalculationAnomalies({
      returns: portfolioReturns,
      weights: w,
      pValue: pUsed,
      sharpe,
      volatility: annVol,
      meanReturn: dailyRet,
    });
    if (anomalyReport.hasAnomaly) {
      const impliedP = impliedPFromReturns(portfolioReturns);
      if (Math.abs(impliedP - pUsed) / Math.max(0.1, pUsed) > 0.3) {
        correctedP = Math.round(impliedP * 10) / 10;
      }
    }
  }

  return {
    strategy,
    weights: w,
    expectedReturn: annRet,
    volatility: annVol,
    sharpe,
    pSharpe,
    pVariance,
    anomalyReport,
    correctedP,
  };
}

// Indicators
export function rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period,
    avgL = loss / period;
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function ema(series: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  let prev = series[0];
  out.push(prev);
  for (let i = 1; i < series.length; i++) {
    prev = series[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function macd(prices: number[]): { macd: number; signal: number } {
  if (prices.length < 34) return { macd: 0, signal: 0 };
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const line = prices.map((_, i) => ema12[i] - ema26[i]);
  const sig = ema(line, 9);
  return { macd: line[line.length - 1], signal: sig[sig.length - 1] };
}

export function sma(prices: number[], period: number): number {
  if (prices.length < period) return Number.NaN;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}
