/**
 * Labadié — Market-Making Fodra-Labadie 1303.7177v2 §2-§4
 * Módulo canónico single-asset (HJB exacto ε=0 + perturbación inventario primer orden).
 * Source: extracted_text/1303.7177v2.txt
 */
import { linregress, mean, std } from "../math/stats";

// ─── 1. OU fitter AR(1) ────────────────────────────────────────────────
export interface OUFit { a: number; mu: number; sigma: number; phi: number; halfLife: number; r2: number }

export function fitOrnsteinUhlenbeck(prices: number[], dt = 1): OUFit | null {
  if (prices.length < 30) return null;
  const x = prices.slice(0, -1);
  const y = prices.slice(1);
  const reg = linregress(x, y);
  const phi = reg.slope;
  // stationarity: |phi|<1 and >-1; clamp
  if (phi <= 0 || phi >= 0.9999) return null;
  const a = -Math.log(phi) / dt;
  const mu = reg.intercept / (1 - phi);
  // residuals
  let ssRes = 0;
  for (let i = 0; i < x.length; i++) ssRes += (y[i]! - (reg.intercept + phi * x[i]!)) ** 2;
  const sigma = Math.sqrt(ssRes / Math.max(1, x.length - 1) / dt);
  const halfLife = Math.log(2) / Math.max(1e-9, a);
  // R2 from linregress if available, else compute
  const r2 = (reg as any).rSquared ?? (reg as any).r2 ?? 0;
  return { a, mu, sigma, phi, halfLife, r2 };
}

export function deltaOU(s: number, mu: number, a: number, tau: number): number {
  // Δ = (µ−s)(1−e^{−a·τ})  (§4 OU conditional expectation)
  if (!isFinite(a) || a <= 0) return 0;
  return (mu - s) * (1 - Math.exp(-a * tau));
}

// ─── 2. Cotizaciones óptimas Fodra-Labadie §3.6 ec.(24) + §3.8 ────────
export interface FLQuotesParams {
  s: number; q: number; t: number; T: number;
  k: number; A: number; z: number; sigma: number;
  eta: number; nu: number; epsilon: number;
  alphaFee?: number; // fee por share (§3.8); default 0
  delta?: number; // precomputed Δ; si omite usa OU fit *s*
  ouFit?: OUFit | null; // si provee, Δ se deriva de él
}

export interface FLQuotes {
  deltaAsk: number; deltaBid: number; psiStar: number; rStar: number;
  psiFee: number; gainPerSpread: number; piTilde: number; hBar: number;
  scalable: boolean; // scalping flag si ψ_fee ≤0 con rebate
  deltaUsed: number;
}

export function quotesFL(p: FLQuotesParams): FLQuotes {
  const { s, q, t, T, k, A, z, sigma, eta, nu, epsilon, alphaFee = 0, delta: deltaIn, ouFit } = p;
  const tau = Math.max(0, T - t);
  const Delta = deltaIn != null ? deltaIn : (ouFit ? deltaOU(s, ouFit.mu, ouFit.a, tau) : 0);
  const kEff = Math.max(0.05, k);
  const zBar = Math.max(0, z);
  const sig2 = Math.max(1e-9, sigma * sigma);
  // unitary inventory-risk penalty π̃ = η·z̄ + ν·σ̄²·τ
  const piTilde = eta * zBar + nu * sig2 * tau;
  // marginal profit H̄ ≈ (A/e) e^{−KZ} sinh(KΔ) with K≈k
  const Hbar = (A / Math.E) * Math.exp(-kEff * zBar) * Math.sinh(kEff * Delta);
  // §3.6 ec.(24)
  let deltaAsk = 1 / kEff + Delta + epsilon * (-Hbar * tau + (1 - 2 * q) * piTilde);
  let deltaBid = 1 / kEff - Delta + epsilon * ( Hbar * tau + (1 + 2 * q) * piTilde);
  // fee shift §3.8 ec.(26): ψ_α = ψ* +2α
  deltaAsk += alphaFee;
  deltaBid += alphaFee;
  const psiStar = 2 / kEff + 2 * epsilon * piTilde;
  const psiFee = psiStar + 2 * alphaFee;
  const rStar = s + Delta - epsilon * Hbar * tau + 2 * q * piTilde * epsilon;
  const gainPerSpread = psiFee - 2 * alphaFee; // constant = ψ*
  return { deltaAsk, deltaBid, psiStar, rStar, psiFee, gainPerSpread, piTilde, hBar: Hbar, scalable: psiFee <= 0, deltaUsed: Delta };
}

