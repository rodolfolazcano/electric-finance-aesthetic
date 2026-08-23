// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rsiWilder } from "./indicators";

async function fetchKlinesRange(symbol: string, interval: string, days: number) {
  const end = Date.now();
  const start = end - days * 86400000;
  let cur = start;
  const all: any[] = [];
  while (cur < end) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${cur}&limit=1500`;
    const r = await fetch(url);
    if (!r.ok) break;
    const data: any[] = await r.json();
    if (!data.length) break;
    all.push(...data);
    cur = data[data.length - 1][0] + 1;
    if (data.length < 1500) break;
    await new Promise((res) => setTimeout(res, 80));
  }
  // keep raw array to extract tbbav at [9]
  return all;
}

function smaArr(arr: (number | null)[], win: number): (number | null)[] {
  const out: (number | null)[] = Array(arr.length).fill(null);
  let sum = 0, cnt = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] != null) { sum += arr[i]!; cnt++; }
    if (i >= win) {
      if (arr[i - win] != null) { sum -= arr[i - win]!; }
      else cnt--;
    }
    if (i >= win - 1) out[i] = sum / win;
  }
  return out;
}

export const runReversal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        symbol: z.string().default("SOLUSDT"),
        interval: z.string().default("1m"),
        days: z.number().min(7).max(90).default(30),
        tpPct: z.number().default(1.0),
        slPct: z.number().default(1.0),
        timeoutBars: z.number().default(60),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const { symbol, interval, days, tpPct, slPct, timeoutBars } = data;
    const raw = await fetchKlinesRange(symbol, interval, days);
    if (raw.length < 500) throw new Error("Datos insuficientes");

    const closes = raw.map((k: any) => parseFloat(k[4]));
    const highs = raw.map((k: any) => parseFloat(k[2]));
    const lows = raw.map((k: any) => parseFloat(k[3]));
    const volumes = raw.map((k: any) => parseFloat(k[5]));
    const tbbav = raw.map((k: any) => parseFloat(k[9] ?? 0));
    const times = raw.map((k: any) => k[0] as number);

    // intraday VWAP reset daily
    const vwap: (number | null)[] = Array(raw.length).fill(null);
    let cumPV = 0, cumV = 0, curDay = -1;
    for (let i = 0; i < raw.length; i++) {
      const d = new Date(times[i]);
      const dayKey = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
      if (dayKey !== curDay) { cumPV = 0; cumV = 0; curDay = dayKey; }
      const typical = (highs[i] + lows[i] + closes[i]) / 3;
      cumPV += typical * volumes[i];
      cumV += volumes[i];
      vwap[i] = cumV > 0 ? cumPV / cumV : closes[i];
    }

    const rsi = rsiWilder(closes, 14);
    // OBI proxy
    const obiRaw: (number | null)[] = volumes.map((v, i) => {
      if (!v) return 0;
      const buy = tbbav[i] ?? 0;
      return (buy - (v - buy)) / v;
    });
    const obiSma5 = smaArr(obiRaw as any, 5);
    const volSma20 = smaArr(volumes as any, 20);

    const configs = [
      { tp: tpPct, sl: slPct },
      { tp: tpPct * 1.5, sl: slPct },
      { tp: tpPct, sl: slPct * 0.7 },
      { tp: tpPct * 2, sl: slPct * 0.8 },
    ];

    const results: any[] = [];
    let best: any = null;

    for (const cfg of configs) {
      const trades: any[] = [];
      let inPos: null | { side: "LONG" | "SHORT"; entryIdx: number; entryPrice: number; bars: number } = null;
      for (let i = 20; i < closes.length; i++) {
        if (rsi[i] == null || vwap[i] == null || obiSma5[i] == null || volSma20[i] == null) continue;
        const toxic = volumes[i] > 2.5 * (volSma20[i] as number);
        if (toxic) continue;
        if (!inPos) {
          const c = closes[i], vw = vwap[i] as number, r = rsi[i] as number, obi = obiSma5[i] as number;
          const isLong = c > vw && r > 70 && obi > 0;
          const isShort = c < vw && r < 30 && obi < 0;
          if (isLong) inPos = { side: "LONG", entryIdx: i, entryPrice: c, bars: 0 };
          else if (isShort) inPos = { side: "SHORT", entryIdx: i, entryPrice: c, bars: 0 };
        } else {
          inPos.bars++;
          const tpPrice = inPos.side === "LONG" ? inPos.entryPrice * (1 + cfg.tp / 100) : inPos.entryPrice * (1 - cfg.tp / 100);
          const slPrice = inPos.side === "LONG" ? inPos.entryPrice * (1 - cfg.sl / 100) : inPos.entryPrice * (1 + cfg.sl / 100);
          const hitTp = inPos.side === "LONG" ? highs[i] >= tpPrice : lows[i] <= tpPrice;
          const hitSl = inPos.side === "LONG" ? lows[i] <= slPrice : highs[i] >= slPrice;
          let exitPrice: number | null = null;
          let reason = "";
          if (hitTp) { exitPrice = tpPrice; reason = "TP"; }
          else if (hitSl) { exitPrice = slPrice; reason = "SL"; }
          else if (inPos.bars >= timeoutBars) { exitPrice = closes[i]; reason = "TIMEOUT"; }
          if (exitPrice != null) {
            const gross = inPos.side === "LONG" ? (exitPrice - inPos.entryPrice) / inPos.entryPrice : (inPos.entryPrice - exitPrice) / inPos.entryPrice;
            const net = gross - 0.0004; // commission
            trades.push({ side: inPos.side, entryIdx: inPos.entryIdx, exitIdx: i, entryPrice: inPos.entryPrice, exitPrice, pnlPct: net, reason });
            inPos = null;
          }
        }
      }
      const wins = trades.filter((t) => t.pnlPct > 0).length;
      const wr = trades.length ? (wins / trades.length) * 100 : 0;
      const pf = (() => {
        const wsum = trades.filter((t) => t.pnlPct > 0).reduce((s, t) => s + t.pnlPct, 0);
        const lsum = Math.abs(trades.filter((t) => t.pnlPct <= 0).reduce((s, t) => s + t.pnlPct, 0));
        return lsum > 0 ? wsum / lsum : wsum > 0 ? 999 : 0;
      })();
      const ret = trades.reduce((acc, t) => acc * (1 + t.pnlPct), 1) - 1;
      const exp = trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length * 100 : 0;
      // max drawdown on equity curve
      let equity = 1, peak = 1, maxDd = 0;
      for (const t of trades) { equity *= 1 + t.pnlPct; if (equity > peak) peak = equity; const dd = (equity - peak) / peak * 100; if (dd < maxDd) maxDd = dd; }

      const entry: any = { tp: cfg.tp, sl: cfg.sl, trades: trades.length, wr: Number(wr.toFixed(1)), pf: Number(pf.toFixed(2)), ret: Number((ret * 100).toFixed(2)), exp: Number(exp.toFixed(4)), maxDd: Number(maxDd.toFixed(2)), tradesData: trades.slice(0, 50) };
      results.push(entry);
      if (!best || entry.pf > best.pf) best = entry;
    }

    return { symbol, interval, days, closesCount: closes.length, configs: results, best };
  });
