/**
 * Labadié — Scheduling TWAP / VWAP / PoV (electronic-trading.pdf + lectures_2016_algo_trading)
 * Algoritmos de ejecución base junto al Almgren-Chriss óptimo (execution-curve.ts).
 * TWAP: vₙ = Total/N  (±ε anti-detección)
 * VWAP: vₙ = Total·wₙ, wₙ=Vₙ/ΣV (curva histórica)
 * PoV:  vₙ = c·Vₙ (participación fija), horizonte = parte de la solución
 * PoV dinámico por tramos de precio (ej apertura 100: <98→75%, [98,102]→50%, >102→25%)
 */

export interface SchedulePoint { step: number; volume: number; cumulative: number; price?: number }

function toSchedule(volumes: number[]): SchedulePoint[] {
  let cum = 0;
  return volumes.map((v, i) => {
    cum += v;
    return { step: i, volume: v, cumulative: cum };
  });
}

function normalizeProfile(profile: number[] | undefined, n: number): number[] {
  if (!profile || profile.length === 0) return new Array(n).fill(1 / n);
  let prof: number[];
  if (profile.length === n) prof = profile.slice();
  else {
    prof = new Array(n).fill(0).map((_, i) => {
      const pos = (i / Math.max(1, n - 1)) * (profile.length - 1);
      const lo = Math.floor(pos), hi = Math.ceil(pos);
      if (lo === hi) return Math.max(0, profile[lo] ?? 0);
      const f = pos - lo;
      return Math.max(0, (profile[lo] ?? 0) * (1 - f) + (profile[hi] ?? 0) * f);
    });
  }
  const sum = prof.reduce((s, x) => s + x, 0);
  if (sum <= 0) return new Array(n).fill(1 / n);
  return prof.map((x) => x / sum);
}

// TWAP: N tramos iguales, jitter opcional anti-detección (ε acciones, τ minutos)
export function twapSchedule(params: {
  nSteps: number;
  jitterPct?: number; // ej 0.05 = ±5% por tramo, mantiene Σ=1 tras renormalizar
  seed?: number;
}): SchedulePoint[] {
  const { nSteps, jitterPct = 0 } = params;
  const n = Math.max(2, Math.min(200, nSteps));
  const base = 1 / n;
  let vols = new Array(n).fill(base);
  if (jitterPct > 0) {
    // LCG para reproducibilidad si seed dado
    let s = params.seed ?? 42;
    const rng = () => {
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    vols = vols.map((v) => v * (1 + (rng() * 2 - 1) * jitterPct));
    const sum = vols.reduce((a, b) => a + b, 0);
    vols = vols.map((v) => v / sum);
  }
  return toSchedule(vols);
}

// VWAP: pesos históricos de volumen
export function vwapSchedule(params: {
  nSteps: number;
  volumeProfile: number[]; // Vₙ absolutos o relativos
}): SchedulePoint[] {
  const { nSteps, volumeProfile } = params;
  const n = Math.max(2, Math.min(200, nSteps));
  const w = normalizeProfile(volumeProfile, n);
  return toSchedule(w);
}

// PoV: participación fija c del volumen por tramo; horizonte no es input sino resultado.
// Si se provee volumeProfile (fracciones Σ=1) y volumen diario estimado dailyVol, cada slice es c·Vₙ·dailyVol.
// Normalizado a Σ=1 para comparar schedules: vₙ = c·Vₙ / Σ(c·Vₙ) = Vₙ/ΣVₙ = VWAP weights.
// La diferencia es que PoV es "horizon-agnostic": si Total > c·ΣV, no se completa (riesgo ejecución incompleta).
export function povSchedule(params: {
  nSteps: number;
  participation: number; // c ∈ (0,1), ej 0.1 =10%, 0.5=50%
  volumeProfile?: number[];
}): { schedule: SchedulePoint[]; participation: number; completionRisk: boolean; totalCapacity: number } {
  const { nSteps, participation, volumeProfile } = params;
  const n = Math.max(2, Math.min(200, nSteps));
  const c = Math.min(0.9, Math.max(0.01, participation));
  const prof = normalizeProfile(volumeProfile, n);
  // capacidad total = c·ΣVₙ = c (porque Σprof=1) → fracción del volumen diario capturable
  const totalCapacity = c; // si Total nocional > c·ADV, no se ejecuta todo
  // schedule normalizado (pesos relativos)
  return { schedule: toSchedule(prof), participation: c, completionRisk: totalCapacity < 1, totalCapacity };
}

// PoV dinámico por tramos de precio (electronic-trading.pdf ejemplo apertura 100)
export interface PriceBand { maxPrice?: number; minPrice?: number; participation: number; label: string }

export const POV_BANDS_DEFAULT: PriceBand[] = [
  { maxPrice: 98, participation: 0.75, label: "p < 98 → 75%" },
  { minPrice: 98, maxPrice: 102, participation: 0.5, label: "98 ≤ p ≤ 102 → 50%" },
  { minPrice: 102, participation: 0.25, label: "p > 102 → 25%" },
];

export function participationForPrice(
  price: number,
  refPrice: number,
  bands: PriceBand[] = POV_BANDS_DEFAULT,
): number {
  // bandas relativas a refPrice 100 → escalar si ref distinto
  const scale = refPrice / 100;
  for (const b of bands) {
    const lo = b.minPrice != null ? b.minPrice * scale : -Infinity;
    const hi = b.maxPrice != null ? b.maxPrice * scale : Infinity;
    if (price >= lo && price <= hi) return b.participation;
  }
  return 0.5;
}

export function povDynamicSchedule(params: {
  prices: number[]; // S por step (para elegir participación)
  refPrice: number;
  bands?: PriceBand[];
  volumeProfile?: number[];
}): SchedulePoint[] {
  const { prices, refPrice, bands = POV_BANDS_DEFAULT, volumeProfile } = params;
  const n = prices.length;
  if (n === 0) return [];
  const prof = normalizeProfile(volumeProfile, n);
  const parts = prices.map((p) => participationForPrice(p, refPrice, bands));
  // volumen por step = participación(p)·Vₙ
  let raw = parts.map((c, i) => c * (prof[i] ?? 1 / n));
  const sum = raw.reduce((s, v) => s + v, 0) || 1;
  raw = raw.map((v) => v / sum);
  return raw.map((v, i) => ({
    step: i,
    volume: v,
    cumulative: raw.slice(0, i + 1).reduce((s, x) => s + x, 0),
    price: prices[i],
  }));
}

// Benchmarks: comparación de schedules (para informe)
export function benchmarkSchedules(params: {
  nSteps: number;
  volumeProfile: number[];
}): { twap: SchedulePoint[]; vwap: SchedulePoint[]; pov10: SchedulePoint[]; pov50: SchedulePoint[] } {
  const { nSteps, volumeProfile } = params;
  return {
    twap: twapSchedule({ nSteps }),
    vwap: vwapSchedule({ nSteps, volumeProfile }),
    pov10: povSchedule({ nSteps, participation: 0.1, volumeProfile }).schedule,
    pov50: povSchedule({ nSteps, participation: 0.5, volumeProfile }).schedule,
  };
}
