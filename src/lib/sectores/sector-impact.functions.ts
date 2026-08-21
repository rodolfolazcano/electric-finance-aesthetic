// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { yahooChartCloses } from "@/lib/yahoo-chart";
import { computeBeta } from "@/lib/sectores/benchmarks-matrix.functions";
import { SECTOR_DISPLAY } from "@/lib/sectores/sector-display-map";

export interface SectorImpactRow {
  key: string;
  label: string;
  etf: string;
  dot: string;
  beta: number | null;
  r2: number | null;
  correlacion: number | null;
  movimientoProyectado: number | null;
  fiable: boolean;
}

interface IntermarketFactor {
  key: string;
  label: string;
  etf: string;
  dot: string;
}

const INTERMARKET_FACTORS: IntermarketFactor[] = [
  { key: "^TNX", label: "Tasa 10Y (TNX)", etf: "^TNX", dot: "#e74c3c" },
  { key: "DXY", label: "Dólar Index (DXY)", etf: "DX-Y.NYB", dot: "#3498db" },
  { key: "GLD", label: "Oro (GLD)", etf: "GLD", dot: "#f1c40f" },
  { key: "USO", label: "Petróleo (USO)", etf: "USO", dot: "#e67e22" },
  { key: "HYG", label: "High Yield (HYG)", etf: "HYG", dot: "#9b59d0" },
];

const RANGE_MAP: Record<string, number> = {
  "3mo": 95,
  "6mo": 185,
  "1y": 370,
  "2y": 740,
};

async function fetchReturns(etf: string, rangeDays: number): Promise<number[]> {
  const bars = await yahooChartCloses(etf, rangeDays > 370 ? "2y" : rangeDays > 185 ? "1y" : "6mo");
  const closes = bars.map((b) => b.close).filter((c) => c > 0);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return rets;
}

export const simulateSectorImpact = createServerFn({ method: "POST" })
  .inputValidator((d: { baseSectorKey: string; movePercent: number; rangeDays?: string }) =>
    z.object({
      baseSectorKey: z.string(),
      movePercent: z.number(),
      rangeDays: z.string().default("1y"),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{
    base: SectorImpactRow;
    results: SectorImpactRow[];
    intermarket: SectorImpactRow[];
  }> => {
    const base = SECTOR_DISPLAY.find((s) => s.key === data.baseSectorKey);
    if (!base) throw new Error("Sector base invalido");

    const rangeDays = RANGE_MAP[data.rangeDays] ?? 370;
    const others = SECTOR_DISPLAY.filter((s) => s.key !== data.baseSectorKey);

    const baseReturns = await fetchReturns(base.etf, rangeDays);
    if (baseReturns.length < 10) {
      throw new Error(`Datos insuficientes para ${base.etf} en ventana ${data.rangeDays}`);
    }

    // Cross-sector impact
    const results = await Promise.all(
      others.map(async (s): Promise<SectorImpactRow> => {
        try {
          const targetReturns = await fetchReturns(s.etf, rangeDays);
          const { beta, alpha, r2 } = computeBeta(targetReturns, baseReturns);
          const correlacion = r2 > 0 ? Math.sqrt(r2) * (beta >= 0 ? 1 : -1) : 0;
          const movimientoProyectado = beta != null ? beta * data.movePercent : null;
          return {
            ...s,
            beta: Math.round(beta * 10000) / 10000,
            r2: Math.round(r2 * 10000) / 10000,
            correlacion: Math.round(correlacion * 10000) / 10000,
            movimientoProyectado: movimientoProyectado != null ? Math.round(movimientoProyectado * 100) / 100 : null,
            fiable: r2 >= 0.5,
          };
        } catch {
          return { ...s, beta: null, r2: null, correlacion: null, movimientoProyectado: null, fiable: false };
        }
      }),
    );

    // Intermarket factor impact on the base sector
    const intermarket = await Promise.all(
      INTERMARKET_FACTORS.map(async (f): Promise<SectorImpactRow> => {
        try {
          const factorReturns = await fetchReturns(f.etf, rangeDays);
          const { beta, alpha, r2 } = computeBeta(baseReturns, factorReturns);
          const correlacion = r2 > 0 ? Math.sqrt(r2) * (beta >= 0 ? 1 : -1) : 0;
          // Interpretación: si el factor sube 1%, cuánto se mueve el sector
          const movimientoProyectado = beta != null ? beta * 1 : null;
          return {
            ...f,
            beta: Math.round(beta * 10000) / 10000,
            r2: Math.round(r2 * 10000) / 10000,
            correlacion: Math.round(correlacion * 10000) / 10000,
            movimientoProyectado: movimientoProyectado != null ? Math.round(movimientoProyectado * 100) / 100 : null,
            fiable: r2 >= 0.5,
          };
        } catch {
          return { ...f, beta: null, r2: null, correlacion: null, movimientoProyectado: null, fiable: false };
        }
      }),
    );

    return {
      base: { ...base, beta: 1, r2: 1, correlacion: 1, movimientoProyectado: data.movePercent, fiable: true },
      results: results.sort((a, b) => (b.movimientoProyectado ?? -999) - (a.movimientoProyectado ?? -999)),
      intermarket: intermarket.sort((a, b) => Math.abs(b.correlacion ?? 0) - Math.abs(a.correlacion ?? 0)),
    };
  });
