// @ts-nocheck
import { mean, std, pearsonR, linregress, computeHurst, computePVariance, impliedPFromReturns } from "./math/stats";
import { getRiskFreeRateSync } from "./risk-free-rate";
import type {
  PairAnalysisResult,
  PairConfig,
  Trade,
  TradeSignal,
  PairPerformance,
  BacktestConfig,
  BacktestGridResult,
  DataInterval,
} from "./statarb.types";
import { annualizationFactor } from "./statarb.types";

function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return out;
}

// MacKinnon critical values for ADF (no trend, no constant)
const ADF_CRITICAL = [
  { level: 0.01, value: -3.43 },
  { level: 0.05, value: -2.86 },
  { level: 0.1, value: -2.57 },
];

export function computeADF(spread: number[]): { stat: number; pValue: number } {
  const n = spread.length;
  if (n < 10) return { stat: 0, pValue: 1 };
  const y = spread.slice(1);
  const x = spread.slice(0, -1);
  const reg = linregress(x, y);
  const gamma = reg.slope - 1;
  const se = reg.stdErr;
  const stat = se > 0 ? gamma / se : 0;

  // Compare stat against MacKinnon critical values
  if (stat <= ADF_CRITICAL[0].value) return { stat, pValue: 0.01 };
  if (stat >= ADF_CRITICAL[2].value) return { stat, pValue: 0.15 };
  for (let i = 0; i < ADF_CRITICAL.length - 1; i++) {
    if (stat > ADF_CRITICAL[i].value && stat <= ADF_CRITICAL[i + 1].value) {
      const p =
        ADF_CRITICAL[i].level +
        (ADF_CRITICAL[i + 1].level - ADF_CRITICAL[i].level) *
          ((stat - ADF_CRITICAL[i].value) / (ADF_CRITICAL[i + 1].value - ADF_CRITICAL[i].value));
      return { stat, pValue: Math.round(p * 100) / 100 };
    }
  }
  return { stat, pValue: 0.1 };
}

function ibeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0 || x === 1) return x;
  const logGamma = (z: number): number => {
    if (z <= 0) return NaN;
    const coef = [
      76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
      1.208650973866179e-3, -5.395239384953e-6,
    ];
    let y = z,
      tmp = z + 5.5;
    tmp -= (z + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
      y += 1;
      ser += coef[j] / y;
    }
    return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / z);
  };
  const exp = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (exp * betacf(a, b, x)) / a;
  return 1 - (exp * betacf(b, a, 1 - x)) / b;
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 100,
    EPS = 3e-11;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function alignPairPrices(
  prices1: { date: string; close: number }[],
  prices2: { date: string; close: number }[],
): { date: string; a1: number; a2: number }[] {
  const map2 = new Map(prices2.map((p) => [p.date, p.close]));
  const aligned: { date: string; a1: number; a2: number }[] = [];
  for (const p of prices1) {
    const c2 = map2.get(p.date);
    if (c2 !== undefined) aligned.push({ date: p.date, a1: p.close, a2: c2 });
  }
  return aligned;
}

export function computeRollingStats(
  spread: number[],
  window: number,
): { mean: number[]; std: number[] } {
  const means: number[] = [];
  const stds: number[] = [];
  for (let i = 0; i < spread.length; i++) {
    if (i < window - 1) {
      means.push(spread[i]);
      stds.push(0.001);
    } else {
      const slice = spread.slice(i - window + 1, i + 1);
      means.push(mean(slice));
      const s = std(slice);
      stds.push(s > 0 ? s : 0.001);
    }
  }
  return { mean: means, std: stds };
}

