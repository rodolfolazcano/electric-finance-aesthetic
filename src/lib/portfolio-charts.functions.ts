// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { yahooChartCloses } from "./yahoo-chart";

export interface SeriePunto {
  date: string;
  values: Record<string, number>; // ticker -> price
}

export const fetchPortfolioCharts = createServerFn({ method: "POST" })
  .inputValidator((d: { tickers: string[]; range: string }) =>
    z
      .object({ tickers: z.array(z.string().min(1)).max(50), range: z.string().default("1y") })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ series: SeriePunto[]; errors: string[] }> => {
    const allSymbols = [...new Set([...data.tickers, "SPY"])];
    const results = await Promise.allSettled(
      allSymbols.map((sym) => yahooChartCloses(sym, data.range)),
    );

    const charts: Map<string, { date: string; close: number }[]> = new Map();
    const errors: string[] = [];

    for (let i = 0; i < allSymbols.length; i++) {
      const sym = allSymbols[i];
      const r = results[i];
      if (r.status === "fulfilled" && r.value.length > 0) {
        charts.set(sym, r.value);
      } else {
        errors.push(`Sin datos para ${sym}`);
      }
    }

    // Build aligned series: iterate over all dates from all charts
    const dateSet = new Set<string>();
    for (const chart of charts.values()) {
      for (const p of chart) dateSet.add(p.date);
    }
    const sortedDates = [...dateSet].sort();

    const series: SeriePunto[] = sortedDates.map((date) => {
      const values: Record<string, number> = {};
      for (const [sym, chart] of charts.entries()) {
        const pt = chart.find((p) => p.date === date);
        if (pt) values[sym] = pt.close;
      }
      return { date, values };
    });

    return { series, errors };
  });
