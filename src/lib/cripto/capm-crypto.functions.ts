// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  return all.map((k: any) => ({ close: parseFloat(k[4]) }));
}

function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function variance(a: number[]): number {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length;
}
function covariance(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / a.length;
}

export const runCapmCrypto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        benchmark: z.string().default("BTCUSDT"),
        universe: z.array(z.string()).default(["ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT", "XRPUSDT"]),
        interval: z.string().default("4h"),
        days: z.number().default(30),
        lookback: z.number().default(30),
        betaBand: z.number().default(0.3),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const { benchmark, universe, interval, days, lookback, betaBand } = data;
    const benchRaw = await fetchKlinesRange(benchmark, interval, days);
    if (benchRaw.length < lookback + 5) throw new Error("Datos insuficientes benchmark");
    const benchCloses = benchRaw.map((k) => k.close);
    const benchRetsFull = logReturns(benchCloses);
    const benchRets = benchRetsFull.slice(-lookback);

    const rows: any[] = [];
    for (const sym of universe) {
      try {
        const raw = await fetchKlinesRange(sym, interval, days);
        const closes = raw.map((k) => k.close);
        if (closes.length < lookback + 5) { rows.push({ symbol: sym, error: "datos insuficientes" }); continue; }
        const retsFull = logReturns(closes);
        const rets = retsFull.slice(-lookback);
        const n = Math.min(rets.length, benchRets.length);
        const a = rets.slice(-n), b = benchRets.slice(-n);
        const cov = covariance(a, b);
        const vB = variance(b);
        const beta = vB > 1e-12 ? cov / vB : 0;
        const alpha = mean(a) - beta * mean(b);
        const sig = Math.abs(beta) < betaBand ? (alpha > 0 ? "LONG" : alpha < 0 ? "SHORT" : "NEUTRAL") : "NEUTRAL";
        rows.push({
          symbol: sym,
          beta: Number(beta.toFixed(3)),
          alpha: Number((alpha * 100).toFixed(4)),
          betaAbs: Math.abs(beta),
          signal: sig,
          lastClose: closes[closes.length - 1],
        });
      } catch (e: any) {
        rows.push({ symbol: sym, error: e.message ?? String(e) });
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    const longs = rows.filter((r) => r.signal === "LONG").length;
    const shorts = rows.filter((r) => r.signal === "SHORT").length;
    return { benchmark, interval, lookback, betaBand, rows, summary: { longs, shorts, neutrals: rows.length - longs - shorts } };
  });
