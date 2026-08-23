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
  volumeProfile?: number[]; // Gap 2: perfil relativo V(n)/ΣV por slice (normalizado Σ=1). Si omite → uniforme V=1/N.
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

// Variante heterogénea: caps por slice q·V(n) (Gap 2, §2.6 con V(n) no uniforme)
function projectCappedSimplexHetero(vols: number[], caps: number[]): number[] {
  const n = vols.length;
  const sumCaps = caps.reduce((s, c) => s + Math.max(0, c), 0);
  const effCaps = sumCaps < 1 - 1e-9
    ? caps.map(() => 1 / n)
    : caps.map((c) => Math.max(0, c));
  let v = vols.map((x) => Math.max(0, x));
  for (let iter = 0; iter < n + 5; iter++) {
    const total = v.reduce((s, x) => s + x, 0);
    if (total === 0) return new Array(n).fill(1 / n);
    const scaled = v.map((x) => x / total);
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (scaled[i] > effCaps[i]! + 1e-9) {
        v[i] = effCaps[i]!;
        changed = true;
      } else {
        v[i] = scaled[i];
      }
    }
    if (!changed) return v;
  }
  // Fallback post-iteración: si sum !=1, redistribuir déficit entre no capeados proporcionalmente
  let sum = v.reduce((s, x) => s + x, 0);
  if (Math.abs(sum - 1) > 1e-9 && sum > 0) {
    // Identificar capeados (en el límite) vs libres
    const isCapped = v.map((val, i) => Math.abs(val - effCaps[i]!) < 1e-9);
    const sumCapped = v.reduce((s, val, i) => s + (isCapped[i] ? val : 0), 0);
    const sumFree = sum - sumCapped;
    const deficit = 1 - sum;
    if (sumFree > 1e-12) {
      for (let i = 0; i < n; i++) if (!isCapped[i]) v[i] += deficit * (v[i] / sumFree);
    } else {
      // Todo capeado pero sum<1 → repartir déficit uniforme entre no capeados no hay → escalar todo
      v = v.map((x) => x / sum);
    }
    // Re-normalizar por seguridad
    const s2 = v.reduce((s, x) => s + x, 0);
    if (Math.abs(s2 - 1) > 1e-9) v = v.map((x) => x / s2);
  }
  return v;
}

function normalizeVolumeProfile(input: number[] | undefined, n: number): number[] {
  if (!input || input.length === 0) return new Array(n).fill(1 / n);
  // Si longitud no coincide, remuestrear por interpolación lineal simple
  let prof: number[];
  if (input.length === n) prof = input.slice();
  else {
    prof = new Array(n).fill(0).map((_, i) => {
      const pos = (i / Math.max(1, n - 1)) * (input.length - 1);
      const lo = Math.floor(pos), hi = Math.ceil(pos);
      if (lo === hi) return Math.max(0, input[lo] ?? 0);
      const frac = pos - lo;
      return Math.max(0, (input[lo] ?? 0) * (1 - frac) + (input[hi] ?? 0) * frac);
    });
  }
  const sum = prof.reduce((s, x) => s + x, 0);
  if (sum <= 0) return new Array(n).fill(1 / n);
  return prof.map((x) => x / sum);
}

