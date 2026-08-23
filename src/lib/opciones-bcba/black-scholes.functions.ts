/**
 * Pricing de opciones BCBA — port a TypeScript del PROTOTIPO Python
 * (calculadora_opciones.py → opciones_service.py), metodología Dunbar/Labadie.
 * Funciones puras: corren en edge/node de Vercel sin dependencias externas.
 */

export interface Greeks {
  precio: number;
  delta: number;
  gamma: number;
  vega: number;
  thetaDiario: number;
  rho: number;
  probItm: number;
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

function normalCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26 (precisión 1e-7)
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - normalPdf(x) * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

export function blackScholes(
  tipo: "Call" | "Put",
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q = 0,
): Greeks | null {
  if (![S, K, T, r, sigma].every((v) => Number.isFinite(v)) || T <= 0 || sigma <= 0 || S <= 0) {
    return null;
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discK = K * Math.exp(-r * T);
  const nd1 = normalPdf(d1);

  let precio: number;
  let delta: number;
  let prob: number;
  let theta: number;
  if (tipo === "Call") {
    precio = S * normalCdf(d1) - discK * normalCdf(d2);
    delta = normalCdf(d1);
    prob = normalCdf(d2);
    theta = (-S * nd1 * sigma) / (2 * sqrtT) - r * discK * normalCdf(d2);
  } else {
    precio = discK * normalCdf(-d2) - S * normalCdf(-d1);
    delta = normalCdf(d1) - 1;
    prob = normalCdf(-d2);
    theta = (-S * nd1 * sigma) / (2 * sqrtT) + r * discK * normalCdf(-d2);
  }
  if (tipo === "Put" && prob < 0) prob = 0;

  return {
    precio,
    delta,
    gamma: nd1 / (S * sigma * sqrtT),
    vega: (S * nd1 * sqrtT) / 100,
    thetaDiario: theta / 365,
    rho:
      ((tipo === "Call" ? 1 : -1) *
        K *
        T *
        Math.exp(-r * T) *
        normalCdf(tipo === "Call" ? d2 : -d2)) /
      100,
    probItm: prob,
  };
}

/** Binomial CRR. americana=true permite ejercicio temprano. */
export function binomial(
  tipo: "Call" | "Put",
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  pasos = 100,
  q = 0,
  americana = false,
): number | null {
  if (!Number.isFinite(S) || T <= 0 || sigma <= 0 || pasos < 1) return null;
  const dt = T / pasos;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp((r - q) * dt) - d) / (u - d);
  if (p <= 0 || p >= 1) return null;
  const disc = Math.exp(-r * dt);

  const payoff = new Array<number>(pasos + 1);
  for (let i = 0; i <= pasos; i++) {
    const spot = S * Math.pow(u, pasos - i) * Math.pow(d, i);
    payoff[i] = tipo === "Call" ? Math.max(0, spot - K) : Math.max(0, K - spot);
  }
  for (let j = pasos - 1; j >= 0; j--) {
    for (let i = 0; i <= j; i++) {
      payoff[i] = disc * (p * payoff[i] + (1 - p) * payoff[i + 1]);
      if (americana) {
        const spot = S * Math.pow(u, j - i) * Math.pow(d, i);
        const ejercicio = tipo === "Call" ? Math.max(0, spot - K) : Math.max(0, K - spot);
        payoff[i] = Math.max(payoff[i], ejercicio);
      }
    }
  }
  return payoff[0];
}

/** Volatilidad implícita por bisección dentro de límites teóricos (brentq-like). */
export function volatilidadImplicita(
  tipo: "Call" | "Put",
  S: number,
  K: number,
  T: number,
  r: number,
  precioMercado: number,
  q = 0,
  volHistorica = 0.2,
): number | null {
  if (precioMercado <= 0 || T <= 0 || S <= 0) return null;
  const descK = K * Math.exp(-r * T);
  const lower = tipo === "Call" ? Math.max(S - descK, 0) : Math.max(descK - S, 0);
  const upper = tipo === "Call" ? S : descK;
  if (precioMercado < lower || precioMercado > upper) return null;

  const f = (sig: number) => (blackScholes(tipo, S, K, T, r, sig, q)?.precio ?? 0) - precioMercado;
  let lo = Math.max(volHistorica * 0.8, 0.2);
  let hi = Math.min(volHistorica * 1.5, 2.0);
  if (f(lo) * f(hi) > 0) {
    lo = 0.05;
    hi = 3.0;
    if (f(lo) * f(hi) > 0) return null;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (f(lo) * fm < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** EWMA RiskMetrics anualizada sobre retornos log. */
export function ewmaVol(retornosLog: number[], lambda = 0.94, ventanaInicial = 30): number | null {
  if (retornosLog.length < ventanaInicial + 1) return null;
  let varT = 0;
  for (let i = 0; i < ventanaInicial; i++) varT += retornosLog[i] ** 2;
  varT /= ventanaInicial;
  for (let t = ventanaInicial; t < retornosLog.length; t++) {
    varT = lambda * varT + (1 - lambda) * retornosLog[t] ** 2;
  }
  return Math.sqrt(varT * 252);
}

/** Vol histórica ventana móvil anualizada (último valor). */
export function volHistorica(retornosLog: number[], ventana = 30): number | null {
  if (retornosLog.length < ventana + 1) return null;
  const slice = retornosLog.slice(-ventana);
  const m = slice.reduce((a, b) => a + b, 0) / ventana;
  const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / (ventana - 1);
  return Math.sqrt(v * 252);
}

/** VaR paramétrico delta-gamma de una opción (horizonte dias). Metodología Elbaum/Hull. */
export function varDeltaGamma(
  S: number,
  delta: number,
  gamma: number,
  sigma: number,
  z = 1.645,
  dias = 1,
): number | null {
  if (![S, delta, gamma, sigma].every(Number.isFinite)) return null;
  const dS = S * sigma * z * Math.sqrt(dias / 252);
  const varFuturo = -(delta * dS + 0.5 * gamma * dS ** 2) * S;
  const piso = -delta * dS * S;
  return Math.max(varFuturo, piso);
}

/** Sesgo de volatilidad OTM: % puts vs calls (>10 alcista, <-10 bajista). */
export function sesgoVolatilidad(
  opciones: Array<{ tipo: "Call" | "Put"; strike: number; iv: number | null }>,
  spot: number,
): number | null {
  const calls = opciones.filter((o) => o.tipo === "Call" && o.strike > spot && o.iv != null);
  const puts = opciones.filter((o) => o.tipo === "Put" && o.strike < spot && o.iv != null);
  if (calls.length === 0 || puts.length === 0) return null;
  const mc = calls.reduce((s, o) => s + (o.iv as number), 0) / calls.length;
  const mp = puts.reduce((s, o) => s + (o.iv as number), 0) / puts.length;
  return mc > 0 && mp > 0 ? (100 * (mp - mc)) / ((mp + mc) / 2) : null;
}
