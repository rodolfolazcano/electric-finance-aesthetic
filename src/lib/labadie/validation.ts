/**
 * Labadié — Validación 5 Stages (Statistical Arbitrage §148-217)
 * Walk-forward 60/20 + Monte Carlo synth OU+fBm Stage1
 */
import { runBacktest, analyzePair, simulateSyntheticSpread, simulateTrading, computeRollingStats } from "../statarb.math";
import type { BacktestConfig, BacktestGridResult } from "../statarb.types";
import { mean } from "../math/stats";

export function monteCarloStage1(
  hurst: number,
  syntheticTrades?: (seed: number) => number,
  sims = 5000,
): { meanPnl: number; winRate: number; sharpeSynth: number } {
  // Sin generador custom: Stage 1 canónico con sintéticos OU+fBm reales (no placeholder)
  if (!syntheticTrades) return monteCarloOU(hurst);
  const pnls: number[] = [];
  for (let i = 0; i < sims; i++) pnls.push(syntheticTrades(i));
  const m = mean(pnls);
  const wins = pnls.filter((p) => p > 0).length / Math.max(1, pnls.length);
  const st = Math.sqrt(pnls.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, pnls.length - 1)) || 1;
  return { meanPnl: m, winRate: wins * 100, sharpeSynth: m / st };
}

// Monte Carlo OU+fBm canónico (usar cuando no se pasa syntheticTrades custom)
export function monteCarloOU(
  hurst: number,
  mu = 0,
  theta = 0.1,
  sigma = 0.02,
  days = 252,
  sims = 2000,
  window = 20,
  entryA = 1.5,
  stopB = 2.5,
  beta = 1,
  txCost = 0.1,
): { meanPnl: number; winRate: number; sharpeSynth: number } {
  const H = Math.min(0.91, Math.max(0.25, hurst));
  const pnls: number[] = [];
  for (let s = 0; s < sims; s++) {
    const synth = simulateSyntheticSpread(theta, mu, sigma, days, 1 / 252, H);
    const spread = synth.map(p => p.value);
    // precios sintéticos: p1 = spread + beta*p2 ; p2 vol alrededor mu
    const p2 = synth.map((_, i) => 100 + Math.sin(i * 0.05) * 2);
    const p1 = spread.map((v, i) => v + beta * p2[i]);
    const dates = synth.map(p => p.date);
    const rolled = computeRollingStats(spread, window);
    const sim = simulateTrading(spread, dates, p1, p2, rolled.mean, rolled.std, entryA, stopB, beta, txCost);
    const trades = sim.trades;
    const total = trades.length ? trades[trades.length - 1].pnlCum : 0;
    pnls.push(total);
  }
  const m = mean(pnls);
  const wins = pnls.filter(p => p > 0).length / Math.max(1, pnls.length);
  const st = Math.sqrt(pnls.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, pnls.length - 1)) || 1;
  return { meanPnl: m, winRate: wins * 100, sharpeSynth: m / st };
}

// Walk-forward: ventana 60 train / 20 test deslizante
export function walkForwardLabdie(
  prices1: { date: string; close: number }[],
  prices2: { date: string; close: number }[],
  base: BacktestConfig,
  trainWindow = 252 * 0.6, // ~151 días
  testWindow = 252 * 0.2,  // ~50 días
): { folds: Array<{ train: BacktestGridResult; testSharpe: number; robust: boolean }>; avgRobustPct: number } {
  const alignedLen = Math.min(prices1.length, prices2.length);
  const folds: Array<{ train: BacktestGridResult; testSharpe: number; robust: boolean }> = [];
  let start = 0;
  while (start + trainWindow + testWindow <= alignedLen) {
    const p1train = prices1.slice(start, start + trainWindow);
    const p2train = prices2.slice(start, start + trainWindow);
    const train = runBacktest(p1train as any, p2train as any, base);
    // test usa optimal a,b del train
    const p1test = prices1.slice(start + trainWindow, start + trainWindow + testWindow);
    const p2test = prices2.slice(start + trainWindow, start + trainWindow + testWindow);
    const testRes = analyzePair(p1test as any, p2test as any, {
      asset1: base.asset1,
      asset2: base.asset2,
      period: base.period,
      interval: base.interval,
      window: base.window,
      entryThresh: train.optimal.a,
      stopThresh: train.optimal.b,
      capitalPerPair: base.capitalPerPair,
      txCost: base.txCost,
      pValue: base.pValue,
      marketImpactGamma: base.marketImpactGamma,
      participationRate: base.participationRate,
      executionAlgo: base.executionAlgo,
    } as any);
    const robust = testRes.performance.sharpe / Math.max(0.001, train.optimal.insample.sharpe) > 0.5;
    folds.push({ train, testSharpe: testRes.performance.sharpe, robust });
    start += testWindow; // step = testWindow (no overlap)
  }
  const pcts = folds.map((f) => (f.testSharpe / Math.max(0.001, f.train.optimal.insample.sharpe)) * 100);
  const avgRobustPct = pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : 0;
  return { folds, avgRobustPct };
}

