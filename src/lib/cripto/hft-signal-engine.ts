/**
 * HFT Signal Engine — port fiel de bot binance.py.py (722 líneas)
 * Estrategia: OBI ponderado por distancia → microprice → z-score rolling 1500 ticks (±1.8)
 * → filtro régimen PCA (>65% estructurado / <45% ruidoso) + OBI espectral
 * → probabilidad híbrida 30% N(d2) + 70% MC bootstrap empírico Euler (2000×150) ≥55%
 * → sizing ATR SL=2×ATR TP=7×ATR riesgo 1%
 * Sin side-effects: toda la salida es una señal evaluada, la ejecución vive en hft-execution.ts
 */

import { pcaOrderBook, projectSnapshot, calculateOBISpectral } from "@/lib/market-microstructure/pca-order-book";
import type { OrderBookSnapshot as ObSnapshot } from "@/lib/market-microstructure/pca-order-book";

// ─── Config defaults (bot binance.py.py) ────────────────────────────────────
export const HFT_DEFAULTS = {
  windowSize: 1500,
  warmupTicks: 1500,
  zThreshold: 1.8,
  depthLevels: 10,
  cooldownSec: 20,
  probMin: 0.55,
  mcSims: 2000,
  mcSteps: 150,
  riskPct: 0.01,
  slMult: 2.0,
  tpMult: 7.0,
  pcaLevels: 10,
  pcaHistorySize: 500,
  pcaRefreshSec: 60,
} as const;

export interface DepthLevel { price: number; qty: number }
export type RawSignal = "COMPRA" | "VENTA" | null;

export interface HftSnapshot {
  bids: [number, number][];
  asks: [number, number][];
  obi: number;
  microPrice: number;
  timestamp: number;
}

export interface ProbResult {
  probFinal: number;
  probEmpirica: number;
  probAnalitica: number;
}

export interface SignalEval {
  rawSignal: RawSignal;
  zScore: number;
  obi: number;
  microPrice: number;
  atr: number;
  atrPct: number;
  prob: ProbResult | null;
  shouldTrade: boolean;
  reason: string;
  regimen?: string;
  pcaRatio?: number;
  obiEspectral?: number;
}

// ─── normal CDF (erf) ───────────────────────────────────────────────────────
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

// ─── OBI ponderado por distancia (bot calcular_obi_y_microprice) ────────────
export function calcularObiPonderado(
  bids: [number, number][] | DepthLevel[],
  asks: [number, number][] | DepthLevel[],
  niveles = HFT_DEFAULTS.depthLevels,
): { obi: number; microPrice: number; bestBid: number; bestAsk: number; spread: number } {
  const b = bids.slice(0, niveles).map((x) => (Array.isArray(x) ? { price: x[0], qty: x[1] } : x as DepthLevel));
  const a = asks.slice(0, niveles).map((x) => (Array.isArray(x) ? { price: x[0], qty: x[1] } : x as DepthLevel));
  if (!b.length || !a.length) return { obi: 0, microPrice: 0, bestBid: 0, bestAsk: 0, spread: 0 };
  const bestBid = b[0]!.price;
  const bestAsk = a[0]!.price;
  const spread = bestAsk - bestBid;
  if (spread <= 0) {
    const mid = (bestBid + bestAsk) / 2;
    return { obi: 0, microPrice: mid, bestBid, bestAsk, spread: 0 };
  }
  let bidPressure = 0;
  let askPressure = 0;
  for (const lvl of b) bidPressure += lvl.qty / (1 + (bestBid - lvl.price) / spread);
  for (const lvl of a) askPressure += lvl.qty / (1 + (lvl.price - bestAsk) / spread);
  const total = bidPressure + askPressure;
  if (total === 0) return { obi: 0, microPrice: (bestBid + bestAsk) / 2, bestBid, bestAsk, spread };
  const obi = (bidPressure - askPressure) / total;
  const microPrice = (bestBid * askPressure + bestAsk * bidPressure) / total;
  return { obi, microPrice, bestBid, bestAsk, spread };
}

// ─── ATR en USD ─────────────────────────────────────────────────────────────
export function calcularAtrUsd(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < 15) return 0.002;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i]!, l = lows[i]!, pc = closes[i - 1]!;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trs.push(tr);
  }
  if (!trs.length) return 0.002;
  const slice = trs.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
  return Math.max(mean, 0.002);
}