export function simulateTrading(
  spread: number[],
  dates: string[],
  prices1: number[],
  prices2: number[],
  rollingMean: number[],
  rollingStd: number[],
  entryThresh: number,
  stopThresh: number,
  beta: number,
  txCost: number,
  //  Labadie: Market Impact (paper §2.1) 
  marketImpactGamma?: number,
  participationRate?: number,
  pValue?: number,
): { trades: Trade[]; signals: TradeSignal[]; pnlCurve: { date: string; pnl: number }[] } {
  const N = spread.length;
  let position: "flat" | "long" | "short" = "flat";
  let entryIdx = 0;
  let entryP1 = 0,
    entryP2 = 0;
  let entryZ = 0;
  const trades: Trade[] = [];
  const signals: TradeSignal[] = [];
  let cumPnl = 0;
  const pnlCurve: { date: string; pnl: number }[] = [{ date: dates[0], pnl: 0 }];

  // Market impact: I(v) = sign(v) × σ × |v/V|^γ × τ^(1/p)  (Labadie §2.1)
  const miGamma = marketImpactGamma ?? 0;
  const partRate = participationRate ?? 0;
  const p = pValue ?? 2;
  const spreadSigma = rollingStd.length > 0 ? rollingStd.reduce((a, b) => a + b, 0) / rollingStd.length : 0;
  // τ: paso temporal = 1 día para datos diarios
  const tau = 1 / 252;
  const tauFactor = p > 0 ? Math.pow(tau, 1 / p) : 1;

  for (let i = 1; i < N; i++) {
    const z = (spread[i] - rollingMean[i]) / rollingStd[i];
    const zPrev = (spread[i - 1] - rollingMean[i - 1]) / rollingStd[i - 1];

    if (position === "flat") {
      if (z > entryThresh) {
        position = "short";
        entryIdx = i;
        entryP1 = prices1[i];
        entryP2 = prices2[i];
        entryZ = z;
        signals.push({
          date: dates[i],
          type: "entry_short",
          entryPrice1: entryP1,
          entryPrice2: entryP2,
          zscore: z,
        });
      } else if (z < -entryThresh) {
        position = "long";
        entryIdx = i;
        entryP1 = prices1[i];
        entryP2 = prices2[i];
        entryZ = z;
        signals.push({
          date: dates[i],
          type: "entry_long",
          entryPrice1: entryP1,
          entryPrice2: entryP2,
          zscore: z,
        });
      }
    } else {
      const exitSignal =
        Math.abs(z) > stopThresh ||
        (position === "long" && zPrev < 0 && z >= 0) ||
        (position === "short" && zPrev > 0 && z <= 0);

      if (exitSignal) {
        const exitP1 = prices1[i];
        const exitP2 = prices2[i];
        const ret1 =
          position === "long" ? (exitP1 - entryP1) / entryP1 : (entryP1 - exitP1) / entryP1;
        const ret2 =
          position === "long" ? (entryP2 - exitP2) / entryP2 : (exitP2 - entryP2) / entryP2;
        let pnl = (ret1 - beta * ret2) * 100 - 2 * txCost;

        //  Labadie: Market Impact cost I(v) = σ × |v/V|^γ × τ^(1/p) (paper §2.1) 
        if (miGamma > 0 && partRate > 0 && spreadSigma > 0) {
          const impactCost = spreadSigma * Math.pow(partRate, miGamma) * tauFactor;
          pnl -= impactCost * 100;
        }

        const duration = i - entryIdx;
        signals.push({
          date: dates[i],
          type: Math.abs(z) > stopThresh ? "exit_sl" : "exit_tp",
          entryPrice1: entryP1,
          entryPrice2: entryP2,
          exitPrice1: exitP1,
          exitPrice2: exitP2,
          zscore: z,
          pnl,
        });
        cumPnl += pnl;
        trades.push({
          entryDate: dates[entryIdx],
          exitDate: dates[i],
          type: position === "long" ? "long" : "short",
          entryZ,
          exitZ: z,
          pnl,
          pnlCum: cumPnl,
          duration,
        });
        position = "flat";
        if (signals.length > 0) signals[signals.length - 1].pnlCum = cumPnl;
      }
    }
    pnlCurve.push({ date: dates[i], pnl: cumPnl });
  }

  if (position !== "flat") {
    const i = N - 1;
    const exitP1 = prices1[i];
    const exitP2 = prices2[i];
    const ret1 = position === "long" ? (exitP1 - entryP1) / entryP1 : (entryP1 - exitP1) / entryP1;
    const ret2 = position === "long" ? (entryP2 - exitP2) / entryP2 : (exitP2 - entryP2) / entryP2;
    let pnl = (ret1 - beta * ret2) * 100 - 2 * txCost;
    if (miGamma > 0 && partRate > 0 && spreadSigma > 0) {
      const impactCost = spreadSigma * Math.pow(partRate, miGamma) * tauFactor;
      pnl -= impactCost * 100;
    }
    cumPnl += pnl;
    trades.push({
      entryDate: dates[entryIdx],
      exitDate: dates[i],
      type: position === "long" ? "long" : "short",
      entryZ,
      exitZ: (spread[i] - rollingMean[i]) / rollingStd[i],
      pnl,
      pnlCum: cumPnl,
      duration: i - entryIdx,
    });
  }

  return { trades, signals, pnlCurve };
}

const MIN_TRADES_FOR_SHARPE = 3;

