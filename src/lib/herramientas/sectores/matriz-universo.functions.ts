// Matriz dinámica sobre el universo unificado (activos / industrias / sectores)
// Reutiliza el motor semanal 2Y de benchmarks-matrix (Yahoo Finance, closes semanales)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchWeeklyClosesBatch,
  weeklyReturns,
} from "@/lib/herramientas/sectores/benchmarks-matrix.functions";

const MAX_TICKERS = 60;

/** Referencias macro siempre incluidas para beta/alpha/R² */
export const REFERENCIAS_MATRIZ = ["SPY", "ARGT"] as const;

export interface MatrizUniversoResult {
  returns: Record<string, number[]>;
  faltantes: string[];
}

export const getMatrizUniverso = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tickers: z
          .array(z.string().min(1))
          .min(2)
          .max(MAX_TICKERS + 8),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<MatrizUniversoResult> => {
    const pedidos = [...new Set(data.tickers)];
    const conReferencias = [...pedidos, ...REFERENCIAS_MATRIZ.filter((r) => !pedidos.includes(r))];
    const closesMap = await fetchWeeklyClosesBatch(conReferencias);
    const returns: Record<string, number[]> = {};
    for (const [t, closes] of closesMap) returns[t] = weeklyReturns(closes);
    const faltantes = conReferencias.filter((t) => !returns[t]);
    return { returns, faltantes };
  });
