// @ts-nocheck
import { blackScholes } from "./pricing.models";
import type { OptionType, PricingInput, VolatilityResult } from "./options.types";

//  Histórica 

export function calcularVolatilidadHistorica(
  closes: number[],
  windowDays = 30,
  anualizar = true,
): number[] {
  if (closes.length < 2) return [];

  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }

  const volSerie: number[] = [];
  for (let i = windowDays; i <= logReturns.length; i++) {
    const slice = logReturns.slice(i - windowDays, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (slice.length - 1);
    const vol = Math.sqrt(variance) * (anualizar ? Math.sqrt(252) : 1);
    volSerie.push(vol);
  }

  return volSerie;
}

//  EWMA (RiskMetrics) 

export function calcularVolatilidadEWMA(
  closes: number[],
  lambda = 0.94,
  ventanaInicial = 30,
  anualizar = true,
): number[] {
  if (closes.length < 2) return [];

  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (logReturns.length < ventanaInicial) return [];

  // Initial variance = variance of first window
  const initSlice = logReturns.slice(0, ventanaInicial);
  const meanInit = initSlice.reduce((a, b) => a + b, 0) / initSlice.length;
  let varPrev = initSlice.reduce((sum, r) => sum + (r - meanInit) ** 2, 0) / (initSlice.length - 1);

  const volSerie: number[] = [];
  for (let t = ventanaInicial; t < logReturns.length; t++) {
    const r = logReturns[t - 1]; // lagged return
    varPrev = lambda * varPrev + (1 - lambda) * r * r;
    volSerie.push(Math.sqrt(varPrev) * (anualizar ? Math.sqrt(252) : 1));
  }

  return volSerie;
}

//  Volatilidad Implícita (Brent + Newton fallback) 

export function calcularVolatilidadImplicita(
  tipo: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  precioMercado: number,
  q = 0,
  tol = 1e-5,
  maxIter = 200,
  volEstimada = 0.3,
): number | null {
  if (precioMercado <= 0 || T <= 0 || S <= 0 || K <= 0) return null;

  // Check arbitrage bounds
  if (tipo === "Call") {
    const lower = Math.max(S * Math.exp(-q * T) - K * Math.exp(-r * T), 0);
    const upper = S * Math.exp(-q * T);
    if (precioMercado < lower || precioMercado > upper) return null;
  } else {
    const lower = Math.max(K * Math.exp(-r * T) - S * Math.exp(-q * T), 0);
    const upper = K * Math.exp(-r * T);
    if (precioMercado < lower || precioMercado > upper) return null;
  }

  // Brent's method using function values
  const f = (sigma: number): number => {
    const result = blackScholes({ tipo, S, K, T, r, sigma, q });
    return result ? result.premium - precioMercado : precioMercado;
  };

  // Try Brent-like bisection first (more robust)
  let lo = Math.max(volEstimada * 0.1, 0.01);
  let hi = Math.min(volEstimada * 3, 5.0);
  let fLo = f(lo);
  let fHi = f(hi);

  // Expand bracket if needed
  for (let attempt = 0; attempt < 5; attempt++) {
    if (fLo * fHi <= 0) break;
    lo = Math.max(lo * 0.5, 0.001);
    hi = Math.min(hi * 1.5, 10.0);
    fLo = f(lo);
    fHi = f(hi);
  }

  if (fLo * fHi > 0) return null; // Cannot bracket

  // Brent's method
  let a = lo,
    b = hi,
    c = a;
  let fa = fLo,
    fb = fHi,
    fc = fa;
  let d = b - a,
    e = d;

  for (let iter = 0; iter < maxIter; iter++) {
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }

    const tol1 = 2 * Number.EPSILON * Math.abs(b) + tol;
    const xm = 0.5 * (c - b);

    if (Math.abs(xm) <= tol1 || fb === 0) {
      return b;
    }

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p = 0;
      let qVal = 0;
      if (a === c) {
        p = 2 * xm * s;
        qVal = 1 - s;
      } else {
        const r = fb / fc;
        const t = fa / fc;
        qVal = 1 - s;
        p = s * (2 * xm * qVal * (qVal - r) - (b - a) * (r - 1));
        qVal = (qVal - 1) * (r - 1) * (t - 1);
      }
      if (p > 0) qVal = -qVal;
      else p = -p;
      if (Math.abs(p) < Math.abs(0.5 * qVal * e) && p < qVal * xm) {
        e = d;
        d = p / qVal;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }

    a = b;
    fa = fb;
    if (Math.abs(d) > tol1) {
      b += d;
    } else {
      b += Math.sign(xm) * tol1;
    }
    fb = f(b);
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
  }

  return b;
}

//  Calcular ambas series y retornar VolatilityResult 

//  Sanity checks (equivalente a verificación en obtener_datos_subyacente) 

export interface VolatilidadSaneada {
  historica: number;
  dinamica: number;
}

/**
 * Aplica controles de cordura a valores de volatilidad.
 * - Capa valores extremos (hist > 100% → 50%)
 * - Si hist y din difieren >50%, los promedia
 */
export function sanearVolatilidad(historica: number, dinamica: number): VolatilidadSaneada {
  let h = historica;
  let d = dinamica;

  if (h > 1.0) h = 0.5;
  if (d > 2.0) d = 0.5;

  if (h > 0 && d > 0 && Math.abs(h - d) / Math.max(h, d) > 0.5) {
    const promedio = (h + d) / 2;
    h = promedio;
    d = promedio;
  }

  if (h <= 0) h = 0.2;
  if (d <= 0) d = 0.2;

  return { historica: h, dinamica: d };
}

export function calcularVolatilidadCompleta(
  closes: number[],
  windowDays = 30,
  lambda = 0.94,
): VolatilityResult {
  const histSerie = calcularVolatilidadHistorica(closes, windowDays);
  const ewmaSerie = calcularVolatilidadEWMA(closes, lambda, windowDays);

  const historica = histSerie.length > 0 ? histSerie[histSerie.length - 1] : 0;
  const dinamica = ewmaSerie.length > 0 ? ewmaSerie[ewmaSerie.length - 1] : historica;

  // Build date-indexed series (indices offset by window)
  const serie = histSerie.map((v, i) => ({
    date: `${i}`,
    value: v,
  }));

  return { historica, dinamica, serie };
}