export function computePerformance(trades: Trade[], annFactor = 252, pVal?: number, dailyReturnsArr?: number[]): PairPerformance {
  const wins = trades.filter((t) => t.pnl > 0);
  const totalPnl = trades.length > 0 ? trades[trades.length - 1].pnlCum : 0;
  let maxDD = 0;
  let peak = 0;
  for (const t of trades) {
    if (t.pnlCum > peak) peak = t.pnlCum;
    const dd = peak - t.pnlCum;
    if (dd > maxDD) maxDD = dd;
  }
  const returns = trades.map((t) => t.pnl);
  const avgR = returns.length > 0 ? mean(returns) : 0;
  const stdR = returns.length > MIN_TRADES_FOR_SHARPE ? std(returns) : 0;
  const rfDiario = Math.pow(1 + getRiskFreeRateSync("USD"), 1 / annFactor) - 1;
  const sharpe = stdR > 0 ? ((avgR - rfDiario) / stdR) * Math.sqrt(annFactor) : 0;
  const avgDur = trades.length > 0 ? mean(trades.map((t) => t.duration)) : 0;

  //  Labadie §3.2: p-variance Sharpe sobre retornos diarios reales (no PnL de trades) 
  let pSharpe: number | undefined;
  let pVariance: number | undefined;
  const p = pVal ?? 2;
  // Usar daily returns del activo para p-variance (métrica de riesgo del precio)
  const returnsForPVar = dailyReturnsArr && dailyReturnsArr.length >= 20 ? dailyReturnsArr : returns;
  if (returnsForPVar.length >= MIN_TRADES_FOR_SHARPE) {
    const pVar = computePVariance(returnsForPVar, p);
    pVariance = pVar;
    // Sharpe_p = (avg trade return) / (p-variance^(1/p)) * sqrt(annFactor)
    const pStd = pVar > 0 ? Math.pow(pVar, 1 / p) : 0;
    pSharpe = pStd > 0 ? ((avgR - rfDiario) / pStd) * Math.sqrt(annFactor) : 0;
  }

  return {
    totalTrades: trades.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    maxDrawdown: maxDD,
    sharpe,
    avgDuration: avgDur,
    pSharpe,
    pVariance,
    pValueUsed: p !== 2 ? p : undefined,
  };
}