// ─── 3. Simulador intensidad Poisson (§1) ──────────────────────────────
export interface MMSimParams {
  k: number; A: number; z: number; eta: number; nu: number; epsilon: number; alphaFee: number;
  maxQ?: number; dtHours?: number; T?: number; // T horizon for Δ
}

export interface MMSimStep { t: number; s: number; q: number; cash: number; bid: number; ask: number; fill?: "buy"|"sell" }

function poissonFill(lambda: number, dt: number): boolean {
  if (lambda <= 0 || dt <= 0) return false;
  // P = 1 - exp(-λ·dt)
  return Math.random() < 1 - Math.exp(-lambda * dt);
}

export function simulateMMIntensity(
  midPrices: number[], // S(t) path
  ouFit: OUFit | null,
  params: MMSimParams,
  qty: number = 1, // shares por fill
): { steps: MMSimStep[]; finalQ: number; pnl: number; fills: number; maxQAbs: number } {
  const { k, A, z, eta, nu, epsilon, alphaFee, maxQ = 50, dtHours = 1/60, T } = params;
  const horizon = T ?? midPrices.length * dtHours;
  let q = 0, cash = 0;
  const steps: MMSimStep[] = [];
  let maxQAbs = 0;
  let fills = 0;
  for (let i = 0; i < midPrices.length; i++) {
    const s = midPrices[i]!;
    const t = i * dtHours;
    const tau = Math.max(0, horizon - t);
    const Delta = ouFit ? deltaOU(s, ouFit.mu, ouFit.a, tau) : 0;
    const qu = quotesFL({ s, q, t, T: horizon, k, A, z, sigma: ouFit?.sigma ?? 0.5, eta, nu, epsilon, alphaFee, delta: Delta });
    const bid = qu.rStar - qu.psiFee / 2;
    const ask = qu.rStar + qu.psiFee / 2;
    // intensities
    const lambdaBuy  = A * Math.exp(-k * (z + qu.deltaAsk)); // our ask hit by buy market order → we sell (q--)
    const lambdaSell = A * Math.exp(-k * (z + qu.deltaBid)); // our bid hit by sell → we buy (q++)
    let fill: "buy"|"sell"|undefined;
    if (poissonFill(lambdaBuy, dtHours) && q > -maxQ) { cash += (s + qu.deltaAsk) * qty - (alphaFee>0? alphaFee*qty:0); q -= qty; fills++; fill = "sell"; }
    if (poissonFill(lambdaSell, dtHours) && q < maxQ) { cash -= (s - qu.deltaBid) * qty + (alphaFee>0? alphaFee*qty:0); q += qty; fills++; fill = fill?"buy": "buy"; }
    maxQAbs = Math.max(maxQAbs, Math.abs(q));
    steps.push({ t, s, q, cash, bid, ask, fill });
  }
  const pnl = cash + (midPrices[midPrices.length-1] ?? 0) * (steps[steps.length-1]?.q ?? 0);
  return { steps, finalQ: q, pnl, fills, maxQAbs };
}

// ─── 4. Monte Carlo PnL density (§4) ──────────────────────────────────
export interface MCStats { mean: number; std: number; skew: number; kurt: number; var95: number; sharpe: number; min: number; max: number; median: number }

function mcStats(pnls: number[]): MCStats {
  if (!pnls.length) return { mean: 0, std: 0, skew: 0, kurt: 0, var95: 0, sharpe: 0, min: 0, max: 0, median: 0 };
  const m = mean(pnls);
  const s = std(pnls) || 1;
  const sorted = [...pnls].sort((a,b)=>a-b);
  const var95 = sorted[Math.floor(0.05*sorted.length)] ?? sorted[0]!;
  const skew = pnls.reduce((acc,v)=>acc+((v-m)/s)**3,0)/pnls.length;
  const kurt = pnls.reduce((acc,v)=>acc+((v-m)/s)**4,0)/pnls.length - 3;
  return { mean: m, std: s, skew, kurt, var95, sharpe: s>0? m/s : 0, min: sorted[0]!, max: sorted[sorted.length-1]!, median: sorted[Math.floor(sorted.length/2)]! };
}

