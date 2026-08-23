// @ts-nocheck
// src/lib/contexto/intermarket.functions.ts — Motor Murphy ÚNICO
// Fuente única para régimen intermarket. Usa SOLO math/stats para regresión/correlación.
// Si Yahoo falla parcialmente: campos null + fallback, NUNCA throw.

import { createServerFn } from "@tanstack/react-start";
import { yahooChartOHLCV } from "@/lib/yahoo-chart";
import { getCached, setCache } from "@/lib/cache";
import { linregress, pearsonR } from "@/lib/math/stats";
import { detectCyclePhase, ROTATION_BY_STAGE, PHASE_MAP } from "@/lib/cycle-phase-detector";
import type { IntermarketRegime, Flecha } from "./contracts";
import { intermarketRegimeFallback } from "./contracts";

// ── Helpers ────────────────────────────────────────────────────────────
function closesToReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

function flechaFromCloses(closes: number[], window = 60): Flecha {
  if (closes.length < window) return "→";
  const slice = closes.slice(-window);
  const xs = slice.map((_, i) => i);
  const r = linregress(xs, slice);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const slopeNorm = mean > 0 ? r.slope / mean : r.slope;
  if (slopeNorm > 0.0005) return "↑";
  if (slopeNorm < -0.0005) return "↓";
  return "→";
}

function ratioValorVar1m(closesA: number[], closesB: number[]): { valor: number | null; var1m: number | null } {
  if (!closesA.length || !closesB.length) return { valor: null, var1m: null };
  const lastA = closesA[closesA.length - 1];
  const lastB = closesB[closesB.length - 1];
  if (!lastB) return { valor: null, var1m: null };
  const valor = lastA / lastB;
  const idx1m = Math.max(0, closesA.length - 22);
  const v1mA = closesA[idx1m];
  const v1mB = closesB[idx1m];
  if (!v1mA || !v1mB || v1mB === 0) return { valor, var1m: null };
  const var1m = ((lastA / lastB) / (v1mA / v1mB) - 1) * 100;
  return { valor, var1m };
}

