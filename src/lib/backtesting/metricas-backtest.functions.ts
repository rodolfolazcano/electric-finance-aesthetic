/**
 * src/lib/backtesting/metricas-backtest.functions.ts
 *
 * Métricas de fiabilidad del score sectorial (Etapa 4).
 *
 * `calcularMetricasBacktest` es una función PURA que recibe señales ya generadas
 * por el motor de backtesting (Etapa 3) y calcula Sharpe anualizado, win rate,
 * max drawdown y alpha vs. benchmark — usando la convención de frecuencia de
 * rebalanceo, NO diaria.
 *
 * `getMetricasBacktestPorSector` es la server function que orquesta: ejecuta el
 * motor, agrupa por sector, reconstruye los retornos del benchmark del MISMO
 * período (ETF sectorial y SPY/^GSPC) y llama a la función pura por sector.
 *
 * Regla de interpretación (texto fijo, no opinión del modelo):
 *   "Un Sharpe > 3 o win rate > 85% en un backtest de este tipo es más probable
 *   que sea señal de look-ahead bias que de una estrategia real — revisar Etapa
 *   2 antes de confiar en el número."
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCached, setCache } from "../cache";
import { getRiskFreeRateSync } from "../risk-free-rate";
import {
  runBacktest,
  SECTOR_ETF,
  SPY_BENCHMARK,
  type BacktestRow,
} from "./motor-backtest.functions";

//  Texto fijo de interpretación (regla de proyecto) 

export const ADVERTENCIA_LOOK_AHEAD =
  "Un Sharpe > 3 o win rate > 85% en un backtest de este tipo es más probable que sea señal de look-ahead bias que de una estrategia real — revisar Etapa 2 antes de confiar en el número.";

export const MUESTRA_MINIMA_SEÑALES = 20;

//  Tipos 

export interface SeñalBacktest {
  ticker: string;
  sector: string;
  fecha: string;
  score: number | null;
  retornoRealizado: number;
}

export interface MetricasBacktest {
  avgReturn: number;
  volatility: number;
  sharpeAnualizado: number;
  sortinoAnualizado: number;
  cvar: number;
  winRate: number;
  maxDrawdown: number;
  avgReturnBenchmark: number;
  alphaVsBenchmark: number;
  nSeñales: number;
}

export interface MetricasPorSector {
  sector: string;
  etfSectorial: string;
  metricasVsETF: MetricasBacktest;
  metricasVsSP500: MetricasBacktest;
  muestraInsuficiente: boolean;
  nSeñales: number;
}

export interface MetricasBacktestResult {
  sectores: MetricasPorSector[];
  horizonte: "1M" | "3M" | "6M" | "12M";
  periodosPorAño: number;
  fechaInicio: string;
  fechaFin: string;
  muestraMinima: number;
  advertenciaLookAhead: string;
  limitaciones: string[];
}

//  Función pura: calcularMetricasBacktest 
//
// Convención: Sharpe anualizado según frecuencia de rebalanceo.
//   periodosPorAño = 12 si rebalanceo mensual, 4 si trimestral.
//   NO asume siempre diario.

export function calcularMetricasBacktest(
  señales: { retornoRealizado: number }[],
  retornoBenchmark: number[],
  periodosPorAño: number,
): MetricasBacktest {
  const returns = señales.map((s) => s.retornoRealizado);
  const mean = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stdDev = (arr: number[]): number => {
    const m = mean(arr);
    return Math.sqrt(mean(arr.map((r) => (r - m) ** 2)));
  };
  const avgReturn = mean(returns);
  const volatility = stdDev(returns);
  const rfPeriodo = Math.pow(1 + getRiskFreeRateSync("USD"), 1 / periodosPorAño) - 1;
  const sharpeAnualizado =
    volatility !== 0 ? ((avgReturn - rfPeriodo) * periodosPorAño) / (volatility * Math.sqrt(periodosPorAño)) : 0;
  const winRate = returns.filter((r) => r > 0).length / returns.length;

  // Downside deviation for Sortino
  const downsideRets = returns.filter(r => r < 0);
  const downsideDev = downsideRets.length > 0
    ? Math.sqrt(downsideRets.reduce((s, r) => s + r * r, 0) / downsideRets.length)
    : 0;
  const sortinoAnualizado = downsideDev > 0
    ? ((avgReturn - rfPeriodo) * periodosPorAño) / (downsideDev * Math.sqrt(periodosPorAño))
    : 0;

  // CVaR at 95%
  const sorted = [...returns].sort((a, b) => a - b);
  const idx5 = Math.floor(sorted.length * 0.05);
  const cvar = returns.length > 0 ? mean(sorted.slice(0, Math.max(1, idx5))) : 0;

  // Max drawdown sobre la curva acumulada de retornos de las señales
  let acumulado = 1;
  let pico = 1;
  let maxDD = 0;
  for (const r of returns) {
    acumulado *= 1 + r;
    pico = Math.max(pico, acumulado);
    maxDD = Math.min(maxDD, (acumulado - pico) / pico);
  }

  const avgReturnBenchmark = mean(retornoBenchmark);

  return {
    avgReturn,
    volatility,
    sharpeAnualizado,
    sortinoAnualizado,
    cvar,
    winRate,
    maxDrawdown: maxDD,
    avgReturnBenchmark,
    alphaVsBenchmark: avgReturn - avgReturnBenchmark,
    nSeñales: returns.length,
  };
}

//  Helpers de mapeo horizonte → período 

const HORIZONTE_RETORNO: Record<string, keyof BacktestRow> = {
  "1M": "retorno1M",
  "3M": "retorno3M",
  "6M": "retorno6M",
  "12M": "retorno12M",
};

const HORIZONTE_EXCESO_ETF: Record<string, keyof BacktestRow> = {
  "1M": "excesoVsETF1M",
  "3M": "excesoVsETF3M",
  "6M": "excesoVsETF6M",
  "12M": "excesoVsETF12M",
};

const HORIZONTE_EXCESO_SP500: Record<string, keyof BacktestRow> = {
  "1M": "excesoVsSP5001M",
  "3M": "excesoVsSP5003M",
  "6M": "excesoVsSP5006M",
  "12M": "excesoVsSP50012M",
};

/**
 * Mapea el horizonte forward a la cantidad de períodos por año.
 *   1M → 12 (mensual)
 *   3M → 4  (trimestral)
 *   6M → 2  (semestral)
 *   12M → 1 (anual)
 *
 * Esto asegura que el Sharpe se anualice correctamente según la duración
 * del retorno promedio observado, no asumiendo siempre diario ni mensual.
 */
