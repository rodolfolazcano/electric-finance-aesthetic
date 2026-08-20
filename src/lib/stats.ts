/** Estadísticas de series de precios y cálculo de beta / R² contra un benchmark.
 *  Se comparte entre `market-data.ts` y `yahoo-coronar.functions.ts`. */

/** Retornos simples (aritméticos): r = (p_t − p_{t−1}) / p_{t−1}. */
export function returns(arr: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1];
    const cur = arr[i];
    if (typeof prev === "number" && typeof cur === "number" && prev > 0) {
      r.push((cur - prev) / prev);
    }
  }
  return r;
}

/** Retornos logarítmicos: ln(p_t / p_{t−1}), como el reference `compute_returns`. */
export function logReturns(arr: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1];
    const cur = arr[i];
    if (typeof prev === "number" && typeof cur === "number" && prev > 0 && cur > 0) {
      r.push(Math.log(cur / prev));
    }
  }
  return r;
}

export function mean(a: number[]): number {
  if (!a.length) return 0;
  let s = 0;
  for (const x of a) s += x;
  return s / a.length;
}

export function variance(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (const x of a) s += (x - m) * (x - m);
  return s / (a.length - 1);
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const ma = mean(ax);
  const mb = mean(bx);
  let s = 0;
  for (let i = 0; i < n; i++) s += (ax[i]! - ma) * (bx[i]! - mb);
  return s / (n - 1);
}

export function correlation(a: number[], b: number[]): number {
  const sa = Math.sqrt(variance(a));
  const sb = Math.sqrt(variance(b));
  if (sa === 0 || sb === 0) return 0;
  return covariance(a, b) / (sa * sb);
}

export interface ResultadoBeta {
  beta: number | null;
  r2: number | null;
  benchmark: string | null;
  muestras: number;
}

/** Beta de un activo contra dos benchmarks (SPY y MERVAL): se elige el de mayor R². */
export function computeBeta(asset: number[], spy: number[], merv: number[]): ResultadoBeta {
  const ra = returns(asset);
  if (ra.length < 20) return { beta: null, r2: null, benchmark: null, muestras: ra.length };
  const rs = returns(spy);
  const rm = returns(merv);
  const corrSpy = rs.length >= 20 ? correlation(ra, rs) : 0;
  const corrMerv = rm.length >= 20 ? correlation(ra, rm) : 0;
  const r2Spy = corrSpy * corrSpy;
  const r2Merv = corrMerv * corrMerv;
  const useSpy = r2Spy >= r2Merv;
  const bench = useSpy ? rs : rm;
  if (bench.length < 20)
    return { beta: null, r2: null, benchmark: useSpy ? "SPY" : "MERVAL", muestras: ra.length };
  const v = variance(bench);
  if (v === 0)
    return {
      beta: null,
      r2: null,
      benchmark: useSpy ? "SPY" : "MERVAL",
      muestras: ra.length,
    };
  const beta = covariance(ra, bench) / v;
  return {
    beta,
    r2: useSpy ? r2Spy : r2Merv,
    benchmark: useSpy ? "SPY" : "MERVAL",
    muestras: ra.length,
  };
}

/** Último precio de cierre de una serie de `close`. */
export function ultimoCierre(closes: (number | null)[] | undefined): number | null {
  if (!closes?.length) return null;
  for (let i = closes.length - 1; i >= 0; i--) {
    const c = closes[i];
    if (typeof c === "number" && isFinite(c)) return c;
  }
  return null;
}
