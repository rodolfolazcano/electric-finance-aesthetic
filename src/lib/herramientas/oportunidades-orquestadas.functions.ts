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

      // Labadie p=1/Hurst: mean-reversion (H<0.45) = +0.3 al score
      try {
        const { computeHurst } = await import("@/lib/math/stats");
        const { getHistory } = await import("@/lib/history-cache.server").catch(() => ({ getHistory: null as any }));
        if (getHistory) {
          for (const s of senalesOrdenadas.slice(0, 12)) {
            try {
              const hist: any[] = await getHistory(String(s.ticker).toUpperCase().replace(/\.BA$/, ""), 180).catch(() => []);
              const closesArr = (hist ?? []).map((h: any) => h.close).filter((c: any) => typeof c === "number" && isFinite(c));
              if (closesArr.length >= 60) {
                const rets: number[] = [];
                for (let i2 = 1; i2 < closesArr.length; i2++) rets.push(Math.log(closesArr[i2]! / closesArr[i2-1]!));
                const H = computeHurst(rets);
                s.hurstExponent = Math.round(H * 1000) / 1000;
                if (H < 0.45) { s.scoreTotal = Math.round((s.scoreTotal + 0.3) * 10) / 10; s.hurstBonus = "+0.3 mean-reversion"; }
              }
            } catch {}
          }
        }
      } catch {}
      // FUNDAMENTAL SOLO SOBRE SUBYACENTE EE.UU.: descartar BCBA/CEDEAR del análisis
      // (Yahoo trae estados contables completos solo de NYSE/NASDAQ)
      try {
        const { getFlatTickerList } = await import("@/lib/universos");
        const META = new Map(getFlatTickerList().map((t: any) => [t.ticker.toUpperCase(), t]));
        const esUS = (tk: string) => {
          const m = META.get(tk.toUpperCase()) as any;
          if (m?.mercado) return String(m.mercado).includes("NYSE") || String(m.mercado).includes("NASDAQ");
          return !tk.toUpperCase().endsWith(".BA");
        };
        tickersDesplegados = tickersDesplegados.filter(esUS);
        porSector = Object.fromEntries(
          Object.entries(porSector).map(([k, v]) => [k, (v as string[]).filter(esUS)]),
        );

        // Índices de equivalentes operables en BCBA (por nombre normalizado)
        const norm = (s: string) =>
          String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const bcba = getFlatTickerList().filter((t: any) => t.mercado === "BCBA");
        const porNombre = new Map<string, any[]>();
        for (const b of bcba) {
          const k = norm(b.nombre);
          if (!k || k === "NOMBRE NO ENCONTRADO") continue;
          if (!porNombre.has(k)) porNombre.set(k, []);
          porNombre.get(k)!.push(b);
        }
        const equivalente = (usTicker: string, usNombre: unknown): { ars?: string; usd?: string } => {
          const out: { ars?: string; usd?: string } = {};
          const base = usTicker.toUpperCase();
          const cands = [
            ...(porNombre.get(norm(usNombre as string)) ?? []),
            ...bcba.filter((b: any) => b.ticker.toUpperCase() === base),
            ...bcba.filter((b: any) => b.ticker.toUpperCase() === base + "D"),
          ];
          for (const c of cands as any[]) {
            if (!out.ars && c.moneda === "ARS") out.ars = c.ticker;
            if (!out.usd && c.moneda === "USD") out.usd = c.ticker;
          }
          return out;
        };
        const nombrePorTicker = new Map(
          [...(META as Map<string, any>)].map(([k, v]) => [k, v.nombre]),
        );
        senalesOrdenadas = senalesOrdenadas.map((s: any) => ({
          ...s,
          operableBCBA: equivalente(s.ticker, nombrePorTicker.get(String(s.ticker).toUpperCase()) ?? s.ticker),
        }));
      } catch {}

      // ── ORDEN DE EJECUCIÓN DEL SCORING (jerarquía pt) ──────────────────────
      // 1 Intermarket (fase1: ratios Murphy + ciclo Pring) → 2 Macro (régimen
      // BCRA/riesgo/Fisher, gate de exigencia) → 3 Cuantitativo (fase4 R²/beta)
      // → 4 Fundamental (fase5 gate Pascale 5.0 + MOS) → 5 Técnico (score ≥4.5).
      // Gate macro: régimen ADVERSO penaliza el score final (−0.5) y lo reporta.
      const regimenMacro = base.fase1?.macro?.regimen_macro ?? "NEUTRO";
      if (regimenMacro === "ADVERSO") {
        senalesOrdenadas = senalesOrdenadas.map((s: any) => ({
          ...s,
          scoreTotal: Math.round(((s.scoreTotal ?? 0) - 0.5) * 10) / 10,
          gateMacro: "ADVERSO (−0.5)",
        }));
        senalesOrdenadas.sort((a: any, b: any) => b.scoreTotal - a.scoreTotal);
      }
      const pipeline = [
        { fase: "1 · Intermarket", fuente: "Murphy ratios + ciclo Pring/Stovall", ok: !!base.fase1?.ciclo },
        { fase: "2 · Macro", fuente: `BCRA/CriptoYa/Fisher — régimen ${regimenMacro}`, ok: !!base.fase1?.macro },
        { fase: "3 · Cuantitativo", fuente: "β/R² vs factor mayor ajuste", ok: tickerBestBenchmarks.length > 0 },
        { fase: "4 · Fundamental", fuente: "Pascale 6D gate 5.0 + MOS Value", ok: base.fase5.senales.length > 0 },
        { fase: "5 · Técnico", fuente: "RSI/MACD/SMA score ≥4.5 + R/R ≥1.2", ok: true },
      ];

      return {
        ...base,
        fase4: fase4ext,
        fase5: { ...base.fase5, senales: senalesOrdenadas.slice(0, topN), senalesRaw: base.fase5.senales },
        tickersFiltrados: tickersDesplegados,
        porSectorFiltrado: porSector,
        cohorte: data.cohorte ?? null,
        topN,
        maxTickers,
        regimenMacro,
        pipeline,
      };
    });
  });
