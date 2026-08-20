/**
 * Motor CAPM multi-activo y de cobertura.
 *
 * Replica los métodos de referencia (`capm.functions.ts`, `capm-hedge.math.ts`
 * y `capm-hedge.server.ts`) pero usando el catálogo unificado
 * (`catalogo-activos.ts`) para resolver activos y `yahoo-http.ts` para obtener
 * series reales. Todo corre en servidor; no depende de TanStack Start.
 */

import { fetchYahooChart } from "./yahoo-http";
import { returns, logReturns, mean, variance, covariance, correlation } from "./stats";
import { subyacenteYahoo, activoPorTicker } from "./catalogo-activos";
import {
  AUTO_BENCHMARKS,
  benchmarkPorTicker,
  SECTOR_ETF_BY_SECTOR_KEY,
  SECTOR_KEY_BY_ESPANOL,
} from "./benchmarks-master";

// ---------------------------------------------------------------------------
// Serie histórica de cierres diarios (con fallbacks de host en yahoo-http).
// ---------------------------------------------------------------------------

/** Cierres diarios reales de un símbolo de Yahoo para un rango dado. */
export async function closesDiarios(simbolo: string, rango = "2y"): Promise<number[]> {
  const chart = await fetchYahooChart(simbolo, rango, "1d");
  const closes =
    chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(
      (c): c is number => typeof c === "number" && isFinite(c),
    ) ?? [];
  const ultimo =
    chart?.chart?.result?.[0]?.meta?.regularMarketPrice ??
    chart?.chart?.result?.[0]?.meta?.chartPreviousClose ??
    null;
  if (closes.length && typeof ultimo === "number" && isFinite(ultimo) && ultimo > 0) {
    const prev = (closes[closes.length - 1] as number | null) ?? null;
    if (prev != null && prev > 0 && Math.abs((ultimo - prev) / prev) > 0.02)
      closes[closes.length - 1] = ultimo;
  }
  return closes;
}

export type ResultadoSerie = {
  symbol: string;
  label: string;
  closes: number[];
  rango: string;
  error: string | null;
};

/** Serie + metadatos de un activo (resuelve CEDEARs al subyacente para beta). */
export async function serieActivo(simbolo: string, rango = "2y"): Promise<ResultadoSerie> {
  const catalogo = activoPorTicker(simbolo);
  const label = catalogo?.nombre ?? benchmarkPorTicker(simbolo)?.name ?? simbolo;
  try {
    const closes = await closesDiarios(simbolo, rango);
    if (!closes.length) {
      return { symbol: simbolo, label, closes: [], rango, error: "sin datos de precios" };
    }
    return { symbol: simbolo, label, closes, rango, error: null };
  } catch (e) {
    return {
      symbol: simbolo,
      label,
      closes: [],
      rango,
      error: e instanceof Error ? e.message : "error",
    };
  }
}

// ---------------------------------------------------------------------------
// Estadística: regresión OLS (beta, alpha, R², p-valor, error estándar).
// ---------------------------------------------------------------------------

/** CDF de la t de Student (vía beta incompleta regularizada, Gosset). */
function cdfStudentT(t: number, df: number): number {
  const x = df / (t * t + df);
  const ib = regularizedIncBeta(df / 2, 0.5, x);
  let p = 0.5 * ib;
  if (t > 0) p = 1 - p;
  return p;
}

/** Beta incompleta regularizada (algoritmo de Temme / continued fraction LCM). */
function regularizedIncBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lnBeta(a, b);
  const term = a * Math.log(x) + b * Math.log(1 - x) - lbeta;
  const bt = Math.exp(Math.min(term, 700));
  return (bt * betaCF(a, b, x)) / a;
}

function lnBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function logGamma(z: number): number {
  /* eslint-disable no-loss-of-precision */
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  /* eslint-enable no-loss-of-precision */
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 1;
  z -= 1;
  let y = z + 5.5;
  y -= (z + 0.5) * Math.log(y);
  for (let i = 0; i < 6; i++) x += c[i]! / (z + i + 1);
  return -y + Math.log((2.5066282746310002 * x) / z);
}

