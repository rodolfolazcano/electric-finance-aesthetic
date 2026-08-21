// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { backtestBbRsi, tradeMetrics } from "./bb-rsi-engine";
import { rsiWilder, bollingerBands, atr } from "./indicators";

const BinanceKline = z.object({
  time: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  datetime: z.string().optional(),
});

async function fetchKlinesRange(symbol: string, interval: string, days: number, market: "futures" | "spot" = "futures") {
  const base = market === "futures" ? "https://fapi.binance.com" : "https://api.binance.com";
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 3600 * 1000;
  const all: any[] = [];
  let current = startMs;
  // Binance limit 1000 per request
  while (current < endMs) {
    const url = `${base}/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${current}&limit=1000`;
    const spotUrl = `${base}/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${current}&limit=1000`;
    const useUrl = market === "futures" ? url : spotUrl;
    try {
      const r = await fetch(useUrl);
      if (!r.ok) break;
      const data = await r.json();
      if (!Array.isArray(data) || data.length === 0) break;
      if (!Array.isArray(data[0])) break;
      all.push(...data);
      const lastOpen = data[data.length - 1][0];
      if (lastOpen + 1 <= current) break;
      current = lastOpen + 1;
      if (all.length > 20000) break;
      // small delay to avoid rate limit
      await new Promise((res) => setTimeout(res, 80));
    } catch { break; }
  }
  return all.map((k: any) => ({
    time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
    datetime: new Date(k[0]).toISOString(),
  }));
}

export const runBbRsiBacktest = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    interval: z.string().default("5m"),
    days: z.number().min(5).max(365).default(60),
    bbPeriod: z.number().default(20),
    bbStd: z.number().default(2.0),
    rsiPeriod: z.number().default(14),
    rsiOverbought: z.number().default(70),
    rsiOverboughtMax: z.number().default(80),
    rsiOversold: z.number().default(30),
    rsiDynamic: z.boolean().default(false),
    rsiWindow: z.number().default(100),
    tpPct: z.number().default(1.0),
    slAccountPct: z.number().default(10.0),
    capitalPct: z.number().default(10.0),
    leverage: z.number().default(10),
    dcaLevels: z.number().default(3),
    dcaStepPct: z.number().default(0.5),
    dcaDynamic: z.boolean().default(true),
    market: z.enum(["futures", "spot"]).default("futures"),
  }).parse(d))
  .handler(async ({ data }) => {
    const klines = await fetchKlinesRange(data.symbol, data.interval, data.days, data.market as any);
    if (klines.length < Math.max(data.bbPeriod, data.rsiPeriod) + 10) {
      return { klines: [], trades: [], metrics: null, metricsAccount: null, error: "Datos insuficientes" };
    }
    const trades = backtestBbRsi(klines as any, data);
    const m = tradeMetrics(trades as any, "pnlPct");
    const mAcc = tradeMetrics(trades as any, "pnlAccountPct");
    // equity curves for charts (screenshot parity)
    const eqNotional = (() => { let e = 1; return m.equity.map((v) => v); })();
    const eqAccount = (() => { let e = 1; return mAcc.equity; })();
    const distribution = trades.map((t: any) => t.pnlPct * 100);
    return {
      klines: klines.slice(-2000), // keep last 2k for chart
      trades,
      metrics: { ...m, equity: eqNotional },
      metricsAccount: { ...mAcc, equity: eqAccount },
      distribution,
      params: data,
      count: klines.length,
    };
  });

