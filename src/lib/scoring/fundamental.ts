// @ts-nocheck
// Motor fundamental puro migrado de src/lib/scoring/fundamental-scoring.ts (Fase 2).
// Fórmulas, pesos y umbrales idénticos. Corrección: cuando maxScore === 0 el
// original retorna 50 fijo; ahora además marca disponible: false para distinguir
// "neutral real" de "sin datos".

import type { SubScore } from "./types";

export interface FundamentalInput {
  trailingPE: number | null;
  forwardPE: number | null;
  sectorPE: number | null;
  priceToBook: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  fcfYield: number | null;
  evToEbitda: number | null;
  recommendationMean: number | null;
  marketCap: number | null;
  pePercentile: number | null;
  totalLiabilities: number | null;
  totalStockholderEquity: number | null;
  ebit: number | null;
  totalAssets: number | null;
  wacc: number | null;
}

export function calcularFundamental(data: FundamentalInput): SubScore {
  let score = 0;
  let maxScore = 0;
  const detalle: Record<string, number> = {};

  // 1. P/E relativo al sector (peso 15)
  if (
    data.trailingPE != null &&
    data.trailingPE > 0 &&
    data.sectorPE != null &&
    data.sectorPE > 0
  ) {
    const ratio = data.trailingPE / data.sectorPE;
    if (ratio < 0.8) score += 15;
    else if (ratio < 1.0) score += 10;
    else if (ratio < 1.3) score += 5;
    detalle.peRelativo = maxScore + 15;
    maxScore += 15;
  }

  // 2. P/B (peso 10)
  if (data.priceToBook != null && data.priceToBook > 0) {
    if (data.priceToBook < 1.5) score += 10;
    else if (data.priceToBook < 3.0) score += 6;
    else score += 2;
    detalle.pb = maxScore + 10;
    maxScore += 10;
  }

  // 3. Apalancamiento dinámico — Amat, Cap. 10 y 18 (peso 15)
  const liabilities = data.totalLiabilities;
  const equity = data.totalStockholderEquity;
  const ebit = data.ebit;
  const assets = data.totalAssets;
  const wacc = data.wacc;

  let endeudamientoRatio: number | null = null;
  if (liabilities != null && equity != null && liabilities + equity > 0) {
    endeudamientoRatio = liabilities / (liabilities + equity);
  }

  if (endeudamientoRatio != null && assets != null && ebit != null) {
    const roa = ebit / assets;
    const deudaExcesiva = endeudamientoRatio > 0.6;
    const apalancamientoFavorable = wacc != null && roa > wacc / 100;

    if (!deudaExcesiva && apalancamientoFavorable) {
      score += 15;
    } else if (!deudaExcesiva && wacc == null) {
      if (endeudamientoRatio <= 0.4) score += 15;
      else if (endeudamientoRatio <= 0.5) score += 10;
      else if (endeudamientoRatio <= 0.6) score += 5;
    }
    detalle.apalancamiento = maxScore + 15;
    maxScore += 15;
  } else if (endeudamientoRatio != null && assets != null && ebit == null) {
    if (endeudamientoRatio <= 0.4) score += 15;
    else if (endeudamientoRatio <= 0.5) score += 10;
    else if (endeudamientoRatio <= 0.6) score += 5;
    detalle.apalancamiento = maxScore + 15;
    maxScore += 15;
  } else if (data.debtToEquity != null) {
    if (data.debtToEquity < 50) score += 10;
    else if (data.debtToEquity < 100) score += 7;
    else if (data.debtToEquity < 200) score += 3;
    detalle.apalancamiento = maxScore + 10;
    maxScore += 10;
  }

  // 4. ROE (peso 10, outliers hasta 15)
  if (data.returnOnEquity != null) {
    if (data.returnOnEquity > 1.0) score += 15;
    else if (data.returnOnEquity > 0.5) score += 13;
    else if (data.returnOnEquity > 0.2) score += 10;
    else if (data.returnOnEquity > 0.1) score += 7;
    else if (data.returnOnEquity > 0.05) score += 3;
    detalle.roe = maxScore + 15;
    maxScore += 15;
  }

  // 5. Revenue Growth (peso 8, outliers hasta 12)
  if (data.revenueGrowth != null) {
    if (data.revenueGrowth > 0.8) score += 12;
    else if (data.revenueGrowth > 0.5) score += 10;
    else if (data.revenueGrowth > 0.15) score += 8;
    else if (data.revenueGrowth > 0.05) score += 6;
    else if (data.revenueGrowth > 0) score += 3;
    detalle.revenueGrowth = maxScore + 12;
    maxScore += 12;
  }

  // 6. FCF Yield (peso 10)
  if (data.fcfYield != null) {
    if (data.fcfYield > 0.06) score += 10;
    else if (data.fcfYield > 0.03) score += 7;
    else if (data.fcfYield > 0) score += 3;
    detalle.fcfYield = maxScore + 10;
    maxScore += 10;
  }

  // 7. EV/EBITDA (peso 8)
  if (data.evToEbitda != null && data.evToEbitda > 0) {
    if (data.evToEbitda < 8) score += 8;
    else if (data.evToEbitda < 12) score += 5;
    else if (data.evToEbitda < 18) score += 2;
    detalle.evToEbitda = maxScore + 8;
    maxScore += 8;
  }

  // 8. Earnings Growth (peso 5, outliers hasta 8)
  if (data.earningsGrowth != null) {
    if (data.earningsGrowth > 0.8) score += 8;
    else if (data.earningsGrowth > 0.5) score += 7;
    else if (data.earningsGrowth > 0.15) score += 5;
    else if (data.earningsGrowth > 0) score += 3;
    detalle.earningsGrowth = maxScore + 8;
    maxScore += 8;
  }

  // 9. Consenso analistas (peso 8)
  if (data.recommendationMean != null && data.recommendationMean > 0) {
    if (data.recommendationMean <= 1.5) score += 8;
    else if (data.recommendationMean <= 2.0) score += 6;
    else if (data.recommendationMean <= 2.5) score += 4;
    else if (data.recommendationMean <= 3.0) score += 2;
    detalle.consenso = maxScore + 8;
    maxScore += 8;
  }

  // 10. P/E Percentile (peso 6)
  if (data.pePercentile != null && data.pePercentile > 0) {
    if (data.pePercentile <= 20) score += 6;
    else if (data.pePercentile <= 40) score += 4;
    else if (data.pePercentile <= 60) score += 2;
    detalle.pePercentile = maxScore + 6;
    maxScore += 6;
  }

  // 11. Tamaño (market cap como proxy de estabilidad) (peso 10)
  if (data.marketCap != null && data.marketCap > 0) {
    if (data.marketCap >= 1e11) score += 10;
    else if (data.marketCap >= 1e10) score += 8;
    else if (data.marketCap >= 2e9) score += 5;
    else if (data.marketCap >= 3e8) score += 2;
    detalle.tamano = maxScore + 10;
    maxScore += 10;
  }

  // FIX (Fase 2): maxScore === 0 no distingue "neutral real" de "sin datos".
  // Mantener valor 50 pero marcar disponible: false.
  if (maxScore === 0) {
    return { valor: 50, detalle: {}, fuente: "scoring/fundamental.ts", disponible: false };
  }

  return {
    valor: Math.round((score / maxScore) * 100),
    detalle,
    fuente: "scoring/fundamental.ts",
    disponible: true,
  };
}