function betaCF(a: number, b: number, x: number, maxIter = 200): number {
  const eps = 1e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
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
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

export interface RegresionOLS {
  beta: number;
  alpha: number;
  rSquared: number;
  correlation: number;
  pValue: number;
  stdErr: number;
  observations: number;
}

/** Regresión OLS de y sobre x (retornos). Devuelve beta, alpha, R², t-stat, p-valor. */
export function linregress(x: number[], y: number[]): RegresionOLS {
  const n = Math.min(x.length, y.length);
  if (n < 3) {
    return {
      beta: 0,
      alpha: 0,
      rSquared: 0,
      correlation: 0,
      pValue: 1,
      stdErr: 0,
      observations: n,
    };
  }
  const xs = x.slice(-n);
  const ys = y.slice(-n);
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) {
    return {
      beta: 0,
      alpha: 0,
      rSquared: 0,
      correlation: 0,
      pValue: 1,
      stdErr: 0,
      observations: n,
    };
  }
  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  const rSquared = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  const corr = rSquared === 0 ? 0 : Math.sqrt(rSquared) * (beta >= 0 ? 1 : -1);
  const df = n - 2;
  let stdErr = 0;
  if (df > 0) {
    const resid = ys.reduce((s, yi, i) => {
      const e = yi - (alpha + beta * xs[i]!);
      return s + e * e;
    }, 0);
    const varRes = resid / df;
    stdErr = Math.sqrt(varRes / sxx);
  }
  const tStat = stdErr > 0 ? beta / stdErr : 0;
  const pValue = df > 0 ? 2 * (1 - cdfStudentT(Math.abs(tStat), df)) : 1;
  return { beta, alpha, rSquared, correlation: corr, pValue, stdErr, observations: n };
}

/** Alfa anualizado (diario → *252). */
export function anualizarAlpha(alphaDiario: number): number {
  return alphaDiario * 252;
}

// ---------------------------------------------------------------------------
// Medidas robustas: beta con p-variance y exponente de Hurst (Labadie §3.2).
// ---------------------------------------------------------------------------

export interface PVarianceResult {
  betaP: number;
  alphaP: number;
  pVarianceAsset: number;
  pVarianceBench: number;
}

/** Beta con p-variance: Cov_p(x,y)/Var_p(x) con p>=1 (robusto a fat tails). */
export function computeBetaPVariance(
  assetReturns: number[],
  benchReturns: number[],
  p = 2,
): PVarianceResult | null {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n < 20) return null;
  const a = assetReturns.slice(-n);
  const b = benchReturns.slice(-n);
  const ma = mean(a);
  const mb = mean(b);
  let varP = 0;
  let covP = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    const sign = da >= 0 ? 1 : -1;
    varP += Math.pow(Math.abs(da), p);
    covP += sign * Math.pow(Math.abs(da), p - 1) * db;
  }
  varP /= n;
  covP /= n;
  if (varP === 0) return null;
  const betaP = covP / varP;
  const alphaP = mb - betaP * ma;
  return { betaP, alphaP, pVarianceAsset: varP, pVarianceBench: 0 };
}

/** Exponente de Hurst (R/S analysis) de una serie de retornos. */
export function hurstExponent(values: number[]): number {
  const n = values.length;
  if (n < 100) return 0;
  const log2Chunks = Math.max(2, Math.floor(Math.log2(n) - 3));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 1; k <= log2Chunks; k++) {
    const chunk = Math.floor(n / Math.pow(2, k));
    if (chunk < 20) continue;
    const rs: number[] = [];
    for (let start = 0; start + chunk <= n; start += chunk) {
      const segment = values.slice(start, start + chunk);
      const m = mean(segment);
      const devs = segment.map((v) => v - m);
      let acc = 0;
      const cum: number[] = devs.map((d) => {
        acc += d;
        return acc;
      });
      const r = Math.max(...cum) - Math.min(...cum);
      const sd = Math.sqrt(variance(segment));
      if (sd > 0 && r >= 0) rs.push(r / sd);
    }
    if (rs.length) {
      xs.push(Math.log(chunk));
      ys.push(Math.log(mean(rs)));
    }
  }
  if (xs.length < 3) return 0;
  const reg = linregress(xs, ys);
  return reg.beta;
}

// ---------------------------------------------------------------------------
// Análisis CAPM de un activo (con auto-detectar el mejor benchmark).
// ---------------------------------------------------------------------------

