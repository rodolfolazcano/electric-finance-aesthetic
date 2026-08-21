// @ts-nocheck
export type DataInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "1d";

export function annualizationFactor(interval: DataInterval): number {
  switch (interval) {
    case "1m":
      return 252 * 390;
    case "5m":
      return 252 * 78;
    case "15m":
      return 252 * 26;
    case "30m":
      return 252 * 13;
    case "1h":
      return 252 * 6.5;
    case "1d":
      return 252;
    default:
      return 252;
  }
}

const INTERVAL_PERIODS: Record<DataInterval, number> = {
  "1m": 1 / 390,
  "5m": 5 / 390,
  "15m": 15 / 390,
  "30m": 30 / 390,
  "1h": 60 / 390,
  "1d": 1,
};

export function intervalLabel(i: DataInterval): string {
  switch (i) {
    case "1m":
      return "1 min";
    case "5m":
      return "5 min";
    case "15m":
      return "15 min";
    case "30m":
      return "30 min";
    case "1h":
      return "1 hora";
    case "1d":
      return "Diario";
  }
}

export interface PairConfig {
  asset1: string;
  asset2: string;
  period: number;
  interval: DataInterval;
  window: number;
  entryThresh: number;
  stopThresh: number;
  capitalPerPair: number;
  txCost: number;
  inSampleRatio?: number;
  // ─── Labadie: p-variance risk measure (paper §3.2) ───
  /** p para p-variance. p=2 → varianza clásica; p≠2 → riesgo generalizado (Labadie §3.2, p=1/H) */
  pValue?: number;
  // ─── Labadie: Market Impact Model (paper §2.1) ───
  /** γ: exponente de impacto de mercado. Típico 0.3–0.7. I(v) = sign(v) × σ × |v/V|^γ × τ^(1/p) */
  marketImpactGamma?: number;
  /** Participación sobre volumen total del período (v/V). Default 0.1 (10%) */
  participationRate?: number;
  // ─── Labadie: Target Close / Implementation Shortfall (paper §2.3–2.4) ───
  /** "pairs" = clásico Z-score; "tc" = Target Close; "is" = Implementation Shortfall */
  executionAlgo?: "pairs" | "tc" | "is";
  /** σ: volatilidad anualizada para el modelo de ejecución óptima */
  volatility?: number;
}

export interface TradeSignal {
  date: string;
  type: "entry_long" | "entry_short" | "exit_tp" | "exit_sl";
  entryPrice1: number;
  entryPrice2: number;
  exitPrice1?: number;
  exitPrice2?: number;
  zscore: number;
  pnl?: number;
  pnlCum?: number;
  duration?: number;
}

export interface Trade {
  entryDate: string;
  exitDate: string;
  type: "long" | "short";
  entryZ: number;
  exitZ: number;
  pnl: number;
  pnlCum: number;
  duration: number;
}

export interface PairAnalysisResult {
  asset1: string;
  asset2: string;
  correlation: number;
  beta: number;
  r2: number;
  adfStat: number;
  adfPValue: number;
  isCointegrated: boolean;
  normalizedPrices: { date: string; a1: number; a2: number }[];
  spread: {
    date: string;
    value: number;
    mean: number;
    upper: number;
    lower: number;
    upperSl: number;
    lowerSl: number;
  }[];
  zScore: { date: string; value: number }[];
  signals: TradeSignal[];
  trades: Trade[];
  performance: PairPerformance;
  inSamplePerformance?: PairPerformance;
  outOfSamplePerformance?: PairPerformance;
  splitDate?: string;
  pnlHistogram?: { binStart: number; binEnd: number; count: number }[];
  correlationBreakdown?: { current: number; historical: number; isBreaking: boolean };
  // ─── Labadie: Hurst exponent + p-variance (paper §3.2) ───
  hurstExponent?: number;
  pVarianceUsed?: number;
  /** implied p = 1/H (identidad del paper §3.2). H=0.5 → p=2 (random walk) */
  impliedP?: number;
  /** implied p por regresión (paper §4 eq.21): p ≈ 2.35 + 0.14×MI − 1.79×σ */
  impliedPRegression?: number;
  /** p estimado por regresión multi-escala §4.3 (momentos absolutos log-log) */
  impliedPFromReturns?: number;
  // ─── Labadie: Optimal execution curve (paper §2.3–2.5) ───
  optimalStartPct?: number;   // % del período donde empezar a ejecutar (TC)
  optimalStopPct?: number;    // % del período donde dejar de ejecutar (IS)
  // ─── Labadie: Trading curve (TC/IS) ───
  tradingCurve?: { step: number; volume: number; cumulative: number }[];
}

export interface PairPerformance {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpe: number;
  avgDuration: number;
  // ─── Labadie: p-variance Sharpe (paper §3.2) ───
  pSharpe?: number;          // Sharpe usando p-variance como risk measure
  pVariance?: number;        // Valor de E[|r-μ|^p]
  pValueUsed?: number;       // p usado (default 2)
  // ─── Labadie: Optimal starting/stopping times (paper §2.5–2.7) ───
  optimalStartTime?: number; // Fracción [0,1] del período donde TC empieza
  optimalStopTime?: number;  // Fracción [0,1] del período donde IS termina
}

export interface BacktestConfig {
  asset1: string;
  asset2: string;
  period: number;
  interval: DataInterval;
  window: number;
  capitalPerPair: number;
  txCost: number;
  insamplePct: number;
  aMin: number;
  aMax: number;
  aStep: number;
  bMin: number;
  bMax: number;
  bStep: number;
  metric: "sharpe" | "pnl" | "winrate" | "maxdd" | "psharpe";
  // ─── Labadie: p-variance para backtest ───
  pValue?: number;
  marketImpactGamma?: number;
  participationRate?: number;
  executionAlgo?: "pairs" | "tc" | "is";
}

export interface BacktestGridResult {
  grid: Array<{
    a: number;
    b: number;
    sharpe: number;
    pnl: number;
    winRate: number;
    maxDD: number;
    trades: number;
  }>;
  optimal: { a: number; b: number; insample: PairPerformance; outOfSample: PairPerformance };
  oosResult: PairAnalysisResult;
  isRobust: boolean;
  robustnessPct: number;
  top5: Array<{
    a: number;
    b: number;
    sharpe_IS: number;
    sharpe_OOS: number;
    pnl_IS: number;
    pnl_OOS: number;
  }>;
}

export const DEFAULT_PAIR_CONFIG: PairConfig = {
  asset1: "GGAL.BA",
  asset2: "BMA.BA",
  period: 365,
  interval: "1d",
  window: 20,
  entryThresh: 1.5,
  stopThresh: 2.5,
  capitalPerPair: 1,
  txCost: 0.1,
  inSampleRatio: undefined,
  pValue: 2,
  marketImpactGamma: 0.5,
  participationRate: 0.1,
  executionAlgo: "pairs",
  volatility: 0.2,
};

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  asset1: "GGAL.BA",
  asset2: "BMA.BA",
  period: 365,
  interval: "1d",
  window: 20,
  capitalPerPair: 1,
  txCost: 0.1,
  insamplePct: 70,
  aMin: 0.5,
  aMax: 3.0,
  aStep: 0.25,
  bMin: 1.0,
  bMax: 4.0,
  bStep: 0.25,
  metric: "sharpe",
  pValue: 2,
  marketImpactGamma: 0.5,
  participationRate: 0.1,
  executionAlgo: "pairs",
};