function periodosPorAñoParaHorizonte(h: "1M" | "3M" | "6M" | "12M"): number {
  switch (h) {
    case "1M":
      return 12;
    case "3M":
      return 4;
    case "6M":
      return 2;
    case "12M":
      return 1;
  }
}

//  Server function: getMetricasBacktestPorSector 

export const getMetricasBacktestPorSector = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        horizonte: z.enum(["1M", "3M", "6M", "12M"]).default("1M"),
        fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MetricasBacktestResult> => {
    const horizonte = data.horizonte ?? "1M";
    const periodosPorAño = periodosPorAñoParaHorizonte(horizonte);
    const fechaInicio = data.fechaInicio ?? "2020-01-01";
    const fechaFin = data.fechaFin ?? new Date().toISOString().slice(0, 10);

    const cacheKey = `metricas-bt:${horizonte}:${fechaInicio}:${fechaFin}`;
    const cached = getCached<MetricasBacktestResult>(cacheKey, 30 * 60 * 1000);
    if (cached) return cached;

    // Ejecutar el motor de backtesting (Etapa 3)
    const bt = await runBacktest({ data: { fechaInicio, fechaFin } });

    const limitaciones = [...bt.limitaciones];

    const keyRetorno = HORIZONTE_RETORNO[horizonte];
    const keyExcesoETF = HORIZONTE_EXCESO_ETF[horizonte];
    const keyExcesoSP500 = HORIZONTE_EXCESO_SP500[horizonte];

    // Agrupar filas por sector
    const porSector = new Map<string, BacktestRow[]>();
    for (const row of bt.rows) {
      const arr = porSector.get(row.sector) ?? [];
      arr.push(row);
      porSector.set(row.sector, arr);
    }

    const sectores: MetricasPorSector[] = [];

    for (const [sector, rows] of porSector) {
      // Filtrar filas con retorno no-null para este horizonte
      const validas = rows.filter((r) => {
        const ret = r[keyRetorno];
        return typeof ret === "number" && isFinite(ret);
      });

      const etf = SECTOR_ETF[sector] ?? "—";

      if (validas.length === 0) {
        sectores.push({
          sector,
          etfSectorial: etf,
          metricasVsETF: metricasVacias(),
          metricasVsSP500: metricasVacias(),
          muestraInsuficiente: true,
          nSeñales: 0,
        });
        continue;
      }

      // Señales: { retornoRealizado } — el retorno forward del ticker
      const señales: { retornoRealizado: number }[] = validas.map((r) => ({
        retornoRealizado: r[keyRetorno] as number,
      }));

      // Benchmark ETF sectorial del MISMO período:
      //   excesoVsETF = retornoTicker - retornoETF
      //   → retornoETF = retornoTicker - excesoVsETF
      const retornoBenchmarkETF = validas.map((r) => {
        const retTicker = r[keyRetorno] as number;
        const exceso = r[keyExcesoETF];
        return typeof exceso === "number" ? retTicker - exceso : 0;
      });

      // Benchmark SPY/^GSPC del MISMO período
      const retornoBenchmarkSP500 = validas.map((r) => {
        const retTicker = r[keyRetorno] as number;
        const exceso = r[keyExcesoSP500];
        return typeof exceso === "number" ? retTicker - exceso : 0;
      });

      const metricasVsETF = calcularMetricasBacktest(señales, retornoBenchmarkETF, periodosPorAño);
      const metricasVsSP500 = calcularMetricasBacktest(señales, retornoBenchmarkSP500, periodosPorAño);

      const muestraInsuficiente = validas.length < MUESTRA_MINIMA_SEÑALES;

      sectores.push({
        sector,
        etfSectorial: etf,
        metricasVsETF,
        metricasVsSP500,
        muestraInsuficiente,
        nSeñales: validas.length,
      });
    }

    const result: MetricasBacktestResult = {
      sectores,
      horizonte,
      periodosPorAño,
      fechaInicio,
      fechaFin,
      muestraMinima: MUESTRA_MINIMA_SEÑALES,
      advertenciaLookAhead: ADVERTENCIA_LOOK_AHEAD,
      limitaciones,
    };

    setCache(cacheKey, result);
    return result;
  });

function metricasVacias(): MetricasBacktest {
  return {
    avgReturn: 0,
    volatility: 0,
    sharpeAnualizado: 0,
    sortinoAnualizado: 0,
    cvar: 0,
    winRate: 0,
    maxDrawdown: 0,
    avgReturnBenchmark: 0,
    alphaVsBenchmark: 0,
    nSeñales: 0,
  };
}