function runAnalysisOn(
  aligned: { date: string; a1: number; a2: number }[],
  config: PairConfig,
  betaOverride?: number,
  rollMeanOverride?: number[],
  rollStdOverride?: number[],
  //  Labadie §3.2: Hurst real desde los datos para TC/IS (§2.3-2.4) 
  hurstOverride?: number,
): {
  performance: PairPerformance;
  trades: Trade[];
  signals: TradeSignal[];
  spread: { date: string; value: number; mean: number; upper: number; lower: number; upperSl: number; lowerSl: number }[];
  zScore: { date: string; value: number }[];
  pnlCurve: { date: string; pnl: number }[];
  tradingCurve?: { step: number; volume: number; cumulative: number }[];
  optimalStartPct?: number;
  optimalStopPct?: number;
  dailyReturnsUsed?: number[]; // para p-variance correcta
} {
  const dates = aligned.map((a) => a.date);
  const c1 = aligned.map((a) => a.a1);
  const c2 = aligned.map((a) => a.a2);
  const beta = betaOverride ?? (aligned.length >= 30 ? linregress(dailyReturns(c2), dailyReturns(c1)).slope : 1);

  const dailyRets = dailyReturns(c1); // para p-variance de Labadie §3.2

  const spread: number[] = [];
  for (let i = 0; i < c1.length; i++) {
    spread.push(c1[i] - beta * c2[i]);
  }

  let rollMean: number[];
  let rollStd: number[];
  if (rollMeanOverride && rollStdOverride) {
    // Pad with values at split point if OOS is shorter (use last known IS rolling stats)
    rollMean = rollMeanOverride;
    rollStd = rollStdOverride;
  } else {
    const rolled = computeRollingStats(spread, config.window);
    rollMean = rolled.mean;
    rollStd = rolled.std;
  }

  // If OOS is shorter, extend rolling stats using the last IS values
  if (rollMean.length < spread.length) {
    const lastM = rollMean[rollMean.length - 1] ?? 0;
    const lastS = rollStd[rollStd.length - 1] ?? 0.001;
    while (rollMean.length < spread.length) {
      rollMean.push(lastM);
      rollStd.push(lastS);
    }
  }

  //  Labadie §2.3–2.4: Target Close (TC) / Implementation Shortfall (IS) 
  let tradingCurve: { step: number; volume: number; cumulative: number }[] | undefined;
  let optimalStartPct: number | undefined;
  let optimalStopPct: number | undefined;
  const algo = config.executionAlgo ?? "pairs";
  const sigma = config.volatility ?? 0.2;
  const gamma = config.marketImpactGamma ?? 0.5;
  const partRate = config.participationRate ?? 0.1;
  const pVal = config.pValue ?? 2;
  // Usar Hurst real de los datos si está disponible; sino H=0.5 (random walk)
  const H_actual = hurstOverride ?? 0.5;
  const T = aligned.length;
  const Nsteps = Math.min(T, 100); // discretización

  if (algo === "tc" || algo === "is") {
    // Fórmula recursiva de Labadie (secciones 2.3-2.4):
    // Para TC (forward): v_n = (σ² × τ^(2H-1) × Σ_{i=n}^{N-1} v_i) / (I'(v_n) + σ² × τ^(2H-1) × (N-n))
    // Para IS (backward): v_n = (σ² × τ^(2H-1) × Σ_{i=0}^{n-1} v_i) / (I'(v_n) + σ² × τ^(2H-1) × n)
    const tau = 1 / Nsteps;
    const sigma2tau = sigma * sigma * Math.pow(tau, 2 * H_actual - 1); // τ^(2H-1), usa H real
    const I_prime = gamma * Math.pow(partRate, gamma - 1); // derivada del impacto marginal
    // PVol constraint (§2.2): máximo % de participación por intervalo
    const pVolMax = config.participationRate ?? 0.1;

    const volumes: number[] = new Array(Nsteps).fill(1 / Nsteps);
    if (algo === "tc") {
      // Target Close: forward recursion con convergencia (shooting method, Labadie §2.5)
      for (let iter = 0; iter < 50; iter++) {
        const prev = [...volumes];
        for (let n = 0; n < Nsteps; n++) {
          let sumFuture = 0;
          for (let j = n + 1; j < Nsteps; j++) sumFuture += volumes[j];
          const denom = I_prime + sigma2tau * (Nsteps - n);
          if (denom > 0) {
            volumes[n] = (sigma2tau * sumFuture) / denom;
          }
          // PVol constraint: v_n ≤ PVol_max
          if (volumes[n] > pVolMax) volumes[n] = pVolMax;
        }
        // Normalizar
        const total = volumes.reduce((s, v) => s + v, 0);
        if (total > 0) for (let n = 0; n < Nsteps; n++) volumes[n] /= total;
        // Convergencia: cambio máximo < 0.1%
        let maxChange = 0;
        for (let n = 0; n < Nsteps; n++) {
          const change = Math.abs(volumes[n] - prev[n]);
          if (change > maxChange) maxChange = change;
        }
        if (maxChange < 0.001) break;
      }
      // Optimal start: find when cumulative volume first exceeds 1% of total
      let cum = 0;
      for (let n = 0; n < Nsteps; n++) {
        cum += volumes[n];
        if (cum > 0.01) { optimalStartPct = n / Nsteps; break; }
      }
      optimalStartPct = optimalStartPct ?? 0;
    } else {
      // Implementation Shortfall: backward recursion con convergencia
      for (let iter = 0; iter < 50; iter++) {
        const prev = [...volumes];
        for (let n = Nsteps - 1; n >= 0; n--) {
          let sumPast = 0;
          for (let j = 0; j < n; j++) sumPast += volumes[j];
          const denom = I_prime + sigma2tau * n;
          if (denom > 0) {
            volumes[n] = (sigma2tau * sumPast) / denom;
          }
          // PVol constraint: v_n ≤ PVol_max
          if (volumes[n] > pVolMax) volumes[n] = pVolMax;
        }
        const total = volumes.reduce((s, v) => s + v, 0);
        if (total > 0) for (let n = 0; n < Nsteps; n++) volumes[n] /= total;
        // Convergencia: cambio máximo < 0.1%
        let maxChange = 0;
        for (let n = 0; n < Nsteps; n++) {
          const change = Math.abs(volumes[n] - prev[n]);
          if (change > maxChange) maxChange = change;
        }
        if (maxChange < 0.001) break;
      }
      // Optimal stop: find when cumulative volume reaches 99%
      let cum = 0;
      for (let n = 0; n < Nsteps; n++) {
        cum += volumes[n];
        if (cum > 0.99) { optimalStopPct = n / Nsteps; break; }
      }
      optimalStopPct = optimalStopPct ?? 1;
    }

    // Build trading curve
    let cumVol = 0;
    tradingCurve = volumes.map((v, i) => {
      cumVol += v;
      return { step: i, volume: v, cumulative: cumVol };
    });
  }

  const spreadChart = dates.map((d, i) => ({
    date: d,
    value: spread[i],
    mean: rollMean[i],
    upper: rollMean[i] + config.entryThresh * rollStd[i],
    lower: rollMean[i] - config.entryThresh * rollStd[i],
    upperSl: rollMean[i] + config.stopThresh * rollStd[i],
    lowerSl: rollMean[i] - config.stopThresh * rollStd[i],
  }));

  const zScore = dates.map((d, i) => ({
    date: d,
    value: rollStd[i] > 0 ? (spread[i] - rollMean[i]) / rollStd[i] : 0,
  }));

  let trades: Trade[] = [];
  let signals: TradeSignal[] = [];
  let pnlCurve: { date: string; pnl: number }[] = [];

  if (algo === "pairs") {
    const sim = simulateTrading(
      spread, dates, c1, c2, rollMean, rollStd,
      config.entryThresh, config.stopThresh, beta, config.txCost,
      config.marketImpactGamma, config.participationRate, config.pValue,
    );
    trades = sim.trades;
    signals = sim.signals;
    pnlCurve = sim.pnlCurve;
  }

  const performance = computePerformance(trades, annualizationFactor(config.interval), config.pValue, dailyRets);
  return { performance, trades, signals, spread: spreadChart, zScore, pnlCurve, tradingCurve, optimalStartPct, optimalStopPct, dailyReturnsUsed: dailyRets };
}

