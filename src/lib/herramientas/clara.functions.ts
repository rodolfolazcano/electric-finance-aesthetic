/**
 * Server functions que exponen los motores de análisis ya portados
 * (clarity-analysis.ts, semaforo.server.ts, noticias.server.ts) al
 * tab /herramientas y a las herramientas del agente IA.
 * Mismos métodos que el backend Flask original de clarity-dashboard.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  claContextoMacro,
  claCiclo,
  claPerformanceSectorial,
  claValuacionSectorial,
  claFicha,
  claCualitativo,
  claCuantitativo,
  claWacc,
  claDcf,
  claMultiples,
  claBookValue,
  claTriangulacion,
} from "@/lib/clarity-analysis";
import { analizarSemaforo } from "@/lib/semaforo.server";
import { consultarNoticias } from "@/lib/noticias.server";

const tickerInput = z.object({ ticker: z.string().min(1).max(20) });
const periodoInput = z.object({ periodo: z.string().max(10).optional().default("5d") });
const sectorInput = z.object({ sector: z.string().min(2).max(60) });

export const contextoMacroFn = createServerFn({ method: "POST" }).handler(async () => {
  return claContextoMacro();
});

export const cicloEconomicoFn = createServerFn({ method: "POST" }).handler(async () => {
  return claCiclo();
});

export const performanceSectorialFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => periodoInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    return claPerformanceSectorial(data.periodo);
  });

export const valuacionSectorialFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sectorInput.parse(input))
  .handler(async ({ data }) => {
    return claValuacionSectorial(data.sector);
  });

export const fichaDecisionFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claFicha(data.ticker.trim().toUpperCase());
  });

export const cualitativoFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claCualitativo(data.ticker.trim().toUpperCase());
  });

export const cuantitativoFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claCuantitativo(data.ticker.trim().toUpperCase());
  });

export const waccFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claWacc(data.ticker.trim().toUpperCase());
  });

export const dcfFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claDcf(data.ticker.trim().toUpperCase());
  });

export const multiplesFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claMultiples(data.ticker.trim().toUpperCase());
  });

export const valorLibroFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claBookValue(data.ticker.trim().toUpperCase());
  });

export const triangulacionFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    return claTriangulacion(data.ticker.trim().toUpperCase());
  });

/** Semáforo técnico+fundamental (mismo scoring que Flask /api/semaforo). */
export const semaforoTickerFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tickerInput.parse(input))
  .handler(async ({ data }) => {
    const r = await analizarSemaforo(data.ticker.trim());
    return {
      simbolo: r.simbolo,
      nombre: r.nombre,
      moneda: r.moneda,
      precio: r.precio,
      fechaDatos: r.fechaDatos,
      techScore: r.techScore,
      fundScore: r.fundScore,
      totalScore: r.totalScore,
      clasificacionJerarquica: r.clasificacionJerarquica,
      recommendation: r.recommendation,
      light: r.light,
      signals: r.signals,
      history: r.history,
      scoreTecnicoDetalle: r.scoreTecnicoDetalle,
      scoreFundamentalDetalle: {
        pe: r.scoreFundamentalDetalle.pe,
        revenueGrowth: r.scoreFundamentalDetalle.revenueGrowth,
        profitMargin: r.scoreFundamentalDetalle.profitMargin,
        roe: r.scoreFundamentalDetalle.roe,
        upside: r.scoreFundamentalDetalle.upside,
        deudaEquity: r.scoreFundamentalDetalle.deudaEquity,
        score: r.scoreFundamentalDetalle.score,
        detalle: r.scoreFundamentalDetalle.detalle,
      },
      soportes: r.soportes,
      resistencias: r.resistencias,
      error: r.error,
    };
  });

/** Noticias recientes de un tema/ticker (RSS multi-fuente). Devuelve título+enlace+medio por fuente. */
export const noticiasTickerFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ ticker: z.string().min(1).max(60), cantidad: z.number().int().min(1).max(20).optional().default(8) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const r = await consultarNoticias(data.ticker.trim(), "");
    return {
      etiqueta: r.etiqueta,
      noticias: r.fuentes.slice(0, data.cantidad).map((f) => ({
        titulo: f.title,
        medio: f.dominio,
        enlace: f.url,
      })),
      fuentes: r.fuentes,
    };
  });
