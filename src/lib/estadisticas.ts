/**
 * Estadísticas de distribución de retornos (réplica de `market_data.distribution`
 * del corpus de referencia). Funciones puras sobre un vector de retornos.
 */

import { mean, variance } from "./stats";

/** Percentil con interpolación lineal (equivalente a `np.percentile` default). */
export function percentile(xs: number[], p: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  if (p <= 0) return sorted[0]!;
  if (p >= 100) return sorted[n - 1]!;
  const rank = (p / 100) * (n - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low]!;
  const frac = rank - low;
  return sorted[low]! * (1 - frac) + sorted[high]! * frac;
}

/** Skewness (sesgo) muestral, sesgado como `scipy.stats.skew` default. */
export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  let m2 = 0;
  let m3 = 0;
  for (const x of xs) {
    const d = x - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  const s = Math.sqrt(m2);
  if (s === 0) return 0;
  return m3 / Math.pow(s, 3);
}

/** Kurtosis exceso (Fisher), sesgada como `scipy.stats.kurtosis` default. */
export function kurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  let m2 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - m;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m4 /= n;
  if (m2 === 0) return 0;
  return m4 / (m2 * m2) - 3;
}

/** Jarque-Bera statistic. */
export function jbStatistic(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const s = skewness(xs);
  const k = kurtosis(xs);
  return (n / 6) * (s * s + (k * k) / 4);
}

/** p-valor de Jarque-Bera: 1 - CDF chi2(df=2, x). Con df=2, chi2 = Exp(1/2). */
export function jbPValue(jb: number): number {
  return Math.exp(-jb / 2);
}

export interface DistribucionResult {
  tamanio: number;
  retornos?: number[];
  meanAnnual: number | null;
  volatilityAnnual: number | null;
  sharpeRatio: number | null;
  var95: number | null;
  skewness: number | null;
  kurtosis: number | null;
  jbStat: number | null;
  pValue: number | null;
  isNormal: boolean | null;
}

/** Retorno anualizado, volatilidad anualizada, Sharpe, VaR95, skew, kurtosis y normalidad. */
export function computeDistribucion(retornos: number[]): DistribucionResult {
  const out: DistribucionResult = {
    tamanio: retornos.length,
    retornos,
    meanAnnual: null,
    volatilityAnnual: null,
    sharpeRatio: null,
    var95: null,
    skewness: null,
    kurtosis: null,
    jbStat: null,
    pValue: null,
    isNormal: null,
  };
  if (retornos.length < 4) return out;
  const factor = 252;
  const rA = mean(retornos) * factor;
  const vA = Math.sqrt(variance(retornos)) * Math.sqrt(factor);
  out.meanAnnual = rA;
  out.volatilityAnnual = vA;
  out.sharpeRatio = vA > 0 ? rA / vA : 0;
  out.var95 = percentile(retornos, 5);
  out.skewness = skewness(retornos);
  out.kurtosis = kurtosis(retornos);
  out.jbStat = jbStatistic(retornos);
  out.pValue = jbPValue(out.jbStat);
  out.isNormal = out.pValue > 0.05;
  return out;
}
