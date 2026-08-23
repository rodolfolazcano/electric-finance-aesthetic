/**
 * Labadié — Microestructura Kyle (1985) & Glosten-Milgrom (1985)
 * market-microstructure-and-price-formation.pdf
 * Bottom-up empírico vs EMT top-down.
 */

// Kyle: λ = ½√(Σ0/σ²u), β = √(σ²u/Σ0)
// Σ0 = var valor fundamental, σ²u = var flujo ruido
export function kyleLambda(sigma0: number, sigmaU: number): number {
  if (sigmaU <= 0) return 0;
  return 0.5 * Math.sqrt((sigma0 * sigma0) / (sigmaU * sigmaU));
}
export function kyleBeta(sigma0: number, sigmaU: number): number {
  if (sigma0 <= 0) return 0;
  return Math.sqrt((sigmaU * sigmaU) / (sigma0 * sigma0));
}
export function kyleRevelacion(sigma0: number, sigmaU: number): { lambda: number; beta: number; halfInfoRevealed: boolean } {
  const lambda = kyleLambda(sigma0, sigmaU);
  const beta = kyleBeta(sigma0, sigmaU);
  return { lambda, beta, halfInfoRevealed: true }; // Kyle: se revela mitad de la info en el precio
}

// Glosten-Milgrom: P[V+|Buy], spreads Bayesianos — implementación exacta Labadié market-microstructure §3
// V ∈ {V-, V+} equiprobable θ=0.5, informed Buy si V+ / Sell si V-, uninformed 50/50
// params: probInformed = µ (§descripcion: µ prob informed), gammaBuy/gammaSell para uninformed, theta prob good news
export interface GlostenMilgromParams { Vminus: number; Vplus: number; probInformed?: number; theta?: number; gammaBuy?: number; gammaSell?: number }
export function glostenMilgrom(params: GlostenMilgromParams): {
  ask: number; bid: number; spread: number; pPosteriorBuy: number; pPosteriorSell: number;
} {
  const { Vminus, Vplus, probInformed: mu = 0.5, theta = 0.5, gammaBuy: gB = 0.5, gammaSell: gS = 0.5 } = params;
  // P[B|V+] = µ*1 + (1-µ)*gB ; P[B|V-] = µ*0 + (1-µ)*gB (paper eq. 8)
  const pB_given_Vplus = mu * 1 + (1 - mu) * gB;
  const pB_given_Vminus = mu * 0 + (1 - mu) * gB;
  const pS_given_Vplus = mu * 0 + (1 - mu) * gS;
  const pS_given_Vminus = mu * 1 + (1 - mu) * gS;
  // P[B] = P[B|V+]θ + P[B|V-](1-θ)
  const pB = pB_given_Vplus * theta + pB_given_Vminus * (1 - theta);
  const pS = pS_given_Vplus * theta + pS_given_Vminus * (1 - theta);
  // Bayes: P[V+|B] = P[B|V+]θ / P[B]
  const pPosteriorBuy = pB > 0 ? (pB_given_Vplus * theta) / pB : 0.75;
  const pPosteriorSellGood = pS > 0 ? (pS_given_Vplus * theta) / pS : 0.25; // P[V+|S]
  const pPosteriorSell = 1 - pPosteriorSellGood;
  const ask = pPosteriorBuy * Vplus + (1 - pPosteriorBuy) * Vminus;
  const bid = pPosteriorSellGood * Vplus + (1 - pPosteriorSellGood) * Vminus;
  // Caso canónico Labadié: V+=100 V-=20 θ=μ=gB=gS=0.5 → P[V+|B]=0.75 ask 80 bid 40 — verifica
  return { ask, bid, spread: ask - bid, pPosteriorBuy, pPosteriorSell: pPosteriorSellGood };
}

// Spread relativo como métrica de liquidez (Financial Zoology: spread=ask-bid proxy)
export function spreadRelativo(ask: number, bid: number, mid?: number): number {
  const m = mid ?? (ask + bid) / 2;
  if (m <= 0) return 0;
  return (ask - bid) / m;
}
