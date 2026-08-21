// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOrFetch } from "@/lib/herramientas/cache/api-cache.server";
import { TTL_POR_TIPO } from "@/lib/herramientas/cache/types";
import { getHistory } from "./history-cache.server";

interface ChartClose {
  date: string;
  close: number;
}

async function fetchYfCloses(symbol: string, years: number): Promise<ChartClose[]> {
  try {
    const days = years * 365 + 10;
    // Agregar timeout de 10 segundos para evitar que se quede colgado
    const timeoutPromise = new Promise<ChartClose[]>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout fetching historical data")), 10000);
    });

    const dataPromise = getHistory(symbol, days);
    const data = (await Promise.race([dataPromise, timeoutPromise])) as ChartClose[];
    return data.filter((d) => d.close > 0);
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
}

export interface PeriodoDesempenio {
  label: string;
  years: number;
  retornoTotal: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  retornoBenchmark: number | null;
  datosSuficientes: boolean;
}

export interface DesempenioHistoricoResult {
  ticker: string;
  benchmark: string;
  periodos: PeriodoDesempenio[];
  error: string | null;
  status: "success" | "error" | "partial";
}

function calcMaxDrawdown(prices: number[]): number | null {
  if (prices.length < 2) return null;
  let peak = prices[0];
  let maxDd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (p - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}

function calcRetorno(prices: number[]): number | null {
  if (prices.length < 2) return null;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first <= 0 || last <= 0) return null;
  return last / first - 1;
}

function calcCAGR(prices: number[], years: number): number | null {
  if (prices.length < 2 || years <= 0) return null;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first <= 0 || last <= 0) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

export const fetchDesempenioHistorico = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(24) }).parse(d),
  )
  .handler(async ({ data }): Promise<DesempenioHistoricoResult> => {
    const cacheKey = `desempenio:${data.symbol}:v1`;
    return getOrFetch(cacheKey, "yahoo", TTL_POR_TIPO.fundamentals, () =>
      computeDesempenioHistorico(data.symbol),
    );
  });

async function computeDesempenioHistorico(symbol: string): Promise<DesempenioHistoricoResult> {
  const isBa = symbol.endsWith(".BA");
  const benchmark = isBa ? "^MERV" : "SPY";

  const rangos: { label: string; years: number }[] = [
    { label: "1 año", years: 1 },
    { label: "5 años", years: 5 },
    { label: "10 años", years: 10 },
  ];

  const periodos: PeriodoDesempenio[] = [];
  let totalErrors = 0;
  const totalPeriods = rangos.length;

  for (const r of rangos) {
    try {
      const [tickerCloses, benchCloses] = await Promise.all([
        fetchYfCloses(symbol, r.years),
        fetchYfCloses(benchmark, r.years),
      ]);

      const prices = tickerCloses.map((c) => c.close).filter((p) => p > 0);
      const benchPrices = benchCloses.map((c) => c.close).filter((p) => p > 0);

      if (prices.length < 2) {
        periodos.push({
          label: r.label,
          years: r.years,
          retornoTotal: null,
          cagr: null,
          maxDrawdown: null,
          retornoBenchmark: null,
          datosSuficientes: false,
        });
        totalErrors++;
        continue;
      }

      const retornoTotal = calcRetorno(prices);
      const cagr = calcCAGR(prices, r.years);
      const maxDrawdown = calcMaxDrawdown(prices);
      const retornoBenchmark = calcRetorno(benchPrices);

      periodos.push({
        label: r.label,
        years: r.years,
        retornoTotal,
        cagr,
        maxDrawdown,
        retornoBenchmark,
        datosSuficientes: true,
      });
    } catch (error) {
      console.error(`Error computing performance for ${symbol} (${r.label}):`, error);
      periodos.push({
        label: r.label,
        years: r.years,
        retornoTotal: null,
        cagr: null,
        maxDrawdown: null,
        retornoBenchmark: null,
        datosSuficientes: false,
      });
      totalErrors++;
    }
  }

  // Determinar status basado en el éxito de los períodos
  let status: "success" | "error" | "partial";
  let errorMessage: string | null = null;

  if (totalErrors === totalPeriods) {
    status = "error";
    errorMessage =
      "No se pudo obtener datos históricos para ningún período. El servicio de Yahoo Finance puede estar temporalmente no disponible o el ticker no existe.";
  } else if (totalErrors > 0) {
    status = "partial";
    errorMessage = `Datos parciales: ${totalPeriods - totalErrors}/${totalPeriods} períodos disponibles. Algunos rangos históricos no pudieron obtenerse.`;
  } else {
    status = "success";
  }

  return { ticker: symbol, benchmark, periodos, error: errorMessage, status };
}
