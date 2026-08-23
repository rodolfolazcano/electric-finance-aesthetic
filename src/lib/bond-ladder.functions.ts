// src/lib/bond-ladder.functions.ts
// Calculadora de escalera de bonos con TIR ponderada por nominal y flujos de caja

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface FlujoFuturo {
  fecha: string; // YYYY-MM-DD
  monto: number; // por cada 100 VN
}

export interface BonoInput {
  ticker: string;
  tickerApi: string;
  mercado?: string;
  tipo: "Hard Dollar" | "Dollar-Linked" | "CER" | "LECAP" | "Tasa Fija ARS" | "TAMAR";
  flujosPorCada100VN: FlujoFuturo[];
  vencimiento: string;
  monedaFlujos: "USD" | "ARS";
}

export interface BonoTIRResult {
  ticker: string;
  tipo: string;
  moneda: string;
  tir: number | null; // decimal, ej 0.45 = 45% TEA
  tirPct: string;
  flujos: FlujoDetail[];
  precio: number | null;
  dirtyPrice?: number;
}

export interface FlujoDetail {
  fecha: string;
  montoOriginal: number;
  montoAjustado: number;
  tcProyectado?: number;
}

export interface LadderResult {
  bonos: BonoTIRResult[];
  portafolioTIR: number | null;
  portafolioTIRPct: string;
  flujosCombinados: CombinedFlujo[];
  totalNominal: number;
}

export interface CombinedFlujo {
  fecha: string;
  montoARS: number;
  componentes: { ticker: string; monto: number }[];
}

