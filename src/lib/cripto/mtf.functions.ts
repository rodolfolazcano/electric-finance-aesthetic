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

function addIndicators(raw: any[], smaLen: number) {
  const closes = raw.map((k) => k.close);
  const rsi = rsiWilder(closes, 14);
  const atrArr = atr(raw as any, 14);
  const sma = smaArr(closes, smaLen);
  return raw.map((k, i) => ({ ...k, rsi: rsi[i], atr: atrArr[i], sma: sma[i] }));
}

function timeframeRespect(df: any[], rsiThr = 30, horizon = 20) {
  const events: any[] = [];
  for (let i = 0; i < df.length - horizon - 1; i++) {
    if (df[i].rsi != null && df[i].rsi < rsiThr) {
      const entry = df[i].close;
      let maxHigh = -Infinity, minLow = Infinity;
      for (let j = i + 1; j <= i + horizon && j < df.length; j++) {
        if (df[j].high > maxHigh) maxHigh = df[j].high;
        if (df[j].low < minLow) minLow = df[j].low;
      }
      const ret = (df[i + horizon].close - entry) / entry;
      const mfe = ((maxHigh - entry) / entry) * 100;
      const mae = ((entry - minLow) / entry) * 100;
      events.push({ ret, mfe, mae });
    }
  }
  if (!events.length) return { events: 0, wr: 0, exp: 0, pf: 0, avgRet: 0 };
  const wins = events.filter((e) => e.mfe > 0.5);
  const losses = events.filter((e) => e.mfe <= 0.5);
  const wr = (wins.length / events.length) * 100;
  const pf = losses.length && losses.reduce((s, e) => s + e.mae, 0) / losses.length > 0
    ? wins.reduce((s, e) => s + e.mfe, 0) / wins.length / (losses.reduce((s, e) => s + e.mae, 0) / losses.length)
    : 0;
  const exp = events.reduce((s, e) => s + e.ret, 0) / events.length * 100 - (FEE + SLIP) * 200;
  const avgRet = events.reduce((s, e) => s + e.ret, 0) / events.length * 100;
  return { events: events.length, wr, exp, pf, avgRet };
}

function mtfBacktest(
  dfHtf: any[],
  dfLtf: any[],
  opts: { htfRsiThr: number; ltfRsiEntry: number; zones: number; tpPct: number; slPct: number; multTrail: number }
) {
  const { htfRsiThr, ltfRsiEntry, zones, tpPct, slPct, multTrail } = opts;
  const zoneWeights = [0.5, 0.3, 0.2].slice(0, zones);

  // align HTF to LTF: for each LTF idx, find latest HTF with datetime <= LTF datetime
  const htfByTime = dfHtf;
  const ltf = dfLtf;
  const aligned: any[] = [];
  let hIdx = 0;
  for (let i = 0; i < ltf.length; i++) {
    while (hIdx + 1 < htfByTime.length && htfByTime[hIdx + 1].datetime <= ltf[i].datetime) hIdx++;
    aligned.push({
      ...ltf[i],
      htf_close: htfByTime[hIdx].close,
      htf_rsi: htfByTime[hIdx].rsi,
      htf_atr: htfByTime[hIdx].atr,
      htf_sma: htfByTime[hIdx].sma,
    });
  }

  const trades: any[] = [];
  let inPos = false;
  let entry: number | null = null;
  let peak: number | null = null;
  let qtyZones: [number, number][] = [];

  for (let i = 2; i < aligned.length; i++) {
    const r = aligned[i];
    if (r.rsi == null || r.htf_rsi == null || r.htf_atr == null) continue;
    const htfOk = r.htf_sma != null ? r.htf_rsi < htfRsiThr && r.close > r.htf_sma : r.htf_rsi < htfRsiThr;

    if (inPos) {
      peak = Math.max(peak!, r.high);
      const avgEntry = qtyZones.reduce((s, [p, w]) => s + p * w, 0) / qtyZones.reduce((s, [, w]) => s + w, 0);
      if (r.high >= avgEntry * (1 + tpPct / 100)) {
        const gross = (avgEntry * (1 + tpPct / 100) - avgEntry) / avgEntry;
        const net = gross - 2 * FEE - SLIP * 2;
        trades.push({ pnlPct: net, reason: "TP_HTF_ZONE" });
        inPos = false; qtyZones = [];
        continue;
      }
      if (r.low <= avgEntry * (1 - slPct / 100)) {
        const gross = (avgEntry * (1 - slPct / 100) - avgEntry) / avgEntry;
        const net = gross - 2 * FEE - SLIP * 2;
        trades.push({ pnlPct: net, reason: "SL_HTF_ZONE" });
        inPos = false; qtyZones = [];
        continue;
      }
      if (multTrail > 0) {
        const trailAtr = r.htf_atr != null && !isNaN(r.htf_atr) ? r.htf_atr : r.atr;
        const trail = peak! - multTrail * (trailAtr ?? 0);
        if (r.low <= trail) {
          const gross = (trail - avgEntry) / avgEntry;
          const net = gross - 2 * FEE - SLIP * 2;
          trades.push({ pnlPct: net, reason: "TRAIL_HTF_ATR" });
          inPos = false; qtyZones = [];
        }
      }
    } else {
      if (htfOk && aligned[i - 1].rsi != null && r.rsi != null && aligned[i - 1].rsi < ltfRsiEntry && r.rsi >= ltfRsiEntry) {
        if (r.htf_close == null || r.htf_atr == null || r.htf_atr === 0) continue;
        const distAtr = (r.htf_close - r.close) / r.htf_atr;
        if (distAtr >= 0 && distAtr <= zones * 0.7) {
          const zoneIdx = Math.min(Math.floor(distAtr / 0.7), zones - 1);
          const w = zoneWeights[zoneIdx];
          if (!inPos) {
            inPos = true; entry = r.close; peak = r.high; qtyZones = [[r.close, w]];
          } else {
            qtyZones.push([r.close, w]);
            peak = Math.max(peak!, r.high);
          }
        }
      }
    }
  }
  return trades;
}

