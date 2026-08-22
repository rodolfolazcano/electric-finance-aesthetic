/**
 * Capa de datos del bot: precios y series vía Yahoo Finance usando el cliente
 * HTTP del proyecto (cookie+crumb, caché y límite de concurrencia ya integrados).
 * Regla anti-alucinación: si no hay dato real, se devuelve null — nunca se inventa.
 */

import { fetchYahooChart, fetchYahooQuoteSummaryJson } from "@/lib/yahoo-http";

export type SeriePrecios = {
  closes: number[];
  highs: number[];
  lows: number[];
  /** variación % de la última sesión vs la anterior */
  variacionPct: number | null;
  ultimoPrecio: number | null;
  ok: boolean;
};

export async function serieDe(symbol: string, range = "6mo", interval = "1d"): Promise<SeriePrecios> {
  const vacia: SeriePrecios = { closes: [], highs: [], lows: [], variacionPct: null, ultimoPrecio: null, ok: false };
  try {
    const json = (await fetchYahooChart(symbol, range, interval)) as {
      chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[] }> } }> };
    };
    const q = json.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!q) return vacia;
    const cierra = (arr?: (number | null)[]) => (arr ?? []).filter((v): v is number => typeof v === "number" && v > 0);
    const closes = cierra(q.close);
    const highs = cierra(q.high);
    const lows = cierra(q.low);
    if (closes.length < 5) return vacia;
    const n = closes.length;
    const ultimo = closes[n - 1]!;
    const previo = closes[n - 2]!;
    return {
      closes,
      highs,
      lows,
      ultimoPrecio: ultimo,
      variacionPct: previo > 0 ? ((ultimo - previo) / previo) * 100 : null,
      ok: true,
    };
  } catch {
    return vacia;
  }
}

/** Fundamentales mínimos para el scoring value (mismos módulos que yahoo-coronar). */
export type FundamentalesBot = {
  forwardPE: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  freeCashflow: number | null;
  marketCap: number | null;
  fcfYield: number | null;
  targetMeanPrice: number | null;
  currentPrice: number | null;
  upsideAnalistasPct: number | null;
};

export async function fundamentalesDe(yfSymbol: string): Promise<FundamentalesBot | null> {
  try {
    const res = await fetchYahooQuoteSummaryJson<Record<string, any>>(yfSymbol, [
      "summaryDetail",
      "financialData",
      "defaultKeyStatistics",
      "price",
    ]);
    const r = res.json?.quoteSummary?.result?.[0];
    if (!r) return null;
    const sd = r.summaryDetail ?? {};
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const price = r.price ?? {};
    const marketCap = price.marketCap ?? null;
    const freeCashflow = fd.freeCashflow ?? null;
    const currentPrice = fd.currentPrice ?? null;
    const targetMeanPrice = fd.targetMeanPrice ?? null;
    return {
      forwardPE: sd.forwardPE ?? ks.forwardPE ?? null,
      trailingPE: sd.trailingPE ?? ks.trailingPE ?? null,
      priceToBook: sd.priceToBook ?? ks.priceToBook ?? null,
      debtToEquity: fd.debtToEquity ?? null,
      returnOnEquity: fd.returnOnEquity ?? null,
      freeCashflow,
      marketCap,
      fcfYield: freeCashflow != null && marketCap ? freeCashflow / marketCap : null,
      targetMeanPrice,
      currentPrice,
      upsideAnalistasPct:
        targetMeanPrice != null && currentPrice != null && currentPrice > 0
          ? ((targetMeanPrice - currentPrice) / currentPrice) * 100
          : null,
    };
  } catch {
    return null;
  }
}

/** Ejecuta promesas con concurrencia limitada para no golpear la API. */
export async function enLotes<T, R>(items: T[], tamaño: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += tamaño) {
    const lote = items.slice(i, i + tamaño);
    out.push(...(await Promise.all(lote.map(fn))));
  }
  return out;
}