// ─── Extraer retornos empíricos del microprice ─────────────────────────────
export function extraerRetornosEmpiricos(history: HftSnapshot[]): number[] {
  if (history.length < 50) return [];
  const mps = history.map((s) => s.microPrice).filter((v) => v > 0);
  if (mps.length < 2) return [];
  const rets: number[] = [];
  for (let i = 1; i < mps.length; i++) rets.push((mps[i]! - mps[i - 1]!) / mps[i - 1]!);
  return rets;
}

// ─── Probabilidad híbrida (bot calcular_prob_bs_empirico) ──────────────────
export function calcularProbBsEmpirico(params: {
  rawSignal: "COMPRA" | "VENTA";
  entry: number;
  tp: number;
  sl: number;
  retornosEmpiricos: number[];
  atrPct: number; // atrAbs / entry (fracción, ej 0.002)
  nSims?: number;
  pasos?: number;
}): ProbResult {
  const { rawSignal, entry, tp, sl, retornosEmpiricos, atrPct, nSims = HFT_DEFAULTS.mcSims, pasos = HFT_DEFAULTS.mcSteps } = params;
  if (retornosEmpiricos.length < 100) return { probFinal: 0.5, probEmpirica: 0.5, probAnalitica: 0.5 };
  if (entry <= 0 || tp <= 0 || sl <= 0) return { probFinal: 0.5, probEmpirica: 0.5, probAnalitica: 0.5 };

  const distTp = Math.abs(tp - entry) / entry;
  const distSl = Math.abs(sl - entry) / entry;

  // Método 1: N(d2) analítico con sigma desde ATR
  const T = pasos / 1500;
  const sigma = atrPct * Math.sqrt(1500);
  const sigmaSqrtT = sigma * Math.sqrt(Math.max(1e-9, T));
  let probAnalitica = 0.5;
  if (sigmaSqrtT > 1e-9) {
    if (rawSignal === "COMPRA") {
      const d2 = (Math.log(entry / tp) + -0.5 * sigma * sigma * T) / sigmaSqrtT;
      probAnalitica = 1 - normalCdf(d2);
    } else {
      const d2 = (Math.log(tp / entry) + -0.5 * sigma * sigma * T) / sigmaSqrtT;
      probAnalitica = 1 - normalCdf(d2);
    }
    probAnalitica = Math.max(0, Math.min(1, probAnalitica));
  }

  // Método 2: MC bootstrap empírico Euler no gaussiano
  const direccion = rawSignal === "COMPRA" ? 1 : -1;
  let exitos = 0;
  for (let s = 0; s < nSims; s++) {
    let precio = entry;
    let resultado: "WIN" | "LOSS" | null = null;
    for (let k = 0; k < pasos; k++) {
      const eps = retornosEmpiricos[Math.floor(Math.random() * retornosEmpiricos.length)]!;
      precio *= 1 + eps * direccion;
      const mov = ((precio - entry) / entry) * direccion;
      if (mov >= distTp) { resultado = "WIN"; break; }
      if (mov <= -distSl) { resultado = "LOSS"; break; }
    }
    if (resultado === "WIN") exitos++;
  }
  const probEmpirica = exitos / Math.max(1, nSims);
  const probFinal = 0.3 * probAnalitica + 0.7 * probEmpirica;
  return { probFinal, probEmpirica, probAnalitica };
}

// ─── Sizing ─────────────────────────────────────────────────────────────────
export function calcularCantidad(riskPct: number, balanceUsdt: number, atrUsd: number, slMult = HFT_DEFAULTS.slMult): number {
  const riesgo = balanceUsdt * riskPct;
  const slDist = atrUsd * slMult;
  if (slDist <= 0) return 0.001;
  return Math.max(0.001, riesgo / slDist);
}

export function calcularSlTp(entry: number, atrUsd: number, rawSignal: "COMPRA" | "VENTA", slMult = HFT_DEFAULTS.slMult, tpMult = HFT_DEFAULTS.tpMult): { sl: number; tp: number } {
  if (rawSignal === "COMPRA") {
    return { sl: entry - atrUsd * slMult, tp: entry + atrUsd * tpMult };
  }
  return { sl: entry + atrUsd * slMult, tp: entry - atrUsd * tpMult };
}

// ─── Engine con estado ──────────────────────────────────────────────────────
export class HftSignalEngine {
  obiHistory: number[] = [];
  microHistory: number[] = [];
  snapshots: HftSnapshot[] = [];
  lastSignalSide: RawSignal = null;
  lastSignalTime = 0;
  // PCA cache
  private pcaCache: { vals: number[]; vecs: number[][]; ts: number } | null = null;
  private pcaRegimen: string = "DESCONOCIDO";
  private pcaRatio = 0;

