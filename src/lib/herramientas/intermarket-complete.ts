// @ts-nocheck
// ─── Intermarket Complete System — Pure Logic Layer ──────────────
// Niveles 0-6: Data Layer, 12 Ratios, Estadísticos, Reversión, Cointegración, Secuencia, Score

import pkg from "jstat";
const { jStat } = pkg;

// ─── CONSTANTS ──────────────────────────────────────────────────────

export const WINDOWS = [21, 63, 126, 252, 504] as const;
export type WindowKey = (typeof WINDOWS)[number];

export interface WindowConfig {
  days: number;
  label: string;
  purpose: string;
}

export const WINDOW_CONFIGS: Record<WindowKey, WindowConfig> = {
  21: { days: 21, label: "1m", purpose: "Señal táctica / momentum corto" },
  63: { days: 63, label: "3m", purpose: "Confirmación de tendencia" },
  126: { days: 126, label: "6m", purpose: "Tendencia intermedia (Stovall)" },
  252: { days: 252, label: "1y", purpose: "Tendencia estructural (Pring)" },
  504: { days: 504, label: "2y+", purpose: "Ciclo largo / cointegración" },
};

// ─── RATIO DEFINITIONS ──────────────────────────────────────────────

export const RATIO_DEFINITIONS = [
  { id: "CRB_BONDS", label: "CRB/Bonds", formula: "DBC ÷ TLT", leading: "Inflación vs desinflación (el REY)" },
  { id: "BONDS_STOCKS", label: "Bonds/Stocks", formula: "TLT ÷ SPY", leading: "Flight-to-quality vs Risk-on" },
  { id: "COMMODITIES_STOCKS", label: "Commodities/Stocks", formula: "DBC ÷ SPY", leading: "Régimen inflacionario vs crecimiento" },
  { id: "COPPER_GOLD", label: "Copper/Gold", formula: "HG=F ÷ GLD", leading: "Dr. Copper — ciclo industrial (3-6m adelantado)" },
  { id: "GOLD_OIL", label: "Gold/Oil", formula: "GLD ÷ USO", leading: "Inflación de demanda vs incertidumbre" },
  { id: "XLY_XLP", label: "XLY/XLP", formula: "XLY ÷ XLP", leading: "Confianza consumidor" },
  { id: "IWM_SPY", label: "IWM/SPY", formula: "IWM ÷ SPY", leading: "Small vs Large — rotación riesgo" },
  { id: "XLK_XLE", label: "XLK/XLE", formula: "XLK ÷ XLE", leading: "Tech vs Energy — rotación sectorial clave" },
  { id: "RSP_SPY", label: "RSP/SPY", formula: "RSP ÷ SPY", leading: "Amplitud de mercado — mercado angosto = late cycle" },
  { id: "HYG_LQD", label: "HYG/LQD", formula: "HYG ÷ LQD", leading: "Apetito crediticio — leading de equities" },
  { id: "DOW_GOLD", label: "Dow/Gold", formula: "^DJI ÷ GLD", leading: "Ciclo largo papel vs activos duros" },
  { id: "YIELD_CURVE", label: "Yield Curve", formula: "^TNX − ^IRX", leading: "Spread 10Y−3M — señal más temprana de recesión" },
  // ─── Nuevos ratios (Cap. 2, 10) ─────────────────────────────────
  { id: "GOLD_SILVER", label: "Gold/Silver", formula: "GLD ÷ SLV", leading: "Señal de miedo financiero extremo (Cap. 10)" },
  { id: "GDX_GLD", label: "GDX/GLD", formula: "GDX ÷ GLD", leading: "Miners vs Gold — confirma si el rally del oro es real (Cap. 10)" },
] as const;

export type RatioId = (typeof RATIO_DEFINITIONS)[number]["id"];

// ─── COMPLEMENTARY INDICATORS (no son ratios) ─────────────────────

export interface VixRegimeInfo {
  currentValue: number | null;
  percentile: PercentileInfo | null;
  zScore: ZScoreInfo | null;
  category: "low_vol" | "normal" | "elevated" | "panic" | null;
  trend21d: number | null; // cambio % 21d
}

export interface FedFundsInfo {
  currentRate: number | null;
  cyclePhase: "tightening" | "cutting" | "pause" | "neutral" | null;
  /** Backward-compatible field; contains the 10Y-3M spread used by this engine. */
  spread10y2y: number | null;
  spread10y3m: number | null;
  fedVsSpread: {
    fedAboveSpread: boolean | null;
    divergence: "widening" | "narrowing" | null;
    interpretation: string;
  };
}

export interface AssetClassSnapshot {
  xlre: { price: number | null; change21d: number | null; percentile: PercentileInfo | null };
  bil: { yield: number | null; change21d: number | null };
}

export type ComplementaryIndicators = {
  vix: VixRegimeInfo;
  fedFunds: FedFundsInfo;
  assetClasses: AssetClassSnapshot;
};

export interface AssetTrendSnapshot {
  value: number | null;
  change21d: number | null;
  change63d: number | null;
  change252d: number | null;
  direction: TrendDirection;
}

export interface CrossAssetCorrelationSnapshot {
  pair: string;
  correlation63d: number | null;
  correlation252d: number | null;
}

export interface LeadLagRelationship {
  pair: string;
  leader: string | null;
  lagDays: number | null;
  correlation: number | null;
  expectedLagDays: { min: number; max: number };
  confirmsMurphy: boolean | null;
}

export interface DowTheorySnapshot {
  industrialsTrend: TrendDirection;
  transportsTrend: TrendDirection;
  confirmed: boolean | null;
  divergence: "bullish" | "bearish" | null;
}

export interface LongCycleSnapshot {
  ratio: number | null;
  change252d: number | null;
  change504d: number | null;
  direction: TrendDirection;
  label: string;
}

