/**
 * Análisis de portafolio — portado de clarity-dashboard analisis-portafolio.functions.ts
 * Adaptado a los módulos locales (history-cache, ticker-resolver, cedears-universe).
 *
 * Por activo: precio real, variación, clasificación por categoría macro,
 * retorno y volatilidad anualizados. Agregado: total valorizado,
 * capital ARS/USD y distribución por categoría.
 */

import { z } from "zod";
import { getQuotes, getHistories } from "@/lib/herramientas/history-cache.server";
import { resolveDraftTicker } from "@/lib/herramientas/ticker-resolver";
import { mean, std } from "@/lib/herramientas/math/stats";
import cedearsUniverse from "@/lib/herramientas/data/cedears-universe.json";

const CEDEARS = cedearsUniverse as { ARS: string[]; USD: string[] };

function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1]! > 0) out.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
  }
  return out;
}

/** CEDEAR USD (especie D) vs instrumento ARS. */
function monedaFor(ticker: string): "ARS" | "USD" {
  const t = ticker.toUpperCase().trim();
  if (t.endsWith(".BA")) return "ARS";
  if (
    CEDEARS.USD.map((x) => x.toUpperCase()).includes(t) ||
    /^[A-Z0-9]{1,5}D$/.test(t.replace(/\.BA$/, ""))
  )
    return "USD";
  return "ARS";
}

const LETRA_PATTERN = /^[ST]\d{2}[A-Z][A-Z0-9]?$/i;
const BONO_PATTERN = /^(AL|GD|AE)\d{2}[A-Z]?$/; // AL30, GD30, AE38...

export interface AnalisisActivoClarity {
  ticker: string;
  priceSymbol: string;
  nombre: string;
  cantidad: number;
  moneda: "ARS" | "USD";
  precio: number | null;
  variacionPorcentual: number | null;
  valorizado: number;
  pesoPct: number;
  subtipo: string;
  categoriaMacro: string;
  retornoAnual: number | null;
  volatilidadAnual: number | null;
  error?: string;
}

export interface AnalisisPortafolioClarityResult {
  activos: AnalisisActivoClarity[];
  totalValorizado: number;
  capitalARS: number;
  capitalUSD: number;
  porCategoria: { nombre: string; pesoPct: number; monto: number }[];
}

/** Clasificador fiel al diagnostico/clasificador de clarity (sin BONOS_DB). */
export function clasificarTicker(ticker: string): { subtipo: string; categoriaMacro: string } {
  const t = ticker.toUpperCase().trim();
  if (LETRA_PATTERN.test(t)) return { subtipo: "Letra", categoriaMacro: "RentaFija" };
  if (BONO_PATTERN.test(t.replace(/\.BA$/, "")))
    return { subtipo: "Bono", categoriaMacro: "RentaFija" };
  const usdCedear = CEDEARS.USD.map((x) => x.toUpperCase()).includes(t);
  if (usdCedear || t.endsWith("D")) return { subtipo: "CEDEAR", categoriaMacro: "RentaVariable" };
  if (t.endsWith(".BA")) {
    const arsCedear = CEDEARS.ARS.map((x) => x.toUpperCase() + ".BA").includes(t);
    return arsCedear
      ? { subtipo: "CEDEAR", categoriaMacro: "RentaVariable" }
      : { subtipo: "Accion", categoriaMacro: "RentaVariable" };
  }
  return { subtipo: "Accion", categoriaMacro: "RentaVariable" };
}

export async function analizarPortafolioClarity(
  items: Array<{ ticker: string; cantidad: number }>,
  period = 365,
): Promise<AnalisisPortafolioClarityResult> {
  const limpios = items
    .filter((it) => it.ticker.trim() && it.cantidad > 0)
    .map((it) => ({ ...it, ticker: it.ticker.trim().toUpperCase() }));
  if (!limpios.length) throw new Error("Sin posiciones válidas para analizar.");

  const resolved = limpios.map((it) => {
    const moneda = monedaFor(it.ticker);
    const res = resolveDraftTicker(it.ticker, moneda);
    return { ...it, moneda, priceSymbol: res.priceSymbol };
  });
  const uniqueSymbols = [...new Set(resolved.map((r) => r.priceSymbol))];

  const [quotes, histories] = await Promise.all([
    getQuotes(uniqueSymbols),
    getHistories(uniqueSymbols, period + 60),
  ]);

  const activos: AnalisisActivoClarity[] = resolved.map((r) => {
    const q = quotes[r.priceSymbol];
    const precio =
      q?.regularMarketPrice && Number(q.regularMarketPrice) > 0
        ? Number(q.regularMarketPrice)
        : null;
    const variacion =
      q?.regularMarketChangePercent != null ? Number(q.regularMarketChangePercent) : null;
    const nombre = (q?.longName ?? q?.shortName ?? r.ticker) as string;

    const cls = clasificarTicker(r.ticker);

    let retornoAnual: number | null = null;
    let volatilidadAnual: number | null = null;
    const hist = histories[r.priceSymbol];
    if (hist && hist.length >= 20) {
      const closes = hist.map((h: { close: number }) => h.close).filter((p: number) => p > 0);
      const rets = dailyReturns(closes);
      if (rets.length > 0) {
        const m = mean(rets);
        const s = std(rets);
        retornoAnual = (Math.pow(1 + m, 252) - 1) * 100;
        volatilidadAnual = s * Math.sqrt(252) * 100;
      }
    }

    return {
      ticker: r.ticker,
      priceSymbol: r.priceSymbol,
      nombre,
      cantidad: r.cantidad,
      moneda: r.moneda,
      precio,
      variacionPorcentual: variacion,
      valorizado: (precio ?? 0) * r.cantidad,
      pesoPct: 0,
      subtipo: cls.subtipo,
      categoriaMacro: cls.categoriaMacro,
      retornoAnual: retornoAnual != null ? +retornoAnual.toFixed(2) : null,
      volatilidadAnual: volatilidadAnual != null ? +volatilidadAnual.toFixed(2) : null,
      ...(precio == null ? { error: "Sin precio (revisá el ticker)" } : {}),
    };
  });

  const totalValorizado = activos.reduce((s, a) => s + a.valorizado, 0);
  for (const a of activos) {
    a.pesoPct = totalValorizado > 0 ? (a.valorizado / totalValorizado) * 100 : 0;
  }
  const capitalARS = activos
    .filter((a) => a.moneda === "ARS")
    .reduce((s, a) => s + a.valorizado, 0);
  const capitalUSD = activos
    .filter((a) => a.moneda === "USD")
    .reduce((s, a) => s + a.valorizado, 0);

  const catMap = new Map<string, number>();
  for (const a of activos)
    catMap.set(a.categoriaMacro, (catMap.get(a.categoriaMacro) ?? 0) + a.valorizado);
  const porCategoria = [...catMap.entries()]
    .map(([nombre, monto]) => ({
      nombre,
      monto,
      pesoPct: totalValorizado > 0 ? (monto / totalValorizado) * 100 : 0,
    }))
    .sort((a, b) => b.pesoPct - a.pesoPct);

  activos.sort((a, b) => b.pesoPct - a.pesoPct);
  return { activos, totalValorizado, capitalARS, capitalUSD, porCategoria };
}

export const analizarPortafolioClarityInput = z.object({
  items: z
    .array(z.object({ ticker: z.string().min(1).max(50), cantidad: z.number().min(0) }))
    .min(1)
    .max(60),
  period: z.number().min(30).max(1825).optional().default(365),
});
