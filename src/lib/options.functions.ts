// src/lib/options.functions.ts
// Core options analysis: Black-Scholes, Greeks, Monte Carlo, strategies

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CONTRATO = 100;

// ── Math helpers ──
function normCdf(x: number): number {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741;
  const a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * y);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function boxMuller(): number {
  return Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

function bs(
  tipo: "Call" | "Put",
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q = 0,
) {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return null;
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const nd1 = normPdf(d1);
  const eqt = Math.exp(-q * T);
  const ert = Math.exp(-r * T);
  let precio: number, delta: number, prob: number, theta: number;
  if (tipo === "Call") {
    precio = S * eqt * normCdf(d1) - K * ert * normCdf(d2);
    delta = eqt * normCdf(d1);
    prob = normCdf(d2);
    theta =
      (-S * eqt * nd1 * sigma) / (2 * Math.sqrt(T))
      - r * K * ert * normCdf(d2)
      + q * S * eqt * normCdf(d1);
    theta /= 252;
  } else {
    precio = K * ert * normCdf(-d2) - S * eqt * normCdf(-d1);
    delta = eqt * (normCdf(d1) - 1);
    prob = normCdf(-d2);
    theta =
      (-S * eqt * nd1 * sigma) / (2 * Math.sqrt(T))
      + r * K * ert * normCdf(-d2)
      - q * S * eqt * normCdf(-d1);
    theta /= 252;
  }
  const vi = tipo === "Call" ? Math.max(0, S - K) : Math.max(0, K - S);
  if (precio < vi) precio = vi;
  const gamma = (eqt * nd1) / (S * sigma * Math.sqrt(T));
  const vega = S * eqt * nd1 * Math.sqrt(T);
  const rho = K * T * ert * (tipo === "Call" ? normCdf(d2) : -normCdf(-d2));
  return { precio, delta, gamma, vega, theta, rho, prob };
}

function calcIV(
  tipo: "Call" | "Put",
  S: number,
  K: number,
  T: number,
  r: number,
  precioMercado: number,
): number | null {
  if (precioMercado <= 0 || T <= 0) return null;
  let lo = 0.01,
    hi = 3.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const res = bs(tipo, S, K, T, r, mid);
    if (!res) return null;
    if (Math.abs(res.precio - precioMercado) < 1e-5) return mid;
    if (res.precio < precioMercado) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgG = gains / period,
    avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(0, diff)) / period;
    avgL = (avgL * (period - 1) + Math.max(0, -diff)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function calcHV(prices: number[]): number {
  if (prices.length < 2) return 0.3;
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) rets.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (rets.length < 10) return 0.3;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v2 = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.max(0.01, Math.min(3.0, Math.sqrt(v2) * Math.sqrt(252)));
}

function mcSimple(
  tipo: "Call" | "Put",
  S: number,
  K: number,
  T: number,
  sigma: number,
  prima: number,
  r = 0.05,
  nSim = 10000,
) {
  let probProfit = 0,
    gananciaTotal = 0,
    probITM = 0;
  const payoffs: number[] = [];
  for (let i = 0; i < nSim; i++) {
    const Z = boxMuller();
    const ST = S * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * Z);
    let payoff: number;
    if (tipo === "Call") {
      payoff = Math.max(ST - K, 0) - prima;
      if (ST > K) probITM++;
    } else {
      payoff = Math.max(K - ST, 0) - prima;
      if (ST < K) probITM++;
    }
    payoffs.push(payoff);
    if (payoff > 0) probProfit++;
    gananciaTotal += payoff;
  }
  return {
    probProfit: probProfit / nSim,
    gananciaEsperada: gananciaTotal / nSim,
    probITM: probITM / nSim,
    payoffs: payoffs.slice(0, 200),
  };
}

function calcVaR(payoffs: number[], conf = 0.95): number {
  const sorted = [...payoffs].sort((a, b) => a - b);
  return sorted[Math.floor((1 - conf) * sorted.length)] ?? 0;
}

function parsePrice(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n / 100;
  }
  return 0;
}

