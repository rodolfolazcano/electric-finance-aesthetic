// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { backtestBBRSI, tradeMetrics, defaultScalpParams } from "./bb-rsi-engine";

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

async function topPerps(limit: number): Promise<string[]> {
  const r = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
  if (!r.ok) return ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"].slice(0, limit);
  const data: any[] = await r.json();
  const perps = data.filter((d) => d.symbol.endsWith("USDT")).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
  return perps.slice(0, limit).map((d) => d.symbol);
}

export const runScanner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        topN: z.number().min(3).max(20).default(10),
        interval: z.string().default("5m"),
        days: z.number().min(14).max(90).default(30),
        wrGate: z.number().default(70),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const { topN, interval, days, wrGate } = data;
    const symbols = await topPerps(topN);
    const rows: any[] = [];
    for (const sym of symbols) {
      try {
        const klines = await fetchKlinesRange(sym, interval, days);
        if (klines.length < 300) {
          rows.push({ symbol: sym, error: "datos insuficientes", trades: 0 });
          continue;
        }
        const trades = backtestBBRSI(klines as any, defaultScalpParams);
        const m = tradeMetrics(trades as any, "pnlPct");
        const wins = trades.filter((t: any) => t.pnlPct > 0);
        const losses = trades.filter((t: any) => t.pnlPct <= 0);
        const avgWin = wins.length ? wins.reduce((s: number, t: any) => s + t.pnlPct, 0) / wins.length : 0;
        const avgLoss = losses.length ? Math.abs(losses.reduce((s: number, t: any) => s + t.pnlPct, 0) / losses.length) : 0;
        const rr = avgLoss > 0 ? avgWin / avgLoss : 0;
        const wr = m.winRate;
        const pass = wr >= wrGate ? "PASS" : "FAIL";
        rows.push({
          symbol: sym,
          trades: m.trades,
          wr: Number(wr.toFixed(1)),
          pf: Number(m.profitFactor.toFixed(2)),
          rr: Number(rr.toFixed(2)),
          exp: Number(m.expectancyPct.toFixed(4)),
          ret: Number(m.returnPct.toFixed(2)),
          maxDd: Number(m.maxDrawdownPct.toFixed(2)),
          sharpe: Number(m.sharpe.toFixed(2)),
          pass,
          klines: klines.length,
        });
      } catch (e: any) {
        rows.push({ symbol: sym, error: e.message ?? String(e), trades: 0 });
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    const ranked = [...rows].filter((r) => r.trades > 0).sort((a, b) => b.wr - a.wr || b.pf - a.pf);
    return { interval, days, wrGate, symbols, rows: ranked, rawRows: rows };
  });
