// @ts-nocheck
// src/lib/math/stats.ts
// Funciones estadísticas puras sin dependencias externas — clamp vía contracts (dueño A)
import { clampH, clampP } from "@/lib/labadie/contracts";

const SQRT2PI = Math.sqrt(2 * Math.PI);
const GAMMA_COEF = [
  76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
  1.208650973866179e-3, -5.395239384953e-6,
];

// ============================================================================
// erf: función error (Aproximación de Abramowitz-Stegun)
// ============================================================================
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

// ============================================================================
// logGamma: logaritmo de la función gamma (Aproximación de Lanczos)
// ============================================================================
export function logGamma(x: number): number {
  if (x <= 0) return NaN;
  let y = x,
    tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += GAMMA_COEF[j] / y;
  }
  return -tmp + Math.log((SQRT2PI * ser) / x);
}

// ============================================================================
// normalCDF: función de distribución normal acumulada
// ============================================================================
export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

export function normalCDFInverse(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Aproximación de Moro
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.4735109309, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [
    0.3374754822726147, 0.9761690190917186, 0.1607979714918209, 0.0276438810333863,
    0.0038405729373609, 0.0003951896511919, 0.0000321767881768, 0.0000002888167364,
    0.0000003960315187,
  ];
  const y = p - 0.5;
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    const num = y * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]);
    const den = (((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1;
    return num / den;
  }
  const r = p < 0.5 ? p : 1 - p;
  const s = Math.log(-Math.log(r));
  let t = c[0];
  for (let i = 1; i < c.length; i++) t += c[i] * Math.pow(s, i);
  return p < 0.5 ? -t : t;
}

// ============================================================================
// tCDF: distribución t de Student
// ============================================================================
function ibeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0 || x === 1) return x;
  const exp = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (exp * betacf(a, b, x)) / a;
  return 1 - (exp * betacf(b, a, 1 - x)) / b;
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 100;
  const EPS = 3e-11;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function tCDF(t: number, df: number): number {
  if (df <= 0) return NaN;
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  const p = ibeta(df / 2, 0.5, x);
  return t > 0 ? 1 - 0.5 * p : 0.5 * p;
}

export function pValueFromT(t: number, df: number): number {
  return 2 * (1 - tCDF(Math.abs(t), df));
}

// ============================================================================
// chi2CDF: distribución chi-cuadrado (Wilson-Hilferty)
// ============================================================================
export function chi2CDF(x: number, df: number): number {
  if (x <= 0) return 0;
  const m = df / 2;
  // Regularized gamma lower
  let sum = 0,
    term = 1 / m;
  for (let k = 0; k < 100; k++) {
    sum += term;
    if (Math.abs(term) < 1e-15) break;
    term *= x / 2 / (m + k + 1);
  }
  const gamma = Math.exp(-x / 2 + m * Math.log(x / 2) - logGamma(m));
  return gamma * sum;
}

// ============================================================================
// pearsonR, zScore, bollingerBands
// ============================================================================
export function pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0,
    sx2 = 0,
    sy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx,
      dy = y[i] - my;
    sxy += dx * dy;
    sx2 += dx * dx;
    sy2 += dy * dy;
  }
  return sx2 > 0 && sy2 > 0 ? sxy / Math.sqrt(sx2 * sy2) : 0;
}

export function zScore(serie: number[], ventana: number = 90): number[] {
  return serie.map((_, i) => {
    if (i < ventana) return 0;
    const slice = serie.slice(i - ventana, i);
    const mean = slice.reduce((a, b) => a + b, 0) / ventana;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / ventana);
    return std === 0 ? 0 : (serie[i] - mean) / std;
  });
}

export function bollingerBands(serie: number[], periodo: number = 20, k: number = 2) {
  const ma = sma(serie, periodo);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < serie.length; i++) {
    if (i < periodo - 1 || ma[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = serie.slice(i - periodo + 1, i + 1);
    const m = ma[i]!;
    const s = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / slice.length);
    upper.push(m + k * s);
    lower.push(m - k * s);
  }
  return { ma, upper, lower };
}

