/**
 * Labadié — Curva de ejecución óptima (1205.3482v6 §2.3-2.5)
 * Extraído y ordenado desde src/lib/statarb.math.ts:runAnalysisOn
 * TC = Target Close (forward recursion), IS = Implementation Shortfall (backward)
 * Shooting method 1D: independiente de N (tesis memoire_master cap. 3)
 */
export interface TradingCurvePoint { step: number; volume: number; cumulative: number; }

export interface ExecutionCurveParams {
  algo: "tc" | "is";
  T: number;              // horizon steps (≤100)
  sigma: number;          // volatilidad anualizada (ej 0.2)
  hurst: number;          // H real del spread (0.05-0.95), p=1/H
  gamma: number;          // impacto concavidad (0.1-1, default 0.5)
  participationRate: number; // PVol cap por intervalo (0.05-0.5, default 0.1)
  maxIter?: number;       // default 50
}

export function calcularCurvaOptima(params: ExecutionCurveParams): {
  curve: TradingCurvePoint[];
  optimalPct: number;
} {
  const { algo, T, sigma, hurst, gamma, participationRate, maxIter = 50 } = params;
  const Nsteps = Math.min(Math.max(2, T), 100);
  const H = Math.min(0.95, Math.max(0.05, hurst));
  const tau = 1 / Nsteps;
  const sigma2tau = sigma * sigma * Math.pow(tau, 2 * H - 1);
  const I_prime = gamma * Math.pow(Math.max(0.001, participationRate), Math.max(0.01, gamma - 1));
  const pVolMax = participationRate;

  const volumes = new Array(Nsteps).fill(1 / Nsteps);

  if (algo === "tc") {
    for (let iter = 0; iter < maxIter; iter++) {
      const prev = [...volumes];
      for (let n = 0; n < Nsteps; n++) {
        let sumFuture = 0;
        for (let j = n + 1; j < Nsteps; j++) sumFuture += volumes[j];
        const denom = I_prime + sigma2tau * (Nsteps - n);
        if (denom > 0) volumes[n] = (sigma2tau * sumFuture) / denom;
        if (volumes[n] > pVolMax) volumes[n] = pVolMax;
      }
      const total = volumes.reduce((s, v) => s + v, 0);
      if (total > 0) for (let n = 0; n < Nsteps; n++) volumes[n] /= total;
      let maxChange = 0;
      for (let n = 0; n < Nsteps; n++) maxChange = Math.max(maxChange, Math.abs(volumes[n] - prev[n]));
      if (maxChange < 0.001) break;
    }
  } else {
    for (let iter = 0; iter < maxIter; iter++) {
      const prev = [...volumes];
      for (let n = Nsteps - 1; n >= 0; n--) {
        let sumPast = 0;
        for (let j = 0; j < n; j++) sumPast += volumes[j];
        const denom = I_prime + sigma2tau * n;
        if (denom > 0) volumes[n] = (sigma2tau * sumPast) / denom;
        if (volumes[n] > pVolMax) volumes[n] = pVolMax;
      }
      const total = volumes.reduce((s, v) => s + v, 0);
      if (total > 0) for (let n = 0; n < Nsteps; n++) volumes[n] /= total;
      let maxChange = 0;
      for (let n = 0; n < Nsteps; n++) maxChange = Math.max(maxChange, Math.abs(volumes[n] - prev[n]));
      if (maxChange < 0.001) break;
    }
  }

  let cumVol = 0;
  const curve: TradingCurvePoint[] = volumes.map((v, i) => {
    cumVol += v;
    return { step: i, volume: v, cumulative: cumVol };
  });

  let optimalPct: number;
  if (algo === "tc") {
    let cum = 0;
    optimalPct = 0;
    for (let n = 0; n < Nsteps; n++) {
      cum += volumes[n];
      if (cum > 0.01) { optimalPct = n / Nsteps; break; }
    }
  } else {
    let cum = 0;
    optimalPct = 1;
    for (let n = 0; n < Nsteps; n++) {
      cum += volumes[n];
      if (cum > 0.99) { optimalPct = n / Nsteps; break; }
    }
  }

  return { curve, optimalPct };
}
