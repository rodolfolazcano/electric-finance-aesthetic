// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCached, setCache } from "./cache";
import { yahooChartOHLCV } from "./yahoo-chart";
import { getFlatTickerList } from "./universos";
import { getSemaforoBatch } from "./finance.functions";
import { SECTOR_DISPLAY } from "./sectores/sector-display-map";

export interface SectorDailyPerf {
  key: string;
  label: string;
  etf: string;
  dot: string;
  changePercent: number | null;
}

export interface SectorPerformanceItem {
  sector: string;
  etf?: string;
  dot?: string;
  variacionPromedio: number;
  scorePromedio: number | null;
  cantidadTickersAnalizados: number;
  cantidadTickersUniverso: number;
  tickersDetalle: Array<{
    ticker: string;
    nombre: string;
    variacion: number | null;
    score?: number | null;
  }>;
}

const CACHE_KEY_PREFIX = "sector-performance-";

const periodRangeMap: Record<string, string> = {
  "1d": "5d",
  "5d": "5d",
  "7d": "7d",
  "1mo": "1mo",
  "3mo": "3mo",
  "6mo": "6mo",
  "1y": "1y",
  "2y": "2y",
};

export const getSectorPerformance = createServerFn({ method: "GET" })
  .inputValidator((d: { period?: string }) =>
    z.object({ period: z.string().default("5d") }).parse(d),
  )
  .handler(async ({ data }): Promise<{ items: SectorPerformanceItem[]; period: string }> => {
    const period = data.period;
    const yfRange = periodRangeMap[period] ?? "5d";
    const cacheKey = `${CACHE_KEY_PREFIX}${period}`;

    const cached = getCached<SectorPerformanceItem[]>(cacheKey, 10 * 60 * 1000);
    if (cached) return { items: cached, period };

    // Para periodos <= 5d, usar SECTOR_DISPLAY (ETFs) — rápido
    const isShort = period === "1d" || period === "5d";

    if (isShort) {
      const items = await Promise.all(
        SECTOR_DISPLAY.map(async (s): Promise<SectorPerformanceItem | null> => {
          try {
            const bars = await yahooChartOHLCV(s.etf, yfRange, "1d");
            if (bars.length < 2) return null;
            const first = bars[0].close;
            const last = bars[bars.length - 1].close;
            const varPct = first > 0 ? ((last - first) / first) * 100 : null;
            return {
              sector: s.label,
              etf: s.etf,
              dot: s.dot,
              variacionPromedio: varPct ?? 0,
              scorePromedio: null,
              cantidadTickersAnalizados: 1,
              cantidadTickersUniverso: 1,
              tickersDetalle: [{ ticker: s.etf, nombre: s.label, variacion: varPct }],
            };
          } catch {
            return null;
          }
        }),
      );
      const valid = items.filter((i): i is SectorPerformanceItem => i != null);
      valid.sort((a, b) => b.variacionPromedio - a.variacionPromedio);
      setCache(cacheKey, valid);
      return { items: valid, period };
    }

    // Para periodos más largos, usar el universo completo de tickers
    const universo = getFlatTickerList();
    const sectores = new Map<string, typeof universo>();

    for (const t of universo) {
      if (!sectores.has(t.sector)) sectores.set(t.sector, []);
      sectores.get(t.sector)!.push(t);
    }

    const resultados: SectorPerformanceItem[] = [];

    for (const [sector, tickers] of sectores) {
      const muestra = tickers.slice(0, 15);

      const semaforos = await getSemaforoBatch({
        data: { tickers: muestra.map((t) => t.ticker) },
      }).catch(() => []);
      const scoreMap = new Map(semaforos.map((s) => [s.ticker, s.totalScore]));

      const variaciones = await Promise.all(
        muestra.map(async (t) => {
          try {
            const ohlcv = await yahooChartOHLCV(t.ticker, yfRange, "1d");
            if (ohlcv.length < 2)
              return {
                ticker: t.ticker,
                nombre: t.nombre,
                variacion: null,
                score: scoreMap.get(t.ticker) ?? null,
              };
            const inicio = ohlcv[0].close;
            const fin = ohlcv[ohlcv.length - 1].close;
            const varPct = inicio > 0 ? ((fin - inicio) / inicio) * 100 : null;
            return {
              ticker: t.ticker,
              nombre: t.nombre,
              variacion: varPct,
              score: scoreMap.get(t.ticker) ?? null,
            };
          } catch {
            return {
              ticker: t.ticker,
              nombre: t.nombre,
              variacion: null,
              score: scoreMap.get(t.ticker) ?? null,
            };
          }
        }),
      );

      const validas = variaciones.filter(
        (v): v is { ticker: string; nombre: string; variacion: number; score: number | null } =>
          v.variacion !== null,
      );
      if (validas.length === 0) continue;

      const promedio = validas.reduce((a, b) => a + b.variacion, 0) / validas.length;
      const scores = validas.map((v) => v.score).filter((s): s is number => s != null);
      const scorePromedio =
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      resultados.push({
        sector,
        variacionPromedio: Math.round(promedio * 100) / 100,
        scorePromedio,
        cantidadTickersAnalizados: validas.length,
        cantidadTickersUniverso: tickers.length,
        tickersDetalle: variaciones.map((v) => ({
          ticker: v.ticker,
          nombre: v.nombre,
          variacion: v.variacion !== null ? Math.round(v.variacion * 100) / 100 : null,
          score: v.score,
        })),
      });
    }

    resultados.sort((a, b) => (b.scorePromedio ?? -999) - (a.scorePromedio ?? -999));
    setCache(cacheKey, resultados);
    return { items: resultados, period };
  });

// Mantener alias para compatibilidad
export const getSectorPerformanceSemanal = createServerFn({ method: "GET" }).handler(async () => {
  return (await getSectorPerformance({ data: { period: "7d" } })).items;
});

export const getSectorDailyPerformance = createServerFn({ method: "GET" }).handler(async () => {
  const result = await getSectorPerformance({ data: { period: "5d" } });
  return {
    items: result.items.map((i) => ({
      key: (i.etf || "").toLowerCase(),
      label: i.sector,
      etf: i.etf || "",
      dot: i.dot || "",
      changePercent: i.variacionPromedio,
    })),
  };
});
