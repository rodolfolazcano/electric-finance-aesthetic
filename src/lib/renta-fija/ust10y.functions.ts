import { createServerFn } from "@tanstack/react-start";
import { yahooChartCloses } from "@/lib/yahoo-chart";
import { getCached, setCache } from "@/lib/cache";

export interface UST10YPoint {
  fecha: string;
  yieldPct: number;
}

const UST10Y_CACHE_TTL = 300_000; // 5 min

export const fetchUST10Y = createServerFn({ method: "GET" }).handler(async () => {
  const cacheKey = "ust10y_serie";
  const cached = getCached<UST10YPoint[]>(cacheKey, UST10Y_CACHE_TTL);
  if (cached) return cached;

  try {
    const raw = await yahooChartCloses("^TNX", "1y");
    if (raw.length === 0) return [];
    const serie: UST10YPoint[] = raw
      .filter((p) => p.close > 0)
      .map((p) => ({
        fecha: p.date,
        yieldPct: p.close / 10,
      }));
    if (serie.length > 0) setCache(cacheKey, serie);
    return serie;
  } catch {
    return [];
  }
});
