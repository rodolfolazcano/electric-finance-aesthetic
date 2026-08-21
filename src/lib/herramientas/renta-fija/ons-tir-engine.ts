// @ts-nocheck
export interface Flow {
  fecha: Date;
  monto: number;
  tipo?: string;
}

export interface RawFlow {
  fecha: string;
  tipo?: string;
  monto_por_cien?: number;
  cupon_pct?: number;
  amort_pct?: number;
  moneda?: string;
}

export interface TirResult {
  tir: number | null;
  tea: number | null;
  tna: number | null;
  precioUsdPar100: number;
  durationMacaulay: number | null;
  durationModificada: number | null;
  paridad: number;
  flujos: Array<{ fecha: string; dias: number; monto: number; pv: number }>;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function normalizarFlujo(f: RawFlow): Flow {
  const [y, m, d] = f.fecha.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const monto =
    f.cupon_pct !== undefined || f.amort_pct !== undefined
      ? (f.cupon_pct ?? 0) + (f.amort_pct ?? 0)
      : (f.monto_por_cien ?? 0);
  return { fecha, monto, tipo: f.tipo };
}

export function npv(flows: Flow[], r: number, valuation: Date): number {
  let total = 0;
  for (const f of flows) {
    if (f.fecha <= valuation) continue;
    const t = daysBetween(valuation, f.fecha) / 365;
    total += f.monto / Math.pow(1 + r, t);
  }
  return total;
}

export function calcularTIR(
  flows: Flow[],
  precioUsdPar100: number,
  valuation: Date = new Date(),
): number | null {
  const future = flows.filter((f) => f.fecha > valuation);
  if (future.length === 0) return null;
  const f = (r: number) => npv(future, r, valuation) - precioUsdPar100;

  let lo = -0.9;
  let hi = 5.0;
  let flo = f(lo);
  let fhi = f(hi);
  if (flo * fhi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-10 || (hi - lo) / 2 < 1e-10) return mid;
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

export function precioAUsdPar100(
  precioArs: number,
  fxMep: number,
  precioUsdDirecto?: number | null,
): number {
  if (precioUsdDirecto != null) return precioUsdDirecto;
  return (precioArs * 100) / fxMep;
}

export function calcularTEA(tir: number | null, freq: number): number | null {
  if (tir == null) return null;
  return Math.pow(1 + tir / freq, freq) - 1;
}

export function calcularTNA(tir: number | null, freq: number): number | null {
  if (tir == null) return null;
  return tir;
}

export function durationMacaulay(
  flows: Flow[],
  tir: number,
  valuation: Date,
): number | null {
  const future = flows.filter((f) => f.fecha > valuation);
  if (future.length === 0) return null;
  let sumPV = 0;
  let sumTPV = 0;
  for (const f of future) {
    const t = daysBetween(valuation, f.fecha) / 365;
    const pv = f.monto / Math.pow(1 + tir, t);
    sumPV += pv;
    sumTPV += t * pv;
  }
  if (sumPV <= 0) return null;
  return sumTPV / sumPV;
}

export function durationModificada(
  dMacaulay: number | null,
  tir: number | null,
  freq: number,
): number | null {
  if (dMacaulay == null || tir == null || tir <= -1) return null;
  return dMacaulay / (1 + tir / freq);
}

export function calcularRendimientosON(
  flows: Flow[],
  precio: number,
  valorResidual: number = 100,
  freq: number = 2,
  valuation: Date = new Date(),
): TirResult {
  const precioUsdPar100 = precio;
  const tir = calcularTIR(flows, precioUsdPar100, valuation);
  const tea = calcularTEA(tir, freq);
  const tna = calcularTNA(tir, freq);
  const dMac = tir != null ? durationMacaulay(flows, tir, valuation) : null;
  const dMod = durationModificada(dMac, tir, freq);
  const paridad = valorResidual > 0 ? (precio / valorResidual) * 100 : 0;

  const flujos = flows
    .filter((f) => f.fecha > valuation)
    .map((f) => {
      const dias = daysBetween(valuation, f.fecha);
      const t = dias / 365;
      const pv = tir != null ? f.monto / Math.pow(1 + tir, t) : 0;
      return {
        fecha: f.fecha.toISOString().slice(0, 10),
        dias,
        monto: f.monto,
        pv,
      };
    });

  return { tir, tea, tna, precioUsdPar100, durationMacaulay: dMac, durationModificada: dMod, paridad, flujos };
}

// Re-export proyectarInversion from the main TIR engine (renta-fija.functions.ts)
// This consolidates both TIR engines while maintaining backward compatibility
export { proyectarInversion } from "../renta-fija.functions";