export function analyzePair(
  prices1: { date: string; close: number }[],
  prices2: { date: string; close: number }[],
  config: PairConfig,
): PairAnalysisResult {
  const aligned = alignPairPrices(prices1, prices2);
  if (aligned.length < 30) {
    return {
      asset1: config.asset1,
      asset2: config.asset2,
      correlation: 0, beta: 0, r2: 0, adfStat: 0, adfPValue: 1, isCointegrated: false,
      normalizedPrices: [], spread: [], zScore: [], signals: [], trades: [],
      performance: { totalTrades: 0, winRate: 0, totalPnl: 0, maxDrawdown: 0, sharpe: 0, avgDuration: 0 },
    };
  }

  const dates = aligned.map((a) => a.date);
  const c1 = aligned.map((a) => a.a1);
  const c2 = aligned.map((a) => a.a2);

  const r1 = dailyReturns(c1);
  const r2 = dailyReturns(c2);
  const corr = pearsonR(r1, r2);
  const reg = linregress(r2, r1);
  const beta = reg.slope;
  const rsq = reg.r2;

  //  Labadie §3.2: Exponente de Hurst (self-similar processes) 
  // H ∈ (0,1). H=0.5 → random walk; H<0.5 → mean-reverting; H>0.5 → trending
  // p = 1/H identidad del paper
  const spreadForHurst = c1.map((v, i) => v - beta * (c2[i] ?? 0));
  const hurst = computeHurst(spreadForHurst);
  const impliedP = hurst > 0 ? Math.min(10, Math.max(1.1, 1 / hurst)) : 2;
  const impliedPFromReturnsVal = r1.length >= 100 ? impliedPFromReturns(r1) : undefined;

  //  Labadie §4 (eq. 21) — EXPERIMENTAL: Regresión heurística no-paper 
  // implied p ≈ 2.35 + 0.14 × avg_market_impact − 1.79 × volatility
  // NO es identidad del paper (la identidad es p=1/H). Mantener solo como referencia,
  // UI debe etiquetar como "experimental" y priorizar impliedP = 1/H
  const priceVolatility = std(r1) * Math.sqrt(252); // volatilidad anualizada del activo 1
  // market impact aproximado como desviación media del spread / precio medio
  const avgPrice = c1.length > 0 ? mean(c1) : 1;
  const avgMarketImpact = spreadForHurst.length > 0
    ? spreadForHurst.reduce((s, v) => s + Math.abs(v), 0) / spreadForHurst.length / avgPrice
    : 0.05;
  const impliedP_regression = Math.min(10, Math.max(1.1,
    2.35 + 0.14 * avgMarketImpact * 100 - 1.79 * priceVolatility
  ));

  //  Labadie §3.2: p-variance 
  const pUsed = config.pValue ?? 2;
  const pVarianceUsed = computePVariance(r1, pUsed);

  // Backtesting Stage 3: IS/OOS split (ver PDF Labadie "Statistical Arbitrage & Backtesting")
  let inSamplePerformance: PairPerformance | undefined;
  let outOfSamplePerformance: PairPerformance | undefined;
  let splitDate: string | undefined;
  let isTrades: Trade[] = [];
  let oosTrades: Trade[] = [];
  let isSignals: TradeSignal[] = [];
  let oosSignals: TradeSignal[] = [];

  if (config.inSampleRatio && config.inSampleRatio > 0 && config.inSampleRatio < 1) {
    const splitIdx = Math.floor(aligned.length * config.inSampleRatio);
    splitDate = dates[splitIdx];

    const isAligned = aligned.slice(0, splitIdx);
    const oosAligned = aligned.slice(splitIdx);

    const isResult = runAnalysisOn(isAligned, config, undefined, undefined, undefined, hurst);
    isTrades = isResult.trades;
    isSignals = isResult.signals;
    inSamplePerformance = isResult.performance;

    // OOS: apply beta and rolling stats from IS phase (no recalculation)
    const isSpreadFull: number[] = [];
    for (let i = 0; i < oosAligned.length; i++) {
      isSpreadFull.push(oosAligned[i].a1 - beta * oosAligned[i].a2);
    }
    const isRolled = computeRollingStats(
      c1.slice(0, splitIdx).map((_, i) => c1[i] - beta * c2[i]),
      config.window,
    );
    // Use the last IS rolling mean/std for all OOS points
    const oosMean = new Array(oosAligned.length).fill(isRolled.mean[isRolled.mean.length - 1] ?? 0);
    const oosStd = new Array(oosAligned.length).fill(isRolled.std[isRolled.std.length - 1] ?? 0.001);

    const oosResult = runAnalysisOn(oosAligned, config, beta, oosMean, oosStd, hurst);
    oosTrades = oosResult.trades;
    oosSignals = oosResult.signals;
    outOfSamplePerformance = oosResult.performance;
  }

  // Full-series analysis (always computed) — pasar Hurst real para TC/IS
  const full = runAnalysisOn(aligned, config, undefined, undefined, undefined, hurst);

  // Build normalized prices
  const min1 = Math.min(...c1);
  const max1 = Math.max(...c1);
  const min2 = Math.min(...c2);
  const max2 = Math.max(...c2);
  const normPrices = aligned.map((a) => ({
    date: a.date,
    a1: ((a.a1 - min1) / (max1 - min1)) * 100,
    a2: ((a.a2 - min2) / (max2 - min2)) * 100,
  }));

  const adf = computeADF(
    c1.map((v, i) => v - beta * c2[i]),
  );

  // Rolling correlation breakdown detection (Principio 3 y 5)
  let correlationBreakdown: { current: number; historical: number; isBreaking: boolean } | undefined;
  if (r1.length >= config.window && r2.length >= config.window) {
    const rollingCorrs: number[] = [];
    for (let i = config.window; i <= r1.length; i++) {
      rollingCorrs.push(pearsonR(r1.slice(i - config.window, i), r2.slice(i - config.window, i)));
    }
    const currentCorr = rollingCorrs.length > 0 ? rollingCorrs[rollingCorrs.length - 1] : corr;
    const historicalAvgCorr = rollingCorrs.length > 0
      ? rollingCorrs.slice(0, Math.floor(rollingCorrs.length * 0.7)).reduce((s, v) => s + v, 0) / Math.max(1, Math.floor(rollingCorrs.length * 0.7))
      : corr;
    correlationBreakdown = {
      current: currentCorr,
      historical: historicalAvgCorr,
      isBreaking: currentCorr < historicalAvgCorr * 0.6,
    };
  }

  // PnL Histogram (Exercise 3, "Not very normal!")
  const allTrades = config.inSampleRatio ? [...isTrades, ...oosTrades] : full.trades;
  const pnlHistogram = computePnLHistogram(allTrades);

  return {
    asset1: config.asset1,
    asset2: config.asset2,
    correlation: corr,
    beta,
    r2: rsq,
    adfStat: adf.stat,
    adfPValue: adf.pValue,
    isCointegrated: adf.pValue < 0.05,
    normalizedPrices: normPrices,
    spread: config.inSampleRatio ? [
      ...full.spread.slice(0, Math.floor(aligned.length * config.inSampleRatio)),
      ...full.spread.slice(Math.floor(aligned.length * config.inSampleRatio)),
    ] : full.spread,
    zScore: config.inSampleRatio ? [
      ...full.zScore.slice(0, Math.floor(aligned.length * config.inSampleRatio)),
      ...full.zScore.slice(Math.floor(aligned.length * config.inSampleRatio)),
    ] : full.zScore,
    signals: [...isSignals, ...oosSignals],
    trades: allTrades,
    performance: full.performance,
    inSamplePerformance,
    outOfSamplePerformance,
    splitDate: config.inSampleRatio ? splitDate : undefined,
    pnlHistogram,
    correlationBreakdown,
    //  Labadie §3.2: Hurst exponent & p-variance 
    hurstExponent: hurst,
    pVarianceUsed: pVarianceUsed > 0 ? pVarianceUsed : undefined,
    //  Labadie §3.2: implied p = 1/H (identidad del paper) 
    impliedP: impliedP !== 2 ? impliedP : undefined,
    //  Labadie §4.3: implied p por regresión multi-escala 
    impliedPFromReturns: impliedPFromReturnsVal !== undefined && impliedPFromReturnsVal !== 2 ? impliedPFromReturnsVal : undefined,
    //  Labadie §4 (eq. 21): implied p por regresión 
    impliedPRegression: impliedP_regression !== 2 ? impliedP_regression : undefined,
    //  Labadie §2.5: Optimal starting/stopping times 
    optimalStartPct: full.optimalStartPct,
    optimalStopPct: full.optimalStopPct,
    tradingCurve: full.tradingCurve,
  };
}