export interface MurphyMarketContext {
  dxy: AssetTrendSnapshot;
  commodities: AssetTrendSnapshot;
  bonds: AssetTrendSnapshot;
  stocks: AssetTrendSnapshot;
  oil: AssetTrendSnapshot;
  oilShares: AssetTrendSnapshot;
  dow: AssetTrendSnapshot;
  transports: AssetTrendSnapshot;
  japan: AssetTrendSnapshot;
  china: AssetTrendSnapshot;
  emerging: AssetTrendSnapshot;
  developed: AssetTrendSnapshot;
  correlations: CrossAssetCorrelationSnapshot[];
  leadLag: LeadLagRelationship[];
  dowTheory: DowTheorySnapshot;
  longCycle: LongCycleSnapshot;
}

// ─── TYPES ──────────────────────────────────────────────────────────

export interface MultiWindowStats {
  windows: Partial<Record<WindowKey, WindowStat>>;
}

export interface WindowStat {
  value: number | null;
  changePct: number | null;
  slope: number | null;
  percentile: PercentileInfo | null;
  zScore: ZScoreInfo | null;
}

export interface PercentileInfo {
  value: number;
  rank: number; // 0-100
  category: "oversold_extreme" | "low" | "normal" | "high" | "overbought_extreme";
  signal: "buy" | "neutral" | "sell" | null;
}

export interface ZScoreInfo {
  zScore: number;
  vsMA: number; // The MA used
  stdDev: number;
  category: "overbought" | "overSold" | "normal";
  signal: "sell" | "buy" | null;
}

export type TrendDirection = "rising" | "falling" | "flat" | null;

export interface RatioAnalysis {
  id: RatioId;
  label: string;
  formula: string;
  leading: string;
  stats: MultiWindowStats;
  cointegration: CointegrationResult[];
  signal: RatioSignal;
}

export interface RatioSignal {
  direction: TrendDirection;
  strength: number; // 0-1
  regime: "bullish" | "bearish" | "neutral";
}

export interface CointegrationResult {
  pairRatioId: RatioId;
  pairLabel: string;
  adfStatistic: number | null;
  pValue: number | null;
  criticalValues: { "1%": number; "5%": number; "10%": number };
  cointegrated: boolean | null;
  expectedPerMurphy: boolean;
  regimeAnomalous: boolean | null;
}

export interface ReversalSignal {
  activated: boolean;
  ratioId: RatioId;
  layer1Percentile: boolean;
  layer2ZScore: boolean;
  layer3Divergence: boolean;
  divergenceConfirmingRatio: RatioId | null;
  divergenceDirection: "bullish" | "bearish" | null;
  confidence: number; // 0-1
  signal: string;
  interpretation: string;
}

export interface SequentialStep {
  step: number;
  name: string;
  result: string;
  signal: "bullish" | "bearish" | "neutral" | "warning";
  nextStep: number;
}

export interface SequentialAnalysis {
  steps: SequentialStep[];
  finalRegime: string;
  finalStage: string;
}

export interface CompositeScore {
  score: number; // -100 to +100
  components: ScoreComponent[];
  label: string;
  riskProfile: "aggressive_risk_on" | "moderate_risk_on" | "neutral" | "defensive" | "risk_off";
  interpretation: string;
}

export interface ScoreComponent {
  ratioId: RatioId;
  weight: number; // 0-1
  signalValue: number; // -1, 0, +1
  cointegrationMultiplier: number;
  contribution: number;
}

export interface DivergenceRule {
  extremeRatio: RatioId;
  confirmingRatio: RatioId;
  signal: string;
  direction: "bullish" | "bearish";
  description: string;
}

export const DIVERGENCE_RULES: DivergenceRule[] = [
  { extremeRatio: "CRB_BONDS", confirmingRatio: "COPPER_GOLD", signal: "Inflación tocando techo — rotar a bonds", direction: "bearish", description: "CRB/Bonds extremo + Copper/Gold bajando" },
  { extremeRatio: "BONDS_STOCKS", confirmingRatio: "HYG_LQD", signal: "Miedo extremo — posible rebote risk-on", direction: "bullish", description: "Bonds/Stocks extremo + HYG/LQD cayendo" },
  { extremeRatio: "XLY_XLP", confirmingRatio: "RSP_SPY", signal: "Recesión confirmada — mantenerse defensivo", direction: "bearish", description: "XLY/XLP extremo bajo + RSP/SPY cayendo" },
  { extremeRatio: "HYG_LQD", confirmingRatio: "COPPER_GOLD", signal: "Expansión genuina — riesgo-on válido", direction: "bullish", description: "HYG/LQD extremo + Copper/Gold también subiendo" },
];

export interface CompleteIntermarketResult {
  ratios: RatioAnalysis[];
  reversalSignals: ReversalSignal[];
  sequential: SequentialAnalysis;
  compositeScore: CompositeScore;
  cointegrationMatrix: CointegrationResult[][];
  /** Nuevos indicadores complementarios */
  complementary: ComplementaryIndicators;
  /** Relaciones directas y contexto global del método de Murphy */
  context: MurphyMarketContext;
  generatedAt: string;
}

// ─── COINTEGRATION PAIRS (expected per Murphy) ─────────────────────

export const COINTEGRATION_PAIRS: { a: RatioId; b: RatioId; expectedCointegrated: boolean; label: string }[] = [
  { a: "CRB_BONDS", b: "COPPER_GOLD", expectedCointegrated: true, label: "CRB/Bond vs Copper/Gold" },
  { a: "BONDS_STOCKS", b: "HYG_LQD", expectedCointegrated: true, label: "Bonds/Stocks vs HYG/LQD" },
  { a: "XLY_XLP", b: "RSP_SPY", expectedCointegrated: true, label: "XLY/XLP vs RSP/SPY" },
  { a: "XLK_XLE", b: "IWM_SPY", expectedCointegrated: true, label: "XLK/XLE vs IWM/SPY" },
  { a: "GOLD_OIL", b: "DOW_GOLD", expectedCointegrated: true, label: "Gold/Oil vs Dow/Gold" },
];

// ─── COMPOSITE SCORE WEIGHTS ────────────────────────────────────────

