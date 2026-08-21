// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeHurst, computePVariance, impliedPFromReturns, mean, std } from "./math/stats";
import { fetchHistoryIOL } from "./iol-history";
import { AUTO_BENCHMARKS as _AUTO, FACTORS_MASTER_LIST } from "./benchmarks-master";
import { getHistory } from "./history-cache.server";
// Re-export for backward compatibility
export const AUTO_BENCHMARKS = _AUTO;

async function fetchHistoryYahoo(
  ticker: string,
  days = 365 * 2,
): Promise<{ date: string; close: number }[]> {
  return getHistory(ticker, days);
}

export interface CAPMResult {
  ticker: string;
  alpha: number;
  annualizedAlpha: number;
  observations: number;
  benchmarkLabel?: string;
  beta?: number;
  rSquared?: number;
  correlation?: number;
  pValue?: number;
  stdErr?: number;
  betas?: number[];
  benchmarkLabels?: string[];
  pValues?: number[];
  stdErrs?: number[];
  rSquaredAdjusted?: number;
  fStatistic?: number;
  fPValue?: number;
  bestAvgR2?: number;
  // ─── Labadie §3.2: p-variance beta + Hurst ───
  betaP?: number; // beta con p-variance
  alphaP?: number; // alpha con p-variance
  pVarianceAsset?: number; // p-variance del activo
  pVarianceBench?: number; // p-variance del benchmark
  hurstExponent?: number; // H del activo
  hurstBench?: number; // H del benchmark
  impliedP?: number; // p = 1/H del activo
  impliedPFromReturns?: number; // p estimado por regresión multi-escala §4.3
}