export function computePnLHistogram(trades: Trade[], bins: number = 20): { binStart: number; binEnd: number; count: number }[] {
  if (trades.length === 0) return [];
  const pnls = trades.map((t) => t.pnl);
  const min = Math.min(...pnls);
  const max = Math.max(...pnls);
  if (max - min === 0) return [{ binStart: min, binEnd: max, count: trades.length }];
  const binWidth = (max - min) / bins;
  const histogram: { binStart: number; binEnd: number; count: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    const count = pnls.filter((p) => p >= binStart && (i === bins - 1 ? p <= binEnd : p < binEnd)).length;
    histogram.push({ binStart, binEnd, count });
  }
  return histogram;
}

export function simulateSyntheticSpread(
  meanReversionSpeed: number,
  longRunMean: number,
  volatility: number,
  days: number,
  dt: number = 1 / 252,
  //  Labadie §3.2: Hurst exponent para proceso self-similar 
  hurst?: number,
): { date: string; value: number }[] {
  // Ornstein-Uhlenbeck process: dS = theta*(mu - S)*dt + sigma*dB
  // Si Hurst está definido, usa fBm en vez de Bm: sigma → sigma * dt^H
  const H = hurst ?? 0.5;
  const points: { date: string; value: number }[] = [];
  let s = longRunMean;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    // Labadie §3.2: self-similar price scaling S(t+τ) = S(t) + σ * τ^H * ε
    const noise = volatility * Math.pow(dt, H) * randomNormal();
    s = s + meanReversionSpeed * (longRunMean - s) * dt + noise;
    points.push({ date: dateStr, value: s });
  }
  return points;
}

