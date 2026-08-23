/**
 * Procesamiento de cadena de opciones BCBA — port TS de opciones_service.py.
 * Días hábiles XBUE vía ArgentinaDatos (feriados) con fallback Mon-Fri.
 */

import {
  blackScholes,
  binomial,
  sesgoVolatilidad,
  varDeltaGamma,
  volatilidadImplicita,
  type Greeks,
} from "./black-scholes.functions";
import type { OpcionIolRaw } from "./iol";

const cacheFeriados = new Map<number, Set<string>>();

async function feriadosAnio(anio: number): Promise<Set<string>> {
  const cached = cacheFeriados.get(anio);
  if (cached) return cached;
  let set = new Set<string>();
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${anio}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = (await res.json()) as Array<{ fecha?: string }>;
      set = new Set(data.map((f) => f.fecha ?? "").filter(Boolean));
    }
  } catch {
    /* fallback Mon-Fri */
  }
  cacheFeriados.set(anio, set);
  return set;
}

/** Días hábiles BCBA entre dos fechas UTC (inclusive desde, exclusive hasta). */
export async function diasHabilesArgentinos(desde: Date, hasta: Date): Promise<number> {
  const [f1, f2] = await Promise.all([
    feriadosAnio(desde.getUTCFullYear()),
    feriadosAnio(hasta.getUTCFullYear()),
  ]);
  const feriados = new Set([...f1, ...f2]);
  let count = 0;
  const cursor = new Date(desde);
  while (cursor < hasta) {
    const dow = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !feriados.has(iso)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function procesarMonto(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === "string") {
    const limpio = valor.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(limpio);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extraerStrike(opcion: OpcionIolRaw): number | null {
  const desc = String(opcion.descripcion ?? "");
  const tokens = desc.split(/\s+/);
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 4); i--) {
    if (/^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$|^\d+[.,]\d+$/.test(tokens[i])) {
      const n = procesarMonto(tokens[i]);
      if (n > 0) return n < 10 ? n * 1000 : n;
    }
  }
  return null;
}

export interface OpcionProcesada extends Record<string, unknown> {
  simbolo: string;
  tipoOpcion: "Call" | "Put";
  strike: number;
  fechaVencimiento: string;
  T: number;
  precioOpcion: number;
  bid: number;
  ask: number;
  moneyness: "ITM" | "OTM" | "ATM";
  iv: number | null;
  greeks: Greeks | null;
  binomialAmericana: number | null;
  var95: number | null;
  probItm: number;
  probOtm: number;
}

export async function procesarCadena(
  cruda: OpcionIolRaw[],
  spot: number,
  opts: {
    tasaRiesgo?: number;
    volHistorica?: number;
    pasosBinomial?: number;
    conBinomial?: boolean;
  } = {},
): Promise<OpcionProcesada[]> {
  const tasa = opts.tasaRiesgo ?? 0.05;
  const volHist = opts.volHistorica ?? 0.35;
  const ahora = new Date();
  const salida: OpcionProcesada[] = [];

  for (const op of cruda) {
    const tipo = (op.tipoOpcion === "Put" ? "Put" : "Call") as "Call" | "Put";
    const strike = extraerStrike(op);
    if (!strike || strike <= 0) continue;

    const vencStr = String(op.fechaVencimiento ?? "");
    if (!vencStr) continue;
    const vencimiento = new Date(
      vencStr.includes("T") ? vencStr : `${vencString(vencStr)}T00:00:00Z`,
    );
    if (Number.isNaN(vencimiento.getTime())) continue;

    const habiles = await diasHabilesArgentinos(ahora, vencimiento);
    const T = habiles / 252;
    if (T <= 0) continue;

    const cot = op.cotizacion ?? {};
    const precioOpcion = procesarMonto(cot.ultimoPrecio ?? 0);
    if (precioOpcion <= 0) continue;
    let bid = procesarMonto(cot.bid ?? 0);
    let ask = procesarMonto(cot.ask ?? 0);
    if (bid <= 0) bid = precioOpcion * 0.95;
    if (ask <= 0) ask = precioOpcion * 1.05;

    const iv = volatilidadImplicita(tipo, spot, strike, T, tasa, precioOpcion, 0, volHist);
    const greeks = blackScholes(tipo, spot, strike, T, tasa, iv ?? volHist, 0);
    const sigmaParaBinomial = iv ?? volHist;
    const binom =
      opts.conBinomial === true
        ? binomial(
            tipo,
            spot,
            strike,
            T,
            tasa,
            sigmaParaBinomial,
            opts.pasosBinomial ?? 100,
            0,
            true,
          )
        : null;
    const var95 =
      greeks && Number.isFinite(greeks.delta) && Number.isFinite(greeks.gamma)
        ? varDeltaGamma(spot, greeks.delta, greeks.gamma, sigmaParaBinomial)
        : null;

    const moneyness: "ITM" | "OTM" | "ATM" =
      Math.abs(strike - spot) / spot < 0.005
        ? "ATM"
        : (tipo === "Call") === strike < spot
          ? "ITM"
          : "OTM";

    salida.push({
      simbolo: String(op.simbolo ?? ""),
      tipoOpcion: tipo,
      strike,
      fechaVencimiento: vencimiento.toISOString().slice(0, 10),
      T,
      precioOpcion,
      bid,
      ask,
      moneyness,
      iv,
      greeks,
      binomialAmericana: binom,
      var95,
      probItm: greeks?.probItm ?? 0,
      probOtm: greeks ? 1 - greeks.probItm : 1,
    });
  }

  return salida.sort(
    (a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.strike - b.strike,
  );
}

function vencString(fecha: string): string {
  // Acepta dd/MM/yyyy o yyyy-MM-dd
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
    const [d, m, y] = fecha.split("/");
    return `${y}-${m}-${d}`;
  }
  return fecha;
}

export { sesgoVolatilidad };

// Superficie de volatilidad: IV por strike y vencimiento (smile + term structure)
export interface VolSurfacePoint { strike: number; vencimiento: string; T: number; iv: number; delta: number | null }
export function construirSuperficieVol(opciones: OpcionProcesada[]): {
  smile: VolSurfacePoint[];
  termStructure: Array<{ vencimiento: string; T: number; atmIv: number | null }>;
  skew: number | null;
} {
  const smile: VolSurfacePoint[] = opciones
    .filter((o) => o.iv != null)
    .map((o) => ({ strike: o.strike, vencimiento: o.fechaVencimiento, T: o.T, iv: o.iv!, delta: o.greeks?.delta ?? null }))
    .sort((a, b) => a.T - b.T || a.strike - b.strike);
  const byExp = new Map<string, typeof smile>();
  for (const p of smile) {
    const arr = byExp.get(p.vencimiento) ?? [];
    arr.push(p);
    byExp.set(p.vencimiento, arr);
  }
  const termStructure = Array.from(byExp.entries())
    .map(([venc, pts]) => {
      const atm = pts.reduce((best, cur) => {
        if (!best) return cur;
        // más cercano a delta 0.5 ≈ ATM
        const dBest = Math.abs((best.delta ?? 0.5) - 0.5);
        const dCur = Math.abs((cur.delta ?? 0.5) - 0.5);
        return dCur < dBest ? cur : best;
      }, null as any);
      return { vencimiento: venc, T: atm?.T ?? pts[0].T, atmIv: atm?.iv ?? null };
    })
    .sort((a, b) => a.T - b.T);
  // skew: (IV puts OTM - IV calls OTM)/ATM
  let skew: number | null = null;
  if (smile.length >= 4 && termStructure.length) {
    const front = byExp.get(termStructure[0].vencimiento) ?? [];
    const puts = front.filter((p) => (p.delta ?? 0) < 0.3 && p.delta! > 0);
    const calls = front.filter((p) => (p.delta ?? 1) > 0.7);
    if (puts.length && calls.length && termStructure[0].atmIv) {
      const avgPut = puts.reduce((s, p) => s + p.iv, 0) / puts.length;
      const avgCall = calls.reduce((s, p) => s + p.iv, 0) / calls.length;
      skew = ((avgPut - avgCall) / termStructure[0].atmIv) * 100;
    }
  }
  return { smile, termStructure, skew };
}