// Full factor list for auto-detect (market indices, macro, bonds, commodities, sectors, smart beta, countries)
export const getCAPMAnalysis = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      tickers: string[];
      benchmarks: string[];
      multilinear?: boolean;
      autoDetect?: boolean;
      source?: string;
      token?: string | null;
      refreshToken?: string | null;
      mercadoIOL?: string;
    }) =>
      z
        .object({
          tickers: z.array(z.string().min(1)),
          benchmarks: z.array(z.string().min(1)),
          multilinear: z.boolean().optional().default(false),
          autoDetect: z.boolean().optional().default(false),
          source: z.string().optional().default("yahoo"),
          token: z.string().nullable().optional().default(null),
          refreshToken: z.string().nullable().optional().default(null),
          mercadoIOL: z.string().optional().default("NYSE"),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<CAPMResult[]> => {
    const benchmarks = data.autoDetect
      ? data.benchmarks.length > 0
        ? data.benchmarks
        : AUTO_BENCHMARKS
      : data.benchmarks;
    const allTickers = [...new Set([...data.tickers, ...benchmarks])];
    const histMap = new Map<string, Map<string, number>>();
    const isIOL = data.source === "iol" && data.token;
    const benchSet = new Set(benchmarks);
    const results: CAPMResult[] = [];

    const fetched = await Promise.all(
      allTickers.map(async (t) => {
        if (isIOL && !benchSet.has(t)) {
          const iolData = await fetchHistoryIOL(
            t,
            data.mercadoIOL!,
            data.token!,
            data.refreshToken,
          ).catch(() => []);
          if (iolData.length >= 30) return iolData;
        }
        return fetchHistoryYahoo(t).catch(() => []);
      }),
    );
    for (let i = 0; i < allTickers.length; i++) {
      const rows = fetched[i];
      if (rows.length < 30) continue;
      const dateMap = new Map<string, number>();
      for (const r of rows) dateMap.set(r.date, r.close);
      histMap.set(allTickers[i], dateMap);
    }

    if (data.autoDetect) {
      // Score each benchmark: track overall avg R² AND per-ticker best
      const benchScores = new Map<string, { r2Sum: number; count: number }>();
      const tickerBestMap = new Map<string, { benchmark: string; result: CAPMResult }>();
      for (const bm of benchmarks) {
        if (!histMap.has(bm)) continue;
        for (const ticker of data.tickers) {
          const tickerMap = histMap.get(ticker);
          if (!tickerMap || tickerMap.size < 30) continue;
          const r = computeSingle(ticker, tickerMap, bm, histMap);
          if (r.observations > 0 && r.rSquared != null) {
            const s = benchScores.get(bm) ?? { r2Sum: 0, count: 0 };
            s.r2Sum += r.rSquared;
            s.count++;
            benchScores.set(bm, s);
            // Track per-ticker best
            const cur = tickerBestMap.get(ticker);
            if (!cur || r.rSquared > cur.result.rSquared!) {
              tickerBestMap.set(ticker, { benchmark: bm, result: r });
            }
          }
        }
      }
      let bestOverallBenchmark = "";
      let bestAvgR2 = -1;
      for (const [bm, s] of benchScores) {
        const avg = s.r2Sum / s.count;
        if (avg > bestAvgR2) {
          bestAvgR2 = avg;
          bestOverallBenchmark = bm;
        }
      }
      const factorsTested = benchScores.size;
      // Compute results per ticker against its OWN best benchmark
      for (const ticker of data.tickers) {
        const tb = tickerBestMap.get(ticker);
        if (tb) {
          results.push({
            ...tb.result,
            benchmarkLabel: tb.benchmark,
            bestAvgR2: bestAvgR2 >= 0 ? bestAvgR2 : undefined,
          });
        } else {
          results.push({
            ticker,
            alpha: 0,
            annualizedAlpha: 0,
            observations: 0,
            benchmarkLabel: bestOverallBenchmark,
          });
        }
      }
    } else {
      // Multiple benchmarks: compute per benchmark group and pick best overall too
      const benchScores = new Map<string, { r2Sum: number; count: number }>();
      for (const bm of data.benchmarks) {
        let count = 0,
          r2Sum = 0;
        for (const ticker of data.tickers) {
          const tickerMap = histMap.get(ticker);
          if (!tickerMap || tickerMap.size < 30) continue;
          const r = computeSingle(ticker, tickerMap, bm, histMap);
          if (r.observations > 0 && r.rSquared != null) {
            r2Sum += r.rSquared;
            count++;
          }
        }
        if (count > 0) benchScores.set(bm, { r2Sum, count });
      }
      let bestOverallBenchmark = "";
      let bestAvgR2 = -1;
      for (const [bm, s] of benchScores) {
        const avg = s.r2Sum / s.count;
        if (avg > bestAvgR2) {
          bestAvgR2 = avg;
          bestOverallBenchmark = bm;
        }
      }
      for (const bm of data.benchmarks) {
        for (const ticker of data.tickers) {
          const tickerMap = histMap.get(ticker);
          if (!tickerMap || tickerMap.size < 30) {
            results.push({
              ticker,
              alpha: 0,
              annualizedAlpha: 0,
              observations: 0,
              benchmarkLabel: bm,
            });
            continue;
          }
          const r = computeSingle(ticker, tickerMap, bm, histMap);
          results.push({
            ...r,
            benchmarkLabel: bm,
            bestAvgR2: bm === bestOverallBenchmark && bestAvgR2 >= 0 ? bestAvgR2 : undefined,
          });
        }
      }
    }

    return results;
  });

function buildReturns(
  ticker: string,
  tickerMap: Map<string, number>,
  benchmark: string,
  histMap: Map<string, Map<string, number>>,
): { x: number[]; y: number[]; n: number } | null {
  const benchMap = histMap.get(benchmark);
  if (!benchMap || benchMap.size < 30) return null;

  const commonDates: string[] = [];
  for (const d of benchMap.keys()) {
    if (tickerMap.has(d)) commonDates.push(d);
  }
  commonDates.sort();
  if (commonDates.length < 30) return null;

  const x: number[] = [];
  const y: number[] = [];
  let prevB = benchMap.get(commonDates[0])!;
  let prevT = tickerMap.get(commonDates[0])!;
  for (let i = 1; i < commonDates.length; i++) {
    x.push((benchMap.get(commonDates[i])! - prevB) / prevB);
    y.push((tickerMap.get(commonDates[i])! - prevT) / prevT);
    prevB = benchMap.get(commonDates[i])!;
    prevT = tickerMap.get(commonDates[i])!;
  }
  return { x, y, n: commonDates.length - 1 };
}

function computeSingle(
  ticker: string,
  tickerMap: Map<string, number>,
  benchmark: string,
  histMap: Map<string, Map<string, number>>,
): CAPMResult {
  const bm = buildReturns(ticker, tickerMap, benchmark, histMap);
  if (!bm) return { ticker, alpha: 0, annualizedAlpha: 0, observations: 0 };

  const n = bm.n;
  const x = bm.x;
  const y = bm.y;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);

  const beta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const alpha = (sumY - beta * sumX) / n;
  const yMean = sumY / n;
  const ssRes = y.reduce((a, yi, i) => a + (yi - (alpha + beta * x[i])) ** 2, 0);
  const ssTot = y.reduce((a, yi) => a + (yi - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const correlation = rSquared > 0 ? Math.sqrt(rSquared) * (beta >= 0 ? 1 : -1) : 0;
  const seSlope = n > 2 ? Math.sqrt(ssRes / (n - 2) / (sumX2 - (sumX * sumX) / n)) : 0;
  const tStat = seSlope > 0 ? beta / seSlope : 0;
  const pValue = 2 * (1 - tCdf(Math.abs(tStat), n - 2));

  // ─── Labadie §3.2: Hurst exponent, p-variance, implied p ───
  // Reconstruir precios desde returns para calcular Hurst
  const pricesFromRets: number[] = [];
  let p = 100;
  for (const r of y) {
    p *= 1 + r;
    pricesFromRets.push(p);
  }
  const benchPrices: number[] = [];
  let bp = 100;
  for (const r of x) {
    bp *= 1 + r;
    benchPrices.push(bp);
  }

  const hurstExponent = pricesFromRets.length >= 100 ? computeHurst(pricesFromRets) : undefined;
  const hurstBench = benchPrices.length >= 100 ? computeHurst(benchPrices) : undefined;
  const impliedP =
    hurstExponent != null && hurstExponent > 0
      ? Math.min(10, Math.max(1.1, 1 / hurstExponent))
      : undefined;
  const impliedPFromReturnsVal = y.length >= 100 ? impliedPFromReturns(y) : undefined;

  // p-variance del activo y benchmark
  const pVal = 2;
  const pVarianceAsset = y.length >= 20 ? computePVariance(y, pVal) : undefined;
  const pVarianceBench = x.length >= 20 ? computePVariance(x, pVal) : undefined;

  // beta con p-variance: varianza generalizada
  let betaP: number | undefined;
  let alphaP: number | undefined;
  if (pVarianceBench != null && pVarianceBench > 0 && n >= 20) {
    // beta_p = cov_p(x, y) / var_p(x) donde cov_p usa desviaciones con p
    const meanX = mean(x);
    const meanY = mean(y);
    const p = 2;
    const covP =
      x.reduce(
        (s, xi, i) =>
          s + Math.pow(Math.abs(xi - meanX), p / 2) * Math.pow(Math.abs(y[i] - meanY), p / 2),
        0,
      ) / n;
    betaP = covP > 0 && pVarianceBench > 0 ? covP / pVarianceBench : undefined;
    alphaP = betaP != null ? meanY - betaP * meanX : undefined;
  }

  return {
    ticker,
    alpha: Math.round(alpha * 10000) / 10000,
    annualizedAlpha: Math.round(alpha * 252 * 10000) / 10000,
    beta: Math.round(beta * 10000) / 10000,
    rSquared: Math.round(rSquared * 10000) / 10000,
    correlation: Math.round(correlation * 10000) / 10000,
    pValue: Math.round(pValue * 10000) / 10000,
    stdErr: Math.round(seSlope * 10000) / 10000,
    observations: n,
    // ─── Labadie §3.2 ───
    betaP: betaP != null ? Math.round(betaP * 10000) / 10000 : undefined,
    alphaP: alphaP != null ? Math.round(alphaP * 10000) / 10000 : undefined,
    pVarianceAsset: pVarianceAsset != null ? Math.round(pVarianceAsset * 10000) / 10000 : undefined,
    pVarianceBench: pVarianceBench != null ? Math.round(pVarianceBench * 10000) / 10000 : undefined,
    hurstExponent: hurstExponent != null ? Math.round(hurstExponent * 10000) / 10000 : undefined,
    hurstBench: hurstBench != null ? Math.round(hurstBench * 10000) / 10000 : undefined,
    impliedP: impliedP != null ? Math.round(impliedP * 100) / 100 : undefined,
    impliedPFromReturns:
      impliedPFromReturnsVal != null ? Math.round(impliedPFromReturnsVal * 100) / 100 : undefined,
  };
}

function computeMultilinear(
  ticker: string,
  tickerMap: Map<string, number>,
  benchmarks: string[],
  histMap: Map<string, Map<string, number>>,
): CAPMResult {
  const benchMaps = benchmarks.map((b) => histMap.get(b)).filter(Boolean) as Map<string, number>[];
  if (benchMaps.length !== benchmarks.length)
    return { ticker, alpha: 0, annualizedAlpha: 0, observations: 0 };

  const commonDates: string[] = [];
  const first = benchMaps[0];
  for (const d of first!.keys()) {
    if (tickerMap.has(d) && benchMaps.every((bm) => bm.has(d))) commonDates.push(d);
  }
  commonDates.sort();
  if (commonDates.length < 30) return { ticker, alpha: 0, annualizedAlpha: 0, observations: 0 };

  const k = benchmarks.length;
  const n = commonDates.length - 1;
  const y: number[] = [];
  const xCols: number[][] = Array.from({ length: k }, () => []);
  let prevT = tickerMap.get(commonDates[0])!;
  const prevB = benchMaps.map((bm) => bm.get(commonDates[0])!);

  for (let i = 1; i < commonDates.length; i++) {
    const tClose = tickerMap.get(commonDates[i])!;
    y.push((tClose - prevT) / prevT);
    prevT = tClose;
    for (let j = 0; j < k; j++) {
      const bClose = benchMaps[j].get(commonDates[i])!;
      xCols[j].push((bClose - prevB[j]) / prevB[j]);
      prevB[j] = bClose;
    }
  }

  // Build design matrix X: n x (k+1), first column is 1s (intercept)
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [1];
    for (let j = 0; j < k; j++) row.push(xCols[j][i]);
    X.push(row);
  }

  // OLS: β = (X'X)⁻¹ X'Y
  const Xt = transpose(X);
  const XtX = multiply(Xt, X);
  const XtX_inv = invert(XtX);
  if (!XtX_inv) return { ticker, alpha: 0, annualizedAlpha: 0, observations: 0 };

  const XtY = multiplyMatrixVector(Xt, y);
  const betaVec = multiplyMatrixVector(XtX_inv, XtY);

  const yPred = X.map((row) => row.reduce((s, v, i) => s + v * betaVec[i], 0));
  const residuals = y.map((yi, i) => yi - yPred[i]);
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const ssRes = residuals.reduce((a, r) => a + r * r, 0);
  const ssTot = y.reduce((a, yi) => a + (yi - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const rSquaredAdjusted = 1 - ((1 - rSquared) * (n - 1)) / (n - k - 1);

  const sigma2 = ssRes / (n - k - 1);
  const covDiag = XtX_inv.map((row, i) => row[i]);
  const seVec = covDiag.map((v) => Math.sqrt(sigma2 * v));

  const pValues = betaVec.map((b, i) => {
    const t = seVec[i] > 0 ? Math.abs(b / seVec[i]) : 0;
    return 2 * (1 - tCdf(t, n - k - 1));
  });

  const ssReg = ssTot - ssRes;
  const fStat = k > 0 && ssRes > 0 ? ssReg / k / (ssRes / (n - k - 1)) : 0;
  const fPValue = fStat > 0 ? 1 - fCdf(fStat, k, n - k - 1) : 1;

  const alpha = betaVec[0];
  const betas = betaVec.slice(1);

  return {
    ticker,
    alpha: Math.round(alpha * 10000) / 10000,
    annualizedAlpha: Math.round(alpha * 252 * 10000) / 10000,
    observations: n,
    betas: betas.map((b) => Math.round(b * 10000) / 10000),
    benchmarkLabels: benchmarks,
    pValues: pValues.map((p) => Math.round(p * 10000) / 10000),
    stdErrs: seVec.map((s) => Math.round(s * 10000) / 10000),
    rSquared: Math.round(rSquared * 10000) / 10000,
    rSquaredAdjusted: Math.round(rSquaredAdjusted * 10000) / 10000,
    fStatistic: Math.round(fStat * 10000) / 10000,
    fPValue: Math.round(fPValue * 10000) / 10000,
  };
}

// ─── Matrix helpers ────────────────────────────────────────────────────────

function transpose(m: number[][]): number[][] {
  return m[0].map((_, i) => m.map((row) => row[i]));
}

function multiply(A: number[][], B: number[][]): number[][] {
  const rows = A.length,
    cols = B[0].length,
    inner = B.length;
  const result: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      for (let k = 0; k < inner; k++) result[i][j] += A[i][k] * B[k][j];
  return result;
}

function multiplyMatrixVector(M: number[][], v: number[]): number[] {
  return M.map((row) => row.reduce((s, val, i) => s + val * v[i], 0));
}

function invert(M: number[][]): number[][] | null {
  const n = M.length;
  const aug: number[][] = M.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && Math.abs(aug[pivot][col]) < 1e-12) pivot++;
    if (pivot === n) return null;
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

// ─── Statistics ─────────────────────────────────────────────────────────────

function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  return 1 - 0.5 * regIncBeta(df / 2, 0.5, x);
}

function fCdf(f: number, d1: number, d2: number): number {
  const x = (d1 * f) / (d1 * f + d2);
  return regIncBeta(d1 / 2, d2 / 2, x);
}

function regIncBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * contFrac(a, b, x)) / a;
  return 1 - (bt * contFrac(b, a, 1 - x)) / b;
}