  constructor(public config = HFT_DEFAULTS) {}

  pushTick(bids: [number, number][], asks: [number, number][]): { obi: number; microPrice: number } {
    const { obi, microPrice } = calcularObiPonderado(bids, asks, this.config.depthLevels);
    this.obiHistory.push(obi);
    if (this.obiHistory.length > this.config.windowSize) this.obiHistory.shift();
    this.microHistory.push(microPrice);
    if (this.microHistory.length > this.config.windowSize) this.microHistory.shift();
    const snap: HftSnapshot = { bids: bids.slice(0, this.config.depthLevels), asks: asks.slice(0, this.config.depthLevels), obi, microPrice, timestamp: Date.now() };
    this.snapshots.push(snap);
    if (this.snapshots.length > this.config.windowSize) this.snapshots.shift();
    return { obi, microPrice };
  }

  private refreshPcaIfNeeded(): void {
    const now = Date.now();
    if (this.snapshots.length < 100) return;
    if (this.pcaCache && now - this.pcaCache.ts < this.config.pcaRefreshSec * 1000) return;
    // adaptar snapshots al formato de pcaOrderBook
    const obSnaps: ObSnapshot[] = this.snapshots.map((s) => ({
      bids: s.bids as [number, number][],
      asks: s.asks as [number, number][],
      timestamp: s.timestamp,
    }));
    const res = pcaOrderBook(obSnaps, this.config.pcaLevels);
    if (!res) return;
    this.pcaCache = { vals: res.eigenvalues, vecs: res.eigenvectors, ts: now };
    this.pcaRegimen = res.regimen;
    this.pcaRatio = res.regimenRatio;
  }

