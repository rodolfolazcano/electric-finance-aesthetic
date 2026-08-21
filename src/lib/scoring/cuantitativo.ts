// @ts-nocheck
// Motor cuantitativo puro migrado de src/lib/scoring/cuantitativo-scoring.ts (Fase 2).
// Fórmulas, pesos y umbrales idénticos. Corrección: división por cero
// (pesoTotal === 0) retorna 50 pero marca disponible: false.

import type { SubScore } from "./types";

export interface CuantitativoInput {
  sharpeRatio: number | null;
  beta: number | null;
  rSquared: number | null;
  var95: number | null;
  /** BLOQUE 9.1 — salud operativa de corto plazo 0-100 (ciclo de conversión de efectivo) */
  cicloConversion?: number | null;
}

function normalizarSharpe(sharpe: number): number {
  if (sharpe <= 0) return 0;
  if (sharpe >= 3) return 100;
  return (sharpe / 3) * 100;
}

export function calcularCuantitativo(data: CuantitativoInput): SubScore {
  let score = 0;
  let pesoTotal = 0;
  const detalle: Record<string, number> = {};

  // 1. Sharpe ratio normalizado (peso 0.35)
  if (data.sharpeRatio != null) {
    const sharpeNorm = normalizarSharpe(data.sharpeRatio);
    score += 0.35 * sharpeNorm;
    pesoTotal += 0.35;
    detalle.sharpe = sharpeNorm;
  }

  // 2. Desviación de beta de 1 (peso 0.25) — penaliza betas extremos
  if (data.beta != null && data.beta > 0) {
    const desviacion = Math.abs(data.beta - 1);
    const betaScore = Math.max(0, 1 - desviacion / 2); // beta 0.5-1.5 da score > 0.75
    score += 0.25 * betaScore * 100;
    pesoTotal += 0.25;
    detalle.beta = betaScore * 100;
  }

  // 3. R² (peso 0.25) — qué tan bien explica el benchmark
  if (data.rSquared != null && data.rSquared > 0) {
    score += 0.25 * data.rSquared * 100;
    pesoTotal += 0.25;
    detalle.rSquared = data.rSquared * 100;
  }

  // 4. VaR 95% normalizado inverso (peso 0.15)
  if (data.var95 != null && data.var95 < 0) {
    const varNorm = Math.min(1, Math.abs(data.var95) / 0.05); // VaR de -5% da 1.0
    score += 0.15 * (1 - varNorm) * 100;
    pesoTotal += 0.15;
    detalle.var95 = (1 - varNorm) * 100;
  }

  // 5. BLOQUE 9.1 — Salud operativa de corto plazo (ciclo de conversión de efectivo),
  //    peso 0.1. Completa el subScore diferenciando liquidez de ciclo operativo de la
  //    liquidez estructural (que ya pondera currentRatio/workingCapital en otros motores).
  if (data.cicloConversion != null) {
    score += 0.1 * Math.min(100, Math.max(0, data.cicloConversion));
    pesoTotal += 0.1;
    detalle.cicloConversion = Math.round(Math.min(100, Math.max(0, data.cicloConversion)));
  }

  // FIX (Fase 2): pesoTotal === 0 → 50 fijo también sin datos.
  if (pesoTotal === 0) {
    return { valor: 50, detalle, fuente: "scoring/cuantitativo.ts", disponible: false };
  }

  return {
    valor: Math.round(score / pesoTotal),
    detalle,
    fuente: "scoring/cuantitativo.ts",
    disponible: true,
  };
}
