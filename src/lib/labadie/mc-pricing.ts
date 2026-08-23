/**
 * Labadié — Monte Carlo pricing de opciones (stochastic_processes.pdf + dunbar Black-Scholes)
 * GBM exacto S(T)=S0·exp[(r−q−σ²/2)T+σ√T·Z] y Euler para SDEs genéricas.
 * Variables antitéticas + IC95% [μ±1.96σ/√n].
 * Valida contra BS cerrado con <1% error para nSims≥50000.
 */
import { mean, std, randomNormal } from "../math/stats";

export type TipoOpcion = "call" | "put" | "Call" | "Put";

export interface MCPricingParams {
  S: number;
  K: number;
  T: number; // años (ej 30/365)
  r: number; // tasa libre riesgo continua
  sigma: number;
  q?: number; // dividend yield continuo
  tipo: TipoOpcion;
  nSims?: number; // default 20000
  useAntithetic?: boolean; // default true
  seed?: number; // si se provee usa LCG determinístico
  nSteps?: number; // pasos Euler; 1=exacto GBM terminal (default)
}

export interface MCPricingResult {
  precio: number;
  errorStd: number;
  ic95: [number, number];
  nSims: number;
  payoffs: number[]; // para histograma externo
}

// LCG determinístico para tests reproducibles
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function boxMuller(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Euler step genérico: dS = mu(S,t)dt + sigma(S,t) dW
export function eulerStep(
  S: number,
  dt: number,
  mu: (s: number, t: number) => number,
  sigma: (s: number, t: number) => number,
  t: number,
  Z: number,
): number {
  return S + mu(S, t) * dt + sigma(S, t) * Math.sqrt(dt) * Z;
}

export function simularGBMPath(
  S0: number,
  mu: number,
  sigma: number,
  T: number,
  nSteps: number,
  rng: () => number,
): number[] {
  const dt = T / Math.max(1, nSteps);
  const path: number[] = [S0];
  let s = S0;
  let t = 0;
  for (let i = 0; i < nSteps; i++) {
    const Z = boxMuller(rng);
    // exacto GBM por paso para estabilidad: S(t+dt)=S(t)·exp[(mu−σ²/2)dt+σ√dt·Z]
    s = s * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * Z);
    // alternativa Euler: s = eulerStep(s, dt, (x)=>mu*x, (x)=>sigma*x, t, Z);
    t += dt;
    path.push(s);
  }
  return path;
}

export function simularOUPath(
  S0: number,
  mu: number,
  a: number,
  sigma: number,
  T: number,
  nSteps: number,
  rng: () => number,
): number[] {
  const dt = T / Math.max(1, nSteps);
  const path: number[] = [S0];
  let s = S0;
  for (let i = 0; i < nSteps; i++) {
    const Z = boxMuller(rng);
    s = s + a * (mu - s) * dt + sigma * Math.sqrt(dt) * Z;
    path.push(s);
  }
  return path;
}

export function mcPrecioOpcion(params: MCPricingParams): MCPricingResult {
  const {
    S, K, T, r, sigma, q = 0, tipo,
    nSims = 20000,
    useAntithetic = true,
    seed,
    nSteps = 1,
  } = params;

  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) {
    return { precio: 0, errorStd: 0, ic95: [0, 0], nSims, payoffs: [] };
  }
  const isCall = tipo.toLowerCase() === "call";
  const rngBase = seed != null ? makeRng(seed) : Math.random;
  // si antitéticas, nSims pares
  const nPairs = useAntithetic ? Math.floor(nSims / 2) : nSims;
  const payoffs: number[] = [];
  const drift = r - q - 0.5 * sigma * sigma;
  const volSqrtT = sigma * Math.sqrt(T);

  if (nSteps <= 1) {
    // terminal exacto — antitéticas por par
    for (let i = 0; i < nPairs; i++) {
      const Z = seed != null ? boxMuller(rngBase as () => number) : randomNormal();
      const ST1 = S * Math.exp(drift * T + volSqrtT * Z);
      const ST2 = useAntithetic ? S * Math.exp(drift * T + volSqrtT * (-Z)) : null;
      const payoff1 = isCall ? Math.max(0, ST1 - K) : Math.max(0, K - ST1);
      payoffs.push(payoff1 * Math.exp(-r * T));
      if (ST2 != null) {
        const payoff2 = isCall ? Math.max(0, ST2 - K) : Math.max(0, K - ST2);
        payoffs.push(payoff2 * Math.exp(-r * T));
      }
    }
    // si nSims impar con antitéticas, un extra sin par
    if (useAntithetic && payoffs.length < nSims) {
      const Z = seed != null ? boxMuller(rngBase as () => number) : randomNormal();
      const ST = S * Math.exp(drift * T + volSqrtT * Z);
      const payoff = isCall ? Math.max(0, ST - K) : Math.max(0, K - ST);
      payoffs.push(payoff * Math.exp(-r * T));
    }
  } else {
    const dt = T / nSteps;
    const sqrtDt = Math.sqrt(dt);
    for (let i = 0; i < nPairs; i++) {
      const Z1: number[] = [];
      const Z2: number[] = [];
      for (let k = 0; k < nSteps; k++) {
        const z = seed != null ? boxMuller(rngBase as () => number) : randomNormal();
        Z1.push(z);
        if (useAntithetic) Z2.push(-z);
      }
      let s1 = S, s2 = S;
      for (let k = 0; k < nSteps; k++) {
        s1 = s1 * Math.exp(drift * dt + sigma * sqrtDt * (Z1[k]!));
        if (useAntithetic) s2 = s2 * Math.exp(drift * dt + sigma * sqrtDt * (Z2[k]!));
      }
      payoffs.push((isCall ? Math.max(0, s1 - K) : Math.max(0, K - s1)) * Math.exp(-r * T));
      if (useAntithetic) payoffs.push((isCall ? Math.max(0, s2 - K) : Math.max(0, K - s2)) * Math.exp(-r * T));
    }
    if (useAntithetic && payoffs.length < nSims) {
      let s = S;
      for (let k = 0; k < nSteps; k++) {
        const z = seed != null ? boxMuller(rngBase as () => number) : randomNormal();
        s = s * Math.exp(drift * dt + sigma * sqrtDt * z);
      }
      payoffs.push((isCall ? Math.max(0, s - K) : Math.max(0, K - s)) * Math.exp(-r * T));
    }
  }

  const m = mean(payoffs);
  const s = std(payoffs, true);
  const n = payoffs.length;
  const se = n > 1 ? s / Math.sqrt(n) : 0;
  const ic95: [number, number] = [m - 1.96 * se, m + 1.96 * se];
  return { precio: m, errorStd: se, ic95, nSims: n, payoffs };
}

// helper para IC de Monte Carlo sin recalcular precio
export function mcIC95(payoffs: number[]): [number, number] {
  if (payoffs.length === 0) return [0, 0];
  const m = mean(payoffs);
  const s = std(payoffs, true);
  const se = s / Math.sqrt(payoffs.length);
  return [m - 1.96 * se, m + 1.96 * se];
}