export function calcularCurvaOptima(params: ExecutionCurveParams): {
  curve: TradingCurvePoint[];
  optimalPct: number;
} {
  const { algo, T, sigma, hurst, gamma, participationRate, kappa = 1, alphaMinPct = 0.01, maxIter = 50, volumeProfile } = params;
  const Nsteps = Math.min(Math.max(2, T), 100);
  const H = Math.min(0.91, Math.max(0.25, hurst)); // Labadié §4.3 p∈[1.1,4] → H∈[0.25,0.91] clamp canónico
  const tau = 1 / Nsteps; // fracción horizonte (paper: τ = t_n - t_{n-1} );
  const sigma2tau = sigma * sigma * Math.pow(tau, 2 * H - 1);
  const tauH = Math.pow(tau, H);
  const volProf = normalizeVolumeProfile(volumeProfile, Nsteps);
  const useHetero = !!volumeProfile && volumeProfile.length > 0;
  // Caps por slice: q·V(n) con V normalizado; si heterogéneo cada slice tiene su propio cap
  const heteroCaps = useHetero ? volProf.map((vn) => participationRate * vn * Nsteps) : null;
  // I' heterogéneo por slice: d/dv[ κσ τ^H (v/V(n))^γ ] — evaluar en participación de referencia por slice
  function iPrimeAt(n: number): number {
    const Vn = volProf[n] ?? 1 / Nsteps;
    // V(n) efectivo: fracción del volumen del día en ese slice;Participation ref relativa a Vn
    const refPart = participationRate;
    // I'(v) = κσ τ^H γ (v/Vn)^{γ-1} / Vn^{?} — simplificamos V=1 base por slice con Vn escalado
    // Con V(n) heterogéneo, impacto por unidad ejecutada escala como Vn^{-γ}; aproximamos como:
    return kappa * sigma * tauH * gamma * Math.pow(Math.max(0.001, refPart), gamma - 1) * Math.pow(Math.max(1e-6, Vn * Nsteps), -gamma + 1);
  }
  const I_prime_uniform = kappa * sigma * tauH * gamma * Math.pow(Math.max(0.001, participationRate), gamma - 1);
  const pVolMax = participationRate;

  const volumes = new Array(Nsteps).fill(1 / Nsteps);

  if (algo === "tc") {
    for (let iter = 0; iter < maxIter; iter++) {
      const prev = [...volumes];
      for (let n = 0; n < Nsteps; n++) {
        let sumFuture = 0;
        for (let j = n + 1; j < Nsteps; j++) sumFuture += volumes[j];
        const Iprime = useHetero ? iPrimeAt(n) : I_prime_uniform;
        const denom = Iprime + sigma2tau * (Nsteps - n);
        if (denom > 0) volumes[n] = (sigma2tau * sumFuture) / denom;
      }
      // PVol constraint §2.6 vía proyección capeada (heterogénea si hay perfil)
      const projected = heteroCaps ? projectCappedSimplexHetero([...volumes], heteroCaps) : projectCappedSimplex([...volumes], pVolMax);
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
        const Iprime = useHetero ? iPrimeAt(n) : I_prime_uniform;
        const denom = Iprime + sigma2tau * n;
        if (denom > 0) volumes[n] = (sigma2tau * sumPast) / denom;
      }
      const projected = heteroCaps ? projectCappedSimplexHetero([...volumes], heteroCaps) : projectCappedSimplex([...volumes], pVolMax);
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

// ─── Gap 1: Calibración inversa p desde tiempo de inicio deseado (§4.3) ─────
// Dado un targetStartPct deseado (0-1), encuentra p(=1/H) tal que optimalPct ≈ target.
// Usa monotonía del paper: p↑ ⟺ TC arranca más tarde. Bisección sobre H∈[0.25,0.91].
export function impliedPFromStartTime(params: {
  targetStartPct: number;
  algo?: "tc" | "is";
  T: number;
  sigma: number;
  gamma: number;
  participationRate: number;
  kappa?: number;
  alphaMinPct?: number;
  volumeProfile?: number[];
}): { impliedP: number; hurst: number; achievedStartPct: number } {
  const { targetStartPct, algo = "tc", T, sigma, gamma, participationRate, kappa, alphaMinPct, volumeProfile } = params;
  const target = Math.min(0.95, Math.max(0, targetStartPct));
  let lo = 0.25, hi = 0.91;
  // Evaluar extremos para detectar dirección monótona
  const pctAt = (H: number) => calcularCurvaOptima({ algo, T, sigma, hurst: H, gamma, participationRate, kappa, alphaMinPct, volumeProfile }).optimalPct;
  const loPct = pctAt(lo);
  const hiPct = pctAt(hi);
  // Si no hay monotonía estricta (casos degenerados con cap), devolver el más cercano
  if (Math.abs(hiPct - loPct) < 1e-6) {
    const Hmid = 0.5;
    return { impliedP: 1 / Hmid, hurst: Hmid, achievedStartPct: pctAt(Hmid) };
  }
  // Bisección ~20 iteraciones → precisión ~1e-6
  for (let iter = 0; iter < 25; iter++) {
    const mid = (lo + hi) / 2;
    const midPct = pctAt(mid);
    if (Math.abs(midPct - target) < 0.005) {
      return { impliedP: 1 / mid, hurst: mid, achievedStartPct: midPct };
    }
    // Monotonía: p↑ (H↓) ??? Paper: p aumenta ↔ TC starts later. Como p=1/H, H↓ → p↑ → start later → pct ↑
    // Entonces pct crece cuando H decrece → función pct(H) es decreciente. Verificamos con lo/hi.
    // Si hiPct > loPct: decreciente con H baja → high H = low pct, low H = high pct → pct decrece con H.
    // Bisección adaptativa según signo observado.
    const increasing = hiPct < loPct; // ¿pct decrece con H? (lo=0.25 p=4 high start, hi=0.91 p=1.1 low start) → esperado increasing=false? Re-evaluamos.
    // Real: probamos midPct vs target: si midPct < target necesitamos ir a menor H (más p, más tarde) → hi = mid si pct decrece con H.
    if (hiPct > loPct) {
      // pct crece con H (anti-teórico) — invertir lógica
      if (midPct < target) lo = mid; else hi = mid;
    } else {
      // pct decrece con H (esperado teórico)
      if (midPct < target) hi = mid; else lo = mid;
    }
  }
  const Hfinal = (lo + hi) / 2;
  return { impliedP: 1 / Hfinal, hurst: Hfinal, achievedStartPct: pctAt(Hfinal) };
}

// ─── Gap 4: Costos esperados / risk adjustment ──────────────────────────────
export interface ExecutionCostEstimate {
  expectedImpactBps: number; // costo de impacto esperado en bps del nocional
  varianceTerm: number;      // término de varianza (adimensional, escala σ²τ^{2H-1})
  riskAdjustment: number;    // λ·varianza con λ=0.5 por defecto
  totalCostBps: number;      // expected + riskAdjustment
}
export function estimateExecutionCosts(
  curve: TradingCurvePoint[],
  params: { sigma: number; hurst: number; gamma: number; kappa?: number; volumeProfile?: number[]; lambda?: number },
): ExecutionCostEstimate {
  const { sigma, hurst, gamma, kappa = 1, volumeProfile, lambda = 0.5 } = params;
  const n = curve.length;
  if (n === 0) return { expectedImpactBps: 0, varianceTerm: 0, riskAdjustment: 0, totalCostBps: 0 };
  const H = Math.min(0.91, Math.max(0.25, hurst));
  const tauH = Math.pow(1 / n, H);
  const volProf = normalizeVolumeProfile(volumeProfile, n);
  let impact = 0;
  for (let i = 0; i < n; i++) {
    const v = curve[i]!.volume;
    const Vn = volProf[i] ?? 1 / n;
    // κ σ τ^H (v/Vn)^γ — en fracción del precio; convertir a bps (*1e4)
    const ratio = Vn > 1e-9 ? v / Vn : 0;
    impact += kappa * sigma * tauH * Math.pow(Math.max(0, ratio), gamma);
  }
  const expectedImpactBps = impact * 1e4;
  // Varianza aproximada: σ² τ^{2H-1} Σ w_i² (peso cuadrático del schedule)
  const sigma2tau = sigma * sigma * Math.pow(1 / n, 2 * H - 1);
  let sumSq = 0;
  for (const p of curve) sumSq += p.volume * p.volume;
  const varianceTerm = sigma2tau * sumSq;
  const riskAdjustment = lambda * varianceTerm * 1e4;
  return { expectedImpactBps, varianceTerm, riskAdjustment, totalCostBps: expectedImpactBps + riskAdjustment };
}
