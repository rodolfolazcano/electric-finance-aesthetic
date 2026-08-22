import { createServerFn } from "@tanstack/react-start";
import { yahooChartCloses } from "@/lib/yahoo-chart";
import { SECTOR_DISPLAY } from "@/lib/sectores/sector-display-map";

export interface SectorDailyPerf {
  key: string;
  label: string;
  etf: string;
  dot: string;
  changePercent: number | null;
}

export const getSectorDailyPerformance = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: SectorDailyPerf[] }> => {
    const items = await Promise.all(
      SECTOR_DISPLAY.map(async (s) => {
        try {
          const bars = await yahooChartCloses(s.etf, "5d");
          if (bars.length < 2) {
            return { ...s, changePercent: null };
          }
          const last = bars[bars.length - 1].close;
          const prev = bars[bars.length - 2].close;
          const changePercent = prev > 0 ? ((last - prev) / prev) * 100 : null;
          return { ...s, changePercent };
        } catch {
          return { ...s, changePercent: null };
        }
      }),
    );
    return { items };
  },
);
