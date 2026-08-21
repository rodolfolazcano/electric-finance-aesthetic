// @ts-nocheck
// Anomaly Detection Engine
// Usa p-variance, impliedP, y estadisticos del motor de calculo
// para detectar anomalias en datos financieros y resultados

import { impliedPFromReturns } from "../math/stats";

export interface AnomalyReport {
  hasAnomaly: boolean;
  severity: "low" | "medium" | "high";
  flags: AnomalyFlag[];
  correctedValues?: Record<string, number>;
}

export interface AnomalyFlag {
  metric: string;
  value: number;
  expected: number;
  deviation: number;
  message: string;
}

export interface CalcSnapshot {
  returns: number[];
  weights?: number[];
  pValue: number;
  sharpe: number;
  volatility: number;
  meanReturn: number;
  hurst?: number;
}

export function detectCalculationAnomalies(snapshot: CalcSnapshot): AnomalyReport {
  const flags: AnomalyFlag[] = [];
  // 1. Detectar p inconsistente: impliedPFromReturns vs pValue usado
  if (snapshot.returns.length >= 100) {
    const impliedP = impliedPFromReturns(snapshot.returns);
    const pUsed = snapshot.pValue;
    const pDev = Math.abs(impliedP - pUsed) / Math.max(0.1, pUsed);
    if (pDev > 0.3) {
      flags.push({
        metric: "p-value inconsistency",
        value: pUsed,
        expected: impliedP,
        deviation: pDev,
        message: `p=${pUsed} usado pero los datos implican p=${impliedP.toFixed(2)} (dev ${(pDev * 100).toFixed(0)}%)`,
      });
    }
  }

  // 2. Sharpe extremo
  if (snapshot.sharpe > 3) {
    flags.push({
      metric: "sharpe ratio",
      value: snapshot.sharpe,
      expected: 1.5,
      deviation: snapshot.sharpe / 1.5,
      message: `Sharpe ${snapshot.sharpe.toFixed(2)} > 3: posible sobreoptimismo`,
    });
  }
  if (snapshot.sharpe < -2) {
    flags.push({
      metric: "sharpe ratio",
      value: snapshot.sharpe,
      expected: 0,
      deviation: Math.abs(snapshot.sharpe),
      message: `Sharpe ${snapshot.sharpe.toFixed(2)} negativo severo`,
    });
  }

  // 3. Volatilidad cero o extrema
  if (snapshot.volatility < 1e-6) {
    flags.push({
      metric: "volatility",
      value: snapshot.volatility,
      expected: 0.01,
      deviation: 1,
      message: "Volatilidad cero: datos congelados o constantes",
    });
  } else if (snapshot.volatility > 0.5) {
    flags.push({
      metric: "volatility",
      value: snapshot.volatility,
      expected: 0.02,
      deviation: snapshot.volatility / 0.02,
      message: `Volatilidad ${(snapshot.volatility * 100).toFixed(0)}% extremadamente alta`,
    });
  }

  // 4. Weights no suman 1
  if (snapshot.weights) {
    const sumW = snapshot.weights.reduce((s, w) => s + w, 0);
    if (Math.abs(sumW - 1) > 0.01) {
      flags.push({
        metric: "weight sum",
        value: sumW,
        expected: 1,
        deviation: Math.abs(sumW - 1),
        message: `Pesos suman ${sumW.toFixed(4)} ≠ 1: corrección necesaria`,
      });
    }
  }

  // 5. Hurst inconsistency
  if (snapshot.hurst !== undefined && snapshot.returns.length >= 100) {
    if (snapshot.hurst <= 0 || snapshot.hurst >= 1) {
      flags.push({
        metric: "hurst exponent",
        value: snapshot.hurst,
        expected: 0.5,
        deviation: Math.abs(snapshot.hurst - 0.5),
        message: `Hurst ${snapshot.hurst.toFixed(3)} fuera de rango (0,1)`,
      });
    }
  }

  const severity: "low" | "medium" | "high" =
    flags.length === 0
      ? "low"
      : flags.some((f) => f.deviation > 2)
        ? "high"
        : flags.some((f) => f.deviation > 1)
          ? "medium"
          : "low";

  return { hasAnomaly: flags.length > 0, severity, flags };
}

export function autoCorrect(snapshot: CalcSnapshot): CalcSnapshot {
  const corrected = { ...snapshot };
  // Si p es inconsistente, sugerir p corregido
  if (snapshot.returns.length >= 100) {
    const impliedP = impliedPFromReturns(snapshot.returns);
    const pDev = Math.abs(snapshot.pValue - impliedP) / Math.max(0.1, snapshot.pValue);
    if (pDev > 0.3) {
      corrected.pValue = Math.round(impliedP * 10) / 10;
    }
  }
  return corrected;
}
