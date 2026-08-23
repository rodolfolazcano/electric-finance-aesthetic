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