export const SCORE_WEIGHTS: Record<RatioId, number> = {
  CRB_BONDS: 0.18,
  BONDS_STOCKS: 0.08,
  COMMODITIES_STOCKS: 0.06,
  COPPER_GOLD: 0.12,
  GOLD_OIL: 0.04,
  XLY_XLP: 0.08,
  IWM_SPY: 0.03,
  XLK_XLE: 0.04,
  RSP_SPY: 0.05,
  HYG_LQD: 0.10,
  DOW_GOLD: 0.02,
  YIELD_CURVE: 0.15,
  GOLD_SILVER: 0.04,
  GDX_GLD: 0.01,
};

// ─── STATISTICAL HELPERS ────────────────────────────────────────────

export function computeChangePct(series: number[], days: number): number | null {
  if (series.length < days + 1) return null;
  const current = series[series.length - 1];
  const previous = series[series.length - 1 - days];
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function computeTrendDirection(changePct: number | null): TrendDirection {
  if (changePct == null) return null;
  if (changePct > 2) return "rising";
  if (changePct < -2) return "falling";
  return "flat";
}

export function computeAssetTrendSnapshot(series: number[]): AssetTrendSnapshot {
  const change21d = computeChangePct(series, 21);
  const change63d = computeChangePct(series, 63);
  return {
    value: series.length > 0 ? series[series.length - 1] : null,
    change21d,
    change63d,
    change252d: computeChangePct(series, 252),
    direction: computeTrendDirection(change63d),
  };
}

export function computeReturns(series: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const previous = series[i - 1];
    const current = series[i];
    if (previous > 0 && Number.isFinite(current)) returns.push((current - previous) / previous);
  }
  return returns;
}

export function computePearsonCorrelation(a: number[], b: number[], window?: number): number | null {
  const n = Math.min(a.length, b.length, window ?? Number.MAX_SAFE_INTEGER);
  if (n < 10) return null;
  const xs = a.slice(-n);
  const ys = b.slice(-n);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / n;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    covariance += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator > 0 ? covariance / denominator : null;
}

