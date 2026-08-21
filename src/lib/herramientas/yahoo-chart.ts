// @ts-nocheck
import { fetchYahooChart } from "./yahoo-http";

export interface OHLCVBar {
  timestamp: number;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number;
}

interface YChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { description?: string };
  };
}

export async function yahooChartOHLCV(
  symbol: string,
  range = "1y",
  interval = "1d",
): Promise<OHLCVBar[]> {
  try {
    const json = (await fetchYahooChart(symbol, range, interval)) as YChart;
    if (json.chart?.error) return [];
    const r = json.chart?.result?.[0];
    if (!r) return [];
    const ts = r.timestamp ?? [];
    const q = r.indicators?.quote?.[0];
    if (!q) return [];
    const out: OHLCVBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const close = q.close?.[i];
      if (close == null) continue;
      const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      out.push({
        timestamp: ts[i],
        date,
        open: q.open?.[i] ?? null,
        high: q.high?.[i] ?? null,
        low: q.low?.[i] ?? null,
        close,
        volume: q.volume?.[i] ?? 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function yahooChartCloses(
  symbol: string,
  range = "1y",
): Promise<{ date: string; close: number }[]> {
  const bars = await yahooChartOHLCV(symbol, range);
  return bars.map((b) => ({ date: b.date, close: b.close }));
}
