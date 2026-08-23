/**
 * Labadié — Curva de ejecución óptima (1205.3482v6 §2.3-2.5 + §3.2)
 * Fuente canónica: 1205.3482v6 §2.3 TC, §2.4 IS, §2.6 PVol, §3.2 p=1/H self-similar.
 * Shooting 1D independiente de N (memoire_master cap.3).
 * Esta es la UNICA implementación canónica. statarb.math.ts debe importar de aquí.
 * τ = 1/Nsteps para curva (fracción horizonte). Para PnL impact en simulateTrading el τ es 1/252 anualizado — documentado allí.
 */
export interface TradingCurvePoint { step: number; volume: number; cumulative: number; }

export interface ExecutionCurveParams {
  algo: "tc" | "is";
  T: number;              // horizon steps (≤100)
  sigma: number;          // volatilidad anualizada (ej 0.2)
  hurst: number;          // H real del spread, clamp canónico Labadié §4.3 p∈[1.1,4] → H∈[0.25,0.91]
  gamma: number;          // impacto concavidad (0.1-1, default 0.5)
  participationRate: number; // PVol cap por intervalo (0.05-0.5, default 0.1)
  kappa?: number;         // coef impacto κ (default 1) — 1205 eq.10 h=κσ τ^H (v/V)^γ
  alphaMinPct?: number;   // proxy de α_min (tamaño mínimo slice) default 0.01 =1% presupuesto
  maxIter?: number;       // default 50
}

// Proyección al simplex con cap PVol (iterativa, conserva optimalidad KKT bajo §2.6)
function projectCappedSimplex(vols: number[], capIn: number): number[] {
  const n = vols.length;
  // factibilidad §2.6: si cap·n < 1 el conjunto {v: Σv=1, 0≤v≤cap} es vacío → relajar cap a 1/n
  const cap = Math.max(capIn, 1 / n);
  let v = vols.map(x => Math.max(0, x));
  // iterar clipping hasta convergencia (a lo sumo n iteraciones)
  for (let iter = 0; iter < n + 5; iter++) {
    const total = v.reduce((s, x) => s + x, 0);
    if (total === 0) return new Array(n).fill(1 / n);
    const scaled = v.map(x => x / total); // Σscaled = 1
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (scaled[i] > cap + 1e-9) {
        v[i] = cap;
        changed = true;
      } else {
        v[i] = scaled[i];
      }
    }
    if (!changed) return v; // suma 1 y todo ≤ cap
    // los capeados quedan fijos; la próxima iteración re-escala solo los libres
  }
  return v;
}

export function calcularCurvaOptima(params: ExecutionCurveParams): {
  curve: TradingCurvePoint[];
  optimalPct: number;
} {
  const { algo, T, sigma, hurst, gamma, participationRate, kappa = 1, alphaMinPct = 0.01, maxIter = 50 } = params;
  const Nsteps = Math.min(Math.max(2, T), 100);
  const H = Math.min(0.91, Math.max(0.25, hurst)); // Labadié §4.3 p∈[1.1,4] → H∈[0.25,0.91] clamp canónico
  const tau = 1 / Nsteps; // fracción horizonte (paper: τ = t_n - t_{n-1} );
  const sigma2tau = sigma * sigma * Math.pow(tau, 2 * H - 1);
  // I' = d/dv [ κ σ τ^H (v/V)^γ ] = κ σ τ^H γ (v/V)^{γ-1} ; simplificamos V=1 y evaluamos en v/V=partRate
  // Paper eq.13: exponente γ−1 NEGATIVO intencional (amplifica a participaciones bajas). No clipear.
  const tauH = Math.pow(tau, H);
  const I_prime = kappa * sigma * tauH * gamma * Math.pow(Math.max(0.001, participationRate), gamma - 1);
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
      }
      // PVol constraint §2.6 vía proyección capeada (no normalizar crudo)
      const projected = projectCappedSimplex([...volumes], pVolMax);
      for (let n = 0; n < Nsteps; n++) volumes[n] = projected[n];
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
      }
      const projected = projectCappedSimplex([...volumes], pVolMax);
      for (let n = 0; n < Nsteps; n++) volumes[n] = projected[n];
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
      if (cum > alphaMinPct) { optimalPct = n / Nsteps; break; }
    }
  } else {
    let cum = 0;
    optimalPct = 1;
    for (let n = 0; n < Nsteps; n++) {
      cum += volumes[n];
      if (cum > 1 - alphaMinPct) { optimalPct = n / Nsteps; break; }
    }
  }

  return { curve, optimalPct };
}