export interface CAPMResult {
  ticker: string;
  label: string;
  benchmarkLabel: string | null;
  benchmark: string | null;
  beta: number | null;
  alpha: number | null;
  annualizedAlpha: number | null;
  rSquared: number | null;
  correlation: number | null;
  pValue: number | null;
  stdErr: number | null;
  observations: number;
  autoDetect: boolean;
  hurstExponent: number | null;
  betaP: number | null;
  error: string | null;
}

export type OpcionesCAPM = {
  simbolo: string;
  benchmark?: string | null;
  autoDetect?: boolean;
  rango?: string;
  candidatos?: string[];
};

const CANDIDATOS_DEFAULT = [
  "SPY",
  "^MERV",
  "QQQ",
  "XLK",
  "XLF",
  "XLV",
  "XLE",
  "XLC",
  "XLY",
  "XLP",
  "XLI",
  "XLB",
  "XLRE",
  "XLU",
  "SHY",
  "GLD",
  "USO",
  "EWZ",
  "ARGT",
];

function nombreBenchmark(ticker: string): string {
  return benchmarkPorTicker(ticker)?.name ?? ticker;
}

/** Resuelve un ticker a su símbolo operativo para beta (subyacente de CEDEAR). */
function simboloOperativo(simbolo: string): string {
  if (simbolo.includes("^") || simbolo.includes("-") || simbolo.includes("=")) return simbolo;
  return subyacenteYahoo(simbolo);
}

export async function analizarCAPM(opts: OpcionesCAPM): Promise<CAPMResult> {
  const simbolo = opts.simbolo.trim();
  if (!simbolo) {
    return emptyCAPM(simbolo, "no se recibió símbolo");
  }
  const out: CAPMResult = {
    ticker: simbolo,
    label: activoPorTicker(simbolo)?.nombre ?? simbolo,
    benchmarkLabel: null,
    benchmark: null,
    beta: null,
    alpha: null,
    annualizedAlpha: null,
    rSquared: null,
    correlation: null,
    pValue: null,
    stdErr: null,
    observations: 0,
    autoDetect: false,
    hurstExponent: null,
    betaP: null,
    error: null,
  };
  const rango = opts.rango ?? "2y";
  const asset = await serieActivo(simboloOperativo(simbolo), rango);
  if (asset.error || asset.closes.length < 20) {
    out.error = `sin datos históricos de ${simbolo}${asset.error ? ` (${asset.error})` : ""}`;
    return out;
  }
  const ra = logReturns(asset.closes);
  const autodetect = opts.autoDetect === true && !opts.benchmark;
  const candidatos = opts.benchmark
    ? [opts.benchmark]
    : opts.candidatos?.length
      ? opts.candidatos
      : CANDIDATOS_DEFAULT;

  if (autodetect) {
    let mejor: { ticker: string; r2: number; result: RegresionOLS } | null = null;
    for (const b of candidatos) {
      const serie = await serieActivo(b, rango);
      if (serie.error || serie.closes.length < 20) continue;
      const rb = logReturns(serie.closes);
      const reg = linregress(rb, ra);
      if (!mejor || reg.rSquared > mejor.r2) {
        mejor = { ticker: b, r2: reg.rSquared, result: reg };
      }
    }
    if (!mejor) {
      out.error = `no se pudo obtener benchmark de referencia (${rango})`;
      return out;
    }
    out.benchmark = mejor.ticker;
    out.benchmarkLabel = nombreBenchmark(mejor.ticker);
    out.autoDetect = true;
    const serieMejor = await serieActivo(mejor.ticker, rango);
    fillCAPM(out, mejor.result, ra, returns(serieMejor.closes));
  } else {
    const bench = opts.benchmark || "SPY";
    const serie = await serieActivo(bench, rango);
    if (serie.error || serie.closes.length < 20) {
      out.error = `sin datos históricos del benchmark ${bench}`;
      return out;
    }
    const rb = logReturns(serie.closes);
    const reg = linregress(rb, ra);
    out.benchmark = bench;
    out.benchmarkLabel = nombreBenchmark(bench);
    fillCAPM(out, reg, ra, rb);
  }
  return out;
}

function emptyCAPM(simbolo: string, error: string): CAPMResult {
  return {
    ticker: simbolo,
    label: simbolo,
    benchmarkLabel: null,
    benchmark: null,
    beta: null,
    alpha: null,
    annualizedAlpha: null,
    rSquared: null,
    correlation: null,
    pValue: null,
    stdErr: null,
    observations: 0,
    autoDetect: false,
    hurstExponent: null,
    betaP: null,
    error,
  };
}

