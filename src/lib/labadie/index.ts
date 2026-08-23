/**
 * Labadié — índice canónico.
 * Re-exporta el núcleo ya implementado sin duplicar código.
 * Fuente papers: pt/labadie/labadie/{Statistical-Arbitrage,Market-Microstructure,Algorithmic-Trading,High-Frequency-Trading,Optimisation,Machine-Learning}
 * Identidad central: p = 1/H (1205.3482v6 §3.2)
 */

// StatArb núcleo (StatArb §2-4)
export {
  alignPairPrices,
  computeADF,
  computeRollingStats,
  simulateTrading,
  computePerformance,
  analyzePair,
  computePnLHistogram,
  simulateSyntheticSpread,
  simularEulerSDE,
  computeNeighborRobustness,
  runBacktest,
} from "../statarb.math";
export type { PairConfig, PairAnalysisResult, PairPerformance, BacktestConfig, BacktestGridResult } from "../statarb.types";

// Stats puros Labadié §3.2
export { computeHurst, impliedPFromReturns, computePVariance, fractionalBrownianMotion, linregress, pearsonR, mean, std } from "../math/stats";

// CAPM p-variance
export { computeBetaPVariance } from "../capm-hedge.math";
export { analizarCAPM } from "../capm-engine";

// Nuevos módulos Labadié (extensiones ordenadas)
export * from "./execution-curve";
export * from "./microstructure";
export * from "./spectral";
export * from "./validation";