export const getBbRsiAnalyzer = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    interval: z.string().default("5m"),
    days: z.number().default(60),
    bbPeriod: z.number().default(20),
    bbStd: z.number().default(2.0),
    rsiPeriod: z.number().default(14),
  }).parse(d))
  .handler(async ({ data }) => {
    const klines = await fetchKlinesRange(data.symbol, data.interval, data.days, "futures");
    if (klines.length < 100) return { error: "Datos insuficientes" } as any;
    const closes = klines.map((k) => k.close);
    const rsi = rsiWilder(closes, data.rsiPeriod);
    const bb = bollingerBands(closes, data.bbPeriod, data.bbStd);
    const atrArr = atr(klines as any, 14);
    // Profile precio 50 bins
    const prices = klines.map((k) => (k.high + k.low) / 2);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const bins = 50;
    const binWidth = (maxP - minP) / bins;
    const binVols = Array(bins).fill(0);
    const binCenters = Array.from({ length: bins }, (_, i) => minP + binWidth * (i + 0.5));
    // volume per mid price approx
    for (const k of klines) {
      const mid = (k.high + k.low) / 2;
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((mid - minP) / binWidth)));
      binVols[idx] += k.volume;
    }
    const totalVol = binVols.reduce((a, b) => a + b, 0);
    const pocIdx = binVols.indexOf(Math.max(...binVols));
    const poc = binCenters[pocIdx];
    // target 70% volume around POC
    let lo = pocIdx, hi = pocIdx, accum = binVols[pocIdx];
    const target = totalVol * 0.7;
    while (accum < target) {
      const up = hi + 1 < bins ? binVols[hi + 1] : -1;
      const dn = lo - 1 >= 0 ? binVols[lo - 1] : -1;
      if (up < 0 && dn < 0) break;
      if (up >= dn) { hi++; accum += binVols[hi]; } else { lo--; accum += binVols[lo]; }
    }
    const val = binCenters[lo], vah = binCenters[hi];

    // RSI distribution
    const rsiClean = rsi.filter((v) => v != null) as number[];
    // Min entre RSI 70-80 (señal SHORT) - count minutes between 70-80 events
    const shortSignals: number[] = [];
    let last70 = -9999;
    for (let i = 0; i < rsi.length; i++) {
      const v = rsi[i];
      if (v != null && v >= 70 && v <= 80) {
        if (last70 !== -9999) shortSignals.push(i - last70);
        last70 = i;
      }
    }

    // RSI vs BB width scatter + ATR color
    const scatter = klines.slice(-3000).map((k, i) => {
      const idx = klines.length - 3000 + i;
      return {
        rsi: rsi[idx] ?? null,
        bbWidth: bb.width[idx] != null ? (bb.width[idx] as number) * 100 : null,
        atr: atrArr[idx] != null ? (atrArr[idx] as number) / closes[idx] * 100 : null,
      };
    }).filter((p) => p.rsi != null && p.bbWidth != null);

    // RSI percentiles rodantes
    const window = 100;
    const rsiP80: (number | null)[] = Array(rsi.length).fill(null);
    const rsiP20: (number | null)[] = Array(rsi.length).fill(null);
    for (let i = window - 1; i < rsi.length; i++) {
      const slice = (rsi.slice(i - window + 1, i + 1) as number[]).filter((v) => v != null) as number[];
      if (!slice.length) continue;
      const s = [...slice].sort((a, b) => a - b);
      const q80 = s[Math.floor(0.8 * (s.length - 1))];
      const q20 = s[Math.floor(0.2 * (s.length - 1))];
      rsiP80[i] = q80; rsiP20[i] = q20;
    }

    return {
      symbol: data.symbol,
      interval: data.interval,
      count: klines.length,
      rsi: rsi.slice(-500),
      rsiDist: rsiClean,
      closes: closes.slice(-3000),
      bb: { upper: bb.upper.slice(-3000), lower: bb.lower.slice(-3000), sma: bb.sma.slice(-3000), width: bb.width.slice(-3000) },
      profile: { bins: binCenters, vols: binVols, poc, val, vah },
      shortIntervals: shortSignals.slice(0, 600),
      scatter,
      atr: atrArr.slice(-500),
      rsiP80: rsiP80.slice(-500),
      rsiP20: rsiP20.slice(-500),
      closesFull: closes,
      rsiFull: rsi,
      klines: klines.slice(-200),
      pocPrice: poc,
    };
  });

export const checkBbRsiSignal = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    interval: z.string().default("5m"),
    bbPeriod: z.number().default(20),
    bbStd: z.number().default(2.0),
    rsiPeriod: z.number().default(14),
    rsiOverbought: z.number().default(70),
    rsiOverboughtMax: z.number().default(80),
    rsiOversold: z.number().default(30),
    rsiDynamic: z.boolean().default(false),
    rsiWindow: z.number().default(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const klines = await fetchKlinesRange(data.symbol, data.interval, 5, "futures");
    if (klines.length < Math.max(data.bbPeriod, data.rsiPeriod) + 5) return { signal: "NEUTRAL" as const, price: null, rsi: null, reason: "Datos insuficientes" };
    const closes = klines.map((k) => k.close);
    const rsi = rsiWilder(closes, data.rsiPeriod);
    const bb = bollingerBands(closes, data.bbPeriod, data.bbStd);
    const lastIdx = closes.length - 1;
    const price = closes[lastIdx];
    const r = rsi[lastIdx];
    const up = bb.upper[lastIdx];
    const lo = bb.lower[lastIdx];
    const bw = bb.width[lastIdx];
    if (r == null || up == null || lo == null) return { signal: "NEUTRAL" as const, price, rsi: r, reason: "Indicadores no listos" };
    let rsiOb = data.rsiOverbought, rsiOs = data.rsiOversold, rsiObMax = data.rsiOverboughtMax as number;
    if (data.rsiDynamic) {
      const win = data.rsiWindow;
      const slice = (rsi.slice(-win) as number[]).filter((v) => v != null) as number[];
      if (slice.length >= win * 0.6) {
        const s = [...slice].sort((a, b) => a - b);
        rsiOb = s[Math.floor(0.85 * (s.length - 1))];
        rsiOs = s[Math.floor(0.15 * (s.length - 1))];
        if (bw != null && (bw as number) * 100 > 0.6) { rsiOb = Math.min(78, rsiOb + 2); rsiOs = Math.max(22, rsiOs - 2); }
        rsiObMax = rsiOb + 8;
      }
    }
    const isShort = price > (up as number) && r != null && r >= rsiOb && r <= rsiObMax;
    const isLong = price < (lo as number) && r != null && r <= rsiOs;
    if (isLong) return { signal: "LONG" as const, price, rsi: r, bbUp: up, bbLo: lo, bw, rsiOb, rsiOs, rsiObMax, reason: `LONG: close ${(price).toFixed(2)} < BB_lo ${(lo as number).toFixed(2)} y RSI ${r.toFixed(1)} <= ${rsiOs.toFixed(0)}` };
    if (isShort) return { signal: "SHORT" as const, price, rsi: r, bbUp: up, bbLo: lo, bw, rsiOb, rsiOs, rsiObMax, reason: `SHORT: close ${(price).toFixed(2)} > BB_up ${(up as number).toFixed(2)} y RSI ${r.toFixed(1)} en ${rsiOb.toFixed(0)}-${rsiObMax.toFixed(0)}` };
    return { signal: "NEUTRAL" as const, price, rsi: r, bbUp: up, bbLo: lo, bw, rsiOb, rsiOs, rsiObMax, reason: `NEUTRAL · RSI ${r.toFixed(1)} fuera de rango | BB [${(lo as number).toFixed(0)} - ${(up as number).toFixed(0)}]` };
  });
