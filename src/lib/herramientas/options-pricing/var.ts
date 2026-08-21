import { normalCdf } from "./pricing.models";
import type { Greeks } from "./options.types";

/**
 * VaR paramétrico Delta-Gamma para una opción.
 *
 * La fórmula académica (Jorion, 2006):
 *   VaR(Δ-Γ) = -[Δ · δS + ½ · Γ · (δS)²]
 * donde δS = S · σ · Z · √(dias/252)
 *
 * El resultado está en las mismas unidades que S (ARS/USD).
 * NO se multiplica por S al final — deltaS ya escala con S.
 */
export function calcularVarDeltaGamma(
  S: number,
  sigma: number,
  delta: number,
  gamma: number,
  nivelConfianza = 0.95,
  dias = 1,
): number {
  const z = zScore(nivelConfianza);
  const deltaS = S * sigma * z * Math.sqrt(dias / 252);
  const varLinear = -(delta * deltaS);
  const varQuadratic = -0.5 * gamma * deltaS * deltaS;
  // Clamp gamma effect for OTM options to avoid overestimation
  const varTotal = varLinear + Math.min(varQuadratic, Math.abs(varLinear) * 0.5);
  return varTotal;
}

export function calcularVarPortafolio(
  positions: { S: number; sigma: number; delta: number; gamma: number; cantidad: number }[],
  nivelConfianza = 0.95,
  dias = 1,
): number {
  // Simple component VaR sum (ignores correlation for now)
  let totalVar = 0;
  for (const pos of positions) {
    const varComp = calcularVarDeltaGamma(
      pos.S,
      pos.sigma,
      pos.delta,
      pos.gamma,
      nivelConfianza,
      dias,
    );
    totalVar += varComp * pos.cantidad;
  }
  return totalVar;
}

function zScore(confianza: number): number {
  // Inverse normal CDF approximation (Peter Acklam)
  const p = confianza;
  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.38357751867269e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239;
  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;
  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;
  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let z: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    z =
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    z =
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z =
      -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  return z;
}
