// @ts-nocheck
import type { BinanceDepthLevel, Kline, AtrResult, ObzScore } from "./cripto.types";

export function calcularOBI(
  bids: BinanceDepthLevel[],
  asks: BinanceDepthLevel[],
  levels = 10,
): { obi: number; microPrice: number; bestBid: number; bestAsk: number } {
  const topBids = bids.slice(0, levels);
  const topAsks = asks.slice(0, levels);
  const totalBidVol = topBids.reduce((s, b) => s + b.price * b.volume, 0);
  const totalAskVol = topAsks.reduce((s, a) => s + a.price * a.volume, 0);
  const denom = totalBidVol + totalAskVol;
  if (denom === 0) return { obi: 0, microPrice: 0, bestBid: 0, bestAsk: 0 };
  const obi = (totalBidVol - totalAskVol) / denom;
  const bestBid = topBids[0]?.price ?? 0;
  const bestAsk = topAsks[0]?.price ?? 0;
  const microPrice = (totalBidVol * bestAsk + totalAskVol * bestBid) / denom;
  return { obi, microPrice, bestBid, bestAsk };
}

export function calcularZScore(history: number[], currentValue: number, minSamples = 20): ObzScore {
  if (history.length < minSamples) {
    return { obi: currentValue, zScore: 0, microPrice: 0, mean: 0, std: 0 };
  }
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((s, x) => s + (x - mean) ** 2, 0) / history.length;
  const std = Math.sqrt(variance);
  const zScore = std > 0 ? (currentValue - mean) / std : 0;
  return { obi: currentValue, zScore, microPrice: 0, mean, std };
}

export function calcularATR(klines: Kline[], period = 14): AtrResult {
  if (klines.length < 2) return { atr: 0, atrPct: 0, tr: 0 };
  const trValues: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const prev = klines[i - 1];
    const curr = klines[i];
    const hl = curr.high - curr.low;
    const hc = Math.abs(curr.high - prev.close);
    const lc = Math.abs(curr.low - prev.close);
    trValues.push(Math.max(hl, hc, lc));
  }
  if (trValues.length === 0) return { atr: 0, atrPct: 0, tr: 0 };
  const atr =
    trValues.slice(-period).reduce((s, t) => s + t, 0) / Math.min(period, trValues.length);
  const lastClose = klines[klines.length - 1].close;
  return {
    atr,
    atrPct: lastClose > 0 ? (atr / lastClose) * 100 : 0,
    tr: trValues[trValues.length - 1],
  };
}

export function calcularVWAP(klines: Kline[]): number {
  if (klines.length === 0) return 0;
  let sumPV = 0;
  let sumV = 0;
  for (const k of klines) {
    const typicalPrice = (k.high + k.low + k.close) / 3;
    sumPV += typicalPrice * k.volume;
    sumV += k.volume;
  }
  return sumV > 0 ? sumPV / sumV : 0;
}

export function parseDepthToLevels(rows: [string, string][]): BinanceDepthLevel[] {
  let cum = 0;
  return rows.map(([p, q]) => {
    const price = parseFloat(p);
    const volume = parseFloat(q);
    cum += price * volume;
    return { price, volume, total: cum };
  });
}

export function parseKline(raw: any[]): Kline {
  return {
    openTime: raw[0] as number,
    open: parseFloat(raw[1] as string),
    high: parseFloat(raw[2] as string),
    low: parseFloat(raw[3] as string),
    close: parseFloat(raw[4] as string),
    volume: parseFloat(raw[5] as string),
    closeTime: raw[6] as number,
  };
}

export function generarSenial(
  zScore: number,
  umbral: number,
  price: number,
  atrPct: number,
  slMult: number,
  tpMult: number,
): { type: "LONG" | "SHORT" | null; sl: number; tp: number } {
  if (zScore >= umbral) {
    return {
      type: "LONG",
      sl: price * (1 - (atrPct / 100) * slMult),
      tp: price * (1 + (atrPct / 100) * tpMult),
    };
  }
  if (zScore <= -umbral) {
    return {
      type: "SHORT",
      sl: price * (1 + (atrPct / 100) * slMult),
      tp: price * (1 - (atrPct / 100) * tpMult),
    };
  }
  return { type: null, sl: 0, tp: 0 };
}

export function calcularSpreadArbitraje(
  precioCompra: number,
  precioVenta: number,
  feeCompra: number,
  feeVenta: number,
): { bruto: number; neto: number; viable: boolean } {
  const bruto = precioVenta / precioCompra - 1;
  const costos = feeCompra + feeVenta;
  const neto = bruto - costos;
  return { bruto, neto, viable: neto > 0.005 };
}