export function computeBestLagCorrelation(
  leader: number[],
  follower: number[],
  maxLag = 120,
  step = 5,
): { lagDays: number; correlation: number | null; leader: "first" | "second" | "synchronous" } {
  const n = Math.min(leader.length, follower.length);
  if (n < 30) return { lagDays: 0, correlation: null, leader: "synchronous" };

  let bestLag = 0;
  let bestCorrelation: number | null = null;
  let bestAbsCorrelation = -1;
  for (let lag = -maxLag; lag <= maxLag; lag += step) {
    const first = lag >= 0 ? leader.slice(0, n - lag) : leader.slice(-lag);
    const second = lag >= 0 ? follower.slice(lag) : follower.slice(0, n + lag);
    const correlation = computePearsonCorrelation(first, second);
    if (correlation != null && Math.abs(correlation) > bestAbsCorrelation) {
      bestAbsCorrelation = Math.abs(correlation);
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  return {
    lagDays: Math.abs(bestLag),
    correlation: bestCorrelation,
    leader: Math.abs(bestLag) <= step ? "synchronous" : bestLag > 0 ? "first" : "second",
  };
}

export function computeSlope(series: number[], window: number): number | null {
  if (series.length < window) return null;
  const slice = series.slice(-window);
  const n = slice.length;
  const xMean = (n - 1) / 2;
  const yMean = slice.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    const dy = slice[i] - yMean;
    num += dx * dy;
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den;
}

export function computeSMA(series: number[], period: number): number | null {
  if (series.length < period) return null;
  return series.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function computeStdDev(series: number[], mean: number): number {
  if (series.length < 2) return 0;
  const sqDiffs = series.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (series.length - 1));
}

export function computePercentile(series: number[], currentValue: number): PercentileInfo {
  if (series.length < 10) {
    return { value: currentValue, rank: 50, category: "normal", signal: null };
  }
  const sorted = [...series].sort((a, b) => a - b);
  const rank = currentValue < sorted[0]
    ? 0
    : currentValue > sorted[sorted.length - 1]
      ? 100
      : (sorted.findIndex((v) => v >= currentValue) / sorted.length) * 100;

  let category: PercentileInfo["category"];
  let signal: PercentileInfo["signal"];
  if (rank < 5) { category = "oversold_extreme"; signal = "buy"; }
  else if (rank < 20) { category = "low"; signal = null; }
  else if (rank <= 80) { category = "normal"; signal = null; }
  else if (rank <= 95) { category = "high"; signal = null; }
  else { category = "overbought_extreme"; signal = "sell"; }

  return { value: currentValue, rank: Math.round(rank * 100) / 100, category, signal };
}

export function computeZScore(series: number[], currentValue: number, period: number = 200): ZScoreInfo | null {
  if (series.length < period) return null;
  const ma = computeSMA(series, period);
  if (ma == null) return null;
  const slice = series.slice(-period);
  const stdDev = computeStdDev(slice, ma);
  if (stdDev === 0) return null;
  const z = (currentValue - ma) / stdDev;

  let category: ZScoreInfo["category"];
  let signal: ZScoreInfo["signal"];
  if (z > 2) { category = "overbought"; signal = "sell"; }
  else if (z < -2) { category = "overSold"; signal = "buy"; }
  else { category = "normal"; signal = null; }

  return { zScore: Math.round(z * 100) / 100, vsMA: ma, stdDev, category, signal };
}

// ─── SIMPLIFIED ADF TEST FOR COINTEGRATION ─────────────────────────

export function adfTest(spread: number[], maxLags: number = 5): {
  statistic: number | null;
  pValue: number | null;
  criticalValues: { "1%": number; "5%": number; "10%": number };
} {
  const criticalValues = { "1%": -3.43, "5%": -2.86, "10%": -2.57 };

  if (spread.length < 30) {
    return { statistic: null, pValue: null, criticalValues };
  }

  const y = spread;
  const n = y.length;
  const dy: number[] = [];
  const yLag: number[] = [];
  for (let i = 1; i < n; i++) {
    dy.push(y[i] - y[i - 1]);
    yLag.push(y[i - 1]);
  }

  const m = dy.length;
  if (m < 10) return { statistic: null, pValue: null, criticalValues };

  const xMean = yLag.reduce((a, b) => a + b, 0) / m;
  const yMean = dy.reduce((a, b) => a + b, 0) / m;

  let num = 0, den = 0;
  for (let i = 0; i < m; i++) {
    num += (yLag[i] - xMean) * (dy[i] - yMean);
    den += (yLag[i] - xMean) ** 2;
  }

  if (den === 0) return { statistic: null, pValue: null, criticalValues };

  const gamma = num / den;
  const residuals = dy.map((d, i) => d - (yMean + gamma * (yLag[i] - xMean)));
  const residSS = residuals.reduce((a, b) => a + b ** 2, 0);
  const se = Math.sqrt(residSS / (m - 2) / den);

  const statistic = se > 0 ? gamma / se : null;

  let pValue: number | null = null;
  if (statistic != null) {
    const cdfVal = jStat.normal.cdf(statistic, 0, 1);
    pValue = Math.round(cdfVal * 10000) / 10000;
  }

  return { statistic: statistic != null ? Math.round(statistic * 100) / 100 : null, pValue, criticalValues };
}

export function computeCointegration(
  seriesA: number[],
  seriesB: number[],
  ratioIdA: RatioId,
  ratioIdB: RatioId,
  expectedCointegrated: boolean,
): CointegrationResult {
  const minLen = Math.min(seriesA.length, seriesB.length);
  if (minLen < 30) {
    return {
      pairRatioId: ratioIdB, pairLabel: ratioIdB,
      adfStatistic: null, pValue: null,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      cointegrated: null, expectedPerMurphy: expectedCointegrated,
      regimeAnomalous: null,
    };
  }

  const spread: number[] = [];
  for (let i = 0; i < minLen; i++) {
    const a = seriesA[seriesA.length - minLen + i];
    const b = seriesB[seriesB.length - minLen + i];
    if (b !== 0) spread.push(a / b);
  }

  if (spread.length < 30) {
    return {
      pairRatioId: ratioIdB, pairLabel: ratioIdB,
      adfStatistic: null, pValue: null,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      cointegrated: null, expectedPerMurphy: expectedCointegrated,
      regimeAnomalous: null,
    };
  }

  const { statistic, pValue, criticalValues } = adfTest(spread);
  const cointegrated = statistic != null ? statistic < criticalValues["5%"] : null;
  const regimeAnomalous = cointegrated != null ? cointegrated !== expectedCointegrated : null;

  return {
    pairRatioId: ratioIdB, pairLabel: ratioIdB,
    adfStatistic: statistic, pValue,
    criticalValues,
    cointegrated, expectedPerMurphy: expectedCointegrated,
    regimeAnomalous,
  };
}

// ─── RATIO ANALYSIS ─────────────────────────────────────────────────

export function analyzeRatioSeries(
  id: RatioId,
  rawSeries: number[],
  allRatiosSeries: Record<RatioId, number[]>,
): RatioAnalysis {
  const def = RATIO_DEFINITIONS.find((r) => r.id === id)!;

  const windows: Partial<Record<WindowKey, WindowStat>> = {};
  for (const w of WINDOWS) {
    const value = rawSeries.length > 0 ? rawSeries[rawSeries.length - 1] : null;
    const changePct = computeChangePct(rawSeries, w);
    const slope = computeSlope(rawSeries, Math.min(w, rawSeries.length));
    const percentile = rawSeries.length > w * 2 ? computePercentile(rawSeries.slice(0, -Math.floor(w / 2)), value ?? 0) : null;
    const zScore = computeZScore(rawSeries, value ?? 0, Math.min(w * 2, rawSeries.length));

    windows[w] = { value, changePct, slope, percentile, zScore };
  }

  const cointegration: CointegrationResult[] = [];
  for (const pair of COINTEGRATION_PAIRS) {
    if (pair.a === id) {
      const pairSeries = allRatiosSeries[pair.b];
      if (pairSeries && pairSeries.length > 0) {
        cointegration.push(computeCointegration(rawSeries, pairSeries, pair.a, pair.b, pair.expectedCointegrated));
      }
    } else if (pair.b === id) {
      const pairSeries = allRatiosSeries[pair.a];
      if (pairSeries && pairSeries.length > 0) {
        cointegration.push(computeCointegration(rawSeries, pairSeries, pair.b, pair.a, pair.expectedCointegrated));
      }
    }
  }

  const trend63d = windows[63]?.changePct;
  const direction: TrendDirection =
    trend63d != null
      ? trend63d > 2 ? "rising" : trend63d < -2 ? "falling" : "flat"
      : null;

  const strength = trend63d != null ? Math.min(Math.abs(trend63d) / 20, 1) : 0;
  const regime: "bullish" | "bearish" | "neutral" =
    direction === "rising" ? "bullish" : direction === "falling" ? "bearish" : "neutral";

  return {
    id, label: def.label, formula: def.formula, leading: def.leading,
    stats: { windows },
    cointegration,
    signal: { direction, strength, regime },
  };
}

// ─── REVERSAL SIGNALS ───────────────────────────────────────────────

export function detectReversalSignals(ratios: RatioAnalysis[]): ReversalSignal[] {
  const signals: ReversalSignal[] = [];
  const ratioMap = new Map(ratios.map((r) => [r.id, r]));

  for (const ratio of ratios) {
    const allWindows = ratio.stats.windows;

    const percentileExtreme = Object.values(allWindows).some(
      (w) => w?.percentile?.category === "oversold_extreme" || w?.percentile?.category === "overbought_extreme",
    );
    const zScoreExtreme = Object.values(allWindows).some(
      (w) => w?.zScore?.category === "overbought" || w?.zScore?.category === "overSold",
    );

    if (!percentileExtreme && !zScoreExtreme) continue;

    for (const rule of DIVERGENCE_RULES) {
      if (rule.extremeRatio !== ratio.id) continue;

      const confirmingRatio = ratioMap.get(rule.confirmingRatio);
      if (!confirmingRatio) continue;

      const confirmingTrend = confirmingRatio.signal.direction;
      let divergenceDetected = false;

      if (rule.direction === "bearish") {
        const isExtremeHigh = Object.values(allWindows).some(
          (w) => w?.percentile?.category === "overbought_extreme" || w?.zScore?.category === "overbought",
        );
        divergenceDetected = isExtremeHigh && confirmingTrend === "falling";
      } else {
        const isExtremeLow = Object.values(allWindows).some(
          (w) => w?.percentile?.category === "oversold_extreme" || w?.zScore?.category === "overSold",
        );
        divergenceDetected = isExtremeLow && confirmingTrend === "rising";
      }

      const layerCount = [percentileExtreme, zScoreExtreme, divergenceDetected].filter(Boolean).length;
      const confidence = layerCount / 3;

      if (layerCount >= 2) {
        signals.push({
          activated: true,
          ratioId: ratio.id,
          layer1Percentile: percentileExtreme,
          layer2ZScore: zScoreExtreme,
          layer3Divergence: divergenceDetected,
          divergenceConfirmingRatio: rule.confirmingRatio,
          divergenceDirection: rule.direction,
          confidence,
          signal: rule.signal,
          interpretation: `${ratio.label} en extremo. ${divergenceDetected ? `Divergencia confirmada con ${confirmingRatio.label}. ` : ""}${rule.description}`,
        });
      }
    }
  }

  return signals;
}

// ─── SEQUENTIAL ANALYSIS (5 Steps) ──────────────────────────────────

export function computeSequentialAnalysis(
  ratios: RatioAnalysis[],
  dowTheory?: DowTheorySnapshot,
): SequentialAnalysis {
  const getTrend = (id: RatioId): TrendDirection => ratios.find((r) => r.id === id)?.signal.direction ?? null;
  const getValue = (id: RatioId, window: WindowKey = 21): number | null =>
    ratios.find((r) => r.id === id)?.stats.windows[window]?.changePct ?? null;

  const steps: SequentialStep[] = [];
  let nextStep = 2;

  // STEP 1: Yield Curve
  const ycTrend = getTrend("YIELD_CURVE");
  const ycInverted = (ratios.find((r) => r.id === "YIELD_CURVE")?.stats.windows[21]?.value ?? 0) < 0;
  let step1Signal: SequentialStep["signal"] = "neutral";
  let step1Result = "";

  if (ycInverted) {
    step1Signal = "warning";
    step1Result = "Curva INVERTIDA → Recesión en 6-18 meses. Ir a PASO 5 (Dow Theory).";
    nextStep = 5;
  } else if (ycTrend === "rising") {
    step1Result = "Steepening → Normalización / Recovery. Ir a PASO 2.";
    nextStep = 2;
  } else if (ycTrend === "falling") {
    step1Result = "Flattening → Precaución. Ir a PASO 2.";
    nextStep = 2;
  } else {
    step1Result = "Curva normal. Ir a PASO 2.";
    nextStep = 2;
  }

  steps.push({ step: 1, name: "Curva de Yields", result: step1Result, signal: step1Signal, nextStep });

  // STEP 2: CRB/Bonds (the KING ratio)
  if (nextStep === 2) {
    const crbTrend = getTrend("CRB_BONDS");
    let step2Signal: SequentialStep["signal"] = "neutral";
    let step2Result: string;
    let step2Next = 3;

    if (crbTrend === "rising") {
      step2Signal = "bullish";
      step2Result = "CRB/Bonds ↑ → Inflación. Ir a PASO 3A.";
      step2Next = 3;
    } else if (crbTrend === "falling") {
      step2Signal = "bearish";
      step2Result = "CRB/Bonds ↓ → Desinflación. Ir a PASO 3B.";
      step2Next = 4;
    } else {
      step2Result = "CRB/Bonds estable. Ir a PASO 3.";
      step2Next = 3;
    }

    steps.push({ step: 2, name: "CRB/Bonds (Rey)", result: step2Result, signal: step2Signal, nextStep: step2Next });
    nextStep = step2Next;
  }

  // STEP 3A (Inflationary path) or 3B (Disinflationary path)
  if (nextStep === 3 || nextStep === 4) {
    const isInflationary = nextStep === 3;

    if (isInflationary) {
      // STEP 3A
      const copperTrend = getTrend("COPPER_GOLD");
      const goldOilTrend = getTrend("GOLD_OIL");
      let step3Signal: SequentialStep["signal"] = "neutral";
      let step3Result: string;

      if (copperTrend === "rising") {
        step3Signal = "bullish";
        step3Result = "Copper/Gold ↑ → Inflación de DEMANDA (buena). Stage 3-4. Comprar XLE, XLB, GLD.";
      } else if (goldOilTrend === "rising") {
        step3Signal = "warning";
        step3Result = "Gold/Oil ↑ → Inflación de INCERTIDUMBRE (mala). Stage 5. Comprar XLP, XLU, TLT.";
      } else {
        step3Result = "Sin señal clara de inflación. Continuar a PASO 4.";
      }

      steps.push({ step: 3, name: "Diagnóstico Inflacionario", result: step3Result, signal: step3Signal, nextStep: 5 });
      nextStep = 5;
    } else {
      // STEP 3B (mapped to step 4 in sequence)
      const hygTrend = getTrend("HYG_LQD");
      let step3BSignal: SequentialStep["signal"] = "neutral";
      let step3BResult: string;

      if (hygTrend === "rising") {
        step3BSignal = "bullish";
        step3BResult = "HYG/LQD ↑ (risk-on) → Crecimiento genuino. Stage 1-2. Comprar XLK, XLY, IWM.";
      } else if (hygTrend === "falling") {
        step3BSignal = "warning";
        step3BResult = "HYG/LQD ↓ (risk-off) → Contracción. Stage 4-5. Comprar TLT, GLD, Cash.";
      } else {
        step3BResult = "HYG/LQD estable. Continuar a PASO 4.";
      }

      steps.push({ step: 4, name: "Diagnóstico Desinflacionario", result: step3BResult, signal: step3BSignal, nextStep: 5 });
      nextStep = 5;
    }
  }

  // STEP 4: Fine rotation (always runs)
  {
    const xlkXleTrend = getTrend("XLK_XLE");
    const rspSpyTrend = getTrend("RSP_SPY");
    const xlyXlpTrend = getTrend("XLY_XLP");
    const iwmSpyTrend = getTrend("IWM_SPY");

    const signals: string[] = [];
    if (xlkXleTrend === "rising") signals.push("Tech lidera → Stage 1-2 confirmado");
    else if (xlkXleTrend === "falling") signals.push("Energy lidera → Stage 3-4 confirmado");
    if (rspSpyTrend === "falling") signals.push("Mercado angosto → Late cycle confirmado");
    if (xlyXlpTrend === "falling" && iwmSpyTrend === "falling") signals.push("Contracción confirmada");

    const result = signals.length > 0 ? signals.join(". ") : "Sin confirmación adicional de rotación.";
    steps.push({
      step: steps.length + 1,
      name: "Rotación Fina (confirmación)",
      result,
      signal: rspSpyTrend === "falling" ? "warning" : xlkXleTrend === "rising" ? "bullish" : "neutral",
      nextStep: steps.length + 2,
    });
  }

  // STEP 5: Dow Theory (DJIA + DJT — NO usar HYG/LQD ni IWM/SPY como proxy)
  {
    const d = dowTheory;
    let dowSignal: SequentialStep["signal"] = "neutral";
    let dowResult: string;

    if (!d || (d.industrialsTrend == null && d.transportsTrend == null)) {
      dowResult = "Dow Theory: Sin datos de Industriales (^DJI) y Transportes (^DJT).";
    } else if (d.confirmed === true) {
      dowSignal = "bullish";
      dowResult = `Dow Theory: CONFIRMADO — DJI (${d.industrialsTrend}) y DJT (${d.transportsTrend}) en la misma dirección. Tendencia válida.`;
    } else if (d.confirmed === false) {
      if (d.divergence === "bearish") {
        dowSignal = "bearish";
        dowResult = `Dow Theory: DIVERGENCIA BAJISTA — DJI sube (${d.industrialsTrend}) pero DJT no confirma (${d.transportsTrend}). Señal clásica de posible techo (Murphy Cap. 4-5).`;
      } else if (d.divergence === "bullish") {
        dowSignal = "bullish";
        dowResult = `Dow Theory: DIVERGENCIA ALCISTA — DJI cae (${d.industrialsTrend}) pero DJT sube (${d.transportsTrend}). Posible fondo del mercado.`;
      } else {
        dowSignal = "warning";
        dowResult = `Dow Theory: Sin confirmación — DJI (${d.industrialsTrend}), DJT (${d.transportsTrend}). Monitorear.`;
      }
    } else {
      dowResult = "Dow Theory: Sin señal clara. Monitorear.";
    }

    steps.push({ step: steps.length + 1, name: "Dow Theory (confirmación DJI+DJT)", result: dowResult, signal: dowSignal, nextStep: -1 });
  }

  // Determine final regime and stage (consistent con detectCyclePhase 0-5)
  const hasWarning = steps.some((s) => s.signal === "warning");
  const hasBullish = steps.some((s) => s.signal === "bullish");
  const hasBearish = steps.some((s) => s.signal === "bearish");

  let finalRegime: string;
  let finalStage: string;
  if (hasWarning) {
    finalRegime = "CAUTELA — señales mixtas o de advertencia activas";
    finalStage = "Stage 3-4 (Expansión Tardía / Contracción)";
  } else if (hasBullish && !hasBearish) {
    finalRegime = "RISK-ON — condiciones favorables";
    finalStage = "Stage 0-2 (Recesión a Expansión Plena)";
  } else if (hasBearish && !hasBullish) {
    finalRegime = "RISK-OFF — contracción o recesión";
    finalStage = "Stage 4-5 (Contracción Temprana a Total)";
  } else {
    finalRegime = "NEUTRAL — señales mixtas sin dirección clara";
    finalStage = "Stage 2 (Expansión Plena / Mixto)";
  }

  return { steps, finalRegime, finalStage };
}

// ─── COMPOSITE SCORE ────────────────────────────────────────────────

export function computeCompositeScore(ratios: RatioAnalysis[]): CompositeScore {
  const components: ScoreComponent[] = [];

  for (const ratio of ratios) {
    const weight = SCORE_WEIGHTS[ratio.id];
    if (weight === 0) continue;

    const trend63d = ratio.stats.windows[63]?.changePct;
    let signalValue: number;
    if (trend63d != null && trend63d > 2) signalValue = 1;
    else if (trend63d != null && trend63d < -2) signalValue = -1;
    else signalValue = 0;

    const hasAnomalousCointegration = ratio.cointegration.some((c) => c.regimeAnomalous === true);
    const cointegrationMultiplier = hasAnomalousCointegration ? 0.5 : 1.0;

    const contribution = weight * signalValue * cointegrationMultiplier;
    components.push({ ratioId: ratio.id, weight, signalValue, cointegrationMultiplier, contribution });
  }

  const totalWeight = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  const rawScore = components.reduce((sum, c) => sum + c.contribution, 0);
  const score = Math.round((rawScore / totalWeight) * 100);

  let label: string;
  let riskProfile: CompositeScore["riskProfile"];
  if (score >= 50) { label = "RISK-ON AGRESIVO"; riskProfile = "aggressive_risk_on"; }
  else if (score >= 20) { label = "RISK-ON MODERADO"; riskProfile = "moderate_risk_on"; }
  else if (score >= -19) { label = "NEUTRAL / CAUTELA"; riskProfile = "neutral"; }
  else if (score >= -49) { label = "DEFENSIVO"; riskProfile = "defensive"; }
  else { label = "RISK-OFF / CASH"; riskProfile = "risk_off"; }

  const interpretation = `Score compuesto: ${score}. ${label}. ` +
    components
      .filter((c) => c.signalValue !== 0)
      .map((c) => {
        const ratioLabel = RATIO_DEFINITIONS.find((r) => r.id === c.ratioId)?.label ?? c.ratioId;
        return `${ratioLabel}: ${c.signalValue > 0 ? "🟢" : "🔴"} (${c.cointegrationMultiplier < 1 ? "confianza reducida" : "confianza normal"})`;
      })
      .join(". ");

  return { score, components, label, riskProfile, interpretation };
}

// ─── COMPLEMENTARY INDICATORS ANALYSIS ─────────────────────────────

export function analyzeVixRegime(
  vixSeries: number[],
): VixRegimeInfo {
  if (vixSeries.length < 21) {
    return { currentValue: null, percentile: null, zScore: null, category: null, trend21d: null };
  }

  const currentValue = vixSeries[vixSeries.length - 1];
  const percentile = computePercentile(vixSeries, currentValue);
  const zScore = computeZScore(vixSeries, currentValue, 252);
  const trend21d = computeChangePct(vixSeries, 21);

  let category: VixRegimeInfo["category"] = null;
  const rank = percentile?.rank ?? 50;
  if (rank < 20) category = "low_vol";
  else if (rank < 50) category = "normal";
  else if (rank < 80) category = "elevated";
  else category = "panic";

  return { currentValue, percentile, zScore, category, trend21d };
}

export interface MurphyMarketSeries {
  dxy: number[];
  commodities: number[];
  bonds: number[];
  stocks: number[];
  oil: number[];
  oilShares: number[];
  dow: number[];
  transports: number[];
  japan: number[];
  china: number[];
  emerging: number[];
  developed: number[];
  gold: number[];
}

function directionAgreement(a: TrendDirection, b: TrendDirection): boolean | null {
  if (a == null || b == null) return null;
  return a === b;
}

function computeLeadLagRelationship(
  pair: string,
  leaderName: string,
  followerName: string,
  leaderSeries: number[],
  followerSeries: number[],
  expectedLagDays: { min: number; max: number },
  maxLag: number,
): LeadLagRelationship {
  const result = computeBestLagCorrelation(computeReturns(leaderSeries), computeReturns(followerSeries), maxLag, 5);
  const leader = result.leader === "synchronous"
    ? "Sincrónico"
    : result.leader === "first" ? leaderName : followerName;
  const confirmsMurphy = result.correlation == null
    ? null
    : result.leader === "first" && result.lagDays >= expectedLagDays.min && result.lagDays <= expectedLagDays.max;
  return {
    pair,
    leader,
    lagDays: result.correlation == null ? null : result.lagDays,
    correlation: result.correlation,
    expectedLagDays,
    confirmsMurphy,
  };
}

export function computeMurphyMarketContext(series: Partial<MurphyMarketSeries>): MurphyMarketContext {
  const empty = [] as number[];
  const dxy = computeAssetTrendSnapshot(series.dxy ?? empty);
  const commodities = computeAssetTrendSnapshot(series.commodities ?? empty);
  const bonds = computeAssetTrendSnapshot(series.bonds ?? empty);
  const stocks = computeAssetTrendSnapshot(series.stocks ?? empty);
  const oil = computeAssetTrendSnapshot(series.oil ?? empty);
  const oilShares = computeAssetTrendSnapshot(series.oilShares ?? empty);
  const dow = computeAssetTrendSnapshot(series.dow ?? empty);
  const transports = computeAssetTrendSnapshot(series.transports ?? empty);
  const japan = computeAssetTrendSnapshot(series.japan ?? empty);
  const china = computeAssetTrendSnapshot(series.china ?? empty);
  const emerging = computeAssetTrendSnapshot(series.emerging ?? empty);
  const developed = computeAssetTrendSnapshot(series.developed ?? empty);
  const gold = series.gold ?? empty;

  const dxyReturns = computeReturns(series.dxy ?? empty);
  const commoditiesReturns = computeReturns(series.commodities ?? empty);
  const bondsReturns = computeReturns(series.bonds ?? empty);
  const stocksReturns = computeReturns(series.stocks ?? empty);
  const oilReturns = computeReturns(series.oil ?? empty);
  const oilSharesReturns = computeReturns(series.oilShares ?? empty);

  const correlations: CrossAssetCorrelationSnapshot[] = [
    {
      pair: "DXY vs Commodities",
      correlation63d: computePearsonCorrelation(dxyReturns, commoditiesReturns, 63),
      correlation252d: computePearsonCorrelation(dxyReturns, commoditiesReturns, 252),
    },
    {
      pair: "Bonds vs Stocks",
      correlation63d: computePearsonCorrelation(bondsReturns, stocksReturns, 63),
      correlation252d: computePearsonCorrelation(bondsReturns, stocksReturns, 252),
    },
    {
      pair: "Oil vs Oil Shares",
      correlation63d: computePearsonCorrelation(oilReturns, oilSharesReturns, 63),
      correlation252d: computePearsonCorrelation(oilReturns, oilSharesReturns, 252),
    },
  ];

  const leadLag: LeadLagRelationship[] = [
    computeLeadLagRelationship("DXY vs DBC", "DXY", "DBC", series.dxy ?? empty, series.commodities ?? empty, { min: 30, max: 90 }, 120),
    computeLeadLagRelationship("DBC vs SPY", "DBC", "SPY", series.commodities ?? empty, series.stocks ?? empty, { min: 60, max: 120 }, 180),
    computeLeadLagRelationship("TLT vs SPY", "TLT", "SPY", series.bonds ?? empty, series.stocks ?? empty, { min: 30, max: 180 }, 180),
  ];

  const dowTheory: DowTheorySnapshot = {
    industrialsTrend: dow.direction,
    transportsTrend: transports.direction,
    confirmed: directionAgreement(dow.direction, transports.direction),
    divergence: dow.direction != null && transports.direction != null && dow.direction !== transports.direction
      ? dow.direction === "rising" ? "bearish" : "bullish"
      : null,
  };

  const goldSeries = gold;
  const dowSeries = series.dow ?? empty;
  const minLongCycle = Math.min(dowSeries.length, goldSeries.length);
  const dowGoldSeries = minLongCycle > 0
    ? dowSeries.slice(-minLongCycle).map((value, index) => {
        const goldValue = goldSeries[goldSeries.length - minLongCycle + index];
        return goldValue > 0 ? value / goldValue : 0;
      }).filter((value) => value > 0)
    : empty;
  const longCycleDirection = computeTrendDirection(computeChangePct(dowGoldSeries, 252));
  const longCycle: LongCycleSnapshot = {
    ratio: dowGoldSeries.length > 0 ? dowGoldSeries[dowGoldSeries.length - 1] : null,
    change252d: computeChangePct(dowGoldSeries, 252),
    change504d: computeChangePct(dowGoldSeries, 504),
    direction: longCycleDirection,
    label: longCycleDirection === "rising"
      ? "Activos financieros dominan"
      : longCycleDirection === "falling"
        ? "Activos duros dominan"
        : "Ciclo largo sin dirección clara",
  };

  return {
    dxy, commodities, bonds, stocks, oil, oilShares, dow, transports,
    japan, china, emerging, developed, correlations, leadLag, dowTheory, longCycle,
  };
}

export function analyzeFedFundsCycle(
  fedFundsRateSeries: number[],
  yieldCurveSpread: number | null,
): FedFundsInfo {
  const currentRate = fedFundsRateSeries.length > 0 ? fedFundsRateSeries[fedFundsRateSeries.length - 1] : null;

  // Determine cycle phase from last 12 months of rate changes
  let cyclePhase: FedFundsInfo["cyclePhase"] = "neutral";
  if (fedFundsRateSeries.length > 252) {
    const yearAgo = fedFundsRateSeries[fedFundsRateSeries.length - 252];
    const sixMonthsAgo = fedFundsRateSeries[fedFundsRateSeries.length - 126];
    if (currentRate != null && yearAgo != null) {
      if (currentRate > yearAgo + 0.25) cyclePhase = "tightening";
      else if (currentRate < yearAgo - 0.25) cyclePhase = "cutting";
      else if (sixMonthsAgo != null && Math.abs(currentRate - sixMonthsAgo) < 0.25) cyclePhase = "pause";
    }
  }

  // Fed vs spread divergence
  let fedVsSpread: FedFundsInfo["fedVsSpread"] = {
    fedAboveSpread: null,
    divergence: null,
    interpretation: "Sin datos suficientes",
  };

  if (currentRate != null && yieldCurveSpread != null) {
    fedVsSpread.fedAboveSpread = currentRate > yieldCurveSpread;
    fedVsSpread.divergence =
      currentRate > 3 && yieldCurveSpread < 0
        ? "widening"
        : (currentRate < yieldCurveSpread ? "narrowing" : null);

    if (fedVsSpread.fedAboveSpread && yieldCurveSpread < 0) {
      fedVsSpread.interpretation =
        "🔴 Fed Funds por encima de la curva invertida — señal clásica de tightening excesivo. Recesión probable en 6-12 meses.";
    } else if (fedVsSpread.fedAboveSpread && yieldCurveSpread > 0) {
      fedVsSpread.interpretation =
        "🟡 Fed Funds elevado vs curva positiva — política restrictiva pero curva aún normal. Monitorear desaceleración.";
    } else if (!fedVsSpread.fedAboveSpread && yieldCurveSpread < 0) {
      fedVsSpread.interpretation =
        "🟠 Curva invertida pero Fed por debajo — el mercado descuenta recortes. Posible aterrizaje suave.";
    } else {
      fedVsSpread.interpretation =
        "🟢 Fed Funds coherente con la curva — política monetaria neutral o acomodaticia.";
    }
  }

  return {
    currentRate,
    cyclePhase,
    spread10y2y: yieldCurveSpread,
    spread10y3m: yieldCurveSpread,
    fedVsSpread,
  };
}

// ─── MAIN ANALYSIS FUNCTION ─────────────────────────────────────────

export function computeCompleteAnalysis(
  ratioSeriesMap: Record<RatioId, number[]>,
  complementarySeries?: {
    vix: number[];
    fedFunds: number[];
    xlre: number[];
    bil: number[];
  },
  marketSeries?: Partial<MurphyMarketSeries>,
): CompleteIntermarketResult {
  const ratios = (Object.keys(ratioSeriesMap) as RatioId[])
    .filter((id) => (ratioSeriesMap[id]?.length ?? 0) > 0)
    .map((id) => analyzeRatioSeries(id, ratioSeriesMap[id] ?? [], ratioSeriesMap));

  const reversalSignals = detectReversalSignals(ratios);

  // Context must be computed before sequential analysis (needs dowTheory for Step 5)
  const context = computeMurphyMarketContext({
    ...marketSeries,
    gold: marketSeries?.gold ?? [],
  });

  const sequential = computeSequentialAnalysis(ratios, context.dowTheory);
  const compositeScore = computeCompositeScore(ratios);

  const cointegrationMatrix: CointegrationResult[][] = ratios.map((r) => r.cointegration);

  // Complementary indicators
  const vix = analyzeVixRegime(complementarySeries?.vix ?? []);
  const fedFunds = analyzeFedFundsCycle(
    complementarySeries?.fedFunds ?? [],
    ratios.find((r) => r.id === "YIELD_CURVE")?.stats.windows[21]?.value ?? null,
  );
  const xlreData = complementarySeries?.xlre ?? [];
  const bilData = complementarySeries?.bil ?? [];
  const assetClasses: AssetClassSnapshot = {
    xlre: {
      price: xlreData.length > 0 ? xlreData[xlreData.length - 1] : null,
      change21d: computeChangePct(xlreData, 21),
      percentile: xlreData.length > 50 ? computePercentile(xlreData, xlreData[xlreData.length - 1]) : null,
    },
    bil: {
      yield: bilData.length > 0 ? bilData[bilData.length - 1] : null,
      change21d: computeChangePct(bilData, 21),
    },
  };

  return {
    ratios,
    reversalSignals,
    sequential,
    compositeScore,
    cointegrationMatrix,
    complementary: { vix, fedFunds, assetClasses },
    context,
    generatedAt: new Date().toISOString(),
  };
}
