// src/lib/comparador-usuario.ts
// Comparación on-demand entre el portafolio del usuario y el recomendado.
// Todo lo pesado ya está cacheado (recommended portfolio, backtest).
// Solo se calcula en vivo el backtest del usuario (composición fija, liviano).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "./supabase";
import { calcularYTMPonderada, proyectarFlujoDeFondos, type RiesgoRVResult } from "./diagnostico-portafolio.functions";
import { logReturns, mean, std } from "./optimizer";
import { getYahooHistoricalServer } from "./market-data.functions";
import { getRiskFreeRateSync } from "./risk-free-rate";
import type { PositionEnriquecida } from "./diagnostico/types";
import type { PerfilInversor } from "./politica-asignacion";

export interface ComparacionEntry {
  metrica: string;
  usuario: number | null | string;
  recomendado: number | null | string;
  benchmark: number | null | string;
  unidad: string;
  mejor: "usuario" | "recomendado" | "benchmark" | "empate" | null;
}

export interface ComparacionResult {
  perfil: PerfilInversor;
  fecha: string;
  tabla: ComparacionEntry[];
  metricsRecomendado: any;
  metricsBacktestRecomendado: any;
  error?: string;
}

export const compararPortafolio = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      posiciones: z.array(z.any()),
      perfil: z.enum([
        "Conservador", "Moderado-Conservador", "Moderado",
        "Moderado-Agresivo", "Agresivo", "Muy Agresivo", "Especulativo",
      ]),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<ComparacionResult> => {
    const posiciones = data.posiciones as PositionEnriquecida[];
    const perfil = data.perfil as PerfilInversor;
    const fecha = new Date().toISOString().slice(0, 10);

    // 1. Traer portafolio recomendado del día
    const { data: recoData } = await supabase
      .from("portafolio_recomendado_diario")
      .select("*")
      .eq("perfil", perfil)
      .eq("fecha", fecha)
      .limit(1)
      .single()
      .catch(() => ({ data: null }));

    const recomendado = recoData ? {
      pesosMacro: typeof recoData.pesos_macro === "string" ? JSON.parse(recoData.pesos_macro) : recoData.pesos_macro,
      metricas: typeof recoData.metricas === "string" ? JSON.parse(recoData.metricas) : recoData.metricas,
    } : null;

    // 2. Traer backtest más reciente del perfil
    const { data: btData } = await supabase
      .from("backtest_resultados")
      .select("*")
      .eq("perfil", perfil)
      .order("fecha_corrida", { ascending: false } as any)
      .limit(1)
      .single()
      .catch(() => ({ data: null }));

    const backtestRecomendado = btData ? {
      metricas: typeof btData.metricas === "string" ? JSON.parse(btData.metricas) : btData.metricas,
    } : null;

    // 3. Calcular métricas del usuario en vivo
    const metricasUsuario = await calcularMetricasUsuario(posiciones);

    // 4. Backtest simplificado del usuario (composición fija, sin rebalanceo)
    const backtestUsuario = await backtestComposicionFija(posiciones);

    // 5. Benchmarks de referencia
    const benchmarkMetrics = await fetchBenchmarkMetrics();

    // 6. Armar tabla comparativa
    const tabla: ComparacionEntry[] = [
      {
        metrica: "CAGR",
        usuario: backtestUsuario?.cagr ?? null,
        recomendado: backtestRecomendado?.metricas?.cagr ?? null,
        benchmark: benchmarkMetrics?.spy?.cagr ?? null,
        unidad: "%",
        mejor: mejorValor(backtestUsuario?.cagr, backtestRecomendado?.metricas?.cagr, benchmarkMetrics?.spy?.cagr),
      },
      {
        metrica: "Volatilidad",
        usuario: backtestUsuario?.volatilidad ?? null,
        recomendado: backtestRecomendado?.metricas?.volatilidadAnualizada ?? null,
        benchmark: benchmarkMetrics?.spy?.volatilidad ?? null,
        unidad: "%",
        mejor: mejorValorInvertido(backtestUsuario?.volatilidad, backtestRecomendado?.metricas?.volatilidadAnualizada, benchmarkMetrics?.spy?.volatilidad),
      },
      {
        metrica: "Sharpe",
        usuario: backtestUsuario?.sharpe ?? null,
        recomendado: backtestRecomendado?.metricas?.sharpe ?? null,
        benchmark: benchmarkMetrics?.spy?.sharpe ?? null,
        unidad: "",
        mejor: mejorValor(backtestUsuario?.sharpe, backtestRecomendado?.metricas?.sharpe, benchmarkMetrics?.spy?.sharpe),
      },
      {
        metrica: "Máx. Drawdown",
        usuario: backtestUsuario?.maxDrawdown ?? null,
        recomendado: backtestRecomendado?.metricas?.maxDrawdown ?? null,
        benchmark: benchmarkMetrics?.spy?.maxDrawdown ?? null,
        unidad: "%",
        mejor: mejorValorInvertido(backtestUsuario?.maxDrawdown, backtestRecomendado?.metricas?.maxDrawdown, benchmarkMetrics?.spy?.maxDrawdown),
      },
      {
        metrica: "YTM ponderada",
        usuario: posiciones.length > 0 ? calcularYTMPonderada(posiciones).ytmPonderada * 100 : null,
        recomendado: recomendado?.metricas?.ytmPonderada != null ? recomendado.metricas.ytmPonderada * 100 : null,
        benchmark: null,
        unidad: "%",
        mejor: null,
      },
      {
        metrica: "Beta",
        usuario: null,
        recomendado: recomendado?.metricas?.beta ?? null,
        benchmark: null,
        unidad: "",
        mejor: null,
      },
      {
        metrica: "Hit Rate (rebalanceos)",
        usuario: backtestUsuario?.hitRate ?? null,
        recomendado: backtestRecomendado?.metricas?.hitRateRebalanceos ?? null,
        benchmark: null,
        unidad: "%",
        mejor: mejorValor(backtestUsuario?.hitRate, backtestRecomendado?.metricas?.hitRateRebalanceos, null),
      },
    ];

    return {
      perfil,
      fecha,
      tabla,
      metricsRecomendado: recomendado,
      metricsBacktestRecomendado: backtestRecomendado,
    };
  });

