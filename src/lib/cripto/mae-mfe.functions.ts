// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rsiWilder, atr } from "./indicators";
import { tradeMetrics } from "./bb-rsi-engine";

const FEE = 0.0005, SLIP = 0.0002;

async function fetchKlinesRange(symbol: string, interval: string, days: number) {
  const end = Date.now();
  const start = end - days * 86400000;
  let cur = start;
  const all: any[] = [];
  while (cur < end) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${cur}&limit=1500`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Binance ${r.status}`);
    const data: any[] = await r.json();
    if (!data.length) break;
    all.push(...data);
    cur = data[data.length - 1][0] + 1;
    if (data.length < 1500) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  return all.map((k: any) => ({
    datetime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

function smaArr(closes: number[], len: number): (number | null)[] {
  if (!len) return Array(closes.length).fill(null);
  const out: (number | null)[] = Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= len) sum -= closes[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

function quantile(arr: number[], q: number): number {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return 0;
  const idx = q * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (idx - lo) * (s[hi] - s[lo]);
}

function simulateMaeMfe(
  klines: any[],
  rsi: (number | null)[],
  atrArr: (number | null)[],
  sma: (number | null)[],
  entryLevel: number,
  tpPct: number | null,
  slPct: number | null,
  atrMult: number
) {
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const trades: any[] = [];
  let inPos = false;
  let entry: number | null = null;
  let peak: number | null = null;
  let trough: number | null = null;
  for (let i = 2; i < klines.length; i++) {
    if (rsi[i] == null || atrArr[i] == null) continue;
    if (inPos) {
      peak = Math.max(peak!, highs[i]);
      trough = Math.min(trough!, lows[i]);
      if (slPct != null && lows[i] <= entry! * (1 - slPct / 100)) {
        const exit = entry! * (1 - slPct / 100);
        const gross = (exit - entry!) / entry!;
        const net = gross - 2 * FEE - SLIP * 2;
        trades.push({ pnlPct: net, reason: "SL_MAE", entryIdx: i, mae: ((entry! - trough!) / entry!) * 100, mfe: ((peak! - entry!) / entry!) * 100 });
        inPos = false;
        continue;
      }
      if (tpPct != null && highs[i] >= entry! * (1 + tpPct / 100)) {
        const exit = entry! * (1 + tpPct / 100);
        const gross = (exit - entry!) / entry!;
        const net = gross - 2 * FEE - SLIP * 2;
        trades.push({ pnlPct: net, reason: "TP_MFE", entryIdx: i, mae: ((entry! - trough!) / entry!) * 100, mfe: ((peak! - entry!) / entry!) * 100 });
        inPos = false;
        continue;
      }
      if (atrMult > 0) {
        const trail = peak! - atrMult * atrArr[i]!;
        if (lows[i] <= trail) {
          const gross = (trail - entry!) / entry!;
          const net = gross - 2 * FEE - SLIP * 2;
          trades.push({ pnlPct: net, reason: "TRAILING", entryIdx: i, mae: ((entry! - trough!) / entry!) * 100, mfe: ((peak! - entry!) / entry!) * 100 });
          inPos = false;
        }
      }
    } else {
      const ok = sma[i] == null ? true : closes[i] > sma[i]!;
      if (ok && rsi[i - 1] != null && rsi[i] != null && rsi[i - 1]! < entryLevel && rsi[i]! >= entryLevel) {
        inPos = true;
        entry = closes[i];
        peak = highs[i];
        trough = lows[i];
      }
    }
  }
  return trades;
}

function calibrateMaeMfe(
  klines: any[],
  rsi: (number | null)[],
  atrArr: (number | null)[],
  sma: (number | null)[],
  entryLevel: number,
  atrMult: number
): { tp: number; sl: number } {
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const maes: number[] = [];
  const mfes: number[] = [];
  let inPos = false;
  let entry: number | null = null;
  let peak: number | null = null;
  let trough: number | null = null;
  for (let i = 2; i < klines.length; i++) {
    if (inPos) {
      peak = Math.max(peak!, highs[i]);
      trough = Math.min(trough!, lows[i]);
      if (rsi[i] == null || atrArr[i] == null) continue;
      const trail = peak! - atrMult * atrArr[i]!;
      if (lows[i] <= trail) {
        maes.push(((entry! - trough!) / entry!) * 100);
        mfes.push(((peak! - entry!) / entry!) * 100);
        inPos = false;
      }
    } else {
      const ok = sma[i] == null ? true : closes[i] > sma[i]!;
      if (ok && rsi[i - 1] != null && rsi[i] != null && rsi[i - 1]! < entryLevel && rsi[i]! >= entryLevel) {
        inPos = true;
        entry = closes[i];
        peak = highs[i];
        trough = lows[i];
      }
    }
  }
  if (maes.length >= 10) {
    let sl = quantile(maes, 0.85);
    let tp = quantile(mfes, 0.6);
    sl = Math.max(0.7, Math.min(1.5, sl));
    tp = Math.max(0.35, Math.min(0.9, tp));
    return { tp, sl };
  }
  const atrMean = atrArr.filter((v): v is number => v != null).reduce((a, b) => a + b, 0) / Math.max(1, atrArr.filter((v) => v != null).length);
  const closeMean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const atrPct = (atrMean / closeMean) * 100;
  return { tp: Math.max(0.35, Math.min(0.9, atrPct * 2.0)), sl: Math.max(0.7, Math.min(1.5, atrPct * 3.5)) };
}

export const runMaeMfe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        symbol: z.string().default("BTCUSDT"),
        interval: z.string().default("5m"),
        days: z.number().min(14).max(365).default(90),
        trainDays: z.number().default(30),
        testDays: z.number().default(15),
        entryLevel: z.number().default(28),
        atrMult: z.number().default(3.0),
        smaLen: z.number().default(50),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const { symbol, interval, days, trainDays, testDays, entryLevel, atrMult, smaLen } = data;
    const raw = await fetchKlinesRange(symbol, interval, days);
    if (raw.length < 200) throw new Error("Datos insuficientes de Binance");
    const closes = raw.map((k) => k.close);
    const rsi = rsiWilder(closes, 14);
    const atrArr = atr(raw as any, 14);
    const sma = smaArr(closes, smaLen);

    const INTERVAL_MS: Record<string, number> = { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000 };
    const intervalMs = INTERVAL_MS[interval] ?? 300000;
    const perDay = Math.floor(86400000 / intervalMs);
    const nTrain = trainDays * perDay;
    const nTest = testDays * perDay;

    const folds: any[] = [];
    const oosTrades: any[] = [];
    let start = nTrain;
    let foldI = 0;
    while (start + nTest <= raw.length) {
      foldI++;
      const dtr = raw.slice(start - nTrain, start);
      const dte = raw.slice(start, start + nTest);
      const rsiTr = rsi.slice(start - nTrain, start);
      const rsiTe = rsi.slice(start, start + nTest);
      const atrTr = atrArr.slice(start - nTrain, start);
      const atrTe = atrArr.slice(start, start + nTest);
      const smaTr = sma.slice(start - nTrain, start);
      const smaTe = sma.slice(start, start + nTest);

      const calib = calibrateMaeMfe(dtr, rsiTr, atrTr, smaTr, entryLevel, atrMult);
      const tr = simulateMaeMfe(dte, rsiTe, atrTe, smaTe, entryLevel, calib.tp, calib.sl, atrMult);
      const m = tr.length ? tradeMetrics(tr as any, "pnlPct") : { trades: 0, winRate: 0, profitFactor: 0, returnPct: 0, expectancyPct: 0, maxDrawdownPct: 0 };
      for (const t of tr) (t as any).fold = foldI;

      folds.push({
        fold: foldI,
        tp: calib.tp,
        sl: calib.sl,
        trades: m.trades,
        wr: m.winRate,
        pf: m.profitFactor,
        exp: m.expectancyPct,
        ret: m.returnPct,
      });
      oosTrades.push(...tr);
      start += nTest;
    }

    const mOos = oosTrades.length ? tradeMetrics(oosTrades as any, "pnlPct") : null;
    const reasons: Record<string, number> = {};
    for (const t of oosTrades) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
    const veredicto = mOos ? (mOos.expectancyPct > 0 ? "RENTABLE" : "NO RENTABLE") : "SIN TRADES";

    // distribuciones para histograma (último fold)
    const maesAll = oosTrades.map((t: any) => t.mae).filter((v: any) => v != null);
    const mfesAll = oosTrades.map((t: any) => t.mfe).filter((v: any) => v != null);

    return {
      symbol,
      interval,
      days,
      klinesCount: raw.length,
      folds,
      oos: mOos ? { metrics: mOos, reasons } : null,
      veredicto,
      maes: maesAll,
      mfes: mfesAll,
      oosTrades: oosTrades.slice(0, 200),
    };
  });
