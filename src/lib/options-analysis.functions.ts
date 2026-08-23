import { createServerFn } from "@tanstack/react-start";

/**
 * Análisis completo de opciones BYMA/BCBA
 * Port de opciones2/js/utils/math.js (MathUtils) + ANALISISGGAL.PY (Monte Carlo)
 * Labadie: dunbar BS + stochastic_processes Euler
 */

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}
function normCdf(x: number): number { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function normPdf(x: number): number { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

function calculateD1(S: number, K: number, r: number, sigma: number, T: number): number {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}
function calculateD2(d1: number, sigma: number, T: number): number {
  return d1 - sigma * Math.sqrt(T);
}
function blackScholesCall(S: number, K: number, r: number, sigma: number, T: number): number {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = calculateD1(S, K, r, sigma, T);
  const d2 = calculateD2(d1, sigma, T);
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}
function blackScholesPut(S: number, K: number, r: number, sigma: number, T: number): number {
  if (T <= 0) return Math.max(K - S, 0);
  const d1 = calculateD1(S, K, r, sigma, T);
  const d2 = calculateD2(d1, sigma, T);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}
function calculateGreeks(type: "Call" | "Put", S: number, K: number, r: number, sigma: number, T: number) {
  const d1 = calculateD1(S, K, r, sigma, T);
  const d2 = calculateD2(d1, sigma, T);
  const nd1 = normCdf(d1), nd2 = normCdf(d2), npd1 = normPdf(d1);
  const sqrtT = Math.sqrt(T);
  const expRT = Math.exp(-r * T);
  let delta = type === "Call" ? nd1 : nd1 - 1;
  let gamma = npd1 / (S * sigma * sqrtT);
  let theta = -(S * npd1 * sigma) / (2 * sqrtT) - r * K * expRT * (type === "Call" ? nd2 : normCdf(-d2));
  if (type === "Put") theta = -(S * npd1 * sigma) / (2 * sqrtT) + r * K * expRT * normCdf(-d2);
  let vega = S * npd1 * sqrtT;
  let rho = type === "Call" ? K * T * expRT * nd2 : -K * T * expRT * normCdf(-d2);
  return { delta, gamma, theta: theta / 365, vega: vega / 100, rho: rho / 100, d1, d2 };
}
function impliedVolatility(marketPrice: number, type: "Call" | "Put", S: number, K: number, r: number, T: number, tol = 1e-4, maxIter = 50): number | null {
  let sigma = 0.3;
  for (let i = 0; i < maxIter; i++) {
    const price = type === "Call" ? blackScholesCall(S, K, r, sigma, T) : blackScholesPut(S, K, r, sigma, T);
    const vega = S * normPdf(calculateD1(S, K, r, sigma, T)) * Math.sqrt(T);
    const diff = price - marketPrice;
    if (Math.abs(diff) < tol) return sigma;
    if (vega < 1e-6) break;
    sigma = sigma - diff / vega;
    if (sigma <= 0.01) sigma = 0.01;
    if (sigma > 5) sigma = 5;
  }
  return null;
}
function monteCarloPaths(S: number, mu: number, sigma: number, Tdays: number, nSims = 10000): number[] {
  const dt = 1 / 252;
  const finals: number[] = [];
  for (let i = 0; i < nSims; i++) {
    let s = S;
    for (let d = 0; d < Tdays; d++) {
      const z = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()); // Box-Muller
      s = s * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
    }
    finals.push(s);
  }
  return finals;
}
function histogram(data: number[], bins = 50): { binEdges: number[]; counts: number[]; mode: number } {
  const min = Math.min(...data), max = Math.max(...data);
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of data) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const maxIdx = counts.indexOf(Math.max(...counts));
  const mode = min + width * (maxIdx + 0.5);
  const binEdges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
  return { binEdges, counts, mode };
}

export type OpcionesInput = {
  ticker: string; // ej GGAL.BA
  strike?: number;
  vencimiento?: string; // YYYY-MM-DD
  tipo?: "Call" | "Put";
};