export function runMonteCarloFL(
  nPaths: number,
  midPathGen: (pathIdx: number) => number[], // genera S(t) path
  ouFit: OUFit | null,
  params: MMSimParams,
): { martingale: MCStats; ouDrift: MCStats; pnlPaths: number[]; martingalePaths: number[] } {
  const pnls: number[] = [];
  for (let p=0;p<nPaths;p++) {
    const path = midPathGen(p);
    const r = simulateMMIntensity(path, ouFit, params);
    pnls.push(r.pnl);
  }
  // martingale baseline: misma simulación con ouFit=null (Δ≡0)
  const pnlsM: number[] = [];
  for (let p=0;p<nPaths;p++) {
    const path = midPathGen(p);
    const r = simulateMMIntensity(path, null, params);
    pnlsM.push(r.pnl);
  }
  return { martingale: mcStats(pnlsM), ouDrift: mcStats(pnls), pnlPaths: pnls, martingalePaths: pnlsM };
}

// ─── 5. Multi-activo §5 (Fase 2) ──────────────────────────────────────────
export function multiAssetQuotes(params: {
  assets: Array<{ s: number; q: number; k: number; A: number; z: number; sigma: number; alphaFee?: number; delta?: number; ouFit?: OUFit | null }>;
  Omega?: number[][]; Lambda?: number[][]; t: number; T: number; eta: number; nu: number; epsilon: number;
}): { perAsset: Array<{ deltaAsk: number; deltaBid: number; psiStar: number; rStar: number; piDiag: number }>; piTilde: number[][] } {
  const { assets, Omega, Lambda, t, T, eta, nu, epsilon } = params; const M=assets.length; const tau=Math.max(0,T-t);
  const piTilde: number[][] = Array.from({length:M}, (_,i)=> Array.from({length:M}, (_,j)=>{ const om=Omega?.[i]?.[j] ?? (i===j?0.5:0); const lam=Lambda?.[i]?.[j] ?? (i===j?0.25:0); return eta*om + nu*lam*tau; }));
  const perAsset = assets.map((a,i)=>{ const s=a.s, q=a.q, k=Math.max(0.05,a.k), A=a.A, z=a.z, sigma=a.sigma, alpha=a.alphaFee??0; const Delta=a.delta ?? (a.ouFit? deltaOU(s, a.ouFit.mu, a.ouFit.a, tau):0); const piDiag=piTilde[i]?.[i]??0; let cross=0; for(let j=0;j<M;j++) cross+=(piTilde[i]?.[j]??0)*(assets[j]?.q??0); const Hbar=(A/Math.E)*Math.exp(-k*z)*Math.sinh(k*Delta); const psiStar=2/k + 2*epsilon*piDiag; const rStar=s+Delta - epsilon*Hbar*tau + 2*epsilon*cross; const deltaAsk=1/k + Delta + epsilon*(-Hbar*tau + piDiag -2*cross +2*q*piDiag)+alpha; const deltaBid=1/k - Delta + epsilon*( Hbar*tau + piDiag +2*cross +2*q*piDiag)+alpha; return { deltaAsk, deltaBid, psiStar, rStar: rStar+alpha, piDiag }; });
  return { perAsset, piTilde };
}
export function isoRiskEllipse(params: { Omega: number[][]; c: number; points?: number; rhoOverride?: number }): Array<{ w1:number; w2:number }> {
  const c=Math.max(1e-9, params.c); const pts=params.points??64; const rho=params.rhoOverride ?? (params.Omega?.[0]?.[1]??0);
  const out: Array<{w1:number;w2:number}>=[]; for(let i=0;i<pts;i++){ const th=2*Math.PI*i/pts; const cos=Math.cos(th), sin=Math.sin(th); const l1=Math.sqrt(c/(1+rho)), l2=Math.sqrt(c/Math.max(1e-6,1-rho)); const w1=(l1*cos + l2*sin)/Math.sqrt(2); const w2=(l1*cos - l2*sin)/Math.sqrt(2); out.push({w1,w2}); } return out;
}