function parseStrike(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function parseSpot(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ── Server function ──
export interface OpcionRow {
  simbolo: string;
  tipoOpcion: "Call" | "Put";
  strike: number;
  fechaVencimiento: string;
  T: number;
  precioOpcion: number;
  bid: number;
  ask: number;
  volumenNominal: number;
  montoOperado: number;
  volatilidadImplicita: number;
  BlackScholes: number;
  Delta: number;
  Gamma: number;
  Vega: number;
  Theta: number;
  Prob_ITM: number;
  MC_ProbProfit: number;
  MC_GananciaEsperada: number;
  VaR: number;
}

export interface OptionsResult {
  ticker: string;
  precioSpot: number;
  volatilidadHistorica: number;
  rsi: number;
  opciones: OpcionRow[];
  error?: string;
}

export const getOptionsAnalysis = createServerFn({ method: "GET" })
  .validator(
    z.object({ ticker: z.string().optional().default("GGAL"), sessionId: z.string().optional() }),
  )
  .handler(async ({ data }): Promise<OptionsResult> => {
    const ticker = data.ticker?.toUpperCase().trim() ?? "GGAL";
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // 1. Fetch spot price and historical data from Yahoo
    let precioSpot = 1000;
    let hv = 0.3;
    let rsi = 50;
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker + ".BA")}?range=1y&interval=1d`,
      );
      if (r.ok) {
        const j = await r.json();
        const result = j?.chart?.result?.[0];
        const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(
          (c: any) => c != null && c > 0,
        );
        if (closes.length > 1) {
          precioSpot = closes[closes.length - 1];
          hv = calcHV(closes);
          rsi = calcRSI(closes);
        }
      }
    } catch {}

    // 2. Fetch options from IOL if session available (placeholder)
    const opciones: OpcionRow[] = [];

    // Generate synthetic option chain around spot price for demo/fallback
    const strikes: number[] = [];
    const baseStrike = Math.round(precioSpot / 100) * 100;
    for (let i = -5; i <= 5; i++) strikes.push(baseStrike + i * 100);
    for (let i = -3; i <= 3; i++)
      if (!strikes.includes(baseStrike + i * 50)) strikes.push(baseStrike + i * 50);
    strikes.sort((a, b) => a - b);

    const vencimientos = [30, 60, 90, 180];
    const r = 0.05;

    for (const dias of vencimientos) {
      const T = dias / 365;
      const vto = new Date(hoy.getTime() + dias * 86400000);
      const fechaVto = vto.toISOString().split("T")[0];

      for (const strike of strikes) {
        for (const tipo of ["Call", "Put"] as const) {
          const sigma = hv + (tipo === "Put" ? 0.02 : -0.02) + Math.random() * 0.04;
          const b = bs(tipo, precioSpot, strike, T, r, sigma);
          if (!b) continue;
          const ask =
            tipo === "Call"
              ? b.precio * (1 + Math.random() * 0.05)
              : b.precio * (1 + Math.random() * 0.05);
          const bid = ask * (1 - Math.random() * 0.08);
          const mid = (bid + ask) / 2;
          const iv = calcIV(tipo, precioSpot, strike, T, r, mid) ?? sigma;
          const mc = mcSimple(tipo, precioSpot, strike, T, iv, mid, r, 5000);
          opciones.push({
            simbolo: `${ticker}${tipo === "Call" ? "C" : "V"}${strike}${dias > 60 ? "F" : "D"}`,
            tipoOpcion: tipo,
            strike,
            fechaVencimiento: fechaVto,
            T,
            precioOpcion: +mid.toFixed(4),
            bid: +bid.toFixed(4),
            ask: +ask.toFixed(4),
            volumenNominal: Math.floor(Math.random() * 500),
            montoOperado: Math.floor(Math.random() * 100000),
            volatilidadImplicita: iv,
            BlackScholes: +b.precio.toFixed(4),
            Delta: +b.delta.toFixed(4),
            Gamma: +b.gamma.toFixed(4),
            Vega: +b.vega.toFixed(4),
            Theta: +b.theta.toFixed(4),
            Prob_ITM: +b.prob.toFixed(4),
            MC_ProbProfit: +mc.probProfit.toFixed(4),
            MC_GananciaEsperada: +mc.gananciaEsperada.toFixed(4),
            VaR: +calcVaR(mc.payoffs).toFixed(4),
          });
        }
      }
    }

    // Sort by strike then maturity
    opciones.sort((a, b) => a.strike - b.strike || a.T - b.T);

    return {
      ticker,
      precioSpot: +precioSpot.toFixed(2),
      volatilidadHistorica: +hv.toFixed(4),
      rsi: +rsi.toFixed(1),
      opciones,
    };
  });
