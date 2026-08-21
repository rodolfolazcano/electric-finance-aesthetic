/**
 * Optimizador de Cartera por perfil CNV — server function.
 * Portado de clarity-dashboard: combina politica-asignacion (7 perfiles,
 * tilt táctico por humor de mercado) + optimizer.ts (Markowitz, mínima
 * varianza, máximo Sharpe, etc.) sobre historial real de Yahoo (2 años).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getPolitica,
  calcularPesosObjetivo,
  POLITICA_ASIGNACION,
  type PerfilInversor,
} from "./politica-asignacion";
import { optimize, logReturns, mean, std, covMatrix, type Strategy } from "./optimizer";

const inputSchema = z.object({
  tickers: z.array(z.string().min(1).max(20)).min(2).max(30),
  perfil: z.enum([
    "Conservador",
    "Moderado-Conservador",
    "Moderado",
    "Moderado-Agresivo",
    "Agresivo",
    "Muy Agresivo",
    "Especulativo",
  ]),
  humorMercado: z.enum(["risk-on", "risk-off", "mixto", "none"]).optional().default("mixto"),
});

export interface ActivoOptimizado {
  ticker: string;
  peso: number;
  /** Peso final dentro del portafolio total (ajustado por sleeve RV). */
  pesoAjustado: number;
  retornoAnualPct: number | null;
  volatilidadAnualPct: number | null;
}

export interface OptimizacionCarteraResult {
  perfil: PerfilInversor;
  estrategia: string;
  humorMercado: "risk-on" | "risk-off" | "mixto";
  politica: {
    rangoRentaFija: { min: number; max: number };
    rangoRentaVariable: { min: number; max: number };
    rangoLiquidez: { min: number; max: number };
    durationMaxRF: number;
    maxActivosPorSleeve: number;
    toleranciaContexto: number;
  };
  pesosMacro: { rentaFija: number; rentaVariable: number; liquidez: number };
  activos: ActivoOptimizado[];
  metricas: {
    retornoEsperadoAnualPct: number;
    volatilidadAnualPct: number;
    sharpe: number;
  };
  observaciones: string[];
}

export const optimizarCarteraPerfil = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<OptimizacionCarteraResult> => {
    const humor = data.humorMercado === "none" ? "mixto" : data.humorMercado;
    const POLITICA = getPolitica(data.perfil);
    const pesosMacro = calcularPesosObjetivo(data.perfil, humor);
    const observaciones: string[] = [];

    //  Historial 2A por ticker (Yahoo, cierres diarios) 
    const { getYahooHistoricalServer } = await import("./market-data.functions");
    const hist = await Promise.all(
      data.tickers.map(async (t) => {
        try {
          const bars = (await getYahooHistoricalServer({
            data: { symbol: t, rango: "2A" },
          })) as { cierre: number }[];
          const closes = bars.map((b) => b.cierre).filter((c) => c > 0);
          return closes.length >= 30 ? { ticker: t, closes } : null;
        } catch {
          return null;
        }
      }),
    );

    const valid = hist.filter((h): h is { ticker: string; closes: number[] } => h != null);
    for (const t of data.tickers) {
      if (!valid.some((v) => v.ticker === t)) {
        observaciones.push(`${t}: sin historial suficiente (se excluye del optimizador).`);
      }
    }
    if (valid.length < 2) {
      throw new Error("Se necesitan al menos 2 tickers con historial de 2 años para optimizar.");
    }

    //  Retornos alineados 
    const returnsMat = valid.map((v) => logReturns(v.closes));
    const minLen = Math.min(...returnsMat.map((r) => r.length));
    const aligned = returnsMat.map((r) => r.slice(r.length - minLen));

    //  Optimización con la estrategia de la política del perfil 
    const result = optimize(POLITICA.estrategiaOptimizador as Strategy, {
      meanDaily: aligned.map((r) => mean(r)),
      volDaily: aligned.map((r) => std(r)),
      cov: covMatrix(aligned),
    });

    //  Métricas por activo 
    const FACTOR = 252;
    const activos: ActivoOptimizado[] = valid.map((v, i) => {
      const rets = aligned[i]!;
      const mu = mean(rets) * FACTOR * 100;
      const vol = std(rets) * Math.sqrt(FACTOR) * 100;
      return {
        ticker: v.ticker,
        peso: result.weights[i] ?? 0,
        pesoAjustado: (result.weights[i] ?? 0) * (pesosMacro.rentaVariable / 100),
        retornoAnualPct: Number.isFinite(mu) ? Math.round(mu * 100) / 100 : null,
        volatilidadAnualPct: Number.isFinite(vol) ? Math.round(vol * 100) / 100 : null,
      };
    });
    activos.sort((a, b) => b.peso - a.peso);

    if (pesosMacro.liquidez > 0) {
      observaciones.push(
        `La política asigna ${pesosMacro.liquidez.toFixed(1)}% a liquidez y ${
          100 - pesosMacro.rentaVariable - pesosMacro.liquidez < 0
            ? 0
            : (100 - pesosMacro.rentaVariable - pesosMacro.liquidez).toFixed(1)
        }% a renta fija: el optimizador distribuye solo la sleeve de renta variable (${pesosMacro.rentaVariable.toFixed(1)}%) sobre los tickers dados.`,
      );
    }

    return {
      perfil: data.perfil,
      estrategia: POLITICA.estrategiaOptimizador,
      humorMercado: humor as "risk-on" | "risk-off" | "mixto",
      politica: {
        rangoRentaFija: POLITICA.rangoRentaFija,
        rangoRentaVariable: POLITICA.rangoRentaVariable,
        rangoLiquidez: POLITICA.rangoLiquidez,
        durationMaxRF: POLITICA.durationMaxRF,
        maxActivosPorSleeve: POLITICA.maxActivosPorSleeve,
        toleranciaContexto: POLITICA.toleranciaContexto,
      },
      pesosMacro,
      activos,
      metricas: {
        retornoEsperadoAnualPct: Math.round(result.expectedReturn * 10000) / 100,
        volatilidadAnualPct: Math.round(result.volatility * 10000) / 100,
        sharpe: Math.round(result.sharpe * 1000) / 1000,
      },
      observaciones,
    };
  });

/** Lista de perfiles disponibles (para selectores de UI). */
export const PERFILES_DISPONIBLES = POLITICA_ASIGNACION.map((p) => p.perfil);