export const runMtf = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        symbol: z.string().default("BTCUSDT"),
        days: z.number().min(14).max(180).default(90),
        htf: z.string().default("1h"),
        ltf: z.string().default("5m"),
        zones: z.number().min(1).max(3).default(3),
        htfRsi: z.number().default(35),
        ltfRsi: z.number().default(28),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const { symbol, days, htf, ltf, zones, htfRsi, ltfRsi } = data;

    const [dfHtfRaw, dfLtfRaw] = await Promise.all([
      fetchKlinesRange(symbol, htf, days),
      fetchKlinesRange(symbol, ltf, days),
    ]);
    if (!dfHtfRaw.length || !dfLtfRaw.length) throw new Error("Datos insuficientes");

    const dfHtf = addIndicators(dfHtfRaw, 50);
    const dfLtf = addIndicators(dfLtfRaw, 20);

    // estadistica por TF: htf, ltf + 15m y 1m extra si diferentes
    const extra: any[] = [];
    for (const tf of ["1m", "15m"]) {
      if (tf === htf || tf === ltf) continue;
      try {
        const raw = await fetchKlinesRange(symbol, tf, Math.min(days, 14));
        const df = addIndicators(raw, 50);
        const stat = timeframeRespect(df, 30, tf === "1m" || tf === "5m" ? 20 : 10);
        extra.push({ tf, ...stat });
        await new Promise((r) => setTimeout(r, 80));
      } catch {}
    }
    const stats: any[] = [
      { tf: htf, ...timeframeRespect(dfHtf, 30, 10) },
      { tf: ltf, ...timeframeRespect(dfLtf, 30, 20) },
      ...extra,
    ];

    // walk-forward 50/50
    const cutHtf = Math.floor(dfHtf.length * 0.5);
    const cutLtf = Math.floor(dfLtf.length * 0.5);
    const dHtfTr = dfHtf.slice(0, cutHtf), dHtfTe = dfHtf.slice(cutHtf);
    const dLtfTr = dfLtf.slice(0, cutLtf), dLtfTe = dfLtf.slice(cutLtf);

    const trTrades = mtfBacktest(dHtfTr, dLtfTr, { htfRsiThr: htfRsi, ltfRsiEntry: ltfRsi, zones, tpPct: 0.7, slPct: 1.2, multTrail: 3.0 });
    const teTrades = mtfBacktest(dHtfTe, dLtfTe, { htfRsiThr: htfRsi, ltfRsiEntry: ltfRsi, zones, tpPct: 0.7, slPct: 1.2, multTrail: 3.0 });

    const mTr = trTrades.length ? tradeMetrics(trTrades as any, "pnlPct") : null;
    const mTe = teTrades.length ? tradeMetrics(teTrades as any, "pnlPct") : null;

    const reasonsTr: Record<string, number> = {};
    for (const t of trTrades) reasonsTr[t.reason] = (reasonsTr[t.reason] || 0) + 1;
    const reasonsTe: Record<string, number> = {};
    for (const t of teTrades) reasonsTe[t.reason] = (reasonsTe[t.reason] || 0) + 1;

    return {
      symbol, days, htf, ltf, zones,
      stats,
      train: mTr ? { metrics: mTr, reasons: reasonsTr, trades: trTrades.length } : null,
      test: mTe ? { metrics: mTe, reasons: reasonsTe, trades: teTrades.length } : null,
      veredicto: mTe ? (mTe.expectancyPct > 0 ? "RENTABLE" : "NO RENTABLE") : "SIN TRADES",
    };
  });