// ============================================================================
// computeHurst: Exponente de Hurst vía R/S analysis (Labadie 1205.3482v6 §3.2)
// H ∈ (0,1). H=0.5 → random walk; H<0.5 → mean-reverting; H>0.5 → trending
// Identidad del paper: p = 1/H
// Nota: R/S es sesgado en n<100 y en series con tendencia. Futuro: DFA/Whittle.
// Clamp estrecho documentado: Labadié recomienda p∈[1.1,4] → H∈[0.25,0.91]
// ============================================================================
export function computeHurst(serie: number[]): number {
  const n = serie.length;
  if (n < 100) return 0.5; // mín 100 obs; con <100 el estimador es ruido — retornar H neutral

  // Log-spaced lags: potencias de 2 desde 4 hasta n/2
  const maxLag = Math.floor(n / 2);
  const lags: number[] = [];
  let lag = 4;
  while (lag <= maxLag) {
    lags.push(lag);
    const next = Math.min(Math.floor(lag * 1.5), maxLag);
    if (next <= lag) break; // maxLag alcanzado — sin esto: bucle infinito (RangeError) — fix B0 coordinación con A0
    lag = next;
  }
  if (lags.length < 3) return 0.5;

  const logRS: number[] = [];
  const logLags: number[] = [];

  for (const L of lags) {
    const numBlocks = Math.floor(n / L);
    if (numBlocks < 2) continue;

    let rsSum = 0;
    let count = 0;

    for (let b = 0; b < numBlocks; b++) {
      const start = b * L;
      const block = serie.slice(start, start + L);
      const blockMean = block.reduce((s, v) => s + v, 0) / block.length;
      const deviations = block.map((v) => v - blockMean);
      const cumulative = deviations.reduce((arr, d) => {
        const prev = arr.length > 0 ? arr[arr.length - 1] : 0;
        arr.push(prev + d);
        return arr;
      }, [] as number[]);
      const R = Math.max(...cumulative) - Math.min(...cumulative);
      const S = Math.sqrt(block.reduce((s, v) => s + (v - blockMean) ** 2, 0) / (block.length - 1));
      if (S > 0) {
        rsSum += R / S;
        count++;
      }
    }
    if (count > 0) {
      logRS.push(Math.log(rsSum / count));
      logLags.push(Math.log(L));
    }
  }
  if (logRS.length < 3) return 0.5;

  // Regresión lineal: log(R/S) = log(c) + H * log(n)
  const result = linregress(logLags, logRS);
  return clampH(result.slope);
}

// ============================================================================
// impliedPFromReturns: Estima p vía regresión multi-escala de momentos absolutos
// Labadie 1205.3482v6 §4.3: p se infiere de la auto-similaridad de los retornos
// Método: log(E[|r_τ|^q]) ~ q·H·log(τ), luego p = 1/H
// Más robusto estadísticamente que R/S analysis para estimar H
// ============================================================================
export function impliedPFromReturns(
  returns: number[],
  q: number = 1,
  minP: number = 1.1,
  maxP: number = 4,
): number {
  const T = returns.length;
  if (T < 100) return 2;
  // Escalas log-spaced: potencias de 2 desde 1 hasta floor(T/4)
  const scales: number[] = [];
  let s = 2;
  while (s <= Math.floor(T / 4)) {
    scales.push(s);
    s = Math.min(Math.max(2, Math.floor(s * 1.8)), Math.floor(T / 4) + 1);
  }
  if (scales.length < 4) return 2;
  const logTau: number[] = [];
  const logMq: number[] = [];
  const mu = mean(returns);
  for (const tau of scales) {
    const numBlocks = Math.floor(T / tau);
    let sumAbs = 0;
    let count = 0;
    for (let b = 0; b < numBlocks; b++) {
      let agg = 0;
      for (let i = 0; i < tau; i++) agg += returns[b * tau + i];
      agg -= tau * mu;
      sumAbs += Math.pow(Math.abs(agg), q);
      count++;
    }
    if (count > 0 && sumAbs > 0) {
      logTau.push(Math.log(tau));
      logMq.push(Math.log(sumAbs / count) / q);
    }
  }
  if (logTau.length < 4) return 2;
  const reg = linregress(logTau, logMq); // slope = H
  const H = clampH(reg.slope);
  return clampP(1 / H);
}

