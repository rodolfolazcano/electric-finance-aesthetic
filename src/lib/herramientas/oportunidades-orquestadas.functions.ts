// @ts-nocheck
/**
 * Oportunidades Orquestadas — 5 fases + cuantitativo R2 (reutiliza TODO el motor)
 * 1) Intermarket (Murphy) → 2) Sectores favorecidos (Pring/Schvarz) → 3) Despliegue activos (unificado_completo + cohortes) → 4) Cuantitativo vs factor mayor R2 (sector-analysis) → 5) Fundamental (Pascale 6D) + Técnico → Oportunidades
 * Datos vivos: Yahoo Finance, IOL, BCRA, ArgentinaDatos, CriptoYa. Máx 50 tickers por corrida.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOrFetch } from "@/lib/cache/api-cache.server";
import { claCiclo, claContextoMacro, claPerformanceSectorial, claFicha } from "@/lib/clarity-analysis";
import { generarSenalUnificada } from "@/lib/senales/motor-unificado";

const OPORT_TTL = 15 * 60; // 15 min

export const getOportunidadesOrquestadas = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        sector: z.string().optional().nullable(),
        cohorte: z.enum(["BCBA_ARS", "CEDear_ARS", "CEDear_USD", "US_USD"]).optional().nullable(),
        topN: z.number().int().min(1).max(12).optional(),
        maxTickers: z.number().int().min(5).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<any> => {
    const topN = data.topN ?? 6;
    const maxTickers = data.maxTickers ?? 30;
    const cacheKey = `oportunidades:${data.sector ?? "auto"}:${data.cohorte ?? "auto"}:${topN}:${maxTickers}`;
    return getOrFetch(cacheKey, "yahoo", OPORT_TTL, async () => {
      // Import dinámico para evitar ciclo
      const { orquestarSectorial } = await import("@/lib/senales/orquestador-sectorial.server");
      // Reusar orquestador existente para fases 1-3 y 5 base
      const base = await orquestarSectorial({ topN, maxTickersFund: maxTickers });
      // Si sector forzado por UI, filtrar tickers desplegados a ese sector
      let tickersDesplegados: string[] = base.fase3.tickersDesplegados;
      let porSector: Record<string, string[]> = base.fase3.porSector;
      if (data.sector) {
        const key = Object.keys(porSector).find((k) => k.toLowerCase() === data.sector!.toLowerCase());
        if (key) {
          tickersDesplegados = porSector[key]!.slice(0, maxTickers);
          porSector = { [key]: tickersDesplegados };
        }
      }
      // Cohorte homogénea si viene del panel (filtrar por tipo/moneda)
      if (data.cohorte) {
        try {
          const { getFlatTickerList } = await import("@/lib/universos");
          const META = new Map(getFlatTickerList().map((t: any) => [t.ticker.toUpperCase(), t]));
          const clasifica = (tk: string) => {
            const m = META.get(tk.toUpperCase()) as any;
            if (!m) return "BCBA_ARS";
            if (m.mercado === "BCBA" && m.tipo === "cedear") return m.moneda === "USD" ? "CEDear_USD" : "CEDear_ARS";
            if (m.mercado === "BCBA") return "BCBA_ARS";
            return "US_USD";
          };
          tickersDesplegados = tickersDesplegados.filter((tk) => clasifica(tk) === data.cohorte);
        } catch {}
      }

      // FASE 4 — Cuantitativo vs factor mayor R2 (sector-analysis)
      let cuantitativo: any = null;
      let tickerBestBenchmarks: any[] = [];
      let industryBest: any = null;
      try {
        const { getSectorAnalysis } = await import("@/lib/herramientas/sector-analysis.functions");
        // Usar primer sector favorecido o sector forzado
        const sectorCuanti = data.sector ?? base.fase2.sectoresFavorecidos[0] ?? "Technology";
        // Construir tickers objetos para sector-analysis (requiere {ticker,nombre})
        const tickersObjs = tickersDesplegados.slice(0, Math.min(30, maxTickers)).map((tk) => ({ ticker: tk, nombre: tk }));
        if (tickersObjs.length >= 2) {
          const secRes: any = await (getSectorAnalysis as any)({ data: { sector: sectorCuanti, industry: "Todas las industrias", tickers: tickersObjs, mode: "tickers" } });
          // getSectorAnalysis retorna { tickerBestBenchmarks, industryBestBenchmarks, matrix, ... }
          // Pero la firma real es via createServerFn, llamamos handler directo si es posible — fallback a vacio
          if (secRes?.tickerBestBenchmarks) {
            tickerBestBenchmarks = secRes.tickerBestBenchmarks;
            industryBest = secRes.industryBestBenchmarks?.[0] ?? null;
          }
        }
      } catch (e: any) {
        cuantitativo = { error: e.message?.slice(0, 200) ?? String(e) };
      }
      // Si no se pudo obtener via sector-analysis, intentar via capm fallback
      if (!tickerBestBenchmarks.length) {
        try {
          const { getMatrizCAPM } = await import("@/lib/herramientas/capm.functions");
          const capmRes: any = await (getMatrizCAPM as any)({ data: { tickers: tickersDesplegados.slice(0, 12) } });
          if (capmRes?.rows) {
            // capm no da bestBenchmark, pero dejamos placeholder
            cuantitativo = { fallback: "capm", rows: capmRes.rows.slice(0, 5) };
          }
        } catch {}
      }

      // Enriquecer fase4 con tickerBestBenchmarks para la UI
      const fase4ext = {
        ...base.fase4,
        tickerBestBenchmarks,
        industryBestBenchmark: industryBest,
        cuantitativoRaw: cuantitativo,
      };

      // Re-ordenar oportunidades finales por R2 (si hay) y score técnico
      let senalesOrdenadas = [...base.fase5.senales];
      if (tickerBestBenchmarks.length) {
        const r2Map = new Map(tickerBestBenchmarks.map((t: any) => [t.ticker?.toUpperCase(), t.rSquared ?? t.r2 ?? 0]));
        senalesOrdenadas.sort((a: any, b: any) => {
          const ra = r2Map.get(a.ticker?.toUpperCase()) ?? 0;
          const rb = r2Map.get(b.ticker?.toUpperCase()) ?? 0;
          // ponderar 60% scoreTotal + 40% R2
          return b.scoreTotal + rb * 2 - (a.scoreTotal + ra * 2);
        });
      }

      return {
        ...base,
        fase4: fase4ext,
        fase5: { ...base.fase5, senales: senalesOrdenadas.slice(0, topN), senalesRaw: base.fase5.senales },
        tickersFiltrados: tickersDesplegados,
        porSectorFiltrado: porSector,
        cohorte: data.cohorte ?? null,
        topN,
        maxTickers,
      };
    });
  });
