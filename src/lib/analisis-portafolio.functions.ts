// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getQuotes, getHistories } from "./history-cache.server";
import { resolveDraftTicker } from "./ticker-resolver";
import { clasificar } from "./diagnostico/clasificador";
import { mean, std } from "./optimizer";
import cedearsUniverse from "@/data/cedears-universe.json";

const CEDEARS = cedearsUniverse as { ARS: string[]; USD: string[] };

function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return out;
}

// Determine if a ticker is a USD CEDEAR (D-specie) vs ARS instrument
function monedaFor(ticker: string): "ARS" | "USD" {
  const t = ticker.toUpperCase().trim();
  if (t.endsWith(".BA")) return "ARS";
  if (CEDEARS.USD.includes(t) || /^[A-Z0-9]{1,5}D$/.test(t.replace(/\.BA$/, ""))) return "USD";
  return "ARS";
}

export interface AnalisisActivo {
  ticker: string; // as entered by the user
  priceSymbol: string; // Yahoo symbol used for the real price
  nombre: string;
  cantidad: number;
  moneda: "ARS" | "USD";
  precio: number | null;
  variacionPorcentual: number | null;
  valorizado: number;
  pesoPct: number; // auto-normalized using real quote prices
  subtipo: string;
  categoriaMacro: string;
  retornoAnual: number | null;
  volatilidadAnual: number | null;
  error?: string;
}

export interface AnalisisPortafolioResult {
  activos: AnalisisActivo[];
  totalValorizado: number;
  capitalARS: number;
  capitalUSD: number;
  porCategoria: { nombre: string; pesoPct: number; monto: number }[];
}

export const analizarPortafolio = createServerFn({ method: "POST" })
  .validator(
    z.object({
      items: z
        .array(
          z.object({
            ticker: z.string().min(1).max(50),
            cantidad: z.number().min(0),
          }),
        )
        .min(1)
        .max(60),
      period: z.number().default(365),
    }),
  )
  .handler(async ({ data }): Promise<AnalisisPortafolioResult> => {
    const items = data.items
      .filter((it) => it.ticker.trim() && it.cantidad > 0)
      .map((it) => ({
        ...it,
        ticker: it.ticker.trim().toUpperCase(),
      }));

    // Resolve and batch by price symbol
    const resolved = items.map((it) => {
      const moneda = monedaFor(it.ticker);
      const res = resolveDraftTicker(it.ticker, moneda);
      return {
        ...it,
        moneda,
        priceSymbol: res.priceSymbol,
        analysisSymbol: res.analysisSymbol,
        tipo: res.tipo,
      };
    });
    const uniqueSymbols = [...new Set(resolved.map((r) => r.priceSymbol))];

    const [quotes, histories] = await Promise.all([
      getQuotes(uniqueSymbols),
      getHistories(uniqueSymbols, data.period + 60),
    ]);

    const activos: AnalisisActivo[] = resolved.map((r) => {
      const q = quotes[r.priceSymbol];
      const precio =
        q?.regularMarketPrice && Number(q.regularMarketPrice) > 0
          ? Number(q.regularMarketPrice)
          : null;
      const variacion =
        q?.regularMarketChangePercent != null ? Number(q.regularMarketChangePercent) : null;
      const nombre = (q?.longName ?? q?.shortName ?? r.ticker) as string;

      // Classification: ARS instruments need .BA suffix for the classifier
      const clsTicker = r.ticker.endsWith(".BA")
        ? r.ticker
        : r.moneda === "ARS"
          ? r.ticker + ".BA"
          : r.ticker;
      const cls = clasificar({
        id: r.ticker,
        ticker: clsTicker,
        cantidad: r.cantidad,
        fuente: "Yahoo",
      });

      // Historical returns / volatility
      let retornoAnual: number | null = null;
      let volatilidadAnual: number | null = null;
      const hist = histories[r.priceSymbol];
      if (hist && hist.length >= 20) {
        const closes = hist.map((h) => h.close).filter((p) => p > 0);
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
        error: precio == null ? "Sin precio (revisá el ticker)" : undefined,
      };
    });

    // Auto-normalize weights using real quote prices
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
  });