// ============================================================================
// computePVariance: p-variance como medida de riesgo generalizada
// Labadie 1205.3482v6 §3.2: p-variation = E[|X - μ|^p] (p-th moment about the mean)
// Para p=2 recupera la varianza clásica E[(X-μ)²].
// Para convertir a unidades originales: tomar raíz p-ésima: σ_p = (p-variation)^(1/p)
// ============================================================================
export function computePVariance(returns: number[], p: number = 2): number {
  if (returns.length < 2) return 0;
  const meanR = mean(returns);
  const absDeviations = returns.map((r) => Math.pow(Math.abs(r - meanR), p));
  const meanAbsDev = absDeviations.reduce((s, v) => s + v, 0) / absDeviations.length;
  if (meanAbsDev <= 0) return 0;
  return meanAbsDev; // retorna E[|X-μ|^p] (el p-ésimo momento absoluto, NO la raíz p-ésima)
}

// ============================================================================
// fractionalBrownianMotion: Genera ruido fraccional con Hurst H
// Usa el método de Davies-Harte (aproximación espectral)
// Para simular precios self-similar: S(t+τ) = S(t) + σ * τ^H * fBM
// ============================================================================
export function fractionalBrownianMotion(n: number, H: number): number[] {
  if (H <= 0 || H >= 1) return Array.from({ length: n }, () => randomNormal());
  // Método de Cholesky para fBM (limitado a N≤100 por performance O(N³))
  // Cov(i,j) = 0.5 * (|i|^(2H) + |j|^(2H) - |i-j|^(2H))
  const N = Math.min(n, 100);
  const cov: number[][] = [];
  for (let i = 0; i < N; i++) {
    cov[i] = [];
    for (let j = 0; j < N; j++) {
      cov[i][j] =
        0.5 *
        (Math.pow(Math.abs(i), 2 * H) +
          Math.pow(Math.abs(j), 2 * H) -
          Math.pow(Math.abs(i - j), 2 * H));
    }
  }
  // Cholesky decomposition
  const L: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(0, cov[i][i] - sum));
      } else {
        L[i][j] = (cov[i][j] - sum) / Math.max(0.001, L[j][j]);
      }
    }
  }
  const z = Array.from({ length: N }, () => randomNormal());
  const result: number[] = [];
  for (let i = 0; i < N; i++) {
    let val = 0;
    for (let j = 0; j <= i; j++) val += L[i][j] * z[j];
    result.push(val);
  }
  // Extensión con fGn (Fractional Gaussian Noise) simplificado para n > N
  // Usa el hecho de que la covarianza decae como k^(2H-2) para k grande
  for (let i = N; i < n; i++) {
    const noise = randomNormal() * Math.pow(i, H - 0.5);
    result.push(result[result.length - 1] * 0.9 + noise * 0.1);
  }
  return result;
}

// ============================================================================
// Statistical helpers
// ============================================================================
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function std(arr: number[], sample = true): number {
  const n = arr.length;
  if (n < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (n - (sample ? 1 : 0)));
}

export function sma(arr: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    result.push(arr.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period);
  }
  return result;
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const idx = (p / 100) * (sorted.length - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  return sorted[low] + (idx - low) * (sorted[high] - sorted[low]);
}