function contFrac(a: number, b: number, x: number): number {
  const eps = 1e-10;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return h;
}

// ─── Matriz de correlación entre activos ──────────────────────────────

export interface MatrizCAPMResult {
  tickers: string[];
  alpha: number[][];
  beta: number[][];
  correlation: number[][];
  rSquared: number[][];
  observations: number;
}

export const getMatrizCAPM = createServerFn({ method: "POST" })
  .inputValidator((input: { tickers: string[] }) =>
    z
      .object({ tickers: z.array(z.string().min(1)).min(2, "Se requieren al menos 2 tickers") })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MatrizCAPMResult> => {
    const { tickers } = data;
    const n = tickers.length;

    const fetched = await Promise.all(tickers.map((t) => fetchHistoryYahoo(t).catch(() => [])));
    const histMap = new Map<string, Map<string, number>>();
    for (let i = 0; i < n; i++) {
      if (fetched[i].length < 30) continue;
      const m = new Map<string, number>();
      for (const r of fetched[i]) m.set(r.date, r.close);
      histMap.set(tickers[i], m);
    }

    const validTickers = tickers.filter((t) => histMap.has(t));
    const vn = validTickers.length;

    const alpha: number[][] = Array.from({ length: vn }, () => Array(vn).fill(0));
    const beta: number[][] = Array.from({ length: vn }, () => Array(vn).fill(0));
    const correlation: number[][] = Array.from({ length: vn }, () => Array(vn).fill(0));
    const rSquared: number[][] = Array.from({ length: vn }, () => Array(vn).fill(0));
    let observations = 0;

    for (let i = 0; i < vn; i++) {
      alpha[i][i] = 0;
      beta[i][i] = 1;
      correlation[i][i] = 1;
      rSquared[i][i] = 1;

      for (let j = i + 1; j < vn; j++) {
        const histI = histMap.get(validTickers[i])!;
        const histJ = histMap.get(validTickers[j])!;

        // Common dates
        const common: string[] = [];
        for (const d of histI.keys()) {
          if (histJ.has(d)) common.push(d);
        }
        common.sort();
        if (common.length < 30) continue;

        // Daily returns
        const x: number[] = [];
        const y: number[] = [];
        let prevI = histI.get(common[0])!;
        let prevJ = histJ.get(common[0])!;
        for (let k = 1; k < common.length; k++) {
          const ci = histI.get(common[k])!;
          const cj = histJ.get(common[k])!;
          x.push((ci - prevI) / prevI);
          y.push((cj - prevJ) / prevJ);
          prevI = ci;
          prevJ = cj;
        }

        const nobs = x.length;
        if (nobs < 30) continue;
        if (observations === 0) observations = nobs;

        // OLS: y = alpha + beta * x
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumX2 = x.reduce((a, b) => a + b * b, 0);
        const sumY2 = y.reduce((a, b) => a + b * b, 0);
        const sumXY = x.reduce((a, b, k) => a + b * y[k], 0);

        const b = (nobs * sumXY - sumX * sumY) / (nobs * sumX2 - sumX * sumX);
        const a = (sumY - b * sumX) / nobs;
        const yMean = sumY / nobs;
        const ssRes = y.reduce((s, yi, k) => s + (yi - (a + b * x[k])) ** 2, 0);
        const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
        const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
        const corr = r2 > 0 ? Math.sqrt(r2) * (b >= 0 ? 1 : -1) : 0;

        const round = (v: number) => Math.round(v * 10000) / 10000;

        alpha[i][j] = round(a);
        alpha[j][i] = round(a);
        beta[i][j] = round(b);
        beta[j][i] = 1 / round(b);
        correlation[i][j] = round(corr);
        correlation[j][i] = round(corr);
        rSquared[i][j] = round(r2);
        rSquared[j][i] = round(r2);
      }
    }

    return {
      tickers: validTickers,
      alpha,
      beta,
      correlation,
      rSquared,
      observations,
    };
  });

function logGamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