function parseFecha(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function diffDias(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function npv(tir: number, fechas: Date[], montos: number[], fechaHoy: Date): number {
  let total = 0;
  for (let i = 0; i < fechas.length; i++) {
    const dias = diffDias(fechas[i], fechaHoy);
    if (tir <= -1) return 1e20;
    total += montos[i] / Math.pow(1 + tir, dias / 365);
  }
  return total;
}

function newtonRaphsonTIR(
  flujos: { fecha: Date; monto: number }[],
  precioActual: number,
  fechaHoy: Date,
  initialGuess = 0.15,
  maxIter = 200,
): number | null {
  const futuros = flujos.filter((f) => f.fecha > fechaHoy);
  if (!futuros.length) return null;

  const fechas: Date[] = [fechaHoy];
  const montos: number[] = [-precioActual];
  for (const f of futuros) {
    fechas.push(f.fecha);
    montos.push(f.monto);
  }

  let tir = initialGuess;
  for (let iter = 0; iter < maxIter; iter++) {
    const v = npv(tir, fechas, montos, fechaHoy);
    const h = 1e-8;
    const dv = (npv(tir + h, fechas, montos, fechaHoy) - v) / h;
    if (Math.abs(dv) < 1e-15) break;
    const tirNext = tir - v / dv;
    if (Math.abs(tirNext - tir) < 1e-10) {
      tir = tirNext;
      break;
    }
    tir = tirNext;
    if (tir < -0.999) return null;
  }
  if (!Number.isFinite(tir) || Math.abs(tir) > 10) return null;
  return tir;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function obtenerTC(): Promise<number> {
  const d = await fetchJson("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial");
  if (Array.isArray(d) && d.length) return d[d.length - 1]?.venta ?? 1000;
  return 1000;
}

/**
 * Obtiene MEP/CCL live para Dollar-Linked y ladder.
 * Orden: argentinadatos bolsa → contadoconliqui → criptoya → fallback oficial*1.25
 */
export async function obtenerMEP(): Promise<number> {
  // 1) argentinadatos bolsa (MEP)
  const mep = await fetchJson("https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa");
  if (Array.isArray(mep) && mep.length) {
    const v = mep[mep.length - 1]?.venta;
    if (typeof v === "number" && v > 100) return v;
  }
  // 2) ccl como proxy
  const ccl = await fetchJson("https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui");
  if (Array.isArray(ccl) && ccl.length) {
    const v = ccl[ccl.length - 1]?.venta;
    if (typeof v === "number" && v > 100) return v;
  }
  // 3) criptoya
  const cy = await fetchJson("https://criptoya.com/api/dolar");
  if (cy?.mep?.price && cy.mep.price > 100) return cy.mep.price;
  if (cy?.ccl?.price && cy.ccl.price > 100) return cy.ccl.price;
  // 4) fallback oficial*spread histórico ~1.25
  const oficial = await obtenerTC();
  return Math.round(oficial * 1.25);
}

function proyectarTC(tc: number, fechaActual: Date, fechaObjetivo: Date, tasaAnual = 0.3): number {
  const dias = diffDias(fechaObjetivo, fechaActual);
  const anios = dias / 365;
  return tc * Math.pow(1 + tasaAnual, anios);
}

function calcularTIRBono(
  bono: BonoInput,
  precio: number,
  fechaHoy: Date,
  tc?: number,
): BonoTIRResult {
  const flujos: FlujoDetail[] = [];
  const flujosXIRR: { fecha: Date; monto: number }[] = [];

  for (const f of bono.flujosPorCada100VN) {
    const fechaFlujo = parseFecha(f.fecha);
    if (fechaFlujo <= fechaHoy) continue;

    let montoAjustado = f.monto;
    let tcProyectado: number | undefined;

    if (bono.tipo === "Dollar-Linked" && tc != null) {
      tcProyectado = proyectarTC(tc, fechaHoy, fechaFlujo);
      montoAjustado = f.monto * tcProyectado;
    }

    flujos.push({ fecha: f.fecha, montoOriginal: f.monto, montoAjustado, tcProyectado });
    flujosXIRR.push({ fecha: fechaFlujo, monto: montoAjustado });
  }

  const tir = newtonRaphsonTIR(flujosXIRR, precio, fechaHoy);
  return {
    ticker: bono.ticker,
    tipo: bono.tipo,
    moneda: bono.monedaFlujos,
    tir,
    tirPct: tir != null ? `${(tir * 100).toFixed(2)}%` : "N/A",
    flujos,
    precio,
  };
}

async function fetchIOLPrecio(
  ticker: string,
  mercado: string,
  token: string,
): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.invertironline.com/api/v2/${mercado}/Titulos/${ticker}/Cotizacion`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
    );
    if (r.ok) {
      const d = await r.json();
      return d.ultimoPrecio ?? d.ultima?.precio ?? null;
    }
  } catch {}
  return null;
}

async function fetchIOLToken(): Promise<string | null> {
  try {
    const r = await fetch("https://api.invertironline.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: process.env.IOL_USER ?? "boosandr97@gmail.com",
        password: process.env.IOL_PASS ?? "Chule348936_",
        grant_type: "password",
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.access_token ?? null;
    }
  } catch {}
  return null;
}

export const getBondLadder = createServerFn({ method: "GET" })
  .validator(
    z.object({
      tickers: z
        .array(
          z.object({
            ticker: z.string(),
            tickerApi: z.string(),
            tipo: z.string(),
            mercado: z.string().optional(),
            flujos: z.array(z.object({ fecha: z.string(), monto: z.number() })),
            vencimiento: z.string(),
            monedaFlujos: z.string(),
          }),
        )
        .optional()
        .default([]),
      nominales: z.record(z.string(), z.number()).optional().default({}),
      precioManual: z.record(z.string(), z.number()).optional().default({}),
    }),
  )
  .handler(async ({ data }) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const bonos: BonoInput[] = (data.tickers || []).map((t: any) => ({
      ticker: t.ticker,
      tickerApi: t.tickerApi,
      mercado: t.mercado,
      tipo: t.tipo as BonoInput["tipo"],
      flujosPorCada100VN: t.flujos.map((f: any) => ({ fecha: f.fecha, monto: f.monto })),
      vencimiento: t.vencimiento,
      monedaFlujos: t.monedaFlujos as "USD" | "ARS",
    }));

    const nominales = data.nominales as Record<string, number>;
    const precioManual = data.precioManual as Record<string, number>;

    const tc = await obtenerTC();
    const token = await fetchIOLToken();

    const results: BonoTIRResult[] = [];

    for (const bono of bonos) {
      const nom = nominales[bono.ticker] ?? 100;
      let precio: number | null = precioManual[bono.ticker] ?? null;

      if (precio == null && token) {
        precio = await fetchIOLPrecio(bono.tickerApi, bono.mercado ?? "bCBA", token);
      }
      if (precio == null) {
        precio = 100;
      }

      const tirResult = calcularTIRBono(
        bono,
        precio,
        hoy,
        bono.monedaFlujos === "USD" ? tc : undefined,
      );
      results.push(tirResult);
    }

    // Combined cash flows across all bonds
    const flujosMap = new Map<string, CombinedFlujo>();
    for (const bono of results) {
      const nom = nominales[bono.ticker] ?? 100;
      for (const f of bono.flujos) {
        const existente = flujosMap.get(f.fecha);
        const montoARS = (f.montoAjustado * nom) / 100;
        if (existente) {
          existente.montoARS += montoARS;
          existente.componentes.push({ ticker: bono.ticker, monto: montoARS });
        } else {
          flujosMap.set(f.fecha, {
            fecha: f.fecha,
            montoARS,
            componentes: [{ ticker: bono.ticker, monto: montoARS }],
          });
        }
      }
    }

    const flujosCombinados = Array.from(flujosMap.values()).sort((a, b) =>
      diffDias(parseFecha(a.fecha), parseFecha(b.fecha)),
    );

    // Portfolio TIR: weighted average by nominal proportion
    let totalNominal = 0;
    let tirPonderada = 0;
    for (const ticker in nominales) {
      totalNominal += nominales[ticker];
    }
    for (const bono of results) {
      const nom = nominales[bono.ticker] ?? 0;
      if (bono.tir != null && totalNominal > 0) {
        tirPonderada += bono.tir * (nom / totalNominal);
      }
    }

    const portafolioTIR = totalNominal > 0 ? tirPonderada : null;

  return {
    bonos: results,
    portafolioTIR,
    portafolioTIRPct: portafolioTIR != null ? `${(portafolioTIR * 100).toFixed(2)}%` : "N/A",
    flujosCombinados,
    totalNominal,
  } as LadderResult;
});

// ============================================================================
// NNLS PORTFOLIO LADDER OPTIMIZER
// Resuelve: min ||A·w - b||²  s.t.  w ≥ 0
// donde A[month][bond] = pago por 100 VN en USD, b = target mensual
// ============================================================================

export interface RiskMetrics {
  weightedTirPct: number;
  macaulayDuration: number;
  modDuration: number;
  convexity: number;
  dv01: number;
}

export interface IndividualPayment {
  fecha: Date;
  ticker: string;
  emisor: string;
  tipo: string;
  moneda: string;
  monto: number;
  montoPer100: number;
}

export interface LadderBondInput {
  ticker: string;
  emisor: string;
  nombre: string;
  moneda: string;
  vencimiento: Date;
  tirPublicada: number;
  precioArs: number;
  flujos: Array<{ fecha: Date; monto: number }>;
  paymentModality?: string;
  species?: string;
}

export interface LadderResultExpanded {
  months: string[];
  monthDates: Date[];
  bonds: LadderBondInput[];
  faceUnits: number[];
  investmentArsPerBond: number[];
  investmentUsdPerBond: number[];
  totalInvestmentArs: number;
  totalInvestmentUsd: number;
  monthlyPaymentsByBond: number[][];
  monthlyTotals: number[];
  monthlyTotalsArs: number[];
  currency: "USD" | "ARS";
  targetPerMonth: number;
  achievedMean: number;
  achievedMin: number;
  achievedMax: number;
  perBondSchedule: Array<{
    ticker: string;
    firstPay?: Date;
    lastPay?: Date;
    paymentsInWindow: number;
  }>;
  avgTirPct: number;
  accumulatedSimple: number[];
  accumulatedReinvested: number[];
  risk: RiskMetrics;
  individualPayments: IndividualPayment[];
}

interface BuildOpts {
  bonds: LadderBondInput[];
  targetPerMonth: number;
  currency: "USD" | "ARS";
  months: number;
  valuation: Date;
  fxMep?: number;
  manualFaceUnits?: number[];
  liveUsdPriceMap?: Map<string, number>;
  liveTirValMap?: Map<string, number | null>;
}

function addMonths(d: Date, m: number): Date {
  const nd = new Date(d);
  nd.setUTCMonth(nd.getUTCMonth() + m);
  return nd;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysBetweenDates(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function buildPaymentMatrix(
  bonds: LadderBondInput[],
  valuation: Date,
  _months: number,
  fxMep: number = 1529.3, // @deprecated hardcode histórico — usar obtenerMEP() live. Se mantiene default para compatibilidad/backtest
): { A: number[][]; monthKeys: string[]; monthDates: Date[] } {
  const monthKeys: string[] = [];
  const monthDates: Date[] = [];
  for (let m = 0; m < _months; m++) {
    const d = addMonths(valuation, m);
    monthDates.push(d);
    monthKeys.push(monthKey(d));
  }
  const A: number[][] = Array.from({ length: _months }, () =>
    new Array(bonds.length).fill(0),
  );
  bonds.forEach((b, j) => {
    const isArsFlow = b.paymentModality === "Dólar Linked" || b.paymentModality === "UVA / CER" || b.paymentModality === "Pesos";
    for (const f of b.flujos) {
      if (f.fecha <= valuation) continue;
      const key = monthKey(f.fecha);
      const idx = monthKeys.indexOf(key);
      if (idx >= 0) {
        A[idx][j] += isArsFlow ? f.monto / fxMep : f.monto;
      }
    }
  });
  return { A, monthKeys, monthDates };
}

function nnls(A: number[][], b: number[], maxIter = 4000): number[] {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  if (n === 0) return [];
  const AtA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Atb: number[] = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const aij = A[i][j];
      if (aij === 0) continue;
      Atb[j] += aij * b[i];
      for (let k = 0; k < n; k++) AtA[j][k] += aij * A[i][k];
    }
  }
  let L = 1e-9;
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += Math.abs(AtA[j][k]);
    if (s > L) L = s;
  }
  const step = 1 / L;
  const w = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let s = -Atb[j];
      for (let k = 0; k < n; k++) s += AtA[j][k] * w[k];
      grad[j] = s;
    }
    let maxChange = 0;
    for (let j = 0; j < n; j++) {
      const nw = Math.max(0, w[j] - step * grad[j]);
      maxChange = Math.max(maxChange, Math.abs(nw - w[j]));
      w[j] = nw;
    }
    if (maxChange < 1e-9) break;
  }
  return w;
}

export function buildLadder({
  bonds,
  targetPerMonth,
  currency,
  months,
  valuation,
  fxMep = 1529.3, // @deprecated usar obtenerMEP() live; default se mantiene solo para tests
  manualFaceUnits,
  liveUsdPriceMap,
  liveTirValMap,
}: BuildOpts): LadderResultExpanded {
  if (fxMep === 1529.3) {
    // Nota: caller debería pasar obtenerMEP() live. Log warning en dev para detectar hardcode residual.
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn("[bond-ladder] fxMep hardcode 1529.3 usado — considerar obtenerMEP() live");
    }
  }
  const { A, monthKeys, monthDates } = buildPaymentMatrix(bonds, valuation, months, fxMep);

  const targetUsd = currency === "USD" ? targetPerMonth : targetPerMonth / fxMep;
  const b = new Array(months).fill(targetUsd);

  let w: number[];
  if (manualFaceUnits && manualFaceUnits.length === bonds.length) {
    w = [...manualFaceUnits];
  } else {
    w = nnls(A, b);
  }

  const rawTotals = A.map((row) => row.reduce((s, v, j) => s + v * w[j], 0));
  const rawMean = rawTotals.reduce((s, v) => s + v, 0) / rawTotals.length;
  if (rawMean > 1e-12) {
    const scale = targetUsd / rawMean;
    w = w.map((v) => v * scale);
  }

  const monthlyPaymentsByBond: number[][] = bonds.map((_, j) =>
    A.map((row) => row[j] * w[j]),
  );
  const monthlyTotals = A.map((row, i) => row.reduce((s, v, j) => s + v * w[j], 0));
  const monthlyTotalsArs = monthlyTotals.map((v) => v * fxMep);

  const investmentUsdPerBond = bonds.map((bnd, j) => {
    if (bnd.precioArs > 0) return (bnd.precioArs * 100 / fxMep) * w[j];
    const liveUsd = liveUsdPriceMap?.get(bnd.ticker);
    if (liveUsd != null && liveUsd > 0) return liveUsd * w[j];
    if (bnd.tirPublicada > 0 && bnd.flujos.length > 0) {
      const npvPrice = (() => {
        let total = 0;
        const r = bnd.tirPublicada / 100;
        for (const f of bnd.flujos) {
          if (f.fecha <= valuation) continue;
          const t = daysBetweenDates(valuation, f.fecha) / 365;
          total += f.monto / Math.pow(1 + r, t);
        }
        return total;
      })();
      if (npvPrice > 0) return npvPrice * w[j];
    }
    return 0;
  });
  const investmentArsPerBond = investmentUsdPerBond.map((u) => u * fxMep);
  const totalInvestmentUsd = investmentUsdPerBond.reduce((s, v) => s + v, 0);
  const totalInvestmentArs = investmentArsPerBond.reduce((s, v) => s + v, 0);

  const achievedInCurrency = currency === "USD" ? monthlyTotals : monthlyTotalsArs;
  const achievedMean = achievedInCurrency.reduce((s, v) => s + v, 0) / (achievedInCurrency.length || 1);
  const achievedMin = Math.min(...achievedInCurrency);
  const achievedMax = Math.max(...achievedInCurrency);

  let totalWeight = 0;
  let weightedTir = 0;
  for (let j = 0; j < bonds.length; j++) {
    if (w[j] > 1e-6) {
      const liveTir = liveTirValMap?.get(bonds[j].ticker);
      const tir = (liveTir != null && liveTir > 0) ? liveTir / 100 : bonds[j].tirPublicada / 100;
      const wt = investmentUsdPerBond[j];
      weightedTir += tir * wt;
      totalWeight += wt;
    }
  }
  const avgTirPct = totalWeight > 0 ? (weightedTir / totalWeight) * 100 : 0;
  const rMonthly = Math.pow(1 + avgTirPct / 100, 1 / 12) - 1;

  const achievedVals = currency === "USD" ? monthlyTotals : monthlyTotalsArs;
  const accumulatedSimple: number[] = [];
  const accumulatedReinvested: number[] = [];
  let cum = 0;
  let reinv = 0;
  for (let i = 0; i < months; i++) {
    cum += achievedVals[i];
    accumulatedSimple.push(cum);
    reinv = reinv * (1 + rMonthly) + achievedVals[i];
    accumulatedReinvested.push(reinv);
  }

  const perBondSchedule = bonds.map((bnd, j) => {
    const paysInWindow = bnd.flujos
      .filter((f) => f.fecha > valuation && f.fecha <= addMonths(valuation, months))
      .map((f) => f.fecha);
    return {
      ticker: bnd.ticker,
      firstPay: paysInWindow[0],
      lastPay: paysInWindow[paysInWindow.length - 1],
      paymentsInWindow: paysInWindow.length,
    };
  });

  let macaulayNum = 0;
  let macaulayDen = 0;
  let convexityNum = 0;
  let totalFace = 0;
  const r = avgTirPct / 100;
  for (let j = 0; j < bonds.length; j++) {
    if (w[j] <= 1e-6) continue;
    const bnd = bonds[j];
    const rBond = bnd.tirPublicada / 100;
    totalFace += w[j];
    for (const f of bnd.flujos) {
      if (f.fecha <= valuation) continue;
      if (f.fecha > addMonths(valuation, months)) continue;
      const t = daysBetweenDates(valuation, f.fecha) / 365;
      const pv = (f.monto * w[j]) / Math.pow(1 + rBond, t);
      macaulayNum += t * pv;
      macaulayDen += pv;
      convexityNum += t * (t + 1) * pv;
    }
  }
  const macaulayDur = macaulayDen > 0 ? macaulayNum / macaulayDen : 0;
  const modDur = r !== -1 ? macaulayDur / (1 + r) : 0;
  const convexity = macaulayDen > 0 ? convexityNum / (macaulayDen * (1 + r) * (1 + r)) : 0;
  const weightedAvgPrice = totalFace > 0 ? totalInvestmentUsd / totalFace : 100;
  const dv01 = totalInvestmentUsd > 0 ? modDur * weightedAvgPrice * 0.0001 : 0;

  const risk: RiskMetrics = {
    weightedTirPct: avgTirPct,
    macaulayDuration: macaulayDur,
    modDuration: modDur,
    convexity,
    dv01,
  };

  const individualPayments: IndividualPayment[] = [];
  for (let j = 0; j < bonds.length; j++) {
    if (w[j] <= 1e-6) continue;
    const bnd = bonds[j];
    for (const f of bnd.flujos) {
      if (f.fecha <= valuation) continue;
      if (f.fecha > addMonths(valuation, months)) continue;
      individualPayments.push({
        fecha: f.fecha,
        ticker: bnd.ticker,
        emisor: bnd.emisor,
        tipo: "Cupon",
        moneda: bnd.moneda === "USD" ? "USD" : "ARS",
        monto: (f.monto * w[j]) / 100,
        montoPer100: f.monto,
      });
    }
  }
  individualPayments.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  return {
    months: monthKeys,
    monthDates,
    bonds,
    faceUnits: w,
    investmentArsPerBond,
    investmentUsdPerBond,
    totalInvestmentArs,
    totalInvestmentUsd,
    monthlyPaymentsByBond,
    monthlyTotals,
    monthlyTotalsArs,
    currency,
    targetPerMonth,
    achievedMean,
    achievedMin,
    achievedMax,
    perBondSchedule,
    avgTirPct,
    accumulatedSimple,
    accumulatedReinvested,
    risk,
    individualPayments,
  };
}

export const MONTHLY_TARGET_USD_OPTIONS = [
  { value: 100, label: "USD 100 / mes" },
  { value: 250, label: "USD 250 / mes" },
  { value: 500, label: "USD 500 / mes" },
  { value: 1_000, label: "USD 1.000 / mes" },
  { value: 2_500, label: "USD 2.500 / mes" },
  { value: 5_000, label: "USD 5.000 / mes" },
];

export const MONTHLY_TARGET_ARS_OPTIONS = [
  { value: 150_000, label: "$150.000 / mes" },
  { value: 500_000, label: "$500.000 / mes" },
  { value: 1_000_000, label: "$1.000.000 / mes" },
  { value: 2_500_000, label: "$2.500.000 / mes" },
  { value: 5_000_000, label: "$5.000.000 / mes" },
];

export const LADDER_WINDOW_OPTIONS = [
  { value: 12, label: "12 meses" },
  { value: 24, label: "24 meses" },
  { value: 36, label: "36 meses" },
];
