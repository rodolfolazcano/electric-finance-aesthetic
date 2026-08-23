/**
 * Labadié — Validación 5 Stages (Statistical Arbitrage §148-217)
 * Walk-forward 60/20 + Monte Carlo synth OU+fBm Stage1
 */
import { runBacktest, analyzePair } from "../statarb.math";
import type { BacktestConfig, BacktestGridResult } from "../statarb.types";
import { mean } from "../math/stats";

// Stage1: Monte Carlo synth spread OU con Hurst H (self-similar)
export function monteCarloStage1(
  hurst: number,
  syntheticTrades: (seed: number) => number, // placeholder: retorna PnL sintético
  sims = 5000,
): { meanPnl: number; winRate: number; sharpeSynth: number } {
  void hurst;
  const pnls: number[] = [];
  for (let i = 0; i < sims; i++) pnls.push(syntheticTrades(i));
  const m = mean(pnls);
  const wins = pnls.filter((p) => p > 0).length / Math.max(1, pnls.length);
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
