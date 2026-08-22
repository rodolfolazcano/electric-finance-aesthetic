// src/lib/pairs-arbitrage.functions.ts
// Arbitraje Estadístico de Pares — Alpha / Beta / Correl / R² / Cointegración
// Basado en Pine Script v6 Coronar Inversiones

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface PairsArbitrageResult {
  ticker1: string;
  ticker2: string;
  lookback: number;
  alpha: number | null;
  beta: number | null;
  r: number | null;
  r2: number | null;
  theta: number | null;
  halfLife: number | null;
  revierteAMedia: boolean;
  parValido: boolean;
  zScoreActual: number | null;
  signal: "VENTA_ACT1_COMPRA_ACT2" | "COMPRA_ACT1_VENTA_ACT2" | "SIN_SENAL" | "PAR_NO_APTO";
  spreadHistory: { bar: number; z: number | null; spread: number | null }[];
  predictedPrice1: { bar: number; price: number | null }[];
  stats: {
    fecha: string;
    alpha: number | null;
    beta: number | null;
    r: number | null;
    r2: number | null;
    theta: number | null;
    zScore: number | null;
  }[];
}

// ============================================================================
// FUNCIÓN: descargar precios y calcular regresión OLS rodante
// ============================================================================

export const getPairsArbitrage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker1: z.string().min(1).max(20),
      ticker2: z.string().min(1).max(20),
      lookback: z.number().int().min(20).max(500).default(60),
      zEntry: z.number().min(0.5).max(5).default(2.0),
      zExit: z.number().min(0).max(2).default(0.5),
      minR2: z.number().min(0).max(1).default(0.5),
      exigirReversion: z.boolean().default(true),
      usarLog: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const YF = "https://query1.finance.yahoo.com/v8/finance/chart";

    async function fetchPrices(ticker: string): Promise<number[]> {
      try {
        const r = await fetch(`${YF}/${encodeURIComponent(ticker)}?range=1y&interval=1d`, {
          cache: "no-store",
        });
        if (!r.ok) return [];
        const j = await r.json();
        const closes = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
          (c: any) => c != null && c > 0,
        ) as number[];
        // Usar máximo 252 barras (1 año hábil)
        return closes.slice(-252);
      } catch {
        return [];
      }
    }

    const prices1 = await fetchPrices(data.ticker1);
    const prices2 = await fetchPrices(data.ticker2);

    if (prices1.length < data.lookback || prices2.length < data.lookback) {
      return {
        ticker1: data.ticker1,
        ticker2: data.ticker2,
        lookback: data.lookback,
        alpha: null,
        beta: null,
        r: null,
        r2: null,
        theta: null,
        halfLife: null,
        revierteAMedia: false,
        parValido: false,
        zScoreActual: null,
        signal: "PAR_NO_APTO" as const,
        spreadHistory: [],
        predictedPrice1: [],
        stats: [],
        error: `Datos insuficientes. Se necesitan al menos ${data.lookback} barras para ambos activos.`,
      };
    }

    // Alinear longitudes (tomar la menor)
    const n = Math.min(prices1.length, prices2.length);
    const p1 = prices1.slice(-n);
    const p2 = prices2.slice(-n);

    // Convertir a log si es necesario
    const price1 = data.usarLog ? p1.map((v) => Math.log(v)) : [...p1];
    const price2 = data.usarLog ? p2.map((v) => Math.log(v)) : [...p2];

    const lb = data.lookback;
    const zEntry = data.zEntry;
    const zExit = data.zExit;

    // Rolling OLS: calcular alpha, beta, r, r2, spread, z-score, theta
    const alphas: (number | null)[] = Array(n).fill(null);
    const betas: (number | null)[] = Array(n).fill(null);
    const rs: (number | null)[] = Array(n).fill(null);
    const r2s: (number | null)[] = Array(n).fill(null);
    const spreads: (number | null)[] = Array(n).fill(null);
    const zScores: (number | null)[] = Array(n).fill(null);
    const thetas: (number | null)[] = Array(n).fill(null);

    for (let i = lb - 1; i < n; i++) {
      const slice1 = price1.slice(i - lb + 1, i + 1);
      const slice2 = price2.slice(i - lb + 1, i + 1);

      // Medias
      const m1 = slice1.reduce((s, v) => s + v, 0) / lb;
      const m2 = slice2.reduce((s, v) => s + v, 0) / lb;

      // Cov y vars
      let cov = 0,
        v1 = 0,
        v2 = 0;
      for (let j = 0; j < lb; j++) {
        const d1 = slice1[j] - m1;
        const d2 = slice2[j] - m2;
        cov += d1 * d2;
        v1 += d1 * d1;
        v2 += d2 * d2;
      }

      const beta = v2 > 0 ? cov / v2 : null;
      const alpha = beta != null ? m1 - beta * m2 : null;
      const r = v1 > 0 && v2 > 0 ? cov / Math.sqrt(v1 * v2) : null;

      alphas[i] = alpha;
      betas[i] = beta;
      rs[i] = r;
      r2s[i] = r != null ? r * r : null;

      // Spread
      if (alpha != null && beta != null) {
        const predicted = alpha + beta * price2[i];
        spreads[i] = price1[i] - predicted;
      }

      // Z-score del spread
      if (i >= lb * 2 - 1 && spreads[i] != null) {
        const spreadSlice = spreads.slice(i - lb + 1, i + 1).filter((s): s is number => s != null);
        if (spreadSlice.length >= lb) {
          const sm = spreadSlice.reduce((s, v) => s + v, 0) / spreadSlice.length;
          const ss = Math.sqrt(
            spreadSlice.reduce((s, v) => s + (v - sm) ** 2, 0) / spreadSlice.length,
          );
          zScores[i] = ss > 0 ? ((spreads[i] ?? 0) - sm) / ss : null;
        }
      }

      // Theta (AR(1) on spread)
      if (i >= lb * 2) {
        const dS: number[] = [];
        const sL: number[] = [];
        for (let j = i - lb + 1; j <= i; j++) {
          if (spreads[j] != null && spreads[j - 1] != null) {
            dS.push(spreads[j]! - spreads[j - 1]!);
            sL.push(spreads[j - 1]!);
          }
        }
        if (dS.length > 5) {
          const md = dS.reduce((s, v) => s + v, 0) / dS.length;
          const ml = sL.reduce((s, v) => s + v, 0) / sL.length;
          let covDL = 0,
            varL = 0;
          for (let j = 0; j < dS.length; j++) {
            covDL += (dS[j] - md) * (sL[j] - ml);
            varL += (sL[j] - ml) ** 2;
          }
          thetas[i] = varL > 0 ? covDL / varL : null;
        }
      }
    }

    // Último valor
    const lastI = n - 1;
    const lastAlpha = alphas[lastI];
    const lastBeta = betas[lastI];
    const lastR = rs[lastI];
    const lastR2 = r2s[lastI];
    const lastTheta = thetas[lastI];
    const lastZ = zScores[lastI];

    const revierte = lastTheta != null && lastTheta < 0;
    const halfLife = revierte && lastTheta != null ? -Math.log(2) / lastTheta : null;
    const parOk = lastR2 != null && lastR2 >= data.minR2 && (!data.exigirReversion || revierte);

    let signal: PairsArbitrageResult["signal"] = "SIN_SENAL";
    if (!parOk) signal = "PAR_NO_APTO";
    else if (lastZ != null && lastZ > zEntry) signal = "VENTA_ACT1_COMPRA_ACT2";
    else if (lastZ != null && lastZ < -zEntry) signal = "COMPRA_ACT1_VENTA_ACT2";

    // Predicted price of asset 1 (in original scale)
    const predictedPrice1: { bar: number; price: number | null }[] = [];
    for (let i = lb - 1; i < n; i++) {
      if (alphas[i] != null && betas[i] != null) {
        const pred = alphas[i]! + betas[i]! * price2[i];
        predictedPrice1.push({ bar: i, price: data.usarLog ? Math.exp(pred) : pred });
      }
    }

    return {
      ticker1: data.ticker1,
      ticker2: data.ticker2,
      lookback: lb,
      alpha: lastAlpha,
      beta: lastBeta,
      r: lastR,
      r2: lastR2,
      theta: lastTheta,
      halfLife,
      revierteAMedia: revierte,
      parValido: parOk,
      zScoreActual: lastZ,
      signal,
      spreadHistory: zScores.map((z, i) => ({ bar: i, z, spread: spreads[i] })),
      predictedPrice1,
      stats: [],
      error: null,
    } as PairsArbitrageResult;
  });