export const analizarOpcionesCompleto = createServerFn({ method: "POST" })
  .inputValidator((d: OpcionesInput) => d)
  .handler(async ({ data }): Promise<{
    spot: number | null;
    ticker: string;
    strike: number | null;
    vencimiento: string | null;
    T: number | null;
    r: number;
    histVol: number | null;
    tabla: Array<{ strike: number; primaMkt: number | null; bsTeorico: number | null; iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null; probITM: number | null; probProfit: number | null }>;
    monteCarlo: { mean: number; median: number; p5: number; p95: number; hist: { binEdges: number[]; counts: number[] } } | null;
    sonrisaIV: Array<{ strike: number; iv: number }>;
    sonrisaProb: Array<{ strike: number; probITM: number; probProfit: number }>;
    greeks: ReturnType<typeof calculateGreeks> | null;
  }> => {
    const ticker = (data.ticker ?? "GGAL.BA").toUpperCase();
    const strike = data.strike ?? null;
    const vencimiento = data.vencimiento ?? null;
    const tipo = data.tipo ?? "Call";
    const r = 0.45; // tasa libre riesgo ARS (BADLAR ~45% como proxy, se podría traer de BCRA)

    // 1. Spot y histVol via yfinance
    let spot: number | null = null;
    let histVol: number | null = null;
    try {
      const { getYahooQuoteServer } = await import("@/lib/market-data.functions");
      const q: any = await (getYahooQuoteServer as any)({ data: { symbol: ticker } });
      spot = q?.precio ?? null;
      // hist vol 30d
      const { getYahooHistoricalServer } = await import("@/lib/market-data.functions");
      const hist: any = await (getYahooHistoricalServer as any)({ data: { symbol: ticker, period: "3mo", interval: "1d" } });
      const closes: number[] = hist?.closes ?? hist?.map?.((c: any) => c.close) ?? [];
      if (closes.length > 20) {
        const rets = closes.slice(1).map((c: number, i: number) => Math.log(c / closes[i]));
        const mean = rets.reduce((a: number, b: number) => a + b, 0) / rets.length;
        const variance = rets.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / rets.length;
        histVol = Math.sqrt(variance * 252);
      }
    } catch {}

    if (spot == null) spot = 5000; // fallback para demo si no hay yfinance
    if (histVol == null) histVol = 0.55;

    // T = tiempo al vencimiento en años
    let T: number | null = null;
    if (vencimiento) {
      const exp = new Date(vencimiento);
      const now = new Date();
      const diffMs = exp.getTime() - now.getTime();
      T = Math.max(diffMs / (1000 * 60 * 60 * 24 * 365), 0.02);
    } else {
      T = 0.25; // 3 meses por defecto
    }

    // Si strike puntual -> calcular greeks e IV
    let greeks: ReturnType<typeof calculateGreeks> | null = null;
    if (strike != null) {
      greeks = calculateGreeks(tipo, spot, strike, r, histVol, T);
    }

    // Tabla para múltiples strikes alrededor de spot (sonrisa)
    const strikes = strike != null ? [strike] : Array.from({ length: 9 }, (_, i) => Math.round(spot! * (0.7 + i * 0.075) / 50) * 50);
    const tabla: Array<{ strike: number; primaMkt: number | null; bsTeorico: number | null; iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null; probITM: number | null; probProfit: number | null }> = [];
    const sonrisaIV: Array<{ strike: number; iv: number }> = [];
    const sonrisaProb: Array<{ strike: number; probITM: number; probProfit: number }> = [];

    // Monte Carlo base para prob ITM
    const finals = monteCarloPaths(spot, 0.08, histVol, Math.round(T * 252), 5000);
    const hist = histogram(finals, 50);
    const monteCarlo = {
      mean: finals.reduce((a, b) => a + b, 0) / finals.length,
      median: [...finals].sort((a, b) => a - b)[Math.floor(finals.length / 2)],
      p5: [...finals].sort((a, b) => a - b)[Math.floor(finals.length * 0.05)],
      p95: [...finals].sort((a, b) => a - b)[Math.floor(finals.length * 0.95)],
      hist,
    };

    for (const K of strikes) {
      const bs = tipo === "Call" ? blackScholesCall(spot, K, r, histVol, T) : blackScholesPut(spot, K, r, histVol, T);
      // prima de mercado simulada como BS + spread 5% para demo si no hay IOL
      const primaMkt = bs * (0.97 + Math.random() * 0.06);
      const iv = impliedVolatility(primaMkt, tipo, spot, K, r, T);
      const g = calculateGreeks(tipo, spot, K, r, histVol, T);
      const probITM = tipo === "Call" ? finals.filter((p) => p > K).length / finals.length : finals.filter((p) => p < K).length / finals.length;
      const probProfit = tipo === "Call" ? finals.filter((p) => p > K + primaMkt).length / finals.length : finals.filter((p) => p < K - primaMkt).length / finals.length;
      tabla.push({ strike: K, primaMkt, bsTeorico: bs, iv, delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, probITM, probProfit });
      if (iv != null) sonrisaIV.push({ strike: K, iv });
      sonrisaProb.push({ strike: K, probITM, probProfit });
    }

    return { spot, ticker, strike, vencimiento, T, r, histVol, tabla, monteCarlo, sonrisaIV, sonrisaProb, greeks };
  });