  evaluate(params: {
    bids: [number, number][];
    asks: [number, number][];
    highs: number[];
    lows: number[];
    closes: number[];
    balanceUsdt?: number;
  }): SignalEval {
    const { bids, asks, highs, lows, closes, balanceUsdt = 1000 } = params;
    const { obi, microPrice, bestBid, bestAsk } = calcularObiPonderado(bids, asks, this.config.depthLevels);

    // warmup
    if (this.obiHistory.length < this.config.warmupTicks) {
      return { rawSignal: null, zScore: 0, obi, microPrice, atr: 0, atrPct: 0, prob: null, shouldTrade: false, reason: `WARMUP ${this.obiHistory.length}/${this.config.warmupTicks}` };
    }

    const mean = this.obiHistory.reduce((s, v) => s + v, 0) / this.obiHistory.length;
    const variance = this.obiHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / this.obiHistory.length;
    const std = Math.sqrt(variance);
    if (std === 0) return { rawSignal: null, zScore: 0, obi, microPrice, atr: 0, atrPct: 0, prob: null, shouldTrade: false, reason: "std=0" };
    const z = (obi - mean) / std;

    let rawSignal: RawSignal = null;
    if (z >= this.config.zThreshold) rawSignal = "COMPRA";
    else if (z <= -this.config.zThreshold) rawSignal = "VENTA";
    if (!rawSignal) return { rawSignal: null, zScore: z, obi, microPrice, atr: 0, atrPct: 0, prob: null, shouldTrade: false, reason: `z=${z.toFixed(2)} sin umbral` };

    // cooldown
    const nowSec = Date.now() / 1000;
    if (rawSignal === this.lastSignalSide && nowSec - this.lastSignalTime < this.config.cooldownSec) {
      return { rawSignal, zScore: z, obi, microPrice, atr: 0, atrPct: 0, prob: null, shouldTrade: false, reason: `cooldown ${Math.round(this.config.cooldownSec - (nowSec - this.lastSignalTime))}s` };
    }

    // PCA régimen
    this.refreshPcaIfNeeded();
    let obiEspectral: number | undefined;
    let regimen = this.pcaRegimen;
    let pcaRatio = this.pcaRatio;
    if (this.pcaCache) {
      if (regimen === "RUIDOSO") {
        return { rawSignal, zScore: z, obi, microPrice, atr: 0, atrPct: 0, prob: null, shouldTrade: false, reason: `RUIDOSO ratio ${(pcaRatio * 100).toFixed(1)}%`, regimen, pcaRatio };
      }
      // OBI espectral: proyectar snapshot actual sobre autovectores cacheados
      try {
        const lastSnap: ObSnapshot = { bids: bids.slice(0, this.config.pcaLevels) as [number, number][], asks: asks.slice(0, this.config.pcaLevels) as [number, number][], timestamp: Date.now() };
        const hist: ObSnapshot[] = this.snapshots.map((s) => ({ bids: s.bids as [number, number][], asks: s.asks as [number, number][], timestamp: s.timestamp }));
        const proj = projectSnapshot(lastSnap, hist, this.config.pcaLevels);
        if (proj) {
          const vals = this.pcaCache.vals.slice(0, 3);
          obiEspectral = calculateOBISpectral(proj.projections, vals);
          if (rawSignal === "COMPRA" && obiEspectral < 0) return { rawSignal, zScore: z, obi, microPrice, atr: 0, atrPct: 0, prob: null, shouldTrade: false, reason: `OBI espectral ${obiEspectral.toFixed(3)} contradice COMPRA`, regimen, pcaRatio, obiEspectral };
          if (rawSignal === "VENTA" && obiEspectral > 0) return { rawSignal, zScore: z, obi, microPrice, atr: 0, atrPct: 0, prob: null, shouldTrade: false, reason: `OBI espectral ${obiEspectral.toFixed(3)} contradice VENTA`, regimen, pcaRatio, obiEspectral };
        }
      } catch {
        // si falla proyección, ignorar filtro espectral y continuar
      }
    }

    const atr = calcularAtrUsd(highs, lows, closes, 14);
    const atrPct = atr / Math.max(1e-9, microPrice || bestAsk || 1);
    const entry = rawSignal === "COMPRA" ? bestBid : bestAsk;
    const { sl, tp } = calcularSlTp(entry, atr, rawSignal);

    const rets = extraerRetornosEmpiricos(this.snapshots);
    const prob = calcularProbBsEmpirico({ rawSignal, entry, tp, sl, retornosEmpiricos: rets, atrPct, nSims: this.config.mcSims, pasos: this.config.mcSteps });

    if (prob.probFinal < this.config.probMin) {
      return { rawSignal, zScore: z, obi, microPrice, atr, atrPct, prob, shouldTrade: false, reason: `prob ${(prob.probFinal * 100).toFixed(1)}% < ${(this.config.probMin * 100).toFixed(0)}% (BS ${(prob.probAnalitica * 100).toFixed(0)}% + Emp ${(prob.probEmpirica * 100).toFixed(0)}%)`, regimen, pcaRatio, obiEspectral };
    }

    const qty = calcularCantidad(this.config.riskPct, balanceUsdt, atr);

    return {
      rawSignal, zScore: z, obi, microPrice, atr, atrPct, prob, shouldTrade: true,
      reason: `APROBADA z=${z.toFixed(2)} prob ${(prob.probFinal * 100).toFixed(1)}% qty ${qty.toFixed(3)} SL ${sl.toFixed(2)} TP ${tp.toFixed(2)}`,
      regimen, pcaRatio, obiEspectral,
    };
  }

  markSignalExecuted(side: RawSignal): void {
    this.lastSignalSide = side;
    this.lastSignalTime = Date.now() / 1000;
  }

  reset(): void {
    this.obiHistory = [];
    this.microHistory = [];
    this.snapshots = [];
    this.lastSignalSide = null;
    this.lastSignalTime = 0;
    this.pcaCache = null;
  }
}

// helper para tests: generar snapshots sintéticos con sesgo
export function makeSyntheticSnapshots(n: number, bias: number, priceBase = 100): HftSnapshot[] {
  const out: HftSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const spread = 0.5;
    const bidVol = 100 + bias * 50 + (Math.random() - 0.5) * 10;
    const askVol = 100 - bias * 50 + (Math.random() - 0.5) * 10;
    const bids: [number, number][] = Array.from({ length: 10 }, (_, k) => [priceBase - 0.1 * (k + 1) - spread / 2, Math.max(1, bidVol - k * 5)] as [number, number]);
    const asks: [number, number][] = Array.from({ length: 10 }, (_, k) => [priceBase + 0.1 * (k + 1) + spread / 2, Math.max(1, askVol - k * 5)] as [number, number]);
    const { obi, microPrice } = calcularObiPonderado(bids, asks);
    out.push({ bids, asks, obi, microPrice, timestamp: Date.now() + i * 100 });
  }
  return out;
}