// ─── 5. Fórmulas cerradas Fodra-Labadie Teoremas 1,2,4 (forma exponencial) ──
// Fuente: High-frequency market-making with inventory constraints (§3-§4)
// Caso ABM con drift b: dS = b·dt + σdW, τ=T−t, γ=aversión, η=penalización inventario
export function quotesExponencialABM(params: {
  s: number; q: number; t: number; T: number; k: number; gamma: number; eta: number; sigma: number; b: number;
}): { deltaAsk: number; deltaBid: number; psiStar: number; rStar: number } {
  const { s, q, t, T, k, gamma, eta, sigma, b } = params;
  const tau = Math.max(0, T - t);
  const kEff = Math.max(0.05, k);
  const g = Math.max(1e-9, gamma);
  const base = (1 / g) * Math.log(1 + g / kEff);
  const sig2 = sigma * sigma;
  const psiStar = (2 / g) * Math.log(1 + g / kEff) + 2 * eta + g * sig2 * tau;
  const mid = base + eta + (g * sig2 * tau) / 2;
  const bracket = b * tau - q * (2 * eta + g * sig2 * tau);
  const deltaAsk = mid + bracket;
  const deltaBid = mid - bracket;
  const rStar = s + b * tau - q * (2 * eta + g * sig2 * tau);
  return { deltaAsk, deltaBid, psiStar, rStar };
}

// Caso OU: dS = a(µ−S)dt + σdW, E[S(T)]= s·e^{−aτ}+µ(1−e^{−aτ})
export function quotesExponencialOU(params: {
  s: number; q: number; t: number; T: number; k: number; gamma: number; eta: number; sigma: number; a: number; mu: number;
}): { deltaAsk: number; deltaBid: number; psiStar: number; rStar: number; theta2: number; expectedS: number } {
  const { s, q, t, T, k, gamma, eta, sigma, a, mu } = params;
  const tau = Math.max(0, T - t);
  const kEff = Math.max(0.05, k);
  const g = Math.max(1e-9, gamma);
  const aa = Math.max(1e-9, a);
  const base = (1 / g) * Math.log(1 + g / kEff);
  const sig2 = sigma * sigma;
  const exp1 = Math.exp(-aa * tau);
  const exp2 = Math.exp(-2 * aa * tau);
  const expectedS = s * exp1 + mu * (1 - exp1);
  const theta2 = -eta - (g * sig2 / (4 * aa)) * (1 - exp2);
  const psiStar = (2 / g) * Math.log(1 + g / kEff) - 2 * theta2;
  const mid = base - theta2;
  const bracket = (mu - s) * (1 - exp1) - q * (2 * eta + (g * sig2 / (2 * aa)) * (1 - exp2));
  const deltaAsk = mid + bracket;
  const deltaBid = mid - bracket;
  const rStar = expectedS - q * (2 * eta + (g * sig2 / (2 * aa)) * (1 - exp2));
  return { deltaAsk, deltaBid, psiStar, rStar, theta2, expectedS };
}

// Teorema 1 — utilidad lineal sin penalización (φ=x+qs): spread mínimo
export function quotesLinealSinPenalizacion(params: { s: number; expectedS: number; k: number }): { deltaAsk: number; deltaBid: number; psiStar: number; rStar: number } {
  const { s, expectedS, k } = params;
  const kEff = Math.max(0.05, k);
  const delta = expectedS - s;
  return { deltaAsk: delta / kEff, deltaBid: -delta / kEff, psiStar: 2 / kEff, rStar: expectedS };
}

// Teorema 2 — utilidad lineal con penalización cuadrática η
export function quotesLinealConPenalizacion(params: { s: number; expectedS: number; q: number; k: number; eta: number }): { deltaAsk: number; deltaBid: number; psiStar: number; rStar: number } {
  const { s, expectedS, q, k, eta } = params;
  const kEff = Math.max(0.05, k);
  const delta = expectedS - s;
  return {
    deltaAsk: 1 / kEff + eta + (delta - 2 * q * eta),
    deltaBid: 1 / kEff + eta - (delta - 2 * q * eta),
    psiStar: 2 / kEff + 2 * eta,
    rStar: expectedS - 2 * q * eta,
  };
}




