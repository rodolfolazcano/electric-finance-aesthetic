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
  correlationMatrix?: number[][],
): number {
  if (positions.length === 0) return 0;
  const z = zScore(nivelConfianza);
  const sqrtDt = Math.sqrt(dias / 252);
  // sensibilidad lineal por posición: delta·S·σ·√dt·cantidad  (sin z, porque z se aplica al final sobre std portafolio)
  const sens: number[] = positions.map((p) => p.delta * p.S * p.sigma * sqrtDt * p.cantidad);

  let varLinear: number;
  if (
    correlationMatrix &&
    correlationMatrix.length === positions.length &&
    correlationMatrix.every((row) => row.length === positions.length)
  ) {
    // VaR con correlaciones: σ_p = √(sᵀ·R·s), VaR = z·σ_p
    let var2 = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < positions.length; j++) {
        const rho = correlationMatrix[i]?.[j] ?? (i === j ? 1 : 0);
        var2 += sens[i]! * sens[j]! * rho;
      }
    }
    varLinear = -z * Math.sqrt(Math.max(0, var2));
  } else {
    // fallback suma simple (asume ρ=1, caso conservador)
    // equivale a Σ varLinear individual = -z·Σ sens_i  (si sens negativos, signo coherente)
    let sumSens = 0;
    for (let i = 0; i < sens.length; i++) sumSens += sens[i]!;
    varLinear = -z * sumSens;
    // alternativa exacta componente a componente (mantiene compatibilidad con versión previa):
    // varLinear = positions.reduce((acc, pos) => acc + calcularVarDeltaGamma(pos.S, pos.sigma, pos.delta, 0, nivelConfianza, dias) * pos.cantidad, 0);
  }

  // término cuadrático gamma: suma individual (segundo orden, correlación no lineal → aproximación conservadora)
  let varGamma = 0;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    const deltaS = p.S * p.sigma * z * sqrtDt;
    varGamma += -0.5 * p.gamma * deltaS * deltaS * p.cantidad;
  }
  // clamp gamma para no sobreestimar (misma lógica que single-option: ≤50% del lineal)
  const varTotal = varLinear + Math.min(varGamma, Math.abs(varLinear) * 0.5);
  return varTotal;
}

/**
 * Construye matriz de correlación de Pearson desde series de retornos log.
 * series[i] = array de retornos del activo i (misma longitud, alineados).
 */
export function matrizCorrelacion(series: number[][]): number[][] {
  const n = series.length;
  const mat: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { mat[i]![j] = 1; continue; }
      const a = series[i]!, b = series[j]!;
      const len = Math.min(a.length, b.length);
      if (len < 3) { mat[i]![j] = 0; continue; }
      // pearsonR inline para no crear dependencia circular con math/stats
      let mx = 0, my = 0;
      for (let k = 0; k < len; k++) { mx += a[k]!; my += b[k]!; }
      mx /= len; my /= len;
      let sxy = 0, sx2 = 0, sy2 = 0;
      for (let k = 0; k < len; k++) {
        const dx = a[k]! - mx, dy = b[k]! - my;
        sxy += dx * dy; sx2 += dx * dx; sy2 += dy * dy;
      }
      mat[i]![j] = sx2 > 0 && sy2 > 0 ? sxy / Math.sqrt(sx2 * sy2) : 0;
    }
  }
  return mat;
}

/**
 * CVaR (Expected Shortfall) paramétrico bajo normal: CVaR = μ − σ·φ(z)/ (1−Φ(z))  (cola izquierda)
 * Para VaR lineal: CVaR = VaR · φ(z)/[(1−conf)·z]  (factor >1).
 * Si se provee payoffs empíricos, calcula CVaR como media de pérdidas ≤ VaR.
 */
export function calcularCVaRDeltaGamma(
  S: number,
  sigma: number,
  delta: number,
  gamma: number,
  nivelConfianza = 0.95,
  dias = 1,
): { var: number; cvar: number } {
  const varVal = calcularVarDeltaGamma(S, sigma, delta, gamma, nivelConfianza, dias);
  const z = zScore(nivelConfianza);
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const factor = phi / ((1 - nivelConfianza) * Math.max(1e-9, z));
  // CVaR paramétrico ≈ VaR · factor  (para lineal); con gamma aplica mismo factor sobre varLinear y luego clamp
  const cvar = varVal * factor;
  return { var: varVal, cvar };
}

export function calcularCVaRPortafolio(
  positions: { S: number; sigma: number; delta: number; gamma: number; cantidad: number }[],
  nivelConfianza = 0.95,
  dias = 1,
  correlationMatrix?: number[][],
): { var: number; cvar: number } {
  const varVal = calcularVarPortafolio(positions, nivelConfianza, dias, correlationMatrix);
  const z = zScore(nivelConfianza);
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const factor = phi / ((1 - nivelConfianza) * Math.max(1e-9, z));
  return { var: varVal, cvar: varVal * factor };
}

/** CVaR empírico desde payoffs/simulaciones: media de pérdidas en la cola ≤ quantile(1−conf) */
export function cvarEmpirico(pnls: number[], nivelConfianza = 0.95): number {
  if (pnls.length === 0) return 0;
  const sorted = [...pnls].sort((a, b) => a - b);
  const varIdx = Math.floor((1 - nivelConfianza) * sorted.length);
  const varThreshold = sorted[Math.max(0, varIdx)] ?? sorted[0]!;
  const cola = sorted.filter((v) => v <= varThreshold);
  if (cola.length === 0) return varThreshold;
  return cola.reduce((s, v) => s + v, 0) / cola.length;
}

function zScore(confianza: number): number {
  // Inverse normal CDF approximation (Peter Acklam)
  const p = confianza;
  const a1 = -3.969683028665376e+1;
  const a2 = 2.209460984245205e+2;
  const a3 = -2.759285104469687e+2;
  const a4 = 1.383577518672690e+2;
  const a5 = -3.066479806614716e+1;
  const a6 = 2.506628277459239e+0;
  const b1 = -5.447609879822406e+1;
  const b2 = 1.615858368580409e+2;
  const b3 = -1.556989798598866e+2;
  const b4 = 6.680131188771972e+1;
  const b5 = -1.328068155288572e+1;
  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838e+0;
  const c4 = -2.549732539343734e+0;
  const c5 = 4.374664141464968e+0;
  const c6 = 2.938163982698783e+0;
  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996e+0;
  const d4 = 3.754408661907416e+0;
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let z: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    z = (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    z = (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z = -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  return z;
}
