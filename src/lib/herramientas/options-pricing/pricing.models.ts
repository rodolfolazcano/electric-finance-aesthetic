import type { OptionType, PricingInput, Greeks, DividendInfo } from "./options.types";

// ─── Dividend adjustment ─────────────────────────────────────────────

export function ajustarPrecioPorDividendos(
  S: number,
  dividendos: DividendInfo[],
  fechaVencimiento: string,
  r: number,
): number {
  if (!dividendos || dividendos.length === 0) return S;
  const now = new Date();
  const expiry = new Date(`${fechaVencimiento}T00:00:00Z`);
  let ajuste = 0;
  for (const div of dividendos) {
    const fechaPago = new Date(`${div.fecha}T00:00:00Z`);
    if (fechaPago > now && fechaPago <= expiry) {
      const dias = (fechaPago.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      const T = dias / 365;
      ajuste += div.monto * Math.exp(-r * T);
    }
  }
  return S - ajuste;
}

// ─── Normal CDF / PDF (Abramowitz & Stegun approximation) ────────────

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * y);
}

// ─── Black-Scholes ────────────────────────────────────────────────────

export interface BlackScholesResult {
  premium: number;
  greeks: Greeks;
  probITM: number;
}

export function blackScholes(input: PricingInput): BlackScholesResult | null {
  const { tipo, S, K, T, r, sigma, q = 0 } = input;
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return null;

  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const N_minus_d1 = normCdf(-d1);
  const N_minus_d2 = normCdf(-d2);
  const nd1 = normPdf(d1);

  let premium: number;
  let delta: number;
  let probITM: number;

  if (tipo === "Call") {
    premium = S * Math.exp(-q * T) * Nd1 - K * Math.exp(-r * T) * Nd2;
    delta = Math.exp(-q * T) * Nd1;
    probITM = Nd2;
  } else {
    premium = K * Math.exp(-r * T) * N_minus_d2 - S * Math.exp(-q * T) * N_minus_d1;
    delta = Math.exp(-q * T) * (Nd1 - 1);
    probITM = N_minus_d2;
  }

  // Greeks formulas (B&S with dividend yield q)
  const gamma = (Math.exp(-q * T) * nd1) / (S * sigma * Math.sqrt(T));
  const vega = S * Math.exp(-q * T) * nd1 * Math.sqrt(T);
  const thetaCall =
    (-S * Math.exp(-q * T) * nd1 * sigma) / (2 * Math.sqrt(T)) -
    r * K * Math.exp(-r * T) * Nd2 +
    q * S * Math.exp(-q * T) * Nd1;
  const thetaPut =
    (-S * Math.exp(-q * T) * nd1 * sigma) / (2 * Math.sqrt(T)) +
    r * K * Math.exp(-r * T) * N_minus_d2 -
    q * S * Math.exp(-q * T) * N_minus_d1;
  const theta = (tipo === "Call" ? thetaCall : thetaPut) / 252; // daily theta
  const rho =
    tipo === "Call" ? K * T * Math.exp(-r * T) * Nd2 : -K * T * Math.exp(-r * T) * N_minus_d2;

  return {
    premium,
    probITM,
    greeks: { delta, gamma, vega, theta, rho },
  };
}

// ─── Binomial (American & European) ────────────────────────────────────

export function binomial(
  tipo: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  N: number,
  q = 0,
  americana = true,
): number | null {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0 || N <= 0) return null;

  const dt = T / N;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp((r - q) * dt) - d) / (u - d);
  const disc = Math.exp(-r * dt);

  if (p <= 0 || p >= 1) return null;

  // Build asset prices at maturity
  const prices = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    prices[i] = S * Math.pow(u, N - i) * Math.pow(d, i);
  }

  // Payoff at maturity
  const values = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    values[i] = tipo === "Call" ? Math.max(0, prices[i] - K) : Math.max(0, K - prices[i]);
  }

  // Backward induction
  for (let j = N - 1; j >= 0; j--) {
    for (let i = 0; i <= j; i++) {
      values[i] = disc * (p * values[i] + (1 - p) * values[i + 1]);
      if (americana) {
        const S_ij = S * Math.pow(u, j - i) * Math.pow(d, i);
        const exercise = tipo === "Call" ? Math.max(0, S_ij - K) : Math.max(0, K - S_ij);
        values[i] = Math.max(values[i], exercise);
      }
    }
  }

  return values[0];
}

// ─── Utils ────────────────────────────────────────────────────────────

export function normalCdf(x: number): number {
  return normCdf(x);
}

export function normalPdf(x: number): number {
  return normPdf(x);
}