function fillCAPM(out: CAPMResult, reg: RegresionOLS, ra: number[], rb: number[]): void {
  out.beta = reg.beta;
  out.alpha = reg.alpha;
  out.annualizedAlpha = anualizarAlpha(reg.alpha);
  out.rSquared = reg.rSquared;
  out.correlation = reg.correlation;
  out.pValue = reg.pValue;
  out.stdErr = reg.stdErr;
  out.observations = reg.observations;
  out.hurstExponent = hurstExponent(ra);
  const pvar = computeBetaPVariance(ra, rb, 2);
  out.betaP = pvar?.betaP ?? null;
}

// ---------------------------------------------------------------------------
// Matriz CAPM multi-activo: betas/correlaciones entre N tickers.
// ---------------------------------------------------------------------------

export interface MatrizCAPM {
  tickers: string[];
  labels: Record<string, string>;
  errores: Record<string, string | null>;
  beta: Record<string, Record<string, number | null>>;
  correlation: Record<string, Record<string, number | null>>;
  rSquared: Record<string, Record<string, number | null>>;
  observaciones: number;
}

export async function matrizCAPM(simbolos: string[], rango = "2y"): Promise<MatrizCAPM> {
  const tickers = [...new Set(simbolos.map((s) => s.trim()).filter(Boolean))];
  const errores: Record<string, string | null> = {};
  const closes: Record<string, number[]> = {};
  const labels: Record<string, string> = {};
  for (const t of tickers) {
    labels[t] = activoPorTicker(t)?.nombre ?? t;
    const s = await serieActivo(simboloOperativo(t), rango);
    if (s.error || s.closes.length < 20) errores[t] = s.error ?? "sin datos";
    else closes[t] = s.closes;
  }
  const rets: Record<string, number[]> = {};
  for (const t of tickers) if (closes[t]) rets[t] = logReturns(closes[t]!);
  const betaM: Record<string, Record<string, number | null>> = {};
  const corrM: Record<string, Record<string, number | null>> = {};
  const r2M: Record<string, Record<string, number | null>> = {};
  for (const a of tickers) {
    betaM[a] = {};
    corrM[a] = {};
    r2M[a] = {};
  }
  let observaciones = 0;
  for (const a of tickers) {
    for (const b of tickers) {
      if (!rets[a] || !rets[b]) {
        betaM[a]![b] = null;
        corrM[a]![b] = null;
        r2M[a]![b] = null;
        continue;
      }
      const reg = linregress(rets[b]!, rets[a]!);
      betaM[a]![b] = reg.beta;
      corrM[a]![b] = reg.correlation;
      r2M[a]![b] = reg.rSquared;
      observaciones = Math.max(observaciones, reg.observations);
    }
  }
  return {
    tickers,
    labels,
    errores,
    beta: betaM,
    correlation: corrM,
    rSquared: r2M,
    observaciones,
  };
}

// ---------------------------------------------------------------------------
// Cobertura (hedge): simplex + gradiente descendente.
// ---------------------------------------------------------------------------

/** Proyección al simplex (long/short, budget en exposición bruta). */
export function hedgeProjectSimplex(v: number[], budget: number): number[] {
  const n = v.length;
  if (n === 0) return [];
  const mu = budget / n;
  const w = v.map((x) => x - mu);
  const sorted = [...w].sort((a, b) => b - a);
  let cum = 0;
  let k = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    const c = sorted[i]!;
    if (c - (cum - budget) / (i + 1) > 0) {
      k = i + 1;
      cum += c;
      rho = (cum - budget) / (i + 1);
    }
  }
  if (k === 0) return new Array(n).fill(0);
  // El algoritmo clásico proyecta sobre simplex unitario positivo; aquí
  // devolvemos pesos crudos recortados a 0 y normalizados.
  const pesos = w.map((x) => Math.max(0, x - rho));
  const suma = pesos.reduce((s, x) => s + x, 0);
  return suma > 0 ? pesos.map((p) => (p / suma) * Math.abs(budget)) : pesos;
}

export interface CandidatoHedge {
  ticker: string;
  name: string;
  beta: number | null;
  correlation: number | null;
  rSquared: number | null;
}