function crossLagLeader(returnsA: number[], returnsB: number[], labelA: string, labelB: string): { lag: number | null; lider: string; corr: number | null } {
  if (returnsA.length < 30 || returnsB.length < 30) return { lag: null, lider: "sin datos", corr: null };
  let bestLag = 0;
  let bestCorr = 0;
  let bestAbs = 0;
  const n = Math.min(returnsA.length, returnsB.length);
  const a = returnsA.slice(-n);
  const b = returnsB.slice(-n);
  for (let lag = -15; lag <= 15; lag++) {
    if (lag === 0) continue;
    let corr: number | null = null;
    if (lag < 0) {
      const k = Math.abs(lag);
      const aa = a.slice(0, n - k);
      const bb = b.slice(k);
      corr = pearsonR(aa, bb);
    } else {
      const k = lag;
      const aa = a.slice(k);
      const bb = b.slice(0, n - k);
      corr = pearsonR(aa, bb);
    }
    if (corr == null || !isFinite(corr)) continue;
    const ab = Math.abs(corr);
    if (ab > bestAbs) {
      bestAbs = ab;
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestAbs < 0.05) return { lag: null, lider: "sin lider claro", corr: bestCorr };
  const lider = bestLag < 0 ? labelA : labelB;
  return { lag: bestLag, lider, corr: bestCorr };
}

async function mapLimit<T, R>(arr: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (idx < arr.length) {
      const i = idx++;
      out[i] = await fn(arr[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── ServerFn ──────────────────────────────────────────────────────────
export const getIntermarketRegime = createServerFn({ method: "GET" }).handler(async (): Promise<IntermarketRegime> => {
  const fallback = intermarketRegimeFallback();
  const fecha = new Date().toISOString().slice(0, 10);
  const cacheKey = `ctx-intermarket-${fecha}`;
  const cached = getCached<IntermarketRegime>(cacheKey, 15 * 60 * 1000);
  if (cached) return cached;

  try {
    const TICKERS = [
      "DBC", "TLT", "SPY", "GLD", "USO", "HG=F", "XLY", "XLP", "IWM",
      "EFA", "EEM", "IVW", "IVE", "HYG", "LQD",
      "^GSPC", "^NDX", "^DJI", "GC=F",
      "DX-Y.NYB", "^TNX", "^FVX", "^IRX", "^DJT",
    ];

    const results = await mapLimit(TICKERS, 10, async (sym) => {
      const bars = await yahooChartOHLCV(sym, "1y", "1d").catch(() => []);
      const closes = bars.map((b) => b.close).filter((c) => c > 0);
      return { sym, closes };
    });

    const bySym = new Map<string, number[]>();
    for (const r of results) bySym.set(r.sym, r.closes);
    const closes = (s: string) => bySym.get(s) ?? [];
    const last = (s: string) => {
      const c = closes(s);
      return c.length ? c[c.length - 1] : null;
    };

    const flechas = {
      bonos: flechaFromCloses(closes("TLT"), 60),
      acciones: flechaFromCloses(closes("SPY"), 60),
      commodities: flechaFromCloses(closes("DBC"), 60),
    } as IntermarketRegime["flechas"];

    const toTrendArrow = (f: Flecha): "up" | "down" | "flat" | null => (f === "↑" ? "up" : f === "↓" ? "down" : f === "→" ? "flat" : null);
    const stage = detectCyclePhase({
      bondsTrend: toTrendArrow(flechas.bonos),
      stocksTrend: toTrendArrow(flechas.acciones),
      commoditiesTrend: toTrendArrow(flechas.commodities),
    });
    const stageLabel = PHASE_MAP[stage]?.label ?? `Stage ${stage}`;

    const tnx = last("^TNX");
    const fvx = last("^FVX");
    const irx = last("^IRX");
    const y10 = tnx != null ? tnx / 10 : null;
    const y5 = fvx != null ? fvx / 10 : null;
    const y3m = irx != null ? irx / 10 : null;
    const y2 = y5 != null && y3m != null ? (y5 * 0.6 + y3m * 0.4) : y5 ?? y3m;
    const spread10y2y = y10 != null && y2 != null ? y10 - y2 : null;
    const spread10y3m = y10 != null && y3m != null ? y10 - y3m : null;
    let curvaEstado = "sin datos";
    if (spread10y3m != null) {
      if (spread10y3m < -0.1) curvaEstado = "inverted";
      else if (Math.abs(spread10y3m) < 0.2) curvaEstado = "flat";
      else if (spread10y3m > 0.5) curvaEstado = "steepening";
      else curvaEstado = "normal";
    }

    const tltCl = closes("TLT");
    const spyCl = closes("SPY");
    let tlt60: number | null = null;
    let spy60: number | null = null;
    let corr60: number | null = null;
    let bondsLectura = "sin datos";
    if (tltCl.length >= 61 && spyCl.length >= 61) {
      const tltRet = ((tltCl[tltCl.length - 1] - tltCl[tltCl.length - 61]) / tltCl[tltCl.length - 61]) * 100;
      const spyRet = ((spyCl[spyCl.length - 1] - spyCl[spyCl.length - 61]) / spyCl[spyCl.length - 61]) * 100;
      tlt60 = Math.round(tltRet * 100) / 100;
      spy60 = Math.round(spyRet * 100) / 100;
      const tltR = closesToReturns(tltCl.slice(-61));
      const spyR = closesToReturns(spyCl.slice(-61));
      const c = pearsonR(tltR, spyR);
      corr60 = c != null ? Math.max(-1, Math.min(1, Math.round(c * 1000) / 1000)) : null;
      if (corr60 != null && (corr60 < -1 || corr60 > 1)) console.warn(`[ctx] corr60 fuera de rango ${corr60}`);
      if (corr60 != null) {
        if (corr60 > 0.3) bondsLectura = "correlación positiva — risk-on";
        else if (corr60 < -0.3) bondsLectura = "correlación negativa — flight-to-quality";
        else bondsLectura = "correlación débil — régimen mixto";
      }
    }

    const djiCl = closes("^DJI");
    const djtCl = closes("^DJT");
    let djiTrend: Flecha = "→";
    let djtTrend: Flecha = "→";
    let dowSenal = "sin datos";
    if (djiCl.length >= 21 && djtCl.length >= 21) {
      djiTrend = flechaFromCloses(djiCl, 20);
      djtTrend = flechaFromCloses(djtCl, 20);
      if (djiTrend === "↑" && djtTrend === "↑") dowSenal = "confirmación alcista";
      else if (djiTrend === "↓" && djtTrend === "↓") dowSenal = "confirmación bajista";
      else if (djiTrend !== djtTrend) dowSenal = "divergencia bajista";
      else dowSenal = "sin confirmación";
    }

    const ratios: IntermarketRegime["ratios"] = [];
    const pushRatio = (nombre: string, a: string, b: string, lidera: string[], evita: string[]) => {
      const ca = closes(a);
      const cb = closes(b);
      const { valor, var1m } = ratioValorVar1m(ca, cb);
      let lectura = "sin datos";
      if (valor != null && var1m != null) {
        if (var1m > 2) lectura = "fuerte — lidera";
        else if (var1m < -2) lectura = "débil — rezaga";
        else lectura = "neutral";
      }
      if (nombre === "Dow/Gold" && valor != null && (valor < 5 || valor > 45) && valor > 50) console.warn(`[ctx] Dow/Gold fuera de rango plausible: ${valor}`);
      if (nombre === "NDX/SPX" && valor != null && (valor < 1.5 || valor > 6)) console.warn(`[ctx] NDX/SPX fuera de rango: ${valor}`);
      ratios.push({ nombre, valor: valor != null ? Math.round(valor * 10000) / 10000 : null, var1m: var1m != null ? Math.round(var1m * 100) / 100 : null, lectura, lidera, evita });
    };

    pushRatio("CRB/Bonds", "DBC", "TLT", ["Energy", "Basic Materials"], ["Consumer Defensive", "Utilities"]);
    pushRatio("Comm/Stocks", "DBC", "SPY", ["Energy"], ["Technology"]);
    pushRatio("Gold/Oil", "GLD", "USO", ["Gold"], ["Oil"]);
    pushRatio("Cu/Au", "HG=F", "GLD", ["Industrials"], ["Gold"]);
    pushRatio("XLY/XLP", "XLY", "XLP", ["Consumer Cyclical"], ["Consumer Defensive"]);
    pushRatio("IWM/SPY", "IWM", "SPY", ["Small Caps"], ["Large Caps"]);
    pushRatio("NDX/SPX", "^NDX", "^GSPC", ["Nasdaq"], ["S&P"]);
    pushRatio("Dow/Gold", "^DJI", "GC=F", ["Dow"], ["Gold"]);
    pushRatio("EFA/EEM", "EFA", "EEM", ["Developed"], ["Emerging"]);
    pushRatio("IVW/IVE", "IVW", "IVE", ["Growth"], ["Value"]);
    pushRatio("HYG/LQD", "HYG", "LQD", ["High Yield"], ["Investment Grade"]);
    ratios.push({ nombre: "TIPS Breakeven", valor: null, var1m: null, lectura: "breakeven requiere FRED DFII10", lidera: [], evita: [] });

    const leadLag: IntermarketRegime["leadLag"] = [];
    const pairs: Array<[string, string, string]> = [
      ["DX-Y.NYB", "TLT", "DXY→TLT"],
      ["TLT", "DBC", "TLT→DBC"],
      ["DBC", "SPY", "DBC→SPY"],
    ];
    for (const [aSym, bSym, par] of pairs) {
      const ra = closesToReturns(closes(aSym));
      const rb = closesToReturns(closes(bSym));
      const { lag, lider } = crossLagLeader(ra, rb, aSym, bSym);
      if (lag != null && !Number.isInteger(lag)) console.warn(`[ctx] lag no entero ${par}=${lag}`);
      leadLag.push({ par, lagOptimo: lag, lider });
    }

    let totalSenales = 0;
    let alineadas = 0;
    const stageFlechas = {
      0: { b: "↑", s: "↓", c: "↓" },
      1: { b: "↑", s: "↑", c: "↓" },
      2: { b: "↑", s: "↑", c: "↑" },
      3: { b: "↓", s: "↑", c: "↑" },
      4: { b: "↓", s: "↓", c: "↑" },
      5: { b: "↓", s: "↓", c: "↓" },
    }[stage] ?? { b: "→", s: "→", c: "→" };
    totalSenales += 3;
    if (flechas.bonos === stageFlechas.b) alineadas++;
    if (flechas.acciones === stageFlechas.s) alineadas++;
    if (flechas.commodities === stageFlechas.c) alineadas++;
    totalSenales++;
    if (curvaEstado !== "sin datos") {
      if ((stage <= 1 && curvaEstado === "inverted") || (stage >= 2 && stage <= 3 && curvaEstado === "steepening")) alineadas++;
      else if (curvaEstado !== "sin datos") { /* evaluable pero no alineada */ }
    } else totalSenales--;
    totalSenales++;
    if (corr60 != null) {
      const expectNeg = stage === 0 || stage >= 4;
      if ((expectNeg && corr60 < -0.1) || (!expectNeg && corr60 > 0.1)) alineadas++;
    } else totalSenales--;
    totalSenales++;
    if (dowSenal.includes("confirmación")) alineadas++;
    else if (dowSenal === "sin datos") totalSenales--;
    totalSenales++;
    const hygLqd = ratios.find((r) => r.nombre === "HYG/LQD");
    if (hygLqd?.var1m != null) {
      if ((stage <= 2 && hygLqd.var1m > 0) || (stage >= 3 && hygLqd.var1m < 0)) alineadas++;
    } else totalSenales--;
    const confianza = totalSenales > 0 ? Math.round((alineadas / totalSenales) * 100) : null;

    const rot = ROTATION_BY_STAGE[stage];
    const sectoresFavorecidos = rot?.buy?.map((s) => s.split(" ")[0]) ?? [];
    const sectoresEvitar = rot?.sell?.map((s) => s.split(" ")[0]) ?? [];

    const out: IntermarketRegime = {
      stage,
      stageLabel,
      flechas,
      curva: { spread10y2y, spread10y3m, estado: curvaEstado },
      bondsStocks: { tlt60, spy60, corr60, lectura: bondsLectura },
      dowTheory: { dji: djiTrend, djt: djtTrend, senal: dowSenal },
      ratios,
      leadLag,
      confianza,
      sectoresFavorecidos,
      sectoresEvitar,
    };

    setCache(cacheKey, out);
    return out;
  } catch (e) {
    console.warn("[ctx] getIntermarketRegime fallback", e);
    return intermarketRegimeFallback();
  }
});