// ── Shooting mean-reverting (memoire_master §5 eq.5.10) ─────────────────────
// Recursión: x_{n+1}= γ(1−γ)^{n−1}Uₙ + (1+ λ(1−γ)^{2n−2}Zₙ + Bₙ)xₙ − Bₙ·x_{n−1}
// con x₀=1, x_{N+1}=0, α=x₁ como parámetro libre. Hallar α* por bisección F(α)=x_{N+1}(α)=0.
export interface ShootingMRParams {
  N: number; // pasos (≤100)
  gamma: number; // mean-reversion ∈(0,1), ej 0.15 front-loading, 0.80 recto
  lambda: number; // aversión riesgo
  C0?: number; // spread inicial (default 0.1, ejemplo Matlab U=0.1)
  sigma?: number; // vol (default 0.02)
  eta?: number; // coef impacto κ (default 0.1)
}

export interface ShootingMRResult {
  curve: { step: number; x: number; volume: number }[]; // xₙ restos, volume = xₙ−x_{n+1}
  alphaStar: number;
  xNp1: number; // debe ser ≈0
  iterations: number;
}

function recurrenceMR(
  n: number,
  xN: number,
  xPrev: number,
  p: Required<ShootingMRParams>,
): number {
  const pow1 = Math.pow(1 - p.gamma, n - 1);
  const pow2 = Math.pow(1 - p.gamma, 2 * n - 2);
  // coeficientes simplificados uniformes (bₙ constante → Bₙ=1)
  const Un = (-p.C0 * p.sigma * p.sigma * p.eta) / 2;
  const Zn = p.sigma * p.sigma * p.eta;
  const Bn = 1;
  return p.gamma * pow1 * Un + (1 + p.lambda * pow2 * Zn + Bn) * xN - Bn * xPrev;
}

export function shootingMeanReverting(params: ShootingMRParams): ShootingMRResult {
  const p: Required<ShootingMRParams> = {
    N: Math.max(3, Math.min(100, Math.round(params.N))),
    gamma: Math.min(0.95, Math.max(0.01, params.gamma)),
    lambda: Math.max(0, params.lambda),
    C0: params.C0 ?? 0.1,
    sigma: params.sigma ?? 0.02,
    eta: params.eta ?? 0.1,
  };

  const evalAt = (alpha: number): { xs: number[]; xNp1: number } => {
    const xs: number[] = new Array(p.N + 2).fill(0);
    xs[0] = 1;
    xs[1] = alpha;
    for (let n = 1; n <= p.N; n++) {
      xs[n + 1] = recurrenceMR(n, xs[n]!, xs[n - 1]!, p);
    }
    return { xs, xNp1: xs[p.N + 1]! };
  };

  let lo = 0, hi = 1;
  let flo = evalAt(lo).xNp1; // F(0)<0, F(1)>0 garantizado ∀γ∈(0,1) (memoire §5)
  let fhi = evalAt(hi).xNp1;
  // si no hay cambio de signo (caso degenerado con impacto muy alto), ampliar rango
  let expand = 0;
  while (flo * fhi > 0 && expand < 10) {
    hi += 0.5;
    fhi = evalAt(hi).xNp1;
    expand++;
  }

  let alphaStar = 0.5;
  let iterations = 0;
  for (let iter = 0; iter < 60; iter++) {
    iterations = iter + 1;
    const mid = (lo + hi) / 2;
    const { xNp1 } = evalAt(mid);
    if (Math.abs(xNp1) < 1e-9) { alphaStar = mid; break; }
    alphaStar = mid;
    if (flo * xNp1 <= 0) { hi = mid; fhi = xNp1; } else { lo = mid; flo = xNp1; }
    if (hi - lo < 1e-9) break;
  }

  const { xs } = evalAt(alphaStar);
  const curve = xs.slice(0, p.N + 1).map((x, step) => ({
    step,
    x,
    volume: step < xs.length - 1 ? Math.max(0, x - xs[step + 1]!) : 0,
  }));
  // normalizar volúmenes a Σ=1
  const sumVol = curve.reduce((s, c) => s + c.volume, 0) || 1;
  for (const c of curve) c.volume /= sumVol;

  return { curve, alphaStar, xNp1: evalAt(alphaStar).xNp1, iterations };
}