async function calcularMetricasUsuario(
  posiciones: PositionEnriquecida[],
): Promise<any> {
  const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");
  if (rv.length < 2) return null;

  const totalRV = rv.reduce((s, p) => s + p.valorizado, 0) || 1;
  const pesos = rv.map((p) => p.valorizado / totalRV);

  try {
    const tickers = rv.map((p) => p.ticker);
    const histData = await Promise.all(
      tickers.map((t) =>
        getYahooHistoricalServer({ data: { symbol: t, rango: "2A" } })
          .then((bars) => bars.map((b) => b.cierre))
          .catch(() => null as number[] | null),
      ),
    );

    const valid = histData
      .map((h, i) => (h && h.length >= 30 ? { closes: h, peso: pesos[i] } : null))
      .filter((x): x is { closes: number[]; peso: number } => x != null);

    if (valid.length < 2) return null;

    const returnsMat = valid.map((v) => logReturns(v.closes));
    const minLen = Math.min(...returnsMat.map((r) => r.length));
    const aligned = returnsMat.map((r) => r.slice(r.length - minLen));

    const portReturns: number[] = [];
    for (let t = 0; t < minLen; t++) {
      let r = 0;
      for (let i = 0; i < valid.length; i++) r += valid[i].peso * aligned[i][t];
      portReturns.push(r);
    }

    const meanR = mean(portReturns);
    const volD = std(portReturns);
    const sharpe = volD > 0 ? (meanR * 252 - getRiskFreeRateSync("USD")) / (volD * Math.sqrt(252)) : 0;
    const cagr = meanR * 252;

    const cum = portReturns.reduce((s, r) => s * (1 + r), 1);
    let maxDrawdown = 0;
    let peak = 1;
    let running = 1;
    for (const r of portReturns) {
      running *= (1 + r);
      if (running > peak) peak = running;
      const dd = (peak - running) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return { cagr, volatilidad: volD * Math.sqrt(252), sharpe, maxDrawdown, hitRate: null };
  } catch {
    return null;
  }
}

async function backtestComposicionFija(
  posiciones: PositionEnriquecida[],
): Promise<{ cagr: number; volatilidad: number; sharpe: number; maxDrawdown: number; hitRate: number } | null> {
  const rv = posiciones.filter((p) => p.categoriaMacro === "RentaVariable");
  if (rv.length < 2) return null;

  const totalRV = rv.reduce((s, p) => s + p.valorizado, 0) || 1;
  const pesos = rv.map((p) => p.valorizado / totalRV);
  const tickers = rv.map((p) => p.ticker);

  try {
    // 2 años de datos
    const histData = await Promise.all(
      tickers.map((t) =>
        getYahooHistoricalServer({ data: { symbol: t, rango: "2A" } })
          .then((bars) => bars.map((b) => ({ fecha: b.fecha, cierre: b.cierre })))
          .catch(() => null),
      ),
    );

    const valid = histData
      .map((h, i) => (h && h.length >= 250 ? { bars: h, peso: pesos[i] } : null))
      .filter((x): x is { bars: { fecha: string; cierre: number }[]; peso: number } => x != null);

    if (valid.length < 2) return null;

    // Alinear fechas
    const fechasSet = new Set<string>();
    for (const v of valid) for (const b of v.bars) fechasSet.add(b.fecha);
    for (const v of valid) {
      const set = new Set(v.bars.map((b) => b.fecha));
      for (const f of fechasSet) if (!set.has(f)) fechasSet.delete(f);
    }
    const fechas = [...fechasSet].sort();
    if (fechas.length < 250) return null;

    const maps = valid.map((v) => new Map(v.bars.map((b) => [b.fecha, b.cierre])));
    const portPrices: number[] = [];
    for (const f of fechas) {
      let p = 0;
      for (let i = 0; i < valid.length; i++) p += (maps[i].get(f) ?? 0) * valid[i].peso;
      portPrices.push(p);
    }

    const returns = logReturns(portPrices);
    if (returns.length < 30) return null;

    const meanR = mean(returns);
    const volD = std(returns);
    const sharpe = volD > 0 ? (meanR * 252 - getRiskFreeRateSync("USD")) / (volD * Math.sqrt(252)) : 0;
    const cagr = meanR * 252;
    let maxDrawdown = 0;
    let peak = 1;
    let running = 1;
    for (const r of returns) {
      running *= (1 + r);
      if (running > peak) peak = running;
      const dd = (peak - running) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Hit rate mensual simplificado
    const meses = 24;
    const step = Math.floor(returns.length / meses);
    let hits = 0;
    let totalMeses = 0;
    for (let i = 0; i + step < returns.length; i += step) {
      const ret = returns.slice(i, i + step).reduce((s, r) => s * (1 + r), 1) - 1;
      if (ret > 0) hits++;
      totalMeses++;
    }

    return {
      cagr: Math.round(cagr * 10000) / 10000,
      volatilidad: Math.round(volD * Math.sqrt(252) * 10000) / 10000,
      sharpe: Math.round(sharpe * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      hitRate: totalMeses > 0 ? Math.round((hits / totalMeses) * 10000) / 100 : 0,
    };
  } catch {
    return null;
  }
}

async function fetchBenchmarkMetrics(): Promise<{
  spy: { cagr: number; volatilidad: number; sharpe: number; maxDrawdown: number } | null;
} | null> {
  try {
    const bars = await getYahooHistoricalServer({ data: { symbol: "SPY", rango: "2A" } });
    const closes = bars.map((b) => b.cierre);
    const returns = logReturns(closes);
    if (returns.length < 30) return null;
    const meanR = mean(returns);
    const volD = std(returns);
    let maxDrawdown = 0;
    let peak = 1;
    let running = 1;
    for (const r of returns) {
      running *= (1 + r);
      if (running > peak) peak = running;
      const dd = (peak - running) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    return {
      spy: {
        cagr: meanR * 252,
        volatilidad: volD * Math.sqrt(252),
        sharpe: volD > 0 ? (meanR / volD) * Math.sqrt(252) : 0,
        maxDrawdown,
      },
    };
  } catch {
    return null;
  }
}

function mejorValor(a: number | null | undefined, b: number | null | undefined, c: number | null | undefined): "usuario" | "recomendado" | "benchmark" | "empate" | null {
  const vals = [
    { key: "usuario" as const, v: a },
    { key: "recomendado" as const, v: b },
    { key: "benchmark" as const, v: c },
  ].filter((x) => x.v != null);
  if (vals.length === 0) return null;
  const maxV = Math.max(...vals.map((x) => x.v!));
  const winners = vals.filter((x) => x.v === maxV);
  return winners.length === 1 ? winners[0].key : "empate";
}

function mejorValorInvertido(a: number | null | undefined, b: number | null | undefined, c: number | null | undefined): "usuario" | "recomendado" | "benchmark" | "empate" | null {
  const vals = [
    { key: "usuario" as const, v: a },
    { key: "recomendado" as const, v: b },
    { key: "benchmark" as const, v: c },
  ].filter((x) => x.v != null);
  if (vals.length === 0) return null;
  const minV = Math.min(...vals.map((x) => x.v!));
  const winners = vals.filter((x) => x.v === minV);
  return winners.length === 1 ? winners[0].key : "empate";
}