function randomNormal(): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function computeRollingCorrelation(
  returns1: number[],
  returns2: number[],
  window: number,
): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  for (let i = window; i <= returns1.length; i++) {
    result.push({
      date: `idx-${i}`,
      value: pearsonR(returns1.slice(i - window, i), returns2.slice(i - window, i)),
    });
  }
  return result;
}

/** Euler–Maruyama para SDE GBM / OU (Labadie procesos estocásticos): dS = μ S dt + σ S dW */
export function simularEulerSDE(
  s0: number,
  mu: number,
  sigma: number,
  T: number,
  pasos: number,
  tipo: "gbm" | "ou" = "gbm",
  muLong: number = s0,
): number[] {
  const dt = T / Math.max(1, pasos);
  const out: number[] = [s0];
  let s = s0;
  for (let i = 0; i < pasos; i++) {
    const dW = Math.sqrt(dt) * randomNormal();
    if (tipo === "gbm") s = s + mu * s * dt + sigma * s * dW;
    else s = s + mu * (muLong - s) * dt + sigma * dW; // OU
    out.push(s);
  }
  return out;
}

export function computeNeighborRobustness(
  grid: Array<{ a: number; b: number; sharpe: number; pnl: number; winRate: number; maxDD: number; trades: number }>,
  optimalA: number,
  optimalB: number,
): "alta" | "media" | "baja" {
  const neighbors = grid.filter(
    (g) => Math.abs(g.a - optimalA) <= 0.3 && Math.abs(g.b - optimalB) <= 0.3 && !(g.a === optimalA && g.b === optimalB),
  );
  if (neighbors.length < 2) return "media";
  const neighborSharpes = neighbors.map((g) => g.sharpe);
  const avg = neighborSharpes.reduce((s, v) => s + v, 0) / neighborSharpes.length;
  const variance = neighborSharpes.reduce((s, v) => s + (v - avg) ** 2, 0) / neighborSharpes.length;
  const stdNeighbors = Math.sqrt(variance);
  const optimalCell = grid.find((g) => g.a === optimalA && g.b === optimalB);
  const optSharpe = optimalCell?.sharpe ?? 1;
  if (optSharpe === 0) return "media";
  const ratio = stdNeighbors / Math.abs(optSharpe);
  if (ratio < 0.3) return "alta";
  if (ratio < 0.5) return "media";
  return "baja";
}