export function randomNormal(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function brierScore(predicciones: number[], resultados: number[]): number {
  return predicciones.reduce((s, p, i) => s + (p - resultados[i]) ** 2, 0) / predicciones.length;
}

export function computeHistogram(data: number[], bins = 40): { binStart: number; freq: number }[] {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const w = (max - min) / bins || 0.001;
  const result: { binStart: number; freq: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = min + i * w;
    const hi = lo + w;
    const isLast = i === bins - 1;
    result.push({
      binStart: lo,
      freq: data.filter((v) => v >= lo && (isLast ? v <= hi : v < hi)).length,
    });
  }
  return result;
}

// ============================================================================
// Regresión lineal
// ============================================================================
export function linregress(
  x: number[],
  y: number[],
): { slope: number; intercept: number; r2: number; pValue: number; stdErr: number } {
  const n = x.length;
  const mx = mean(x),
    my = mean(y);
  let sxy = 0,
    sx2 = 0,
    sy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx,
      dy = y[i] - my;
    sxy += dx * dy;
    sx2 += dx * dx;
    sy2 += dy * dy;
  }
  const slope = sx2 > 0 ? sxy / sx2 : 0;
  const intercept = my - slope * mx;
  const r2 = sx2 > 0 && sy2 > 0 ? (sxy * sxy) / (sx2 * sy2) : 0;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i] - (slope * x[i] + intercept);
    sse += e * e;
  }
  const stdErr = n > 2 ? Math.sqrt(sse / (n - 2)) / Math.sqrt(sx2) : Infinity;
  const t = stdErr > 0 ? Math.abs(slope) / stdErr : 0;
  const pValue = n > 2 ? 2 * (1 - tCDF(t, n - 2)) : 1;
  return { slope, intercept, r2, pValue, stdErr };
}

// ── A0: CI95 μ±1.96σ (pt/01_rv_sim) ─────────────────────────────────────
export function ci95(arr: number[]): [number, number] {
  if (arr.length === 0) return [0, 0];
  const m = mean(arr);
  const s = std(arr);
  const d = 1.96 * s;
  return [m - d, m + d];
}

// IC95 para la media muestral: x̄ ± 1.96·σ/√n (seminario_geometry §1)
export function ci95Mean(arr: number[]): [number, number] {
  if (arr.length === 0) return [0, 0];
  const m = mean(arr);
  const s = std(arr);
  const se = s / Math.sqrt(arr.length);
  const d = 1.96 * se;
  return [m - d, m + d];
}

// Jarque-Bera: JB = n/6·(S² + (K−3)²/4) vs χ²(2) — test de normalidad (pt/market_data.py distribution)
export function jarqueBera(arr: number[]): { jb: number; pValue: number; isNormal: boolean; skewness: number; kurtosis: number } {
  const n = arr.length;
  if (n < 8) return { jb: 0, pValue: 1, isNormal: true, skewness: 0, kurtosis: 3 };
  const m = mean(arr);
  const s = std(arr, false); // poblacional para momentos
  if (s === 0) return { jb: 0, pValue: 1, isNormal: true, skewness: 0, kurtosis: 3 };
  let m3 = 0, m4 = 0;
  for (const v of arr) {
    const d = (v - m) / s;
    m3 += d ** 3;
    m4 += d ** 4;
  }
  m3 /= n;
  m4 /= n;
  const jb = (n / 6) * (m3 * m3 + ((m4 - 3) * (m4 - 3)) / 4);
  const pValue = 1 - chi2CDF(jb, 2);
  return { jb, pValue, isNormal: pValue > 0.05, skewness: m3, kurtosis: m4 };
}

// Demo pt/01_rv_sim.py — 6 distribuciones con randomNormal() existente
export function runRvSim(n = 10000): {
  normal: number[];
  studentT: number[];
  chi2: number[];
  uniform: number[];
  lognormal: number[];
  expo: number[];
} {
  const df = 5;
  const normal: number[] = Array.from({ length: n }, () => randomNormal());
  const uniform: number[] = Array.from({ length: n }, () => Math.random());
  const expo: number[] = uniform.map((u) => -Math.log(Math.max(1e-12, u)));
  const lognormal: number[] = normal.map((z) => Math.exp(z));
  const chi2: number[] = Array.from({ length: n }, () => {
    let acc = 0;
    for (let k = 0; k < df; k++) {
      const z = randomNormal();
      acc += z * z;
    }
    return acc;
  });
  const studentT: number[] = normal.map((z, i) => z / Math.sqrt(chi2[i]! / df));
  return { normal, studentT, chi2, uniform, lognormal, expo };
}