export interface ResultadoHedge {
  posiciones: Array<{
    ticker: string;
    label: string;
    valorUSD: number;
    peso: number;
    beta: number | null;
    correlation: number | null;
    bhetaRecomendado: number | null;
    error: string | null;
  }>;
  portafolioBeta: number | null;
  totalUSD: number;
  benchmark: string;
  benchmarkName: string;
  hedgeSugerido: {
    tipo: "SHORT" | "LONG";
    ticker: string;
    name: string;
    nocionalUSD: number;
    explicacion: string;
  } | null;
}

export type OpcionesHedge = {
  posiciones: Array<{ ticker: string; valorUSD: number }>;
  benchmark?: string;
  rango?: string;
};

/**
 * Calcula el beta del portafolio ponderado por USD y sugiere la cobertura
 * contra el benchmark elegido (delta/beta neutral de primer orden).
 */
export async function calcularHedge(opts: OpcionesHedge): Promise<ResultadoHedge> {
  const bench = opts.benchmark || "SPY";
  const rango = opts.rango ?? "2y";
  const posicionesValidas = opts.posiciones.filter(
    (p) => p.ticker?.trim() && isFinite(p.valorUSD) && Math.abs(p.valorUSD) > 0,
  );
  const out: ResultadoHedge = {
    posiciones: [],
    portafolioBeta: null,
    totalUSD: 0,
    benchmark: bench,
    benchmarkName: nombreBenchmark(bench),
    hedgeSugerido: null,
  };
  if (!posicionesValidas.length) return out;

  const totalUSD = posicionesValidas.reduce((s, p) => s + p.valorUSD, 0);
  out.totalUSD = totalUSD;

  const serieBench = await serieActivo(bench, rango);
  if (serieBench.error || serieBench.closes.length < 20) return out;
  const rb = returns(serieBench.closes);

  let betaPonderado = 0;
  for (const p of posicionesValidas) {
    const peso = totalUSD > 0 ? p.valorUSD / totalUSD : 0;
    const base = {
      ticker: p.ticker,
      label: "",
      valorUSD: p.valorUSD,
      peso,
      bhetaRecomendado: null,
      beta: null,
      correlation: null,
      error: null as string | null,
    };
    try {
      const catalogo = activoPorTicker(p.ticker);
      const label = catalogo?.nombre ?? p.ticker;
      const serie = await serieActivo(simboloOperativo(p.ticker), rango);
      if (serie.error || serie.closes.length < 20) {
        out.posiciones.push({ ...base, label, error: serie.error ?? "sin datos" });
        continue;
      }
      const ra = returns(serie.closes);
      const reg = linregress(rb, ra);
      const beta = reg.beta;
      if (isFinite(beta)) betaPonderado += peso * beta;
      out.posiciones.push({
        ...base,
        label,
        peso,
        beta,
        correlation: reg.correlation,
        bhetaRecomendado: beta * p.valorUSD,
      });
    } catch (e) {
      out.posiciones.push({
        ...base,
        label: p.ticker,
        error: e instanceof Error ? e.message : "error",
      });
    }
  }
  out.portafolioBeta = betaPonderado;
  if (isFinite(betaPonderado) && Math.abs(betaPonderado) > 0.02) {
    const nocional = betaPonderado * totalUSD;
    out.hedgeSugerido = {
      tipo: betaPonderado > 0 ? "SHORT" : "LONG",
      ticker: bench,
      name: out.benchmarkName,
      nocionalUSD: Math.abs(nocional),
      explicacion:
        betaPonderado > 0
          ? `El portafolio tiene beta ${betaPonderado.toFixed(2)} frente a ${out.benchmarkName}. Para neutralizar el riesgo de mercado, shortear (o comprar puts sobre) ${bench} por un nocional de ~US$${Math.abs(nocional).toFixed(0)}.`
          : `El portafolio tiene beta ${betaPonderado.toFixed(2)} (inversa) frente a ${out.benchmarkName}. Para neutralizar, comprar (delta largo) ${bench} por ~US$${Math.abs(nocional).toFixed(0)}.`,
    };
  }
  return out;
}

export { SECTOR_ETF_BY_SECTOR_KEY, SECTOR_KEY_BY_ESPANOL, AUTO_BENCHMARKS };