export function runBacktest(
  prices1: { date: string; close: number }[],
  prices2: { date: string; close: number }[],
  config: BacktestConfig,
): BacktestGridResult {
  const aligned = alignPairPrices(prices1, prices2);
  const splitIdx = Math.floor((aligned.length * config.insamplePct) / 100);

  const isPrices1 = aligned.slice(0, splitIdx).map((a) => ({ date: a.date, close: a.a1 }));
  const isPrices2 = aligned.slice(0, splitIdx).map((a) => ({ date: a.date, close: a.a2 }));
  const oosPrices1 = aligned.slice(splitIdx).map((a) => ({ date: a.date, close: a.a1 }));
  const oosPrices2 = aligned.slice(splitIdx).map((a) => ({ date: a.date, close: a.a2 }));

  const grid: Array<{
    a: number;
    b: number;
    sharpe: number;
    pnl: number;
    winRate: number;
    maxDD: number;
    trades: number;
  }> = [];
  let bestMetric = -Infinity;
  let bestA = config.aMin;
  let bestB = config.bMin;

  for (let a = config.aMin; a <= config.aMax + 0.001; a += config.aStep) {
    for (let b = a + 0.01; b <= config.bMax + 0.001; b += config.bStep) {
      const pairConfig: PairConfig = {
        asset1: config.asset1,
        asset2: config.asset2,
        period: config.period,
        interval: config.interval,
        window: config.window,
        entryThresh: Math.round(a * 100) / 100,
        stopThresh: Math.round(b * 100) / 100,
        capitalPerPair: config.capitalPerPair,
        txCost: config.txCost,
        pValue: config.pValue,
        marketImpactGamma: config.marketImpactGamma,
        participationRate: config.participationRate,
        executionAlgo: config.executionAlgo,
      };
      const result = analyzePair(isPrices1, isPrices2, pairConfig);
      const perf = result.performance;
      let metric = 0;
      switch (config.metric) {
        case "sharpe":
          metric = perf.sharpe;
          break;
        case "psharpe":
          metric = perf.pSharpe ?? perf.sharpe;
          break;
        case "pnl":
          metric = perf.totalPnl;
          break;
        case "winrate":
          metric = perf.winRate;
          break;
        case "maxdd":
          metric = -perf.maxDrawdown;
          break;
      }
      grid.push({
        a: Math.round(a * 100) / 100,
        b: Math.round(b * 100) / 100,
        sharpe: perf.sharpe,
        pnl: perf.totalPnl,
        winRate: perf.winRate,
        maxDD: perf.maxDrawdown,
        trades: perf.totalTrades,
      });
      if (metric > bestMetric) {
        bestMetric = metric;
        bestA = Math.round(a * 100) / 100;
        bestB = Math.round(b * 100) / 100;
      }
    }
  }

  const optimalConfig: PairConfig = {
    asset1: config.asset1,
    asset2: config.asset2,
    period: config.period,
    interval: config.interval,
    window: config.window,
    entryThresh: bestA,
    stopThresh: bestB,
    capitalPerPair: config.capitalPerPair,
    txCost: config.txCost,
    pValue: config.pValue,
    marketImpactGamma: config.marketImpactGamma,
    participationRate: config.participationRate,
    executionAlgo: config.executionAlgo,
  };

  const oosResult = analyzePair(oosPrices1, oosPrices2, optimalConfig);

  const insampleResult = grid.find((g) => g.a === bestA && g.b === bestB) ?? grid[0];

  const robustnessPct = insampleResult
    ? (oosResult.performance.sharpe / (insampleResult.sharpe || 0.001)) * 100
    : 0;

  const sorted = [...grid].sort((a, b) => b.sharpe - a.sharpe);
  const top5 = sorted.slice(0, 5).map((g) => {
    const cfg: PairConfig = { ...optimalConfig, entryThresh: g.a, stopThresh: g.b };
    const oos = analyzePair(oosPrices1, oosPrices2, cfg);
    return {
      a: g.a,
      b: g.b,
      sharpe_IS: g.sharpe,
      sharpe_OOS: oos.performance.sharpe,
      pnl_IS: g.pnl,
      pnl_OOS: oos.performance.totalPnl,
    };
  });

  return {
    grid,
    optimal: {
      a: bestA,
      b: bestB,
      insample: {
        totalTrades: insampleResult?.trades ?? 0,
        winRate: insampleResult?.winRate ?? 0,
        totalPnl: insampleResult?.pnl ?? 0,
        maxDrawdown: insampleResult?.maxDD ?? 0,
        sharpe: insampleResult?.sharpe ?? 0,
        avgDuration: 0,
      },
      outOfSample: oosResult.performance,
    },
    oosResult,
    isRobust: robustnessPct > 50,
    robustnessPct: Math.round(robustnessPct),
    top5,
  };
}
